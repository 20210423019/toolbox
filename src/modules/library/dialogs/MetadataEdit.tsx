import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "../../../store/appStore";
import { bg, border, accent, text, status as statusColors } from "../../../theme/ethereal";
import { notify } from "../../../components/Notification";
import type { TagName } from "../../../types";

export default function MetadataEdit() {
  const { closeDialog, videos, tagClasses, loadTagClasses, classTags, batchTagVideos, batchUpdateVideos, currentLibraryId } = useAppStore();
  const videoIds = videos.map((v) => v.id);
  const selectedCount = videos.length;

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentLibraryId) loadTagClasses(currentLibraryId);
  }, [currentLibraryId]);

  // 用 useMemo 缓存 classMap，避免每次渲染重建导致潜在性能问题
  const classMap = useMemo(() => {
    const map = new Map<string, TagName[]>();
    for (const tag of classTags) {
      const key = tag.class_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tag);
    }
    return map;
  }, [classTags]);

  // Escape 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") closeDialog("metadata"); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [closeDialog]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  };

  const handleBindTags = async () => {
    if (selectedTagIds.length === 0 || videoIds.length === 0) return;
    setLoading(true);
    try {
      await batchTagVideos(videoIds, selectedTagIds, selectedTagIds.map(() => ""));
      notify({ type: "success", title: "标签已绑定", message: `${selectedTagIds.length} 个标签 → ${videoIds.length} 个视频` });
    } catch { notify({ type: "error", title: "绑定失败" }); }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" }}
      onClick={() => closeDialog("metadata")}>
      <div style={{ width: 620, background: "#1a1d27", border: `1px solid ${border.default}`, borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 16px 64px rgba(0,0,0,0.6)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: `1px solid ${border.default}`, background: bg.base }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>元数据批量编辑</span>
          <button title="关闭" style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 12 }} onClick={() => closeDialog("metadata")}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: 14, gap: 14 }}>
          <span style={{ fontSize: 11, color: text.secondary }}>已选 {selectedCount} 个视频</span>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>标签批量绑定</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 120, overflowY: "auto", padding: "4px 0" }}>
              {tagClasses.length === 0 ? (
                <span style={{ fontSize: 10, color: text.muted }}>暂无标签类</span>
              ) : (
                tagClasses.map((cls) => {
                  const tagsInClass = classMap.get(cls.id) || [];
                  if (tagsInClass.length === 0) return null;
                  return (
                    <div key={cls.id} style={{ width: "100%", marginBottom: 2 }}>
                      <div style={{ fontSize: 9, color: cls.color || text.muted, fontWeight: 600, marginBottom: 2, paddingLeft: 2 }}>
                        {cls.icon ? `${cls.icon} ` : ""}{cls.name}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {tagsInClass.map((tag: TagName) => (
                          <label key={tag.id}
                            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: text.secondary, cursor: "pointer", padding: "2px 6px", background: selectedTagIds.includes(tag.id) ? accent.tintMid : "transparent", borderRadius: 4, border: selectedTagIds.includes(tag.id) ? `1px solid ${accent.deep}` : "1px solid transparent" }}>
                            <input type="checkbox" checked={selectedTagIds.includes(tag.id)}
                              onChange={() => toggleTag(tag.id)} style={{ accentColor: accent.deep }} />
                            <span style={{ color: tag.color || text.secondary }}>{tag.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <button onClick={handleBindTags} disabled={loading}
              style={{ padding: "5px 12px", borderRadius: 4, fontSize: 11, border: "none", background: loading ? text.muted : accent.deep, color: "#fff", cursor: loading ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
              {loading ? "绑定中..." : "绑定到选中视频"}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>收藏状态批量切换</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { batchUpdateVideos(videoIds, undefined, true, undefined); notify({ type: "success", title: "已设为收藏", message: `${videoIds.length} 个视频` }); }}
                style={{ padding: "5px 12px", borderRadius: 4, fontSize: 11, border: "none", background: statusColors.warning.color, color: "#fff", cursor: "pointer" }}>设为收藏</button>
              <button onClick={() => { batchUpdateVideos(videoIds, undefined, false, undefined); notify({ type: "success", title: "已取消收藏", message: `${videoIds.length} 个视频` }); }}
                style={{ padding: "5px 12px", borderRadius: 4, fontSize: 11, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer" }}>取消收藏</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>状态批量切换</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => { batchUpdateVideos(videoIds, undefined, undefined, "normal"); notify({ type: "success", title: "状态已更新为「正常」", message: `${videoIds.length} 个视频` }); }}
                style={{ padding: "5px 12px", borderRadius: 4, fontSize: 11, border: "none", background: statusColors.success.color, color: "#fff", cursor: "pointer" }}>正常</button>
              <button onClick={() => { batchUpdateVideos(videoIds, undefined, undefined, "archived"); notify({ type: "success", title: "状态已更新为「归档」", message: `${videoIds.length} 个视频` }); }}
                style={{ padding: "5px 12px", borderRadius: 4, fontSize: 11, border: "none", background: text.muted, color: "#fff", cursor: "pointer" }}>归档</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>备注批量填写</span>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={note} onChange={(e) => setNote(e.target.value)}
                style={{ flex: 1, padding: "6px 10px", background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4, color: text.primary, fontSize: 11, outline: "none" }} placeholder="输入统一备注内容..." />
              <button onClick={() => { if (!note.trim()) { notify({ type: "warning", title: "备注为空", message: "请输入备注内容后再应用" }); return; } batchUpdateVideos(videoIds, note, undefined, undefined); notify({ type: "success", title: "备注已应用", message: `${videoIds.length} 个视频` }); }}
                style={{ padding: "5px 12px", borderRadius: 4, fontSize: 11, border: "none", background: statusColors.info.color, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>应用到全部</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", borderTop: `1px solid ${border.default}`, paddingTop: 10 }}>
            <button style={{ padding: "6px 14px", borderRadius: 4, fontSize: 11, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer" }} onClick={() => closeDialog("metadata")}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
}
