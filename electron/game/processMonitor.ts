import { execFile } from "node:child_process";

/**
 * Detect whether a game process is running, using only the OS process table
 * (Get-Process / tasklist). This is non-invasive: we read process names, not
 * game memory, and only to know whether the game is up.
 */
export class ProcessMonitor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling: boolean;
  private lastKnown = new Map<number, boolean>();

  constructor(
    private names: string[],
    private onChange: (running: boolean, processName?: string) => void,
    private onError?: (err: Error) => void,
    /** Injectable process probe (defaults to the OS tasklist). */
    private probe: (names: string[]) => Promise<Set<string>> = getRunningProcess,
  ) {
    this.polling = false;
  }

  start(intervalMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), intervalMs);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const found = await this.probe(this.names);
      for (let i = 0; i < this.names.length; i++) {
        const name = this.names[i];
        const running = found.has(name);
        if (this.lastKnown.get(i) !== running) {
          this.lastKnown.set(i, running);
          this.onChange(running, running ? name : undefined);
        }
      }
    } catch (e) {
      this.onError?.(e as Error);
    } finally {
      this.polling = false;
    }
  }
}

/** Build a Set of.exe names that are currently running (no .exe, lowercased). */
export function getRunningProcess(names: string[]): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    execFile(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Get-Process | Select-Object -ExpandProperty ProcessName"],
      { windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          // "No process matches" is not a hard error for us.
          return resolve(new Set());
        }
        const running = new Set<string>();
        for (const line of stdout.split(/\r?\n/)) {
          const name = line.trim().toLowerCase();
          if (name) running.add(name);
        }
        const wanted = new Set(names.map((n) => n.toLowerCase().replace(/\.exe$/, "")));
        const matched = names.filter((n) => running.has(n.toLowerCase().replace(/\.exe$/, "")));
        const result = new Set(wanted);
        // We only care about matched ones; carry over to caller-shaped API.
        return resolve(new Set(matched));
      },
    );
  });
}