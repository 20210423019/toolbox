import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store/appStore";

export function usePageState<T>(key: string, init: T): [T, (val: T | ((prev: T) => T)) => void] {
  const tabId = useAppStore(s => s.activeTabId);
  const updateTabState = useAppStore(s => s.updateTabState);
  const getTabState = useAppStore(s => s.getTabState);

  const [value, setValueInternal] = useState<T>(init);
  const restoredRef = useRef(false);
  const skipSyncRef = useRef(false);

  // 从 tabState 恢复
  useEffect(() => {
    if (!tabId) return;
    const ts = getTabState(tabId);
    const restored = ts?.pageState?.[key] as T | undefined;
    if (restored !== undefined) {
      skipSyncRef.current = true;
      setValueInternal(restored);
    }
    restoredRef.current = true;
  }, [tabId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 值变化后同步到 tabState（在 useEffect 中，不在 render 中）
  useEffect(() => {
    if (!tabId || !restoredRef.current) return;
    if (skipSyncRef.current) { skipSyncRef.current = false; return; }
    const ts = getTabState(tabId) || {} as any;
    const pageState = ts.pageState ? { ...ts.pageState, [key]: value } : { [key]: value };
    updateTabState(tabId, { pageState } as any);
  }, [value, tabId, key]);

  const setValue = useCallback((valOrFn: T | ((prev: T) => T)) => {
    setValueInternal(valOrFn);
  }, []);

  return [value, setValue];
}
