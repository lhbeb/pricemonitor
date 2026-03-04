'use client';

import { useState, useMemo } from 'react';
import { ProductGroup } from '@/lib/grouping';
import { SavedPriceRecord } from '@/lib/priceStorage';

interface PriceScheduleProps {
    groups: ProductGroup[];
    savedPrices: Record<string, SavedPriceRecord>;
}

export default function PriceSchedule({
    groups,
    savedPrices,
}: PriceScheduleProps) {
    const [open, setOpen] = useState(true);
    const [search, setSearch] = useState('');
    const [sortCol, setSortCol] = useState<'name' | 'listings' | 'min' | 'max' | 'avg' | 'fixed'>('listings');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    function handleSort(col: typeof sortCol) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir(col === 'name' ? 'asc' : 'desc'); }
    }

    const savedCount = Object.keys(savedPrices).length;
    const allSaved = savedCount === groups.length && groups.length > 0;

    const filtered = useMemo(() => {
        let rows = groups;
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            rows = rows.filter(g => g.normalizedName.toLowerCase().includes(q));
        }
        return [...rows].sort((a, b) => {
            let va: number | string, vb: number | string;
            switch (sortCol) {
                case 'name': va = a.normalizedName; vb = b.normalizedName; break;
                case 'listings': va = a.listingCount; vb = b.listingCount; break;
                case 'min': va = a.minPrice; vb = b.minPrice; break;
                case 'max': va = a.maxPrice; vb = b.maxPrice; break;
                case 'avg': va = a.avgPrice; vb = b.avgPrice; break;
                case 'fixed': va = a.suggestedFixedPrice; vb = b.suggestedFixedPrice; break;
                default: va = 0; vb = 0;
            }
            if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
            return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
        });
    }, [groups, search, sortCol, sortDir]);

    const totalFixedValue = groups.reduce((s, g) => s + g.suggestedFixedPrice * g.listingCount, 0);
    const groupsWithSpread = groups.filter(g => g.priceRange > 0).length;

    function fmt(n: number) {
        return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtInt(n: number) {
        return '$' + Math.round(n).toLocaleString('en-US');
    }

    function SortIcon({ col }: { col: typeof sortCol }) {
        if (sortCol !== col) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
        return <span style={{ color: 'var(--accent-2)', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
    }

    return (
        <section className="schedule-section">
            {/* Section Header */}
            <div className="schedule-header">
                <div className="schedule-title-row">
                    <div>
                        <h2 className="schedule-title">📌 Fixed Price Schedule</h2>
                        <p className="schedule-subtitle">
                            Suggested fixed price per configuration — <span className="schedule-formula">average price + 5%</span>, rounded to the nearest dollar
                        </p>
                    </div>

                    <div className="schedule-header-stats">
                        <div className="schedule-stat">
                            <span className="schedule-stat-val">{groups.length}</span>
                            <span className="schedule-stat-label">Configs</span>
                        </div>
                        <div className="schedule-stat">
                            <span className="schedule-stat-val">{groupsWithSpread}</span>
                            <span className="schedule-stat-label">With spread</span>
                        </div>
                        <div className="schedule-stat">
                            <span className="schedule-stat-val" style={{ color: 'var(--accent-2)' }}>
                                {fmt(totalFixedValue)}
                            </span>
                            <span className="schedule-stat-label">Total fixed value</span>
                        </div>
                        <div className="schedule-stat">
                            <span className="schedule-stat-val" style={{ color: allSaved ? 'var(--green)' : 'var(--yellow)' }}>
                                {savedCount}/{groups.length}
                            </span>
                            <span className="schedule-stat-label">Prices saved</span>
                        </div>

                        <button className="schedule-toggle" onClick={() => setOpen(o => !o)}>
                            {open ? '▲ Collapse' : '▼ Expand'}
                        </button>
                    </div>
                </div>

                {open && (
                    <div className="schedule-search-row">
                        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
                            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
                            <input className="search-input" style={{ paddingLeft: 36 }} type="text"
                                placeholder="Filter configurations…" value={search}
                                onChange={e => setSearch(e.target.value)} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
                            {filtered.length} of {groups.length} configs
                        </span>
                        {allSaved && (
                            <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                                🔒 All prices saved &amp; guarded
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Table */}
            {open && (
                <div className="schedule-table-wrap">
                    <table className="schedule-table">
                        <thead>
                            <tr>
                                <th className="schedule-th schedule-th-left" onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                                    Configuration <SortIcon col="name" />
                                </th>
                                <th className="schedule-th" onClick={() => handleSort('listings')} style={{ cursor: 'pointer' }}>
                                    Listings <SortIcon col="listings" />
                                </th>
                                <th className="schedule-th" onClick={() => handleSort('min')} style={{ cursor: 'pointer' }}>
                                    Min <SortIcon col="min" />
                                </th>
                                <th className="schedule-th" onClick={() => handleSort('avg')} style={{ cursor: 'pointer' }}>
                                    Avg <SortIcon col="avg" />
                                </th>
                                <th className="schedule-th" onClick={() => handleSort('max')} style={{ cursor: 'pointer' }}>
                                    Max <SortIcon col="max" />
                                </th>
                                <th className="schedule-th schedule-th-fixed" onClick={() => handleSort('fixed')} style={{ cursor: 'pointer' }}>
                                    Fixed Price <SortIcon col="fixed" />
                                </th>
                                <th className="schedule-th" style={{ width: 60 }}>Saved</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((group) => {
                                const saved = savedPrices[group.key];
                                const isSaved = saved != null;
                                const hasSpread = group.priceRange > 0;
                                const pctAboveMin = group.minPrice > 0
                                    ? Math.round(((group.suggestedFixedPrice - group.minPrice) / group.minPrice) * 100)
                                    : 0;

                                return (
                                    <tr key={group.key} className="schedule-row">
                                        <td className="schedule-td schedule-td-name">
                                            <div className="schedule-name">{group.normalizedName}</div>
                                        </td>
                                        <td className="schedule-td schedule-td-center">
                                            <span className="schedule-listing-count">{group.listingCount}</span>
                                        </td>
                                        <td className="schedule-td schedule-td-center schedule-price-min">{fmt(group.minPrice)}</td>
                                        <td className="schedule-td schedule-td-center schedule-price-avg">{fmt(group.avgPrice)}</td>
                                        <td className="schedule-td schedule-td-center schedule-price-max">{fmt(group.maxPrice)}</td>
                                        <td className="schedule-td schedule-td-center schedule-td-fixed">
                                            <div className="schedule-fixed-cell">
                                                <span className="schedule-fixed-price">{fmtInt(group.suggestedFixedPrice)}</span>
                                                {hasSpread && (
                                                    <span className="schedule-fixed-badge">+{pctAboveMin}% above min</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="schedule-td schedule-td-center">
                                            {isSaved ? (
                                                <span title={`Saved at ${new Date(saved.savedAt).toLocaleString()}`}
                                                    style={{ fontSize: 16, cursor: 'help' }}>🔒</span>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
