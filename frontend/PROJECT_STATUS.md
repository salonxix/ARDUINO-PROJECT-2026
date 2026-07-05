# AquaVitals AI — Project Status

## Project Name
**AquaVitals AI** — GenAI-Powered Water Quality Intelligence Platform

---

## Architecture

```
ardinosoftware/
├── server.js                     ← Express backend (port 5000) — receives Arduino sensor POST
├── firebase.js                   ← Firebase Admin singleton (backend)
├── computeWQI.js                 ← WQI + Grade calculation logic
├── serviceAccountKey.json        ← Firebase service account (never commit)
│
└── frontend/                     ← Next.js 16 App Router
    ├── app/
    │   ├── page.tsx              ← Root page — assembles all sections
    │   ├── layout.tsx            ← HTML shell + Inter font
    │   ├── globals.css           ← Tailwind + Leaflet overrides
    │   └── api/
    │       ├── analyze/          ← POST /api/analyze (manual AI analysis)
    │       ├── chat/             ← POST /api/chat (conversational AI)
    │       └── water-analysis/   ← POST /api/water-analysis (structured analysis)
    ├── components/
    │   ├── HeroSection.tsx       ← Landing hero + sticky nav + particles
    │   ├── WaterDashboard.tsx    ← Live sensor metric cards
    │   ├── AIAnalysis.tsx        ← Manual AI analysis with voice output
    │   ├── WaterAnalysisPanel.tsx← Button-triggered structured analysis
    │   ├── WaterMap.tsx          ← Global map wrapper (Firebase + Leaflet)
    │   ├── MapInner.tsx          ← Leaflet map (SSR-safe dynamic import)
    │   ├── WaterCharts.tsx       ← Recharts trend charts
    │   ├── PredictionPanel.tsx   ← Linear regression predictions
    │   ├── HistoryTable.tsx      ← Sortable/searchable sensor history
    │   └── AIChat.tsx            ← ChatGPT-style chat interface
    ├── services/
    │   ├── gemini.ts             ← Shared Gemini REST helper (v1beta)
    │   ├── firebaseReader.ts     ← Firebase Admin read helper with timeout
    │   └── knowledge/
    │       ├── knowledgeLoader.ts← CSV + PDF loader, TF-IDF search
    │       ├── index.ts          ← Barrel export
    │       └── data/             ← Research files (CSV, PDF, JSON)
    └── lib/
        ├── firebase.ts           ← Firebase client SDK
        └── firebaseAdmin.ts      ← Firebase Admin SDK singleton
```

---

## Features

| Feature | Status |
|---|---|
| Live sensor dashboard (pH, TDS, Temp, Turbidity, WQI, Grade) | ✅ |
| Global water map (Leaflet, Google Hybrid tiles, heatmap) | ✅ |
| Sensor trend charts (Recharts — 24h history) | ✅ |
| Prediction AI (linear regression — 24h / 7d / 30d) | ✅ |
| History table (sortable, searchable) | ✅ |
| Manual AI Analysis (Gemini + WHO standards + voice output) | ✅ |
| Auto Water Analysis Panel (on-demand, structured JSON) | ✅ |
| AI Chat (context-aware — live sensor + research knowledge) | ✅ |
| Knowledge engine (CSV + PDF research injection) | ✅ |
| Location detection (GPS + reverse geocode) | ✅ |
| Voice output (Web Speech API) | ✅ |

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/analyze` | POST | Manual analysis — accepts explicit sensor values, returns full breakdown |
| `/api/water-analysis` | POST | Structured analysis — reads latest Firebase reading, returns 9-field JSON |
| `/api/chat` | POST | Chat — enriches context with live sensors + research, returns AI reply |

---

## Technologies Used

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 16.2 (App Router) |
| UI / Styling | Tailwind CSS v4, inline styles |
| Language | TypeScript |
| Charting | Recharts |
| Maps | Leaflet, react-leaflet, leaflet.heat |
| AI | Google Gemini (v1beta REST, gemini-2.5-flash-lite) |
| Backend | Node.js + Express (port 5000) |
| Database | Firebase Realtime Database |
| PDF parsing | pdf-parse |
| CSV parsing | PapaParse |
| Excel parsing | xlsx |
| Voice | Web Speech API (browser built-in) |
| Geocoding | Nominatim (OpenStreetMap) |
| Font | Inter (Google Fonts) |

---

## AI Flow

```
Arduino Sensor
     │
     ▼
POST /sensor (Express, port 5000)
     │  calculateGradeAndWQI()
     ▼
Firebase Realtime Database
     │
     ├──▶ WaterDashboard (live cards)
     ├──▶ WaterMap (markers + heatmap)
     ├──▶ WaterCharts (trend lines)
     ├──▶ PredictionPanel (regression)
     ├──▶ HistoryTable
     │
     └──▶ /api/water-analysis  ──▶  Gemini (v1beta)
              │                           │
              │  getLatestSensorReading()  │  buildAnalysisPrompt()
              │  getRelevantKnowledge()    │  + sensor context
              │  formatChunksForPrompt()   │  + research chunks
              │                           ▼
              └──────────────────── WaterAnalysisPanel

     └──▶ /api/chat  ──▶  callGeminiChat()
              │                │
              │  sensor context │  conversation history
              │  research chunks│  system instruction
              └────────────────▼
                           AIChat component
```

---

## Sensor Flow

```
Arduino → POST /sensor (Express)
  Fields: city, country, lat, lng, ph, tds, turbidity, gas, temp
  Server calculates: grade, wqi, timestamp
  Saves to: Firebase water-data/{pushKey}
  
Firebase listener (client) → WaterDashboard updates live
```

---

## Dataset Flow

```
services/knowledge/data/
  ├── water_pollution_disease.csv   → 1000+ rows → KnowledgeChunks
  ├── water_quality_facts.json      → 14 topics  → KnowledgeChunks
  ├── who_water_standards.csv       → 20 params  → KnowledgeChunks
  ├── CWE_Vol20_No3_p_1027-1035.pdf → research paper → KnowledgeChunks
  └── NL-32-25-(25)B-1661com.pdf    → research paper → KnowledgeChunks

loadKnowledge() → parse once per server lifetime → cache in memory
searchKnowledge(query) → TF-IDF scoring → top-K chunks
getRelevantKnowledge(sensors) → sensor-aware query expansion → top-K chunks
formatChunksForPrompt(chunks) → max 2500 chars → injected into Gemini prompt
```

---

## Future Scope

- Real-time multi-city monitoring with multiple Arduino nodes
- Mobile app (React Native) reading from the same Firebase database
- Gemini billing enabled → higher quota → faster analysis
- Firebase `.indexOn: timestamp` for faster queries
- Export reports as PDF
- WhatsApp / SMS alerts for dangerous water quality
- Historical trend analysis over weeks/months
- Water quality comparison across cities
- Machine learning model trained on the CSV dataset for local predictions (no API dependency)

---

## Production Readiness

| Item | Status |
|---|---|
| Debug console.logs removed | ✅ |
| Error messages user-friendly | ✅ |
| Loading states on all buttons | ✅ |
| Double-click protection | ✅ |
| Firebase client API key | ⚠️ Placeholder — replace with real key |
| Gemini API key | ⚠️ Current key has quota issues — replace with billing-enabled key |
| Firebase index on timestamp | ⚠️ Not set — add `.indexOn: timestamp` in rules |
| HTTPS in production | ⚠️ Configure on deployment host |
