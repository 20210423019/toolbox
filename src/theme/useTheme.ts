import { useAppStore } from "../store/appStore";
import * as ethereal from "./ethereal";
import * as light from "./light";

/**
 * 根据系统偏好解析实际主题
 * 始终跟随系统设置（浅色/深色）
 */
export function resolveTheme(theme: string): string {
  if (theme === "system" && typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

/**
 * 返回当前系统主题对应的主题常量
 * 始终跟随系统偏好，不再提供手动选择
 */
export function useTheme() {
  const effectiveTheme = resolveTheme("system");

  switch (effectiveTheme) {
    case "light": return light;
    default: return ethereal;
  }
}
