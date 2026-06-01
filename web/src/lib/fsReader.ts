const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'out', '.turbo', 'coverage', '.cache', '__pycache__', '.vercel',
  '.expo', 'storybook-static',
]);

const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx']);
const MAX_FILES = 1500;

export interface ReadResult {
  files: Map<string, string>;
  rootName: string;
}

export async function readFolder(
  onProgress?: (count: number) => void,
): Promise<ReadResult> {
  const dirHandle = await (window as unknown as Window & {
    showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
  }).showDirectoryPicker({ mode: 'read' });

  const files = new Map<string, string>();
  await walkDir(dirHandle, '', files, onProgress);

  return { files, rootName: dirHandle.name };
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  files: Map<string, string>,
  onProgress?: (count: number) => void,
): Promise<void> {
  if (files.size >= MAX_FILES) return;

  for await (const entry of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    const [name, handle] = entry as [string, FileSystemHandle];
    if (files.size >= MAX_FILES) break;

    const path = prefix ? `${prefix}/${name}` : name;

    if (handle.kind === 'directory') {
      if (!SKIP_DIRS.has(name) && !name.startsWith('.')) {
        await walkDir(handle as FileSystemDirectoryHandle, path, files, onProgress);
      }
    } else if (handle.kind === 'file') {
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      if (CODE_EXTENSIONS.has(ext)) {
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
