/**
 * LibrarySettings — 库设置对话框（树状导航）
 *
 * 导航树：
 *   ℹ️ 基础信息
 *   🃏 卡片显示
 *   🔍 扫描规则 (折叠/展开)
 *     ├─ 🗂️ 扫描路径
 *     ├─ 📐 分类规则
 *     ├─ 🎯 置信度阈值
 *     ├─ ⚙️ 扫描参数
 *     └─ 🎵 音频配对
 *   👁️ 扫描预览
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAppStore } from "../../../store/appStore";
import { invoke, isTauri } from "../../../tauri-invoke";
import { notify } from "../../../components/Notification";
import SaveStatusBar from "../../../components/SaveStatusBar";
import { useAutoSave } from "../../../hooks/useAutoSave";
import TagTree from "../components/TagTree";
import type { Category, VideoLibrary } from "../../../types";
import { useTheme } from "../../../theme/useTheme";

const navTree = [
  { id: "basic", label: "基础信息", icon: "ℹ️" },
  { id: "display", label: "卡片显示", icon: "🃏" },
  {
    id: "scan", label: "扫描规则", icon: "🔍",
    children: [
      { id: "scan-path", label: "扫描路径", icon: "🗂️" },
      { id: "scan-params", label: "扫描参数", icon: "⚙️" },
    ],
  },
];

const PAGE_LABELS: Record<string, string> = {
  basic: "基础信息", display: "卡片显示",
  "scan-path": "扫描路径", "scan-params": "扫描参数",
};

const CARD_INFO_TREE: Record<string, { label: string; icon: string; children: { key: string; label: string }[] }> = {
  tech_params: { label: "技术参数", icon: "⚙", children: [
    { key: "resolution", label: "分辨率" }, { key: "codec", label: "编码格式" },
    { key: "fps", label: "帧率" }, { key: "bitrate", label: "码率" },
    { key: "video_codec_profile", label: "编码配置" }, { key: "pix_fmt", label: "像素格式" },
    { key: "time_base", label: "时基" }, { key: "codec_level", label: "编码等级" },
    { key: "encoder", label: "编码器" }, { key: "audio_codec", label: "音频编码" },
    { key: "audio_sample_rate", label: "采样率" }, { key: "audio_channels", label: "声道数" },
    { key: "audio_profile", label: "音频配置" },
  ]},
  tags_group: { label: "标签", icon: "🏷", children: [{ key: "tags", label: "标签" }] },
  file_info: { label: "文件信息", icon: "📄", children: [
    { key: "size", label: "文件大小" }, { key: "date", label: "添加日期" },
    { key: "duration", label: "视频时长" }, { key: "format", label: "文件格式" },
  ]},
  other: { label: "其他", icon: "⭐", children: [{ key: "favorite", label: "收藏状态" }] },
};

const ALL_FIELD_KEYS = Object.values(CARD_INFO_TREE).flatMap(g => g.children.map(c => c.key));

interface ScanPathEntry { id: number; path: string; enabled: boolean; }
interface CoverScanRule { id: number; rule: string; priority: number; enabled: boolean; }

export default function LibrarySettings() {
  const { bg, border, accent, text, status: statusColors } = useTheme();
  const { closeDialog, currentLibraryId, categories, loadCategories, loadTagClasses, libraries, tagClasses, classTags } = useAppStore();

  const baseInput: React.CSSProperties = {
    padding: "6px 10px", background: bg.input, border: `1px solid ${border.default}`,
    borderRadius: 4, color: text.primary, fontSize: 11, outline: "none",
  };
  const baseSelect: React.CSSProperties = { ...baseInput, cursor: "pointer" };
  const toggleBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 4, fontSize: 10,
    border: active ? "none" : `1px solid ${border.default}`,
    background: active ? accent.deep : bg.surface,
    color: active ? "#fff" : text.secondary, cursor: "pointer",
  });

  const parentFor = (id: string) => navTree.find(n => "children" in n && n.children?.some(c => c.id === id))?.id || null;

  const [activeSection, setActiveSectionRaw] = useState("basic");
  const [scanExpanded, setScanExpanded] = useState(true);
  const [scanSubSection, setScanSubSection] = useState("scan-path");

  const setActiveSection = (id: string) => {
    const parent = parentFor(id);
    if (parent === "scan") { setScanExpanded(true); setScanSubSection(id); }
    setActiveSectionRaw(id);
  };

  const effectiveSection = parentFor(activeSection) === "scan" ? scanSubSection : activeSection;

  const [libName, setLibName] = useState("");
  const [libDesc, setLibDesc] = useState("");
  const [libIcon, setLibIcon] = useState("📁");
  const [libCategory, setLibCategory] = useState("");
  const [libStatus, setLibStatus] = useState("正常");
  const [scanPaths, setScanPaths] = useState<ScanPathEntry[]>([]);
  const [formatMode, setFormatMode] = useState<"whitelist" | "blacklist">("whitelist");
  const [formatList, setFormatList] = useState("");
  const [coverScanRules, setCoverScanRules] = useState<CoverScanRule[]>([]);
  const [showFields, setShowFields] = useState<string[]>(["size", "date", "resolution"]);
  const persistShowFields = useCallback((fields: string[]) => {
    useAppStore.getState().setCardInfoFields(fields);
  }, []);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [cardDisplayTagIds, setCardDisplayTagIds] = useState<string[]>([]);
  const showFieldsRef = useRef(showFields);
  showFieldsRef.current = showFields;
  // 当 cardDisplayTagIds 变化时同步 showFields（从 updater 移出，避免 zustand store 在渲染期间更新）
  useEffect(() => {
    const cur = showFieldsRef.current;
    const hasTags = cardDisplayTagIds.length > 0;
    const alreadyHasTags = cur.includes("tags");
    if (hasTags && !alreadyHasTags) {
      const nf = [...cur, "tags"];
      setShowFields(nf);
      useAppStore.getState().setCardInfoFields(nf);
    } else if (!hasTags && alreadyHasTags) {
      const nf = cur.filter(k => k !== "tags");
      setShowFields(nf);
      useAppStore.getState().setCardInfoFields(nf);
    }
  }, [cardDisplayTagIds]);

  // 扫描规则配置
  const [classifyRules, setClassifyRules] = useState<string>("[]");
  const [confidenceThresholds, setConfidenceThresholds] = useState<string>("{}");
  const [scanParams, setScanParams] = useState<string>("{}");
  const [audioPairRules, setAudioPairRules] = useState<string>("[]");

  const statusMapR: Record<string, string> = { normal: "正常", archived: "归档", hidden: "隐藏", locked: "锁定" };
  const statusMap: Record<string, string> = { "正常": "normal", "归档": "archived", "隐藏": "hidden", "锁定": "locked" };
  const COMMON_FORMATS = [{ category: "视频", formats: [".mp4", ".mov", ".avi", ".mkv", ".webm", ".flv", ".wmv", ".m4v", ".ts"] }];

  const currentLib: VideoLibrary | undefined = Object.values(libraries).flat().find(l => l?.id === currentLibraryId);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!currentLibraryId) return;
    initializedRef.current = false;
    if (categories.length === 0) loadCategories();
    loadTagClasses(currentLibraryId);
  }, [currentLibraryId]);

  useEffect(() => {
    if (!currentLib || initializedRef.current) return;
    initializedRef.current = true;
    setLibName(currentLib.name || "");
    setLibDesc(currentLib.description || "");
    setLibIcon(currentLib.icon || "📁");
    const cat = categories.find(c => c.id === currentLib.category_id);
    if (cat) setLibCategory(cat.name);
    setLibStatus(statusMapR[currentLib.status] || "正常");

    let parsedPaths: ScanPathEntry[] = [];
    const rawScanPaths = currentLib.scan_paths as any;
    if (Array.isArray(rawScanPaths)) {
      parsedPaths = rawScanPaths.map((p: any, i: number) => ({ id: i + 1, path: p.path || (typeof p === 'string' ? p : ''), enabled: p.enabled !== false }));
    } else if (typeof rawScanPaths === "string") {
      const trimmed = rawScanPaths.trim();
      if (trimmed.startsWith('[')) {
        try { const parsed = JSON.parse(trimmed); if (Array.isArray(parsed)) parsedPaths = parsed.map((p: any, i: number) => ({ id: i + 1, path: p.path || (typeof p === 'string' ? p : ''), enabled: p.enabled !== false })); } catch {}
      } else if (trimmed) { parsedPaths = trimmed.split(',').map((p: string, i: number) => ({ id: i + 1, path: p.trim(), enabled: true })); }
    }
    if (parsedPaths.length === 0) parsedPaths = [{ id: 1, path: '', enabled: true }];
    setScanPaths(parsedPaths);

    setFormatMode((currentLib.filter_mode as "whitelist" | "blacklist") || "whitelist");
    const rawFormats = currentLib.filter_formats as any;
    setFormatList(Array.isArray(rawFormats) ? rawFormats.join(", ") : (rawFormats || ".mp4, .mov, .avi, .mkv, .webm, .flv"));

    let parsedRules: CoverScanRule[] = [];
    const rawCoverRules = (currentLib as any).cover_rules ?? (currentLib as any).cover_scan_rules;
    if (Array.isArray(rawCoverRules)) {
      parsedRules = rawCoverRules.map((r: any, i: number) => ({ id: i + 1, rule: r.rule || '', priority: r.priority || i + 1, enabled: r.enabled !== false }));
    } else if (typeof rawCoverRules === "string" && rawCoverRules.trim()) {
      try { const parsed = JSON.parse(rawCoverRules); if (Array.isArray(parsed)) parsedRules = parsed.map((r: any, i: number) => ({ id: i + 1, rule: r.rule || '', priority: r.priority || i + 1, enabled: r.enabled !== false })); } catch {}
    }
    if (parsedRules.length === 0) parsedRules = [
      { id: 1, rule: './*.jpg', priority: 1, enabled: true },
      { id: 2, rule: './*.JPG', priority: 2, enabled: true },
      { id: 3, rule: './*.png', priority: 3, enabled: true },
    ];
    setCoverScanRules(parsedRules);

    if ((currentLib as any).card_info_fields) {
      try { const parsed = JSON.parse((currentLib as any).card_info_fields); if (Array.isArray(parsed)) { setShowFields(parsed); useAppStore.getState().setCardInfoFields(parsed); } } catch {}
    }
    if ((currentLib as any).card_tag_ids) {
      try { const parsed = JSON.parse((currentLib as any).card_tag_ids); if (Array.isArray(parsed)) setCardDisplayTagIds(parsed); } catch {}
    }
    try { const savedExpanded = localStorage.getItem("cardDisplayExpanded"); if (savedExpanded) { const parsed = JSON.parse(savedExpanded); if (Array.isArray(parsed) && parsed.length > 0) setExpandedGroups(new Set(parsed)); } } catch {}

    // 加载扫描规则配置
    const lib = currentLib as any;
    if (lib.classify_rules) setClassifyRules(lib.classify_rules);
    if (lib.confidence_thresholds) setConfidenceThresholds(lib.confidence_thresholds);
    if (lib.scan_params) setScanParams(lib.scan_params);
    if (lib.audio_pair_rules) setAudioPairRules(lib.audio_pair_rules);
  }, [currentLib, categories]);

  const saveFn = useCallback(async () => {
    if (!currentLibraryId) return;
    const scanPathsJson = JSON.stringify(scanPaths.map(p => ({ path: p.path, enabled: p.enabled })));
    const coverScanRulesJson = JSON.stringify(coverScanRules.map(r => ({ rule: r.rule, priority: r.priority, enabled: r.enabled })));
    const cat = categories.find(c => c.name === libCategory);
    try {
      await invoke("update_library", {
        id: currentLibraryId, name: libName, description: libDesc, icon: libIcon,
        categoryId: cat?.id || "", status: statusMap[libStatus] || "normal",
        scanPaths: scanPathsJson, coverScanRules: coverScanRulesJson,
        filterFormats: formatList, filterMode: formatMode,
        cardInfoFields: JSON.stringify(showFields), cardTagIds: JSON.stringify(cardDisplayTagIds),
        classifyRules, confidenceThresholds, scanParams, audioPairRules,
      });
      const categoryId = cat?.id || (currentLib as any)?.category_id;
      if (categoryId) useAppStore.getState().loadLibraries(categoryId);
    } catch (err) { console.error("保存库配置失败:", err); }
  }, [currentLibraryId, currentLib, libName, libDesc, libIcon, libCategory, libStatus, scanPaths, coverScanRules, formatList, formatMode, categories, statusMap, showFields, cardDisplayTagIds, classifyRules, confidenceThresholds, scanParams, audioPairRules]);

  const { status: saveStatus, save: forceSave } = useAutoSave(saveFn,
    [libName, libDesc, libIcon, libCategory, libStatus, scanPaths, formatMode, formatList, coverScanRules, showFields, cardDisplayTagIds, classifyRules, confidenceThresholds, scanParams, audioPairRules],
    { showNotification: true, successTitle: "库配置已保存", errorTitle: "库配置保存失败" });

  const handleClose = useCallback(async () => {
    await forceSave();
    try { localStorage.setItem("cardDisplayExpanded", JSON.stringify([...expandedGroups])); } catch {}
    closeDialog("library-settings");
  }, [forceSave, closeDialog, expandedGroups]);
  const handleCancel = handleClose;
  const handleCancelRef = useRef(handleCancel);
  handleCancelRef.current = handleCancel;

  // Escape 关闭（使用 ref 避免依赖变化导致事件反复绑定）
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") handleCancelRef.current(); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  const addScanPath = async () => {
    const maxId = scanPaths.length > 0 ? Math.max(...scanPaths.map(p => p.id)) : 0;
    const selectedPath = await pickFolder();
    if (!selectedPath) return;
    setScanPaths([...scanPaths, { id: maxId + 1, path: selectedPath, enabled: true }]);
  };
  const removeScanPath = (id: number) => setScanPaths(scanPaths.filter(p => p.id !== id));
  const updateScanPath = (id: number, field: "path" | "enabled", value: string | boolean) => {
    setScanPaths(scanPaths.map(p => (p.id === id ? { ...p, [field]: value } : p)));
  };
  const toggleFormat = (fmt: string) => {
    const current = formatList.split(",").map(s => s.trim()).filter(Boolean);
    const idx = current.indexOf(fmt);
    if (idx >= 0) current.splice(idx, 1); else current.push(fmt);
    setFormatList(current.join(", "));
  };
  const selectAllFormats = () => setFormatList(COMMON_FORMATS.flatMap(g => g.formats).join(", "));
  const clearFormats = () => setFormatList("");
  const pickFolder = async (): Promise<string> => {
    if (isTauri()) {
      try { const { open } = await import('@tauri-apps/api/dialog'); const selected = await open({ directory: true, multiple: false, title: '选择扫描路径' }); if (selected && typeof selected === 'string') return selected; } catch {}
    }
    return "";
  };

  // ── 渲染函数 ──

  const renderBasic = () => (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>视频库名称</span>
        <input style={baseInput} value={libName} onChange={e => setLibName(e.target.value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>简介</span>
        <textarea style={{ ...baseInput, minHeight: 50, resize: "vertical" }} value={libDesc} onChange={e => setLibDesc(e.target.value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>图标</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input style={{ ...baseInput, flex: 1 }} value={libIcon} onChange={e => setLibIcon(e.target.value)} placeholder="输入 emoji 或上传图片" />
          <span style={{ fontSize: 20, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {libIcon.startsWith("data:") ? <img src={libIcon} style={{ width: 20, height: 20, borderRadius: 4, objectFit: "cover" }} /> : libIcon}
          </span>
          <button style={{ padding: "4px 10px", borderRadius: 4, fontSize: 10, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={async () => {
              if (!isTauri()) {
                const input = document.createElement("input"); input.type = "file"; input.accept = "image/*";
                input.onchange = (e: any) => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = () => setLibIcon(r.result as string); r.readAsDataURL(file); } };
                input.click(); return;
              }
              try {
                const { open } = await import('@tauri-apps/api/dialog');
                const selected = await open({ multiple: false, filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"] }] });
                if (!selected || typeof selected !== "string") return;
                const dataUrl: string = await invoke("read_file_as_data_url", { path: selected, maxWidth: 64 });
                setLibIcon(dataUrl);
              } catch (err) { notify({ type: "error", title: "上传图标失败", message: String(err) }); }
            }}>上传图片</button>
          <button style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, border: "none", background: "transparent", color: text.muted, cursor: "pointer" }} onClick={() => setLibIcon("📁")}>重置</button>
        </div>
        {libIcon.startsWith("data:") && <div style={{ fontSize: 9, color: text.muted, marginTop: 2 }}>图片已编码（{(libIcon.length / 1024).toFixed(1)} KB）</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>归属大类</span>
        <select style={baseSelect} value={libCategory} onChange={e => setLibCategory(e.target.value)}>
          {categories.map((cat: Category) => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>库状态</span>
        <select style={baseSelect} value={libStatus} onChange={e => setLibStatus(e.target.value)}>
          <option>正常</option><option>归档</option><option>隐藏</option><option>锁定</option>
        </select>
      </div>
    </>
  );

  const renderDisplay = () => (
    <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: text.primary, fontWeight: 600 }}>信息字段</span>
          <span style={{ fontSize: 10, color: text.muted }}>{showFields.length}/{ALL_FIELD_KEYS.length} 显示</span>
        </div>
        {Object.entries(CARD_INFO_TREE).map(([groupId, group]) => {
          const isExpanded = expandedGroups.has(groupId);
          const checkedCount = groupId === "tags_group" ? cardDisplayTagIds.length : group.children.filter(c => showFields.includes(c.key)).length;
          return (
            <div key={groupId}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, userSelect: "none", cursor: "default", transition: "background 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.background = `${accent.deep}06`; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; }}
                onDoubleClick={() => { const n = new Set(expandedGroups); n.has(groupId) ? n.delete(groupId) : n.add(groupId); setExpandedGroups(n); }}>
                <span style={{ fontSize: 8, color: accent.primary, cursor: "pointer", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "none", opacity: 0.5 }}
                  onClick={e => { e.stopPropagation(); const n = new Set(expandedGroups); n.has(groupId) ? n.delete(groupId) : n.add(groupId); setExpandedGroups(n); }}>▶</span>
                <span style={{ fontSize: 11 }}>{group.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: text.primary }}>{group.label}</span>
                <span style={{ fontSize: 9, color: text.muted, marginLeft: "auto" }}>{groupId === "tags_group" ? cardDisplayTagIds.length : `${checkedCount}/${group.children.length}`}</span>
              </div>
              {isExpanded && (
                <div style={{ paddingLeft: groupId === "tags_group" ? 8 : 24, display: "flex", flexDirection: "column", gap: groupId === "tags_group" ? 2 : 1 }}>
                  {groupId === "tags_group" ? (
                    <div style={{ padding: "4px 8px" }}>
                      <div style={{ fontSize: 9, color: text.muted, marginBottom: 4 }}>已选 {cardDisplayTagIds.length} 个标签</div>
                      <TagTree tagClasses={tagClasses} allTags={classTags} selectedIds={cardDisplayTagIds}
                        onToggle={tagId => {
                          setCardDisplayTagIds(prev =>
                            prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
                          );
                        }} mode="select" simple maxHeight={200} />
                    </div>
                  ) : group.children.map(child => {
                    const isShowing = showFields.includes(child.key);
                    return (
                      <div key={child.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 4, background: isShowing ? bg.base : "transparent", opacity: isShowing ? 1 : 0.5, transition: "all 0.15s" }}>
                        <div style={{ display: "flex", gap: 1, opacity: 0.25 }}>
                          <button style={{ padding: "1px 3px", borderRadius: 2, fontSize: 7, border: "none", background: "transparent", color: text.muted, cursor: "pointer" }}
                            onClick={e => { e.stopPropagation(); const n = [...showFields]; const p = n.indexOf(child.key); if (p > 0) { [n[p - 1], n[p]] = [n[p], n[p - 1]]; setShowFields(n); persistShowFields(n); } }}>▲</button>
                          <button style={{ padding: "1px 3px", borderRadius: 2, fontSize: 7, border: "none", background: "transparent", color: text.muted, cursor: "pointer" }}
                            onClick={e => { e.stopPropagation(); const n = [...showFields]; const p = n.indexOf(child.key); if (p >= 0 && p < n.length - 1) { [n[p], n[p + 1]] = [n[p + 1], n[p]]; setShowFields(n); persistShowFields(n); } }}>▼</button>
                        </div>
                        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", flex: 1, padding: "1px 0" }}>
                          <input type="checkbox" checked={isShowing} onChange={() => { const n = isShowing ? showFields.filter(k => k !== child.key) : [...showFields, child.key]; setShowFields(n); persistShowFields(n); }}
                            style={{ accentColor: accent.deep, width: 11, height: 11, cursor: "pointer" }} />
                          <span style={{ fontSize: 11, color: isShowing ? text.primary : text.muted }}>{child.label}</span>
                        </label>
                        <span style={{ fontSize: 9, color: text.muted, opacity: 0.3, minWidth: 14, textAlign: "right" }}>{(showFields.indexOf(child.key) + 1) || "—"}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12, color: text.primary, fontWeight: 600 }}>卡片预览</span>
        <div style={{ width: "100%", background: bg.elevated, borderRadius: 8, overflow: "hidden", border: `1px solid ${border.default}` }}>
          <div style={{ aspectRatio: "16 / 9", background: `linear-gradient(135deg,${bg.panel},${bg.sidebar})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: 5, right: 5, background: "rgba(0,0,0,0.8)", color: "#d1d5db", fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 3 }}>00:30</div>
          </div>
          <div style={{ padding: "8px 10px 7px" }}>
            <div style={{ fontSize: 11, color: text.primary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 3 }}>示例视频.mp4</div>
            <div style={{ display: "flex", gap: 4, columnGap: 6, fontSize: 8, color: text.muted, flexWrap: "wrap", lineHeight: 1.4 }}>{showFields.map(key => {
              if (key === "tags") {
                const tagStrs = cardDisplayTagIds.map(id => { const n = classTags.find(t => t.id === id)?.name; return n ? `${n}: 示例值` : null; }).filter(Boolean);
                return tagStrs.length > 0 ? <span key={key} style={{ color: accent.primary }}>🏷 {tagStrs.slice(0, 2).join("  ")}{tagStrs.length > 2 ? ` +${tagStrs.length - 2}` : ""}</span> : null;
              }
              const vals: Record<string, string> = { size: "1.2 GB", date: "2026-01-01", duration: "0.5 时", resolution: "1080p", codec: "h264", fps: "30fps", bitrate: "2.5 Mbps", video_codec_profile: "High", pix_fmt: "yuv420p", time_base: "1/60", codec_level: "4.1", encoder: "x264", audio_codec: "aac", audio_sample_rate: "44.1 kHz", audio_channels: "立体声", audio_profile: "LC", format: "mp4", favorite: "★" };
              return vals[key] ? <span key={key}>{vals[key]}</span> : null;
            })}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: text.muted, opacity: 0.6, lineHeight: 1.5 }}>点击分组展开/折叠 · ▲▼ 调整排序</div>
      </div>
    </div>
  );

  // ── 扫描子页面 ──

  const renderScanPath = () => (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>扫描目录</span>
          <button style={{ padding: "3px 10px", borderRadius: 4, fontSize: 10, border: "none", background: accent.deep, color: "#fff", cursor: "pointer" }} onClick={addScanPath}>+ 添加路径</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {scanPaths.map(entry => (
            <div key={entry.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button style={{ ...toggleBtn(entry.enabled), padding: "4px 8px", fontSize: 10, minWidth: 50 }} onClick={() => updateScanPath(entry.id, "enabled", !entry.enabled)}>{entry.enabled ? "已启用" : "已禁用"}</button>
              <input style={{ ...baseInput, flex: 1 }} value={entry.path} onChange={e => updateScanPath(entry.id, "path", e.target.value)} placeholder="输入扫描路径..." />
              <button style={{ padding: "4px 8px", borderRadius: 4, fontSize: 12, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer", lineHeight: 1 }}
                onClick={async () => { const s = await pickFolder(); if (s) updateScanPath(entry.id, "path", s); }}>📁</button>
              <button style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, border: "none", background: statusColors.error.color, color: "#fff", cursor: "pointer", opacity: scanPaths.length > 1 ? 1 : 0.4 }}
                disabled={scanPaths.length <= 1} onClick={() => removeScanPath(entry.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>文件格式</span>
        <div style={{ display: "flex", gap: 6 }}><button style={toggleBtn(formatMode === "whitelist")} onClick={() => setFormatMode("whitelist")}>白名单</button><button style={toggleBtn(formatMode === "blacklist")} onClick={() => setFormatMode("blacklist")}>黑名单</button></div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{COMMON_FORMATS.map(group => (
          <div key={group.category} style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 200 }}>
            <span style={{ fontSize: 10, color: text.muted }}>{group.category}</span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{group.formats.map(fmt => {
              const selected = formatList.split(",").map(s => s.trim()).includes(fmt);
              return <button key={fmt} onClick={() => toggleFormat(fmt)} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, border: selected ? "none" : `1px solid ${border.default}`, background: selected ? accent.deep : "transparent", color: selected ? "#fff" : text.secondary, cursor: "pointer", transition: "all 0.15s ease" }}>{fmt}</button>;
            })}</div>
          </div>
        ))}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 4 }}><button style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, border: `1px solid ${border.default}`, background: "transparent", color: text.muted, cursor: "pointer" }} onClick={selectAllFormats}>全选</button><button style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, border: `1px solid ${border.default}`, background: "transparent", color: text.muted, cursor: "pointer" }} onClick={clearFormats}>清空</button></div>
          {formatList && <span style={{ fontSize: 9, color: text.muted }}>已选 {formatList.split(",").map(s => s.trim()).filter(Boolean).length} 种格式</span>}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${border.default}`, margin: "8px 0 4px" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: text.primary, fontWeight: 600 }}>封面扫描规则</span>
        <button style={{ padding: "3px 10px", borderRadius: 4, fontSize: 10, border: "none", background: accent.deep, color: "#fff", cursor: "pointer" }}
          onClick={() => { const maxId = coverScanRules.length > 0 ? Math.max(...coverScanRules.map(r => r.id)) : 0; setCoverScanRules([...coverScanRules, { id: maxId + 1, rule: "", priority: coverScanRules.length + 1, enabled: true }]); }}>+ 添加规则</button>
      </div>
      <div style={{ fontSize: 10, color: text.muted, margin: "-2px 0 6px" }}>支持 {"{filename}"} 视频名、{"{exts}"} 全部封面格式</div>
      {coverScanRules.map(rule => (
        <div key={rule.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
          <input style={{ ...baseInput, flex: 1, fontSize: 10 }} value={rule.rule} onChange={e => setCoverScanRules(prev => prev.map(r => r.id === rule.id ? { ...r, rule: e.target.value } : r))} placeholder='例如: "{filename}.jpg"' />
          <div style={{ display: "flex", gap: 2 }}>
            <button style={{ padding: "4px 6px", borderRadius: 4, fontSize: 10, border: "none", background: rule.priority > 1 ? accent.tintMid : "transparent", color: rule.priority > 1 ? accent.deep : text.muted, cursor: rule.priority > 1 ? "pointer" : "default" }} disabled={rule.priority <= 1}
              onClick={() => { const nr = [...coverScanRules]; const ci = nr.findIndex(r => r.id === rule.id); if (ci > 0) { const pr = nr[ci - 1]; nr[ci - 1] = { ...pr, priority: rule.priority }; nr[ci] = { ...rule, priority: pr.priority }; setCoverScanRules(nr); } }}>↑</button>
            <button style={{ padding: "4px 6px", borderRadius: 4, fontSize: 10, border: "none", background: rule.priority < coverScanRules.length ? accent.tintMid : "transparent", color: rule.priority < coverScanRules.length ? accent.deep : text.muted, cursor: rule.priority < coverScanRules.length ? "pointer" : "default" }} disabled={rule.priority >= coverScanRules.length}
              onClick={() => { const nr = [...coverScanRules]; const ci = nr.findIndex(r => r.id === rule.id); if (ci < nr.length - 1) { const nr2 = nr[ci + 1]; nr[ci + 1] = { ...nr2, priority: rule.priority }; nr[ci] = { ...rule, priority: nr2.priority }; setCoverScanRules(nr); } }}>↓</button>
          </div>
          <button style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, border: "none", background: statusColors.error.color, color: "#fff", cursor: "pointer", opacity: coverScanRules.length > 1 ? 1 : 0.4 }} disabled={coverScanRules.length <= 1} onClick={() => setCoverScanRules(coverScanRules.filter(r => r.id !== rule.id))}>✕</button>
        </div>
      ))}
    </>
  );

  const renderScanParams = () => {
    const p: Record<string, any> = (() => { try { return JSON.parse(scanParams); } catch { return {}; } })();
    const updateP = (key: string, val: any) => setScanParams(JSON.stringify({ ...p, [key]: val }));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: text.primary }}>⚙ 扫描参数</span>
        <div style={{ fontSize: 10, color: text.muted, lineHeight: 1.5 }}>控制扫描引擎行为，修改后下次扫描生效。</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { key: "read_lines", label: "扫描行数", v: p.read_lines ?? 200, hint: "读取文件头部行数", min: 1, max: 9999 },
              { key: "read_limit", label: "读取上限", v: p.read_limit ?? 524288, hint: "最大读取字节", min: 1, max: 99999999 },
              { key: "preview_lines", label: "预览行数", v: p.preview_lines ?? 20, hint: "存到简介的行数", min: 1, max: 9999 },
              { key: "min_novel_size", label: "最小小说", v: p.min_novel_size ?? 10240, hint: "低于此不判为小说", min: 1, max: 99999999 },
            ].map(f => (
              <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: text.secondary, minWidth: 70, flexShrink: 0, fontWeight: 500 }}>{f.label}</span>
                <input style={{ ...baseInput, width: 72, fontFamily: "Consolas,monospace", fontSize: 10 }} type="number" min={f.min} max={f.max} value={f.v} onChange={e => updateP(f.key, parseInt(e.target.value) || f.min)} />
                <span style={{ fontSize: 8, color: text.muted }}>{f.hint}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 9, color: text.muted, fontWeight: 500 }}>小说关键词（逗号分隔）</span>
              <input style={{ ...baseInput, flex: 1, fontFamily: "Consolas,monospace", fontSize: 10 }} value={p.novel_keywords ?? "书名：, 作者：, 字数：, 章节：, 第, 章, 卷"} onChange={e => updateP("novel_keywords", e.target.value)} placeholder="逗号分隔的关键词" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 9, color: text.muted, fontWeight: 500 }}>简介匹配文件名（逗号分隔）</span>
              <input style={{ ...baseInput, flex: 1, fontFamily: "Consolas,monospace", fontSize: 10 }} value={p.intro_match ?? "简介.txt, 简介.md"} onChange={e => updateP("intro_match", e.target.value)} placeholder="逗号分隔的文件名" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderScanContent = () => {
    return renderScanPath();
  };

  const renderContent = () => {
    switch (effectiveSection) {
      case "basic": return renderBasic();
      case "display": return renderDisplay();
      case "scan-params": return renderScanParams();
      default: return renderScanContent();
    }
  };

  // ── 导航样式 ──

  const treeParentStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 10px", cursor: "pointer",
    color: active ? accent.primary : text.secondary,
    fontWeight: active ? 600 : 400,
    fontSize: 11, borderRadius: 4,
    transition: "all 0.12s", userSelect: "none" as const,
    background: active ? accent.tint : "none",
  });

  const treeChildStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 5,
    padding: "4px 10px 4px 28px", cursor: "pointer",
    color: active ? accent.primary : text.muted,
    fontWeight: active ? 600 : 400,
    fontSize: 10, borderRadius: 3,
    borderLeft: active ? `2px solid ${accent.primary}` : "2px solid transparent",
    transition: "all 0.12s", background: active ? "rgba(96,165,250,0.06)" : "none",
  });

  const arrowStyle = (open: boolean): React.CSSProperties => ({
    fontSize: 7, color: text.placeholder, flexShrink: 0,
    width: 12, textAlign: "center" as const,
    transition: "transform 0.15s",
    transform: open ? "rotate(90deg)" : "none",
  });

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" }}
      onClick={handleCancel}>
      <div style={{ width: 800, height: 580, background: "#1a1d27", border: `1px solid ${border.default}`, borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 16px 64px rgba(0,0,0,0.6)", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}>
        {/* 顶栏 */}
        <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: `1px solid ${border.default}`, background: bg.base }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>
            ⚙ {libName}
            <span style={{ color: text.muted, fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
              / {PAGE_LABELS[effectiveSection] || effectiveSection}
            </span>
          </span>
          <button style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 12 }} onClick={handleCancel}>✕</button>
        </div>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* 树状导航 */}
          <div style={{ width: 170, background: bg.base, borderRight: `1px solid ${border.default}`, padding: 8, overflowY: "auto" }}>
            {navTree.map(item => {
              if ("children" in item && item.children) {
                const isExpanded = scanExpanded;
                const isParentActive = parentFor(activeSection) === "scan";
                return (
                  <div key={item.id}>
                    <div style={treeParentStyle(isParentActive)}
                      onClick={() => setScanExpanded(!isExpanded)}
                      onMouseEnter={e => { if (!isParentActive) e.currentTarget.style.background = accent.tint; }}
                      onMouseLeave={e => { if (!isParentActive) e.currentTarget.style.background = "none"; }}>
                      <span style={arrowStyle(isExpanded)}>▶</span>
                      <span style={{ fontSize: 12 }}>{item.icon}</span>
                      {item.label}
                      {false && <span style={{ marginLeft: "auto", background: accent.glow, color: accent.primary, fontSize: 7, padding: "0 5px", borderRadius: 6, fontWeight: 600 }}>0</span>}
                    </div>
                    <div style={{ overflow: "hidden", maxHeight: isExpanded ? 250 : 0, transition: "max-height 0.2s ease" }}>
                      {item.children.map(child => {
                        const isChildActive = scanSubSection === child.id;
                        return (
                          <div key={child.id} style={treeChildStyle(isChildActive)}
                            onClick={() => setActiveSection(child.id)}
                            onMouseEnter={e => { if (!isChildActive) e.currentTarget.style.background = "rgba(96,165,250,0.03)"; }}
                            onMouseLeave={e => { if (!isChildActive) e.currentTarget.style.background = "none"; }}>
                            <span style={{ fontSize: 9, width: 14, textAlign: "center", flexShrink: 0 }}>{child.icon}</span>
                            {child.label}
                            {false && <span style={{ marginLeft: "auto", background: accent.glow, color: accent.primary, fontSize: 7, padding: "0 4px", borderRadius: 6, fontWeight: 600 }}>0</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              const isActive = activeSection === item.id;
              return (
                <div key={item.id} style={{ ...treeChildStyle(isActive), padding: "5px 10px", fontSize: 11, fontWeight: isActive ? 600 : 400, borderLeft: isActive ? `2px solid ${accent.primary}` : "2px solid transparent" }}
                  onClick={() => setActiveSection(item.id)}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = accent.tint; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "none"; }}>
                  <span style={{ fontSize: 12, width: 18, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
                  {item.label}
                </div>
              );
            })}
          </div>
          {/* 内容区 */}
          <div style={{ flex: 1, padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
            {renderContent()}
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", paddingTop: 8, borderTop: `1px solid ${border.default}`, marginTop: "auto" }}>
              <SaveStatusBar status={saveStatus} />
              <button style={{ padding: "6px 14px", borderRadius: 4, fontSize: 11, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer" }} onClick={handleCancel}>关闭</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
