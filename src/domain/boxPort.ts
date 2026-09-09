import { v4 as uuid } from "uuid";
import type { MusicBox, Rule } from "@core/rules/Rule";

/**
 * Portable Music Box export/import.
 *
 * The box carries rule references; the authoritative, runtime rules live in the
 * flat `rules` store. Export merges the box's references with the flat store so
 * the file is self-contained. Import re-creates every id so an imported box (and
 * its rules) never collide with existing records. Asset ids are kept as-is: a
 * rule only resolves a track when that asset exists in the local library, and
 * otherwise degrades gracefully (logged, no crash).
 */

export const BOX_FORMAT = "game-music-box";
export const BOX_VERSION = 1;

export interface BoxExport {
  format: string;
  version: number;
  box: MusicBox;
  rules: Rule[];
}

export function buildBoxExport(box: MusicBox, storeRules: Rule[]): BoxExport {
  // The exported file is self-contained: resolve the box's rule references
  // into full Rule records. The `box` keeps its references (ids) untouched.
  const byId = new Map(storeRules.map((r) => [r.id, r]));
  const rules = (box.rules ?? [])
    .map((id) => byId.get(id))
    .filter((r): r is Rule => !!r);
  return { format: BOX_FORMAT, version: BOX_VERSION, box, rules };
}

/** Parse + validate + re-id an exported box. Returns null when the file is not a Music Box export. */
export function deserializeBoxExport(json: string): { box: MusicBox; rules: Rule[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const d = data as Partial<BoxExport>;
  if (d?.format !== BOX_FORMAT || d.version !== BOX_VERSION) return null;
  if (!d.box || !Array.isArray(d.rules)) return null;

  const now = Date.now();
  const newRules: Rule[] = d.rules.map((r) => ({
    ...r,
    id: uuid(),
    createdAt: now,
    updatedAt: now,
  }));

  const box: MusicBox = {
    ...d.box,
    id: uuid(),
    name: `${d.box.name} (imported)`,
    createdAt: now,
    updatedAt: now,
    // References: the imported box points at the freshly re-id'd rules only.
    rules: newRules.map((r) => r.id),
  };
  return { box, rules: newRules };
}