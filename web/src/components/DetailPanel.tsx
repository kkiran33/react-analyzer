import { X, FileCode, ArrowRight, ArrowLeft, Package } from 'lucide-react';
import { useGraphStore } from '@/store/useGraphStore';
import { FILE_TYPE_CONFIG } from '@/types/graph';

export function DetailPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const files = useGraphStore((s) => s.files);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);

  const file = selectedNodeId ? files.get(selectedNodeId) : null;
  if (!file) return null;

  const cfg = FILE_TYPE_CONFIG[file.type];

  // Files that import this file (dependents)
  const importedBy = [...files.values()].filter((f) =>
    f.resolvedImports.includes(file.id),
  );

  const internalImports = file.imports.filter((i) => i.isRelative);
  const externalImports = file.imports.filter((i) => !i.isRelative);

  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-800 flex flex-col overflow-hidden bg-slate-950">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b border-slate-800">
        <div className="flex-1 min-w-0 mr-2">
          <div className="flex items-center gap-2 mb-1">
            <span
              style={{ background: cfg.color, color: '#000' }}
              className="text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wide"
            >
              {cfg.label}
            </span>
            <span className="text-slate-500 text-xs">{file.linesOfCode} lines</span>
          </div>
          <h2 className="text-slate-100 font-mono font-semibold text-sm truncate">
            {file.name}.{file.extension}
          </h2>
          <p className="text-slate-600 text-xs truncate mt-0.5">{file.path}</p>
        </div>
        <button
          onClick={() => setSelectedNode(null)}
          className="text-slate-600 hover:text-slate-400 flex-shrink-0 p-0.5 rounded"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-px bg-slate-800 border-b border-slate-800">
          {[
            { label: 'Components', value: file.components.length },
            { label: 'Hooks', value: file.hooks.length },
            { label: 'Routes', value: file.routes.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-950 p-3 text-center">
              <div className="text-lg font-bold text-slate-100">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="p-4 space-y-5">
          {/* Components */}
          {file.components.length > 0 && (
            <Section icon={<FileCode size={12} />} title="Components">
              {file.components.map((c) => (
                <CodeTag key={c} text={c} color={cfg.color} />
              ))}
            </Section>
          )}

          {/* Hooks */}
          {file.hooks.length > 0 && (
            <Section icon={<span className="text-amber-400 text-xs">🪝</span>} title="Hooks used">
              {file.hooks.map((h) => (
                <CodeTag key={h} text={h} color="#F59E0B" />
              ))}
            </Section>
          )}

          {/* Routes */}
          {file.routes.length > 0 && (
            <Section icon={<span className="text-xs">🔀</span>} title="Routes">
              {file.routes.map((r) => (
                <CodeTag key={r} text={r} color="#10B981" mono />
              ))}
            </Section>
          )}

          {/* Exports */}
          {file.exports.length > 0 && (
            <Section icon={<ArrowRight size={12} className="text-slate-400" />} title="Exports">
              {file.exports.map((e) => (
                <CodeTag key={e} text={e} />
              ))}
            </Section>
          )}

          {/* Internal imports */}
          {internalImports.length > 0 && (
            <Section icon={<ArrowLeft size={12} className="text-slate-400" />} title={`Imports (${internalImports.length} local)`}>
              {internalImports.map((i) => {
                const resolved = file.resolvedImports.find((r) => r.includes(i.raw.split('/').pop()!));
                const target = resolved ? files.get(resolved) : undefined;
                return (
                  <button
                    key={i.raw}
                    onClick={() => resolved && setSelectedNode(resolved)}
                    className={`block w-full text-left truncate text-xs font-mono px-2 py-1 rounded transition-colors ${
                      resolved
                        ? 'text-slate-300 hover:bg-slate-800 cursor-pointer'
                        : 'text-slate-600 cursor-default'
                    }`}
                    title={i.raw}
                    disabled={!resolved}
                  >
                    {target ? (
                      <span style={{ color: FILE_TYPE_CONFIG[target.type].color }}>{target.name}</span>
                    ) : (
                      i.raw
                    )}
                  </button>
                );
              })}
            </Section>
          )}

          {/* Used by */}
          {importedBy.length > 0 && (
            <Section icon={<Package size={12} className="text-slate-400" />} title={`Used by (${importedBy.length})`}>
              {importedBy.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedNode(f.id)}
                  className="block w-full text-left truncate text-xs font-mono px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                >
                  <span style={{ color: FILE_TYPE_CONFIG[f.type].color }}>{f.name}</span>
                </button>
              ))}
            </Section>
          )}

          {/* External packages */}
          {externalImports.length > 0 && (
            <Section icon={<Package size={12} className="text-slate-500" />} title="NPM packages">
              <div className="flex flex-wrap gap-1">
                {externalImports.map((i) => (
                  <span
                    key={i.raw}
                    className="text-xs font-mono px-1.5 py-0.5 bg-slate-900 text-slate-500 border border-slate-800 rounded"
                  >
                    {i.raw}
                  </span>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CodeTag({ text, color, mono }: { text: string; color?: string; mono?: boolean }) {
  return (
    <span
      style={color ? { color } : {}}
      className={`inline-block text-xs px-2 py-0.5 bg-slate-900 border border-slate-800 rounded mr-1 mb-1 ${
        mono ? 'font-mono' : 'font-medium'
      } ${!color ? 'text-slate-300' : ''}`}
    >
      {text}
    </span>
  );
}
