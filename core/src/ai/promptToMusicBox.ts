import type { GameEventType } from "../events/GameEvent";
import type { Condition } from "../rules/Rule";

/**
 * §22 AI Music Box Generator — configuration layer only.
 *
 * This is NOT live game-event detection. Given a plain-language request such as
 * "输五把以后给我放最搞笑的音乐" it heuristically maps keywords onto a
 * suggested Music Box (event → reaction rules with priorities/cooldowns). It is
 * fully local, deterministic, and testable; a real model can later replace the
 * keyword matcher behind the same shape without touching the rule engine.
 */

export interface AIGenRule {
  /** Canonical universal event that fires this rule. */
  event: GameEventType;
  /** Human-readable rule name, e.g. "Victory — random". */
  name: string;
  priority: number;
  cooldownMs: number;
  /** Optional numeric condition, e.g. lossStreak >= 5. */
  condition?: Condition;
}

export interface AIGenResult {
  name: string;
  description: string;
  rules: AIGenRule[];
}

interface EventDef {
  event: GameEventType;
  keys: string[];
  priority: number;
  cooldownMs: number;
  label: string;
}

/** (custom score, base priority) — ordered so high-momentum events surface first. */
const EVENTS: EventDef[] = [
  { event: "MVP", keys: ["mvp", "最佳", "比赛主角"], priority: 85, cooldownMs: 8000, label: "MVP" },
  { event: "CLUTCH", keys: ["clutch", "残局", "一打多", "翻盘"], priority: 85, cooldownMs: 8000, label: "Clutch" },
  { event: "ROUND_WIN", keys: ["round win", "回合胜利", "胜利", "打赢", "赢回合"], priority: 95, cooldownMs: 8000, label: "Round Win" },
  { event: "ROUND_LOSS", keys: ["round loss", "回合失败", "输了", "输掉", "输"], priority: 95, cooldownMs: 8000, label: "Round Loss" },
  { event: "HEADSHOT_KILL", keys: ["headshot", "爆头"], priority: 55, cooldownMs: 6000, label: "Headshot" },
  { event: "PLAYER_KILL", keys: ["kill", "击杀"], priority: 50, cooldownMs: 6000, label: "Kill" },
  { event: "PLAYER_ASSIST", keys: ["assist", "助攻"], priority: 20, cooldownMs: 6000, label: "Assist" },
  { event: "BOMB_PLANTED", keys: ["plant", "下包", "安放"], priority: 40, cooldownMs: 8000, label: "Bomb Plant" },
  { event: "BOMB_DEFUSED", keys: ["defuse", "拆包"], priority: 45, cooldownMs: 8000, label: "Bomb Defuse" },
  { event: "GRENADE_THROW", keys: ["grenade", "手雷", "雷"], priority: 30, cooldownMs: 6000, label: "Grenade" },
  { event: "SMOKE_THROW", keys: ["smoke", "烟雾"], priority: 25, cooldownMs: 6000, label: "Smoke" },
  { event: "ROUND_START", keys: ["round start", "开局"], priority: 12, cooldownMs: 6000, label: "Round Start" },
];

const STYLE_KEYS: Array<[string, string[]]> = [
  ["Meme", ["meme", "抽象", "搞笑", "funny", "魔性"]],
  ["Epic", ["epic", "燃", "燃向", "热血"]],
  ["Sad", ["sad", "悲伤", "难受", "emo", "阴间"]],
  ["Chill", ["chill", "轻松", "放松"]],
];

/** Best-effort extraction of a streak number from e.g. "输五把 / 输 5 把 / 连输5把". */
function extractStreakCount(lower: string): number | undefined {
  const m = lower.match(/(?:连输|连赢|输|赢|五|5)\s*(\d+|五|四|三|二|两|一|十)\s*(盘|把|局|次|场)?/);
  if (!m) return undefined;
  const cn: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 十: 10 };
  if (m[1] in cn) return cn[m[1]];
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function generateMusicBoxFromPrompt(prompt: string): AIGenResult {
  const lower = prompt.toLowerCase();
  const rules: AIGenRule[] = [];

  // Collect every event the request mentions (ordered by hit priority).
  for (const def of EVENTS) {
    if (!def.keys.some((k) => lower.includes(k))) continue;
    if (rules.length >= 3) break; // cap to keep a single box actionable
    rules.push({ event: def.event, name: `${def.label} — random`, priority: def.priority, cooldownMs: def.cooldownMs });
  }

  // Split the wording so a "round win AND kill" request yields both.
  const mentionsKill = lower.includes("kill") || lower.includes("击杀");
  const mentionsWin = lower.includes("win") || lower.includes("胜利") || lower.includes("贏");
  if (mentionsKill && mentionsWin && rules.filter((r) => r.event === "ROUND_WIN").length) {
    rules.push({ event: "PLAYER_KILL", name: "Kill — random", priority: 50, cooldownMs: 6000 });
  }

  // Apply a numeric streak condition if the request asks for one (§22 example
  // "输五把以后").
  const lossStreak = extractStreakCount(lower);
  const hasLoss = rules.some((r) => r.event === "ROUND_LOSS");
  if (hasLoss && lossStreak) {
    const loss = rules.find((r) => r.event === "ROUND_LOSS")!;
    loss.condition = { field: "session.lossStreak", operator: ">=", value: lossStreak };
    loss.name = `Loss x${lossStreak} — meme`;
  }

  // No events matched → fall back to a sensible default so the box is always usable.
  if (rules.length === 0) {
    rules.push({ event: "ROUND_WIN", name: "Round Win — random", priority: 95, cooldownMs: 8000 });
  }

  const style = STYLE_KEYS.find(([, keys]) => keys.some((k) => lower.includes(k)));
  const main = rules[0];
  const styleWord = style ? style[0] : "Custom";
  const name = rules.length === 1 ? `${styleWord} ${main.name.replace(/ — random$/, "")}` : `${styleWord} Event Pack`;
  const description = `AI-generated from: "${prompt.trim()}"`;

  return { name, description, rules };
}