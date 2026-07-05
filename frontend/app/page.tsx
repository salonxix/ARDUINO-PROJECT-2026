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
import VisualWaterInspector from '@/components/VisualWaterInspector';

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

        {/* ΓöÇΓöÇ Live Sensor Dashboard ΓöÇΓöÇ */}
        <section id="dashboard" className="max-w-5xl mx-auto pt-16">
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-lg">
              ≡ƒôí
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Live Sensor Dashboard</h2>
              <p className="text-xs text-gray-500 mt-0.5">Real-time readings from Firebase</p>
            </div>
            <span className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Live
            </span>
            {/* Global language selector ΓÇö applies to AI Chat + Analysis */}
            <div className="ml-auto">
              <LanguageSelector />
            </div>
          </div>
          <WaterDashboard />
        </section>

        {/* ΓöÇΓöÇ AI Analysis (manual) ΓöÇΓöÇ */}
        <div id="ai-analysis">
          <AIAnalysis />
        </div>

        {/* ΓöÇΓöÇ Auto Water Analysis + Explain More ΓöÇΓöÇ */}
        <WaterAnalysisPanel onExplainRequest={handleExplainRequest} />

        {/* ΓöÇΓöÇ World Map ΓöÇΓöÇ */}
        <div id="map">
          <WaterMap />
        </div>

        {/* ΓöÇΓöÇ Charts ΓöÇΓöÇ */}
        <div id="charts">
          <WaterCharts />
        </div>

        {/* ΓöÇΓöÇ Prediction AI ΓöÇΓöÇ */}
        <div id="prediction">
          <PredictionPanel />
        </div>

        {/* ΓöÇΓöÇ History Table ΓöÇΓöÇ */}
        <div id="history">
          <HistoryTable />
        </div>

        {/* ΓöÇΓöÇ AI Chat ΓöÇΓöÇ */}
        <AIChat ref={chatRef} />

        {/* ΓöÇΓöÇ Visual Water Inspector ΓöÇΓöÇ */}
        <VisualWaterInspector />

        <p className="text-center text-gray-700 text-xs mt-16">
          AquaVitals ┬⌐ {new Date().getFullYear()} ΓÇö GenAI-Powered Water Intelligence ┬╖ Built for SDG 6
        </p>
      </main>
    </>
  );
}
