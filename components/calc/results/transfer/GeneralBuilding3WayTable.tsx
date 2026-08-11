"use client";

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

/**
 * 일반건물 증축 케이스(사례 33) 전용 — 토지(1001)·건물1(3001)·건물2(3002) 3열 요약 표.
 * 영 §102② 결손 통산 전·후 양도소득금액을 자산별로 분리 표시.
 *
 * 진입 조건: aggregated.properties 중 propertyLabel에 "3002" 포함한 항목이 있을 때.
 */
export function GeneralBuilding3WayTable({ aggregated }: { aggregated: AggregateTransferResult }) {
  // 3-way 유효성 확인: 정확히 3개 카드이고, 마지막 카드가 "증축건물(3002)"일 때만 렌더
  const props = aggregated.properties;
  if (props.length !== 3) return null;
  const hasExtension = props.some((p) => p.propertyLabel.includes("3002"));
  if (!hasExtension) return null;

  const land = props.find((p) => p.propertyLabel.includes("1001")) ?? props[0];
  const bld1 = props.find((p) => p.propertyLabel.includes("3001")) ?? props[1];
  const bld2 = props.find((p) => p.propertyLabel.includes("3002")) ?? props[2];

  /**
   * 🔴 **자산별 취득가액 산정 방식은 카드에서 파생한다** (2026-08-12 D-9).
   *
   * 종전에는 「건물1(실가) · 건물2(환산)」·「(환산)」·「(개산공제 §163⑥)」가 **하드코딩**돼
   * 사례 33(원건물 실가 + 증축 환산) 하나만 맞았다. 원취득분·증축분은 **각각** 실거래가·환산을
   * 고를 수 있으므로(4조합) 나머지 세 조합에서는 전부 거짓 표시였다.
   *
   * 🔑 소스는 `aggregated.generalBuildingValuationDetail.assetCards`다 —
   *    `PerPropertyBreakdown`(위 `props`)에는 `usedEstimatedAcquisition`이 **없다**
   *    (`TransferValuationDetailSource`의 Pick 목록에 미포함). 같은 `aggregated` 객체 안에
   *    이미 실려 있으므로 prop 추가 없이 읽는다.
   * 계획서: `docs/02-design/features/transfer-gb-extension-4mode-matrix.plan.md` §4 D-9
   */
  const gbCards = aggregated.generalBuildingValuationDetail?.assetCards;
  const isEstimatedOf = (propertyId: string): boolean | undefined =>
    gbCards?.find((c) => c.propertyId === propertyId)?.usedEstimatedAcquisition;
  const landEstimated = isEstimatedOf("land");
  const bld1Estimated = isEstimatedOf("building1");
  const bld2Estimated = isEstimatedOf("building2");

  /** 취득가액 옆 산정 방식 배지 — 카드를 못 찾으면 아무것도 붙이지 않는다(거짓 표시 금지). */
  const acqBadge = (estimated: boolean | undefined, tone: string) =>
    estimated === undefined ? null : (
      <span className={`ml-1 text-micro ${tone}`}>{estimated ? "(환산)" : "(실거래가)"}</span>
    );

  // 통산 분배: 건물1 결손(음수 income)이 토지·건물2로 안분 흡수됨
  const lossOffset1 = bld1.income < 0 ? Math.abs(bld1.income) : 0;
  // 토지·건물2의 통산 흡수분 = lossOffsetFromOtherGroup (aggregate가 채움)
  const landOffsetAbsorbed = land.lossOffsetFromSameGroup + land.lossOffsetFromOtherGroup;
  const bld2OffsetAbsorbed = bld2.lossOffsetFromSameGroup + bld2.lossOffsetFromOtherGroup;

  const fmt = (n: number) => {
    if (n === 0) return "0";
    return n < 0
      ? `△${formatKRW(Math.abs(n))}`
      : formatKRW(n);
  };

  // 결손 통산 분배량 (토지·건물2가 흡수한 양, 건물1은 결손 전액)
  const landOffsetRow = landOffsetAbsorbed > 0 ? `△${formatKRW(landOffsetAbsorbed)}` : "-";
  const bld1OffsetRow = lossOffset1 > 0 ? `+${formatKRW(lossOffset1)}` : "-";
  const bld2OffsetRow = bld2OffsetAbsorbed > 0 ? `△${formatKRW(bld2OffsetAbsorbed)}` : "-";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="font-semibold text-base mb-1">일반건물 3-자산 요약 (영 §102② 결손 통산)</h3>
      <p className="text-xs text-muted-foreground mb-3">
        토지(1001) · 건물1(3001) · 증축건물2(3002) 소득 라인을 분리 표시.
        자산별 취득가액 산정 방식은 취득가액 옆에 표기됩니다. 건물1 결손이 토지·건물2에 안분 흡수됩니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-1 pr-2 text-left font-normal">구분</th>
              <th className="pb-1 pr-2 text-right font-normal">
                토지
                <span className="ml-1 text-micro text-sky-600">(1001)</span>
              </th>
              <th className="pb-1 pr-2 text-right font-normal">
                건물1
                <span className="ml-1 text-micro text-emerald-600">(3001)</span>
              </th>
              <th className="pb-1 pr-2 text-right font-normal">
                건물2
                <span className="ml-1 text-micro text-fuchsia-600">(3002·증축)</span>
              </th>
              <th className="pb-1 text-right font-normal">합계</th>
            </tr>
          </thead>
          <tbody>
            {/* 양도가액 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">양도가액</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(land.transferPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(bld1.transferPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(bld2.transferPrice)}</td>
              <td className="py-1 text-right font-mono font-semibold">
                {formatKRW(land.transferPrice + bld1.transferPrice + bld2.transferPrice)}
              </td>
            </tr>
            {/* 취득가액 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">취득가액</td>
              <td className="py-1 pr-2 text-right font-mono">
                {formatKRW(land.acquisitionPrice)}
                {acqBadge(landEstimated, "text-sky-600")}
              </td>
              <td className="py-1 pr-2 text-right font-mono">
                {formatKRW(bld1.acquisitionPrice)}
                {acqBadge(bld1Estimated, "text-emerald-600")}
              </td>
              <td className="py-1 pr-2 text-right font-mono">
                {formatKRW(bld2.acquisitionPrice)}
                {acqBadge(bld2Estimated, "text-fuchsia-600")}
              </td>
              <td className="py-1 text-right font-mono font-semibold">
                {formatKRW(land.acquisitionPrice + bld1.acquisitionPrice + bld2.acquisitionPrice)}
              </td>
            </tr>
            {/* 필요경비 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">필요경비</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(land.necessaryExpense)}</td>
              <td className="py-1 pr-2 text-right font-mono">{formatKRW(bld1.necessaryExpense)}</td>
              <td className="py-1 pr-2 text-right font-mono">
                {formatKRW(bld2.necessaryExpense)}
                {/* 환산 파트만 개산공제(§163⑥)다 — 실가 파트는 실제 지출액(§97②1호). */}
                {bld2Estimated !== undefined && (
                  <span className="ml-1 text-micro text-muted-foreground">
                    {bld2Estimated ? "(개산공제 §163⑥)" : "(실제 필요경비)"}
                  </span>
                )}
              </td>
              <td className="py-1 text-right font-mono font-semibold">
                {formatKRW(land.necessaryExpense + bld1.necessaryExpense + bld2.necessaryExpense)}
              </td>
            </tr>
            {/* 양도차익 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 font-medium">양도차익</td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(land.transferGain)}</td>
              <td className={`py-1 pr-2 text-right font-mono font-medium ${bld1.transferGain < 0 ? "text-rose-600" : ""}`}>
                {fmt(bld1.transferGain)}
              </td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(bld2.transferGain)}</td>
              <td className="py-1 text-right font-mono font-semibold">
                {fmt(land.transferGain + bld1.transferGain + bld2.transferGain)}
              </td>
            </tr>
            {/* 장기보유공제 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">장기보유공제</td>
              <td className="py-1 pr-2 text-right font-mono">△{formatKRW(land.longTermHoldingDeduction)}</td>
              <td className="py-1 pr-2 text-right font-mono text-muted-foreground">
                {bld1.longTermHoldingDeduction > 0 ? `△${formatKRW(bld1.longTermHoldingDeduction)}` : "0"}
              </td>
              <td className="py-1 pr-2 text-right font-mono">
                {bld2.longTermHoldingDeduction > 0 ? `△${formatKRW(bld2.longTermHoldingDeduction)}` : "0"}
              </td>
              <td className="py-1 text-right font-mono font-semibold">
                △{formatKRW(land.longTermHoldingDeduction + bld1.longTermHoldingDeduction + bld2.longTermHoldingDeduction)}
              </td>
            </tr>
            {/* 양도소득금액 (통산 전) */}
            <tr className="border-b border-border/40 bg-muted/20">
              <td className="py-1 pr-2 font-medium">양도소득금액</td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(land.income)}</td>
              <td className={`py-1 pr-2 text-right font-mono font-medium ${bld1.income < 0 ? "text-rose-600" : ""}`}>
                {fmt(bld1.income)}
              </td>
              <td className="py-1 pr-2 text-right font-mono font-medium">{fmt(bld2.income)}</td>
              <td className="py-1 text-right font-mono font-semibold">
                {fmt(land.income + bld1.income + bld2.income)}
              </td>
            </tr>
            {/* 영 §102② 통산 흡수 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground text-caption">
                결손 통산 (영§102②)
              </td>
              <td className="py-1 pr-2 text-right font-mono text-rose-600 text-xs">{landOffsetRow}</td>
              <td className="py-1 pr-2 text-right font-mono text-emerald-600 text-xs">{bld1OffsetRow}</td>
              <td className="py-1 pr-2 text-right font-mono text-rose-600 text-xs">{bld2OffsetRow}</td>
              <td className="py-1 text-right font-mono text-xs text-muted-foreground">0</td>
            </tr>
            {/* 통산 후 양도소득금액 */}
            <tr className="bg-muted/40 font-semibold">
              <td className="py-1.5 pr-2 text-sm">통산 후 양도소득금액</td>
              <td className="py-1.5 pr-2 text-right font-mono">{formatKRW(land.incomeAfterOffset)}</td>
              <td className="py-1.5 pr-2 text-right font-mono">{formatKRW(bld1.incomeAfterOffset)}</td>
              <td className="py-1.5 pr-2 text-right font-mono">{formatKRW(bld2.incomeAfterOffset)}</td>
              <td className="py-1.5 text-right font-mono">
                {formatKRW(land.incomeAfterOffset + bld1.incomeAfterOffset + bld2.incomeAfterOffset)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        양도소득금액 합계는 통산 전후 동일하지만,{" "}
        <strong>자산별 분포가 변경</strong>됩니다. 건물1 결손이 토지·건물2 양수에 흡수되어
        세율 적용 기준 양도소득금액이 자산 단위로 재분배됩니다 (영 §102②).
      </p>
    </div>
  );
}
