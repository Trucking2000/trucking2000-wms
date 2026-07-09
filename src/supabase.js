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

// Save one collection (the whole array) to the cloud.
//
// Last-write-wins: whatever the app currently holds becomes the stored copy.
// This is important for correctness — an earlier version tried to "merge" by
// unioning with the cloud copy, which silently resurrected deleted records
// (e.g. undoing a receive removed an inventory line, then the merge put it back).
// If two people edit the exact same collection within the same second, the later
// save wins; the Refresh button re-pulls the latest.
export async function saveCollection(key, rows) {
  try {
    const { error } = await supabase
      .from("app_data")
      .upsert({ key, value: rows, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}
