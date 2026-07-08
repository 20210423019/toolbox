import { useEffect, useRef } from "react";
import type { ResourceMetrics } from "../hooks/useResourceMetrics";
import { useTheme } from "../theme/useTheme";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  baseSize: number;
  alpha: number;
  baseAlpha: number;
  pulseSpeed: number;
  pulsePhase: number;
  layer: "deep" | "mid" | "surface";
  hue: number;
  life: number;
  maxLife: number;
  trail: { x: number; y: number }[];
}

interface EdgeParticle {
  angle: number;
  speed: number;
  offset: number;
  size: number;
  alpha: number;
  hue: number;
  segment: "top" | "right" | "bottom" | "left";
}

interface Props {
  metrics?: ResourceMetrics;
}

export default function ParticleBackground({ metrics }: Props) {
  const { particle } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let particles: Particle[] = [];
    let edgeParticles: EdgeParticle[] = [];
    let time = 0;
    let hidden = false;

    const LAYER_CONFIG = {
      deep:    { count: 25, speed: 0.06, sizeRange: [0.6, 1.4] as [number, number], alphaRange: [0.1, 0.25] as [number, number], hueOffset: 0 },
      mid:     { count: 20, speed: 0.12, sizeRange: [1.0, 2.2] as [number, number], alphaRange: [0.2, 0.45] as [number, number], hueOffset: 20 },
      surface: { count: 12, speed: 0.2,  sizeRange: [1.6, 3.2] as [number, number], alphaRange: [0.3, 0.6] as [number, number], hueOffset: -10 },
    };
    const BASE_CONNECTION_DIST = 140;
    const MOUSE_RADIUS = 200;
    const MOUSE_FORCE = 0.08;
    const TRAIL_LENGTH = 3;

    function safeNum(v: unknown, fallback: number): number {
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    }

    function getResourceParams() {
      const m: Partial<ResourceMetrics> = metricsRef.current ?? {};
      const cpu = safeNum(m.cpu, 0.15);
      const memory = safeNum(m.memory, 0.35);
      const gpu = safeNum(m.gpu, 0.1);
      const disk = safeNum(m.disk, 0.05);

      const speedMul = 0.5 + cpu * 2.5;
      const chaosMul = 0.3 + cpu * 1.2;

      const countMul = 0.6 + memory * 1.4;
      const sizeMul = 0.7 + memory * 0.6;

      const connectionMul = 0.2 + gpu * 1.6;
      const glowMul = 0.3 + gpu * 1.8;
      const hueShift = -gpu * 20;

      const edgeGlowMul = 0.3 + disk * 2.0;

      return { speedMul, chaosMul, countMul, sizeMul, connectionMul, glowMul, hueShift, edgeGlowMul };
    }

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.parentElement?.clientWidth || window.innerWidth;
      const h = canvas.parentElement?.clientHeight || window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function getSize() {
      const dpr = window.devicePixelRatio || 1;
      return { w: canvas!.width / dpr, h: canvas!.height / dpr };
    }

    function createParticle(layer: "deep" | "mid" | "surface"): Particle {
      const { w, h } = getSize();
      const cfg = LAYER_CONFIG[layer];
      const { sizeMul } = getResourceParams();
      const baseSize = Math.random() * (cfg.sizeRange[1] - cfg.sizeRange[0]) + cfg.sizeRange[0];
      const baseHue = particle.baseHue;
      return {
        x: Math.random() * (w + 60) - 30,
        y: Math.random() * (h + 60) - 30,
        vx: (Math.random() - 0.5) * cfg.speed,
        vy: (Math.random() - 0.5) * cfg.speed,
        size: baseSize * sizeMul,
        baseSize,
        alpha: Math.random() * (cfg.alphaRange[1] - cfg.alphaRange[0]) + cfg.alphaRange[0],
        baseAlpha: Math.random() * (cfg.alphaRange[1] - cfg.alphaRange[0]) + cfg.alphaRange[0],
        pulseSpeed: Math.random() * 0.02 + 0.01,
        pulsePhase: Math.random() * Math.PI * 2,
        layer,
        hue: baseHue + (Math.random() - 0.5) * 20 + cfg.hueOffset,
        life: 0,
        maxLife: Math.random() * 500 + 300,
        trail: [],
      };
    }

    function initParticles() {
      particles = [];
      const { countMul } = getResourceParams();
      for (const layer of ["deep", "mid", "surface"] as const) {
        const baseCount = LAYER_CONFIG[layer].count;
        const actualCount = Math.round(baseCount * countMul);
        for (let i = 0; i < actualCount; i++) {
          particles.push(createParticle(layer));
        }
      }
    }

    function createEdgeParticle(): EdgeParticle {
      const segments: EdgeParticle["segment"][] = ["top", "right", "bottom", "left"];
      const segment = segments[Math.floor(Math.random() * 4)];
      return {
        angle: Math.random(),
        speed: 0.0003 + Math.random() * 0.0004,
        offset: 4 + Math.random() * 16,
        size: 1.2 + Math.random() * 2.0,
        alpha: 0.15 + Math.random() * 0.35,
        hue: particle.edgeHue + (Math.random() - 0.5) * particle.hueRange,
        segment,
      };
    }

    function initEdgeParticles() {
      edgeParticles = [];
      for (let i = 0; i < 30; i++) {
        edgeParticles.push(createEdgeParticle());
      }
    }

    function getEdgePos(p: EdgeParticle, w: number, h: number) {
      const perimeter = 2 * (w + h);
      let pos = p.angle * perimeter;
      let x: number, y: number, nx: number, ny: number;
      if (pos < w) { x = pos; y = 0; nx = 0; ny = -1; }
      else if (pos < w + h) { x = w; y = pos - w; nx = 1; ny = 0; }
      else if (pos < w * 2 + h) { x = w - (pos - w - h); y = h; nx = 0; ny = 1; }
      else { x = 0; y = h - (pos - w * 2 - h); nx = -1; ny = 0; }
      return { x: x + nx * p.offset, y: y + ny * p.offset };
    }

    function onVisibilityChange() {
      hidden = document.hidden;
      if (!hidden) draw();
    }

    function draw() {
      if (hidden) return;
      if (!canvas || !ctx) return;
      const { w, h } = getSize();
      const params = getResourceParams();
      time++;

      ctx.clearRect(0, 0, w, h);
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.life++;

        const pulse = Math.sin(time * p.pulseSpeed + p.pulsePhase) * 0.25 + 0.75;
        p.alpha = p.baseAlpha * pulse;
        p.size = p.baseSize * params.sizeMul * (0.85 + pulse * 0.15);

        const cpuSpeed = params.speedMul;
        const chaos = params.chaosMul;
        p.vx += (Math.random() - 0.5) * 0.01 * chaos;
        p.vy += (Math.random() - 0.5) * 0.01 * chaos;

        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          const repel = force * MOUSE_FORCE * cpuSpeed * (p.layer === "surface" ? 1.2 : p.layer === "mid" ? 0.8 : 0.5);
          p.vx -= (dx / dist) * repel;
          p.vy -= (dy / dist) * repel;
        }

        p.vx *= (0.99 - 0.01 * params.chaosMul);
        p.vy *= (0.99 - 0.01 * params.chaosMul);
        p.x += p.vx * cpuSpeed;
        p.y += p.vy * cpuSpeed;

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > TRAIL_LENGTH) p.trail.shift();

        const margin = 40;
        if (p.x < -margin) p.x = w + margin;
        if (p.x > w + margin) p.x = -margin;
        if (p.y < -margin) p.y = h + margin;
        if (p.y > h + margin) p.y = -margin;

        if (p.life > p.maxLife) {
          particles[i] = createParticle(p.layer);
        }
      }

      for (const ep of edgeParticles) {
        ep.angle += ep.speed * params.speedMul;
        if (ep.angle > 1) ep.angle -= 1;
        ep.alpha = (0.15 + Math.random() * 0.01) + Math.sin(time * 0.02 + ep.angle * 20) * 0.12;
        ep.alpha = Math.max(0.05, ep.alpha);
      }

      const connectable = particles.filter((p) => p.layer !== "deep");
      const connDist = BASE_CONNECTION_DIST * (0.6 + params.connectionMul * 0.4);
      for (let i = 0; i < connectable.length; i++) {
        for (let j = i + 1; j < connectable.length; j++) {
          const a = connectable[i];
          const b = connectable[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < connDist) {
            const t = 1 - dist / connDist;
            const alpha = t * t * 0.18 * params.connectionMul;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            const hue = particle.baseHue + params.hueShift;
            ctx.strokeStyle = `hsla(${hue}, 70%, 55%, ${alpha})`;
            ctx.lineWidth = 0.4 + t * 0.6 * params.connectionMul;
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        const hue = p.hue + params.hueShift;
        const sat = p.layer === "deep" ? 50 : 70;
        const lig = p.layer === "deep" ? 45 : p.layer === "mid" ? 55 : 65;

        const edgeFadeZone = Math.min(w, h) * 0.35;
        const fadeX = Math.min(p.x, w - p.x);
        const fadeY = Math.min(p.y, h - p.y);
        const edgeDist = Math.min(fadeX, fadeY);
        const edgeFactor = Math.min(1, edgeDist / edgeFadeZone);
        const finalAlpha = p.alpha * edgeFactor;

        if (p.layer === "surface" && p.trail.length > 1) {
          for (let t = 0; t < p.trail.length - 1; t++) {
            const trailAlpha = finalAlpha * 0.06 * (t / p.trail.length);
            ctx.beginPath();
            ctx.arc(p.trail[t].x, p.trail[t].y, p.size * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lig}%, ${trailAlpha})`;
            ctx.fill();
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lig}%, ${finalAlpha})`;
        ctx.fill();

        if (p.layer !== "deep") {
          const glowSize = p.size * (p.layer === "surface" ? 5 * params.glowMul : 3 * params.glowMul);
          ctx.beginPath();
          ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lig + 10}%, ${finalAlpha * 0.05 * params.glowMul})`;
          ctx.fill();
        }
      }

      for (const ep of edgeParticles) {
        const pos = getEdgePos(ep, w, h);
        const pulse = Math.sin(time * 0.015 + ep.angle * 15) * 0.3 + 0.7;
        const hue = ep.hue + params.hueShift * 0.5;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, ep.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${ep.alpha * 0.04 * pulse})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, ep.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${ep.alpha * pulse})`;
        ctx.fill();
      }

      for (const p of particles) {
        if (p.layer !== "surface" || p.size < 2.5) continue;
        const flicker = Math.sin(time * p.pulseSpeed * 2 + p.pulsePhase) * 0.5 + 0.5;
        if (flicker < 0.4) continue;

        const fadeZone = Math.min(w, h) * 0.35;
        const fx = Math.min(p.x, w - p.x);
        const fy = Math.min(p.y, h - p.y);
        const ed = Math.min(fx, fy);
        const ef = Math.min(1, ed / fadeZone);
        const spikeAlpha = p.alpha * ef;

        const spikeLen = p.size * 3.5 * flicker;
        const hue = p.hue + params.hueShift;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.strokeStyle = `hsla(${hue}, 80%, 70%, ${spikeAlpha * 0.2 * flicker})`;
        ctx.lineWidth = 0.7;
        for (let a = 0; a < 4; a++) {
          const angle = a * Math.PI / 2 + time * 0.002;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(angle) * spikeLen, Math.sin(angle) * spikeLen);
          ctx.stroke();
        }
        ctx.restore();
      }

      const glowRadius = Math.max(w, h) * 0.45;
      const cornerIntensity = 0.06 + params.glowMul * 0.04;
      const cornerPositions = [[0, 0], [w, 0], [w, h], [0, h]];
      for (let c = 0; c < 4; c++) {
        const [cx, cy] = cornerPositions[c];
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
        const phase = c * Math.PI / 2 + time * 0.003;
        const intensity = cornerIntensity + Math.sin(phase) * 0.02;
        const hue = particle.baseHue + params.hueShift;
        const [r, g, b] = hslToRgb((hue / 360 + 0.5) % 1, 0.6, 0.5);
        grad.addColorStop(0, `rgba(${r},${g},${b},${intensity})`);
        grad.addColorStop(0.4, `rgba(${r},${g},${b},${intensity * 0.3})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      const borderGlow = 0.08 + params.edgeGlowMul * 0.08 + Math.sin(time * 0.005) * 0.03 * params.edgeGlowMul;
      const borderHue = particle.baseHue + params.hueShift;
      const bc = `hsla(${borderHue}, 70%, 55%, `;
      let g: CanvasGradient;

      g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, `${bc}0)`);
      g.addColorStop(0.3 - Math.sin(time * 0.004) * 0.1, `${bc}${borderGlow})`);
      g.addColorStop(0.7 + Math.sin(time * 0.004) * 0.1, `${bc}${borderGlow})`);
      g.addColorStop(1, `${bc}0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, 1.5 * (0.5 + params.edgeGlowMul * 0.5));

      g = ctx.createLinearGradient(0, h, w, h);
      g.addColorStop(0, `${bc}0)`);
      g.addColorStop(0.3 + Math.sin(time * 0.004 + 0.5) * 0.1, `${bc}${borderGlow * 0.8})`);
      g.addColorStop(0.7 - Math.sin(time * 0.004 + 0.5) * 0.1, `${bc}${borderGlow * 0.8})`);
      g.addColorStop(1, `${bc}0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, h - 1.5 * (0.5 + params.edgeGlowMul * 0.5), w, 1.5 * (0.5 + params.edgeGlowMul * 0.5));

      g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `${bc}0)`);
      g.addColorStop(0.3 + Math.sin(time * 0.004 + 1) * 0.1, `${bc}${borderGlow * 0.6})`);
      g.addColorStop(0.7 - Math.sin(time * 0.004 + 1) * 0.1, `${bc}${borderGlow * 0.6})`);
      g.addColorStop(1, `${bc}0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1.5 * (0.5 + params.edgeGlowMul * 0.5), h);

      g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `${bc}0)`);
      g.addColorStop(0.3 + Math.sin(time * 0.004 + 1.5) * 0.1, `${bc}${borderGlow * 0.6})`);
      g.addColorStop(0.7 - Math.sin(time * 0.004 + 1.5) * 0.1, `${bc}${borderGlow * 0.6})`);
      g.addColorStop(1, `${bc}0)`);
      ctx.fillStyle = g;
      ctx.fillRect(w - 1.5 * (0.5 + params.edgeGlowMul * 0.5), 0, 1.5 * (0.5 + params.edgeGlowMul * 0.5), h);

      const vignetteInner = Math.min(w, h) * 0.1;
      const vignetteOuter = Math.max(w, h) * 0.85;
      const vg = ctx.createRadialGradient(w / 2, h / 2, vignetteInner, w / 2, h / 2, vignetteOuter);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(0.5, "rgba(0,0,0,0)");
      vg.addColorStop(0.75, "rgba(0,0,0,0.25)");
      vg.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);

      animationId = requestAnimationFrame(draw);
    }

    function onMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onMouseLeave() { mouseRef.current = { x: -9999, y: -9999 }; }

    resize();
    initParticles();
    initEdgeParticles();
    draw();

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.85,
        }}
      />
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 2,
          opacity: 0.38,
          mixBlendMode: "screen",
        }}
      >
        <defs>
          <linearGradient id="galaxyThread" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(52, 211, 153, 0)" />
            <stop offset="18%" stopColor="rgba(74, 222, 128, 0.16)" />
            <stop offset="45%" stopColor="rgba(187, 247, 208, 0.52)" />
            <stop offset="72%" stopColor="rgba(45, 212, 191, 0.2)" />
            <stop offset="100%" stopColor="rgba(52, 211, 153, 0)" />
          </linearGradient>
          <linearGradient id="galaxyVeil" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(20, 184, 166, 0)" />
            <stop offset="38%" stopColor="rgba(74, 222, 128, 0.1)" />
            <stop offset="62%" stopColor="rgba(220, 252, 231, 0.24)" />
            <stop offset="100%" stopColor="rgba(20, 184, 166, 0)" />
          </linearGradient>
          <radialGradient id="galaxyCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(220, 252, 231, 0.28)" />
            <stop offset="46%" stopColor="rgba(74, 222, 128, 0.1)" />
            <stop offset="100%" stopColor="rgba(22, 163, 74, 0)" />
          </radialGradient>
          <filter id="galaxyGlow" x="-40%" y="-120%" width="180%" height="340%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="0 0 0 0 0.12 0 0 0 0 1 0 0 0 0 0.48 0 0 0 0.8 0"
            />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ellipse cx="730" cy="446" rx="760" ry="118" fill="url(#galaxyCore)" transform="rotate(-18 730 446)" />
        <path d="M -120 675 C 120 520, 310 350, 555 405 S 930 620, 1180 455 S 1430 235, 1580 150" fill="none" stroke="url(#galaxyVeil)" strokeWidth="46" strokeLinecap="round" opacity="0.42" />
        <g filter="url(#galaxyGlow)" fill="none" strokeLinecap="round">
          <path d="M -130 690 C 95 535, 300 350, 560 410 S 930 615, 1185 452 S 1420 235, 1570 135" stroke="url(#galaxyThread)" strokeWidth="1.7" strokeDasharray="12 18">
            <animate attributeName="stroke-dashoffset" from="0" to="-96" dur="18s" repeatCount="indefinite" />
          </path>
          <path d="M -110 620 C 155 455, 345 335, 590 382 S 935 560, 1168 405 S 1390 260, 1560 210" stroke="url(#galaxyThread)" strokeWidth="1" strokeDasharray="7 25" opacity="0.82">
            <animate attributeName="stroke-dashoffset" from="0" to="88" dur="25s" repeatCount="indefinite" />
          </path>
          <path d="M -100 760 C 145 585, 360 450, 625 488 S 965 650, 1215 500 S 1450 330, 1580 320" stroke="url(#galaxyThread)" strokeWidth="0.75" strokeDasharray="2 18" opacity="0.66">
            <animate attributeName="stroke-dashoffset" from="0" to="-74" dur="29s" repeatCount="indefinite" />
          </path>
          <path d="M 35 275 C 270 420, 485 505, 708 455 S 1015 260, 1405 305" stroke="rgba(134, 239, 172, 0.18)" strokeWidth="0.6" strokeDasharray="1 15" opacity="0.92">
            <animate attributeName="stroke-dashoffset" from="0" to="70" dur="22s" repeatCount="indefinite" />
          </path>
          <path d="M 210 895 C 395 705, 560 610, 760 590 S 1115 565, 1460 700" stroke="rgba(45, 212, 191, 0.14)" strokeWidth="0.7" strokeDasharray="4 22" opacity="0.72">
            <animate attributeName="stroke-dashoffset" from="0" to="-80" dur="31s" repeatCount="indefinite" />
          </path>
        </g>

        <g fill="rgba(187, 247, 208, 0.72)">
          <circle cx="118" cy="596" r="0.9" />
          <circle cx="242" cy="486" r="1.1" />
          <circle cx="390" cy="391" r="0.8" />
          <circle cx="558" cy="407" r="1.4" />
          <circle cx="705" cy="455" r="1.7" />
          <circle cx="858" cy="536" r="0.8" />
          <circle cx="1030" cy="536" r="1" />
          <circle cx="1175" cy="450" r="1.3" />
          <circle cx="1325" cy="315" r="0.9" />
          <circle cx="1452" cy="235" r="1.1" />
        </g>
      </svg>
    </>
  );
}


function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
