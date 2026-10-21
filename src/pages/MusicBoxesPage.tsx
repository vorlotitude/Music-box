import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Plus, Trash2, Copy, Settings2, Box as BoxIcon, Download, Upload, Sparkles, X } from "lucide-react";
import { useApp } from "../state/useApp";
import { PageHeader, Title, Subtitle, Button, Grid, Card, Pill, Muted, Row } from "../components/ui";
import { useT } from "../i18n";
import { v4 as uuid } from "uuid";
import type { MusicBox, Rule } from "@core/rules/Rule";
import type { AudioRoute } from "@core/events/GameEvent";
import { generateMusicBoxFromPrompt, type AIGenResult } from "@core/ai/promptToMusicBox";

export function MusicBoxesPage() {
  const t = useT();
  const boxes = useApp((s) => s.boxes);
  const rules = useApp((s) => s.rules);
  const assets = useApp((s) => s.assets);
  const saveBox = useApp((s) => s.saveBox);
  const saveRule = useApp((s) => s.saveRule);
  const removeBox = useApp((s) => s.removeBox);
  const exportBox = useApp((s) => s.exportBox);
  const importBoxFromFile = useApp((s) => s.importBoxFromFile);
  const navigate = useNavigate();

  // §22 AI Music Box Generator — config-layer box suggestions from a prompt.
  const [aiOpen, setAiOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<AIGenResult | null>(null);

  const createBox = async () => {
    const now = Date.now();
    const box: MusicBox = {
      id: uuid(), name: t("boxes.newName", { n: boxes.length + 1 }), description: "",
      game: "cs2", rules: [], volume: 0.8, enabled: true, createdAt: now, updatedAt: now,
    };
    await saveBox(box);
    navigate(`/rules?box=${box.id}`);
  };

  const duplicate = async (b: MusicBox) => {
    const now = Date.now();
    // Deep-copy each referenced rule with a fresh id, then link the copy to it.
    const ruleMap = new Map(rules.map((r) => [r.id, r]));
    const newRuleIds: string[] = [];
    for (const id of b.rules ?? []) {
      const src = ruleMap.get(id);
      if (!src) continue;
      const copy = { ...src, id: uuid(), name: t("boxes.copySuffix", { name: src.name }), createdAt: now, updatedAt: now };
      await saveRule(copy);
      newRuleIds.push(copy.id);
    }
    await saveBox({
      ...b, id: uuid(), name: t("boxes.copySuffix", { name: b.name }),
      rules: newRuleIds,
      createdAt: now, updatedAt: now,
    });
  };

  const onDelete = async (b: MusicBox) => {
    if (confirm(t("boxes.deleteConfirm", { name: b.name }))) await removeBox(b.id);
  };

  const generate = () => {
    if (!prompt.trim()) return;
    setDraft(generateMusicBoxFromPrompt(prompt));
  };

  const applyAiBox = async () => {
    if (!draft) return;
    const now = Date.now();
    // Pre-fill random-target slots with the library's music tracks so the box
    // is ready to play; the user can rebind exact tracks in the Rule editor.
    const assetIds = assets.filter((a) => a.category === "music").map((a) => a.id);
    const box: MusicBox = {
      id: uuid(), name: draft.name, description: draft.description, game: "cs2",
      rules: [], enabled: true, createdAt: now, updatedAt: now,
    };
    const ruleIds: string[] = [];
    for (const g of draft.rules) {
      const rule: Rule = {
        id: uuid(), name: g.name, game: "cs2", event: g.event,
        conditions: g.condition ? [g.condition] : [],
        action: { type: "PLAY_RANDOM", assetIds },
        priority: g.priority, cooldownMs: g.cooldownMs, route: "SELF_ONLY" as AudioRoute,
        enabled: true, createdAt: now, updatedAt: now,
      };
      await saveRule(rule);
      ruleIds.push(rule.id);
    }
    await saveBox({ ...box, rules: ruleIds });
    setAiOpen(false);
    setPrompt("");
    setDraft(null);
    navigate(`/rules?box=${box.id}`);
  };

  return (
    <div>
      <PageHeader>
        <div>
          <Title>{t("boxes.title")}</Title>
          <Subtitle>{t("boxes.subtitle")}</Subtitle>
        </div>
        <Row>
          <Button variant="ghost" onClick={importBoxFromFile}><Upload />{t("boxes.import")}</Button>
          <Button variant="ghost" onClick={() => setAiOpen(true)}><Sparkles />{t("boxes.aiGenerate")}</Button>
          <Button onClick={createBox}><Plus />{t("boxes.new")}</Button>
        </Row>
      </PageHeader>

      {boxes.length === 0 ? (
        <Card style={{ margin: "0 20px" }}>
          <Muted>{t("boxes.empty")}</Muted>
        </Card>
      ) : (
        <Grid>
          {boxes.map((b) => (
            <BoxCard key={b.id}>
              <BoxHead>
                <BoxIcon size={16} />
                <PosLabel>{b.enabled ? t("boxes.active") : t("boxes.off")}</PosLabel>
              </BoxHead>
              <BoxTitle>{b.name}</BoxTitle>
              <BoxDesc>{b.description || t("boxes.noDescription")}</BoxDesc>
              <RuleCount>{t("boxes.stats", { rules: b.rules.length, active: b.rules.filter((id) => rules.find((r) => r.id === id)?.enabled).length })}</RuleCount>
              <Actions>
                <Button variant="ghost" onClick={() => navigate(`/rules?box=${b.id}`)}><Settings2 />{t("boxes.edit")}</Button>
                <Button variant="ghost" onClick={() => duplicate(b)}><Copy />{t("boxes.copy")}</Button>
                <Button variant="ghost" onClick={() => exportBox(b.id)}><Download />{t("boxes.export")}</Button>
                <Button variant="danger" onClick={() => onDelete(b)}><Trash2 />{t("boxes.delete")}</Button>
              </Actions>
            </BoxCard>
          ))}
        </Grid>
      )}
      <Note style={{ margin: "18px 20px 12px" }}>{t("boxes.tip")}</Note>

      {aiOpen && (
        <ModalOverlay onClick={() => setAiOpen(false)}>
          <ModalCard onClick={(e) => e.stopPropagation()}>
            <AiHead>
              <div>
                <AiTitle><Sparkles size={15} /> {t("boxes.aiTitle")}</AiTitle>
                <AiSub>{t("boxes.aiSubtitle")}</AiSub>
              </div>
              <button className="x" onClick={() => setAiOpen(false)}><X size={15} /></button>
            </AiHead>
            <AiBody>
              <PromptInput
                data-testid="ai-prompt"
                placeholder={t("boxes.aiPlaceholder")}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <Row style={{ justifyContent: "flex-end" }}>
                <Button variant="ghost"  onClick={generate} disabled={!prompt.trim()}>{t("boxes.generate")}</Button>
              </Row>

              {draft && (
                <PrevCard data-testid="ai-preview">
                  <PrevTitle><strong>{draft.name}</strong></PrevTitle>
                  {draft.rules.map((r) => (
                    <PrevRow key={r.event}>
                      <code>{r.event}</code>
                      <span>{t("boxes.priority", { n: r.priority })}</span>
                      <span>{t("boxes.cooldown", { n: Math.round(r.cooldownMs / 1000) })}</span>
                      {r.condition && <Pill tone="accent">{r.condition.field} {r.condition.operator} {r.condition.value}</Pill>}
                    </PrevRow>
                  ))}
                </PrevCard>
              )}

              <AiActions>
                <Button variant="ghost"  onClick={() => setAiOpen(false)}>{t("boxes.cancel")}</Button>
                <Button data-testid="ai-apply"  onClick={applyAiBox} disabled={!draft}>{t("boxes.apply")}</Button>
              </AiActions>
            </AiBody>
          </ModalCard>
        </ModalOverlay>
      )}
    </div>
  );
}

const BoxCard = styled(Card)`
  display: flex; flex-direction: column; gap: 10px;
`;

const BoxHead = styled.div`
  display: flex; align-items: center; justify-content: space-between; color: ${({ theme }) => theme.accent};
`;

const PosLabel = styled(Pill).attrs({ tone: "accent" })``;

const BoxTitle = styled.h3`font-size: 19px; font-weight: 800;`;

const BoxDesc = styled.p`color: ${({ theme }) => theme.textSoft}; font-size: 13px; min-height: 36px;`;

const RuleCount = styled(Muted)`font-size: 12px;`;

const Actions = styled.div`display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap;`;
const Note = styled(Muted)`font-size: 12px; display: block;`;

const ModalOverlay = styled.div`
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center; z-index: 40; backdrop-filter: blur(2px);
`;
const ModalCard = styled(Card)`
  width: min(520px, 92vw); padding: 0; display: flex; flex-direction: column; max-height: 84vh;
`;
const AiHead = styled.div`
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 18px; border-bottom: 1px solid ${({ theme }) => theme.border};
  .x { background: none; border: none; color: ${({ theme }) => theme.textSoft}; cursor: pointer; padding: 4px; }
`;
const AiTitle = styled.div`display: flex; align-items: center; gap: 8px; font-weight: 800; color: ${({ theme }) => theme.accent};`;
const AiSub = styled(Muted)`font-size: 12px; margin-top: 4px; max-width: 380px;`;
const AiBody = styled.div`padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; overflow: auto;`;
const PromptInput = styled.textarea`
  width: 100%; min-height: 66px; resize: vertical; padding: 10px 12px; border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border}; background: ${({ theme }) => theme.bgElev2};
  color: ${({ theme }) => theme.text}; font: inherit; font-size: 13px;
`;
const PrevCard = styled.div`border: 1px solid ${({ theme }) => theme.border}; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px;`;
const PrevTitle = styled(Muted)`font-size: 13px;`;
const PrevRow = styled.div`display: flex; align-items: center; gap: 10px; font-size: 12px; flex-wrap: wrap;`;
const AiActions = styled.div`display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;`;