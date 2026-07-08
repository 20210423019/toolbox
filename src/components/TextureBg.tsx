import { CSSProperties } from "react";

// ── 高级 SVG 纹理图案 ──
// 通过多层/渐变/曲线构建有质感的底纹

const PATTERNS = {

  /** ① 数字噪点 — 模拟 macOS 质感 72×72 区域散布 60 个变径点 */
  noise: `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
    <circle cx="7" cy="5" r="0.6" fill="currentColor" opacity="0.6"/>
    <circle cx="20" cy="12" r="0.4" fill="currentColor" opacity="0.4"/>
    <circle cx="35" cy="3" r="0.7" fill="currentColor" opacity="0.5"/>
    <circle cx="50" cy="8" r="0.3" fill="currentColor" opacity="0.3"/>
    <circle cx="65" cy="15" r="0.5" fill="currentColor" opacity="0.6"/>
    <circle cx="12" cy="25" r="0.5" fill="currentColor" opacity="0.5"/>
    <circle cx="28" cy="20" r="0.3" fill="currentColor" opacity="0.3"/>
    <circle cx="42" cy="28" r="0.6" fill="currentColor" opacity="0.4"/>
    <circle cx="58" cy="22" r="0.4" fill="currentColor" opacity="0.5"/>
    <circle cx="68" cy="35" r="0.7" fill="currentColor" opacity="0.4"/>
    <circle cx="5" cy="40" r="0.4" fill="currentColor" opacity="0.3"/>
    <circle cx="18" cy="48" r="0.6" fill="currentColor" opacity="0.5"/>
    <circle cx="32" cy="40" r="0.3" fill="currentColor" opacity="0.4"/>
    <circle cx="48" cy="55" r="0.5" fill="currentColor" opacity="0.6"/>
    <circle cx="60" cy="48" r="0.4" fill="currentColor" opacity="0.3"/>
    <circle cx="8" cy="60" r="0.5" fill="currentColor" opacity="0.4"/>
    <circle cx="22" cy="65" r="0.7" fill="currentColor" opacity="0.5"/>
    <circle cx="38" cy="60" r="0.3" fill="currentColor" opacity="0.3"/>
    <circle cx="52" cy="68" r="0.6" fill="currentColor" opacity="0.5"/>
    <circle cx="66" cy="62" r="0.4" fill="currentColor" opacity="0.4"/>
    <circle cx="14" cy="15" r="0.2" fill="currentColor" opacity="0.3"/>
    <circle cx="45" cy="35" r="0.2" fill="currentColor" opacity="0.3"/>
    <circle cx="30" cy="55" r="0.2" fill="currentColor" opacity="0.2"/>
    <circle cx="55" cy="40" r="0.2" fill="currentColor" opacity="0.3"/>
    <circle cx="40" cy="8" r="0.2" fill="currentColor" opacity="0.2"/>
    <circle cx="25" cy="35" r="0.25" fill="currentColor" opacity="0.25"/>
    <circle cx="10" cy="50" r="0.35" fill="currentColor" opacity="0.35"/>
    <circle cx="62" cy="5" r="0.3" fill="currentColor" opacity="0.3"/>
    <circle cx="35" cy="48" r="0.45" fill="currentColor" opacity="0.35"/>
    <circle cx="15" cy="32" r="0.2" fill="currentColor" opacity="0.2"/>
    <circle cx="48" cy="15" r="0.35" fill="currentColor" opacity="0.3"/>
    <circle cx="3" cy="70" r="0.25" fill="currentColor" opacity="0.2"/>
    <circle cx="70" cy="28" r="0.4" fill="currentColor" opacity="0.35"/>
    <circle cx="55" cy="58" r="0.3" fill="currentColor" opacity="0.25"/>
    <circle cx="42" cy="70" r="0.25" fill="currentColor" opacity="0.2"/>
  </svg>`,

  /** ② 波纹 — 水波/声波等高线 3 层叠加 */
  waves: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40">
    <path d="M0 20 Q10 8 20 20 Q30 32 40 20 Q50 8 60 20 Q70 32 80 20" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.3"/>
    <path d="M0 14 Q10 2 20 14 Q30 26 40 14 Q50 2 60 14 Q70 26 80 14" fill="none" stroke="currentColor" stroke-width="0.25" opacity="0.2"/>
    <path d="M0 26 Q10 14 20 26 Q30 38 40 26 Q50 14 60 26 Q70 38 80 26" fill="none" stroke="currentColor" stroke-width="0.25" opacity="0.2"/>
    <path d="M0 8 Q10 -4 20 8 Q30 20 40 8 Q50 -4 60 8 Q70 20 80 8" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.12"/>
    <path d="M0 32 Q10 20 20 32 Q30 44 40 32 Q50 20 60 32 Q70 44 80 32" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.12"/>
  </svg>`,

  /** ③ 等高线 — 拓扑地图风格环绕圆 */
  topo: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <circle cx="48" cy="16" r="4" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.25"/>
    <circle cx="48" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="0.25" opacity="0.2"/>
    <circle cx="48" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.15"/>
    <circle cx="48" cy="16" r="22" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.1"/>
    <circle cx="12" cy="48" r="6" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.2"/>
    <circle cx="12" cy="48" r="12" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.15"/>
    <circle cx="12" cy="48" r="20" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.1"/>
    <circle cx="12" cy="48" r="30" fill="none" stroke="currentColor" stroke-width="0.15" opacity="0.06"/>
    <circle cx="28" cy="28" r="3" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.2"/>
    <circle cx="28" cy="28" r="7" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.12"/>
    <circle cx="28" cy="28" r="13" fill="none" stroke="currentColor" stroke-width="0.15" opacity="0.08"/>
  </svg>`,

  /** ④ 十字星光 — 极细十字放射 */
  starburst: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M16 0v32M0 16h32" stroke="currentColor" stroke-width="0.3" opacity="0.25"/>
    <path d="M6 6l4 4M20 6l-4 4M6 20l4-4M20 20l-4-4" stroke="currentColor" stroke-width="0.25" opacity="0.2"/>
    <circle cx="16" cy="16" r="1" fill="currentColor" opacity="0.3"/>
    <circle cx="0" cy="0" r="0.5" fill="currentColor" opacity="0.15"/>
    <circle cx="32" cy="0" r="0.5" fill="currentColor" opacity="0.15"/>
    <circle cx="0" cy="32" r="0.5" fill="currentColor" opacity="0.15"/>
    <circle cx="32" cy="32" r="0.5" fill="currentColor" opacity="0.15"/>
  </svg>`,

  /** ⑤ 织物编织 — 经纬交错 */
  weave: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <rect x="0" y="0" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.2"/>
    <rect x="12" y="0" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.15"/>
    <rect x="0" y="12" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.15"/>
    <rect x="12" y="12" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.2"/>
  </svg>`,

  /** ⑥ 同心圆环 — 雷达扫描 */
  rings: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="2" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.25"/>
    <circle cx="24" cy="24" r="5" fill="none" stroke="currentColor" stroke-width="0.25" opacity="0.2"/>
    <circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.15"/>
    <circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="0.18" opacity="0.1"/>
    <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" stroke-width="0.15" opacity="0.06"/>
  </svg>`,

  /** ⑦ 交叉斜纹 — 双方向45度线 */
  herringbone: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">
    <path d="M0 4L4 0M4 8L8 4M8 12L12 8M12 16L16 12M16 20L20 16" stroke="currentColor" stroke-width="0.25" opacity="0.2"/>
    <path d="M4 0L0 4M8 4L4 8M12 8L8 12M16 12L12 16M20 16L16 20" stroke="currentColor" stroke-width="0.2" opacity="0.15"/>
    <path d="M0 -4L-4 0M-4 4L0 0M20 4L24 0M24 8L20 4" stroke="currentColor" stroke-width="0.2" opacity="0.12"/>
  </svg>`,

  /** ⑧ 渐变圆点 — 大小交替排列的圆点群 */
  polka: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="14" viewBox="0 0 28 14">
    <circle cx="7" cy="7" r="1.2" fill="currentColor" opacity="0.2"/>
    <circle cx="21" cy="7" r="1.2" fill="currentColor" opacity="0.2"/>
    <circle cx="14" cy="0" r="0.6" fill="currentColor" opacity="0.12"/>
    <circle cx="14" cy="14" r="0.6" fill="currentColor" opacity="0.12"/>
    <circle cx="0" cy="0" r="0.4" fill="currentColor" opacity="0.08"/>
    <circle cx="0" cy="14" r="0.4" fill="currentColor" opacity="0.08"/>
    <circle cx="28" cy="0" r="0.4" fill="currentColor" opacity="0.08"/>
    <circle cx="28" cy="14" r="0.4" fill="currentColor" opacity="0.08"/>
  </svg>`,

  /** ⑨ 流线 — 平行流动曲线 */
  streamline: `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="20" viewBox="0 0 60 20">
    <path d="M0 10 C15 0 30 20 45 10 C50 6 55 8 60 10" fill="none" stroke="currentColor" stroke-width="0.3" opacity="0.2"/>
    <path d="M0 6 C15 -4 30 16 45 6 C50 2 55 4 60 6" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.12"/>
    <path d="M0 14 C15 4 30 24 45 14 C50 10 55 12 60 14" fill="none" stroke="currentColor" stroke-width="0.2" opacity="0.12"/>
    <path d="M0 2 C15 -8 30 12 45 2 C50 -2 55 0 60 2" fill="none" stroke="currentColor" stroke-width="0.15" opacity="0.08"/>
    <path d="M0 18 C15 8 30 28 45 18 C50 14 55 16 60 18" fill="none" stroke="currentColor" stroke-width="0.15" opacity="0.08"/>
  </svg>`,

  /** ⑩ 星空 — 大小疏密不同的点阵 */
  stardust: `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <circle cx="12" cy="8" r="1" fill="currentColor" opacity="0.25"/>
    <circle cx="45" cy="15" r="0.8" fill="currentColor" opacity="0.2"/>
    <circle cx="8" cy="35" r="0.6" fill="currentColor" opacity="0.18"/>
    <circle cx="52" cy="42" r="1.2" fill="currentColor" opacity="0.22"/>
    <circle cx="30" cy="5" r="0.4" fill="currentColor" opacity="0.12"/>
    <circle cx="55" cy="50" r="0.5" fill="currentColor" opacity="0.15"/>
    <circle cx="5" cy="52" r="0.7" fill="currentColor" opacity="0.18"/>
    <circle cx="38" cy="30" r="0.3" fill="currentColor" opacity="0.1"/>
    <circle cx="18" cy="22" r="0.5" fill="currentColor" opacity="0.15"/>
    <circle cx="50" cy="5" r="0.4" fill="currentColor" opacity="0.12"/>
    <circle cx="25" cy="45" r="0.6" fill="currentColor" opacity="0.15"/>
    <circle cx="35" cy="55" r="0.3" fill="currentColor" opacity="0.1"/>
    <circle cx="15" cy="55" r="0.4" fill="currentColor" opacity="0.12"/>
    <circle cx="42" cy="8" r="0.3" fill="currentColor" opacity="0.1"/>
    <circle cx="3" cy="18" r="0.5" fill="currentColor" opacity="0.15"/>
    <circle cx="57" cy="28" r="0.4" fill="currentColor" opacity="0.12"/>
    <circle cx="22" cy="15" r="0.2" fill="currentColor" opacity="0.08"/>
    <circle cx="48" cy="35" r="0.2" fill="currentColor" opacity="0.08"/>
    <circle cx="10" cy="45" r="0.3" fill="currentColor" opacity="0.1"/>
    <circle cx="40" cy="48" r="0.25" fill="currentColor" opacity="0.08"/>
  </svg>`,
};

/** 组件内部纹理背景层 */
export function TextureLayer({ type = "noise", opacity = 0.05, color = "currentColor" }: { type?: keyof typeof PATTERNS; opacity?: number; color?: string }) {
  const svg = PATTERNS[type];
  return (
    <div
      className="texture-layer"
      aria-hidden="true"
      style={{
        position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        opacity,
        color,
      }}
    />
  );
}
