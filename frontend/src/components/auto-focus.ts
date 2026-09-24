import { directive, Directive, type ElementPart, type PartInfo, PartType } from "lit/directive.js";

/**
 * Moves the keyboard focus to the element the first time it renders.
 * The rename field uses it, so the user can type at once.
 */
class AutoFocusDirective extends Directive {
  private focused = false;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) {
      throw new Error("autoFocus only works on an element");
    }
  }

  override update(part: ElementPart): void {
    if (this.focused) {
      return;
    }
    this.focused = true;
    const element = part.element as HTMLElement;
    // The element is not in the document yet while this render commits,
    // so the focus waits for the next frame.
    requestAnimationFrame(() => {
      element.focus();
      if (element instanceof HTMLInputElement) {
        element.select();
      }
    });
  }

  render(): void {}
}

export const autoFocus = directive(AutoFocusDirective);
