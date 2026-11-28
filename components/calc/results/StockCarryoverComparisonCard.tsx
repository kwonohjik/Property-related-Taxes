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
 *
 * ## variant (계획서 foreign-stock-carryover-97-2 Q-11)
 * - `domestic`(기본) — 종전 출력 **불변**.
 * - `foreign` — 국외주식(§94①3호다목). §104②가 12호를 열거하지 않아 이월과세는 **필요경비만** 바꾼다 —
 *   「세율 보유기간도 증여자 취득일부터」 문장을 쓰지 않고, 취득가액은 1주당이 아니라 **원화 환산 총액**
 *   (증여자 취득일 환율)으로 보인다. 숫자 끝 「원」 표기를 쓰지 않는다(국외 결과 카드 규칙).
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { ForeignCarryoverDetail } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { fmtRate } from "@/components/calc/foreign/fx-formula";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export type CarryoverCardVariant = "domestic" | "foreign";

const wonSuffix = (n: number) => `${n.toLocaleString()}원`;
const plain = (n: number) => n.toLocaleString();

/** 금액 셀 — 천·백만 콤마 세로 정렬(금액 칼럼 규칙) */
function Amount({
  value,
  strong,
  fmt,
}: {
  value: number;
  strong?: boolean;
  fmt: (n: number) => string;
}) {
  return (
    <td
      className={`px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap ${
        strong ? "font-semibold" : ""
      }`}
    >
      {fmt(value)}
    </td>
  );
}

/** JSON 왕복 뒤에는 문자열이다 — Date·ISO 문자열 모두 받는다 */
const ymd = (d: Date | string | undefined) =>
  d === undefined ? undefined : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

export function StockCarryoverComparisonCard({
  detail,
  variant = "domestic",
  foreignCarryover,
  itemLabel,
  comparisonPerformed,
}: {
  detail: NonNullable<StockTransferResult["carryoverDetail"]>;
  /** `foreign` — 국외주식 변형(위 머리말) */
  variant?: CarryoverCardVariant;
  /** 국외 전용 echo — 취득가액 원화 환산 A/B · 증여자 취득일 환율 */
  foreignCarryover?: ForeignCarryoverDetail;
  /** 다건 결과에서 어느 종목의 카드인지 (예: 「종목 2 (§94①3 다목 …)」) */
  itemLabel?: string;
  /**
   * 비교를 **실제로 수행했는지**. 엔진은 게이트에서 탈락한 선언 종목도 `outcome:"excluded"` + 두 세액 0으로
   * 보낸다 — 0원 비교표를 그리지 않으려면 호출부가 `carryoverComparison` 유무로 알려야 한다.
   * 미지정이면 두 세액 중 하나라도 0보다 큰지로 판정한다(국내 종전 규칙).
   */
  comparisonPerformed?: boolean;
}) {
  const foreign = variant === "foreign";
  const fmt = foreign ? plain : wonSuffix;
  const applied = detail.outcome === "applied";
  const diff = detail.appliedTotalTax - detail.excludedTotalTax;
  const hasComparison = comparisonPerformed ?? (detail.appliedTotalTax > 0 || detail.excludedTotalTax > 0);
  const fc = foreignCarryover;
  const donorDate = ymd(fc?.donorAcquisitionDate);

  return (
    <ToneCard
      tone="violet"
      title={`${itemLabel ? `${itemLabel} · ` : ""}§97의2① 이월과세 — 적용 / 미적용 비교`}
      titleExtra={
        <LawArticleModal
          legalBasis="소득세법 제97조의2"
          label="§97의2"
          className="px-2 py-0.5 rounded-full border text-micro bg-violet-100 text-violet-700 border-violet-200 font-medium"
        />
      }
      bodyClassName="space-y-3"
    >
      <p className="text-xs text-violet-800 dark:text-violet-200">
        {foreign ? (
          applied ? (
            <>
              <strong>이월과세를 적용</strong>했습니다. 취득가액을 증여자가 취득할 당시의 금액(증여자 취득일
              기준환율로 환산)으로 승계하고, 증여자 자본적지출과 증여세 상당액을 필요경비에 산입합니다.
            </>
          ) : hasComparison ? (
            <>
              <strong>이월과세를 적용하지 않았습니다.</strong> 적용했을 때의 결정세액이 더 적어 §97의2②3호로
              배제되었습니다. 취득가액은 증여받은 날의 평가액입니다.
            </>
          ) : (
            <>
              <strong>이월과세를 적용하지 않았습니다.</strong> §97의2① 요건(증여받은 날과 양도일의 기간·증여자와의
              관계·입력 값 등)을 충족하지 않아 적용 여부를 비교하지 않았습니다. 취득가액은 증여받은 날의
              평가액입니다.
            </>
          )
        ) : applied ? (
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
              <tr className="border-b border-violet-200 text-violet-700 dark:text-violet-300">
                <th className="px-3 py-2 text-left font-semibold">구분</th>
                <th className="px-3 py-2 text-right font-semibold">
                  적용(①){applied && " ← 채택"}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  미적용{!applied && " ← 채택"}
                </th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-300">
              {foreign &&
                fc?.donorAcquisitionPriceKrw !== undefined &&
                fc.giftDateAcquisitionPriceKrw !== undefined && (
                  <tr className="border-b border-violet-100">
                    <td className="px-3 py-2">
                      취득가액 (원화 환산)
                      {donorDate && fc.donorExchangeRate !== undefined && (
                        <span className="block text-caption text-violet-700 dark:text-violet-400">
                          적용: 증여자 취득일 {donorDate} 기준환율 {fmtRate(fc.donorExchangeRate)}
                          {fc.donorAcquisitionCurrencyCode ? ` (${fc.donorAcquisitionCurrencyCode})` : ""}
                        </span>
                      )}
                    </td>
                    <Amount value={fc.donorAcquisitionPriceKrw} fmt={fmt} />
                    <Amount value={fc.giftDateAcquisitionPriceKrw} fmt={fmt} />
                  </tr>
                )}
              {!foreign &&
                detail.donorAcquisitionPricePerShare !== undefined &&
                detail.giftDateValuationPerShare !== undefined && (
                  <tr className="border-b border-violet-100">
                    <td className="px-3 py-2">
                      1주당 취득가액
                      {detail.donorAcquisitionMethod === "sale_case" && (
                        <span className="block text-caption text-violet-700 dark:text-violet-400">
                          적용: 증여자 취득일 전후 3개월 매매사례가액 (시행령 §176의2③1호)
                        </span>
                      )}
                    </td>
                    <Amount value={detail.donorAcquisitionPricePerShare} fmt={fmt} />
                    <Amount value={detail.giftDateValuationPerShare} fmt={fmt} />
                  </tr>
                )}
              {detail.donorCapexIncluded > 0 && (
                <tr className="border-b border-violet-100">
                  <td className="px-3 py-2">증여자 자본적지출 산입 (①2호)</td>
                  <Amount value={applied ? detail.donorCapexIncluded : 0} fmt={fmt} />
                  <Amount value={0} fmt={fmt} />
                </tr>
              )}
              {detail.giftTaxIncluded > 0 && (
                <tr className="border-b border-violet-100">
                  <td className="px-3 py-2">증여세 상당액 산입 (①3호)</td>
                  <Amount value={applied ? detail.giftTaxIncluded : 0} fmt={fmt} />
                  <Amount value={0} fmt={fmt} />
                </tr>
              )}
              <tr className="bg-violet-100/60 dark:bg-violet-900/40">
                <td className="px-3 py-2 font-semibold">
                  전체 결정세액 <span className="font-normal">(비교 기준)</span>
                </td>
                <Amount value={detail.appliedTotalTax} strong={applied} fmt={fmt} />
                <Amount value={detail.excludedTotalTax} strong={!applied} fmt={fmt} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {hasComparison && (
        <p className="text-caption text-violet-700 dark:text-violet-300">
          {diff === 0
            ? "두 결정세액이 같습니다 — §97의2②3호는 「적은 경우」에만 배제하므로 적용을 유지합니다."
            : diff > 0
              ? `적용 시 결정세액이 ${fmt(diff)} 많아 배제 사유(§97의2②3호)에 해당하지 않습니다.`
              : `적용 시 결정세액이 ${fmt(-diff)} 적어 §97의2②3호로 배제했습니다.`}
        </p>
      )}
      {/* 국내는 종전대로 항상 표시(출력 불변). 국외는 비교표가 있을 때만 — 0원 비교를 설명하는 문장이 되지 않게 */}
      {(!foreign || hasComparison) && (
        <p className="text-caption text-slate-600 dark:text-slate-400">
          {foreign ? (
            <>
              ※ 위 두 세액은 이 종목의 이월과세만 적용·미적용으로 바꾼 <strong>전체 결정세액</strong>입니다 —
              §97의2②3호가 「양도소득 결정세액」을 견주기 때문입니다.
            </>
          ) : (
            <>
              ※ 위 두 세액은 이 종목만의 세액이 아니라 <strong>같은 과세기간 전체의 결정세액</strong>
              입니다 — §97의2②3호가 「양도소득 결정세액」을 견주기 때문입니다.
            </>
          )}
        </p>
      )}
    </ToneCard>
  );
}
