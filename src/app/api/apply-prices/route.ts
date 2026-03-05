/**
 * POST /api/apply-prices
 *
 * Admin-only — reads fixed prices from the price_rules DB, groups all
 * products, then patches the `price` field on every matching listing
 * in the original products DB to the configured fixed price.
 *
 * Protected by the ADMIN_SYNC_SECRET header.
 *
 * Usage (local):
 *   curl -s -X POST http://localhost:3000/api/apply-prices \
 *     -H "x-sync-secret: pricemonitor-admin-2026-x9k2" | jq
 *
 * Usage (deployed):
 *   curl -s -X POST https://your-domain.com/api/apply-prices \
 *     -H "x-sync-secret: pricemonitor-admin-2026-x9k2" | jq
 *
 * Dry-run (no writes):
 *   curl -s -X POST http://localhost:3000/api/apply-prices \
 *     -H "x-sync-secret: pricemonitor-admin-2026-x9k2" \
 *     -H "x-dry-run: 1" | jq
 */

import { NextRequest, NextResponse } from 'next/server';
import { groupProducts } from '@/lib/grouping';

const PRODUCTS_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PRODUCTS_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PRODUCTS_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;  // write access
const PRICE_DB_URL = process.env.NEXT_PUBLIC_PRICE_DB_URL!;
const PRICE_DB_KEY = process.env.NEXT_PUBLIC_PRICE_DB_ANON_KEY!;
const SYNC_SECRET = process.env.ADMIN_SYNC_SECRET!;

// ── helpers ───────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
    return req.headers.get('x-sync-secret') === SYNC_SECRET;
}

async function fetchAllProducts() {
    const PAGE = 1000;
    const first = await fetch(
        `${PRODUCTS_URL}/rest/v1/products?select=id,slug,title,price,brand,condition,category,images,in_stock,created_at,listed_by&limit=${PAGE}&offset=0&order=created_at.desc`,
        {
            headers: {
                apikey: PRODUCTS_ANON,
                Authorization: `Bearer ${PRODUCTS_ANON}`,
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
                    { headers: { apikey: PRODUCTS_ANON, Authorization: `Bearer ${PRODUCTS_ANON}` } }
                ).then(r => r.json())
            )
        );
        rest.forEach(page => all.push(...page));
    }
    return all;
}

async function fetchPriceRules(): Promise<Record<string, number>> {
    const res = await fetch(`${PRICE_DB_URL}/rest/v1/price_rules?select=config_key,fixed_price`, {
        headers: {
            apikey: PRICE_DB_KEY,
            Authorization: `Bearer ${PRICE_DB_KEY}`,
        },
    });
    if (!res.ok) throw new Error(`Price rules fetch failed: ${res.status}`);
    const rows: Array<{ config_key: string; fixed_price: number }> = await res.json();
    return Object.fromEntries(rows.map(r => [r.config_key, Number(r.fixed_price)]));
}

/** PATCH a single product's price using the service role key */
async function patchPrice(productId: string, newPrice: number): Promise<void> {
    const res = await fetch(
        `${PRODUCTS_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`,
        {
            method: 'PATCH',
            headers: {
                apikey: PRODUCTS_SERVICE,
                Authorization: `Bearer ${PRODUCTS_SERVICE}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
            },
            body: JSON.stringify({ price: newPrice }),
        }
    );
    if (!res.ok) throw new Error(`PATCH ${productId}: ${res.status} ${await res.text()}`);
}

// ── handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dryRun = req.headers.get('x-dry-run') === '1';

    try {
        const startMs = Date.now();
        console.log(`[apply-prices] Starting (dry-run=${dryRun})…`);

        // 1. Fetch everything
        const [products, priceRules] = await Promise.all([
            fetchAllProducts(),
            fetchPriceRules(),
        ]);
        console.log(`[apply-prices] ${products.length} products, ${Object.keys(priceRules).length} price rules`);

        // 2. Group products → build slug → configKey map
        const groups = groupProducts(products);
        const slugToFixedPrice = new Map<string, number>();
        for (const group of groups) {
            const fixedPrice = priceRules[group.key];
            if (fixedPrice == null) continue;
            for (const listing of group.listings) {
                slugToFixedPrice.set(listing.slug, fixedPrice);
            }
        }

        // 3. Patch listings whose price != fixed price
        const toUpdate = products.filter(p => {
            const fp = slugToFixedPrice.get(p.slug);
            return fp != null && Math.abs(p.price - fp) > 0.5; // only where there's a real diff
        });

        console.log(`[apply-prices] ${toUpdate.length} listings need a price update`);

        const errors: string[] = [];
        if (!dryRun) {
            // Batch updates in groups of 20 to avoid hammering the API
            const BATCH = 20;
            for (let i = 0; i < toUpdate.length; i += BATCH) {
                const batch = toUpdate.slice(i, i + BATCH);
                await Promise.all(
                    batch.map(p =>
                        patchPrice(p.id, slugToFixedPrice.get(p.slug)!)
                            .catch(e => errors.push(String(e)))
                    )
                );
            }
        }

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[apply-prices] Done in ${elapsed}s, ${errors.length} errors`);

        return NextResponse.json({
            ok: errors.length === 0,
            dry_run: dryRun,
            products: products.length,
            configs: groups.length,
            updated: dryRun ? 0 : toUpdate.length - errors.length,
            would_update: toUpdate.length,
            errors: errors.slice(0, 10), // cap error list
            elapsed_s: parseFloat(elapsed),
        });

    } catch (err) {
        console.error('[apply-prices] Fatal error:', err);
        return NextResponse.json({ error: String(err) }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
