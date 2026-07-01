'use client';

import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import type { WaterSample } from './WaterMap';

const { BaseLayer } = LayersControl;

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeColor(grade?: string): string {
    if (!grade) return '#6b7280';
    const g = grade.toUpperCase();
    if (g.startsWith('A')) return '#22c55e';
    if (g === 'B' || g === 'C') return '#eab308';
    return '#ef4444';
}

function aiAnalysis(sample: WaterSample): string {
    const { grade, ph, tds, temp, turbidity, gas } = sample;
    const g = (grade ?? '').toUpperCase();
    if (g.startsWith('A')) return 'Water quality is excellent and safe for direct consumption with minimal treatment.';
    if (g === 'B') return 'Water quality is good. Suitable for drinking after standard filtration.';
    if (g === 'C') {
        const issues: string[] = [];
        if (ph !== undefined && (ph < 6.5 || ph > 8.5)) issues.push('pH imbalance');
        if (tds !== undefined && tds > 500) issues.push('elevated TDS');
        if (temp !== undefined && temp > 30) issues.push('high temperature');
        if (turbidity !== undefined && turbidity > 5) issues.push('high turbidity');
        if (gas !== undefined && gas > 400) issues.push('elevated gas levels');
        const detail = issues.length > 0 ? ` Detected: ${issues.join(', ')}.` : '';
        return `Water quality is fair.${detail} Recommend advanced filtration before use.`;
    }
    if (g === 'D') return 'Water quality is poor. Not suitable for drinking. Industrial or agricultural use only after treatment.';
    return 'Water quality is critical. Immediate remediation required. Do not use for any domestic purpose.';
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────

function FitBounds({ samples }: { samples: WaterSample[] }) {
    const map = useMap();
    useEffect(() => {
        if (samples.length === 0) return;
        if (samples.length === 1) { map.setView([samples[0].lat, samples[0].lng], 6); return; }
        const lats = samples.map((s) => s.lat);
        const lngs = samples.map((s) => s.lng);
        map.fitBounds(
            [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
            { padding: [40, 40] }
        );
    }, [samples, map]);
    return null;
}

// ── Heatmap layer (imperative Leaflet) ────────────────────────────────────────

interface HeatmapLayerProps {
    samples: WaterSample[];
    visible: boolean;
}

function HeatmapLayer({ samples, visible }: HeatmapLayerProps) {
    const map = useMap();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heatRef = useRef<any>(null);

    useEffect(() => {
        // Build points: [lat, lng, intensity]
        // WQI 0-100 → invert so HIGH wqi = LOW heat intensity (green areas)
        // and LOW wqi = HIGH intensity (red areas)
        const points = samples
            .filter((s) => s.wqi !== undefined)
            .map((s) => {
                // Invert WQI: poor water (low WQI) → high heat weight
                const intensity = (100 - (s.wqi ?? 50)) / 100;
                return [s.lat, s.lng, intensity] as [number, number, number];
            });

        if (!heatRef.current) {
            // Create layer with green→yellow→red gradient matching WQI semantics
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            heatRef.current = (L as any).heatLayer(points, {
                radius: 35,
                blur: 25,
                maxZoom: 10,
                max: 1.0,
                gradient: {
                    0.0: '#22c55e',   // green  — excellent (low intensity = high WQI)
                    0.4: '#eab308',   // yellow — moderate
                    0.7: '#f97316',   // orange — poor
                    1.0: '#ef4444',   // red    — critical
                },
            });
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (heatRef.current as any).setLatLngs(points);
        }

        if (visible) {
            heatRef.current.addTo(map);
        } else {
            heatRef.current.remove();
        }

        return () => {
            heatRef.current?.remove();
        };
    }, [samples, visible, map]);

    return null;
}

// ── Toggle button (rendered outside MapContainer via portal) ──────────────────

interface ToggleButtonProps {
    active: boolean;
    onToggle: () => void;
}

function HeatmapToggle({ active, onToggle }: ToggleButtonProps) {
    const map = useMap();
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const Control = L.Control.extend({
            onAdd() {
                const div = L.DomUtil.create('div');
                containerRef.current = div;
                L.DomEvent.disableClickPropagation(div);
                return div;
            },
        });
        const ctrl = new Control({ position: 'topleft' });
        ctrl.addTo(map);
        return () => { ctrl.remove(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);

    useEffect(() => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = '';
        const btn = document.createElement('button');
        btn.title = active ? 'Hide heatmap' : 'Show heatmap';
        btn.style.cssText = `
            background: ${active ? '#0f172a' : '#1e293b'};
            border: 1.5px solid ${active ? '#38bdf8' : '#334155'};
            color: ${active ? '#38bdf8' : '#94a3b8'};
            border-radius: 8px;
            padding: 6px 12px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            transition: all 0.2s;
            margin: 10px;
            white-space: nowrap;
            font-family: system-ui, sans-serif;
        `;
        btn.innerHTML = `<span style="font-size:14px">🌡️</span> ${active ? 'Hide Heatmap' : 'Show Heatmap'}`;
        btn.onclick = onToggle;
        containerRef.current.appendChild(btn);
    }, [active, onToggle]);

    return null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
    samples: WaterSample[];
}

export default function MapInner({ samples }: Props) {
    const [heatmapVisible, setHeatmapVisible] = useState(false);

    return (
        <MapContainer
            center={[20, 0]}
            zoom={2}
            style={{ height: '100%', width: '100%', background: '#0f172a' }}
            zoomControl={true}
            scrollWheelZoom={true}
        >
            {/* Layer switcher */}
            <LayersControl position="topright">
                <BaseLayer name="Normal">
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                </BaseLayer>
                <BaseLayer name="Satellite">
                    <TileLayer
                        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
                        url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
                    />
                </BaseLayer>
                <BaseLayer checked name="Hybrid">
                    <TileLayer
                        attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                    />
                </BaseLayer>
                <BaseLayer name="Dark">
                    <TileLayer
                        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />
                </BaseLayer>
            </LayersControl>

            <FitBounds samples={samples} />

            {/* Heatmap toggle button */}
            <HeatmapToggle
                active={heatmapVisible}
                onToggle={() => setHeatmapVisible((v) => !v)}
            />

            {/* Heatmap layer */}
            <HeatmapLayer samples={samples} visible={heatmapVisible} />

            {/* Markers */}
            {samples.map((sample) => {
                const color = gradeColor(sample.grade);
                const analysis = aiAnalysis(sample);

                return (
                    <CircleMarker
                        key={sample.key}
                        center={[sample.lat, sample.lng]}
                        radius={10}
                        pathOptions={{
                            color: color,
                            fillColor: color,
                            fillOpacity: 0.85,
                            weight: 2,
                        }}
                    >
                        <Popup className="water-popup" maxWidth={280}>
                            <div style={{
                                background: '#0f172a',
                                border: `1px solid ${color}50`,
                                borderRadius: '14px',
                                padding: '16px',
                                color: '#f1f5f9',
                                fontFamily: 'system-ui, sans-serif',
                                minWidth: '240px',
                                boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${color}20`,
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '20px', lineHeight: 1 }}>📍</span>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '15px', color: '#f8fafc', lineHeight: 1.2 }}>
                                                {sample.city || 'Unknown'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                                                {sample.country || '—'}
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{
                                        background: `${color}22`, border: `1.5px solid ${color}`,
                                        color: color, borderRadius: '999px', padding: '3px 12px',
                                        fontSize: '13px', fontWeight: 800, flexShrink: 0,
                                    }}>
                                        {sample.grade ?? '--'}
                                    </span>
                                </div>

                                {/* WQI bar */}
                                <div style={{ background: '#1e293b', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>WQI Score</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '80px', height: '6px', background: '#334155', borderRadius: '999px', overflow: 'hidden' }}>
                                            <div style={{ width: `${sample.wqi ?? 0}%`, height: '100%', background: color, borderRadius: '999px' }} />
                                        </div>
                                        <span style={{ fontWeight: 700, fontSize: '14px', color: color, minWidth: '36px', textAlign: 'right' }}>
                                            {sample.wqi ?? '--'}
                                        </span>
                                    </div>
                                </div>

                                {/* Sensor grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                                    {[
                                        { label: 'pH', value: sample.ph, unit: '', icon: '💧' },
                                        { label: 'TDS', value: sample.tds, unit: ' ppm', icon: '🧪' },
                                        { label: 'Temperature', value: sample.temp, unit: '°C', icon: '🌡️' },
                                        { label: 'Gas', value: sample.gas, unit: '', icon: '💨' },
                                        { label: 'Turbidity', value: sample.turbidity, unit: ' NTU', icon: '🌊' },
                                    ].map(({ label, value, unit, icon }) => (
                                        <div key={label} style={{ background: '#1e293b', borderRadius: '8px', padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{icon} {label}</span>
                                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#e2e8f0' }}>
                                                {value !== undefined && value !== null ? `${value}${unit}` : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Divider */}
                                <div style={{ height: '1px', background: '#1e293b', marginBottom: '10px' }} />

                                {/* AI Analysis */}
                                <div style={{ background: '#0c1a2e', border: '1px solid #1e3a5f', borderRadius: '10px', padding: '10px 12px' }}>
                                    <div style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                        🤖 AI Analysis
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.6' }}>
                                        {analysis}
                                    </div>
                                </div>
                            </div>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
