import { useCallback } from 'react';
import { readFolder } from '@/lib/fsReader';
import { parseFiles } from '@/lib/parser';
import { buildGraph } from '@/lib/graphBuilder';
import { analyzeDebt } from '@/lib/techDebtAnalyzer';
import { useGraphStore } from '@/store/useGraphStore';
import type { Language } from '@/types/graph';

export function useFileAnalysis() {
  const setStatus = useGraphStore((s) => s.setStatus);
  const setLanguage = useGraphStore((s) => s.setLanguage);
  const setFileCount = useGraphStore((s) => s.setFileCount);
  const setGraph = useGraphStore((s) => s.setGraph);
  const setTechDebt = useGraphStore((s) => s.setTechDebt);
  const setError = useGraphStore((s) => s.setError);
  const typeOverrides = useGraphStore((s) => s.typeOverrides);

  const analyze = useCallback(async (language?: Language) => {
    const lang = language ?? useGraphStore.getState().language;
    try {
      setLanguage(lang);
      setStatus('reading');
      const { files: rawFiles, rootName } = await readFolder(lang, (n) => setFileCount(n));

      setStatus('parsing');
      setFileCount(rawFiles.size);
      const parsedFiles = parseFiles(rawFiles, typeOverrides, lang);

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
  }, [setStatus, setLanguage, setFileCount, setGraph, setTechDebt, setError, typeOverrides]);

  return { analyze };
}
