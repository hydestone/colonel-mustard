import { getSupabaseAdmin } from "./supabase";

/**
 * Fetch all rows from a Supabase table, paginating in chunks of 1000.
 * Supabase caps queries at 1000 rows by default.
 */
export async function fetchAllRows(
  table: string,
  select: string,
  filters: { column: string; value: any }[],
  orderBy?: { column: string; ascending: boolean }
) {
  const supabase = getSupabaseAdmin();
  const pageSize = 1000;
  let allData: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    for (const f of filters) {
      query = query.eq(f.column, f.value);
    }

    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending });
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) break;

    allData = allData.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allData;
}
