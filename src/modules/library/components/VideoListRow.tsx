import React, { memo, useState, useRef, useMemo } from "react";
import type { Video } from "../../../types";
import { useTheme } from "../../../theme/useTheme";
import { openWithDefaultPlayer } from "../../../safe-tauri";
import { useClickDoubleClick } from "../../../hooks/useClickDoubleClick";

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const PALETTE = ["#1a1a2e","#16213e","#0f3460","#533483","#2d3436","#636e72","#6c5b7b","#355c7d","#3b3b98","#2c3e50"];
function hashId(id: string): number { let h = 0; for (let i = 0; i < id.length; i++) { h = ((h << 5) - h) + id.charCodeAt(i); h |= 0; } return Math.abs(h); }

const edgeGlow = (color: string): string => [
  `0 0 0 1px ${color}`,
  `10% 0 3px -0px ${color}99`, `25% 0 4px -0.5px ${color}77`, `40% 0 2px -0px ${color}aa`,
  `55% 0 5px -1px ${color}66`, `70% 0 3px -0px ${color}88`, `85% 0 4px -0.5px ${color}77`,
  `10% 100% 3px -0px ${color}99`, `25% 100% 4px -0.5px ${color}77`, `42% 100% 2px -0px ${color}aa`,
  `60% 100% 5px -1px ${color}66`, `78% 100% 3px -0px ${color}88`, `95% 100% 4px -0.5px ${color}77`,
  `0 10% 3px -0px ${color}99`, `0 28% 4px -0.5px ${color}77`, `0 45% 2px -0px ${color}aa`,
  `0 62% 5px -1px ${color}66`, `0 78% 3px -0px ${color}88`, `0 92% 4px -0.5px ${color}77`,
  `100% 10% 3px -0px ${color}99`, `100% 28% 4px -0.5px ${color}77`, `100% 45% 2px -0px ${color}aa`,
  `100% 62% 5px -1px ${color}66`, `100% 78% 3px -0px ${color}88`, `100% 92% 4px -0.5px ${color}77`,
  `0 0 16px -4px ${color}50`, `0 100% 16px -4px ${color}50`, `100% 0 16px -4px ${color}50`, `100% 100% 16px -4px ${color}50`,
].join(", ");

interface VideoListRowProps {
  video: Video; isHovered: boolean; isSelected: boolean; coverSrc: string; cardInfoFields: string[];
  onSelect: (id: string) => void; onDoubleClick: (v: Video) => void; onContextMenu: (e: React.MouseEvent, v: Video) => void;
  onHover: (id: string | null) => void;
}

const MemoVideoListRow = memo(function VideoListRow({ video, isHovered, isSelected, coverSrc, cardInfoFields, onSelect, onDoubleClick, onContextMenu, onHover }: VideoListRowProps) {
  const { bg, border, accent, text, status: statusColors } = useTheme();
  const [failed, setFailed] = useState(false);

  const PlaySvg = useMemo(() => ({ size = 28 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.55, height: size * 0.55, filter: "drop-shadow(0 0 6px rgba(125,211,252,0.5))" }}>
      <polygon points="6 3 20 12 6 21 6 3" fill="rgba(125,211,252,0.12)" stroke={accent.primary} />
    </svg>
  ), [accent.primary]);

  const fieldConfig = useMemo((): Record<string, { render: (v: Video) => React.ReactNode }> => ({
    size: { render: (v) => <span className="info-chip"><span className="ic-icon">💾</span><span className="ic-val">{(v.size / 1048576).toFixed(0)} MB</span></span> },
    date: { render: (v) => <span className="info-chip"><span className="ic-icon">📅</span><span className="ic-val">{v.added_at.slice(0, 10)}</span></span> },
    duration: { render: (v) => <span className="info-chip"><span className="ic-icon">⏱</span><span className="ic-val">{formatDuration(v.duration)}</span></span> },
    resolution: { render: (v) => v.width > 0 && v.height > 0 ? <span className="info-chip"><span className="ic-icon">🎬</span><span className="ic-val">{v.width}×{v.height}</span></span> : null },
    codec: { render: (v) => v.video_codec ? <span className="info-chip"><span className="ic-icon">📦</span><span className="ic-val">{v.video_codec}</span></span> : null },
    fps: { render: (v) => v.fps > 0 ? <span className="info-chip"><span className="ic-icon">⚡</span><span className="ic-val">{v.fps.toFixed(1)} fps</span></span> : null },
    bitrate: { render: (v) => v.bitrate > 0 ? <span className="info-chip"><span className="ic-icon">📡</span><span className="ic-val">{(v.bitrate / 1000).toFixed(0)} kbps</span></span> : null },
    favorite: { render: (v) => v.favorite ? <span className="info-chip"><span className="ic-icon">⭐</span><span className="ic-val" style={{ color: statusColors.warning.color }}>已收藏</span></span> : null },
    note: { render: (v) => v.note ? <span className="info-chip"><span className="ic-icon">📝</span><span className="ic-val">{v.note}</span></span> : null },
  }), [statusColors.warning.color]);

  const particleGlow = isHovered ? edgeGlow(accent.tintStrong) : undefined;
  const showCover = video.thumbnail_path && coverSrc && !failed;
  const colIdx = hashId(video.id) % PALETTE.length;
  const colA = PALETTE[colIdx];
  const colB = PALETTE[(colIdx + 1) % PALETTE.length];
  const [handleClick, handleDoubleClick] = useClickDoubleClick(
    () => onSelect(video.id),
    () => onDoubleClick(video),
  );

  return (
    <div className="list-bar"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
        background: bg.elevated, borderRadius: 6, cursor: "pointer", position: "relative" as const,
        border: `1px solid ${isHovered ? accent.tintStrong : border.default}`,
        transition: "border-color 0.25s, box-shadow 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s",
        boxShadow: particleGlow || "none",
        ...(isHovered ? { background: bg.surface } : {}),
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu(e, video)}
      onMouseEnter={() => onHover(video.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div style={{ width: 120, height: 68, borderRadius: 4, overflow: "hidden", background: bg.sidebar, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative", fontSize: 16 }}>
        {showCover ? (
          <img src={coverSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" onError={() => setFailed(true)} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${colA}, ${colB})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.15)", userSelect: "none" }}>{video.filename.charAt(0).toUpperCase()}</span>
          </div>
        )}
        {}
        <div style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          opacity: isHovered ? 1 : 0, transition: "opacity 0.25s",
          background: isHovered ? "rgba(0,0,0,0.35)" : "transparent",
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); openWithDefaultPlayer(video.filepath); }}
            style={{
              width: 34, height: 34, borderRadius: "50%",
              border: `1.5px solid ${accent.primary}40`,
              background: "rgba(0,0,0,0.5)", color: "#fff", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(4px)",
              boxShadow: `0 0 16px ${accent.glow}`,
              transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s",
              transform: isHovered ? "scale(1)" : "scale(0.85)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = accent.tintMid; e.currentTarget.style.transform = "scale(1.2)"; e.currentTarget.style.boxShadow = `0 0 24px ${accent.glowStrong}`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.5)"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 0 16px ${accent.glow}`; }}
          >
            <PlaySvg size={28} />
          </button>
        </div>
        {video.format && <span style={{ position: "absolute", top: 3, left: 3, padding: "1px 5px", background: "rgba(0,0,0,0.75)", borderRadius: 3, fontSize: 8, fontWeight: 600, color: accent.primary, textTransform: "uppercase", opacity: isHovered ? 0 : 1, transition: "opacity 0.2s" }}>{video.format}</span>}
        <span style={{ position: "absolute", bottom: 3, right: 3, background: "rgba(0,0,0,0.8)", color: "#d1d5db", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3, fontVariantNumeric: "tabular-nums" }}>{formatDuration(video.duration)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: 12, color: text.primary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={video.filename}>{video.filename}</div>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", fontSize: 10, color: text.muted, lineHeight: 1.4 }}>
          {cardInfoFields.map((key) => { const cfg = fieldConfig[key]; if (!cfg) return null; const r = cfg.render(video); return r ? <React.Fragment key={key}>{r}</React.Fragment> : null; })}
        </div>
      </div>
    </div>
  );
});

export default MemoVideoListRow;
