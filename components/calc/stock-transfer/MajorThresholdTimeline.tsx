"use client";

/**
 * MajorThresholdTimeline — 시기별 대주주 임계 이력 표
 *
 * 엔진 export 매트릭스(KOSPI/KOSDAQ/KONEX/UNLISTED_MAJOR_THRESHOLDS)를
 * 단일 진실로 사용 — 이중 정의 금지.
 *
 * 현재 시점 행은 violet highlight.
 * 비상장: 벤처 40억 안내 + 부칙 미확인 경고 표시.
 * 기타자산(other_asset)은 null 반환 — 별도 트랙.
 *
 * 법령: 상장 §157④ / 비상장 §167의8①2호
 */

import {
  KOSPI_MAJOR_THRESHOLDS,
  KOSDAQ_MAJOR_THRESHOLDS,
  KONEX_MAJOR_THRESHOLDS,
  UNLISTED_MAJOR_THRESHOLDS,
  type MajorShareholderThreshold,
} from "@/lib/tax-engine/stock-transfer/stock-rate-tables";

// 지원 시장 타입 (기타자산 제외)
type SupportedMarket = "kospi" | "kosdaq" | "konex" | "unlisted";

interface Props {
  /** 현재 선택된 시장 */
  marketType: SupportedMarket | string;
}

// 시장별 매트릭스 + 라벨 매핑
const TABLES: Record<SupportedMarket, { label: string; legal: string; rows: MajorShareholderThreshold[] }> = {
  kospi:    { label: "코스피",  legal: "§157④",        rows: KOSPI_MAJOR_THRESHOLDS },
  kosdaq:   { label: "코스닥",  legal: "§157④",        rows: KOSDAQ_MAJOR_THRESHOLDS },
  konex:    { label: "코넥스",  legal: "§157④",        rows: KONEX_MAJOR_THRESHOLDS },
  unlisted: { label: "비상장", legal: "§167의8①2호",  rows: UNLISTED_MAJOR_THRESHOLDS },
} as const;

/**
 * from→to 구간 라벨 생성
 * sorted는 from 내림차순(최신→구) 정렬된 배열.
 * idx=0이 현행, idx=마지막이 최고(구)
 */
function formatPeriodLabel(
  sorted: MajorShareholderThreshold[],
  idx: number,
): string {
  const fromDate = sorted[idx].from;
  const fromISO = fromDate.toISOString().slice(0, 10);

  // 현행 행 (가장 최신)
  if (idx === 0) {
    return `${fromISO} ~ 현재`;
  }

  // to = 바로 위(더 최신) 행의 from 전날
  const nextFrom = sorted[idx - 1].from;
  const toDate = new Date(nextFrom.getTime() - 86400000);
  const toISO = toDate.toISOString().slice(0, 10);

  // 1900-01-01 fallback 행은 "~toISO" 표기
  if (fromISO === "1900-01-01") {
    return `~ ${toISO}`;
  }

  return `${fromISO} ~ ${toISO}`;
}

/** 시가총액 임계를 "N억" 또는 "—" 로 포맷 */
function formatMarketCap(cap: number): string {
  if (cap === Infinity || cap === 0) return "—";
  return `${(cap / 100_000_000).toFixed(0)}억`;
}

/** 해당 시장의 임계 이력 표 */
function ThresholdTable({ market }: { market: SupportedMarket }) {
  const { label, legal, rows } = TABLES[market];
  const sorted = [...rows].sort((a, b) => b.from.getTime() - a.from.getTime());

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-sm font-semibold mb-2 text-slate-800">
        {label} ({legal}) — 시기별 기준 이력
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 border-b border-slate-200">
            <th className="text-left py-1 font-medium">시기</th>
            <th className="text-right py-1 font-medium">지분율</th>
            <th className="text-right py-1 font-medium">시총</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const fromISO = row.from.toISOString().slice(0, 10);
            const isCurrent = idx === 0;
            return (
              <tr
                key={fromISO}
                className={
                  isCurrent
                    ? "bg-violet-50/70 text-violet-900 font-medium"
                    : "text-slate-700"
                }
              >
                <td className="py-1 pr-2">{formatPeriodLabel(sorted, idx)}</td>
                <td className="text-right py-1 pr-2">
                  {(row.shareRatioThreshold * 100).toFixed(1)}%
                </td>
                <td className="text-right py-1">
                  {formatMarketCap(row.marketCapThreshold)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* 비상장 전용 안내 */}
      {market === "unlisted" && (
        <>
          <p className="text-xs text-slate-500 mt-2">
            ※ 벤처기업은 시총 기준 40억 (조특법 §16, 시행령 §167의8①2호 나목)
          </p>
          <p className="text-xs text-amber-700 mt-1">
            ※ 2017.1.1.~2019.12.31. 기준은 법제처 연혁 API 미확인 — 추정값
          </p>
        </>
      )}
    </div>
  );
}

/**
 * MajorThresholdTimeline
 *
 * 지원 시장(kospi·kosdaq·konex·unlisted)만 렌더.
 * 기타자산(other_asset)·미지원 시장은 null 반환.
 */
export function MajorThresholdTimeline({ marketType }: Props) {
  const supported: SupportedMarket[] = ["kospi", "kosdaq", "konex", "unlisted"];
  if (!supported.includes(marketType as SupportedMarket)) {
    return null;
  }
  return <ThresholdTable market={marketType as SupportedMarket} />;
}
