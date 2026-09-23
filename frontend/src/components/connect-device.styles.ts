import { css } from "lit";

export const connectDeviceStyles = css`
  :host {
    display: block;
  }
  p {
    margin: 0;
  }
  .hint {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
  }
  .form {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  button {
    background: var(--color-gold);
    border: 1px solid var(--color-gold);
    border-radius: var(--radius);
    color: var(--color-on-gold);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 700;
    padding: 0.4rem var(--space-4);
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--color-gold-strong);
      border-color: var(--color-gold-strong);
    }

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }

    &:focus-visible {
      outline: 2px solid var(--color-ring);
      outline-offset: 2px;
    }
  }
  .connected {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
  }
  .dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: var(--color-accent);
  }
  .error {
    font-size: 0.75rem;
    color: var(--color-destructive);
  }
`;
