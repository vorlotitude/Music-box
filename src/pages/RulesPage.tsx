import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { useSearchParams } from "react-router-dom";
import { Plus, Save, Trash2, X } from "lucide-react";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Button, Card, Pill, Muted, Row } from "../components/ui";
import { useT } from "../i18n";
import { GAME_EVENT_TYPES, GameEventType } from "@core/events/GameEvent";
import { Condition, Rule, RuleAction } from "@core/rules/Rule";
import { v4 as uuid } from "uuid";

const PRIORITY_VALUES = ["100", "80", "50", "30", "10"];

const CONDITION_FIELDS = [
  ["session.winStreak", "rules.fWinStreak"],
  ["session.lossStreak", "rules.fLossStreak"],
  ["session.kills", "rules.fKillCount"],
  ["session.deaths", "rules.fDeathCount"],
  ["session.health", "rules.fHealth"],
];

export function RulesPage() {
  const t = useT();
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
  const [hover, setHover] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // §13 Advanced mode: a live JSON preview of the rule being built. This is the
  // anchor for future JSON / expression editing without touching the visual flow.
  const previewJson = useMemo(() => {
    const rule: Record<string, unknown> = {
      id: draftId || "(new)",
      name: name || t("rules.namePattern", { event }),
      game: "cs2",
      event,
      conditions,
      action:
        actionType === "PLAY_AUDIO"
          ? { type: "PLAY_AUDIO", assetId }
          : { type: "PLAY_RANDOM", assetIds: assets.filter((a) => a.category === "music").map((a) => a.id).slice(0, 5) },
      priority,
      cooldownMs,
      route,
      enabled,
    };
    return JSON.stringify(rule, null, 2);
  }, [draftId, name, event, conditions, actionType, assetId, assets, priority, cooldownMs, route, enabled]);

  // §14 "drag to Rule": an asset chip is dragged onto the reaction slot to bind it.
  const onDragStartAsset = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("application/x-gmb-asset", id);
    e.dataTransfer.effectAllowed = "copy";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setHover(true);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("application/x-gmb-asset");
    if (id) setAssetId(id);
    setHover(false);
  };

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
    if (!box) { alert(t("rules.needBox")); return; }
    if (!assetId) { alert(t("rules.needAudio")); return; }
    const action: RuleAction =
      actionType === "PLAY_AUDIO"
        ? { type: "PLAY_AUDIO", assetId }
        : { type: "PLAY_RANDOM", assetIds: assets.filter((a) => a.category === "music").map((a) => a.id).slice(0, 5) };
    const rule: Rule = {
      id: draftId || uuid(), name: name || t("rules.namePattern", { event }),
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
          <Title>{t("rules.title")}</Title>
          <Subtitle>{t("rules.subtitle")}</Subtitle>
        </div>
        <Row>
          <BoxSelect value={boxId} onChange={(e) => setBoxParam(e.target.value)}>
            {boxes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </BoxSelect>
          <Button onClick={reset} variant="ghost">{t("rules.new")}</Button>
        </Row>
      </PageHeader>

      {!box ? (
        <Card style={{ margin: "0 20px" }}><Muted>{t("rules.noBox")}</Muted></Card>
      ) : boxRules.length > 0 ? (
        <List>
          {boxRules.map((r) => (
            <RuleCard key={r.id}>
              <Pill tone={r.enabled ? "ok" : "dim"}>{r.enabled ? t("rules.on") : t("rules.off")}</Pill>
              <RuleBody>
                <b>{t("rules.when", { event: pretty(r.event) })}</b>
                <span>{t("rules.then", { asset: assetName(r), n: r.priority, s: Math.round(r.cooldownMs / 1000) })}</span>
              </RuleBody>
              <Row>
                <Button variant="ghost" onClick={() => editRule(r)}>{t("rules.edit")}</Button>
                <Button variant="danger" onClick={() => onDeleteRule(r)}><Trash2 /></Button>
              </Row>
            </RuleCard>
          ))}
        </List>
      ) : (
        <Hint>{t("rules.noRulesFor", { box: box.name })}</Hint>
      )}

      <Card style={{ margin: "18px 20px 24px" }}>
        <BuilderTitle>{draftId ? t("rules.editTitle") : t("rules.newTitle")}</BuilderTitle>

        <Section label={t("rules.sWhen")}>
          <Select value={event} onChange={(e) => setEvent(e.target.value as GameEventType)}>
            {GAME_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Section>

        <Section label={t("rules.sIf")}>
          {conditions.map((c, i) => (
            <CondRow key={i}>
              <Select value={c.field} onChange={(e) => setCond(i, { ...c, field: e.target.value })}>
                {CONDITION_FIELDS.map(([v, key]) => <option key={v} value={v}>{t(key)}</option>)}
              </Select>
              <Select value={c.operator} onChange={(e) => setCond(i, { ...c, operator: e.target.value as any })}>
                {[">", ">=", "<", "<=", "==", "!="].map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
              <NumInput type="number" value={c.value as number} onChange={(e) => setCond(i, { ...c, value: Number(e.target.value) })} />
              <XBtn onClick={() => setConditions(conditions.filter((_, j) => j !== i))}><X size={13} /></XBtn>
            </CondRow>
          ))}
          <AddCond onClick={addCondition}>{t("rules.addCondition")}</AddCond>
        </Section>

        <Section label={t("rules.sThen")}>
          <AssetPalette>
            {assets.length === 0 && <Muted>{t("rules.importAudioFirst")}</Muted>}
            {assets.map((a) => (
              <DraggableChip
                key={a.id}
                $active={a.id === assetId}
                draggable
                title={a.title}
                onDragStart={(e) => onDragStartAsset(e, a.id)}
                onDragEnd={() => setHover(false)}
              >
                <Grip>{a.title}</Grip><Cat>{a.category}</Cat>
              </DraggableChip>
            ))}
          </AssetPalette>
          <AssetPicker data-testid="then-slot" $hover={hover} onDragOver={onDragOver} onDragLeave={() => setHover(false)} onDrop={onDrop}>
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">{t("rules.pickAudio")}</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </Select>
            <Select value={actionType} onChange={(e) => setActionType(e.target.value as any)}>
              <option value="PLAY_AUDIO">{t("rules.playThisFile")}</option>
              <option value="PLAY_RANDOM">{t("rules.playRandom")}</option>
            </Select>
            {hover && <DropHint>{t("rules.dropToSet")}</DropHint>}
          </AssetPicker>
        </Section>

        <MetaGrid>
          <Meta label={t("rules.fPriority")}>
            <Select value={String(priority)} onChange={(e) => setPriority(Number(e.target.value))}>
              {PRIORITY_VALUES.map((v) => <option key={v} value={v}>{t(`rules.p${v}`)}</option>)}
            </Select>
          </Meta>
          <Meta label={t("rules.fCooldown")}>
            <Select value={String(cooldownMs)} onChange={(e) => setCooldownMs(Number(e.target.value))}>
              <option value="0">{t("rules.cdNone")}</option>
              <option value="2000">{t("rules.cd2")}</option>
              <option value="5000">{t("rules.cd5")}</option>
              <option value="8000">{t("rules.cd8")}</option>
              <option value="15000">{t("rules.cd15")}</option>
            </Select>
          </Meta>
          <Meta label={t("rules.fRoute")}>
            <Select value={route} onChange={(e) => setRoute(e.target.value as any)}>
              <option value="SELF_ONLY">{t("rules.routeSelf")}</option>
              <option value="TEAMMATES">{t("rules.routeTeammates")}</option>
              <option value="BOTH">{t("rules.routeBoth")}</option>
            </Select>
          </Meta>
          <Meta label={t("rules.fName")}>
            <TxtInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("rules.phName")} />
          </Meta>
        </MetaGrid>

        <AdvancedCard $open={showAdvanced}>
          <AdvancedHeader onClick={() => setShowAdvanced(!showAdvanced)}>
            <span>{t("rules.advanced", { chevron: showAdvanced ? "▾" : "▸" })}</span>
            <Muted style={{ fontSize: 11 }}>{t("rules.advancedHint")}</Muted>
          </AdvancedHeader>
          {showAdvanced && (
            <>
              <JsonBlock data-testid="rule-json">{previewJson}</JsonBlock>
              <CopyBtn onClick={() => void navigator.clipboard?.writeText(previewJson)}>{t("rules.copyJson")}</CopyBtn>
            </>
          )}
        </AdvancedCard>

        <EnableRow>
          <ToggleRow>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <label>{t("rules.enabled")}</label>
          </ToggleRow>
          <SaveBtn onClick={save}><Save />{draftId ? t("rules.saveChanges") : t("rules.createRule")}</SaveBtn>
        </EnableRow>
      </Card>
    </div>
  );

  function assetName(r: Rule) {
    const audioId = r.action.type === "PLAY_AUDIO" ? r.action.assetId : null;
    if (audioId) return assets.find((a) => a.id === audioId)?.title ?? audioId;
    return t("rules.randomTracks", { n: (r.action as any).assetIds?.length ?? 0 });
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

const AssetPicker = styled.div<{ $hover: boolean }>`
  display: flex; gap: 8px; flex-wrap: wrap; align-items: center; padding: 10px; border-radius: ${({ theme }) => theme.radiusSm};
  border: 1.5px dashed ${({ theme, $hover }) => ($hover ? theme.accent : theme.border)};
  background: ${({ theme, $hover }) => ($hover ? theme.bgElev2 : "transparent")};
  transition: all .15s;
`;

const AssetPalette = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px;
`;

const DraggableChip = styled.div<{ $active: boolean }>`
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: grab; user-select: none;
  border-radius: ${({ theme }) => theme.radiusSm}; border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.bgElev2}; font-size: 12px;
  color: ${({ theme }) => theme.text};
  box-shadow: ${({ theme, $active }) => ($active ? `0 0 0 1.5px ${theme.accent}` : "none")};
  &:active { cursor: grabbing; }
`;

const Grip = styled.span`font-weight: 600;`;
const Cat = styled.span`font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: ${({ theme }) => theme.textDim};`;
const DropHint = styled.span`font-size: 11px; color: ${({ theme }) => theme.accent}; font-weight: 600;`;

const MetaGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 12px 0;`;
const MetaLabel = styled.label`font-size: 11px; color: ${({ theme }) => theme.textDim}; display: block; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .05em;`;
function Meta({ label, children }: any) {
  return <div><MetaLabel>{label}</MetaLabel>{children}</div>;
}

const EnableRow = styled.div`display: flex; align-items: center; justify-content: space-between; margin-top: 8px;`;
const ToggleRow = styled.label`display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${({ theme }) => theme.textSoft}; cursor: pointer;`;
const SaveBtn = styled(Button)`align-self: flex-end;`;

const AdvancedCard = styled.div<{ $open: boolean }>`
  margin-top: 12px; border-radius: ${({ theme }) => theme.radiusSm}; overflow: hidden;
  border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.bgElev2};
`;
const AdvancedHeader = styled.button`
  width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 12px;
  background: none; border: none; cursor: pointer; color: ${({ theme }) => theme.accentWarm};
  font-weight: 600; font-size: 13px; text-align: left;
`;
const JsonBlock = styled.pre`
  margin: 0; padding: 12px; font-size: 12px; line-height: 1.5; overflow: auto; max-height: 220px;
  color: ${({ theme }) => theme.textSoft}; background: ${({ theme }) => theme.bg};
  border-top: 1px solid ${({ theme }) => theme.border}; border-bottom: 1px solid ${({ theme }) => theme.border};
  white-space: pre; font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
`;
const CopyBtn = styled.button`
  margin: 8px 12px; padding: 6px 12px; font-size: 12px; border-radius: ${({ theme }) => theme.radiusSm};
  border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.bgElev2};
  color: ${({ theme }) => theme.accent}; cursor: pointer; &:hover { background: ${({ theme }) => theme.bg}; }
`;