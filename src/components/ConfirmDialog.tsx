/**
 * 自定义确认对话框 — 替代 window.confirm
 *
 * 使用示例：
 *   if (await showConfirm({ title: "删除分类", message: "确定删除？", danger: true })) {
 *     // 执行删除
 *   }
 */
import { useState, useEffect, useCallback } from "react";
import { bg, border, accent, text, status as statusColors } from "../theme/ethereal";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

let _resolve: ((value: boolean) => void) | null = null;
let _options: ConfirmOptions | null = null;
let _listeners: Set<() => void> = new Set();

export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  _options = opts;
  _listeners.forEach(fn => fn());
  return new Promise((resolve) => {
    _resolve = resolve;
  });
}

function notify() { _listeners.forEach(fn => fn()); }

function dismiss(value: boolean) {
  if (_resolve) {
    _resolve(value);
    _resolve = null;
    _options = null;
    notify();
  }
}

export function ConfirmDialog() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const fn = () => forceUpdate(n => n + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);

  const visible = _resolve !== null;
  const opts = _options;

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) dismiss(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") dismiss(false);
  }, []);

  if (!visible || !opts) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
      }}
      onClick={handleBackdrop}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        style={{
          background: bg.elevated, border: `1px solid ${opts.danger ? statusColors.error.color : border.accent}`,
          borderRadius: 12, padding: 0,
          width: 380, maxWidth: "90vw",
          boxShadow: `0 16px 64px rgba(0,0,0,0.5)`,
          overflow: "hidden",
        }}
      >
        {/* 标题 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "14px 16px 0",
          fontSize: 14, fontWeight: 600, color: text.primary,
        }}>
          {opts.danger ? "⚠️ " : "💬 "}
          {opts.title}
        </div>

        {/* 消息 */}
        <div style={{
          padding: "10px 16px 16px",
          fontSize: 12, color: text.secondary, lineHeight: 1.6,
        }}>
          {opts.message}
        </div>

        {/* 按钮 */}
        <div style={{
          display: "flex", gap: 8,
          padding: "12px 16px",
          borderTop: `1px solid ${border.divider}`,
          justifyContent: "flex-end",
        }}>
          <button
            onClick={() => dismiss(false)}
            style={{
              padding: "7px 16px", borderRadius: 6, fontSize: 11,
              border: `1px solid ${border.default}`,
              background: bg.surface, color: text.secondary,
              cursor: "pointer", fontFamily: "var(--font-sans)",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent.primary; (e.currentTarget as HTMLElement).style.color = accent.primary; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = border.default; (e.currentTarget as HTMLElement).style.color = text.secondary; }}
          >
            {opts.cancelText || "取消"}
          </button>
          <button
            onClick={() => dismiss(true)}
            style={{
              padding: "7px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: "none",
              background: opts.danger
                ? `linear-gradient(135deg, ${statusColors.error.color}, ${statusColors.error.color}cc)`
                : `linear-gradient(135deg, ${accent.primary}, ${accent.deep})`,
              color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)",
              transition: "opacity 0.12s",
              boxShadow: opts.danger ? `0 2px 8px ${statusColors.error.color}40` : `0 2px 8px ${accent.primary}40`,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.85"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            {opts.confirmText || (opts.danger ? "删除" : "确认")}
          </button>
        </div>
      </div>
    </div>
  );
}
