import { useEffect, useRef } from "react";
import { useAppStore } from "./store/appStore";
import { listen } from "./tauri-event";
import Layout from "./components/Layout";
import { injectTruncateCSS } from "./utils/textTruncate";

// ── 全局未捕获错误/拒绝兜底 ──
function setupGlobalErrorHandlers() {
  if (typeof window === "undefined") return;

  // 防止已添加多次
  if ((window as any).__errorHandlerInstalled) return;
  (window as any).__errorHandlerInstalled = true;

  window.addEventListener("error", (event) => {
    console.error("[GlobalError]", event.error || event.message);
    // 阻止默认行为（页面白屏）
    event.preventDefault();
  });

  window.addEventListener("unhandledrejection", (event) => {
    console.warn("[UnhandledRejection]", event.reason);
    event.preventDefault();
  });
}

function App() {
  const getSettings = useAppStore(s => s.getSettings);
  const settings = useAppStore(s => s.settings);
  const currentLibraryId = useAppStore(s => s.currentLibraryId);
  const loadClassifyState = useAppStore(s => s.loadClassifyState);

  useEffect(() => {
    setupGlobalErrorHandlers();
    injectTruncateCSS();
  }, []);

  // 启动时加载设置（确保主题等设置自动生效）
  useEffect(() => {
    if (!settings) getSettings();
  }, []);

  // 启动时恢复归类状态（localStorage 跨重启持久化）
  useEffect(() => { loadClassifyState(); }, []);

  // ── Ctrl + 滚轮缩放（按库持久化） ──
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      const target = document.getElementById("card-view-container");
      if (!target) return;
      e.preventDefault();
      const s = useAppStore.getState();
      const libId = s.currentLibraryId;
      if (!libId) return;
      const current = s.libraryZoomLevel[libId] ?? 1;
      const zoom = Math.max(0.5, Math.min(2, current - e.deltaY * 0.001));
      target.style.zoom = String(zoom);
      useAppStore.setState({ libraryZoomLevel: { ...s.libraryZoomLevel, [libId]: zoom } });
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, []);

  // 还原缩放状态（当库切换或组件挂载时）
  useEffect(() => {
    const s = useAppStore.getState();
    const libId = s.currentLibraryId;
    const saved = libId ? s.libraryZoomLevel[libId] : null;
    const target = document.getElementById("card-view-container");
    if (target) {
      target.style.zoom = saved ? String(saved) : "1";
    }
  }, [currentLibraryId]);

  const loadCategories = useAppStore(s => s.loadCategories);
  const loadAllVideosCount = useAppStore(s => s.loadAllVideosCount);
  const loadPresets = useAppStore(s => s.loadPresets);
  const categories = useAppStore(s => s.categories);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanUpdateUnlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    (async () => {
      try { await loadCategories(); } catch (e) { console.warn("loadCategories failed:", e); }
      try { await loadAllVideosCount(); } catch (e) { console.warn("loadAllVideosCount failed:", e); }
      try { await loadPresets(); } catch (e) { console.warn("loadPresets failed:", e); }
    })();

    pollingRef.current = setInterval(() => {
      try { loadAllVideosCount(); } catch (e) { console.warn("polling loadAllVideosCount failed:", e); }
    }, 60000);

    let cancelled = false;
    (async () => {
      try {
        const unlisten = await listen("scanProgressUpdate", (event: any) => {
          if (cancelled) return;
          try {
            const payload = event.payload as any;
            if (payload?.status === "completed") {
              loadAllVideosCount();
            }
          } catch (e) { console.warn("scanProgress handler error:", e); }
        });
        if (!cancelled) {
          scanUpdateUnlistenRef.current = unlisten;
        } else {
          unlisten();
        }
      } catch (e) { console.warn("listen(scanProgressUpdate) failed:", e); }
    })();

    return () => {
      cancelled = true;
      if (scanUpdateUnlistenRef.current) {
        scanUpdateUnlistenRef.current();
        scanUpdateUnlistenRef.current = null;
      }
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;

    const state = useAppStore.getState();
    const currentStillExists = categories.some((cat) => cat.id === state.currentCategoryId);
    const activeCategoryId = currentStillExists ? state.currentCategoryId : categories[0]?.id;
    if (!activeCategoryId) return;

    if (state.currentCategoryId !== activeCategoryId) {
      state.setCurrentCategory(activeCategoryId);
    }

    categories.forEach((cat) => {
      try { state.loadLibraries(cat.id); } catch (e) { console.warn("loadLibraries failed:", cat.id, e); }
    });
  }, [categories]);

  return <Layout />;
}

export default App;
