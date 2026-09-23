import { css } from "lit";

export const dspPanelStyles = css`
  :host {
    display: block;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: var(--space-4) var(--space-6);
  }
  h3 {
    margin: 0 0 var(--space-4);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted-foreground);
  }
  section + section {
    margin-top: var(--space-6);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);

    @media (max-width: 40rem) {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  button {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-foreground);
    font: inherit;
    font-size: 0.8125rem;
    cursor: pointer;

    &:hover {
      border-color: var(--color-foreground);
    }

    &:focus-visible {
      outline: 2px solid var(--color-ring);
      outline-offset: 1px;
    }

    &[aria-pressed="true"] {
      border-color: var(--color-accent);
      color: var(--color-accent);

      &:hover {
        border-color: var(--color-accent);
      }
    }
  }
  .tile {
    padding: var(--space-3) var(--space-2);
    text-align: center;
  }
  .option {
    padding: 0.4rem var(--space-3);
  }
  .applause {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
    font-size: 0.8125rem;
  }
  .hint {
    margin: var(--space-4) 0 0;
    font-size: 0.75rem;
    color: var(--color-muted-foreground);
  }
`;
