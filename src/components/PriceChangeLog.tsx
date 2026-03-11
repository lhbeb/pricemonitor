'use client';

import { useState, useEffect } from 'react';

type LogEntry = {
    id: number;
    config_key: string;
    config_name: string;
    old_price: number | null;
    new_price: number;
    changed_at: string;
};

type SummaryRow = {
    config_name: string;
    change_count: number;
    first_seen: string;
    last_changed: string;
    last_old: number | null;
    last_new: number;
};

const SECRET = 'pricemonitor-admin-2026-x9k2';

function fmt(p: number | null) {
    if (p == null) return '—';
    return `$${Math.round(p)}`;
}

function relTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function PriceChangeLog() {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'summary' | 'full'>('summary');
    const [open, setOpen] = useState(true);

    useEffect(() => {
        fetch('/api/price-log', { headers: { 'x-sync-secret': SECRET } })
            .then(r => r.json())
            .then(data => { setEntries(Array.isArray(data) ? data : []); })
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, []);

    // Build per-config summary
    const summary: SummaryRow[] = Object.values(
        entries.reduce<Record<string, SummaryRow>>((acc, e) => {
            if (!acc[e.config_key]) {
                acc[e.config_key] = {
                    config_name: e.config_name,
                    change_count: 0,
                    first_seen: e.changed_at,
                    last_changed: e.changed_at,
                    last_old: e.old_price,
                    last_new: e.new_price,
                };
            }
            acc[e.config_key].change_count++;
            if (e.changed_at > acc[e.config_key].last_changed) {
                acc[e.config_key].last_changed = e.changed_at;
                acc[e.config_key].last_old = e.old_price;
                acc[e.config_key].last_new = e.new_price;
            }
            if (e.changed_at < acc[e.config_key].first_seen) {
                acc[e.config_key].first_seen = e.changed_at;
            }
            return acc;
        }, {})
    ).sort((a, b) => b.change_count - a.change_count);

    return (
        <section className="price-log-section">
            <div className="price-log-header" onClick={() => setOpen(o => !o)}>
                <div className="price-log-title">
                    <span className="price-log-icon">📋</span>
                    <span>Price Change Log</span>
                    <span className="price-log-badge">{entries.length} events</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {open && (
                        <div className="price-log-tabs" onClick={e => e.stopPropagation()}>
                            <button
                                className={`price-log-tab ${view === 'summary' ? 'active' : ''}`}
                                onClick={() => setView('summary')}
                            >Summary</button>
                            <button
                                className={`price-log-tab ${view === 'full' ? 'active' : ''}`}
                                onClick={() => setView('full')}
                            >Full history</button>
                        </div>
                    )}
                    <span className="price-log-chevron">{open ? '▲' : '▼'}</span>
                </div>
            </div>

            {open && (
                <div className="price-log-body">
                    {loading ? (
                        <div className="price-log-empty">Loading…</div>
                    ) : entries.length === 0 ? (
                        <div className="price-log-empty">
                            No price changes logged yet. Run <code>sync-prices</code> to populate.
                        </div>
                    ) : view === 'summary' ? (
                        <table className="price-log-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40%' }}>Config</th>
                                    <th style={{ width: '10%' }}>Changes</th>
                                    <th style={{ width: '15%' }}>Last: was → now</th>
                                    <th style={{ width: '20%' }}>Last changed</th>
                                    <th style={{ width: '15%' }}>First seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.map(row => (
                                    <tr key={row.config_name}>
                                        <td className="price-log-name" title={row.config_name}>{row.config_name}</td>
                                        <td className="price-log-count">{row.change_count}×</td>
                                        <td className="price-log-delta">
                                            <span className="price-log-old">{fmt(row.last_old)}</span>
                                            <span className="price-log-arrow">→</span>
                                            <span className="price-log-new">{fmt(row.last_new)}</span>
                                        </td>
                                        <td className="price-log-time">{relTime(row.last_changed)}</td>
                                        <td className="price-log-time">{relTime(row.first_seen)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="price-log-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '38%' }}>Config</th>
                                    <th style={{ width: '13%' }}>Old price</th>
                                    <th style={{ width: '13%' }}>New price</th>
                                    <th style={{ width: '20%' }}>Changed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map(e => (
                                    <tr key={e.id}>
                                        <td className="price-log-name" title={e.config_name}>{e.config_name}</td>
                                        <td className="price-log-old-cell">{fmt(e.old_price)}</td>
                                        <td className="price-log-new-cell">{fmt(e.new_price)}</td>
                                        <td className="price-log-time">{relTime(e.changed_at)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </section>
    );
}
