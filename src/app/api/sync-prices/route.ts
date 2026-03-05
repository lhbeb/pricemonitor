/**
 * POST /api/sync-prices
 *
 * Admin-only endpoint — fetches all products, recalculates fixed prices
 * (avg × 1.05, rounded to nearest dollar), and upserts them into the
 * price_rules table in the dedicated price Supabase DB.
 *
 * Protected by the ADMIN_SYNC_SECRET header. Never exposed in the UI.
 *
 * Usage (local):
 *   curl -s -X POST http://localhost:3000/api/sync-prices \
 *     -H "x-sync-secret: pricemonitor-admin-2026-x9k2" | jq
 *
 * Usage (deployed, e.g. Vercel):
 *   curl -s -X POST https://your-domain.com/api/sync-prices \
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

// ── Auth ──────────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
    return req.headers.get('x-sync-secret') === SYNC_SECRET;
}

// ── Fetch all products (paginated) ────────────────────────────────────────────
async function fetchAllProducts() {
    const PAGE = 1000;
    const first = await fetch(
        `${PRODUCTS_URL}/rest/v1/products?select=id,slug,title,price,brand,condition,category,images,in_stock,created_at,listed_by&limit=${PAGE}&offset=0&order=created_at.desc`,
        {
            headers: {
                apikey: PRODUCTS_KEY,
                Authorization: `Bearer ${PRODUCTS_KEY}`,
                Prefer: 'count=exact',
            },
        }
    );
    if (!first.ok) throw new Error(`Products fetch failed: ${first.status}`);
    const total = parseInt(first.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    const data = await first.json();
    let all = [...data];

    if (total > PAGE) {
        const pages = Math.ceil((total - PAGE) / PAGE);
        const rest = await Promise.all(
            Array.from({ length: pages }, (_, i) =>
                fetch(
                    `${PRODUCTS_URL}/rest/v1/products?select=id,slug,title,price,brand,condition,category,images,in_stock,created_at,listed_by&limit=${PAGE}&offset=${(i + 1) * PAGE}&order=created_at.desc`,
                    {
                        headers: {
                            apikey: PRODUCTS_KEY,
                            Authorization: `Bearer ${PRODUCTS_KEY}`,
                        },
                    }
                ).then(r => r.json())
            )
        );
        rest.forEach(page => all.push(...page));
    }
    return all;
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

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const startMs = Date.now();

        console.log('[sync-prices] Fetching products…');
        const products = await fetchAllProducts();
        console.log(`[sync-prices] ${products.length} products fetched`);

        const groups = groupProducts(products);
        console.log(`[sync-prices] ${groups.length} configs grouped`);

        const now = new Date().toISOString();
        const records = groups.map(g => ({
            config_key: g.key,
            config_name: g.normalizedName,
            fixed_price: g.suggestedFixedPrice,
            saved_at: now,
        }));

        await upsertPrices(records);

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[sync-prices] Done in ${elapsed}s`);

        return NextResponse.json({
            ok: true,
            configs: groups.length,
            products: products.length,
            elapsed_s: parseFloat(elapsed),
            synced_at: now,
        });
    } catch (err) {
        console.error('[sync-prices] Error:', err);
        return NextResponse.json(
            { error: String(err) },
            { status: 500 }
        );
    }
}

// Block all other methods
export async function GET() {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
