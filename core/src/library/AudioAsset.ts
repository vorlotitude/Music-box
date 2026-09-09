export type AssetCategory = "music" | "sfx" | "voice" | "imported";

/** A locally-referenced audio file. App stores path + metadata only. */
export interface AudioAsset {
  id: string;
  /** Absolute local file path. */
  filePath: string;
  title: string;
  artist?: string;
  album?: string;
  /** Duration in seconds if known. */
  duration?: number;
  genre?: string;
  tags: string[];
  /** Optional absolute path to cover image. */
  coverPath?: string;
  /** Category within the library tree. */
  category: AssetCategory;
  /** Default playback volume 0..1. */
  volume: number;
  /** Default fade-in ms. */
  fadeInMs?: number;
  /** Default fade-out ms. */
  fadeOutMs?: number;
  favorite: boolean;
  /** ms timestamp when added. */
  addedAt: number;
  /** ms timestamp of last playback, for "recently played". */
  lastPlayedAt?: number;
  /** Stats counters. */
  playCount: number;
  /** Mongo-like metadata blob for forward-compat (advanced mode). */
  meta?: Record<string, unknown>;
}

export interface PlaybackHistoryEntry {
  id: string;
  assetId: string;
  ruleId?: string;
  boxId?: string;
  event?: string;
  game?: string;
  startedAt: number;
  endedAt?: number;
  /** 0..1 volume actually used. */
  volume: number;
}