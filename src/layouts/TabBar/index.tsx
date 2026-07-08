import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useAppStore } from "../../store/appStore";
import { isTauri, invoke } from "../../tauri-invoke";
import { useTheme } from "../../theme/useTheme";

const styleId = "__tabbar_drag_region";
function ensureStyles() {
  if (document.getElementById(styleId)) return;
  const s = document.createElement("style");
  s.id = styleId;
  s.textContent = `
    .tabbar-drag { -webkit-app-region: drag; }
    .tabbar-no-drag { -webkit-app-region: no-drag; }

    /* 标签宽度动画 — 分离于 hover/active 过渡，避免互相干扰 */
    .tt-tab-btn {
      transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                  background 0.15s ease,
                  box-shadow 0.15s ease,
                  color 0.15s ease !important;
    }
    /* 标签容器滚动内容平滑 */
    .tt-tab-scroll {
      transition: gap 0.28s cubic-bezier(0.4, 0, 0.2, 1);
    }
  `;
  document.head.appendChild(s);
}

function useTauriDrag(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ref.current || !isTauri()) return;
    const el = ref.current;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest?.(".tabbar-no-drag")) return;
      invoke("start_dragging").catch(() => {});
    };
    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, [enabled, ref]);
}

function useBrowserDrag(ref: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const el = ref.current;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest?.(".tabbar-no-drag")) return;
      e.preventDefault();
      document.body.style.userSelect = "none";
    };
    const onMouseUp = () => { document.body.style.userSelect = ""; };
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
    };
  }, [enabled, ref]);
}

const BAR_H = 42;
const TAB_H = 28;
const TAB_MIN_W = 40;
const TAB_MAX_W = 140;
const SCROLL_AMOUNT = 180;
const CTRL_W = 30;

/** 根据可用宽度计算标签尺寸 */
function calcTabWidth(availWidth: number, tabCount: number): number {
  if (tabCount === 0) return TAB_MAX_W;
  // 每种标签占用的总宽度 = 标签宽 + 间距(2px) + 内边距影响
  const ideal = Math.floor(availWidth / tabCount) - 4;
  return Math.max(TAB_MIN_W, Math.min(TAB_MAX_W, ideal));
}

/** 判断是否为窄屏模式 */
function isNarrow(availWidth: number): boolean {
  return availWidth < 500;
}

export default function TabBar() {
  const { accent } = useTheme();
  const {
    tabs: rawTabs, activeTabId, navigateTo, closeTab,
    minimizeWindow, maximizeWindow, closeWindow,
    isAlwaysOnTop, toggleAlwaysOnTop,
  } = useAppStore();

  // ── 容器宽度测量 ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 安全去重
  const tabs = useMemo(() => {
    const seen = new Set<string>();
    return rawTabs.filter(t => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return true;
    });
  }, [rawTabs]);

  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [hoveredCloseTabId, setHoveredCloseTabId] = useState<string | null>(null);
  const [hoveredCtrl, setHoveredCtrl] = useState<string | null>(null);
  const [showScrollL, setShowScrollL] = useState(false);
  const [showScrollR, setShowScrollR] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => { ensureStyles(); }, []);
  useTauriDrag(dragRef, isTauri());
  useBrowserDrag(dragRef, !isTauri());

  const syncMaximizedState = useCallback(async () => {
    if (!isTauri()) { setIsMaximized(!!document.fullscreenElement); return; }
    try { const m = await invoke<boolean>("is_maximized"); setIsMaximized(m); } catch {}
  }, []);

  useEffect(() => {
    const handler = () => { void syncMaximizedState(); };
    handler();
    document.addEventListener("fullscreenchange", handler);
    window.addEventListener("resize", handler);
    return () => { document.removeEventListener("fullscreenchange", handler); window.removeEventListener("resize", handler); };
  }, [syncMaximizedState]);

  // ── 溢出检测 ──
  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScrollL(el.scrollLeft > 4);
    setShowScrollR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => { requestAnimationFrame(checkOverflow); }, [tabs, activeTabId, checkOverflow]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkOverflow); ro.disconnect(); };
  }, [checkOverflow]);

  // ── 切换标签时自动滚动到可见位置 ──
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !activeTabId) return;
    const activeTab = el.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`);
    if (activeTab) {
      const cr = el.getBoundingClientRect();
      const tr = activeTab.getBoundingClientRect();
      if (tr.left < cr.left || tr.right > cr.right) {
        activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
  }, [activeTabId, tabs]);

  // ── 键盘切换标签 ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const { tabs: ct, activeTabId: ca, navigateTo: nav } = useAppStore.getState();
      if (ct.length === 0) return;
      const idx = ct.findIndex(t => t.id === ca);
      if (idx < 0) return;
      const next = ct[idx + (e.key === "ArrowLeft" ? -1 : 1)];
      if (next) nav(next.pageId, next.label, next.id);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const scrollBy = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -SCROLL_AMOUNT : SCROLL_AMOUNT, behavior: "smooth" });
  };

  const cHover = (id: string | null) => setHoveredCtrl(id);

  // ── 响应式计算 ──
  const totalTabs = tabs.length;
  const narrow = isNarrow(containerWidth);
  const tabW = calcTabWidth(
    containerWidth - (isTauri() ? 140 : 20) - (showScrollL || showScrollR ? 44 : 0),
    totalTabs,
  );
  const fontSize = narrow ? 9 : 10;
  const showScrollBtns = containerWidth > 350;

  return (
    <div ref={containerRef}
      style={{ width: "100%", height: BAR_H, display: "flex", flexShrink: 0, overflow: "visible" }}>
      <div
        ref={dragRef}
        className="tabbar-drag"
        style={{
          width: "100%", height: BAR_H,
          background: `rgba(18,22,34,0.65)`,
          backdropFilter: "blur(28px) saturate(1.4)",
          WebkitBackdropFilter: "blur(28px) saturate(1.4)",
          display: "flex",
          alignItems: "center",
          padding: "0 3px 0 6px",
          gap: 3,
          borderBottom: `1px solid rgba(255,255,255,0.04)`,
          flexShrink: 0,
          userSelect: "none",
          position: "relative" as const,
        }}
      >
        {/* 顶部高光线 */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
          pointerEvents: "none",
        }} />

        {/* ── 标签区域 ── */}
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 1,
          minWidth: 0, overflow: "hidden",
          height: TAB_H + 4,
          padding: "2px 0",
        }}>
          {/* 左滚动 — 窄屏不显示 */}
          {showScrollL && showScrollBtns && (
            <button className="tabbar-no-drag"
              onClick={() => scrollBy("left")}
              onMouseEnter={() => setHoveredTabId("__scroll_l")}
              onMouseLeave={() => setHoveredTabId(null)}
              style={{
                width: 16, height: TAB_H, border: "none", borderRadius: 4, flexShrink: 0,
                background: hoveredTabId === "__scroll_l" ? "rgba(255,255,255,0.06)" : "transparent",
                color: hoveredTabId === "__scroll_l" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
                fontSize: 9, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.12s",
              }}
            >‹</button>
          )}

          {/* 标签容器 */}
          <div
            ref={scrollRef}
            className="tt-tab-scroll"
            style={{
              flex: 1, display: "flex", alignItems: "center", gap: 2,
              overflowX: "auto", overflowY: "hidden",
              scrollBehavior: "smooth",
              scrollbarWidth: "none",
              msOverflowStyle: "none",
              height: "100%",
            }}
          >
            {tabs.length === 0 ? (
              <span className="tabbar-no-drag" style={{
                fontSize, color: "rgba(255,255,255,0.2)",
                padding: "0 8px", whiteSpace: "nowrap",
                display: "flex", alignItems: "center", gap: 4, height: TAB_H,
              }}>
                <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.15)" }} />
                视频管理 · 首页
              </span>
            ) : (
              tabs.map((tab) => {
                const isActive = activeTabId === tab.id;
                const isHovered = hoveredTabId === tab.id;
                const isCloseHovered = hoveredCloseTabId === tab.id;
                const showClose = isHovered;
                // 窄屏/标签多时用固定小宽度，宽屏/标签少时用计算宽度
                const w = narrow ? Math.max(TAB_MIN_W, Math.min(100, tabW)) : tabW;

                return (
                  <button
                    key={tab.id}
                    data-tab-id={tab.id}
                    className="tabbar-no-drag tt-tab-btn"
                    style={{
                      height: TAB_H, width: w,
                      padding: narrow ? "0 4px" : `0 6px`,
                      borderRadius: 5,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: narrow ? 2 : 3,
                      fontSize,
                      fontWeight: isActive ? 600 : 450,
                      color: isActive ? "#fff" : (isHovered ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)"),
                      cursor: "pointer",
                      border: "none",
                      background: isActive
                        ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))"
                        : (isHovered ? "rgba(255,255,255,0.04)" : "transparent"),
                      boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.12)" : "none",
                      whiteSpace: "nowrap",
                      textAlign: "center",
                      flexShrink: 0,
                      lineHeight: 1,
                      overflow: "hidden",
                    }}
                    onClick={() => navigateTo(tab.pageId, tab.label, tab.id)}
                    onMouseEnter={() => setHoveredTabId(tab.id)}
                    onMouseLeave={() => { setHoveredTabId(null); setHoveredCloseTabId(null); }}
                    title={tab.label}
                  >
                    <span style={{
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      flex: 1, minWidth: 0, textAlign: "center",
                    }}>
                      {tab.label}
                    </span>
                    {!narrow && (
                      <span
                        style={{
                          width: 12, height: 12, flexShrink: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          borderRadius: 3, fontSize: 7, lineHeight: 1,
                          opacity: showClose ? 1 : 0,
                          color: isCloseHovered ? "#fff" : "rgba(255,255,255,0.4)",
                          background: isCloseHovered ? "rgba(255,100,100,0.35)" : "transparent",
                          transition: "all 0.15s",
                        }}
                        onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                        onMouseEnter={() => setHoveredCloseTabId(tab.id)}
                        onMouseLeave={() => setHoveredCloseTabId(null)}
                      >×</span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* 右滚动 — 窄屏不显示 */}
          {showScrollR && showScrollBtns && (
            <button className="tabbar-no-drag"
              onClick={() => scrollBy("right")}
              onMouseEnter={() => setHoveredTabId("__scroll_r")}
              onMouseLeave={() => setHoveredTabId(null)}
              style={{
                width: 16, height: TAB_H, border: "none", borderRadius: 4, flexShrink: 0,
                background: hoveredTabId === "__scroll_r" ? "rgba(255,255,255,0.06)" : "transparent",
                color: hoveredTabId === "__scroll_r" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
                fontSize: 9, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.12s",
              }}
            >›</button>
          )}
        </div>

        {/* ── 窗口控件（Tauri 专用，固定宽度） ── */}
        {isTauri() && (
          <div className="tabbar-no-drag" style={{
            display: "flex", alignItems: "center", gap: 1,
            flexShrink: 0, flexGrow: 0, paddingLeft: 2, height: "100%",
          }}>
            <button className="tabbar-no-drag" onClick={() => minimizeWindow()}
              title="最小化"
              onMouseEnter={() => cHover("minimize")}
              onMouseLeave={() => cHover(null)}
              style={{
                width: CTRL_W, height: CTRL_W, borderRadius: 5,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: hoveredCtrl === "minimize" ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                color: hoveredCtrl === "minimize" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
                fontSize: narrow ? 8 : 10, cursor: "pointer",
                transition: "all 0.12s",
              }}
            >─</button>
            {!narrow && (
              <button className="tabbar-no-drag"
                onClick={async () => { await toggleAlwaysOnTop(); }}
                title={isAlwaysOnTop ? "取消置顶" : "置顶窗口"}
                onMouseEnter={() => cHover("ontop")}
                onMouseLeave={() => cHover(null)}
                style={{
                  width: CTRL_W, height: CTRL_W, borderRadius: 5,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: hoveredCtrl === "ontop" ? "rgba(255,255,255,0.06)" : "transparent",
                  border: "none",
                  color: isAlwaysOnTop ? accent.primary : (hoveredCtrl === "ontop" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)"),
                  fontSize: narrow ? 8 : 9, cursor: "pointer",
                  transition: "all 0.12s",
                }}
              >
                <svg viewBox="0 0 24 24" fill={isAlwaysOnTop ? accent.primary : "none"} stroke="currentColor" strokeWidth="2" style={{ width: narrow ? 10 : 12, height: narrow ? 10 : 12 }}>
                  <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </button>
            )}
            <button className="tabbar-no-drag"
              onClick={async () => { await maximizeWindow(); setTimeout(() => syncMaximizedState(), 100); }}
              title={isMaximized ? "还原" : "最大化"}
              onMouseEnter={() => cHover("maximize")}
              onMouseLeave={() => cHover(null)}
              style={{
                width: CTRL_W, height: CTRL_W, borderRadius: 5,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: hoveredCtrl === "maximize" ? "rgba(255,255,255,0.06)" : "transparent",
                border: "none",
                color: hoveredCtrl === "maximize" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.2)",
                fontSize: narrow ? 8 : 10, cursor: "pointer",
                transition: "all 0.12s",
              }}
            >{isMaximized ? "❐" : "□"}</button>
            <button className="tabbar-no-drag" onClick={() => closeWindow()}
              title="关闭"
              onMouseEnter={() => cHover("close")}
              onMouseLeave={() => cHover(null)}
              style={{
                width: CTRL_W + 2, height: CTRL_W, borderRadius: 5,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: hoveredCtrl === "close" ? "rgba(255,100,100,0.15)" : "transparent",
                border: "none",
                color: hoveredCtrl === "close" ? "#ff6464" : "rgba(255,255,255,0.2)",
                fontSize: narrow ? 8 : 10, cursor: "pointer",
                transition: "all 0.12s",
              }}
            >✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
