/**
 * VideoDetail — 视频详情页
 *
 * 左面板：预览区 + 封面缩略图 + 技术参数 + 标签列表
 * 右面板：Tab 标签管理 | 小说管理
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAppStore } from "../../../store/appStore";
import { showConfirm } from "../../../components/ConfirmDialog";
import type { TagName, TagClass } from "../../../types";
import type { VideoTextScanResult } from "../../../types";
import { notify } from "../../../components/Notification";
import ContextMenu from "../../../components/ContextMenu";
import { invoke } from "../../../tauri-invoke";
import { convertFileSrc, openWithDefaultPlayer } from "../../../safe-tauri";
import { usePageState } from "../../../hooks/usePageState";
import { isTauri } from "../../../tauri-invoke";
import { listen } from "../../../tauri-event";
import { bg, border, accent, text, status as statusColors, scrollbar } from "../../../theme/ethereal";
import { getTagType, hasTagType, setTagType } from "../../library/components/tagTypeStore";
import TagTree from "../../library/components/TagTree";

const VD_STYLE_ID = "video-detail-style";
function ensureVideoDetailStyle() {
  if (document.getElementById(VD_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = VD_STYLE_ID;
  style.textContent = `
    .vd-nav-btn{opacity:0;pointer-events:none;transition:all 0.2s ease-out}
    .vd-play-overlay{opacity:0;transition:opacity 0.25s ease-out;pointer-events:none}
    .vd-preview-container:hover .vd-nav-btn{opacity:1;pointer-events:auto}
    .vd-preview-container:hover .vd-play-overlay{opacity:1;pointer-events:auto}
    .vd-nav-btn:hover{background:rgba(0,0,0,0.8)!important;transform:translateY(-50%) scale(1.1)!important}
    .vd-play-btn{transition:all 0.35s cubic-bezier(0.34,1.56,0.64,1)}
    .vd-play-btn:hover{transform:scale(1.08)!important}
    .vd-tag-chip:hover{transform:translateY(-1px)}
    .vd-scroll::-webkit-scrollbar{width:4px;height:4px}
    .vd-scroll::-webkit-scrollbar-track{background:transparent}
    .vd-scroll::-webkit-scrollbar-thumb{background:var(--vd-scrollbar-thumb, rgba(100,130,220,0.3));border-radius:2px}
    .vd-scroll::-webkit-scrollbar-thumb:hover{background:var(--vd-scrollbar-thumb-hover, rgba(100,130,220,0.5))}
    .vd-cover-drop{border:2px dashed var(--accent-deep)!important}
    @keyframes vdRingRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);
}

// ── 工具函数 ──

function fmtDuration(secs: number): string {
  if (secs <= 0) return "—";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function fmtSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function fmtTimeDisplay(secs: number): string {
  if (secs <= 0 || !isFinite(secs)) return "0:00";
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

// ── 内联组件 ──

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", marginBottom: 6, borderBottom: `1px solid ${border.divider}` }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: accent.deep, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: text.primary, letterSpacing: "0.3px" }}>{title}</span>
      {count !== undefined && <span style={{ fontSize: 9, color: text.muted, marginLeft: "auto" }}>{count}</span>}
    </div>
  );
}

/** 内联链接编辑表单 — 仅 URL 输入，无自定义名称 */
function InlineLinkForm({ initialUrl, onSave, onCancel, border, mono }: {
  initialUrl: string; onSave: (url: string) => void; onCancel: () => void;
  border: any; mono: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  return (
    <div style={{ display: "flex", gap: 4, padding: "6px 8px", marginTop: 2,
      background: `rgba(0,0,0,0.12)`, border: `1px solid ${border.default}`, borderRadius: 4 }}>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="粘贴小说链接..."
        style={{ flex: 1, padding: "3px 6px", borderRadius: 3, background: `rgba(0,0,0,0.2)`,
          border: `1px solid ${border.default}`, color: "#d4d4d4", fontSize: 9, outline: "none", fontFamily: mono }}
        onFocus={e => e.currentTarget.style.borderColor = "#7c3aed"}
        onBlur={e => e.currentTarget.style.borderColor = border.default}
        onKeyDown={e => { if (e.key === "Enter") onSave(url); }} />
      <button onClick={() => onSave(url)} style={{ padding: "3px 8px", borderRadius: 3, fontSize: 8,
        border: "none", background: `rgba(167,139,250,0.15)`, color: "#a78bfa", cursor: "pointer",
        fontFamily: "var(--font-sans)", fontWeight: 500 }}>✓</button>
      <button onClick={onCancel} style={{ padding: "3px 6px", borderRadius: 3, fontSize: 8,
        border: "none", background: "transparent", color: "#6a6a6a", cursor: "pointer",
        fontFamily: "var(--font-sans)" }}>✕</button>
    </div>
  );
}

// ── 主题常量 ──
const mono = "'Cascadia Code','Fira Code','JetBrains Mono',monospace";
const theme = {
  bgPrimary: bg.elevated, bgSecondary: bg.sidebar, bgCard: bg.surface,
  bgHover: "rgba(125, 211, 252, 0.08)", bgActive: "rgba(125, 211, 252, 0.15)",
  textPrimary: text.secondary, textSecondary: text.muted, textPlaceholder: text.placeholder, textHighlight: text.primary,
  borderColor: border.default, borderHover: border.hover,
  accentColor: accent.deep, accentHover: accent.primary, accentActive: accent.deep,
  successColor: statusColors.success.color, dangerColor: statusColors.error.color, warningColor: statusColors.warning.color, infoColor: statusColors.info.color,
  fontMono: mono,
};

// ── 图标 ──
const Icons = {
  ArrowLeft: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
  Star: ({ filled }: { filled: boolean }) => <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={filled ? "1" : "2"} style={{ width: 16, height: 16 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
  Bookmark: ({ filled }: { filled: boolean }) => <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>,
  Play: () => <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ width: 32, height: 32, marginLeft: 3 }}><polygon points="5 3 19 12 5 21 5 3" /></svg>,
  Pause: () => <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style={{ width: 24, height: 24 }}><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>,
  Close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
  ChevronLeft: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 24, height: 24 }}><polyline points="15 18 9 12 15 6" /></svg>,
  ChevronRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 24, height: 24 }}><polyline points="9 18 15 12 9 6" /></svg>,
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12, color: text.muted, flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
};

// ═══════════════════════════════════════════════════════════════════
// 主组件
// ═══════════════════════════════════════════════════════════════════

export default function VideoDetail() {
  const currentVideo = useAppStore(s => s.currentVideo);
  ensureVideoDetailStyle();
  // 设置 CSS 变量（滚动条颜色随主题变化）
  useEffect(() => {
    document.documentElement.style.setProperty('--vd-scrollbar-thumb', scrollbar.thumb);
    document.documentElement.style.setProperty('--vd-scrollbar-thumb-hover', scrollbar.thumbHover);
  }, [scrollbar.thumb, scrollbar.thumbHover]);
  const videos = useAppStore(s => s.videos);
  const navigateTo = useAppStore(s => s.navigateTo);
  const updateVideo = useAppStore(s => s.updateVideo);
  const batchTagVideos = useAppStore(s => s.batchTagVideos);
  const reorderCovers = useAppStore(s => s.reorderCovers);
  const notifyCoverRefresh = useAppStore(s => s.notifyCoverRefresh);
  const batchRename = useAppStore(s => s.batchRename);
  const searchClassTags = useAppStore(s => s.searchClassTags);
  const tagClasses = useAppStore(s => s.tagClasses);
  const loadTagClasses = useAppStore(s => s.loadTagClasses);
  const navigateToModule = useAppStore(s => s.navigateToModule);
  const loadVideos = useAppStore(s => s.loadVideos);

  const video = currentVideo;
  const detailLibraryId = video?.library_id || null;
  const libraries = useAppStore(s => s.libraries);
  const detailLibraryName = useMemo(() => {
    if (!detailLibraryId) return "视频库";
    for (const catLibs of Object.values(libraries)) {
      const lib = catLibs.find(l => l.id === detailLibraryId);
      if (lib) return lib.name;
    }
    return "视频库";
  }, [detailLibraryId, libraries]);

  // ── 状态 ──

  // 基本信息
  const [note, setNote] = usePageState("note", video?.note || "");
  const [fav, setFav] = usePageState("fav", video?.favorite || false);
  const [starRating, setStarRating] = usePageState("starRating", 0);
  const [series, setSeries] = usePageState("series", "");
  const [category, setCategory] = usePageState("category", "");
  const [rightPanelTab, setRightPanelTab] = usePageState<"tags" | "novel" | "scan">("rightPanelTab", "tags");

  // 播放
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [actionIcon, setActionIcon] = useState<"play" | "pause" | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const actionIconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeUpdate = useRef(0);

  // 标签
  const [videoTags, setVideoTags] = useState<TagName[]>([]);
  const [tagValuesMap, setTagValuesMap] = useState<Record<string, string>>({});
  const tagValuesMapRef = useRef(tagValuesMap);
  tagValuesMapRef.current = tagValuesMap;
  const [allTags, setAllTags] = useState<TagName[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  // 封面
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverDataUrls, setCoverDataUrls] = useState<Record<string, string>>({});
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [validCoverPaths, setValidCoverPaths] = useState<string[]>([]);
  const dragStartIdxRef = useRef<number | null>(null);
  const dragTargetIdxRef = useRef<number | null>(null);
  const coverWasDraggedRef = useRef(false);

  // 小说（name/size/modified/hasAudio/links[]）
  const [novels, setNovels] = useState<{ name: string; size: number; modified: string; hasAudio?: boolean; links?: { url: string; note: string }[] }[]>([]);
  const [novelOrder, setNovelOrder] = useState<number[]>([]);
  const [novelDragIdx, setNovelDragIdx] = useState<number | null>(null);
  const novelDragStateRef = useRef({ dragIdx: null as number | null, order: [] as number[] });
  const [editingLinkKey, setEditingLinkKey] = useState<string | null>(null); // "novelIdx-linkIdx"编辑 / "novelIdx-add"添加
  const [novelExpanded, setNovelExpanded] = useState<Record<number, boolean>>({});
  const [novelLinkDragIdx, setNovelLinkDragIdx] = useState<string | null>(null);
  const [novelMenuPos, setNovelMenuPos] = useState<{ x: number; y: number; idx: number } | null>(null);
  const [scanView, setScanView] = useState<"before" | "after">("before"); // 扫描归类视图切换

  // 智能文本扫描
  const [textScanResult, setTextScanResult] = useState<VideoTextScanResult | null>(null);
  const [textScanLoading, setTextScanLoading] = useState(false);
  const [textScanError, setTextScanError] = useState<string | null>(null);
  const scanResultCache = useRef<Record<string, VideoTextScanResult>>({});

  // ── 封面（已去重） ──
  const rawCoverPaths: string[] = useMemo(() => {
    if (!video?.thumbnail_path) return [];
    try {
      const p = JSON.parse(video.thumbnail_path);
      const arr = Array.isArray(p) ? p : [video.thumbnail_path];
      return [...new Set(arr)];
    }
    catch { return [video.thumbnail_path]; }
  }, [video?.thumbnail_path]);

  const coverPaths = validCoverPaths.length > 0 ? validCoverPaths : rawCoverPaths;
  const [selectedCoverIdx, setSelectedCoverIdx] = useState(0);

  // ── effect：初始化 ──
  useEffect(() => {
    return () => {
      if (actionIconTimerRef.current) clearTimeout(actionIconTimerRef.current);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (video) {
      setNote(video.note || ""); setFav(video.favorite);
      setStarRating(video.favorite ? 5 : 0);
      setSeries(video.series || ""); setCategory(video.category || "");
    }
  }, [video?.id]);

  useEffect(() => {
    if (!video) return;
    (async () => {
      try {
        const detail = await useAppStore.getState().getVideoDetail(video.id);
        if (detail) {
          useAppStore.setState({ currentVideo: detail.video });
          setVideoTags(detail.tags);
          setSelectedTagIds(detail.tags.map(t => t.id));
          const values: Record<string, string> = {};
          if (detail.tagValues) detail.tags.forEach((t, i) => { values[t.id] = detail.tagValues![i] || ""; });
          setTagValuesMap(values);
        }
      } catch { }
    })();
  }, [video?.id]);

  const refreshAllTags = useCallback(async (libId: string) => {
    try {
      const store = useAppStore.getState();
      const [result] = await Promise.all([store.searchClassTags("", libId), store.loadTagClasses(libId)]);
      setAllTags(result);
    } catch { }
  }, []);

  useEffect(() => { if (detailLibraryId) refreshAllTags(detailLibraryId); }, [detailLibraryId, refreshAllTags]);

  const isHevc = video?.video_codec === "hevc" || video?.video_codec === "h265";

  useEffect(() => {
    if (!isPlaying || !video?.filepath) return;
    setPlayError(null);
    if (isHevc) { setPlayError("HEVC/H.265 编码不支持内置播放"); openWithDefaultPlayer(video.filepath); setIsPlaying(false); return; }
    (async () => {
      try { const src = convertFileSrc(video.filepath); setVideoSrc(src); }
      catch { setPlayError("视频路径转换失败"); }
    })();
  }, [isPlaying, video?.filepath]);

  // ── 封面加载（批量更新 + 跳过失败） ──
  useEffect(() => {
    const paths = rawCoverPaths;
    if (paths.length === 0) { setCoverUrl(null); setCoverDataUrls({}); setSelectedCoverIdx(0); setValidCoverPaths([]); return; }
    setCoverDataUrls({}); setSelectedCoverIdx(0);
    let cancelled = false;
    (async () => {
      const existing: string[] = [];
      const batch: Record<string, string> = {};
      for (const p of paths) {
        if (cancelled) return;
        try { const b64 = await invoke<string>("get_thumbnail", { path: p, maxWidth: null }); batch[p] = b64; existing.push(p); }
        catch { /* 封面文件不存在静默跳过 */ }
      }
      if (cancelled) return;
      if (Object.keys(batch).length > 0) setCoverDataUrls(batch);
      setValidCoverPaths(existing);
      if (existing.length > 0) setCoverUrl(existing[0]);
    })();
    return () => { cancelled = true; };
  }, [video?.id, video?.thumbnail_path]);

  // ── 小说加载 ──
  const loadNovels = useCallback(async (vid: string) => {
    try {
      const result = await invoke<{ novels: { name: string; size: number; modified: string; hasAudio?: boolean; links?: { url: string; note: string }[] }[]; order: string[] }>("get_video_novels", { videoId: vid });
      const list = result.novels || [];
      setNovels(list);
      const savedOrder = result.order || [];
      if (savedOrder.length > 0) {
        const ordered = savedOrder.map((n: string) => list.findIndex(l => l.name === n)).filter(i => i >= 0);
        const remaining = list.map((_, i) => i).filter(i => !ordered.includes(i));
        setNovelOrder([...ordered, ...remaining]);
      } else setNovelOrder(list.map((_, i) => i));
      novelDragStateRef.current.order = list.map((_, i) => i);
    } catch { setNovels([]); setNovelOrder([]); }
  }, []);

  useEffect(() => { if (video?.id) loadNovels(video.id); }, [video?.id, loadNovels]);

  // ── 智能文本扫描加载 ──
  useEffect(() => {
    if (!video?.id) { setTextScanResult(null); setTextScanError(null); return; }
    if (scanResultCache.current[video.id]) { setTextScanResult(scanResultCache.current[video.id]); return; }
    let cancelled = false;
    (async () => {
      setTextScanLoading(true); setTextScanError(null);
      try {
        const result = await invoke<VideoTextScanResult>("scan_video_text_files", { videoId: video.id });
        if (cancelled) return;
        scanResultCache.current[video.id] = result;
        setTextScanResult(result);
      } catch (e) {
        if (!cancelled) setTextScanError(String(e));
      } finally { if (!cancelled) setTextScanLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [video?.id]);

  // ── 播放控制 ──
  const handleStopPlayback = useCallback(() => {
    setIsPlaying(false); setIsPaused(true); setVideoSrc(null); setPlayError(null); setCurrentTime(0); setDuration(0);
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
  }, []);

  const handlePlay = useCallback(() => {
    if (!video?.filepath) return;
    if (isHevc) openWithDefaultPlayer(video.filepath); else setIsPlaying(true);
  }, [video?.filepath, isHevc]);

  const handlePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setActionIcon("pause"); }
    else { videoRef.current.pause(); setActionIcon("play"); }
    if (actionIconTimerRef.current) clearTimeout(actionIconTimerRef.current);
    actionIconTimerRef.current = setTimeout(() => setActionIcon(null), 700);
  };

  const startControlsTimer = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handlePrevVideo = useCallback(() => {
    if (!currentVideo || videos.length === 0) return;
    const idx = videos.findIndex(v => v.id === currentVideo.id);
    if (idx > 0) { handleStopPlayback(); useAppStore.getState().openVideoDetail(videos[idx - 1]); }
  }, [currentVideo, videos, handleStopPlayback]);

  const handleNextVideo = useCallback(() => {
    if (!currentVideo || videos.length === 0) return;
    const idx = videos.findIndex(v => v.id === currentVideo.id);
    if (idx < videos.length - 1) { handleStopPlayback(); useAppStore.getState().openVideoDetail(videos[idx + 1]); }
  }, [currentVideo, videos, handleStopPlayback]);

  // ── 自动保存 ──
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback(() => {
    if (!video) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try { await updateVideo(video.id, note, fav, series, category); } catch { }
    }, 800);
  }, [video, note, fav, series, category, updateVideo]);
  useEffect(() => { scheduleSave(); }, [note, series, category, fav]);

  // ── 导航 ──
  const handleBack = () => {
    if (detailLibraryId) navigateTo(`library-${detailLibraryId}`, "视频库");
    else navigateTo("video-home", "视频库");
    useAppStore.getState().closeTab("detail");
  };

  // ── 统一刷新所有标签状态（从后端拉取最新数据，确保左右面板同步） ──
  const refreshVideoTags = useCallback(async () => {
    if (!video) return;
    try {
      const detail = await useAppStore.getState().getVideoDetail(video.id);
      if (detail) {
        useAppStore.setState({ currentVideo: detail.video });
        setVideoTags(detail.tags);
        const ids = detail.tags.map(t => t.id);
        setSelectedTagIds(ids);
        if (detail.tagValues) {
          const vm: Record<string, string> = {};
          detail.tags.forEach((t, i) => { vm[t.id] = detail.tagValues![i] || ""; });
          setTagValuesMap(vm);
        }
      }
    } catch { /* 静默失败 */ }
  }, [video]);

  // ── 标签操作 ──
  const handleToggleTag = useCallback((tagId: string) => {
    const vm = tagValuesMapRef.current;
    const existingVal = vm[tagId];
    const hasValue = existingVal !== undefined && existingVal !== "";
    // 如果是取消选中，直接放行（已有值的标签允许取消）
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(prev => prev.filter(id => id !== tagId));
      setVideoTags(prev => prev.filter(t => t.id !== tagId));
      return;
    }
    // 选中时：必须已有值才允许
    if (!hasValue) {
      notify({ type: "warning", title: "请先添加标签值", message: "无值的标签不完整，请先点击 +值 为标签设置内容" });
      return;
    }
    setSelectedTagIds(prev => [...prev, tagId]);
    // 选中时同步到 videoTags：从 allTags 中查找标签对象加入
    const tagInAll = allTags.find(t => t.id === tagId);
    if (tagInAll) setVideoTags(prev => prev.some(t => t.id === tagId) ? prev : [...prev, tagInAll]);
  }, [selectedTagIds, allTags]);

  const handleTagValueChange = useCallback((tagId: string, value: string) => {
    setTagValuesMap(prev => ({ ...prev, [tagId]: value }));
  }, []);

  const handleTagValueSubmit = useCallback(async (tagId: string, value: string) => {
    if (!video) return;
    const store = useAppStore.getState();
    if (value.trim()) {
      // 有值 → 保存标签关联
      if (!selectedTagIds.includes(tagId)) setSelectedTagIds(prev => [...prev, tagId]);
      await store.batchTagVideos([video.id], [tagId], [value]);
      const tagName = store.classTags.find(t => t.id === tagId)?.name || "";
      notify({ type: "success", title: "标签已添加", message: `${tagName}：${value}` });
    } else {
      // 空值 → 移除该标签与视频的关联（标签芯片和勾选同步消失）
      await store.batchRemoveTags([video.id], [tagId]);
      notify({ type: "success", title: "标签值已清除", message: "标签已从视频移除" });
    }
    // 通过统一刷新函数同步左右面板
    await refreshVideoTags();
    if (detailLibraryId) await refreshAllTags(detailLibraryId);
  }, [video, selectedTagIds, refreshVideoTags, detailLibraryId, refreshAllTags]);

  const handleCreateClass = useCallback(async (parentId: string | null, name: string) => {
    if (!detailLibraryId) return;
    const store = useAppStore.getState();
    await store.createTagClass(detailLibraryId, name, parentId || undefined);
    await refreshAllTags(detailLibraryId);
  }, [detailLibraryId, refreshAllTags]);

  const handleRenameClass = useCallback(async (cls: TagClass, name: string) => {
    await useAppStore.getState().updateTagClass({ ...cls, name });
    if (detailLibraryId) await refreshAllTags(detailLibraryId);
  }, [detailLibraryId, refreshAllTags]);

  const handleDeleteClass = useCallback(async (id: string) => {
    if (!detailLibraryId) return;
    const store = useAppStore.getState();
    await store.deleteTagClass(id, detailLibraryId);
    await refreshAllTags(detailLibraryId);
    await refreshVideoTags();
  }, [detailLibraryId, refreshAllTags, refreshVideoTags]);

  const handleCreateTag = useCallback(async (classId: string, name: string, tagType?: string) => {
    if (!detailLibraryId) return;
    const store = useAppStore.getState();
    const created = await store.createClassTag(classId, detailLibraryId, name);
    if (created && tagType && tagType !== "text") setTagType(created.id, tagType as any);
    await refreshAllTags(detailLibraryId);
  }, [detailLibraryId, refreshAllTags]);

  const handleRenameTag = useCallback(async (tag: TagName, name: string, tagType?: string) => {
    const store = useAppStore.getState();
    await store.updateClassTag({ ...tag, name });
    if (tagType) setTagType(tag.id, tagType as any);
    if (detailLibraryId) await refreshAllTags(detailLibraryId);
  }, [detailLibraryId, refreshAllTags]);

  const handleDeleteTag = useCallback(async (id: string) => {
    const tag = useAppStore.getState().classTags.find(t => t.id === id);
    if (!tag) return;
    const store = useAppStore.getState();
    await store.deleteClassTag(id, tag.class_id, detailLibraryId || undefined);
    if (detailLibraryId) await refreshAllTags(detailLibraryId);
    await refreshVideoTags();
  }, [detailLibraryId, refreshAllTags, refreshVideoTags]);

  const handleSaveTags = async () => {
    if (!video) return;
    setTagSaving(true);
    try {
      const store = useAppStore.getState();
      const originalTagIds = videoTags.map(t => t.id);
      // 只添加有值的标签（无值标签不完整，不允许添加到视频）
      const toAdd = selectedTagIds.filter(id => !originalTagIds.includes(id) && tagValuesMap[id] && tagValuesMap[id].trim() !== "");
      const toRemove = originalTagIds.filter(id => !selectedTagIds.includes(id));
      if (toAdd.length > 0) await store.batchTagVideos([video.id], toAdd, toAdd.map(id => tagValuesMap[id] || ""));
      if (toRemove.length > 0) await store.batchRemoveTags([video.id], toRemove);
      const toUpdate = selectedTagIds.filter(id => originalTagIds.includes(id));
      if (toUpdate.length > 0) await store.batchTagVideos([video.id], toUpdate, toUpdate.map(id => tagValuesMap[id] || ""));
      await refreshVideoTags();
      notify({ type: "success", title: "标签已保存", message: `添加 ${toAdd.length} 个` });
    } catch { notify({ type: "error", title: "保存失败" }); }
    setTagSaving(false);
  };

  // ── 封面操作 ──
  const loadCoverB64 = async (path: string): Promise<string | null> => {
    if (coverDataUrls[path]) return coverDataUrls[path];
    try { const b64 = await invoke<string>("get_thumbnail", { path, maxWidth: null }); setCoverDataUrls(prev => ({ ...prev, [path]: b64 })); return b64; }
    catch { return null; }
  };

  const switchCover = async (idx: number) => {
    const path = coverPaths[idx];
    if (!path) return;
    const url = coverDataUrls[path] || await loadCoverB64(path);
    if (url) setCoverUrl(url);
  };

  const handleDragStart = (idx: number) => { dragStartIdxRef.current = idx; dragTargetIdxRef.current = idx; setDragIdx(idx); };
  const handleDragOver = (e: React.DragEvent, targetIdx: number) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dragTargetIdxRef.current = targetIdx; setDragIdx(targetIdx); };
  const handleDragEnd = async () => {
    coverWasDraggedRef.current = true;
    const fromIdx = dragStartIdxRef.current, toIdx = dragTargetIdxRef.current;
    setDragIdx(null); dragStartIdxRef.current = null; dragTargetIdxRef.current = null;
    if (fromIdx === null || toIdx === null || fromIdx === toIdx) return;
    const newPaths = [...coverPaths];
    const [moved] = newPaths.splice(fromIdx, 1); newPaths.splice(toIdx, 0, moved);
    if (validCoverPaths.length > 0) setValidCoverPaths(newPaths);
    useAppStore.setState(s => ({
      currentVideo: s.currentVideo && s.currentVideo.id === video?.id ? { ...s.currentVideo, thumbnail_path: JSON.stringify(newPaths) } : s.currentVideo,
      videos: s.videos.map(v => v.id === video?.id ? { ...v, thumbnail_path: JSON.stringify(newPaths) } : v),
    }));
    if (video?.id && newPaths.length > 1) { await reorderCovers(video.id, newPaths); notifyCoverRefresh(video.id); }
  };

  // ── 小说操作 ──
  useEffect(() => { novelDragStateRef.current.order = novelOrder; }, [novelOrder]);

  const handleNovelDragStart = (i: number) => { novelDragStateRef.current.dragIdx = i; setNovelDragIdx(i); };
  const handleNovelDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const s = novelDragStateRef.current;
    if (s.dragIdx === null || s.dragIdx === i) return;
    const newOrder = [...s.order]; const [moved] = newOrder.splice(s.dragIdx, 1); newOrder.splice(i, 0, moved);
    novelDragStateRef.current = { dragIdx: i, order: newOrder };
    setNovelOrder(newOrder); setNovelDragIdx(i);
  };
  const handleNovelDragEnd = async () => {
    const finalOrder = novelDragStateRef.current.order;
    const orderedNames = finalOrder.map(i => novels[i]?.name).filter(Boolean);
    setNovelDragIdx(null);
    if (video?.id && orderedNames.length > 1) try { await invoke("reorder_novels", { videoId: video.id, novelNames: orderedNames }); } catch { }
  };
const handleDeleteNovel = async (name: string) => {
  if (!video?.id) return;
  if (!await showConfirm({ title: "删除小说", message: `删除小说"${name}"？不可撤销。`, danger: true })) return;
  try {
    await invoke("delete_novel", { videoId: video.id, fileName: name });
    const deletedIdx = novels.findIndex(n => n.name === name);
    setNovels(prev => prev.filter(n => n.name !== name));
    setNovelOrder(prev => prev.filter(i => i !== deletedIdx).map(i => i > deletedIdx ? i - 1 : i));
    notify({ type: "success", title: "小说已删除", message: name, duration: 2000 });
  } catch (err) { notify({ type: "error", title: "删除失败", message: String(err) }); }
};
  const handlePlayNovelAudio = async (novelName: string) => {
    if (!video?.filepath) return;
    const audioName = novelName.replace(/\.[^/.]+$/, "") + ".mp3";
    const videoDir = video.filepath.substring(0, video.filepath.lastIndexOf('\\') + 1);
    try { await invoke("open_file", { filepath: `${videoDir}小说\\${audioName}` }); }
    catch (err) { notify({ type: "error", title: "播放失败", message: String(err) }); }
  };

  // ── 多链接管理 ──
  const handleSaveNovelLinks = useCallback(async (novelIdx: number, fileName: string, links: { url: string; note: string }[]) => {
    if (!video?.id) return;
    try {
      await invoke("save_novel_links", { videoId: video.id, fileName, links: JSON.stringify(links) });
      setNovels(prev => prev.map((novel, i) => i === novelIdx ? { ...novel, links } : novel));
      // 通知 LibraryView 刷新该视频的小说状态缓存
      useAppStore.getState().notifyNovelLinkRefresh(video.id);
      notify({ type: "success", title: "链接已保存", duration: 1200 });
    } catch (err) { notify({ type: "error", title: "保存失败", message: String(err) }); }
  }, [video?.id]);

  const handleAddLink = useCallback((novelIdx: number, url: string, note: string) => {
    const n = novels[novelIdx];
    if (!n) return;
    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) { notify({ type: "warning", title: "链接格式不正确", duration: 1500 }); return; }
    const newLinks = [...(n.links || []), { url: trimmed, note: note.trim() }];
    handleSaveNovelLinks(novelIdx, n.name, newLinks);
  }, [novels, handleSaveNovelLinks]);

  const handleRemoveLink = useCallback((novelIdx: number, linkIdx: number) => {
    const n = novels[novelIdx];
    if (!n || !n.links) return;
    const newLinks = n.links.filter((_, i) => i !== linkIdx);
    handleSaveNovelLinks(novelIdx, n.name, newLinks);
  }, [novels, handleSaveNovelLinks]);

  const handleUpdateLink = useCallback((novelIdx: number, linkIdx: number, url: string, note: string) => {
    const n = novels[novelIdx];
    if (!n || !n.links) return;
    const newLinks = n.links.map((l, i) => i === linkIdx ? { url: url.trim(), note: note.trim() } : l);
    handleSaveNovelLinks(novelIdx, n.name, newLinks);
  }, [novels, handleSaveNovelLinks]);

  const handleMoveLink = useCallback((novelIdx: number, fromIdx: number, toIdx: number) => {
    const n = novels[novelIdx];
    if (!n || !n.links) return;
    if (toIdx < 0 || toIdx >= n.links.length) return;
    const newLinks = [...n.links];
    const [moved] = newLinks.splice(fromIdx, 1);
    newLinks.splice(toIdx, 0, moved);
    handleSaveNovelLinks(novelIdx, n.name, newLinks);
  }, [novels, handleSaveNovelLinks]);

  // 复制首链接
  const handleCopyFirstLink = useCallback((novelIdx: number) => {
    const n = novels[novelIdx];
    if (!n?.links?.length) return;
    const firstUrl = n.links[0].url;
    navigator.clipboard.writeText(firstUrl).then(() => notify({ type: "success", title: "首链接已复制", duration: 1500 })).catch(() => {});
  }, [novels]);

  // ── 重命名 ──
  const displayName = video?.filename ? video.filename.replace(/\.[^.]+$/, "") : "";
  const handleSaveTitle = async () => {
    if (!video || !editTitle.trim()) { setEditingTitle(false); return; }
    const newName = editTitle.trim();
    if (newName === displayName) { setEditingTitle(false); return; }
    try {
      const ext = video.filename.slice(video.filename.lastIndexOf("."));
      const dir = video.filepath.slice(0, video.filepath.lastIndexOf("\\") + 1);
      await batchRename([[video.id, dir + newName + ext, newName + ext]], video.library_id);
      useAppStore.setState({ currentVideo: { ...video, filename: newName + ext, filepath: dir + newName + ext } });
      // 重命名后刷新视频列表，确保数据一致性
      loadVideos(video.library_id);
    } catch (e) { notify({ type: "error", title: "重命名失败", message: String(e) }); }
    setEditingTitle(false);
  };

  // ── 空状态 ──
  if (!video) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16, color: text.muted }}>
        <span style={{ fontSize: 48, opacity: 0.45 }}>🎬</span>
        <span style={{ fontSize: 14, color: text.secondary }}>暂无视频数据</span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>请在视频库中选择一个视频</span>
        <button onClick={handleBack} style={{ marginTop: 4, padding: "8px 20px", borderRadius: 6, background: theme.accentColor, border: "none", color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>← 返回视频库</button>
      </div>
    );
  }

  // ═══════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: bg.base }}>
      {/* ═══ 顶栏 ═══ */}
      <div style={{ height: 50, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 14px", background: bg.sidebar, borderBottom: `1px solid ${border.default}`, gap: 8 }}>
        <button onClick={handleBack} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "none", border: "none", color: text.secondary, fontSize: 12, borderRadius: 4, cursor: "pointer", flexShrink: 0, transition: "color .15s" }}
          onMouseEnter={e => e.currentTarget.style.color = accent.deep} onMouseLeave={e => e.currentTarget.style.color = text.secondary}>
          <Icons.ArrowLeft /> 返回
        </button>
        <span style={{ color: text.placeholder, fontSize: 9, opacity: 0.6 }}>/</span>
        <button onClick={handleBack} style={{ display: "inline-flex", alignItems: "center", padding: "2px 5px", background: "none", border: "none", color: text.muted, fontSize: 10, borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140, transition: "color .15s" }}
          onMouseEnter={e => e.currentTarget.style.color = accent.primary} onMouseLeave={e => e.currentTarget.style.color = text.muted}>
          {detailLibraryName}
        </button>

        {/* 标题 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <input autoFocus value={editTitle ?? ""} onChange={e => setEditTitle(e.target.value)}
              onBlur={handleSaveTitle} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); else if (e.key === "Escape") setEditingTitle(false); }}
              style={{ fontSize: 15, fontWeight: 600, padding: "3px 8px", border: `1px solid ${accent.deep}`, borderRadius: 4, outline: "none", background: bg.input, color: text.primary, width: "100%", maxWidth: 400, height: 30, boxSizing: "border-box" }} />
          ) : (
            <div onClick={() => { setEditTitle(displayName); setEditingTitle(true); }}
              style={{ fontSize: 15, fontWeight: 600, color: text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} title="点击重命名">
              {displayName}
            </div>
          )}
        </div>

        {/* 右侧操作 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {video.format && <span style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700, background: `linear-gradient(135deg,${accent.deep},${accent.primary})`, color: "#fff", letterSpacing: "0.5px" }}>{video.format.toUpperCase()}</span>}
          <button onClick={() => setFav(!fav)} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: fav ? accent.deep : bg.surface, border: `1px solid ${fav ? accent.deep : border.default}`, borderRadius: 6, cursor: "pointer", color: fav ? "#fff" : text.secondary, transition: "all .2s", fontSize: 14 }}>
            <Icons.Bookmark filled={fav} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <span style={{ color: "#ffc107", fontSize: 13 }}>{'★'.repeat(starRating)}{'☆'.repeat(5 - starRating)}</span>
            <span style={{ fontSize: 10, color: text.muted, marginLeft: 2 }}>{starRating}分</span>
          </div>
        </div>
      </div>

      {/* ═══ 主体 ═══ */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* ─── 左面板 ─── */}
        <div className="vd-scroll" style={{ width: 400, minWidth: 340, maxWidth: 480, borderRight: `1px solid ${border.divider}`, display: "flex", flexDirection: "column", background: bg.panel, overflow: "hidden", flexShrink: 0 }}>
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "10px 12px 12px" }}>

            {/* 预览 */}
            <div className="vd-preview-container" ref={previewRef} style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", backgroundColor: "#000", borderRadius: 8, overflow: "hidden", flexShrink: 0 }}
              onMouseEnter={() => { setShowControls(true); if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); }}
              onMouseLeave={() => { if (isPlaying) startControlsTimer(); }}
              onMouseMove={() => { if (isPlaying) { setShowControls(true); startControlsTimer(); } }}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "copy"; }}
              onDrop={async e => {
                e.preventDefault(); e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (!file || !video?.id) return;
                const fileName = file.name.toLowerCase();
                const isTxtFile = ['.txt','.md'].some(ext => fileName.endsWith(ext));
                if (isTxtFile) {
                  try {
                    const text = await file.text();
                    const b64 = btoa(unescape(encodeURIComponent(text)));
                    await invoke("bind_novel", { videoId: video.id, fileName: file.name, fileContent: b64 });
                    notify({ type: "success", title: "小说已绑定", message: file.name, duration: 2000 });
                    // 刷新小说列表
                    try {
                      const novelsData = await invoke<any[]>("get_video_novels", { videoId: video.id });
                      const names = novelsData.map(n => ({ name: n.name, size: n.size || 0, modified: n.modified || "", hasAudio: n.hasAudio || false }));
                      setNovels(names);
                      setNovelOrder(names.map((_, i) => i));
                    } catch {}
                    return;
                  } catch (err) { notify({ type: "error", title: "绑定小说失败", message: String(err) }); return; }
                }
                const isImageFile = file.type.startsWith('image/') || ['.jpg','.jpeg','.png','.gif','.bmp','.webp','.svg'].some(ext => fileName.endsWith(ext));
                if (!isImageFile) { notify({ type: "warning", title: "仅支持图片/文本文件", duration: 2000 }); return; }
                try {
                  const arrayBuf = await file.arrayBuffer(); const ext = file.name.split('.').pop() || 'jpg';
                  const videoDir = (video.filepath ?? "").substring(0, (video.filepath ?? "").lastIndexOf('\\') + 1);
                  const videoBase = (video.filename ?? "").replace(/\.[^.]+$/, "");
                  const savePath = `${videoDir}${videoBase}_cover.${ext}`;
                  const { writeBinaryFile } = await import("@tauri-apps/api/fs");
                  await writeBinaryFile(savePath, new Uint8Array(arrayBuf));
                  await invoke("set_primary_cover", { videoId: video.id, coverPath: savePath });
                  const b64 = await invoke<string>("read_cover_base64", { path: savePath });
                  if (b64) { setCoverDataUrls({ [savePath]: b64 }); setCoverUrl(b64); }
                  notifyCoverRefresh(video.id);
                  notify({ type: "success", title: "封面已添加", duration: 2000 });
                } catch (err) { notify({ type: "error", title: "添加封面失败", message: String(err) }); }
              }}>
              {isPlaying && video.filepath ? (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  {playError ? (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#000", color: "#aaa", gap: 12, zIndex: 10 }}>
                      <span style={{ fontSize: 13 }}>{playError}</span>
                      <button onClick={e => { e.stopPropagation(); openWithDefaultPlayer(video.filepath!); }} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid #555", background: "transparent", color: "#ddd", cursor: "pointer", fontSize: 12 }}>使用外部播放器打开</button>
                      <button onClick={e => { e.stopPropagation(); handleStopPlayback(); }} style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "transparent", color: "#888", cursor: "pointer", fontSize: 11 }}>关闭</button>
                    </div>
                  ) : videoSrc ? (
                    <>
                      <video ref={videoRef} src={videoSrc} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", backgroundColor: "#000" }}
                        autoPlay onClick={e => { e.stopPropagation(); handlePlayPause(); }}
                        onTimeUpdate={() => { if (!videoRef.current) return; const n = performance.now(); if (n - lastTimeUpdate.current < 200) return; lastTimeUpdate.current = n; setCurrentTime(videoRef.current.currentTime); }}
                        onLoadedMetadata={() => { if (videoRef.current) setDuration(videoRef.current.duration); }}
                        onPlay={() => setIsPaused(false)} onPause={() => setIsPaused(true)}
                        onError={() => setPlayError("视频加载失败")} />
                      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 64, height: 64, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", zIndex: 15, pointerEvents: "none" }}>
                        {actionIcon === "play" ? <Icons.Play /> : <Icons.Pause />}
                      </div>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, padding: "24px 10px 8px", pointerEvents: "auto", background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}>
                        <div onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); const p = (e.clientX - r.left) / r.width; if (videoRef.current) { videoRef.current.currentTime = p * duration; } }}
                          style={{ width: "100%", height: 14, display: "flex", alignItems: "center", cursor: "pointer", marginBottom: 6 }}>
                          <svg width="100%" height="4" style={{ position: "absolute", left: 0 }}>
                            <rect x="0" y="0" width="100%" height="1.5" fill="rgba(255,255,255,0.15)" rx="1" />
                            <rect x="0" y="0" width={`${duration > 0 ? (currentTime / duration) * 100 : 0}%`} height="1.5" fill={accent.deep} rx="1" style={{ transition: "width 0.1s linear" }} />
                          </svg>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button onClick={e => { e.stopPropagation(); handlePlayPause(); }} style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer" }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 14, height: 14 }}>
                              {isPaused ? <polygon points="6 3 20 12 6 21 6 3" /> : <><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></>}
                            </svg>
                          </button>
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontVariantNumeric: "tabular-nums", fontFamily: mono }}>{fmtTimeDisplay(currentTime)} / {fmtTimeDisplay(duration)}</span>
                          <div style={{ flex: 1 }} />
                          <button onClick={e => { e.stopPropagation(); handleStopPlayback(); }} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}><Icons.Close /></button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <>
                  {coverUrl ? (
                    <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", userSelect: "none", pointerEvents: "none" }}
                      onError={async () => { const p = coverPaths[0]; if (p) { const b64 = await loadCoverB64(p); if (b64) setCoverUrl(b64); }}} />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg,#1a1a1a,#2a2a2a)", color: text.secondary }}>
                      <button onClick={e => { e.stopPropagation(); handlePlay(); }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: text.secondary, fontSize: 48, opacity: 0.5 }}>🎬</button>
                    </div>
                  )}
                  <div className="vd-play-overlay" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <button className="vd-play-btn" onClick={e => { e.stopPropagation(); handlePlay(); }}
                      style={{ width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)", borderRadius: "50%", color: "#fff", border: `1px solid ${accent.primary}30`, cursor: "pointer", backdropFilter: "blur(6px)", boxShadow: `0 0 30px ${accent.glowStrong}, inset 0 0 20px ${accent.glow}` }}>
                      <svg viewBox="0 0 100 100" style={{ position: "absolute", width: "100%", height: "100%", animation: "vdRingRotate 6s linear infinite" }}>
                        <circle cx="50" cy="50" r="44" fill="none" stroke={accent.primary} strokeWidth="0.6" strokeDasharray="12 24 4 36 20 20" opacity="0.6" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke={accent.deep} strokeWidth="0.4" strokeDasharray="6 18 14 10" opacity="0.4" />
                      </svg>
                      <Icons.Play />
                    </button>
                  </div>
                  <button className="vd-nav-btn" onClick={e => { e.stopPropagation(); handlePrevVideo(); }}
                    style={{ position: "absolute", top: "50%", left: 12, transform: "translateY(-50%)", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)", border: `1px solid ${accent.primary}20`, borderRadius: "50%", color: "#fff", cursor: "pointer", zIndex: 10, backdropFilter: "blur(4px)" }}>
                    <Icons.ChevronLeft />
                  </button>
                  <button className="vd-nav-btn" onClick={e => { e.stopPropagation(); handleNextVideo(); }}
                    style={{ position: "absolute", top: "50%", right: 12, transform: "translateY(-50%)", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.25)", border: `1px solid ${accent.primary}20`, borderRadius: "50%", color: "#fff", cursor: "pointer", zIndex: 10, backdropFilter: "blur(4px)" }}>
                    <Icons.ChevronRight />
                  </button>
                </>
              )}
            </div>

            {/* 封面缩略图 */}
            {coverPaths.length > 1 && (
              <div style={{ display: "flex", gap: 5, padding: "8px 0", overflowX: "auto", flexShrink: 0 }}>
                {coverPaths.map((path, idx) => (
                  <div key={path} onClick={async () => { if (coverWasDraggedRef.current) { coverWasDraggedRef.current = false; return; } setSelectedCoverIdx(idx); await switchCover(idx); }}
                    draggable onDragStart={() => handleDragStart(idx)} onDragOver={e => handleDragOver(e, idx)} onDragEnd={handleDragEnd}
                    style={{ width: 68, height: 46, borderRadius: 5, overflow: "hidden", flexShrink: 0, border: idx === selectedCoverIdx ? `2px solid ${accent.deep}` : `1px solid ${border.default}`, cursor: "pointer", opacity: dragIdx === idx ? 0.4 : 1, transition: "all .15s", background: "#000", boxShadow: idx === selectedCoverIdx ? `0 0 8px ${accent.deep}60` : "none", transform: dragIdx === idx ? "scale(0.95)" : "none" }}>
                    <img src={coverDataUrls[path] || convertFileSrc(path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }} />
                  </div>
                ))}
              </div>
            )}

            {/* 技术参数 */}
            <SectionHeader title="技术参数" />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {video.resolution && <span className="info-chip"><span className="ic-icon">🎬</span><span className="ic-val">{video.resolution}</span></span>}
              {video.video_codec && <span className="info-chip"><span className="ic-icon">📦</span><span className="ic-val">{video.video_codec}</span></span>}
              {video.fps ? <span className="info-chip"><span className="ic-icon">⚡</span><span className="ic-val">{video.fps}fps</span></span> : null}
              {video.bitrate ? <span className="info-chip"><span className="ic-icon">📡</span><span className="ic-val">{(video.bitrate / 1000).toFixed(0)} kbps</span></span> : null}
              {video.audio_codec && <span className="info-chip"><span className="ic-icon">🔊</span><span className="ic-val">{video.audio_codec}</span></span>}
              {video.size ? <span className="info-chip"><span className="ic-icon">💾</span><span className="ic-val">{fmtSize(video.size)}</span></span> : null}
              {video.duration ? <span className="info-chip"><span className="ic-icon">⏱</span><span className="ic-val">{fmtDuration(video.duration)}</span></span> : null}
            </div>

            {/* 标签 */}
            <SectionHeader title="标签" count={videoTags.length} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {videoTags.length === 0 ? (
                <div style={{ padding: "12px 0", color: text.muted, fontSize: 11, opacity: 0.6 }}>暂无标签</div>
              ) : (
                videoTags.map(tag => {
                  const ttype = hasTagType(tag.id) ? getTagType(tag.id) : ((tag.tag_type as any) || "text");
                  const val = tagValuesMap[tag.id] || "";
                  return (
                    <div key={tag.id} className="vd-tag-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", borderRadius: 6, background: `linear-gradient(135deg,${tag.color || accent.deep}14,${tag.color || accent.deep}06)`, border: `1px solid ${tag.color || accent.deep}22`, transition: "all 0.2s" }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: tag.color || accent.deep, flexShrink: 0, boxShadow: `0 0 6px ${tag.color || accent.deep}50` }} />
                      <span style={{ fontSize: 9, flexShrink: 0, opacity: 0.6 }}>{ttype === "path" ? "📁" : ttype === "url" ? "🔗" : ""}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: tag.color || accent.deep, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>{tag.name}</span>
                      {val && (
                        ttype === "url" ? (
                          <span onClick={e => { e.stopPropagation(); import("../../../utils/openUrl").then(m => m.openUrl(val)); }}
                             style={{ fontSize: 9, color: accent.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90, textDecoration: "none", borderBottom: "1px dashed rgba(96,165,250,0.25)", cursor: "pointer" }}
                             title={`打开链接: ${val}`}>
                            {val.length > 30 ? val.slice(0, 27) + "..." : val}
                          </span>
                        ) : ttype === "path" ? (
                          <span onClick={e => { e.stopPropagation(); invoke("open_file", { filepath: val }); }}
                                style={{ fontSize: 9, color: accent.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90, cursor: "pointer", borderBottom: "1px dashed rgba(96,165,250,0.25)" }}
                                title={val}>
                            {val.length > 30 ? val.slice(0, 27) + "..." : val}
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, color: accent.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 90 }}>
                            {val.length > 30 ? val.slice(0, 27) + "..." : val}
                          </span>
                        )
                      )}
                      <span onClick={async (e) => {
                        e.stopPropagation();
                        const store = useAppStore.getState();
                        await store.batchRemoveTags([video.id], [tag.id]);
                        await refreshVideoTags();
                      }} style={{ fontSize: 7, cursor: "pointer", opacity: 0.6, padding: "0 2px", flexShrink: 0 }}>✕</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* 简介内容 — 按标题/简介/集数分段展示 */}
            {video?.intro_content && (() => {
              const introText = video.intro_content;
              const lines = introText.split('\n');
              let titleVal = '', summaryVal = '', episodesVal = '', restLines: string[] = [];
              let currentSection = '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('标题：') || trimmed.startsWith('标题:')) {
                  titleVal = trimmed.replace(/^标题[：:]\s*/, '');
                  currentSection = 'title';
                } else if (trimmed.startsWith('简介：') || trimmed.startsWith('简介:')) {
                  const after = trimmed.replace(/^简介[：:]\s*/, '');
                  summaryVal = after;
                  currentSection = 'summary';
                } else if (trimmed.startsWith('集数：') || trimmed.startsWith('集数:')) {
                  episodesVal = trimmed.replace(/^集数[：:]\s*/, '');
                  currentSection = 'episodes';
                } else {
                  if (currentSection === 'summary' && trimmed) {
                    summaryVal += (summaryVal ? '\n' : '') + trimmed;
                  } else if (!trimmed && currentSection !== 'summary') {
                    restLines.push(trimmed);
                  }
                }
              }

              const hasAny = titleVal || summaryVal || episodesVal;
              if (!hasAny) {
                // 无结构时按原样显示
                return (
                  <div style={{ marginTop: 6, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <SectionHeader title="简介" />
                    <div className="scroll-invisible" style={{
                      flex: 1, minHeight: 0, padding: "6px 8px", background: bg.surface, border: `1px solid ${border.default}`,
                      borderRadius: 6, fontSize: 9, color: text.secondary, lineHeight: 1.6,
                      overflow: "auto", whiteSpace: "pre-wrap",
                    }}>
                      {introText.length > 600 ? introText.slice(0, 600) + '...' : introText}
                    </div>
                  </div>
                );
              }

              const chipStyle: React.CSSProperties = {
                display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                fontSize: 10, fontWeight: 600, background: 'rgba(96,165,250,0.25)',
                color: '#93c5fd', border: '1px solid rgba(96,165,250,0.2)',
                marginBottom: 8,
              };

              return (
                <div style={{ marginTop: 6, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <SectionHeader title="简介" />
                  <div className="scroll-invisible" style={{
                    flex: 1, minHeight: 0, padding: "8px 10px", background: bg.surface,
                    border: `1px solid ${border.default}`, borderRadius: 6,
                    fontSize: 9, color: text.secondary, lineHeight: 1.6,
                    overflow: "auto",
                  }}>
                    {titleVal && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={chipStyle}>📺 标题</span>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: text.primary,
                          padding: "4px 2px", lineHeight: 1.4,
                        }}>{titleVal}</div>
                      </div>
                    )}
                    {summaryVal && (
                      <div style={{ marginBottom: 10 }}>
                        <span style={chipStyle}>📖 简介</span>
                        <div style={{
                          padding: "4px 2px", whiteSpace: "pre-wrap",
                          fontSize: 9.5, lineHeight: 1.7, color: text.secondary,
                        }}>
                          {summaryVal.length > 800 ? summaryVal.slice(0, 800) + '...' : summaryVal}
                        </div>
                      </div>
                    )}
                    {episodesVal && (
                      <div>
                        <span style={chipStyle}>📦 集数</span>
                        <div style={{
                          fontSize: 11, fontWeight: 600, color: accent.deep,
                          padding: "4px 2px",
                        }}>{episodesVal}</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          </div>
        </div>

        {/* ─── 右侧面板 ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Tab 栏 */}
          <div style={{ display: "flex", borderBottom: `1px solid ${border.divider}`, flexShrink: 0, background: bg.sidebar }}>
            {(["tags", "novel", "scan"] as const).map(tab => {
              const labels: Record<string, string> = { tags: "🏷️ 标签管理", novel: "📚 小说", scan: "🔍 扫描" };
              const counts: Record<string, number | undefined> = { tags: videoTags.length, novel: novels.length || undefined };
              return (
                <button key={tab} onClick={() => setRightPanelTab(tab)}
                  style={{ flex: 1, padding: "10px 0", background: "none", border: "none", color: rightPanelTab === tab ? accent.deep : text.muted, fontSize: 11, fontWeight: rightPanelTab === tab ? 600 : 400, cursor: "pointer", borderBottom: `2px solid ${rightPanelTab === tab ? accent.deep : "transparent"}`, marginBottom: -1, transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  {labels[tab]}
                  <span style={{ fontSize: 8, padding: "0 5px", borderRadius: 6, background: accent.glow, color: accent.primary, fontWeight: 600 }}>{counts[tab]}</span>
                </button>
              );
            })}
          </div>

          {/* 内容 */}
          <div className="vd-scroll" style={{ flex: 1, overflow: "auto", padding: "12px 16px" }}>

            {/* 标签管理 */}
            {rightPanelTab === "tags" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, background: bg.input, borderRadius: 6, border: `1px solid ${border.default}`, padding: "4px 8px", transition: "border-color 0.2s, box-shadow 0.2s" }} id="vd-tag-search">
                  <Icons.Search />
                  <input value={tagSearch ?? ""} onChange={e => setTagSearch(e.target.value)} placeholder="搜索标签类或标签名..."
                    onFocus={e => { const el = document.getElementById("vd-tag-search"); if (el) { el.style.borderColor = accent.deep; el.style.boxShadow = `0 0 0 2px ${accent.deep}20`; } }}
                    onBlur={e => { const el = document.getElementById("vd-tag-search"); if (el) { el.style.borderColor = border.default; el.style.boxShadow = "none"; } }}
                    style={{ flex: 1, background: "transparent", border: "none", color: text.primary, fontSize: 11, outline: "none" }} />
                  {tagSearch && <span onClick={() => setTagSearch("")} style={{ fontSize: 9, color: text.muted, cursor: "pointer", padding: "1px 4px", borderRadius: 3, background: bg.surface, lineHeight: "14px", display: "flex", alignItems: "center" }}>✕</span>}
                </div>
                <TagTree
                  tagClasses={tagClasses}
                  allTags={allTags}
                  search={tagSearch}
                  selectedIds={selectedTagIds}
                  mode="select"
                  onToggle={handleToggleTag}
                  tagValuesMap={tagValuesMap}
                  onValueChange={handleTagValueChange}
                  onValueSubmit={handleTagValueSubmit}
                  onCreateClass={handleCreateClass}
                  onRenameClass={handleRenameClass}
                  onDeleteClass={handleDeleteClass}
                  onCreateTag={handleCreateTag}
                  onRenameTag={handleRenameTag}
                  onDeleteTag={handleDeleteTag}
                  libraryId={detailLibraryId || undefined}
                  flat={false}
                />
              </div>
            )}

            {/* 小说管理 */}
            {rightPanelTab === "novel" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0 8px", borderBottom: `1px solid ${border.divider}`, marginBottom: 6 }}>
                  <div style={{ width: 3, height: 14, borderRadius: 2, background: accent.deep, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: text.primary }}>📚 小说</span>
                  <span style={{ fontSize: 9, color: text.muted }}>{novels.length}</span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                    <button onClick={async () => {
                      if (!video?.id) return;
                      try {
                        const result = await invoke<VideoTextScanResult>("scan_video_text_files", { videoId: video.id });
                        const novelFiles = result.files.filter(f => f.category === "novel" || f.category === "audio");
                        if (novelFiles.length === 0) { notify({ type: "info", title: "未发现小说", message: "视频目录中未找到小说文件", duration: 2000 }); return; }
                        loadNovels(video.id);
                        notify({ type: "success", title: "扫描完成", message: `发现 ${novelFiles.length} 个文件`, duration: 2000 });
                      } catch (err) { notify({ type: "error", title: "扫描失败", message: String(err) }); }
                    }} style={{ padding: "2px 8px", borderRadius: 3, fontSize: 8, background: `rgba(86,156,214,0.12)`, color: accent.primary, cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500, border: `1px solid rgba(86,156,214,0.2)` }}>🔍 扫描</button>
                  </div>
                </div>

                {/* 小说列表 */}
                {novels.length === 0 ? (
                  <div style={{ padding: "20px 0", textAlign: "center", color: text.muted, fontSize: 10, lineHeight: 1.8 }}>
                    <div style={{ fontSize: 24, opacity: 0.2, marginBottom: 4 }}>📚</div>
                    暂无小说 · 点击扫描发现
                  </div>
                ) : novelOrder.map((i) => {
                  const n = novels[i];
                  if (!n) return null;
                  const links = n.links || [];
                  const hasLinks = links.length > 0;
                  const hasAudio = n.hasAudio;
                  const expanded = novelExpanded[i] ?? false;
                  return (
                        <div key={n.name}>
                      <div draggable onDragStart={() => handleNovelDragStart(i)}
                        onDragOver={e => handleNovelDragOver(e, i)} onDragEnd={handleNovelDragEnd}
                        onContextMenu={e => { e.preventDefault(); setNovelMenuPos({ x: e.clientX, y: e.clientY, idx: i }); }}
                        style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "7px 8px",
                          background: `rgba(12,18,36,0.35)`, border: `1px solid ${border.default}`, borderRadius: 6, marginBottom: 2,
                          cursor: "grab", opacity: novelDragIdx === i ? 0.35 : 1, transition: "all 0.12s" }}>
                        <span style={{ color: text.placeholder, fontSize: 10, flexShrink: 0, marginTop: 2, cursor: "grab" }}>⠿</span>
                        <div style={{ width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0,
                          background: hasLinks ? `rgba(167,139,250,0.10)` : `rgba(52,211,153,0.10)`,
                          color: hasLinks ? "#a78bfa" : "#4ec9b0" }}>{hasLinks ? "🔗" : "📄"}</div>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ fontSize: 10, color: text.primary, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.name}</div>
                          <div style={{ fontSize: 7.5, color: text.muted, display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                            <span>{fmtSize(n.size)}</span>
                            {hasAudio && <span style={{ padding: "0 4px", borderRadius: 2, fontWeight: 600, background: `rgba(251,191,36,0.10)`, color: "#fbbf24" }}>🎵 音频</span>}
                            {hasLinks ? <span style={{ padding: "0 4px", borderRadius: 2, fontWeight: 600, background: `rgba(167,139,250,0.10)`, color: "#a78bfa" }}>🔗 {links.length} 链接</span> : <span style={{ padding: "0 4px", borderRadius: 2, fontWeight: 600, background: `rgba(78,201,176,0.10)`, color: "#4ec9b0" }}>文件</span>}
                            {hasLinks && <span onClick={() => setNovelExpanded(prev => ({ ...prev, [i]: !expanded }))} style={{ fontSize: 7, color: text.placeholder, cursor: "pointer", padding: "0 4px", borderRadius: 2, userSelect: "none", transition: "all 0.1s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#a78bfa"; (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.06)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = text.placeholder; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>{expanded ? "▲" : "▼"}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 2, flexShrink: 0 }} className="novel-actions">
                          <button onClick={(e) => { e.stopPropagation(); const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setNovelMenuPos({ x: rect.left, y: rect.bottom + 4, idx: i }); }}
                            style={{ width: 22, height: 22, border: `1px solid ${border.default}`, borderRadius: 4, background: `rgba(255,255,255,0.05)`, color: text.secondary, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.1s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `rgba(255,255,255,0.12)`; (e.currentTarget as HTMLElement).style.color = text.primary; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `rgba(255,255,255,0.05)`; (e.currentTarget as HTMLElement).style.color = text.secondary; }}
                            title="更多操作">⋯</button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteNovel(n.name); }}
                            style={{ width: 22, height: 22, border: `1px solid ${border.default}`, borderRadius: 4, background: `rgba(255,255,255,0.05)`, color: statusColors.error.color, cursor: "pointer", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.1s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = statusColors.error.bg; (e.currentTarget as HTMLElement).style.borderColor = statusColors.error.color; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `rgba(255,255,255,0.05)`; (e.currentTarget as HTMLElement).style.borderColor = border.default; }}
                            title="删除">✕</button>
                        </div>
                        {novelMenuPos && novelMenuPos.idx === i && (
                          <ContextMenu
                            x={novelMenuPos.x} y={novelMenuPos.y}
                            onClose={() => setNovelMenuPos(null)}
                            items={[
                              ...(hasLinks ? [
                                { label: "打开全部链接", icon: "🌐", action: () => { links.forEach((lk: any) => import("../../../utils/openUrl").then(m => m.openUrl(lk.url))); } },
                                { label: "复制全部链接", icon: "📋", action: () => { navigator.clipboard.writeText(links.map((lk: any) => lk.url).join("\n")).then(() => notify({ type: "success", title: "全部链接已复制", duration: 1500 })).catch(() => {}); } },
                                { label: (expanded ? "折叠链接" : "展开链接"), icon: expanded ? "▲" : "▼", action: () => setNovelExpanded(prev => ({ ...prev, [i]: !expanded })) },
                                { divider: true } as any,
                              ] : []),
                              { label: "用默认应用打开", icon: "▶️", action: () => {
                                const videoDir = (video?.filepath ?? "").substring(0, (video?.filepath ?? "").lastIndexOf('\\') + 1);
                                const filePath = videoDir + "小说\\" + n.name;
                                openWithDefaultPlayer(filePath).catch(() => notify({ type: "error", title: "打开失败", message: "无法打开文件" }));
                              } },
                              { label: "在文件管理器中显示", icon: "📁", action: () => {
                                const videoDir = (video?.filepath ?? "").substring(0, (video?.filepath ?? "").lastIndexOf('\\') + 1);
                                const filePath = videoDir + "小说\\" + n.name;
                                invoke("show_in_folder", { filepath: filePath }).catch(() => notify({ type: "error", title: "打开失败", message: "无法打开文件管理器" }));
                              } },
                              { divider: true } as any,
                              hasLinks
                                ? { label: "复制链接（首条）", icon: "🔗", color: "#a78bfa", action: () => { navigator.clipboard.writeText(links[0].url).then(() => notify({ type: "success", title: "首链接已复制", duration: 1500 })); } }
                                : { label: "复制文件名", icon: "📄", action: () => { navigator.clipboard.writeText(n.name).then(() => notify({ type: "success", title: "已复制文件名", duration: 1500 })); } },
                              { label: "复制文件路径", icon: "📍", action: () => {
                                const videoDir = (video?.filepath ?? "").substring(0, (video?.filepath ?? "").lastIndexOf('\\') + 1);
                                const filePath = videoDir + "小说\\" + n.name;
                                navigator.clipboard.writeText(filePath).then(() => notify({ type: "success", title: "已复制文件路径", duration: 1500 }));
                              } },
                              ...(!hasLinks ? [
                                { divider: true } as any,
                                { label: "添加链接", icon: "🔗", color: "#a78bfa", action: () => { setEditingLinkKey(`${i}-add`); setNovelExpanded(prev => ({ ...prev, [i]: true })); } },
                              ] : []),
                              { divider: true } as any,
                              { label: "删除小说", icon: "🗑", color: statusColors.error.color, action: () => handleDeleteNovel(n.name) },
                            ]}
                          />
                        )}
                      </div>

                      {/* ── 链接区域（独立非嵌套+折叠） ── */}
                      {hasLinks && (
                        <div style={{ background: `rgba(10,16,32,0.5)`, border: `1px solid rgba(167,139,250,0.08)`, borderRadius: "0 0 6px 6px", marginBottom: 6, padding: "4px 8px 4px", display: expanded ? "block" : "none" }}>
                          {links.map((link, li) => {
                            const editKey = `${i}-${li}`;
                            if (editingLinkKey === editKey) {
                              return (
                                <div key={li} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 4, marginBottom: 1, background: `rgba(167,139,250,0.04)`, border: `1px solid rgba(167,139,250,0.10)` }}>
                                  <span style={{ fontSize: 7.5, color: "#a78bfa", flexShrink: 0 }}>🔗</span>
                                  <input defaultValue={link.url} id={`eu-${editKey}`} placeholder="URL"
                                    style={{ flex: 1, minWidth: 40, padding: "2px 5px", borderRadius: 2, background: `rgba(0,0,0,0.2)`, border: `1px solid ${border.default}`, color: "#d4d4d4", fontSize: 7.5, outline: "none", fontFamily: mono }}
                                    onKeyDown={e => { if (e.key === "Enter") { const u2 = (document.getElementById(`eu-${editKey}`) as HTMLInputElement)?.value; const no2 = (document.getElementById(`en-${editKey}`) as HTMLInputElement)?.value; if (u2) handleUpdateLink(i, li, u2, no2 || ""); setEditingLinkKey(null); } }} />
                                  <input defaultValue={link.note} id={`en-${editKey}`} placeholder="备注"
                                    style={{ flex: "0 0 80px", padding: "2px 5px", borderRadius: 2, background: `rgba(0,0,0,0.2)`, border: `1px solid ${border.default}`, color: "#d4d4d4", fontSize: 7.5, outline: "none", fontFamily: "var(--font-sans)" }}
                                    onKeyDown={e => { if (e.key === "Enter") { const u2 = (document.getElementById(`eu-${editKey}`) as HTMLInputElement)?.value; const no2 = (document.getElementById(`en-${editKey}`) as HTMLInputElement)?.value; if (u2) handleUpdateLink(i, li, u2, no2 || ""); setEditingLinkKey(null); } }} />
                                  <button onClick={() => { const u = (document.getElementById(`eu-${editKey}`) as HTMLInputElement)?.value; const no = (document.getElementById(`en-${editKey}`) as HTMLInputElement)?.value; if (u) handleUpdateLink(i, li, u, no || ""); setEditingLinkKey(null); }}
                                    style={{ padding: "2px 7px", borderRadius: 2, fontSize: 7, border: "none", background: `rgba(167,139,250,0.12)`, color: "#a78bfa", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500 }}>✓</button>
                                  <button onClick={() => setEditingLinkKey(null)} style={{ padding: "2px 5px", borderRadius: 2, fontSize: 7, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontFamily: "var(--font-sans)" }}>✕</button>
                                  <button onClick={() => { handleRemoveLink(i, li); setEditingLinkKey(null); }} style={{ padding: "2px 5px", borderRadius: 2, fontSize: 7, border: "none", background: "transparent", color: statusColors.error.color, cursor: "pointer", fontFamily: "var(--font-sans)" }}>🗑</button>
                                </div>
                              );
                            }
                            return (
                              <div key={li} draggable
                                onDragStart={() => setNovelLinkDragIdx(editKey)}
                                onDragOver={e => { e.preventDefault(); if (!novelLinkDragIdx) return; const [di] = novelLinkDragIdx.split("-").map(Number); if (di !== i) return; handleMoveLink(i, parseInt(novelLinkDragIdx.split("-")[1]), li); setNovelLinkDragIdx(editKey); }}
                                onDragEnd={() => setNovelLinkDragIdx(null)}
                                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 6px", borderRadius: 4, cursor: "grab", opacity: novelLinkDragIdx === editKey ? 0.3 : 1, transition: "all 0.08s", marginBottom: 1 }}>
                                <span style={{ color: text.placeholder, fontSize: 7, cursor: "grab", flexShrink: 0 }}>⠿</span>
                                <span style={{ fontSize: 7.5, color: "#a78bfa", flexShrink: 0 }}>🔗</span>
                                <span style={{ fontSize: 8, color: text.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, fontFamily: mono }} title={link.url}>{link.url}</span>
                                {link.note
                                  ? <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "0 5px", borderRadius: 3, fontSize: 7, background: `rgba(167,139,250,0.08)`, color: "#a78bfa", flexShrink: 0, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: 4 }}>📝{link.note}</span>
                                  : <span style={{ marginLeft: 4, fontSize: 6.5, color: text.placeholder, flexShrink: 0, opacity: 0.5 }}>无备注</span>
                                }
                                <span style={{ marginLeft: "auto", display: "flex", gap: 1, flexShrink: 0 }}>
                                  <button onClick={() => navigator.clipboard.writeText(link.url).then(() => notify({ type: "success", title: "已复制", duration: 800 })).catch(() => {})} style={{ padding: "1px 4px", borderRadius: 2, fontSize: 6.5, border: "none", background: "transparent", color: text.muted, cursor: "pointer" }}>📋</button>
                                  <button onClick={() => setEditingLinkKey(editKey)} style={{ padding: "1px 4px", borderRadius: 2, fontSize: 6.5, border: "none", background: "transparent", color: text.muted, cursor: "pointer" }}>✏️</button>
                                  <button onClick={() => handleRemoveLink(i, li)} style={{ padding: "1px 4px", borderRadius: 2, fontSize: 6.5, border: "none", background: "transparent", color: statusColors.error.color, cursor: "pointer" }}>🗑</button>
                                </span>
                              </div>
                            );
                          })}
                          {editingLinkKey === `${i}-add` ? (
                            <div style={{ display: "flex", gap: 4, padding: "4px 6px", borderRadius: 4, background: `rgba(167,139,250,0.04)`, border: `1px solid rgba(167,139,250,0.10)`, marginTop: 2 }}>
                              <input id={`au-${i}`} placeholder="https://..." style={{ flex: 1, minWidth: 40, padding: "2px 5px", borderRadius: 2, background: `rgba(0,0,0,0.2)`, border: `1px solid ${border.default}`, color: "#d4d4d4", fontSize: 7.5, outline: "none", fontFamily: mono }}
                                onKeyDown={e => { if (e.key === "Enter") { const u2 = (document.getElementById(`au-${i}`) as HTMLInputElement)?.value.trim(); const no2 = (document.getElementById(`an-${i}`) as HTMLInputElement)?.value.trim(); if (u2) { handleAddLink(i, u2, no2 || ""); setEditingLinkKey(null); } } }} />
                              <input id={`an-${i}`} placeholder="备注" style={{ flex: "0 0 80px", padding: "2px 5px", borderRadius: 2, background: `rgba(0,0,0,0.2)`, border: `1px solid ${border.default}`, color: "#d4d4d4", fontSize: 7.5, outline: "none", fontFamily: "var(--font-sans)" }}
                                onKeyDown={e => { if (e.key === "Enter") { const u2 = (document.getElementById(`au-${i}`) as HTMLInputElement)?.value.trim(); const no2 = (document.getElementById(`an-${i}`) as HTMLInputElement)?.value.trim(); if (u2) { handleAddLink(i, u2, no2 || ""); setEditingLinkKey(null); } } }} />
                              <button onClick={() => { const u = (document.getElementById(`au-${i}`) as HTMLInputElement)?.value.trim(); const no = (document.getElementById(`an-${i}`) as HTMLInputElement)?.value.trim(); if (u) { handleAddLink(i, u, no || ""); setEditingLinkKey(null); } }} style={{ padding: "2px 8px", borderRadius: 2, fontSize: 7, border: "none", background: `rgba(167,139,250,0.12)`, color: "#a78bfa", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500 }}>添加</button>
                              <button onClick={() => setEditingLinkKey(null)} style={{ padding: "2px 5px", borderRadius: 2, fontSize: 7, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontFamily: "var(--font-sans)" }}>取消</button>
                            </div>
                          ) : (
                            <div style={{ padding: "0 6px", marginTop: 2 }}>
                              <button onClick={() => setEditingLinkKey(`${i}-add`)} style={{ padding: "2px 6px", borderRadius: 2, fontSize: 6.5, border: "none", background: "transparent", color: text.placeholder, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.08s" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#a78bfa"; (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.06)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = text.placeholder; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>+ 🔗 添加链接</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 无链接时显示独立添加链接入口 */}
                      {!hasLinks && editingLinkKey !== `${i}-add` && (
                        <div style={{ padding: "2px 8px 6px", marginTop: -2 }}>
                          <button onClick={() => setEditingLinkKey(`${i}-add`)} style={{ padding: "3px 8px", borderRadius: 3, fontSize: 7.5, border: `1px dashed ${border.default}`, background: "transparent", color: text.placeholder, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "all 0.08s" }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#a78bfa"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(167,139,250,0.35)"; (e.currentTarget as HTMLElement).style.background = "rgba(167,139,250,0.05)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = text.placeholder; (e.currentTarget as HTMLElement).style.borderColor = border.default; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>+ 🔗 添加链接</button>
                        </div>
                      )}
                      {!hasLinks && editingLinkKey === `${i}-add` && (
                        <div style={{ display: "flex", gap: 4, padding: "4px 8px 6px", borderRadius: "0 0 6px 6px", marginBottom: 6, background: `rgba(10,16,32,0.35)`, border: `1px solid rgba(167,139,250,0.08)`, borderTop: "none" }}>
                          <input id={`au-${i}`} placeholder="https://..." style={{ flex: 1, minWidth: 40, padding: "2px 5px", borderRadius: 2, background: `rgba(0,0,0,0.2)`, border: `1px solid ${border.default}`, color: "#d4d4d4", fontSize: 7.5, outline: "none", fontFamily: mono }}
                            onKeyDown={e => { if (e.key === "Enter") { const u2 = (document.getElementById(`au-${i}`) as HTMLInputElement)?.value.trim(); const no2 = (document.getElementById(`an-${i}`) as HTMLInputElement)?.value.trim(); if (u2) { handleAddLink(i, u2, no2 || ""); setEditingLinkKey(null); } } }} />
                          <input id={`an-${i}`} placeholder="备注" style={{ flex: "0 0 80px", padding: "2px 5px", borderRadius: 2, background: `rgba(0,0,0,0.2)`, border: `1px solid ${border.default}`, color: "#d4d4d4", fontSize: 7.5, outline: "none", fontFamily: "var(--font-sans)" }}
                            onKeyDown={e => { if (e.key === "Enter") { const u2 = (document.getElementById(`au-${i}`) as HTMLInputElement)?.value.trim(); const no2 = (document.getElementById(`an-${i}`) as HTMLInputElement)?.value.trim(); if (u2) { handleAddLink(i, u2, no2 || ""); setEditingLinkKey(null); } } }} />
                          <button onClick={() => { const u = (document.getElementById(`au-${i}`) as HTMLInputElement)?.value.trim(); const no = (document.getElementById(`an-${i}`) as HTMLInputElement)?.value.trim(); if (u) { handleAddLink(i, u, no || ""); setEditingLinkKey(null); } }} style={{ padding: "2px 8px", borderRadius: 2, fontSize: 7, border: "none", background: `rgba(167,139,250,0.12)`, color: "#a78bfa", cursor: "pointer", fontFamily: "var(--font-sans)", fontWeight: 500 }}>添加</button>
                          <button onClick={() => setEditingLinkKey(null)} style={{ padding: "2px 5px", borderRadius: 2, fontSize: 7, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontFamily: "var(--font-sans)" }}>取消</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <style>{`
                  .novel-actions button { opacity: 0.6; }
                  div:hover > .novel-actions button { opacity: 1; }
                  .novel-actions button:hover { opacity: 1; }
                `}</style>

                {/* 配对音频 */}
                {novels.some(n => n.hasAudio) && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderTop: `1px solid ${border.divider}`, marginTop: 6 }}>
                      <span style={{ fontSize: 7, fontWeight: 600, color: text.muted, letterSpacing: "0.3px" }}>🎵 配对音频</span>
                      <span style={{ marginLeft: "auto", background: `rgba(251,191,36,0.08)`, color: "#fbbf24", padding: "0 5px", borderRadius: 3, fontSize: 8 }}>{novels.filter(n => n.hasAudio).length}</span>
                    </div>
                    {novels.filter(n => n.hasAudio).map((n, idx) => {
                      const audioName = n.name.replace(/\.[^/.]+$/, "") + ".mp3";
                      return (
                        <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", fontSize: 9, color: text.muted }}>
                          <span style={{ fontSize: 10 }}>🎵</span>
                          <span style={{ flex: 1, fontFamily: mono, fontSize: 9, color: text.primary }}>{audioName}</span>
                          <span style={{ fontSize: 7, color: text.muted }}>← {n.name}</span>
                          <button onClick={() => handlePlayNovelAudio(n.name)} style={{ padding: "1px 6px", borderRadius: 2, border: `1px solid ${border.default}`, background: "transparent", color: text.muted, cursor: "pointer", fontSize: 8, fontFamily: "var(--font-sans)" }}>▶ 播放</button>
                        </div>
                      );
                    })}
                  </>
                )}

              </div>
            )}

            {/* 扫描归类 */}
            {rightPanelTab === "scan" && (
              <div>
                {/* 标题栏 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 0 10px", borderBottom: `1px solid ${border.divider}`, marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: text.primary }}>🔍 扫描归类</span>
                  <button onClick={async () => {
                    if (!video?.id) return;
                    try {
                      const result = await invoke<VideoTextScanResult>("scan_video_text_files", { videoId: video.id });
                      const cnt = result.files.length;
                      notify({ type: "success", title: "扫描完成", message: `发现 ${cnt} 个文件`, duration: 2000 });
                      setTextScanResult(result);
                      setScanView("after");
                    } catch (err) { notify({ type: "error", title: "扫描失败", message: String(err) }); }
                  }} style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 4, fontSize: 11, fontWeight: 500, border: `1px solid ${accent.glowStrong}`, background: accent.glow, color: accent.primary, cursor: "pointer", fontFamily: "var(--font-sans)" }}>🔍 运行</button>
                </div>

                {/* 视频目录 */}
                {video?.filepath && (
                  <div style={{ marginBottom: 10, padding: "5px 12px", background: bg.elevated, borderRadius: 3, fontFamily: mono, fontSize: 10, color: text.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    📁 {video.filepath.substring(0, video.filepath.lastIndexOf('\\'))}
                  </div>
                )}

                {/* 切换栏 */}
                <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                  {(["before", "after"] as const).map(v => {
                    const labels = { before: "📁 扫描前", after: "📁 归类后" };
                    return (
                      <button key={v} onClick={() => setScanView(v)}
                        style={{ padding: "4px 14px", borderRadius: 4, fontSize: 10, fontWeight: 500,
                          border: scanView === v ? `1px solid ${accent.glowStrong}` : `1px solid ${border.default}`,
                          background: scanView === v ? accent.glow : "transparent",
                          color: scanView === v ? accent.primary : text.muted, cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                        {labels[v]}
                      </button>
                    );
                  })}
                </div>

                {/* 内容区 */}
                <div style={{ fontFamily: mono, fontSize: 11, lineHeight: 1.9 }}>
                  {!textScanResult || textScanResult.files.length === 0 ? (
                    <div style={{ padding: "32px 0", textAlign: "center", fontSize: 11, color: text.muted, lineHeight: 2 }}>
                      点击"运行"扫描当前视频目录
                    </div>
                  ) : scanView === "before" ? (
                    /* 扫描前 */
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"2px 0" }}><span style={{width:20,textAlign:"center",fontSize:12}}>🎬</span><span style={{color:text.primary}}>{video?.filename}</span></div>
                      {textScanResult.files.map((f, idx) => (
                        <div key={idx} style={{ display:"flex", alignItems:"center", gap:5, padding:"2px 0" }}>
                          <span style={{width:20,textAlign:"center",fontSize:12}}>{f.category === "cover" ? "🖼" : f.category === "audio" ? "🎵" : "📄"}</span>
                          <span style={{color:text.primary}}>{f.file_name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* 归类后 */
                    <div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"2px 0" }}><span style={{width:20,textAlign:"center",fontSize:12}}>🎬</span><span style={{color:text.primary}}>{video?.filename}</span></div>
                      {(() => {
                        const groups: Record<string, { icon: string; color: string; files: typeof textScanResult.files }> = {};
                        for (const f of textScanResult.files) {
                          let key = f.category === "novel" ? "小说" : f.category === "subtitle" || f.category === "audio" ? "字幕音频" : f.category === "cover" ? "封面" : "其他";
                          if (!groups[key]) groups[key] = { icon: key === "小说" ? "📚" : key === "字幕音频" ? "💬" : key === "封面" ? "🖼" : "📄", color: key === "小说" ? "#60a5fa" : key === "字幕音频" ? "#a78bfa" : key === "封面" ? "#fb923c" : "#6a6a6a", files: [] };
                          groups[key].files.push(f);
                        }
                        const introFiles = textScanResult.files.filter(f => f.category === "intro");
                        const CAT_COLORS: Record<string, string> = { "小说": accent.primary, "字幕音频": accent.deep, "封面": statusColors.warning.color, "其他": text.muted };
                        const CAT_BGS: Record<string, string> = { "小说": accent.tint, "字幕音频": `rgba(167,139,250,0.08)`, "封面": `rgba(251,191,36,0.08)`, "其他": "transparent" };
                        return (
                          <>
                            {introFiles.map((f, idx) => (
                              <div key={`intro-${idx}`} style={{ display:"flex", alignItems:"center", gap:5, color:statusColors.success.color, padding:"2px 0" }}>
                                <span style={{width:20,textAlign:"center",fontSize:12}}>📝</span><span>{f.file_name}</span><span style={{marginLeft:"auto",color:text.muted}}>原位 ✓</span>
                              </div>
                            ))}
                            {Object.entries(groups).map(([key, g]) => (
                              <div key={key} style={{ margin:"4px 0", background:CAT_BGS[key] || bg.elevated, borderRadius:4, padding:"6px 10px" }}>
                                <div style={{ fontSize:10, fontWeight:600, color:CAT_COLORS[key] || text.muted, marginBottom:2 }}>{g.icon} {key}/</div>
                                {g.files.map((f, fi) => (
                                  <div key={fi} style={{ display:"flex", alignItems:"center", gap:4, padding:"1px 0" }}>
                                    <span style={{fontSize:10,width:20,textAlign:"center"}}>{f.category === "audio" ? "🔊" : f.category === "cover" ? "🖼" : ""}</span>
                                    <span style={{color:text.primary}}>{f.file_name}</span>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
