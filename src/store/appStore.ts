import { create } from "zustand";
import { invoke, isTauri } from "../tauri-invoke";
import { notify } from "../components/Notification";
import { listen } from "../tauri-event";
import { moduleConfigs } from "../config/modules";
import type { LogLevel } from "../types";

// 扫描日志级别映射
function convertScanLogLevel(level: string): LogLevel {
  switch (level) {
    case "error": return "error";
    case "warn": return "warn";
    case "info": return "info";
    default: return "debug";
  }
}

import type {
  Category, VideoLibrary, Video, EncodingPreset,
  ScanProgress, ScanLogEntry, DuplicateGroup, AppSettings, VideoDetail,
  ScannedVideoPayload, ModuleConfig, TagClass, TagName, TagClassTreeNode,
  VideoTextScanResult, TextFileSummary, LogEntry, ScanHistory
} from "../types";

interface TabState {
  scrollPos: number;
  filters: any;
  viewMode: string;
  page: number;
  videoPage?: number;
  videoSearch?: string;
  videoSearchScope?: string;
  videoSortBy?: string;
  videoSortDir?: string;
  tagFilters?: string[];
  formatFilters?: string[];
  
  pageState?: Record<string, any>;
  pageCurrentVideo?: Video;  // 跨库 tab 切换时保留视频引用
}

interface AppState {
  categories: Category[];
  libraries: Record<string, VideoLibrary[]>;
  currentCategoryId: string | null;
  currentLibraryId: string | null;
  currentPage: string;
  currentModuleId: string;
  tabs: { id: string; label: string; pageId: string }[];
  activeTabId: string | null;
  tabStates: Record<string, TabState>;
  tabRoutes: Record<string, any[]>;
  videos: Video[];
  moduleConfigs: ModuleConfig[];
  totalVideos: number;
  videoPage: number;
  videoPageSize: number;
  videoSortBy: string;
  videoSortDir: string;
  videoSortBy2: string;
  videoSortDir2: string;
  videoSearch: string;
  videoSearchScope: string;
  novelFilter: string;
  
  tagClasses: TagClass[];
  
  classTags: TagName[];
  presets: EncodingPreset[];
  allVideosCount: number;
  totalStorage: number;
  dialogStack: string[];
  loading: boolean;
  settings: AppSettings | null;
  scanProgress: ScanProgress | null;
  scanUnlisten: (() => void) | null;
  scanningLibraryId: string | null;
  scanHistory: ScanHistory[];
  duplicateGroups: DuplicateGroup[];
  currentVideo: Video | null;
  cardInfoFields: string[];
  cardTagIds: string[];
  
  tagFilters: string[];
  formatFilters: string[];
  coverCacheVersion: number;
  libraryClassifyState: Record<string, { mode: string; dateStart: string; dateEnd: string; preset: string }>;
  libraryVideoPage: Record<string, number>;
  libraryZoomLevel: Record<string, number>;

  loadClassifyState: () => void;

  loadCategories: () => Promise<void>;
  loadLibraries: (categoryId: string) => Promise<void>;
  loadVideos: (libraryId: string, page?: number, tagIds?: string | string[], formatFilter?: string) => Promise<void>;
  loadAllVideosCount: () => Promise<void>;
  loadTags: (libraryId: string) => Promise<void>;
  loadPresets: () => Promise<void>;
  createPreset: (name: string, encoder_type: string, width: number, height: number, fps: string) => Promise<string | null>;
  deletePreset: (id: string) => Promise<void>;
  updatePreset: (preset: EncodingPreset) => Promise<void>;
  setDefaultPreset: (id: string) => Promise<void>;

  setCurrentCategory: (id: string | null) => void;
  setCurrentLibrary: (id: string | null) => void;
  navigateTo: (pageId: string, label: string, tabId?: string) => void;
  navigateToModule: (moduleId: string, navItemId?: string) => void;
  closeTab: (tabId: string) => void;
  setVideoPage: (page: number) => void;
  setVideoPageSize: (size: number) => void;
  setVideoSort: (by: string, dir: string) => void;
  setVideoSort2: (by: string, dir: string) => void;
  setVideoSearch: (q: string) => void;
  setVideoSearchScope: (scope: string) => void;
  setCardInfoFields: (fields: string[]) => void;
  setCurrentVideo: (video: Video | null) => void;
  openVideoDetail: (video: Video) => void;
  openDialog: (id: string) => void;
  closeDialog: (id: string) => void;
  updateTabState: (tabId: string, state: Partial<TabState>) => void;
  getTabState: (tabId: string) => TabState | undefined;

  videoTagsMap: Record<string, Record<string, string>>;
  setVideoTagsMap: (map: Record<string, Record<string, string>>) => void;
  getVideoTaggingsBatch: (videoIds: string[]) => Promise<void>;

  // 控制台日志
  appLogs: LogEntry[];
  clearAppLogs: () => void;

  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isAlwaysOnTop: boolean;
  toggleAlwaysOnTop: () => Promise<boolean>;

  createCategory: (name: string, icon?: string) => Promise<string | null>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategoryAction: (id: string, deleteLibraries: boolean) => Promise<void>;
  updateCategoryStatus: (id: string, status: string) => Promise<void>;
  updateCategorySort: (id: string, sortOrder: number) => Promise<void>;
  updateLibrarySort: (id: string, sortOrder: number) => Promise<void>;
  updateCategoryIcon: (id: string, icon: string) => Promise<void>;
  createLibrary: (categoryId: string, name: string, icon?: string) => Promise<string | null>;
  renameLibrary: (id: string, name: string, categoryId: string) => Promise<void>;
  deleteLibraryAction: (id: string, categoryId: string) => Promise<void>;
  updateLibraryIcon: (id: string, icon: string) => Promise<void>;

  loadTagClasses: (libraryId: string) => Promise<void>;
  createTagClass: (libraryId: string, name: string, parentId?: string, color?: string, icon?: string) => Promise<void>;
  updateTagClass: (cls: TagClass) => Promise<void>;
  deleteTagClass: (id: string, libraryId: string) => Promise<void>;
  moveTagClass: (id: string, newParentId: string | null) => Promise<void>;
  copyTagClass: (id: string, newParentId: string | null) => Promise<TagClass | null>;

  loadClassTags: (classId: string) => Promise<void>;
  createClassTag: (classId: string, libraryId: string, name: string, color?: string) => Promise<TagName | null>;
  updateClassTag: (tag: TagName, libraryId?: string) => Promise<void>;
  deleteClassTag: (id: string, classId: string, libraryId?: string) => Promise<void>;

  loadTagClassTree: (libraryId: string) => Promise<TagClassTreeNode[]>;
  saveTagTemplate: (libraryId: string) => Promise<TagClassTreeNode[]>;
  loadTagTemplate: (libraryId: string, template: TagClassTreeNode[]) => Promise<void>;
  cleanupUnusedTags: (libraryId: string) => Promise<number>;

  startScan: (libraryId: string) => Promise<void>;
  getScanProgress: () => Promise<void>;
  cancelScan: () => Promise<void>;
  listenScanEvents: () => Promise<void>;
  unlistenScanEvents: () => void;
  loadScanHistory: (libraryId: string) => Promise<void>;

  // 智能文本扫描
  scanVideoTextFiles: (videoId: string) => Promise<VideoTextScanResult | null>;
  batchScanTextStatus: (videoIds: string[]) => Promise<Record<string, TextFileSummary>>;

  getSettings: () => Promise<void>;
  updateSettings: (settings: AppSettings) => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
  resetSettings: () => Promise<void>;

  batchTagVideos: (videoIds: string[], tagIds: string[], tagValues: string[]) => Promise<void>;
  batchRemoveTags: (videoIds: string[], tagIds: string[]) => Promise<void>;
  searchClassTags: (query: string, libraryId: string) => Promise<TagName[]>;

  findDuplicates: (libraryId: string, mode: string) => Promise<void>;
  getDuplicateGroups: () => Promise<void>;
  resolveDuplicate: (groupId: string, keepVideoId: string) => Promise<void>;

  deleteVideo: (videoId: string) => Promise<void>;
  batchUpdateVideos: (videoIds: string[], note?: string, favorite?: boolean, status?: string) => Promise<void>;
  getVideoDetail: (videoId: string) => Promise<VideoDetail | null>;
  updateVideo: (id: string, note: string, favorite: boolean, series?: string, category?: string) => Promise<void>;
  reorderCovers: (videoId: string, coverPaths: string[]) => Promise<void>;
  batchRename: (renames: string[][], libraryId: string) => Promise<void>;
  
  coverRefreshVersion: Record<string, number>;
  novelLinkRefreshVersion: Record<string, number>;
  notifyCoverRefresh: (videoId: string) => void;
  notifyNovelLinkRefresh: (videoId: string) => void;

  exportLibrary: (libraryId: string, outputPath: string) => Promise<string>;
  importLibrary: (filePath: string, categoryId?: string) => Promise<string>;
  backupData: () => Promise<void>;
  restoreData: (backupPath: string) => Promise<void>;

  pushSubPage: (tabId: string, subPage: any) => void;
  popSubPage: (tabId: string) => any;
  canGoBack: (tabId: string) => boolean;
}

function deriveLibraryIdFromPage(pageId: string, fallback: string | null): string | null {
  const libMatch = pageId.match(/^library-(.+)$/);
  if (libMatch) return libMatch[1];
  if (pageId === "library") return fallback;
  return null;
}

/** 根据 tab.id 去重，后出现的覆盖先出现的 */
function dedupTabs(tabs: { id: string; label: string; pageId: string }[]): { id: string; label: string; pageId: string }[] {
  const seen = new Set<string>();
  const result: { id: string; label: string; pageId: string }[] = [];
  // 逆序遍历，保留最后出现的
  for (let i = tabs.length - 1; i >= 0; i--) {
    if (!seen.has(tabs[i].id)) {
      seen.add(tabs[i].id);
      result.unshift(tabs[i]);
    }
  }
  return result;
}

// 请求序列号，用于 loadVideos 竞态控制
let _reqId = 0;

export const useAppStore = create<AppState>((set, get) => ({
  categories: [],
  libraries: {},
  currentCategoryId: null,
  currentLibraryId: null,
  currentPage: "video-home",
  currentModuleId: "video",
  tabs: [],
  activeTabId: null,
  tabStates: {},
  tabRoutes: {},
  videos: [],
  moduleConfigs: moduleConfigs,
  totalVideos: 0,
  videoPage: 1,
  videoPageSize: 100,
  videoSortBy: "filename",
  videoSortDir: "asc",
  videoSortBy2: "",
  videoSortDir2: "desc",
  videoSearch: "",
  videoSearchScope: "filename",
  novelFilter: "",
  tagClasses: [],
  classTags: [],
  presets: [],
  allVideosCount: 0,
  totalStorage: 0,
  dialogStack: [],
  loading: false,
  settings: null,
  scanProgress: null,
  scanUnlisten: null,
  scanningLibraryId: null,
  scanHistory: [],
  duplicateGroups: [],
  currentVideo: null,
  isAlwaysOnTop: false,
  cardInfoFields: ["size", "date", "resolution"],
  cardTagIds: [],
  tagFilters: [],
  formatFilters: [],
  videoTagsMap: {},
  coverRefreshVersion: {},
  novelLinkRefreshVersion: {},
  coverCacheVersion: 0,
  libraryClassifyState: {},
  libraryVideoPage: {},
  libraryZoomLevel: {},
  appLogs: [],

  loadCategories: async function() {
    try {
      const cats = await invoke<Category[]>("get_categories");
      set((s) => ({ categories: cats, currentCategoryId: s.currentCategoryId && cats.some(c => c.id === s.currentCategoryId) ? s.currentCategoryId : cats[0]?.id || null }));
    } catch (e) {
      console.error("loadCategories failed:", e);
      notify({ type: "error", title: "加载分类失败", message: String(e) });
    }
  },
  loadLibraries: async function(categoryId) {
    try {
      const libs = await invoke<VideoLibrary[]>("get_libraries", { categoryId });
      set((s) => ({ libraries: { ...s.libraries, [categoryId]: libs } }));
      const curId = get().currentLibraryId;
      if (curId) {
        const lib = libs.find(l => l.id === curId);
        if ((lib as any)?.card_info_fields) {
          try {
            const parsed = JSON.parse((lib as any).card_info_fields);
            if (Array.isArray(parsed)) set({ cardInfoFields: parsed });
          } catch {}
        }
        if ((lib as any)?.card_tag_ids) {
          try {
            const parsed = JSON.parse((lib as any).card_tag_ids);
            if (Array.isArray(parsed)) set({ cardTagIds: parsed });
          } catch {}
        }
      }
    } catch (e) {
      console.warn("loadLibraries failed:", e);
    }
  },
  _loadVideosReqId: 0,
  loadVideos: async function(libraryId: string, page?: number, tagIds?: string | string[], formatFilter?: string, novelFilter?: string) {
    const reqId = ++_reqId;
    try {
      const s = get();
      const pg = Math.max(1, page ?? s.videoPage);
      const tagIdStr = tagIds ? (Array.isArray(tagIds) ? tagIds.join(",") : tagIds) : "";
      const formatStr = formatFilter ? (Array.isArray(formatFilter) ? formatFilter.join(",") : formatFilter) : "";
      const total = await invoke<number>("get_video_count", {
        libraryId,
        search: s.videoSearch, searchScope: s.videoSearchScope,
        tagId: tagIdStr, formatFilter: formatStr,
        novelFilter: s.novelFilter ?? "",
      });
      if (reqId !== _reqId) return; // 竞态：更新的请求已发出，丢弃此结果
      const maxPage = Math.max(1, Math.ceil(total / s.videoPageSize));
      const safePage = Math.min(pg, maxPage);
      const novelStr = novelFilter ?? s.novelFilter ?? "";
      const videos = await invoke<Video[]>("get_videos", {
        libraryId, page: safePage, pageSize: s.videoPageSize,
        sortBy: s.videoSortBy || "filename",
        sortDir: s.videoSortDir || "asc",
        search: s.videoSearch, searchScope: s.videoSearchScope,
        sortBy2: s.videoSortBy2 || "",
        sortDir2: s.videoSortDir2 || "desc",
        tagId: tagIdStr, formatFilter: formatStr,
        novelFilter: novelStr,
      });
      if (reqId !== _reqId) return; // 竞态：更新的请求已发出，丢弃此结果
      set((s) => ({ videos, totalVideos: total, videoPage: safePage, libraryVideoPage: { ...s.libraryVideoPage, [libraryId]: safePage } }));
    } catch (e) {
      console.warn("loadVideos failed:", e);
      notify({ type: "error", title: "视频列表加载失败", message: String(e) });
    }
  },
  loadAllVideosCount: async function() {
    try {
      const count = await invoke<number>("get_all_videos_count");
      const size = await invoke<number>("get_total_storage");
      set({ allVideosCount: count, totalStorage: size });
    } catch (e) {
      console.warn("loadAllVideosCount failed:", e);
    }
  },
  loadTags: async function(libraryId) {
    try {
      const classes = await invoke<TagClass[]>("get_tag_classes_by_library", { libraryId });
      set({ tagClasses: classes });
    } catch (e) {
      console.warn("loadTags (deprecated) failed:", e);
    }
  },
  loadTagClasses: async function(libraryId) {
    try {
      const [classes, tags] = await Promise.all([
        invoke<TagClass[]>("get_tag_classes_by_library", { libraryId }),
        invoke<TagName[]>("get_all_class_tags", { libraryId })
      ]);
      set({ tagClasses: classes, classTags: tags });
    } catch (e) {
      console.warn("loadTagClasses failed:", e);
    }
  },
  loadClassTags: async function(classId) {
    try {
      const tags = await invoke<TagName[]>("get_class_tags", { classId });
      set({ classTags: tags });
    } catch (e) {
      console.warn("loadClassTags failed:", e);
    }
  },
  loadPresets: async function() {
    try {
      const presets = await invoke<EncodingPreset[]>("get_presets");
      set({ presets });
    } catch (e) {
      console.warn("loadPresets failed:", e);
    }
  },
  createPreset: async function(name, encoder_type, width, height, fps) {
    try {
      const result = await invoke<EncodingPreset>("create_preset", { name, encoder_type, width, height, fps });
      await get().loadPresets();
      notify({ type: "success", title: "预设已创建", message: name });
      return result.id;
    } catch (e) {
      notify({ type: "error", title: "创建失败", message: String(e) });
      return null;
    }
  },
  deletePreset: async function(id) {
    try {
      await invoke("delete_preset", { id });
      set({ presets: get().presets.filter(p => p.id !== id) });
      notify({ type: "success", title: "预设已删除" });
    } catch {
      notify({ type: "error", title: "删除失败" });
    }
  },
  updatePreset: async function(preset) {
    try {
      await invoke("update_preset", { preset });
      await get().loadPresets();
      notify({ type: "success", title: "预设已保存", message: preset.name });
    } catch {
      notify({ type: "error", title: "保存失败", message: preset.name });
    }
  },
  setDefaultPreset: async function(id) {
    try {
      await invoke("set_default_preset", { id });
      await get().loadPresets();
      notify({ type: "success", title: "默认预设已更新" });
    } catch {
      notify({ type: "error", title: "设置失败" });
    }
  },

  setCurrentCategory: (id) => set({ currentCategoryId: id }),
  setCurrentLibrary: (id) => set({ currentLibraryId: id }),
  setCurrentVideo: (video) => set({ currentVideo: video }),
  openVideoDetail: (video) => {
    const s = get();
    if (s.activeTabId) {
      const prevTab = s.tabs.find((t) => t.id === s.activeTabId);
      if (prevTab) {
        const state = s.tabStates[s.activeTabId] || { scrollPos: 0, filters: {}, viewMode: "card", page: 1 };
        set({ tabStates: { ...s.tabStates, [s.activeTabId]: state } });
      }
      // Push sub-page for navigation history
      const videoTabId = `detail-${video.id}`;
      s.pushSubPage(s.activeTabId, { pageId: "detail", tabId: videoTabId, label: video.filename });
    }
    const videoTabId = `detail-${video.id}`;
    const tabState: TabState = { scrollPos: 0, filters: {}, viewMode: "card", page: 1, pageCurrentVideo: video };
    const existingIndex = s.tabs.findIndex((t) => t.id === videoTabId);
    if (existingIndex >= 0) {
      set({ activeTabId: videoTabId, currentPage: "detail", currentVideo: video, currentModuleId: "video",
        tabStates: { ...s.tabStates, [videoTabId]: tabState } });
    } else {
      const newTab = { id: videoTabId, label: video.filename, pageId: "detail" };
      set({
        tabs: dedupTabs([...s.tabs, newTab]),
        activeTabId: videoTabId,
        currentPage: "detail",
        currentVideo: video,
        currentModuleId: "video",
        tabStates: { ...s.tabStates, [videoTabId]: tabState },
      });
    }
  },
  openDialog: (id) => set((s) => ({ dialogStack: s.dialogStack.includes(id) ? s.dialogStack : [...s.dialogStack, id] })),
  closeDialog: (id) => set((s) => ({ dialogStack: s.dialogStack.filter((d) => d !== id) })),
  updateTabState: (tabId, state) => set((s) => ({ tabStates: { ...s.tabStates, [tabId]: { ...s.tabStates[tabId], ...state } } })),
  getTabState: (tabId) => get().tabStates[tabId],
  setVideoPage: (page) => set({ videoPage: page }),
  setVideoPageSize: (size) => set({ videoPageSize: size }),
  setVideoSort: (by, dir) => set({ videoSortBy: by, videoSortDir: dir }),
  setVideoSort2: (by, dir) => set({ videoSortBy2: by, videoSortDir2: dir }),
  setVideoSearch: (q) => set({ videoSearch: q }),
  setVideoSearchScope: (scope) => set({ videoSearchScope: scope }),
  setCardInfoFields: (fields) => set({ cardInfoFields: fields }),

  setVideoTagsMap: (map) => set({ videoTagsMap: map }),
  getVideoTaggingsBatch: async (videoIds) => {
    try {
      const result = await invoke<Record<string, Record<string, string>>>("get_video_taggings_batch", { videoIds });
      set({ videoTagsMap: result });
    } catch (e) {
      console.warn("getVideoTaggingsBatch failed:", e);
    }
  },

  minimizeWindow: async () => { try { await invoke("minimize_window"); } catch {} },
  maximizeWindow: async () => { try { await invoke("maximize_window"); } catch {} },
  toggleFullscreen: async () => { try { await invoke("toggle_fullscreen"); } catch {} },
  closeWindow: async () => { try { await invoke("close_window"); } catch {} },
  toggleAlwaysOnTop: async () => {
    try {

      const current = get().isAlwaysOnTop;
      const result = await invoke<boolean>("toggle_always_on_top", { current });
      set({ isAlwaysOnTop: result });
      return result;
    } catch {
      console.warn("toggleAlwaysOnTop failed");
      return false;
    }
  },

  createCategory: async (name, icon) => {
    try {
      const result = await invoke<Category>("create_category", { name });
      set({ categories: [...get().categories, { ...result, icon: icon || result.icon }] });
      notify({ type: "success", title: "分类已创建", message: name });
      return result.id;
    } catch (e) {
      notify({ type: "error", title: "创建失败", message: String(e) });
      return null;
    }
  },
  updateCategoryIcon: async (id, icon) => {
    set({ categories: get().categories.map(c => c.id === id ? { ...c, icon } : c) });
  },
  renameCategory: async (id, name) => {
    try {
      const updated = await invoke<Category>("update_category", { id, name });
      set({ categories: get().categories.map(c => c.id === id ? updated : c) });
      notify({ type: "success", title: "分类已重命名", message: name });
    } catch (e) {
      notify({ type: "error", title: "重命名失败", message: String(e) });
    }
  },
  deleteCategoryAction: async (id, deleteLibraries) => {
    const prev = get().categories;
    set({ categories: prev.filter(c => c.id !== id) });
    try {
      await invoke("delete_category", { id, deleteLibraries });
      if (deleteLibraries) set({ coverCacheVersion: get().coverCacheVersion + 1 });
      notify({ type: "success", title: "分类已删除" });
    } catch (e) {
      set({ categories: prev });
      notify({ type: "error", title: "删除失败", message: String(e) });
    }
  },
  updateCategoryStatus: async (id, status) => {
    try {
      const updated = await invoke<Category>("update_category_status", { id, status });
      set({ categories: get().categories.map(c => c.id === id ? updated : c) });
    } catch (e) {
      notify({ type: "error", title: "更新状态失败", message: String(e) });
    }
  },
  updateCategorySort: async (id, sortOrder) => {
    try {
      await invoke("update_category_sort", { id, sortOrder });
      set({
        categories: get().categories
          .map(c => c.id === id ? { ...c, sort_order: sortOrder } : c)
          .sort((a, b) => a.sort_order - b.sort_order)
      });
    } catch (e) {
      notify({ type: "error", title: "更新排序失败", message: String(e) });
    }
  },
  updateLibrarySort: async (id, sortOrder) => {
    try {
      await invoke("update_library_sort", { id, sortOrder });
      // 同步更新 libraries 中对应库的 sort_order 并重排
      set((s) => {
        const libs = { ...s.libraries };
        for (const catId of Object.keys(libs)) {
          libs[catId] = [...libs[catId]]
            .map((l: any) => l.id === id ? { ...l, sort_order: sortOrder } : l)
            .sort((a: any, b: any) => a.sort_order - b.sort_order);
        }
        return { libraries: libs };
      });
    } catch (e) {
      notify({ type: "error", title: "更新库排序失败", message: String(e) });
    }
  },
  createLibrary: async (categoryId, name, icon) => {
    try {
      const result = await invoke<VideoLibrary>("create_library", { categoryId, name, icon: icon || "" });
      if (!result) throw new Error("后端返回了空结果");
      // 后端现在正确存储 icon，从后端重新拉取确保数据一致
      await get().loadLibraries(categoryId);
      notify({ type: "success", title: "媒体库已创建", message: name });
      return result.id;
    } catch (e) {
      notify({ type: "error", title: "创建失败", message: String(e) });
      return null;
    }
  },
  renameLibrary: async (id, name, categoryId) => {
    try {
      const s = get();
      const lib = s.libraries[categoryId]?.find(l => l.id === id);
      if (!lib) { notify({ type: "error", title: "重命名失败", message: "未找到媒体库" }); return; }
      // 必须传 icon 避免 update_library 覆盖 icon 字段为空
      await invoke("update_library", { id, name, icon: lib.icon, status: undefined });
      // 本地即时更新名称，无需等待后端返回（update_library 返回 ()，不可作为新对象使用）
      set({ libraries: { ...s.libraries, [categoryId]: s.libraries[categoryId].map(l => l.id === id ? { ...l, name } : l) } });
      notify({ type: "success", title: "媒体库已重命名", message: name });
    } catch (e) {
      notify({ type: "error", title: "重命名失败", message: String(e) });
    }
  },
  deleteLibraryAction: async (id, categoryId) => {
    const prev = get().libraries[categoryId];
    set({ libraries: { ...get().libraries, [categoryId]: prev.filter(l => l.id !== id) } });
    try {
      await invoke("delete_library", { id });
      set({ coverCacheVersion: get().coverCacheVersion + 1 });
      notify({ type: "success", title: "媒体库已删除" });
    } catch (e) {
      set({ libraries: { ...get().libraries, [categoryId]: prev } });
      notify({ type: "error", title: "删除失败", message: String(e) });
    }
  },
  updateLibraryIcon: async (id, icon) => {
    const s = get();
    for (const catId of Object.keys(s.libraries)) {
      const arr = s.libraries[catId];
      if (arr?.some(l => l.id === id)) {
        set({ libraries: { ...s.libraries, [catId]: arr.map(l => l.id === id ? { ...l, icon } : l) } });
        break;
      }
    }
  },

  createTagClass: async (libraryId, name, parentId, color, icon) => {
    try {
      const cls = await invoke<TagClass>("create_tag_class", { libraryId, name, parentId: parentId || null, color: color || "#059669", icon: icon || "" });
      set({ tagClasses: [...get().tagClasses, cls] });
      notify({ type: "success", title: "标签类已创建", message: name });
    } catch (e) {
      notify({ type: "error", title: "创建失败", message: String(e) });
    }
  },
  updateTagClass: async (cls) => {
    try {
      const updated = await invoke<TagClass>("update_tag_class", { cls });
      set({ tagClasses: get().tagClasses.map(c => c.id === cls.id ? updated : c) });
    } catch (e) {
      notify({ type: "error", title: "更新失败", message: String(e) });
    }
  },
  deleteTagClass: async (id, libraryId) => {
    try {
      await invoke("delete_tag_class", { id, libraryId });
      set({ tagClasses: get().tagClasses.filter(c => c.id !== id) });
    } catch (e) {
      notify({ type: "error", title: "删除失败", message: String(e) });
    }
  },
  moveTagClass: async (id, newParentId) => {
    try {
      const moved = await invoke<TagClass>("move_tag_class", { id, new_parent_id: newParentId || "" });
      set({ tagClasses: get().tagClasses.map(c => c.id === id ? moved : c) });
    } catch (e) {
      notify({ type: "error", title: "移动失败", message: String(e) });
    }
  },
  copyTagClass: async (id, newParentId) => {
    try {
      const copied = await invoke<TagClass>("copy_tag_class", { id, new_parent_id: newParentId || "" });
      set({ tagClasses: [...get().tagClasses, copied] });
      return copied;
    } catch (e) {
      notify({ type: "error", title: "复制失败", message: String(e) });
      return null;
    }
  },

  createClassTag: async (classId, libraryId, name, color) => {
    try {
      const tag = await invoke<TagName>("create_class_tag", { classId, libraryId, name, color: color || "#059669" });
      set({ classTags: [...get().classTags, tag] });
      return tag;
    } catch (e) {
      notify({ type: "error", title: "创建标签失败", message: String(e) });
      return null;
    }
  },
  updateClassTag: async (tag, libraryId) => {
    try {
      await invoke("update_class_tag", { tag });
      set({ classTags: get().classTags.map(t => t.id === tag.id ? { ...tag, updated_at: new Date().toISOString() } : t) });
    } catch (e) {
      notify({ type: "error", title: "更新标签失败", message: String(e) });
    }
  },
  deleteClassTag: async (id, classId, libraryId) => {
    try {
      await invoke("delete_class_tag", { id, classId, libraryId: libraryId || "" });
      set({ classTags: get().classTags.filter(t => t.id !== id) });
    } catch (e) {
      notify({ type: "error", title: "删除标签失败", message: String(e) });
    }
  },
  loadTagClassTree: async (libraryId) => {
    try {
      return await invoke<TagClassTreeNode[]>("get_tag_class_tree", { libraryId });
    } catch (e) {
      console.warn("loadTagClassTree failed:", e);
      return [];
    }
  },
  saveTagTemplate: async (libraryId) => {
    try {
      return await invoke<TagClassTreeNode[]>("save_tag_template", { libraryId });
    } catch (e) {
      notify({ type: "error", title: "保存模板失败", message: String(e) });
      return [];
    }
  },
  loadTagTemplate: async (libraryId, template) => {
    try {
      await invoke("load_tag_template", { libraryId, template });
      await get().loadTagClasses(libraryId);
      notify({ type: "success", title: "模板已导入" });
    } catch (e) {
      notify({ type: "error", title: "导入失败", message: String(e) });
    }
  },
  cleanupUnusedTags: async (libraryId) => {
    try {
      const count = await invoke<number>("cleanup_unused_tags", { libraryId });
      return count;
    } catch (e) {
      notify({ type: "error", title: "清理失败", message: String(e) });
      return 0;
    }
  },

  startScan: async (libraryId) => {
    try {
      // 清理上次扫描残留状态
      set({ scanningLibraryId: null, scanProgress: null });
      get().unlistenScanEvents();
      try { await invoke("cancel_scan", { libraryId }); } catch {}
      // 重新建立事件监听
      set({ scanningLibraryId: libraryId, scanProgress: null });
      await get().listenScanEvents();
      await invoke("start_scan", { libraryId });
    } catch (e) {
      const msg = typeof e === "object" && e !== null
        ? JSON.stringify(e, Object.getOwnPropertyNames(e))
        : String(e);
      console.error("[startScan] 扫描启动失败:", e);
      set({ scanningLibraryId: null, scanProgress: null });
      get().unlistenScanEvents();
      notify({ type: "error", title: "扫描启动失败", message: msg, duration: 8000 });
    }
  },
  getScanProgress: async () => {
    const s = get();
    const libId = s.scanningLibraryId;
    if (!libId) return;
    try {
      const progress = await invoke<ScanProgress | null>("get_scan_progress", { libraryId: libId });
      if (progress) set({ scanProgress: progress });
    } catch {}
  },
  cancelScan: async () => {
    const s = get();
    const libId = s.scanningLibraryId || s.currentLibraryId;
    if (!libId) return;
    try {
      await invoke("cancel_scan", { libraryId: libId });
      set({ scanningLibraryId: null, scanProgress: null });
    } catch {}
  },
  listenScanEvents: async () => {
    if (!isTauri()) return;
    get().unlistenScanEvents();
    try {
      let lastProgressTime = 0;
      const unsubProgress = await listen<ScanProgress>("scanProgressUpdate", (event) => {
        const p = event.payload;
        // 扫描出错事件
        if (p.status === "error") {
          const errMsg = p.errors?.join("; ") || "未知扫描错误";
          console.error("[scanProgressUpdate] 扫描出错:", errMsg);
          notify({ type: "error", title: "扫描出错", message: errMsg, duration: 8000 });
        }
        // 进度更新事件节流：至少间隔 100ms 才 set，避免频繁触发 React 重渲染
        const now = Date.now();
        if (p.percentage === 99.9 || p.status === "completed" || p.status === "error" || now - lastProgressTime > 100) {
          lastProgressTime = now;
          set({ scanProgress: p });
        }
      });
      // 扫描视频缓冲：每1000ms或收集50个后批量更新，减少React重渲染频率
      let videoBuffer: Video[] = [];
      let videoFlushTimer: ReturnType<typeof setTimeout> | null = null;
      const flushVideoBuffer = () => {
        if (videoBuffer.length === 0) return;
        const s = get();
        if (videoBuffer.some(v => v.library_id === s.currentLibraryId)) {
          // 增量更新：只追加新视频，不重建全量数组（避免触发全量重渲染）
          set((state) => {
            if (videoBuffer.some(v => v.library_id === state.currentLibraryId)) {
              return { videos: [...videoBuffer, ...state.videos] };
            }
            return {};
          });
        }
        videoBuffer = [];
        videoFlushTimer = null;
      };
      const unsubVideo = await listen<ScannedVideoPayload>("scanVideoAdded", (event) => {
        const payload = event.payload;
        const s = get();
        if (payload.library_id !== s.currentLibraryId) return;
        // 构造完整的 Video 对象（ScannedVideoPayload 缺少部分字段）
        const video: Video = {
          ...payload,
          note: "",
          favorite: false,
          status: "normal",
          series: "",
          category: "",
          deleted: false,
          novel_order: "",
          intro_content: "",
          resolution: `${payload.width}x${payload.height}`,
          uuid: payload.id,
          content_hash: "",
          created_at: payload.added_at,
          updated_at: payload.added_at,
        };
        videoBuffer.push(video);
        if (videoBuffer.length >= 50) {
          flushVideoBuffer();
        } else if (!videoFlushTimer) {
          videoFlushTimer = setTimeout(flushVideoBuffer, 1000);
        }
      });
      // 扫描日志缓冲：收集日志条目，每500ms或收到20条后批量写入，避免每次set触发React重渲染
      let logBuffer: LogEntry[] = [];
      let logFlushTimer: ReturnType<typeof setTimeout> | null = null;
      const flushLogBuffer = () => {
        if (logBuffer.length === 0) return;
        const batch = logBuffer;
        logBuffer = [];
        logFlushTimer = null;
        // 合并批次中连续的相同日志（同 level + 同 message）
        const merged: LogEntry[] = [];
        for (const entry of batch) {
          const last = merged[merged.length - 1];
          if (last && last.level === entry.level && last.message === entry.message) {
            last.count += entry.count;
          } else {
            merged.push({ ...entry });
          }
        }
        const s = get();
        // 与 store 中已有的 appLogs 合并（用上一批的最后一条做去重桥接）
        const storePrev = s.appLogs[0];
        if (merged.length > 0 && storePrev && storePrev.level === merged[0].level && storePrev.message === merged[0].message) {
          merged[0] = { ...storePrev, count: storePrev.count + merged[0].count };
          set({ appLogs: [...merged, ...s.appLogs.slice(1)].slice(0, 500) });
        } else {
          set({ appLogs: [...merged, ...s.appLogs].slice(0, 500) });
        }
      };
      const unsubLog = await listen<ScanLogEntry>("scanLogEntry", (event) => {
        const entry: LogEntry = {
          id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          level: convertScanLogLevel(event.payload.level),
          message: `[扫描] ${event.payload.message}`,
          source: "scanner",
          timestamp: event.payload.timestamp,
          count: 1,
        };
        logBuffer.push(entry);
        if (logBuffer.length >= 20) {
          flushLogBuffer();
        } else if (!logFlushTimer) {
          logFlushTimer = setTimeout(flushLogBuffer, 500);
        }
      });
      const unsubDone = await listen("scanDone", () => {
        const s = get();
        const libId = s.scanningLibraryId;
        // 直接在 scanDone 中触发刷新，不依赖前端 useEffect 的时序（避免竞态）
        if (libId) {
          const curLib = libId;
          const pg = s.libraryVideoPage[curLib] || 1;
          // 先把仍在缓冲中的 scanVideoAdded 增量刷入 store，避免随后取消监听时丢失最后的增量
          if (videoFlushTimer) clearTimeout(videoFlushTimer);
          flushVideoBuffer();
          // 先重新拉取完整库数据，待其完成后再取消监听（否则 unlisten 的 flush 可能被后到的 loadVideos 覆盖）
          s.loadVideos(curLib, pg)
            .then(() => { set({ coverCacheVersion: get().coverCacheVersion + 1 }); })
            .catch((e) => { console.error("[scanDone] loadVideos 失败:", e); })
            .finally(() => {
              s.unlistenScanEvents();
              set({ scanningLibraryId: null, scanProgress: null });
            });
          s.loadAllVideosCount();
        } else {
          s.unlistenScanEvents();
          set({ scanningLibraryId: null, scanProgress: null });
        }
      });
      set({ scanUnlisten: () => {
        // 停止监听前刷新所有缓冲，确保最后一批不丢失
        if (videoFlushTimer) clearTimeout(videoFlushTimer);
        flushVideoBuffer();
        if (logFlushTimer) clearTimeout(logFlushTimer);
        flushLogBuffer();
        unsubProgress(); unsubVideo(); unsubLog(); unsubDone();
      } });
    } catch (e) {
      const msg = typeof e === "object" && e !== null
        ? JSON.stringify(e, Object.getOwnPropertyNames(e))
        : String(e);
      console.error("[listenScanEvents] 建立事件监听失败:", e);
      notify({ type: "error", title: "事件监听失败", message: msg, duration: 6000 });
    }
  },
  unlistenScanEvents: () => {
    if (get().scanUnlisten) { get().scanUnlisten!(); set({ scanUnlisten: null }); }
  },

  // 智能文本扫描
  scanVideoTextFiles: async (videoId) => {
    try {
      return await invoke<VideoTextScanResult>("scan_video_text_files", { videoId });
    } catch (e) {
      console.warn("scanVideoTextFiles failed:", e);
      return null;
    }
  },
  // 扫描历史
  loadScanHistory: async (libraryId: string) => {
    try {
      const history = await invoke<ScanHistory[]>("get_scan_history", { libraryId });
      set({ scanHistory: history });
    } catch (e) {
      console.warn("loadScanHistory failed:", e);
    }
  },
  batchScanTextStatus: async (videoIds) => {
    try {
      return await invoke<Record<string, TextFileSummary>>("batch_scan_text_status", { videoIds });
    } catch (e) {
      console.warn("batchScanTextStatus failed:", e);
      return {};
    }
  },

  getSettings: async () => {
    try {
      const settings = await invoke<AppSettings>("get_settings");
      set({
        settings,
        videoSortBy: settings.default_sort_by || "filename",
        videoSortDir: "asc",
      });
    } catch (e) {
      console.warn("getSettings failed:", e);
    }
  },
  updateSettings: async (settings) => {
    try {
      await invoke("update_settings", { settings });
      set({ settings });
      notify({ type: "success", title: "设置已保存" });
    } catch (e) {
      notify({ type: "error", title: "保存失败", message: String(e) });
    }
  },
  updateSetting: async (key, value) => {
    try {
      await invoke("update_setting", { key, value });
      set({ settings: { ...get().settings!, [key]: value } });
    } catch (e) {
      console.warn("updateSetting failed:", e);
    }
  },
  resetSettings: async () => {
    try {
      await invoke("reset_settings");
      await get().getSettings();
      notify({ type: "success", title: "设置已重置" });
    } catch (e) {
      notify({ type: "error", title: "重置失败", message: String(e) });
    }
  },

  batchTagVideos: async (videoIds, tagIds, tagValues) => {
    try {
      await invoke("batch_tag_videos", { videoIds, tagIds, tagValues });
      notify({ type: "success", title: "标签已应用" });
    } catch (e) {
      notify({ type: "error", title: "应用标签失败", message: String(e) });
    }
  },

  /** 获取某个标签下所有视频已填写的不同值（用于 TagValueInput 下拉提示） */
  getTagDistinctValues: async (tagId: string) => {
    try {
      return await invoke("get_tag_distinct_values", { tagId }) as [string, number][];
    } catch {
      return [];
    }
  },

  batchRemoveTags: async (videoIds, tagIds) => {
    try {
      await invoke("batch_remove_tags", { videoIds, tagIds });
      notify({ type: "success", title: "标签已移除" });
    } catch (e) {
      notify({ type: "error", title: "移除标签失败", message: String(e) });
    }
  },
  searchClassTags: async (query, libraryId) => {
    try {
      return await invoke<TagName[]>("search_class_tags", { query, libraryId });
    } catch (e) {
      console.warn("searchClassTags failed:", e);
      return [];
    }
  },

  findDuplicates: async (libraryId, mode) => {
    try {
      await invoke("find_duplicates", { libraryId, mode });
      const groups = await invoke<DuplicateGroup[]>("get_duplicate_groups");
      set({ duplicateGroups: groups });
    } catch (e) {
      notify({ type: "error", title: "查重失败", message: String(e) });
    }
  },
  getDuplicateGroups: async () => {
    try {
      const groups = await invoke<DuplicateGroup[]>("get_duplicate_groups");
      set({ duplicateGroups: groups });
    } catch {}
  },
  resolveDuplicate: async (groupId, keepVideoId) => {
    try {
      await invoke("resolve_duplicate", { groupId, keepVideoId });
      set({ duplicateGroups: get().duplicateGroups.filter(g => g.group_id !== groupId) });
      notify({ type: "success", title: "重复已处理" });
    } catch (e) {
      notify({ type: "error", title: "处理失败", message: String(e) });
    }
  },

  deleteVideo: async (videoId) => {
    try {
      await invoke("delete_video", { videoId });
      set({ videos: get().videos.filter(v => v.id !== videoId) });
    } catch (e) {
      notify({ type: "error", title: "删除失败", message: String(e) });
    }
  },
  batchUpdateVideos: async (videoIds, note, favorite, status) => {
    try {
      await invoke("batch_update_videos", { videoIds, note: note || "", favorite: !!favorite, status: status || "", series: "", category: "" });
      notify({ type: "success", title: "批量更新完成" });
    } catch (e) {
      notify({ type: "error", title: "批量更新失败", message: String(e) });
    }
  },
  getVideoDetail: async (videoId) => {
    try {
      return await invoke<VideoDetail>("get_video_detail", { videoId });
    } catch (e) {
      console.warn("getVideoDetail failed:", e);
      return null;
    }
  },
  updateVideo: async (id, note, favorite, series, category) => {
    try {
      await invoke("update_video", { videoId: id, note, favorite, series: series || "", category: category || "" });
    } catch (e) {
      notify({ type: "error", title: "更新失败", message: String(e) });
    }
  },
  reorderCovers: async (videoId, coverPaths) => {
    try {
      await invoke("reorder_covers", { videoId, coverPaths });
    } catch (e) {
      console.warn("reorderCovers failed:", e);
    }
  },
  batchRename: async (renames, libraryId) => {
    try {
      await invoke("batch_rename", { renames, libraryId });
      notify({ type: "success", title: "批量重命名完成" });
    } catch (e) {
      notify({ type: "error", title: "批量重命名失败", message: String(e) });
    }
  },
  notifyCoverRefresh: (videoId) => set((s) => ({ coverRefreshVersion: { ...s.coverRefreshVersion, [videoId]: (s.coverRefreshVersion[videoId] || 0) + 1 } })),
  notifyNovelLinkRefresh: (videoId) => set((s) => ({ novelLinkRefreshVersion: { ...s.novelLinkRefreshVersion, [videoId]: (s.novelLinkRefreshVersion[videoId] || 0) + 1 } })),
  clearAppLogs: () => set({ appLogs: [] }),

  exportLibrary: async (libraryId, outputPath) => {
    try {
      const result = await invoke<string>("export_library", { libraryId, outputPath });
      notify({ type: "success", title: "导出完成" });
      return result;
    } catch (e) {
      notify({ type: "error", title: "导出失败", message: String(e) });
      return "";
    }
  },
  importLibrary: async (filePath, categoryId) => {
    try {
      const result = await invoke<string>("import_library", { filePath, categoryId: categoryId || "" });
      notify({ type: "success", title: "导入完成" });
      return result;
    } catch (e) {
      notify({ type: "error", title: "导入失败", message: String(e) });
      return "";
    }
  },
  backupData: async () => {
    try {
      await invoke("backup_data");
      notify({ type: "success", title: "备份完成" });
    } catch (e) {
      notify({ type: "error", title: "备份失败", message: String(e) });
    }
  },
  restoreData: async (backupPath) => {
    try {
      await invoke("restore_data", { filePath: backupPath });
      notify({ type: "success", title: "恢复完成" });
    } catch (e) {
      notify({ type: "error", title: "恢复失败", message: String(e) });
    }
  },

  navigateTo: (pageId, label, tabId?: string) => {
    const s = get();
    // video-home 不创建标签，直接切换页面
    if (pageId === "video-home") {
      if (s.activeTabId) {
        const prevTab = s.tabs.find((t) => t.id === s.activeTabId);
        if (prevTab) {
          const state = s.tabStates[s.activeTabId] || { scrollPos: 0, filters: {}, viewMode: "card", page: 1 };
          if (prevTab.pageId === "detail" || s.activeTabId.startsWith("detail-")) {
            state.pageCurrentVideo = s.currentVideo || state.pageCurrentVideo;
          }
          set({ tabStates: { ...s.tabStates, [s.activeTabId]: state } });
        }
      }
      set({ activeTabId: null, currentPage: "video-home", currentVideo: null });
      return;
    }
    if (s.activeTabId) {
      const prevTab = s.tabs.find((t) => t.id === s.activeTabId);
      if (prevTab) {
        const state = s.tabStates[s.activeTabId] || { scrollPos: 0, filters: {}, viewMode: "card", page: 1 };
        // 记录当前视频引用（跨库 tab 切换后恢复用）
        if (prevTab.pageId === "detail" || s.activeTabId.startsWith("detail-")) {
          state.pageCurrentVideo = s.currentVideo || state.pageCurrentVideo;
        }
        set({ tabStates: { ...s.tabStates, [s.activeTabId]: state } });
      }
    }
    // 使用 tabId 查找已有标签，兼容 tab.id !== pageId 的情况（视频详情标签）
    const id = tabId || pageId;
    const existingTab = s.tabs.find((t) => t.id === id);
    if (existingTab) {
      // 已有同名标签，直接激活；同时恢复 library context
      const extra: Record<string, any> = {};
      if (pageId.startsWith("library-")) {
        const libId = pageId.slice("library-".length);
        if (libId) extra.currentLibraryId = libId;
      }
      if (pageId === "detail") {
        extra.currentModuleId = "video";
        if (id.startsWith("detail-")) {
          const videoId = id.slice("detail-".length);
          // 先从当前库视频列表查找，找不到则从 tabStates 恢复（跨库 tab 切换时）
          const v = s.videos.find(v => v.id === videoId) || s.tabStates[id]?.pageCurrentVideo;
          if (v) extra.currentVideo = v;
        }
      } else if (pageId.startsWith("library-") || pageId === "video-home") {
        // 切换到非详情页时清空 currentVideo，防止残留
        extra.currentVideo = null;
      }
      set({ activeTabId: id, currentPage: pageId, ...extra });
    } else {
      const extra: Record<string, any> = {};
      if (pageId.startsWith("library-")) {
        const libId = pageId.slice("library-".length);
        if (libId) extra.currentLibraryId = libId;
      }
      if (pageId.startsWith("library-") || pageId === "video-home") {
        extra.currentVideo = null;
      }
      const newTab = { id, label: label || pageId, pageId };
      set({ tabs: dedupTabs([...s.tabs, newTab]), activeTabId: id, currentPage: pageId, ...extra });
    }
  },
  navigateToModule: (moduleId, navItemId) => {
    const config = moduleConfigs.find((m) => m.id === moduleId);
    if (!config) return;
    const target = navItemId
      ? config.navItems.find((n) => n.id === navItemId)
      : config.navItems[0];
    if (!target) return;
    set({ currentModuleId: moduleId, currentPage: target.pageId });
  },
  closeTab: (tabId) => {
    const s = get();
    const remaining = s.tabs.filter((t) => t.id !== tabId);
    const newActive = s.activeTabId === tabId ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null) : s.activeTabId;
    const newPage = newActive ? (s.tabs.find(t => t.id === newActive)?.pageId || "video-home") : "video-home";
    const newModule = newActive ? (moduleConfigs.find(m => m.navItems.some(n => n.pageId === newPage))?.id || "video") : "video";
    // 恢复目标 tab 的 state
    const extra: Record<string, any> = {};
    if (newPage.startsWith("library-")) {
      const libId = newPage.slice("library-".length);
      if (libId) extra.currentLibraryId = libId;
    } else if (newPage === "detail" && newActive) {
      const tabState = s.tabStates[newActive];
      if (tabState?.pageCurrentVideo) extra.currentVideo = tabState.pageCurrentVideo;
      extra.currentLibraryId = null;
    } else if (newPage === "video-home") {
      extra.currentLibraryId = null;
      extra.currentVideo = null;
    }
    set({
      tabs: remaining, activeTabId: newActive, currentPage: newPage, currentModuleId: newModule,
      tabStates: Object.fromEntries(Object.entries(s.tabStates).filter(([k]) => k !== tabId)),
      tabRoutes: Object.fromEntries(Object.entries(s.tabRoutes).filter(([k]) => k !== tabId)),
      ...extra,
    });
  },
  pushSubPage: (tabId, subPage) => set((s) => ({ tabRoutes: { ...s.tabRoutes, [tabId]: [...(s.tabRoutes[tabId] || []), subPage] } })),
  popSubPage: (tabId) => {
    const routes = get().tabRoutes[tabId];
    if (!routes || routes.length === 0) return undefined;
    const popped = routes[routes.length - 1];
    set((s) => ({ tabRoutes: { ...s.tabRoutes, [tabId]: routes.slice(0, -1) } }));
    return popped;
  },
  canGoBack: (tabId) => {
    const routes = get().tabRoutes[tabId];
    return routes ? routes.length > 0 : false;
  },
  loadClassifyState: () => {
    try {
      const raw = localStorage.getItem("libraryClassifyState");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed !== null) {
          set({ libraryClassifyState: parsed });
        }
      }
    } catch (e) {
      console.warn("loadClassifyState failed:", e);
    }
  },
}));
