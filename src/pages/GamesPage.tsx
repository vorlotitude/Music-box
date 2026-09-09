import styled from "styled-components";
import { Gamepad2 } from "lucide-react";
import { useApp } from "../state/useApp";
import { PageHeader, Title, Subtitle, Card, Grid, Pill, Button, Muted } from "../components/ui";

const GAMES = [
  { id: "cs2", name: "CS2", note: "Valve Game State Integration (GSI)", status: "supported" },
  { id: "valorant", name: "VALORANT", note: "Requires a supported public status interface — TBD", status: "not-configured" },
  { id: "pubg", name: "PUBG", note: "Coming soon", status: "coming-soon" },
  { id: "apex", name: "Apex Legends", note: "Coming soon", status: "coming-soon" },
  { id: "lol", name: "League of Legends", note: "Coming soon", status: "coming-soon" },
] as const;

export function GamesPage() {
  const gameConnected = useApp((s) => s.gameConnected);

  return (
    <div>
      <PageHeader>
        <div>
          <Title>Games</Title>
          <Subtitle>Every game is isolated behind a game adapter. Adding a new game later never requires touching the audio or rule systems.</Subtitle>
        </div>
      </PageHeader>

      <Grid cols={2}>
        {GAMES.map((g) => {
          const isCs2 = g.id === "cs2";
          const connected = isCs2 && gameConnected;
          return (
            <Card key={g.id}>
              <GameRow>
                <Gamepad2 size={20} color={isCs2 ? "#9b6cff" : "#6b6a78"} />
                <div>
                  <Name>{g.name}</Name>
                  <Note>{g.note}</Note>
                </div>
                <Right>
                  {g.status === "supported" && (
                    <Pill tone={connected ? "ok" : "bad"}>{connected ? "● Connected" : "○ Standby"}</Pill>
                  )}
                  {g.status === "not-configured" && <Pill tone="dim">Not configured</Pill>}
                  {g.status === "coming-soon" && <Pill>Coming Soon</Pill>}
                </Right>
              </GameRow>
              {isCs2 && (
                <SetupRow>
                  <Muted style={{ fontSize: 12 }}>
                    GSI setup: place <Code>gamestate_integration_gmb.cfg</Code> in
                    your CS2 cfg folder, then start the game. No injection, no memory reads.
                  </Muted>
                  <Button variant="ghost" style={{ marginTop: 6 }} onClick={copyCfg}>
                    Copy GSI config
                  </Button>
                </SetupRow>
              )}
            </Card>
          );
        })}
      </Grid>
    </div>
  );
}

const CFG = `"Game Music Box"
{
    "uri"  "http://127.0.0.1:3001"
    "timeout" "5.0"
    "buffer" "0.1"
    "throttle" "0.1"
    "heartbeat" "10.0"
    "auth"
    {
        "token"              ""
    }
    "data"
    {
        "provider"           "1"
        "map"                "1"
        "round"              "1"
        "player_id"          "1"
        "player_state"       "1"
        "player_weapons"     "1"
        "allplayers_id"      "1"
        "allplayers_state"   "1"
        "allplayers_weapons" "1"
        "allplayers_match_stats" "1"
        "allplayers_position" "1"
        "allplayers_position" "1"
    }
}`;

async function copyCfg() {
  try {
    await navigator.clipboard.writeText(CFG);
    alert("GSI config copied. Save it as gamestate_integration_gmb.cfg inside your CS2 cfg folder:\n\n<Steam>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/");
  } catch {
    /* noop */
  }
}

const GameRow = styled.div`display: flex; align-items: center; gap: 14px;`;
const Name = styled.h3`font-size: 18px; font-weight: 800;`;
const Note = styled(Muted)`font-size: 12px; margin-top: 3px;`;
const Right = styled.div`margin-left: auto;`;
const SetupRow = styled.div`border-top: 1px solid ${({ theme }) => theme.borderSoft}; margin-top: 16px; padding-top: 14px;`;
const Code = styled.code`
  background: ${({ theme }) => theme.bg}; border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px; padding: 1px 6px; font-size: 11px; color: ${({ theme }) => theme.accentWarm};
`;