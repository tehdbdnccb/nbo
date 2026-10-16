"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// --- Types ---
interface TelemetryPayload {
  model: string;
  landed_vehicle_kes: number;
  duties_kes: number;
  hardware_kes: number;
  sea_level_whp: number;
  nairobi_whp: number;
  kes_per_whp: number;
}

interface Preset {
  label: string;
  model: string;
  year: number;
  cc: number;
}

const PRESETS: Preset[] = [
  { label: "Audi SQ5 B9", model: "2020 Audi SQ5", year: 2020, cc: 2995 },
  { label: "BMW X6 M", model: "2020 BMW X6 M Competition", year: 2020, cc: 4395 },
  { label: "Cayenne Turbo GT", model: "2021 Porsche Cayenne Turbo GT", year: 2021, cc: 3996 },
  { label: "LC200 VD30", model: "2019 Toyota Land Cruiser 200", year: 2019, cc: 4461 },
];

export default function TelemetryCockpit() {
  // --- Input State ---
  const [model, setModel] = useState(PRESETS[0].model);
  const [year, setYear] = useState(PRESETS[0].year);
  const [cc, setCc] = useState(PRESETS[0].cc);
  const [stage, setStage] = useState<1 | 2 | 3>(2);
  const [focus, setFocus] = useState("Low-end torque and 95 RON safety");

  // --- Engine State ---
  const [isCalculating, setIsCalculating] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null);
  
  // --- SSE Stream State ---
  const [advisoryStream, setAdvisoryStream] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // --- Handlers ---
  const loadPreset = (preset: Preset) => {
    setModel(preset.model);
    setYear(preset.year);
    setCc(preset.cc);
  };

  const executeTelemetryRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalculating(true);
    setTelemetry(null);
    setAdvisoryStream("");

    try {
      // 1. Fetch Hard Math (KRA + Thermodynamics)
      const res = await fetch("/api/v1/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, year, cc, stage, focus }),
      });

      if (!res.ok) throw new Error("Telemetry computation failed");
      const data: TelemetryPayload = await res.json();
      setTelemetry(data);

      // 2. Trigger Unbuffered Groq SSE Stream via Edge Proxy
      setIsStreaming(true);
      const url = new URL("/api/v1/tuning/live-advisory", window.location.origin);
      url.searchParams.append("model", model);
      url.searchParams.append("stage", stage.toString());
      url.searchParams.append("focus", focus);

      if (eventSourceRef.current) eventSourceRef.current.close();
      
      const sse = new EventSource(url.toString());
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        if (event.data === "[DONE]") {
          sse.close();
          setIsStreaming(false);
        } else {
          setAdvisoryStream((prev) => prev + event.data);
        }
      };

      sse.onerror = () => {
        sse.close();
        setIsStreaming(false);
      };

    } catch (error) {
      console.error("Invariant breach:", error);
      setIsStreaming(false);
    } finally {
      setIsCalculating(false);
    }
  };

  // Cleanup SSE on unmount to prevent memory leaks
  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  const generateWhatsAppLink = useCallback(() => {
    if (!telemetry) return "#";
    const text = `NBO Tuning Telemetry: ${model} Stage ${stage}\nLanded: KES ${(telemetry.landed_vehicle_kes / 1e6).toFixed(1)}M\nMBA WHP: ${telemetry.sea_level_whp} | NBO WHP: ${telemetry.nairobi_whp}\nEfficiency: KES ${Math.round(telemetry.kes_per_whp).toLocaleString()}/WHP\n\nRun your numbers: https://nairobi-tuning.vercel.app`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [telemetry, model, stage]);

  return (
    <main className="min-h-screen bg-[#090D16] text-slate-300 font-sans selection:bg-[#10B981] selection:text-black">
      <div className="max-w-6xl mx-auto p-6 lg:p-12">
        
        {/* Header */}
        <header className="mb-10 border-b border-slate-800 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight uppercase">Nairobi Telemetry Engine</h1>
            <p className="text-sm text-slate-500 font-mono mt-2">1,795m ASL Thermodynamic & KRA Computation</p>
          </div>
          <div className="hidden md:block text-right font-mono text-xs">
            <span className="block text-[#10B981]">SYSTEM: ONLINE</span>
            <span className="block text-slate-500">LATENCY: {'<'}50ms</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Input Cockpit */}
          <div className="lg:col-span-5 space-y-8">
            
            {/* Presets */}
            <div className="space-y-2">
              <label className="text-xs font-mono text-slate-500 uppercase tracking-widest">Instant Presets</label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.model}
                    onClick={() => loadPreset(p)}
                    className="px-3 py-1.5 text-xs font-mono border border-slate-700 bg-slate-800/50 hover:border-[#10B981] hover:text-[#10B981] transition-colors rounded"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <form onSubmit={executeTelemetryRun} className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-6">
              <div>
                <label className="block text-xs font-mono text-slate-500 uppercase mb-2">Chassis & Model</label>
                <input 
                  type="text" 
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-[#10B981] outline-none px-4 py-2 text-white font-mono text-sm rounded"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono text-slate-500 uppercase mb-2">Year (KEBS Limit)</label>
                  <input 
                    type="number" min="2019" max="2026"
                    value={year} onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-[#10B981] outline-none px-4 py-2 text-white font-mono text-sm rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-500 uppercase mb-2">Displacement (CC)</label>
                  <input 
                    type="number" min="1000"
                    value={cc} onChange={(e) => setCc(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-[#10B981] outline-none px-4 py-2 text-white font-mono text-sm rounded"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-slate-500 uppercase mb-2">Tuning Stage</label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStage(s as 1 | 2 | 3)}
                      className={`py-2 text-sm font-mono rounded border transition-colors ${stage === s ? "border-[#10B981] bg-[#10B981]/10 text-[#10B981]" : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600"}`}
                    >
                      Stage {s}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isCalculating || isStreaming}
                className="w-full bg-[#10B981] hover:bg-[#0EA5E9] text-black font-bold font-mono tracking-tight py-3 rounded uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCalculating ? "Computing Matrix..." : "Execute Run"}
              </button>
            </form>
          </div>

          {/* Right Column: Output Dashboard */}
          <div className="lg:col-span-7 space-y-6">
            
            {!telemetry ? (
              <div className="h-full min-h-[400px] border border-slate-800 border-dashed rounded-lg flex items-center justify-center text-slate-600 font-mono text-sm">
                Awaiting Telemetry Initialization...
              </div>
            ) : (
              <>
                {/* Metrics Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
                    <p className="text-[10px] uppercase text-slate-500 font-mono mb-1">Total Landed (KES)</p>
                    <p className="text-xl text-white font-mono tabular-nums">{(telemetry.landed_vehicle_kes / 1e6).toFixed(2)}M</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg">
                    <p className="text-[10px] uppercase text-slate-500 font-mono mb-1">Hardware (KES)</p>
                    <p className="text-xl text-white font-mono tabular-nums">{(telemetry.hardware_kes / 1e6).toFixed(2)}M</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg col-span-2">
                    <p className="text-[10px] uppercase text-[#10B981] font-mono mb-1">Project Efficiency</p>
                    <p className="text-xl text-[#10B981] font-mono tabular-nums">KES {Math.round(telemetry.kes_per_whp).toLocaleString()} <span className="text-sm text-slate-500">/ WHP</span></p>
                  </div>
                </div>

                {/* Altitude Loss Visualizer */}
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-lg space-y-4">
                  <h3 className="text-xs font-mono text-slate-500 uppercase tracking-widest border-b border-slate-800 pb-2">Thermodynamic Derating (1,795m ASL)</h3>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-slate-400">Mombasa (Sea Level) WHP</span>
                        <span className="text-white tabular-nums">{telemetry.sea_level_whp} WHP</span>
                      </div>
                      <div className="w-full bg-slate-950 h-3 rounded overflow-hidden">
                        <div className="bg-slate-600 h-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-[#10B981]">Nairobi (1,795m) WHP</span>
                        <span className="text-[#10B981] tabular-nums font-bold">{telemetry.nairobi_whp} WHP</span>
                      </div>
                      <div className="w-full bg-slate-950 h-3 rounded overflow-hidden">
                        <div 
                          className="bg-[#10B981] h-full transition-all duration-1000 ease-out" 
                          style={{ width: `${(telemetry.nairobi_whp / telemetry.sea_level_whp) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-2">
                    *Accounts for ~18.6% drop in barometric pressure. Stage 3 metrics adjust for intercooler/WMI thermal recovery.
                  </p>
                </div>

                {/* Live Groq Advisory Stream */}
                <div className="bg-black border border-slate-800 rounded-lg overflow-hidden">
                  <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] uppercase text-slate-500 font-mono">Live LPU Inference [Groq]</span>
                    {isStreaming && <span className="flex h-2 w-2 rounded-full bg-[#10B981] animate-pulse"></span>}
                  </div>
                  <div className="p-4 h-48 overflow-y-auto font-mono text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {advisoryStream || (isStreaming ? "Awaiting inference payload..." : "Initiate run to generate localized hardware directives.")}
                  </div>
                </div>

                {/* Action Bar */}
                <div className="flex gap-4">
                  <a 
                    href={generateWhatsAppLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 py-3 rounded text-sm font-mono uppercase tracking-widest transition-colors"
                  >
                    Share to WhatsApp
                  </a>
                  {/* Garage storage triggers local state mutation outlined in telemetry.ts */}
                  <button className="flex-1 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 py-3 rounded text-sm font-mono uppercase tracking-widest transition-colors">
                    Save to Garage
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}