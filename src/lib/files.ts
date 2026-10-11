import type { Library } from './types';
import { exportFileName, serialize } from './backup';

export function download(name: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadExport(lib: Library, prefix?: string) {
  const name = prefix ? `${prefix}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json` : exportFileName();
  download(name, serialize(lib));
}

/** Let the user pick files; resolves with an empty list if they cancel. */
export function pickFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}
