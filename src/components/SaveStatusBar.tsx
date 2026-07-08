import type { SaveStatus } from "../hooks/useAutoSave";
import { useTheme } from "../theme/useTheme";

const SPINNER_STYLE_ID = "save-statusbar-spinner";
function ensureSpinnerStyle() {
  if (document.getElementById(SPINNER_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = SPINNER_STYLE_ID;
  style.textContent = `@keyframes spinner { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

export default function SaveStatusBar({ status }: { status: SaveStatus }) {
  const { status: statusColors } = useTheme();
  ensureSpinnerStyle();

  const statusConfig: Record<SaveStatus, { label: string; color: string; bg: string }> = {
    idle: { label: "", color: "transparent", bg: "transparent" },
    unsaved: { label: "未保存的更改", color: statusColors.warning.color, bg: statusColors.warning.bg },
    saving: { label: "保存中...", color: statusColors.info.color, bg: statusColors.info.bg },
    saved: { label: "已保存", color: statusColors.success.color, bg: statusColors.success.bg },
    error: { label: "保存失败", color: statusColors.error.color, bg: statusColors.error.bg },
  };

  if (status === "idle") return null;
  const cfg = statusConfig[status];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 500,
        color: cfg.color,
        background: cfg.bg,
        transition: "all 0.2s ease",
      }}
    >
      {status === "saving" && <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid transparent", borderTopColor: cfg.color, borderRadius: "50%", animation: "spinner 0.6s linear infinite" }} />}
      {status === "error" && <span>✕</span>}
      {status === "saved" && <span>✓</span>}
      {cfg.label}
    </div>
  );
}
