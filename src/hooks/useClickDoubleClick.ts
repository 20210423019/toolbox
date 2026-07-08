import { useCallback, useRef } from "react";

/**
 * 解决 onClick 与 onDoubleClick 冲突的 Hook。
 *
 * 原理：单击时启动 250ms 延迟，若期间触发双击则取消单击回调。
 * 返回值：[handleClick, handleDoubleClick]，替换元素的 onClick/onDoubleClick。
 */
export function useClickDoubleClick(
  onSingleClick: () => void,
  onDoubleClick: () => void,
  delay = 250,
): [() => void, () => void] {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      // 双击：延迟一下触发双击回调，避免 React 批处理吞掉双击
      requestAnimationFrame(() => onDoubleClick());
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onSingleClick();
    }, delay);
  }, [onSingleClick, onDoubleClick, delay]);

  const handleDoubleClick = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    requestAnimationFrame(() => onDoubleClick());
  }, [onDoubleClick]);

  return [handleClick, handleDoubleClick];
}
