import { useCallback } from 'react';
import { readFolder } from '@/lib/fsReader';
import { parseFiles } from '@/lib/parser';
import { buildGraph } from '@/lib/graphBuilder';
import { analyzeDebt } from '@/lib/techDebtAnalyzer';
import { useGraphStore } from '@/store/useGraphStore';

export function useFileAnalysis() {
  const setStatus = useGraphStore((s) => s.setStatus);
  const setFileCount = useGraphStore((s) => s.setFileCount);
  const setGraph = useGraphStore((s) => s.setGraph);
  const setTechDebt = useGraphStore((s) => s.setTechDebt);
  const setError = useGraphStore((s) => s.setError);
  const typeOverrides = useGraphStore((s) => s.typeOverrides);

  const analyze = useCallback(async () => {
    try {
      setStatus('reading');
      const { files: rawFiles, rootName } = await readFolder((n) => setFileCount(n));

      setStatus('parsing');
      setFileCount(rawFiles.size);
      const parsedFiles = parseFiles(rawFiles, typeOverrides);

      setStatus('building');
      const { nodes, edges } = buildGraph(parsedFiles);
      setGraph(parsedFiles, nodes, edges, rootName);

      const debtMetrics = analyzeDebt(parsedFiles);
      setTechDebt(debtMetrics);
    } catch (err) {
      if (err instanceof Error) {
        if (err.name === 'AbortError') setStatus('idle');
        else setError(err.message);
      } else {
        setStatus('idle');
      }
    }
  }, [setStatus, setFileCount, setGraph, setTechDebt, setError, typeOverrides]);

  return { analyze };
}
