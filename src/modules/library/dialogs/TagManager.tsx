import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useAppStore } from "../../../store/appStore";
import { notify } from "../../../components/Notification";
import { showConfirm } from "../../../components/ConfirmDialog";
import { invoke } from "../../../tauri-invoke";
import type { TagClass, TagName, TagType } from "../../../types";
import { bg, border, accent, text } from "../../../theme/ethereal";
import { useTheme } from "../../../theme/useTheme";
import { getTagType, setTagType, TAG_TYPE_CONFIG } from "../components/tagTypeStore";

const TAG_COLORS = ["#f87171","#fb923c","#fbbf24","#a3e635","#34d399","#22d3ee","#60A5FA","#818cf8","#c084fc","#f472b6"];
let colorIndex = Math.floor(Math.random() * TAG_COLORS.length);
function nextTagColor(): string { const c = TAG_COLORS[colorIndex % TAG_COLORS.length]; colorIndex++; return c; }

const s = {
  overlay: { position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" } as React.CSSProperties,
  container: { width: 880, height: 600, background: "#1a1d27", border: `1px solid ${border.default}`, borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 16px 64px rgba(0,0,0,0.6)", overflow: "hidden" } as React.CSSProperties,
  header: { height: 42, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${border.default}`, background: bg.base } as React.CSSProperties,
  headerTitle: { fontSize: 14, fontWeight: 600, color: text.primary } as React.CSSProperties,
  closeBtn: { marginLeft: "auto", width: 26, height: 26, borderRadius: 4, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 14 } as React.CSSProperties,
  body: { flex: 1, display: "flex", minHeight: 0 } as React.CSSProperties,

  treePanel: { width: 340, background: bg.base, borderRight: `1px solid ${border.default}`, display: "flex", flexDirection: "column", overflow: "hidden" } as React.CSSProperties,
  searchBox: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${border.default}`, background: bg.sidebar } as React.CSSProperties,
  searchInput: { flex: 1, padding: "5px 10px", background: bg.input, border: `1px solid ${border.default}`, borderRadius: 5, color: text.primary, fontSize: 11, outline: "none" } as React.CSSProperties,
  treeScroll: { flex: 1, overflowY: "auto", padding: "4px 8px" } as React.CSSProperties,
  treeActions: { display: "flex", gap: 6, padding: "8px 10px", borderTop: `1px solid ${border.default}`, background: bg.sidebar } as React.CSSProperties,

  clsRow: (sel: boolean, depth: number, hl: boolean) => ({
    display: "flex", alignItems: "center", gap: 4, width: "100%",
    padding: `5px 6px 5px ${10 + depth * 20}px`,
    borderRadius: 5, fontSize: 11, border: "none",
    background: hl ? `${accent.deep}22` : sel ? accent.tintMid : "transparent",
    color: sel ? accent.deep : text.primary,
    cursor: "pointer", boxSizing: "border-box", marginBottom: 2,
    borderLeft: sel ? `3px solid ${accent.deep}` : "3px solid transparent",
    transition: "background 0.2s, border-left-color 0.2s, color 0.2s",
  } as React.CSSProperties),
  tagRow: (sel: boolean, depth: number) => ({
    display: "flex", alignItems: "center", gap: 4, width: "100%",
    padding: `4px 6px 4px ${28 + depth * 20}px`,
    borderRadius: 4, fontSize: 11, border: "none",
    background: sel ? accent.tint : "transparent",
    color: sel ? accent.deep : text.secondary,
    cursor: "pointer", boxSizing: "border-box",
    borderLeft: sel ? `3px solid ${accent.deep}` : "3px solid transparent",
    marginBottom: 1,
    transition: "background 0.2s, border-left-color 0.2s, color 0.2s",
  } as React.CSSProperties),
  iconBtn: { width: 20, height: 20, borderRadius: 3, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 10, padding: 0, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as React.CSSProperties,
  countBadge: { fontSize: 9, color: text.muted, background: "#1a1d27", padding: "0 6px", borderRadius: 7, minWidth: 18, textAlign: "center", marginLeft: "auto", lineHeight: "16px" } as React.CSSProperties,

  rightPanel: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" } as React.CSSProperties,
  rightScroll: { flex: 1, overflowY: "auto", padding: "14px 16px" } as React.CSSProperties,
  detailLabel: { fontSize: 10, color: text.muted, fontWeight: 500, marginBottom: 3 } as React.CSSProperties,
  detailInput: { width: "100%", padding: "5px 10px", background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4, color: text.primary, fontSize: 11, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  emptyRight: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: text.muted, fontSize: 12, padding: 20, textAlign: "center" as const } as React.CSSProperties,
  bottomBar: { display: "flex", gap: 8, justifyContent: "flex-end", padding: "8px 14px", borderTop: `1px solid ${border.default}`, background: bg.base } as React.CSSProperties,
  btn: (bgc: string, c: string) => ({ padding: "5px 12px", borderRadius: 4, fontSize: 10, border: "none", cursor: "pointer", background: bgc, color: c, fontWeight: 500 } as React.CSSProperties),

  createPanel: { borderTop: `1px solid ${border.default}`, padding: "10px 14px", background: bg.sidebar } as React.CSSProperties,
};

function buildTree(classes: TagClass[], parentId: string | null): TagClass[] {
  return classes.filter((c) => c.parent_id === parentId);
}

export default function TagManager() {
  // ── 注入 spin 动画（确保 TagManager 独立使用时也有加载动效）──
  const MGR_STYLE_ID = "tag-manager-spin-v1";
  if (!document.getElementById(MGR_STYLE_ID)) {
    const st = document.createElement("style");
    st.id = MGR_STYLE_ID;
    st.textContent = `@keyframes tt-spin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(st);
  }
  const { status } = useTheme();
  const { closeDialog, currentLibraryId, tagClasses, loadTagClasses, createTagClass, updateTagClass, deleteTagClass, moveTagClass, copyTagClass, createClassTag, updateClassTag, deleteClassTag, saveTagTemplate, loadTagTemplate } = useAppStore();
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editClassName, setEditClassName] = useState("");
  const [editClassParent, setEditClassParent] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [searchMatches, setSearchMatches] = useState<Set<string>>(new Set());

  const [createMode, setCreateMode] = useState<{ type: "class" | "tag"; parentId?: string; parentName?: string } | null>(null);
  const [createName, setCreateName] = useState("");
  const [createTagType, setCreateTagType] = useState<TagType>("text");

  const [inlineCreate, setInlineCreate] = useState<{ type: "tag" | "class"; parentId: string; parentName?: string } | null>(null);
  const [inlineName, setInlineName] = useState("");
  const [inlineTagType, setInlineTagType] = useState<TagType>("text");

  const [allClassTags, setAllClassTags] = useState<TagName[]>([]);
  const [tagTypeVersion, setTagTypeVersion] = useState(0); // 用于强制刷新标签类型下拉
  const [typeLoading, setTypeLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<number | null>(null);
  const loadedClassIds = useRef<Set<string>>(new Set());

  useEffect(() => { if (currentLibraryId) loadTagClasses(currentLibraryId); }, [currentLibraryId]);
  // Escape 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") closeDialog("tag-manager"); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [closeDialog]);

  useEffect(() => {
    (async () => {
      const needLoad = [...expandedIds].filter(id => !loadedClassIds.current.has(id) && tagClasses.some(c => c.id === id));
      if (needLoad.length === 0) return;
      for (const id of needLoad) loadedClassIds.current.add(id);
      const all: TagName[] = [];
      for (const id of loadedClassIds.current) {
        if (tagClasses.some(c => c.id === id)) {
          try { const tags = await invoke<TagName[]>("get_class_tags", { classId: id }); all.push(...tags); } catch {}
        }
      }
      setAllClassTags(all);
    })();
  }, [expandedIds, tagClasses]);

  const rootClasses = useMemo(() => buildTree(tagClasses, null), [tagClasses]);
  const selectedTag = useMemo(() => allClassTags.find(t => t.id === selectedTagId), [allClassTags, selectedTagId]);
  const selectedClass = useMemo(() => tagClasses.find(c => c.id === selectedClassId), [tagClasses, selectedClassId]);

  function getClassDepth(clsId: string | null): number {
    if (!clsId) return 0;
    let depth = 0, p = tagClasses.find(c => c.id === clsId)?.parent_id || null;
    while (p) { depth++; p = tagClasses.find(c => c.id === p)?.parent_id || null; }
    return depth;
  }

  useEffect(() => {
    if (!search.trim()) { setSearchMatches(new Set()); setSearchLoading(false); return; }
    setSearchLoading(true);
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      const q = search.toLowerCase();

      if (currentLibraryId) {
        invoke<TagName[]>("get_all_class_tags", { libraryId: currentLibraryId }).then(all => {
          setAllClassTags(all);

          for (const tag of all) {
            if (!loadedClassIds.current.has(tag.class_id)) {
              loadedClassIds.current.add(tag.class_id);
            }
          }

          const matched = new Set<string>();
          for (const cls of tagClasses) {
            if (cls.name.toLowerCase().includes(q)) {
              matched.add(cls.id);
              let p = cls.parent_id;
              while (p) { matched.add(p); const pc = tagClasses.find(c => c.id === p); p = pc?.parent_id || null; }
            }
          }
          for (const tag of all) {
            if (tag.name.toLowerCase().includes(q)) {
              matched.add(tag.class_id);
              let p = tagClasses.find(c => c.id === tag.class_id)?.parent_id || null;
              while (p) { matched.add(p); const pc = tagClasses.find(c => c.id === p); p = pc?.parent_id || null; }
            }
          }
          setSearchMatches(matched);
          setExpandedIds(prev => { const n = new Set(prev); for (const id of matched) n.add(id); return n; });
          setSearchLoading(false);
        }).catch(() => setSearchLoading(false));
      }
    }, 150);
    return () => { if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current); };
  }, [search, tagClasses, currentLibraryId]);

  const toggleExpand = (id: string) => setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const tagMap = useMemo(() => {
    const m = new Map<string, TagName[]>();
    for (const tag of allClassTags) { if (!m.has(tag.class_id)) m.set(tag.class_id, []); m.get(tag.class_id)!.push(tag); }
    return m;
  }, [allClassTags]);

  async function refreshAllTags() {
    const all: TagName[] = [];
    for (const id of loadedClassIds.current) {
      if (tagClasses.some(c => c.id === id)) {
        try { const tags = await invoke<TagName[]>("get_class_tags", { classId: id }); all.push(...tags); } catch {}
      }
    }
    setAllClassTags(all);
  }

  async function handleCreate() {
    if (!createName.trim() || !createMode || !currentLibraryId) return;
    try {
      if (createMode.type === "class") {
        await createTagClass(currentLibraryId, createName.trim(), createMode.parentId || undefined);
        await loadTagClasses(currentLibraryId);
        setCreateMode(null); setCreateName("");
      } else {
        if (!createMode.parentId) return;
        const created = await invoke<TagName>("create_class_tag", { classId: createMode.parentId, libraryId: currentLibraryId, name: createName.trim(), color: nextTagColor() });
        if (created) {
          setTagType(created.id, createTagType);
          loadedClassIds.current.add(createMode.parentId);
          await Promise.all([refreshAllTags(), loadTagClasses(currentLibraryId)]);
          setCreateMode(null); setCreateName("");
        }
      }
    } catch (e) { console.error("创建标签失败:", e); notify({ type: "error", title: "创建标签失败", message: String(e) }); }
  }

  async function handleInlineCreate() {
    if (!inlineName.trim() || !inlineCreate || !currentLibraryId) return;
    try {
      if (inlineCreate.type === "class") {
        await createTagClass(currentLibraryId, inlineName.trim(), inlineCreate.parentId || undefined);
        await loadTagClasses(currentLibraryId);
        setInlineCreate(null); setInlineName("");
      } else {
        const created = await invoke<TagName>("create_class_tag", { classId: inlineCreate.parentId, libraryId: currentLibraryId, name: inlineName.trim(), color: nextTagColor() });
        if (created) {
          setTagType(created.id, inlineTagType);
          loadedClassIds.current.add(inlineCreate.parentId);
          await Promise.all([refreshAllTags(), loadTagClasses(currentLibraryId)]);
          setInlineCreate(null); setInlineName("");
        }
      }
    } catch (e) { console.error("内联创建失败:", e); notify({ type: "error", title: "创建失败", message: String(e) }); }
  }

  function handleSelectTag(tag: TagName) {
    setSelectedTagId(tag.id);
    setEditName(tag.name);
  }

  async function handleSaveTag() {
    if (!selectedTag || !editName.trim()) return;
    await updateClassTag({ ...selectedTag, name: editName.trim() }, currentLibraryId || undefined);
    await refreshAllTags();
    notify({ type: "success", title: "标签已保存" });
  }

  async function handleDeleteTag() {
    if (!selectedTag) return;
    await deleteClassTag(selectedTag.id, selectedTag.class_id, currentLibraryId || undefined);
    setSelectedTagId(null);
    await refreshAllTags();
  }

  function isDescendant(parentId: string, candidateId: string): boolean {
    for (const c of buildTree(tagClasses, parentId)) {
      if (c.id === candidateId) return true;
      if (isDescendant(c.id, candidateId)) return true;
    }
    return false;
  }

  useEffect(() => {
    if (selectedClass) { setEditClassName(selectedClass.name); setEditClassParent(selectedClass.parent_id); }
  }, [selectedClassId]);

  async function handleSaveClass() {
    if (!selectedClass || !editClassName.trim() || !currentLibraryId) return;
    await updateTagClass({ ...selectedClass, name: editClassName.trim(), parent_id: editClassParent });
    await loadTagClasses(currentLibraryId);
    notify({ type: "success", title: "类已更新" });
  }

  async function handleDeleteClass() {
    if (!selectedClass || !currentLibraryId) return;
    await deleteTagClass(selectedClass.id, currentLibraryId);
    setSelectedClassId(null);
    await Promise.all([loadTagClasses(currentLibraryId), refreshAllTags()]);
  }

  function renderNode(cls: TagClass, depth: number, visited?: Set<string>): React.ReactNode {
    const visitedSet = visited || new Set<string>();
    if (visitedSet.has(cls.id)) return null; // 循环引用保护
    visitedSet.add(cls.id);
    if (depth > 20) return <div key={cls.id} style={{ padding: "4px 6px 4px 20px", fontSize: 10, color: text.muted }}>⚠ 层级过深 ({cls.name})</div>;
    const children = buildTree(tagClasses, cls.id);
    const hasExpandable = children.length > 0 || cls.tag_count > 0;
    const expanded = expandedIds.has(cls.id);
    const hl = searchMatches.has(cls.id);
    const tags = tagMap.get(cls.id) || [];
    const visible = !search || hl || tags.some(t => searchMatches.has(t.class_id)) || children.some(c => searchMatches.has(c.id));
    if (!visible) return null;

    return (
      <div key={cls.id}>
        <div style={s.clsRow(selectedClassId === cls.id, depth, hl)} onClick={() => { setSelectedClassId(cls.id); setSelectedTagId(null); }} onDoubleClick={() => { if (hasExpandable) toggleExpand(cls.id); }}>
          <span style={{ width: 14, flexShrink: 0, textAlign: "center", fontSize: 8, color: accent.primary, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s", cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); toggleExpand(cls.id); }}>
            {hasExpandable ? "▶" : <span style={{ color: "transparent" }}>▶</span>}
          </span>
          <span style={{ fontSize: 12, flexShrink: 0, opacity: 0.7 }}>📁</span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: hl ? 700 : 500, color: hl ? accent.deep : text.primary, fontSize: 12 }}>
            {cls.name}
          </span>
          <span style={s.countBadge}>{cls.tag_count}</span>
          {}
          {depth >= 1 && (
            <button style={s.iconBtn} onClick={(e) => { e.stopPropagation(); setInlineCreate({ type: "tag", parentId: cls.id, parentName: cls.name }); setInlineName(""); setInlineTagType("text"); setExpandedIds(prev => { const n = new Set(prev); n.add(cls.id); return n; }); }} title="添加标签到此类">+</button>
          )}
          <button style={s.iconBtn} onClick={(e) => { e.stopPropagation(); setInlineCreate({ type: "class", parentId: cls.id, parentName: cls.name }); setInlineName(""); setExpandedIds(prev => { const n = new Set(prev); n.add(cls.id); return n; }); }} title="添加子类">⊞</button>
          <button style={s.iconBtn} onClick={async (e) => {
            e.stopPropagation();
            if (!currentLibraryId) return;
            await deleteTagClass(cls.id, currentLibraryId);
            if (selectedTagId && tags.some(t => t.id === selectedTagId)) setSelectedTagId(null);
            await Promise.all([loadTagClasses(currentLibraryId), refreshAllTags()]);
          }} title="删除">✕</button>
        </div>

        {expanded && (
          <div>
            {children.map(c => renderNode(c, depth + 1, new Set(visitedSet)))}
            {tags.map(tag => {
              const tagHl = search && tag.name.toLowerCase().includes(search.toLowerCase());
              return (
                <div key={tag.id} style={s.tagRow(selectedTagId === tag.id, depth + 1)}
                  onClick={() => handleSelectTag(tag)}>
                  <span style={{ fontSize: 10, flexShrink: 0, color: tag.color || text.muted, opacity: 0.8 }}>#</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: tagHl ? 700 : 400, color: tagHl ? accent.deep : (selectedTagId === tag.id ? accent.deep : text.secondary), fontSize: 11 }}>{tag.name}</span>
                  <span style={s.countBadge}>{tag.video_count}</span>
                </div>
              );
            })}
            {}
            {inlineCreate && inlineCreate.parentId === cls.id && (
              <div style={{ display: "flex", alignItems: "center", gap: 4, padding: `4px 6px 4px ${28 + (depth + 1) * 20}px` }}>
                <input value={inlineName} onChange={e => setInlineName(e.target.value)}
                  placeholder={inlineCreate.type === "tag" ? "输入标签名..." : "输入子类名..."}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") handleInlineCreate();
                    if (e.key === "Escape") setInlineCreate(null);
                  }}
                  style={{ flex: 1, padding: "3px 8px", borderRadius: 3, background: bg.input, border: `1px solid ${accent.deep}`, color: text.primary, fontSize: 10, outline: "none" }} />
                {inlineCreate.type === "tag" && (
                  <select value={inlineTagType} onChange={e => setInlineTagType(e.target.value as TagType)}
                    style={{ padding: "3px 4px", borderRadius: 3, background: bg.input, border: `1px solid ${border.default}`, color: text.primary, fontSize: 9, cursor: "pointer", outline: "none" }}>
                    {(["text", "path", "url"] as TagType[]).map(t => <option key={t} value={t}>{TAG_TYPE_CONFIG[t].icon} {TAG_TYPE_CONFIG[t].label}</option>)}
                  </select>
                )}
                <button onClick={handleInlineCreate}
                  style={{ width: 20, height: 20, borderRadius: 3, border: "none", background: accent.deep, color: "#fff", cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</button>
                <button onClick={() => setInlineCreate(null)}
                  style={{ width: 20, height: 20, borderRadius: 3, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={s.overlay} onClick={() => closeDialog("tag-manager")}>
      <div style={s.container} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.headerTitle}>🏷 标签管理</span>
          <button style={s.closeBtn} onClick={() => closeDialog("tag-manager")}>✕</button>
        </div>

        <div style={s.body}>
          {}
          <div style={s.treePanel}>
            <div style={s.searchBox}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12, color: text.muted, flexShrink: 0 }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input style={s.searchInput} placeholder="搜索类或标签..." value={search} onChange={e => setSearch(e.target.value)}
                onFocus={e => { e.currentTarget.style.borderColor = accent.deep; e.currentTarget.style.boxShadow = `0 0 0 2px ${accent.deep}20`; }}
                onBlur={e => { e.currentTarget.style.borderColor = border.default; e.currentTarget.style.boxShadow = "none"; }} />
              {searchLoading && (
                <span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid transparent", borderTopColor: accent.primary, borderRadius: "50%", animation: "tt-spin .5s linear infinite", flexShrink: 0 }} />
              )}
              {search && (
                <span onClick={() => setSearch("")} style={{ fontSize: 9, color: text.muted, cursor: "pointer", padding: "1px 4px", borderRadius: 3, background: bg.surface, lineHeight: "14px", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${accent.deep}20`; e.currentTarget.style.color = accent.deep; }}
                  onMouseLeave={e => { e.currentTarget.style.background = bg.surface; e.currentTarget.style.color = text.muted; }}>✕</span>
              )}
              <button style={s.iconBtn} onClick={() => setExpandedIds(new Set(tagClasses.map(c => c.id)))} title="展开全部">⊞</button>
              <button style={s.iconBtn} onClick={() => setExpandedIds(new Set())} title="折叠全部">⊟</button>
            </div>
            <div style={s.treeScroll}>
              {tagClasses.length === 0 && <div style={{ padding: 30, textAlign: "center", color: text.muted, fontSize: 11 }}>暂无标签类</div>}
              {rootClasses.map(cls => renderNode(cls, 0))}
            </div>
            <div style={s.treeActions}>
              <button style={s.btn(accent.deep, "#fff")} onClick={() => { setCreateMode({ type: "class", parentId: undefined, parentName: undefined }); setCreateName(""); }}>+ 新建根类</button>
              <button style={s.btn(status.info.bg, status.info.color)} onClick={() => setExpandedIds(new Set(tagClasses.map(c => c.id)))}>展开全部</button>
            </div>
          </div>

          {}
          <div style={s.rightPanel}>
            {createMode ? (
              
              <div style={s.rightScroll}>
                <div style={{ fontSize: 12, fontWeight: 600, color: text.primary, marginBottom: 12 }}>
                  {createMode.type === "class" ? "📁 新建" : "🏷 新建标签"}
                  {createMode.parentName && <span style={{ color: text.muted, fontWeight: 400 }}> → {createMode.parentName}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={s.detailLabel}>名称</div>
                    <input style={s.detailInput} value={createName} onChange={e => setCreateName(e.target.value)}
                      placeholder={createMode.type === "class" ? "输入类名称..." : "输入标签名称..."}
                      autoFocus
                      onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreateMode(null); }} />
                  </div>
                  {createMode.type === "tag" && (
                    <div>
                      <div style={s.detailLabel}>标签类型</div>
                      <select value={createTagType} onChange={e => setCreateTagType(e.target.value as TagType)}
                        style={{ ...s.detailInput, cursor: "pointer" }}>
                        {(["text", "path", "url"] as TagType[]).map(t => <option key={t} value={t}>{TAG_TYPE_CONFIG[t].icon} {TAG_TYPE_CONFIG[t].label}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button style={s.btn(accent.deep, "#fff")} onClick={handleCreate}>✓ 确认创建</button>
                    <button style={s.btn(bg.surface, text.secondary)} onClick={() => setCreateMode(null)}>取消</button>
                  </div>
                </div>
              </div>
            ) : selectedTag ? (
              
              <div style={s.rightScroll}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: text.primary }}>🏷 标签详情</div>
                  <button style={s.iconBtn} onClick={() => setSelectedTagId(null)} title="关闭详情">✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={s.detailLabel}>名称</div>
                    <input style={s.detailInput} value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveTag(); }} />
                  </div>
                  <div>
                    <div style={s.detailLabel}>类型</div>
                    <select value={getTagType(selectedTag.id)} onChange={e => { setTypeLoading(true); setTagType(selectedTag.id, e.target.value as TagType); setTagTypeVersion(v => v + 1); setTimeout(() => setTypeLoading(false), 300); }}
                      style={{ ...s.detailInput, cursor: "pointer" }}>
                      {(["text", "path", "url"] as TagType[]).map(t => <option key={t} value={t}>{TAG_TYPE_CONFIG[t].icon} {TAG_TYPE_CONFIG[t].label}</option>)}
                    </select>
                    {typeLoading && <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid transparent", borderTopColor: accent.primary, borderRadius: "50%", animation: "tt-spin .5s linear infinite", flexShrink: 0, marginLeft: 4 }} />}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: text.muted }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: selectedTag.color || text.muted }} />
                    <span>#{selectedTag.name}</span>
                    <span key={tagTypeVersion} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: accent.tint, color: accent.deep }}>
                      {TAG_TYPE_CONFIG[getTagType(selectedTag.id)].icon} {TAG_TYPE_CONFIG[getTagType(selectedTag.id)].label}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: text.muted, display: "flex", gap: 12 }}>
                    <span>关联视频：{selectedTag.video_count} 个</span>
                    <span>所属：{tagClasses.find(c => c.id === selectedTag.class_id)?.name || "—"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={s.btn(accent.deep, "#fff")} onClick={handleSaveTag}>💾 保存</button>
                    <button style={s.btn(status.error.color, "#fff")} onClick={handleDeleteTag}>🗑 删除</button>
                  </div>
                </div>
              </div>
            ) : selectedClass ? null : (
              <div style={s.emptyRight}>
                <div>
                  <div style={{ fontSize: 24, opacity: 0.15, marginBottom: 8 }}>🏷</div>
                  <div style={{ fontSize: 13, color: text.secondary, marginBottom: 4 }}>选择类或标签查看详情</div>
                  <div style={{ fontSize: 10 }}>或在左侧点击 + 新建</div>
                </div>
              </div>
            )}
            {}
            {selectedClass && !createMode && (
              <div style={s.rightScroll}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: text.primary }}>📁 类详情</div>
                  <button style={s.iconBtn} onClick={() => { setSelectedClassId(null); setSelectedTagId(null); }} title="关闭详情">✕</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <div style={s.detailLabel}>名称</div>
                    <input style={s.detailInput} value={editClassName} onChange={e => setEditClassName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveClass(); }} />
                  </div>
                  <div>
                    <div style={s.detailLabel}>父类</div>
                    <select value={editClassParent || ""} onChange={e => setEditClassParent(e.target.value || null)}
                      style={{ ...s.detailInput, cursor: "pointer" }}>
                      <option value="">（无父类 — 根节点）</option>
                      {tagClasses
                        .filter(c => c.id !== selectedClass.id && !isDescendant(selectedClass.id, c.id))
                        .map(c => <option key={c.id} value={c.id}>{'—'.repeat(getClassDepth(c.id))} {c.name}</option>)}
                    </select>
                  </div>
                  <div style={{ fontSize: 10, color: text.muted, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>层级深度：L{getClassDepth(selectedClass.id)}</span>
                    <span>子类数：{buildTree(tagClasses, selectedClass.id).length}</span>
                    <span>标签数：{(tagMap.get(selectedClass.id) || []).length}</span>
                  </div>
                  <div style={{
                    fontSize: 9, padding: "6px 10px", borderRadius: 4,
                    background: getClassDepth(selectedClass.id) === 0 ? status.warning.bg : accent.tint,
                    color: getClassDepth(selectedClass.id) === 0 ? status.warning.color : accent.deep,
                    lineHeight: 1.5,
                  }}>
                    {getClassDepth(selectedClass.id) === 0
                      ? "⚠ 根节点不可直接挂载标签，请先创建子类"
                      : "✅ 该层级下可挂载标签"
                    }
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={s.btn(accent.deep, "#fff")} onClick={handleSaveClass}>💾 保存</button>
                    <button style={s.btn(status.error.color, "#fff")} onClick={handleDeleteClass}>🗑 删除</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {}
        <div style={s.bottomBar}>
          <button style={s.btn(accent.deep, "#fff")} onClick={async () => {
            if (!currentLibraryId) return;
            const tree = await saveTagTemplate(currentLibraryId);
            if (!tree?.length) { notify({ type: "warning", title: "没有可导出的标签" }); return; }
            try {
              const { save } = await import('@tauri-apps/api/dialog');
              const path = await save({ defaultPath: `tag-template-${Date.now()}.json`, filters: [{ name: 'JSON 模板', extensions: ['json'] }] });
              if (!path) return;
              const { writeTextFile } = await import('@tauri-apps/api/fs');
              await writeTextFile(path, JSON.stringify(tree, null, 2));
              notify({ type: "success", title: "模板已导出", message: `${tree.length} 个类 → ${path}` });
            } catch (e) { notify({ type: "error", title: "导出失败", message: String(e) }); }
          }}>📤 导出模板</button>
          <button style={s.btn(status.info.bg, status.info.color)} onClick={async () => {
            if (!currentLibraryId) return;
            try {
              const { open } = await import('@tauri-apps/api/dialog');
              const sel = await open({ filters: [{ name: 'JSON 模板', extensions: ['json'] }], multiple: false, title: '选择模板文件' });
              if (!sel) return;
              const path = sel as string;
              const { readTextFile } = await import('@tauri-apps/api/fs');
              const content = await readTextFile(path);
              const tree = JSON.parse(content);
              if (!Array.isArray(tree)) { notify({ type: "error", title: "无效的模板文件" }); return; }
              if (!await showConfirm({ title: "导入标签模板", message: `从文件导入将创建模板中定义的 ${tree.length} 个根类及其子类与标签，是否继续？`, confirmText: "导入" })) return;
              await loadTagTemplate(currentLibraryId, tree);
            } catch (e) { notify({ type: "error", title: "导入失败", message: String(e) }); }
          }}>📥 导入模板</button>
          <button style={{ ...s.btn(bg.surface, text.secondary), marginLeft: "auto" }} onClick={() => closeDialog("tag-manager")}>关闭</button>
        </div>
      </div>
    </div>
  );
}
