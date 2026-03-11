'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { Product } from '@/lib/supabase';
import { groupProducts } from '@/lib/grouping';
import { loadAllPrices, savePrices, SavedPriceRecord } from '@/lib/priceStorage';
import PriceSchedule from '@/components/PriceSchedule';
import ViolationsPanel from '@/components/ViolationsPanel';
import PriceChangeLog from '@/components/PriceChangeLog';

export default function DashboardPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetched, setLastFetched] = useState<Date | null>(null);
    // savedPrices: configKey → SavedPriceRecord (loaded from price DB)
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

    // ── Auto-seed: save calculated price for NEW configs only (never overwrites) ──
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
        // overwrite=false → ON CONFLICT DO NOTHING — existing prices are 100% protected
        savePrices(records, false).then(() =>
            loadAllPrices().then(setSavedPrices)
        );
    }, [allGroups, savedPrices]);

    // ── fixed prices map for compatibility with ConfigCard ─────────────────
    const fixedPricesMap = useMemo(
        () => Object.fromEntries(
            Object.entries(savedPrices).map(([k, v]) => [k, v.fixedPrice])
        ),
        [savedPrices]
    );


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
                <div className="app-container">
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
                    </div>

                    {/* Violations Report */}
                    <ViolationsPanel
                        groups={allGroups}
                        fixedPricesMap={fixedPricesMap}
                    />

                    {/* Price Change Log */}
                    <PriceChangeLog />
                </div>
            )}
        </>
    );
}
