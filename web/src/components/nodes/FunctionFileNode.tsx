import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { FILE_TYPE_CONFIG } from '@/types/graph';
import type { ParsedFile, FunctionDef } from '@/types/graph';

export type FunctionFileNodeType = Node<{ file: ParsedFile }, 'functionFileNode'>;

const KIND_COLOR: Record<FunctionDef['kind'], string> = {
  component: '#10B981',
  hook: '#F59E0B',
  async: '#3B82F6',
  function: '#94A3B8',
};

const KIND_LABEL: Record<FunctionDef['kind'], string> = {
  component: 'C',
  hook: 'H',
  async: 'A',
  function: 'F',
};

const MAX_ROWS = 10;

function FunctionFileNodeInner({ data, selected }: NodeProps<FunctionFileNodeType>) {
  const { file } = data;
  const cfg = FILE_TYPE_CONFIG[file.type] ?? FILE_TYPE_CONFIG.util;

  const exportedFns = file.allFunctions.filter(f => f.isExported);
  const rows = exportedFns.length > 0 ? exportedFns : file.exports.map(name => ({
    name,
    kind: /^[A-Z]/.test(name) ? 'component' : /^use[A-Z]/.test(name) ? 'hook' : 'function',
    isExported: true,
  } as FunctionDef));

  const displayRows = rows.slice(0, MAX_ROWS);
  const overflow = rows.length - displayRows.length;

  return (
    <div
      style={{
        background: '#0f172a',
        borderLeft: `4px solid ${cfg.color}`,
        borderTop: `1px solid ${selected ? cfg.color : '#334155'}`,
        borderRight: `1px solid ${selected ? cfg.color : '#334155'}`,
        borderBottom: `1px solid ${selected ? cfg.color : '#334155'}`,
        borderRadius: 6,
        width: 220,
        boxShadow: selected ? `0 0 0 2px ${cfg.color}60` : '0 2px 6px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        overflow: 'hidden',
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: cfg.color, width: 8, height: 8, border: 'none' }}
      />

      {/* File header */}
      <div
        style={{
          background: cfg.bg,
          padding: '8px 12px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            background: cfg.color, color: '#000',
            fontSize: 9, fontWeight: 700,
            padding: '1px 5px', borderRadius: 3,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            {cfg.label}
          </span>
          <span style={{ color: '#64748b', fontSize: 10 }}>{rows.length} exports</span>
        </div>
        <div style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </div>
      </div>

      {/* Function rows */}
      <div style={{ padding: '4px 0' }}>
        {displayRows.map((fn) => (
          <div
            key={fn.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 10px',
              height: 22,
            }}
          >
            <span style={{
              background: KIND_COLOR[fn.kind] + '25',
              color: KIND_COLOR[fn.kind],
              fontSize: 9,
              fontWeight: 700,
              width: 14,
              height: 14,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {KIND_LABEL[fn.kind]}
            </span>
            <span style={{
              color: KIND_COLOR[fn.kind],
              fontSize: 11,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {fn.name}
            </span>
          </div>
        ))}
        {overflow > 0 && (
          <div style={{ padding: '2px 10px', color: '#475569', fontSize: 10 }}>
            +{overflow} more…
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: cfg.color, width: 8, height: 8, border: 'none' }}
      />
    </div>
  );
}

export const FunctionFileNode = memo(FunctionFileNodeInner);
