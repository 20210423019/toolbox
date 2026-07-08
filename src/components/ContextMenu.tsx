import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../theme/useTheme";

interface MenuItem { label?: string; icon?: string; action?: () => void; disabled?: boolean; divider?: boolean; color?: string; }

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  zIndex?: number;
  maxHeight?: number;
}

export default function ContextMenu({ x, y, items, onClose, zIndex = 9999, maxHeight }: Props) {
  const { bg, border, text, hover, accent } = useTheme();

  const menuStyle: React.CSSProperties = {
    position: "fixed", minWidth: 160, background: `${bg.elevated}E0`,
    backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
    border: `1px solid ${border.default}`, borderRadius: 8, padding: 4,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 40px rgba(96,165,250,0.04)", fontSize: 11,
  };

  const itemStyle = (disabled?: boolean, color?: string): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 5,
    color: color || (disabled ? text.muted : text.primary), cursor: disabled ? "not-allowed" : "pointer",
    background: "none", border: "none", width: "100%", textAlign: "left", fontSize: 11,
    transition: "background 0.15s", opacity: disabled ? 0.4 : 1,
    position: "relative",
  });
  const ref = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState(-1);

  const enabledItems = items.filter((item) => !item.divider && !item.disabled);

  const activateItem = useCallback((idx: number) => {
    const item = enabledItems[idx];
    if (item && item.action) {
      item.action();
      onClose();
    }
  }, [enabledItems, onClose]);

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prevent = (e: MouseEvent) => { e.preventDefault(); };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", handleEsc);
    document.addEventListener("contextmenu", prevent);
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("keydown", handleEsc); document.removeEventListener("contextmenu", prevent); };
  }, [onClose]);

  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((prev) => (prev < enabledItems.length - 1 ? prev + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((prev) => (prev > 0 ? prev - 1 : enabledItems.length - 1));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusIdx >= 0 && focusIdx < enabledItems.length) {
          activateItem(focusIdx);
        }
      }
    };
    document.addEventListener("keydown", handleKeyNav);
    return () => document.removeEventListener("keydown", handleKeyNav);
  }, [enabledItems, focusIdx, activateItem]);

  useEffect(() => {
    setFocusIdx(-1);
  }, [items]);

  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 20);

  const itemCount = items.filter((i) => !i.divider).length;
  const menuMaxHeight = maxHeight || Math.min(itemCount * 32 + 16, window.innerHeight - 40);

  return createPortal(
    <div ref={ref} style={{ ...menuStyle, zIndex, left: adjustedX, top: adjustedY, maxHeight: menuMaxHeight, overflowY: "auto" }}>
      {items.map((item, i) => {
        if (item.divider) return <div key={i} style={{ height: 1, background: border.divider, margin: "4px 6px" }} />;
        const enabledIdx = items.slice(0, i).filter((x) => !x.divider && !x.disabled).length;
        const isFocused = focusIdx === enabledIdx;
        return (
          <button key={i} style={{
            ...itemStyle(item.disabled, item.color),
            ...(isFocused ? { background: hover.listItem, boxShadow: `inset 2px 0 0 ${accent.primary}` } : {}),
          }}
            disabled={item.disabled}
            ref={(el) => { if (isFocused && el) el.focus(); }}
            onClick={() => { if (!item.disabled && item.action) { item.action(); onClose(); } }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = hover.listItem;
                e.currentTarget.style.boxShadow = `inset 2px 0 0 ${accent.primary}`;
                setFocusIdx(enabledIdx);
              }
            }}
            onMouseLeave={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = "none";
                e.currentTarget.style.boxShadow = "none";
                if (focusIdx === enabledIdx) setFocusIdx(-1);
              }
            }}>
            {item.icon && <span style={{ width: 16, textAlign: "center", fontSize: 10 }}>{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
