"use client";

/**
 * §97의2① 이월과세 — 시나리오 A/B 비교 카드
 *
 * 「왜 이 세액인가」를 결과 계층이 스스로 설명하게 한다. 시나리오 B가 채택되면 엔진 입력의
 * `acquisitionCause`가 `"purchase"`로 되돌아가기 때문에, 이 카드가 없으면 **비교가 있었다는
 * 사실 자체가 결과에서 사라진다**.
 *
 * ⚠️ 나란히 놓는 두 세액은 **이 종목의 세액이 아니라 전체(그룹 합산) 결정세액**이다.
 * 소득세법 §97의2②3호가 견주는 대상이 「양도소득 **결정세액**」(§92 계산순서를 거친
 * 과세기간 단위 개념)이기 때문이다 — 종목 세액을 보여 주면 사용자가 차액을 검산할 수 없다.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

const won = (n: number) => `${n.toLocaleString()}원`;

/** 금액 셀 — 천·백만 콤마 세로 정렬(금액 칼럼 규칙) */
function Amount({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <td
      className={`px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap ${
        strong ? "font-semibold" : ""
      }`}
    >
      {won(value)}
    </td>
  );
}

export function StockCarryoverComparisonCard({
  detail,
}: {
  detail: NonNullable<StockTransferResult["carryoverDetail"]>;
}) {
  const applied = detail.outcome === "applied";
  const diff = detail.appliedTotalTax - detail.excludedTotalTax;
  const hasComparison = detail.appliedTotalTax > 0 || detail.excludedTotalTax > 0;

  return (
    <ToneCard
      tone="violet"
      title="§97의2① 이월과세 — 적용 / 미적용 비교"
      titleExtra={
        <LawArticleModal
          legalBasis="소득세법 제97조의2"
          label="§97의2"
          className="px-2 py-0.5 rounded-full border text-micro bg-violet-100 text-violet-700 border-violet-200 font-medium"
        />
      }
      bodyClassName="space-y-3"
    >
      <p className="text-xs text-violet-800">
        {applied ? (
          <>
            <strong>이월과세를 적용</strong>했습니다. 취득가액을 증여자가 취득할 당시의 금액으로
            승계하고, 세율 보유기간도 증여자 취득일부터 계산합니다(§104②2호).
          </>
        ) : (
          <>
            <strong>이월과세를 적용하지 않았습니다.</strong> 적용했을 때의 결정세액이 더 적어
            §97의2②3호로 배제되었거나, §97의2① 요건을 충족하지 않습니다. 취득가액은 증여 당시
            평가액이고 세율 보유기간도 증여받은 날부터 계산합니다.
          </>
        )}
      </p>

      {hasComparison && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-violet-200 text-violet-700">
                <th className="px-3 py-2 text-left font-semibold">구분</th>
                <th className="px-3 py-2 text-right font-semibold">
                  적용(①){applied && " ← 채택"}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  미적용{!applied && " ← 채택"}
                </th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {detail.donorAcquisitionPricePerShare !== undefined &&
                detail.giftDateValuationPerShare !== undefined && (
                  <tr className="border-b border-violet-100">
                    <td className="px-3 py-2">1주당 취득가액</td>
                    <Amount value={detail.donorAcquisitionPricePerShare} />
                    <Amount value={detail.giftDateValuationPerShare} />
                  </tr>
                )}
              {detail.donorCapexIncluded > 0 && (
                <tr className="border-b border-violet-100">
                  <td className="px-3 py-2">증여자 자본적지출 산입 (①2호)</td>
                  <Amount value={applied ? detail.donorCapexIncluded : 0} />
                  <Amount value={0} />
                </tr>
              )}
              {detail.giftTaxIncluded > 0 && (
                <tr className="border-b border-violet-100">
                  <td className="px-3 py-2">증여세 상당액 산입 (①3호)</td>
                  <Amount value={applied ? detail.giftTaxIncluded : 0} />
                  <Amount value={0} />
                </tr>
              )}
              <tr className="bg-violet-100/60">
                <td className="px-3 py-2 font-semibold">
                  전체 결정세액 <span className="font-normal">(비교 기준)</span>
                </td>
                <Amount value={detail.appliedTotalTax} strong={applied} />
                <Amount value={detail.excludedTotalTax} strong={!applied} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {hasComparison && (
        <p className="text-caption text-violet-700">
          {diff === 0
            ? "두 결정세액이 같습니다 — §97의2②3호는 「적은 경우」에만 배제하므로 적용을 유지합니다."
            : diff > 0
              ? `적용 시 결정세액이 ${won(diff)} 많아 배제 사유(§97의2②3호)에 해당하지 않습니다.`
              : `적용 시 결정세액이 ${won(-diff)} 적어 §97의2②3호로 배제했습니다.`}
        </p>
      )}
      <p className="text-caption text-slate-500">
        ※ 위 두 세액은 이 종목만의 세액이 아니라 <strong>같은 과세기간 전체의 결정세액</strong>
        입니다 — §97의2②3호가 「양도소득 결정세액」을 견주기 때문입니다.
      </p>
    </ToneCard>
  );
}
