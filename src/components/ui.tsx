import styled from "styled-components";

export const PageHeader = styled.div`
  display: flex; align-items: flex-end; justify-content: space-between;
  padding: 28px 20px 20px;
`;

export const Title = styled.h1`
  font-size: 34px; font-weight: 800;
`;

export const Subtitle = styled.p`
  color: ${({ theme }) => theme.textSoft}; font-size: 14px; margin-top: 6px;
  max-width: 560px; line-height: 1.5;
`;

export const Row = styled.div`
  display: flex; align-items: center; gap: 12px;
`;

export const Button = styled.button<{ variant?: "primary" | "ghost" | "danger" }>`
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 18px; border-radius: ${({ theme }) => theme.radiusSm};
  font-size: 13px; font-weight: 600; border: 1px solid transparent;
  transition: transform .12s, background .15s, opacity .15s;
  background: ${({ theme, variant }) =>
    variant === "ghost" ? theme.bgElev2 : variant === "danger" ? "transparent" : theme.accent};
  color: ${({ theme, variant }) =>
    variant === "ghost" ? theme.textSoft : variant === "danger" ? theme.danger : "#fff"};
  border-color: ${({ theme, variant }) => (variant === "ghost" ? theme.border : "transparent")};
  &:hover { opacity: .9; transform: translateY(-1px); }
  &:active { transform: translateY(0); }
  svg { width: 15px; height: 15px; }
`;

export const Card = styled.div`
  background: ${({ theme }) => theme.bgElev};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  padding: 18px;
`;

export const Grid = styled.div<{ cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ cols }) => cols ?? 3}, minmax(0, 1fr));
  gap: 16px;
  padding: 0 20px;
  @media (max-width: 1280px) { grid-template-columns: repeat(2, minmax(0,1fr)); }
`;

export const Muted = styled.span`
  color: ${({ theme }) => theme.textDim};
`;

export const Pill = styled.span<{ tone?: "ok" | "bad" | "accent" | "dim" }>`
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600;
  background: ${({ theme, tone }) =>
    tone === "ok" ? "rgba(44,224,138,0.12)" :
    tone === "bad" ? "rgba(255,92,122,0.12)" :
    tone === "dim" ? theme.bgElev2 : "rgba(155,108,255,0.14)"};
  color: ${({ theme, tone }) =>
    tone === "ok" ? theme.success : tone === "bad" ? theme.danger : theme.accent};
  border: 1px solid ${({ theme, tone }) =>
    tone === "ok" ? "rgba(44,224,138,0.3)" : tone === "bad" ? "rgba(255,92,122,0.3)" : theme.border};
`;