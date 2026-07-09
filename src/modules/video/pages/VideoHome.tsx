import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "../../../store/appStore";
import { useTheme } from "../../../theme/useTheme";
import CategoryCard from "../components/CategoryCard";
import { CAT_ICONS, pickIcon, hashId } from "../components/CategoryCard";
import LibraryList from "../components/LibraryList";

const LIB_ICONS_POOL = ["🎬","📁","📂","🗂","📀","💿","🖥","📡","🌆","🎯","🏆","📹","🎥","🎞","🖼","📊","🔧","🎨","🏗","🧩"];

const VH_STYLE_ID = "video-home-style";
function ensureVideoHomeStyle() {
  if (document.getElementById(VH_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = VH_STYLE_ID;
  style.textContent = `
    .vh-cat-wrap { animation: fadeSlideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both; }
    .vh-cat-wrap:nth-child(1) { animation-delay: 0.05s; }
    .vh-cat-wrap:nth-child(2) { animation-delay: 0.10s; }
    .vh-cat-wrap:nth-child(3) { animation-delay: 0.15s; }
    .vh-cat-wrap:nth-child(4) { animation-delay: 0.20s; }
  `;
  document.head.appendChild(style);
}

/** Smooth height-animated collapsible using scrollHeight measurement */
function CollapsibleSection({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(isOpen ? undefined : 0);
  const [animOpen, setAnimOpen] = useState(false);
  const isOpenRef = useRef(isOpen);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const wasOpen = isOpenRef.current;
    isOpenRef.current = isOpen;

    if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null; }

    if (isOpen && !wasOpen) {
      setAnimOpen(false);
      setHeight(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(el.scrollHeight);
          // 动画结束后解除 overflow:hidden，防止底部内容被裁剪
          animTimerRef.current = setTimeout(() => { setAnimOpen(true); }, 380);
        });
      });
    } else if (!isOpen && wasOpen) {
      setAnimOpen(false);
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0);
        });
      });
    }
    return () => { if (animTimerRef.current) clearTimeout(animTimerRef.current); };
  }, [isOpen]);

  return (
    <div
      style={{
        overflow: isOpen && !animOpen ? "hidden" : "visible",
        height: height !== undefined ? height : undefined,
        opacity: isOpen || (height !== undefined && height > 0) ? 1 : 0,
        marginTop: isOpen || (height !== undefined && height > 0) ? 8 : 0,
        transition: "height 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease 0.05s, margin-top 0.3s ease",
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

// 内置默认数据 — 首次使用视频管理时自动创建
const DEFAULT_CATEGORIES = [
  { name: "教程剪辑", icon: "📹" },
  { name: "Vlog 素材", icon: "🎬" },
  { name: "项目参考", icon: "🎯" },
  { name: "待归档", icon: "📦" },
];
const DEFAULT_LIBS: Record<string, { name: string; icon: string }[]> = {
  "教程剪辑": [
    { name: "PR剪辑素材", icon: "🎬" },
    { name: "AE模板教程", icon: "📁" },
    { name: "达芬奇调色案例", icon: "🎥" },
  ],
  "Vlog 素材": [
    { name: "城市漫步系列", icon: "🌆" },
    { name: "美食探店", icon: "🍜" },
  ],
  "项目参考": [
    { name: "参考素材库", icon: "📂" },
  ],
  "待归档": [
    { name: "待整理视频", icon: "🗃" },
  ],
};

const STORAGE_KEY_EXPANDED = "video_home_expanded_cats";
const VIDEO_HOME_INIT_FLAG = "video_home_default_data_created";

function loadExpandedCats(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXPANDED);
    if (raw) { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed; }
  } catch {}
  return [];
}

function saveExpandedCats(ids: string[]) {
  try { localStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify(ids)); } catch {}
}

export default function VideoHome() {
  const { accent, text, border, hover } = useTheme();
  const categories = useAppStore(s => s.categories);
  const libraries = useAppStore(s => s.libraries);
  const loadCategories = useAppStore(s => s.loadCategories);
  const loadLibraries = useAppStore(s => s.loadLibraries);
  const initializedRef = useRef(false);

  const [expandedCatsArr, setExpandedCatsArr] = useState<string[]>(() => loadExpandedCats());
  const expandedCats = useMemo(() => new Set(expandedCatsArr), [expandedCatsArr]);
  const setExpandedCats = useCallback((val: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setExpandedCatsArr(prev => {
      const next = typeof val === "function" ? val(new Set(prev)) : val;
      const arr = [...next];
      saveExpandedCats(arr);
      return arr;
    });
  }, []);

  // 首次加载 — 若无分类则创建默认数据，全部初始折叠
  useEffect(() => {
    const init = async () => {
      if (initializedRef.current) return;
      // 若已初始化过默认数据（持久标志），不再重复创建
      const alreadyInitialized = (() => { try { return localStorage.getItem(VIDEO_HOME_INIT_FLAG) === "true"; } catch { return false; } })();
      if (alreadyInitialized) { initializedRef.current = true; return; }
      if (categories.length === 0) {
        await loadCategories();
        const cats = useAppStore.getState().categories;
        if (cats.length === 0) {
          for (const defCat of DEFAULT_CATEGORIES) {
            const catId = await useAppStore.getState().createCategory(defCat.name);
            if (catId) {
              await useAppStore.getState().updateCategoryIcon(catId, defCat.icon);
              const defaultLibs = DEFAULT_LIBS[defCat.name] || [];
              for (const lib of defaultLibs) {
                const libId = await useAppStore.getState().createLibrary(catId, lib.name);
                if (libId) {
                  await useAppStore.getState().updateLibraryIcon(libId, lib.icon);
                }
              }
            }
          }
          // 持久化标记：默认数据已创建，后续不再重复
          try { localStorage.setItem(VIDEO_HOME_INIT_FLAG, "true"); } catch {}
          await loadCategories();
        }
      }
      initializedRef.current = true;
    };
    init();
  }, []);

  // 加载每个分类下的库
  useEffect(() => {
    categories.forEach((cat) => { if (!libraries[cat.id]) loadLibraries(cat.id); });
  }, [categories]);

  const totalVideoCount = Object.values(libraries).flat().reduce((sum, l: any) => sum + (l?.video_count || 0), 0);
  const totalLibCount = Object.values(libraries).flat().filter(Boolean).length;

  const handleCreateCategory = async () => {
    const id = await useAppStore.getState().createCategory("新分类");
    if (id) setExpandedCats((prev) => new Set(prev).add(id));
  };

  const handleCreateLibrary = async (catId: string) => {
    const randomIcon = LIB_ICONS_POOL[Math.floor(Math.random() * LIB_ICONS_POOL.length)];
    await useAppStore.getState().createLibrary(catId, "新视频库", randomIcon);
    setExpandedCats((prev) => new Set(prev).add(catId));
  };

  const handleLibClick = (lib: any) => {
    const s = useAppStore.getState();
    // Push sub-page to create navigation history
    if (s.activeTabId) {
      s.pushSubPage(s.activeTabId, { pageId: `library-${lib.id}`, label: lib.name });
    }
    s.navigateTo(`library-${lib.id}`, lib.name);
  };

  ensureVideoHomeStyle();

  return (
    <>
      {/* Redesign: 页面顶栏 — page-header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20, flexShrink: 0, position: "relative", zIndex: 1,
      }}>
        <div className="page-title" style={{
          fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em",
          display: "flex", alignItems: "center", gap: 10, color: text.primary,
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: 10,
            background: accent.glow, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>📺</span>
          <span>视频管理</span>
          {totalVideoCount > 0 && (
            <span style={{ fontSize: 12, color: text.muted, fontWeight: 400, marginLeft: 6 }}>
              共 {totalVideoCount} 个视频 · {totalLibCount} 个库
            </span>
          )}
        </div>
        <button className="btn btn-primary" style={{
          padding: "7px 16px", borderRadius: 6,
          background: `linear-gradient(135deg, ${accent.deep}, ${accent.primary})`,
          border: "none", color: "#fff", fontWeight: 600, fontSize: 12,
          cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
          boxShadow: `0 2px 12px ${accent.glow}`,
          transition: "all 0.15s",
        }}
          onClick={handleCreateCategory}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.92"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 4px 20px rgba(96,165,250,0.15)`; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = `0 2px 12px ${accent.glow}`; }}
        >+ 新建分类</button>
      </div>

      {/* 分类 + 库列表 */}
      {categories.length === 0 ? (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 16,
        }}>
          <span style={{ fontSize: 56, opacity: 0.25 }}>📺</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: text.secondary }}>暂无分类</span>
          <span style={{ fontSize: 13, color: text.muted, maxWidth: 320, lineHeight: 1.6, textAlign: "center" }}>
            点击上方按钮创建第一个分类，开始管理你的视频素材
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingBottom: 20 }}>
          {categories.map((cat) => {
            const isExpanded = expandedCats.has(cat.id);
            return (
              <div key={cat.id} className="vh-cat-wrap">
                <CategoryCard
                  cat={cat}
                  isExpanded={isExpanded}
                  onToggle={(id) => setExpandedCats(prev => {
                    const n = new Set(prev);
                    n.has(id) ? n.delete(id) : n.add(id);
                    return n;
                  })}
                  onCreateLibrary={handleCreateLibrary}
                />
                <CollapsibleSection isOpen={isExpanded}>
                  <LibraryList
                    libraries={libraries[cat.id] || []}
                    catId={cat.id}
                    onLibClick={handleLibClick}
                  />
                </CollapsibleSection>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
