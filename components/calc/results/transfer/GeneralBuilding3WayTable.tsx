"use client";

import { splitAcqModeLabel } from "@/lib/tax-engine/transfer-tax-split-display";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import { gbViewProperties, type GbBlockView } from "@/components/calc/results/transfer/gb-result-block-views";

/**
 * 일반건물 증축 케이스(사례 33) 전용 — 토지(1001)·건물1(3001)·건물2(3002) 3열 요약 표.
 * 영 §102② 결손 통산 전·후 양도소득금액을 자산별로 분리 표시.
 *
 * 진입 조건: 그 일반건물의 카드가 정확히 3장이고 그중 「증축건물(3002)」이 있을 때.
 *
 * `view`(`gb-result-block-views.ts`)를 주면 그 일반건물 한 물건분만 그린다 — 함께 양도는 다른 자산 카드가 섞여 있어
 * 일반건물 자산마다 같은 접미사 카드 3장으로 그린다(`gb-bundled-result-blocks.plan.md` D-2). 없으면 단건 슬롯·전 카드.
 */
export function GeneralBuilding3WayTable({ aggregated, view }: { aggregated: AggregateTransferResult; view?: GbBlockView }) {
  // 3-way 유효성 확인: 정확히 3개 카드이고, 마지막 카드가 "증축건물(3002)"일 때만 렌더
  const props = view ? gbViewProperties(aggregated, view) : aggregated.properties;
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
  const gbCards = (view?.detail ?? aggregated.generalBuildingValuationDetail)?.assetCards;
  // 함께 양도 카드 id에는 자산 접미사가 붙는다 — 상세 카드는 그 자산 것뿐이라 base id로 찾는다.
  const cardOf = (propertyId: string) => gbCards?.find((c) => baseCardId(c.propertyId) === propertyId);
  const bld2Estimated = cardOf("building2")?.usedEstimatedAcquisition;

  /**
   * 취득가액 옆 산정 방식 배지 — 카드를 못 찾으면 아무것도 붙이지 않는다(거짓 표시 금지).
   *
   * 🔑 E-1 `acquisitionMode` echo가 있으면 4종을 그대로 읽는다 — boolean `usedEstimatedAcquisition`만 보면 감정·매매사례 파트가
   *    「(실거래가)」로 찍힌다(A2 §9.2 D2). **옛 이력**(echo 없음)은 종전대로 boolean 2종 — 표시 회귀 없음.
   */
  // 산정방식 어휘는 입력 화면 라디오·상세명세서·결과 카드와 같은 엔진 leaf다(결정 9 — 종전 「(환산)」은 한 곳만 어긋났다).
  const MODE_BADGE = {
    actual: `(${splitAcqModeLabel("actual")})`,
    estimated: `(${splitAcqModeLabel("estimated")})`,
    appraisal: `(${splitAcqModeLabel("appraisal")})`,
    salesCase: `(${splitAcqModeLabel("salesCase")})`,
  } as const;
  const acqBadge = (propertyId: string, tone: string) => {
    const card = cardOf(propertyId);
    const label = card?.acquisitionMode
      ? MODE_BADGE[card.acquisitionMode]
      : card?.usedEstimatedAcquisition === undefined
        ? null
        : card.usedEstimatedAcquisition
          ? MODE_BADGE.estimated
          : MODE_BADGE.actual;
    return label === null ? null : <span className={`ml-1 text-micro ${tone}`}>{label}</span>;
  };

  /**
   * 통산 분배 — **결손이 어느 자산에서 나오든** 같은 규칙으로 읽는다.
   *
   * 🔴 종전에는 「건물1이 결손」을 하드코딩했다(`lossOffset1`만 income<0을 보고, 토지·건물2는
   *    흡수분만 봤다). 토지나 건물2가 결손이면 그 자산의 기여분이 「-」로 사라지고, 흡수한 쪽은
   *    흡수분이 있는데도 부호가 뒤집혀 **합계 0이 거짓**이 됐다(2026-09-07 대장 재대조).
   *    결손 자산은 흡수분이 0이므로 한 함수로 세 자산을 모두 처리할 수 있다.
   */
  const offsetOf = (a: { income: number; lossOffsetFromSameGroup: number; lossOffsetFromOtherGroup: number }) => {
    const contributed = a.income < 0 ? Math.abs(a.income) : 0;
    const absorbed = a.lossOffsetFromSameGroup + a.lossOffsetFromOtherGroup;
    return { contributed, absorbed };
  };

  const fmt = (n: number) => {
    if (n === 0) return "0";
    return n < 0
      ? `△${formatKRW(Math.abs(n))}`
      : formatKRW(n);
  };

  // 결손 통산 분배량 — 결손 기여는 `+`(emerald), 흡수는 `△`(rose).
  const offsetCell = (a: Parameters<typeof offsetOf>[0]) => {
    const { contributed, absorbed } = offsetOf(a);
    if (contributed > 0) return { text: `+${formatKRW(contributed)}`, tone: "text-emerald-700 dark:text-emerald-400" };
    if (absorbed > 0) return { text: `△${formatKRW(absorbed)}`, tone: "text-rose-700 dark:text-rose-400" };
    return { text: "-", tone: "text-muted-foreground" };
  };
  /**
   * 결손 통산 합계 — 세 칸의 「기여 − 흡수」 합. 단건은 결손이 이 물건 안에서만 오가 늘 0이다.
   * 함께 양도는 결손이 다른 자산으로 넘어가거나(+) 다른 자산의 결손을 흡수한다(△) — 하드코딩 0은 거짓이 된다(계획서 C-4 · Q-2 a).
   */
  const netOffset = [land, bld1, bld2].reduce((s, a) => {
    const { contributed, absorbed } = offsetOf(a);
    return s + contributed - absorbed;
  }, 0);
  const landOffsetCell = offsetCell(land);
  const bld1OffsetCell = offsetCell(bld1);
  const bld2OffsetCell = offsetCell(bld2);

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="font-semibold text-base mb-1">
        일반건물 3-자산 요약 (영 §102② 결손 통산){view?.label ? ` — ${view.label}` : ""}
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        토지(1001) · 건물1(3001) · 증축건물2(3002) 소득 라인을 분리 표시.
        자산별 취득가액 산정 방식은 취득가액 옆에 표기됩니다. 결손이 난 자산의 손실은 나머지 자산의 양수 소득에 안분 흡수됩니다.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-1 pr-2 text-left font-normal">구분</th>
              <th className="pb-1 pr-2 text-right font-normal">
                토지
                <span className="ml-1 text-micro text-sky-700 dark:text-sky-400">(1001)</span>
              </th>
              <th className="pb-1 pr-2 text-right font-normal">
                건물1
                <span className="ml-1 text-micro text-emerald-700 dark:text-emerald-400">(3001)</span>
              </th>
              <th className="pb-1 pr-2 text-right font-normal">
                건물2
                <span className="ml-1 text-micro text-fuchsia-700 dark:text-fuchsia-400">(3002·증축)</span>
              </th>
              <th className="pb-1 text-right font-normal">합계</th>
            </tr>
          </thead>
          <tbody>
            {/* 양도가액 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">양도가액</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(land.transferPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(bld1.transferPrice)}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(bld2.transferPrice)}</td>
              <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                {formatKRW(land.transferPrice + bld1.transferPrice + bld2.transferPrice)}
              </td>
            </tr>
            {/* 취득가액 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">취득가액</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(land.acquisitionPrice)}
                {acqBadge("land", "text-sky-700 dark:text-sky-400")}
              </td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(bld1.acquisitionPrice)}
                {acqBadge("building1", "text-emerald-700 dark:text-emerald-400")}
              </td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(bld2.acquisitionPrice)}
                {acqBadge("building2", "text-fuchsia-700 dark:text-fuchsia-400")}
              </td>
              <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                {formatKRW(land.acquisitionPrice + bld1.acquisitionPrice + bld2.acquisitionPrice)}
              </td>
            </tr>
            {/* 필요경비 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">필요경비</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(land.necessaryExpense)}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(bld1.necessaryExpense)}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(bld2.necessaryExpense)}
                {/* 환산 파트만 개산공제(§163⑥)다 — 실가 파트는 실제 지출액(§97②1호). */}
                {bld2Estimated !== undefined && (
                  <span className="ml-1 text-micro text-muted-foreground">
                    {bld2Estimated ? "(개산공제 §163⑥)" : "(실제 필요경비)"}
                  </span>
                )}
              </td>
              <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                {formatKRW(land.necessaryExpense + bld1.necessaryExpense + bld2.necessaryExpense)}
              </td>
            </tr>
            {/* 양도차익 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 font-medium">양도차익</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap font-medium">{fmt(land.transferGain)}</td>
              <td className={`py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap font-medium ${bld1.transferGain < 0 ? "text-rose-700 dark:text-rose-400" : ""}`}>
                {fmt(bld1.transferGain)}
              </td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap font-medium">{fmt(bld2.transferGain)}</td>
              <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                {fmt(land.transferGain + bld1.transferGain + bld2.transferGain)}
              </td>
            </tr>
            {/* 장기보유공제 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground">장기보유공제</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">△{formatKRW(land.longTermHoldingDeduction)}</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                {bld1.longTermHoldingDeduction > 0 ? `△${formatKRW(bld1.longTermHoldingDeduction)}` : "0"}
              </td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap">
                {bld2.longTermHoldingDeduction > 0 ? `△${formatKRW(bld2.longTermHoldingDeduction)}` : "0"}
              </td>
              <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                △{formatKRW(land.longTermHoldingDeduction + bld1.longTermHoldingDeduction + bld2.longTermHoldingDeduction)}
              </td>
            </tr>
            {/* 양도소득금액 (통산 전) */}
            <tr className="border-b border-border/40 bg-muted/20">
              <td className="py-1 pr-2 font-medium">양도소득금액</td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap font-medium">{fmt(land.income)}</td>
              <td className={`py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap font-medium ${bld1.income < 0 ? "text-rose-700 dark:text-rose-400" : ""}`}>
                {fmt(bld1.income)}
              </td>
              <td className="py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap font-medium">{fmt(bld2.income)}</td>
              <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap font-semibold">
                {fmt(land.income + bld1.income + bld2.income)}
              </td>
            </tr>
            {/* 영 §102② 통산 흡수 */}
            <tr className="border-b border-border/40">
              <td className="py-1 pr-2 text-muted-foreground text-caption">
                결손 통산 (영§102②)
              </td>
              <td className={`py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap text-xs ${landOffsetCell.tone}`}>{landOffsetCell.text}</td>
              <td className={`py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap text-xs ${bld1OffsetCell.tone}`}>{bld1OffsetCell.text}</td>
              <td className={`py-1 pr-2 text-right font-mono tabular-nums whitespace-nowrap text-xs ${bld2OffsetCell.tone}`}>{bld2OffsetCell.text}</td>
              <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap text-xs text-muted-foreground">
                {netOffset === 0 ? "0" : netOffset > 0 ? `+${formatKRW(netOffset)}` : `△${formatKRW(-netOffset)}`}
              </td>
            </tr>
            {/* 통산 후 양도소득금액 */}
            <tr className="bg-muted/40 font-semibold">
              <td className="py-1.5 pr-2 text-sm">통산 후 양도소득금액</td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(land.incomeAfterOffset)}</td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(bld1.incomeAfterOffset)}</td>
              <td className="py-1.5 pr-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(bld2.incomeAfterOffset)}</td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(land.incomeAfterOffset + bld1.incomeAfterOffset + bld2.incomeAfterOffset)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {netOffset === 0 ? (
          <>
            양도소득금액 합계는 통산 전후 동일하지만,{" "}
            <strong>자산별 분포가 변경</strong>됩니다. 결손 자산의 손실이 나머지 자산의 양수에 흡수되어
            세율 적용 기준 양도소득금액이 자산 단위로 재분배됩니다 (영 §102②).
          </>
        ) : netOffset > 0 ? (
          <>
            결손 중 {formatKRW(netOffset)}은 <strong>함께 양도한 다른 자산</strong>의 양수 소득에 흡수되어, 이 표의 통산 후
            합계는 통산 전보다 그만큼 큽니다 (영 §102②).
          </>
        ) : (
          <>
            <strong>함께 양도한 다른 자산</strong>의 결손 {formatKRW(-netOffset)}을 이 물건이 흡수해, 이 표의 통산 후 합계는
            통산 전보다 그만큼 작습니다 (영 §102②).
          </>
        )}
      </p>
    </div>
  );
}
