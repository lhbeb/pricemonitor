import { NextResponse } from 'next/server';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*',
};

// Handle preflight
export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function fetchPage(offset: number, limit: number) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/products?select=id,slug,title,price,brand,condition,category,images,in_stock,created_at,listed_by&offset=${offset}&limit=${limit}&order=created_at.desc`,
        {
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'count=exact',
            },
            next: { revalidate: 60 }, // cache for 60s
        }
    );

    if (!res.ok) {
        throw new Error(`Supabase error: ${res.status}`);
    }

    const contentRange = res.headers.get('content-range') ?? '';
    const total = parseInt(contentRange.split('/')[1] ?? '0', 10);
    const data = await res.json();
    return { data, total };
}

export async function GET() {
    try {
        const PAGE_SIZE = 1000;
        const { data: firstPage, total } = await fetchPage(0, PAGE_SIZE);
        let allProducts = [...firstPage];

        // If there are more pages, fetch them
        if (total > PAGE_SIZE) {
            const remaining = Math.ceil((total - PAGE_SIZE) / PAGE_SIZE);
            const promises = Array.from({ length: remaining }, (_, i) =>
                fetchPage((i + 1) * PAGE_SIZE, PAGE_SIZE).then(r => r.data)
            );
            const rest = await Promise.all(promises);
            rest.forEach(page => allProducts.push(...page));
        }

        return NextResponse.json(
            { products: allProducts, total },
            { headers: CORS_HEADERS }
        );
    } catch (err) {
        console.error('Products fetch error:', err);
        return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
    }
}
