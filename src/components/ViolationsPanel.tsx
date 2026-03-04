'use client';

import { useState, useCallback } from 'react';
import { ProductGroup } from '@/lib/grouping';

interface ViolationRow {
    slug: string;
    title: string;
    configName: string;
    actualPrice: number;
    fixedPrice: number;
    delta: number;
    deltaDir: 'over' | 'under';
    deltaPct: number;
    listedBy: string | null;
}

interface ViolationsPanelProps {
    groups: ProductGroup[];
    fixedPricesMap: Record<string, number>;
}

function fmtPrice(n: number): string {
    return '$' + (n % 1 === 0
        ? n.toLocaleString('en-US')
        : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

export default function ViolationsPanel({ groups, fixedPricesMap }: ViolationsPanelProps) {
    const [open, setOpen] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'over' | 'under'>('all');
    const [search, setSearch] = useState('');

    const violations: ViolationRow[] = [];
    for (const group of groups) {
        const fp = fixedPricesMap[group.key];
        if (fp == null) continue;
        for (const listing of group.listings) {
            const raw = listing.price - fp;
            const pct = Math.abs(raw / fp) * 100;
            if (pct < 0.5) continue; // on-target
            violations.push({
                slug: listing.slug,
                title: listing.title,
                configName: group.normalizedName,
                actualPrice: listing.price,
                fixedPrice: fp,
                delta: Math.round(Math.abs(raw)),
                deltaDir: raw > 0 ? 'over' : 'under',
                deltaPct: Math.round(pct * 10) / 10,
                listedBy: listing.listedBy ?? null,
            });
        }
    }

    // Worst offenders first
    violations.sort((a, b) => b.delta - a.delta);

    const filtered = violations.filter(v => {
        if (filter !== 'all' && v.deltaDir !== filter) return false;
        if (search) {
            const q = search.toLowerCase();
            return v.slug.toLowerCase().includes(q) || v.configName.toLowerCase().includes(q);
        }
        return true;
    });

    const handleCopy = useCallback((slug: string) => {
        navigator.clipboard.writeText(slug).then(() => {
            setCopied(slug);
            setTimeout(() => setCopied(null), 2000);
        });
    }, []);

    const handleCopyAll = useCallback(() => {
        const slugs = filtered.map(v => v.slug).join('\n');
        navigator.clipboard.writeText(slugs).then(() => {
            setCopied('__all__');
            setTimeout(() => setCopied(null), 2000);
        });
    }, [filtered]);

    if (violations.length === 0) return null;

    const overCount = violations.filter(v => v.deltaDir === 'over').length;
    const underCount = violations.filter(v => v.deltaDir === 'under').length;

    return (
        <section className="violations-section">
            {/* Header */}
            <div className="violations-header">
                <div className="violations-title-row">
                    <div>
                        <h2 className="violations-title">
                            <span className="violations-title-icon">⚠</span>
                            Price Violations
                            <span className="violations-count-badge">{violations.length}</span>
                        </h2>
                        <p className="violations-subtitle">
                            Listings whose price deviates from the saved fixed price by more than 0.5%
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        {/* Over / Under chips */}
                        <span className="viol-chip viol-chip-over">▲ {overCount} over</span>
                        <span className="viol-chip viol-chip-under">▼ {underCount} under</span>

                        {/* Copy All */}
                        {filtered.length > 0 && (
                            <button className="violations-copy-all" onClick={handleCopyAll}>
                                {copied === '__all__' ? '✓ Copied!' : `📋 Copy ${filtered.length} slugs`}
                            </button>
                        )}

                        <button className="violations-toggle" onClick={() => setOpen(o => !o)}>
                            {open ? '▲ Collapse' : '▼ Expand'}
                        </button>
                    </div>
                </div>

                {open && (
                    <div className="violations-controls">
                        {/* Search */}
                        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
                            <input
                                className="search-input"
                                style={{ paddingLeft: 36 }}
                                type="text"
                                placeholder="Filter by slug or config…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Direction filter */}
                        <div className="violations-filter-group">
                            {(['all', 'over', 'under'] as const).map(f => (
                                <button
                                    key={f}
                                    className={`violations-filter-btn ${filter === f ? 'active' : ''} ${f !== 'all' ? `violations-filter-${f}` : ''}`}
                                    onClick={() => setFilter(f)}
                                >
                                    {f === 'all' ? 'All' : f === 'over' ? '▲ Over' : '▼ Under'}
                                </button>
                            ))}
                        </div>

                        <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                            {filtered.length} of {violations.length} shown
                        </span>
                    </div>
                )}
            </div>

            {/* Table */}
            {open && (
                <div className="violations-table-wrap">
                    <table className="violations-table">
                        <thead>
                            <tr>
                                <th className="violations-th violations-th-left" style={{ width: '23%' }}>Slug</th>
                                <th className="violations-th violations-th-left" style={{ width: '35%' }}>Config</th>
                                <th className="violations-th" style={{ width: '10%' }}>Fixed</th>
                                <th className="violations-th" style={{ width: '10%' }}>Actual</th>
                                <th className="violations-th violations-th-left" style={{ width: '14%' }}>Listed By</th>
                                <th className="violations-th" style={{ width: '8%' }}>Copy</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '28px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                                        No violations match your filter.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((v) => (
                                    <tr key={v.slug} className={`violations-row violations-row-${v.deltaDir}`}>
                                        {/* Slug */}
                                        <td className="violations-td">
                                            <code className="violations-slug">{v.slug}</code>
                                        </td>

                                        {/* Config name */}
                                        <td className="violations-td">
                                            <span className="violations-config">{v.configName}</span>
                                        </td>

                                        {/* Fixed price */}
                                        <td className="violations-td violations-td-center">
                                            <span className="violations-fixed">{fmtPrice(v.fixedPrice)}</span>
                                        </td>

                                        {/* Actual price */}
                                        <td className="violations-td violations-td-center">
                                            <span className={`violations-actual violations-actual-${v.deltaDir}`}>
                                                {fmtPrice(v.actualPrice)}
                                            </span>
                                        </td>

                                        {/* Listed By */}
                                        <td className="violations-td">
                                            <span className="violations-config" title={v.listedBy ?? ''}>
                                                {v.listedBy ?? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</span>}
                                            </span>
                                        </td>

                                        {/* Copy */}
                                        <td className="violations-td violations-td-center">
                                            <button
                                                className={`violations-copy-btn ${copied === v.slug ? 'copied' : ''}`}
                                                onClick={() => handleCopy(v.slug)}
                                                title={`Copy slug: ${v.slug}`}
                                            >
                                                {copied === v.slug ? '✓' : '📋'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
