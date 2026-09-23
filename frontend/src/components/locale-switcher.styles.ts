import { css } from "lit";

export const localeSwitcherStyles = css`
  :host {
    display: block;
  }
  label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
  }
  select {
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-foreground);
    font: inherit;
    font-size: 0.8125rem;
    padding: 0.4rem var(--space-2);

    &:focus-visible {
      outline: 2px solid var(--color-ring);
      outline-offset: 1px;
    }
  }
`;
