import type { ModuleConfig } from "../types";

export const moduleConfigs: ModuleConfig[] = [
  {
    id: "video",
    label: "视频管理",
    icon: "◆",
    color: "#059669",
    navItems: [
      { id: "video-home", label: "视频库", icon: "📁", pageId: "video-home", description: "浏览和管理视频库" },
      { id: "video-detail", label: "视频详情", icon: "🎬", pageId: "detail", description: "查看视频详细信息" },
      { id: "video-compare", label: "视频对比", icon: "⚖", pageId: "compare", description: "对比多个视频" },
    ],
  },
];
