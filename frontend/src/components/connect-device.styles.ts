import { css } from "lit";

export const connectDeviceStyles = css`
  :host {
    display: block;
  }
  .hint {
    margin: 0;
    font-size: 13px;
    color: var(--color-muted-foreground);
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
  }
  .dot {
    width: 8px;
    height: 8px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--color-outline);
  }
  .pill.connected .dot {
    background: var(--color-accent);
  }
  .device-label {
    font-size: 13px;
    color: var(--color-text-2);
    white-space: nowrap;
  }
  .pill.connected {
    padding-right: 14px;
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
