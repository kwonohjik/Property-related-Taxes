/**
 * 증여세 대납(代納) Gross-up 순환계산 엔진
 *
 * 법령 근거:
 *   §36 채무면제 등에 따른 증여 — 증여자가 수증자의 증여세(채무)를 대납(변제)하면
 *   수증자가 면한 이익 = 재차증여가액 (§36 직접 근거)
 *   §47② 동일인 10년 합산 — 대납분(§36 재차증여)은 합산배제증여재산 아님 → 합산 대상
 *   §4의2⑥ 연대납세의무 단서 — 연대의무자 대납은 재차증여 아님(국세청 해석[207328])
 *   §69② 신고세액공제 — 대납액 = finalTax(신고세액공제 후 결정세액)
 *
 * 수렴 보장:
 *   유효 한계세율 ≤ 0.5 × 1.4 × 0.97 = 0.679 < 1 → 축약사상 → 반드시 수렴
 *
 * 주입 지점:
 *   _donorPaidTaxAddition → gift-tax.ts STEP3 aggregatedGiftValue에만 가산
 *   netCurrentGiftValue 불변 → §53/§53의2 공제 안분 1회 동결 보장
 *
 * 차단 조합 (⑫ Zod superRefine + ⑧ validateStep 동일 메시지):
 *   ⓐ 동시증여(simultaneousGifts) + 대납 — 상증령 §46①2호 안분 ↔ 대납 fold-back 미검증
 *   ⓑ 2-스트림 특례(specialTreatment) + 대납 — aggregatedOrdinaryValue 주입 미지원
 *   ⓒ 세대생략(donorGroup=B) + 대납 — §57 grossGiftValue 조정 미구현
 *
 * Pure function. DB 호출 없음. 외부에서 _donorPaidTaxAddition 직접 세팅 금지.
 */

import type { GiftTaxInput, GiftTaxResult } from "./types/inheritance-gift.types";
import { calcGiftTax } from "./gift-tax";
import type { GiftTaxEngineOptions } from "./gift-tax";

// ============================================================
// 상수
// ============================================================

/** 반복 최대 횟수 — 이론상 10~15회 내 수렴, 안전 상한 */
const MAX_ITER = 100;
/** 수렴 허용 오차 — 1원 미만 차이 시 수렴 (floor 누적 허용) */
const TOLERANCE = 1;

// ============================================================
// 내부 헬퍼: runGrossUpIteration
// ============================================================

/**
 * 내부 전용 — calcGiftTaxWithDonorPaidTax 반복 회차에서만 호출.
 * input._donorPaidTaxAddition = addition으로 세팅하여 calcGiftTax 실행.
 * echoGrossUp이 있으면 options._echoGrossUp으로 전달 → buildBesshi10Rows가 donorPaidTax 참조.
 */
function runGrossUpIteration(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions,
  addition: number,
  echoGrossUp?: GiftTaxResult["donorPaidTaxGrossUp"],
): GiftTaxResult {
  return calcGiftTax(
    { ...input, _donorPaidTaxAddition: addition },
    { ...options, ...(echoGrossUp !== undefined ? { _echoGrossUp: echoGrossUp } : {}) },
  );
}

// ============================================================
// 공개 함수: calcGiftTaxWithDonorPaidTax
// ============================================================

/**
 * 증여세 대납 gross-up 계산 (§36 재차증여 고정점 수렴).
 *
 * - 게이트 OFF (donorPaysGiftTax !== true || donorHasJointLiability === true):
 *   calcGiftTax 그대로 호출 + donorPaidTaxGrossUp = { applied: false, ... } echo 첨부
 * - 게이트 ON:
 *   STEP G-1 baseline → STEP G-2 반복 수렴 → echo 첨부 후 결과 반환
 */
export function calcGiftTaxWithDonorPaidTax(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions = {},
): GiftTaxResult {
  // ─────────────────────────────────────────────
  // STEP G-0: 게이트 판정
  // ─────────────────────────────────────────────
  const grossUpOn =
    input.donorPaysGiftTax === true && input.donorHasJointLiability !== true;

  if (!grossUpOn) {
    const reasonNotApplied = input.donorPaysGiftTax === true
      ? "joint_liability" as const
      : "toggle_off" as const;
    const baseResult = calcGiftTax(input, options);
    return {
      ...baseResult,
      donorPaidTaxGrossUp: {
        applied: false,
        reasonNotApplied,
        iterations: 0,
        originalNetGift: Math.max(
          0,
          baseResult.grossGiftValue - baseResult.exemptAmount - (baseResult.debtAssumed ?? 0),
        ),
        grossedUpNetGift: Math.max(
          0,
          baseResult.grossGiftValue - baseResult.exemptAmount - (baseResult.debtAssumed ?? 0),
        ),
        donorPaidTax: 0,
        baselineTax: baseResult.finalTax,
      },
    };
  }

  // ─────────────────────────────────────────────
  // STEP G-1: baseline 계산 (addition=0)
  // ─────────────────────────────────────────────
  const baselineResult = runGrossUpIteration(input, options, 0);
  const baseline = baselineResult.finalTax;

  // originalNetGift(A) = netCurrentGiftValue = grossGiftValue − exemptAmount − debtAssumed
  // (공제 §53는 STEP4에서 차감되므로 여기 미포함)
  const originalNetGift = Math.max(
    0,
    baselineResult.grossGiftValue
      - baselineResult.exemptAmount
      - (baselineResult.debtAssumed ?? 0),
  );

  // ─────────────────────────────────────────────
  // STEP G-2: 고정점 반복 수렴 (부분 대납 지원)
  //   P = 수증자 본인 납부액 (doneePaidGiftTax, 고정). 증여자는 부족분만 대납.
  //   addition(증여자 대납분 D) = max(0, finalTax − P)
  //   addition_0 = 0, tax_0 = baseline
  //   addition_n+1 = max(0, tax_n − P)
  //   tax_n+1 = calcGiftTax(input with _donorPaidTaxAddition=addition_n+1).finalTax
  //   |tax_n+1 - tax_n| < TOLERANCE → 수렴
  //   수렴 보장: max(0,·)는 비확장 + finalTax 한계세율 ≤0.679<1 축약 → 합성 수렴.
  // ─────────────────────────────────────────────
  const doneePaid = Math.max(0, input.doneePaidGiftTax ?? 0);
  let addition = 0;
  let prevTax = baseline;
  let iterations = 0;

  for (let n = 0; n < MAX_ITER; n++) {
    const nextAddition = Math.max(0, prevTax - doneePaid);
    const nextTax = runGrossUpIteration(input, options, nextAddition).finalTax;
    iterations = n + 1;
    addition = nextAddition;

    if (Math.abs(nextTax - prevTax) < TOLERANCE) {
      prevTax = nextTax;
      break;
    }
    prevTax = nextTax;
  }

  // 수렴 후: prevTax = 총세액 T*, addition = 증여자 대납분 D = max(0, T* − P)
  // 최종 prevTax 기준으로 addition 재정렬(고정점 정합 — grossedUpNetGift·besshi10 일치)
  const totalGiftTax = prevTax;
  addition = Math.max(0, totalGiftTax - doneePaid);
  const donorPaidTax = addition;
  const doneePaidTax = Math.min(doneePaid, totalGiftTax); // 세액 한도 캡 → D + doneePaidTax == T*
  const grossedUpNetGift = originalNetGift + addition;

  // STEP G-3: echo를 포함하여 최종 결과 재계산
  // _echoGrossUp 주입 → buildBesshi10Rows 내 derivePriorGiftAddition이 donorPaidTax(=addition) 차감
  const finalEcho: GiftTaxResult["donorPaidTaxGrossUp"] = {
    applied: true,
    iterations,
    originalNetGift,
    grossedUpNetGift,
    donorPaidTax,
    totalGiftTax,
    doneePaidTax,
    baselineTax: baseline,
  };
  const lastResult = runGrossUpIteration(input, options, addition, finalEcho);

  return {
    ...lastResult,
    donorPaidTaxGrossUp: finalEcho,
  };
}
