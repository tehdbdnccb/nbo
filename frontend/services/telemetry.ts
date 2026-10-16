export interface BuildSnapshot {
  id: string; // Deterministic hash: `${model}-${stage}`
  model: string;
  year: number;
  cc: number;
  stage: 1 | 2 | 3;
  nairobiWhp: number;
  totalProjectKes: number;
  kesPerWhp: number;
}

export class PermalinkCodec {
  /**
   * Serializes the active tuning configuration into a deterministic query string.
   * Enables one-click state hydration from shared WhatsApp links.
   */
  public static encodeBuildUrl(baseUrl: string, model: string, year: number, cc: number, stage: number): string {
    const params = new URLSearchParams({
      m: model.trim(),
      y: year.toString(),
      c: cc.toString(),
      s: stage.toString(),
    });
    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Hydrates the Next.js page state from an incoming URL.
   * Rejects malformed or malicious query parameters, protecting the UI from invalid states.
   */
  public static decodeWindowParams(search: string): { model: string; year: number; cc: number; stage: 1 | 2 | 3 } | null {
    const params = new URLSearchParams(search);
    const model = params.get("m");
    const year = Number(params.get("y"));
    const cc = Number(params.get("c"));
    const stage = Number(params.get("s"));

    // Guard clauses enforce KEBS invariants before rendering
    if (!model || year < 2019 || year > new Date().getFullYear() || cc < 1000 || ![1, 2, 3].includes(stage)) {
      return null;
    }
    
    return { model, year, cc, stage: stage as 1 | 2 | 3 };
  }
}

export class ComparisonGarageVault {
  private static readonly STORAGE_KEY = "nbo_telemetry_garage_v1";

  /**
   * Persists a telemetry run to localStorage, maintaining a strict 3-slot LIFO queue.
   * SSR-safe: Guards against `window` undefined errors during Next.js build time.
   */
  public static saveSnapshot(snapshot: BuildSnapshot): BuildSnapshot[] {
    if (typeof window === "undefined") return [];
    
    const existing = ComparisonGarageVault.loadSnapshots().filter((item) => item.id !== snapshot.id);
    const updated = [snapshot, ...existing].slice(0, 3); // Max 3 comparisons to maintain UI integrity
    
    try {
      window.localStorage.setItem(ComparisonGarageVault.STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("LocalStorage write violation", e);
    }
    
    return updated;
  }

  /**
   * Hydrates the 3-slot comparison garage on client mount.
   */
  public static loadSnapshots(): BuildSnapshot[] {
    if (typeof window === "undefined") return [];
    
    try {
      const raw = window.localStorage.getItem(ComparisonGarageVault.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as BuildSnapshot[]) : [];
    } catch {
      return []; // Failsafe against corrupted JSON payloads
    }
  }
}