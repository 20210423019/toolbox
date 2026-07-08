// 小说状态徽章 — 使用硬编码颜色，与主题无关

/**
 * 小说绑定状态类型
 * none     — 无小说绑定
 * novel    — 已绑定小说，无音频
 * audio    — 已绑定小说且有音频
 */
export type NovelStatus = "none" | "novel" | "audio";

interface Props {
  status: NovelStatus;
  size?: number;
}

const STATUS_CONFIG: Record<Exclude<NovelStatus, "none">, {
  label: string; icon: string; gradient: string; shadow: string; glowColor: string;
}> = {
  novel: {
    label: "小说",
    icon: "📄",
    gradient: "linear-gradient(135deg, #6366f1, #4f46e5)",
    shadow: "rgba(99,102,241,0.4)",
    glowColor: "rgba(99,102,241,0.2)",
  },
  audio: {
    label: "音频",
    icon: "🎵",
    gradient: "linear-gradient(135deg, #059669, #047857)",
    shadow: "rgba(5,150,105,0.4)",
    glowColor: "rgba(5,150,105,0.25)",
  },
};

export default function NovelStatusBadge({ status, size = 14 }: Props) {
  if (status === "none") return null;

  const cfg = STATUS_CONFIG[status];
  const isAudio = status === "audio";

  // 根据尺寸匹配对应格式徽章的规格
  const badgePadding = size >= 13 ? "2px 7px" : size >= 11 ? "1px 5px" : "1px 4px";
  const badgeFontSize = size >= 13 ? 9 : size >= 11 ? 8 : 7;

  return (
    <>
      {isAudio && (
        <style>{`
          @keyframes novel-glow-pulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.08); }
          }
        `}</style>
      )}
      <span
        title={status === "audio" ? "已绑定小说 · 有音频" : "已绑定小说"}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          padding: badgePadding,
          borderRadius: 4,
          fontSize: badgeFontSize,
          fontWeight: 600,
          lineHeight: `${badgeFontSize + 6}px`,
          background: cfg.gradient,
          color: "#fff",
          whiteSpace: "nowrap" as const,
          userSelect: "none" as const,
          boxShadow: `0 1px 4px ${cfg.shadow}`,
        }}
      >
        {isAudio && (
          <span
            style={{
              position: "absolute",
              inset: -2,
              borderRadius: 6,
              border: `1.5px solid ${cfg.glowColor}`,
              animation: "novel-glow-pulse 2s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        )}
        {cfg.icon}
        <span>{cfg.label}</span>
      </span>
    </>
  );
}
