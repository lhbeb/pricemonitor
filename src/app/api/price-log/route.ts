/**
 * GET /api/price-log
 *
 * Returns the price change log from the price_rules DB.
 * Protected by x-sync-secret header.
 *
 * Usage:
 *   curl -s http://localhost:3000/api/price-log \
 *     -H "x-sync-secret: pricemonitor-admin-2026-x9k2" | jq
 */

import { NextRequest, NextResponse } from 'next/server';

const PRICE_DB_URL = process.env.NEXT_PUBLIC_PRICE_DB_URL!;
const PRICE_DB_KEY = process.env.NEXT_PUBLIC_PRICE_DB_ANON_KEY!;
const SYNC_SECRET = process.env.ADMIN_SYNC_SECRET!;

const HEADERS = {
    apikey: PRICE_DB_KEY,
    Authorization: `Bearer ${PRICE_DB_KEY}`,
};

export async function GET(req: NextRequest) {
    if (req.headers.get('x-sync-secret') !== SYNC_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const res = await fetch(
        `${PRICE_DB_URL}/rest/v1/price_change_log?select=*&order=changed_at.desc&limit=500`,
        { headers: HEADERS }
    );
    if (!res.ok) {
        return NextResponse.json({ error: `DB error: ${res.status}` }, { status: 500 });
    }
    const rows = await res.json();
    return NextResponse.json(rows);
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204 });
}
