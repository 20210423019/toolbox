import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { isTauri, invoke } from "../../../tauri-invoke";
import { openUrl } from "../../../utils/openUrl";
import { showConfirm } from "../../../components/ConfirmDialog";
import { getTagType, hasTagType, setTagType, TAG_TYPE_OPTIONS } from "./tagTypeStore";
import type { TagClass, TagName, TagType } from "../../../types";
import { useTheme } from "../../../theme/useTheme";
import TagValueInput from "./TagValueInput";

interface Props {
  tagClasses: TagClass[];
  allTags: TagName[];
  search?: string;
  selectedIds: string[];
  mode: "select" | "filter" | "manage" | "batch";
  onToggle: (tagId: string) => void;
  onValueChange?: (tagId: string, value: string) => void;
  onValueSubmit?: (tagId: string, value: string) => void;
  tagValuesMap?: Record<string, string>;
  onOpenManager?: () => void;
  maxHeight?: number;
  libraryId?: string;
  onCreateClass?: (parentId: string | null, name: string) => Promise<void>;
  onRenameClass?: (cls: TagClass, name: string) => Promise<void>;
  onDeleteClass?: (id: string) => Promise<void>;
  onCreateTag?: (classId: string, name: string, tagType?: TagType) => Promise<void>;
  onRenameTag?: (tag: TagName, name: string, tagType?: TagType) => Promise<void>;
  onDeleteTag?: (id: string) => Promise<void>;
  onMoveClass?: (id: string, newParentId: string | null) => Promise<void>;
  simple?: boolean;
  batchRemoveIds?: Set<string>;
  flat?: boolean;
}

function buildTree(classes: TagClass[], parentId: string | null): TagClass[] {
  return (Array.isArray(classes) ? classes : []).filter(c => c && c.parent_id === parentId);
}

/** 预构建 children Map，避免每次 O(n) 过滤 */
function buildChildrenMap(classes: TagClass[]): Map<string | null, TagClass[]> {
  const map = new Map<string | null, TagClass[]>();
  const safe = Array.isArray(classes) ? classes.filter(Boolean) : [];
  for (const c of safe) {
    const pid = c.parent_id;
    if (!map.has(pid)) map.set(pid, []);
    map.get(pid)!.push(c);
  }
  return map;
}

const CLASS_ICONS = ["📁", "📂", "🗂", "📦", "🎯", "⚡", "💎", "🔖", "🏷", "🎨", "🔧", "📊", "🎬", "📝", "🔍", "🔄", "⭐", "🔗"];
const TAG_COLORS = ["#3B82F6", "#A78BFA", "#34D399", "#FBBF24", "#F87171", "#F472B6", "#22D3EE", "#FB923C", "#818CF8", "#34D399"];

/** 基于 id 确定性分配分类图标 */
function getClassIcon(cls: TagClass): string {
  if (cls.icon) return cls.icon;
  let h = 0; for (let i = 0; i < cls.id.length; i++) h = ((h << 5) - h) + cls.id.charCodeAt(i);
  return CLASS_ICONS[Math.abs(h) % CLASS_ICONS.length];
}
/** 基于 id 确定性分配标签色点 */
function getTagColor(tag: TagName): string {
  if (tag.color) return tag.color;
  let h = 0; for (let i = 0; i < tag.id.length; i++) h = ((h << 5) - h) + tag.id.charCodeAt(i);
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}

// ═══════════════════════════════════════════════════════════════
//  设计样式注入（v4 · 标签树优化版）
// ═══════════════════════════════════════════════════════════════
const TT_STYLE_ID = "tag-tree-style-v4";

function ensureStyles() {
  if (document.getElementById(TT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TT_STYLE_ID;
  style.textContent = `
/* ═══ 设计令牌 ═══ */
:root {
  --tt-bg-deepest: #04060A; --tt-bg-base: #080B12; --tt-bg-elevated: #0E121D;
  --tt-bg-surface: #151A28; --tt-bg-surface2: #1A2033; --tt-bg-input: #0A0D16;
  --tt-bg-panel: #0B0E18; --tt-bg-floating: #1A2033;
  --tt-border-default: rgba(100,130,220,0.08); --tt-border-hover: rgba(100,130,220,0.18);
  --tt-border-accent: rgba(59,130,246,0.3); --tt-border-divider: rgba(100,130,220,0.05);
  --tt-accent-primary: #3B82F6; --tt-accent-deep: #2563EB; --tt-accent-light: #60A5FA;
  --tt-accent-tint: rgba(59,130,246,0.08); --tt-accent-tintMid: rgba(59,130,246,0.14);
  --tt-text-primary: #EEF2F6; --tt-text-secondary: #94A3B8; --tt-text-muted: #64748B;
  --tt-text-placeholder: #475569;
  --tt-success: #34D399; --tt-success-bg: rgba(52,211,153,0.1);
  --tt-warning: #FBBF24; --tt-warning-bg: rgba(251,191,36,0.1);
  --tt-error: #F87171; --tt-error-bg: rgba(248,113,113,0.1);
  --tt-info: #38BDF8; --tt-info-bg: rgba(56,189,248,0.1);
  --tt-purple: #A78BFA; --tt-pink: #F472B6; --tt-cyan: #22D3EE;
  --tt-radius-xs: 3px; --tt-radius-sm: 5px; --tt-radius-md: 7px; --tt-radius-lg: 10px; --tt-radius-xl: 14px;
  --tt-font-mono: 'Cascadia Code','JetBrains Mono','Fira Code',Consolas,monospace;
  --tt-font-sans: -apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;
}

.tt-root{font-family:var(--tt-font-sans);font-size:12px;color:var(--tt-text-primary)}

/* ─── 工具栏 ─── */
.tt-toolbar{padding:8px 14px;border-bottom:1px solid var(--tt-border-divider);display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:var(--tt-bg-panel);flex-shrink:0}
.tt-toolbar-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--tt-radius-sm);font-size:10px;font-weight:500;border:1px solid var(--tt-border-default);background:var(--tt-bg-surface);color:var(--tt-text-secondary);cursor:pointer;transition:all .12s;font-family:var(--tt-font-sans);white-space:nowrap}
.tt-toolbar-btn:hover{border-color:var(--tt-border-hover);color:var(--tt-text-primary);background:var(--tt-bg-surface2)}
.tt-toolbar-btn.primary{border:none;background:var(--tt-accent-deep);color:#fff}
.tt-toolbar-btn.primary:hover{background:var(--tt-accent-primary)}
.tt-toolbar-btn.danger{border-color:transparent;color:var(--tt-error)}
.tt-toolbar-btn.danger:hover{background:var(--tt-error-bg);border-color:var(--tt-error)}
.tt-toolbar-divider{width:1px;height:16px;background:var(--tt-border-divider);flex-shrink:0}

/* ═══ 统一操作组件布局：名称(弹性) | 辅助区(固定宽) | 操作区(固定宽) ═══ */
.tt-class-row,.tt-tag-row{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:4px;cursor:pointer;transition:all .12s;position:relative}
.tt-class-row{padding:5px 14px;font-size:12px;font-weight:600;color:var(--tt-text-primary);user-select:none}
.tt-class-row:hover{background:var(--tt-accent-tint)}
.tt-class-row::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:2px;border-radius:0 2px 2px 0;background:transparent;transition:all .15s}
.tt-class-row:hover::before{background:var(--tt-accent-primary);box-shadow:0 0 8px rgba(59,130,246,0.25)}
.tt-class-row .tt-arrow{width:14px;flex-shrink:0;text-align:center;font-size:7px;color:var(--tt-accent-primary);transition:transform .2s cubic-bezier(.34,1.56,.64,1);opacity:0.6}
.tt-class-row .tt-arrow.tt-open{transform:rotate(90deg)}
.tt-class-row .tt-color-bar{width:3px;height:14px;border-radius:2px;flex-shrink:0;transition:box-shadow .2s}
.tt-class-row:hover .tt-color-bar{box-shadow:0 0 6px currentColor}
.tt-class-row .tt-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tt-class-row .tt-tag-count{font-size:9px;font-weight:500;color:var(--tt-text-muted);background:var(--tt-bg-surface);padding:0 7px;border-radius:6px;border:1px solid var(--tt-border-default);flex-shrink:0}

/* ─── 操作区 ─── */
.tt-class-actions,.tt-tag-actions{display:flex;gap:2px;align-items:center;opacity:0;transition:opacity .12s;min-width:54px;justify-content:flex-end}
.tt-class-row:hover .tt-class-actions,.tt-tag-row:hover .tt-tag-actions{opacity:1}
.tt-mode-manage .tt-class-actions,.tt-mode-manage .tt-tag-actions{opacity:1!important}
.tt-action-btn{width:22px;height:22px;border-radius:var(--tt-radius-xs);border:none;background:transparent;color:var(--tt-text-placeholder);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;min-width:22px;min-height:22px}
.tt-action-btn:hover{background:var(--tt-accent-tint);color:var(--tt-accent-primary)}
.tt-action-btn.danger:hover{background:var(--tt-error-bg);color:var(--tt-error)}
.tt-action-btn.add-value{width:auto;padding:0 6px;color:var(--tt-accent-light);font-size:9px}
.tt-action-btn.add-value:hover{background:var(--tt-accent-tint);color:var(--tt-accent-primary)}

/* ─── 标签行 ─── */
.tt-tag-row{padding:3px 14px 3px 38px;font-size:11px}
.tt-tag-row:hover{background:var(--tt-accent-tint)}
.tt-tag-row.tt-checked{background:rgba(59,130,246,0.06)}
.tt-tag-row.tt-highlight{background:var(--tt-accent-tintMid)!important;border-left:2px solid var(--tt-accent-primary)!important;padding-left:36px!important}

/* ─── 复选框 ─── */
.tt-cb{width:14px;height:14px;border-radius:var(--tt-radius-xs);flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .15s;position:relative}
.tt-cb.tt-cb-on{background:var(--tt-accent-deep);border:1.5px solid var(--tt-accent-primary);box-shadow:0 0 8px rgba(59,130,246,0.2)}
.tt-cb.tt-cb-off{background:transparent;border:1.5px solid var(--tt-border-hover)}
.tt-cb.tt-cb-off:hover{border-color:var(--tt-accent-primary);background:rgba(96,165,250,0.05)}
.tt-cb .tt-checkmark{width:9px;height:9px;color:#fff}

/* ─── 标签点/图标/名称 ─── */
.tt-tag-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;transition:box-shadow .2s}
.tt-tag-row:hover .tt-tag-dot{box-shadow:0 0 6px currentColor!important}
.tt-tag-type-icon{font-size:9px;width:14px;text-align:center;flex-shrink:0}
.tt-tag-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tt-tag-name.active{color:var(--tt-text-primary);font-weight:500}
.tt-tag-name.inactive{color:var(--tt-text-secondary)}

/* ─── 值展开箭头 ─── */
.tt-val-expand{font-size:8px;color:var(--tt-text-placeholder);flex-shrink:0;cursor:pointer;transition:transform .15s;width:12px;text-align:center}

/* ─── 标签值子节点（v4 优化） ─── */
.tt-value-children{display:none}
.tt-value-children.tt-open{display:block}
.tt-value-node{display:flex;align-items:center;gap:6px;padding:4px 14px 4px 58px;font-size:10px;background:rgba(10,15,30,0.35);border-bottom:1px solid var(--tt-border-divider);color:var(--tt-text-secondary);animation:tt-slideIn .12s ease;border-left:1px solid rgba(100,140,220,0.04)}
.tt-value-node .tt-vi{font-size:8px;color:var(--tt-accent-primary);flex-shrink:0;width:14px;text-align:center}
.tt-value-node .tt-vlbl{color:var(--tt-text-muted);font-size:9px;flex-shrink:0}
.tt-value-node .tt-vtxt{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--tt-font-mono);font-size:10px;color:var(--tt-text-primary)}
.tt-value-node .tt-vtxt.url{color:var(--tt-accent-light);text-decoration:none;border-bottom:1px dashed rgba(96,165,250,.2);cursor:pointer;transition:all .12s}
.tt-value-node .tt-vtxt.url:hover{color:#93C5FD;border-bottom-color:currentColor}
.tt-value-node .tt-vtxt.path{color:var(--tt-accent-light);cursor:pointer;transition:all .12s}
.tt-value-node .tt-vtxt.path:hover{color:#93C5FD}
.tt-value-node .tt-vtxt.text{color:var(--tt-accent-light);cursor:pointer;transition:all .12s}
.tt-value-node .tt-vtxt.text:hover{color:#93C5FD;border-bottom:1px dashed currentColor}
.tt-value-node .tt-va{display:flex;gap:3px;align-items:center;flex-shrink:0}
.tt-value-node .tt-vbtn{width:20px;height:20px;border-radius:var(--tt-radius-xs);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;transition:all .12s;min-width:20px;min-height:20px}
.tt-value-node .tt-vbtn.edit{background:transparent;color:var(--tt-text-placeholder)}
.tt-value-node .tt-vbtn.edit:hover{background:var(--tt-accent-tint);color:var(--tt-accent-primary)}
.tt-value-node .tt-vbtn.save{background:var(--tt-accent-deep);color:#fff;font-size:10px}
.tt-value-node .tt-vbtn.save:hover{background:var(--tt-accent-primary)}
.tt-value-node .tt-vbtn.cancel{background:transparent;color:var(--tt-text-muted)}
.tt-value-node .tt-vbtn.cancel:hover{color:var(--tt-error);background:var(--tt-error-bg)}
.tt-value-node .tt-vbtn.clear{background:transparent;color:var(--tt-text-placeholder)}
.tt-value-node .tt-vbtn.clear:hover{color:var(--tt-error);background:var(--tt-error-bg)}
.tt-value-node .tt-vtype-badge{font-size:7px;padding:0 5px;border-radius:3px;background:var(--tt-accent-tint);color:var(--tt-accent-primary);flex-shrink:0;font-weight:600}
.tt-value-node .tt-vtype-badge.success{background:rgba(52,211,153,0.08);color:#34D399}
.tt-value-node .tt-vinput{flex:1;padding:2px 8px;border-radius:var(--tt-radius-xs);background:var(--tt-bg-input);border:1px solid var(--tt-accent-primary);color:var(--tt-text-primary);font-size:10px;outline:none;font-family:var(--tt-font-mono)}

/* ─── 拖拽重排 ─── */
.tt-class-row.tt-dragging{opacity:0.4;background:var(--tt-bg-surface2)}
.tt-class-row.tt-drag-over{border-top:2px solid var(--tt-accent-primary)!important}
.tt-class-row.tt-drag-over::before{background:var(--tt-accent-primary)!important}
.tt-class-row[draggable="true"]{cursor:grab}
.tt-class-row[draggable="true"]:active{cursor:grabbing}

/* ─── 添加按钮 ─── */
.tt-add-tag-btn,.tt-add-class-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 14px 4px 38px;font-size:10px;color:var(--tt-accent-light);cursor:pointer;transition:all .12s}
.tt-add-tag-btn:hover,.tt-add-class-btn:hover{background:var(--tt-accent-tint);color:var(--tt-accent-primary)}
.tt-add-class-btn{padding:5px 14px;margin-top:2px;justify-content:center;border-top:1px solid var(--tt-border-divider);margin-left:0}

/* ─── 内联编辑 ─── */
.tt-inline-wrap{display:flex;align-items:center;gap:6px;padding:6px 14px;background:var(--tt-bg-surface);border-bottom:1px solid var(--tt-border-accent);animation:tt-slideIn .15s ease;box-shadow:inset 0 0 0 1px var(--tt-border-accent)}
.tt-inline-wrap.tt-class-level{padding:6px 14px}
.tt-inline-wrap.tt-tag-level{padding:6px 14px 6px 38px}
.tt-inline-input{flex:1;padding:5px 10px;border-radius:var(--tt-radius-sm);background:var(--tt-bg-input);border:1px solid var(--tt-accent-primary);color:var(--tt-text-primary);font-size:12px;outline:none;font-family:var(--tt-font-sans);min-height:28px}
.tt-inline-input:focus{box-shadow:0 0 12px rgba(59,130,246,0.2)}
.tt-inline-select{padding:5px 6px;border-radius:var(--tt-radius-sm);background:var(--tt-bg-input);border:1px solid var(--tt-border-default);color:var(--tt-text-secondary);font-size:10px;cursor:pointer;outline:none;font-family:var(--tt-font-sans);min-height:28px}
.tt-inline-btn{width:28px;height:28px;border-radius:var(--tt-radius-sm);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;flex-shrink:0;transition:all .1s;min-width:28px;min-height:28px}
.tt-inline-btn.confirm{background:var(--tt-accent-deep);color:#fff}
.tt-inline-btn.confirm:hover{background:var(--tt-accent-primary)}
.tt-inline-btn.cancel{background:transparent;color:var(--tt-text-muted)}
.tt-inline-btn.cancel:hover{color:var(--tt-error);background:var(--tt-error-bg)}

/* ─── 颜色选择器 ─── */
.tt-color-picker{display:flex;gap:4px;padding:6px 14px;background:var(--tt-bg-surface);border-bottom:1px solid var(--tt-border-accent);animation:tt-slideIn .15s ease}
.tt-color-opt{width:18px;height:18px;border-radius:50%;cursor:pointer;border:2px solid transparent;transition:all .12s;flex-shrink:0}
.tt-color-opt:hover{border-color:rgba(255,255,255,0.4);transform:scale(1.2)}
.tt-color-opt.selected{border-color:#fff;box-shadow:0 0 8px currentColor;transform:scale(1.15)}

/* ─── 编辑状态时隐藏不可用组件 ─── */
.tt-class-row.tt-editing+.tt-tree-children .tt-tag-row,
.tt-class-row.tt-editing+.tt-tree-children .tt-add-tag-btn{opacity:0.3;pointer-events:none}
.tt-tag-row.tt-editing .tt-tag-actions{opacity:0!important;pointer-events:none}

/* ─── 底部状态栏 ─── */
.tt-status-bar{padding:5px 14px;border-top:1px solid var(--tt-border-divider);display:flex;align-items:center;gap:12px;background:var(--tt-bg-panel);font-size:9px;color:var(--tt-text-muted);flex-shrink:0}
.tt-status-bar .tt-stat{display:flex;align-items:center;gap:3px}
.tt-status-bar .tt-stat .num{color:var(--tt-text-primary);font-weight:600;font-family:var(--tt-font-mono);font-size:10px}
.tt-status-bar .tt-expand-val{cursor:pointer;transition:color .12s}
.tt-status-bar .tt-expand-val:hover{color:var(--tt-accent-primary)}
.tt-status-bar .tt-mode-label{margin-left:auto}

/* ─── 未分类区域 ─── */
.tt-orphan-section{border-top:1px dashed var(--tt-border-divider);margin-top:4px;padding-top:4px}
.tt-orphan-label{padding:3px 14px;font-size:9px;color:var(--tt-text-placeholder);font-weight:500}

/* ─── 空状态 ─── */
.tt-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:40px 20px;text-align:center}
.tt-empty-icon{font-size:28px;opacity:0.55}
.tt-empty-msg{font-size:11px;color:var(--tt-text-muted)}
.tt-empty-hint{font-size:9px;color:var(--tt-text-placeholder);max-width:240px;line-height:1.6}
.tt-empty-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border-radius:var(--tt-radius-sm);font-size:12px;font-weight:500;cursor:pointer;color:var(--tt-accent-light);transition:all .12s}
.tt-empty-btn:hover{background:var(--tt-accent-tint)}

/* ─── 动画 ─── */
@keyframes tt-slideIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
@keyframes tt-spin{to{transform:rotate(360deg)}}
.tt-fade-in{animation:tt-slideIn .15s ease}

/* ─── 滚动条 ─── */
.tt-tree-scroll::-webkit-scrollbar{width:4px}
.tt-tree-scroll::-webkit-scrollbar-track{background:transparent}
.tt-tree-scroll::-webkit-scrollbar-thumb{background:var(--tt-border-hover);border-radius:4px}
`;
  document.head.appendChild(style);
}



// ═══════════════════════════════════════════════════════════════
//  TagTree 主组件
// ═══════════════════════════════════════════════════════════════
export default function TagTree({
  tagClasses = [], allTags = [], search: externalSearch = "", selectedIds, mode,
  onToggle, onValueChange, onValueSubmit, tagValuesMap = {},
  onOpenManager, maxHeight, libraryId,
  onCreateClass, onRenameClass, onDeleteClass,
  onCreateTag, onRenameTag, onDeleteTag,
  onMoveClass, simple = false, batchRemoveIds, flat = false,
}: Props) {
  const { bg, border, accent, text, status } = useTheme();
  ensureStyles();

  const safeClasses = useMemo(() => (Array.isArray(tagClasses) ? tagClasses.filter(Boolean) : []), [tagClasses]);
  const safeTags = useMemo(() => (Array.isArray(allTags) ? allTags.filter(Boolean) : []), [allTags]);

  // ─── 用 ref 持有 tagValuesMap 避免每次渲染新对象导致 effect 无限循环 ───
  const tagValuesMapRef = useRef(tagValuesMap);
  tagValuesMapRef.current = tagValuesMap;

  // ─── 展开/折叠状态 ───
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [valueExpanded, setValueExpanded] = useState<Set<string>>(new Set());
  const [searchMatches, setSearchMatches] = useState<Set<string>>(new Set());

  // ─── 内联编辑状态 ───
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingValueTagId, setEditingValueTagId] = useState<string | null>(null);
  const [editingValueText, setEditingValueText] = useState("");
  const [editingTagText, setEditingTagText] = useState("");
  const [editingClassText, setEditingClassText] = useState("");

  // ─── 加载状态 ───
  const [typeLoadingId, setTypeLoadingId] = useState<string | null>(null);
  const [typeVer, setTypeVer] = useState(0); // 递增以强制重渲染，使 getTagType() 即时生效
  const [searchLoading, setSearchLoading] = useState(false);

  // ─── 集成路径选择器下拉（选文件/文件夹） ───
  const [pathPickerTag, setPathPickerTag] = useState<string | null>(null);

  // ─── 搜索 ───
  const search = externalSearch;

  // ─── Toast ───
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  // ─── 拖拽 ───
  const dragSrc = useRef<string | null>(null);

  const isBatch = mode === "batch";

  // ─── 初始化展开 ───
  useEffect(() => {
    if (expandedIds.size === 0 && safeClasses.length > 0) {
      setExpandedIds(new Set(safeClasses.filter(c => !c.parent_id).map(c => c.id)));
    }
  }, [safeClasses]);

  // ─── 检索时清除「添加标签值」编辑状态，防止展开值的输入框在搜索结果中意外残留 ───
  useEffect(() => {
    if (editingValueTagId !== null) {
      setEditingValueTagId(null);
    }
  }, [search, selectedIds]);

  // ─── 搜索匹配逻辑 ───
  useEffect(() => {
    if (!search.trim()) { setSearchMatches(new Set()); setSearchLoading(false); return; }
    setSearchLoading(true);
    // 使用微任务让加载指示器先渲染，避免同步阻塞
    const q = search.toLowerCase();
    const matchedCls = new Set<string>();
    for (const cls of safeClasses) {
      if (cls.name.toLowerCase().includes(q)) {
        matchedCls.add(cls.id);
        let p = cls.parent_id;
        while (p) { matchedCls.add(p); p = safeClasses.find(c => c.id === p)?.parent_id || null; }
      }
    }
    const currentTagValuesMap = tagValuesMapRef.current;
    for (const tag of safeTags) {
      const tagVal = currentTagValuesMap[tag.id];
      if (tag.name.toLowerCase().includes(q) || (tagVal && tagVal.toLowerCase().includes(q))) {
        matchedCls.add(tag.class_id);
        let p = safeClasses.find(c => c.id === tag.class_id)?.parent_id || null;
        while (p) { matchedCls.add(p); p = safeClasses.find(c => c.id === p)?.parent_id || null; }
      }
    }
    setSearchMatches(matchedCls);
    setExpandedIds(prev => { const n = new Set(prev); matchedCls.forEach(id => n.add(id)); return n; });
    setSearchLoading(false);
  }, [search, safeClasses, safeTags]); // 移除 tagValuesMap：用 ref 避免每次新 {} 对象触发 effect

  // ─── 路径选择器下拉：点击外部关闭（通过 data 属性判断） ───
  useEffect(() => {
    if (!pathPickerTag) return;
    const handler = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest("[data-picker-trigger]") && !el.closest("[data-picker-menu]")) {
        setPathPickerTag(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pathPickerTag]);

  // ─── 标签按分类分组 ───
  const tagMap = useMemo(() => {
    const m = new Map<string, TagName[]>();
    for (const t of safeTags) { if (!m.has(t.class_id)) m.set(t.class_id, []); m.get(t.class_id)!.push(t); }
    return m;
  }, [safeTags]);

  // ─── CSS 变量覆盖（主题色）───
  const cssVars: Record<string, string> = {
    "--tt-bg-base": bg.base,
    "--tt-bg-panel": bg.panel,
    "--tt-bg-surface": bg.surface,
    "--tt-bg-surface2": bg.input,
    "--tt-bg-input": bg.input,
    "--tt-border-default": border.default,
    "--tt-border-hover": border.hover,
    "--tt-border-divider": border.divider,
    "--tt-accent-primary": accent.primary,
    "--tt-accent-deep": accent.deep,
    "--tt-accent-light": accent.light,
    "--tt-accent-tint": accent.tint,
    "--tt-accent-tintMid": accent.tintMid,
    "--tt-text-primary": text.primary,
    "--tt-text-secondary": text.secondary,
    "--tt-text-muted": text.muted,
    "--tt-text-placeholder": text.placeholder,
    "--tt-error": status.error.color,
    "--tt-error-bg": status.error.bg,
  };

  const childrenMap = useMemo(() => buildChildrenMap(safeClasses), [safeClasses]);
  const rootClasses = childrenMap.get(null) || [];
  const selectedCount = selectedIds.length;
  const valuedCount = Object.values(tagValuesMap).filter(Boolean).length;
  const hasSearch = search.trim().length > 0;

  // ─── 切换展开 ───
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const commitValue = useCallback((tagId: string, directValue?: string) => {
    const val = directValue ?? editingValueText;
    onValueChange?.(tagId, val);
    onValueSubmit?.(tagId, val);
    setEditingValueTagId(null);
    showToast("值已保存");
  }, [editingValueText, onValueChange, onValueSubmit, showToast]);

  const expandAll = useCallback(() => setExpandedIds(new Set(safeClasses.map(c => c.id))), [safeClasses]);
  const collapseAll = useCallback(() => setExpandedIds(new Set()), []);
  const deleteSelectedBatch = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const ids = [...selectedIds];
    for (const id of ids) await onDeleteTag?.(id);
    showToast(`已删除 ${ids.length} 个标签`);
  }, [selectedIds, onDeleteTag, showToast]);

  const expandAllValues = useCallback(() => {
    const hasValued = safeTags.filter(t => tagValuesMap[t.id]);
    setValueExpanded(p => {
      if (p.size === hasValued.length) return new Set(); // all open → close
      return new Set(hasValued.map(t => t.id));
    });
  }, [safeTags, tagValuesMap]);

  // ─────────────────────────────────────────────────────────
  //  递归渲染分类节点
  // ─────────────────────────────────────────────────────────
  function renderClassNode(cls: TagClass, depth: number, visited?: Set<string>): React.ReactNode {
    if (!cls) return null;
    if (visited?.has(cls.id)) return null;
    const v = visited || new Set<string>(); v.add(cls.id);
    if (depth > 20) return <div key={cls.id} style={{ padding: "5px 14px", fontSize: 11, color: text.muted }}>⚠ 层级过深 ({cls.name})</div>;

    const children = childrenMap.get(cls.id) || [];
    const tagsInClass = tagMap.get(cls.id) || [];
    const expanded = expandedIds.has(cls.id);
    const hasChildren = children.length > 0 || tagsInClass.length > 0;
    const clsColor = cls.color || accent.primary;
    const isEditing = editingClassId === cls.id;
    const hl = searchMatches.has(cls.id);

    // 搜索时：分类名或子标签匹配则显示
    if (hasSearch && !hl && !children.some(c => searchMatches.has(c.id)) && !tagsInClass.some(t => t.name.toLowerCase().includes(search.toLowerCase()))) return null;

    return (
      <div key={cls.id}>
        {/* 分类行 */}
        <div className={`tt-class-row tt-fade-in${isEditing ? " tt-editing" : ""}`}
          style={{ paddingLeft: `${14 + depth * 20}px` }}
          draggable={true}
          onDragStart={e => {
            dragSrc.current = cls.id;
            e.dataTransfer.setData("text/plain", cls.id);
            (e.currentTarget as HTMLElement).classList.add("tt-dragging");
          }}
          onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add("tt-drag-over"); }}
          onDragLeave={e => { (e.currentTarget as HTMLElement).classList.remove("tt-drag-over"); }}
          onDrop={async e => {
            e.preventDefault(); (e.currentTarget as HTMLElement).classList.remove("tt-drag-over");
            document.querySelectorAll(".tt-class-row.tt-dragging").forEach(el => el.classList.remove("tt-dragging"));
            const src = e.dataTransfer.getData("text/plain");
            if (!src || src === cls.id) return;
            await onMoveClass?.(src, cls.id);
            showToast("分类已移动");
            dragSrc.current = null;
          }}
          onClick={e => {
            // 设计稿：整行点击展开/折叠（操作按钮已 stopPropagation）
            hasChildren && toggleExpand(cls.id);
          }}>
          {/* 第一格：箭头 + 色条 + 名称 */}
          <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", minWidth: 0 }}>
            <span className={`tt-arrow${expanded ? " tt-open" : ""}`}
              onClick={e => { e.stopPropagation(); hasChildren && toggleExpand(cls.id); }}>
              {hasChildren ? "▶" : "●"}
            </span>
            <span className="tt-color-bar" style={{ background: clsColor }} />
            {isEditing ? (
              <span onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }}>
                <input value={editingClassText} onChange={e => setEditingClassText(e.target.value)}
                  style={{ flex: 1, minWidth: 40, maxWidth: 160, padding: "2px 6px", borderRadius: 3, background: bg.input, border: `1px solid ${accent.primary}`, color: text.primary, fontSize: 12, outline: "none" }}
                  autoFocus
                  onKeyDown={async e => { if (e.key === "Enter" && editingClassText.trim()) { await onRenameClass?.(cls, editingClassText.trim()); setEditingClassId(null); showToast("分类已重命名"); } if (e.key === "Escape") { setEditingClassId(null); } }} />
                <span className="tt-action-btn" style={{ color: "#fff", background: accent.deep, borderRadius: 3, fontSize: 10, width: 20, height: 20, flexShrink: 0 }}
                  onClick={async e => { e.stopPropagation(); if (editingClassText.trim()) { await onRenameClass?.(cls, editingClassText.trim()); setEditingClassId(null); showToast("分类已重命名"); } }}>✓</span>
                <span className="tt-action-btn danger" style={{ borderRadius: 3, fontSize: 10, width: 20, height: 20, flexShrink: 0 }}
                  onClick={e => { e.stopPropagation(); setEditingClassId(null); }}>✕</span>
              </span>
            ) : (
              <span className="tt-name">{getClassIcon(cls)} {cls.name}</span>
            )}
          </span>
          {/* 第二格：标签计数 */}
          <span className="tt-tag-count">{tagsInClass.length}</span>
          {/* 第三格：操作按钮 */}
          {!isEditing && (onCreateClass || onCreateTag || onRenameClass || onDeleteClass) && (
            <span className="tt-class-actions">
              {onCreateClass && <span className="tt-action-btn" title="添加子类" onClick={async e => { e.stopPropagation(); await onCreateClass(cls.id, "新分类"); showToast("子类已创建"); }}>⊞</span>}
              {onCreateTag && <span className="tt-action-btn" title="添加标签" onClick={async e => { e.stopPropagation(); await onCreateTag(cls.id, "新标签"); showToast("标签已创建"); }}>＋</span>}
              {onRenameClass && <span className="tt-action-btn" title="重命名" onClick={e => { e.stopPropagation(); setEditingClassId(cls.id); setEditingClassText(cls.name); }}>✎</span>}
              {onDeleteClass && <span className="tt-action-btn danger" title="删除" onClick={async e => { e.stopPropagation(); if (!await showConfirm({ title: "删除分类", message: `删除分类"${cls.name}"及其所有子标签？不可撤销。`, danger: true })) return; await onDeleteClass(cls.id); showToast("分类已删除"); }}>✕</span>}
            </span>
          )}
        </div>

        {/* 展开的子内容 */}
        {expanded && (
          <div className="tt-tree-children" style={{ display: expanded ? undefined : "none" }}>
            {/* 子分类 */}
            {children?.map(c => renderClassNode(c, depth + 1, new Set(v)))}

            {/* 标签 */}
            {tagsInClass.map(tag => renderTagNode(tag, depth + 1))}

            {/* 添加标签按钮 */}
            {onCreateTag && (
              <span className="tt-add-tag-btn" style={{ paddingLeft: `${(depth + 1) * 20 + 24}px` }}
                onClick={async () => { await onCreateTag(cls.id, "新标签"); showToast("标签已创建"); }}>
                ＋ 添加标签到「{cls.name}」
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  //  渲染标签节点
  // ─────────────────────────────────────────────────────────
  function renderTagNode(tag: TagName, depth: number): React.ReactNode {
    if (!tag) return null;
    const checked = isBatch ? (selectedIds.includes(tag.id) && !batchRemoveIds?.has(tag.id)) : selectedIds.includes(tag.id);
    const isBatchRemove = isBatch && batchRemoveIds?.has(tag.id);
    const tagColor = getTagColor(tag);
    // 优先使用内存 Map（用户下拉已选择但尚未保存），回退到后端持久化值
    const ttype: TagType = hasTagType(tag.id) ? getTagType(tag.id) : ((tag.tag_type as TagType) || "text");
    const isPath = ttype === "path";
    const isUrl = ttype === "url";
    const isTagEditing = editingTagId === tag.id;
    const hasValue = tagValuesMap[tag.id] !== undefined && tagValuesMap[tag.id] !== "";
    const valExpanded = valueExpanded.has(tag.id);
    const tagVal = tagValuesMap[tag.id];
    const matched = hasSearch && (tag.name.toLowerCase().includes(search.toLowerCase()) || (tagVal && tagVal.toLowerCase().includes(search.toLowerCase())));
    const showTypeIcon = isPath || isUrl;

    // 背景色优先级：isBatchRemove > checked > matched > 默认
    const rowBg = isBatchRemove ? `${status.error.color}10` : checked ? `${tagColor}0C` : matched ? `${accent.tint}` : undefined;
    const isCheckedOrRemove = checked || isBatchRemove;

    return (
      <React.Fragment key={tag.id}>
        <div className={`tt-tag-row${isCheckedOrRemove ? " tt-checked" : ""}${matched ? " tt-highlight" : ""}${isTagEditing ? " tt-editing" : ""}`}
          style={{
            paddingLeft: `${14 + depth * 20 + 4}px`,
            background: rowBg,
          }}
          onMouseEnter={e => { if (!isCheckedOrRemove && !matched) (e.currentTarget as HTMLElement).style.background = accent.tint; }}
          onMouseLeave={e => { if (!isCheckedOrRemove && !matched) (e.currentTarget as HTMLElement).style.background = ""; }}>
          {/* 第一格：复选框 + 色点 + 类型图标 + 名称 + 值 */}
          <span style={{ display: "flex", alignItems: "flex-start", gap: 4, overflow: "hidden" }}>
            {/* 批量三态复选框 */}
            {isBatch ? (
              <div onClick={e => { e.stopPropagation(); onToggle(tag.id); }}
                style={{ marginTop: 1, width: 14, height: 14, borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", position: "relative", background: isBatchRemove ? status.error.color : checked ? accent.deep : "transparent", border: isBatchRemove ? `1.5px solid ${status.error.color}` : checked ? `1.5px solid ${accent.primary}` : `1.5px solid ${border.hover}`, boxShadow: isBatchRemove ? `0 0 8px ${status.error.color}40` : checked ? `0 0 8px ${tagColor}40` : "none", fontSize: 7, color: "#fff" }}>
                {isBatchRemove ? "✕" : checked ? (
                  <svg className="tt-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: 8, height: 8 }}><polyline points="20 6 9 17 4 12" /></svg>
                ) : null}
              </div>
            ) : (
              <div onClick={e => { e.stopPropagation(); onToggle(tag.id); }}
                className={`tt-cb ${checked ? "tt-cb-on" : "tt-cb-off"}`}
                style={{ marginTop: 1, background: checked ? accent.deep : undefined, border: checked ? `1.5px solid ${accent.primary}` : undefined, boxShadow: checked ? `0 0 8px ${tagColor}40` : "none" }}>
                {checked && (
                  <svg className="tt-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </div>
            )}

            {/* 名称 + 值（纵向排列） */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              {/* 色点 + 类型图标 + 名称 */}
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <span className="tt-tag-dot" style={{ background: `radial-gradient(circle, ${tagColor}, ${tagColor}88)`, boxShadow: `0 0 4px ${tagColor}50` }} />
                {showTypeIcon && <span className="tt-tag-type-icon">{isPath ? "📁" : isUrl ? "🔗" : ""}</span>}
                {isTagEditing ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                    <input value={editingTagText} onChange={e => setEditingTagText(e.target.value)}
                      style={{ flex: 1, minWidth: 30, maxWidth: 140, padding: "2px 6px", borderRadius: 3, background: bg.input, border: `1px solid ${accent.primary}`, color: text.primary, fontSize: 12, outline: "none" }}
                      autoFocus
                      onKeyDown={async e => { if (e.key === "Enter" && editingTagText.trim()) { await onRenameTag?.(tag, editingTagText.trim(), ttype); setEditingTagId(null); showToast("标签已重命名"); } if (e.key === "Escape") { setEditingTagId(null); } }} />
                    <select value={ttype} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                      onChange={e => { setTypeLoadingId(tag.id); setTagType(tag.id, e.target.value as TagType); setTypeVer(v => v + 1); setTimeout(() => setTypeLoadingId(null), 200); }}
                      className="tt-inline-select" style={{ flexShrink: 0, minHeight: "auto", padding: "2px 4px", fontSize: 9 }}>
                      {TAG_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon}</option>)}
                    </select>
                    {typeLoadingId === tag.id && <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid transparent", borderTopColor: accent.primary, borderRadius: "50%", animation: "tt-spin .5s linear infinite", flexShrink: 0 }} />}
                    <span className="tt-action-btn" style={{ color: "#fff", background: accent.deep, borderRadius: 3, fontSize: 10, width: 20, height: 20, flexShrink: 0 }}
                      onClick={async e => { e.stopPropagation(); if (editingTagText.trim()) { await onRenameTag?.(tag, editingTagText.trim(), ttype); showToast("标签已重命名"); } setEditingTagId(null); }}>✓</span>
                    <span className="tt-action-btn danger" style={{ borderRadius: 3, fontSize: 10, width: 20, height: 20, flexShrink: 0 }}
                      onClick={e => { e.stopPropagation(); setEditingTagId(null); }}>✕</span>
                  </span>
                ) : (
                  <span className={`tt-tag-name ${checked ? "active" : "inactive"}`}>{tag.name}</span>
                )}
              </span>

              {/* 值子行：始终在标签名称下方显示 */}
              {editingValueTagId === tag.id ? (
                <span style={{ display: "flex", alignItems: "center", gap: 3, paddingLeft: 0 }} onClick={e => e.stopPropagation()}>
                  {/* 文本类型：带历史值提示的自由输入 */}
                  {!isPath && !isUrl && (
                    <TagValueInput
                      tagId={tag.id}
                      tagName={tag.name}
                      tagType="text"
                      value={editingValueText}
                      onChange={setEditingValueText}
                      onSave={val => { setEditingValueText(val); commitValue(tag.id, val); }}
                      onCancel={() => setEditingValueTagId(null)}
                      autoFocus
                      maxHistory={15}
                      historyFetcher={async (tid) => {
                        try {
                          const rows = await invoke("get_tag_distinct_values", { tagId: tid }) as [string, number][];
                          return rows.map(([v, c]) => ({ value: v, count: c, lastUsed: "" }));
                        } catch { return []; }
                      }}
                    />
                  )}
                  {/* 路径类型：输入框 + 集成浏览按钮(文件/文件夹) */}
                  {isPath && (
                    <>
                      <input value={editingValueText} onChange={e => setEditingValueText(e.target.value)}
                        style={{ flex: 1, minWidth: 30, padding: "1px 6px", borderRadius: 3, background: bg.input, border: `1px solid ${accent.primary}`, color: text.primary, fontSize: 10, outline: "none", fontFamily: "var(--font-mono)" }}
                        placeholder="文件路径 / 点击📂选择..."
                        autoFocus onKeyDown={e => {
                          if (e.key === "Enter") { commitValue(tag.id); }
                          if (e.key === "Escape") setEditingValueTagId(null);
                        }} />
                      <div data-picker-trigger style={{ position: "relative", display: "flex", flexShrink: 0 }}>
                        <button style={{ width: 22, height: 22, borderRadius: "3px 0 0 3px", border: "none", background: accent.deep, color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="选择路径"
                          onClick={async e => {
                            e.stopPropagation();
                            if (isTauri()) {
                              try {
                                const { open } = await import("@tauri-apps/api/dialog");
                                const sel = await open({ directory: false, multiple: false, title: "选择文件" });
                                if (sel && typeof sel === "string") { setEditingValueText(sel); }
                              } catch {}
                            }
                          }}>📂</button>
                        <button style={{ width: 14, height: 22, borderRadius: "0 3px 3px 0", border: "none", background: accent.deep, color: "#fff", fontSize: 7, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, borderLeft: `1px solid ${accent.tint}` }}
                          title="选择文件或文件夹"
                          onClick={e => { e.stopPropagation(); setPathPickerTag(pathPickerTag === tag.id ? null : tag.id); }}>▼</button>
                        {pathPickerTag === tag.id && (
                          <div data-picker-menu style={{ position: "absolute", top: "100%", right: 0, zIndex: 999, minWidth: 110, background: bg.panel, border: `1px solid ${border.hover}`, borderRadius: 5, padding: "3px 0", boxShadow: `0 4px 16px rgba(0,0,0,0.35)` }}>
                            <div style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: text.primary, borderRadius: 3, margin: "1px 3px" }}
                              onMouseEnter={e => (e.currentTarget.style.background = accent.tint)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              onClick={async e => {
                                e.stopPropagation(); setPathPickerTag(null);
                                if (isTauri()) { try { const { open } = await import("@tauri-apps/api/dialog"); const sel = await open({ directory: false, multiple: false, title: "选择文件" }); if (sel && typeof sel === "string") { setEditingValueText(sel); } } catch {} }
                              }}>📄 选择文件</div>
                            <div style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: text.primary, borderRadius: 3, margin: "1px 3px" }}
                              onMouseEnter={e => (e.currentTarget.style.background = accent.tint)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              onClick={async e => {
                                e.stopPropagation(); setPathPickerTag(null);
                                if (isTauri()) { try { const { open } = await import("@tauri-apps/api/dialog"); const sel = await open({ directory: true, multiple: false, title: "选择文件夹" }); if (sel && typeof sel === "string") { setEditingValueText(sel); } } catch {} }
                              }}>📁 选择文件夹</div>
                          </div>
                        )}
                      </div>
                      <button style={{ width: 18, height: 18, borderRadius: 3, border: "none", background: accent.deep, color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={e => { e.stopPropagation(); commitValue(tag.id); }}>✓</button>
                    </>
                  )}
                  {/* URL 类型：带历史值提示的链接输入 */}
                  {isUrl && (
                    <TagValueInput
                      tagId={tag.id}
                      tagName={tag.name}
                      tagType="url"
                      value={editingValueText}
                      onChange={setEditingValueText}
                      onSave={val => { setEditingValueText(val); commitValue(tag.id, val); }}
                      onCancel={() => setEditingValueTagId(null)}
                      autoFocus
                      maxHistory={15}
                      historyFetcher={async (tid) => {
                        try {
                          const rows = await invoke("get_tag_distinct_values", { tagId: tid }) as [string, number][];
                          return rows.map(([v, c]) => ({ value: v, count: c, lastUsed: "" }));
                        } catch { return []; }
                      }}
                    />
                  )}
                  <button style={{ width: 18, height: 18, borderRadius: 3, border: "none", background: "transparent", color: text.muted, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onClick={e => { e.stopPropagation(); setEditingValueTagId(null); }}>✕</button>
                </span>
              ) : hasValue ? (
                <span style={{ display: "flex", alignItems: "center", gap: 3, paddingLeft: 1, maxWidth: "100%" }}>
                  <span className={`tt-vtype-badge${!isPath && !isUrl ? " success" : ""}`}>
                    {isPath ? "PATH" : isUrl ? "URL" : "值"}
                  </span>
                  {/* 路径类型：可点击打开文件 */}
                  {isPath ? (
                    <span style={{ fontSize: 10, color: accent.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                      title={tagValuesMap[tag.id]}
                      onClick={e => { e.stopPropagation(); if (isTauri()) invoke("open_file", { filepath: tagValuesMap[tag.id] }); }}>
                      {tagValuesMap[tag.id]}
                    </span>
                  ) : isUrl ? (
                    <span style={{ fontSize: 10, color: accent.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                      title={tagValuesMap[tag.id]}
                      onClick={e => { e.stopPropagation(); openUrl(tagValuesMap[tag.id]); }}>
                      {tagValuesMap[tag.id]}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: accent.light, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
                      title={`点击复制: ${tagValuesMap[tag.id]}`}
                      onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(tagValuesMap[tag.id]).then(() => showToast("已复制到剪贴板")).catch(() => showToast("复制失败")); }}>
                      {tagValuesMap[tag.id]}</span>
                  )}
                  {/* 编辑按钮 */}
                  <button style={{ width: 14, height: 14, borderRadius: 3, border: "none", background: "transparent", color: text.placeholder, fontSize: 7, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s", opacity: 0.5 }}
                    className="tt-action-btn"
                    onClick={e => { e.stopPropagation(); setEditingValueTagId(tag.id); setEditingValueText(tagValuesMap[tag.id] || ""); }}>✎</button>
                  {/* 清除按钮 */}
                  <button style={{ width: 14, height: 14, borderRadius: 3, border: "none", background: "transparent", color: text.placeholder, fontSize: 7, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s", opacity: 0.5 }}
                    className="tt-action-btn"
                    onClick={e => { e.stopPropagation(); onValueSubmit?.(tag.id, ""); }}>✕</button>
                  {/* 路径类型：快速重新选择（文件/文件夹） */}
                  {isPath && (
                    <div data-picker-trigger style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
                      <button style={{ width: 14, height: 14, borderRadius: "2px 0 0 2px", border: "none", background: "transparent", color: text.placeholder, fontSize: 8, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s", opacity: 0.5 }}
                        className="tt-action-btn" title="选择路径"
                        onClick={async e => {
                          e.stopPropagation();
                          if (isTauri()) {
                            try {
                              const { open } = await import("@tauri-apps/api/dialog");
                              const sel = await open({ directory: false, multiple: false, title: "选择文件" });
                              if (sel && typeof sel === "string") { onValueChange?.(tag.id, sel); showToast("路径已更新"); }
                            } catch {}
                          }
                        }}>📂</button>
                      <button style={{ width: 10, height: 14, borderRadius: "0 2px 2px 0", border: "none", background: "transparent", color: text.placeholder, fontSize: 6, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.12s", opacity: 0.5, padding: 0 }}
                        className="tt-action-btn" title="选择文件或文件夹"
                        onClick={e => { e.stopPropagation(); setPathPickerTag(pathPickerTag === tag.id ? null : tag.id); }}>▼</button>
                      {pathPickerTag === tag.id && (
                        <div data-picker-menu style={{ position: "absolute", top: "100%", left: 0, zIndex: 999, minWidth: 110, background: bg.panel, border: `1px solid ${border.hover}`, borderRadius: 5, padding: "3px 0", boxShadow: `0 4px 16px rgba(0,0,0,0.35)` }}>
                          <div style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: text.primary, borderRadius: 3, margin: "1px 3px" }}
                            onMouseEnter={e => (e.currentTarget.style.background = accent.tint)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            onClick={async e => {
                              e.stopPropagation(); setPathPickerTag(null);
                              if (isTauri()) { try { const { open } = await import("@tauri-apps/api/dialog"); const sel = await open({ directory: false, multiple: false, title: "选择文件" }); if (sel && typeof sel === "string") { onValueChange?.(tag.id, sel); showToast("路径已更新"); } } catch {} }
                            }}>📄 选择文件</div>
                          <div style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: text.primary, borderRadius: 3, margin: "1px 3px" }}
                            onMouseEnter={e => (e.currentTarget.style.background = accent.tint)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            onClick={async e => {
                              e.stopPropagation(); setPathPickerTag(null);
                              if (isTauri()) { try { const { open } = await import("@tauri-apps/api/dialog"); const sel = await open({ directory: true, multiple: false, title: "选择文件夹" }); if (sel && typeof sel === "string") { onValueChange?.(tag.id, sel); showToast("路径已更新"); } } catch {} }
                            }}>📁 选择文件夹</div>
                        </div>
                      )}
                    </div>
                  )}
                  {isUrl && tagValuesMap[tag.id] ? (
                    <button style={{ width: 14, height: 14, fontSize: 8, cursor: "pointer", flexShrink: 0, color: text.placeholder, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5, background: "none", border: "none", padding: 0 }}
                      className="tt-action-btn" title="在新标签打开"
                      onClick={e => { e.stopPropagation(); openUrl(tagValuesMap[tag.id]); }}>↗</button>
                  ) : null}
                </span>
              ) : null}
            </div>
          </span>

          {/* 第二格：值操作按钮区 */}
          {onValueChange && (
            <span className="tt-tag-actions" style={{ minWidth: 40, justifyContent: "flex-end" }}>
              {!hasValue && !isTagEditing && (
                <span className="tt-action-btn add-value" title="添加值"
                  onClick={e => { e.stopPropagation(); setEditingValueTagId(tag.id); setEditingValueText(""); }}>
                  +值
                </span>
              )}
            </span>
          )}

          {/* 第三格：操作按钮 */}
          {!isTagEditing && (onRenameTag || onDeleteTag) && (
            <span className="tt-tag-actions">
              {onRenameTag && <span className="tt-action-btn" title="编辑" onClick={e => { e.stopPropagation(); setEditingTagId(tag.id); setEditingTagText(tag.name); }}>✎</span>}
              {onDeleteTag && <span className="tt-action-btn danger" title="删除" onClick={async e => { e.stopPropagation(); if (!await showConfirm({ title: "删除标签", message: `删除标签"${tag.name}"？不可撤销。`, danger: true })) return; await onDeleteTag(tag.id); showToast("标签已删除"); }}>✕</span>}
            </span>
          )}
        </div>
      </React.Fragment>
    );
  }

  // ─────────────────────────────────────────────────────────
  //  扁平模式渲染
  // ─────────────────────────────────────────────────────────
  function renderFlatMode() {
    return (
      <div>
        {safeTags.map(tag => {
          const checked = isBatch ? (selectedIds.includes(tag.id) && !batchRemoveIds?.has(tag.id)) : selectedIds.includes(tag.id);
          const isBatchRemove = isBatch && batchRemoveIds?.has(tag.id);
          const tagColor = getTagColor(tag);
          const ttype = hasTagType(tag.id) ? getTagType(tag.id) : ((tag.tag_type as TagType) || "text");
          const isPath = ttype === "path";
          const isUrl = ttype === "url";
          const isTagEditing = editingTagId === tag.id;
          const hasValue = tagValuesMap[tag.id] !== undefined && tagValuesMap[tag.id] !== "";
          const valExpanded = valueExpanded.has(tag.id);
          const cls = safeClasses.find(c => c.id === tag.class_id);
          const rowBg = isBatchRemove ? `${status.error.color}10` : checked ? `${tagColor}0C` : undefined;
          const isCheckedOrRemove = checked || isBatchRemove;

          return (
            <React.Fragment key={tag.id}>
              <div className={`tt-tag-row${isCheckedOrRemove ? " tt-checked" : ""}${isTagEditing ? " tt-editing" : ""}`}
                style={{ paddingLeft: 38, background: rowBg }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                  {isBatch ? (
                    <div onClick={e => { e.stopPropagation(); onToggle(tag.id); }}
                      style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", position: "relative", background: isBatchRemove ? status.error.color : checked ? accent.deep : "transparent", border: isBatchRemove ? `1.5px solid ${status.error.color}` : checked ? `1.5px solid ${accent.primary}` : `1.5px solid ${border.hover}`, boxShadow: isBatchRemove ? `0 0 8px ${status.error.color}40` : checked ? `0 0 8px ${tagColor}40` : "none", fontSize: 7, color: "#fff" }}>
                      {isBatchRemove ? "✕" : checked ? (
                        <svg className="tt-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: 8, height: 8 }}><polyline points="20 6 9 17 4 12" /></svg>
                      ) : null}
                    </div>
                  ) : (
                    <div onClick={e => { e.stopPropagation(); onToggle(tag.id); }}
                      className={`tt-cb ${checked ? "tt-cb-on" : "tt-cb-off"}`}
                      style={{ background: checked ? accent.deep : undefined, border: checked ? `1.5px solid ${accent.primary}` : undefined, boxShadow: checked ? `0 0 8px ${tagColor}40` : "none" }}>
                      {checked && <svg className="tt-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                    </div>
                  )}
                  <span className="tt-tag-dot" style={{ background: `radial-gradient(circle, ${tagColor}, ${tagColor}88)`, boxShadow: `0 0 4px ${tagColor}50` }} />
                  <span className="tt-tag-type-icon">{isPath ? "📁" : isUrl ? "🔗" : ""}</span>
                  {isTagEditing ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }} onClick={e => e.stopPropagation()}>
                      <input value={editingTagText} onChange={e => setEditingTagText(e.target.value)}
                        style={{ flex: 1, padding: "2px 6px", borderRadius: 3, background: bg.input, border: `1px solid ${accent.primary}`, color: text.primary, fontSize: 12, outline: "none", minWidth: 0 }}
                        autoFocus
                        onKeyDown={async e => { if (e.key === "Enter" && editingTagText.trim()) { await onRenameTag?.(tag, editingTagText.trim(), ttype); setEditingTagId(null); } if (e.key === "Escape") { setEditingTagId(null); } }} />
                      <select value={ttype} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}
                        onChange={e => { setTypeLoadingId(tag.id); setTagType(tag.id, e.target.value as TagType); setTypeVer(v => v + 1); setTimeout(() => setTypeLoadingId(null), 200); }} className="tt-inline-select" style={{ flexShrink: 0 }}>
                        {TAG_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon}</option>)}
                      </select>
                      {typeLoadingId === tag.id && <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid transparent", borderTopColor: accent.primary, borderRadius: "50%", animation: "tt-spin .5s linear infinite", flexShrink: 0 }} />}
                      <span className="tt-action-btn" style={{ color: "#fff", background: accent.deep, borderRadius: 3, fontSize: 10, width: 20, height: 20 }}
                        onClick={e => { e.stopPropagation(); if (editingTagText.trim()) { onRenameTag?.(tag, editingTagText.trim(), ttype); } setEditingTagId(null); }}>✓</span>
                      <span className="tt-action-btn danger" style={{ borderRadius: 3, fontSize: 10, width: 20, height: 20 }}
                        onClick={e => { e.stopPropagation(); setEditingTagId(null); }}>✕</span>
                    </span>
                  ) : (
                    <span className={`tt-tag-name ${checked ? "active" : "inactive"}`}
                      onClick={hasValue ? (e => { e.stopPropagation(); setValueExpanded(p => { const n = new Set(p); n.has(tag.id) ? n.delete(tag.id) : n.add(tag.id); return n; }); }) : undefined}
                      style={hasValue ? { cursor: "pointer" } : undefined}>
                      {tag.name}{cls && <span style={{ fontSize: 8, color: text.placeholder, marginLeft: 4 }}>({cls.name})</span>}
                    </span>
                  )}
                </span>
                <span style={{ width: 12 }}>{hasValue && (
                  <span className="tt-val-expand" style={{ transform: valExpanded ? "rotate(90deg)" : undefined }}
                    onClick={e => { e.stopPropagation(); setValueExpanded(p => { const n = new Set(p); n.has(tag.id) ? n.delete(tag.id) : n.add(tag.id); return n; }); }}>▶</span>
                )}</span>
                {!isTagEditing && (
                  <span className="tt-tag-actions">
                    <span className="tt-action-btn" onClick={e => { e.stopPropagation(); setEditingTagId(tag.id); setEditingTagText(tag.name); }}>✎</span>
                    <span className="tt-action-btn danger" onClick={async e => { e.stopPropagation(); await onDeleteTag?.(tag.id); }}>✕</span>
                  </span>
                )}
              </div>
              {valExpanded && hasValue && (
                <div className="tt-value-children tt-open">
                  <div className="tt-value-node">
                    <span className="tt-vi">{isPath ? "📁" : isUrl ? "🔗" : "📝"}</span>
                    <span className="tt-vlbl">{isPath ? "路径" : isUrl ? "URL" : "值"}</span>
                    {(isPath || isUrl) && <span className="tt-vtype-badge">{isPath ? "PATH" : "URL"}</span>}
                    {isUrl && tagValuesMap[tag.id] ? (
                      <span className="tt-vtxt url" title={tagValuesMap[tag.id]}
                        onClick={e => { e.stopPropagation(); openUrl(tagValuesMap[tag.id]); }}
                        style={{ cursor: "pointer" }}>{tagValuesMap[tag.id]}</span>
                    ) : isPath && tagValuesMap[tag.id] ? (
                      <span className="tt-vtxt path" title={tagValuesMap[tag.id]}
                        onClick={e => { e.stopPropagation(); invoke("open_file", { filepath: tagValuesMap[tag.id] }); }}>{tagValuesMap[tag.id]}</span>
                    ) : (
                      <span className="tt-vtxt text" title={`点击复制: ${tagValuesMap[tag.id]}`}
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(tagValuesMap[tag.id]).then(() => showToast("已复制到剪贴板")).catch(() => showToast("复制失败")); }}>{tagValuesMap[tag.id]}</span>
                    )}
                    <span className="tt-va" data-picker-trigger style={{ position: "relative" }}>
                      {isPath && onValueChange && <>
                        <button className="tt-vbtn edit" title="选择路径"
                          onClick={async e => {
                            e.stopPropagation();
                            if (isTauri()) { try { const { open } = await import("@tauri-apps/api/dialog"); const sel = await open({ directory: false, multiple: false, title: "选择文件" }); if (sel && typeof sel === "string") onValueChange(tag.id, sel); } catch {} }
                          }}>📂</button>
                        <button className="tt-vbtn edit" title="选择文件或文件夹"
                          style={{ fontSize: 8, minWidth: 18, width: 18, padding: 0 }}
                          onClick={e => { e.stopPropagation(); setPathPickerTag(pathPickerTag === tag.id ? null : tag.id); }}>▼</button>
                        {pathPickerTag === tag.id && (
                          <div data-picker-menu style={{ position: "absolute", top: "100%", left: 0, zIndex: 999, minWidth: 110, background: bg.panel, border: `1px solid ${border.hover}`, borderRadius: 5, padding: "3px 0", boxShadow: `0 4px 16px rgba(0,0,0,0.35)` }}>
                            <div style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: text.primary, borderRadius: 3, margin: "1px 3px" }}
                              onMouseEnter={e => (e.currentTarget.style.background = accent.tint)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              onClick={async e => {
                                e.stopPropagation(); setPathPickerTag(null);
                                if (isTauri()) { try { const { open } = await import("@tauri-apps/api/dialog"); const sel = await open({ directory: false, multiple: false, title: "选择文件" }); if (sel && typeof sel === "string") onValueChange(tag.id, sel); } catch {} }
                              }}>📄 选择文件</div>
                            <div style={{ padding: "4px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: text.primary, borderRadius: 3, margin: "1px 3px" }}
                              onMouseEnter={e => (e.currentTarget.style.background = accent.tint)} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              onClick={async e => {
                                e.stopPropagation(); setPathPickerTag(null);
                                if (isTauri()) { try { const { open } = await import("@tauri-apps/api/dialog"); const sel = await open({ directory: true, multiple: false, title: "选择文件夹" }); if (sel && typeof sel === "string") onValueChange(tag.id, sel); } catch {} }
                              }}>📁 选择文件夹</div>
                          </div>
                        )}
                      </>}
                      {isUrl && tagValuesMap[tag.id] && <button className="tt-vbtn edit" title="在新标签打开"
                        onClick={e => { e.stopPropagation(); openUrl(tagValuesMap[tag.id]); }}
                        style={{ background: "none", border: "none" }}>↗</button>}
                      {onValueChange && <button className="tt-vbtn edit" onClick={e => e.stopPropagation()}>✎</button>}
                      {onValueChange && <button className="tt-vbtn clear" onClick={e => { e.stopPropagation(); onValueChange(tag.id, ""); }}>✕</button>}
                    </span>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
        {/* 扁平模式：新建标签 */}
        <div style={{ padding: "8px 14px" }}>
          <span className="tt-add-class-btn" style={{ fontSize: 11 }} onClick={async () => {
            if (safeClasses.length === 0) { showToast("请先创建分类"); return; }
            await onCreateTag?.(safeClasses[0]?.id || "", "新标签");
            showToast("标签已创建");
          }}>
            ＋ 新建标签
          </span>
        </div>
        </div>
      );
    }

  // ─────────────────────────────────────────────────────────
  //  主渲染
  // ─────────────────────────────────────────────────────────
  const scrollStyle: React.CSSProperties = maxHeight ? { maxHeight, overflowY: "auto" } : {};

  return (
    <div className="tt-root" style={{ display: "flex", flexDirection: "column", height: "100%", ...scrollStyle, ...cssVars as React.CSSProperties }}>

      {/* ─── 标签树主体 ─── */}
      <div className="tt-tree-scroll" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {rootClasses.length === 0 && safeTags.length === 0 ? (
          <div className="tt-empty">
            <div className="tt-empty-icon">🏷</div>
            <div className="tt-empty-msg">
              {hasSearch ? "未找到匹配标签" : "暂无标签，请先创建分类"}
            </div>
            {!hasSearch && <div className="tt-empty-hint">创建标签类来组织和管理您的标签</div>}
            {onCreateClass && (
              <div style={{ marginTop: 8 }}>
                <span className="tt-empty-btn" onClick={async () => { await onCreateClass(null, "新分类"); showToast("分类已创建"); }}>＋ 创建第一个分类</span>
              </div>
            )}
          </div>
        ) : flat ? (
          renderFlatMode()
        ) : (
          <div>
            {rootClasses.map(cls => renderClassNode(cls, 0))}
            {/* 根级创建分类按钮 */}
            {onCreateClass && (
              <span className="tt-add-class-btn" onClick={async () => { await onCreateClass(null, "新分类"); showToast("分类已创建"); }}>
                ＋ 添加新分类
              </span>
            )}
            {/* 未分类标签 */}
            {(() => {
              const orphans = safeTags.filter(t => !t.class_id || !safeClasses.find(c => c.id === t.class_id));
              if (orphans.length === 0) return null;
              return (
                <div className="tt-orphan-section">
                  <div className="tt-orphan-label">📄 未分类</div>
                  {orphans.map(tag => {
                    const checked = isBatch ? (selectedIds.includes(tag.id) && !batchRemoveIds?.has(tag.id)) : selectedIds.includes(tag.id);
                    const isBatchRemove = isBatch && batchRemoveIds?.has(tag.id);
                    const tagColor = getTagColor(tag);
                    const ttype = hasTagType(tag.id) ? getTagType(tag.id) : ((tag.tag_type as TagType) || "text");
                    const isPath = ttype === "path";
                    const isUrl = ttype === "url";
                    const hasValue = tagValuesMap[tag.id] !== undefined && tagValuesMap[tag.id] !== "";
                    const valExpanded = valueExpanded.has(tag.id);
                    const isCheckedOrRemove = checked || isBatchRemove;
                    return (
                      <React.Fragment key={tag.id}>
                        <div className={`tt-tag-row${isCheckedOrRemove ? " tt-checked" : ""}`}
                          style={{ paddingLeft: 38, background: isBatchRemove ? `${status.error.color}10` : checked ? `${tagColor}0C` : undefined }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
                            {isBatch ? (
                              <div onClick={e => { e.stopPropagation(); onToggle(tag.id); }}
                                style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", position: "relative", background: isBatchRemove ? status.error.color : checked ? accent.deep : "transparent", border: isBatchRemove ? `1.5px solid ${status.error.color}` : checked ? `1.5px solid ${accent.primary}` : `1.5px solid ${border.hover}`, boxShadow: isBatchRemove ? `0 0 8px ${status.error.color}40` : checked ? `0 0 8px ${tagColor}40` : "none", fontSize: 7, color: "#fff" }}>
                                {isBatchRemove ? "✕" : checked ? (
                                  <svg className="tt-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ width: 8, height: 8 }}><polyline points="20 6 9 17 4 12" /></svg>
                                ) : null}
                              </div>
                            ) : (
                              <div onClick={e => { e.stopPropagation(); onToggle(tag.id); }}
                                className={`tt-cb ${checked ? "tt-cb-on" : "tt-cb-off"}`}
                                style={{ background: checked ? accent.deep : undefined, border: checked ? `1.5px solid ${accent.primary}` : undefined, boxShadow: checked ? `0 0 8px ${tagColor}40` : "none" }}>
                                {checked && <svg className="tt-checkmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
                              </div>
                            )}
                            <span className="tt-tag-dot" style={{ background: `radial-gradient(circle, ${tagColor}, ${tagColor}88)`, boxShadow: `0 0 4px ${tagColor}50` }} />
                            <span className="tt-tag-type-icon">{isPath ? "📁" : isUrl ? "🔗" : ""}</span>
                            <span className={`tt-tag-name ${isCheckedOrRemove ? "active" : "inactive"}`}
                              onClick={hasValue ? (e => { e.stopPropagation(); setValueExpanded(p => { const n = new Set(p); n.has(tag.id) ? n.delete(tag.id) : n.add(tag.id); return n; }); }) : undefined}
                              style={hasValue ? { cursor: "pointer" } : undefined}>{tag.name}</span>
                          </span>
                          <span style={{ width: 12 }}>{hasValue && (
                            <span className="tt-val-expand" style={{ transform: valExpanded ? "rotate(90deg)" : undefined }}
                              onClick={e => { e.stopPropagation(); setValueExpanded(p => { const n = new Set(p); n.has(tag.id) ? n.delete(tag.id) : n.add(tag.id); return n; }); }}>▶</span>
                          )}</span>
                        </div>
                        {valExpanded && hasValue && (
                          <div className="tt-value-children tt-open">
                            <div className="tt-value-node">
                              <span className="tt-vi">{isPath ? "📁" : isUrl ? "🔗" : "📝"}</span>
                              <span className="tt-vlbl">{isPath ? "路径" : isUrl ? "URL" : "值"}</span>
                              {(isPath || isUrl) && <span className="tt-vtype-badge">{isPath ? "PATH" : "URL"}</span>}
                                {isUrl && tagValuesMap[tag.id] ? (
                                  <span className="tt-vtxt url" title={tagValuesMap[tag.id]}
                                    onClick={e => { e.stopPropagation(); openUrl(tagValuesMap[tag.id]); }}
                                    style={{ cursor: "pointer" }}>{tagValuesMap[tag.id]}</span>
                                ) : isPath && tagValuesMap[tag.id] ? (
                                <span className="tt-vtxt path" title={tagValuesMap[tag.id]}
                                  onClick={e => { e.stopPropagation(); invoke("open_file", { filepath: tagValuesMap[tag.id] }); }}>{tagValuesMap[tag.id]}</span>
                              )                               : (
                                <span className="tt-vtxt text" title={`点击复制: ${tagValuesMap[tag.id]}`}
                                  onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(tagValuesMap[tag.id]).then(() => showToast("已复制到剪贴板")).catch(() => showToast("复制失败")); }}>{tagValuesMap[tag.id]}</span>
                              )}
                              {onValueChange && (
                                <span className="tt-va">
                                  <button className="tt-vbtn clear" onClick={e => { e.stopPropagation(); onValueChange(tag.id, ""); }}>✕</button>
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ─── 底部状态栏 ─── */}
      {!simple && (
        <div className="tt-status-bar">
          <span className="tt-stat">已选 <span className="num">{selectedCount}</span></span>
          <span className="tt-stat">总计 <span className="num">{safeTags.length}</span></span>
          <span className="tt-stat">有值 <span className="num">{valuedCount}</span></span>
          {searchLoading && <span className="tt-stat" style={{ marginLeft: 4 }}>
            <span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid transparent", borderTopColor: accent.primary, borderRadius: "50%", animation: "tt-spin .5s linear infinite", marginRight: 3, verticalAlign: "middle" }} />
            <span style={{ color: text.muted, fontSize: 9 }}>检索中...</span>
          </span>}
          <span className="tt-expand-val" onClick={expandAllValues}>📂 展开值</span>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          padding: "8px 16px", borderRadius: 6, background: "var(--tt-bg-floating)",
          border: "1px solid var(--tt-border-accent)", color: "var(--tt-text-primary)",
          fontSize: 11, opacity: 1, transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
          pointerEvents: "none", zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          ✓ {toast}
        </div>
      )}
    </div>
  );
}
