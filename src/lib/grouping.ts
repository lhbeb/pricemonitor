import { Product } from './supabase';

export type PricePoint = {
    slug: string;
    title: string;
    price: number;
    image: string | null;
    in_stock: boolean;
    condition: string;
};

export type ProductGroup = {
    key: string;
    normalizedName: string;
    listingCount: number;
    prices: number[];
    minPrice: number;
    maxPrice: number;
    avgPrice: number;
    suggestedFixedPrice: number;
    priceRange: number;
    priceSpread: number;
    listings: PricePoint[];
    thumbnail: string | null;
};

// ─── Helper ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Words stripped from DISPLAY NAME + KEY ──────────────────────────────────

const COLORS = new Set([
    'black', 'white', 'silver', 'gold', 'graphite', 'midnight', 'starlight',
    'pink', 'purple', 'green', 'blue', 'red', 'orange', 'yellow', 'gray', 'grey',
    'rose', 'coral', 'teal', 'cyan', 'brown', 'beige', 'cream', 'ivory',
    'charcoal', 'titanium', 'natural', 'space grey', 'space gray',
    'deep purple', 'pacific blue', 'sierra', 'frost', 'cobalt', 'obsidian',
    'sage', 'chalk', 'clay', 'storm', 'sky', 'sand', 'dune', 'slate', 'hazel',
    'light', 'violet', 'product red',
]);

const CONDITION_WORDS = new Set([
    // Multi-word conditions first (longest first matters)
    'brand new', 'like new', 'open box', 'very good', 'like new',
    'excellent condition', 'great condition', 'good condition', 'fair condition',
    'mint condition', 'lightly used', 'gently used', 'pre-owned', 'preowned',
    'seller refurbished', 'manufacturer refurbished', 'factory restored',
    'new in box', 'factory sealed', 'grade a', 'grade b',
    // Single-word conditions
    'certified', 'oem', 'restored', 'repaired', 'sealed',
    'refurbished', 'renewed', 'used', 'new', 'mint', 'nib',
    'open', 'lightly', 'gently', 'barely',
]);

const MARKETING_WORDS = new Set([
    'bundle', 'combo', 'deal', 'special', 'limited', 'edition',
    'authentic', 'genuine', 'original', 'official', 'unlocked', 'deactivated',
    'wifi', 'wi fi', 'wi-fi', 'lte', '4g', '5g', 'cellular', 'gps', 'esim',
    'dual sim', 'fast ship', 'ships fast', 'free ship', 'free shipping',
    'latest', 'release',
]);

// Generic product-type labels — never distinguish a specific product
const FORM_FACTORS = new Set([
    'point shoot', 'point and shoot', 'digital camera', 'compact camera',
    'mirrorless camera', 'dslr camera', 'slr', 'mirrorless', 'interchangeable lens',
    'action camera', 'video camera', 'security camera', 'camera body', 'camera kit',
    'vlogging camera', 'travel camera',
    'smartphone', 'smart phone', 'mobile phone', 'cell phone', 'android phone',
    'tablet pc', 'android tablet', 'laptop computer', 'notebook computer',
    'gaming laptop', 'gaming desktop', 'gaming pc', 'gaming computer',
    'portable computer', 'all in one', 'handheld console', 'handheld gaming',
    'gaming console', 'video game console', 'gaming handheld',
    'wireless earbuds', 'bluetooth headphones', 'wireless headphones', 'bluetooth speaker',
    'smart watch', 'smartwatch',
]);

// ─── Words stripped from KEY ONLY ────────────────────────────────────────────

const KEY_ONLY_STRIP = new Set([
    // Sensor / image quality descriptors
    'aps c', 'aps-c', 'full frame', 'crop sensor',
    'image stabilization', 'stabilizer', 'stabilization', 'ois',
    // Common accessories / bundles in listing titles
    'with case', 'with charger', 'with battery', 'with dock',
    'with accessories', 'with box', 'with cable', 'with sd card',
    'case included', 'charger included', 'dock included',
    'extra battery', 'extra batteries', 'extra batterie',
    'cables included', 'cable included', 'memory card', 'sd card',
    'docking station', 'steam dock', 'jsaux case', 'tpu case', 'hard case',
    'lowepro case', 'carrying case', 'carrying',
    // Condition adjectives in listing titles (not in CONDITION_WORDS)
    'fully functional', 'fully working', 'tested', 'excellent', 'great',
    'good', 'fair', 'perfect', 'complete', 'only', 'twice', 'once',
    'favorite', 'cosmetic', 'damage', 'near complete', 'near mint',
    'intermittent', 'bumper', 'left bumper',
    // Feature descriptors that don\'t distinguish the model
    'vlogging', 'travel', 'premium', 'compact', 'mini',
    'built in', 'built-in', 'camera',
    // Display / screen adjectives
    'matte', 'anti glare', 'anti-glare', 'etched glass', 'etched',
    'hdr', 'display', 'screen',
    // Resolution / video (secondary)
    '4k', '8k', '1080p', '720p',
    // Noise words in international listings
    'aus', 'uk', 'us', 'warranty', 'guarantee', 'ovp',
    // Accessories
    'controller', 'dock', 'ssd', 'microsd',
    'fast charger', 'power adapter', 'full set',
    // Generic modifiers
    'body only', 'body',
    'us model', 'international', 'us version',
    // Connectivity
    'wi fi', 'bluetooth', 'wireless',
    // OS / platform descriptors
    'dual boot', 'steamos', 'windows', 'shell',
    // Generic product type words (don\'t distinguish configs)
    'console', 'system', 'handheld', 'pc',
    // Chip / hardware marketing
    'amd', 'apu', 'amd apu',
    // Extras in listing titles
    'includes', 'included', 'extras', 'accessories',
]);

// ─── Normalise title → display name ──────────────────────────────────────────

export function normalizeTitle(title: string): string {
    let t = title.toLowerCase().trim();

    // 1. Remove emojis & special chars (keep alphanumerics, spaces, slash, dot)
    t = t.replace(/[\uD800-\uDFFF]/g, '');
    t = t.replace(/[\u2600-\u27BF]/g, '');
    t = t.replace(/[^\w\s\/\.]/g, ' ');

    // 2. Normalise "wi-fi" → "wi fi" consistently so multi-word matching works
    t = t.replace(/wi[\s-]+fi\b/gi, 'wi fi');

    // 3. Strip multi-word/single-word phrases (longest first)
    const allPhrases = Array.from(CONDITION_WORDS)
        .concat(Array.from(MARKETING_WORDS))
        .concat(Array.from(FORM_FACTORS))
        .sort((a, b) => b.length - a.length);
    allPhrases.forEach(p =>
        t = t.replace(new RegExp(`\\b${escapeRegex(p)}\\b`, 'gi'), ' ')
    );

    // 4. Strip colors
    Array.from(COLORS).sort((a, b) => b.length - a.length).forEach(c =>
        t = t.replace(new RegExp(`\\b${escapeRegex(c)}\\b`, 'gi'), ' ')
    );

    // 5. Normalise storage — handle "1T SSD", "256GB", "1TB"
    t = t.replace(/(\d+)\s*tb\b/gi, (_, n) => `${n}TB`);
    t = t.replace(/\b(\d+)\s*t(?=\s|$)/gi, (_, n) => `${n}TB`); // 1T → 1TB
    t = t.replace(/(\d+)\s*gb\b/gi, (_, n) => `${n}GB`);
    t = t.replace(/(\d+)\s*mb\b/gi, (_, n) => `${n}MB`);

    // 6. Normalise screen sizes
    t = t.replace(/(\d+(?:\.\d+)?)\s*['"inch]+/gi, (_, n) => `${n}inch`);
    t = t.replace(/(\d+(?:\.\d+)?)\s*-?\s*inch/gi, (_, n) => `${n}inch`);

    // 7. Normalise megapixels: "20.1mp" / "20.1 megapixels" → "20mp"
    t = t.replace(/(\d+)(?:\.\d+)?\s*(?:mp|megapixels?)\b/gi, (_, n) => `${n}mp`);

    // 8. Normalise generation markers
    t = t.replace(/\bgen(?:eration)?\s*(\d+)\b/gi, (_, n) => `gen${n}`);
    t = t.replace(/(\d+)(?:st|nd|rd|th)\s*gen(?:eration)?\b/gi, (_, n) => `gen${n}`);

    // 9. Normalise "G7 X" → "G7X" (camera model naming inconsistency)
    //    Catches patterns like "G7 X", "G1 X", "G5 X" where letter-number is split from trailing X
    t = t.replace(/\b(g\d+)\s+(x)\b/gi, (_, g, x) => `${g}${x}`);

    // 10. Collapse whitespace
    t = t.replace(/\s+/g, ' ').trim();

    return t;
}

// ─── Extract group key (core identity only) ───────────────────────────────────

export function extractGroupKey(normalizedTitle: string): string {
    let k = normalizedTitle.toLowerCase();

    // Strip secondary specs (longest first)
    Array.from(KEY_ONLY_STRIP).sort((a, b) => b.length - a.length).forEach(p =>
        k = k.replace(new RegExp(`\\b${escapeRegex(p)}\\b`, 'gi'), ' ')
    );

    // Strip condition ratings: "9/10", "8/10"
    k = k.replace(/\b\d+\/10\b/g, ' ');

    // Strip standalone display type adjectives not identifying the product
    k = k.replace(/\b(anti[- ]?glare|etched glass|matte|hdr)\b/gi, ' ');

    // Strip megapixel tokens: "20mp"
    k = k.replace(/\b\d+mp\b/gi, ' ');

    // Strip resolution tokens: "4k", "1080p"
    k = k.replace(/\b\d+[kp]\b/gi, ' ');

    // Strip STANDALONE zoom values: "40x", "4.2x"
    // \b before \d ensures "7x" inside "g7x" is NOT matched
    k = k.replace(/\b\d+(?:\.\d+)?x\b/g, ' ');

    // Strip long alphanumeric part numbers (e.g. "3638c001")
    k = k.replace(/\b[a-z]{1,3}\d{4,}\b/gi, ' ');

    // Strip RAM labels
    k = k.replace(/\b\d+GB\s+ram\b/gi, ' ');

    // Strip stray filler words
    k = k.replace(/\b(with|and|for|the|in|of|an|a|w)\b/gi, ' ');

    // Tokenise — keep meaningful tokens only
    const tokens = k
        .split(/\s+/)
        .map(t => t.trim())
        .filter(t => t.length > 1)         // drop single chars
        .filter(t => !/^\d+$/.test(t));    // drop bare numbers

    const specTokens = tokens
        .filter(t => /\d+TB|\d+GB|\d+MB|\d+inch|gen\d/i.test(t))
        .sort();
    const wordTokens = tokens
        .filter(t => !/\d+TB|\d+GB|\d+MB|\d+inch|gen\d/i.test(t));

    return [...wordTokens, ...specTokens].join(' ').toLowerCase();
}

// ─── Display name ─────────────────────────────────────────────────────────────

function toDisplayName(normalizedTitle: string): string {
    const result = normalizedTitle
        .split(' ')
        .map(w => {
            if (/\d+(GB|TB|MB|inch)/i.test(w)) return w.toUpperCase();
            if (/gen\d/i.test(w)) return 'Gen' + w.slice(3);
            if (/\d+mp/i.test(w)) return w.toUpperCase();
            return w; // keep lowercase — no per-word capitalisation
        })
        .join(' ');
    // Capitalise only the very first character (sentence case)
    return result.charAt(0).toUpperCase() + result.slice(1);
}

// ─── Fuzzy token overlap [0–1] ────────────────────────────────────────────────

function tokenOverlap(keyA: string, keyB: string): number {
    const tokA = new Set(keyA.split(' ').filter(t => t.length > 1));
    const tokB = new Set(keyB.split(' ').filter(t => t.length > 1));
    if (tokA.size === 0 || tokB.size === 0) return 0;
    let shared = 0;
    tokA.forEach(t => { if (tokB.has(t)) shared++; });
    return shared / Math.max(tokA.size, tokB.size);
}

// ─── Merge guard — blocks merges when distinguishing specs differ ─────────────

function canMerge(keyA: string, keyB: string): boolean {
    const tokA = keyA.split(' ').filter(t => t.length > 1);
    const tokB = keyB.split(' ').filter(t => t.length > 1);

    // Refuse to merge very short keys — too risky
    if (tokA.length < 3 || tokB.length < 3) return false;

    // Display type must match: lcd ≠ oled
    const dispA = keyA.includes('oled') ? 'oled' : keyA.includes('lcd') ? 'lcd' : null;
    const dispB = keyB.includes('oled') ? 'oled' : keyB.includes('lcd') ? 'lcd' : null;
    if (dispA && dispB && dispA !== dispB) return false;

    // Roman numeral generations must match (Mark II ≠ Mark III)
    const romanRx = /\b(ii|iii|iv|vi{1,3}|viii|ix)\b/gi;
    const romanA = Array.from(new Set((keyA.match(romanRx) ?? []).map(r => r.toLowerCase()))).sort();
    const romanB = Array.from(new Set((keyB.match(romanRx) ?? []).map(r => r.toLowerCase()))).sort();
    if (romanA.join(',') !== romanB.join(',')) return false;

    // Storage specs must match (512GB ≠ 1TB)
    const storageA = (keyA.match(/\d+[GT]B/gi) ?? []).map(s => s.toUpperCase()).sort();
    const storageB = (keyB.match(/\d+[GT]B/gi) ?? []).map(s => s.toUpperCase()).sort();
    if (storageA.join(',') !== storageB.join(',')) return false;

    // Named generation markers must match (gen1 ≠ gen2)
    const genA = (keyA.match(/gen\d+/gi) ?? []).map(g => g.toLowerCase()).sort();
    const genB = (keyB.match(/gen\d+/gi) ?? []).map(g => g.toLowerCase()).sort();
    if (genA.join(',') !== genB.join(',')) return false;

    return true;
}

// ─── Main grouping function ───────────────────────────────────────────────────

export function groupProducts(products: Product[]): ProductGroup[] {
    const map = new Map<string, ProductGroup>();

    for (const product of products) {
        const normalized = normalizeTitle(product.title);
        const key = extractGroupKey(normalized);
        if (!key || key.trim().length < 3) continue;

        const listing: PricePoint = {
            slug: product.slug,
            title: product.title,
            price: product.price,
            image: product.images?.[0] ?? null,
            in_stock: product.in_stock,
            condition: product.condition ?? '',
        };

        const existing = map.get(key);
        if (existing) {
            existing.listings.push(listing);
            existing.prices.push(product.price);
            existing.listingCount++;
            if (!existing.thumbnail && listing.image) existing.thumbnail = listing.image;
        } else {
            map.set(key, {
                key,
                normalizedName: toDisplayName(normalized),
                listingCount: 1,
                prices: [product.price],
                minPrice: 0, maxPrice: 0, avgPrice: 0,
                suggestedFixedPrice: 0, priceRange: 0, priceSpread: 0,
                listings: [listing],
                thumbnail: listing.image,
            });
        }
    }

    // ── Fuzzy post-merge: 74% overlap threshold + canMerge guard ─────────────
    const keys = Array.from(map.keys());
    const merged = new Set<string>();

    for (let i = 0; i < keys.length; i++) {
        if (merged.has(keys[i])) continue;
        const groupA = map.get(keys[i])!;

        for (let j = i + 1; j < keys.length; j++) {
            if (merged.has(keys[j])) continue;
            const groupB = map.get(keys[j])!;

            const overlap = tokenOverlap(keys[i], keys[j]);
            if (overlap >= 0.74 && canMerge(keys[i], keys[j])) {
                const [primary, secondary] = groupA.listingCount >= groupB.listingCount
                    ? [groupA, groupB] : [groupB, groupA];
                const secondaryKey = primary === groupA ? keys[j] : keys[i];

                primary.listings.push(...secondary.listings);
                primary.prices.push(...secondary.prices);
                primary.listingCount += secondary.listingCount;
                if (!primary.thumbnail && secondary.thumbnail) primary.thumbnail = secondary.thumbnail;

                merged.add(secondaryKey);
                map.delete(secondaryKey);
            }
        }
    }

    // ── Compute stats ─────────────────────────────────────────────────────────
    const groups: ProductGroup[] = [];
    map.forEach(group => {
        const prices = group.prices.filter(p => p > 0).sort((a, b) => a - b);
        group.minPrice = prices[0] ?? 0;
        group.maxPrice = prices[prices.length - 1] ?? 0;
        group.avgPrice = prices.length
            ? Math.round((prices.reduce((s, p) => s + p, 0) / prices.length) * 100) / 100
            : 0;
        group.suggestedFixedPrice =
            Math.round(group.avgPrice * 1.05);
        group.priceRange = group.maxPrice - group.minPrice;
        group.priceSpread = group.minPrice > 0
            ? Math.round(((group.maxPrice - group.minPrice) / group.minPrice) * 100)
            : 0;
        group.listings.sort((a, b) => a.price - b.price);
        groups.push(group);
    });

    return groups.sort((a, b) =>
        b.listingCount !== a.listingCount
            ? b.listingCount - a.listingCount
            : b.priceRange - a.priceRange
    );
}
