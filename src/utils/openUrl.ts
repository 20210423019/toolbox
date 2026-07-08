import { invoke, isTauri } from "../tauri-invoke";
import { useAppStore } from "../store/appStore";

/**
 * 确保 URL 以协议开头，否则补上 https://
 */
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(trimmed)) return trimmed; // 其他已知协议
  return `https://${trimmed}`;
}

/**
 * 使用用户在全局设置中选择的浏览器打开 URL
 * 回退到 window.open (非 Tauri) 或系统默认浏览器
 */
export async function openUrl(url: string): Promise<void> {
  const normalized = normalizeUrl(url);

  if (!isTauri()) {
    window.open(normalized, "_blank");
    return;
  }
  const settings = useAppStore.getState().settings;
  const browserPath = settings?.browser_path || "";
  await invoke("open_url", { url: normalized, browserPath: browserPath || null }).catch(() => {
    window.open(normalized, "_blank");
  });
}
