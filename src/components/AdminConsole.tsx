'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ProductGroup } from '@/lib/grouping';

interface FixItem {
    slug: string;
    title: string;
    currentPrice: number;
    fixedPrice: number;
}

type Step = 'idle' | 'previewing' | 'preview' | 'executing' | 'done' | 'error';

interface AdminConsoleProps {
    groups: ProductGroup[];
    fixedPricesMap: Record<string, number>;
    onAfterFix?: () => void;
}

function fmtPrice(n: number): string {
    return '$' + (n % 1 === 0
        ? n.toLocaleString('en-US')
        : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}

const ADMIN_SECRET = 'Mehbde!!2';

export default function AdminConsole({ groups, fixedPricesMap, onAfterFix }: AdminConsoleProps) {
    const [mounted, setMounted]         = useState(false);
    const [showPwModal, setShowPwModal] = useState(false);
    const [password, setPassword]       = useState('');
    const [shake, setShake]             = useState(false);
    const [unlocked, setUnlocked]       = useState(false);
    const [drawerOpen, setDrawerOpen]   = useState(false);
    const [step, setStep]               = useState<Step>('idle');
    const [fixes, setFixes]             = useState<FixItem[]>([]);
    const [doneCount, setDoneCount]     = useState(0);
    const [errMsg, setErrMsg]           = useState('');
    const pwInputRef = useRef<HTMLInputElement>(null);

    // Must be mounted client-side to use portals
    useEffect(() => { setMounted(true); }, []);

    const buildFixes = useCallback((): FixItem[] => {
        const result: FixItem[] = [];
        for (const group of groups) {
            const fp = fixedPricesMap[group.key];
            if (fp == null) continue;
            for (const listing of group.listings) {
                const pct = Math.abs((listing.price - fp) / fp) * 100;
                if (pct < 0.5) continue;
                result.push({ slug: listing.slug, title: listing.title, currentPrice: listing.price, fixedPrice: fp });
            }
        }
        return result.sort((a, b) => Math.abs(b.currentPrice - b.fixedPrice) - Math.abs(a.currentPrice - a.fixedPrice));
    }, [groups, fixedPricesMap]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (showPwModal) { setShowPwModal(false); setPassword(''); }
            else if (drawerOpen) handleClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showPwModal, drawerOpen]);

    useEffect(() => {
        if (showPwModal) setTimeout(() => pwInputRef.current?.focus(), 80);
    }, [showPwModal]);

    const handleGearClick = () => {
        if (unlocked) { setDrawerOpen(true); }
        else { setShowPwModal(true); setPassword(''); }
    };

    const handlePasswordSubmit = () => {
        if (password === ADMIN_SECRET) {
            setUnlocked(true); setShowPwModal(false);
            setPassword(''); setDrawerOpen(true); setStep('idle');
        } else {
            setShake(true);
            setTimeout(() => setShake(false), 500);
            setPassword('');
        }
    };

    const handlePreview = async () => {
        setStep('previewing'); setErrMsg('');
        try {
            const planned = buildFixes();
            const res = await fetch('/api/admin/fix-violations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET },
                body: JSON.stringify({ dryRun: true, fixes: planned.map(f => ({ slug: f.slug, fixedPrice: f.fixedPrice })) }),
            });
            if (!res.ok) throw new Error(`Server error ${res.status}`);
            setFixes(planned); setStep('preview');
        } catch (err) { setErrMsg(String(err)); setStep('error'); }
    };

    const handleExecute = async () => {
        setStep('executing'); setErrMsg('');
        try {
            const res = await fetch('/api/admin/fix-violations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET },
                body: JSON.stringify({ dryRun: false, fixes: fixes.map(f => ({ slug: f.slug, fixedPrice: f.fixedPrice })) }),
            });
            if (!res.ok) throw new Error(`Server error ${res.status}`);
            const data = await res.json();
            setDoneCount(data.updated ?? 0);
            setStep('done');
            // Trigger parent refresh so violations panel updates immediately
            onAfterFix?.();
        } catch (err) { setErrMsg(String(err)); setStep('error'); }
    };

    const handleClose = () => {
        setDrawerOpen(false); setStep('idle');
        setFixes([]); setDoneCount(0); setErrMsg('');
    };

    // ── Gear Button (renders inside header normally) ──────────────────────────
    const gearBtn = (
        <button
            id="admin-gear-btn"
            onClick={handleGearClick}
            title="Admin Console"
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
                background: unlocked ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
                border: unlocked ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: unlocked ? 'var(--accent-1)' : 'var(--text-muted)',
                fontSize: 16, transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'rotate(60deg)'; e.currentTarget.style.color = 'var(--accent-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'rotate(0deg)'; e.currentTarget.style.color = unlocked ? 'var(--accent-1)' : 'var(--text-muted)'; }}
        >
            ⚙
        </button>
    );

    // ── Portals (rendered directly into document.body to escape stacking context)
    const passwordModal = showPwModal && mounted && createPortal(
        <div
            onClick={() => { setShowPwModal(false); setPassword(''); }}
            style={{
                position: 'fixed', inset: 0, zIndex: 999999,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#0d1424',
                    border: '1px solid rgba(99,102,241,0.35)',
                    borderRadius: 18, padding: '36px 32px', width: 360,
                    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    animation: shake ? 'adminShake 0.4s ease' : 'adminFadeIn 0.2s ease',
                }}
            >
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: 14, margin: '0 auto 14px',
                        background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                    }}>🔐</div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Admin Access</div>
                    <div style={{ fontSize: 13, color: '#4e6070' }}>Enter your password to unlock the admin console</div>
                </div>

                <input
                    ref={pwInputRef}
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                    placeholder="Password"
                    style={{
                        width: '100%', padding: '11px 14px', marginBottom: 12,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 10, color: '#e2e8f0',
                        fontSize: 14, fontFamily: 'inherit', outline: 'none',
                        boxSizing: 'border-box',
                    }}
                />
                <button
                    onClick={handlePasswordSubmit}
                    style={{
                        width: '100%', padding: '11px 0',
                        background: 'rgba(99,102,241,0.2)',
                        border: '1px solid rgba(99,102,241,0.45)',
                        borderRadius: 10, color: '#818cf8',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        fontFamily: 'inherit', letterSpacing: 0.2,
                    }}
                >
                    Unlock Console
                </button>
            </div>
        </div>,
        document.body
    );

    const adminDrawer = drawerOpen && mounted && createPortal(
        <>
            {/* Backdrop */}
            <div
                onClick={handleClose}
                style={{
                    position: 'fixed', inset: 0, zIndex: 99998,
                    background: 'rgba(0,0,0,0.6)',
                }}
            />
            {/* Drawer Panel */}
            <div
                style={{
                    position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 99999,
                    width: 'min(680px, 100vw)',
                    background: '#0d1424',
                    borderLeft: '1px solid rgba(99,102,241,0.2)',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '-16px 0 60px rgba(0,0,0,0.6)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    animation: 'adminSlideIn 0.22s ease',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '22px 28px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    flexShrink: 0,
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 8,
                                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
                            }}>⚙</div>
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>Admin Console</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#4e6070', marginTop: 4, paddingLeft: 42 }}>
                            Direct price correction in the products database
                        </div>
                    </div>
                    <button onClick={handleClose} style={{
                        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, width: 32, height: 32, cursor: 'pointer',
                        color: '#94a3b8', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

                    {/* IDLE */}
                    {step === 'idle' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                            <div style={{
                                background: 'rgba(99,102,241,0.07)',
                                border: '1px solid rgba(99,102,241,0.18)',
                                borderRadius: 12, padding: '16px 18px',
                            }}>
                                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.65 }}>
                                    This will set every violating listing's price to its saved{' '}
                                    <strong style={{ color: '#818cf8' }}>fixed price</strong>{' '}
                                    directly in the products database.{' '}
                                    <strong style={{ color: '#e2e8f0' }}>Always preview first.</strong>
                                </div>
                            </div>
                            <button
                                onClick={handlePreview}
                                style={{
                                    alignSelf: 'flex-start', padding: '12px 28px',
                                    background: 'rgba(99,102,241,0.15)',
                                    border: '1px solid rgba(99,102,241,0.4)',
                                    borderRadius: 10, color: '#818cf8',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    fontFamily: 'inherit', letterSpacing: 0.2,
                                }}
                            >
                                🔍 Preview Fix
                            </button>
                        </div>
                    )}

                    {/* PREVIEWING */}
                    {step === 'previewing' && (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#4e6070', fontSize: 14 }}>
                            <div style={{ fontSize: 30, marginBottom: 14, animation: 'adminSpin 1s linear infinite', display: 'inline-block' }}>⟳</div>
                            <div>Scanning violations…</div>
                        </div>
                    )}

                    {/* PREVIEW */}
                    {step === 'preview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {fixes.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                                    <div style={{ fontSize: 15, fontWeight: 600, color: '#34d399' }}>All prices are on target!</div>
                                    <div style={{ fontSize: 13, color: '#4e6070', marginTop: 4 }}>No violations found.</div>
                                </div>
                            ) : (
                                <>
                                    {/* Action bar */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center',
                                        justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
                                        background: 'rgba(239,68,68,0.07)',
                                        border: '1px solid rgba(239,68,68,0.2)',
                                        borderRadius: 12, padding: '14px 18px',
                                    }}>
                                        <div>
                                            <span style={{ fontSize: 22, fontWeight: 800, color: '#f87171' }}>{fixes.length}</span>
                                            <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 8 }}>listings will be corrected</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <button onClick={() => setStep('idle')} style={{
                                                padding: '9px 18px',
                                                background: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                borderRadius: 8, color: '#94a3b8',
                                                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                                            }}>Cancel</button>
                                            <button onClick={handleExecute} style={{
                                                padding: '9px 20px',
                                                background: 'rgba(239,68,68,0.18)',
                                                border: '1px solid rgba(239,68,68,0.4)',
                                                borderRadius: 8, color: '#f87171',
                                                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                                fontFamily: 'inherit',
                                            }}>⚡ Execute Fix</button>
                                        </div>
                                    </div>

                                    {/* Table */}
                                    <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                                        {['Slug', 'Current Price', '→ Fixed Price', 'Diff'].map((h, i) => (
                                                            <th key={h} style={{
                                                                padding: '10px 14px', color: '#4e6070', fontWeight: 500,
                                                                textAlign: i === 0 ? 'left' : 'right',
                                                                whiteSpace: 'nowrap',
                                                            }}>{h}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {fixes.map((f, i) => {
                                                        const diff = f.currentPrice - f.fixedPrice;
                                                        const isOver = diff > 0;
                                                        return (
                                                            <tr key={f.slug} style={{
                                                                borderTop: '1px solid rgba(255,255,255,0.05)',
                                                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                                                            }}>
                                                                <td style={{ padding: '9px 14px' }}>
                                                                    <code style={{
                                                                        fontSize: 11, color: '#94a3b8',
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                        padding: '2px 7px', borderRadius: 4,
                                                                    }}>{f.slug}</code>
                                                                </td>
                                                                <td style={{ padding: '9px 14px', textAlign: 'right', color: isOver ? '#f87171' : '#34d399', fontWeight: 600 }}>
                                                                    {fmtPrice(f.currentPrice)}
                                                                </td>
                                                                <td style={{ padding: '9px 14px', textAlign: 'right', color: '#818cf8', fontWeight: 700 }}>
                                                                    {fmtPrice(f.fixedPrice)}
                                                                </td>
                                                                <td style={{ padding: '9px 14px', textAlign: 'right', color: isOver ? '#f87171' : '#34d399', fontSize: 11 }}>
                                                                    {isOver ? '▲' : '▼'} {fmtPrice(Math.abs(diff))}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* EXECUTING */}
                    {step === 'executing' && (
                        <div style={{ textAlign: 'center', padding: '60px 0' }}>
                            <div style={{ fontSize: 36, marginBottom: 16 }}>⚡</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>Applying fixes…</div>
                            <div style={{ fontSize: 13, color: '#4e6070', marginBottom: 24 }}>Patching {fixes.length} listings in the database</div>
                            <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', maxWidth: 300, margin: '0 auto' }}>
                                <div style={{
                                    height: '100%', background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                                    animation: 'adminProgress 1.4s ease-in-out infinite',
                                }} />
                            </div>
                        </div>
                    )}

                    {/* DONE */}
                    {step === 'done' && (
                        <div style={{ textAlign: 'center', padding: '60px 0' }}>
                            <div style={{ fontSize: 50, marginBottom: 16 }}>✅</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#34d399', marginBottom: 6 }}>
                                {doneCount} price{doneCount !== 1 ? 's' : ''} updated
                            </div>
                            <div style={{ fontSize: 13, color: '#4e6070', marginBottom: 28 }}>
                                Refresh the dashboard to see the updated violation count.
                            </div>
                            <button onClick={handleClose} style={{
                                padding: '11px 32px',
                                background: 'rgba(52,211,153,0.12)',
                                border: '1px solid rgba(52,211,153,0.35)',
                                borderRadius: 10, color: '#34d399',
                                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}>Close</button>
                        </div>
                    )}

                    {/* ERROR */}
                    {step === 'error' && (
                        <div style={{ textAlign: 'center', padding: '48px 0' }}>
                            <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 8 }}>Operation failed</div>
                            <code style={{ fontSize: 11, color: '#4e6070', display: 'block', marginBottom: 22 }}>{errMsg}</code>
                            <button onClick={() => setStep('idle')} style={{
                                padding: '9px 22px',
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: 8, color: '#94a3b8',
                                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                            }}>Try Again</button>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes adminShake {
                    0%,100%{transform:translateX(0)}
                    20%{transform:translateX(-9px)}
                    40%{transform:translateX(9px)}
                    60%{transform:translateX(-5px)}
                    80%{transform:translateX(5px)}
                }
                @keyframes adminFadeIn {
                    from{opacity:0;transform:scale(0.96)}
                    to{opacity:1;transform:scale(1)}
                }
                @keyframes adminSlideIn {
                    from{transform:translateX(100%)}
                    to{transform:translateX(0)}
                }
                @keyframes adminProgress {
                    0%{transform:translateX(-100%)}
                    50%{transform:translateX(0%)}
                    100%{transform:translateX(100%)}
                }
                @keyframes adminSpin {
                    to{transform:rotate(360deg)}
                }
            `}</style>
        </>,
        document.body
    );

    return (
        <>
            {gearBtn}
            {passwordModal}
            {adminDrawer}
        </>
    );
}
