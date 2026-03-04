'use client';

import Image from 'next/image';
import { ProductGroup } from '@/lib/grouping';

interface ConfigCardProps {
    group: ProductGroup;
    allPrices: number[];
    fixedPrice: number | null;
}

function getCompliance(price: number, fixedPrice: number | null) {
    if (fixedPrice === null) return null;
    const rawDelta = price - fixedPrice;
    const delta = Math.round(rawDelta);
    const pct = Math.abs(rawDelta / fixedPrice) * 100;
    if (pct < 0.5) return { status: 'on', label: '✓ On Target', pct: 0 };
    if (rawDelta > 0) return { status: 'over', label: `▲ +$${delta} over`, pct };
    return { status: 'under', label: `▼ $${Math.abs(delta)} under`, pct };
}

function fmtPrice(n: number): string {
    return '$' + (n % 1 === 0
        ? n.toLocaleString('en-US')
        : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

export default function ConfigCard({
    group,
    allPrices,
    fixedPrice,
}: ConfigCardProps) {
    const globalMin = Math.min(...allPrices.filter(p => p > 0));
    const globalMax = Math.max(...allPrices);
    const barLeft = globalMax > globalMin
        ? ((group.minPrice - globalMin) / (globalMax - globalMin)) * 100 : 0;
    const barWidth = globalMax > globalMin
        ? Math.max(2, ((group.maxPrice - group.minPrice) / (globalMax - globalMin)) * 100) : 100;

    const isMulti = group.listingCount > 1;
    const hasSpread = group.priceRange > 0;
    const uniquePrices = Array.from(new Set(group.prices.filter(p => p > 0))).sort((a, b) => a - b);

    const violations = fixedPrice !== null
        ? group.listings.filter(l => {
            const c = getCompliance(l.price, fixedPrice);
            return c && c.status !== 'on';
        })
        : [];
    const isViolated = violations.length > 0;
    const isAllCompliant = fixedPrice !== null && violations.length === 0;

    const cardClass = [
        'card',
        fixedPrice !== null && isViolated ? 'violated' : '',
        fixedPrice !== null && isAllCompliant ? 'priced' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={cardClass}>
            {group.thumbnail ? (
                <Image src={group.thumbnail} alt={group.normalizedName}
                    width={400} height={180} className="card-thumb" unoptimized />
            ) : (
                <div className="card-thumb-placeholder">📦</div>
            )}

            <div className="card-body">
                {/* Header */}
                <div className="card-header">
                    <h3 className="card-name">{group.normalizedName}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                        <span className={`badge ${isMulti ? 'badge-listings' : 'badge-single'}`}>
                            {group.listingCount} {group.listingCount === 1 ? 'listing' : 'listings'}
                        </span>
                        {hasSpread && fixedPrice === null && (
                            <span className="badge badge-spread">↕ {group.priceSpread}% spread</span>
                        )}
                        {fixedPrice !== null && isAllCompliant && (
                            <span className="badge" style={{ background: 'rgba(52,211,153,0.12)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.25)' }}>
                                ✓ All On Target
                            </span>
                        )}
                        {fixedPrice !== null && isViolated && (
                            <span className="badge" style={{ background: 'rgba(248,113,113,0.1)', color: 'var(--red)', border: '1px solid rgba(248,113,113,0.2)' }}>
                                ⚠ {violations.length} violation{violations.length > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>
                </div>

                {/* ── Fixed Price Display (read-only) ── */}
                {fixedPrice !== null && (
                    <div className="fixed-price-hero">
                        <div className="fixed-price-hero-inner">
                            <span className="fixed-price-hero-label">Fixed Price</span>
                            <span className="fixed-price-hero-value">{fmtPrice(fixedPrice)}</span>
                        </div>
                    </div>
                )}

                {/* Price Range Bar */}
                <div className="price-range-section">
                    <div className="price-range-labels">
                        <span>{fmtPrice(group.minPrice)}</span>
                        {hasSpread && <span>{fmtPrice(group.maxPrice)}</span>}
                    </div>
                    <div className="price-range-bar">
                        <div className="price-range-fill"
                            style={{ marginLeft: `${barLeft}%`, width: `${barWidth}%` }} />
                    </div>
                    {fixedPrice !== null && globalMax > globalMin && (
                        <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
                            <div style={{
                                position: 'absolute',
                                left: `${Math.min(99, Math.max(0, ((fixedPrice - globalMin) / (globalMax - globalMin)) * 100))}%`,
                                transform: 'translateX(-50%)',
                                fontSize: 10,
                                color: 'var(--accent-2)',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                            }}>
                                ◆ {fmtPrice(fixedPrice)}
                            </div>
                        </div>
                    )}
                </div>

                {/* Price Chips */}
                <div className="price-chips">
                    {uniquePrices.slice(0, 10).map((price, i) => {
                        const isMin = price === group.minPrice && uniquePrices.length > 1;
                        const isMax = price === group.maxPrice && uniquePrices.length > 1;
                        return (
                            <span key={i}
                                className={`price-chip ${isMin ? 'price-chip-min' : isMax ? 'price-chip-max' : 'price-chip-mid'}`}>
                                {fmtPrice(price)}
                            </span>
                        );
                    })}
                    {uniquePrices.length > 10 && (
                        <span className="price-chip price-chip-mid">+{uniquePrices.length - 10} more</span>
                    )}
                </div>

                {/* Expand Button */}
                {isMulti && (
                    <ExpandPanel group={group} fixedPrice={fixedPrice} fmtPrice={fmtPrice} getCompliance={getCompliance} />
                )}
            </div>
        </div>
    );
}

// Separated expand panel to avoid useState in main component
import { useState } from 'react';

function ExpandPanel({ group, fixedPrice, fmtPrice, getCompliance }: {
    group: ProductGroup;
    fixedPrice: number | null;
    fmtPrice: (n: number) => string;
    getCompliance: (price: number, fp: number | null) => { status: string; label: string; pct: number } | null;
}) {
    const [expanded, setExpanded] = useState(false);
    return (
        <>
            <button className="expand-btn" onClick={() => setExpanded(e => !e)} aria-expanded={expanded}>
                <span>{expanded ? '▲' : '▼'}</span>
                {expanded ? 'Hide listings' : `View all ${group.listingCount} listings`}
            </button>
            {expanded && (
                <div className="expand-panel">
                    {group.listings.map((listing, i) => {
                        const compliance = getCompliance(listing.price, fixedPrice);
                        return (
                            <div key={i} className="listing-row">
                                {listing.image ? (
                                    <Image src={listing.image} alt={listing.title}
                                        width={36} height={36} className="listing-thumb" unoptimized />
                                ) : (
                                    <div className="listing-thumb-placeholder">📦</div>
                                )}
                                <div className="listing-info">
                                    <div className="listing-title" title={listing.title}>{listing.title}</div>
                                    {listing.condition && (
                                        <div className="listing-condition">{listing.condition}</div>
                                    )}
                                </div>
                                <div
                                    className="listing-stock"
                                    title={listing.in_stock ? 'In stock' : 'Out of stock'}
                                    style={{ background: listing.in_stock ? 'var(--green)' : 'var(--red)' }}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                    <div className="listing-price">{fmtPrice(listing.price)}</div>
                                    {compliance && (
                                        <span className={
                                            compliance.status === 'on' ? 'compliance-on' :
                                                compliance.status === 'over' ? 'compliance-over' : 'compliance-under'
                                        }>
                                            {compliance.label}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}
