import { css } from "lit";

export const eqEditorStyles = css`
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
  .bands-scroll {
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
  .bands {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 34rem;
    padding-right: 1.5rem;
  }
  .band {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }
  .value {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-foreground);
    font-variant-numeric: tabular-nums;
  }
  .freq {
    font-family: var(--font-mono);
    font-size: 0.6875rem;
    color: var(--color-muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  input[type="range"] {
    writing-mode: vertical-lr;
    direction: rtl;
    appearance: none;
    width: 1.25rem;
    height: 8rem;
    background: transparent;
    cursor: pointer;

    &::-webkit-slider-runnable-track {
      width: 4px;
      background: var(--color-muted);
      border-radius: 2px;
    }

    &::-moz-range-track {
      width: 4px;
      background: var(--color-muted);
      border-radius: 2px;
    }

    &::-webkit-slider-thumb {
      appearance: none;
      width: 1.25rem;
      height: 0.625rem;
      border-radius: 2px;
      background: var(--color-accent);
      margin-left: -0.5rem;
    }

    &::-moz-range-thumb {
      width: 1.25rem;
      height: 0.625rem;
      border: none;
      border-radius: 2px;
      background: var(--color-accent);
    }

    &:focus-visible {
      outline: 2px solid var(--color-ring);
      outline-offset: 2px;
    }
  }
`;
