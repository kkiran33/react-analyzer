import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { JourneyRoute } from '@/lib/journeyBuilder';

export type JourneyNodeType = Node<{ route: JourneyRoute }, 'journeyNode'>;

function JourneyNodeInner({ data, selected }: NodeProps<JourneyNodeType>) {
  const { route } = data;
  const level = route.level;

  const depthColor = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899'][level % 5];
  const depthBg = ['#1E3A5F', '#2E1065', '#064E3B', '#451A03', '#500724'][level % 5];

  return (
    <div
      style={{
        background: depthBg,
        borderLeft: `4px solid ${depthColor}`,
        borderTop: `1px solid ${selected ? depthColor : '#334155'}`,
        borderRight: `1px solid ${selected ? depthColor : '#334155'}`,
        borderBottom: `1px solid ${selected ? depthColor : '#334155'}`,
        borderRadius: 6,
        padding: '10px 14px',
        width: 220,
        minHeight: 72,
        boxShadow: selected ? `0 0 0 2px ${depthColor}60` : '0 2px 6px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        fontFamily: 'ui-monospace, monospace',
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: depthColor, width: 8, height: 8, border: 'none' }}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        {route.isProtected && (
          <span style={{
            background: '#EF4444',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            letterSpacing: '0.06em',
          }}>PROTECTED</span>
        )}
        {route.isEntry && (
          <span style={{
            background: '#0d9488',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            letterSpacing: '0.06em',
          }}>ENTRY</span>
        )}
        <span style={{
          background: depthColor,
          color: '#000',
          fontSize: 9,
          fontWeight: 700,
          padding: '1px 5px',
          borderRadius: 3,
          letterSpacing: '0.06em',
        }} title="Navigation depth — steps from an entry screen">
          L{level}
        </span>
      </div>

      <div style={{
        color: '#f1f5f9',
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {route.path}
      </div>

      <div style={{
        color: '#94a3b8',
        fontSize: 11,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {route.componentName}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: depthColor, width: 8, height: 8, border: 'none' }}
      />
    </div>
  );
}

export const JourneyNode = memo(JourneyNodeInner);
