/**
 * 控制台日志捕获引擎
 *
 * 拦截 console.log/warn/error/info/debug，实现：
 * - 环缓冲 500 条，自动去重合并
 * - Throttle 批量转发到 Rust 后端
 * - 自动推断调用来源
 * - 截取 error stack 前 5 行
 */

import { invoke, isTauri } from "../tauri-invoke";
import { useAppStore } from "../store/appStore";
import type { LogEntry, LogLevel } from "../types";

const MAX_LOGS = 500;
const DEDUP_WINDOW_MS = 5000;
const FLUSH_THROTTLE_MS = 200;

let flushQueue: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// 保存原始 console 引用
const origConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

/** 从 Error.stack 推断调用来源 */
function getCallerSource(): string {
  try {
    const err = new Error();
    const lines = err.stack?.split("\n") || [];
    // line[0]: "Error"
    // line[1]: "    at getCallerSource (...)"
    // line[2]: "    at capture (...)"
    // line[3]: actual caller
    const caller = lines[3] || lines[2] || "";
    const match = caller.match(/src\/([\w/]+)\.\w+:\d+:\d+/);
    if (match) return match[1];
    // fallback: extract from path
    const simple = caller.match(/([\w-]+)\.\w+:\d+:\d+/);
    return simple ? simple[1] : "unknown";
  } catch {
    return "unknown";
  }
}

/** 从 args 中提取 Error 堆栈（仅前5行） */
function extractStack(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (arg instanceof Error && arg.stack) {
      return arg.stack.split("\n").slice(0, 5).join("\n");
    }
  }
  return undefined;
}

/** 格式化 args 为字符串 */
function fmtArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `Error: ${a.message}`;
      if (a === null) return "null";
      if (a === undefined) return "undefined";
      if (typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

/** 去重合并检查 */
function shouldDedup(prev: LogEntry | undefined, level: LogLevel, message: string): boolean {
  if (!prev) return false;
  if (prev.level !== level || prev.message !== message) return false;
  const elapsed = Date.now() - new Date(prev.timestamp).getTime();
  return elapsed < DEDUP_WINDOW_MS;
}

/** 发送日志批次到后端 */
function flushToBackend() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const batch = flushQueue.splice(0, flushQueue.length);
    if (batch.length === 0 || !isTauri()) return;
    try {
      await invoke("forward_frontend_logs", { logs: batch });
    } catch {
      // 静默失败
    }
  }, FLUSH_THROTTLE_MS);
}

/** 捕获核心 */
function capture(level: LogLevel, args: unknown[]) {
  const message = fmtArgs(args);
  const source = getCallerSource();

  const store = useAppStore.getState();
  const prev = store.appLogs[0];

  // 去重合并
  if (shouldDedup(prev, level, message)) {
    useAppStore.setState({
      appLogs: [{ ...prev, count: prev.count + 1 }, ...store.appLogs.slice(1)],
    });
    return;
  }

  const entry: LogEntry = {
    id: crypto.randomUUID(),
    level,
    message,
    source,
    stack: level === "error" ? extractStack(args) : undefined,
    timestamp: new Date().toISOString(),
    count: 1,
  };

  // 排队转发到后端
  flushQueue.push(entry);
  flushToBackend();

  // 推入环缓冲
  useAppStore.setState({
    appLogs: [entry, ...store.appLogs].slice(0, MAX_LOGS),
  });
}

// ─── 公共 API ───

export function initConsoleCapture() {
  if (typeof window === "undefined") return;

  console.log = (...args) => {
    capture("info", args);
    origConsole.log(...args);
  };

  console.warn = (...args) => {
    capture("warn", args);
    origConsole.warn(...args);
  };

  console.error = (...args) => {
    capture("error", args);
    origConsole.error(...args);
  };

  console.info = (...args) => {
    capture("info", args);
    origConsole.info(...args);
  };

  console.debug = (...args) => {
    capture("debug", args);
    origConsole.debug(...args);
  };

  console.log("[consoleCapture] 日志捕获已启动");
}
