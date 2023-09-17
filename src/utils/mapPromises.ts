export async function mapPromises<T, Ret>(
  iterable: Iterable<T>,
  mapper: (el: T) => Promise<Ret>,
  { concurrency = Infinity }: { concurrency?: number } = {},
): Promise<Ret[]> {
  // TODO: concurrency
  return await Promise.all([...iterable].map(mapper));
}
