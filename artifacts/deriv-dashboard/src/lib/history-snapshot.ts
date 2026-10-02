export interface HistorySnapshot<T> {
  rows: T;
  fresh: boolean;
}

export async function readCachedHistorySnapshot<T>(
  load: () => Promise<T>,
  fallback: T,
): Promise<HistorySnapshot<T>> {
  try {
    return { rows: await load(), fresh: true };
  } catch {
    return { rows: fallback, fresh: false };
  }
}