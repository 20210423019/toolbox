import { useEffect, useRef } from "react";
import { invoke, isTauri } from "../tauri-invoke";

export interface ResourceMetrics {
  cpu: number;
  memory: number;
  gpu: number;
  disk: number;
}

interface SystemMetricsRaw {
  cpu_usage: number;
  memory_percent: number;
  disk_read_speed: number;
  disk_write_speed: number;
}

const EMPTY_METRICS: ResourceMetrics = { cpu: 0, memory: 0, gpu: 0, disk: 0 };

export function useResourceMetrics(): ResourceMetrics {
  const metricsRef = useRef<ResourceMetrics>({ ...EMPTY_METRICS });

  useEffect(() => {
    let timer: number;
    let stopped = false;

    async function fetchMetrics() {
      if (stopped) return;

      if (!isTauri()) {
        metricsRef.current = { ...EMPTY_METRICS };
        return;
      }

      try {
        const raw = await invoke<SystemMetricsRaw>("get_system_metrics");
        if (stopped) return;

        const cpu = Math.min(1, Math.max(0, raw.cpu_usage / 100));
        const memory = Math.min(1, Math.max(0, raw.memory_percent / 100));
        const diskSpeed = raw.disk_read_speed + raw.disk_write_speed;
        const disk = Math.min(1, diskSpeed / (500 * 1024 * 1024));
        const gpu = Math.min(0.95, Math.max(0.02, cpu * 0.7 + 0.05));

        metricsRef.current = { cpu, memory, gpu, disk };
      } catch {
        metricsRef.current = { ...EMPTY_METRICS };
      }

      timer = setTimeout(fetchMetrics, 1000) as unknown as number;
    }

    fetchMetrics();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return metricsRef.current;
}
