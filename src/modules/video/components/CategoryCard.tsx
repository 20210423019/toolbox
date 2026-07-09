import { useState, useRef, useEffect } from "react";
import { useAppStore } from "../../../store/appStore";
import { notify } from "../../../components/Notification";
import { showConfirm } from "../../../components/ConfirmDialog";
import { useTheme } from "../../../theme/useTheme";

export const CAT_ICONS = ["📹","🎬","🎥","📺","🎞","📽","🎯","🏆","📁","📂","🗂","📀","💿","🖥","📡","🎨","🎭","📊","🔧","🎮"];
export const CAT_COLORS = ["#60A5FA","#34D399","#38BDF8","#A78BFA","#FB7185","#FBBF24","#B4A7D6","#9CD8C8"];
export function hashId(id: string): number {
  let h = 0; for (let i = 0; i < id.length; i++) { h = ((h << 5) - h) + id.charCodeAt(i); h |= 0; } return Math.abs(h);
}
export function pickIcon(id: string, pool: string[]): string { return pool[hashId(id) % pool.length]; }
export function pickColor(id: string): string { return CAT_COLORS[hashId(id) % CAT_COLORS.length]; }

function formatSize(bytes: number | null | undefined): string {
  const n = bytes ?? 0;
  if (n < 1073741824) return `${(n / 1048576).toFixed(0)}MB`;
  return `${(n / 1073741824).toFixed(1)}GB`;
}

interface Props {
  cat: any;
  index: number;
  totalCount: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onCreateLibrary: (catId: string) => void;
  onDragCatStart?: (id: string) => void;
  onDragCatOver?: (id: string) => void;
  onDragCatEnd?: () => void;
  isDragTarget?: boolean;
}

export default function CategoryCard({ cat, index, totalCount, isExpanded, onToggle, onCreateLibrary,
  onDragCatStart, onDragCatOver, onDragCatEnd, isDragTarget }: Props) {
  const { border, accent, text, hover, status } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const color = pickColor(cat.id);
  const icon = cat.icon || pickIcon(cat.id, CAT_ICONS);

  useEffect(() => {
    if (editing && editRef.current) { editRef.current.focus(); editRef.current.select(); }
  }, [editing]);

  const submit = async () => {
    if (!editName.trim()) { setEditing(false); return; }
    try {
      await useAppStore.getState().renameCategory(cat.id, editName.trim());
      notify({ type: "success", title: "分类已重命名" });
    } catch { notify({ type: "error", title: "重命名失败" }); }
    setEditing(false);
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") submit();
    else if (e.key === "Escape") setEditing(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cat.id);
    onDragCatStart?.(cat.id);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    onDragCatOver?.(cat.id);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onDragCatEnd?.();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={onDragCatEnd}
      onDrop={handleDrop}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 16px",
        borderRadius: 16,
        background: hovered ? "rgba(18,26,38,0.5)" : "rgba(15,22,32,0.35)",
        border: `1px solid ${isDragTarget ? accent.primary : (hovered ? border.hover : border.default)}`,
        cursor: "grab", userSelect: "none",
        transition: "all 0.2s ease",
        position: "relative",
      }}
      onClick={() => onToggle(cat.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle */}
      <div style={{ color: text.muted, fontSize: 10, opacity: 0.35, flexShrink: 0, cursor: "grab", padding: 2 }}>⠿</div>
      {/* Expand arrow */}
      <div className="cat-expand" style={{
        width: 20, height: 20, borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 8, color: isExpanded ? accent.primary : text.muted, flexShrink: 0,
        transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), color 0.15s",
        transform: isExpanded ? "rotate(90deg)" : "none",
      }}>▶</div>
      {/* Color accent bar */}
      <span style={{ width: 4, height: 24, borderRadius: 3, background: color, flexShrink: 0 }} />
      {/* Icon */}
      <span style={{
        width: 30, height: 30, borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, flexShrink: 0,
        background: `${color}20`, color,
      }}>{icon}</span>
      {/* Name + Stats */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input ref={editRef}
            style={{
              background: "rgba(11,16,25,0.8)", outline: "none",
              border: `1px solid ${accent.deep}`, borderRadius: 4,
              padding: "3px 8px", color: text.primary, fontSize: 14, width: 140,
            }}
            value={editName} onChange={e => setEditName(e.target.value)}
            onKeyDown={keyDown} onBlur={submit}
            onClick={e => e.stopPropagation()} />
        ) : (
          <div style={{ fontSize: 14, fontWeight: 600, color: text.primary, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            onDoubleClick={e => { e.stopPropagation(); setEditing(true); setEditName(cat.name); }}>
            {cat.name}
          </div>
        )}
        <div style={{ fontSize: 11, color: text.muted, marginTop: 1 }}>
          <span>{cat.video_count ?? 0} 视频</span>
          <span style={{ margin: "0 4px", opacity: 0.3 }}>·</span>
          <span>{cat.lib_count ?? 0} 库</span>
          <span style={{ margin: "0 4px", opacity: 0.3 }}>·</span>
          <span>{formatSize(cat.total_size)}</span>
        </div>
      </div>
      {/* Hover actions */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
        <button style={{
          width: 26, height: 26, borderRadius: 4, border: "none",
          background: "transparent", color: text.muted, fontSize: 12,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
          onClick={e => { e.stopPropagation(); onCreateLibrary(cat.id); }}
          onMouseEnter={e => { e.currentTarget.style.background = accent.tint; e.currentTarget.style.color = accent.primary; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = text.muted; }}
          title="新建库">＋</button>
        <button style={{
          width: 26, height: 26, borderRadius: 4, border: "none",
          background: "transparent", color: text.muted, fontSize: 12,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
          onClick={async (e) => { e.stopPropagation(); if (!await showConfirm({ title: "删除分类", message: `删除分类"${cat.name}"？该分类下的所有媒体库及视频数据将被清除，不可撤销。`, danger: true })) return; await useAppStore.getState().deleteCategoryAction(cat.id, true); }}
          onMouseEnter={e => { e.currentTarget.style.background = `${status.error.bg}`; e.currentTarget.style.color = status.error.color; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = text.muted; }}
          title="删除分类">🗑</button>
      </div>
    </div>
  );
}
