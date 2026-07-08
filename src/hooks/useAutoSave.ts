import { useState, useRef, useCallback, useEffect } from "react";
import { notify } from "../components/Notification";

export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

export interface AutoSaveOptions {
  
  debounceMs?: number;
  
  savedDurationMs?: number;
  
  showNotification?: boolean;
  
  successTitle?: string;
  
  errorTitle?: string;
}

export interface AutoSaveReturn {
  status: SaveStatus;
  
  markDirty: () => void;
  
  save: () => Promise<void>;
  
  reset: () => void;
}

export function useAutoSave(
  saveFn: () => Promise<void>,
  deps: any[],
  options: AutoSaveOptions = {},
): AutoSaveReturn {
  const { debounceMs = 800, savedDurationMs = 2000, showNotification = false, successTitle = "已保存", errorTitle = "保存失败" } = options;
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const prevDepsRef = useRef(deps);
  useEffect(() => {
    const prev = prevDepsRef.current;
    const changed = deps.some((dep, i) => dep !== prev[i]);
    prevDepsRef.current = deps;
    if (changed) {

      setStatus("unsaved");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(doSave, debounceMs);
    }
  }, deps);

  const doSave = useCallback(async () => {
    setStatus("saving");
    try {
      await saveFnRef.current();
      setStatus("saved");
      if (showNotification) notify({ type: "success", title: successTitle, duration: 2000 });

      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setStatus("idle"), savedDurationMs);
    } catch (e) {
      setStatus("error");
      if (showNotification) notify({ type: "error", title: errorTitle, message: String(e) });
    }
  }, [savedDurationMs, showNotification, successTitle, errorTitle]);

  const markDirty = useCallback(() => {
    setStatus("unsaved");

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSave, debounceMs);
  }, [doSave, debounceMs]);

  const save = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    await doSave();
  }, [doSave]);

  const reset = useCallback(() => {
    setStatus("idle");
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { status, markDirty, save, reset };
}
