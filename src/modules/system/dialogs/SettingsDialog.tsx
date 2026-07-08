import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "../../../store/appStore";
import { invoke } from "../../../tauri-invoke";
import { showConfirm } from "../../../components/ConfirmDialog";
import SaveStatusBar from "../../../components/SaveStatusBar";
import { useAutoSave } from "../../../hooks/useAutoSave";
import PresetManager from "../../processing/dialogs/PresetManager";
import { bg, border, accent, text, hover, status as statusColors } from "../../../theme/ethereal";
import { TextureLayer } from "../../../components/TextureBg";

const sections = [
  { id: "general", label: "通用基础", icon: "⚙" },
  { id: "appearance", label: "界面外观", icon: "🎨" },
  { id: "browser", label: "浏览器", icon: "🌐" },
  { id: "datamanagement", label: "数据管理", icon: "📦" },
  { id: "presets", label: "编码预设", icon: "🎞" },
];

function DataManagementPanel() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const outputPath = await invoke<string>("select_export_path");
      await invoke("export_data_zip", { outputPath });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const zipPath = await invoke<string>("select_import_path");
      const clearExisting = await showConfirm({ title: "导入数据", message: "是否清空现有数据后再导入？", confirmText: "清空并导入", cancelText: "不清空导入" });
      await invoke("import_data_zip", { zipPath, clearExisting });
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsImporting(false);
    }
  };

  const btnBase: React.CSSProperties = {
    padding: "8px 16px", borderRadius: 5, fontSize: 11, fontWeight: 600,
    border: `1px solid ${border.default}`, background: bg.surface,
    color: text.secondary, cursor: "pointer", transition: "all 0.15s",
    display: "inline-flex", alignItems: "center", gap: 6,
  };

  return (
    <div style={{ display: "flex", gap: 12 }}>
      <button style={btnBase} onClick={handleExport} disabled={isExporting}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent.primary; e.currentTarget.style.color = accent.primary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = border.default; e.currentTarget.style.color = text.secondary; }}>
        {isExporting ? "⏳" : "📦"} 导出
      </button>
      <button style={btnBase} onClick={handleImport} disabled={isImporting}
        onMouseEnter={e => { e.currentTarget.style.borderColor = accent.primary; e.currentTarget.style.color = accent.primary; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = border.default; e.currentTarget.style.color = text.secondary; }}>
        {isImporting ? "⏳" : "📂"} 导入
      </button>
    </div>
  );
}

export default function SettingsDialog() {
  const { closeDialog, settings, getSettings, updateSettings, updateSetting } = useAppStore();
  const [activeSection, setActiveSection] = useState("general");

  const [language, setLanguage] = useState("zh-CN");
  const [fontSize, setFontSize] = useState("standard");
  const [zoomLevel, setZoomLevel] = useState("100%");
  const [defaultStorage, setDefaultStorage] = useState("./data");
  const [tempDir, setTempDir] = useState("system/temp");
  const [logDir, setLogDir] = useState("system/logs");
  const [backupDir, setBackupDir] = useState("system/backups");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [enableTelemetry, setEnableTelemetry] = useState(false);
  const [logLevel, setLogLevel] = useState("info");
  const [maxLogDays, setMaxLogDays] = useState(30);

  const [autoStart, setAutoStart] = useState(false);
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [autoScan, setAutoScan] = useState(false);
  const [scanInterval, setScanInterval] = useState(30);
  const [defaultSortBy, setDefaultSortBy] = useState("added_at");
  const [defaultViewMode, setDefaultViewMode] = useState("card");
  const [pageSize, setPageSize] = useState(100);
  const [backupIntervalDays, setBackupIntervalDays] = useState(7);

  const [ffmpegPath, setFfmpegPath] = useState("");
  const [ffprobePath, setFfprobePath] = useState("");

  // ── 浏览器设置 ──
  const [browserPath, setBrowserPath] = useState("");
  const [detectedBrowsers, setDetectedBrowsers] = useState<{ name: string; path: string }[]>([]);
  const [detecting, setDetecting] = useState(false);

  // 立即应用语言和字体大小变更（无需等待自动保存）
  const applyLanguage = useCallback((val: string) => {
    setLanguage(val);
    if (settings) updateSetting("language", val);
  }, [settings, updateSetting]);

  const applyFontSize = useCallback((val: string) => {
    setFontSize(val);
    if (settings) updateSetting("font_size", val);
  }, [settings, updateSetting]);

  // 默认视图/排序变更立即生效
  const applyDefaultView = useCallback((val: string) => {
    setDefaultViewMode(val);
    if (settings) updateSetting("default_view_mode", val);
  }, [settings, updateSetting]);

  const applyDefaultSort = useCallback((val: string) => {
    setDefaultSortBy(val);
    if (settings) updateSetting("default_sort_by", val);
  }, [settings, updateSetting]);

  // ── 浏览器检测 ──
  const detectBrowsers = useCallback(async () => {
    setDetecting(true);
    try {
      const list = await invoke<{ name: string; path: string }[]>("detect_browsers");
      setDetectedBrowsers(list);
    } catch { setDetectedBrowsers([]); }
    setDetecting(false);
  }, []);

  useEffect(() => {
    detectBrowsers();
  }, [detectBrowsers]);

  useEffect(() => {
    if (!settings) {
      getSettings();
    }
  }, []);

  useEffect(() => {
    if (settings) {
      setLanguage(settings.language || "zh-CN");
      setFontSize(settings.font_size || "标准");
      setDefaultStorage(settings.default_storage || "./data");
      setTempDir(settings.temp_dir || "system/temp");
      setLogDir(settings.log_dir || "system/logs");
      setBackupDir(settings.backup_dir || "system/backups");
      setAutoStart(settings.auto_start ?? false);
      setNotifyOnComplete(settings.notify_on_complete ?? true);
      setAutoScan(settings.auto_scan ?? false);
      setScanInterval(settings.scan_interval ?? 30);
      setDefaultSortBy(settings.default_sort_by || "added_at");
      setDefaultViewMode(settings.default_view_mode || "card");
      setPageSize(settings.page_size ?? 100);
      setEnableTelemetry(settings.enable_telemetry ?? false);
      setLogLevel(settings.log_level || "info");
      setMaxLogDays(settings.max_log_days ?? 30);
      setBackupIntervalDays(settings.backup_interval_days ?? 7);
      setFfmpegPath(settings.ffmpeg_path || "");
      setFfprobePath(settings.ffprobe_path || "");
      setBrowserPath(settings.browser_path || "");
    }
  }, [settings]);

  const saveFn = useCallback(async () => {
    if (!settings) return;
    await updateSettings({
      ...settings,
      language,
      font_size: fontSize,
      default_storage: defaultStorage,
      temp_dir: tempDir,
      log_dir: logDir,
      backup_dir: backupDir,
      auto_start: autoStart,
      notify_on_complete: notifyOnComplete,
      auto_scan: autoScan,
      scan_interval: scanInterval,
      default_sort_by: defaultSortBy,
      default_view_mode: defaultViewMode,
      page_size: pageSize,
      enable_telemetry: enableTelemetry,
      log_level: logLevel,
      max_log_days: maxLogDays,
      backup_interval_days: backupIntervalDays,
      ffmpeg_path: ffmpegPath,
      ffprobe_path: ffprobePath,
      browser_path: browserPath,
    });
  }, [settings, language, fontSize, defaultStorage, tempDir, logDir, backupDir,
      autoStart, notifyOnComplete, autoScan, scanInterval, browserPath,
      enableTelemetry, logLevel, maxLogDays, backupIntervalDays,
      ffmpegPath, ffprobePath, updateSettings]);

  const { status: saveStatus, save: forceSave } = useAutoSave(saveFn, [language, fontSize,
    defaultStorage, tempDir, logDir, backupDir,
    autoStart, notifyOnComplete, autoScan, scanInterval,
    defaultSortBy, defaultViewMode, pageSize,
    enableTelemetry, logLevel, maxLogDays, backupIntervalDays,
    ffmpegPath, ffprobePath, browserPath],
    { showNotification: true, successTitle: "设置已保存", errorTitle: "设置保存失败" });

  const handleClose = useCallback(async () => {
    if (saveStatus === "unsaved") await forceSave();
    closeDialog("settings");
  }, [saveStatus, forceSave, closeDialog]);

  const inputStyle: React.CSSProperties = { padding: "6px 10px", background: bg.base, border: `1px solid ${border.default}`, borderRadius: 4, color: text.primary, fontSize: 11, outline: "none" };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: text.secondary, fontWeight: 500 };
  const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };

  const navBtnBase: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, width: "100%",
    padding: "7px 12px", borderRadius: 6, fontSize: 11, fontWeight: 500,
    border: "none", textAlign: "left", cursor: "pointer", marginBottom: 2,
    transition: "all 0.15s",
  };

  const groupLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: text.muted,
    textTransform: "uppercase", letterSpacing: 0.8,
    padding: "8px 4px 4px",
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" }}
      onClick={handleClose}>
      <div style={{ width: 720, height: 520, background: bg.elevated, border: `1px solid ${border.default}`, borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 16px 64px rgba(0,0,0,0.6)", overflow: "hidden", position: "relative" }}
        onClick={(e) => e.stopPropagation()}>
        <TextureLayer type="weave" opacity={0.03} />
        <div style={{ height: 42, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: `1px solid ${border.divider}` }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: text.primary }}>⚙</span>
          <button style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 5, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 12, transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = `${statusColors.error.bg}`; e.currentTarget.style.color = statusColors.error.color; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = text.muted; }}
            onClick={handleClose}>✕</button>
        </div>
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ width: 160, background: bg.base, borderRight: `1px solid ${border.divider}`, padding: "8px 6px", overflowY: "auto" }}>
            <div style={groupLabel}>设置分类</div>
            {sections.map((sec) => (
              <button key={sec.id}
                style={{
                  ...navBtnBase,
                  color: activeSection === sec.id ? accent.primary : text.secondary,
                  background: activeSection === sec.id ? accent.glow : "transparent",
                  borderLeft: activeSection === sec.id ? `2px solid ${accent.primary}` : "2px solid transparent",
                }}
                onClick={() => setActiveSection(sec.id)}>
                <span>{sec.icon}</span>
                <span>{sec.label}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
            {activeSection === "presets" ? (
              <PresetManager onBack={() => setActiveSection("general")} />
            ) : (
              <>
              <div style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeSection === "general" && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={fieldStyle}>
                          <span style={labelStyle}>界面语言</span>
                          <select style={selectStyle} value={language} onChange={(e) => applyLanguage(e.target.value)}>
                            <option value="zh-CN">中文 (简体)</option>
                            <option value="en">English</option>
                          </select>
                        </div>
                        <div style={fieldStyle}>
                          <span style={labelStyle}>字体大小</span>
                          <select style={selectStyle} value={fontSize} onChange={(e) => applyFontSize(e.target.value)}>
                            <option value="small">小</option>
                            <option value="standard">标准</option>
                            <option value="large">大</option>
                          </select>
                        </div>
                        <div style={fieldStyle}>
                          <span style={labelStyle}>FFmpeg</span>
                          <input style={inputStyle} value={ffmpegPath}
                            onChange={(e) => setFfmpegPath(e.target.value)} />
                        </div>
                        <div style={fieldStyle}>
                          <span style={labelStyle}>FFprobe</span>
                          <input style={inputStyle} value={ffprobePath}
                            onChange={(e) => setFfprobePath(e.target.value)} />
                        </div>
                      </div>
                    </>
                  )}
                  {activeSection === "appearance" && (
                    <>
                      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div style={fieldStyle}>
                          <span style={labelStyle}>默认视图</span>
                          <select style={selectStyle} value={defaultViewMode} onChange={(e) => applyDefaultView(e.target.value)}>
                            <option value="card">卡片视图</option>
                            <option value="list">列表视图</option>
                          </select>
                        </div>
                        <div style={fieldStyle}>
                          <span style={labelStyle}>默认排序</span>
                          <select style={selectStyle} value={defaultSortBy} onChange={(e) => applyDefaultSort(e.target.value)}>
                            <option value="added_at">添加时间</option>
                            <option value="filename">文件名</option>
                            <option value="size">文件大小</option>
                            <option value="duration">时长</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                  {activeSection === "browser" && (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: text.primary, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>🌐 浏览器设置</div>
                      <div style={{ fontSize: 9, color: text.muted, marginBottom: 12, lineHeight: 1.5 }}>
                        选择链接打开的默认浏览器。所有标签中的 URL 类型链接将使用此浏览器打开。
                      </div>

                      {/* 浏览器列表 */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                        {detecting ? (
                          <div style={{ padding: 12, textAlign: "center", color: text.muted, fontSize: 10 }}>正在检测浏览器...</div>
                        ) : detectedBrowsers.length === 0 ? (
                          <div style={{ padding: 12, textAlign: "center", color: text.muted, fontSize: 10 }}>
                            未检测到浏览器
                            <button onClick={detectBrowsers} style={{ display: "block", margin: "6px auto 0", padding: "3px 8px", borderRadius: 4, fontSize: 9, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer", fontFamily: "var(--font-sans)" }}>重新检测</button>
                          </div>
                        ) : (
                          detectedBrowsers.map(b => {
                            const selected = browserPath === b.path;
                            return (
                              <div key={b.path} onClick={() => setBrowserPath(b.path)}
                                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6, cursor: "pointer", transition: "all 0.12s", background: selected ? accent.tintMid : bg.surface, border: `1px solid ${selected ? accent.primary : border.default}` }}>
                                <span style={{ width: 22, height: 22, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, background: "linear-gradient(135deg,#4285F4,#34A853)" }}>🌐</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 10, fontWeight: 600, color: text.primary }}>{b.name}</div>
                                  <div style={{ fontSize: 8, color: text.placeholder, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.path}</div>
                                </div>
                                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                  {selected && <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 7, fontWeight: 600, background: "rgba(59,130,246,0.15)", color: accent.light, border: `1px solid rgba(59,130,246,0.25)` }}>当前</span>}
                                  <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 7, fontWeight: 600, background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.18)" }}>已检测</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 操作按钮 */}
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={detectBrowsers} style={{ padding: "3px 8px", borderRadius: 4, fontSize: 9, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer", fontFamily: "var(--font-sans)" }}>🔄 重新检测</button>
                      </div>

                      {/* 提示 */}
                      <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 5, background: accent.tint, border: `1px dashed ${border.accent}`, fontSize: 9, color: text.placeholder, lineHeight: 1.6 }}>
                        💡 设置后，标签管理中的 <strong style={{ color: accent.light }}>🔗 URL</strong> 类型标签值将使用选中的浏览器打开链接。
                        未选择时使用系统默认浏览器。
                      </div>
                    </div>
                  )}
                  {activeSection === "datamanagement" && (
                    <DataManagementPanel />
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end", padding: "10px 16px", borderTop: `1px solid ${border.divider}` }}>
                  <SaveStatusBar status={saveStatus} />
                  <button style={{ padding: "6px 14px", borderRadius: 5, fontSize: 11, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = accent.primary; e.currentTarget.style.color = accent.primary; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = border.default; e.currentTarget.style.color = text.secondary; }}
                    onClick={handleClose}>关闭</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
