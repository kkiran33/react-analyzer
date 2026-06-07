import type {
  ParsedFile, ImportInfo, NavLink, FunctionDef, Language, TypeOverride,
} from '@/types/graph';
import { classifyNative } from './nativeClassifier';

// ─────────────────────────────────────────────────────────────────────────────
// Static analyzer for native mobile sources (Swift / Kotlin). No AST library and
// no model — pure regex extraction, mirroring the React analyzer's approach.
//
// The key difference from React: `import` statements in Swift/Kotlin are
// module-level, not file-level, so they cannot drive a file dependency graph.
// Instead we link files by *symbol reference*: every top-level type a file
// declares (class/struct/enum/protocol/object/interface) is registered, then any
// other file that mentions that type name gets an edge to the declaring file.
// ─────────────────────────────────────────────────────────────────────────────

interface NativeExtract {
  decls: string[];        // top-level type names declared here (graph nodes own these)
  refs: Set<string>;      // capitalized identifiers referenced (candidate edges)
  extMethods: string[];   // methods this file adds via extension (Swift) / receiver fn (Kotlin)
  calls: Set<string>;     // .method( call names made in this file (candidate ext-method edges)
}

export function parseNativeFiles(
  fileMap: Map<string, string>,
  language: Language,
  overrides?: TypeOverride,
): Map<string, ParsedFile> {
  const parsed = new Map<string, ParsedFile>();
  const extracts = new Map<string, NativeExtract>();
  const declaredBy = new Map<string, string>();  // typeName → owning fileId (first wins)
  const extMethodBy = new Map<string, string>(); // extension method name → owning fileId

  // Pass 1 — parse each file, collect declared symbols + extension methods.
  for (const [path, content] of fileMap) {
    const { file, extract } = parseNativeFile(path, content, language, overrides);
    parsed.set(path, file);
    extracts.set(path, extract);
    for (const d of extract.decls) {
      if (!declaredBy.has(d)) declaredBy.set(d, path);
    }
    for (const em of extract.extMethods) {
      if (!extMethodBy.has(em)) extMethodBy.set(em, path);
    }
  }

  // Pass 2 — resolve edges by (a) type reference and (b) extension-method call.
  // Extensions declare no top-level type, so type-reference linking alone misses
  // them; method-call linking connects a caller to the file providing the method.
  for (const [path, file] of parsed) {
    const { refs, calls } = extracts.get(path)!;
    const targets = new Set<string>();
    for (const name of refs) {
      const owner = declaredBy.get(name);
      if (owner && owner !== path) targets.add(owner);
    }
    for (const call of calls) {
      const owner = extMethodBy.get(call);
      if (owner && owner !== path) targets.add(owner);
    }
    file.resolvedImports = [...targets];
  }

  return parsed;
}

function parseNativeFile(
  path: string,
  content: string,
  language: Language,
  overrides?: TypeOverride,
): { file: ParsedFile; extract: NativeExtract } {
  const segments = path.split('/');
  const filename = segments[segments.length - 1];
  const dotIdx = filename.lastIndexOf('.');
  const name = dotIdx > 0 ? filename.slice(0, dotIdx) : filename;
  const extension = dotIdx > 0 ? filename.slice(dotIdx + 1) : '';
  const dir = segments.slice(0, -1).join('/');

  const src = stripComments(content);

  const decls = language === 'swift' ? swiftDecls(src) : kotlinDecls(src);
  const refs = collectRefs(src, new Set(decls));
  const extMethods = language === 'swift' ? swiftExtensionMethods(src) : kotlinExtensionFunctions(src);
  const calls = collectCalls(src);
  const imports = parseImports(src);
  const allFunctions = language === 'swift'
    ? swiftFunctions(src, decls)
    : kotlinFunctions(src, decls);

  const type = classifyNative(path, name, content, language, overrides);

  // Screens get a synthetic route so the Journey view can render the flow.
  // Use the file name, not decls[0]: Compose screens are @Composable functions,
  // so the only declared *class* is often a PreviewParameterProvider (tooling) —
  // deriving the route from that produced bogus names like /FooPreviewParamProvider.
  const routes = type === 'page' ? [`/${name}`] : [];
  const navLinks = language === 'swift' ? swiftNavLinks(src) : kotlinNavLinks(src);

  const exports = [...new Set([...decls, ...allFunctions.filter(f => f.isExported).map(f => f.name)])];

  const file: ParsedFile = {
    id: path,
    path,
    name,
    dir,
    extension,
    type,
    imports,
    resolvedImports: [],
    exports,
    components: decls,
    hooks: [],
    routes,
    navLinks,
    allFunctions,
    linesOfCode: content.split('\n').length,
    componentInfo: [],
    interfaceDefinitions: [],
    definedHooks: [],
    astParsed: false,
  };

  return { file, extract: { decls, refs, extMethods, calls } };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/\/\/[^\n]*/g, ' ');         // line comments
}

function parseImports(src: string): ImportInfo[] {
  const out: ImportInfo[] = [];
  const seen = new Set<string>();
  const re = /^\s*import\s+([A-Za-z0-9_.]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const raw = m[1];
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push({ raw, isRelative: false, names: [], isTypeOnly: false });
  }
  return out;
}

// Collect capitalized identifiers used in the file (candidate type references).
// Only refs that match a project-declared type become edges, so no stoplist of
// framework types is needed — UIKit/Foundation/stdlib names are never declared.
function collectRefs(src: string, own: Set<string>): Set<string> {
  const refs = new Set<string>();
  const re = /\b([A-Z][A-Za-z0-9_]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!own.has(m[1])) refs.add(m[1]);
  }
  return refs;
}

// Collect `.methodName(` call sites (lowercase-initial → instance/extension calls).
// Matched against project extension methods in pass 2 to link extension files,
// which declare no top-level type and so are invisible to type-reference linking.
function collectCalls(src: string): Set<string> {
  const calls = new Set<string>();
  const re = /\.([a-z][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) calls.add(m[1]);
  return calls;
}

// Swift: method names declared inside `extension Foo { ... }` blocks.
// Brace-matched so nested closures/types in the body don't end the block early.
function swiftExtensionMethods(src: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const extRe = /\bextension\s+[A-Za-z_][A-Za-z0-9_.]*(?:\s*:[^{]+)?\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = extRe.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0, i = open;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(open + 1, i);
    const fnRe = /\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)/g;
    let fm: RegExpExecArray | null;
    while ((fm = fnRe.exec(body)) !== null) {
      if (!seen.has(fm[1])) { seen.add(fm[1]); out.push(fm[1]); }
    }
    extRe.lastIndex = i; // resume scanning after this block
  }
  return out;
}

// Kotlin: top-level extension functions `fun Receiver.method(...)`.
function kotlinExtensionFunctions(src: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\bfun\s+(?:<[^>]+>\s*)?[A-Za-z_][A-Za-z0-9_<>,.\s?]*\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

// ─── Swift extraction ─────────────────────────────────────────────────────────

function swiftDecls(src: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // class / struct / enum / protocol / actor (but NOT `extension`, which decorates
  // a type owned elsewhere) at any indentation.
  const re = /(?:^|\s)(?:final\s+|public\s+|open\s+|internal\s+|private\s+|fileprivate\s+)*(?:class|struct|enum|protocol|actor)\s+([A-Z][A-Za-z0-9_]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

function swiftFunctions(src: string, decls: string[]): FunctionDef[] {
  const fns: FunctionDef[] = [];
  const seen = new Set<string>();
  const add = (name: string, kind: FunctionDef['kind'], isExported: boolean) => {
    if (seen.has(name)) return; seen.add(name);
    fns.push({ name, kind, isExported });
  };
  // Declared types surface as `component` entries so the Functions view shows them.
  for (const d of decls) add(d, 'component', true);

  const re = /(?:^|\n)\s*((?:private|fileprivate|public|open|internal|static|class|final|\s)*)func\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\(([^)]*)\)([^{\n]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const mods = m[1] ?? '';
    const name = m[2];
    const tail = m[4] ?? '';
    const isAsync = /\basync\b/.test(tail);
    const isExported = !/\b(private|fileprivate)\b/.test(mods);
    add(name, isAsync ? 'async' : 'function', isExported);
  }
  return fns;
}

function swiftNavLinks(src: string): NavLink[] {
  const links: NavLink[] = [];
  const seen = new Set<string>();
  const add = (target: string, type: NavLink['type']) => {
    const key = `${type}:${target}`;
    if (seen.has(key)) return; seen.add(key);
    links.push({ target: `/${target}`, type });
  };
  // Imperative UIKit navigation: push/present/show a concrete VC type.
  const imperative = /\.(?:pushViewController|present|show|showDetailViewController)\s*\(\s*([A-Z][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = imperative.exec(src)) !== null) add(m[1], 'navigate');
  // SwiftUI declarative navigation.
  const declarative = /(?:NavigationLink\s*\(\s*destination:\s*|navigationDestination\([^)]*\)\s*\{\s*|\.sheet[^{]*\{\s*|\.fullScreenCover[^{]*\{\s*)([A-Z][A-Za-z0-9_]*)\s*\(/g;
  while ((m = declarative.exec(src)) !== null) add(m[1], 'link');
  return links;
}

// ─── Kotlin extraction ────────────────────────────────────────────────────────

function kotlinDecls(src: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(?:^|\s)(?:public\s+|private\s+|internal\s+|abstract\s+|final\s+|open\s+|sealed\s+|data\s+|inner\s+|enum\s+|annotation\s+)*(?:class|interface|object)\s+([A-Z][A-Za-z0-9_]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

function kotlinFunctions(src: string, decls: string[]): FunctionDef[] {
  const fns: FunctionDef[] = [];
  const seen = new Set<string>();
  const add = (name: string, kind: FunctionDef['kind'], isExported: boolean) => {
    if (seen.has(name)) return; seen.add(name);
    fns.push({ name, kind, isExported });
  };
  for (const d of decls) add(d, 'component', true);

  const re = /(@Composable\s+)?((?:private|internal|public|protected|suspend|inline|open|override|\s)*)fun\s+(?:<[^>]*>\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const composable = !!m[1];
    const mods = m[2] ?? '';
    const name = m[3];
    const isAsync = /\bsuspend\b/.test(mods);
    const isExported = !/\bprivate\b/.test(mods);
    // @Composable functions are UI building blocks → treat like components.
    const kind: FunctionDef['kind'] = composable ? 'component' : isAsync ? 'async' : 'function';
    add(name, kind, isExported);
  }
  return fns;
}

function kotlinNavLinks(src: string): NavLink[] {
  const links: NavLink[] = [];
  const seen = new Set<string>();
  const add = (target: string, type: NavLink['type']) => {
    const key = `${type}:${target}`;
    if (seen.has(key)) return; seen.add(key);
    links.push({ target: `/${target}`, type });
  };
  // Activity navigation via Intent(this, Foo::class.java)
  const intentRe = /Intent\s*\([^,)]*,\s*([A-Z][A-Za-z0-9_]*)::class/g;
  let m: RegExpExecArray | null;
  while ((m = intentRe.exec(src)) !== null) add(m[1], 'navigate');
  // Fragment transactions: replace/add(..., SomeFragment())
  const fragRe = /\.(?:replace|add)\s*\([^,)]*,\s*([A-Z][A-Za-z0-9_]*Fragment)\s*\(/g;
  while ((m = fragRe.exec(src)) !== null) add(m[1], 'navigate');
  // Compose Navigation: navController.navigate(Screen.Foo.route / Foo.createRoute(...))
  const composeObj = /\bnavigate\s*\(\s*(?:[A-Za-z_][\w]*\.)*([A-Z][A-Za-z0-9_]*)\.(?:route|createRoute)\b/g;
  while ((m = composeObj.exec(src)) !== null) add(m[1], 'navigate');
  // Compose Navigation with a string route literal: navigate("plant_detail/{id}")
  const composeStr = /\bnavigate\s*\(\s*"([^"/{]+)/g;
  while ((m = composeStr.exec(src)) !== null) add(m[1], 'link');
  return links;
}
