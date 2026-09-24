import { css } from "lit";

export const speakerPanelStyles = css`
  :host {
    display: block;
  }
  .panel {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    border: 1px solid var(--color-divider);
    border-radius: var(--radius-lg);
    background: var(--color-card);
  }
  .panel-head {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .caption {
    margin: 0;
    font-size: 13px;
    line-height: 1.45;
    color: var(--color-muted-foreground);
  }
  .cabin {
    position: relative;
    align-self: center;
  }
  .cabin svg {
    position: absolute;
    left: 0;
    top: 0;
  }
  .body {
    fill: var(--color-sidebar);
    stroke: var(--color-border-strong);
    stroke-width: 1.5;
  }
  .window {
    fill: none;
    stroke: var(--color-border-strong);
    stroke-width: 1.5;
  }
  .seat {
    fill: var(--color-inset);
    stroke: var(--color-border-strong);
  }
  .listener-glow {
    fill: var(--color-accent);
    fill-opacity: 0.07;
  }
  .listener {
    fill: var(--color-accent);
  }
  .listener-label {
    fill: var(--color-text-2);
    font-family: var(--font-sans);
    font-size: 11px;
  }
  .delay-line {
    fill: none;
    stroke: var(--color-idle);
    stroke-width: 1.2;
    stroke-dasharray: 3 4;

    &.selected {
      stroke: var(--color-accent);
      stroke-width: 2;
    }
  }
  .delay-pill {
    position: absolute;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text-2);
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .speaker {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    border: 1.5px solid var(--color-outline);
    background: var(--color-card);
    color: var(--color-foreground);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;

    &.selected {
      background: var(--color-accent);
      border: 0;
      color: var(--color-on-accent);
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--color-accent) 18%, transparent);
    }
  }
  .editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border-radius: var(--radius-md);
    background: var(--color-inset);
    border: 1px solid var(--color-border);
  }
  .editor-title {
    font-size: 14px;
    font-weight: 600;
  }
  .editor-grid {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 10px 8px;
    align-items: center;
  }
  .field-label {
    font-size: 13px;
    color: var(--color-muted-foreground);
  }
  .stepper-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .step {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: var(--radius);
    border: 1px solid var(--color-border-strong);
    background: var(--color-card);
    color: var(--color-foreground);
    font: inherit;
    font-size: 16px;
    cursor: pointer;

    &:hover {
      border-color: var(--color-accent);
      color: var(--color-accent);
    }
  }
  .value {
    flex-grow: 1;
    min-width: 0;
    text-align: center;
    font-family: var(--font-mono);
    font-size: 15px;
    white-space: nowrap;
  }
  .milliseconds {
    color: var(--color-muted-foreground);
    font-size: 11px;
  }
  .segmented {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    padding: 3px;
    border-radius: 9px;
    background: var(--color-card);
    border: 1px solid var(--color-border-strong);
  }
  .segment {
    height: 38px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted-foreground);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;

    &.selected {
      background: var(--color-border-strong);
      color: var(--color-foreground);
    }
  }

  @media (min-width: 700px) {
    .panel {
      padding: 20px 24px 24px;
    }
  }

  @media (min-width: 1200px) {
    .editor-grid {
      grid-template-columns: 72px minmax(0, 1fr);
      gap: 10px 12px;
    }
    .milliseconds {
      font-size: 12px;
    }
    .step {
      width: 36px;
      height: 36px;
      border-radius: 8px;
    }
    .segment {
      height: 32px;
    }
  }
`;
