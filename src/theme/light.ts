// 极简白 v1 · 纯净高效版
// 纯白基底 · 紫灰点缀 · 清晰可读

export const bg = {
  deepest: "#F5F7FA",
  base: "#FAFBFC",
  sidebar: "rgba(240,242,245,0.35)",
  statusbar: "#F5F7FA",
  elevated: "rgba(255,255,255,0.25)",
  input: "rgba(0,0,0,0.03)",
  surface: "rgba(245,247,250,0.2)",
  header: "rgba(230,235,240,0.35)",
  panel: "rgba(240,242,245,0.3)",
  card: "rgba(255,255,255,0.22)",
  hover: "rgba(96,165,250,0.06)",
} as const;

export const border = {
  subtle: "rgba(0,0,0,0.05)",
  default: "rgba(0,0,0,0.08)",
  hover: "rgba(0,0,0,0.15)",
  accent: "rgba(96,165,250,0.2)",
  divider: "rgba(0,0,0,0.04)",
  solid: "rgba(0,0,0,0.08)",
} as const;

export const accent = {
  primary: "#3B82F6",
  deep: "#8B5CF6",
  light: "#06B6D4",
  glow: "rgba(59,130,246,0.08)",
  glowStrong: "rgba(59,130,246,0.16)",
  tint: "rgba(59,130,246,0.05)",
  tintMid: "rgba(59,130,246,0.08)",
  tintStrong: "rgba(59,130,246,0.14)",
} as const;

export const text = {
  primary: "#1A1A2E",
  secondary: "#3A4A5C",
  muted: "#6B7C93",
  placeholder: "#94A3B8",
  highlight: "#000000",
  tertiary: "#6B7C93",
} as const;

export const status = {
  success: { color: "#059669", bg: "rgba(5,150,105,0.08)" },
  warning: { color: "#D97706", bg: "rgba(217,119,6,0.08)" },
  error:   { color: "#DC2626", bg: "rgba(220,38,38,0.08)" },
  info:    { color: "#3B82F6", bg: "rgba(59,130,246,0.08)" },
} as const;

export const module = {
  video:    { color: "#3B82F6", bg: "rgba(59,130,246,0.08)", iconBg: "rgba(59,130,246,0.14)" },
  processing: { color: "#059669", bg: "rgba(5,150,105,0.08)", iconBg: "rgba(5,150,105,0.14)" },
  system:   { color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", iconBg: "rgba(139,92,246,0.14)" },
  other:    { color: "#06B6D4", bg: "rgba(6,182,212,0.08)", iconBg: "rgba(6,182,212,0.14)" },
} as const;

export const moduleColorMap: Record<string, { color: string; bg: string; iconBg: string }> = {
  "#059669": module.video,
  "#8b5cf6": module.system,
  "#ec4899": module.system,
  "#f59e0b": module.other,
};

export const hover = {
  bg: "rgba(59,130,246,0.05)",
  listItem: "rgba(59,130,246,0.07)",
  cardBorder: "rgba(0,0,0,0.12)",
  cardShadow: "0 4px 20px rgba(0,0,0,0.06), 0 0 40px rgba(59,130,246,0.02)",
  btnBg: "rgba(0,0,0,0.03)",
  closeBg: "#e81123",
} as const;

export const particle = {
  baseHue: 215,
  hueRange: 30,
  edgeHue: 260,
} as const;

export const scrollbar = {
  thumb: "rgba(0,0,0,0.08)",
  thumbHover: "rgba(0,0,0,0.14)",
} as const;
