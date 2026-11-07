import { invoke } from "@tauri-apps/api/core";

export interface HardwareInfo {
  osName: string;
  osVersion: string;
  hostname: string;
  arch: string;
  cpuBrand: string;
  cpuCoresPhysical: number;
  cpuCoresLogical: number;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  gpus: string[];
}

export function formatBytesAsGb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

export async function getHardwareInfo(): Promise<HardwareInfo> {
  return invoke<HardwareInfo>("get_hardware_info");
}
