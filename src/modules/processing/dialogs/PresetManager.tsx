import { useState, useEffect } from "react";
import { useAppStore } from "../../../store/appStore";
import { notify } from "../../../components/Notification";
import { showConfirm } from "../../../components/ConfirmDialog";
import type { EncodingPreset } from "../../../types";
import { bg, border, accent, text, status as statusColors } from "../../../theme/ethereal";

const ENCODERS = ["H.264", "H.265", "AV1", "VP9"];
const BRANDS = ["NVIDIA", "AMD", "Intel", "Apple", "Software"];
const SPEEDS = ["placebo", "veryslow", "slower", "slow", "medium", "fast", "faster", "veryfast", "superfast", "ultrafast"];
const TUNES = ["", "film", "animation", "grain", "stillimage", "fastdecode", "zerolatency", "psnr", "ssim"];
const PIX_FMTS = ["yuv420p", "yuv422p", "yuv444p", "yuv420p10le", "yuv444p10le"];
const BITRATE_MODES = ["CRF", "CBR", "VBR", "CQP"];
const AUDIO_CODECS = ["AAC", "MP3", "AC3", "E-AC3", "Opus", "FLAC", "PCM", "copy"];
const AUDIO_PROFILES: Record<string, string[]> = {
  AAC: ["aac_low", "aac_he", "aac_he_v2", "aac_ld", "aac_eld"],
  MP3: ["default"], AC3: ["default"], "E-AC3": ["default"], Opus: ["default"], FLAC: ["default"], PCM: ["default"], copy: ["default"],
};
const OUTPUT_FORMATS = ["mp4", "mkv", "mov", "avi", "webm", "ts", "m4v", "flv"];
const PROFILES: Record<string, string[]> = {
  "H.264": ["baseline", "main", "high", "high10", "high422", "high444"],
  "H.265": ["main", "main10", "main12", "main444", "main444-10", "main444-12"],
  "AV1": ["main", "high", "professional"],
  "VP9": ["main", "main10", "main12", "main444", "main444-10", "main444-12"],
};

const inputSx: React.CSSProperties = { padding: "4px 8px", background: bg.input, border: `1px solid ${border.default}`, borderRadius: 4, color: text.primary, fontSize: 10, outline: "none", boxSizing: "border-box", width: "100%" };
const selectSx: React.CSSProperties = { ...inputSx, cursor: "pointer" };
const labelSx: React.CSSProperties = { fontSize: 9, color: text.muted, marginBottom: 2, display: "block", whiteSpace: "nowrap" };
const sectionTitle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: text.secondary, borderBottom: `1px solid ${border.divider}`, paddingBottom: 3, marginBottom: 8, gridColumn: "1 / -1" };

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={labelSx}>{label}</span>{children}</div>;
}

function emptyPreset(): EncodingPreset {
  return {
    id: "", name: "", description: "",
    encoder_type: "H.264", encoder_brand: "NVIDIA", profile: "main", encoder_level: "",
    width: 1920, height: 1080, pix_fmt: "yuv420p",
    video_bitrate: "", max_bitrate: "",
    fps: "30", time_base: "", encoder_tag: "",
    bitrate_mode: "CRF", crf_value: "23", preset: "medium", tune: "",
    audio_codec: "AAC", audio_sample_rate: "44100", audio_channels: "2",
    channel_layout: "stereo", audio_profile: "aac_low", audio_bitrate: "192k", audio_volume: "100",
    output_format: "mp4", output_suffix: "_encoded",
    is_default: false, is_builtin: false,
    resolution_mode: "", fps_mode: "", min_crf: "", max_crf: "",
    created_at: "", updated_at: "",
  };
}

function Editor({ preset, onSave, onCancel }: { preset: EncodingPreset; onSave: (p: EncodingPreset) => void; onCancel: () => void }) {
  const [p, setP] = useState<EncodingPreset>(preset);
  const set = (k: keyof EncodingPreset, v: any) => setP(prev => ({ ...prev, [k]: v }));
  const profiles = PROFILES[p.encoder_type] || PROFILES["H.264"];
  const [resWDraft, setResWDraft] = useState<string | null>(null);
  const [resHDraft, setResHDraft] = useState<string | null>(null);
  const commitResW = () => {
    if (resWDraft !== null) { const n = parseInt(resWDraft); if (!isNaN(n)) set("width", n); setResWDraft(null); }
  };
  const commitResH = () => {
    if (resHDraft !== null) { const n = parseInt(resHDraft); if (!isNaN(n)) set("height", n); setResHDraft(null); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px 12px", padding: 0 }}>
      <span style={sectionTitle}>基本信息</span>
      <F label="预设名称"><input style={inputSx} value={p.name} onChange={e => set("name", e.target.value)} placeholder="输入名称..." /></F>
      <F label="描述"><input style={inputSx} value={p.description} onChange={e => set("description", e.target.value)} placeholder="可选描述" /></F>
      <F label="输出后缀"><input style={inputSx} value={p.output_suffix} onChange={e => set("output_suffix", e.target.value)} /></F>

      <span style={sectionTitle}>视频编码</span>
      <F label="编码器"><select style={selectSx} value={p.encoder_type} onChange={e => { set("encoder_type", e.target.value); set("profile", PROFILES[e.target.value]?.[0] || "main"); }}>{ENCODERS.map(e => <option key={e}>{e}</option>)}</select></F>
      <F label="品牌"><select style={selectSx} value={p.encoder_brand} onChange={e => set("encoder_brand", e.target.value)}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></F>
      <F label="Profile"><select style={selectSx} value={p.profile} onChange={e => set("profile", e.target.value)}>{profiles.map(pr => <option key={pr}>{pr}</option>)}</select></F>
      <F label="Level"><input style={inputSx} value={p.encoder_level} onChange={e => set("encoder_level", e.target.value)} placeholder="如 4.0" /></F>
      <F label="分辨率"><div style={{ display: "flex", gap: 4, alignItems: "center" }}><input style={{ ...inputSx, width: "50%" }} type="number" value={resWDraft !== null ? resWDraft : p.width} onChange={e => setResWDraft(e.target.value)} onBlur={commitResW} /><span style={{ fontSize: 9, color: text.muted }}>×</span><input style={{ ...inputSx, width: "50%" }} type="number" value={resHDraft !== null ? resHDraft : p.height} onChange={e => setResHDraft(e.target.value)} onBlur={commitResH} /></div></F>
      <F label="像素格式"><select style={selectSx} value={p.pix_fmt} onChange={e => set("pix_fmt", e.target.value)}>{PIX_FMTS.map(f => <option key={f}>{f}</option>)}</select></F>
      <F label="帧率 (fps)"><input style={inputSx} value={p.fps} onChange={e => set("fps", e.target.value)} placeholder="30" /></F>

      <span style={sectionTitle}>码率 / 质量</span>
      <F label="码率模式"><select style={selectSx} value={p.bitrate_mode} onChange={e => set("bitrate_mode", e.target.value)}>{BITRATE_MODES.map(m => <option key={m}>{m}</option>)}</select></F>
      <F label={p.bitrate_mode === "CRF" ? "CRF 值" : "视频码率"}><input style={inputSx} value={p.bitrate_mode === "CRF" ? p.crf_value : p.video_bitrate} onChange={e => { if (p.bitrate_mode === "CRF") set("crf_value", e.target.value); else set("video_bitrate", e.target.value); }} placeholder={p.bitrate_mode === "CRF" ? "23" : "5000k"} /></F>
      <F label="最大码率"><input style={inputSx} value={p.max_bitrate} onChange={e => set("max_bitrate", e.target.value)} placeholder="如 10000k" /></F>

      <span style={sectionTitle}>编码器调优</span>
      <F label="编码速度"><select style={selectSx} value={p.preset} onChange={e => set("preset", e.target.value)}>{SPEEDS.map(s => <option key={s}>{s}</option>)}</select></F>
      <F label="Tune"><select style={selectSx} value={p.tune} onChange={e => set("tune", e.target.value)}>{TUNES.map(t => <option key={t} value={t}>{t || "无"}</option>)}</select></F>
      <F label="编码器标签"><input style={inputSx} value={p.encoder_tag} onChange={e => set("encoder_tag", e.target.value)} placeholder="可选" /></F>

      <span style={sectionTitle}>音频设置</span>
      <F label="音频编码"><select style={selectSx} value={p.audio_codec} onChange={e => { set("audio_codec", e.target.value); set("audio_profile", AUDIO_PROFILES[e.target.value]?.[0] || "default"); }}>{AUDIO_CODECS.map(a => <option key={a}>{a}</option>)}</select></F>
      <F label="采样率"><select style={selectSx} value={p.audio_sample_rate} onChange={e => set("audio_sample_rate", e.target.value)}><option>44100</option><option>48000</option><option>96000</option></select></F>
      <F label="声道"><select style={selectSx} value={p.audio_channels} onChange={e => { set("audio_channels", e.target.value); set("channel_layout", e.target.value === "1" ? "mono" : e.target.value === "2" ? "stereo" : e.target.value === "6" ? "5.1" : e.target.value === "8" ? "7.1" : "stereo"); }}><option value="1">单声道</option><option value="2">立体声</option><option value="6">5.1</option><option value="8">7.1</option></select></F>
      <F label="声道布局"><input style={inputSx} value={p.channel_layout} onChange={e => set("channel_layout", e.target.value)} /></F>
      <F label="Audio Profile"><select style={selectSx} value={p.audio_profile} onChange={e => set("audio_profile", e.target.value)}>{(AUDIO_PROFILES[p.audio_codec] || ["default"]).map(ap => <option key={ap}>{ap}</option>)}</select></F>
      <F label="音频码率"><input style={inputSx} value={p.audio_bitrate} onChange={e => set("audio_bitrate", e.target.value)} placeholder="192k" /></F>
      <F label="音量"><input style={inputSx} value={p.audio_volume} onChange={e => set("audio_volume", e.target.value)} placeholder="100" /></F>

      <span style={sectionTitle}>输出设置</span>
      <F label="输出格式"><select style={selectSx} value={p.output_format} onChange={e => set("output_format", e.target.value)}>{OUTPUT_FORMATS.map(f => <option key={f}>{f}</option>)}</select></F>

      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, borderTop: `1px solid ${border.divider}`, paddingTop: 8 }}>
        <button style={{ padding: "6px 16px", borderRadius: 4, fontSize: 10, border: "none", background: accent.deep, color: "#fff", cursor: "pointer", fontWeight: 500 }}
          onClick={() => onSave(p)}>💾 保存</button>
        <button style={{ padding: "6px 16px", borderRadius: 4, fontSize: 10, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, cursor: "pointer" }}
          onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

interface Props {
  onBack: () => void;
}

export default function PresetManager({ onBack }: Props) {
  const presets = useAppStore(s => s.presets);
  const loadPresets = useAppStore(s => s.loadPresets);
  const createPreset = useAppStore(s => s.createPreset);
  const deletePreset = useAppStore(s => s.deletePreset);
  const updatePreset = useAppStore(s => s.updatePreset);
  const setDefaultPreset = useAppStore(s => s.setDefaultPreset);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPreset, setEditPreset] = useState<EncodingPreset | null>(null);

  useEffect(() => { if (presets.length === 0) loadPresets(); }, []);

  const handleEdit = (p: EncodingPreset) => {
    setEditingId(p.id);
    setEditPreset({ ...p });
  };

  const handleNew = () => {
    setEditingId("new");
    setEditPreset(emptyPreset());
  };

  const handleSave = async (p: EncodingPreset) => {
    if (editingId === "new") {
      const id = await createPreset(p.name, p.encoder_type, p.width, p.height, p.fps);
      if (id) {
        await updatePreset({ ...p, id });
        notify({ type: "success", title: "预设已创建", message: p.name });
      }
    } else {
      await updatePreset(p);
      notify({ type: "success", title: "预设已保存", message: p.name });
    }
    setEditingId(null);
    setEditPreset(null);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditPreset(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${border.default}`, flexShrink: 0 }}>
        <button style={{ padding: "3px 8px", borderRadius: 3, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, fontSize: 9, cursor: "pointer" }}
          onClick={onBack}>← 返回</button>
        <span style={{ fontSize: 12, fontWeight: 600, color: text.primary }}>
          {editingId === null ? "编码预设管理" : editingId === "new" ? "新建预设" : "编辑预设"}
        </span>
      </div>

      {}
      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        {editingId !== null && editPreset ? (
          <Editor preset={editPreset} onSave={handleSave} onCancel={handleCancel} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {presets.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: bg.base, border: `1px solid ${p.is_default ? accent.deep : border.default}`, borderRadius: 6, cursor: "pointer" }}
                onClick={() => handleEdit(p)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: text.primary, fontWeight: 500 }}>{p.name} {p.is_default && <span style={{ color: accent.deep, fontSize: 9 }}>· 默认</span>}</div>
                  <div style={{ fontSize: 10, color: text.muted, marginTop: 1 }}>
                    {p.encoder_type} · {p.width}×{p.height} · {p.fps}fps · {p.bitrate_mode}{p.bitrate_mode === "CRF" ? ` ${p.crf_value}` : ""}
                    {p.description && <> · {p.description}</>}
                  </div>
                </div>
                <button style={{ padding: "3px 8px", borderRadius: 3, border: `1px solid ${border.default}`, background: bg.surface, color: text.secondary, fontSize: 9, cursor: "pointer" }}
                  onClick={async (e) => { e.stopPropagation(); await setDefaultPreset(p.id); }}>{p.is_default ? "已默认" : "默认"}</button>
                {!p.is_builtin && <button style={{ padding: "3px 8px", borderRadius: 3, border: "1px solid transparent", background: `${statusColors.error.color}15`, color: statusColors.error.color, fontSize: 9, cursor: "pointer" }}
                  onClick={async (e) => { e.stopPropagation(); if (await showConfirm({ title: "删除预设", message: `删除"${p.name}"？`, danger: true })) deletePreset(p.id); }}>删除</button>}
              </div>
            ))}
            {presets.length === 0 && <div style={{ textAlign: "center", padding: 20, color: text.muted, fontSize: 11 }}>暂无预设，点击下方新建</div>}
            <button style={{ width: "100%", padding: "10px 0", border: `1px dashed ${border.default}`, background: "transparent", borderRadius: 6, color: text.muted, fontSize: 10, cursor: "pointer", marginTop: 4 }}
              onClick={handleNew}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accent.deep; e.currentTarget.style.color = accent.deep; e.currentTarget.style.background = accent.tint; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = border.default; e.currentTarget.style.color = text.muted; e.currentTarget.style.background = "transparent"; }}
            >+ 新建预设</button>
          </div>
        )}
      </div>
    </div>
  );
}
