import { useRef, useEffect, ReactNode } from "react";
import { useAppStore } from "../../store/appStore";

const styles = {
  contentArea: {
    flex: 1,
    padding: "16px 20px",
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    position: "relative" as const,
  } as React.CSSProperties,
  loadingBar: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10,
  } as React.CSSProperties,
  loadingInner: {
    height: "100%",
    background: "#059669",
    borderRadius: 1,
    animation: "loadingBar 1.2s ease-in-out infinite",
  } as React.CSSProperties,
};

interface ContentAreaProps {
  children: ReactNode;
}

export default function ContentArea({ children }: ContentAreaProps) {
  const { loading, activeTabId, updateTabState, getTabState } = useAppStore();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTabId && contentRef.current) {
      const saved = getTabState(activeTabId);
      if (saved && saved.scrollPos > 0) {
        contentRef.current.scrollTop = saved.scrollPos;
      }
    }
  }, [activeTabId]);

  useEffect(() => {
    const handleScroll = () => {
      if (activeTabId && contentRef.current) {
        updateTabState(activeTabId, { scrollPos: contentRef.current.scrollTop });
      }
    };
    const el = contentRef.current;
    if (el) {
      el.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (el) el.removeEventListener("scroll", handleScroll);
    };
  }, [activeTabId]);

  return (
    <div ref={contentRef} className="radial-bg" style={styles.contentArea}>
      {loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingInner} />
        </div>
      )}
      {children}
    </div>
  );
}
