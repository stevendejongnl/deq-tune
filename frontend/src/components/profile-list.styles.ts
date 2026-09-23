import { css } from "lit";

export const profileListStyles = css`
  :host {
    display: block;
  }
  section + section {
    margin-top: var(--space-6);
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted-foreground);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--color-border);
  }
  li {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-3);
    background: var(--color-card);
    border-left: 3px solid transparent;

    &[aria-current="true"] {
      border-left-color: var(--color-accent);
      background: var(--color-muted);
    }
  }
  li + li {
    border-top: 1px solid var(--color-border);
  }
  .name {
    background: none;
    border: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
    font: inherit;
    line-height: 1.3;
    padding: var(--space-2) 0 0;

    &:hover {
      color: var(--color-accent);
    }
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .action {
    flex-shrink: 0;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-muted-foreground);
    font: inherit;
    font-size: 0.75rem;
    padding: 0.25rem var(--space-2);
    cursor: pointer;

    &:hover {
      color: var(--color-foreground);
      border-color: var(--color-foreground);
    }

    &.destructive:hover {
      color: var(--color-destructive);
      border-color: var(--color-destructive);
    }
  }
  .empty {
    margin: 0;
    padding: var(--space-3);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius);
    color: var(--color-muted-foreground);
    font-size: 0.8125rem;
  }
`;
