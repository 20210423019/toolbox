/**
 * UnifiedLogViewer — 统一日志查看器
 *
 * 整合控制台日志、清理日志、扫描记录三大功能。
 * 使用标签页切换，保留各自完整的筛选/搜索/分页能力。
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useAppStore } from "../store/appStore";
import { invoke, isTauri } from "../tauri-invoke";
import { notify } from "./Notification";
import type { LogEntry, LogLevel, ScanHistory } from "../types";
import { bg, border, accent, text, status, scrollbar } from "../theme/ethereal";

// ═══════════════════════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════════════════════

type TabKey = "console" | "cleanup" | "scan" | "errors";

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: "console", label: "控制台日志", icon: "📋" },
  { key: "errors", label: "报错", icon: "❌" },
  { key: "cleanup", label: "清理日志", icon: "🗑️" },
  { key: "scan", label: "扫描记录", icon: "🔍" },
];

const LEVEL_CONFIG: Record<LogLevel, { label: string; color: string; bg: string }> = {
  error: { label: "ERROR", color: status.error.color, bg: status.error.bg },
  warn: { label: "WARN", color: status.warning.color, bg: status.warning.bg },
  info: { label: "INFO", color: accent.primary, bg: accent.tint },
  debug: { label: "DEBUG", color: text.muted, bg: "rgba(255,255,255,0.04)" },
};

const SCAN_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: "已完成", color: status.success.color, bg: status.success.bg },
  cancelled: { label: "已取消", color: status.warning.color, bg: status.warning.bg },
  running: { label: "运行中", color: accent.primary, bg: accent.tint },
  error: { label: "出错", color: status.error.color, bg: status.error.bg },
};

const CLEANUP_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  cleaned: { label: "已清理", color: status.error.color, bg: status.error.bg },
  recovered: { label: "已恢复", color: status.success.color, bg: status.success.bg },
  skipped: { label: "已跳过", color: text.muted, bg: "rgba(122,155,181,0.08)" },
};

const SORT_OPTIONS: { key: SortCol; label: string }[] = [
  { key: "detected_at", label: "检测时间" },
  { key: "filename", label: "文件名" },
  { key: "format", label: "格式" },
  { key: "resolution", label: "分辨率" },
  { key: "size", label: "大小" },
  { key: "status", label: "状态" },
  { key: "cleaned_at", label: "清理时间" },
];

type SortCol = "detected_at" | "filename" | "size" | "status" | "cleaned_at" | "format" | "resolution";
type DatePreset = "today" | "week" | "month" | "all";
type ViewMode = "table" | "timeline";

const mono = "'Cascadia Code','JetBrains Mono','Fira Code',Consolas,monospace";

// ═══════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════

interface Props {
  onClose: () => void;
  libraryId?: string;
  initialTab?: TabKey;
}

// ═══════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════

function fmtSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtDuration(ms: number): string {
  if (ms >= 3600000) return `${(ms / 3600000).toFixed(1)}h`;
  if (ms >= 60000) return `${(ms / 60000).toFixed(0)}m ${((ms % 60000) / 1000).toFixed(0)}s`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return iso.slice(11, 19);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (preset === "today") return { from: to, to };
  if (preset === "week") {
    const from = new Date(now);
    from.setDate(from.getDate() - from.getDay());
    return { from: from.toISOString().slice(0, 10), to };
  }
  if (preset === "month") {
    const from = new Date(now);
    from.setDate(1);
    return { from: from.toISOString().slice(0, 10), to };
  }
  return { from: "2025-01-01", to };
}

function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  if (current > 3) pages.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push("...");
  if (total > 1) pages.push(total);
  return pages;
}

// ═══════════════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════════════

export default function UnifiedLogViewer({ onClose, libraryId, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab || "console");

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: 960, maxWidth: "98vw", height: "85vh", maxHeight: 780,
          background: bg.elevated, border: `1px solid ${border.default}`,
          borderRadius: 12, overflow: "hidden",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(96,165,250,0.04)",
        }}
      >
        {/* ── 顶栏：标题 + 标签页 ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "0 16px", borderBottom: `1px solid ${border.divider}`,
          background: bg.sidebar, flexShrink: 0, height: 40,
        }}>
          <span style={{ fontSize: 16, marginRight: 8 }}>📊</span>
          <span style={{ fontSize: 13, fontWeight: 700, marginRight: 16 }}>
            日志中心
          </span>
          <div style={{ display: "flex", gap: 2, flex: 1 }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: "6px 12px", borderRadius: "6px 6px 0 0",
                    fontSize: 10, fontWeight: 600, cursor: "pointer",
                    border: "none",
                    background: isActive ? bg.elevated : "transparent",
                    color: isActive ? text.primary : text.muted,
                    position: "relative", transition: "all 0.12s",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  <span style={{ marginRight: 4 }}>{tab.icon}</span>
                  {tab.label}
                  {isActive && (
                    <div style={{
                      position: "absolute", bottom: 0, left: 4, right: 4,
                      height: 2, background: accent.primary, borderRadius: "2px 2px 0 0",
                    }} />
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center",
              justifyContent: "center", background: "none", border: "none",
              color: text.muted, cursor: "pointer", borderRadius: 6, fontSize: 13,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = bg.hover; e.currentTarget.style.color = text.primary; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = text.muted; }}
          >
            ✕
          </button>
        </div>

        {/* ── Tab 内容 ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {activeTab === "console" && <ConsoleLogTab onClose={onClose} />}
          {activeTab === "errors" && <ErrorLogTab />}
          {activeTab === "cleanup" && <CleanupLogTab libraryId={libraryId} />}
          {activeTab === "scan" && <ScanHistoryTab libraryId={libraryId} />}
        </div>
      </div>

      <style>{`
        .log-row-wrapper:hover .log-copy-btn { opacity: 1 !important; }
        .row-action-icon { opacity: 0 !important; }
        tr:hover .row-action-icon { opacity: 1 !important; }
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 1: 控制台日志
// ═══════════════════════════════════════════════════════════

function ConsoleLogTab({ onClose }: { onClose: () => void }) {
  const appLogs = useAppStore((s) => s.appLogs);
  const clearAppLogs = useAppStore((s) => s.clearAppLogs);

  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredLogs = useMemo(() => {
    return appLogs.filter((l) => {
      if (filter !== "all" && l.level !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q);
      }
      return true;
    });
  }, [appLogs, filter, search]);

  useEffect(() => {
    if (autoScroll && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [filteredLogs.length, autoScroll]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: appLogs.length };
    for (const l of appLogs) c[l.level] = (c[l.level] || 0) + 1;
    return c;
  }, [appLogs]);

  const handleExport = useCallback(async () => {
    try {
      const json = JSON.stringify(appLogs, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      if (isTauri()) {
        await invoke("write_text_file", { path: `export-logs-${ts}.json`, content: json });
        notify({ type: "success", title: "日志已导出", message: `export-logs-${ts}.json` });
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `logs-${ts}.json`; a.click();
        URL.revokeObjectURL(url);
        notify({ type: "success", title: "日志已导出" });
      }
    } catch { notify({ type: "error", title: "导出失败" }); }
  }, [appLogs]);

  const levelChips: (LogLevel | "all")[] = ["all", "error", "warn", "info", "debug"];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "6px 10px", borderBottom: `1px solid ${border.divider}`,
        background: bg.surface, flexWrap: "wrap", flexShrink: 0,
      }}>
        {levelChips.map((lvl) => {
          const isActive = filter === lvl;
          const cfg = lvl === "all" ? null : LEVEL_CONFIG[lvl];
          return (
            <button key={lvl} onClick={() => setFilter(lvl)}
              style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 8, fontWeight: 600,
                border: `1px solid ${isActive ? (cfg?.color || accent.deep) : border.default}`,
                background: isActive ? (cfg?.bg || accent.tintMid) : "transparent",
                color: isActive ? (cfg?.color || accent.deep) : text.muted,
                cursor: "pointer", transition: "all 0.12s",
              }}
            >{lvl === "all" ? "全部" : cfg?.label || lvl} ({counts[lvl] || 0})</button>
          );
        })}
        <div style={{ flex: 1 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索日志..."
          style={{
            width: 120, background: bg.input,
            border: `1px solid ${border.default}`, borderRadius: 4,
            padding: "2px 6px", fontSize: 9, color: text.primary, outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = accent.deep; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = border.default; }}
        />
        <button onClick={() => setAutoScroll(!autoScroll)}
          style={{
            padding: "2px 6px", borderRadius: 4, fontSize: 8,
            border: `1px solid ${autoScroll ? accent.deep : border.default}`,
            background: autoScroll ? accent.tint : "transparent",
            color: autoScroll ? accent.deep : text.muted, cursor: "pointer",
          }}
        >{autoScroll ? "⬇ 自动滚动" : "⬇ 暂停"}</button>
        <button onClick={() => clearAppLogs()}
          style={{
            padding: "2px 6px", borderRadius: 4, fontSize: 8,
            border: `1px solid ${border.default}`, background: "transparent",
            color: text.muted, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = status.error.color; e.currentTarget.style.borderColor = status.error.color; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = text.muted; e.currentTarget.style.borderColor = border.default; }}
        >🗑 清空</button>
        <button onClick={() => {
          const text = filteredLogs.map((l) => {
            const cfg = LEVEL_CONFIG[l.level];
            const ts = new Date(l.timestamp);
            const time = `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}:${String(ts.getSeconds()).padStart(2,"0")}`;
            return `[${cfg.label}] ${time} [${l.source}] ${l.message}${l.count > 1 ? ` (x${l.count})` : ""}`;
          }).join("\n");
          navigator.clipboard.writeText(text);
        }}
          style={{
            padding: "2px 6px", borderRadius: 4, fontSize: 8,
            border: `1px solid ${border.default}`, background: "transparent",
            color: text.muted, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = accent.primary; e.currentTarget.style.borderColor = accent.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = text.muted; e.currentTarget.style.borderColor = border.default; }}
        >📋 复制全部</button>
        <button onClick={handleExport}
          style={{
            padding: "2px 6px", borderRadius: 4, fontSize: 8,
            border: `1px solid ${border.default}`, background: "transparent",
            color: text.muted, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = accent.primary; e.currentTarget.style.borderColor = accent.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = text.muted; e.currentTarget.style.borderColor = border.default; }}
        >📥 导出</button>
      </div>

      {/* Log list */}
      <div ref={listRef}
        style={{
          flex: 1, overflow: "auto", padding: "4px 0",
          fontFamily: mono, fontSize: 9, lineHeight: 1.7, background: "#060a16",
        }}
      >
        {filteredLogs.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", color: text.muted, fontSize: 10, gap: 4,
          }}>
            <span style={{ fontSize: 20, opacity: 0.2 }}>📝</span>
            {search ? "没有匹配的日志" : "暂无日志"}
          </div>
        ) : (
          filteredLogs.map((log) => {
            const cfg = LEVEL_CONFIG[log.level];
            const ts = new Date(log.timestamp);
            const time = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}.${String(ts.getMilliseconds()).padStart(3, "0")}`;
            return (
              <div key={log.id} className="log-row-wrapper"
                style={{
                  display: "flex", alignItems: "flex-start", gap: 6,
                  padding: "2px 10px", cursor: "default",
                  borderBottom: `1px solid rgba(255,255,255,0.02)`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                title={log.stack || undefined}
              >
                <span style={{
                  width: 36, fontSize: 7, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "0.05em", color: cfg.color, flexShrink: 0, paddingTop: 1,
                }}>{cfg.label}</span>
                <span style={{ color: text.placeholder, flexShrink: 0, width: 84, fontSize: 8 }}>{time}</span>
                <span style={{
                  color: text.tertiary, flexShrink: 0, width: 60,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{log.source}</span>
                <span style={{
                  flex: 1, color: log.level === "error" ? status.error.color : text.secondary,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{log.message}</span>
                {log.count > 1 && (
                  <span style={{
                    fontSize: 7, padding: "0 4px", borderRadius: 3,
                    border: `1px solid ${border.default}`, background: bg.surface,
                    color: cfg.color, flexShrink: 0, lineHeight: "14px",
                  }}>x{log.count}</span>
                )}
                <span onClick={() => {
                  const text = `[${cfg.label}] ${time} [${log.source}] ${log.message}${log.stack ? "\n" + log.stack : ""}`;
                  navigator.clipboard.writeText(text);
                }}
                  style={{
                    fontSize: 7, padding: "0 4px", borderRadius: 2, cursor: "pointer",
                    color: text.tertiary, flexShrink: 0, opacity: 0, transition: "opacity 0.12s",
                    lineHeight: "16px",
                  }}
                  className="log-copy-btn" title="复制此行日志"
                >📋</span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 10px", borderTop: `1px solid ${border.divider}`,
        background: bg.surface, fontSize: 8, color: text.tertiary,
      }}>
        <span>显示 {filteredLogs.length} / {appLogs.length} 条</span>
        <span>·</span>
        <span>环缓冲 {appLogs.length}/500</span>
        <span>·</span>
        <span style={{ cursor: "pointer", color: accent.primary }} onClick={() => setFilter("all")}>清除筛选</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 2: 报错标签
// ═══════════════════════════════════════════════════════════

function ErrorLogTab() {
  const appLogs = useAppStore((s) => s.appLogs);
  const clearAppLogs = useAppStore((s) => s.clearAppLogs);

  // 仅取 error 级别的日志（依赖外部注入：consoleCapture 拦截 console.error 注入 appLogs）
  const errorLogs = useMemo(() => appLogs.filter(l => l.level === "error"), [appLogs]);

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"time" | "source">("time");

  const filtered = useMemo(() => {
    if (!search) return errorLogs;
    const q = search.toLowerCase();
    return errorLogs.filter(l =>
      l.message.toLowerCase().includes(q) ||
      l.source.toLowerCase().includes(q) ||
      (l.stack && l.stack.toLowerCase().includes(q))
    );
  }, [errorLogs, search]);

  // 按时间分组
  const grouped: [string, { label: string; items: LogEntry[] }][] = useMemo(() => {
    if (groupBy === "source") {
      const map: Record<string, LogEntry[]> = {};
      for (const e of filtered) {
        const src = e.source || "unknown";
        (map[src] = map[src] || []).push(e);
      }
      return Object.entries(map).map(([key, items]) => [key, { label: "", items }]);
    }
    // 按时间分组：今天 / 最近7天 / 更早
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);
    const groups: Record<string, { label: string; items: LogEntry[] }> = {
      today: { label: "今天", items: [] },
      week: { label: "最近7天", items: [] },
      older: { label: "更早", items: [] },
    };
    for (const e of filtered) {
      const d = e.timestamp.slice(0, 10);
      if (d === todayStr) groups.today.items.push(e);
      else if (d >= weekAgoStr) groups.week.items.push(e);
      else groups.older.items.push(e);
    }
    return Object.entries(groups).filter(([, g]) => g.items.length > 0);
  }, [filtered, groupBy]);

  const handleCopyAll = useCallback(() => {
    const text = filtered.map(e => {
      const ts = new Date(e.timestamp);
      const time = `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}:${String(ts.getSeconds()).padStart(2,"0")}`;
      let msg = `[ERROR] ${time} [${e.source}] ${e.message}`;
      if (e.stack) msg += `\n${e.stack}`;
      return msg;
    }).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
  }, [filtered]);

  const handleExport = useCallback(async () => {
    try {
      const data = filtered.map(e => ({
        level: "error", source: e.source, message: e.message,
        stack: e.stack, timestamp: e.timestamp, count: e.count,
      }));
      const json = JSON.stringify(data, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      if (isTauri()) {
        await invoke("write_text_file", { path: `errors-${ts}.json`, content: json });
      } else {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `errors-${ts}.json`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* silent */ }
  }, [filtered]);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* 统计横幅 */}
      <div style={{
        display: "flex", gap: 0, padding: "8px 16px",
        borderBottom: `1px solid ${border.divider}`, background: bg.base, flexShrink: 0,
      }}>
        {[
          { label: "错误总数", value: errorLogs.length, color: status.error.color },
          { label: "显示", value: filtered.length, color: text.primary },
          { label: "堆栈详情", value: errorLogs.filter(e => e.stack).length, color: accent.primary },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", position: "relative", padding: "0 8px" }}>
            {i > 0 && <div style={{
              position: "absolute", left: 0, top: "10%", height: "80%",
              width: 1, background: border.divider,
            }} />}
            <div style={{
              fontSize: 22, fontWeight: 700, fontFamily: mono,
              letterSpacing: "-0.03em", lineHeight: 1.2, color: s.color,
            }}>{s.value}</div>
            <div style={{ fontSize: 8, color: text.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* 操作栏 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "6px 10px", borderBottom: `1px solid ${border.divider}`,
        background: "rgba(251,113,133,0.04)", flexWrap: "wrap", flexShrink: 0,
      }}>
        <div style={{
          display: "flex", gap: 2, background: bg.input,
          borderRadius: 4, padding: 2,
        }}>
          <button onClick={() => setGroupBy("time")}
            style={{
              padding: "3px 8px", borderRadius: 3, fontSize: 9, fontWeight: 600,
              border: "none", background: groupBy === "time" ? bg.elevated : "transparent",
              color: groupBy === "time" ? text.primary : text.placeholder,
              cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
            }}
          >⏱ 按时间</button>
          <button onClick={() => setGroupBy("source")}
            style={{
              padding: "3px 8px", borderRadius: 3, fontSize: 9, fontWeight: 600,
              border: "none", background: groupBy === "source" ? bg.elevated : "transparent",
              color: groupBy === "source" ? text.primary : text.placeholder,
              cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
            }}
          >📡 按来源</button>
        </div>
        <div style={{ width: 1, height: 14, background: border.divider, flexShrink: 0 }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索错误消息或堆栈..."
          style={{
            width: 140, background: bg.input,
            border: `1px solid ${border.default}`, borderRadius: 4,
            padding: "2px 6px", fontSize: 9, color: text.primary, outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = status.error.color; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = border.default; }}
        />
        <div style={{ flex: 1 }} />
        <button onClick={handleCopyAll}
          style={{
            padding: "2px 6px", borderRadius: 4, fontSize: 8,
            border: `1px solid ${border.default}`, background: "transparent",
            color: text.muted, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = accent.primary; e.currentTarget.style.borderColor = accent.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = text.muted; e.currentTarget.style.borderColor = border.default; }}
        >📋 复制全部</button>
        <button onClick={handleExport}
          style={{
            padding: "2px 6px", borderRadius: 4, fontSize: 8,
            border: `1px solid ${border.default}`, background: "transparent",
            color: text.muted, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = accent.primary; e.currentTarget.style.borderColor = accent.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = text.muted; e.currentTarget.style.borderColor = border.default; }}
        >📥 导出</button>
        <button onClick={() => clearAppLogs()}
          style={{
            padding: "2px 6px", borderRadius: 4, fontSize: 8,
            border: `1px solid ${border.default}`, background: "transparent",
            color: text.muted, cursor: "pointer",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = status.error.color; e.currentTarget.style.borderColor = status.error.color; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = text.muted; e.currentTarget.style.borderColor = border.default; }}
        >🗑 清空</button>
      </div>

      {/* 错误列表 — 按分组展示 */}
      <div style={{ flex: 1, overflowY: "auto", background: "#060a16" }}>
        {errorLogs.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 6, color: text.placeholder, fontSize: 10,
          }}>
            <span style={{ fontSize: 32, opacity: 0.2 }}>✅</span>
            <span>暂无错误，一切正常</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 6, color: text.placeholder, fontSize: 10,
          }}>
            <span style={{ fontSize: 28, opacity: 0.25 }}>🔍</span>
            没有匹配的错误
          </div>
        ) : (
          grouped.map(([groupKey, group]) => (
            <div key={groupKey}>
              {/* 分组标题 */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 14px", background: bg.header,
                borderBottom: `1px solid ${border.divider}`,
                position: "sticky", top: 0, zIndex: 1,
              }}>
                <span style={{
                  fontSize: 8, fontWeight: 700, color: text.muted,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>
                  {groupBy === "source"
                    ? `来源: ${groupKey === "" ? "unknown" : groupKey}`
                    : group.label}
                </span>
                <span style={{ fontSize: 8, color: text.placeholder }}>({group.items.length})</span>
                <div style={{ flex: 1, height: 0, borderTop: `1px solid ${border.divider}` }} />
                <button onClick={() => {
                  const text = group.items.map(e => {
                    const ts = new Date(e.timestamp);
                    const time = `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}:${String(ts.getSeconds()).padStart(2,"0")}`;
                    return `[ERROR] ${time} [${e.source}] ${e.message}${e.stack ? `\n${e.stack}` : ""}`;
                  }).join("\n\n---\n\n");
                  navigator.clipboard.writeText(text);
                }}
                  style={{
                    fontSize: 8, padding: "1px 6px", borderRadius: 3,
                    background: "transparent", border: `1px solid ${border.default}`,
                    color: text.placeholder, cursor: "pointer",
                  }}
                >📋 复制组</button>
              </div>
              {/* 错误条目 */}
              {group.items.map((entry) => {
                const ts = new Date(entry.timestamp);
                const time = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;
                const isExpanded = expandedId === entry.id;
                return (
                  <div key={entry.id} style={{
                    borderBottom: `1px solid rgba(251,113,133,0.06)`,
                  }}>
                    {/* 错误摘要行 */}
                    <div
                      onClick={() => entry.stack && toggleExpand(entry.id)}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 6,
                        padding: "4px 14px", cursor: entry.stack ? "pointer" : "default",
                        background: isExpanded ? "rgba(251,113,133,0.03)" : "transparent",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "rgba(251,113,133,0.02)"; }}
                      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{
                        width: 10, flexShrink: 0, fontSize: 7, color: status.error.color, paddingTop: 2,
                      }}>✕</span>
                      <span style={{
                        fontFamily: mono, fontSize: 8, color: text.placeholder, flexShrink: 0,
                        width: 60, paddingTop: 1,
                      }}>{time}</span>
                      <span style={{
                        fontSize: 8, color: text.tertiary, flexShrink: 0, width: 60,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        paddingTop: 1,
                      }}>{entry.source}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          fontSize: 9, color: status.error.color,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          display: "block",
                        }}>{entry.message}</span>
                        {/* 如果未展开但包含堆栈，显示"...展开查看堆栈" */}
                        {entry.stack && !isExpanded && (
                          <span style={{
                            fontSize: 7, color: text.placeholder, marginTop: 1,
                            fontFamily: mono,
                          }}>展开查看堆栈 ▾</span>
                        )}
                      </div>
                      {entry.count > 1 && (
                        <span style={{
                          fontSize: 7, padding: "0 5px", borderRadius: 3,
                          border: `1px solid ${status.error.color}`,
                          background: status.error.bg, color: status.error.color,
                          flexShrink: 0, lineHeight: "16px",
                        }}>x{entry.count}</span>
                      )}
                      {entry.stack && (
                        <span style={{
                          fontSize: 8, color: text.placeholder, flexShrink: 0,
                          paddingTop: 1, transition: "transform 0.15s",
                          transform: isExpanded ? "rotate(90deg)" : "none",
                        }}>▶</span>
                      )}
                      <span onClick={(e) => {
                        e.stopPropagation();
                        const text = `[ERROR] ${time} [${entry.source}] ${entry.message}${entry.stack ? "\n" + entry.stack : ""}`;
                        navigator.clipboard.writeText(text);
                      }}
                        style={{
                          fontSize: 7, padding: "0 4px", borderRadius: 2, cursor: "pointer",
                          color: text.tertiary, flexShrink: 0, opacity: 0, transition: "opacity 0.12s",
                          lineHeight: "16px",
                        }}
                        className="log-copy-btn" title="复制此行错误"
                      >📋</span>
                    </div>
                    {/* 展开的堆栈追踪 */}
                    {isExpanded && entry.stack && (
                      <div style={{
                        padding: "6px 14px 6px 30px",
                        background: "rgba(251,113,133,0.02)",
                        borderTop: `1px solid rgba(251,113,133,0.06)`,
                      }}>
                        <div style={{
                          background: bg.input,
                          border: `1px solid ${status.error.color}30`,
                          borderRadius: 6, padding: 8, fontSize: 8,
                          fontFamily: mono, color: status.error.color,
                          whiteSpace: "pre-wrap", wordBreak: "break-all",
                          lineHeight: 1.6, maxHeight: 300, overflowY: "auto",
                        }}>
                          {entry.stack}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* 底部信息 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "4px 10px", borderTop: `1px solid ${border.divider}`,
        background: bg.surface, fontSize: 8, color: text.tertiary,
      }}>
        <span>显示 {filtered.length} / {errorLogs.length} 条错误</span>
        <span>·</span>
        <span>最高 500 条</span>
        <span>·</span>
        <span style={{ color: accent.primary, cursor: "pointer" }}
          onClick={() => { setSearch(""); setGroupBy("time"); }}
        >重置</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 3: 清理日志
// ═══════════════════════════════════════════════════════════

interface CleanupEntry {
  id: string; video_id: string; library_id: string;
  filename: string; filepath: string;
  size: number; duration: number;
  format: string; resolution: string; video_codec: string;
  status: string; reason: string;
  detected_at: string; cleaned_at: string | null;
  recovered_at: string | null; created_at: string;
}

interface PaginatedLogs {
  items: CleanupEntry[]; total: number;
  page: number; page_size: number; total_pages: number;
}

function CleanupLogTab({ libraryId: propLibraryId }: { libraryId?: string }) {
  const storeLibraryId = useAppStore((s) => s.currentLibraryId);
  const libraryId = propLibraryId || storeLibraryId || "";

  const [logs, setLogs] = useState<PaginatedLogs | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortCol>("detected_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("2025-01-01");
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<CleanupEntry | null>(null);

  const loadLogs = useCallback(async () => {
    if (!libraryId) return;
    try {
      const result = await invoke<PaginatedLogs>("get_cleanup_logs", {
        libraryId, page, pageSize, statusFilter, search, sortBy, sortDir,
      });
      setLogs(result);
    } catch { setLogs(null); }
  }, [libraryId, page, pageSize, statusFilter, search, sortBy, sortDir]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleRecover = async (entry: CleanupEntry) => {
    try {
      await invoke("recover_cleanup_entry", { logId: entry.id });
      console.info(`[cleanup] 恢复视频: ${entry.filename}`);
      notify({ type: "success", title: "已恢复", message: entry.filename });
      loadLogs(); setDetailEntry(null);
    } catch (e) {
      console.error(`[cleanup] 恢复失败: ${entry.filename}`, e);
      notify({ type: "error", title: "恢复失败", message: String(e) });
    }
  };
  const handlePurge = async (entry: CleanupEntry) => {
    try {
      await invoke("purge_cleanup_entry", { logId: entry.id });
      console.info(`[cleanup] 永久删除记录: ${entry.filename}`);
      notify({ type: "success", title: "已永久删除", message: entry.filename });
      loadLogs(); setDetailEntry(null);
    } catch (e) {
      console.error(`[cleanup] 删除失败: ${entry.filename}`, e);
      notify({ type: "error", title: "删除失败", message: String(e) });
    }
  };
  const handleSort = (col: SortCol) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
    setPage(1);
  };
  const applyDatePreset = (p: DatePreset) => {
    setDatePreset(p);
    const { from, to } = getDateRange(p);
    setDateFrom(from); setDateTo(to);
  };
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const selectAll = () => {
    if (!logs) return;
    if (selectedIds.size === logs.items.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(logs.items.map(l => l.id)));
  };

  const stats = useMemo(() => {
    if (!logs) return null;
    const items = logs.items;
    return {
      cleaned: items.filter(l => l.status === "cleaned").length,
      recovered: items.filter(l => l.status === "recovered").length,
      skipped: items.filter(l => l.status === "skipped").length,
      totalSize: items.reduce((s, l) => s + l.size, 0),
      total: logs.total,
    };
  }, [logs]);

  const selectedEntries = useMemo(() => logs?.items.filter(l => selectedIds.has(l.id)) || [], [logs, selectedIds]);

  if (!libraryId) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        flex: 1, color: text.placeholder, fontSize: 10, gap: 6,
      }}>
        <span style={{ fontSize: 24, opacity: 0.3 }}>📂</span>
        请先选择一个视频库
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", minHeight: 0 }}>
      {/* Stats */}
      <div style={{
        display: "flex", gap: 0, padding: "8px 16px",
        borderBottom: `1px solid ${border.divider}`, background: bg.base, flexShrink: 0,
      }}>
        {[
          { label: "已清理", value: stats?.cleaned || 0, color: status.error.color },
          { label: "已恢复", value: stats?.recovered || 0, color: status.success.color },
          { label: "已跳过", value: stats?.skipped || 0, color: accent.primary },
          { label: "释放空间", value: fmtSize(stats?.totalSize || 0), color: accent.light },
          { label: "总计", value: stats?.total || 0, color: text.muted },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", position: "relative", padding: "0 8px" }}>
            {i > 0 && <div style={{
              position: "absolute", left: 0, top: "10%", height: "80%",
              width: 1, background: border.divider,
            }} />}
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: mono, letterSpacing: "-0.03em", lineHeight: 1.2, color: s.color }}>
              {typeof s.value === "number" ? s.value : s.value}
            </div>
            <div style={{ fontSize: 8, color: text.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Batch bar */}
      {selectedEntries.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px", background: accent.tint,
          borderBottom: `1px solid ${border.accent}`, flexShrink: 0, fontSize: 9,
        }}>
          <span style={{ color: text.secondary }}>已选</span>
          <span style={{ color: accent.primary, fontWeight: 600 }}>{selectedEntries.length}</span>
          <span style={{ color: text.muted }}>条记录</span>
          <div style={{ width: 1, height: 14, background: border.accent, flexShrink: 0 }} />
          <button onClick={() => { selectedEntries.forEach(e => { if (e.status === "cleaned") handleRecover(e); }); }}
            style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 9,
              border: `1px solid ${border.default}`, background: "transparent",
              color: text.secondary, cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
          >↩️ 批量恢复</button>
          <button onClick={() => { selectedEntries.forEach(e => handlePurge(e)); }}
            style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 9,
              border: `1px solid ${status.error.color}`, background: "transparent",
              color: status.error.color, cursor: "pointer", fontFamily: "var(--font-sans)",
            }}
          >🗑 永久删除</button>
          <button onClick={() => setSelectedIds(new Set())}
            style={{
              marginLeft: "auto", width: 20, height: 20, display: "flex",
              alignItems: "center", justifyContent: "center",
              background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 11,
            }}
          >✕</button>
        </div>
      )}

      {/* Filter bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderBottom: `1px solid ${border.divider}`,
        background: bg.surface, flexWrap: "wrap", flexShrink: 0,
      }}>
        <div style={{ display: "flex", gap: 3 }}>
          {[{ key: "all", label: "全部", color: accent.deep }, { key: "cleaned", label: "已清理", color: status.error.color }, { key: "recovered", label: "已恢复", color: status.success.color }, { key: "skipped", label: "已跳过", color: text.muted }].map(f => (
            <button key={f.key} onClick={() => { setStatusFilter(f.key); setPage(1); }}
              style={{
                padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                border: `1px solid ${statusFilter === f.key ? f.color : border.default}`,
                background: statusFilter === f.key ? `${f.color}15` : "transparent",
                color: statusFilter === f.key ? f.color : text.muted,
                cursor: "pointer", transition: "all 0.12s", fontFamily: "var(--font-sans)",
              }}
            >{f.label}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 14, background: border.divider, flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 2 }}>
          {(["today", "week", "month", "all"] as DatePreset[]).map(p => (
            <button key={p} onClick={() => applyDatePreset(p)}
              style={{
                padding: "2px 6px", borderRadius: 3, fontSize: 8,
                border: datePreset === p ? `1px solid ${accent.primary}` : "1px solid transparent",
                background: datePreset === p ? accent.tint : "transparent",
                color: datePreset === p ? accent.primary : text.placeholder,
                cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s",
              }}
            >{{ today: "今天", week: "本周", month: "本月", all: "全部" }[p]}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <input type="text" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            placeholder="开始日期"
            style={{
              background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4,
              color: text.primary, fontSize: 9, padding: "2px 6px", fontFamily: mono,
              outline: "none", width: 85,
            }}
          />
          <span style={{ color: text.placeholder, fontSize: 8 }}>→</span>
          <input type="text" value={dateTo} onChange={e => setDateTo(e.target.value)}
            placeholder="结束日期"
            style={{
              background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4,
              color: text.primary, fontSize: 9, padding: "2px 6px", fontFamily: mono,
              outline: "none", width: 85,
            }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          display: "flex", gap: 2, background: bg.input,
          borderRadius: 4, padding: 2,
        }}>
          <button style={{
            padding: "3px 7px", borderRadius: 3, fontSize: 8,
            border: "none", background: viewMode === "table" ? bg.elevated : "transparent",
            color: viewMode === "table" ? text.primary : text.placeholder,
            cursor: "pointer", fontFamily: "var(--font-sans)",
          }} onClick={() => setViewMode("table")}>☰ 表格</button>
          <button style={{
            padding: "3px 7px", borderRadius: 3, fontSize: 8,
            border: "none", background: viewMode === "timeline" ? bg.elevated : "transparent",
            color: viewMode === "timeline" ? text.primary : text.placeholder,
            cursor: "pointer", fontFamily: "var(--font-sans)",
          }} onClick={() => setViewMode("timeline")}>◷ 时间线</button>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          background: bg.input, border: `1px solid ${border.default}`,
          borderRadius: 4, padding: "0 6px",
        }}>
          <span style={{ color: text.placeholder, fontSize: 10, flexShrink: 0 }}>🔍</span>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索文件名..."
            style={{
              background: "none", border: "none", color: text.primary,
              fontSize: 9, padding: "3px 4px", outline: "none", width: 110,
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", position: "relative", background: "#060a16" }}>
        {!logs ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            flex: 1, gap: 6, color: text.placeholder, fontSize: 10,
          }}>
            <span style={{ fontSize: 28, opacity: 0.25 }}>🗑️</span>
            加载中...
          </div>
        ) : logs.items.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", flex: 1, gap: 6, color: text.placeholder, fontSize: 10,
          }}>
            <span style={{ fontSize: 28, opacity: 0.25 }}>📋</span>
            {search ? "没有匹配的日志" : "暂无清理记录"}
          </div>
        ) : viewMode === "table" ? (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{
                  position: "sticky", top: 0, zIndex: 2, background: bg.header,
                  padding: "6px 8px", fontSize: 8, fontWeight: 600, color: text.muted,
                  textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em",
                  borderBottom: `1px solid ${border.divider}`, width: 32,
                }}>
                  <input type="checkbox"
                    checked={logs.items.length > 0 && selectedIds.size === logs.items.length}
                    onChange={selectAll}
                    style={{ width: 13, height: 13, accentColor: accent.primary, cursor: "pointer" }}
                  />
                </th>
                {["status", "filename", "size", "format", "resolution", "detected_at", "cleaned_at"].map(col => {
                  const sortOpt = SORT_OPTIONS.find(o => o.key === col);
                  const isActive = sortBy === col;
                  return (
                    <th key={col}
                      onClick={() => sortOpt && handleSort(col as SortCol)}
                      style={{
                        position: "sticky", top: 0, zIndex: 2, background: bg.header,
                        padding: "6px 8px", fontSize: 8, fontWeight: 600, color: text.muted,
                        textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em",
                        borderBottom: `1px solid ${border.divider}`, whiteSpace: "nowrap",
                        userSelect: "none", cursor: "pointer", transition: "color 0.12s",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                        {({ status: "状态", filename: "文件名", size: "大小", format: "格式", resolution: "分辨率", detected_at: "检测时间", cleaned_at: "清理/恢复" } as Record<string, string>)[col]}
                        {sortOpt && (
                          <span style={{
                            fontSize: 8, display: "inline-block",
                            transform: isActive && sortDir === "desc" ? "rotate(180deg)" : "none",
                            opacity: isActive ? 1 : 0.3, color: isActive ? accent.primary : text.muted,
                            transition: "transform 0.15s",
                          }}>▲</span>
                        )}
                      </span>
                    </th>
                  );
                })}
                <th style={{
                  position: "sticky", top: 0, zIndex: 2, background: bg.header,
                  padding: "6px 8px", fontSize: 8, fontWeight: 600, color: text.muted,
                  borderBottom: `1px solid ${border.divider}`, width: 50,
                }}></th>
              </tr>
            </thead>
            <tbody>
              {logs.items.map((entry) => {
                const c = CLEANUP_STATUS_CFG[entry.status] || CLEANUP_STATUS_CFG.skipped;
                const dt = entry.detected_at ? { dateFull: entry.detected_at, time: entry.detected_at.slice(11, 19) } : { dateFull: "—", time: "" };
                const ct = entry.cleaned_at ? { dateFull: entry.cleaned_at, time: entry.cleaned_at.slice(11, 19) } : { dateFull: "—", time: "" };
                const selected = selectedIds.has(entry.id);
                return (
                  <tr key={entry.id}
                    onClick={() => setDetailEntry(entry)}
                    style={{ cursor: "pointer", background: selected ? "rgba(96,165,250,0.06)" : undefined }}
                    onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "rgba(96,165,250,0.03)"; }}
                    onMouseLeave={e => { if (!selected) e.currentTarget.style.background = ""; }}
                  >
                    <td style={{ padding: "6px 8px", fontSize: 10, borderBottom: "1px solid rgba(255,255,255,0.02)", width: 32, textAlign: "center" }}
                      onClick={e => e.stopPropagation()}
                    >
                      <input type="checkbox" checked={selected} onChange={() => toggleSelect(entry.id)}
                        style={{ width: 13, height: 13, accentColor: accent.primary, cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 10, borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "1px 7px", borderRadius: 8, fontSize: 8, fontWeight: 600,
                        background: c.bg, color: c.color,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        {c.label}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 10, borderBottom: "1px solid rgba(255,255,255,0.02)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={entry.filename}
                    >{entry.filename}</td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", fontFamily: mono, fontSize: 9, color: text.muted, textAlign: "right" }}>
                      {fmtSize(entry.size)}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 10, borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                      <span style={{ padding: "0 5px", borderRadius: 2, fontSize: 7.5, background: "rgba(122,155,181,0.08)", color: text.muted }}>
                        {entry.format || "—"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", color: text.muted, fontSize: 9 }}>
                      {entry.resolution || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", fontFamily: mono, fontSize: 9 }}>
                      <span style={{ color: text.muted }}>{dt.dateFull}</span>{" "}
                      <span style={{ color: text.secondary, fontWeight: 500 }}>{dt.time}</span>
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", fontFamily: mono, fontSize: 9 }}>
                      {entry.cleaned_at ? (
                        <><span style={{ color: text.muted }}>{ct.dateFull}</span> <span style={{ color: text.secondary, fontWeight: 500 }}>{ct.time}</span></>
                      ) : (
                        <span style={{ color: text.placeholder }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 10, borderBottom: "1px solid rgba(255,255,255,0.02)", textAlign: "center" }}>
                      <span className="row-action-icon"
                        onClick={e => { e.stopPropagation(); setDetailEntry(entry); }}
                        style={{
                          fontSize: 11, cursor: "pointer", color: text.placeholder,
                          padding: 2, borderRadius: 3, display: "inline-flex",
                          alignItems: "center", justifyContent: "center",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = accent.tint; e.currentTarget.style.color = text.primary; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = text.placeholder; }}
                      >⋯</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          /* Timeline view */
          <div>
            {Object.entries(
              logs.items.reduce((acc, l) => {
                const k = (l.cleaned_at || l.detected_at || "").slice(0, 10) || "unknown";
                (acc[k] = acc[k] || []).push(l);
                return acc;
              }, {} as Record<string, CleanupEntry[]>)
            ).sort(([a], [b]) => b.localeCompare(a)).map(([date, items]) => (
              <div key={date}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 14px", background: bg.header,
                  borderBottom: `1px solid ${border.divider}`,
                  position: "sticky", top: 0, zIndex: 1, backdropFilter: "blur(8px)",
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: text.primary }}>{date}</span>
                  <span style={{ fontSize: 8, color: text.placeholder }}>{items.length} 条</span>
                  <div style={{ flex: 1, height: 0, borderTop: `1px solid ${border.divider}` }} />
                </div>
                {items.map((entry, idx) => {
                  const c = CLEANUP_STATUS_CFG[entry.status] || CLEANUP_STATUS_CFG.skipped;
                  const ts = entry.cleaned_at || entry.detected_at || "";
                  const icon = entry.status === "recovered" ? "↩️" : "🎬";
                  const isLast = idx === items.length - 1;
                  return (
                    <div key={entry.id}
                      onClick={() => setDetailEntry(entry)}
                      style={{
                        display: "flex", alignItems: "stretch", cursor: "pointer",
                        transition: "background 0.1s", borderBottom: "1px solid rgba(255,255,255,0.02)",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(96,165,250,0.03)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                    >
                      <div style={{
                        width: 40, flexShrink: 0, display: "flex",
                        flexDirection: "column", alignItems: "center", padding: "8px 0", position: "relative",
                      }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0, zIndex: 1,
                          background: c.color,
                          boxShadow: entry.status === "cleaned" ? "0 0 6px rgba(251,113,133,0.3)" : "none",
                        }} />
                        {!isLast && <div style={{ position: "absolute", top: 22, bottom: 0, width: 1, background: border.divider }} />}
                      </div>
                      <div style={{
                        flex: 1, display: "flex", alignItems: "center", gap: 8,
                        padding: "7px 12px 7px 8px", minWidth: 0,
                      }}>
                        <span style={{ width: 20, textAlign: "center", fontSize: 11, flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: text.primary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.filename}</div>
                          <div style={{ fontSize: 7.5, color: text.placeholder, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.filepath}</div>
                        </div>
                        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                          <span style={{
                            padding: "0 5px", borderRadius: 2, fontSize: 7.5, fontWeight: 500,
                            background: c.bg, color: c.color, display: "inline-flex", alignItems: "center", gap: 3,
                          }}>
                            <span style={{ width: 4, height: 4, borderRadius: "50%", background: c.color }} />
                            {c.label}
                          </span>
                          <span style={{ padding: "0 5px", borderRadius: 2, fontSize: 7.5, background: "rgba(122,155,181,0.08)", color: text.muted }}>
                            {fmtSize(entry.size)}
                          </span>
                        </div>
                        <div style={{
                          fontFamily: mono, fontSize: 9, color: text.muted, whiteSpace: "nowrap",
                          textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", gap: 1,
                        }}>
                          <span style={{ color: text.placeholder, fontSize: 8 }}>{ts.slice(0, 10)}</span>
                          <span style={{ color: text.secondary, fontSize: 9, fontWeight: 500 }}>{ts.slice(11, 19)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Detail panel */}
        {detailEntry && (
          <div style={{
            position: "absolute", top: 0, right: 0, bottom: 0, width: 380,
            background: bg.elevated, borderLeft: `1px solid ${border.default}`, zIndex: 20,
            display: "flex", flexDirection: "column",
            boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
            animation: "slideInRight 0.2s ease both",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderBottom: `1px solid ${border.divider}`, background: bg.sidebar,
            }}>
              <span style={{ fontSize: 16 }}>🎬</span>
              <span style={{ fontSize: 12, fontWeight: 700, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {detailEntry.filename}
              </span>
              <button onClick={() => setDetailEntry(null)}
                style={{
                  width: 22, height: 22, display: "flex", alignItems: "center",
                  justifyContent: "center", background: "none", border: "none",
                  color: text.muted, cursor: "pointer", borderRadius: 4, fontSize: 11,
                }}
              >✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {/* 文件信息 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 8, fontWeight: 700, color: text.placeholder,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${border.divider}`,
                }}>文件信息</div>
                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "2px 8px", fontSize: 10 }}>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>文件名</span>
                  <span style={{ color: text.secondary, padding: "2px 0", wordBreak: "break-all" }}>{detailEntry.filename}</span>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>原路径</span>
                  <code style={{ color: text.muted, fontSize: 9, wordBreak: "break-all", fontFamily: mono, padding: "2px 0" }}>{detailEntry.filepath}</code>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>大小</span>
                  <span style={{ color: text.secondary, padding: "2px 0" }}>{fmtSize(detailEntry.size)}</span>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>格式</span>
                  <span style={{ color: text.secondary, padding: "2px 0" }}>{detailEntry.format || "—"} {detailEntry.resolution ? "· " + detailEntry.resolution : ""}</span>
                </div>
              </div>
              {/* 清理状态 */}
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 8, fontWeight: 700, color: text.placeholder,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${border.divider}`,
                }}>清理状态</div>
                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "2px 8px", fontSize: 10 }}>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>状态</span>
                  <span style={{ padding: "2px 0" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "1px 7px", borderRadius: 8, fontSize: 8, fontWeight: 600,
                      background: CLEANUP_STATUS_CFG[detailEntry.status]?.bg || "",
                      color: CLEANUP_STATUS_CFG[detailEntry.status]?.color || text.muted,
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: CLEANUP_STATUS_CFG[detailEntry.status]?.color || text.muted }} />
                      {CLEANUP_STATUS_CFG[detailEntry.status]?.label || detailEntry.status}
                    </span>
                  </span>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>检测时间</span>
                  <span style={{ color: text.secondary, padding: "2px 0", fontFamily: mono, fontSize: 9 }}>{detailEntry.detected_at}</span>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>清理时间</span>
                  <span style={{ color: text.secondary, padding: "2px 0", fontFamily: mono, fontSize: 9 }}>{detailEntry.cleaned_at || "—"}</span>
                  <span style={{ color: text.placeholder, padding: "2px 0" }}>恢复时间</span>
                  <span style={{ color: text.secondary, padding: "2px 0", fontFamily: mono, fontSize: 9 }}>{detailEntry.recovered_at || "—"}</span>
                </div>
              </div>
              {/* 操作 */}
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {detailEntry.status === "cleaned" && (
                  <button onClick={() => handleRecover(detailEntry)}
                    style={{
                      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
                      gap: 4, padding: "5px 12px", borderRadius: 5, fontSize: 9, fontWeight: 500,
                      border: `1px solid ${status.success.color}`, background: status.success.bg,
                      color: status.success.color, cursor: "pointer", fontFamily: "var(--font-sans)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = status.success.color; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = status.success.bg; e.currentTarget.style.color = status.success.color; }}
                  >↩️ 恢复此记录</button>
                )}
                <button onClick={() => handlePurge(detailEntry)}
                  style={{
                    flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    gap: 4, padding: "5px 12px", borderRadius: 5, fontSize: 9, fontWeight: 500,
                    border: `1px solid ${status.error.color}`, background: "transparent",
                    color: status.error.color, cursor: "pointer", fontFamily: "var(--font-sans)",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = status.error.bg; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >🗑 永久删除</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {logs && logs.total > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 12px", borderTop: `1px solid ${border.divider}`,
          background: bg.surface, flexShrink: 0, fontSize: 9,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, color: text.muted }}>
            <span>共 <strong style={{ color: text.secondary, fontWeight: 600 }}>{logs.total}</strong> 条记录</span>
            <span>显示 <strong style={{ color: text.secondary, fontWeight: 600 }}>{(page - 1) * pageSize + 1}-{Math.min(page * pageSize, logs.total)}</strong></span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{
                background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4,
                color: text.secondary, fontSize: 9, padding: "3px 4px", outline: "none",
                cursor: "pointer", fontFamily: "var(--font-sans)",
              }}
            >
              <option value={20}>20 条/页</option>
              <option value={50}>50 条/页</option>
              <option value={100}>100 条/页</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button disabled={page <= 1} onClick={() => setPage(1)}
              style={{
                width: 24, height: 22, display: "flex", alignItems: "center",
                justifyContent: "center", border: `1px solid ${border.default}`,
                borderRadius: 4, background: "transparent",
                color: page <= 1 ? text.placeholder : text.muted,
                cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 10,
                fontFamily: "var(--font-sans)",
              }}
            >‹‹</button>
            <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{
                width: 24, height: 22, display: "flex", alignItems: "center",
                justifyContent: "center", border: `1px solid ${border.default}`,
                borderRadius: 4, background: "transparent",
                color: page <= 1 ? text.placeholder : text.muted,
                cursor: page <= 1 ? "not-allowed" : "pointer", fontSize: 10,
                fontFamily: "var(--font-sans)",
              }}
            >‹</button>
            {buildPageNumbers(page, logs.total_pages).map((p, i) =>
              p === "..." ? (
                <span key={`e-${i}`} style={{ color: text.placeholder, fontSize: 9, margin: "0 2px" }}>...</span>
              ) : (
                <button key={p} onClick={() => setPage(p as number)}
                  style={{
                    minWidth: 24, height: 22, display: "flex", alignItems: "center",
                    justifyContent: "center", border: p === page ? "none" : `1px solid ${border.default}`,
                    borderRadius: 4, background: p === page ? accent.deep : "transparent",
                    color: p === page ? "#fff" : text.muted, cursor: "pointer",
                    fontSize: 10, fontFamily: "var(--font-sans)", transition: "all 0.12s",
                  }}
                >{p}</button>
              )
            )}
            <button disabled={page >= logs.total_pages} onClick={() => setPage(p => Math.min(logs.total_pages, p + 1))}
              style={{
                width: 24, height: 22, display: "flex", alignItems: "center",
                justifyContent: "center", border: `1px solid ${border.default}`,
                borderRadius: 4, background: "transparent",
                color: page >= logs.total_pages ? text.placeholder : text.muted,
                cursor: page >= logs.total_pages ? "not-allowed" : "pointer", fontSize: 10,
                fontFamily: "var(--font-sans)",
              }}
            >›</button>
            <button disabled={page >= logs.total_pages} onClick={() => setPage(logs.total_pages)}
              style={{
                width: 24, height: 22, display: "flex", alignItems: "center",
                justifyContent: "center", border: `1px solid ${border.default}`,
                borderRadius: 4, background: "transparent",
                color: page >= logs.total_pages ? text.placeholder : text.muted,
                cursor: page >= logs.total_pages ? "not-allowed" : "pointer", fontSize: 10,
                fontFamily: "var(--font-sans)",
              }}
            >››</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Tab 3: 扫描记录
// ═══════════════════════════════════════════════════════════

function ScanHistoryTab({ libraryId: propLibraryId }: { libraryId?: string }) {
  const storeLibraryId = useAppStore((s) => s.currentLibraryId);
  const storeScanHistory = useAppStore((s) => s.scanHistory);
  const loadScanHistory = useAppStore((s) => s.loadScanHistory);
  const libraryId = propLibraryId || storeLibraryId || "";

  const [filter, setFilter] = useState<string>("all");
  const [detail, setDetail] = useState<ScanHistory | null>(null);

  useEffect(() => {
    if (libraryId) loadScanHistory(libraryId);
  }, [libraryId, loadScanHistory]);

  const filtered = useMemo(() => {
    return filter === "all" ? storeScanHistory : storeScanHistory.filter(h => h.status === filter);
  }, [storeScanHistory, filter]);

  const stats = useMemo(() => {
    return {
      total: storeScanHistory.length,
      completed: storeScanHistory.filter(h => h.status === "completed").length,
      cancelled: storeScanHistory.filter(h => h.status === "cancelled").length,
      error: storeScanHistory.filter(h => h.status === "error").length,
      running: storeScanHistory.filter(h => h.status === "running").length,
    };
  }, [storeScanHistory]);

  if (!libraryId) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        flex: 1, color: text.placeholder, fontSize: 10, gap: 6,
      }}>
        <span style={{ fontSize: 24, opacity: 0.3 }}>📂</span>
        请先选择一个视频库
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", minHeight: 0 }}>
      {/* Stats */}
      <div style={{
        display: "flex", gap: 0, padding: "8px 16px",
        borderBottom: `1px solid ${border.divider}`, background: bg.base, flexShrink: 0,
      }}>
        {[
          { label: "总次数", value: stats.total, color: text.primary },
          { label: "已完成", value: stats.completed, color: status.success.color },
          { label: "已取消", value: stats.cancelled, color: status.warning.color },
          { label: "出错", value: stats.error, color: status.error.color },
          { label: "运行中", value: stats.running, color: accent.primary },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", position: "relative", padding: "0 8px" }}>
            {i > 0 && <div style={{
              position: "absolute", left: 0, top: "10%", height: "80%",
              width: 1, background: border.divider,
            }} />}
            <div style={{
              fontSize: 20, fontWeight: 700, fontFamily: mono,
              letterSpacing: "-0.03em", lineHeight: 1.2, color: s.color,
            }}>{s.value}</div>
            <div style={{ fontSize: 8, color: text.muted, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", borderBottom: `1px solid ${border.divider}`,
        background: bg.surface, flexShrink: 0,
      }}>
        {[
          { key: "all", label: "全部" },
          { key: "completed", label: "已完成" },
          { key: "cancelled", label: "已取消" },
          { key: "error", label: "出错" },
          { key: "running", label: "运行中" },
        ].map(f => {
          const isActive = filter === f.key;
          const cfg = f.key === "all" ? null : SCAN_STATUS_CFG[f.key];
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                padding: "3px 9px", borderRadius: 4, fontSize: 9, fontWeight: 600,
                border: `1px solid ${isActive ? (cfg?.color || accent.deep) : border.default}`,
                background: isActive ? (cfg?.bg || accent.tintMid) : "transparent",
                color: isActive ? (cfg?.color || accent.deep) : text.muted,
                cursor: "pointer", transition: "all 0.12s", fontFamily: "var(--font-sans)",
              }}
            >
              {f.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button onClick={() => { if (libraryId) loadScanHistory(libraryId); }}
          style={{
            padding: "3px 8px", borderRadius: 4, fontSize: 9,
            border: `1px solid ${border.default}`, background: "transparent",
            color: text.muted, cursor: "pointer", fontFamily: "var(--font-sans)",
          }}
        >🔄 刷新</button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", background: "#060a16" }}>
        {storeScanHistory.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 6, color: text.placeholder, fontSize: 10,
          }}>
            <span style={{ fontSize: 28, opacity: 0.25 }}>🔍</span>
            暂无扫描记录
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", gap: 6, color: text.placeholder, fontSize: 10,
          }}>
            没有匹配的记录
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr>
                {[
                  { key: "status", label: "状态", width: 65 },
                  { key: "started", label: "开始时间", width: 130 },
                  { key: "completed", label: "完成时间", width: 130 },
                  { key: "duration", label: "耗时", width: 65 },
                  { key: "found", label: "文件总数", width: 60 },
                  { key: "new", label: "新增", width: 50 },
                  { key: "updated", label: "更新", width: 50 },
                  { key: "removed", label: "移除", width: 50 },
                  { key: "failed", label: "失败", width: 50 },
                  { key: "actions", label: "", width: 40 },
                ].map(col => (
                  <th key={col.key}
                    style={{
                      position: "sticky", top: 0, zIndex: 2, background: bg.header,
                      padding: "6px 8px", fontSize: 8, fontWeight: 600, color: text.muted,
                      textAlign: "left", textTransform: "uppercase", letterSpacing: "0.06em",
                      borderBottom: `1px solid ${border.divider}`,
                      whiteSpace: "nowrap", userSelect: "none", width: col.width,
                    }}
                  >{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => {
                const cfg = SCAN_STATUS_CFG[h.status] || { label: h.status, color: text.muted, bg: "rgba(122,155,181,0.08)" };
                return (
                  <tr key={h.id}
                    onClick={() => setDetail(h)}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(96,165,250,0.03)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                  >
                    <td style={{ padding: "6px 8px", fontSize: 10, borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 3,
                        padding: "1px 7px", borderRadius: 8, fontSize: 8, fontWeight: 600,
                        background: cfg.bg, color: cfg.color,
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", fontFamily: mono, fontSize: 9 }}>
                      <span style={{ color: text.muted }}>{fmtDate(h.started_at)}</span>{" "}
                      <span style={{ color: text.secondary, fontWeight: 500 }}>{fmtTs(h.started_at)}</span>
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", fontFamily: mono, fontSize: 9 }}>
                      {h.completed_at ? (
                        <><span style={{ color: text.muted }}>{fmtDate(h.completed_at)}</span> <span style={{ color: text.secondary, fontWeight: 500 }}>{fmtTs(h.completed_at)}</span></>
                      ) : (
                        <span style={{ color: text.placeholder }}>运行中...</span>
                      )}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", color: text.muted, fontFamily: mono, fontSize: 9 }}>
                      {fmtDuration(h.duration_ms)}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", color: text.secondary, fontFamily: mono, fontSize: 9 }}>
                      {h.total_files_found}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", color: status.success.color, fontFamily: mono, fontSize: 9 }}>
                      {h.new_files_added > 0 ? `+${h.new_files_added}` : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", color: accent.primary, fontFamily: mono, fontSize: 9 }}>
                      {h.files_updated > 0 ? h.files_updated : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", color: status.error.color, fontFamily: mono, fontSize: 9 }}>
                      {h.files_removed > 0 ? `-${h.files_removed}` : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,0.02)", color: status.error.color, fontFamily: mono, fontSize: 9 }}>
                      {h.failed_files > 0 ? h.failed_files : "—"}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 10, borderBottom: "1px solid rgba(255,255,255,0.02)", textAlign: "center" }}
                      onClick={e => e.stopPropagation()}
                    >
                      <span onClick={() => setDetail(h)}
                        style={{
                          fontSize: 11, cursor: "pointer", color: text.placeholder,
                          padding: 2, borderRadius: 3,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = accent.tint; e.currentTarget.style.color = text.primary; }}
                        onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = text.placeholder; }}
                      >⋯</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {detail && (
        <div style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 380,
          background: bg.elevated, borderLeft: `1px solid ${border.default}`, zIndex: 20,
          display: "flex", flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
          animation: "slideInRight 0.2s ease both",
        }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderBottom: `1px solid ${border.divider}`, background: bg.sidebar,
          }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
              扫描详情
            </span>
            <button onClick={() => setDetail(null)}
              style={{
                width: 22, height: 22, display: "flex", alignItems: "center",
                justifyContent: "center", background: "none", border: "none",
                color: text.muted, cursor: "pointer", borderRadius: 4, fontSize: 11,
              }}
            >✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
            {/* 基本信息 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 8, fontWeight: 700, color: text.placeholder,
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${border.divider}`,
              }}>基本信息</div>
              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "2px 8px", fontSize: 10 }}>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>状态</span>
                <span style={{ padding: "2px 0" }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "1px 7px", borderRadius: 8, fontSize: 8, fontWeight: 600,
                    background: (SCAN_STATUS_CFG[detail.status]?.bg) || "",
                    color: (SCAN_STATUS_CFG[detail.status]?.color) || text.muted,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: (SCAN_STATUS_CFG[detail.status]?.color) || text.muted }} />
                    {SCAN_STATUS_CFG[detail.status]?.label || detail.status}
                  </span>
                </span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>扫描类型</span>
                <span style={{ color: text.secondary, padding: "2px 0" }}>{detail.scan_type === "full" ? "全量扫描" : detail.scan_type}</span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>开始时间</span>
                <span style={{ color: text.secondary, padding: "2px 0", fontFamily: mono, fontSize: 9 }}>{detail.started_at}</span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>完成时间</span>
                <span style={{ color: text.secondary, padding: "2px 0", fontFamily: mono, fontSize: 9 }}>{detail.completed_at || "运行中..."}</span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>耗时</span>
                <span style={{ color: text.secondary, padding: "2px 0", fontFamily: mono, fontSize: 9 }}>{fmtDuration(detail.duration_ms)}</span>
              </div>
            </div>
            {/* 文件统计 */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 8, fontWeight: 700, color: text.placeholder,
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${border.divider}`,
              }}>文件统计</div>
              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "2px 8px", fontSize: 10 }}>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>文件总数</span>
                <span style={{ color: text.secondary, padding: "2px 0", fontWeight: 600 }}>{detail.total_files_found}</span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>新增视频</span>
                <span style={{ color: status.success.color, padding: "2px 0", fontWeight: 600 }}>+{detail.new_files_added}</span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>更新视频</span>
                <span style={{ color: accent.primary, padding: "2px 0", fontWeight: 600 }}>{detail.files_updated}</span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>移除视频</span>
                <span style={{ color: status.error.color, padding: "2px 0", fontWeight: 600 }}>-{detail.files_removed}</span>
                <span style={{ color: text.placeholder, padding: "2px 0" }}>失败文件</span>
                <span style={{ color: status.error.color, padding: "2px 0", fontWeight: 600 }}>{detail.failed_files}</span>
              </div>
            </div>
            {/* 错误信息 */}
            {detail.errors && detail.errors !== "[]" && detail.errors !== "" && (
              <div style={{ marginBottom: 14 }}>
                <div style={{
                  fontSize: 8, fontWeight: 700, color: text.placeholder,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${border.divider}`,
                }}>错误信息</div>
                <div style={{
                  background: bg.input, border: `1px solid ${status.error.color}`,
                  borderRadius: 6, padding: 8, fontSize: 9,
                  fontFamily: mono, color: status.error.color,
                  whiteSpace: "pre-wrap", wordBreak: "break-all",
                  maxHeight: 200, overflowY: "auto",
                }}>
                  {(() => {
                    try {
                      const errors = JSON.parse(detail.errors);
                      return Array.isArray(errors) ? errors.join("\n") : detail.errors;
                    } catch {
                      return detail.errors;
                    }
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
