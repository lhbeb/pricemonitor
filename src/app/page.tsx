'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Product } from '@/lib/supabase';
import { groupProducts } from '@/lib/grouping';
import { loadAllPrices, savePrices, SavedPriceRecord } from '@/lib/priceStorage';
import ConfigCard from '@/components/ConfigCard';
import PriceSchedule from '@/components/PriceSchedule';
import ViolationsPanel from '@/components/ViolationsPanel';

type SortKey = 'listings' | 'price-asc' | 'price-desc' | 'spread' | 'range' | 'violations';

export default function DashboardPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('listings');
    const [onlyWithVariations, setOnlyWithVariations] = useState(false);
    const [onlyViolations, setOnlyViolations] = useState(false);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    // savedPrices: configKey → SavedPriceRecord (loaded from storage)
    const [savedPrices, setSavedPrices] = useState<Record<string, SavedPriceRecord>>({});

    // ── Load saved prices from storage on mount ──────────────────────────────
    useEffect(() => {
        loadAllPrices().then(setSavedPrices);
    }, []);

    // ── Fetch products from API ──────────────────────────────────────────────
    const fetchProducts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/products');
            if (!res.ok) throw new Error('Failed to fetch');
            const { products: data } = await res.json();
            setProducts(data ?? []);
            setLastFetched(new Date());
        } catch {
            setError('Could not load products. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    // ── Grouping ─────────────────────────────────────────────────────────────
    const allGroups = useMemo(() => groupProducts(products), [products]);
    const allPricesFlat = useMemo(
        () => allGroups.flatMap(g => g.prices).filter(p => p > 0),
        [allGroups]
    );

    // ── Auto-seed: on first load, save all calculated prices that aren't saved yet ──
    useEffect(() => {
        if (allGroups.length === 0) return;
        const unsaved = allGroups.filter(g => !savedPrices[g.key]);
        if (unsaved.length === 0) return;
        const now = new Date().toISOString();
        const records: SavedPriceRecord[] = unsaved.map(g => ({
            configKey: g.key,
            configName: g.normalizedName,
            fixedPrice: g.suggestedFixedPrice,
            savedAt: now,
        }));
        savePrices(records).then(() =>
            loadAllPrices().then(setSavedPrices)
        );
    }, [allGroups]); // intentionally omit savedPrices to run only when groups first load

    // ── fixed prices map for compatibility with ConfigCard ─────────────────
    const fixedPricesMap = useMemo(
        () => Object.fromEntries(
            Object.entries(savedPrices).map(([k, v]) => [k, v.fixedPrice])
        ),
        [savedPrices]
    );

    // ── Compliance stats ──────────────────────────────────────────────────
    const complianceStats = useMemo(() => {
        const withFP = allGroups.filter(g => fixedPricesMap[g.key] != null);
        const totalUnder = withFP.reduce((s, g) => s + g.listingCount, 0);
        const compliant = withFP.reduce((s, g) => {
            const fp = fixedPricesMap[g.key];
            return s + g.listings.filter(l => Math.abs(l.price - fp) / fp < 0.005).length;
        }, 0);
        return {
            configsWithFP: withFP.length,
            totalUnder,
            compliant,
            pct: totalUnder > 0 ? Math.round((compliant / totalUnder) * 100) : 0,
        };
    }, [allGroups, fixedPricesMap]);

    // ── Filtered & sorted groups ──────────────────────────────────────────
    const filtered = useMemo(() => {
        let result = allGroups;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            result = result.filter(g =>
                g.normalizedName.toLowerCase().includes(q) ||
                g.listings.some(l => l.title.toLowerCase().includes(q))
            );
        }
        if (onlyWithVariations) result = result.filter(g => g.listingCount > 1 && g.priceRange > 0);
        if (onlyViolations) {
            result = result.filter(g => {
                const fp = fixedPricesMap[g.key];
                return fp != null && g.listings.some(l => Math.abs(l.price - fp) / fp >= 0.005);
            });
        }
        return [...result].sort((a, b) => {
            switch (sortKey) {
                case 'listings': return b.listingCount - a.listingCount;
                case 'price-asc': return a.minPrice - b.minPrice;
                case 'price-desc': return b.maxPrice - a.maxPrice;
                case 'spread': return b.priceSpread - a.priceSpread;
                case 'range': return b.priceRange - a.priceRange;
                case 'violations': {
                    const viol = (g: typeof a) => {
                        const fp = fixedPricesMap[g.key];
                        return fp != null ? g.listings.filter(l => Math.abs(l.price - fp) / fp >= 0.005).length : 0;
                    };
                    return viol(b) - viol(a);
                }
                default: return 0;
            }
        });
    }, [allGroups, search, sortKey, onlyWithVariations, onlyViolations, fixedPricesMap]);

    const totalListings = products.length;
    const totalConfigs = allGroups.length;
    const groupsWithVariations = allGroups.filter(g => g.priceRange > 0).length;

    return (
        <>
            {/* ── Header ── */}
            <header className="header">
                <div className="header-inner">
                    <div className="header-logo">
                        <div className="logo-icon">📊</div>
                        <div>
                            <div className="logo-text">Price Monitor</div>
                            <div className="logo-sub">Product Configuration Dashboard</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {lastFetched && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                Updated {lastFetched.toLocaleTimeString()}
                            </span>
                        )}
                        <button onClick={fetchProducts} disabled={loading} style={{
                            padding: '8px 16px',
                            background: loading ? 'var(--bg-surface)' : 'rgba(139,92,246,0.15)',
                            border: '1px solid rgba(139,92,246,0.35)', borderRadius: 8,
                            color: loading ? 'var(--text-muted)' : 'var(--accent-1)',
                            fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--font)', transition: 'all 0.2s',
                        }}>
                            {loading ? '⟳ Loading…' : '⟳ Refresh'}
                        </button>
                    </div>
                </div>
            </header>

            {loading && (
                <div className="loading-screen">
                    <div className="spinner" />
                    <div className="loading-text">Fetching products from Supabase…</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Grouping by configuration using title analysis</div>
                </div>
            )}

            {error && !loading && (
                <div className="loading-screen">
                    <div style={{ fontSize: 40 }}>⚠️</div>
                    <div style={{ color: 'var(--red)', fontSize: 15 }}>{error}</div>
                    <button onClick={fetchProducts} style={{
                        padding: '10px 20px', background: 'rgba(139,92,246,0.15)',
                        border: '1px solid var(--accent-1)', borderRadius: 8,
                        color: 'var(--accent-1)', cursor: 'pointer', fontFamily: 'var(--font)',
                    }}>Try Again</button>
                </div>
            )}

            {!loading && !error && (
                <>
                    {/* ── Price Schedule — auto-calculated + persisted fixed prices ── */}
                    <PriceSchedule
                        groups={allGroups}
                        savedPrices={savedPrices}
                    />

                    {/* Stats Bar */}
                    <div className="stats-bar">
                        <div className="stat-chip">
                            <span className="stat-val">{totalListings.toLocaleString()}</span>
                            <span className="stat-label">Total Listings</span>
                        </div>
                        <div className="stat-chip">
                            <span className="stat-val">{totalConfigs.toLocaleString()}</span>
                            <span className="stat-label">Unique Configs</span>
                        </div>
                        <div className="stat-chip">
                            <span className="stat-val">{groupsWithVariations}</span>
                            <span className="stat-label">With Price Variations</span>
                        </div>
                        <div className="stat-chip">
                            <span className="stat-val" style={{ color: 'var(--green)' }}>
                                {complianceStats.configsWithFP}
                            </span>
                            <span className="stat-label">Prices Saved</span>
                        </div>
                        <div className="stat-chip">
                            <span className="stat-val" style={{
                                color: complianceStats.pct === 100 ? 'var(--green)' :
                                    complianceStats.pct > 50 ? 'var(--yellow)' : 'var(--red)',
                            }}>
                                {complianceStats.configsWithFP > 0 ? `${complianceStats.pct}%` : '—'}
                            </span>
                            <span className="stat-label">Compliance</span>
                        </div>
                        <div className="stat-chip">
                            <span className="stat-val">{filtered.length}</span>
                            <span className="stat-label">Showing</span>
                        </div>
                    </div>

                    {/* Compliance Banner */}
                    {complianceStats.configsWithFP > 0 && (
                        <div className="compliance-banner">
                            <span className="compliance-banner-title">📌 Fixed Price Compliance</span>
                            <div className="compliance-meter">
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                                    <span>{complianceStats.compliant} of {complianceStats.totalUnder} listings on-target</span>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{complianceStats.pct}%</span>
                                </div>
                                <div className="compliance-meter-bar">
                                    <div className="compliance-meter-fill" style={{ width: `${complianceStats.pct}%` }} />
                                </div>
                            </div>
                            <span className="compliance-stat">
                                <span>{complianceStats.totalUnder - complianceStats.compliant}</span> listings need correction
                            </span>
                        </div>
                    )}

                    {/* Violations Report */}
                    <ViolationsPanel
                        groups={allGroups}
                        fixedPricesMap={fixedPricesMap}
                    />

                    {/* Controls */}
                    <div className="controls">
                        <div className="search-wrap">
                            <span className="search-icon">🔍</span>
                            <input className="search-input" type="text"
                                placeholder="Search product configurations…"
                                value={search} onChange={e => setSearch(e.target.value)}
                                id="search-input" />
                        </div>
                        <select className="control-select" value={sortKey}
                            onChange={e => setSortKey(e.target.value as SortKey)} id="sort-select">
                            <option value="listings">Sort: Most Listings</option>
                            <option value="violations">Sort: Most Violations</option>
                            <option value="price-asc">Sort: Lowest Price</option>
                            <option value="price-desc">Sort: Highest Price</option>
                            <option value="spread">Sort: Biggest % Spread</option>
                            <option value="range">Sort: Biggest $ Range</option>
                        </select>
                        <button className={`filter-toggle ${onlyWithVariations ? 'active' : ''}`}
                            onClick={() => { setOnlyWithVariations(v => !v); setOnlyViolations(false); }}
                            id="variations-filter">
                            {onlyWithVariations ? '✓' : ''} Price Variations Only
                        </button>
                        <button className={`filter-toggle ${onlyViolations ? 'active' : ''}`}
                            onClick={() => { setOnlyViolations(v => !v); setOnlyWithVariations(false); }}
                            id="violations-filter"
                            style={{
                                borderColor: onlyViolations ? 'var(--red)' : undefined,
                                color: onlyViolations ? 'var(--red)' : undefined,
                                background: onlyViolations ? 'rgba(239,68,68,0.08)' : undefined,
                            }}>
                            {onlyViolations ? '✓' : ''} Violations Only
                        </button>
                        {(search || onlyWithVariations || onlyViolations) && (
                            <span className="results-count">{filtered.length} results</span>
                        )}
                    </div>

                    {/* Grid */}
                    <div className="grid">
                        {filtered.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">🔍</div>
                                <div className="empty-text">No configurations match your filters.</div>
                            </div>
                        ) : (
                            filtered.map(group => (
                                <ConfigCard
                                    key={group.key}
                                    group={group}
                                    allPrices={allPricesFlat}
                                    fixedPrice={fixedPricesMap[group.key] ?? null}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </>
    );
}
