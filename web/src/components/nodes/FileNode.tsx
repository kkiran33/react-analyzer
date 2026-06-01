import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { ParsedFile } from '@/types/graph';
import { FILE_TYPE_CONFIG } from '@/types/graph';

export type FileNodeType = Node<{
  file: ParsedFile;
  isDirectImpact?: boolean;
  isTransitiveImpact?: boolean;
}, 'fileNode'>;

function FileNodeInner({ data, selected }: NodeProps<FileNodeType>) {
  const { file, isDirectImpact, isTransitiveImpact } = data;
  const cfg = FILE_TYPE_CONFIG[file.type] ?? FILE_TYPE_CONFIG.util;

  return (
    <div
      style={{
        background: cfg.bg,
        borderLeft: `4px solid ${cfg.color}`,
        borderTop: `1px solid ${selected ? cfg.color : isDirectImpact ? '#F97316' : isTransitiveImpact ? '#FCD34D' : '#334155'}`,
        borderRight: `1px solid ${selected ? cfg.color : isDirectImpact ? '#F97316' : isTransitiveImpact ? '#FCD34D' : '#334155'}`,
        borderBottom: `1px solid ${selected ? cfg.color : isDirectImpact ? '#F97316' : isTransitiveImpact ? '#FCD34D' : '#334155'}`,
        borderRadius: 6,
        padding: '8px 12px',
        width: 200,
        minHeight: 56,
        boxShadow: selected
          ? `0 0 0 2px ${cfg.color}60`
          : isDirectImpact
          ? '0 0 0 2px #F9731660'
          : isTransitiveImpact
          ? '0 0 0 1px #FCD34D30'
          : '0 2px 6px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: cfg.color, width: 8, height: 8, border: 'none' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span
          style={{
            background: cfg.color,
            color: '#000',
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {cfg.label}
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>{file.linesOfCode}L</span>
        {file.routes.length > 0 && (
          <span style={{ color: '#64748b', fontSize: 10 }}>• {file.routes.length} route{file.routes.length > 1 ? 's' : ''}</span>
        )}
      </div>

      <div
        style={{
          color: '#f1f5f9',
          fontSize: 12,
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {file.name}
      </div>

      {file.components.length > 0 && (
        <div
          style={{
            color: '#94a3b8',
            fontSize: 10,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {file.components.slice(0, 2).join(', ')}
          {file.components.length > 2 ? ` +${file.components.length - 2}` : ''}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: cfg.color, width: 8, height: 8, border: 'none' }}
      />
    </div>
  );
}

export const FileNode = memo(FileNodeInner);
