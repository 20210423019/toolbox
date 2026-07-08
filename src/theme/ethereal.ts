// 暗夜琉璃 v3 · 通透空灵版
// 微亮深蓝背景 · 超透玻璃 · 明亮文字 · 纹理可见

export const bg = {
  deepest: "#070B16",     // 从 #020408 提亮 — 保留深邃感但不死黑
  base: "#0A0F1E",        // 基础背景微亮
  sidebar: "rgba(10,15,30,0.35)",  // 更透
  statusbar: "#070B16",
  elevated: "rgba(15,22,40,0.2)",  // 从0.4降到0.2 — 更透
  input: "rgba(255,255,255,0.04)",
  surface: "rgba(18,25,45,0.18)",
  header: "rgba(8,10,20,0.3)",
  panel: "rgba(10,15,30,0.3)",
  card: "rgba(15,22,42,0.18)",     // 从0.4降到0.18
  hover: "rgba(59,130,246,0.08)",  // 从深灰改为主色底
} as const;

export const border = {
  subtle: "rgba(100,140,220,0.06)",
  default: "rgba(100,140,220,0.10)",  // 稍亮增加可见度
  hover: "rgba(100,140,220,0.20)",
  accent: "rgba(59,130,246,0.20)",
  divider: "rgba(100,140,220,0.05)",
  solid: "rgba(100,140,220,0.10)",
} as const;

export const accent = {
  primary: "#60A5FA",     // 从 #3B82F6 提亮 — 更明亮
  deep: "#A78BFA",        // 从 #8B5CF6 提亮
  light: "#22D3EE",       // 从 #06B6D4 提亮
  glow: "rgba(96,165,250,0.12)",
  glowStrong: "rgba(96,165,250,0.22)",
  tint: "rgba(96,165,250,0.06)",
  tintMid: "rgba(96,165,250,0.10)",
  tintStrong: "rgba(96,165,250,0.18)",
} as const;

export const text = {
  primary: "#F8FAFC",     // 更亮
  secondary: "#C8D6E5",   // 从 #94A3B8 提亮
  muted: "#8BA3BE",       // 从 #64748B 提亮
  placeholder: "#5A6E82",
  highlight: "#FFFFFF",
  tertiary: "#8BA3BE",
} as const;

export const status = {
  success: { color: "#34D399", bg: "rgba(52,211,153,0.10)" },
  warning: { color: "#FBBF24", bg: "rgba(251,191,36,0.10)" },
  error:   { color: "#FB7185", bg: "rgba(251,113,133,0.10)" },
  info:    { color: "#38BDF8", bg: "rgba(56,189,248,0.10)" },
} as const;

export const module = {
  video:    { color: "#60A5FA", bg: "rgba(96,165,250,0.12)", iconBg: "rgba(96,165,250,0.18)" },
  processing: { color: "#14B8A6", bg: "rgba(20,184,166,0.12)", iconBg: "rgba(20,184,166,0.18)" },
  system:   { color: "#A78BFA", bg: "rgba(167,139,250,0.12)", iconBg: "rgba(167,139,250,0.18)" },
  other:    { color: "#22D3EE", bg: "rgba(34,211,238,0.12)", iconBg: "rgba(34,211,238,0.18)" },
} as const;

export const moduleColorMap: Record<string, { color: string; bg: string; iconBg: string }> = {
  "#059669": module.video,
  "#8b5cf6": module.system,
  "#ec4899": module.system,
  "#f59e0b": module.other,
};

export const hover = {
  bg: "rgba(96,165,250,0.06)",
  listItem: "rgba(96,165,250,0.08)",
  cardBorder: "rgba(100,140,220,0.18)",
  cardShadow: "0 12px 48px rgba(0,0,0,0.4), 0 0 60px rgba(96,165,250,0.03)",
  btnBg: "rgba(255,255,255,0.05)",
  closeBg: "#e81123",
} as const;

export const particle = {
  baseHue: 215,
  hueRange: 35,
  edgeHue: 195,
} as const;

export const scrollbar = {
  thumb: "rgba(100,140,220,0.10)",
  thumbHover: "rgba(100,140,220,0.18)",
} as const;
