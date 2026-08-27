/**
 * 재개발/재건축 — 3분할 양도차익 산정
 *
 * 본 모듈은 인가전·인가후 기존주택분·청산금 분 3분할 양도차익을 산정한다.
 *
 * 법령 근거 (law.go.kr 확인 2026-05-13):
 * - 시행령 §166①1호 (입주권 + 청산금 납부): 인가후양도차익 + 인가전양도차익
 * - 시행령 §166①2호 (입주권 + 청산금 수령): 가목·나목 (settlement.ts splitReceive 위임)
 * - ★ 시행령 §166②1호 (APT + 청산금 납부, 사례 44 핵심):
 *     인가후양도차익 안분: 청산금납부분 + 기존건물분(인가후 기존+인가전)
 * - 시행령 §166②2호 (APT + 청산금 수령): §166①2호 산식 준용
 * - 시행령 §166③ (환산취득가 산식 — valuation.ts 위임)
 *
 * 사례 44 검증값:
 *   인가전: 75,445,917  (= 219,218,500 − 141,221,532 − 2,551,049 = 75,447,919... ±2 차이)
 *   인가후 양도차익: 213,000,000 (= 525,000,000 − 312,000,000 − 0)
 *   인가후 기존: 149,658,784
 *   청산금:      63,341,216
 *   합계:       288,445,917 (xlsx 값)
 *
 * @remarks
 *   - 의제 양도가액(권리가액)과 실제 양도일은 분리. LTHD 종료일은 실제 양도일(transferDate).
 *   - postApprovalExpenses 미입력 시 0 처리.
 */

import { estimatedDeductionRate } from "./legal-codes";
import { TaxRateNotFoundError } from "./tax-errors";
import { computeEstimatedDeduction, computeLumpSumDeductionBase, safeMultiplyThenDivide } from "./tax-utils";
import { computeRedevelopmentValuation } from "./redevelopment-valuation";
import {
  computeSalePriceTotal,
  splitAptPay,
  splitReceive,
} from "./redevelopment-settlement";
import type {
  RedevelopmentInfo,
  RedevelopmentBranchDetail,
  RedevelopmentValuationMeta,
} from "./types/transfer-redevelopment.types";


/**
 * §166①1호 후단·①2호 나목 인가전 필요경비 — **택일(or)**.
 *
 * 조문은 "법 제97조제1항제2호 및 제3호 **또는** 제163조제6항에 따른 필요경비"라고 규정한다.
 * "및"이 아니라 "**또는**"이므로 합산하지 않는다:
 *   · §166③ 환산취득가를 쓴 경우 → §163⑥ **개산공제**
 *   · 실지 취득가액을 쓴 경우      → §97①2·3호 **실제 자본적지출·양도비**
 *
 * 2026-07-29 정정(#591 감사 R7): 종전 3개 **표시** 지점이 모두 `개산공제 + 인가전필요경비`로
 * 합산해 신고서 표시 필요경비가 과대(→ 표시 행 자기모순)였다. 환산 여부는 개산공제
 * 존재로 판정한다(실가 모드에서는 §163⑥이 적용되지 않아 0).
 *
 * 🔴 2026-08-25 정정(E1-02 — **세액 변경**): 그때 고친 것은 **표시**뿐이었고 **본류인
 *    `computeRedevelopmentSplit`의 양도차익 산식은 여전히 둘을 모두 뺐다**. 그래서 환산 모드에서
 *    인가전 필요경비를 입력하면 세액이 그만큼 과소해지고(실측 2,660,000), 동시에 신고서 열은
 *    택일 값만 표시해 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」으로 어긋났다.
 *    ⇒ 이 헬퍼를 `redevelopment-split.ts`로 옮겨 **계산과 표시가 한 함수를 보게** 한다
 *    (`redevelopment.ts`는 이미 이 모듈을 import하므로 방향이 맞다 — 역방향이면 순환이다).
 *
 * 대비: 같은 호 **가목**(인가후)은 §163⑥ 병기가 없어 실제 필요경비만 차감한다 — 무변경.
 */
export function preApprovalNecessaryExpense(
  estimatedDeduction: number,
  preApprovalExpenses: number,
): number {
  return estimatedDeduction > 0 ? estimatedDeduction : preApprovalExpenses;
}

// ──────────────────────────────────────────────────────────────────────────────
// 입력·결과
// ──────────────────────────────────────────────────────────────────────────────

/** 3분할 양도차익 산정 입력 */
export interface RedevelopmentSplitInput {
  /** RedevelopmentInfo */
  redevelopment: RedevelopmentInfo;

  /**
   * @param acquisitionDate 자산 취득일 (§164⑦ 단서 트리거 + LTHD 기산일).
   *   의제 양도가액(권리가액)과 별도로 LTHD 종료일은 실제 양도일을 사용.
   */
  acquisitionDate: Date;

  /** 자산 양도일 (완공 APT 양도일 또는 입주권 양도일) */
  transferDate: Date;

  /**
   * 양도가액 (완공 APT 실거래가, subject="apt") 또는 입주권 양도가액 (subject="right").
   * subject="right" 의 경우 통상 권리가액과 동일하거나 권리가액 × (1 ± α) (수령 시).
   */
  transferPrice: number;

  /**
   * 실가 모드 시 종전 취득가액 (실가).
   * useEstimatedAcquisition === true 인 경우 무시되고 redevelopment-valuation 으로 환산.
   */
  actualAcquisitionPrice?: number;

  /** 환산 모드 여부 (true 시 redevelopment-valuation 호출) */
  useEstimatedAcquisition: boolean;
  /**
   * 공유지분율 (0 < r ≤ 1, 미전달 시 1). **개산공제(소득령 §163⑥) base 축소 전용**.
   *
   * 기준시가·면적은 물건 전체(100%) 값을 유지한다 — 환산 산식에서 분자·분모로 함께 나타나 상쇄되고,
   * §166⑥ 안분 비율도 100% 스케일을 전제하기 때문이다. 호출부가 `TransferTaxInput.ownershipRatio`를
   * 그대로 내려준다(서브엔진 재판정 금지).
   *
   * 설계: docs/02-design/features/transfer-fractional-lump-sum-deduction.engine.design.md §2.1
   */
  ownershipRatio?: number;
  /**
   * 미등기양도자산 여부(소득세법 §104③) — §163⑥ 개산공제율 3/100 → **3/1000** 전환.
   * 호출부가 `TransferTaxInput.isUnregistered`를 그대로 내려준다(서브엔진 재판정 금지).
   * 율 산출은 `estimatedDeductionRate()` 단일 경유.
   */
  isUnregistered?: boolean;
}

/** 3분할 양도차익 결과 (LTHD 미적용 — lthd.ts 에서 별도 적용) */
export interface RedevelopmentSplitResult {
  /** 인가전 분 (subject="apt" + "right" 공통) */
  preApproval: Pick<
    RedevelopmentBranchDetail,
    "apportionedTransfer" | "apportionedAcquisition" | "gain"
  >;

  /**
   * 인가후 기존주택분 (subject="apt" 만 산출. "right" 시 gain=0 — §166⑤1호).
   * subject="apt" 시 §166②1호 안분 결과.
   */
  postApprovalExistingHouse: Pick<
    RedevelopmentBranchDetail,
    "apportionedTransfer" | "apportionedAcquisition" | "gain"
  >;

  /** 청산금 분 */
  settlement: Pick<
    RedevelopmentBranchDetail,
    "apportionedTransfer" | "apportionedAcquisition" | "gain"
  >;

  /** 분양가 (subject="apt" 만 의미) */
  salePriceTotal: number;

  /** 환산 케이스 메타 (환산 모드 시만) */
  valuationMeta?: RedevelopmentValuationMeta;

  /**
   * §163⑥ 개산공제 — 환산 모드 시 P_A × 3% (원, 정수). 인가전 양도차익에서 이미 차감됨.
   * UI 결과 카드 표시용.
   */
  estimatedLumpDeduction?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 본문 함수
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 3분할 양도차익 산정.
 *
 * 분기:
 *  - subject="right" + pay: §166①1호 — 인가후양도차익 + 인가전양도차익 단순 합산
 *  - subject="right" + receive: §166①2호 — 청산금 수령분 + 인가전(축소)
 *  - subject="apt" + pay: §166②1호 — 인가후 안분(청산금/기존건물분)
 *  - subject="apt" + receive: §166②2호 — §166①2호 준용
 */
export function computeRedevelopmentSplit(
  input: RedevelopmentSplitInput,
): RedevelopmentSplitResult {
  const { redevelopment, acquisitionDate, transferPrice, useEstimatedAcquisition } =
    input;

  // ─ Step A: 인가전 분 취득가액 결정 (실가 or 환산) ─
  let oldAcquisitionPrice: number;
  let valuationMeta: RedevelopmentValuationMeta | undefined;

  if (useEstimatedAcquisition) {
    const valuationResult = computeRedevelopmentValuation(redevelopment, acquisitionDate);
    if (valuationResult == null) {
      /**
       * 🔴 2026-08-26 정정(E1-07): 종전에는 여기서 취득가액을 **0으로 두고 계속 계산**했다
       *    (「validation에서 차단되어야 함」 주석과 함께). 그 차단은 ⑧ 클라이언트에만 있었고
       *    ⑫ Zod에는 대응 refine이 없어, 클라이언트를 거치지 않은 요청은 개산공제까지 0이 된 채
       *    **인가전 양도차익 = 권리가액 전액**으로 오류 없이 결과를 반환했다
       *    (사례 44 기준 산출세액 55,836,614 → 94,081,180 프로브 실측).
       *
       *    같은 상황에서 sibling 환산 서브엔진 둘은 이미 던진다
       *    (`redevelopment-land-contribution.ts` §166③ 분모 · `redevelopment-housing-contribution.ts`).
       *    본류만 침묵해 「0으로 성공」이라는 세 번째 진실이 있었다 — 그것을 없앤다.
       *    ⑫ refine(`transfer-tax-schema-refines.ts`)이 그보다 먼저 400으로 막는다.
       */
      throw new TaxRateNotFoundError(
        redevelopment.originalAssetType === "land"
          ? "redev-split: landStdPriceAtAcq·landStdPriceAtApproval must be > 0 (§166③ 토지 출자 환산 분자·분모)"
          : "redev-split: managementDisposalHousingPrice(D) must be > 0 (§166③ 분모)",
      );
    }
    oldAcquisitionPrice = valuationResult.acquisitionPrice;
    valuationMeta = valuationResult.meta;
  } else {
    oldAcquisitionPrice = input.actualAcquisitionPrice ?? 0;
    valuationMeta = {
      method: "actual",
      numerator: 0,
      denominator: 0,
      rationale: "실가 모드 — actualAcquisitionPrice 사용",
    };
  }

  // ─ Step B: 개산공제 (§163⑥) — 환산 모드 시 취득당시 라목값(P_A) × 3% ─
  // 일반 주택 §163⑥과 동일 — 환산취득가액 모드에서는 자본적지출·양도비 외에 개산공제를
  // 필요경비로 차감. P_A = valuationMeta.numerator (본문 발동 시 Step 1 결과, 미발동 시
  // acquisitionHousingPrice 단일값). 실가 모드는 0.
  let estimatedLumpDeduction = 0;
  if (
    useEstimatedAcquisition &&
    valuationMeta &&
    valuationMeta.method !== "actual" &&
    valuationMeta.method !== "successor_member_decree_162_1_4" &&
    valuationMeta.numerator !== undefined
  ) {
    estimatedLumpDeduction = computeEstimatedDeduction(
      valuationMeta.numerator,
      estimatedDeductionRate(input.isUnregistered),
      input.ownershipRatio,
    );
    // 표시 산식 base echo — numerator는 물건 전체(100%) 값이다.
    valuationMeta.lumpDeductionBase = computeLumpSumDeductionBase(
      valuationMeta.numerator,
      input.ownershipRatio,
    );
  }

  // ─ Step C: 인가전 양도차익 ─
  // 양도가액(의제) = 권리가액
  // 양도차익 = 권리가액 − 취득가액 − **필요경비(택일)**
  //   택일: 환산이면 §163⑥ 개산공제 / 실가면 §97①2·3호 실제 필요경비 (위 헬퍼 doc 참조)
  const preApprovalGainBeforeAdjust =
    redevelopment.rightsValue -
    oldAcquisitionPrice -
    preApprovalNecessaryExpense(estimatedLumpDeduction, redevelopment.preApprovalExpenses);

  // ─ Step C: 분기별 분할 ─
  const isPay = redevelopment.settlementDirection === "pay";
  const isApt = redevelopment.subject === "apt";

  if (isApt && isPay) {
    return computeAptPay({
      preApprovalGain: preApprovalGainBeforeAdjust,
      oldAcquisitionPrice,
      transferPrice,
      redevelopment,
      valuationMeta,
      estimatedLumpDeduction,
    });
  }

  if (isApt && !isPay) {
    return computeAptReceive({
      preApprovalGain: preApprovalGainBeforeAdjust,
      oldAcquisitionPrice,
      transferPrice,
      redevelopment,
      valuationMeta,
      estimatedLumpDeduction,
    });
  }

  if (!isApt && isPay) {
    return computeRightPay({
      preApprovalGain: preApprovalGainBeforeAdjust,
      oldAcquisitionPrice,
      transferPrice,
      redevelopment,
      valuationMeta,
      estimatedLumpDeduction,
    });
  }

  // !isApt && !isPay
  return computeRightReceive({
    preApprovalGain: preApprovalGainBeforeAdjust,
    oldAcquisitionPrice,
    transferPrice,
    redevelopment,
    valuationMeta,
    estimatedLumpDeduction,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 분기 핸들러
// ──────────────────────────────────────────────────────────────────────────────

interface BranchArgs {
  preApprovalGain: number;
  oldAcquisitionPrice: number;
  transferPrice: number;
  redevelopment: RedevelopmentInfo;
  valuationMeta?: RedevelopmentValuationMeta;
  /** §163⑥ 개산공제 — 환산 모드 시 P_A × 3%. 인가전 양도차익에 이미 차감됨. */
  estimatedLumpDeduction?: number;
}

/** APT + 청산금 납부 (§166②1호) — 사례 44 핵심 */
function computeAptPay(args: BranchArgs): RedevelopmentSplitResult {
  const { preApprovalGain, oldAcquisitionPrice, transferPrice, redevelopment, valuationMeta } =
    args;

  const salePriceTotal = computeSalePriceTotal(
    redevelopment.rightsValue,
    redevelopment.settlementAmount,
    "pay",
  );

  const postApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;
  const postApprovalGain = transferPrice - salePriceTotal - postApprovalExpenses;

  const split = splitAptPay(postApprovalGain, redevelopment.rightsValue, redevelopment.settlementAmount);

  /**
   * 표시용 양도가액 안분 — **마지막 분기가 잔액을 흡수**한다.
   *
   * 🔴 2026-08-27 정정(표시 결함): 종전에는 두 몫을 **각각 floor**해 합이 총 양도가액보다
   *    1원 적었다 — 평가 13억·청산 6억·양도 15억에서
   *    `1,026,315,789 + 473,684,210 = 1,499,999,999`. 신고서는 열 합계가 총액과 맞아야 한다
   *    (memory `feedback_redev_filing_form_acquisition_inverse`).
   *
   * 🔑 **같은 함수의 양도차익은 이미 이 규약을 지키고 있었다** — `splitAptPay`가
   *    `settlementGain = postApprovalGain − existingGain`으로 흡수한다(사례 40·41에서 확립,
   *    memory `feedback_floor_residual_absorption`). 표시 열만 규약 밖이었다.
   *
   * ⚠️ 취득가액 열은 `평가액`·`납부청산금`을 그대로 실어 합이 정의상 분양가와 같다
   *    (`salePriceTotal = rightsValue + settlementAmount`) — 나눗셈이 없어 손댈 것이 없다.
   */
  const existingTransfer = safeRatio(transferPrice, redevelopment.rightsValue, salePriceTotal);
  const settlementTransfer = salePriceTotal > 0 ? transferPrice - existingTransfer : 0;

  return {
    preApproval: {
      apportionedTransfer: redevelopment.rightsValue,
      apportionedAcquisition: oldAcquisitionPrice,
      gain: preApprovalGain,
    },
    postApprovalExistingHouse: {
      // 인가후 기존주택분 안분: 양도가액·취득가액 모두 권리가액/분양가 비율
      apportionedTransfer: existingTransfer,
      apportionedAcquisition: redevelopment.rightsValue, // 분양가 안분 = 권리가액
      gain: split.postApprovalExistingHouseGain,
    },
    settlement: {
      apportionedTransfer: settlementTransfer, // 잔액 흡수 (별도 floor 금지)
      apportionedAcquisition: redevelopment.settlementAmount,
      gain: split.settlementGain,
    },
    salePriceTotal,
    valuationMeta,
    estimatedLumpDeduction: args.estimatedLumpDeduction,
  };
}

/** APT + 청산금 수령 (§166②2호 = §166①2호 준용) */
function computeAptReceive(args: BranchArgs): RedevelopmentSplitResult {
  const { preApprovalGain, oldAcquisitionPrice, transferPrice, redevelopment, valuationMeta } =
    args;

  // ─ 사례 46 분기: 청산금 수령분 단독 신고 (receiveOnlyMode) ─
  // 법령 근거: 신축APT 완공 후 청산금 수령분만 별도 신고.
  // 인가전·인가후 양도차익 = 0 강제, settlement 분 단독 산정.
  // settlement.gain = 청산금 수령액 − 안분 취득가액 (APT 완공 후 청산금 비율 안분)
  if (redevelopment.receiveOnlyMode === true) {
    const aptReceiveSettlementGain = calcAptReceiveSettlementGain(
      oldAcquisitionPrice,
      redevelopment.rightsValue,
      redevelopment.settlementAmount,
    );
    const aptReceiveApportionedAcq = safeMultiplyThenDivide(
      oldAcquisitionPrice,
      redevelopment.settlementAmount,
      redevelopment.rightsValue,
    );
    return {
      preApproval: {
        apportionedTransfer: 0,
        apportionedAcquisition: 0,
        gain: 0,
      },
      postApprovalExistingHouse: {
        apportionedTransfer: 0,
        apportionedAcquisition: 0,
        gain: 0,
      },
      settlement: {
        apportionedTransfer: redevelopment.settlementAmount,
        apportionedAcquisition: aptReceiveApportionedAcq,
        gain: aptReceiveSettlementGain,
      },
      salePriceTotal: Math.max(0, redevelopment.rightsValue - redevelopment.settlementAmount),
      valuationMeta,
      estimatedLumpDeduction: 0, // receiveOnly는 인가전 분 0이므로 개산공제도 0
    };
  }

  const salePriceTotal = computeSalePriceTotal(
    redevelopment.rightsValue,
    redevelopment.settlementAmount,
    "receive",
  );

  // §166②2호 준용 (§166①2호 가목·나목):
  // - 나목: 인가전 양도차익 축소 = preApprovalGain × (평가액 − 청산금) / 평가액
  // - settlement: APT 완공 후 청산금 비율 안분 분 (§166②2호 준용 → APT 구조 유지)
  //   = 청산금 수령액 − (취득가액 × 청산금 / 평가액)
  const postApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;

  // 나목: 인가전 분 축소
  const remainingRatio = redevelopment.rightsValue - redevelopment.settlementAmount;
  const preApprovalGainAdjusted =
    remainingRatio > 0
      ? safeMultiplyThenDivide(preApprovalGain, remainingRatio, redevelopment.rightsValue)
      : 0;

  // 인가전 분 안분 취득가액 = 취득가액 × (평가액 − 청산금) / 평가액
  const preApportionedAcquisition = safeMultiplyThenDivide(
    oldAcquisitionPrice,
    remainingRatio,
    redevelopment.rightsValue,
  );

  /**
   * 인가후 기존주택분 (postApprovalExistingHouse):
   * §166①2호 가목 전체 — 양도가액 − 분양가(평가액 − 지급받은 청산금) − 인가후 필요경비.
   *
   * 🔴 2026-08-27 정정(T1-05 — **세액 변경**): 종전에는 `Math.max(0, …)`으로 **음수를 잘랐다**.
   *    §166①2호는 「다음 각 목의 금액을 **합한 가액**」이라고만 정하고, 「음수인 경우 0으로
   *    본다」는 단서가 §166 ①~⑧ 어디에도 없다. clamp 때문에 **분양가 아래로는 아무리 싸게
   *    팔아도 세액이 움직이지 않았다**(양도 3.0억·3.5억이 둘 다 64,801,000원).
   *
   *    음수의 최종 처리는 이미 하류가 담당한다 — 단건은 `transfer-tax.ts`의
   *    `Math.max(0, ownerRawGain)`, 집계는 `skipLossFloor: true`로 §102② 통산에 실어 보낸다.
   *    **분기 단계에서 자르면 그 통산이 볼 것이 없어진다.**
   *
   * ⭐ 같은 조 **1호(납부)** 분기 `splitAptPay`는 2026-08-25 E1-03(`96ed87b4`)에서 같은 이유로
   *    이미 clamp를 제거했다 — 일관성은 제거 쪽에 있다.
   *
   * ⚠️ `salePriceTotal`의 clamp는 **분모/분양가 방어**라 그대로 둔다(:382).
   */
  const postApprovalGain = transferPrice - salePriceTotal - postApprovalExpenses;

  /**
   * 청산금 수령분 — **종전 부동산의 분할양도**(`calcAptReceiveSettlementGain` 주석 참조).
   *
   * 🔴 2026-08-27 정정(**세액 변경**): 종전에는 `originalAssetType === "land"`이면 이 분기를
   *    **통째로 0**으로 만들어(양도가·취득가·차익 전부) 청산금 상당분이 **과세에서 이탈**했다.
   *    근거 주석은 「청산금 자체는 인가시점에 받은 금액이라 **별도 양도 사건이 없음**」이었으나,
   *    국세청 해석 셋이 **전부 반대 방향**이고 그중 둘은 **토지를 명시**한다:
   *
   *      · **재일46014-2870**(1997.12.08) — 재건축조합에게 **토지 등**을 양도하고 청산금을
   *        교부받는 경우 **양도에 해당**되어 양도소득세 과세대상
   *      · **재일46014-2104**(1999.12.13) — **토지·건물**의 대가로 권리와 청산금을 교부받은
   *        경우, 청산금에 상당하는 종전의 **토지·건물은 유상이전**에 해당하여 과세
   *      · **법규재산2012-358**(2012.11.09) — 청산금은 종전 주택의 **분할양도**
   *
   *    조문도 같다 — **§166①은 「건물 또는 토지만을 제공한 경우를 포함한다」** 를 명시하고,
   *    청산금 상당분을 배제하는 §166①2호 **나목의 안분은 자산 종류를 가리지 않는다**.
   *
   *    ⭐ 종전 근거였던 예제 사례 42는 **자기 자료끼리 답이 달라**(설계문서 §3 행 #7
   *      「xlsx 교재 답 상이 → anchor 보류」) 판정 근거가 될 수 없었다. 같은 문서 :509가
   *      해소 경로를 **「국세청 해석례」** 로 이미 지목해 뒀다.
   *
   * 🔑 항등식이 자산 종류와 무관하게 성립해야 한다:
   *    `나목 + 청산금분 = 평가액 − 취득가액` (안분비율이 약분된다).
   *    종전 land 분기는 나목만 남아 이 항등식이 깨져 있었다.
   */
  const aptSettlementApportionedAcq = safeMultiplyThenDivide(
    oldAcquisitionPrice,
    redevelopment.settlementAmount,
    redevelopment.rightsValue,
  );
  const aptSettlementGain = calcAptReceiveSettlementGain(
    oldAcquisitionPrice,
    redevelopment.rightsValue,
    redevelopment.settlementAmount,
  );

  return {
    preApproval: {
      apportionedTransfer: salePriceTotal, // 평가액 − 청산금
      apportionedAcquisition: preApportionedAcquisition,
      gain: preApprovalGainAdjusted,
    },
    postApprovalExistingHouse: {
      apportionedTransfer: transferPrice,
      apportionedAcquisition: salePriceTotal,
      gain: postApprovalGain,
    },
    settlement: {
      apportionedTransfer: redevelopment.settlementAmount,
      apportionedAcquisition: aptSettlementApportionedAcq,
      gain: aptSettlementGain,
    },
    salePriceTotal,
    valuationMeta,
    estimatedLumpDeduction: args.estimatedLumpDeduction,
  };
}

/** 입주권 + 청산금 납부 (§166①1호) — 인가후 + 인가전 단순 합산 */
function computeRightPay(args: BranchArgs): RedevelopmentSplitResult {
  const { preApprovalGain, oldAcquisitionPrice, transferPrice, redevelopment, valuationMeta } =
    args;

  // §166①1호: 인가후양도차익 = 양도가액 − (평가액 + 납부청산금) − 필요경비
  const salePriceTotal = redevelopment.rightsValue + redevelopment.settlementAmount;
  const postApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;
  const postApprovalGain = transferPrice - salePriceTotal - postApprovalExpenses;

  return {
    preApproval: {
      apportionedTransfer: redevelopment.rightsValue,
      apportionedAcquisition: oldAcquisitionPrice,
      gain: preApprovalGain,
    },
    postApprovalExistingHouse: {
      // 입주권 양도 시 인가후 기존주택분은 §95② 단서로 LTHD 대상 부존재
      // 본 엔진은 양도차익을 settlement 분에 합쳐서 처리 (§166①1호는 분리 없음)
      apportionedTransfer: 0,
      apportionedAcquisition: 0,
      gain: 0,
    },
    settlement: {
      apportionedTransfer: transferPrice - redevelopment.rightsValue,
      apportionedAcquisition: redevelopment.settlementAmount,
      gain: postApprovalGain,
    },
    salePriceTotal,
    valuationMeta,
    estimatedLumpDeduction: args.estimatedLumpDeduction,
  };
}

/** 입주권 + 청산금 수령 (§166①2호) */
function computeRightReceive(
  args: BranchArgs,
): RedevelopmentSplitResult {
  const { preApprovalGain, oldAcquisitionPrice, transferPrice, redevelopment, valuationMeta } = args;

  const postApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;
  const receive = splitReceive(
    preApprovalGain,
    oldAcquisitionPrice,
    redevelopment.rightsValue,
    redevelopment.settlementAmount,
    transferPrice,
    postApprovalExpenses,
  );

  const salePriceTotal = computeSalePriceTotal(
    redevelopment.rightsValue,
    redevelopment.settlementAmount,
    "receive",
  );

  return {
    preApproval: {
      // 의제양도가액 = 평가액 − 지급받은 청산금 (§166①2호 나목의 분모 기준 양도가)
      apportionedTransfer: salePriceTotal,
      // 인가전 분 안분 취득가액 = 종전 취득가액 × (평가액 − 청산금) / 평가액
      apportionedAcquisition: receive.apportionedAcquisition,
      gain: receive.preApprovalGainAdjusted,
    },
    postApprovalExistingHouse: {
      // §95② 본문 괄호 — 입주권은 §94①2호 가목 자산, LTHD 미적용. 인가후 기존주택분 0.
      apportionedTransfer: 0,
      apportionedAcquisition: 0,
      gain: 0,
    },
    settlement: {
      // §166①2호 가목: 인가후 분 양도가액 = 실제 양도가액 / 취득가액 = 평가액 − 청산금
      apportionedTransfer: transferPrice,
      apportionedAcquisition: salePriceTotal,
      gain: receive.settlementGain,
    },
    salePriceTotal,
    valuationMeta,
    estimatedLumpDeduction: args.estimatedLumpDeduction,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

/** floor(value × numerator / denominator) — division by zero 방어 */
function safeRatio(value: number, numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  // BigInt 안전 곱셈/나눗셈
  const product = value * numerator;
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    return Number(
      (BigInt(Math.floor(value)) * BigInt(Math.floor(numerator))) /
        BigInt(Math.floor(denominator)),
    );
  }
  return Math.floor(product / denominator);
}

/**
 * 청산금 수령분 양도차익 — **종전 부동산의 분할양도**.
 *
 *   = 청산금 수령액(양도가액) − 취득가액 × 청산금 ÷ 평가액(안분취득가액)
 *
 * ## 🔑 이것은 §166①2호 가목이 **아니다**
 *
 * §166②2호는 「**제1항제2호에 따른 가액**」이 전문이라 **가목 + 나목(신축주택 양도분)** 만
 * 정한다. 그리고 나목이 `×(평가액 − 청산금) ÷ 평가액`로 **청산금 상당분을 스스로 배제**한다.
 * 그 배제분이 이 함수의 대상이고, 근거는 §166이 아니라 **법 §88·§95①·§100**이다
 * (평가액만 §166④1호의 관리처분계획 가격을 빌린다).
 *
 * > **법규재산2012-358** (2012.11.09) — 「청산금은 종전 주택(부수토지 포함)의 **분할양도**에
 * > 해당하므로 원칙적으로 양도소득세 과세대상 … 종전 부동산의 **유상이전**에 해당하여
 * > 양도소득세가 과세되는 것입니다.」
 *
 * 별개의 양도 사건이므로 **단독 신고**가 가능하다(사례 46 `receiveOnlyMode`).
 * 사례 47은 신축주택 양도와 **동시신고**한 것이다.
 *
 * ## 🔴 2026-08-27 정정 — **세액 변경**: `Math.max(0, …)` 제거
 *
 * 종전 부동산의 손익 `평가액 − 취득가액`은 안분비율로 두 조각으로 갈리는데,
 * **약분되어 합계가 원래 손익과 같아야 한다**:
 *
 * ```
 *   나목     = (평가액 − 취득가액) × (평가액 − 청산금) ÷ 평가액
 *   청산금분 = (평가액 − 취득가액) × 청산금           ÷ 평가액
 *   합계     =  평가액 − 취득가액
 * ```
 *
 * **나목에는 clamp가 없는데 여기에만 있었다.** 취득가액 10억 > 평가액 8억 실측에서
 * 나목 −150,000,000은 그대로 반영되고 청산금분 −50,000,000만 0으로 사라져,
 * 같은 손실의 **75%는 인정하고 25%를 버렸다**(항등식이 −2억 대신 −1.5억이 됐다).
 *
 * 근거 조문 §95①에도 「음수면 0으로 본다」 문언이 없다 — 양도차손은 §102②이 처리한다.
 * 같은 축의 선례: T1-05(§166①2호 가목 clamp 제거) · E1-03(`96ed87b4`, §166②1호).
 *
 * ⚠️ 남은 조기 반환은 **분모 0 방어**(평가액 0)와 **청산금 부존재**뿐이다.
 */
function calcAptReceiveSettlementGain(
  oldAcquisitionPrice: number,
  rightsValue: number,
  settlementAmount: number,
): number {
  if (rightsValue <= 0 || settlementAmount <= 0) return 0;
  const apportionedAcq = safeMultiplyThenDivide(oldAcquisitionPrice, settlementAmount, rightsValue);
  return settlementAmount - apportionedAcq;
}
