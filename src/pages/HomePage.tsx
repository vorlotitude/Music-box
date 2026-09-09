import styled from "styled-components";
import { Activity, Crosshair, Zap, Rows3 } from "lucide-react";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Card, Grid, Pill, Button } from "../components/ui";
import dayjs from "dayjs";

const TEST_EVENTS = [
  ["ROUND WIN", "ROUND_WIN"],
  ["ROUND LOSS", "ROUND_LOSS"],
  ["ROUND START", "ROUND_START"],
  ["KILL", "PLAYER_KILL"],
  ["DEATH", "PLAYER_DEATH"],
  ["MVP", "MVP"],
  ["GRENADE", "GRENADE_THROW"],
  ["BOMB PLANT", "BOMB_PLANTED"],
] as const;

export function HomePage() {
  const session = useApp((s) => s.session);
  const boxes = useApp((s) => s.boxes);
  const log = useApp((s) => s.log);
  const gameConnected = useApp((s) => s.gameConnected);
  const gameName = "CS2";

  const activeBox = boxes.filter((b) => b.enabled)[0];

  const stats: { label: string; value: number | string; kind: "ok" | "bad" | "accent" }[] = [
    { label: "Kills", value: session.kills, kind: "accent" },
    { label: "Deaths", value: session.deaths, kind: "bad" },
    { label: "Wins", value: session.wins, kind: "ok" },
    { label: "Losses", value: session.losses, kind: "bad" },
  ];

  return (
    <div>
      <PageHeader>
        <div>
          <Title>Home</Title>
          <Subtitle>Live game dashboard. Your events, your soundtrack.</Subtitle>
        </div>
        <Pill tone={gameConnected ? "ok" : "bad"}>
          {gameConnected ? "● Connected" : "○ Disconnected"}
        </Pill>
      </PageHeader>

      <Grid cols={2}>
        <Card>
          <CardHead>
            <Crosshair size={16} />
            <span>Current Session · {gameName}</span>
          </CardHead>
          <StatGrid>
            {stats.map((s) => (
              <Stat key={s.label} tone={s.kind}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </Stat>
            ))}
          </StatGrid>
        </Card>

        <Card>
          <CardHead>
            <BoxIcon />
            <span>Active Music Box</span>
          </CardHead>
          {activeBox ? (
            <div>
              <BoxName>{activeBox.name.toUpperCase()}</BoxName>
              <RuleTicks>
                {activeBox.rules.filter((r) => r.enabled).slice(0, 8).map((r) => (
                  <span key={r.id}>
                    <Pill tone="ok">✓</Pill> {prettyEvent(r.event)}
                  </span>
                ))}
              </RuleTicks>
            </div>
          ) : (
            <Empty>No active music box. Create one to react to events.</Empty>
          )}
        </Card>
      </Grid>

      <DevBar>
        <DevHead>
          <Zap size={15} />
          <b>DEVELOPER / DEBUG MODE</b>
          <span>Manually trigger events to test your rules end-to-end</span>
        </DevHead>
        <TestRow>
          {TEST_EVENTS.map(([label, type]) => (
            <TestBtn key={type} onClick={() => controllerRef.current?.testEvent(type)}>
              TEST {label}
            </TestBtn>
          ))}
        </TestRow>
      </DevBar>

      <LogPanel>
        <LogHead>
          <Rows3 size={15} />
          <b>REAL-TIME EVENT LOG</b>
        </LogHead>
        <LogBody>
          {log.length === 0 && <Empty>No events yet. Start CS2 with GSI enabled, or hit a TEST button.</Empty>}
          {log.map((e, i) => (
            <LogRow key={i} tone={e.kind}>
              <time>{dayjs(e.ts).format("HH:mm:ss")}</time>
              <span className="kind">{e.kind.toUpperCase()}</span>
              <span>{e.message}</span>
            </LogRow>
          ))}
        </LogBody>
      </LogPanel>
    </div>
  );
}

const CardHead = styled.div`
  display: flex; align-items: center; gap: 8px;
  color: ${({ theme }) => theme.textSoft}; font-size: 13px; font-weight: 600;
  margin-bottom: 14px;
`;

const StatGrid = styled.div`
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
`;

const Stat = styled.div<{ tone: "ok" | "bad" | "accent" }>`
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  b {
    font-size: 30px; font-weight: 800; font-family: ${({ theme }) => theme.fontDisplay};
    color: ${({ theme, tone }) => (tone === "ok" ? theme.success : tone === "bad" ? theme.danger : theme.accent)};
  }
  span { color: ${({ theme }) => theme.textDim}; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
`;

const BoxIcon = styled(Activity)``;
const BoxName = styled.div`
  font-family: ${({ theme }) => theme.fontDisplay};
  font-size: 22px; font-weight: 800; letter-spacing: .02em; margin-bottom: 12px;
  /* fake gradient text */
  background: linear-gradient(90deg, ${({ theme }) => theme.text}, ${({ theme }) => theme.accentWarm});
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
`;

const RuleTicks = styled.div`
  display: flex; flex-direction: column; gap: 7px;
  span { display: flex; align-items: center; gap: 9px; font-size: 13px; color: ${({ theme }) => theme.textSoft}; }
`;

const Empty = styled.div`
  color: ${({ theme }) => theme.textDim}; font-size: 13px; padding: 8px 0;
`;

const DevBar = styled.div`
  margin: 18px 20px 0;
  padding: 16px 18px;
  border-radius: ${({ theme }) => theme.radius};
  background: repeating-linear-gradient(0deg, rgba(255,140,90,0.05), rgba(255,140,90,0.05) 1px, transparent 1px, transparent 3px),
    ${({ theme }) => theme.panel};
  border: 1px solid rgba(255,140,90,0.35);
`;

const DevHead = styled.div`
  display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
  color: ${({ theme }) => theme.accentWarm}; font-size: 12px;
  span { color: ${({ theme }) => theme.textDim}; font-weight: 400; margin-left: 4px; }
`;

const TestBtn = styled(Button).attrs({ variant: "ghost" })`
  font-size: 11px; padding: 6px 11px;
`;

const TestRow = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px;
`;

const LogPanel = styled.div`
  margin: 18px 20px 12px;
  border-radius: ${({ theme }) => theme.radius};
  background: ${({ theme }) => theme.panel};
  border: 1px solid ${({ theme }) => theme.border};
  overflow: hidden;
`;

const LogHead = styled.div`
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px; color: ${({ theme }) => theme.textSoft}; font-size: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
`;

const LogBody = styled.div`
  max-height: 260px; overflow-y: auto; padding: 6px 14px; font-family: ${({ theme }) => theme.fontBody};
`;

const LogRow = styled.div<{ tone: string }>`
  display: grid; grid-template-columns: 70px 64px 1fr; gap: 10px; align-items: center;
  padding: 7px 4px; font-size: 12px; border-bottom: 1px solid ${({ theme }) => theme.borderSoft};
  &:last-child { border-bottom: none; }
  time { color: ${({ theme }) => theme.textDim}; font-variant-numeric: tabular-nums; }
  .kind {
    font-weight: 700; font-size: 10px; letter-spacing: .04em;
    color: ${({ theme, tone }) =>
      tone === "event" ? theme.accent : tone === "rule" ? theme.warning : tone === "audio" ? theme.success : theme.textDim};
  }
`;

function prettyEvent(e: string): string {
  return e.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}