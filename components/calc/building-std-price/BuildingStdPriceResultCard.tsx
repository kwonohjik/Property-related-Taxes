"use client";

/**
 * 건물 기준시가 결과 카드 — 시점별 breakdown 산식(한국어 풀어쓰기, 약어·floor 금지).
 * 양도=취득/양도 2카드, 상증=1카드, 기계식=특수산식 카드. 금액 우측정렬(font-mono tabular-nums).
 */
import type {
  BuildingStandardPriceResult,
  BuildingStdPriceBreakdown,
} from "@/lib/tax-engine/building-standard-price";

const fmt = (n: number) => n.toLocaleString("ko-KR");
const idx = (n: number | undefined) => (n === undefined ? "" : (n / 100).toFixed(2));

interface CardProps {
  title: string;
  tone: "amber" | "emerald" | "sky";
  bd: BuildingStdPriceBreakdown;
  floorArea: number;
  sameYearBadge?: boolean;
}

const TONE: Record<CardProps["tone"], { border: string; bg: string; head: string }> = {
  amber: { border: "border-amber-200", bg: "bg-amber-50/40", head: "text-amber-800" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50/40", head: "text-emerald-800" },
  sky: { border: "border-sky-200", bg: "bg-sky-50/40", head: "text-sky-800" },
};

function BreakdownCard({ title, tone, bd, floorArea, sameYearBadge }: CardProps) {
  const t = TONE[tone];
  const isMech = bd.parkingLotCount !== undefined;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${t.border} ${t.bg}`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-bold ${t.head}`}>{title}</h3>
        {sameYearBadge && (
          <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            §164⑧ 환산 적용
          </span>
        )}
      </div>

      <div className="text-right font-mono text-2xl font-bold tabular-nums">{fmt(bd.standardPrice)}</div>

      <div className="space-y-1 border-t pt-2 text-xs leading-relaxed text-slate-600">
        {isMech ? (
          <>
            <p>
              건물 기준시가 = 단가 <b>{fmt(bd.basePrice)}</b> × 잔가율 <b>{bd.residualRate}</b> × 주차대수{" "}
              <b>{bd.parkingLotCount}</b> = <b className="font-mono tabular-nums">{fmt(bd.standardPrice)}</b>
            </p>
            <p className="text-slate-400">
              내용연수 {bd.mechDurableYears}년 기준 잔가율 · 조정률 미적용(주차전용빌딩)
            </p>
          </>
        ) : (
          <>
            <p>
              ㎡당 금액 = 신축가격기준액 <b>{fmt(bd.basePrice)}</b> × 구조지수 <b>{idx(bd.structureIndex)}</b> × 용도지수{" "}
              <b>{idx(bd.usageIndex)}</b> × 위치지수 <b>{idx(bd.locationIndex)}</b> × 잔가율 <b>{bd.residualRate}</b>
              {bd.adjustmentRate !== undefined && (
                <>
                  {" "}
                  × 조정률 <b>{bd.adjustmentRate.toFixed(3)}</b>
                </>
              )}
            </p>
            <p>
              → 1,000원 미만 절사 → ㎡당 <b className="font-mono tabular-nums">{fmt(bd.pricePerM2 ?? 0)}</b>
            </p>
            {bd.acqBaseRate !== undefined ? (
              <p>
                건물 기준시가 = ㎡당 {fmt(bd.pricePerM2 ?? 0)} × 연면적 <b>{floorArea}</b>㎡ × 산정기준율{" "}
                <b>{bd.acqBaseRate}</b> = <b className="font-mono tabular-nums">{fmt(bd.standardPrice)}</b>
              </p>
            ) : (
              <p>
                건물 기준시가 = ㎡당 {fmt(bd.pricePerM2 ?? 0)} × 연면적 <b>{floorArea}</b>㎡ ={" "}
                <b className="font-mono tabular-nums">{fmt(bd.standardPrice)}</b>
              </p>
            )}
            {bd.appliedLandPriceYear !== undefined && (
              <p className="text-slate-400">위치지수 적용 공시지가 기준연도: {bd.appliedLandPriceYear}년</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface Props {
  result: BuildingStandardPriceResult;
  floorArea: number;
}

export function BuildingStdPriceResultCard({ result, floorArea }: Props) {
  const { valuation, acquisition, transfer, sameYearAdjusted } = result;
  return (
    <div className="space-y-4">
      {valuation && (
        <BreakdownCard title="건물 기준시가" tone="emerald" bd={valuation} floorArea={floorArea} />
      )}
      {acquisition && (
        <BreakdownCard title="취득당시 건물 기준시가" tone="amber" bd={acquisition} floorArea={floorArea} />
      )}
      {transfer && (
        <BreakdownCard
          title="양도당시 건물 기준시가"
          tone="emerald"
          bd={transfer}
          floorArea={floorArea}
          sameYearBadge={sameYearAdjusted}
        />
      )}
      <p className="text-[11px] leading-relaxed text-slate-400">{result.legalBasis}</p>
      {result.warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-700">
          ⚠️ {w}
        </p>
      ))}
    </div>
  );
}
