/**
 * modelExtractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 1: Extract the canonical model identifier from a pre-normalised title.
 *
 * Input:  normalised lowercase title (already through normalizeTitle())
 * Output: { brand, model } or null
 *
 * Patterns are ordered MOST-SPECIFIC → LEAST-SPECIFIC within each brand.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ModelMatch = {
    brand: string;
    model: string;
};

// ─── Brand detection ──────────────────────────────────────────────────────────

const BRAND_PATTERNS: Array<{ brand: string; rx: RegExp }> = [
    { brand: 'canon', rx: /\b(canon|powershot|canonpowershot)\b/i },
    { brand: 'sony', rx: /\b(sony|alpha)\b/i },
    { brand: 'nikon', rx: /\bnikon\b/i },
    { brand: 'fujifilm', rx: /\b(fujifilm|fuji)\b/i },
    { brand: 'panasonic', rx: /\b(panasonic|lumix)\b/i },
    { brand: 'olympus', rx: /\b(olympus|om system|om-system)\b/i },
    { brand: 'leica', rx: /\bleica\b/i },
    { brand: 'hasselblad', rx: /\bhasselblad\b/i },
    { brand: 'gopro', rx: /\bgopro\b/i },
    { brand: 'dji', rx: /\bdji\b/i },
    { brand: 'ricoh', rx: /\bricoh\b/i },
    { brand: 'pentax', rx: /\bpentax\b/i },
    { brand: 'sigma', rx: /\bsigma\b/i },
    { brand: 'valve', rx: /\b(valve|steam deck)\b/i },
];

export function extractBrand(title: string): string | null {
    for (const { brand, rx } of BRAND_PATTERNS) {
        if (rx.test(title)) return brand;
    }
    return null;
}

// ─── Per-brand model patterns ─────────────────────────────────────────────────

const GEN = /\s*(mark\s*)?(ii{1,3}|iv|v\b)/i;               // roman gen suffix
const genSfx = '(\\s*(mark\\s*)?(ii{1,3}|iv|v\\b))?';       // optional gen suffix string

const MODEL_PATTERNS: Record<string, RegExp[]> = {
    canon: [
        // EOS series — most specific first
        /\beos[- ]?1d\s*x\s*mark\s*(ii|iii)\b/i,
        /\beos[- ]?r5\s*c\b/i,
        new RegExp(`\\beos[- ]?r\\d+${genSfx}\\b`, 'i'),
        new RegExp(`\\br\\d+${genSfx}\\b`, 'i'),
        new RegExp(`\\beos[- ]?m\\d+${genSfx}\\b`, 'i'),
        new RegExp(`\\bm\\d+${genSfx}\\b`, 'i'),
        /\beos[- ]?\d{2,3}d\b/i,
        /\beos[- ]?\d{3,4}d\b/i,
        // PowerShot compact models
        new RegExp(`\\bg\\d+x${genSfx}\\b`, 'i'),       // g7x, g7x mark iii
        new RegExp(`\\bg\\d+${genSfx}\\b`, 'i'),         // g9, g5 etc.
        /\bsx\d{3,4}(hs|is|inchs|inc)?\b/i,             // sx740, sx740hs, sx740inchs
        /\belph\s*\d+\b/i,
        /\bixus\s*\d+\b/i,
    ],

    sony: [
        // Alpha / A-series — most specific first
        /\ba7r\s*(v|iv|iii|ii)\b/i,
        /\ba7s\s*(iii|ii)\b/i,
        /\ba7c\s*(ii)?\b/i,
        /\ba7\s*(iv|iii|ii)\b/i,
        /\ba7\b/i,
        /\ba9\s*(iii|ii)\b/i,
        /\ba9\b/i,
        /\ba1\s*(ii)?\b/i,
        /\ba6[0-9]{3}\b/i,                              // a6700, a6600, a6400, a6100
        // ZV series
        /\bzv[- ]?e10\s*(ii)?\b/i,
        /\bzv[- ]?1\s*(ii)?\b/i,
        // RX series
        /\brx100\s*(vii|vi|v|iv|iii|ii)\b/i,
        /\brx10\s*(iv|iii|ii)\b/i,
        // Cinema
        /\bfx30\b/i,
        /\bfx3\b/i,
    ],

    nikon: [
        /\bz9\b/i,
        /\bz8\b/i,
        /\bzf\b/i,
        /\bzfc\b/i,
        new RegExp(`\\bz\\d+${genSfx}\\b`, 'i'),        // z6, z6 ii, z7 ii, z50
        /\bd\d{3,4}\b/i,                                  // d850, d780, d6
    ],

    fujifilm: [
        /\bgfx100s\s*(ii)?\b/i,
        /\bgfx\d+s?\s*(ii)?\b/i,
        /\bx100v(i)?\b/i,
        /\bx[- ]?h2s\b/i,
        new RegExp(`\\bx[- ]?h\\d+${genSfx}\\b`, 'i'),
        new RegExp(`\\bx[- ]?t\\d+${genSfx}\\b`, 'i'),
        new RegExp(`\\bx[- ]?s\\d+${genSfx}\\b`, 'i'),
        new RegExp(`\\bx[- ]?e\\d+${genSfx}\\b`, 'i'),
        new RegExp(`\\bx[- ]?pro\\d+\\b`, 'i'),
        /\bx[- ]?a\d+\b/i,
    ],

    panasonic: [
        /\blumix\s*(gh6|gh5\s*(ii)?|g9\s*(ii)?|g10|g90|g95|gx9|gx85)\b/i,
        /\blumix\s*s1r\s*(ii)?\b/i,
        new RegExp(`\\blumix\\s*s\\d+${genSfx}\\b`, 'i'),
        /\blumix\s*lx100\s*(ii)?\b/i,
        /\blumix\s*fz\d+\s*(ii)?\b/i,
        /\blumix\s*(fz|tz|zs)\d+\b/i,
    ],

    olympus: [
        new RegExp(`\\bom[- ]?1${genSfx}\\b`, 'i'),
        new RegExp(`\\bom[- ]?5${genSfx}\\b`, 'i'),
        new RegExp(`\\be[- ]?m1x?${genSfx}\\b`, 'i'),
        new RegExp(`\\be[- ]?m5${genSfx}\\b`, 'i'),
        new RegExp(`\\be[- ]?m10${genSfx}\\b`, 'i'),
        /\bpen\s*e[- ]?pl\d+\b/i,
        /\btg[- ]?\d+\b/i,
    ],

    leica: [
        /\bm1[01][- ]?(p|r|mono|monochrom)?\b/i,
        /\bsl2[- ]?s?\b/i,
        /\bq[23]\b/i,
        /\bcl\b/i,
        /\btl2?\b/i,
        /\bs3\b/i,
        /\bd[- ]?lux\s*\d+\b/i,
        /\bv[- ]?lux\s*\d+\b/i,
    ],

    hasselblad: [
        /\bx1d\s*(ii\s*)?50c\b/i,
        /\b907x\s*(50c)?\b/i,
        /\b909x\s*(50c)?\b/i,
    ],

    gopro: [
        /\bhero\s*1[0-9]\s*(black|mini|creator)?\b/i,   // hero10, hero11, hero12, hero13
        /\bhero\s*[0-9]\s*(black|mini|creator)?\b/i,    // hero7, hero8, hero9
        /\bmax\b/i,
    ],

    dji: [
        /\bosmo\s*action\s*\d+\s*(pro)?\b/i,
        /\bosmo\s*action\b/i,
        /\bosmo\s*pocket\s*\d+\b/i,
        /\bosmo\s*pocket\b/i,
        /\bmini\s*[0-9]\s*(pro|cine)?\b/i,              // DJI Mini 4 Pro etc.
        /\bmavic\s*(air|pro|mini)\s*\d*\b/i,
    ],

    ricoh: [
        /\bgr\s*(iii|ii|x)\b/i,
        /\btheta\s*(z1|sc2?|x)\s*(ii)?\b/i,
    ],

    pentax: [
        /\bk[- ]?1\s*(ii)?\b/i,
        /\bk[- ]?3\s*(iii|ii)?\b/i,
        /\bkp\b/i,
        /\b645z?\b/i,
    ],

    sigma: [
        /\bfp\s*l?\b/i,
        /\bdp\d?\s*quattro\b/i,
        /\bquattro\s*h\b/i,
    ],

    valve: [
        /\bsteam\s*deck\s*oled\b/i,                     // most specific first
        /\bsteam\s*deck\s*lcd\b/i,
        /\bsteam\s*deck\b/i,
    ],
};

// ─── Normalise a raw model match string ───────────────────────────────────────

function cleanModel(raw: string): string {
    return raw
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')   // kill special chars
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Main extractor ───────────────────────────────────────────────────────────

export function extractModel(normalizedTitle: string): ModelMatch | null {
    const t = normalizedTitle.toLowerCase();

    const brand = extractBrand(t);
    if (!brand) return null;

    const patterns = MODEL_PATTERNS[brand] ?? [];
    for (const rx of patterns) {
        const m = t.match(rx);
        if (m) {
            return {
                brand,
                model: cleanModel(m[0]),
            };
        }
    }

    // Generic fallback: first token that looks like a model code (letter + digits)
    const generic = t.match(/\b[a-z]{1,4}\d{2,4}[a-z]{0,4}\b/i);
    if (generic) {
        return {
            brand,
            model: cleanModel(generic[0]),
        };
    }

    return { brand, model: '' }; // brand known, model not found — still useful
}
