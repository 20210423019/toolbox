import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTheme } from "../theme/useTheme";

const MAX_VISIBLE = 2;
const DEFAULT_DURATION = 1200;
const NOTIF_STYLE_ID = "notification-slidein-style";

function ensureNotifStyle() {
  if (document.getElementById(NOTIF_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = NOTIF_STYLE_ID;
  style.textContent = `@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`;
  document.head.appendChild(style);
}

interface NotificationItem { id: string; type: "info" | "success" | "warning" | "error"; title: string; message?: string; duration?: number; }

let addNotif: (n: NotificationItem) => void = () => {};
let pendingNotifs: NotificationItem[] = [];
let notifReady = false;

export function notify(n: Omit<NotificationItem, "id"> & { onClick?: () => void }) {
  const item = { ...n, id: Math.random().toString(36).slice(2) };
  if (!notifReady) {
    pendingNotifs.push(item);
    return;
  }
  addNotif(item);
}

export default function NotificationContainer() {
  const { bg, border, text, status: statusColors } = useTheme();
  ensureNotifStyle();

  const typeStyles = useMemo(() => ({
    info: { bg: statusColors.info.bg, border: statusColors.info.color, icon: "ℹ", color: statusColors.info.color },
    success: { bg: statusColors.success.bg, border: statusColors.success.color, icon: "✓", color: statusColors.success.color },
    warning: { bg: statusColors.warning.bg, border: statusColors.warning.color, icon: "⚠", color: statusColors.warning.color },
    error: { bg: statusColors.error.bg, border: statusColors.error.color, icon: "✕", color: statusColors.error.color },
  }), [statusColors]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pausedId, setPausedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const removeNotif = useCallback((id: string) => {
    setNotifications(prev => prev.filter(x => x.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  addNotif = useCallback((n: NotificationItem) => {
    setNotifications(prev => {
      const next = [...prev, n];
      return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
    });
    const timer = setTimeout(() => {
      removeNotif(n.id);
      timersRef.current.delete(n.id);
    }, n.duration ?? DEFAULT_DURATION);
    timersRef.current.set(n.id, timer);
  }, [removeNotif]);

  // 挂载时标记就绪 + 刷新缓冲
  useEffect(() => {
    notifReady = true;
    if (pendingNotifs.length > 0) {
      const buffered = [...pendingNotifs];
      pendingNotifs = [];
      buffered.forEach(item => addNotif(item));
    }
  }, [addNotif]);

  const handleMouseEnter = useCallback((id: string) => {
    setPausedId(id);
    const timer = timersRef.current.get(id);
    if (timer) { clearTimeout(timer); timersRef.current.delete(id); }
  }, []);

  const handleMouseLeave = useCallback((id: string, duration?: number) => {
    setPausedId(null);
    const timer = setTimeout(() => {
      removeNotif(id);
      timersRef.current.delete(id);
    }, duration ?? DEFAULT_DURATION);
    timersRef.current.set(id, timer);
  }, [removeNotif]);

  const handleCopy = useCallback(async (id: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedId(id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1200);
    } catch {}
  }, []);

  return (
    <div style={{ position: "fixed", right: 14, bottom: 42, zIndex: 10000, display: "flex", flexDirection: "column-reverse", gap: 6, width: 280, pointerEvents: "none" }}>
      {notifications.map(n => {
        const ts = typeStyles[n.type];
        return (
          <div key={n.id} style={{ background: bg.elevated, border: `1px solid ${ts.border}`, borderRadius: 6, padding: "7px 10px", display: "flex", alignItems: "flex-start", gap: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", animation: "slideIn 0.16s ease", pointerEvents: "auto" }}
            onMouseEnter={() => handleMouseEnter(n.id)}
            onMouseLeave={() => handleMouseLeave(n.id, n.duration)}>
            <span style={{ color: ts.color, fontSize: 12, width: 18, textAlign: "center", flexShrink: 0, marginTop: 1 }}>{ts.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: text.primary }}>{n.title}</div>
              {n.message && (
                <div style={{ fontSize: 10, color: text.secondary, marginTop: 2, wordBreak: "break-all", lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 4 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>{n.message}</span>
                  <button
                    onClick={() => handleCopy(n.id, n.message!)}
                    title="复制内容"
                    style={{
                      background: "none", border: `1px solid ${border.default}`, borderRadius: 3,
                      color: copiedId === n.id ? statusColors.success.color : text.muted,
                      cursor: "pointer", fontSize: 9, padding: "1px 4px", flexShrink: 0,
                      transition: "all 0.15s ease", marginTop: 1,
                    }}
                  >
                    {copiedId === n.id ? "已复制" : "复制"}
                  </button>
                </div>
              )}
            </div>
            <button style={{ background: "none", border: "none", color: text.muted, cursor: "pointer", fontSize: 10, padding: 2, flexShrink: 0, marginTop: 1 }}
              onClick={() => removeNotif(n.id)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}
