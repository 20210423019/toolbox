import { invoke } from "./tauri-invoke";
import { isTauri } from "./tauri-invoke";


export function convertFileSrc(path: string): string {
  if (!path) return "";
  try {
    const tauri = (window as any).__TAURI__;

    if (isTauri() && typeof tauri?.convertFileSrc === "function") {
      return tauri.convertFileSrc(path);
    }
  } catch {}
  return path;
}


export async function loadCoverAsDataUrl(path: string): Promise<string | null> {
  if (!path) return null;
  try {
    if (!isTauri()) return null;
    const { readBinaryFile } = await import("@tauri-apps/api/fs");
    const data = await readBinaryFile(path);
    const ext = path.split('.').pop()?.toLowerCase() || 'jpg';
    const mime =
      ext === 'png' ? 'image/png' :
      ext === 'webp' ? 'image/webp' :
      ext === 'gif' ? 'image/gif' :
      ext === 'bmp' ? 'image/bmp' :
      'image/jpeg';

    const bytes = new Uint8Array(data);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    return `data:${mime};base64,${btoa(binary)}`;
  } catch (e) {
    return null;
  }
}

export async function openWithDefaultPlayer(filepath: string): Promise<void> {
  await invoke("open_file", { filepath });
}
