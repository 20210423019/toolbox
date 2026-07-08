import { isTauri } from "./tauri-invoke";

type UnlistenFn = () => void;
type ListenHandler<T> = (event: { payload: T }) => void;

let _realListen: (<T>(event: string, handler: ListenHandler<T>) => Promise<UnlistenFn>) | null = null;

export async function listen<T>(event: string, handler: ListenHandler<T>): Promise<UnlistenFn> {
  if (!isTauri()) {
    return () => {};
  }

  if (!_realListen) {
    const mod = await import("@tauri-apps/api/event");
    _realListen = mod.listen;
  }

  return _realListen(event, handler);
}
