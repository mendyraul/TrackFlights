/** Bound dependency probes even if a client fails to settle after cancellation. */
export async function withinDeadline<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = 3000
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Dependency probe timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
