/**
 * specExtractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer 2: Extract spec variants from a normalised title so that configs
 * within the same model are correctly separated (e.g. Steam Deck OLED 512GB
 * vs 1TB vs 2TB all have the same model but different spec hashes).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type Specs = {
    storage: string | null;   // e.g. "512gb", "1tb", "2tb"
    ram: string | null;       // e.g. "16gb" (RAM only)
    display: string | null;   // "oled" | "lcd" | null
    generation: string | null; // "gen2", "mark ii", etc.
};

export function extractSpecs(normalizedTitle: string): Specs {
    const t = normalizedTitle.toLowerCase();

    // ── Storage ──────────────────────────────────────────────────────────────
    // Match dedicated storage (not RAM) — e.g. 512GB, 1TB, 2TB
    // Exclude patterns followed by "ram" to avoid counting RAM as storage
    const storageMatch = t.match(/\b(\d+(?:\.\d+)?)\s*(tb|gb)\b(?!\s*ram)/i);
    const storage = storageMatch
        ? `${storageMatch[1]}${storageMatch[2].toLowerCase()}`
        : null;

    // ── RAM ──────────────────────────────────────────────────────────────────
    const ramMatch = t.match(/\b(\d+)\s*gb\s*ram\b/i)
        ?? t.match(/\b(\d+)\s*gb\s*ddr/i);
    const ram = ramMatch ? `${ramMatch[1]}gb ram` : null;

    // ── Display type ─────────────────────────────────────────────────────────
    const display = t.includes('oled') ? 'oled'
        : t.includes('lcd') ? 'lcd'
            : null;

    // ── Generation ───────────────────────────────────────────────────────────
    const genMatch =
        t.match(/\bmk\s*(ii{1,3}|iv|\d+)\b/i) ??
        t.match(/\bmark\s*(ii{1,3}|iv|v?\d*)\b/i) ??
        t.match(/\bgen\s*\d+\b/i) ??
        t.match(/\b(ii{1,3}|iv)\b/i);
    const generation = genMatch ? genMatch[0].replace(/\s+/g, ' ').trim().toLowerCase() : null;

    return { storage, ram, display, generation };
}

/**
 * Returns a short deterministic hash string for use in the config group key.
 * Only includes specs that actually vary for this product type.
 */
export function specsHash(specs: Specs): string {
    const parts: string[] = [];
    if (specs.display) parts.push(specs.display);
    if (specs.generation) parts.push(specs.generation);
    if (specs.storage) parts.push(specs.storage);
    if (specs.ram) parts.push(specs.ram);
    return parts.join(' ');
}
