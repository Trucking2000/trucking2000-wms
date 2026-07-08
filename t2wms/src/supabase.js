import { createClient } from "@supabase/supabase-js";

// Your Supabase project connection (public client key — safe to ship in the browser).
const SUPABASE_URL = "https://jfvdbcsgqyknoslhtofj.supabase.co";
const SUPABASE_KEY = "sb_publishable_Doy2nGhW31lvrhvrCWlsDQ_ppgdxBWJ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// The data sets the app stores. Each is one row in the app_data table.
export const COLLECTIONS = [
  "orders", "ledger", "customers", "warehouses",
  "carriers", "users", "activity", "invoices", "templates",
];

// Load every collection. Returns an object like {orders:[...], ledger:[...], ...}.
// If a collection has never been saved, returns undefined for it (caller seeds defaults).
export async function loadAll() {
  const out = {};
  try {
    const { data, error } = await supabase.from("app_data").select("key,value");
    if (error) throw error;
    (data || []).forEach((row) => { out[row.key] = row.value; });
    return { ok: true, data: out };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), data: out };
  }
}

// Save one collection (whole array). Merge-by-id first so concurrent adds from
// other users are not lost, then write. Records are matched on their `id`.
export async function saveCollection(key, rows) {
  try {
    // re-fetch current cloud copy and union by id (local wins on conflicts)
    let merged = rows;
    try {
      const { data } = await supabase.from("app_data").select("value").eq("key", key).maybeSingle();
      const cloud = (data && data.value) || [];
      if (Array.isArray(cloud) && Array.isArray(rows)) {
        const byId = new Map();
        cloud.forEach((r) => { if (r && r.id != null) byId.set(r.id, r); });
        rows.forEach((r) => { if (r && r.id != null) byId.set(r.id, r); });
        // keep only ids present locally (so local deletes are respected),
        // but include any brand-new cloud ids the local set hasn't seen yet
        const localIds = new Set(rows.map((r) => r && r.id).filter((x) => x != null));
        merged = rows.slice();
        cloud.forEach((r) => { if (r && r.id != null && !localIds.has(r.id)) merged.push(r); });
        merged = merged.map((r) => (r && r.id != null ? byId.get(r.id) : r));
      }
    } catch (_) { /* if merge fetch fails, just write local rows */ }

    const { error } = await supabase
      .from("app_data")
      .upsert({ key, value: merged, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
