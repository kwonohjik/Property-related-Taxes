"use client";

/**
 * 물납 안내 결과 카드 (상속세, 상증법 §73)
 *
 * 요건 충족(§73①) → 허용한도 min 산식 → 충당순서 6단계(§74②). 결정세액 미영향 투영.
 * 순수 엔진 derivePaymentInKindAssets + calcPaymentInKindAssessment 호출(단일 진실).
 * 설계: docs/02-design/features/inheritance-payment-in-kind.ui.design.md §3
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  calcPaymentInKindAssessment,
  derivePaymentInKindAssets,
} from "@/lib/tax-engine/credits/payment-in-kind";
import type {
  EstateItem,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";

export interface PaymentInKindCardProps {
  result: InheritanceTaxResult;
  estateItems: EstateItem[];
  decedentType?: "resident" | "non_resident";
  enabled: boolean;
  /** 관리·처분 부적당 제외액 (원) */
  ineligibleAmount: number;
  /** 희망 물납액 (원, 미입력 시 undefined) */
  requestedAmount?: number;
}

const cardWrap =
  "border border-sky-200 dark:border-sky-700 rounded-xl overflow-hidden";
const amountCell = "text-right font-mono tabular-nums whitespace-nowrap";
const divider = "border-t border-gray-100 dark:border-gray-700 pt-3";

function ReqRow({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={ok ? "text-emerald-600" : "text-rose-600"}>
        {ok ? "✓" : "✗"}
      </span>
      <span className="flex-1">
        <span className={ok ? "" : "text-rose-700 dark:text-rose-300"}>
          {label}
        </span>
        <span className="block text-[11px] text-gray-500">{detail}</span>
      </span>
    </div>
  );
}

export function PaymentInKindCard({
  result,
  estateItems,
  decedentType = "resident",
  enabled,
  ineligibleAmount,
  requestedAmount,
}: PaymentInKindCardProps) {
  if (!enabled) return null;

  const assets = derivePaymentInKindAssets(estateItems, result, ineligibleAmount);
  const data = calcPaymentInKindAssessment({
    finalTax: result.finalTax,
    grossEstateValue: result.grossEstateValue,
    exemptAmount: result.exemptAmount,
    priorGiftToHeirTotal: result.priorGiftToHeirTotal ?? 0,
    taxableEstateValue: result.taxableEstateValue,
    assets,
    requestedAmount,
  });
  const r = data.requirement;
  const filingMonths = decedentType === "non_resident" ? 9 : 6;

  return (
    <div className={cardWrap}>
      <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-3">
        <h4 className="text-sm font-medium text-sky-800 dark:text-sky-200">
          물납 안내 (상증법 §73)
        </h4>
        <p className="mt-0.5 text-xs text-sky-600 dark:text-sky-400">
          부동산·유가증권 물납 — 요건·허용한도·충당순서
        </p>
      </div>
      <div className="space-y-4 p-4">
        {/* 요건 */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
            요건 충족 (§73①)
          </p>
          <ReqRow
            ok={r.meetsOverHalf}
            label="부동산·유가증권 > 상속재산 1/2"
            detail={`${formatKRW(r.realEstateSecuritiesValue)} vs ${formatKRW(r.halfThreshold)} (요건1 §73①1호)`}
          />
          <ReqRow
            ok={r.meetsTaxOver20M}
            label="납부세액 > 2천만원"
            detail={`${formatKRW(result.finalTax)} (요건2 §73①2호)`}
          />
          <ReqRow
            ok={r.meetsTaxOverFinancial}
            label="납부세액 > 금융재산"
            detail={`${formatKRW(result.finalTax)} vs ${formatKRW(r.financialValue)} (요건3 §73①3호)`}
          />
          <p
            className={`text-xs font-medium ${data.eligible ? "text-sky-700 dark:text-sky-300" : "text-rose-700 dark:text-rose-300"}`}
          >
            → {data.eligible ? "물납 신청 가능" : "물납 요건 미충족"}
          </p>
        </div>

        {data.eligible && (
          <>
            {/* 허용한도 */}
            <div className={`space-y-1 ${divider}`}>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                물납 허용한도 (§73①, 적은 금액)
              </p>
              <div className="flex justify-between text-xs">
                <span>① 부동산·유가증권 안분세액</span>
                <span className={amountCell}>{formatKRW(data.limit1)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>② 납부세액 − 순금융 − 상장</span>
                <span className={amountCell}>{formatKRW(data.limit2)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-sky-700 dark:text-sky-300">
                <span>▶ 허용한도 = min(①,②)</span>
                <span className={amountCell}>{formatKRW(data.allowedLimit)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-gray-500">
                <span>· 비상장주식 별도한도(§73④, 기준=과세가액)</span>
                <span className={amountCell}>{formatKRW(data.unlistedStockCap)}</span>
              </div>
              {data.acceptedRequest != null && (
                <div className="flex justify-between text-xs">
                  <span>희망 물납액 반영(별지9호 물납란)</span>
                  <span className={amountCell}>
                    {formatKRW(data.acceptedRequest)}
                  </span>
                </div>
              )}
            </div>

            {/* 충당순서 */}
            <div className={`space-y-1 ${divider}`}>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                충당순서 (§74②, 정당사유 없는 한)
              </p>
              {data.fillOrder.map((s) => (
                <div key={s.order} className="flex justify-between text-xs">
                  <span>
                    {s.order} {s.label}
                    {s.note ? (
                      <span className="text-[10px] text-amber-600"> ※{s.note}</span>
                    ) : null}
                  </span>
                  <span className={amountCell}>
                    {s.availableValue > 0 ? formatKRW(s.availableValue) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 경고·안내 */}
        <div className={`space-y-1 text-[11px] text-gray-500 ${divider}`}>
          <p>
            ※ 물납 신청은 상속세 신고기한까지(상속개시월 말일 + {filingMonths}개월).
          </p>
          {data.warnings.map((w, i) => (
            <p key={i} className="text-amber-600">
              ※ {w}
            </p>
          ))}
          <p>실제 허가·수납가액은 관할 세무서 평가·세무사 확인을 권장합니다.</p>
        </div>
      </div>
    </div>
  );
}
