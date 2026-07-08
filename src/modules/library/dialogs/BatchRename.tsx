import { useState, useEffect, useRef, useMemo } from "react";
import { useAppStore } from "../../../store/appStore";
import { notify } from "../../../components/Notification";
import { useTheme } from "../../../theme/useTheme";

const variables = ["{序号}", "{原文件名}", "{时长}", "{分辨率}", "{日期}", "{帧率}", "{编码}"];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}` : `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function resolveTemplate(template: string, v: { filename: string; duration: number; width: number; height: number; fps: number; video_codec: string; file_created_at: string; added_at: string }, seq: string): string {
  let result = template;
  result = result.replace(/{序号}/g, seq);
  result = result.replace(/{原文件名}/g, v.filename.replace(/\.[^.]+$/, ""));
  result = result.replace(/{时长}/g, formatDuration(v.duration));
  result = result.replace(/{分辨率}/g, `${v.width}×${v.height}`);
  result = result.replace(/{日期}/g, formatDate(v.file_created_at || v.added_at));
  result = result.replace(/{帧率}/g, v.fps > 0 ? v.fps.toFixed(2) : "");
  result = result.replace(/{编码}/g, v.video_codec || "");
  return result;
}

function padNumber(n: number, format: "01" | "001" | "1"): string {
  if (format === "01") return n.toString().padStart(2, "0");
  if (format === "001") return n.toString().padStart(3, "0");
  return n.toString();
}

export default function BatchRename() {
  const { bg, border, accent, text, hover, status: statusColors } = useTheme();
  const { closeDialog, videos } = useAppStore();
  const displayVideos = useMemo(() => videos.slice(0, 3), [videos]);
  const selectedCount = videos.length;

  const [template, setTemplate] = useState("素材_{序号}_{原文件名}");
  const [seqFormat, setSeqFormat] = useState<"01" | "001" | "1">("01");
  const [showConfirm, setShowConfirm] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const previewList = useMemo(() => {
    return displayVideos.map((v, i) => {
      const seq = padNumber(i + 1, seqFormat);
      const newName = resolveTemplate(template, v, seq) + "." + (v.filename.split(".").pop() || "mp4");
      return { original: v.filename, newName };
    });
  }, [template, seqFormat, displayVideos]);

  const handleVariableClick = (variable: string) => {
    const input = inputRef.current;
    if (!input) {
      setTemplate((prev) => prev + variable);
      return;
    }
    const start = input.selectionStart ?? template.length;
    const end = input.selectionEnd ?? template.length;
    const newVal = template.slice(0, start) + variable + template.slice(end);
    setTemplate(newVal);
    const newCursor = start + variable.length;
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleExecute = () => {
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    try {
      const renames = videos.map((v, i) => {
        const seq = padNumber(i + 1, seqFormat);
        const newName = resolveTemplate(template, v, seq) + "." + (v.filename.split(".").pop() || "mp4");
        const folderPath = (v.filepath || "").substring(0, (v.filepath || "").lastIndexOf("\\"));
        const newPath = folderPath ? folderPath + "\\" + newName : newName;
        return [v.id, newPath, newName];
      });
      const { currentLibraryId, loadVideos } = useAppStore.getState();
      if (!currentLibraryId) { notify({ type: "error", title: "重命名失败", message: "未选择媒体库" }); return; }
      await useAppStore.getState().batchRename(renames, currentLibraryId);
      notify({ type: "success", title: "重命名完成", message: `已重命名 ${renames.length} 个视频` });
      if (currentLibraryId) loadVideos(currentLibraryId);
      closeDialog("rename");
    } catch (e) {
      notify({ type: "error", title: "重命名失败", message: String(e) });
    }
  };

  const handleCancelConfirm = () => {
    setShowConfirm(false);
  };

  // Escape 关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") closeDialog("rename"); };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [closeDialog]);

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" }}
      onClick={() => closeDialog("rename")}>
      <div style={{ width: 620, background: "#1a1d27", border: `1px solid ${border.default}`, borderRadius: 10, display: "flex", flexDirection: "column", boxShadow: "0 16px 64px rgba(0,0,0,0.6)", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: `1px solid ${border.default}`, background: bg.base }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: text.primary }}>批量重命名</span>
          <button style={{ marginLeft: "auto", width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent", color: text.muted, cursor: "pointer", fontSize: 12 }} onClick={() => closeDialog("rename")}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: 14, gap: 12 }}>
          <span style={{ fontSize: 11, color: text.secondary }}>已选 {selectedCount} 个视频</span>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>命名规则模板</span>
            <input
              ref={inputRef}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              style={{ padding: "6px 10px", background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4, color: text.primary, fontSize: 12, outline: "none" }}
              placeholder="输入命名模板..."
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>可用变量</span>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {variables.map((v) => (
                <span
                  key={v}
                  onClick={() => handleVariableClick(v)}
                  style={{ padding: "3px 8px", background: bg.surface, border: `1px solid ${border.default}`, borderRadius: 4, color: accent.deep, fontSize: 11, cursor: "pointer", userSelect: "none" }}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>序号格式</span>
            <div style={{ display: "flex", gap: 6 }}>
              {(["01", "001", "1"] as const).map((fmt) => (
                <label
                  key={fmt}
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: text.secondary, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="seqFormat"
                    checked={seqFormat === fmt}
                    onChange={() => setSeqFormat(fmt)}
                    style={{ accentColor: accent.deep }}
                  />
                  {fmt === "1" ? "1, 2, 3" : fmt}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: text.secondary, fontWeight: 500 }}>实时预览（前 {Math.min(3, selectedCount)} 个）</span>
            <div style={{ background: bg.base, border: `1px solid ${border.default}`, borderRadius: 4, padding: "8px 10px", fontSize: 11, color: text.primary }}>
              {previewList.length === 0 ? (
                <span style={{ color: text.muted }}>暂无视频可预览</span>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ color: text.muted, fontSize: 10 }}>
                      <th style={{ textAlign: "left", paddingBottom: 4, borderBottom: `1px solid ${border.default}` }}>原名称</th>
                      <th style={{ textAlign: "left", paddingBottom: 4, borderBottom: `1px solid ${border.default}`, paddingLeft: 8 }}>→</th>
                      <th style={{ textAlign: "left", paddingBottom: 4, borderBottom: `1px solid ${border.default}`, paddingLeft: 8 }}>新名称</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewList.map((item, i) => (
                      <tr key={i}>
                        <td style={{ paddingTop: 4, color: text.secondary }}>{item.original}</td>
                        <td style={{ paddingTop: 4, paddingLeft: 8, color: text.muted, textAlign: "center" }}>→</td>
                        <td style={{ paddingTop: 4, paddingLeft: 8, color: statusColors.success.color }}>{item.newName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", borderTop: `1px solid ${border.default}`, paddingTop: 10 }}>
            <button style={{ padding: "6px 14px", borderRadius: 4, fontSize: 11, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer" }} onClick={() => closeDialog("rename")}>取消</button>
            <button style={{ padding: "6px 14px", borderRadius: 4, fontSize: 11, border: "none", background: accent.deep, color: "#fff", cursor: "pointer" }} onClick={handleExecute}>执行重命名</button>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ width: 380, background: "#1a1d27", border: `1px solid ${border.default}`, borderRadius: 10, padding: 20, boxShadow: "0 16px 64px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: text.primary, marginBottom: 10 }}>确认执行重命名</div>
            <div style={{ fontSize: 11, color: text.secondary, marginBottom: 6 }}>
              将对 <span style={{ color: text.primary }}>{selectedCount}</span> 个视频执行批量重命名操作。
            </div>
            <div style={{ fontSize: 11, color: text.secondary, marginBottom: 14 }}>
              模板：<span style={{ color: accent.deep }}>{template}</span>
            </div>
            <div style={{ fontSize: 10, color: text.muted, marginBottom: 14, padding: "6px 8px", background: bg.base, borderRadius: 4, border: `1px solid ${border.default}` }}>
              原文件名将被备份，操作可追溯。
            </div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <button style={{ padding: "6px 14px", borderRadius: 4, fontSize: 11, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer" }} onClick={handleCancelConfirm}>取消</button>
              <button style={{ padding: "6px 14px", borderRadius: 4, fontSize: 11, border: "none", background: accent.deep, color: "#fff", cursor: "pointer" }} onClick={handleConfirm}>确认执行</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
