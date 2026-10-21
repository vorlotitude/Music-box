import { useEffect } from "react";
import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import styled from "styled-components";
import {
  Home,
  Library,
  Box,
  Gamepad2,
  SlidersHorizontal,
  Settings,
  Music2,
  AudioLines,
  Pause,
  Radio,
} from "lucide-react";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { MusicBoxesPage } from "./pages/MusicBoxesPage";
import { GamesPage } from "./pages/GamesPage";
import { RulesPage } from "./pages/RulesPage";
import { AudioPage } from "./pages/AudioPage";
import { SettingsPage } from "./pages/SettingsPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { BottomPlayer } from "./components/BottomPlayer";
import { NoticeHost } from "./components/NoticeHost";
import { useApp } from "./state/useApp";
import { useT } from "./i18n";
import { setNavigator } from "./navBus";

const NAV = [
  { to: "/", label: "nav.home", icon: Home },
  { to: "/library", label: "nav.library", icon: Library },
  { to: "/boxes", label: "nav.boxes", icon: Box },
  { to: "/games", label: "nav.games", icon: Gamepad2 },
  { to: "/rules", label: "nav.rules", icon: SlidersHorizontal },
  { to: "/audio", label: "nav.audio", icon: AudioLines },
  { to: "/settings", label: "nav.settings", icon: Settings },
];

export function App() {
  const loc = useLocation();
  const t = useT();
  const navigate = useNavigate();
  const paused = useApp((s) => s.paused);
  const onboarded = useApp((s) => s.settings.onboarded);

  // Let the main process (tray / global shortcuts) trigger route changes.
  useEffect(() => {
    setNavigator(navigate);
    return () => setNavigator(null);
  }, [navigate]);

  // First run: show a lean onboarding wizard instead of the full shell.
  if (!onboarded) return <OnboardingPage />;

  return (
    <Shell>
      <Sidebar>
        <Brand>
          <BrandIcon><Music2 size={18} /></BrandIcon>
          <BrandText>
            <span>GAME</span>
            <br />
            <em>MUSIC BOX</em>
          </BrandText>
        </Brand>

        <NavList>
          {NAV.map((n) => (
            <NavItem key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              <n.icon size={17} />
              <span>{t(n.label)}</span>
            </NavItem>
          ))}
        </NavList>

        <SidebarFooter>
          <FooterRow>
            <span className="label">REACTION</span>
            <span className={`state ${paused ? "warn" : "ok"}`}>
              {paused ? t("status.paused") : t("status.live")}
            </span>
          </FooterRow>
          <ConnectionBadge>
            <span className="dot" />
            <div>
              <b>CS2</b>
              <span>{t("nav.gsiBadge", { port: 3001 })}</span>
            </div>
          </ConnectionBadge>
        </SidebarFooter>
      </Sidebar>

      <Main>
        <Content key={loc.pathname}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/boxes" element={<MusicBoxesPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/audio" element={<AudioPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Main>

      <SystemStatus />
      <BottomPlayer />
      <NoticeHost />
    </Shell>
  );
}

/** Thin bottom system-status strip: current game + audio output + now playing. */
function SystemStatus() {
  const t = useT();
  const gameConnected = useApp((s) => s.gameConnected);
  const paused = useApp((s) => s.paused);
  const playing = useApp((s) => s.playing);
  const outputTarget = useApp((s) => s.settings.outputTarget);

  return (
    <StatusBar>
      <StatusItem>
        <StatusIcon live={gameConnected}><Radio size={13} /></StatusIcon>
        <span>{t("status.game")}</span>
        <b className="sig">CS2</b>
        <StatusPill live={gameConnected}>
          {gameConnected ? `● ${t("common.connected")}` : `○ ${t("common.disconnected")}`}
        </StatusPill>
      </StatusItem>
      <StatusItem>
        <span>{t("status.output")}</span>
        <b>{outputTarget === "virtualMic" ? t("status.mic") : t("status.speakers")}</b>
      </StatusItem>
      <StatusItem right>
        <StatusIcon live={!!playing && !paused}><Pause size={13} /></StatusIcon>
        <span>{t("status.nowPlaying")}</span>
        <b className="nowrap sig">
          {paused ? t("status.paused") : playing ? playing.title : t("player.idle")}
        </b>
      </StatusItem>
    </StatusBar>
  );
}

const Shell = styled.div`
  height: 100vh;
  display: grid;
  grid-template-columns: 236px 1fr;
  grid-template-rows: 1fr auto auto;
  grid-template-areas:
    "sidebar main"
    "sidebar status"
    "sidebar player";
`;

const Sidebar = styled.aside`
  grid-area: sidebar;
  background: ${({ theme }) => theme.bgElev};
  border-right: 1px solid ${({ theme }) => theme.border};
  display: flex;
  flex-direction: column;
  padding: 20px 16px;
  gap: 24px;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 6px;
`;

const BrandIcon = styled.div`
  width: 38px; height: 38px; border-radius: 11px;
  background: linear-gradient(135deg, ${({ theme }) => theme.accent}, ${({ theme }) => theme.accent2});
  display: grid; place-items: center; color: #fff;
  box-shadow: ${({ theme }) => theme.glow};
`;

const BrandText = styled.div`
  font-family: ${({ theme }) => theme.fontDisplay};
  font-weight: 800; font-size: 13px; line-height: 1.15; letter-spacing: 0.08em;
  em { font-style: italic; color: ${({ theme }) => theme.accent}; font-weight: 700; }
`;

const NavList = styled.nav`
  display: flex; flex-direction: column; gap: 4px; flex: 1;
`;

const NavItem = styled(NavLink)`
  display: flex; align-items: center; gap: 12px;
  padding: 11px 14px; border-radius: ${({ theme }) => theme.radiusSm};
  color: ${({ theme }) => theme.textSoft}; text-decoration: none;
  font-size: 14px; font-weight: 500; transition: background .15s, color .15s;
  &:hover { background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text}; }
  &.active { background: ${({ theme }) => theme.bgElev2}; color: ${({ theme }) => theme.text}; }
  &.active svg { color: ${({ theme }) => theme.accent}; }
`;

const SidebarFooter = styled.div`
  display: flex; flex-direction: column; gap: 10px;
`;

const FooterRow = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; font-size: 11px;
  .label { color: ${({ theme }) => theme.textDim}; letter-spacing: .08em; font-weight: 600; }
  .state { font-weight: 700; }
  .state.ok { color: ${({ theme }) => theme.success}; }
  .state.warn { color: ${({ theme }) => theme.warning}; }
`;

const ConnectionBadge = styled.div`
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; border-radius: ${({ theme }) => theme.radiusSm};
  background: ${({ theme }) => theme.panel}; border: 1px solid ${({ theme }) => theme.border};
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${({ theme }) => theme.danger}; box-shadow: 0 0 8px currentColor; }
  div { display: flex; flex-direction: column; line-height: 1.2; }
  b { font-size: 13px; }
  span { font-size: 11px; color: ${({ theme }) => theme.textDim}; }
`;

const Main = styled.main`
  grid-area: main;
  overflow: hidden;
  position: relative;
`;

const Content = styled.div`
  height: 100%;
  overflow-y: auto;
  padding: 0 8px 8px;
`;

const StatusBar = styled.div`
  grid-area: status;
  height: 40px;
  background: ${({ theme }) => theme.bgElev};
  border-top: 1px solid ${({ theme }) => theme.border};
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 28px;
  font-size: 12px;
`;

const StatusItem = styled.div<{ right?: boolean }>`
  display: flex; align-items: center; gap: 8px; color: ${({ theme }) => theme.textSoft};
  ${({ right }) => (right ? "margin-left:auto;" : "")}
  .sig { color: ${({ theme }) => theme.text}; font-weight: 700; }
`;

const StatusIcon = styled.span<{ live?: boolean }>`
  display: grid; place-items: center; color: ${({ theme, live }) => (live ? theme.success : theme.textDim)};
`;

const StatusPill = styled.span<{ live?: boolean }>`
  font-size: 11px; font-weight: 700;
  color: ${({ theme, live }) => (live ? theme.success : theme.textDim)};
`;