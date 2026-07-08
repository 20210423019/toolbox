import React, { memo, useState, useCallback, useRef, useMemo } from "react";
import type { Video } from "../../../types";
import { invoke } from "../../../tauri-invoke";
import { convertFileSrc } from "../../../safe-tauri";
import { openWithDefaultPlayer } from "../../../safe-tauri";
import { useTheme } from "../../../theme/useTheme";
import NovelStatusBadge from "./NovelStatusBadge";
import type { NovelStatus } from "./NovelStatusBadge";
import { useClickDoubleClick } from "../../../hooks/useClickDoubleClick";

const PALETTE = ["#1a1a2e","#16213e","#0f3460","#533483","#2d3436","#636e72","#6c5b7b","#355c7d","#3b3b98","#2c3e50"];
function hashId(id: string): number { let h = 0; for (let i = 0; i < id.length; i++) { h = ((h << 5) - h) + id.charCodeAt(i); h |= 0; } return Math.abs(h); }
function getPlaceholderColors(id: string): [string, string] {
  const idx = hashId(id) % PALETTE.length;
  return [PALETTE[idx], PALETTE[(idx + 1) % PALETTE.length]];
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

const edgeParticleShadow = (color: string): string => {
  const c = color;
  return [`0 0 0 1px ${c}`,`8% 0 3px -0.5px ${c}88`,`22% 0 4px -0.5px ${c}66`,`38% 0 2px -0px ${c}99`,`55% 0 5px -0.5px ${c}55`,`72% 0 3px -0px ${c}77`,`90% 0 4px -0.5px ${c}66`,`8% 100% 3px -0.5px ${c}88`,`25% 100% 4px -0.5px ${c}66`,`42% 100% 2px -0px ${c}99`,`60% 100% 5px -0.5px ${c}55`,`78% 100% 3px -0px ${c}77`,`95% 100% 4px -0.5px ${c}66`,`0 8% 3px -0.5px ${c}88`,`0 22% 4px -0.5px ${c}66`,`0 38% 2px -0px ${c}99`,`0 55% 5px -0.5px ${c}55`,`0 72% 3px -0px ${c}77`,`0 88% 4px -0.5px ${c}66`,`100% 8% 3px -0.5px ${c}88`,`100% 25% 4px -0.5px ${c}66`,`100% 42% 2px -0px ${c}99`,`100% 60% 5px -0.5px ${c}55`,`100% 78% 3px -0px ${c}77`,`100% 95% 4px -0.5px ${c}66`,`0 0 12px -2px ${c}40`,`0 100% 12px -2px ${c}40`,`100% 0 12px -2px ${c}40`,`100% 100% 12px -2px ${c}40`].join(", ");
};
const edgeGlow = (color: string): string => {
  const c = color;
  return [`0 0 0 1px ${c}`,`10% 0 3px -0px ${c}99`,`25% 0 4px -0.5px ${c}77`,`40% 0 2px -0px ${c}aa`,`55% 0 5px -1px ${c}66`,`70% 0 3px -0px ${c}88`,`85% 0 4px -0.5px ${c}77`,`10% 100% 3px -0px ${c}99`,`25% 100% 4px -0.5px ${c}77`,`42% 100% 2px -0px ${c}aa`,`60% 100% 5px -1px ${c}66`,`78% 100% 3px -0px ${c}88`,`95% 100% 4px -0.5px ${c}77`,`0 10% 3px -0px ${c}99`,`0 28% 4px -0.5px ${c}77`,`0 45% 2px -0px ${c}aa`,`0 62% 5px -1px ${c}66`,`0 78% 3px -0px ${c}88`,`0 92% 4px -0.5px ${c}77`,`100% 10% 3px -0px ${c}99`,`100% 28% 4px -0.5px ${c}77`,`100% 45% 2px -0px ${c}aa`,`100% 62% 5px -1px ${c}66`,`100% 78% 3px -0px ${c}88`,`100% 92% 4px -0.5px ${c}77`,`0 0 16px -4px ${c}50`,`0 100% 16px -4px ${c}50`,`100% 0 16px -4px ${c}50`,`100% 100% 16px -4px ${c}50`].join(", ");
};

interface VideoCardProps {
  video: Video; isHovered: boolean; isSelected: boolean; coverSrc: string; cardInfoFields: string[];
  onSelect: (id: string) => void; onDoubleClick: (v: Video) => void; onContextMenu: (e: React.MouseEvent, v: Video) => void;
  onHover: (id: string | null) => void;
  novelStatus?: NovelStatus;
}

const MemoVideoCard = memo(function VideoCard({ video, isHovered, isSelected, coverSrc, cardInfoFields, onSelect, onDoubleClick, onContextMenu, onHover, novelStatus }: VideoCardProps) {
  const { bg, border, accent, text, status: statusColors } = useTheme();
  const [failed, setFailed] = useState(false);

  const PlaySvg = useMemo(() => ({ size = 40 }: { size?: number }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.6, height: size * 0.6, filter: "drop-shadow(0 0 8px rgba(125,211,252,0.6))" }}>
      <polygon points="6 3 20 12 6 21 6 3" fill="rgba(125,211,252,0.15)" stroke={accent.primary} />
    </svg>
  ), [accent.primary]);

  const cardFieldConfig = useMemo((): Record<string, { label: string; render: (v: Video) => React.ReactNode }> => ({
    size: { label: "文件大小", render: (v) => <span className="info-chip"><span className="ic-icon">💾</span><span className="ic-val">{(v.size / 1048576).toFixed(0)} MB</span></span> },
    date: { label: "日期", render: (v) => <span className="info-chip"><span className="ic-icon">📅</span><span className="ic-val">{v.added_at.slice(0, 10)}</span></span> },
    duration: { label: "时长", render: (v) => <span className="info-chip"><span className="ic-icon">⏱</span><span className="ic-val">{formatDuration(v.duration)}</span></span> },
    resolution: { label: "分辨率", render: (v) => v.width > 0 && v.height > 0 ? <span className="info-chip"><span className="ic-icon">🎬</span><span className="ic-val">{v.width}×{v.height}</span></span> : null },
    codec: { label: "编码格式", render: (v) => v.video_codec ? <span className="info-chip"><span className="ic-icon">📦</span><span className="ic-val">{v.video_codec}</span></span> : null },
    fps: { label: "帧率", render: (v) => v.fps > 0 ? <span className="info-chip"><span className="ic-icon">⚡</span><span className="ic-val">{v.fps.toFixed(1)} fps</span></span> : null },
    bitrate: { label: "码率", render: (v) => v.bitrate > 0 ? <span className="info-chip"><span className="ic-icon">📡</span><span className="ic-val">{(v.bitrate / 1000).toFixed(0)} kbps</span></span> : null },
    favorite: { label: "收藏状态", render: (v) => v.favorite ? <span className="info-chip"><span className="ic-icon">⭐</span><span className="ic-val" style={{ color: statusColors.warning.color }}>已收藏</span></span> : null },
    note: { label: "备注", render: (v) => v.note ? <span className="info-chip"><span className="ic-icon">📝</span><span className="ic-val">{v.note}</span></span> : null },
  }), [statusColors.warning.color]);

  const particleShadow = isHovered ? edgeGlow(accent.tintStrong) : undefined;
  const showCover = video.thumbnail_path && coverSrc && !failed;
  const fc = video.filename.charAt(0).toUpperCase() || "?";
  const [colA, colB] = getPlaceholderColors(video.id);
  const [handleClick, handleDoubleClick] = useClickDoubleClick(
    () => onSelect(video.id),
    () => onDoubleClick(video),
    500,
  );

  return (
    <div className="video-card"
      style={{
        background: bg.elevated, border: `1px solid ${isHovered ? accent.tintStrong : border.default}`,
        borderRadius: 8, overflow: "hidden", cursor: "pointer", position: "relative" as const,
        transition: "border-color 0.25s, box-shadow 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        boxShadow: particleShadow || "none",
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu(e, video)}
      onMouseEnter={() => onHover(video.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div style={{ aspectRatio: "16 / 9", background: `linear-gradient(135deg,${bg.panel},${bg.sidebar})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, position: "relative" as const, overflow: "hidden", minHeight: 60 }}>
        {}
        {showCover ? (
          <img src={coverSrc} alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={() => setFailed(true)} />
        ) : (
          
          <div style={{
            position: "absolute", inset: 0,
            background: `linear-gradient(135deg, ${colA}, ${colB})`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.2)", userSelect: "none" }}>{fc}</span>
          </div>
        )}
        {video.format && (
          <span style={{ position: "absolute", top: 6, left: 6, padding: "2px 7px", background: "rgba(0,0,0,0.75)", borderRadius: 4, fontSize: 9, fontWeight: 600, color: accent.primary, letterSpacing: "0.03em", textTransform: "uppercase" }}>
            {video.format}
          </span>
        )}
        <span style={{ position: "absolute" as const, bottom: 5, right: 5, background: "rgba(0,0,0,0.8)", color: "#d1d5db", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "0.02em" }}>
          {formatDuration(video.duration)}
        </span>
        {}
        <div style={{ position: "absolute", inset: 0, zIndex: 5, opacity: isHovered ? 1 : 0, transition: "opacity 0.2s", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.1)" }}>
          <div onClick={(e) => { e.stopPropagation(); openWithDefaultPlayer(video.filepath); }}
            style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,0.45)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${accent.primary}30`, backdropFilter: "blur(4px)", boxShadow: `0 0 20px ${accent.glowStrong}, inset 0 0 20px ${accent.glow}`, transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
            onMouseEnter={(e) => e.currentTarget.style.transform = "scale(1.12)"}
            onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}>
            <PlaySvg size={44} />
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 10px 9px" }}>
        <div style={{ fontSize: 12, color: text.primary, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 }} title={video.filename}>{video.filename}</div>
        <div style={{ fontSize: 10, color: text.muted, marginTop: 4, display: "flex", gap: 3, flexWrap: "wrap", lineHeight: 1.4 }}>
          {cardInfoFields.map((key) => {
            const config = cardFieldConfig[key]; if (!config) return null;
            const rendered = config.render(video); if (!rendered) return null;
            return <React.Fragment key={key}>{rendered}</React.Fragment>;
          })}
        </div>
      </div>
    </div>
  );
});

export default MemoVideoCard;
