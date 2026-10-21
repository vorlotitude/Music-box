import type { GameId, UniversalGameEvent } from "../events/GameEvent";
import type { SessionSnapshot } from "../events/GameEvent";
import type { AdapterLegalNotes } from "./legalNotes";

export type AdapterState = "disconnected" | "connecting" | "connected" | "error";

export interface GameAdapterConfig {
  port?: number;
  host?: string;
  autoDetect?: boolean;
  enabled?: boolean;
  /** Any game-specific extra settings. */
  [k: string]: unknown;
}

/**
 * Abstract GameAdapter contract.
 * Future games just implement this interface — core systems don't change.
 */
export interface GameAdapter {
  /** Supported game id. */
  id: GameId;
  /** Human-readable name. */
  name: string;
  state: AdapterState;
  /** Legal / anti-cheat compatibility notes the app must surface (§20). */
  readonly legalNotes: AdapterLegalNotes;

  /** Bootstrap the adapter (bind GSI listener, start detection loops etc). */
  initialize(): Promise<void>;
  /** Shutdown, unbind listeners, clear state. */
  shutdown(): Promise<void>;
  /** Force a connection check (may auto-detect running game). */
  checkConnection(): Promise<AdapterState>;
  /** Latest session statistics. */
  getSnapshot(): SessionSnapshot;
  /** Emit events into this callback. Called by adapter when a new event arrives. */
  onEvent(callback: (event: UniversalGameEvent) => void): void;
  /** Optional: for manual test triggering (used by dev mode). */
  triggerTestEvent?(type: string): void;
  /** Optional: exposes current raw game state (dev logs). */
  getRawState?(): unknown;
  /** Adapter configuration update. */
  configure(config: Partial<GameAdapterConfig>): void;
}

export abstract class BaseGameAdapter implements GameAdapter {
  abstract id: GameId;
  abstract name: string;
  abstract state: AdapterState;
  abstract legalNotes: AdapterLegalNotes;

  protected eventCallbacks: ((e: UniversalGameEvent) => void)[] = [];

  onEvent(callback: (event: UniversalGameEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  protected emit(event: UniversalGameEvent): void {
    for (const cb of this.eventCallbacks) {
      cb(event);
    }
  }

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;
  abstract checkConnection(): Promise<AdapterState>;
  abstract getSnapshot(): SessionSnapshot;
  abstract configure(config: Partial<GameAdapterConfig>): void;
}