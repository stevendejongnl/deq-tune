import { css } from "lit";

export const localeSwitcherStyles = css`
  :host {
    display: block;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--color-muted-foreground);
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .globe {
    flex-shrink: 0;
  }
  select {
    height: 36px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: var(--color-card);
    color: var(--color-foreground);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
`;
