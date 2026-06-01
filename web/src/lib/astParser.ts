/**
 * AST-based code extraction using @babel/parser.
 * Replaces regex parsing with accurate syntax tree analysis.
 * Falls back gracefully (astParsed=false) on any parse error.
 */
import { parse } from '@babel/parser';
import type {
  ImportInfo, NavLink, FunctionDef,
  ComponentInfo, InterfaceDef, PropDef,
} from '@/types/graph';

export interface ASTResult {
  imports: ImportInfo[];
  exports: string[];
  components: string[];
  componentInfo: ComponentInfo[];
  hooks: string[];
  definedHooks: string[];
  routes: string[];
  navLinks: NavLink[];
  allFunctions: FunctionDef[];
  interfaceDefinitions: InterfaceDef[];
  astParsed: boolean;
}

// ─── Traversal ────────────────────────────────────────────────────────────────

type ASTNode = Record<string, unknown>;

const SKIP_KEYS = new Set([
  'type', 'start', 'end', 'loc', 'range', 'extra',
  'tokens', 'errors', 'comments',
  'leadingComments', 'trailingComments', 'innerComments',
]);

function walk(node: unknown, visit: (n: ASTNode) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return; }
  const n = node as ASTNode;
  if (typeof n.type === 'string') visit(n);
  for (const key of Object.keys(n)) {
    if (SKIP_KEYS.has(key)) continue;
    walk(n[key], visit);
  }
}

// Walk only direct children of program.body (top-level statements)
function walkTopLevel(body: unknown[], visit: (n: ASTNode) => void): void {
  for (const stmt of body) {
    if (stmt && typeof stmt === 'object') {
      const n = stmt as ASTNode;
      if (typeof n.type === 'string') visit(n);
    }
  }
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

function tsTypeName(typeNode: ASTNode | null | undefined): string {
  if (!typeNode) return 'unknown';
  switch (typeNode.type) {
    case 'TSStringKeyword':    return 'string';
    case 'TSNumberKeyword':    return 'number';
    case 'TSBooleanKeyword':   return 'boolean';
    case 'TSVoidKeyword':      return 'void';
    case 'TSNullKeyword':      return 'null';
    case 'TSUndefinedKeyword': return 'undefined';
    case 'TSAnyKeyword':       return 'any';
    case 'TSNeverKeyword':     return 'never';
    case 'TSUnknownKeyword':   return 'unknown';
    case 'TSObjectKeyword':    return 'object';
    case 'TSArrayType':        return `${tsTypeName(typeNode.elementType as ASTNode)}[]`;
    case 'TSFunctionType':     return 'function';
    case 'TSTypeLiteral':      return 'object';
    case 'TSParenthesizedType': return tsTypeName(typeNode.typeAnnotation as ASTNode);
    case 'TSTypeReference': {
      const id = typeNode.typeName as ASTNode | undefined;
      const name = (id?.name as string) ?? (id?.right as ASTNode)?.name as string ?? 'unknown';
      const params = (typeNode.typeParameters as ASTNode)?.params as ASTNode[] | undefined;
      if (params?.length) return `${name}<${params.map(p => tsTypeName(p)).join(', ')}>`;
      return name;
    }
    case 'TSUnionType': return (typeNode.types as ASTNode[]).map(tsTypeName).join(' | ');
    case 'TSIntersectionType': return (typeNode.types as ASTNode[]).map(tsTypeName).join(' & ');
    case 'TSLiteralType': {
      const lit = typeNode.literal as ASTNode | undefined;
      if (lit?.type === 'StringLiteral') return `"${lit.value}"`;
      if (lit?.type === 'NumericLiteral') return String(lit.value);
      if (lit?.type === 'BooleanLiteral') return String(lit.value);
      return 'literal';
    }
    default: return 'unknown';
  }
}

function extractPropsFromMembers(members: ASTNode[]): PropDef[] {
  return members
    .filter(m => m.type === 'TSPropertySignature')
    .map(m => {
      const key = m.key as ASTNode | undefined;
      const name = (key?.name as string) ?? (key?.value as string) ?? '';
      const ta = (m.typeAnnotation as ASTNode)?.typeAnnotation as ASTNode | undefined;
      return { name, type: tsTypeName(ta), required: !m.optional };
    })
    .filter(p => p.name);
}

function propsFromFirstParam(param: ASTNode | undefined): { typeName?: string; inlineProps?: PropDef[] } {
  if (!param) return {};
  // Unwrap assignment pattern: ({ x } = {})
  const actual = (param.type === 'AssignmentPattern' ? param.left : param) as ASTNode;
  const ta = (actual.typeAnnotation as ASTNode | undefined)?.typeAnnotation as ASTNode | undefined;
  if (!ta) return {};
  if (ta.type === 'TSTypeReference') {
    const id = ta.typeName as ASTNode | undefined;
    const name = (id?.name as string) ?? '';
    return name ? { typeName: name } : {};
  }
  if (ta.type === 'TSTypeLiteral') {
    return { inlineProps: extractPropsFromMembers((ta.members as ASTNode[]) ?? []) };
  }
  return {};
}

// ─── Node name helpers ────────────────────────────────────────────────────────

function nodeId(node: ASTNode | null | undefined): string {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name as string;
  if (node.type === 'MemberExpression') return nodeId(node.property as ASTNode);
  return '';
}

function isHookName(name: string) { return /^use[A-Z]/.test(name); }
function isComponentName(name: string) { return /^[A-Z]/.test(name); }

// ─── Function info extraction ─────────────────────────────────────────────────

function funcKind(name: string, isAsync: boolean): FunctionDef['kind'] {
  if (isComponentName(name)) return 'component';
  if (isHookName(name)) return 'hook';
  if (isAsync) return 'async';
  return 'function';
}

// ─── JSX detection ────────────────────────────────────────────────────────────

function bodyHasJSX(fnNode: ASTNode): boolean {
  let found = false;
  walk(fnNode.body ?? fnNode, n => {
    if (n.type === 'JSXElement' || n.type === 'JSXFragment') found = true;
  });
  return found;
}

// ─── HOC unwrapping ───────────────────────────────────────────────────────────

const HOC_NAMES = new Set(['memo', 'forwardRef', 'lazy', 'withRouter', 'observer']);

function unwrapHOC(initNode: ASTNode): { inner?: ASTNode; wrapperName?: string } {
  if (initNode.type !== 'CallExpression') return {};
  const callee = initNode.callee as ASTNode;
  const calleeName = nodeId(callee);
  if (!HOC_NAMES.has(calleeName)) return {};
  const args = (initNode.arguments as ASTNode[]) ?? [];
  return { inner: args[0], wrapperName: calleeName };
}

// ─── Interface / type extraction ─────────────────────────────────────────────

function extractInterface(node: ASTNode): InterfaceDef | null {
  if (node.type === 'TSInterfaceDeclaration') {
    const name = (node.id as ASTNode)?.name as string;
    if (!name) return null;
    const members = ((node.body as ASTNode)?.body as ASTNode[]) ?? [];
    return { name, props: extractPropsFromMembers(members) };
  }
  if (node.type === 'TSTypeAliasDeclaration') {
    const name = (node.id as ASTNode)?.name as string;
    if (!name) return null;
    const ta = node.typeAnnotation as ASTNode | undefined;
    if (ta?.type !== 'TSTypeLiteral') return null;
    return { name, props: extractPropsFromMembers((ta.members as ASTNode[]) ?? []) };
  }
  return null;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export function parseAST(
  path: string,
  content: string,
  extension: string,
): ASTResult {
  const empty: ASTResult = {
    imports: [], exports: [], components: [], componentInfo: [],
    hooks: [], definedHooks: [], routes: [], navLinks: [],
    allFunctions: [], interfaceDefinitions: [], astParsed: false,
  };

  let ast: ASTNode;
  try {
    const useJSX = extension === 'tsx' || extension === 'jsx';
    const plugins: string[] = ['typescript'];
    if (useJSX) plugins.push('jsx');

    const parsed = parse(content, {
      sourceType: 'module',
      plugins: plugins as import('@babel/parser').ParserPlugin[],
      errorRecovery: true,
      strictMode: false,
      createParenthesizedExpressions: false,
    });
    ast = parsed as unknown as ASTNode;
  } catch {
    return empty;
  }

  const program = ast.program as ASTNode;
  const body = (program.body as ASTNode[]) ?? [];

  const imports: ImportInfo[] = [];
  const exports = new Set<string>();
  const componentInfoMap = new Map<string, ComponentInfo>();
  const calledHooks = new Set<string>();
  const definedHooks = new Set<string>();
  const routes = new Set<string>();
  const navLinks: NavLink[] = [];
  const navLinkSeen = new Set<string>();
  const allFunctions: FunctionDef[] = [];
  const fnSeen = new Set<string>();
  const interfaceDefinitions: InterfaceDef[] = [];
  let defaultExportName = '';

  // ─── Helpers for processing function/variable nodes ──────────────────────

  function processFnDecl(fnNode: ASTNode, name: string, isExported: boolean, isDefault: boolean): void {
    if (!name) return;
    const isAsync = !!fnNode.async;
    if (!fnSeen.has(name)) {
      fnSeen.add(name);
      allFunctions.push({ name, kind: funcKind(name, isAsync), isExported });
    }
    if (isHookName(name)) {
      definedHooks.add(name);
    } else if (isComponentName(name) && bodyHasJSX(fnNode)) {
      if (!componentInfoMap.has(name)) {
        const params = (fnNode.params as ASTNode[]) ?? [];
        const { typeName, inlineProps } = propsFromFirstParam(params[0]);
        componentInfoMap.set(name, {
          name, propsTypeName: typeName, props: inlineProps ?? [],
          isDefaultExport: isDefault, isWrapped: false,
        });
      }
      if (isDefault && name) defaultExportName = name;
    }
  }

  function processVarDecl(decl: ASTNode, isExported: boolean): void {
    const name = (decl.id as ASTNode)?.name as string;
    if (!name) return;
    let init = decl.init as ASTNode | undefined;
    if (!init) return;

    const { inner, wrapperName } = unwrapHOC(init);
    const actualInit = inner ?? init;
    const isWrapped = !!wrapperName;

    const isFn = actualInit.type === 'ArrowFunctionExpression' ||
                 actualInit.type === 'FunctionExpression';
    if (!isFn) return;

    const isAsync = !!actualInit.async;
    if (!fnSeen.has(name)) {
      fnSeen.add(name);
      allFunctions.push({ name, kind: funcKind(name, isAsync), isExported });
    }
    if (isHookName(name)) {
      definedHooks.add(name);
    } else if (isComponentName(name) && bodyHasJSX(actualInit)) {
      if (!componentInfoMap.has(name)) {
        const params = (actualInit.params as ASTNode[]) ?? [];
        const { typeName, inlineProps } = propsFromFirstParam(params[0]);
        componentInfoMap.set(name, {
          name, propsTypeName: typeName, props: inlineProps ?? [],
          isDefaultExport: false, isWrapped, wrapperName,
        });
      }
    }
  }

  // ── Pass 1: top-level declarations ─────────────────────────────────────────

  for (const stmt of body) {
    switch (stmt.type) {
      // ── Imports ──────────────────────────────────────────────────────────
      case 'ImportDeclaration': {
        const raw = (stmt.source as ASTNode)?.value as string;
        if (!raw) break;
        const isRelative = raw.startsWith('.') || raw.startsWith('/');
        const isTypeOnly = !!(stmt.importKind === 'type');
        const names: string[] = [];
        let defaultName: string | undefined;
        let namespaceName: string | undefined;

        for (const spec of (stmt.specifiers as ASTNode[]) ?? []) {
          if (spec.type === 'ImportDefaultSpecifier') {
            defaultName = (spec.local as ASTNode)?.name as string;
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            namespaceName = (spec.local as ASTNode)?.name as string;
          } else if (spec.type === 'ImportSpecifier') {
            const n = ((spec.imported as ASTNode)?.name ?? (spec.local as ASTNode)?.name) as string;
            if (n) names.push(n);
          }
        }
        imports.push({ raw, isRelative, isTypeOnly, names, defaultName, namespaceName });
        break;
      }

      // ── Named exports ────────────────────────────────────────────────────
      case 'ExportNamedDeclaration': {
        const decl = stmt.declaration as ASTNode | undefined;
        if (decl) {
          if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
            const name = (decl.id as ASTNode)?.name as string;
            if (name) { exports.add(name); processFnDecl(decl, name, true, false); }
          } else if (decl.type === 'VariableDeclaration') {
            for (const d of (decl.declarations as ASTNode[]) ?? []) {
              const name = (d.id as ASTNode)?.name as string;
              if (name) exports.add(name);
              processVarDecl(d, true);
            }
          } else if (decl.type === 'TSInterfaceDeclaration' || decl.type === 'TSTypeAliasDeclaration') {
            const name = (decl.id as ASTNode)?.name as string;
            if (name) exports.add(name);
            const iface = extractInterface(decl);
            if (iface) interfaceDefinitions.push(iface);
          }
        }
        for (const spec of (stmt.specifiers as ASTNode[]) ?? []) {
          const name = (spec.exported as ASTNode)?.name as string;
          if (name) exports.add(name);
        }
        break;
      }

      // ── Default export ───────────────────────────────────────────────────
      case 'ExportDefaultDeclaration': {
        const decl = stmt.declaration as ASTNode;
        if (decl?.type === 'Identifier') {
          defaultExportName = decl.name as string;
          exports.add(decl.name as string);
        } else if (decl?.type === 'FunctionDeclaration' || decl?.type === 'ClassDeclaration') {
          const name = (decl.id as ASTNode)?.name as string;
          if (name) { exports.add(name); processFnDecl(decl, name, true, true); }
          else { exports.add('default'); }
        } else if (decl?.type === 'ArrowFunctionExpression' || decl?.type === 'FunctionExpression') {
          // export default () => <div />  — anonymous default
          exports.add('default');
          if (bodyHasJSX(decl)) {
            const params = (decl.params as ASTNode[]) ?? [];
            const { typeName, inlineProps } = propsFromFirstParam(params[0]);
            componentInfoMap.set('default', {
              name: 'default', propsTypeName: typeName, props: inlineProps ?? [],
              isDefaultExport: true, isWrapped: false,
            });
          }
        } else {
          exports.add('default');
        }
        break;
      }

      // ── Bare function declarations ────────────────────────────────────────
      case 'FunctionDeclaration': {
        const name = (stmt.id as ASTNode)?.name as string;
        processFnDecl(stmt, name, false, false);
        break;
      }

      // ── Bare variable declarations ────────────────────────────────────────
      case 'VariableDeclaration': {
        for (const declarator of (stmt.declarations as ASTNode[]) ?? []) {
          processVarDecl(declarator, false);
        }
        break;
      }

      // ── Standalone interfaces / type aliases ─────────────────────────────
      case 'TSInterfaceDeclaration':
      case 'TSTypeAliasDeclaration': {
        const iface = extractInterface(stmt);
        if (iface) interfaceDefinitions.push(iface);
        break;
      }
    }
  }

  // Mark default export
  if (defaultExportName && componentInfoMap.has(defaultExportName)) {
    const ci = componentInfoMap.get(defaultExportName)!;
    ci.isDefaultExport = true;
  }

  // Mark exported functions
  for (const fn of allFunctions) {
    if (exports.has(fn.name)) fn.isExported = true;
  }

  // ── Pass 2: deep walk for called hooks, nav links, routes ─────────────────
  walk(ast, node => {
    // Hook calls: useXxx(...)
    if (node.type === 'CallExpression') {
      const callee = node.callee as ASTNode;
      const name = nodeId(callee);
      if (isHookName(name)) calledHooks.add(name);

      // navigate('/path') / router.push('/path')
      const calleeFull = (callee.type === 'MemberExpression')
        ? `${nodeId(callee.object as ASTNode)}.${nodeId(callee.property as ASTNode)}`
        : name;

      if (/^(navigate|router\.push|router\.replace|history\.push|history\.replace)$/.test(calleeFull)) {
        const firstArg = (node.arguments as ASTNode[])?.[0];
        if (firstArg?.type === 'StringLiteral') {
          const target = (firstArg.value as string).split('?')[0].split('#')[0];
          if (target.startsWith('/') && !navLinkSeen.has(target)) {
            navLinkSeen.add(target);
            navLinks.push({ target, type: 'navigate' });
          }
        }
      }
    }

    // <Link to="..."> / <NavLink to="...">
    if (node.type === 'JSXOpeningElement') {
      const tagName = (node.name as ASTNode)?.name as string;
      if (tagName === 'Link' || tagName === 'NavLink') {
        for (const attr of (node.attributes as ASTNode[]) ?? []) {
          if (attr.type !== 'JSXAttribute') continue;
          if ((attr.name as ASTNode)?.name !== 'to') continue;
          const val = attr.value as ASTNode | undefined;
          let target = '';
          if (val?.type === 'StringLiteral') target = val.value as string;
          else if (val?.type === 'JSXExpressionContainer') {
            const expr = val.expression as ASTNode | undefined;
            if (expr?.type === 'StringLiteral') target = expr.value as string;
            else if (expr?.type === 'TemplateLiteral') {
              const quasis = (expr.quasis as ASTNode[]) ?? [];
              if (quasis[0]) target = (quasis[0].value as ASTNode)?.cooked as string ?? '';
            }
          }
          if (target) {
            const clean = target.split('?')[0].split('#')[0];
            if (clean.startsWith('/') && !navLinkSeen.has(clean)) {
              navLinkSeen.add(clean);
              navLinks.push({ target: clean, type: 'link' });
            }
          }
        }
      }
    }

    // Route path attributes
    if (node.type === 'JSXAttribute') {
      if ((node.name as ASTNode)?.name !== 'path') return;
      const val = node.value as ASTNode | undefined;
      if (val?.type === 'StringLiteral') routes.add(val.value as string);
      else if (val?.type === 'JSXExpressionContainer') {
        const expr = val.expression as ASTNode | undefined;
        if (expr?.type === 'StringLiteral') routes.add(expr.value as string);
      }
    }

    // Object route configs: { path: '/foo', element: ... }
    if (node.type === 'ObjectProperty' || node.type === 'Property') {
      const keyNode = node.key as ASTNode | undefined;
      if ((keyNode?.name ?? keyNode?.value) !== 'path') return;
      const val = node.value as ASTNode | undefined;
      if (val?.type === 'StringLiteral') routes.add(val.value as string);
    }
  });

  // ── Resolve props from interfaces ─────────────────────────────────────────
  const ifaceMap = new Map(interfaceDefinitions.map(i => [i.name, i]));
  for (const ci of componentInfoMap.values()) {
    if (ci.propsTypeName && ci.props.length === 0) {
      const iface = ifaceMap.get(ci.propsTypeName);
      if (iface) ci.props = iface.props;
    }
  }

  // ── Build final result ────────────────────────────────────────────────────
  const componentInfo = Array.from(componentInfoMap.values());
  const components = componentInfo.map(c => c.name);

  // Called hooks minus defined hooks = truly external hooks
  const usedHooks = Array.from(calledHooks).sort();

  return {
    imports,
    exports: Array.from(exports),
    components,
    componentInfo,
    hooks: usedHooks,
    definedHooks: Array.from(definedHooks).sort(),
    routes: Array.from(routes),
    navLinks,
    allFunctions,
    interfaceDefinitions,
    astParsed: true,
  };
}
