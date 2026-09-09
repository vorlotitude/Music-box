import fs from "node:fs";
import path from "node:path";

/**
 * Simple, dependency-free persisted document store.
 *
 * The product spec prefers SQLite; this environment lacks a C++ toolchain to
 * build native SQLite bindings, and Electron 33 bundles Node 20 (no node:sqlite).
 * So for the MVP we persist to a single JSON file behind a Repository-style API.
 * Swapping in a real SQLite later requires only re-implementing this class —
 * the rest of the app talks to the generic Repository interface.
 */
export type CollectionName = "assets" | "boxes" | "rules" | "settings" | "history";

export interface Repository {
  all(collection: CollectionName): unknown[];
  get(collection: CollectionName, id: string): unknown | undefined;
  put(collection: CollectionName, id: string, doc: unknown): void;
  remove(collection: CollectionName, id: string): void;
  clear(collection: CollectionName): void;
}

export interface JsonStoreOptions {
  filePath: string;
  logger?: (msg: string) => void;
}

export class JsonStore implements Repository {
  private data: Record<CollectionName, Record<string, unknown>> = {
    assets: {},
    boxes: {},
    rules: {},
    settings: {},
    history: {},
  };
  private filePath: string;
  private logger: (msg: string) => void;

  constructor(opts: JsonStoreOptions) {
    this.filePath = opts.filePath;
    this.logger = opts.logger ?? (() => {});
    this.load();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.write();
        return;
      }
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      this.data = Object.assign(this.data, raw);
    } catch (e) {
      // A corrupt store must never crash the app — start fresh and note it.
      this.logger(`JsonStore: failed to load (${(e as Error).message}), starting fresh`);
      this.data = {
        assets: {}, boxes: {}, rules: {}, settings: {}, history: {},
      };
    }
  }

  private write(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (e) {
      this.logger(`JsonStore: write failed (${(e as Error).message})`);
    }
  }

  all(collection: CollectionName): unknown[] {
    return Object.values(this.data[collection] ?? {});
  }

  get(collection: CollectionName, id: string): unknown | undefined {
    return this.data[collection]?.[id];
  }

  put(collection: CollectionName, id: string, doc: unknown): void {
    if (!this.data[collection]) this.data[collection] = {};
    this.data[collection][id] = doc;
    this.write();
  }

  remove(collection: CollectionName, id: string): void {
    delete this.data[collection]?.[id];
    this.write();
  }

  clear(collection: CollectionName): void {
    this.data[collection] = {};
    this.write();
  }

  getPath(): string {
    return this.filePath;
  }
}