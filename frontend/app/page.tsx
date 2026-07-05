'use client';

import { useRef } from 'react';
import HeroSection from '@/components/HeroSection';
import WaterDashboard from '@/components/WaterDashboard';
import WaterMap from '@/components/WaterMap';
import WaterCharts from '@/components/WaterCharts';
import HistoryTable from '@/components/HistoryTable';
import AIAnalysis from '@/components/AIAnalysis';
import PredictionPanel from '@/components/PredictionPanel';
import AIChat, { AIChatHandle } from '@/components/AIChat';
import WaterAnalysisPanel from '@/components/WaterAnalysisPanel';
import LanguageSelector from '@/components/LanguageSelector';

export default function Home() {
  // Ref lets WaterAnalysisPanel trigger chat messages ("Explain More")
  const chatRef = useRef<AIChatHandle>(null);

  const handleExplainRequest = (msg: string) => {
    chatRef.current?.sendExternalMessage(msg);
  };

  return (
    <>
      <HeroSection />

      <main className="px-4 pb-16 sm:px-8">

        {/* ── Live Sensor Dashboard ── */}
        <section id="dashboard" className="max-w-5xl mx-auto pt-16">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">
              📡
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Live Sensor Dashboard</h2>
              <p className="text-xs text-gray-500 mt-0.5">Real-time readings from Firebase</p>
            </div>
            <span className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Live
            </span>
            {/* Global language selector — applies to AI Chat + Analysis */}
            <div className="ml-auto">
              <LanguageSelector />
            </div>
          </div>
          <WaterDashboard />
        </section>

        {/* ── AI Analysis (manual) ── */}
        <div id="ai-analysis">
          <AIAnalysis />
        </div>

        {/* ── Auto Water Analysis + Explain More ── */}
        <WaterAnalysisPanel onExplainRequest={handleExplainRequest} />

        {/* ── World Map ── */}
        <div id="map">
          <WaterMap />
        </div>

        {/* ── Charts ── */}
        <div id="charts">
          <WaterCharts />
        </div>

        {/* ── Prediction AI ── */}
        <div id="prediction">
          <PredictionPanel />
        </div>

        {/* ── History Table ── */}
        <div id="history">
          <HistoryTable />
        </div>

        {/* ── AI Chat ── */}
        <AIChat ref={chatRef} />

        <p className="text-center text-gray-700 text-xs mt-16">
          AquaVitals © {new Date().getFullYear()} — GenAI-Powered Water Intelligence · Built for SDG 6
        </p>
      </main>
    </>
  );
}
