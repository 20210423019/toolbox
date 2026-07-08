import { useState } from "react";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../theme/useTheme";

export default function Sidebar() {
  const openDialog = useAppStore(s => s.openDialog);
  const navigateTo = useAppStore(s => s.navigateTo);
  const { bg, border } = useTheme();
  const [hoveredSettings, setHoveredSettings] = useState(false);
  const [hoveredLogo, setHoveredLogo] = useState(false);

  const ORANGE = "#f59e0b";
  const ORANGE_DEEP = "#f97316";

  return (
    <div style={{
      height: 42, display: "flex", alignItems: "center",
      padding: "0 10px 0 14px", gap: 8,
      background: bg.sidebar,
      borderBottom: `1px solid ${border.default}`,
      flexShrink: 0, width: "100%",
      position: "relative" as const,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
        transition: "opacity 0.15s", opacity: hoveredLogo ? 0.8 : 1,
        padding: "4px 8px", borderRadius: 8,
      }}
        onClick={() => navigateTo("video-home", "视频管理")}
        onMouseEnter={() => setHoveredLogo(true)}
        onMouseLeave={() => setHoveredLogo(false)}
      >
        <div style={{
          width: 24, height: 24,
          background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})`,
          borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: "#fff", fontWeight: 800, flexShrink: 0,
          boxShadow: "0 1px 6px rgba(245,158,11,0.3)",
        }}>T</div>
        <span style={{
          fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.7)",
          letterSpacing: "-0.01em", flexShrink: 0,
        }}>视频工具箱</span>
      </div>
      <button
        style={{
          marginLeft: "auto",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 28, height: 28, borderRadius: 7,
          border: "none", background: "transparent",
          color: hoveredSettings ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)",
          fontSize: 11, cursor: "pointer",
          transition: "all 0.12s",
          ...(hoveredSettings ? { background: "rgba(255,255,255,0.06)" } : {}),
        }}
        onMouseEnter={() => setHoveredSettings(true)}
        onMouseLeave={() => setHoveredSettings(false)}
        onClick={() => openDialog("settings")}
        title="全局设置"
      >
        <span>⚙</span>
      </button>
    </div>
  );
}
