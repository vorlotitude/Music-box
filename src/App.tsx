import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import styled from "styled-components";
import {
  Home,
  Library,
  Box,
  Gamepad2,
  SlidersHorizontal,
  Settings,
  Music2,
} from "lucide-react";
import { HomePage } from "./pages/HomePage";
import { LibraryPage } from "./pages/LibraryPage";
import { MusicBoxesPage } from "./pages/MusicBoxesPage";
import { GamesPage } from "./pages/GamesPage";
import { RulesPage } from "./pages/RulesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { BottomPlayer } from "./components/BottomPlayer";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/library", label: "Library", icon: Library },
  { to: "/boxes", label: "Music Boxes", icon: Box },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/rules", label: "Rules", icon: SlidersHorizontal },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function App() {
  const loc = useLocation();
  return (
    <Shell>
      <Sidebar>
        <Brand>
          <BrandIcon><Music2 size={18} /></BrandIcon>
          <BrandText>
            GAME
            <br />
            <em>MUSIC BOX</em>
          </BrandText>
        </Brand>

        <NavList>
          {NAV.map((n) => (
            <NavItem key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              <n.icon size={17} />
              <span>{n.label}</span>
            </NavItem>
          ))}
        </NavList>

        <ConnectionBadge>
          <span className="dot" />
          <div>
            <b>CS2</b>
            <span>GSI · port 3001</span>
          </div>
        </ConnectionBadge>
      </Sidebar>

      <Main>
        <Content key={loc.pathname}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/boxes" element={<MusicBoxesPage />} />
            <Route path="/games" element={<GamesPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Main>

      <BottomPlayer />
    </Shell>
  );
}

const Shell = styled.div`
  height: 100vh;
  display: grid;
  grid-template-columns: 236px 1fr;
  grid-template-rows: 1fr auto;
  grid-template-areas:
    "sidebar main"
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