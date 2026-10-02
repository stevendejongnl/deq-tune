import { css } from "lit";

export const deviceStatusStyles = css`
  :host {
    display: block;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 40px;
    padding: 0 6px 0 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-pill);
    background: var(--color-card);

    &.connected {
      padding-right: 14px;
    }
  }
  .dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--color-outline);

    .pill.connected & {
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
  .connect {
    height: 30px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--color-accent);
    color: var(--color-on-accent);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
`;
