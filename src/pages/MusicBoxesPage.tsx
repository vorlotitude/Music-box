import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Plus, Trash2, Copy, Settings2, Pencil, Box as BoxIcon } from "lucide-react";
import { useApp } from "../state/useApp";
import { PageHeader, Title, Subtitle, Button, Grid, Card, Pill, Muted } from "../components/ui";
import { v4 as uuid } from "uuid";
import type { MusicBox } from "@core/rules/Rule";

export function MusicBoxesPage() {
  const boxes = useApp((s) => s.boxes);
  const saveBox = useApp((s) => s.saveBox);
  const removeBox = useApp((s) => s.removeBox);
  const navigate = useNavigate();

  const createBox = async () => {
    const now = Date.now();
    const box: MusicBox = {
      id: uuid(), name: `New Box ${boxes.length + 1}`, description: "",
      game: "cs2", rules: [], volume: 0.8, enabled: true, createdAt: now, updatedAt: now,
    };
    await saveBox(box);
    navigate(`/rules?box=${box.id}`);
  };

  const duplicate = async (b: MusicBox) => {
    const now = Date.now();
    await saveBox({
      ...b, id: uuid(), name: `${b.name} (copy)`,
      rules: b.rules.map((r) => ({ ...r, id: uuid() })),
      createdAt: now, updatedAt: now,
    });
  };

  const onDelete = async (b: MusicBox) => {
    if (confirm(`Delete "${b.name}"? This removes its rules.`)) await removeBox(b.id);
  };

  return (
    <div>
      <PageHeader>
        <div>
          <Title>Music Boxes</Title>
          <Subtitle>Each box is a bundle of event→reaction rules for a game. Build one, then it goes live automatically.</Subtitle>
        </div>
        <Button onClick={createBox}><Plus />New Music Box</Button>
      </PageHeader>

      {boxes.length === 0 ? (
        <Card style={{ margin: "0 20px" }}>
          <Muted>No music boxes yet.</Muted>
        </Card>
      ) : (
        <Grid>
          {boxes.map((b) => (
            <BoxCard key={b.id}>
              <BoxHead>
                <BoxIcon size={16} />
                <PosLabel>{b.enabled ? "ACTIVE" : "OFF"}</PosLabel>
              </BoxHead>
              <BoxTitle>{b.name}</BoxTitle>
              <BoxDesc>{b.description || "No description"}</BoxDesc>
              <RuleCount>{b.rules.length} rules · {b.rules.filter((r) => r.enabled).length} active</RuleCount>
              <Actions>
                <Button variant="ghost" onClick={() => navigate(`/rules?box=${b.id}`)}><Settings2 />Edit</Button>
                <Button variant="ghost" onClick={() => duplicate(b)}><Copy />Copy</Button>
                <Button variant="danger" onClick={() => onDelete(b)}><Trash2 />Delete</Button>
              </Actions>
            </BoxCard>
          ))}
        </Grid>
      )}
      <Note style={{ margin: "18px 20px 12px" }}>Tip: while a box is enabled, events that match its rules trigger playback automatically.</Note>
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