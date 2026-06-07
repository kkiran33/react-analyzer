import { LANGUAGE_CONFIG, type Language } from '@/types/graph';

const SKIP_DIRS = new Set([
  // web
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'out', '.turbo', 'coverage', '.cache', '__pycache__', '.vercel',
  '.expo', 'storybook-static',
  // native (iOS / Android)
  'Pods', 'Carthage', 'DerivedData', '.swiftpm', '.gradle', '.idea',
  'gradle', 'captures', '.cxx',
]);

const MAX_FILES = 1500;

export interface ReadResult {
  files: Map<string, string>;
  rootName: string;
}

export async function readFolder(
  language: Language = 'react',
  onProgress?: (count: number) => void,
): Promise<ReadResult> {
  const dirHandle = await (window as unknown as Window & {
    showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker({ mode: 'read' });

  const extensions = new Set(LANGUAGE_CONFIG[language].extensions);
  const files = new Map<string, string>();
  await walkDir(dirHandle, '', files, extensions, onProgress);

  return { files, rootName: dirHandle.name };
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  files: Map<string, string>,
  extensions: Set<string>,
  onProgress?: (count: number) => void,
): Promise<void> {
  if (files.size >= MAX_FILES) return;

  for await (const entry of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    const [name, handle] = entry as [string, FileSystemHandle];
    if (files.size >= MAX_FILES) break;

    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'directory') {
      if (!SKIP_DIRS.has(name) && !name.startsWith('.')) {
        await walkDir(handle as FileSystemDirectoryHandle, path, files, extensions, onProgress);
      }
    } else if (handle.kind === 'file') {
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (extensions.has(ext)) {
        try {
          const file = await (handle as FileSystemFileHandle).getFile();
          files.set(path, await file.text());
          onProgress?.(files.size);
        } catch {
          // skip unreadable files
        }
      }
    }
  }
}

export function isFSAccessSupported(): boolean {
  return 'showDirectoryPicker' in window;
}
