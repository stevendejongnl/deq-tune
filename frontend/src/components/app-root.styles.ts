import { css } from "lit";

export const appRootStyles = css`
  :host {
    display: block;
    min-height: 100vh;
    min-height: 100dvh;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-4);
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border);
  }
  .header-start {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .header-controls {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .title-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }
  h1 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    white-space: nowrap;

    .accent {
      color: var(--color-accent);
    }
  }
  .tagline {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);

    @media (max-width: 30rem) {
      display: none;
    }
  }
  .profiles-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-foreground);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.45rem var(--space-3);
    cursor: pointer;

    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }

    &:focus-visible {
      outline: 2px solid var(--color-ring);
      outline-offset: 2px;
    }
  }
  main {
    padding: var(--space-6);
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
    max-width: 64rem;
    margin-inline: auto;
  }
  .empty {
    color: var(--color-muted-foreground);
  }
  .hint {
    font-size: 0.8125rem;
    color: var(--color-muted-foreground);
    margin: 0;
  }
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 60%);
    z-index: 40;
  }
  .drawer {
    position: fixed;
    inset-block: 0;
    inset-inline-start: 0;
    width: min(26rem, 90vw);
    background: var(--color-card);
    border-right: 1px solid var(--color-border);
    padding: var(--space-4);
    overflow-y: auto;
    z-index: 50;
    transform: translateX(-100%);
    transition: transform 0.2s ease;

    &.open {
      transform: translateX(0);
    }
  }
  .drawer-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-2);
  }
  .drawer-close {
    background: none;
    border: none;
    color: var(--color-muted-foreground);
    font-size: 1.25rem;
    line-height: 1;
    padding: var(--space-2);
    cursor: pointer;

    &:hover {
      color: var(--color-foreground);
    }
  }
`;
