import { Component, ErrorInfo, ReactNode, useEffect } from "react";
import { useAppStore } from "../store/appStore";
import { resolveTheme } from "../theme/useTheme";
import Sidebar from "../layouts/Sidebar";
import TabBar from "../layouts/TabBar";
import ContentArea from "../layouts/ContentArea";
import StatusBar from "../layouts/StatusBar";
import NotificationContainer from "./Notification";
import { ConfirmDialog } from "./ConfirmDialog";
import ParticleBackground from "./ParticleBackground";
import { useResourceMetrics } from "../hooks/useResourceMetrics";
import { text, status, accent, border } from "../theme/ethereal";

import VideoHome from "../modules/video/pages/VideoHome";
import LibraryView from "../modules/library/pages/LibraryView";
import VideoDetail from "../modules/video/pages/VideoDetail";
import CompareView from "../modules/video/pages/CompareView";

import SettingsDialog from "../modules/system/dialogs/SettingsDialog";
import LibrarySettings from "../modules/library/dialogs/LibrarySettings";
import TagManager from "../modules/library/dialogs/TagManager";
import MetadataEdit from "../modules/library/dialogs/MetadataEdit";
import DuplicateDetect from "../modules/library/dialogs/DuplicateDetect";
import BatchRename from "../modules/library/dialogs/BatchRename";

class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; label?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.label || "";
    console.error(`[ErrorBoundary${label ? ":"+label : ""}]`, error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, color: text.secondary, fontSize: 12, gap: 10 }}>
          <span style={{ fontSize: 28, opacity: 0.3, color: status.error.color }}>⚠</span>
          <span style={{ color: status.error.color, fontSize: 14, fontWeight: 600 }}>页面渲染异常</span>
          <span style={{ color: text.muted, fontSize: 11, textAlign: "center", maxWidth: 400 }}>{this.state.error?.message}</span>
          <button onClick={() => this.setState({ hasError: false, error: null })} style={{ padding: "6px 16px", background: accent.deep, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, cursor: "pointer", marginTop: 8 }}>
            重试
          </button>
          <button onClick={() => window.location.reload()} style={{ padding: "4px 12px", background: "transparent", color: text.muted, border: `1px solid ${border.default}`, borderRadius: 4, fontSize: 10, cursor: "pointer" }}>
            刷新页面
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageRouter() {
  const { currentPage } = useAppStore();

  const pageContent = (() => {
    if (currentPage.startsWith("library-") || currentPage === "library") {
      return <LibraryView key={currentPage} />;
    }
    switch (currentPage) {
      case "video-home":
        return <VideoHome key="video-home" />;
      case "detail":
        return <VideoDetail key="detail" />;
      case "compare":
        return <CompareView key="compare" />;
      default:
        return <VideoHome key="video-home" />;
    }
  })();

  return <div className="page-fade-in">{pageContent}</div>;
}

function DialogRenderer() {
  const dialogStack = useAppStore(s => s.dialogStack);

  return (
    <ErrorBoundary key="dialogs">
      {dialogStack.includes("settings") && <SettingsDialog />}
      {dialogStack.includes("library-settings") && <LibrarySettings />}
      {dialogStack.includes("tag-manager") && <TagManager />}
      {dialogStack.includes("duplicate") && <DuplicateDetect />}
      {dialogStack.includes("rename") && <BatchRename />}
      {dialogStack.includes("metadata") && <MetadataEdit />}
    </ErrorBoundary>
  );
}

// ── 全局错误兜底 ──
function CriticalFallback() {
  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 10, background: "#070B16", color: "#C8D6E5", fontSize: 13 }}>
      <span style={{ fontSize: 32, opacity: 0.4 }}>⚠</span>
      <span style={{ color: "#FB7185", fontSize: 16, fontWeight: 600 }}>应用异常</span>
      <span style={{ color: "#64748B", fontSize: 11 }}>发生了严重错误，请刷新页面重试</span>
      <button onClick={() => window.location.reload()} style={{ padding: "8px 20px", background: "linear-gradient(135deg,#60A5FA,#A78BFA)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer", marginTop: 4 }}>
        刷新页面
      </button>
    </div>
  );
}

export default function Layout() {
  const { currentPage, settings } = useAppStore();
  const metrics = useResourceMetrics();
  const isLight = resolveTheme("system") === "light";

  // 主题 CSS 类管理
  useEffect(() => {
    const body = document.body;
    body.classList.remove("light-theme");
    if (isLight) body.classList.add("light-theme");
    // 监听系统主题变化
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        // 强制重渲染以切换主题
        useAppStore.getState().updateSetting("theme", "system");
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    return () => {};
  }, [isLight]);

  // 字体大小 CSS class
  useEffect(() => {
    const fs = settings?.font_size || "standard";
    document.body.classList.remove("font-small", "font-standard", "font-large");
    document.body.classList.add(`font-${fs}`);
  }, [settings?.font_size]);

  // 界面语言
  useEffect(() => {
    const lang = settings?.language || "zh-CN";
    document.documentElement.lang = lang;
  }, [settings?.language]);

  return (
    <ErrorBoundary label="Root">
      <ParticleBackground metrics={metrics} />
      <div style={{ width: "100%", height: "100%", display: "grid", gridTemplateColumns: "auto 1fr", gridTemplateRows: "auto 1fr", gap: 0, overflow: "hidden", position: "relative", zIndex: 1 }}>
        <ErrorBoundary label="Sidebar"><Sidebar /></ErrorBoundary>
        <ErrorBoundary label="TabBar"><TabBar /></ErrorBoundary>
        <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <ContentArea>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <ErrorBoundary key={currentPage} label={currentPage}>
                <PageRouter />
              </ErrorBoundary>
            </div>
          </ContentArea>
          <ErrorBoundary label="StatusBar"><StatusBar /></ErrorBoundary>
        </div>
        <DialogRenderer />
        <NotificationContainer />
        <ConfirmDialog />
      </div>
    </ErrorBoundary>
  );
}
