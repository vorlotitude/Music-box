import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useSearchParams } from "react-router-dom";
import { Plus, Save, Trash2, X } from "lucide-react";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Button, Card, Pill, Muted, Row } from "../components/ui";
import { GAME_EVENT_TYPES, GameEventType } from "@core/events/GameEvent";
import { Condition, Rule, RuleAction } from "@core/rules/Rule";
import { v4 as uuid } from "uuid";

const PRIORITY_VALUES = [
  ["100", "Match / decisive"],
  ["80", "MVP / Clutch"],
  ["50", "Kill / Death"],
  ["30", "Utility"],
  ["10", "Minor"],
];

const CONDITION_FIELDS = [
  ["session.winStreak", "Win streak"],
  ["session.lossStreak", "Loss streak"],
  ["session.kills", "Kill count"],
  ["session.deaths", "Death count"],
  ["session.health", "Health"],
];

export function RulesPage() {
  const [params] = useSearchParams();
  const boxes = useApp((s) => s.boxes);
  const rules = useApp((s) => s.rules);
  const assets = useApp((s) => s.assets);
  const saveRule = useApp((s) => s.saveRule);
  const removeRule = useApp((s) => s.removeRule);
  const saveBox = useApp((s) => s.saveBox);

  const boxId = params.get("box") ?? boxes[0]?.id ?? "";
  const box = boxes.find((b) => b.id === boxId);

  const boxRuleIds: string[] = useMemo(() => box?.rules ?? [], [box]);
  const boxRules = boxRuleIds.map((id) => rules.find((r) => r.id === id)).filter((x): x is Rule => !!x);

  // Editor state
  const [draftId, setDraftId] = useState<string>("");
  const [name, setName] = useState("");
  const [event, setEvent] = useState<GameEventType>("ROUND_WIN");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [priority, setPriority] = useState(50);
  const [cooldownMs, setCooldownMs] = useState(8000);
  const [route, setRoute] = useState<"SELF_ONLY" | "TEAMMATES" | "BOTH">("SELF_ONLY");
  const [enabled, setEnabled] = useState(true);
  const [assetId, setAssetId] = useState("");
  const [actionType, setActionType] = useState<"PLAY_AUDIO" | "PLAY_RANDOM">("PLAY_AUDIO");

  const editRule = (r: Rule) => {
    setDraftId(r.id); setName(r.name); setEvent(r.event);
    setConditions(r.conditions); setPriority(r.priority); setCooldownMs(r.cooldownMs);
    setRoute(r.route); setEnabled(r.enabled);
    if (r.action.type === "PLAY_AUDIO") {
      setActionType("PLAY_AUDIO"); setAssetId(r.action.assetId);
    } else {
      setActionType("PLAY_RANDOM"); setAssetId((r.action as any).assetIds?.[0] ?? "");
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onDeleteRule = async (r: Rule) => {
    await removeRule(r.id);
    await saveBox({
      ...box!, id: box!.id, name: box!.name, description: box!.description, game: box!.game,
      rules: (box?.rules ?? []).filter((x) => x !== r.id), volume: box!.volume,
      createdAt: box!.createdAt, updatedAt: Date.now(), enabled: box!.enabled,
    });
    await controllerRef.current?.reloadRules();
  };

  const reset = () => {
    setDraftId(""); setName(""); setEvent("ROUND_WIN"); setConditions([]);
    setPriority(50); setCooldownMs(8000); setRoute("SELF_ONLY"); setEnabled(true); setAssetId("");
  };

  const addCondition = () =>
    setConditions([...conditions, { field: "session.winStreak", operator: ">=", value: 2 }]);

  const save = async () => {
    if (!box) { alert("Select or create a music box first."); return; }
    if (!assetId) { alert("Pick an audio reaction in THEN."); return; }
    const action: RuleAction =
      actionType === "PLAY_AUDIO"
        ? { type: "PLAY_AUDIO", assetId }
        : { type: "PLAY_RANDOM", assetIds: assets.filter((a) => a.category === "music").map((a) => a.id).slice(0, 5) };
    const rule: Rule = {
      id: draftId || uuid(), name: name || `${event} reaction`,
      game: "cs2", event, conditions, action,
      priority, cooldownMs, route, enabled,
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    await saveRule(rule);
    // Attach to box.
    const nextBox = { ...box, rules: box.rules, updatedAt: Date.now() };
    if (!nextBox.rules.some((r) => r === rule.id)) {
      nextBox.rules = [...(nextBox.rules ?? []), rule.id];
    } else {
      // When editing an existing rule bound to the box, the rule entry is just
      // the id string; no need to replace (the rule body changed in the
      // rules store, the box is just a reference table).
    }
    await saveBox(nextBox);
    await controllerRef.current?.reloadRules();
    reset();
  };

  useEffect(() => {
    if (actionType === "PLAY_AUDIO" && !assetId && assets.length) setAssetId(assets[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.length]);

  return (
    <div>
      <PageHeader>
        <div>
          <Title>Rules</Title>
          <Subtitle>WHEN an event happens, IF conditions hold, THEN play a reaction. No code required.</Subtitle>
        </div>
        <Row>
          <BoxSelect value={boxId} onChange={(e) => setBoxParam(e.target.value)}>
            {boxes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </BoxSelect>
          <Button onClick={reset} variant="ghost">＋ New Rule</Button>
        </Row>
      </PageHeader>

      {!box ? (
        <Card style={{ margin: "0 20px" }}><Muted>No music box selected. Create one on the Music Boxes page.</Muted></Card>
      ) : boxRules.length > 0 ? (
        <List>
          {boxRules.map((r) => (
            <RuleCard key={r.id}>
              <Pill tone={r.enabled ? "ok" : "dim"}>{r.enabled ? "ON" : "OFF"}</Pill>
              <RuleBody>
                <b>WHEN <em>{pretty(r.event)}</em></b>
                <span>
                  THEN play {assetName(r)} · priority {r.priority} · {Math.round(r.cooldownMs / 1000)}s cooldown
                </span>
              </RuleBody>
              <Row>
                <Button variant="ghost" onClick={() => editRule(r)}>Edit</Button>
                <Button variant="danger" onClick={() => onDeleteRule(r)}><Trash2 /></Button>
              </Row>
            </RuleCard>
          ))}
        </List>
      ) : (
        <Hint>No rules yet for “{box.name}”. Use the builder below.</Hint>
      )}

      <Card style={{ margin: "18px 20px 24px" }}>
        <BuilderTitle>{draftId ? "EDIT RULE" : "NEW RULE"}</BuilderTitle>

        <Section label="WHEN">
          <Select value={event} onChange={(e) => setEvent(e.target.value as GameEventType)}>
            {GAME_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Section>

        <Section label="IF (conditions — optional)">
          {conditions.map((c, i) => (
            <CondRow key={i}>
              <Select value={c.field} onChange={(e) => setCond(i, { ...c, field: e.target.value })}>
                {CONDITION_FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <Select value={c.operator} onChange={(e) => setCond(i, { ...c, operator: e.target.value as any })}>
                {[">", ">=", "<", "<=", "==", "!="].map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
              <NumInput type="number" value={c.value as number} onChange={(e) => setCond(i, { ...c, value: Number(e.target.value) })} />
              <XBtn onClick={() => setConditions(conditions.filter((_, j) => j !== i))}><X size={13} /></XBtn>
            </CondRow>
          ))}
          <AddCond onClick={addCondition}>+ Add condition</AddCond>
        </Section>

        <Section label="THEN">
          <AssetPicker>
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Pick an audio file…</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </Select>
            <Select value={actionType} onChange={(e) => setActionType(e.target.value as any)}>
              <option value="PLAY_AUDIO">Play this file</option>
              <option value="PLAY_RANDOM">Play random from music</option>
            </Select>
          </AssetPicker>
        </Section>

        <MetaGrid>
          <Meta label="Priority">
            <Select value={String(priority)} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITY_VALUES.map(([v, l]) => <option key={v} value={v}>{v} — {l}</option>)}
            </Select>
          </Meta>
          <Meta label="Cooldown">
            <Select value={String(cooldownMs)} onChange={(e) => setCooldownMs(Number(e.target.value))}>
              <option value="0">None</option>
              <option value="2000">2 sec</option>
              <option value="5000">5 sec</option>
              <option value="8000">8 sec</option>
              <option value="15000">15 sec</option>
            </Select>
          </Meta>
          <Meta label="Route">
            <Select value={route} onChange={(e) => setRoute(e.target.value as any)}>
              <option value="SELF_ONLY">Self only</option>
              <option value="TEAMMATES">Teammates</option>
              <option value="BOTH">Both</option>
            </Select>
          </Meta>
          <Meta label="Name">
            <TxtInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" />
          </Meta>
        </MetaGrid>

        <EnableRow>
          <ToggleRow>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <label>Enabled (live)</label>
          </ToggleRow>
          <SaveBtn onClick={save}><Save />{draftId ? "Save Changes" : "Create Rule"}</SaveBtn>
        </EnableRow>
      </Card>
    </div>
  );

  function assetName(r: Rule) {
    const audioId = r.action.type === "PLAY_AUDIO" ? r.action.assetId : null;
    if (audioId) return assets.find((a) => a.id === audioId)?.title ?? audioId;
    return `${(r.action as any).assetIds?.length ?? 0} random tracks`;
  }

  function setCond(i: number, c: Condition) {
    setConditions(conditions.map((x, j) => (j === i ? c : x)));
  }

  function setBoxParam(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("box", id);
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

function pretty(e: string) { return e.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }

const List = styled.div`display: flex; flex-direction: column; gap: 10px; margin: 0 20px;`;
const RuleCard = styled(Card)`display: flex; align-items: center; gap: 12px; padding: 14px 16px;`;
const RuleBody = styled.div`flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 13px; em { color: ${({ theme }) => theme.accent}; font-style: normal; font-weight: 800; } span { color: ${({ theme }) => theme.textSoft}; font-size: 12px; }`;
const Hint = styled(Muted)`margin: 0 20px; font-size: 13px;`;

const BoxSelect = styled.select`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: ${({ theme }) => theme.radiusSm};
  padding: 9px 12px; font-size: 13px; outline: none;
  &:focus { border-color: ${({ theme }) => theme.accent}; }
`;
const Select = styled.select`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: ${({ theme }) => theme.radiusSm};
  padding: 9px 12px; font-size: 13px; outline: none; min-width: 150px;
  &:focus { border-color: ${({ theme }) => theme.accent}; }
`;
const NumInput = styled.input`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: ${({ theme }) => theme.radiusSm};
  padding: 9px 12px; font-size: 13px; outline: none; width: 70px;
  &:focus { border-color: ${({ theme }) => theme.accent}; }
`;
const TxtInput = styled.input`
  background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text};
  border: 1px solid ${({ theme }) => theme.border}; border-radius: ${({ theme }) => theme.radiusSm};
  padding: 9px 12px; font-size: 13px; outline: none; min-width: 160px;
  &:focus { border-color: ${({ theme }) => theme.accent}; }
`;

const BuilderTitle = styled.h3`margin-bottom: 16px; font-size: 16px; color: ${({ theme }) => theme.accentWarm};`;

const SectionLabel = styled.label`display: block; font-size: 11px; color: ${({ theme }) => theme.textDim}; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px;`;

function Section({ label, children }: any) {
  return (
    <div style={{ margin: "0 0 16px" }}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </div>
  );
}

const CondRow = styled.div`display: flex; gap: 8px; margin-bottom: 8px; align-items: center;`;
const AddCond = styled.button`background: none; border: none; color: ${({ theme }) => theme.accent}; font-size: 12px; font-weight: 600; padding: 0;`;
const XBtn = styled.button`background: none; border: none; color: ${({ theme }) => theme.textDim}; display: grid; place-items: center;`;

const AssetPicker = styled.div`display: flex; gap: 8px;`;

const MetaGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 12px 0;`;
const MetaLabel = styled.label`font-size: 11px; color: ${({ theme }) => theme.textDim}; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em;`;
function Meta({ label, children }: any) {
  return <div><MetaLabel>{label}</MetaLabel>{children}</div>;
}

const EnableRow = styled.div`display: flex; align-items: center; justify-content: space-between; margin-top: 8px;`;
const ToggleRow = styled.label`display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${({ theme }) => theme.textSoft}; cursor: pointer;`;
const SaveBtn = styled(Button)`align-self: flex-end;`;