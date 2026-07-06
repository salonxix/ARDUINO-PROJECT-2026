'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, LayersControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { LakeSummary } from './LakeDatasetMap';

const { BaseLayer } = LayersControl;

// ── Colour based on Dissolved Oxygen ─────────────────────────────────────────

function doColor(latest: Record<string, unknown> | null): string {
    const do_ = latest?.do as number | undefined;
    if (do_ === undefined || do_ === null) return '#9ca3af';  // grey — no data
    if (do_ >= 5) return '#22c55e';   // green — good
    if (do_ >= 3) return '#eab308';   // yellow — moderate
    return '#ef4444';                   // red — poor
}

// ── Popup content helper ──────────────────────────────────────────────────────

function fmt(v: unknown, unit = '', dec = 1): string {
    if (v === undefined || v === null || v === '') return '—';
    const n = parseFloat(String(v));
    return isNaN(n) ? String(v) : `${n.toFixed(dec)}${unit ? ' ' + unit : ''}`;
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────

function FitBounds({ lakes }: { lakes: LakeSummary[] }) {
    const map = useMap();
    useEffect(() => {
        if (lakes.length === 0) return;
        const lats = lakes.map(l => l.coordinates.latitude);
        const lngs = lakes.map(l => l.coordinates.longitude);
        if (lakes.length === 1) { map.setView([lats[0], lngs[0]], 12); return; }
        map.fitBounds(
            [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
            { padding: [30, 30] }
        );
    }, [lakes, map]);
    return null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { lakes: LakeSummary[] }

export default function LakeMapInner({ lakes }: Props) {
    return (
        <MapContainer
            center={[12.9716, 77.5946]}
            zoom={11}
            style={{ height: '100%', width: '100%', background: '#0f172a' }}
            scrollWheelZoom={true}
        >
            <LayersControl position="topright">
                <BaseLayer checked name="Hybrid">
                    <TileLayer
                        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                    />
                </BaseLayer>
                <BaseLayer name="Satellite">
                    <TileLayer
                        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
                        url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                    />
                </BaseLayer>
                <BaseLayer name="Dark">
                    <TileLayer
                        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />
                </BaseLayer>
            </LayersControl>

            <FitBounds lakes={lakes} />

            {lakes.map((lake) => {
                const color = doColor(lake.latest);
                const latest = lake.latest ?? {};
                const period = (latest.period as string) ?? (latest.month && latest.year ? `${latest.month} ${latest.year}` : 'Unknown');

                return (
                    <CircleMarker
                        key={lake.name}
                        center={[lake.coordinates.latitude, lake.coordinates.longitude]}
                        radius={9}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 2 }}
                    >
                        <Popup maxWidth={280} className="water-popup">
                            <div style={{
                                background: '#0f172a', border: `1px solid ${color}50`,
                                borderRadius: 12, padding: 14, color: '#f1f5f9',
                                fontFamily: 'system-ui, sans-serif', minWidth: 230,
                                boxShadow: `0 8px 24px rgba(0,0,0,0.5)`,
                            }}>
                                {/* Header */}
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ fontWeight: 700, fontSize: 14, color: '#f8fafc' }}>
                                        🏞️ {lake.name}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                                        Latest: {period}
                                    </div>
                                </div>

                                {/* Divider */}
                                <div style={{ height: 1, background: '#1e293b', marginBottom: 8 }} />

                                {/* Parameters */}
                                {[
                                    { label: 'pH', val: fmt(latest.ph) },
                                    { label: 'DO', val: fmt(latest.do, 'mg/L') },
                                    { label: 'BOD', val: fmt(latest.bod, 'mg/L') },
                                    { label: 'COD', val: fmt(latest.cod, 'mg/L') },
                                    { label: 'Turbidity', val: fmt(latest.turbidity, 'NTU') },
                                    { label: 'Conductivity', val: fmt(latest.conductivity, 'µmho/cm', 0) },
                                    { label: 'TDS', val: fmt(latest.tds, 'mg/L', 0) },
                                ].map(({ label, val }) => (
                                    <div key={label} style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        fontSize: 11, padding: '2.5px 0',
                                        borderBottom: '1px solid #1e293b',
                                    }}>
                                        <span style={{ color: '#64748b' }}>{label}</span>
                                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{val}</span>
                                    </div>
                                ))}

                                {/* DO quality indicator */}
                                <div style={{
                                    marginTop: 8, padding: '5px 8px', borderRadius: 6,
                                    background: `${color}20`, border: `1px solid ${color}40`,
                                    fontSize: 10, color, fontWeight: 600, textAlign: 'center',
                                }}>
                                    {color === '#22c55e' ? '✅ Good Water Quality'
                                        : color === '#eab308' ? '⚠️ Moderate Water Quality'
                                            : color === '#ef4444' ? '🔴 Poor Water Quality'
                                                : '⬜ No DO Data Available'}
                                </div>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
