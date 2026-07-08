import type { TagType } from "../../../types";

const tagTypeMap = new Map<string, TagType>();

export function getTagType(tagId: string): TagType {
  const t = tagTypeMap.get(tagId);
  return t || "text";
}

/** 检查内存 Map 中是否已有该标签的类型记录（用于区分"未设"和"设为 text"） */
export function hasTagType(tagId: string): boolean {
  return tagTypeMap.has(tagId);
}

export function setTagType(tagId: string, type: TagType): void {
  tagTypeMap.set(tagId, type);
}

/** 标签类型配置（全局统一图标设计） */
export const TAG_TYPE_CONFIG: Record<TagType, { value: TagType; label: string; icon: string }> = {
  text: { value: "text", label: "文本", icon: "Aa" },
  path: { value: "path", label: "路径", icon: "📁" },
  url:  { value: "url",  label: "URL",  icon: "🔗" },
};

export const TAG_TYPE_OPTIONS = Object.values(TAG_TYPE_CONFIG);
