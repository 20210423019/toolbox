import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../../theme/useTheme";

// ─── 类型定义 ───

interface HistoryItem {
  value: string;
  count: number;
  lastUsed: string;
}

interface TagValueInputProps {
  tagId: string;
  tagName?: string;
  tagType: "text" | "path" | "url";
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
  onCancel?: () => void;
  maxHistory?: number;
  autoFocus?: boolean;
  /** 自定义历史值加载器，默认使用 localStorage */
  historyFetcher?: (tagId: string) => Promise<HistoryItem[]>;
}

// ─── 常量 ───

const STORAGE_PREFIX = "tag-value-history-";
const DEFAULT_MAX_HISTORY = 20;

// ─── localStorage 工具 ───

function loadHistory(tagId: string): HistoryItem[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tagId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((h: any) => h && typeof h.value === "string");
  } catch {
    return [];
  }
}

function saveHistory(tagId: string, items: HistoryItem[], max: number) {
  try {
    const sorted = items
      .sort((a, b) => b.count - a.count || new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      .slice(0, max);
    localStorage.setItem(`${STORAGE_PREFIX}${tagId}`, JSON.stringify(sorted));
  } catch { /* quota exceeded — silent */ }
}

function recordUsage(tagId: string, value: string, max: number): HistoryItem[] {
  const items = loadHistory(tagId);
  const existing = items.find(h => h.value === value);
  if (existing) {
    existing.count += 1;
    existing.lastUsed = new Date().toISOString();
  } else {
    items.push({ value, count: 1, lastUsed: new Date().toISOString() });
  }
  saveHistory(tagId, items, max);
  return items;
}

// ─── 组件样式 ID（注入一次） ───

const TVI_STYLE_ID = "tag-value-input-style-v2";

function ensureStyles() {
  if (document.getElementById(TVI_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = TVI_STYLE_ID;
  style.textContent = `
.tvi-root{position:relative;width:100%;flex:1;min-width:30px;z-index:1}
.tvi-input-wrap{display:flex;align-items:center;gap:0;background:var(--tvi-bg-input,rgba(255,255,255,0.04));border:1px solid var(--tvi-border,rgba(100,140,220,0.10));border-radius:5px;transition:all .12s;position:relative}
.tvi-input-wrap:focus-within{border-color:var(--tvi-accent,#60A5FA);box-shadow:0 0 0 1px rgba(59,130,246,0.12),0 0 16px rgba(59,130,246,0.03)}
.tvi-input-wrap.has-value{border-color:rgba(52,211,153,0.25);background:rgba(52,211,153,0.03)}
.tvi-prefix{width:22px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;color:var(--tvi-placeholder,#5A6E82);transition:color .12s}
.tvi-input-wrap:focus-within .tvi-prefix{color:var(--tvi-accent,#60A5FA)}
.tvi-input{flex:1;min-width:0;height:26px;border:none;background:transparent;color:var(--tvi-text,#F8FAFC);font-size:11px;padding:0 4px;outline:none;font-family:var(--tvi-font-mono,'Cascadia Code','JetBrains Mono','Fira Code',Consolas,monospace)}
.tvi-input::placeholder{color:var(--tvi-placeholder,#5A6E82);font-size:10px}
.tvi-input.saved{color:#34D399}
.tvi-loader{width:20px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.tvi-loader .spinner{width:10px;height:10px;border:1.5px solid rgba(100,140,220,0.12);border-top-color:var(--tvi-accent,#60A5FA);border-radius:50%;animation:tvi-spin .55s linear infinite}
@keyframes tvi-spin{to{transform:rotate(360deg)}}
.tvi-clear{width:18px;height:26px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;border:none;background:transparent;color:var(--tvi-placeholder,#5A6E82);font-size:10px;opacity:0;transition:all .12s;padding:0}
.tvi-clear.show{opacity:1}
.tvi-clear.show:hover{color:var(--tvi-error,#FB7185)}
.tvi-actions{display:flex;align-items:center;gap:2px;padding-right:4px;flex-shrink:0}
.tvi-act-btn{width:20px;height:20px;border-radius:4px;border:none;background:transparent;color:var(--tvi-placeholder,#5A6E82);font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .1s;flex-shrink:0;padding:0}
.tvi-act-btn:hover{background:var(--tvi-accent-tint,rgba(96,165,250,0.08));color:var(--tvi-accent,#60A5FA)}
.tvi-act-btn.confirm:hover{background:#2563EB;color:#fff}
.tvi-act-btn.cancel:hover{background:rgba(251,113,133,0.12);color:var(--tvi-error,#FB7185)}

/* ─── Portal 下拉（position:fixed，脱离文档流） ─── */
.tvi-portal{z-index:10000;position:fixed;background:rgba(18,25,48,0.96);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(100,140,220,0.15);border-radius:8px;box-shadow:0 12px 48px rgba(0,0,0,0.5),0 0 60px rgba(96,165,250,0.03);overflow:hidden;animation:tvi-scaleIn .1s ease}
@keyframes tvi-scaleIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}
.tvi-dd-header{display:flex;align-items:center;justify-content:space-between;padding:6px 10px 5px;border-bottom:1px solid rgba(100,140,220,0.04)}
.tvi-dd-header .title{font-size:9px;font-weight:600;color:var(--tvi-muted,#8BA3BE);letter-spacing:.3px;text-transform:uppercase;display:flex;align-items:center;gap:4px}
.tvi-dd-header .count{font-size:8px;font-family:var(--tvi-font-mono);color:var(--tvi-placeholder,#5A6E82);background:rgba(255,255,255,0.03);padding:1px 5px;border-radius:3px}
.tvi-dd-list{max-height:180px;overflow-y:auto;padding:3px 0;overflow-x:hidden}
.tvi-dd-list::-webkit-scrollbar{width:3px}
.tvi-dd-list::-webkit-scrollbar-track{background:transparent}
.tvi-dd-list::-webkit-scrollbar-thumb{background:rgba(100,140,220,0.08);border-radius:3px}
.tvi-dd-list::-webkit-scrollbar-thumb:hover{background:rgba(100,140,220,0.15)}
.tvi-item{display:grid;grid-template-columns:16px 1fr auto;align-items:center;gap:6px;padding:5px 10px 5px 8px;cursor:pointer;transition:all .06s;position:relative;border-left:2px solid transparent;font-size:11px}
.tvi-item:hover{background:var(--tvi-accent-tint,rgba(96,165,250,0.06))}
.tvi-item.highlighted{background:var(--tvi-accent-tint,rgba(96,165,250,0.08));border-left-color:var(--tvi-accent,#60A5FA)}
.tvi-item.selected{background:rgba(52,211,153,0.05);border-left-color:#34D399}
.tvi-item.selected .tvi-item-check{opacity:1;color:#34D399}
.tvi-item-icon{width:16px;height:16px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:7px;flex-shrink:0}
.tvi-item-icon.history{background:rgba(96,165,250,0.07);color:var(--tvi-accent,#60A5FA)}
.tvi-item-icon.new{background:rgba(52,211,153,0.08);color:#34D399}
.tvi-item-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:11px;color:var(--tvi-text,#F8FAFC)}
.tvi-item-text .highlight{color:var(--tvi-accent,#60A5FA);font-weight:500}
.tvi-item-extra{font-size:8px;color:var(--tvi-placeholder,#5A6E82);white-space:nowrap;display:flex;align-items:center;gap:4px;flex-shrink:0}
.tvi-item-extra .uc{font-family:var(--tvi-font-mono);font-size:8px;color:var(--tvi-muted,#8BA3BE);background:rgba(255,255,255,0.02);padding:0 4px;border-radius:2px}
.tvi-item-extra .tvi-item-check{opacity:0;font-size:9px;transition:opacity .1s}
.tvi-item:hover .tvi-item-check{opacity:0.4;color:var(--tvi-muted,#8BA3BE)}
.tvi-item.is-new{border-top:1px solid rgba(100,140,220,0.04);margin-top:2px;padding-top:7px}
.tvi-item.is-new .tvi-item-icon{background:rgba(52,211,153,0.10);color:#34D399}
.tvi-item.is-new .tvi-item-text{color:#34D399;font-weight:500}
.tvi-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px;text-align:center;color:var(--tvi-placeholder,#5A6E82)}
.tvi-empty .icon{font-size:16px;opacity:.45}
.tvi-empty .msg{font-size:10px}
.tvi-empty .hint{font-size:9px;color:var(--tvi-placeholder,#5A6E82);max-width:200px;line-height:1.6}
.tvi-loading{display:flex;align-items:center;justify-content:center;gap:6px;padding:16px;color:var(--tvi-muted,#8BA3BE);font-size:10px}
.tvi-loading .spinner{width:12px;height:12px;border:1.5px solid rgba(100,140,220,0.1);border-top-color:var(--tvi-accent,#60A5FA);border-radius:50%;animation:tvi-spin .55s linear infinite}
`;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════
//  TagValueInput 主组件
// ═══════════════════════════════════════════════════════════════

export default function TagValueInput({
  tagId,
  tagName,
  tagType = "text",
  value,
  placeholder,
  onChange,
  onSave,
  onCancel,
  maxHistory = DEFAULT_MAX_HISTORY,
  autoFocus = false,
  historyFetcher,
}: TagValueInputProps) {
  const { bg, accent, text, border, status } = useTheme();
  ensureStyles();

  // ─── CSS 变量注入 ───
  const cssVars: Record<string, string> = useMemo(() => ({
    "--tvi-bg-input": bg.input,
    "--tvi-border": border.default,
    "--tvi-accent": accent.primary,
    "--tvi-text": text.primary,
    "--tvi-muted": text.muted,
    "--tvi-placeholder": text.placeholder,
    "--tvi-error": status.error.color,
    "--tvi-accent-tint": accent.tint,
    "--tvi-font-mono": "'Cascadia Code','JetBrains Mono','Fira Code',Consolas,monospace",
  }), [bg.input, border.default, accent.primary, accent.tint, text.primary, text.muted, text.placeholder, status.error.color]);

  // ─── Refs ───
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ─── State ───
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [localValue, setLocalValue] = useState(value);
  const [isSaved, setIsSaved] = useState(false);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({ display: "none" });

  // sync external value
  useEffect(() => {
    setLocalValue(value);
    setIsSaved(!!value);
  }, [value]);

  // ─── 计算 Portal 定位 ───
  const calcPosition = useCallback(() => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    // 预估面板高度
    const estHeight = Math.min(220, Math.max(80, historyItems.length * 30 + 40));
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    let top: number;
    if (spaceBelow >= estHeight || spaceBelow >= spaceAbove) {
      top = rect.bottom + 4;
    } else {
      top = Math.max(4, rect.top - estHeight - 4);
    }
    setPortalStyle({
      position: "fixed",
      top,
      left: rect.left,
      width: Math.max(180, rect.width),
      zIndex: 10000,
    });
  }, [historyItems.length]);

  // ─── 打开时重新定位 + 监听滚动/缩放 ───
  useEffect(() => {
    if (!isOpen) return;
    calcPosition();
    const onResize = () => calcPosition();
    const onScroll = () => calcPosition();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [isOpen, calcPosition]);

  // ─── 过滤 ───
  const filteredItems = useMemo(() => {
    if (!localValue.trim()) return historyItems;
    const q = localValue.toLowerCase();
    return historyItems.filter(h => h.value.toLowerCase().includes(q));
  }, [historyItems, localValue]);

  const hasExactMatch = useMemo(
    () => localValue.trim().length > 0 && filteredItems.some(h => h.value === localValue),
    [filteredItems, localValue]
  );
  const showNewOption = localValue.trim().length > 0 && !hasExactMatch;

  // ─── 加载历史值 ───
  const loadHistoryValues = useCallback(async () => {
    setIsLoading(true);
    try {
      let items: HistoryItem[];
      if (historyFetcher) {
        items = await historyFetcher(tagId);
      } else {
        items = loadHistory(tagId);
      }
      setHistoryItems(items);
      setIsOpen(true);
      setHighlightedIndex(items.length > 0 ? 0 : -1);
    } finally {
      setIsLoading(false);
    }
  }, [tagId, historyFetcher]);

  // ─── 选中值 ───
  const selectValue = useCallback((val: string) => {
    setLocalValue(val);
    onChange(val);
    onSave(val);
    setIsSaved(true);
    setIsOpen(false);
    if (!historyFetcher) recordUsage(tagId, val, maxHistory);
  }, [tagId, maxHistory, onChange, onSave, historyFetcher]);

  // ─── 处理输入 ───
  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);
    onChange(val);
    setIsSaved(false);
    if (!isOpen) {
      setIsOpen(true);
      loadHistoryValues();
    }
    setHighlightedIndex(-1);
  }, [isOpen, onChange, loadHistoryValues]);

  // ─── 处理聚焦 ───
  const handleFocus = useCallback(() => {
    if (!isOpen && historyItems.length === 0) {
      loadHistoryValues();
    } else if (!isOpen) {
      setIsOpen(true);
    }
  }, [isOpen, historyItems.length, loadHistoryValues]);

  // ─── 键盘事件 ───
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const totalItems = filteredItems.length + (showNewOption ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) { setIsOpen(true); return; }
      setHighlightedIndex(prev => Math.min(prev + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
        selectValue(filteredItems[highlightedIndex].value);
      } else if (showNewOption && (highlightedIndex >= filteredItems.length || totalItems === 1)) {
        selectValue(localValue);
      } else if (localValue.trim()) {
        selectValue(localValue);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "Tab") {
      if (localValue.trim() && !isSaved) {
        selectValue(localValue);
      }
    }
  }, [isOpen, highlightedIndex, filteredItems, showNewOption, localValue, isSaved, selectValue]);

  // ─── 点击外部关闭（兼容 Portal） ───
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current && wrapRef.current.contains(target)) return;
      // Portal 下拉是在 document.body 下的独立节点，检查它
      const portalEl = document.querySelector(".tvi-portal");
      if (portalEl && portalEl.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // ─── 自动聚焦 ───
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // ─── 清除 ───
  const handleClear = useCallback(() => {
    setLocalValue("");
    onChange("");
    setIsSaved(false);
    inputRef.current?.focus();
    loadHistoryValues();
  }, [onChange, loadHistoryValues]);

  // ─── 确认保存 ───
  const handleConfirm = useCallback(() => {
    if (localValue.trim()) {
      selectValue(localValue);
    }
  }, [localValue, selectValue]);

  // ─── 取消 ───
  const handleCancel = useCallback(() => {
    setLocalValue(value);
    onChange(value);
    setIsSaved(!!value);
    setIsOpen(false);
    onCancel?.();
  }, [value, onChange, onCancel]);

  // ─── Prefix 图标 ───
  const prefixIcon = isSaved ? "✓" : tagType === "path" ? "📁" : tagType === "url" ? "🔗" : "📝";

  // ─── 占位符 ───
  const ph = placeholder || (tagType === "path" ? "输入或选择路径…" : tagType === "url" ? "https://…" : "输入标签值…");

  // ─── 转义 HTML ───
  const escHtml = (s: string) => {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  };

  // ─── 高亮匹配 ───
  const highlightMatch = (text: string, query: string) => {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escHtml(text);
    return escHtml(text.slice(0, idx)) + '<span class="highlight">' + escHtml(text.slice(idx, idx + query.length)) + '</span>' + escHtml(text.slice(idx + query.length));
  };

  // ─── 渲染 Portal 下拉内容 ───
  const renderDropdownContent = () => {
    if (!isOpen) return null;

    return (
      <div className="tvi-portal" style={portalStyle} onMouseDown={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="tvi-dd-header">
          <span className="title">{showNewOption ? "🔍 匹配结果" : "📜 历史值"}</span>
          <span className="count">{filteredItems.length + (showNewOption ? 1 : 0)} 条</span>
        </div>

        {/* 加载中 */}
        {isLoading ? (
          <div className="tvi-loading">
            <span className="spinner" />
            <span>加载中…</span>
          </div>
        ) : filteredItems.length === 0 && !showNewOption ? (
          <div className="tvi-empty">
            <div className="icon">🔍</div>
            <div className="msg">{localValue.trim() ? `未找到 "${localValue}" 的匹配` : "暂无历史值"}</div>
            {localValue.trim() && <div className="hint">输入内容可作为新标签值保存</div>}
          </div>
        ) : (
          <div className="tvi-dd-list">
            {filteredItems.map((item, idx) => {
              const isHl = highlightedIndex === idx;
              const display = localValue.trim()
                ? { __html: highlightMatch(item.value, localValue) }
                : { __html: escHtml(item.value) };
              return (
                <div key={item.value}
                  className={`tvi-item${isHl ? " highlighted" : ""}`}
                  onMouseDown={() => selectValue(item.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}>
                  <span className="tvi-item-icon history">📜</span>
                  <span className="tvi-item-text" dangerouslySetInnerHTML={display} />
                  <span className="tvi-item-extra">
                    <span className="uc">{item.count}</span>
                  </span>
                </div>
              );
            })}
            {showNewOption && (
              <div className={`tvi-item is-new${highlightedIndex >= filteredItems.length ? " highlighted" : ""}`}
                onMouseDown={() => selectValue(localValue)}
                onMouseEnter={() => setHighlightedIndex(filteredItems.length)}>
                <span className="tvi-item-icon new">✨</span>
                <span className="tvi-item-text">新建 "{localValue}"</span>
                <span className="tvi-item-extra"><span className="tvi-item-check" style={{ opacity: 0.5 }}>Enter ↵</span></span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tvi-root" style={cssVars as React.CSSProperties} ref={wrapRef}>
      <div className={`tvi-input-wrap${isSaved ? " has-value" : ""}`} onClick={e => e.stopPropagation()}>
        {/* 前缀图标 */}
        <span className="tvi-prefix" style={{ color: isSaved ? "#34D399" : undefined }}>
          {prefixIcon}
        </span>

        {/* 输入框 */}
        <input ref={inputRef}
          className={`tvi-input${isSaved ? " saved" : ""}`}
          type="text"
          value={localValue}
          onChange={handleInput}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={ph}
          autoComplete="off"
          spellCheck={false}
        />

        {/* 加载指示器 */}
        {isLoading && (
          <span className="tvi-loader"><span className="spinner" /></span>
        )}

        {/* 清除按钮 */}
        <span className={`tvi-clear${localValue ? " show" : ""}`}
          onClick={handleClear}
          onMouseDown={e => e.preventDefault()}>✕</span>

        {/* 操作按钮 */}
        <span className="tvi-actions">
          <span className="tvi-act-btn confirm" onClick={handleConfirm} title="保存 (Enter)">✓</span>
          {onCancel && (
            <span className="tvi-act-btn cancel" onClick={handleCancel} title="取消 (Esc)">✕</span>
          )}
        </span>
      </div>

      {/* 从 Portal 渲染下拉，脱离父级 overflow 裁剪 */}
      {isOpen && createPortal(renderDropdownContent(), document.body)}
    </div>
  );
}
