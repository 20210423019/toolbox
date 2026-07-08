import { useState, useEffect } from "react";
import { useAppStore } from "../../../store/appStore";
import { notify } from "../../../components/Notification";
import type { Video, VideoDetail } from "../../../types";
import { useTheme } from "../../../theme/useTheme";

type DetectMode = "fast" | "deep";
type DetectScope = "current" | "all";
type KeepRule = "earliest" | "latest" | "largest" | "smallest";

const btnBase: React.CSSProperties = {
  padding: "4px 12px",
  border: "none",
  borderRadius: 4,
  fontSize: 10,
  cursor: "pointer",
};

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
  return bytes + " B";
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function DuplicateDetect() {
  const { bg, border, accent, text, hover, status: statusColors } = useTheme();

  const scrollStyle: React.CSSProperties = {
    flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8,
  };

  const groupCardStyle: React.CSSProperties = {
    background: bg.base, border: `1px solid ${border.default}`,
    borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 6,
  };

  const videoRowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "4px 6px", borderRadius: 4, fontSize: 10, color: text.secondary,
  };

  const {
    closeDialog, duplicateGroups, findDuplicates, getDuplicateGroups,
    resolveDuplicate, getVideoDetail, currentLibraryId, categories,
    libraries, loadLibraries, loadCategories,
  } = useAppStore();

  const [mode, setMode] = useState<DetectMode>("fast");
  const [scope, setScope] = useState<DetectScope>("current");
  const [loading, setLoading] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [groupVideos, setGroupVideos] = useState<Record<string, Video[]>>({});
  const [keepVideoIds, setKeepVideoIds] = useState<Record<string, string>>({});
  const [keepRule, setKeepRule] = useState<KeepRule>("earliest");
  const [deleting, setDeleting] = useState(false);

  const allLibraryIds = categories.flatMap(
    (cat) => (libraries[cat.id] || []).map((lib) => lib.id)
  );

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    categories.forEach((cat) => {
      if (!libraries[cat.id]) loadLibraries(cat.id);
    });
  }, [categories]);

  // Escape 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") closeDialog("duplicate"); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [closeDialog]);

  const activeModeStyle = (m: DetectMode): React.CSSProperties => ({
    ...btnBase,
    background: mode === m ? accent.tintMid : bg.surface,
    color: mode === m ? accent.deep : text.secondary,
  });

  const activeScopeStyle = (s: DetectScope): React.CSSProperties => ({
    ...btnBase,
    background: scope === s ? accent.tintMid : bg.surface,
    color: scope === s ? accent.deep : text.secondary,
  });

  async function fetchVideosForGroups(groups: typeof duplicateGroups) {
    const map: Record<string, Video[]> = {};
    const pending: Promise<void>[] = [];
    for (const g of groups) {
      pending.push(
        (async () => {
          const details = await Promise.all(
            g.videos.map((vid) => getVideoDetail(vid).catch(() => null))
          );
          map[g.group_id] = details.filter((d): d is VideoDetail => d !== null).map((d) => d.video);
        })()
      );
    }
    await Promise.all(pending);
    return map;
  }

  async function handleStartDetect() {
    setLoading(true);
    setHasScanned(false);
    setGroupVideos({});
    setKeepVideoIds({});

    try {
      if (scope === "current" && currentLibraryId) {
        await findDuplicates(currentLibraryId, mode);
      } else if (scope === "all") {
        await getDuplicateGroups();
      }
    } catch (e) {
      notify({ type: "error", title: "重复检测失败", message: String(e) });
    }

    const groups = useAppStore.getState().duplicateGroups;
    const videosMap = await fetchVideosForGroups(groups);
    setGroupVideos(videosMap);

    const defaultKeeps: Record<string, string> = {};
    for (const g of groups) {
      const vids = videosMap[g.group_id];
      if (vids && vids.length > 0) {
        defaultKeeps[g.group_id] = vids[0].id;
      }
    }
    setKeepVideoIds(defaultKeeps);
    setHasScanned(true);
    setLoading(false);
  }

  function applyKeepRule() {
    const newKeeps: Record<string, string> = {};
    for (const g of duplicateGroups) {
      const vids = groupVideos[g.group_id];
      if (!vids || vids.length === 0) continue;
      let picked = vids[0];
      for (const v of vids) {
        switch (keepRule) {
          case "earliest":
            if (v.file_created_at < picked.file_created_at) picked = v;
            break;
          case "latest":
            if (v.file_created_at > picked.file_created_at) picked = v;
            break;
          case "largest":
            if (v.size > picked.size) picked = v;
            break;
          case "smallest":
            if (v.size < picked.size) picked = v;
            break;
        }
      }
      newKeeps[g.group_id] = picked.id;
    }
    setKeepVideoIds(newKeeps);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      for (const g of duplicateGroups) {
        const keepId = keepVideoIds[g.group_id];
        if (keepId) {
          try {
            await resolveDuplicate(g.group_id, keepId);
          } catch (e) {
            console.warn("resolveDuplicate failed:", e);
            notify({ type: "error", title: "删除失败", message: `组 ${g.group_id}: ${e}` });
          }
        }
      }
      setHasScanned(false);
      setGroupVideos({});
      setKeepVideoIds({});
    } catch {

    }
    setDeleting(false);
  }

  function setKeepForGroup(groupId: string, videoId: string) {
    setKeepVideoIds((prev) => ({ ...prev, [groupId]: videoId }));
  }

  const groupsToShow = hasScanned ? duplicateGroups : [];

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex",
        justifyContent: "center", alignItems: "center",
      }}
      onClick={() => closeDialog("duplicate")}
    >
      <div
        style={{
          width: 780, height: 540, background: "#1a1d27",
          border: `1px solid ${border.default}`, borderRadius: 10,
          display: "flex", flexDirection: "column",
          boxShadow: "0 16px 64px rgba(0,0,0,0.6)", overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div
          style={{
            height: 38, display: "flex", alignItems: "center",
            padding: "0 14px", borderBottom: `1px solid ${border.default}`,
            background: bg.base,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
            重复视频检测
          </span>
          <button
            style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 12 }}
            onClick={() => closeDialog("duplicate")}
          >
            ✕
          </button>
        </div>

        {}
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            padding: 14, gap: 10, minHeight: 0,
          }}
        >
          {}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: text.secondary }}>检测模式:</span>
            <button style={activeModeStyle("fast")} onClick={() => setMode("fast")}>
              快速模式
            </button>
            <button style={activeModeStyle("deep")} onClick={() => setMode("deep")}>
              深度模式
            </button>

            <span style={{ marginLeft: 12, fontSize: 11, color: text.secondary }}>检测范围:</span>
            <button style={activeScopeStyle("current")} onClick={() => setScope("current")}>
              当前库
            </button>
            <button style={activeScopeStyle("all")} onClick={() => setScope("all")}>
              全部库
            </button>

            <button
              style={{
                marginLeft: "auto", padding: "5px 16px", borderRadius: 4, fontSize: 10,
                border: "none", background: loading ? text.placeholder : accent.deep,
                color: "#fff", cursor: loading ? "not-allowed" : "pointer",
              }}
              onClick={handleStartDetect}
              disabled={loading}
            >
              {loading ? "检测中..." : "开始检测"}
            </button>
          </div>

          {}
          {!hasScanned ? (
            <div
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px dashed ${border.default}`, borderRadius: 6, color: text.muted, fontSize: 12,
              }}
            >
              检测结果将在扫描完成后展示
            </div>
          ) : groupsToShow.length === 0 ? (
            <div
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px dashed ${border.default}`, borderRadius: 6, color: text.muted, fontSize: 12,
              }}
            >
              未发现重复视频
            </div>
          ) : (
            <>
              {}
              <div
                style={{
                  display: "flex", gap: 6, alignItems: "center", flexShrink: 0,
                  padding: "6px 10px", background: bg.base, borderRadius: 6,
                  border: `1px solid ${border.default}`,
                }}
              >
                <span style={{ fontSize: 10, color: text.secondary }}>保留规则:</span>
                <select
                  value={keepRule}
                  onChange={(e) => setKeepRule(e.target.value as KeepRule)}
                  style={{ flex: 1, padding: "4px 8px", background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4, color: text.primary, fontSize: 11, outline: "none" }}
                >
                  <option value="earliest">保留最早文件</option>
                  <option value="latest">保留最新文件</option>
                  <option value="largest">保留最大文件</option>
                  <option value="smallest">保留最小文件</option>
                </select>
                <button
                  style={{
                    ...btnBase, background: accent.tintMid,
                    color: accent.deep,
                  }}
                  onClick={applyKeepRule}
                >
                  应用规则
                </button>
                <span style={{ marginLeft: "auto", fontSize: 10, color: text.muted }}>
                  共 {groupsToShow.length} 组重复
                </span>
              </div>

              {}
              <div style={scrollStyle}>
                {groupsToShow.map((g) => {
                  const vids = groupVideos[g.group_id] || [];
                  const keepId = keepVideoIds[g.group_id];
                  if (vids.length === 0) return null;
                  return (
                    <div key={g.group_id} style={groupCardStyle}>
                      {}
                      <div
                        style={{
                          display: "flex", gap: 8, alignItems: "center",
                          fontSize: 10, color: text.primary,
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          重复 {vids.length} 项
                        </span>
                        <span style={{ color: text.muted }}>
                          可释放空间: {formatSize(g.total_size_saved)}
                        </span>
                      </div>

                      {}
                      {vids.map((v) => {
                        const isKeep = v.id === keepId;
                        return (
                          <div
                            key={v.id}
                            style={{
                              ...videoRowStyle,
                              background: isKeep ? accent.tint : "none",
                              border: isKeep ? `1px solid ${accent.tintStrong}` : "1px solid transparent",
                              cursor: "pointer",
                            }}
                            onClick={() => setKeepForGroup(g.group_id, v.id)}
                          >
                            {isKeep && (
                              <span style={{ color: accent.deep, fontWeight: 600, fontSize: 9 }}>
                                [保留项]
                              </span>
                            )}
                            <span style={{ color: text.primary, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {v.filename}
                            </span>
                            <span className="info-chip" style={{ background: "rgba(255,255,255,0.04)", color: "#94A3B8" }}><span className="ic-icon">💾</span><span className="ic-val">{formatSize(v.size)}</span></span>
                            <span className="info-chip" style={{ background: "rgba(255,255,255,0.04)", color: "#94A3B8" }}><span className="ic-icon">⏱</span><span className="ic-val">{formatDuration(v.duration)}</span></span>
                            <span className="info-chip" style={{ background: "rgba(255,255,255,0.04)", color: "#94A3B8" }}><span className="ic-icon">🎬</span><span className="ic-val">{v.width}x{v.height}</span></span>
                            <span
                              style={{
                                flexShrink: 0, maxWidth: 180, overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap",
                                color: text.muted,
                              }}
                              title={v.filepath}
                            >
                              {v.filepath}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {}
          <div
            style={{
              display: "flex", gap: 6, justifyContent: "flex-end",
              borderTop: `1px solid ${border.default}`, paddingTop: 8, flexShrink: 0,
            }}
          >
            {hasScanned && groupsToShow.length > 0 && (
              <button
                style={{
                  padding: "6px 14px", borderRadius: 4, fontSize: 11,
                  border: "none", background: deleting ? text.placeholder : statusColors.error.color,
                  color: "#fff", cursor: deleting ? "not-allowed" : "pointer",
                }}
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? "删除中..." : "确认删除"}
              </button>
            )}
            <button
              style={{
                padding: "6px 14px", borderRadius: 4, fontSize: 11,
                border: `1px solid ${border.default}`, background: bg.surface,
                color: text.secondary, cursor: "pointer",
              }}
              onClick={() => closeDialog("duplicate")}
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
