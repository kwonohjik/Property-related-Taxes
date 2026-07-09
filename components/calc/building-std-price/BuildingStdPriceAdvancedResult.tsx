"use client";

/**
 * 건물 기준시가 — 고급 케이스 결과(복합구조 합산표 / 공동주택 환산 산식 / 다필지 가중평균 echo).
 * 금액 우측정렬(font-mono tabular-nums). 산식은 한국어 풀어쓰기.
 */
import type {
  BuildingStandardPriceResult,
  BuildingStdPriceBreakdown,
} from "@/lib/tax-engine/building-standard-price";
import type { ApartmentConversionResult } from "@/lib/tax-engine/types/building-standard-price.types";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 복합구조 부분별 합산표 */
function CompositeTable({
  breakdowns,
  total,
  weightedLandPrice,
}: {
  breakdowns: BuildingStdPriceBreakdown[];
  total: number;
  weightedLandPrice?: number;
}) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <h3 className="text-sm font-bold text-violet-800">복합구조 부분별 기준시가</h3>

      {weightedLandPrice !== undefined && (
        <p className="text-xs text-violet-700">
          위치지수 적용 ㎡당 공시지가(면적가중평균) ={" "}
          <b className="font-mono tabular-nums">{fmt(weightedLandPrice)}</b> 원/㎡
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-violet-200 text-violet-700">
              <th className="py-1.5 pr-2 text-left font-semibold">부분</th>
              <th className="py-1.5 px-2 text-right font-semibold whitespace-nowrap">면적(㎡)</th>
              <th className="py-1.5 px-2 text-right font-semibold whitespace-nowrap">㎡당 금액</th>
              <th className="py-1.5 px-2 text-right font-semibold whitespace-nowrap">조정률</th>
              <th className="py-1.5 pl-2 text-right font-semibold whitespace-nowrap">기준시가</th>
            </tr>
          </thead>
          <tbody>
            {breakdowns.map((b, i) => (
              <tr key={i} className="border-b border-violet-100">
                <td className="py-1.5 pr-2 text-left">{b.label ?? `부분 ${i + 1}`}</td>
                <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">{b.floorArea ?? ""}</td>
                <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">{fmt(b.pricePerM2 ?? 0)}</td>
                <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                  {b.adjustmentRate !== undefined && b.adjustmentRate !== 1 ? b.adjustmentRate.toFixed(3) : "–"}
                </td>
                <td className="py-1.5 pl-2 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                  {fmt(b.standardPrice)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-violet-300">
              <td className="py-2 pr-2 text-left font-bold text-violet-800" colSpan={4}>
                합계
              </td>
              <td className="py-2 pl-2 text-right font-mono text-base tabular-nums font-bold text-violet-900 whitespace-nowrap">
                {fmt(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-caption text-violet-600">
        각 부분 = ㎡당 금액 × 면적(1,000원 미만 절사 후). 공용 부속시설은 주용도 면적비율로 안분합니다.
      </p>
    </div>
  );
}

/** 공동주택 고시 전 취득 환산 결과 */
function ApartmentConversionCard({ ac }: { ac: ApartmentConversionResult }) {
  const denom = ac.firstNoticeLandValue + ac.firstNoticeBuildingValue;
  const numer = ac.acqLandValue + ac.acqBuildingValue;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-3">
      <h3 className="text-sm font-bold text-amber-800">취득당시 공동주택 기준시가 (환산)</h3>
      <div className="text-right font-mono text-2xl font-bold tabular-nums">{fmt(ac.convertedAcquisitionPrice)}</div>

      <div className="space-y-2 border-t pt-2 text-xs leading-relaxed text-slate-600">
        <p>
          취득당시 기준시가 = 최초고시 공동주택기준시가 × (취득당시 토지 + 건물) ÷ (최초고시 토지 + 건물)
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <span>② 최초고시 토지가액</span>
          <span className="text-right font-mono tabular-nums">{fmt(ac.firstNoticeLandValue)}</span>
          <span>③ 최초고시 건물기준시가</span>
          <span className="text-right font-mono tabular-nums">{fmt(ac.firstNoticeBuildingValue)}</span>
          <span className="text-amber-700">④ 취득당시 토지가액</span>
          <span className="text-right font-mono tabular-nums text-amber-700">{fmt(ac.acqLandValue)}</span>
          <span className="text-amber-700">⑤ 취득당시 건물기준시가</span>
          <span className="text-right font-mono tabular-nums text-amber-700">{fmt(ac.acqBuildingValue)}</span>
          <span className="border-t pt-1">2001년 건물기준시가</span>
          <span className="border-t pt-1 text-right font-mono tabular-nums">{fmt(ac.base2001BuildingPrice)}</span>
        </div>
        <p className="text-slate-500">
          ③ = 2001 건물기준시가 × 산정기준율 <b>{ac.firstNoticeAcqBaseRate}</b> / ⑤ = 2001 건물기준시가 × 산정기준율{" "}
          <b>{ac.acquisitionAcqBaseRate}</b>
        </p>
        <p>
          = {fmt(numer)} ÷ {fmt(denom)} × 최초고시 기준시가 ={" "}
          <b className="font-mono tabular-nums">{fmt(ac.convertedAcquisitionPrice)}</b>
        </p>
      </div>
    </div>
  );
}

export function BuildingStdPriceAdvancedResult({ result }: { result: BuildingStandardPriceResult }) {
  const hasComposite = (result.compositeBreakdowns?.length ?? 0) > 0;
  return (
    <>
      {hasComposite && (
        <CompositeTable
          breakdowns={result.compositeBreakdowns!}
          total={result.compositeTotal ?? 0}
          weightedLandPrice={result.weightedLandPricePerM2}
        />
      )}
      {result.apartmentConversion && <ApartmentConversionCard ac={result.apartmentConversion} />}
    </>
  );
}
