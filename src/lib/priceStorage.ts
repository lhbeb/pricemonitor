/**
 * priceStorage.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists calculated fixed prices to a dedicated Supabase project.
 *
 * Required table in the price DB (run once in the Supabase SQL editor):
 *
 *   CREATE TABLE price_rules (
 *     config_key   TEXT PRIMARY KEY,
 *     config_name  TEXT NOT NULL,
 *     fixed_price  NUMERIC(10,2) NOT NULL,
 *     saved_at     TIMESTAMPTZ DEFAULT now()
 *   );
 *
 * Required env vars in .env.local:
 *   NEXT_PUBLIC_PRICE_DB_URL=https://<project>.supabase.co
 *   NEXT_PUBLIC_PRICE_DB_ANON_KEY=<anon-key>
 * ─────────────────────────────────────────────────────────────────────────────
 */

const PRICE_DB_URL = process.env.NEXT_PUBLIC_PRICE_DB_URL!;
const PRICE_DB_KEY = process.env.NEXT_PUBLIC_PRICE_DB_ANON_KEY!;

const BASE_HEADERS = {
    apikey: PRICE_DB_KEY,
    Authorization: `Bearer ${PRICE_DB_KEY}`,
    'Content-Type': 'application/json',
};

export type SavedPriceRecord = {
    configKey: string;
    configName: string;
    fixedPrice: number;
    savedAt: string; // ISO string
};

// ─── Load all saved price records ────────────────────────────────────────────

export async function loadAllPrices(): Promise<Record<string, SavedPriceRecord>> {
    try {
        const res = await fetch(
            `${PRICE_DB_URL}/rest/v1/price_rules?select=*`,
            { headers: BASE_HEADERS }
        );
        if (!res.ok) throw new Error(`loadAllPrices: ${res.status}`);
        const rows: Array<{
            config_key: string;
            config_name: string;
            fixed_price: number;
            saved_at: string;
        }> = await res.json();
        return Object.fromEntries(
            rows.map(r => [r.config_key, {
                configKey: r.config_key,
                configName: r.config_name,
                fixedPrice: r.fixed_price,
                savedAt: r.saved_at,
            }])
        );
    } catch (err) {
        console.error('loadAllPrices error:', err);
        return {};
    }
}

// ─── Save / update a batch of price records (upsert) ─────────────────────────

export async function savePrices(records: SavedPriceRecord[]): Promise<void> {
    if (records.length === 0) return;
    const body = records.map(r => ({
        config_key: r.configKey,
        config_name: r.configName,
        fixed_price: r.fixedPrice,
        saved_at: r.savedAt,
    }));
    const res = await fetch(`${PRICE_DB_URL}/rest/v1/price_rules`, {
        method: 'POST',
        headers: {
            ...BASE_HEADERS,
            Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        console.error('savePrices error:', res.status, await res.text());
    }
}

// ─── Delete a single price record ─────────────────────────────────────────────

export async function deletePrice(configKey: string): Promise<void> {
    const res = await fetch(
        `${PRICE_DB_URL}/rest/v1/price_rules?config_key=eq.${encodeURIComponent(configKey)}`,
        {
            method: 'DELETE',
            headers: BASE_HEADERS,
        }
    );
    if (!res.ok) {
        console.error('deletePrice error:', res.status, await res.text());
    }
}
