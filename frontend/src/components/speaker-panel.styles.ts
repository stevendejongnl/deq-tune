import { css } from "lit";

export const speakerPanelStyles = css`
  :host {
    display: block;
    background: var(--color-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    padding: var(--space-4) var(--space-6);
  }
  .table-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: var(--color-border) transparent;
    mask-image: linear-gradient(to right, black calc(100% - 1.5rem), transparent 100%);

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: 3px;
    }
  }
  table {
    border-collapse: collapse;
    width: 100%;
    min-width: 30rem;
    font-size: 0.875rem;
  }
  td:last-child,
  th:last-child {
    padding-right: 1.5rem;
  }
  th {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--color-muted-foreground);
  }
  th,
  td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
  }
  td:first-child,
  th:first-child {
    padding-left: 0;
  }
  tbody tr + tr {
    border-top: 1px solid var(--color-border);
  }
  input[type="number"] {
    width: 5rem;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-foreground);
    font: inherit;
    font-variant-numeric: tabular-nums;
    padding: 0.25rem var(--space-2);

    &:focus-visible {
      outline: 2px solid var(--color-ring);
      outline-offset: 1px;
    }
  }
  button[aria-pressed] {
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-background);
    color: var(--color-muted-foreground);
    font: inherit;
    font-weight: 600;
    cursor: pointer;

    &[aria-pressed="true"] {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
  h3 {
    margin: 0 0 var(--space-4);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-muted-foreground);
  }
`;
