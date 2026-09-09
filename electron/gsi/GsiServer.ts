import http, { IncomingMessage, ServerResponse, Server } from "node:http";

/**
 * CS2 Game State Integration HTTP listener.
 *
 * CS2 posts a JSON snapshot to http://127.0.0.1:<port> (any path) roughly each
 * GSI tick once the user places a gamestate_integration_gmb.cfg in their cfg
 * folder. We only listen on loopback and never expose external endpoints.
 *
 * This is 100% Valve's supported interface: no injection, no memory reading,
 * no anti-cheat interaction.
 */
export interface GsiServerCallbacks {
  onPayload: (body: Record<string, unknown>) => void;
  onFirstContact?: () => void;
  onError?: (err: Error) => void;
}

const MAX_BODY = 4 * 1024 * 1024; // 4 MB safety cap

export class GsiServer {
  private server: Server | null = null;
  private port: number;
  private received = false;
  private callbacks: GsiServerCallbacks;

  constructor(port: number, callbacks: GsiServerCallbacks) {
    this.port = port;
    this.callbacks = callbacks;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.on("error", (err) => {
        this.callbacks.onError?.(err);
        reject(err);
      });
      this.server.listen(this.port, "127.0.0.1", () => {
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
  }

  get isRunning(): boolean {
    return !!this.server;
  }

  get lastContacted(): boolean {
    return this.received;
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("GSI listener expects POST");
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        // Too large => drop so we stay harmless; don't let it crash us.
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK");
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        const body = JSON.parse(raw);
        this.received = true;
        this.callbacks.onFirstContact?.();
        this.callbacks.onPayload(body);
      } catch {
        // Ignore malformed JSON — a single bad push should never crash the app.
      }
    });
    req.on("error", () => {
      try {
        res.writeHead(400);
        res.end();
      } catch {
        /* noop */
      }
    });
  }
}