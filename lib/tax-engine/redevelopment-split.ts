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

import { safeMultiplyThenDivide } from "./tax-utils";
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
      // 환산 입력 불충분 — 0 fallback (validation에서 차단되어야 함)
      oldAcquisitionPrice = 0;
      valuationMeta = {
        method: "actual",
        numerator: 0,
        denominator: 0,
        rationale: "환산 모드이나 managementDisposalHousingPrice(D) 미입력 — validation 차단 필요",
      };
    } else {
      oldAcquisitionPrice = valuationResult.acquisitionPrice;
      valuationMeta = valuationResult.meta;
    }
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
    estimatedLumpDeduction = Math.floor(valuationMeta.numerator * 0.03);
  }

  // ─ Step C: 인가전 양도차익 ─
  // 양도가액(의제) = 권리가액
  // 양도차익 = 권리가액 − 취득가액 − 개산공제 − preApprovalExpenses
  const preApprovalGainBeforeAdjust =
    redevelopment.rightsValue - oldAcquisitionPrice - estimatedLumpDeduction - redevelopment.preApprovalExpenses;

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

  return {
    preApproval: {
      apportionedTransfer: redevelopment.rightsValue,
      apportionedAcquisition: oldAcquisitionPrice,
      gain: preApprovalGain,
    },
    postApprovalExistingHouse: {
      // 인가후 기존주택분 안분: 양도가액·취득가액 모두 권리가액/분양가 비율
      apportionedTransfer: safeRatio(transferPrice, redevelopment.rightsValue, salePriceTotal),
      apportionedAcquisition: redevelopment.rightsValue, // 분양가 안분 = 권리가액
      gain: split.postApprovalExistingHouseGain,
    },
    settlement: {
      apportionedTransfer: safeRatio(transferPrice, redevelopment.settlementAmount, salePriceTotal),
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

  // 인가후 기존주택분 (postApprovalExistingHouse):
  // APT 완공 후 가목 전체: 양도가액 − 분양가(평가액-청산금) − 인가후 필요경비
  const postApprovalGain = Math.max(0, transferPrice - salePriceTotal - postApprovalExpenses);

  // settlement 분 (APT 청산금 비율 안분):
  // ★ 사례 42 정정 (2026-05-17, project_case_42_apt_receive_land):
  //   토지 출자 + 완공 APT 양도 + 청산금 수령(동시신고) 시 §166②2호 표준 해석은
  //   §166①2호 가목·나목 2분기만 적용 — 청산금 자체는 인가시점에 받은 금액이라
  //   별도 양도(처분) 사건이 없음. 청산금 효과는 분양가 = 권리가 − 수령으로
  //   가목·나목 양쪽에 이미 반영됨.
  //   주택 출자(사례 47 등)는 기존 책 산식(청산금 비율 안분) 유지 — receive 분기에서
  //   1세대1주택 12억 안분 + 거주월수 귀속 분리 등 housing 전용 처리와 연동되므로 보존.
  const isLandContribReceive = redevelopment.originalAssetType === "land";
  const aptSettlementApportionedAcq = isLandContribReceive
    ? 0
    : safeMultiplyThenDivide(
        oldAcquisitionPrice,
        redevelopment.settlementAmount,
        redevelopment.rightsValue,
      );
  const aptSettlementGain = isLandContribReceive
    ? 0
    : calcAptReceiveSettlementGain(
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
      // ★ 사례 42 정정 — land 분기는 settlement 자체가 없음 (양도가·취득가·차익 모두 0)
      apportionedTransfer: isLandContribReceive ? 0 : redevelopment.settlementAmount,
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
      // §95② 별표2 [비고] 1호 — 입주권은 §94①2호의2 자산, LTHD 미적용. 인가후 기존주택분 0.
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
 * APT 청산금 수령 settlement 분 양도차익.
 * §166②2호 준용 구조에서 APT 완공 후 청산금 수령 비율 안분분:
 *   = 청산금 수령액 − (취득가액 × 청산금 / 평가액)
 *
 * 입주권 receive (§166①2호 가목: 양도가 − (평가액-청산금) − 비용)와 별개.
 * 사례 46 (receiveOnlyMode) / 사례 47 (동시신고) 공용.
 */
function calcAptReceiveSettlementGain(
  oldAcquisitionPrice: number,
  rightsValue: number,
  settlementAmount: number,
): number {
  if (rightsValue <= 0 || settlementAmount <= 0) return 0;
  const apportionedAcq = safeMultiplyThenDivide(oldAcquisitionPrice, settlementAmount, rightsValue);
  return Math.max(0, settlementAmount - apportionedAcq);
}
