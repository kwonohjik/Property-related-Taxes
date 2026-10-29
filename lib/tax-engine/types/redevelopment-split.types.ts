/**
 * 재개발/재건축 3분할 양도차익 산정(`redevelopment-split.ts`)의 입력·결과 타입.
 *
 * 800줄 정책(≥750 기회주의적 분리)으로 `redevelopment-split.ts`에서 내려보낸 타입 전용 파일이다 — 로직은 없다.
 * 기존 import(`redevelopment-split`에서 `RedevelopmentSplitInput`·`RedevelopmentSplitResult`)는 그 파일의 재export로 그대로 동작한다.
 */
import type { BurdenedGiftDebtFraction } from "../redevelopment-burdened-gift";
import type {
  RedevelopmentInfo,
  RedevelopmentBranchDetail,
  RedevelopmentValuationMeta,
} from "./transfer-redevelopment.types";


/** 3분할 양도차익 산정 입력 */
export interface RedevelopmentSplitInput {
  /** RedevelopmentInfo */
  redevelopment: RedevelopmentInfo;
  /**
   * 부담부증여 채무비율 `B/C`의 원값 (소령 §159①) — **β 스케일**. 소수 비율이 아니라 분자·분모 정수를 싣는다.
   *
   * 미전달·`B === C`(r = 1)면 아무 것도 바뀌지 않는다(일반 양도). 값이 오면 §166 산식의 절대 금액항
   * (평가액·청산금·인가전후 필요경비)을 `B/C`배로 줄여 §159가 이미 안분한 취득가액·양도가액과
   * **스케일을 맞춘다**. 근거·적용 범위는 `redevelopment-burdened-gift.ts` 헤더.
   *
   * ⚠️ `ownershipRatio`(공유지분)와 **독립**이다 — `scaleBurdenedGiftInfo`가 평가액·채무액을
   *    먼저 지분분으로 줄이므로 `B/C`는 지분 중립이고, 두 비율은 서로 다른 축이다.
   *
   * Step B 개산공제(§163⑥)도 §166①1호의 필요경비항이라 같은 비율로 줄인다(2026-10-16 — 부담부증여 × 완공 아파트 × §166③).
   * 순서는 «지분 기준시가를 먼저 확정 → × B/C»(순차 floor)다 — 소수 비율 두 개의 곱(`지분 × B/C`)은 반올림을 한 번 더 한다.
   */
  debtFraction?: BurdenedGiftDebtFraction;
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
  /**
   * 부담부증여 × 기준시가 모드(「소득세법 시행령」 §159①1호 괄호) — 인가 전 분 개산공제 base = 취득시 기준시가 × 채무비율
   * (§159 명세의 안분 취득가액 — 지분 축소까지 반영된 값이라 여기서 다시 줄이지 않는다).
   *
   * 취득가액이 기준시가라 실지거래가액이 아니므로 「소득세법」 §97②**2호**(그 밖의 경우)이고, §166①1호 인가 전 분 필요경비의
   * 「§97①2·3호 **또는** §163⑥」 중 §163⑥(개산공제)이다 — 일반 부담부증여 기준시가 경로·완공 아파트 K-5와 같다.
   * 있으면 Step B가 이 base로 개산공제를 내고, Step C 택일(`preApprovalNecessaryExpense`)이 인가 전 실비 대신 그것을 쓴다.
   * 계획서 `docs/00-pm/bg-redev-apt-pre-approval-lump-deduction.plan.md`.
   */
  burdenedGiftStdLumpBase?: number;
  /**
   * 부담부증여 × 이월과세(시나리오 A) 증여세 상당액 — 「소득세법」 §97의2①3호·시행령 §163의2②의 **채무비율 안분 후·한도 적용 전** 금액
   * (§159 명세 `carryoverGiftTax.apportioned`). 이미 안분된 값이라 β로 줄이지 않는다.
   *
   * 인가 전 분(기존건물과 그 부수토지 몫)의 필요경비에 얹는다 — 이월과세로 당초 증여자 취득가액을 승계하는 것도 같은 인가 전 분뿐이고
   * (인가 후 분의 취득은 평가액·납부 청산금이다), 증여세가 부과된 자산이 기존건물과 그 부수토지이기 때문이다. §166은 §97의2①3호의 산입 분기를
   * 정하지 않는다(명문 없음) — 계획서 `bg-redev-carryover-acquisition-echo.plan.md` §1.5·§3 D-5.
   * 한도는 인가 전 분 양도차익(시행령 §163의2② 후단 「양도가액에서 법 제97조제1항 및 제2항의 금액을 공제한 잔액」의 이 분기 몫)이고,
   * 넘친 몫은 다른 분기로 옮기지 않는다(`gb-bg-carryover-gift-tax-part-limit.plan.md`와 같은 규약).
   */
  carryoverGiftTaxExpense?: number;
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

  /** 이월과세 증여세 상당액 중 인가 전 분 양도차익 한도를 적용해 실제 산입한 금액(`carryoverGiftTaxExpense` 입력이 있을 때만). */
  carryoverGiftTaxApplied?: number;
  /** 위 한도 — 인가 전 분 양도차익(증여세 산입 전, 0 하한). */
  carryoverGiftTaxCap?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// 본문 함수
// ──────────────────────────────────────────────────────────────────────────────
