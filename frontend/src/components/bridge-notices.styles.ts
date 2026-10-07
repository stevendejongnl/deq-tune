import { css } from "lit";

export const bridgeNoticesStyles = css`
  :host {
    display: block;
  }
  .notices {
    display: flex;
    align-items: center;
    gap: 8px;
    /* The header is tight, and this sits beside the device pill. A long
       message must shorten itself rather than push the wordmark out. */
    max-width: 22rem;
    padding: 0 6px 0 14px;
    height: 40px;
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-pill);
    background: var(--color-card);
  }
  .notice {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
  }
  .message {
    font-size: 13px;
    color: var(--color-text-2);
    /* One line, cut with an ellipsis. The whole text is in the title. */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
  .dismiss {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted-foreground);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;

    &:hover {
      color: var(--color-foreground);
    }
  }
`;
