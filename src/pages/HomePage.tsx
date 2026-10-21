import styled from "styled-components";
import { Activity, Crosshair, Zap, Rows3 } from "lucide-react";
import { useApp } from "../state/useApp";
import { controllerRef } from "../state/AppProvider";
import { PageHeader, Title, Subtitle, Card, Grid, Pill, Button, Muted } from "../components/ui";
import dayjs from "dayjs";
import { useT } from "../i18n";

const TEST_EVENTS = [
  ["ROUND WIN", "ROUND_WIN"],
  ["ROUND LOSS", "ROUND_LOSS"],
  ["ROUND START", "ROUND_START"],
  ["KILL", "PLAYER_KILL"],
  ["DEATH", "PLAYER_DEATH"],
  ["HEADSHOT", "HEADSHOT_KILL"],
  ["ASSIST", "PLAYER_ASSIST"],
  ["MVP", "MVP"],
  ["CLUTCH", "CLUTCH"],
  ["GRENADE", "GRENADE_THROW"],
  ["FLASH", "FLASH_THROW"],
  ["SMOKE", "SMOKE_THROW"],
  ["BOMB PLANT", "BOMB_PLANTED"],
  ["BOMB DEFUSE", "BOMB_DEFUSED"],
  ["MATCH POINT", "MATCH_POINT"],
] as const;

export function HomePage() {
  const t = useT();
  const session = useApp((s) => s.session);
  const boxes = useApp((s) => s.boxes);
  const rules = useApp((s) => s.rules);
  const log = useApp((s) => s.log);
  const gameConnected = useApp((s) => s.gameConnected);
  const paused = useApp((s) => s.paused);
  const gameName = "CS2";

  const activeBox = boxes.filter((b) => b.enabled)[0];
  const activeRules = (activeBox?.rules ?? [])
    .map((id) => rules.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r);

  const lastEvent = [...log].reverse().find((e) => e.kind === "event")?.message;

  const stats: { label: string; value: number | string; kind: "ok" | "bad" | "accent" }[] = [
    { label: t("home.kills"), value: session.kills, kind: "accent" },
    { label: t("home.deaths"), value: session.deaths, kind: "bad" },
    { label: t("home.wins"), value: session.wins, kind: "ok" },
    { label: t("home.losses"), value: session.losses, kind: "bad" },
  ];

  return (
    <div>
      <PageHeader>
        <div>
          <Title>{t("home.title")}</Title>
          <Subtitle>{t("home.subtitle")}</Subtitle>
        </div>
        <Pill tone={gameConnected ? "ok" : "bad"}>
          {gameConnected ? "● " + t("common.connected") : "○ " + t("common.disconnected")}
        </Pill>
      </PageHeader>

      <Hud>
        <div>
          <Muted style={{ fontSize: 11 }}>{t("home.currentEvent")}</Muted>
          <b>{lastEvent ?? t("home.noEvent")}</b>
        </div>
        <div>
          <Muted style={{ fontSize: 11 }}>{t("home.reaction")}</Muted>
          <b className={paused ? "warn" : "ok"}>{paused ? t("status.paused") : t("status.live")}</b>
        </div>
      </Hud>

      <Grid cols={2}>
        <Card>
          <CardHead>
            <Crosshair size={16} />
            <span>{t("home.sessionTitle", { name: gameName })}</span>
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
            <span>{t("home.boxCard")}</span>
          </CardHead>
          {activeBox ? (
            <div>
              <BoxName>{activeBox.name.toUpperCase()}</BoxName>
              <RuleTicks>
                {activeRules.filter((r) => r.enabled).slice(0, 8).map((r) => (
                  <span key={r.id}>
                    <Pill tone="ok">✓</Pill> {prettyEvent(r.event)}
                  </span>
                ))}
              </RuleTicks>
            </div>
          ) : (
            <Empty>{t("home.boxEmpty")}</Empty>
          )}
        </Card>
      </Grid>

      <DevBar>
        <DevHead>
          <Zap size={15} />
          <b>{t("home.devTitle")}</b>
          <span>{t("home.devSubtitle")}</span>
        </DevHead>
        <TestRow>
          {TEST_EVENTS.map(([label, type]) => (
            <TestBtn key={type} onClick={() => controllerRef.current?.testEvent(type)}>
              {t("home.testPrefix", { label })}
            </TestBtn>
          ))}
        </TestRow>
      </DevBar>

      <LogPanel>
        <LogHead>
          <Rows3 size={15} />
          <b>{t("home.logTitle")}</b>
        </LogHead>
        <LogBody>
          {log.length === 0 && <Empty>{t("home.logEmpty")}</Empty>}
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

const Hud = styled.div`
  display: flex; align-items: stretch; gap: 14px;
  margin: 0 24px 18px;
  > div {
    flex: 1; display: flex; flex-direction: column; gap: 3px;
    background: ${({ theme }) => theme.bgElev};
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: ${({ theme }) => theme.radiusSm};
    padding: 12px 16px;
    b { font-family: ${({ theme }) => theme.fontDisplay}; font-size: 15px; font-weight: 700; }
    b.ok { color: ${({ theme }) => theme.success}; }
    b.warn { color: ${({ theme }) => theme.warning}; }
  }
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