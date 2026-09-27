// Supabase's API returns at most 1,000 rows per request by default, silently
// dropping the rest. A year of daily logging across six habits is ~2,200 rows,
// so any "load everything" query must page through the results.

const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Runs `page(from, to)` for successive 1,000-row windows until a short page
 * comes back. The query must have a stable `.order(...)` so pages don't
 * overlap or skip rows.
 */
export async function fetchAllRows<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}
