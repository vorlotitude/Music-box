import styled from "styled-components";
import { X } from "lucide-react";
import { useApp, type Notice } from "../state/useApp";
import { useT } from "../i18n";

/**
 * User-facing status/error host (§26). Renders engine-translated notices
 * (audio unavailable, game disconnected, ...) as dismissible toasts. Purely a
 * view: notice data comes from the store, which the app layer feeds.
 */
export function NoticeHost() {
  const t = useT();
  const notices = useApp((s) => s.notices);
  const dismiss = useApp((s) => s.dismissNotice);

  return (
    <Host aria-live="polite">
      {notices.map((n) => (
        <Toast key={n.id} $kind={n.kind}>
          <Text>{n.text}</Text>
          <Dismiss aria-label={t("notice.dismiss")} onClick={() => dismiss(n.id)}>
            <X size={14} />
          </Dismiss>
        </Toast>
      ))}
    </Host>
  );
}

const Host = styled.div`
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 36px));
`;

const kindColor = {
  info: "accent",
  warn: "accentWarm",
  error: "danger",
} as const;

const Toast = styled.div<{ $kind: Notice["kind"] }>`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radiusSm};
  background: ${({ theme }) => theme.panel};
  border: 1px solid ${({ theme }) => theme.border};
  border-left: 3px solid ${({ theme, $kind }) => theme[kindColor[$kind]]};
  box-shadow: ${({ theme }) => theme.glow};
  animation: slidein 0.18s ease;

  @keyframes slidein {
    from { opacity: 0; transform: translateX(12px); }
    to   { opacity: 1; transform: translateX(0); }
  }
`;

const Text = styled.span`
  flex: 1;
  font-size: 13px;
  line-height: 1.4;
  color: ${({ theme }) => theme.text};
`;

const Dismiss = styled.button`
  background: transparent;
  border: 0;
  color: ${({ theme }) => theme.textDim};
  cursor: pointer;
  padding: 2px;
  border-radius: 6px;
  &:hover { color: ${({ theme }) => theme.text}; background: ${({ theme }) => theme.bgElev2}; }
`;