"use client";

/**
 * 비사업용 토지(NBL) 자동조회 버튼 — vWorld 개별공시지가·용도지역.
 *
 * - NblLandValueAutoFetchButton: 당해·직전 토지가액 = 공시지가 × 면적 × 지분
 * - NblUrbanZoneCheckButton: 도시지역 여부 자동감지 (편입일 값은 수동 입력)
 */

import { useState } from "react";
import { recommendLandPriceYear } from "@/lib/utils/land-price-year";
import { lookupLandPrice, isUrbanZone } from "@/lib/calc/nbl-land-zone";

const BTN_CLASS =
  "h-8 shrink-0 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted/60 disabled:opacity-40 transition-colors";

// ──────────────────────────────────────────────────
// 토지가액 (당해·직전) 자동조회
// ──────────────────────────────────────────────────

interface ValueButtonProps {
  /** 자산 소재지 지번 */
  jibun: string;
  /** 취득 면적 (㎡) */
  area: number;
  /** 공동소유 지분 (1 = 단독) */
  ratio: number;
  /** 양도일 (당해/직전 연도 결정) */
  transferDate: string;
  /** 당해·직전 토지가액(원, 문자열) 채움 콜백 */
  onResult: (currentValue: string, priorValue: string) => void;
}

export function NblLandValueAutoFetchButton({
  jibun,
  area,
  ratio,
  transferDate,
  onResult,
}: ValueButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const disabledReason = !jibun
    ? "자산 소재지(지번)를 먼저 입력하세요"
    : !(area > 0)
      ? "자산의 취득 면적(㎡)을 먼저 입력하세요"
      : !transferDate
        ? "양도일을 먼저 입력하세요"
        : null;

  async function handleFetch() {
    if (disabledReason) return;
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const curYear = recommendLandPriceYear(transferDate);
      const priorYear = curYear - 1;
      const [cur, prior] = await Promise.all([
        lookupLandPrice(jibun, String(curYear)),
        lookupLandPrice(jibun, String(priorYear)),
      ]);
      const curVal = Math.floor(cur.pricePerSqm * area * ratio);
      const priorVal = Math.floor(prior.pricePerSqm * area * ratio);
      onResult(String(curVal), String(priorVal));
      setInfo(
        `당해 ${cur.year}년 ${cur.pricePerSqm.toLocaleString()}원/㎡ · ` +
          `직전 ${prior.year}년 ${prior.pricePerSqm.toLocaleString()}원/㎡ × ${area}㎡` +
          (ratio !== 1 ? ` × 지분 ${ratio}` : ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleFetch}
        disabled={!!disabledReason || loading}
        title={disabledReason ?? undefined}
        className={BTN_CLASS}
      >
        {loading ? "조회 중…" : "🔍 토지가액 자동조회 (당해·직전)"}
      </button>
      {disabledReason && (
        <p className="text-caption text-muted-foreground">{disabledReason}</p>
      )}
      {info && <p className="text-caption text-emerald-600 dark:text-emerald-400">{info}</p>}
      {error && <p className="text-caption text-destructive">{error}</p>}
    </div>
  );
}

// ──────────────────────────────────────────────────
// 도시지역 여부 자동감지 (편입일은 수동)
// ──────────────────────────────────────────────────

interface ZoneButtonProps {
  jibun: string;
  /** 양도일 — 조회 기준연도 (미입력 시 최신 연도) */
  transferDate: string;
}

export function NblUrbanZoneCheckButton({ jibun, transferDate }: ZoneButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ zone?: string; urban: boolean } | null>(null);

  const disabledReason = !jibun ? "자산 소재지(지번)를 먼저 입력하세요" : null;

  async function handleFetch() {
    if (disabledReason) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const year = transferDate
        ? recommendLandPriceYear(transferDate)
        : new Date().getFullYear();
      const r = await lookupLandPrice(jibun, String(year));
      if (!r.zoneName) {
        setError("용도지역 정보를 가져오지 못했습니다");
        return;
      }
      setResult({ zone: r.zoneName, urban: isUrbanZone(r.zoneName) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-1.5 space-y-1">
      <button
        type="button"
        onClick={handleFetch}
        disabled={!!disabledReason || loading}
        title={disabledReason ?? undefined}
        className={BTN_CLASS}
      >
        {loading ? "조회 중…" : "🔍 도시지역 여부 조회"}
      </button>
      {disabledReason && (
        <p className="text-caption text-muted-foreground">{disabledReason}</p>
      )}
      {error && <p className="text-caption text-destructive">{error}</p>}
      {result && (
        <p className="text-caption text-muted-foreground">
          현재 용도지역: <span className="font-medium text-foreground">{result.zone}</span>
          {" — "}
          {result.urban ? (
            <span className="text-amber-600 dark:text-amber-400">
              도시지역 ✓ 편입일을 확인해 직접 입력하세요 (편입일은 자동조회 불가)
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400">
              비도시지역 — 도시편입 유예 대상 아님
            </span>
          )}
        </p>
      )}
    </div>
  );
}
