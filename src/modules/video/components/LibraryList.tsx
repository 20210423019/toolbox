import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../../store/appStore";
import { useTheme } from "../../../theme/useTheme";
import { hashId, pickIcon, pickColor } from "./CategoryCard";
import { notify } from "../../../components/Notification";
import { showConfirm } from "../../../components/ConfirmDialog";

const LIB_ICONS = ["🎬","📁","📂","🗂","📀","💿","🖥","📡","🌆","🎯","🏆","📹","🎥","🎞","🖼","📊","🔧","🎨","🏗","🧩"];

function formatSize(bytes: number | null | undefined): string {
  const n = bytes ?? 0;
  if (n < 1073741824) return `${(n / 1048576).toFixed(0)}MB`;
  return `${(n / 1073741824).toFixed(1)}GB`;
}

interface Props {
  libraries: any[];
  catId: string;
  onLibClick: (lib: any) => void;
}

export default function LibraryList({ libraries, catId, onLibClick }: Props) {
  const [dragLibId, setDragLibId] = useState<string | null>(null);
  const [dragOverLibId, setDragOverLibId] = useState<string | null>(null);
  const { border, accent, text, status } = useTheme();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    if (editingId) {
      const el = document.getElementById(`lib-edit-${editingId}`) as HTMLInputElement;
      if (el) { el.focus(); el.select(); }
    }
  }, [editingId]);

  const submit = () => {
    if (!editingId || !editingName.trim()) { setEditingId(null); return; }
    useAppStore.getState().renameLibrary(editingId, editingName.trim(), catId);
    notify({ type: "success", title: "已重命名" });
    setEditingId(null);
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") setEditingId(null);
  };
  const handleCreate = async () => {
    const randomIcon = LIB_ICONS[Math.floor(Math.random() * LIB_ICONS.length)];
    const id = await useAppStore.getState().createLibrary(catId, "新视频库", randomIcon);
    if (id) { setEditingId(id); setEditingName("新视频库"); }
  };

  // ── 拖拽排序 ──
  const handleLibDragStart = (libId: string) => setDragLibId(libId);
  const handleLibDragOver = (libId: string) => { if (libId !== dragLibId) setDragOverLibId(libId); };
  const handleLibDragEnd = () => {
    if (dragLibId && dragOverLibId && dragLibId !== dragOverLibId) {
      const sorted = [...libraries];
      const fromIdx = sorted.findIndex(l => l.id === dragLibId);
      const toIdx = sorted.findIndex(l => l.id === dragOverLibId);
      if (fromIdx >= 0 && toIdx >= 0) {
        const [moved] = sorted.splice(fromIdx, 1);
        sorted.splice(toIdx, 0, moved);
        // 批量更新 sort_order
        sorted.forEach((lib, idx) => {
          useAppStore.getState().updateLibrarySort(lib.id, idx);
        });
      }
    }
    setDragLibId(null);
    setDragOverLibId(null);
  };

  return (
    <div>
      <style>{`
        .vh-lib-card {
          animation: vhLibIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
          will-change: transform, border-color, background;
        }
        .vh-lib-card:nth-child(1) { animation-delay: 0.02s; }
        .vh-lib-card:nth-child(2) { animation-delay: 0.05s; }
        .vh-lib-card:nth-child(3) { animation-delay: 0.08s; }
        .vh-lib-card:nth-child(4) { animation-delay: 0.11s; }
        .vh-lib-card:nth-child(5) { animation-delay: 0.14s; }
        .vh-lib-card:nth-child(6) { animation-delay: 0.17s; }
        .vh-lib-card:nth-child(7) { animation-delay: 0.20s; }
        .vh-lib-card:nth-child(8) { animation-delay: 0.23s; }
        @keyframes vhLibIn {
          from { opacity: 0; transform: translateY(6px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {libraries.length === 0 ? (
        <div style={{ textAlign: "center", fontSize: 11, color: text.muted, padding: "16px 0" }}>
          暂无视频库
        </div>
      ) : (
        <div className="lib-grid" style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 8, padding: 0,
        }}>
          {libraries.filter(Boolean).map((lib) => {
            if (!lib) return null;
            const isHovered = hoveredId === lib.id;
            const isEditing = editingId === lib.id;
            const icon = lib.icon || pickIcon(lib.id, LIB_ICONS);
            const iconColor = pickColor(lib.id);

            return (
              <div key={lib.id} className="vh-lib-card"
                draggable
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", lib.id); handleLibDragStart(lib.id); }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; handleLibDragOver(lib.id); }}
                onDragEnd={handleLibDragEnd}
                onDrop={(e) => { e.preventDefault(); handleLibDragEnd(); }}
                style={{
                  display: "flex", alignItems: "stretch",
                  padding: "0 8px 0 0",
                  borderRadius: 8,
                  minHeight: 52,
                  background: isHovered
                    ? `rgba(30,34,55,0.6)`
                    : `rgba(26,26,36,0.45)`,
                  border: `1px solid ${
                    dragOverLibId === lib.id ? accent.primary : (isHovered ? `rgba(96,165,250,0.25)` : `rgba(255,255,255,0.04)`)
                  }`,
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                  position: "relative",
                  overflow: "hidden",
                  transform: isHovered ? "translateY(-1px)" : "none",
                  opacity: dragLibId === lib.id ? 0.4 : 1,
                }}
                onClick={() => { if (!isEditing) onLibClick(lib); }}
                onMouseEnter={() => setHoveredId(lib.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* 左侧强调竖条 — hover 时从圆点展开为竖条 */}
                <span style={{
                  position: "absolute", left: 0, top: "50%",
                  width: 3, height: isHovered ? "60%" : 5,
                  borderRadius: isHovered ? "0 2px 2px 0" : "0 3px 3px 0",
                  background: isHovered ? accent.primary : "transparent",
                  boxShadow: isHovered ? `0 0 6px ${accent.glow}` : "none",
                  transform: "translateY(-50%)",
                  transition: "all 0.2s ease",
                }} />

                {/* 图标 */}
                <div style={{
                  width: 40, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  alignSelf: "center",
                }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 5,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12,
                    background: `${accent.primary}12`,
                    color: accent.primary,
                    transition: "transform 0.15s ease",
                    transform: isHovered ? "scale(1.05)" : "none",
                  }}>
                    {lib.icon?.startsWith("data:") ? (
                      <img src={lib.icon} style={{ width: 18, height: 18, borderRadius: 3, objectFit: "cover" }} alt="icon" />
                    ) : (
                      <span>{icon}</span>
                    )}
                  </div>
                </div>

                {/* 文字内容 — 弹性垂直居中 */}
                <div style={{
                  flex: 1, minWidth: 0,
                  display: "flex", flexDirection: "column",
                  justifyContent: "center",
                  padding: "8px 4px 8px 0",
                }}>
                  {isEditing ? (
                    <input id={`lib-edit-${lib.id}`}
                      style={{
                        background: "rgba(11,16,25,0.8)", outline: "none",
                        border: `1px solid ${accent.deep}`, borderRadius: 4,
                        padding: "2px 6px", color: text.primary, fontSize: 12, width: "100%",
                      }}
                      value={editingName} onChange={e => setEditingName(e.target.value)}
                      onKeyDown={keyDown} onBlur={submit}
                      onClick={e => e.stopPropagation()} />
                  ) : (
                    <div style={{
                      fontSize: 12, fontWeight: 500, color: text.primary,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      lineHeight: 1.4, letterSpacing: "-0.01em",
                    }}
                      onDoubleClick={e => { e.stopPropagation(); setEditingId(lib.id); setEditingName(lib.name); }}>
                      {lib.name}
                    </div>
                  )}
                  <div style={{
                    fontSize: 10, color: text.muted, marginTop: 2,
                    display: "flex", gap: 4, alignItems: "center", lineHeight: 1.3,
                  }}>
                    <span>{lib.video_count ?? 0} 视频</span>
                    <span style={{ width: 2, height: 2, borderRadius: "50%", background: "#555", flexShrink: 0 }} />
                    <span>{formatSize(lib.total_size)}</span>
                  </div>
                </div>

                {/* 操作按钮 — hover 显示 */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 1,
                  flexShrink: 0, paddingRight: 2,
                  opacity: isHovered ? 1 : 0, transition: "opacity 0.15s",
                }}>
                  <button style={{
                    width: 24, height: 24, borderRadius: 3, border: "none",
                    background: "transparent", color: text.muted, fontSize: 9,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s",
                  }}
                    onClick={e => { e.stopPropagation(); const s = useAppStore.getState(); s.setCurrentLibrary(lib.id); s.openDialog("library-settings"); }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = text.secondary; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = text.muted; }}
                    title="库设置">⚙</button>
                  <button style={{
                    width: 24, height: 24, borderRadius: 3, border: "none",
                    background: "transparent", color: text.muted, fontSize: 9,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s",
                  }}
                    onClick={async (e) => { e.stopPropagation(); if (!await showConfirm({ title: "删除媒体库", message: `删除"${lib.name}"？该媒体库的所有视频数据将被清除，不可撤销。`, danger: true })) return; await useAppStore.getState().deleteLibraryAction(lib.id, catId); }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(244,135,113,0.1)"; e.currentTarget.style.color = status.error.color; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = text.muted; }}
                    title="删除视频库">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新建库按钮 */}
      <div style={{ marginTop: 6 }}>
        <button style={{
          display: "inline-flex", alignItems: "center", gap: 3,
          padding: "3px 10px", borderRadius: 5,
          background: "transparent", border: "none",
          color: text.muted, fontSize: 11, cursor: "pointer",
          transition: "all 0.15s", opacity: 0.6,
        }}
          onClick={handleCreate}
          onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = accent.primary; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "0.6"; e.currentTarget.style.color = text.muted; }}
        >＋ 新建库</button>
      </div>
    </div>
  );
}
