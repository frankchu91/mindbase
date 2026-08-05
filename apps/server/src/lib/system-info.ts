// apps/server/src/lib/system-info.ts
//
// Hardware profile for local-model recommendation. The server runs on the
// user's machine, so Node's os module sees the real hardware.
import os from 'node:os';

export interface SystemProfile {
  platform: NodeJS.Platform;
  arch: string;
  totalMemGB: number;
  cpuModel: string;
  appleSilicon: boolean;
}

export function systemProfile(): SystemProfile {
  const platform = os.platform();
  const arch = os.arch();
  return {
    platform,
    arch,
    totalMemGB: Math.round(os.totalmem() / 2 ** 30),
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    appleSilicon: platform === 'darwin' && arch === 'arm64',
  };
}
