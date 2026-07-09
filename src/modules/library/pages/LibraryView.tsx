import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "../../../store/appStore";
import { usePageState } from "../../../hooks/usePageState";
import { notify } from "../../../components/Notification";
import { invoke, isTauri } from "../../../tauri-invoke";
import ContextMenu from "../../../components/ContextMenu";
import { convertFileSrc, openWithDefaultPlayer } from "../../../safe-tauri";
import TagTree from "../components/TagTree";
import { getTagType, hasTagType } from "../components/tagTypeStore";
import type { Video, TagName } from "../../../types";
import { bg, border, accent, text, status } from "../../../theme/ethereal";
import { useTheme } from "../../../theme/useTheme";
import type { NovelStatus } from "../components/NovelStatusBadge";


async function playWithLocalPlayer(filepath: string) {
  try {
    await openWithDefaultPlayer(filepath);
  } catch (e) {
    notify({ type: "error", title: "播放失败", message: String(e) });
  }
}

// 排序方式：内置固定为按文件名 A→Z

const _videoTagsCache = new Map<string, string[]>();

const cardFieldConfig: Record<string, { label: string; group: string; render: (v: Video) => React.ReactNode }> = {
  size: { label: "文件大小", group: "basic", render: (v) => {
    if (v.size <= 0) return null;
    const gb = v.size / 1073741824;
    return gb >= 0.9 ? <span className="info-chip"><span className="ic-icon">💾</span><span className="ic-val">{gb.toFixed(1)} GB</span></span> : <span className="info-chip"><span className="ic-icon">💾</span><span className="ic-val">{(v.size / 1048576).toFixed(0)} MB</span></span>;
  }},
  date: { label: "创建日期", group: "basic", render: (v) => v.file_created_at ? <span className="info-chip"><span className="ic-icon">📅</span><span className="ic-val">{v.file_created_at.slice(0, 10)}</span></span> : null },
  duration: { label: "时长", group: "basic", render: (v) => {
    if (v.duration <= 0) return null;
    const h = v.duration / 3600;
    return h >= 1 ? <span className="info-chip"><span className="ic-icon">⏱</span><span className="ic-val">{h.toFixed(1)} 时</span></span> : <span className="info-chip"><span className="ic-icon">⏱</span><span className="ic-val">{(v.duration / 60).toFixed(0)} 分</span></span>;
  }},
  resolution: { label: "分辨率", group: "tech", render: (v) => {
    if (v.width <= 0 || v.height <= 0) return null;
    const h = v.height;
    const label = h <= 144 ? "144p" : h <= 240 ? "240p" : h <= 360 ? "360p" : h <= 480 ? "480p" : h <= 540 ? "540p" : h <= 720 ? "720p" : h <= 1080 ? "1080p" : h <= 1440 ? "2K" : h <= 2160 ? "4K" : h <= 4320 ? "8K" : null;
    return label ? <span className="info-chip"><span className="ic-icon">🎬</span><span className="ic-val">{label}</span></span> : <span className="info-chip"><span className="ic-icon">🎬</span><span className="ic-val">{v.width}×{v.height}</span></span>;
  }},
  codec: { label: "编码格式", group: "tech", render: (v) => v.video_codec ? <span className="info-chip"><span className="ic-icon">📦</span><span className="ic-val">{v.video_codec}</span></span> : null },
  fps: { label: "帧率", group: "tech", render: (v) => v.fps > 0 ? <span className="info-chip"><span className="ic-icon">⚡</span><span className="ic-val">{v.fps.toFixed(1)} fps</span></span> : null },
  bitrate: { label: "码率", group: "tech", render: (v) => {
    if (v.bitrate <= 0) return null;
    const mbps = v.bitrate / 1000000;
    return mbps >= 0.9 ? <span className="info-chip"><span className="ic-icon">📡</span><span className="ic-val">{mbps.toFixed(1)} Mbps</span></span> : <span className="info-chip"><span className="ic-icon">📡</span><span className="ic-val">{(v.bitrate / 1000).toFixed(0)} kbps</span></span>;
  }},
  video_codec_profile: { label: "编码配置", group: "tech", render: (v) => (v as any).video_codec_profile ? <span className="info-chip"><span className="ic-icon">🔤</span><span className="ic-val">{(v as any).video_codec_profile}</span></span> : null },
  pix_fmt: { label: "像素格式", group: "tech", render: (v) => (v as any).pix_fmt ? <span className="info-chip"><span className="ic-icon">🎯</span><span className="ic-val">{(v as any).pix_fmt}</span></span> : null },
  time_base: { label: "时基", group: "tech", render: (v) => (v as any).time_base ? <span className="info-chip"><span className="ic-icon">🕐</span><span className="ic-val">{(v as any).time_base}</span></span> : null },
  codec_level: { label: "编码等级", group: "tech", render: (v) => (v as any).codec_level ? <span className="info-chip"><span className="ic-icon">📶</span><span className="ic-val">{(v as any).codec_level}</span></span> : null },
  encoder: { label: "编码器", group: "tech", render: (v) => (v as any).encoder ? <span className="info-chip"><span className="ic-icon">🔧</span><span className="ic-val">{(v as any).encoder}</span></span> : null },
  audio_codec: { label: "音频编码", group: "tech", render: (v) => v.audio_codec ? <span className="info-chip"><span className="ic-icon">🔊</span><span className="ic-val">{v.audio_codec}</span></span> : null },
  audio_sample_rate: { label: "采样率", group: "tech", render: (v) => v.audio_sample_rate > 0 ? <span className="info-chip"><span className="ic-icon">📊</span><span className="ic-val">{(v.audio_sample_rate / 1000) >= 10 ? (v.audio_sample_rate / 1000).toFixed(0) : (v.audio_sample_rate / 1000).toFixed(1)} kHz</span></span> : null },
  audio_channels: { label: "声道数", group: "tech", render: (v) => v.audio_channels > 0 ? <span className="info-chip"><span className="ic-icon">🎤</span><span className="ic-val">{v.audio_channels === 1 ? "单声道" : v.audio_channels === 2 ? "立体声" : `${v.audio_channels} 声道`}</span></span> : null },
  audio_profile: { label: "音频配置", group: "tech", render: (v) => (v as any).audio_profile ? <span className="info-chip"><span className="ic-icon">🎛️</span><span className="ic-val">{(v as any).audio_profile}</span></span> : null },
  format: { label: "文件格式", group: "file_info", render: (v) => v.format ? <span className="info-chip"><span className="ic-icon">📁</span><span className="ic-val">{v.format}</span></span> : null },
  favorite: { label: "收藏状态", group: "mark", render: (v) => v.favorite ? <span className="info-chip"><span className="ic-icon">⭐</span><span className="ic-val" style={{ color: status.warning.color }}>已收藏</span></span> : null },
};

const s = {
  header: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const } as React.CSSProperties,
  viewBtn: (active: boolean) => ({ padding: "5px 10px", background: active ? accent.tintMid : bg.surface, color: active ? accent.primary : text.secondary, border: `1px solid ${border.default}`, borderRadius: 4, fontSize: 10, cursor: "pointer", transition: "all 0.2s" } as React.CSSProperties),

  actionBtn: { padding: "5px 10px", background: bg.surface, color: text.secondary, border: `1px solid ${border.default}`, borderRadius: 4, fontSize: 10, cursor: "pointer", transition: "all 0.2s" } as React.CSSProperties,
  classifyBtn: (active: boolean) => ({ padding: "5px 10px", background: active ? accent.tintMid : bg.surface, color: active ? accent.light : text.secondary, border: `1px solid ${active ? accent.primary : border.default}`, borderRadius: 4, fontSize: 10, cursor: "pointer", transition: "all 0.2s", display: "inline-flex", alignItems: "center", gap: 4 } as React.CSSProperties),
  grid: (size: number) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`, gap: 12, willChange: "grid-template-columns" } as React.CSSProperties),
  vCard: { background: bg.elevated, borderWidth: 1, borderStyle: "solid", borderColor: border.default, borderRadius: 8, overflow: "hidden", cursor: "pointer", transition: "border-color 0.2s", position: "relative" as const } as React.CSSProperties,
  vCardHover: { borderColor: accent.tintStrong } as React.CSSProperties,
  vThumb: (hasCover: boolean) => ({ aspectRatio: "16 / 9" as const, background: hasCover ? bg.sidebar : `linear-gradient(135deg,${bg.panel},${bg.sidebar})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, position: "relative" as const, overflow: "hidden", minHeight: 60 } as React.CSSProperties),
  vDur: { position: "absolute" as const, bottom: 5, right: 5, background: "rgba(0,0,0,0.8)", color: "#d1d5db", fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "0.02em" } as React.CSSProperties,
  vInfo: { padding: "10px 10px 9px" } as React.CSSProperties,
  vName: { fontSize: 12, color: text.primary, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500 } as React.CSSProperties,
  vMeta: { fontSize: 9, color: text.muted, marginTop: 4, display: "flex", gap: 3, columnGap: 6, flexWrap: "wrap", lineHeight: 1.4 } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 11 } as React.CSSProperties,
  th: { background: bg.surface, padding: "7px 10px", textAlign: "left" as const, fontWeight: 600, color: text.secondary, borderBottom: `1px solid ${border.default}`, whiteSpace: "nowrap" as const } as React.CSSProperties,
  td: { padding: "6px 10px", borderBottom: `1px solid ${border.divider}`, color: text.secondary } as React.CSSProperties,
  infoRows: { display: "flex", flexDirection: "column" as const, gap: 2 } as React.CSSProperties,
  infoRow: { display: "flex", alignItems: "center", padding: "5px 8px", borderBottom: `1px solid ${border.divider}`, fontSize: 11 } as React.CSSProperties,
  label: { width: 80, color: text.muted, flexShrink: 0 } as React.CSSProperties,
  value: { color: text.secondary, overflow: "hidden", textOverflow: "ellipsis" } as React.CSSProperties,
  emptyBox: { flex: 1, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: 40, color: text.muted, fontSize: 12, gap: 6 } as React.CSSProperties,

  content: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" as const, transition: "width 0.25s ease-out" } as React.CSSProperties,
  contentWrap: { display: "flex", gap: 0, flex: 1, minHeight: 0, transition: "grid-template-columns 0.25s ease-out" } as React.CSSProperties,
};

// ═══════════════════════════════════════════════════════════════
//  日期归类工具函数
// ═══════════════════════════════════════════════════════════════
const MODE_LABELS: Record<string, string> = { month: "月", week: "周", day: "日" };

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDate(s: string) { const d = new Date(s); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function getWeekNum(d: Date) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dn);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt.getTime() - ys.getTime()) / 86400000 + 1) / 7);
}

function weekRange(ds: string) {
  const d = new Date(ds), dw = d.getDay() || 7;
  const m = new Date(d); m.setDate(d.getDate() - dw + 1);
  const s = new Date(m); s.setDate(m.getDate() + 6);
  return fmtISO(m) + " ~ " + fmtISO(s);
}

function fmtISO(d: Date) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

function gKey(ds: string, m: string) {
  const d = new Date(ds);
  if (m === "month") return d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
  if (m === "week") return d.getFullYear() + "年第" + getWeekNum(d) + "周";
  const wd = ["日", "一", "二", "三", "四", "五", "六"];
  return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日 周" + wd[d.getDay()];
}

interface GroupResult { label: string; range: string; videos: Video[]; }

function groupByDate(vs: Video[], m: string): GroupResult[] {
  const g: Record<string, GroupResult> = {};
  const ks: string[] = [];
  vs.forEach(v => {
    const dateStr = v.file_created_at ? v.file_created_at.slice(0, 10) : "";
    if (!dateStr) return;
    const k = gKey(dateStr, m);
    if (!g[k]) { g[k] = { label: k, range: "", videos: [] }; ks.push(k); }
    g[k].videos.push(v);
  });
  const pMap: Record<string, (k: string) => Date> = {
    month: k => new Date(+k.match(/(\d+)年/)![1], +k.match(/(\d+)月/)![1] - 1),
    week: k => { const t = k.match(/(\d+)年/)!, w = k.match(/(\d+)周/)!; return new Date(+t[1], 0, (+w[1] - 1) * 7); },
    day: k => new Date(k.replace("年", "/").replace("月", "/").replace("日", "").replace(/周./, "")),
  };
  ks.sort((a, b) => pMap[m](b).getTime() - pMap[m](a).getTime());
  ks.forEach(k => {
    const vs2 = g[k].videos;
    vs2.sort((a, b) => ((b.file_created_at || "") > (a.file_created_at || "") ? 1 : -1));
    const f = vs2[0].file_created_at?.slice(0, 10) || "";
    const l = vs2[vs2.length - 1].file_created_at?.slice(0, 10) || "";
    g[k].range = m === "day" ? f : m === "week" ? weekRange(f) : f === l ? f : f + " ~ " + l;
  });
  return ks.map(k => g[k]);
}

/** 简单 LRU Map：限制最大条目数，访问自动提升优先级 */
class LRUMap<K, V> extends Map<K, V> {
  constructor(private maxSize: number) { super(); }
  get(key: K): V | undefined {
    const val = super.get(key);
    if (val !== undefined) {
      super.delete(key);
      super.set(key, val); // 重新插入到末尾（最新位置）
    }
    return val;
  }
  set(key: K, value: V): this {
    // 如果已存在先删除，重新插入到末尾
    if (super.has(key)) super.delete(key);
    // 超过上限则淘汰最早条目
    if (this.size >= this.maxSize) {
      const oldest = this.keys().next();
      if (!oldest.done) this.delete(oldest.value);
    }
    return super.set(key, value);
  }
}
const _coverCache = new LRUMap<string, string>(2000);

export default function LibraryView() {
  const { bg, border, accent, text, status } = useTheme();
  const currentLibraryId = useAppStore(s => s.currentLibraryId);
  const videos = useAppStore(s => s.videos);
  const videoPage = useAppStore(s => s.videoPage);
  const videoPageSize = useAppStore(s => s.videoPageSize);
  const totalVideos = useAppStore(s => s.totalVideos);
  const loadVideos = useAppStore(s => s.loadVideos);
  const setVideoPage = useAppStore(s => s.setVideoPage);
  const libraryVideoPage = useAppStore(s => s.libraryVideoPage);
  const setVideoPageSize = useAppStore(s => s.setVideoPageSize);
  const navigateTo = useAppStore(s => s.navigateTo);
  const openDialog = useAppStore(s => s.openDialog);
  const videoSearch = useAppStore(s => s.videoSearch);
  const setVideoSearch = useAppStore(s => s.setVideoSearch);
  const videoSearchScope = useAppStore(s => s.videoSearchScope);
  const setVideoSearchScope = useAppStore(s => s.setVideoSearchScope);
  const startScan = useAppStore(s => s.startScan);
  const scanProgress = useAppStore(s => s.scanProgress);
  const scanningLibraryId = useAppStore(s => s.scanningLibraryId);
  const cancelScan = useAppStore(s => s.cancelScan);
  const tagClasses = useAppStore(s => s.tagClasses);
  const classTags = useAppStore(s => s.classTags);
  const loadTagClasses = useAppStore(s => s.loadTagClasses);
  const loadClassTags = useAppStore(s => s.loadClassTags);
  const allVideosCount = useAppStore(s => s.allVideosCount);
  const totalStorage = useAppStore(s => s.totalStorage);
  const currentPage = useAppStore(s => s.currentPage);
  const settings = useAppStore(s => s.settings);
  const libraries = useAppStore(s => s.libraries);
  const storeCardInfoFields = useAppStore(s => s.cardInfoFields);
  const storeCardTagIds = useAppStore(s => s.cardTagIds);
  const videoTagsMap = useAppStore(s => s.videoTagsMap);
  const getVideoTaggingsBatch = useAppStore(s => s.getVideoTaggingsBatch);

  // 滚动位置持久化（按标签页存储到 tabState）
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabId = useAppStore(s => s.activeTabId);
  const updateTabState = useAppStore(s => s.updateTabState);
  const getTabState = useAppStore(s => s.getTabState);
  const scrollRestoredRef = useRef(false);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !tabId) return;
    const ts = getTabState(tabId) || { scrollPos: 0, filters: {}, viewMode: "card", page: 1 };
    updateTabState(tabId, { ...ts, scrollPos: el.scrollTop });
  }, [tabId, getTabState, updateTabState]);

  const CARD_SIZE = 175;
  const [viewMode, setViewMode] = usePageState<"card" | "list">("viewMode", (settings?.default_view_mode as "card" | "list") || "card");

  // ── 日期归类状态 ──
  // 时间归类状态持久化到 appStore（按 libraryId 索引，关闭库后不重置）
  const libClassifyStore = useAppStore(s => ({
    state: s.libraryClassifyState,
    libId: s.currentLibraryId,
  }));
  const setClassifyAll = useCallback((updates: Partial<{ mode: string; dateStart: string; dateEnd: string; preset: string }>) => {
    const s = useAppStore.getState();
    const libId = s.currentLibraryId;
    if (!libId) return;
    const prev = s.libraryClassifyState[libId] || { mode: "", dateStart: "", dateEnd: "", preset: "all" };
    const updated = { ...prev, ...updates };
    useAppStore.setState({ libraryClassifyState: { ...s.libraryClassifyState, [libId]: updated } });
    // 持久化到 localStorage（跨重启保留）
    try {
      const all = JSON.parse(localStorage.getItem("libraryClassifyState") || "{}");
      all[libId] = updated;
      localStorage.setItem("libraryClassifyState", JSON.stringify(all));
    } catch {}
  }, []);
  const cs = libClassifyStore.libId ? libClassifyStore.state[libClassifyStore.libId] : undefined;
  const classifyMode = cs?.mode ?? "";
  const setClassifyMode = (v: string) => setClassifyAll({ mode: v });
  const [classifyDropdownOpen, setClassifyDropdownOpen] = useState(false);
  const classifyDateStart = cs?.dateStart ?? "";
  const setClassifyDateStart = (v: string) => setClassifyAll({ dateStart: v });
  const classifyDateEnd = cs?.dateEnd ?? "";
  const setClassifyDateEnd = (v: string) => setClassifyAll({ dateEnd: v });
  const classifyPreset = cs?.preset ?? "all";
  const setClassifyPreset = (v: string) => setClassifyAll({ preset: v });

  const classifyDropdownRef = useRef<HTMLDivElement>(null);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; video: Video } | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [dndHoverId, setDndHoverId] = useState<string | null>(null);
  // 多选批量管理（持久化，避免切换页面后选中状态丢失）
  const [selectedIdsList, setSelectedIdsList] = usePageState<string[]>("selectedIds", []);
  const selectedIds = useMemo(() => new Set(selectedIdsList), [selectedIdsList]);
  const setSelectedIds = useCallback((val: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setSelectedIdsList(prev => {
      const next = typeof val === "function" ? val(new Set(prev)) : val;
      return [...next];
    });
  }, [setSelectedIdsList]);
  // 鼠标长按拖动选择：按下时记录起始卡 + 当前选中集，拖动时扩展范围选择
  const dragSelectRef = useRef<{ startVid: string | null; startIdx: number; snapshot: string[] }>({ startVid: null, startIdx: -1, snapshot: [] });
  // 标记本次鼠标操作是否真的是拖拽（区别于单击鼠标按下又抬起）
  const wasDraggingRef = useRef(false);
  // 小说/音频/链接状态批量加载
  const [novelStatusMap, setNovelStatusMap] = useState<Record<string, NovelStatus>>({});
  const [novelLinkMap, setNovelLinkMap] = useState<Record<string, { url: string; note: string }>>({}); // videoId → 首链接
  const novelCacheRef = useRef<Record<string, NovelStatus>>({});
  const novelLinkCacheRef = useRef<Record<string, { url: string; note: string }>>({});
  // 追踪最后一次点击的卡片 ID（用于 Shift+单击范围选择 + 双击详情）
  const lastClickedRef = useRef<string | null>(null);
  const lastClickTimeRef = useRef(0);
  const clickTimerRef = useRef<number | null>(null);
  const cleanupRanRef = useRef<string | null>(null);

  const cardDisplayTagIds = useMemo(() => {
    const allLibs = Object.values(libraries).flat().filter(Boolean);
    const lib = allLibs.find((l: any) => l?.id === currentLibraryId);
    if (lib && (lib as any).card_tag_ids) {
      try { const parsed = JSON.parse((lib as any).card_tag_ids); if (Array.isArray(parsed) && parsed.length > 0) return parsed; } catch {}
    }
    return storeCardTagIds;
  }, [libraries, currentLibraryId, storeCardTagIds]);

  const libraryCardFields = useMemo(() => {
    if (!currentLibraryId) return ["size", "date", "resolution"];
    const allLibs = Object.values(libraries).flat().filter(Boolean);
    const lib = allLibs.find((l: any) => l?.id === currentLibraryId);
    if (lib && (lib as any).card_info_fields) {
      try {
        const parsed = JSON.parse((lib as any).card_info_fields);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return storeCardInfoFields;
  }, [libraries, currentLibraryId, storeCardInfoFields]);

  const currentLibrary = useMemo(() => {
    if (!currentLibraryId) return null;
    const allLibs = Object.values(libraries).flat().filter(Boolean);
    return (allLibs.find((l: any) => l?.id === currentLibraryId) as any) || null;
  }, [currentLibraryId, libraries]);

  const cardInfoFields = useMemo(() => {
    if (cardDisplayTagIds.length > 0 && !libraryCardFields.includes("tags")) {
      return [...libraryCardFields, "tags"];
    }
    return libraryCardFields;
  }, [libraryCardFields, cardDisplayTagIds]);

  const visibleDuringScan = scanProgress && scanProgress.status === "running" ? 40 : Infinity;
  const visibleVideos = React.useMemo(() => videos.slice(0, visibleDuringScan).filter(Boolean), [videos, visibleDuringScan]);

  const dynamicFormats = useMemo(() => {
    // 扫描期间只从可见视频提取，避免遍历全量视频数组
    const source = visibleDuringScan < Infinity ? visibleVideos : videos;
    const fmts = [...new Set(source.map(v => v.format).filter(Boolean))].sort();
    return fmts.length > 0 ? fmts : ["mp4", "mov", "avi", "mkv", "wmv", "flv", "webm", "mpeg", "mts", "m2ts", "ts", "3gp", "ogv"];
  }, [videos, visibleVideos, visibleDuringScan]);


  // ── 键盘选中快捷键 ──
  // 追踪键盘聚焦的卡片（用于 Space/Arrow 操作）
  const [focusedCardIdx, setFocusedCardIdx] = useState<number>(-1);
  // 使用 ref 避免 TDZ（toggleBatchSelect 定义在后面）
  const toggleBatchSelectRef = useRef<typeof toggleBatchSelect>(null as any);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      // Ctrl+A 切换：首次全选，再次清空（如文件管理器行为）
      if (ctrl && e.key === "a") {
        e.preventDefault();
        setSelectedIds(prev => {
          const all = new Set(visibleVideos.map(v => v.id));
          if (prev.size > 0 && all.size === prev.size) {
            // 已全选 → 清空
            lastClickedRef.current = null;
            return new Set();
          }
          // 未全选 → 全选
          if (visibleVideos.length > 0) lastClickedRef.current = visibleVideos[visibleVideos.length - 1].id;
          return all;
        });
        return;
      }
      // Ctrl+D 取消全选
      if (ctrl && e.key === "d") {
        e.preventDefault();
        setSelectedIds(new Set());
        lastClickedRef.current = null;
        return;
      }
      // Ctrl+I 反选
      if (ctrl && e.key === "i") {
        e.preventDefault();
        setSelectedIds(prev => {
          const ids = new Set(visibleVideos.map(v => v.id));
          return new Set([...ids].filter(id => !prev.has(id)));
        });
        return;
      }
      // Space 切换选中聚焦的卡片
      if (e.key === " " && focusedCardIdx >= 0 && focusedCardIdx < visibleVideos.length) {
        e.preventDefault();
        toggleBatchSelectRef.current(visibleVideos[focusedCardIdx].id);
        return;
      }
      // Shift+↑/↓ 范围选中
      if (shift && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        if (visibleVideos.length === 0) return;
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const nextIdx = Math.max(0, Math.min(visibleVideos.length - 1, focusedCardIdx + dir));
        setFocusedCardIdx(nextIdx);
        const vid = visibleVideos[nextIdx].id;
        if (!lastClickedRef.current) {
          lastClickedRef.current = vid;
          setSelectedIds(new Set([vid]));
        } else {
          const lastIdx = visibleVideos.findIndex(v => v.id === lastClickedRef.current);
          if (lastIdx >= 0) {
            const [start, end] = lastIdx < nextIdx ? [lastIdx, nextIdx] : [nextIdx, lastIdx];
            const ids = new Set<string>();
            for (let i = start; i <= end; i++) ids.add(visibleVideos[i].id);
            setSelectedIds(ids);
          }
        }
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleVideos, focusedCardIdx]);

  // 选中状态不因点击空白区域自动清除，仅通过"取消选择"按钮或快捷键主动关闭

  // ── 日期归类下拉外部点击关闭 ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!classifyDropdownOpen) return;
      if (classifyDropdownRef.current && !classifyDropdownRef.current.contains(e.target as Node)) {
        setClassifyDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [classifyDropdownOpen]);

  function firstCover(v: Video): string {
    if (!v.thumbnail_path) return "";
    try {
      const p = JSON.parse(v.thumbnail_path);
      // Handle empty array case "[]"
      if (Array.isArray(p)) {
        if (p.length === 0) return "";
        const path = p[0];
        return typeof path === "string" ? path.replace(/^\\\\\?\\/, "") : v.thumbnail_path;
      }
      return typeof p === "string" ? p.replace(/^\\\\\?\\/, "") : v.thumbnail_path;
    } catch { return v.thumbnail_path; }
  }

  const cacheRef = useRef<Map<string, string>>(_coverCache);
  const loadingGenRef = useRef(0);
  const [coverDataUrls, setCoverDataUrls] = useState<Record<string, string>>({});
  const videoIdSig = React.useMemo(() => visibleVideos.map(v => v.id).join(","), [visibleVideos]);

  const coverCacheVersion = useAppStore(s => s.coverCacheVersion);
  const prevCoverCacheVerRef = useRef(coverCacheVersion);
  if (prevCoverCacheVerRef.current !== coverCacheVersion) {
    prevCoverCacheVerRef.current = coverCacheVersion;
    _coverCache.clear();
    setCoverDataUrls({});
  }

  const coverQuality = settings?.cover_quality ?? 0;

  const qualityVersion = `${coverQuality}`;
  const prevQualityRef = useRef(qualityVersion);

  useEffect(() => {
    const targetList = visibleVideos;
    const gen = ++loadingGenRef.current;
    const CHUNK_SIZE = 20;

    if (prevQualityRef.current !== qualityVersion) {
      cacheRef.current.clear();
      prevQualityRef.current = qualityVersion;
    }

    const initial: Record<string, string> = {};
    const needLoad: { id: string; path: string }[] = [];
    for (const v of targetList) {
      const cached = cacheRef.current.get(v.id);
      if (cached) {
        initial[v.id] = cached;
      } else {
        const cp = firstCover(v);
        if (cp) needLoad.push({ id: v.id, path: cp });
      }
    }

    if (Object.keys(initial).length > 0) {
      setCoverDataUrls((prev) => {
        let changed = false;
        for (const [k, v] of Object.entries(initial)) {
          if (prev[k] !== v) { changed = true; break; }
        }
        return changed ? { ...prev, ...initial } : prev;
      });
    }
    if (needLoad.length === 0) return;

    (async () => {
      for (let offset = 0; offset < needLoad.length && gen === loadingGenRef.current; offset += CHUNK_SIZE) {
        const chunk = needLoad.slice(offset, offset + CHUNK_SIZE);
        const chunkPaths = chunk.map(x => x.path);
        const chunkUrls: Record<string, string> = {};
        try {
          const results: [string, string][] = await invoke("get_thumbnails_batch", {
            paths: chunkPaths,
            maxWidth: coverQuality > 0 ? coverQuality : null,
            quality: 90,
          });
          const processed = new Set<string>();
          for (const [origPath, b64] of results) {
            processed.add(origPath);
            const item = chunk.find(x => x.path === origPath);
            if (item) {
              cacheRef.current.set(item.id, b64);
              chunkUrls[item.id] = b64;
            }
          }

          for (const item of chunk) {
            if (!processed.has(item.path) && !chunkUrls[item.id]) {
              try {
                const singleB64 = await invoke<string>("get_thumbnail", {
                  path: item.path,
                  maxWidth: coverQuality > 0 ? coverQuality : null,
                  quality: 90,
                });
                cacheRef.current.set(item.id, singleB64);
                chunkUrls[item.id] = singleB64;
              } catch { /* 封面文件不存在时静默跳过——清理/归类后旧路径失效是正常现象 */ }
            }
          }
        } catch { /* 封面分块加载异常静默跳过 */ }

        if (gen === loadingGenRef.current && Object.keys(chunkUrls).length > 0) {
          setCoverDataUrls((prev) => ({ ...prev, ...chunkUrls }));
        }
      }
    })();
    return () => { loadingGenRef.current++; };
  }, [videoIdSig, currentLibraryId, qualityVersion, coverCacheVersion]);

  const coverRefreshVersion = useAppStore(s => s.coverRefreshVersion);
  const visibleVideoIds = React.useMemo(() => visibleVideos.map(v => v.id), [visibleVideos]);
  const visibleVideoIdSig = React.useMemo(() => visibleVideoIds.join(","), [visibleVideoIds]);
  useEffect(() => {
    let needsReload = false;
    for (const vid of visibleVideoIds) {
      if (coverRefreshVersion[vid]) {
        cacheRef.current.delete(vid);  // 清除旧缓存
        needsReload = true;
      }
    }
    if (needsReload) {

      (async () => {
        const toLoad: { id: string; path: string }[] = [];
        for (const v of visibleVideos) {
          if (coverRefreshVersion[v.id]) {
            const cp = firstCover(v);
            if (cp) toLoad.push({ id: v.id, path: cp });
          }
        }
        for (const item of toLoad) {
          try {
            const b64 = await invoke<string>("get_thumbnail", { path: item.path, maxWidth: coverQuality > 0 ? coverQuality : null, quality: 90 });
            cacheRef.current.set(item.id, b64);
            setCoverDataUrls(prev => ({ ...prev, [item.id]: b64 }));
          } catch { /* 刷新封面失败静默跳过 */ }
        }
      })();
    }
  }, [coverRefreshVersion, visibleVideoIdSig]);

  // 批量加载可见视频的小说/音频/链接状态
  const novelSig = React.useMemo(() => visibleVideos.map(v => v.id).join(","), [visibleVideos]);
  const novelLinkRefreshVersion = useAppStore(s => s.novelLinkRefreshVersion);
  useEffect(() => {
    // 检查是否有视频需要强制刷新（novelLinkRefreshVersion 变化）
    const refreshIds = visibleVideos
      .filter(v => novelLinkRefreshVersion[v.id] !== undefined && novelCacheRef.current[v.id] !== undefined)
      .map(v => v.id);
    if (refreshIds.length > 0) {
      refreshIds.forEach(id => { delete novelCacheRef.current[id]; delete novelLinkCacheRef.current[id]; });
    }
    const ids = visibleVideos.filter(v => !novelCacheRef.current[v.id]).map(v => v.id);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        // 返回格式: Record<videoId, [status, firstLinkUrl, firstLinkNote]>
        const result = await invoke<Record<string, [string, string, string]>>("get_novel_status_batch", { videoIds: ids });
        if (cancelled) return;
        const mergedStatus: Record<string, NovelStatus> = { ...novelCacheRef.current };
        const mergedLink: Record<string, { url: string; note: string }> = { ...novelLinkCacheRef.current };
        for (const [id, [status, linkUrl, linkNote]] of Object.entries(result)) {
          const s = status as NovelStatus;
          mergedStatus[id] = s;
          mergedLink[id] = { url: linkUrl, note: linkNote };
          novelCacheRef.current[id] = s;
          novelLinkCacheRef.current[id] = { url: linkUrl, note: linkNote };
        }
        setNovelStatusMap(mergedStatus);
        setNovelLinkMap(mergedLink);
      } catch (e) {
        console.warn("[novelStatus] batch load failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [novelSig, novelLinkRefreshVersion]);

  const totalPages = Math.max(1, Math.ceil(totalVideos / videoPageSize));
  const emptyHint = videoSearch.trim()
    ? "当前搜索条件没有匹配的视频，清空搜索后可查看全部内容"
    : "点击\"立即扫描\"索引视频文件";

  useEffect(() => {
    if (currentLibraryId) {
      // 确保 libraries 数据是最新的（含 card_info_fields / card_tag_ids）
      const store = useAppStore.getState();
      for (const catId of Object.keys(store.libraries)) {
        if (store.libraries[catId]?.some(l => l.id === currentLibraryId)) {
          store.loadLibraries(catId);
          break;
        }
      }
      // 建立扫描事件监听
      store.listenScanEvents().catch((err: any) => {
        console.error("[LibraryView] listenScanEvents failed:", err);
      });
      // 使用该库持久化的页码，而非硬编码1
      const pageToLoad = libraryVideoPage[currentLibraryId] || 1;
      loadVideos(currentLibraryId, pageToLoad);
      loadTagClasses(currentLibraryId);
      // 自动检查缺失视频（每个库进入时执行一次：用 libraryId 判断是否已跑过，切库后自动重置）
      if (cleanupRanRef.current !== currentLibraryId && isTauri()) {
        cleanupRanRef.current = currentLibraryId;
        (async () => {
          try {
            const result = await invoke<any>("check_and_cleanup", { libraryId: currentLibraryId });
            if (result.cleaned > 0) {
              const freedGB = (result.freed_bytes / 1073741824).toFixed(1);
              console.info(`[cleanup] 缺失视频清理: 已清理 ${result.cleaned} 个, 释放 ${freedGB} GB`);
              notify({ type: "warning", title: "缺失视频清理", message: `已清理 ${result.cleaned} 个缺失视频，释放 ${freedGB} GB` });
              loadVideos(currentLibraryId, 1);
            }
          } catch {}
        })();
      }
    }
  }, [currentLibraryId, currentPage, videoSearch]);

  // 恢复滚动位置：视频加载完成后执行一次
  useEffect(() => {
    if (!tabId || !scrollRef.current) return;
    const ts = getTabState(tabId);
    const savedPos = ts?.scrollPos;
    if (savedPos && savedPos > 0 && !scrollRestoredRef.current) {
      scrollRestoredRef.current = true;
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = savedPos;
      });
    } else if (!scrollRestoredRef.current) {
      scrollRestoredRef.current = true;
    }
  }, [videos, tabId, getTabState]);

  useEffect(() => {
    if (currentLibraryId && cardInfoFields.includes("tags") && videos.length > 0) {
      const ids = visibleVideos.map(v => v.id);
      getVideoTaggingsBatch(ids);
    }
  }, [currentLibraryId, videos, cardInfoFields, videoPage, videoPageSize, visibleDuringScan]);



  // 组件卸载时清理搜索防抖定时器与单击延迟计时器
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const onDocDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const cardEl = el?.closest(".video-card") || el?.closest(".list-bar");
      if (cardEl) {
        const videoId = (cardEl as HTMLElement).dataset?.videoId;
        if (videoId) setDndHoverId(videoId);
      } else {
        setDndHoverId(null);
      }
    };
    const onDocDragLeave = (e: DragEvent) => { if (!e.relatedTarget) { setDndHoverId(null); } };
    const onDocDrop = () => { setDndHoverId(null); };
    document.addEventListener("dragover", onDocDragOver, true);
    document.addEventListener("dragleave", onDocDragLeave, true);
    document.addEventListener("drop", onDocDrop, true);
    unsubs.push(() => {
      document.removeEventListener("dragover", onDocDragOver, true);
      document.removeEventListener("dragleave", onDocDragLeave, true);
      document.removeEventListener("drop", onDocDrop, true);
    });

    return () => { while (unsubs.length) { const f = unsubs.pop(); f?.(); } };
  }, []);

  useEffect(() => {
    return () => {
      const state = useAppStore.getState();
      if (state.scanProgress || state.scanningLibraryId) {
        useAppStore.setState({ scanningLibraryId: null, scanProgress: null });
        state.unlistenScanEvents();
      }
    };
  }, []);

  useEffect(() => {
    if (!scanProgress) return;
    const status = scanProgress.status;
    if (status === "completed") {
      notify({
        type: "success",
        title: "扫描完成",
        message: `发现 ${scanProgress.total_files} 个文件 · 新增 ${scanProgress.new_files} · 更新 ${scanProgress.updated_files} · 移除 ${scanProgress.removed_files}`,
      });
      const state = useAppStore.getState();
      const libId = state.scanningLibraryId || state.currentLibraryId;
      // 先清空 scanProgress 让 visibleVideos 恢复全量（loadVideos 前用旧列表渲染）
      useAppStore.setState({ scanningLibraryId: null, scanProgress: null });
      if (libId) {
        // loadVideos 完成后才递增 coverCacheVersion，避免竞态：
        // coverCache 清空后 cover effect 用旧 videos 列表启动加载，
        // 等 loadVideos 返回新列表时 loadingQueueRef 互斥锁导致加载被跳过
        state.loadVideos(libId, 1).then(() => {
          useAppStore.setState({ coverCacheVersion: useAppStore.getState().coverCacheVersion + 1 });
        });
      }
      state.loadAllVideosCount();
      state.unlistenScanEvents();
    } else if (status === "error") {
      notify({
        type: "error",
        title: "扫描出错",
        message: scanProgress.errors?.join('; ') || '未知错误',
      });
      useAppStore.setState({ scanningLibraryId: null, scanProgress: null });
      useAppStore.getState().unlistenScanEvents();
    }
  }, [scanProgress?.status, scanningLibraryId]);

  // 防抖搜索：用户停止输入300ms后自动搜索
  // 使用本地状态 localSearch 避免受 store 更新导致的重渲染干扰输入框显示
  const [localSearch, setLocalSearch] = useState(videoSearch);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // store 外部变更时同步回本地状态（如搜索按钮点击、Enter 键提交）
  useEffect(() => {
    setLocalSearch(videoSearch);
  }, [videoSearch]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const v = (e.currentTarget as HTMLInputElement).value.trim();
      setLocalSearch(v);
      setVideoSearch(v);
    }
  }, [setVideoSearch]);

  // 实时搜索：输入框 onChange 时立即更新本地显示，300ms 防抖同步到 store
  const handleSearchInput = useCallback((value: string) => {
    setLocalSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed !== videoSearch) setVideoSearch(trimmed);
    }, 300);
  }, [videoSearch, setVideoSearch]);

  // 搜索范围切换时自动重新搜索（已有搜索词则立即执行）
  useEffect(() => {
    if (videoSearch.trim()) {
      const s = useAppStore.getState();
      s.loadVideos(s.currentLibraryId!, 1);
    }
  }, [videoSearchScope]);

  const handleContextMenu = useCallback((e: React.MouseEvent, video: typeof videos[0]) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, video });
  }, []);

  const applyClassifyPreset = useCallback((preset: string) => {
    setClassifyPreset(preset);
    const t = new Date();
    if (preset === "7d") { setClassifyDateStart(fmtISO(new Date(t.getTime() - 6 * 86400000))); setClassifyDateEnd(fmtISO(t)); }
    else if (preset === "30d") { setClassifyDateStart(fmtISO(new Date(t.getTime() - 29 * 86400000))); setClassifyDateEnd(fmtISO(t)); }
    else if (preset === "90d") { setClassifyDateStart(fmtISO(new Date(t.getTime() - 89 * 86400000))); setClassifyDateEnd(fmtISO(t)); }
    else { setClassifyDateStart(""); setClassifyDateEnd(""); }
  }, [setClassifyDateStart, setClassifyDateEnd, setClassifyPreset]);

  const toggleBatchSelect = useCallback((videoId: string, e?: React.MouseEvent) => {
    const ctrl = (e?.ctrlKey || e?.metaKey) ?? false;
    const shift = e?.shiftKey ?? false;
    const currentList = visibleVideos;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (ctrl) {
        // Ctrl+click → 切换单个视频选中状态，不影响其他
        if (next.has(videoId)) next.delete(videoId);
        else next.add(videoId);
      } else if (shift && lastClickedRef.current) {
        // Shift+click → 范围选择
        const lastId = lastClickedRef.current;
        const lastIdx = currentList.findIndex((v) => v.id === lastId);
        const curIdx = currentList.findIndex((v) => v.id === videoId);
        if (lastIdx >= 0 && curIdx >= 0) {
          const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
          for (let i = start; i <= end; i++) next.add(currentList[i].id);
        }
      } else {
        // 普通单击 → 切换选中：选中则取消，未选中则添加（不重置其他）
        if (next.has(videoId)) {
          next.delete(videoId);
          if (next.size === 0) lastClickedRef.current = null;
        } else {
          next.add(videoId);
        }
      }
      if (next.size > 0) lastClickedRef.current = videoId;
      return next;
    });
  }, [visibleVideos]);
  toggleBatchSelectRef.current = toggleBatchSelect;

  /** Ctrl+A 全选 */
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(visibleVideos.map(v => v.id)));
    if (visibleVideos.length > 0) lastClickedRef.current = visibleVideos[visibleVideos.length - 1].id;
  }, [visibleVideos]);

  const handleMoreAction = useCallback((action: string) => {
    switch (action) {
      case "scan":
        if (currentLibraryId) startScan(currentLibraryId);
        break;
      case "batch":
        openDialog("rename");
        break;
      case "settings":
        openDialog("library-settings");
        break;
      case "duplicate":
        openDialog("duplicate");
        break;
    }
  }, [currentLibraryId, startScan, openDialog]);

  // ── 扫描状态条 ──
  const renderScanStatusBar = (v: Video) => {
    const ns = novelStatusMap[v.id];
    if (!ns || ns === "none") return null;
    const linkInfo = novelLinkMap[v.id]; // { url, note }
    const hasLink = !!linkInfo?.url;
    const linkLabel = hasLink ? (linkInfo.note ? `🔗 ${linkInfo.note}` : "🔗 链接") : "📚 小说";
    const tags: { label: string; cls: string; show: boolean; onClick?: () => void }[] = [
      { label: linkLabel, cls: hasLink ? "link" : "novel", show: ns === "novel" || ns === "audio", onClick: hasLink ? () => { navigator.clipboard.writeText(linkInfo!.url).then(() => notify({ type: "success", title: "链接已复制", duration: 1200 })).catch(() => {}); } : undefined },
      { label: "🎵 音频", cls: "audio", show: ns === "audio" },
    ];
    // Filter to only show available tags
    const visible = tags.filter(t => t.show);
    return (
      <div style={{ display: "flex", gap: 2, padding: "2px 5px", background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${border.divider}`, flexWrap: "wrap" }}>
        {visible.map((t, i) => {
          const colors: Record<string, string> = {
            novel: accent.primary,
            link: status.warning.color,
            intro: status.success.color,
            subtitle: status.info.color,
            cover: status.warning.color,
            audio: status.error.color,
          };
          const bgColors: Record<string, string> = {
            novel: "rgba(96,165,250,0.12)",
            link: "rgba(251,191,36,0.15)",
            intro: "rgba(52,211,153,0.12)",
            subtitle: "rgba(167,139,250,0.12)",
            cover: "rgba(251,113,133,0.12)",
            audio: "rgba(251,191,36,0.12)",
          };
          return (
            <span key={i} onClick={t.onClick || (() => {
              // 回退：复制小说目录路径
              const videoPath = v.filepath;
              if (videoPath) {
                const dir = videoPath.substring(0, videoPath.lastIndexOf('\\') + 1);
                navigator.clipboard.writeText(dir + "小说\\").then(() => notify({ type: "success", title: "已复制", message: "小说目录路径已复制", duration: 1500 })).catch(() => {});
              }
            })} style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "0 4px", borderRadius: 2, fontSize: 6, fontWeight: 600, lineHeight: "13px", background: bgColors[t.cls], color: colors[t.cls], cursor: "pointer", transition: "opacity 0.1s" }}
              title={t.onClick ? "点击复制链接" : "点击复制小说目录路径"}>
              {t.label}
            </span>
          );
        })}
      </div>
    );
  };

  // ── 扫描进度条（全状态 + 错误展示） ──
  const renderScanProgress = () => {
    if (!scanProgress) return null;
    // 错误状态单独渲染
    if (scanProgress.status === "error") {
      const errMsg = scanProgress.errors?.join("; ") || "未知扫描错误";
      return (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: status.error.bg, backdropFilter: "blur(12px)", border: `1px solid ${status.error.color}30`, borderRadius: 10, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: status.error.color, marginBottom: 2 }}>扫描出错</div>
              <div style={{ fontSize: 9, color: text.muted, lineHeight: 1.4 }}>{errMsg}</div>
            </div>
            <button onClick={() => {
              const s = useAppStore.getState();
              s.currentLibraryId && s.startScan(s.currentLibraryId);
            }} style={{ flexShrink: 0, padding: "3px 10px", borderRadius: 4, fontSize: 9, border: `1px solid ${status.error.color}`, background: "transparent", color: status.error.color, cursor: "pointer", fontFamily: "var(--font-sans)" }}>重试</button>
          </div>
        </div>
      );
    }
    if (scanProgress.status !== "running") return null;
    const pct = Math.round(scanProgress.percentage);
    const total = scanProgress.total_files;
    const scanned = scanProgress.scanned_files;
    const elapsed = scanProgress.elapsed_secs || 0;
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    const isInit = total === 0 && scanned === 0;
    return (
      <div style={{ marginBottom: 12, padding: "10px 14px", background: bg.panel, backdropFilter: "blur(12px)", border: `1px solid ${border.default}`, borderRadius: 10, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, position: "relative", zIndex: 1 }}>
          {/* 图标：准备中用旋转spinner，正常扫描用搜索图标 */}
          <span style={{ fontSize: 14, width: 24, textAlign: "center", flexShrink: 0 }}>
            {isInit ? (
              <span className="spinner" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: accent.primary, borderRadius: "50%", animation: "scanSpin 0.7s linear infinite" }} />
            ) : "🔍"}
          </span>
          <div style={{ flex: 1 }}>
            {/* 标题行 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              {isInit ? (
                <span style={{ fontSize: 10, fontWeight: 600, color: text.primary }}>
                  <span style={{ animation: "scanPulse 1.5s ease-in-out infinite" }}>准备扫描...</span>
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 600, color: text.primary }}>扫描中 ({scanned}/{total})</span>
              )}
              <span style={{ fontSize: 9, fontVariantNumeric: "tabular-nums", color: isInit ? accent.light : accent.primary, fontWeight: 600 }}>{pct}%</span>
            </div>
            {/* 进度条 */}
            <div style={{ height: 3, borderRadius: 2, overflow: "hidden", background: "rgba(255,255,255,0.04)", position: "relative" }}>
              <div style={{ height: "100%", borderRadius: 2, background: `linear-gradient(90deg,${accent.deep},${isInit ? accent.light : accent.primary})`, width: `${Math.max(pct, isInit ? 3 : 0)}%`, transition: "width 0.4s ease", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, right: 0, width: 16, height: "100%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.3))", animation: "scanShimmer 2s infinite" }} />
              </div>
            </div>
            {/* 阶段描述：当前处理状态透明展示 */}
            {scanProgress.message && (
              <div style={{ marginTop: 3, fontSize: 8, color: accent.light, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {scanProgress.message}
              </div>
            )}
            {/* 底部统计 */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
              {isInit ? (
                <span style={{ fontSize: 8, color: text.muted }}>⏳ 正在统计文件数量...</span>
              ) : (
                <>
                  <span style={{ fontSize: 8, color: text.muted }}>⏱ 已用 {min}:{String(sec).padStart(2,"0")}</span>
                  <span style={{ fontSize: 8, color: text.muted }}>{scanProgress.new_files} 新增 · {scanProgress.updated_files} 更新</span>
                </>
              )}
            </div>
          </div>
          {/* 取消按钮 */}
          <button onClick={() => cancelScan()}
            style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 4, fontSize: 8, border: `1px solid ${border.default}`, background: "transparent", color: text.muted, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.12s" }}
            onMouseEnter={e => { const b = (e.currentTarget as HTMLElement); b.style.border = `1px solid ${status.error.color}`; b.style.color = status.error.color; }}
            onMouseLeave={e => { const b = (e.currentTarget as HTMLElement); b.style.border = `1px solid ${border.default}`; b.style.color = text.muted; }}
          >取消</button>
        </div>
      </div>
    );
  };

  // ── 统一视频列表组件（卡片/列表双模式） ──
  const renderVideoList = () => {
    // ── 日期归类分组（在 renderVideoList 内计算，避免 TDZ 问题） ──
    const grouped = classifyMode ? groupByDate(visibleVideos.filter(v => {
      if (!classifyDateStart && !classifyDateEnd) return true;
      const d = v.file_created_at ? toDate(v.file_created_at.slice(0, 10)) : null;
      if (!d) return true;
      const s = classifyDateStart ? toDate(classifyDateStart) : null;
      const e = classifyDateEnd ? toDate(classifyDateEnd) : null;
      return (!s || d >= s) && (!e || d <= e);
    }), classifyMode) : null;

    if (videos.length === 0) {
      return (
        <div style={s.emptyBox}>
          <span style={{ fontSize: 28, opacity: 0.3 }}>{viewMode === "card" ? "🎬" : "📋"}</span>
          <span>暂无视频</span>
          <span style={{ fontSize: 10 }}>{emptyHint}</span>
        </div>
      );
    }

    const commonCardEvents = (v: Video) => ({
      onClick: (e: React.MouseEvent) => {
        // 拖拽结束时 mouseup 会触发 click，通过 wasDraggingRef 区分
        if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
        const now = Date.now();
        // 双击检测：阈值内同卡 → 进入详情（并取消尚未触发的单击选中，避免顺带打开批处理面板）
        if (v.id === lastClickedRef.current && now - lastClickTimeRef.current < 400) {
          lastClickTimeRef.current = 0;
          if (clickTimerRef.current !== null) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
          useAppStore.getState().openVideoDetail(v);
          return;
        }
        lastClickedRef.current = v.id;
        lastClickTimeRef.current = now;
        // 延迟执行单击逻辑：若用户在阈值内再次点击（双击），该计时器会被取消，
        // 从而保证“双击进详情、单击才选中/开面板”互不干扰
        if (clickTimerRef.current !== null) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
        clickTimerRef.current = window.setTimeout(() => {
          clickTimerRef.current = null;
          toggleBatchSelect(v.id, e);
          const idx = visibleVideos.findIndex(vv => vv.id === v.id);
          if (idx >= 0) setFocusedCardIdx(idx);
        }, 400);
      },
      onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, v),
      onMouseDown: (e: React.MouseEvent) => {
        const idx = visibleVideos.findIndex(vv => vv.id === v.id);
        if (idx < 0) return;
        dragSelectRef.current = { startVid: v.id, startIdx: idx, snapshot: [...selectedIdsList] };
        wasDraggingRef.current = false;
      },
      onMouseUp: () => {
        dragSelectRef.current = { startVid: null, startIdx: -1, snapshot: [] };
      },
      onMouseEnter: () => {
        setHoveredCardId(v.id);
        const drag = dragSelectRef.current;
        if (drag.startVid !== null && drag.startVid !== v.id) {
          // 鼠标按下后拖入了另一张卡片 → 标记为拖拽行为
          wasDraggingRef.current = true;
          const currentIdx = visibleVideos.findIndex(vv => vv.id === v.id);
          if (currentIdx >= 0) {
            const [from, to] = drag.startIdx < currentIdx ? [drag.startIdx, currentIdx] : [currentIdx, drag.startIdx];
            // 合并拖拽范围到拖拽开始时已有选中集中（不重置已有选中）
            const merged = new Set(drag.snapshot);
            for (let i = from; i <= to; i++) merged.add(visibleVideos[i].id);
            setSelectedIds(merged);
          }
        }
      },
      onMouseLeave: () => setHoveredCardId(null),
      onDragEnter: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDndHoverId(v.id); },
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; },
      onDragLeave: (e: React.DragEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX; const y = e.clientY;
        if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) setDndHoverId(null);
      },
      onDrop: async (e: React.DragEvent) => { handleCardDrop(e, v); },
    });

    const renderFormatBadge = (v: Video) => v.format ? (
      <span className={viewMode === "card" ? "card-format-badge" : "list-format-badge"} style={{
        position: "absolute", top: viewMode === "card" ? 6 : 3, left: viewMode === "card" ? 6 : 3,
        padding: viewMode === "card" ? "2px 7px" : "1px 5px",
        background: "rgba(0,0,0,0.75)", borderRadius: viewMode === "card" ? 4 : 3,
        fontSize: viewMode === "card" ? 9 : 8, fontWeight: 600, color: accent.primary,
        textTransform: "uppercase", letterSpacing: "0.03em",
      }}>{v.format}</span>
    ) : null;

    // renderNovelBadge 已移除（封面不显示小说，仅底部状态条显示）

    const renderDuration = (v: Video) => (
      <span style={{
        position: "absolute", bottom: viewMode === "card" ? 5 : 3, right: viewMode === "card" ? 5 : 3,
        background: "rgba(0,0,0,0.8)", color: "#d1d5db",
        fontSize: viewMode === "card" ? 10 : 9, fontWeight: 600,
        padding: viewMode === "card" ? "2px 6px" : "1px 5px",
        borderRadius: viewMode === "card" ? 4 : 3,
        fontVariantNumeric: "tabular-nums",
      }}>{formatDuration(v.duration)}</span>
    );

    const renderPlayOverlay = (v: Video) => (
      <div style={{
        position: "absolute", inset: 0, zIndex: 5,
        opacity: isHovered(v.id) ? 1 : 0, transition: "opacity 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.12)", borderRadius: viewMode === "card" ? 0 : 4,
      }}>
        <div onClick={(e) => { e.stopPropagation(); playWithLocalPlayer(v.filepath); }}
          style={{
            width: viewMode === "card" ? 38 : 36, height: viewMode === "card" ? 38 : 36,
            borderRadius: "50%", background: "rgba(0,0,0,0.55)", color: "#fff",
            fontSize: viewMode === "card" ? 13 : 12, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1, border: "none",
            transition: "transform 0.25s cubic-bezier(0.34,1.56,0.64,1), background 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.72)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(96,165,250,0.12)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.55)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
        >▶</div>
      </div>
    );

    const renderThumbnail = (v: Video) => {
      const thumbStyle = viewMode === "card"
        ? { aspectRatio: "16 / 9", minHeight: 60 }
        : { width: 80, height: 45, borderRadius: 4, flexShrink: 0, fontSize: 16 };
      return (
        <div style={{
          ...thumbStyle,
          background: v.thumbnail_path ? bg.sidebar : `linear-gradient(135deg,${bg.panel},${bg.sidebar})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
          pointerEvents: dndHoverId === v.id ? "none" : undefined,
          boxShadow: dndHoverId === v.id ? `0 0 20px ${accent.deep}40` : "none",
        }}>
          {renderFormatBadge(v)}
          {v.thumbnail_path ? (
            <img key={coverDataUrls[v.id] || "no-cover"} src={coverDataUrls[v.id] || ""} alt=""
              className="card-thumb-img"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: coverDataUrls[v.id] ? "block" : "none", pointerEvents: "none" }}
              onError={() => { cacheRef.current.delete(v.id); setCoverDataUrls((prev) => { const n = { ...prev }; delete n[v.id]; return n; }); }}
            />
          ) : null}
          {!coverDataUrls[v.id] && !v.thumbnail_path && <div style={{ position: "absolute", inset: 0, background: bg.base, borderRadius: 4 }} />}
          {dndHoverId === v.id && <DropOverlay />}
          {renderDuration(v)}
          {renderPlayOverlay(v)}
        </div>
      );
    };

    const renderInfoFields = (v: Video) => cardInfoFields.map((key) => {
      if (key === "tags") {
        // 合并筛选标签和卡片展示标签，使两者都能在卡片上显示
        const displayTags = [...new Set([...cardDisplayTagIds])];
        const tagNodes = renderVideoTags(v, videoTagsMap, classTags, displayTags);
        if (tagNodes.length === 0) return null;
        const withSep: React.ReactNode[] = [];
        tagNodes.forEach((node, i) => { if (i > 0) withSep.push(<span key={`sep-${i}`} style={{ margin: "0 2px" }}> </span>); withSep.push(node); });
        return <span key="tags" className="info-chip" style={{ color: accent.primary }}><span className="ic-icon">🏷️</span><span className="ic-val">{withSep}</span></span>;
      }
      const cfg = cardFieldConfig[key];
      const rendered = cfg ? cfg.render(v) : null;
      return rendered ? <React.Fragment key={key}>{rendered}</React.Fragment> : null;
    });

    const isHovered = (id: string) => hoveredCardId === id;
    const isSel = (id: string) => selectedCardId === id;

    // ── 渲染单个卡片 ──
    const renderCard = (v: Video) => {
      const isSelected = isSel(v.id) || selectedIds.has(v.id);
      return (
        <div key={v.id} className={`video-card${isSelected ? " sel" : ""}`} data-video-id={v.id} style={{
          ...s.vCard,
          ...(isHovered(v.id) ? s.vCardHover : {}),
          outline: dndHoverId === v.id ? `3px dashed ${accent.deep}` : "none",
          outlineOffset: -3, transition: "outline 0.15s, box-shadow 0.15s",
        }} {...commonCardEvents(v)}>
          <div className="corner-bracket cb-tl" /><div className="corner-bracket cb-tr" />
          <div className="corner-bracket cb-bl" /><div className="corner-bracket cb-br" />
          {renderThumbnail(v)}
          {renderScanStatusBar(v)}
          <div style={s.vInfo}>
            <div style={s.vName} title={v.filename}>{v.filename}</div>
            <div style={s.vMeta}>{renderInfoFields(v)}</div>
          </div>
        </div>
      );
    };

    // ── 渲染单个列表行 ──
    const renderListRow = (v: Video) => {
      const novelStatus = novelStatusMap[v.id];
      const novelHasLink = !!novelLinkMap[v.id]?.url; // 是否有链接绑定
      // hasNovel=true: 有小说/音频 → 显示徽章; hasNovel=false: 扫描但无内容 → 不显示任何东西
      const hasNovel = novelStatus === "novel" || novelStatus === "audio";
      // 区分"已检查过但无结果"与"尚未加载状态"
      const isStatusLoaded = novelStatus !== undefined;
      return (
        <div key={v.id} className={`list-bar${(isSel(v.id) || selectedIds.has(v.id)) ? " sel" : ""}`} data-video-id={v.id} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 10px", background: bg.elevated,
          borderWidth: 1, borderStyle: "solid",
          borderColor: isSel(v.id) || selectedIds.has(v.id) ? accent.deep : border.default,
          borderRadius: 6, cursor: "pointer",
          transition: "border-color 0.2s, box-shadow 0.2s",
          ...(isHovered(v.id) ? { borderColor: accent.tintStrong, boxShadow: "0 2px 12px rgba(0,0,0,0.25)" } : {}),
          opacity: !isStatusLoaded ? 0.7 : 1,
          outline: dndHoverId === v.id ? `2px dashed ${accent.deep}` : "none",
          outlineOffset: -2,
        }} {...commonCardEvents(v)}>
          {renderThumbnail(v)}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{ fontSize: 11, color: text.primary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={v.filename}>{v.filename}</div>
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
              {hasNovel && <span onClick={(e) => { e.stopPropagation(); const linkInfo = novelLinkMap[v.id]; if (linkInfo?.url) { navigator.clipboard.writeText(linkInfo.url).then(() => notify({ type: "success", title: "链接已复制", duration: 1200 })).catch(() => {}); } else { const p = v.filepath; if (p) { navigator.clipboard.writeText(p.substring(0, p.lastIndexOf('\\') + 1) + "小说\\").then(() => notify({ type: "success", title: "已复制", message: "小说目录路径已复制", duration: 1500 })).catch(() => {}); } } }}
                style={{ display: "inline-flex", alignItems: "center", gap: 1, padding: "0 2px", borderRadius: 1, fontSize: 7, fontWeight: 600, lineHeight: "12px", background: novelHasLink ? "rgba(251,191,36,0.15)" : "rgba(96,165,250,0.12)", color: novelHasLink ? status.warning.color : accent.primary, cursor: "pointer" }} title={novelHasLink ? "点击复制链接" : "点击复制小说目录路径"}>{novelHasLink ? (novelLinkMap[v.id]?.note ? `🔗${novelLinkMap[v.id].note}` : "🔗") : "📚"}</span>}
              {novelStatus === "audio" && <span onClick={(e) => { e.stopPropagation(); const p = v.filepath; if (p) { navigator.clipboard.writeText(p.substring(0, p.lastIndexOf('\\') + 1) + "字幕音频\\").then(() => notify({ type: "success", title: "已复制", message: "音频目录路径已复制", duration: 1500 })).catch(() => {}); } }}
                style={{ display: "inline-flex", alignItems: "center", gap: 1, padding: "0 2px", borderRadius: 1, fontSize: 7, fontWeight: 600, lineHeight: "12px", background: "rgba(251,191,36,0.12)", color: status.warning.color, cursor: "pointer" }} title="点击复制音频目录路径">🎵</span>}
              {renderInfoFields(v)}
            </div>
          </div>
          <div className="list-row-actions">
            <button onClick={(e) => { e.stopPropagation(); playWithLocalPlayer(v.filepath); }}
              style={{ padding: "2px 5px", borderRadius: 3, fontSize: 8, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", background: accent.tint, color: accent.primary, transition: "all 0.12s" }}
              onMouseEnter={e => { e.currentTarget.style.background = accent.deep; e.currentTarget.style.color = "#fff"; }}
              onMouseLeave={e => { e.currentTarget.style.background = accent.tint; e.currentTarget.style.color = accent.primary; }}
            >▶ 播放</button>
            {!isStatusLoaded && (
              <button onClick={(e) => { e.stopPropagation(); useAppStore.getState().openVideoDetail(v); }}
                style={{ padding: "2px 5px", borderRadius: 3, fontSize: 8, border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", background: status.warning.bg, color: status.warning.color }}
                onMouseEnter={e => { e.currentTarget.style.background = status.warning.color; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={e => { e.currentTarget.style.background = status.warning.bg; e.currentTarget.style.color = status.warning.color; }}
              >🔍 扫描</button>
            )}
          </div>
        </div>
      );
    };

    // ── 渲染分组标题（无 sticky，时间轴不滚动） ──
    const renderGroupHeader = (g: GroupResult) => (
      <div key={"h-" + g.label} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 12px",
        background: bg.base, borderBottom: `1px solid ${border.divider}`,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: text.primary }}>
          <span style={{ fontSize: 10 }}>📅</span>
          {g.label}
          <span style={{ fontSize: 9, color: text.muted, fontWeight: 400 }}>{g.range}</span>
        </span>
        <span style={{ padding: "0 6px", borderRadius: 4, background: accent.tint, color: accent.light, fontSize: 8, fontWeight: 600, border: `1px solid ${border.accent}` }}>{g.videos.length}</span>
      </div>
    );

    // ═══ 卡片模式 ═══
    if (viewMode === "card") {
      // 有日期归类分组
      if (grouped) {
        return (
          <div id="card-view-container" style={{ position: "relative" }}>
            {grouped.map(g => (
              <div key={g.label}>
                {renderGroupHeader(g)}
                <div style={s.grid(CARD_SIZE)}>{g.videos.map(v => renderCard(v))}</div>
              </div>
            ))}
          </div>
        );
      }
      // 无分组
      return (
        <div id="card-view-container" style={{ position: "relative" }}>
          <div style={s.grid(CARD_SIZE)}>{visibleVideos.map(v => renderCard(v))}</div>
        </div>
      );
    }

    // ═══ 列表模式 ═══
    if (grouped) {
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {grouped.map(g => (
            <div key={g.label}>
              {renderGroupHeader(g)}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 10px" }}>
                {g.videos.map(v => renderListRow(v))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visibleVideos.map(v => renderListRow(v))}
      </div>
    );
  };

  const DropOverlay = () => (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
      background: "rgba(0,0,0,0.7)", borderRadius: 4,
      fontSize: 11, color: "#fff", fontWeight: 600,
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: accent.primary }}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <span>释放以上传</span>
      <span style={{ fontSize: 9, opacity: 0.7, fontWeight: 400 }}>支持图片封面 / TXT 小说</span>
    </div>
  );

  // ── Card 拖拽 Drop 处理 ──
  const handleCardDrop = useCallback(async (e: React.DragEvent, v: Video) => {
    e.preventDefault(); setDndHoverId(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) { notify({ type: "warning", title: "未检测到文件", duration: 2000 }); return; }
    const fileName = file.name.toLowerCase();
    const isTextFile = fileName.endsWith('.txt');
    if (isTextFile) {
      try {
        const text = await file.text();
        if (!text.trim()) { notify({ type: "warning", title: "文件为空", message: file.name, duration: 2000 }); return; }
        const b64 = btoa(unescape(encodeURIComponent(text)));
        await invoke("bind_novel", { videoId: v.id, fileName: file.name, fileContent: b64 });
        notify({ type: "success", title: "小说已绑定", message: file.name, duration: 2000 });
      } catch (err) { notify({ type: "error", title: "绑定小说失败", message: String(err) }); }
      return;
    }
    const isImageFile = file.type.startsWith('image/') || ['.jpg','.jpeg','.png','.gif','.bmp','.webp','.svg'].some(ext => fileName.endsWith(ext));
    if (!isImageFile) { notify({ type: "warning", title: "不支持的文件类型", message: `${file.name} (${file.type||'未知'})`, duration: 3000 }); return; }
    try {
      const arrayBuf = await file.arrayBuffer();
      const ext = file.name.split('.').pop() || 'jpg';
      const videoDir = v.filepath.substring(0, v.filepath.lastIndexOf('\\') + 1);
      const videoBase = v.filename.replace(/\.[^.]+$/, "");
      const savePath = `${videoDir}${videoBase}_cover.${ext}`;
      const { writeBinaryFile } = await import("@tauri-apps/api/fs");
      await writeBinaryFile(savePath, new Uint8Array(arrayBuf));
      await invoke("set_primary_cover", { videoId: v.id, coverPath: savePath });
      const b64 = await invoke<string>("read_cover_base64", { path: savePath });
      if (b64) { cacheRef.current.set(v.id, b64); setCoverDataUrls(prev => ({ ...prev, [v.id]: b64 })); }
      useAppStore.getState().notifyCoverRefresh(v.id);
      notify({ type: "success", title: "封面已上传", message: `已保存为 ${videoBase}_cover.${ext}`, duration: 2000 });
    } catch (err) { notify({ type: "error", title: "上传封面失败", message: String(err) }); }
  }, [cacheRef, setCoverDataUrls]);

  return (
      <div style={{ display: "contents" }}>
      <style>{`
        .hidden-scrollbar::-webkit-scrollbar { display: none; }
        .hidden-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .video-card:hover .card-format-badge { opacity: 0; }
        .video-card .card-format-badge { transition: opacity 0.2s; }
        select option { background: #0A0A0F; color: #E8E6F0; }
        select option:checked { background: #141428; }
        .list-bar:hover .list-format-badge { opacity: 0; }
        .list-format-badge { transition: opacity 0.2s; }

        .video-card.sel .corner-bracket { position: absolute; width: 12px; height: 12px; pointer-events: none; z-index: 7; }
        .video-card.sel .corner-bracket::before { content: ''; position: absolute; }
        .video-card.sel .corner-bracket::after { content: ''; position: absolute; }
        .video-card.sel .cb-tl { top: -2px; left: -2px; }
        .video-card.sel .cb-tl::before { top: 0; left: 0; width: 8px; height: 2px; background: ${accent.deep}; }
        .video-card.sel .cb-tl::after { top: 0; left: 0; width: 2px; height: 8px; background: ${accent.deep}; }
        .video-card.sel .cb-tr { top: -2px; right: -2px; }
        .video-card.sel .cb-tr::before { top: 0; right: 0; width: 8px; height: 2px; background: ${accent.deep}; }
        .video-card.sel .cb-tr::after { top: 0; right: 0; width: 2px; height: 8px; background: ${accent.deep}; }
        .video-card.sel .cb-bl { bottom: -2px; left: -2px; }
        .video-card.sel .cb-bl::before { bottom: 0; left: 0; width: 8px; height: 2px; background: ${accent.deep}; }
        .video-card.sel .cb-bl::after { bottom: 0; left: 0; width: 2px; height: 8px; background: ${accent.deep}; }
        .video-card.sel .cb-br { bottom: -2px; right: -2px; }
        .video-card.sel .cb-br::before { bottom: 0; right: 0; width: 8px; height: 2px; background: ${accent.deep}; }
        .video-card.sel .cb-br::after { bottom: 0; right: 0; width: 2px; height: 8px; background: ${accent.deep}; }

        .list-bar.sel { border-color: ${accent.deep} !important; box-shadow: 0 0 0 1px ${accent.deep} !important; }

        .list-row-actions { opacity: 0; transition: opacity 0.12s; display: flex; gap: 2px; flex-shrink: 0; }
        .list-bar:hover .list-row-actions { opacity: 1; }

        .novel-actions{opacity:1}div:hover>.novel-actions{opacity:1}

        @keyframes scanSpin { to { transform: rotate(360deg); } }
        @keyframes scanPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes scanShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
      `}</style>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
        {}
        <div style={{ flexShrink: 0, borderBottom: "none", padding: "10px 20px 12px", margin: "-16px -20px 0" }}>
          {}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <button
              onClick={() => { navigateTo("video-home", "视频管理"); }}
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
              视频管理
            </button>
            <span style={{ color: text.placeholder, fontSize: 9, opacity: 0.4 }}>/</span>
            <span style={{ color: text.secondary, fontSize: 11, fontWeight: 500 }}>{currentLibrary?.name || "视频库"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={s.header}>
              <button style={s.viewBtn(viewMode === "card")} onClick={() => setViewMode("card")}>▦ 卡片</button>
              <button style={s.viewBtn(viewMode === "list")} onClick={() => setViewMode("list")}>☰ 列表</button>
              <button style={s.actionBtn} onClick={() => handleMoreAction("settings")}>⚙ 库设置</button>
              <span style={{ width: 1, height: 14, background: border.divider, flexShrink: 0, marginLeft: 4 }} />
              {/* 日期归类按钮 */}
              <div ref={classifyDropdownRef} style={{ position: "relative", display: "inline-flex" }}>
                <button style={s.classifyBtn(classifyDropdownOpen)}
                  onClick={() => setClassifyDropdownOpen(p => !p)}
                >
                  📅 归类
                  {classifyMode && (
                    <span style={{ padding: "0 4px", borderRadius: 2, background: accent.deep, color: "#fff", fontSize: 7, fontWeight: 600, lineHeight: "14px" }}>
                      {MODE_LABELS[classifyMode]}
                    </span>
                  )}
                </button>
                {/* 归类下拉面板 — ethereal 玻璃质感重设计 */}
                {classifyDropdownOpen && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, zIndex: 50,
                    minWidth: 380,
                    background: "rgba(12,18,36,0.7)",
                    backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                    border: `1px solid ${border.accent}`,
                    borderRadius: 10,
                    boxShadow: "0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(96,165,250,0.04)",
                    padding: "12px 14px",
                    marginTop: 6,
                  }}>
                    {/* 顶部标题 */}
                    <div style={{ fontSize: 10, fontWeight: 600, color: text.muted, marginBottom: 10, letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 3, height: 10, borderRadius: 2, background: accent.primary, flexShrink: 0 }} />
                      📅 时间归类
                    </div>

                    {/* 第一区：分组粒度 */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: text.secondary, fontWeight: 500, marginBottom: 5 }}>分组粒度</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {["month", "week", "day"].map(m => {
                          const active = classifyMode === m;
                          return (
                            <button key={m}
                              onClick={() => setClassifyMode(classifyMode === m ? "" : m)}
                              style={{
                                flex: 1, padding: "5px 0", fontSize: 10, border: "none",
                                borderRadius: 5, cursor: "pointer", fontFamily: "var(--font-sans)",
                                background: active ? `linear-gradient(135deg,${accent.deep},${accent.primary})` : "rgba(255,255,255,0.03)",
                                color: active ? "#fff" : text.secondary,
                                fontWeight: active ? 600 : 400,
                                transition: "all 0.15s",
                                boxShadow: active ? `0 2px 8px ${accent.deep}40` : "none",
                              }}
                              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; }}
                              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; }}
                            >
                              {"month" === m ? "📆 同月" : "week" === m ? "📅 同周" : "📋 同日"}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 第二区：预设时间范围 */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 9, color: text.secondary, fontWeight: 500, marginBottom: 5 }}>快捷范围</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        {["7d", "30d", "90d", "all"].map(p => {
                          const active = classifyPreset === p;
                          return (
                            <button key={p}
                              onClick={() => applyClassifyPreset(p)}
                              style={{
                                flex: 1, padding: "4px 0", fontSize: 9,
                                borderRadius: 4, cursor: "pointer", fontFamily: "var(--font-sans)",
                                background: active ? accent.tintMid : "transparent",
                                color: active ? accent.primary : text.muted,
                                fontWeight: active ? 600 : 400,
                                border: `1px solid ${active ? border.accent : "rgba(100,140,220,0.06)"}`,
                                transition: "all 0.12s",
                              }}
                              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "rgba(100,140,220,0.18)"; (e.currentTarget as HTMLElement).style.color = text.secondary; }}
                              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = "rgba(100,140,220,0.06)"; (e.currentTarget as HTMLElement).style.color = text.muted; }}
                            >
                              {p === "7d" ? "最近 7 天" : p === "30d" ? "最近 30 天" : p === "90d" ? "最近 3 月" : "全部时间"}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 分割线 */}
                    <div style={{ height: 1, background: `linear-gradient(90deg, ${border.divider}, transparent)`, margin: "8px 0 10px" }} />

                    {/* 第三区：自定义日期 */}
                    <div>
                      <div style={{ fontSize: 9, color: text.secondary, fontWeight: 500, marginBottom: 5 }}>自定义范围</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{
                          flex: 1, display: "flex", alignItems: "center", gap: 4,
                          background: "rgba(0,0,0,0.2)", border: `1px solid ${border.default}`,
                          borderRadius: 5, padding: "4px 8px",
                        }}>
                          <span style={{ fontSize: 9, color: text.placeholder, flexShrink: 0, lineHeight: 1 }}>📅</span>
                          <input type="date" value={classifyDateStart} onChange={e => setClassifyDateStart(e.target.value)}
                            style={{
                              background: "transparent", border: "none", color: text.primary,
                              fontSize: 10, fontFamily: "'Cascadia Code', 'Consolas', monospace",
                              flex: 1, padding: "1px 0", outline: "none", cursor: "pointer",
                              minWidth: 0,
                            }} />
                        </div>
                        <span style={{ color: text.muted, fontSize: 9, fontWeight: 600 }}>→</span>
                        <div style={{
                          flex: 1, display: "flex", alignItems: "center", gap: 4,
                          background: "rgba(0,0,0,0.2)", border: `1px solid ${border.default}`,
                          borderRadius: 5, padding: "4px 8px",
                        }}>
                          <span style={{ fontSize: 9, color: text.placeholder, flexShrink: 0, lineHeight: 1 }}>📅</span>
                          <input type="date" value={classifyDateEnd} onChange={e => setClassifyDateEnd(e.target.value)}
                            style={{
                              background: "transparent", border: "none", color: text.primary,
                              fontSize: 10, fontFamily: "'Cascadia Code', 'Consolas', monospace",
                              flex: 1, padding: "1px 0", outline: "none", cursor: "pointer",
                              minWidth: 0,
                            }} />
                        </div>
                        <button onClick={() => { setClassifyDateStart(""); setClassifyDateEnd(""); }}
                          style={{
                            padding: "5px 8px", borderRadius: 5, fontSize: 10,
                            border: "none", background: "rgba(251,113,133,0.10)",
                            color: "#FB7185", cursor: "pointer", lineHeight: 1,
                            transition: "all 0.12s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(251,113,133,0.20)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(251,113,133,0.10)"}
                        >✕</button>
                      </div>
                    </div>

                    {/* 底部活跃归类提示 */}
                    {classifyMode && (
                      <div style={{
                        marginTop: 10, padding: "5px 8px", borderRadius: 4,
                        background: accent.tint, fontSize: 9, color: accent.primary,
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <span>🔍 已启用</span>
                        <span style={{ fontWeight: 600 }}>{MODE_LABELS[classifyMode]}分组</span>
                        {classifyPreset !== "all" && <span>· {classifyPreset === "7d" ? "最近7天" : classifyPreset === "30d" ? "最近30天" : "最近3月"}</span>}
                        {(classifyDateStart || classifyDateEnd) && <span>· 自定义范围</span>}
                        <button onClick={() => { setClassifyMode(""); setClassifyPreset("all"); setClassifyDateStart(""); setClassifyDateEnd(""); }}
                          style={{
                            marginLeft: "auto", background: "none", border: "none",
                            color: "#FB7185", cursor: "pointer", fontSize: 8,
                            padding: "1px 4px", borderRadius: 3,
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(251,113,133,0.12)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                        >清除</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginLeft: "auto" }}>
              {}
              <div style={{ display: "flex", alignItems: "center", background: bg.input, borderWidth: 1, borderStyle: "solid", borderColor: border.default, borderRadius: 6, overflow: "hidden", transition: "border-color 0.2s, box-shadow 0.2s" }}
                id="search-bar-container">
                {}
                <select
                  value={videoSearchScope}
                  onChange={(e) => setVideoSearchScope(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    borderRight: `1px solid ${border.default}`,
                    borderRadius: 0,
                    color: text.secondary,
                    fontSize: 10,
                    padding: "6px 8px",
                    outline: "none",
                    cursor: "pointer",
                    width: 72,
                    appearance: "none" as any,
                    WebkitAppearance: "none" as any,
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 4px center",
                    backgroundSize: 10,
                  }}
                >
                  <option value="filename">视频名称</option>
                  <option value="folder">文件夹</option>
                </select>
                {}
                <input
                  value={localSearch}
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="搜索视频或文件夹..."
                  onFocus={e => { const container = document.getElementById("search-bar-container"); if (container) { container.style.borderColor = accent.deep; container.style.boxShadow = `0 0 0 2px ${accent.deep}20`; } }}
                  onBlur={e => { const container = document.getElementById("search-bar-container"); if (container) { container.style.borderColor = border.default; container.style.boxShadow = "none"; } }}
                  style={{
                    background: "transparent",
                    border: "none",
                    borderRadius: 0,
                    color: text.primary,
                    fontSize: 10,
                    padding: "6px 10px",
                    outline: "none",
                    flex: 1,
                    minWidth: 0,
                    maxWidth: 220,
                  }}
                />
                {}
                <button
                  onClick={() => { if (debounceRef.current) clearTimeout(debounceRef.current); setVideoSearch(localSearch.trim()); }}
                  style={{
                    padding: "6px 12px",
                    background: accent.deep,
                    color: "#fff",
                    border: "none",
                    borderRadius: "0 6px 6px 0",
                    fontSize: 11,
                    cursor: "pointer",
                    flexShrink: 0,
                    lineHeight: "16px",
                    transition: "background 0.2s, transform 0.1s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = accent.primary; e.currentTarget.style.transform = "scale(1.02)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = accent.deep; e.currentTarget.style.transform = "scale(1)"; }}
                  onMouseDown={e => { e.currentTarget.style.transform = "scale(0.96)"; }}
                  onMouseUp={e => { e.currentTarget.style.transform = "scale(1.02)"; }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13, display: "block" }}>
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 菜单区与内容区分隔线 ── */}
        <div style={{
          height: 1, flexShrink: 0,
          background: `linear-gradient(90deg, transparent 0%, ${accent.glow} 20%, ${accent.primary}55 50%, ${accent.glow} 80%, transparent 100%)`,
          boxShadow: `0 0 6px ${accent.glow}40, 0 1px 0 ${border.divider}`,
          position: "relative", zIndex: 1,
        }} />

        <div style={{ ...s.contentWrap, overflow: "hidden", marginLeft: -20, marginRight: -20 }}>
          <div ref={scrollRef} style={{ ...s.content, overflowY: "auto", padding: "14px 20px 0" }} className="hidden-scrollbar" onScroll={onScroll}>
            {renderScanProgress()}
            {renderVideoList()}
          </div>

        </div>

        {}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: "▶ 播放", icon: "▶", action: () => { playWithLocalPlayer(ctxMenu.video.filepath); } },
            { label: "📄 详情", icon: "📄", action: () => { useAppStore.getState().openVideoDetail(ctxMenu.video); } },
            { label: "", divider: true },
            { label: "复制文件路径", icon: "📋", action: () => { navigator.clipboard.writeText(ctxMenu.video.filepath); notify({ type: "success", title: "已复制", message: "文件路径已复制到剪贴板" }); } },
            { label: "复制文件夹路径", icon: "📂", action: () => {
              const folderPath = ctxMenu.video.filepath.substring(0, ctxMenu.video.filepath.lastIndexOf("\\"));
              navigator.clipboard.writeText(folderPath);
              notify({ type: "success", title: "已复制", message: "文件夹路径已复制到剪贴板" });
            } },
            { label: "打开文件夹", icon: "🔗", action: () => {
              const folderPath = ctxMenu.video.filepath.substring(0, ctxMenu.video.filepath.lastIndexOf("\\"));
              invoke("open_file", { filepath: folderPath });
            } },
            { label: "", divider: true },
            { label: "删除视频", icon: "🗑", color: status.error.color, action: () => { useAppStore.getState().deleteVideo(ctxMenu.video.id); } },
          ]}
        />
      )}
      </div>
    </div>
  );
}


function renderVideoTags(v: Video, videoTagsMap: Record<string, Record<string, string>>, classTags: TagName[], selectedTagIds: string[]): React.ReactNode[] {
  const videoTags = videoTagsMap[v.id] || {};
  const result: React.ReactNode[] = [];
  for (const tagId of selectedTagIds) {
    const tag = classTags.filter(Boolean).find(t => t.id === tagId);
    const tagName = tag?.name || tagId;
    if (!tagName) continue;
    const value = videoTags[tagId];
    const cleanValue = value ? String(value).trim() : "";
    // 只显示有值的标签，无值标签不在卡片上渲染
    if (!cleanValue) continue;
    const ttype = hasTagType(tagId) ? getTagType(tagId) : ((tag?.tag_type as any) || "text");

    let onClick: ((e: React.MouseEvent) => void) | undefined;
    if (ttype === "path") {
      onClick = (e) => { e.stopPropagation(); invoke("open_file", { filepath: cleanValue }); };
    } else if (ttype === "url") {
      onClick = (e) => { e.stopPropagation(); import("../../../utils/openUrl").then(m => m.openUrl(cleanValue)); };
    }

    result.push(
      <span key={tagId} style={{
        cursor: onClick ? "pointer" : undefined,
        textDecoration: onClick ? "underline dotted" : undefined,
        color: accent.deep,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        maxWidth: 120, display: "inline-block", verticalAlign: "middle",
      }} title={`${tagName}: ${cleanValue}`} onClick={onClick}>
        {tagName}: {cleanValue}
      </span>
    );
  }
  return result;
}

function formatDuration(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
