/**
 * POST /api/sync-prices
 *
 * Admin-only endpoint — fetches all products, recalculates fixed prices
 * (avg × 1.05, rounded to nearest dollar), upserts them into price_rules,
 * and writes an audit row to price_change_log for every config whose price changed.
 *
 * Protected by the ADMIN_SYNC_SECRET header. Never exposed in the UI.
 *
 * Usage (local):
 *   curl -s -X POST http://localhost:3000/api/sync-prices \
 *     -H "x-sync-secret: pricemonitor-admin-2026-x9k2" | jq
 */

import { NextRequest, NextResponse } from 'next/server';
import { groupProducts } from '@/lib/grouping';

const PRODUCTS_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PRODUCTS_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PRICE_DB_URL = process.env.NEXT_PUBLIC_PRICE_DB_URL!;
const PRICE_DB_KEY = process.env.NEXT_PUBLIC_PRICE_DB_ANON_KEY!;
const SYNC_SECRET = process.env.ADMIN_SYNC_SECRET!;

const PRICE_HEADERS = {
    apikey: PRICE_DB_KEY,
    Authorization: `Bearer ${PRICE_DB_KEY}`,
    'Content-Type': 'application/json',
};

function isAuthorized(req: NextRequest): boolean {
    return req.headers.get('x-sync-secret') === SYNC_SECRET;
}

// ── Fetch all products (paginated) ────────────────────────────────────────────
async function fetchAllProducts() {
    const PAGE = 1000;
    const first = await fetch(
        `${PRODUCTS_URL}/rest/v1/products?select=id,slug,title,price,brand,condition,category,images,in_stock,created_at,listed_by&limit=${PAGE}&offset=0&order=created_at.desc`,
        { headers: { apikey: PRODUCTS_KEY, Authorization: `Bearer ${PRODUCTS_KEY}`, Prefer: 'count=exact' } }
    );
    if (!first.ok) throw new Error(`Products fetch failed: ${first.status}`);
    const total = parseInt(first.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    let all = [...await first.json()];
    if (total > PAGE) {
        const rest = await Promise.all(
            Array.from({ length: Math.ceil((total - PAGE) / PAGE) }, (_, i) =>
                fetch(
                    `${PRODUCTS_URL}/rest/v1/products?select=id,slug,title,price,brand,condition,category,images,in_stock,created_at,listed_by&limit=${PAGE}&offset=${(i + 1) * PAGE}&order=created_at.desc`,
                    { headers: { apikey: PRODUCTS_KEY, Authorization: `Bearer ${PRODUCTS_KEY}` } }
                ).then(r => r.json())
            )
        );
        rest.forEach(page => all.push(...page));
    }
    return all;
}

// ── Fetch existing price_rules ────────────────────────────────────────────────
async function fetchExistingPrices(): Promise<Record<string, number>> {
    const res = await fetch(
        `${PRICE_DB_URL}/rest/v1/price_rules?select=config_key,fixed_price`,
        { headers: PRICE_HEADERS }
    );
    if (!res.ok) return {};
    const rows: Array<{ config_key: string; fixed_price: number }> = await res.json();
    return Object.fromEntries(rows.map(r => [r.config_key, Number(r.fixed_price)]));
}

// ── Upsert price_rules ────────────────────────────────────────────────────────
async function upsertPrices(records: object[]) {
    const res = await fetch(`${PRICE_DB_URL}/rest/v1/price_rules`, {
        method: 'POST',
        headers: { ...PRICE_HEADERS, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(records),
    });
    if (!res.ok) throw new Error(`Upsert failed: ${res.status} — ${await res.text()}`);
}

// ── Insert change log entries ─────────────────────────────────────────────────
async function logChanges(entries: object[]) {
    if (entries.length === 0) return;
    await fetch(`${PRICE_DB_URL}/rest/v1/price_change_log`, {
        method: 'POST',
        headers: { ...PRICE_HEADERS, Prefer: 'return=minimal' },
        body: JSON.stringify(entries),
    });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const startMs = Date.now();
        console.log('[sync-prices] Fetching products & existing prices…');

        const [products, existingPrices] = await Promise.all([
            fetchAllProducts(),
            fetchExistingPrices(),
        ]);
        console.log(`[sync-prices] ${products.length} products, ${Object.keys(existingPrices).length} existing rules`);

        const groups = groupProducts(products);
        console.log(`[sync-prices] ${groups.length} configs grouped`);

        const now = new Date().toISOString();

        // Build upsert records + detect changes for the audit log
        const records: object[] = [];
        const changeLogs: object[] = [];

        for (const g of groups) {
            const newPrice = g.suggestedFixedPrice;
            const oldPrice = existingPrices[g.key] ?? null;

            records.push({
                config_key: g.key,
                config_name: g.normalizedName,
                fixed_price: newPrice,
                saved_at: now,
            });

            // Log if this is a new config (no previous price) or if price actually changed
            if (oldPrice === null || Math.abs(oldPrice - newPrice) >= 0.5) {
                changeLogs.push({
                    config_key: g.key,
                    config_name: g.normalizedName,
                    old_price: oldPrice,
                    new_price: newPrice,
                    changed_at: now,
                });
            }
        }

        await upsertPrices(records);
        await logChanges(changeLogs);

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[sync-prices] Done in ${elapsed}s — ${changeLogs.length} price changes logged`);

        return NextResponse.json({
            ok: true,
            configs: groups.length,
            products: products.length,
            changed: changeLogs.length,
            elapsed_s: parseFloat(elapsed),
            synced_at: now,
        });
    } catch (err) {
        console.error('[sync-prices] Error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
