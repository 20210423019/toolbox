/**
 * 文本截断工具
 *
 * 为所有文本显示区域提供统一的截断样式：
 * - 固定最大宽度，超出隐藏
 * - 省略号 ...
 * - 禁止换行
 * - title 属性悬停显示完整内容
 */

/** 全局 CSS 插入 */
export function injectTruncateCSS() {
  if (typeof document === "undefined") return;
  const id = "truncate-style";
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .text-ellipsis {
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      max-width: 180px;
    }
    .text-ellipsis:hover {
      overflow: auto !important;
    }
  `;
  document.head.appendChild(style);
}
