"use client";

/**
 * BurdenedTransferTaxResultCard — 부담부증여 양도소득세 결과 카드
 *
 * 설계: docs/02-design/features/gift-burdened-transfer-tax.ui.design.md §4
 * 위치: GiftTaxResultView.tsx — 최종 납부세액 합산 이후 삽입
 *
 * 규칙:
 *   - feedback_result_view_korean_formula: 변수 약어·floor() 금지, 한국어 법정 용어
 *   - feedback_no_won_suffix: 숫자 끝 "원" 생략
 *   - feedback_result_expand_toggle_standard: ExpandToggleButton (sky tone)
 *   - feedback_tailwind_static_tone_mapping: 정적 클래스 (동적 ${tone} 금지)
 *   - feedback_no_internal_id_in_result: 내부 id 노출 금지
 */

import { useState } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { CalculationWarningsCard } from "@/components/calc/results/shared/CalculationWarningsCard";
import { PartialExemptBasisCard } from "@/components/calc/results/shared/PartialExemptBasisCard";
import { FalseContractPriceNotice } from "@/components/calc/results/shared/FalseContractPriceNotice";
import { highValueThresholdForDisplay } from "@/lib/calc/high-value-threshold-display";
import { burdenedGiftTransferPrice } from "@/lib/calc/burdened-gift-transfer-price-scope";
import { BurdenedTransferPreDeemedLines } from "./BurdenedTransferPreDeemedLines";

// ─── 행 컴포넌트 ─────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  sub = false,
  highlight = false,
  deduction = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
  deduction?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${
        highlight ? "bg-muted/50 font-semibold" : ""
      } ${sub ? "pl-7" : ""}`}
    >
      <span className={sub ? "text-xs text-muted-foreground" : "text-sm"}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums text-sm text-right ${
          deduction ? "text-blue-700 dark:text-blue-400" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── 단건 카드 ────────────────────────────────────────────────────────────────

function SingleTransferResultCard({
  result,
  index,
  transferDate,
  notices,
}: {
  result: TransferTaxResult;
  index: number;
  /** 부담부증여 양도일(= 증여일) — 소득세법 §91② 고지의 시행일 게이트. 없으면 고지를 거두지 않는다. */
  transferDate?: string | undefined;
  /** 증여 화면 전용 고지(1세대 토글 OFF 등 — 엔진 경고가 아니다). 엔진 경고 앞에 같은 공용 카드로 보인다. */
  notices?: string[];
}) {
  const shownWarnings = [...(notices ?? []), ...(result.warnings ?? [])];
  const [detailOpen, setDetailOpen] = useState(false);

  const title =
    index === 0
      ? "부담부증여 양도소득세 (채무인수분)"
      : `부담부증여 양도소득세 ${index + 1}번째 자산`;

  if (result.isExempt) {
    return (
      <div className="border border-sky-200 dark:border-sky-700 rounded-xl overflow-hidden">
        <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-200">
            {title}
          </h4>
          <span className="text-xs text-sky-700 dark:text-sky-300">
            비과세
          </span>
        </div>
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {result.exemptReason ?? "1세대 1주택 비과세 요건을 충족합니다."}
        </div>
        {/* 비과세 결론과 함께 엔진 경고(§155㉓ 기한 · §154⑤ 판정 보류 · 확인 필요)를 보여 준다(1h-G1-8) — 종전에는 이
            조기 return이 경고를 버려 「비과세의 전제」가 사라지고 무조건 비과세로 읽혔다. */}
        <CalculationWarningsCard warnings={shownWarnings} className="m-4 mt-0" />
        {/* 소득세법 §91② 범위 밖 고지 (결정 #48) — 부담부증여도 빼지 않는다(매수인 쪽 적용 여부 미확인). */}
        <FalseContractPriceNotice
          transferDate={transferDate}
          isExempt={result.isExempt}
          className="mx-4 mb-4"
        />
      </div>
    );
  }

  // 세율 표시 — 누진세율은 %
  const rateDisplay = `${(result.appliedRate * 100).toFixed(0)}%`;

  return (
    <div className="border border-sky-200 dark:border-sky-700 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-200">
          {title}
        </h4>
        <ExpandToggleButton
          open={detailOpen}
          onClick={() => setDetailOpen((p) => !p)}
          tone="sky"
        />
      </div>

      {/* 엔진 경고 · 부분 비과세(고가주택) 근거 — 접힌 상세 안이 아니라 결론과 함께 보인다(1h-G1-8).
          경고는 비과세 분기(위)와 같은 공용 카드이고, 부분 비과세 사유는 양도세 결과뷰와 같은 카드다. */}
      <CalculationWarningsCard warnings={shownWarnings} className="m-4 mb-0" />
      <PartialExemptBasisCard
        result={result}
        priceLabel="증여가액"
        fallbackThresholdLabel={highValueThresholdForDisplay(undefined).label}
        className="m-4 mb-0"
      />
      {/* 소득세법 §91② 범위 밖 고지 (결정 #48) — 부분 비과세·감면 결과. */}
      <FalseContractPriceNotice
        transferDate={transferDate}
        isPartialExempt={result.isPartialExempt}
        reductionAmount={result.reductionAmount}
        className="m-4 mb-0"
      />

      {/* 최종 납부세액 요약 */}
      <div className="divide-y divide-border">
        {/* 양도가액·취득가액·필요경비 (소령 §159①1호 채무액 안분 후 — 채무인수분) */}
        {(() => {
          const brkd = result.transferBurdenedGiftBreakdown;
          if (!brkd) return null;
          const land = brkd.perAsset.land;
          const bldg = brkd.perAsset.building;
          const transferPrice = burdenedGiftTransferPrice(brkd);
          const acquisitionPrice =
            (land?.acquisitionPrice ?? 0) + (bldg?.acquisitionPrice ?? 0);
          const necessaryExpense =
            (land?.estimatedDeduction ?? 0) + (bldg?.estimatedDeduction ?? 0);
          /**
           * §97②2호 **단서**(W-6) 발동 시 취득가액 슬롯은 **0**이다 — 나목이 필요경비 **전체**라
           * 환산취득가액을 별도 차감하지 않기 때문이다. 그대로 「취득가액 0」으로 두면 사용자가
           * **계산이 빠진 것으로 읽는다** ⇒ 스왑 전 환산취득가액을 「차감 제외」 라벨로 보여준다
           * (주식양도세 `StockTransferTaxResultView.tsx:318`과 같은 규약).
           */
          const swap = brkd.necessaryExpenseSwap;
          const swapApplied = swap?.chosen === "direct";
          const beforeSwap = brkd.convertedAcquisitionBeforeSwap;
          const shownAcquisition = swapApplied
            ? (beforeSwap?.land ?? 0) + (beforeSwap?.building ?? 0)
            : acquisitionPrice;
          return (
            <>
              <Row label="양도가액 (채무인수분)" value={formatKRW(transferPrice)} />
              <Row
                label={
                  swapApplied
                    ? "취득가액 (환산 — 차감 제외)"
                    : "취득가액 (채무인수분)"
                }
                value={swapApplied ? formatKRW(shownAcquisition) : `(−) ${formatKRW(acquisitionPrice)}`}
                sub
                deduction={!swapApplied}
              />
              <Row
                label={swapApplied ? "필요경비 (자본·양도비 §97②단서)" : "필요경비"}
                value={`(−) ${formatKRW(necessaryExpense)}`}
                sub
                deduction
              />
            </>
          );
        })()}
        <Row label="양도차익" value={formatKRW(result.transferGain)} />
        <Row
          label="과세 양도차익"
          value={formatKRW(result.taxableGain)}
          sub
        />
        {result.longTermHoldingDeduction > 0 && (
          <Row
            label={`장기보유특별공제 (${(result.longTermHoldingRate * 100).toFixed(0)}%)`}
            value={`(−) ${formatKRW(result.longTermHoldingDeduction)}`}
            sub
            deduction
          />
        )}
        {result.basicDeduction > 0 && (
          <Row
            label="양도소득기본공제 (§103①1호)"
            value={`(−) ${formatKRW(result.basicDeduction)}`}
            sub
            deduction
          />
        )}
        <Row label="양도소득 과세표준" value={formatKRW(result.taxBase)} highlight />
        <Row
          label={`산출세액 (세율 ${rateDisplay})`}
          value={formatKRW(result.calculatedTax)}
        />
        {result.reductionAmount > 0 && (
          <Row
            label="감면세액"
            value={`(−) ${formatKRW(result.reductionAmount)}`}
            deduction
          />
        )}
        <Row label="결정세액" value={formatKRW(result.determinedTax)} highlight />
        {result.penaltyTax > 0 && (
          <Row
            label="감정가액 또는 환산취득가액 적용 가산세 (§114조의2①)"
            value={formatKRW(result.penaltyTax)}
            sub
          />
        )}
        <Row
          label={
            result.penaltyTax > 0
              ? "지방소득세 ((결정세액+가산세) × 10%)"
              : "지방소득세 (10%)"
          }
          value={formatKRW(result.localIncomeTax)}
          sub
        />
        <Row
          label="총 납부세액"
          value={formatKRW(result.totalTax)}
          highlight
        />
      </div>

      {/**
       * §97②2호 단서 비교 결과 — **K-5(환산취득가액)에서만** 채워진다(W-6·W-7).
       * 발동/미발동을 **둘 다** 보여준다. 미발동을 숨기면 「비교를 했는지」 자체가 안 보여
       * 사용자가 자본적지출을 넣고도 반영이 안 됐다고 읽는다.
       */}
      {(() => {
        const swap = result.transferBurdenedGiftBreakdown?.necessaryExpenseSwap;
        if (!swap) return null;
        if (swap.chosen === "direct") {
          return (
            <div
              data-testid="burdened-97-2-proviso"
              className="border-t border-amber-300 bg-amber-50/60 px-4 py-3 text-sm space-y-1 dark:bg-amber-950/40"
            >
              <p className="font-semibold text-amber-900 dark:text-amber-200">
                필요경비 택일 적용 — 「소득세법」 제97조 제2항 제2호 단서
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                환산취득가액 + 개산공제 {formatKRW(swap.estimatedSide)}
                {" < "}자본적지출 + 양도비 {formatKRW(swap.directSide)}
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-200">
                → 자본적지출 + 양도비 {formatKRW(swap.directSide)}을 필요경비로 적용합니다.
                이 경우 환산취득가액은 <span className="font-medium">별도로 차감하지 않습니다</span>
                (두 금액은 필요경비 전체를 놓고 택일하는 관계).
              </p>
            </div>
          );
        }
        return (
          <div
            data-testid="burdened-97-2-proviso"
            className="border-t border-border bg-muted/20 px-4 py-2 text-xs text-muted-foreground"
          >
            「소득세법」 제97조 제2항 제2호 본문 적용 — 환산취득가액 + 개산공제{" "}
            {formatKRW(swap.estimatedSide)} ≥ 자본적지출 + 양도비 {formatKRW(swap.directSide)}
            (단서 미발동)
          </div>
        );
      })()}

      {/*
        상세 펼침 — §159 안분비율 + 산식.

        🔴 **조건부 언마운트 금지** (2026-09-07 UI 리뷰). `ExpandToggleButton`은 버튼에
           `print:hidden`을 걸고 본문은 `hidden print:block`으로 남기는 것을 전제한다
           (`shared/ExpandToggleButton.tsx:8`). 종전에는 접힘 상태(기본값)에서 DOM이 아예 없어,
           **손으로 펼치지 않고 인쇄하면** §159①1호 안분비율·취득가액 산정 경로(K-1~K-5)·
           장특공제·산출세액 산식이 출력물에서 통째로 빠졌다. 특히 `result.warnings`가
           이 블록 안에만 있어 다주택 중과 안내 등 **엔진 경고까지 사라졌다**
           (1h-G1-8 — 지금은 경고를 결론 쪽 공용 카드로 올려 접힌 상세에는 두지 않는다).
      */}
      <div
        className={
          (detailOpen ? "block" : "hidden print:block") +
          " border-t border-sky-200 dark:border-sky-700 bg-sky-50/30 dark:bg-sky-900/10 px-4 py-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-300"
        }
      >
          <p className="font-semibold text-sky-700 dark:text-sky-300 mb-1">
            산식 상세 (소령 §159①1호 안분)
          </p>
          <p>
            채무인수분은 소득세법 §88에 따라 유상양도로 봅니다.
            취득가액·양도가액은 소령 §159①1호에 따라{" "}
            <span className="font-medium">
              <Frac top="채무액" bottom="증여재산가액" />
            </span>{" "}
            비율로 안분합니다.
          </p>
          {/* 취득가액 산정 경로 — 3경로 표시 */}
          {(() => {
            const brkd = result.transferBurdenedGiftBreakdown;
            const method = brkd?.acquisitionMethodUsed;
            const land = brkd?.perAsset.land;
            const bldg = brkd?.perAsset.building;
            const deductionTotal =
              (land?.estimatedDeduction ?? 0) + (bldg?.estimatedDeduction ?? 0);

            // 의제취득일(1985.1.1.) 전 상속 — 엔진이 3자 max·의제취득일 기준시가로 정했다(PR-7b-3 · S-1). 산정방식 문구로 그리면 ② 채택도 K-4로 보인다.
            if (brkd?.preDeemed) return <BurdenedTransferPreDeemedLines brkd={brkd} />;

            if (method === "actual") {
              return (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  ※ 취득가액 산정: 실지취득가액 × <Frac top="채무" bottom="시가" /> (소령 §159①1호 본문 — K-4)
                  {deductionTotal > 0
                    ? ` / 자본적 지출·양도비 ${formatKRW(deductionTotal)}`
                    : ""}
                </p>
              );
            }
            if (method === "converted") {
              // §97②2호 단서 발동 시 필요경비는 개산공제가 **아니라** 자본적지출+양도비다(W-6).
              const provisoApplied = brkd?.necessaryExpenseSwap?.chosen === "direct";
              return (
                <p className="mt-1 text-sky-700 dark:text-sky-300">
                  ※ 취득가액 산정: <Frac top="취득시 기준시가" bottom="양도시 기준시가" /> × 시가 (소령
                  §176의2②2호 — K-5)
                  {provisoApplied
                    ? ` / 필요경비는 자본적지출 + 양도비 ${formatKRW(deductionTotal)} (「소득세법」 제97조 제2항 제2호 단서)`
                    : deductionTotal > 0
                      ? ` + 개산공제 ${formatKRW(deductionTotal)} (「소득세법 시행령」 제163조 제6항)`
                      : " + 「소득세법 시행령」 제163조 제6항 개산공제 적용"}
                </p>
              );
            }
            if (method === "salesCase" || method === "appraisal") {
              // K-6/K-7 — 필요경비는 개산공제뿐이다(§97②2호 · 실비 택일은 환산 전용).
              const label = method === "appraisal" ? "감정가액" : "매매사례가액";
              const decreeItem = method === "appraisal" ? "2호" : "1호";
              return (
                <p className="mt-1 text-amber-700 dark:text-amber-300">
                  ※ 취득가액 산정: {label} × <Frac top="채무" bottom="시가" /> (소득세법 §97①1호나목 · 시행령 §176의2③{decreeItem})
                  {deductionTotal > 0
                    ? ` / 필요경비는 개산공제 ${formatKRW(deductionTotal)} (취득시 기준시가 × 채무비율 × 개산공제율, 「소득세법 시행령」 제163조 제6항) — 자본적지출·양도비는 공제하지 않습니다`
                    : " / 필요경비는 「소득세법 시행령」 제163조 제6항 개산공제만 인정합니다"}
                </p>
              );
            }
            // standard_price 또는 미확인(구버전 결과)
            return (
              <p className="mt-1">
                취득가액 산정: 취득시 기준시가 × <Frac top="채무" bottom="증여재산 기준시가" /> (소령 §159①1호 괄호 —
                K-1~K-3)
              </p>
            );
          })()}
          <p className="mt-1">
            장기보유특별공제:{" "}
            {result.longTermHoldingDeduction > 0
              ? `과세 양도차익 × ${(result.longTermHoldingRate * 100).toFixed(0)}%`
              : "해당 없음"}
          </p>
          <p>
            산출세액: 과세표준 × {rateDisplay}
            {result.progressiveDeduction > 0
              ? ` − 누진공제 ${formatKRW(result.progressiveDeduction)}`
              : ""}
          </p>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

interface Props {
  transferTaxResults: TransferTaxResult[];
  /** 부담부증여 양도일(= 증여일, YYYY-MM-DD) — 소득세법 §91② 고지의 시행일 게이트 */
  transferDate?: string | undefined;
  /**
   * 첫 번째 자산(증여세 마법사는 부담부증여 양도세를 자산 1건에만 켠다)에 붙이는 증여 화면 전용 고지 —
   * 1세대 토글 OFF가 결론을 가를 때(`giftBurdenedNotOneHouseholdNotice`). 엔진 경고로 넣지 않는다.
   */
  notices?: string[];
}

export function BurdenedTransferTaxResultCard({ transferTaxResults, transferDate, notices }: Props) {
  if (transferTaxResults.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
        부담부증여 양도소득세 (소득세법 §88 · 소령 §159)
      </h3>
      {transferTaxResults.map((r, i) => (
        <SingleTransferResultCard
          key={i}
          result={r}
          index={i}
          transferDate={transferDate}
          notices={i === 0 ? notices : undefined}
        />
      ))}
    </div>
  );
}
