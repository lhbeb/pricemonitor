/**
 * POST /api/admin/fix-violations
 *
 * Body: { dryRun: boolean, fixes: Array<{ slug: string; fixedPrice: number }> }
 * Header: x-admin-secret: <password>
 *
 * dryRun=true  → returns the list of planned fixes (no writes)
 * dryRun=false → PATCHes price on each slug in the main products DB
 */

import { NextRequest, NextResponse } from 'next/server';

const ADMIN_SECRET = 'Mehbde!!2';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface FixItem {
    slug: string;
    fixedPrice: number;
}

interface ResultItem extends FixItem {
    ok: boolean;
    error?: string;
}

export async function POST(req: NextRequest) {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const secret = req.headers.get('x-admin-secret');
    if (secret !== ADMIN_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dryRun, fixes }: { dryRun: boolean; fixes: FixItem[] } = await req.json();

    if (!Array.isArray(fixes) || fixes.length === 0) {
        return NextResponse.json({ results: [], updated: 0 });
    }

    // ── Dry run — just return the plan ────────────────────────────────────────
    if (dryRun) {
        return NextResponse.json({
            dryRun: true,
            count: fixes.length,
            fixes,
        });
    }

    // ── Live run — PATCH each slug ────────────────────────────────────────────
    const results: ResultItem[] = [];

    await Promise.all(
        fixes.map(async ({ slug, fixedPrice }) => {
            try {
                const res = await fetch(
                    `${SUPABASE_URL}/rest/v1/products?slug=eq.${encodeURIComponent(slug)}`,
                    {
                        method: 'PATCH',
                        headers: {
                            apikey: SERVICE_KEY,
                            Authorization: `Bearer ${SERVICE_KEY}`,
                            'Content-Type': 'application/json',
                            Prefer: 'return=minimal',
                        },
                        body: JSON.stringify({ price: fixedPrice }),
                    }
                );
                results.push({ slug, fixedPrice, ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` });
            } catch (err) {
                results.push({ slug, fixedPrice, ok: false, error: String(err) });
            }
        })
    );

    const updated = results.filter(r => r.ok).length;
    return NextResponse.json({ dryRun: false, updated, total: fixes.length, results });
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}
