/** Lets pending promise continuations (a fake's async response, Lit's own
 * update scheduler) settle before a test looks at rendered output. */
export async function flushMicrotasks(): Promise<void> {
  for (let tick = 0; tick < 10; tick++) {
    await Promise.resolve();
  }
}
