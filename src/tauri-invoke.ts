import { handleMock } from "./mock/data";

let _realInvoke: (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null = null;
let _mockMode = false;

/** 检测 Tauri IPC bridge 是否存在 */
function detectTauriBridge(): boolean {
  return typeof window !== "undefined" && (
    "__TAURI_IPC__" in window ||
    "__TAURI__" in window ||
    "__TAURI_INTERNALS__" in window ||
    "TAURI_IPC" in window ||
    /tauri/i.test(navigator.userAgent)
  );
}

export function isTauri(): boolean {
  if (_mockMode) return false;
  if (_realInvoke) return true;
  return detectTauriBridge();
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 快速路径：已确认 mock 模式
  if (_mockMode) {
    const result = handleMock<T>(cmd, args);
    return result !== null ? result as T : {} as T;
  }

  // 首次调用：检测环境并懒加载 real invoke
  if (!_realInvoke) {
    if (detectTauriBridge()) {
      try {
        const mod = await import("@tauri-apps/api/tauri");
        _realInvoke = mod.invoke;
      } catch {
        // 模块导入失败（极不可能），退回到 mock
        _mockMode = true;
      }
    } else {
      // 无 Tauri IPC bridge → 浏览器开发模式 → 走 mock
      _mockMode = true;
    }
  }

  if (_realInvoke) {
    // 真实 IPC 调用 — 不 catch 错误，让后端错误正常冒泡
    return _realInvoke(cmd, args);
  }

  // 降级到 mock 数据（仅在 _realInvoke 从未被设置时）
  const result = handleMock<T>(cmd, args);
  return result !== null ? result as T : {} as T;
}
