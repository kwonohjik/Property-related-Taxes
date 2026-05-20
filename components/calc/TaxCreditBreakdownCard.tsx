"use client";

/**
 * TaxCreditBreakdownCard — 세액공제 내역 카드 (#35)
 * 상속세·증여세 결과 화면에서 TaxCreditResult 표시
 *
 * §28·§69 산출근거 펼침 (gift-tax-credit-formula-display feature):
 *   - priorGiftCreditDetail + computedTax prop 전달 시 §28 펼침 활성화
 *   - credit.filingCreditBase + credit.totalComputedTaxWithSurcharge 둘 다 있을 때 §69 펼침 활성화
 *   - 상속세는 echo 미적용이라 §69 펼침 미렌더 (자동 비활성)
 */

import { useState } from "react";
import type {
  TaxCreditResult,
  PriorGiftCreditDetail,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

// ============================================================
// 금액 인라인 표시 — 라벨(한국어) + 값
// ============================================================

function Amt({ val }: { val: number }) {
  return <span className="font-mono">{val.toLocaleString()}</span>;
}

// ============================================================
// §28 산식 빌더 (priorGiftCreditDetail + computedTax)
//   상증법 §28: 증여세액공제 = Min(종전 증여재산에 대한 산출세액, 공제한도)
//   공제한도 = 산출세액 × (가산한 증여재산의 과세표준 ÷ 합산 후 과세표준)
// ============================================================

function buildSection28Formula(
  detail: PriorGiftCreditDetail,
  computedTax: number,
): React.ReactNode {
  const {
    priorComputedTax,
    priorAddedTaxBase,
    aggregatedTaxBase,
    creditLimit,
    priorPaidCredit,
  } = detail;

  return (
    <>
      <div>
        증여세액공제 = Min(종전 증여재산 산출세액, 공제한도)
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1">
        = Min(<Amt val={priorComputedTax} />, <Amt val={creditLimit} />) ={" "}
        <span className="font-semibold"><Amt val={priorPaidCredit} /></span>
      </div>
      {aggregatedTaxBase > 0 ? (
        <>
          <div className="text-gray-500 dark:text-gray-400 mt-1">
            공제한도 = 산출세액 × (가산한 증여재산 과세표준 ÷ 합산 후 과세표준)
          </div>
          <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500 dark:text-gray-400">
            = <Amt val={computedTax} /> × (<Amt val={priorAddedTaxBase} /> ÷{" "}
            <Amt val={aggregatedTaxBase} />) = <Amt val={creditLimit} />
          </div>
        </>
      ) : (
        <div className="text-rose-600 dark:text-rose-400">
          합산 후 과세표준이 0이므로 공제한도 산식 무효
        </div>
      )}
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
        ※ 산출세액은 세대생략 할증 전 금액
      </div>
    </>
  );
}

// ============================================================
// §69 산식 빌더 (filingCreditBase + totalComputedTaxWithSurcharge)
// ============================================================

function buildSection69Formula(credit: TaxCreditResult): React.ReactNode {
  const base = credit.filingCreditBase ?? 0;
  const totalWithSurcharge = credit.totalComputedTaxWithSurcharge ?? 0;
  const giftCredit = credit.giftTaxCredit;
  const foreign = credit.foreignTaxCredit;
  const special = credit.specialTreatmentCredit;
  const allOthersZero = foreign === 0 && special === 0;

  return (
    <>
      <div>
        신고세액공제 = 신고기한 내 신고분 세액 × 3%
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1">
        = <Amt val={base} /> × 3% ={" "}
        <span className="font-semibold"><Amt val={credit.filingCredit} /></span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500 dark:text-gray-400 mt-1">
        신고분 세액 = (산출세액 + 세대생략 할증) − 증여세액공제
        {foreign > 0 && <> − 외국납부세액공제</>}
        {special > 0 && <> − 조특 특례공제</>}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500 dark:text-gray-400">
        = <Amt val={totalWithSurcharge} /> − <Amt val={giftCredit} />
        {foreign > 0 && <> − <Amt val={foreign} /></>}
        {special > 0 && <> − <Amt val={special} /></>}
        {" "}= <Amt val={base} />
      </div>
      {allOthersZero && (
        <div className="text-[10px] text-gray-400 dark:text-gray-500">
          (외국납부·조특 특례 미적용)
        </div>
      )}
      {special > 0 && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400">
          ※ 조특 특례 절감 분 차감 후 3% 적용
        </div>
      )}
    </>
  );
}

// ============================================================
// CreditRow — formula prop으로 산출근거 펼침 토글 지원
// ============================================================

interface CreditRowProps {
  label: string;
  amount: number;
  lawRef?: string;
  highlight?: boolean;
  /** 산출근거 산식 (펼침). undefined 시 펼침 토글 미렌더 — 기존 동작 100% 보존 */
  formula?: React.ReactNode;
}

function CreditRow({ label, amount, lawRef, highlight, formula }: CreditRowProps) {
  const [expanded, setExpanded] = useState(false);
  if (amount === 0) return null;
  return (
    <div className="space-y-1">
      <div
        className={`flex items-center justify-between py-2 px-3 rounded-md ${
          highlight
            ? "bg-emerald-50 dark:bg-emerald-900/20 font-semibold"
            : "bg-gray-50 dark:bg-gray-800"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-sm ${
              highlight
                ? "text-emerald-800 dark:text-emerald-200"
                : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {label}
          </span>
          {lawRef && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{lawRef}</span>
          )}
          {formula && (
            <button
              type="button"
              onClick={() => setExpanded((p) => !p)}
              className="text-[10px] text-gray-500 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
              aria-expanded={expanded}
              aria-label={`${label} 산출근거 ${expanded ? "닫기" : "펼치기"}`}
            >
              {expanded ? "▼ 산출근거" : "▶ 산출근거"}
            </button>
          )}
        </div>
        <span
          className={`font-mono text-sm ${
            highlight
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-blue-600 dark:text-blue-400"
          }`}
        >
          - {amount.toLocaleString()}
        </span>
      </div>
      {expanded && formula && (
        <div className="ml-3 px-3 py-2 text-[11px] text-gray-600 dark:text-gray-400 bg-gray-50/60 dark:bg-gray-900/40 rounded-md space-y-1">
          {formula}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 카드
// ============================================================

export interface TaxCreditBreakdownCardProps {
  credit: TaxCreditResult;
  /** 세액공제 전 세액 (공제 효과 계산용) */
  taxBeforeCredit: number;
  /** §28 산식 노출용 — GiftTaxResult.priorGiftCreditDetail (미전달 시 §28 펼침 미표시) */
  priorGiftCreditDetail?: PriorGiftCreditDetail | null;
  /** §28 산식 ⑦(할증 전) — GiftTaxResult.computedTax (미전달 시 §28 펼침 미표시) */
  computedTax?: number;
}

export function TaxCreditBreakdownCard({
  credit,
  taxBeforeCredit,
  priorGiftCreditDetail,
  computedTax,
}: TaxCreditBreakdownCardProps) {
  if (credit.totalCredit === 0) return null;

  const creditRate =
    taxBeforeCredit > 0
      ? ((credit.totalCredit / taxBeforeCredit) * 100).toFixed(1)
      : "0";

  // §28 산식 활성 조건: priorGiftCreditDetail + computedTax 모두 전달 시
  const section28Formula =
    priorGiftCreditDetail && computedTax !== undefined
      ? buildSection28Formula(priorGiftCreditDetail, computedTax)
      : undefined;

  // §69 산식 활성 조건: echo 두 필드 모두 존재 시 (상속세 호출은 undefined → 펼침 미렌더)
  const section69Formula =
    credit.filingCreditBase !== undefined &&
    credit.totalComputedTaxWithSurcharge !== undefined
      ? buildSection69Formula(credit)
      : undefined;

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
          세액공제 내역
        </h4>
        <div className="text-right">
          <p className="text-base font-bold text-blue-700 dark:text-blue-300">
            - {formatKRW(credit.totalCredit)}
          </p>
          <p className="text-xs text-blue-500 dark:text-blue-400">
            세액 대비 {creditRate}% 절감
          </p>
        </div>
      </div>

      {/* 공제 항목 */}
      <div className="p-3 space-y-2">
        <CreditRow
          label="증여세액공제"
          amount={credit.giftTaxCredit}
          lawRef="§28"
          formula={section28Formula}
        />
        <CreditRow
          label="외국납부세액공제"
          amount={credit.foreignTaxCredit}
          lawRef="§29 / §59"
        />
        <CreditRow
          label="단기재상속공제"
          amount={credit.shortTermReinheritCredit}
          lawRef="§30"
        />
        <CreditRow
          label="신고세액공제 (3%)"
          amount={credit.filingCredit}
          lawRef="§69"
          formula={section69Formula}
        />
        <CreditRow
          label="조특법 과세특례 (창업·가업)"
          amount={credit.specialTreatmentCredit}
          lawRef="조특 §30의5·§30의6"
        />
        <CreditRow
          label="세액공제 합계"
          amount={credit.totalCredit}
          highlight
        />
      </div>

      {/* 근거 조문 배지 */}
      {credit.appliedLaws.length > 0 && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {credit.appliedLaws.map((law) => (
            <span
              key={law}
              className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
            >
              {law}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
