import { useState, useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import { useTheme } from "../../theme/useTheme";
import UnifiedLogViewer from "../../components/UnifiedLogViewer";



function getPageNumbers(currentPage: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 0) return [];
  if (totalPages <= 5) { const s: (number | "...")[] = []; for (let i = 1; i <= totalPages; i++) s.push(i); return s; }
  const needLeft = currentPage > 3;
  const needRight = currentPage < totalPages - 2;
  let avail = 3;
  if (needLeft) avail--;
  if (needRight) avail--;
  let start = Math.max(2, currentPage - Math.floor((avail - 1) / 2));
  let end = Math.min(totalPages - 1, start + avail - 1);
  start = Math.max(2, end - avail + 1);
  const slots: (number | "...")[] = [1];
  if (needLeft) slots.push("...");
  for (let i = start; i <= end; i++) slots.push(i);
  if (needRight) slots.push("...");
  slots.push(totalPages);
  return slots;
}

function useStatusBarSelector() {
  return useAppStore(s => ({
    allVideosCount: s.allVideosCount,
    totalStorage: s.totalStorage,
    scanProgress: s.scanProgress,
    scanningLibraryId: s.scanningLibraryId,
    currentLibraryId: s.currentLibraryId,
    currentModuleId: s.currentModuleId,
    currentPage: s.currentPage,
    videoPage: s.videoPage,
    videoPageSize: s.videoPageSize,
    totalVideos: s.totalVideos,
    setVideoPage: s.setVideoPage,
    setVideoPageSize: s.setVideoPageSize,
    loadVideos: s.loadVideos,
    startScan: s.startScan,
    cancelScan: s.cancelScan,
  }));
}

function fmtSize(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function StatusBar() {
  const { bg, border, accent, text, status } = useTheme();
  const styles = useMemo(() => ({
    bar: {
      height: 26,
      borderTop: `1px solid ${border.divider}`,
      display: "flex", alignItems: "center", padding: "0 12px", gap: 12, flexShrink: 0,
    } as React.CSSProperties,
    left: { display: "flex", alignItems: "center", gap: 12 } as React.CSSProperties,
    right: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" } as React.CSSProperties,
    item: { fontSize: 11, color: text.muted, display: "flex", alignItems: "center", gap: 5 } as React.CSSProperties,
    dot: { width: 6, height: 6, flexShrink: 0, borderRadius: "50%" } as React.CSSProperties,
    value: { color: text.primary, fontWeight: 600, fontFamily: "'Cascadia Code','Consolas',monospace", fontSize: 11 } as React.CSSProperties,
    label: { color: text.secondary } as React.CSSProperties,
    progBar: { width: 60, height: 4, background: "rgba(0,0,0,0.25)", overflow: "hidden", borderRadius: 3 } as React.CSSProperties,
    progFill: { height: "100%", background: `linear-gradient(90deg,${accent.deep},${accent.primary})`, borderRadius: 3, transition: "width 0.5s ease" } as React.CSSProperties,
    pageWrap: { display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: text.muted } as React.CSSProperties,
    pageSelect: { background: bg.surface, border: `1px solid ${border.default}`, color: text.secondary, fontSize: 10, padding: "1px 6px", outline: "none", cursor: "pointer", borderRadius: 4 } as React.CSSProperties,
    pageBtn: (a: boolean) => ({ padding: "1px 7px", background: a ? accent.glow : "transparent", color: a ? accent.primary : text.muted, fontSize: 11, cursor: "pointer", borderRadius: 4, fontWeight: a ? 600 : 400, border: "none", transition: "all 0.15s" } as React.CSSProperties),
    pageNav: (d?: boolean) => ({ padding: "1px 6px", border: "none", background: "transparent", color: d ? text.placeholder : text.muted, fontSize: 12, cursor: d ? "not-allowed" : "pointer", borderRadius: 4, transition: "all 0.15s" } as React.CSSProperties),
    scanBtn: { padding: "2px 10px", border: `1px solid ${accent.primary}`, background: "transparent", color: accent.primary, fontSize: 10, cursor: "pointer", borderRadius: 4, transition: "all 0.15s" } as React.CSSProperties,
    cancelBtn: { padding: "2px 10px", border: `1px solid ${status.error.color}`, background: "transparent", color: status.error.color, fontSize: 10, cursor: "pointer", borderRadius: 4, transition: "all 0.15s" } as React.CSSProperties,
    ellipse: { color: text.muted, fontSize: 10, letterSpacing: "0.5px" } as React.CSSProperties,
  }), [bg, border, accent, text, status]);
  const {
    allVideosCount, totalStorage, scanProgress, scanningLibraryId,
    currentLibraryId, currentModuleId, currentPage, startScan, cancelScan,
    videoPage, videoPageSize, totalVideos,
    setVideoPage, setVideoPageSize, loadVideos,
  } = useStatusBarSelector();

  const isVideoModule = currentModuleId === "video";
  const totalPages = Math.ceil(totalVideos / videoPageSize) || 1;
  // scanningLibraryId is the authoritative indicator: set on start, cleared on done/cancel
  const isScanning = !!scanningLibraryId;
  const hasProgressData = !!scanProgress;
  const isLibraryPage = !!currentLibraryId;
  const isOnLibraryView = currentPage.startsWith("library-") || currentPage === "library";
  const [hoveredPageBtn, setHoveredPageBtn] = useState<number | null>(null);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const appLogs = useAppStore(s => s.appLogs);
  const errorCount = appLogs.filter(l => l.level === "error").length;
  const warnCount = appLogs.filter(l => l.level === "warn").length;

  const handleGoToPage = (p: number) => {
    if (p >= 1 && p <= totalPages) {
      setVideoPage(p);
      if (currentLibraryId) loadVideos(currentLibraryId, p);
    }
  };

  return (
    <div style={styles.bar}>
      {/* ── Left: status + counts + scan progress ── */}
      <div style={styles.left}>
        {/* Status dot + text */}
        <span style={styles.item}>
          <span className="status-dot" style={{
            ...styles.dot,
            background: isScanning ? status.warning.color : status.success.color,
            boxShadow: isScanning
              ? `0 0 6px ${status.warning.color}`
              : `0 0 6px ${status.success.color}`,
          }} />
          <span className="status-text" style={{ color: isScanning ? status.warning.color : text.secondary }}>
            {isScanning ? "扫描中" : "运行正常"}
          </span>
        </span>

        {/* Video count (always show) */}
        {isVideoModule && (
          <span style={styles.item}>
            <span style={styles.label}>视频</span>
            <span style={styles.value}>{allVideosCount}</span>
          </span>
        )}

        {/* Storage */}
        {isVideoModule && totalStorage > 0 && (
          <span style={styles.item}>
            <span style={styles.label}>存储</span>
            <span style={styles.value}>{fmtSize(totalStorage)}</span>
          </span>
        )}

        {/* Scan progress bar — visible while scanning, even without progress data yet */}
        {isScanning && (
          <>
            <div style={{ ...styles.progBar, width: hasProgressData ? 60 : 80 }}>
              <div style={{
                ...styles.progFill,
                width: hasProgressData ? `${scanProgress!.percentage}%` : "100%",
                animation: hasProgressData ? "none" : "pulse 1.2s ease-in-out infinite",
              }} />
            </div>
            <span style={{ ...styles.item, color: status.warning.color }}>
              {hasProgressData
                ? `${scanProgress!.percentage.toFixed(0)}%`
                : "准备中..."}
            </span>
            {hasProgressData && scanProgress!.total_files > 0 && (
              <span style={{ ...styles.item, color: text.muted, fontSize: 10 }}>
                {scanProgress!.scanned_files}/{scanProgress!.total_files} 文件
              </span>
            )}
            {hasProgressData && (scanProgress!.new_files > 0 || scanProgress!.updated_files > 0) && (
              <span style={{ ...styles.item, color: status.success.color, fontSize: 10 }}>
                新增 {scanProgress!.new_files} · 更新 {scanProgress!.updated_files}
              </span>
            )}
          </>
        )}
      </div>

      {/* ── Right: log indicator + scan button + pagination ── */}
      <div style={styles.right}>
        {/* Log indicator */}
        <button
          onClick={() => setShowLogViewer(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 7px", borderRadius: 4,
            border: `1px solid ${errorCount > 0 ? status.error.color : border.default}`,
            background: errorCount > 0 ? status.error.bg : "transparent",
            color: errorCount > 0 ? status.error.color : text.muted,
            fontSize: 9, cursor: "pointer", transition: "all 0.12s",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = errorCount > 0 ? status.error.color : bg.hover;
            if (errorCount === 0) e.currentTarget.style.color = text.secondary;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = errorCount > 0 ? status.error.bg : "transparent";
            if (errorCount === 0) e.currentTarget.style.color = text.muted;
          }}
        >
          {errorCount > 0 ? (
            <span className="status-dot" style={{ ...styles.dot, background: status.error.color, boxShadow: `0 0 4px ${status.error.color}` }} />
          ) : (
            <span className="status-dot" style={{ ...styles.dot, background: border.default }} />
          )}
          <span>{errorCount > 0 ? `${errorCount} 错误` : warnCount > 0 ? `${warnCount} 警告` : "日志"}</span>
        </button>

        {/* Scan / Cancel button — show on library pages */}
        {isLibraryPage && isOnLibraryView && (
          isScanning ? (
            <button onClick={cancelScan} style={styles.cancelBtn}
              onMouseEnter={e => { e.currentTarget.style.background = status.error.color; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = status.error.color; }}
            >取消</button>
          ) : (
            <button onClick={() => currentLibraryId && startScan(currentLibraryId)} style={styles.scanBtn}
              onMouseEnter={e => { e.currentTarget.style.background = accent.deep; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = accent.deep; }}
            >扫描</button>
          )
        )}

        {/* Pagination — only on library view */}
        {isLibraryPage && isOnLibraryView && (
          <div style={styles.pageWrap}>
            <select value={videoPageSize} onChange={e => { setVideoPageSize(Number(e.target.value)); setVideoPage(1); if (currentLibraryId) loadVideos(currentLibraryId, 1); }} style={styles.pageSelect}>
              <option value={10}>10/页</option>
              <option value={20}>20/页</option>
              <option value={30}>30/页</option>
              <option value={50}>50/页</option>
              <option value={100}>100/页</option>
            </select>
            <button style={styles.pageNav(videoPage <= 1 || totalPages <= 1)}
              onClick={() => handleGoToPage(videoPage - 1)}
              disabled={videoPage <= 1 || totalPages <= 1}
            >‹</button>
            {getPageNumbers(videoPage, totalPages).map((p, i) =>
              typeof p === "string" ? (
                <span key={`e-${i}`} style={styles.ellipse}>···</span>
              ) : (
                <button key={p}
                  style={{
                    ...styles.pageBtn(videoPage === p),
                    ...(hoveredPageBtn === p && videoPage !== p
                      ? { color: accent.deep, background: accent.tint }
                      : {}),
                  }}
                  onClick={() => handleGoToPage(p)}
                  onMouseEnter={() => setHoveredPageBtn(p)}
                  onMouseLeave={() => setHoveredPageBtn(null)}
                >{p}</button>
              )
            )}
            <button style={styles.pageNav(videoPage >= totalPages || totalPages <= 1)}
              onClick={() => handleGoToPage(videoPage + 1)}
              disabled={videoPage >= totalPages || totalPages <= 1}
            >›</button>
            <span style={{ marginLeft: 4 }}>{totalVideos} 视频 · {videoPage}/{totalPages || 1} 页</span>
          </div>
        )}
      </div>

      {/* UnifiedLogViewer overlay */}
      {showLogViewer && <UnifiedLogViewer onClose={() => setShowLogViewer(false)} initialTab={errorCount > 0 ? "errors" : undefined} />}
    </div>
  );
}
