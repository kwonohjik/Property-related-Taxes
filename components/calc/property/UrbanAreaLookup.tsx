"use client";

/**
 * 용도지역 자동조회 — 재산세 도시지역분(§112) 토글 보조 UI.
 *
 * form.jibun으로 V-World 용도지역(LT_C_UQ111)을 조회해, 도시지역 계열이면
 * 토글 ON을 "제안"한다(자동 확정 아님 — §112① 지방의회 의결 고시 요건은 미확정).
 *
 * 계획서: docs/00-pm/property-urban-area-auto-lookup.plan.md §5-4·§6
 */

import { useState } from "react";
import {
  lookupLandUseZone,
  type LandUseZoneResult,
} from "@/lib/calc/land-use-zone-lookup";

interface Props {
  /** 재산세 폼 지번주소 (form.jibun) — 조회 입력 소스. */
  jibun: string;
  /** 토글 ON 원클릭 적용 (isUrbanArea = true). */
  onApply: () => void;
}

export function UrbanAreaLookup({ jibun, onApply }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LandUseZoneResult | null>(null);

  const hasAddress = jibun.trim().length > 0;

  async function handleLookup() {
    setLoading(true);
    setResult(null);
    const r = await lookupLandUseZone(jibun);
    setResult(r);
    setLoading(false);
  }

  return (
    <div className="space-y-1.5" data-testid="urban-area-lookup">
      <button
        type="button"
        disabled={!hasAddress || loading}
        onClick={handleLookup}
        data-testid="urban-area-lookup-button"
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-300"
      >
        {loading ? "용도지역 조회 중…" : "용도지역 자동조회"}
      </button>

      {!hasAddress && (
        <p className="text-xs text-muted-foreground">
          물건 소재지(주소)를 먼저 입력하면 용도지역을 자동조회합니다.
        </p>
      )}

      {result && result.verdict === "urban" && (
        <div
          data-testid="urban-area-result-urban"
          className="rounded-md border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs dark:border-rose-800/50 dark:bg-rose-950/20"
        >
          <p className="text-rose-800 dark:text-rose-300">
            용도지역(국토교통부 V-World 참고):{" "}
            <span className="font-semibold">{result.uname}</span> → 도시지역분
            대상 가능성이 있습니다.
          </p>
          <button
            type="button"
            onClick={onApply}
            data-testid="urban-area-apply-button"
            className="mt-1.5 inline-flex items-center rounded border border-rose-400 bg-rose-100 px-2.5 py-1 font-medium text-rose-800 transition-colors hover:bg-rose-200 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
          >
            도시지역분 적용 (토글 ON)
          </button>
          <p className="mt-1 text-caption text-muted-foreground">
            최종 과세 여부는 지방의회 의결 고시 지역인지에 따릅니다. 적용 전
            확인하세요.
          </p>
        </div>
      )}

      {result && result.verdict === "non_urban" && (
        <div
          data-testid="urban-area-result-non-urban"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          용도지역(V-World 참고):{" "}
          <span className="font-semibold text-foreground">{result.uname}</span>{" "}
          → 도시지역분 비대상으로 보입니다(토글 OFF 유지 권장).
        </div>
      )}

      {result && result.verdict === "unknown" && (
        <div
          data-testid="urban-area-result-unknown"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          용도지역을 자동 판별하지 못했습니다. 토지이용계획확인원으로 직접 확인 후
          수동 설정하세요.
        </div>
      )}
    </div>
  );
}
