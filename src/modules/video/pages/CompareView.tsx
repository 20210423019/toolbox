import { useAppStore } from "../../../store/appStore";
import { useTheme } from "../../../theme/useTheme";

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function getResolutionKey(v: { width: number; height: number }) {
  return `${v.width}x${v.height}`;
}

export default function CompareView() {
  const { bg, border, accent, text, hover, status: statusColors } = useTheme();
  const { videos, navigateTo } = useAppStore();

  const s = {
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 } as React.CSSProperties,
    card: { background: bg.elevated, border: `1px solid ${border.default}`, borderRadius: 6, overflow: "hidden" } as React.CSSProperties,
    thumb: { height: 100, background: "linear-gradient(135deg,#1a2332,#111827)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 } as React.CSSProperties,
    body: { padding: 10 } as React.CSSProperties,
    chips: { display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 } as React.CSSProperties,
    diff: { color: statusColors.warning.color, fontWeight: 600 } as React.CSSProperties,
  };
  const compareList = videos.slice(0, 4);

  if (compareList.length === 0) {
    return (
      <>
        {}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
          <button
            onClick={() => navigateTo("video-home", "视频管理")}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", background: "none", border: "none",
              color: text.muted, fontSize: 11, borderRadius: 4, cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = accent.primary; e.currentTarget.style.background = accent.tint; }}
            onMouseLeave={e => { e.currentTarget.style.color = text.muted; e.currentTarget.style.background = "transparent"; }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            返回
          </button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: text.primary }}>视频并列对比</div>
        <div style={{ fontSize: 12, color: text.muted, marginTop: -8 }}>请先在视频库中选择视频</div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, color: text.muted, fontSize: 12, gap: 6 }}>
          <span style={{ fontSize: 28, opacity: 0.3 }}>⇄</span>
          <span>暂无可对比的视频</span>
        </div>
      </>
    );
  }

  const resolutions = compareList.map(getResolutionKey);
  const fpses = compareList.map(v => v.fps);
  const uniqueRes = new Set(resolutions);
  const uniqueFps = new Set(fpses);

  return (
    <>
      {}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        <button
          onClick={() => navigateTo("video-home", "视频管理")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px", background: "none", border: "none",
            color: text.muted, fontSize: 11, borderRadius: 4, cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = accent.primary; e.currentTarget.style.background = accent.tint; }}
          onMouseLeave={e => { e.currentTarget.style.color = text.muted; e.currentTarget.style.background = "transparent"; }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12 }}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          返回
        </button>
        <span style={{ color: text.placeholder, fontSize: 9, opacity: 0.4 }}>/</span>
        <span style={{ color: text.secondary, fontSize: 11, fontWeight: 500 }}>视频对比</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: text.primary }}>视频并列对比</div>
      <div style={{ fontSize: 12, color: text.muted, marginTop: -8 }}>
        差异项高亮 · 共 {compareList.length} 个视频
      </div>
      <div style={s.grid}>
        {compareList.map((v) => (
          <div key={v.id} style={s.card}>
            <div style={s.thumb}>🎬</div>
            <div style={s.body}>
              <div style={{ fontSize: 11, fontWeight: 500, color: text.primary, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.filename}</div>
              <div style={s.chips}>
                <span className="info-chip"><span className="ic-icon">💾</span><span className="ic-val">{formatSize(v.size)}</span></span>
                <span className="info-chip" style={uniqueRes.size > 1 ? s.diff : undefined}><span className="ic-icon">🎬</span><span className="ic-val">{v.width > 0 ? `${v.width}×${v.height}` : "—"}</span></span>
                <span className="info-chip" style={uniqueFps.size > 1 ? s.diff : undefined}><span className="ic-icon">⚡</span><span className="ic-val">{v.fps > 0 ? `${v.fps.toFixed(2)} fps` : "—"}</span></span>
                <span className="info-chip"><span className="ic-icon">⏱</span><span className="ic-val">{formatDuration(v.duration)}</span></span>
                <span className="info-chip"><span className="ic-icon">📦</span><span className="ic-val">{v.video_codec || "—"}</span></span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {uniqueRes.size > 1 || uniqueFps.size > 1 ? (
        <div style={{ padding: "4px 8px", background: statusColors.warning.bg, borderRadius: 4, fontSize: 10, color: statusColors.warning.color }}>
          差异项已高亮标注 {uniqueRes.size > 1 ? "(分辨率)" : ""} {uniqueFps.size > 1 ? "(帧率)" : ""}
        </div>
      ) : null}
    </>
  );
}
