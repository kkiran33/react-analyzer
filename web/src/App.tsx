import { useGraphStore } from '@/store/useGraphStore';
import { useFileAnalysis } from '@/hooks/useFileAnalysis';
import { Toolbar } from '@/components/Toolbar';
import { Sidebar } from '@/components/Sidebar';
import { FlowCanvas } from '@/components/FlowCanvas';
import { TechDebtDashboard } from '@/components/TechDebtDashboard';
import { ActionPlan } from '@/components/ActionPlan';
import { ModuleDeepDive } from '@/components/ModuleDeepDive';
import { EmptyState } from '@/components/EmptyState';

export default function App() {
  const status = useGraphStore((s) => s.status);
  const view = useGraphStore((s) => s.view);
  const { analyze } = useFileAnalysis();

  const isLoading = status === 'reading' || status === 'parsing' || status === 'building';

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Toolbar onOpen={analyze} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <div className="flex-1 relative overflow-hidden flex">
          {status === 'idle' || status === 'error' ? (
            <EmptyState onOpen={analyze} isLoading={isLoading} />
          ) : isLoading ? (
            <LoadingOverlay />
          ) : view === 'techdebt' ? (
            <TechDebtDashboard />
          ) : view === 'actions' ? (
            <ActionPlan />
          ) : (
            <FlowCanvas />
          )}
        </div>

        <ModuleDeepDive />
      </div>
    </div>
  );
}

function LoadingOverlay() {
  const status = useGraphStore((s) => s.status);
  const fileCount = useGraphStore((s) => s.fileCount);

  const messages: Record<string, string> = {
    reading: `Reading files… ${fileCount > 0 ? `(${fileCount} found)` : ''}`,
    parsing: `Parsing ${fileCount} files…`,
    building: 'Computing layout…',
  };

  return (
    <div className="flex flex-col items-center justify-center h-full w-full gap-4">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">{messages[status] ?? 'Working…'}</p>
    </div>
  );
}
