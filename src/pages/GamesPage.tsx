import styled from "styled-components";
import { useState } from "react";
import { Gamepad2, Scale, ChevronDown } from "lucide-react";
import { useApp } from "../state/useApp";
import { legalNotesFor } from "@core/adapters/legalNotes";
import { PageHeader, Title, Subtitle, Card, Grid, Pill, Button, Muted } from "../components/ui";
import { useT } from "../i18n";

const GAMES = [
  { id: "cs2", name: "CS2", noteKey: "games.noteCs2", status: "supported" },
  { id: "lol", name: "League of Legends", noteKey: "games.noteLol", status: "supported" },
  { id: "valorant", name: "VALORANT", noteKey: "games.noteValorant", status: "not-configured" },
  { id: "pubg", name: "PUBG", noteKey: "games.noteWhatever", status: "coming-soon" },
  { id: "apex", name: "Apex Legends", noteKey: "games.noteWhatever", status: "coming-soon" },
] as const;

export function GamesPage() {
  const t = useT();
  const gameConnected = useApp((s) => s.gameConnected);
  const lcuConnected = useApp((s) => s.lcuConnected);
  const [openLegal, setOpenLegal] = useState<string | null>(null);

  const copyCfg = async () => {
    try {
      await navigator.clipboard.writeText(CFG);
      alert(t("games.cfgCopied", { path: "<Steam>/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/" }));
    } catch {
      /* noop */
    }
  };

  return (
    <div>
      <PageHeader>
        <div>
          <Title>{t("games.title")}</Title>
          <Subtitle>{t("games.subtitle")}</Subtitle>
        </div>
      </PageHeader>

      <Grid cols={2}>
        {GAMES.map((g) => {
          const isCs2 = g.id === "cs2";
          const isLol = g.id === "lol";
          const connected = isCs2 ? gameConnected : isLol ? lcuConnected : false;
          const legal = legalNotesFor(g.id);
          const open = openLegal === g.id;
          return (
            <Card key={g.id}>
              <GameRow>
                <Gamepad2 size={20} color={connected ? "#9b6cff" : "#6b6a78"} />
                <div>
                  <Name>{g.name}</Name>
                  <Note>{t(g.noteKey)}</Note>
                </div>
                <Right>
                  {g.status === "supported" && (
                    <Pill tone={connected ? "ok" : "bad"}>{connected ? "● " + t("common.connected") : "○ " + t("common.standby")}</Pill>
                  )}
                  {g.status === "not-configured" && <Pill tone="dim">{t("games.notConfigured")}</Pill>}
                  {g.status === "coming-soon" && <Pill>{t("games.comingSoon")}</Pill>}
                </Right>
              </GameRow>
              {isCs2 && (
                <SetupRow>
                  <Muted style={{ fontSize: 12 }}>
                    {t("games.cs2Setup", { code: "" })}
                  </Muted>
                  <Button variant="ghost" style={{ marginTop: 6 }} onClick={copyCfg} data-testid="copy-gsi-cfg">
                    {t("games.copyCfg")}
                  </Button>
                </SetupRow>
              )}
              {isLol && (
                <SetupRow>
                  <Muted style={{ fontSize: 12 }}>{t("games.lolSetup")}</Muted>
                </SetupRow>
              )}

              {/* §20 per-game LEGAL / COMPATIBILITY NOTES, surfaced in the UI */}
              <LegalToggle type="button" onClick={() => setOpenLegal(open ? null : g.id)} $open={open}>
                <Scale size={13} />
                <span>{t("games.legalToggle")}</span>
                <ChevronDown size={14} style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : "none" }} />
              </LegalToggle>
              {open && (
                <LegalBody>
                  <LegalRow>
                    <dt>{t("games.lInterface")}</dt>
                    <dd>{legal.interfaceUsed}</dd>
                  </LegalRow>
                  <LegalRow>
                    <dt>{t("games.lNoInjection")}</dt>
                    <dd>{legal.injectionFree ? t("games.lYesGsi") : t("games.lNo")}</dd>
                  </LegalRow>
                  <LegalRow>
                    <dt>{t("games.lNoMemory")}</dt>
                    <dd>{legal.memoryReading ? t("games.lUsesMemory") : t("games.lYes")}</dd>
                  </LegalRow>
                  <LegalRow>
                    <dt>{t("games.lTermsChecked")}</dt>
                    <dd>{legal.termsChecked ? t("games.lReviewed") : t("games.lNotReverified")}</dd>
                  </LegalRow>
                  <LegalNoteBlock>
                    <b>{t("games.lAntiCheat")}</b>
                    <span>{legal.antiCheatConsiderations}</span>
                  </LegalNoteBlock>
                  <LegalNoteBlock>
                    <b>{t("games.lKnown")}</b>
                    <span>{legal.knownLimitations}</span>
                  </LegalNoteBlock>
                </LegalBody>
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

const GameRow = styled.div`display: flex; align-items: center; gap: 14px;`;
const Name = styled.h3`font-size: 18px; font-weight: 800;`;
const Note = styled(Muted)`font-size: 12px; margin-top: 3px;`;
const Right = styled.div`margin-left: auto;`;
const SetupRow = styled.div`border-top: 1px solid ${({ theme }) => theme.borderSoft}; margin-top: 16px; padding-top: 14px;`;

const LegalToggle = styled.button<{ $open: boolean }>`
  display: flex; align-items: center; gap: 8px; width: 100%;
  margin-top: 14px; padding: 9px 10px; border-radius: ${({ theme }) => theme.radiusSm};
  background: ${({ theme }) => theme.bg}; border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme, $open }) => ($open ? theme.accent : theme.textSoft)};
  font-size: 12px; font-weight: 600; cursor: pointer; letter-spacing: .03em;
  text-transform: uppercase; text-align: left;
  &:hover { border-color: ${({ theme }) => theme.accent}; }
`;

const LegalBody = styled.div`
  margin-top: 10px; padding: 12px; border-radius: ${({ theme }) => theme.radiusSm};
  background: ${({ theme }) => theme.bg}; border: 1px solid ${({ theme }) => theme.border};
  display: flex; flex-direction: column; gap: 8px;
`;

const LegalRow = styled.div`
  display: flex; gap: 12px; font-size: 12px; line-height: 1.5;
  dt { width: 120px; flex-shrink: 0; color: ${({ theme }) => theme.textDim}; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; padding-top: 1px; }
  dd { color: ${({ theme }) => theme.textSoft}; }
`;

const LegalNoteBlock = styled.div`
  display: flex; flex-direction: column; gap: 2px; font-size: 12px; line-height: 1.5;
  border-top: 1px dashed ${({ theme }) => theme.borderSoft}; padding-top: 8px;
  b { color: ${({ theme }) => theme.textDim}; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  span { color: ${({ theme }) => theme.textSoft}; }
`;