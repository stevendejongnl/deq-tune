import { css } from "lit";

export const devicePillStyles = css`
  :host {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 6px 0 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-card);
  }
  :host([linkstate="connected"]) {
    padding-right: 14px;
  }
  .dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--color-outline);

    :host([linkstate="connected"]) & {
      background: var(--color-accent);
    }
  }
  .device-label {
    font-size: 13px;
    color: var(--color-text-2);
    white-space: nowrap;
  }
  .firmware {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
`;
