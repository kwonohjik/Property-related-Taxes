/**
 * 재개발/재건축 양도소득세 — Orchestrator
 *
 * 본 모듈은 RedevelopmentInfo 입력을 받아 3분할 양도차익 + 분기별 LTHD 적용 후
 * RedevelopmentResult를 반환한다. transfer-tax.ts 의 양도차익 산정 STEP에서
 * 호출되어 일반 분기 대신 재개발 분기 결과를 사용.
 *
 * 파일 분리 책임:
 *  - redevelopment-split.ts       : 3분할 양도차익 (§166①1호·①2호·②1호·②2호)
 *  - redevelopment-lthd.ts        : 분기별 LTHD 보유기간·율 (§166⑤)
 *  - redevelopment-settlement.ts  : 분양가·청산금 안분
 *  - redevelopment-valuation.ts   : 환산취득가 (§166③ + §164⑦ 단서)
 *  - redevelopment.ts (본 파일)   : 분기 라우팅 + 합산 + finalize 입력 빌더
 *
 * 사례 44 검증 (APT-환산-납부-주택출자):
 *   산출세액 56,799,400 / 지방소득세 5,679,940 / 세액합계 62,479,340
 */

import { computeLumpSumDeductionBase, calculateHoldingPeriod, safeMultiplyThenDivide } from "./tax-utils";
import {
  computeRedevelopmentSplit,
  type RedevelopmentSplitInput,
  preApprovalNecessaryExpense,
} from "./redevelopment-split";
import { computeRedevelopmentLthd, applyLthdToGain } from "./redevelopment-lthd";
import { runSuccessorMember } from "./redevelopment-successor";
import {
  calcRedevLandContribEstimated,
} from "./redevelopment-land-contribution";
import {
  calcRedevHousingContribReceiveEstimated,
} from "./redevelopment-housing-contribution";
import type {
  RedevelopmentInfo,
  RedevelopmentResult,
  RedevelopmentBranchDetail,
} from "./types/transfer-redevelopment.types";

import { isHousingContribEstimatedAxes } from "./redevelopment-branch-gate";
import { resolveRedevEffectiveOneHouseSingle, resolveRightResidenceMonths } from "./redevelopment-lthd";
// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator 입력
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Orchestrator 입력 — RedevelopmentInfo + 자산-수준 메타.
 *
 * transfer-tax.ts 에서 다음과 같이 호출:
 *   const detail = runRedevelopment({
 *     redevelopment: input.redevelopment!,
 *     acquisitionDate: input.acquisitionDate,
 *     transferDate: input.transferDate,
 *     transferPrice: input.transferPrice,
 *     actualAcquisitionPrice: input.useEstimatedAcquisition ? undefined : input.acquisitionPrice,
 *     useEstimatedAcquisition: input.useEstimatedAcquisition ?? false,
 *     isSuccessorRightToMoveIn: input.isSuccessorRightToMoveIn,
 *     isOneHouseSingle: input.isOneHousehold && input.householdHousingCount === 1,
 *     residencePeriodMonths: input.residencePeriodMonths,
 *   });
 */
/**
 * §166⑤ 분기 보유기간 — 전 세목 공통 `calculateHoldingPeriod`에 위임한다.
 *
 * `RedevelopmentBranchDetail.holdingMonths`는 **월 단위**, `holdingDays`는 잔여 일수다.
 * 종전에는 LTHD용 만년수(`lthdHoldingYears`)에 12를 곱해 재구성해서 잔여월이 통째로 잘렸다
 * — LTHD 공제율은 만년수만 보므로 세액은 맞았지만 신고서 표시 보유기간이 틀렸다.
 * (#591 감사 R7, 2026-07-29)
 */
function toBranchHolding(
  from: Date,
  to: Date,
): { holdingMonths: number; holdingDays: number } {
  const hp = calculateHoldingPeriod(from, to);
  return { holdingMonths: hp.years * 12 + hp.months, holdingDays: hp.days };
}


/**
 * 인가전 분 표시용 필요경비를 §166①2호 나목 비율로 안분한다.
 *
 * 나목은 인가전 양도차익 **전체**에 (평가액 − 지급받은 청산금) / 평가액 을 곱한다. 그 차익은
 * 필요경비를 원액으로 차감한 뒤 곱해지므로 **실효 차감액은 이미 안분값**이다. 같은 객체의
 * 양도가액·취득가액도 안분된 값이 표시되므로, 필요경비만 원액을 두면 신고서 인가전 분 열이
 * 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」으로 어긋난다(2026-08-13 제보).
 *
 * 수령 분기 전용 — 납부·완공APT 분기는 안분 자체가 없어 호출하지 않는다.
 *
 * @param apportionedTransfer 안분된 의제양도가액 (= 평가액 − 수령청산금, 나목의 분자와 동일)
 * @param rightsValue 권리가액 (나목의 분모)
 */
function apportionPreApprovalExpenses(
  rawExpenses: number,
  apportionedTransfer: number,
  rightsValue: number,
): number {
  if (rightsValue <= 0) return rawExpenses;
  return safeMultiplyThenDivide(rawExpenses, apportionedTransfer, rightsValue);
}


export interface RedevelopmentOrchestratorInput extends RedevelopmentSplitInput {
  /** 입주권 양도 시 승계조합원 여부 (§95② 단서 — LTHD 0) */
  isSuccessorRightToMoveIn?: boolean;
  /** 1세대1주택 (LTHD 표2 + 12억 안분 분기) */
  isOneHouseSingle?: boolean;
  /**
   * 거주기간 개월 (legacy 단일값 — prior/new 두 필드가 모두 undefined 시 fallback).
   * 신규 케이스에서는 priorHouseResidenceMonths + newHouseResidenceMonths 사용 권장.
   */
  residencePeriodMonths?: number;
  /**
   * 종전주택 거주개월수 (시행령 §154⑧ 통산 prior 분량).
   * 사례 45 — 기존건물분 LTHD 표2 거주분 = prior + new (통산).
   */
  priorHouseResidenceMonths?: number;
  /**
   * 신축주택 거주개월수.
   * 사례 45 — 청산금납부분 LTHD 표2 진입 가드 (해석례 2020-386).
   */
  newHouseResidenceMonths?: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Orchestrator 본체
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 재개발/재건축 양도 결과 산정.
 *
 * Step 1: 3분할 양도차익 (split.ts)
 * Step 2: 분기별 LTHD 보유기간·율 (lthd.ts)
 * Step 3: 분기별 LTHD 금액 적용 (applyLthdToGain × 묶음 동일 율 강제)
 * Step 4: 합계 (gain·lthd·taxableIncome)
 *
 * 1세대1주택 §160 12억 안분은 본 함수 외부(transfer-tax.ts)에서
 * total.gain 과 total.lthd 에 적용 (분배법칙으로 분기별 분배는 UI 표시용).
 */
export function runRedevelopment(
  input: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  // 사례 48 — 승계조합원 분기 (관리처분 후 입주권 승계 → 신축APT 양도).
  // §166 안분 우회 + 준공일 기산 LTHD/세율 (사전-2019-법령해석재산-0649).
  if (input.redevelopment.isSuccessorMember === true) {
    return runSuccessorMember(input);
  }

  // 사례 39 — 주택 출자 입주권 + 청산금 수령 + §166③ PHD 2-point 환산취득가 분기.
  // 구분 조건: housingStdPriceAtAcq + housingStdPriceAtApproval (PHD 직접 입력)를 사용.
  // ※ 사례 36-A2-ii(managementDisposalHousingPrice+acquisitionHousingPrice 사용 §166③ 경로)와 다름.
  // 네 축은 공용 leaf가 판정한다(⑤ UI · ⑧ validate · ⑫ Zod와 동일 — E1-04).
  // PHD 2필드 > 0은 **엔진 고유 조건**이다 — 값이 있어야 §164⑤ 산식을 돌릴 수 있다.
  // 이 조건을 leaf에 넣으면 ⑤·⑧·⑫가 「값이 없으면 분기가 아니다」로 읽혀 요구 자체를 못 한다.
  if (
    isHousingContribEstimatedAxes({
      originalAssetType: input.redevelopment.originalAssetType,
      subject: input.redevelopment.subject,
      settlementDirection: input.redevelopment.settlementDirection,
      useEstimatedAcquisition: input.useEstimatedAcquisition,
    }) &&
    (input.redevelopment.housingStdPriceAtAcq ?? 0) > 0 &&
    (input.redevelopment.housingStdPriceAtApproval ?? 0) > 0
  ) {
    return runHousingContribReceiveEstimated(input);
  }

  /**
   * 사례 37 — 토지 출자 **입주권** + 환산취득가 분기.
   * originalAssetType="land" + useEstimatedAcquisition=true 시 §166③ 공시지가 환산 산식 적용.
   * (주택 출자 환산과 별개 공식 — managementDisposalHousingPrice 대신 landStdPriceAt* 사용)
   *
   * 🔴 **`subject === "right"` 게이트 추가 (2026-08-25 — E1-01).**
   *    종전에는 이 조건에 **양도 대상 축이 없어서**, 자산 종류가 「재개발APT」(완공 신축주택 양도,
   *    subject="apt")여도 환산 모드이기만 하면 여기로 빨려 들어가 §166**①**1호(입주권) 구조로
   *    계산됐다 — 인가전 분만 LTHD를 받고 **인가후 분 LTHD가 통째로 0**이 됐다
   *    (실측 산출세액 89,576,716원 과대).
   *
   *    바로 위 주석이 처음부터 「토지 출자 **입주권**」이라고 적고 있었다 — 주석과 구현이 갈렸던 것이다.
   *
   *    ① / ② 를 가르는 축은 조문상 **양도 대상**이다:
   *      · §166① 「…취득한 **입주자로 선정된 지위를 양도**하는 경우」
   *      · §166② 「…관리처분계획등에 따라 취득한 **신축주택 및 그 부수토지를 양도**하는 경우」
   *    「토지만 제공」은 §166① 괄호가 명시적으로 포함하는 사실일 뿐 항을 가르지 않는다.
   *
   *    subject="apt"는 이제 아래 `runOriginalMember` → `computeRedevelopmentSplit`으로 내려가고,
   *    §166③ 토지 환산취득가는 `computeRedevelopmentValuation`이 산출한다(2026-08-25 신설).
   *    ⇒ §166②1호 안분 + §166⑤2호 가목·나목 LTHD가 정상 적용된다.
   */
  if (
    input.redevelopment.subject === "right" &&
    input.redevelopment.originalAssetType === "land" &&
    input.useEstimatedAcquisition === true
  ) {
    return runLandContribEstimated(input);
  }

  return runOriginalMember(input);
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 37 분기 — 토지 출자 입주권 + 환산취득가
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 토지 출자 입주권 환산취득가 분기 — §166③ 공시지가 비율 환산.
 *
 * calcRedevLandContribEstimated 결과를 RedevelopmentResult 형태로 변환.
 * 3분할 구조 유지 (preApproval / postApproval / settlement):
 *   - preApproval  : 인가전 분 (§166⑤1호 기산일 = 취득일, 종기 = 인가일)
 *   - postApproval : gain=0, lthd=0 (§95② 별표2 [비고] 1호 — 토지 입주권 인가후 LTHD 미적용)
 *   - settlement   : 인가후 분 (입주권 양도가 − 권리가액 − 청산금납부, LTHD 없음)
 *
 * 법령 근거:
 *   §166③  : 환산취득가 = floor(권리가액 × 취득당시공시지가 / 인가당시공시지가)
 *   §163⑥  : 개산공제 = floor(취득당시공시지가 × 3%)
 *   §95②   : 별표2 [비고] 1호 — 인가전 분에만 LTHD 표1 적용
 *   §166⑤1호: LTHD 보유기간 = 취득일 ~ 인가일
 *
 * landStdPriceAtAcq / landStdPriceAtApproval 미입력 시 —
 *   validation에서 차단되어야 하므로 엔진에서 방어만 (TaxRateNotFoundError via calcRedevLandContribEstimated)
 */
function runLandContribEstimated(
  input: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  const { redevelopment, acquisitionDate, transferDate, transferPrice } = input;

  // landStdPriceAt* 미입력 방어 — validation에서 차단이 주 방어선이나 엔진 레벨도 방어
  // calcRedevLandContribEstimated 내부에서 landStdPriceAtApproval <= 0 시 throw
  const landResult = calcRedevLandContribEstimated({
    acquisitionDate,
    approvalDate: redevelopment.approvalDate,
    rightsValue: redevelopment.rightsValue,
    transferPrice,
    settlementPaid: redevelopment.settlementAmount,    // pay 방향만 지원 (청산금 납부액)
    landStdPriceAtAcq: redevelopment.landStdPriceAtAcq ?? 0,
    landStdPriceAtApproval: redevelopment.landStdPriceAtApproval ?? 0,
    postApprovalExpenses: redevelopment.postApprovalExpenses ?? 0,
    ownershipRatio: input.ownershipRatio,
    isUnregistered: input.isUnregistered,
  });

  // ─ RedevelopmentBranchDetail 로 변환 ─
  
// preApproval: 인가전 분 (LTHD 적용)
  const preApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: redevelopment.rightsValue,             // 의제 양도가액 = 권리가액
    apportionedAcquisition: landResult.convertedAcquisition,    // §166③ 환산취득가
    gain: landResult.preApprovalGain,
    // 취득일 ~ 인가일 보유기간 (§166⑤1호). 2026-07-29 정정(#591 감사 R7 — 표시 전용, 세액 불변):
    //   종전 `lthdHoldingYears × 12`는 **연단위 절사**라 잔여월·일수가 소실됐다
    //   (2007-04-09 → 2014-10-23 이 84개월로 표시 — 실제 90개월 13일).
    //   LTHD 공제율은 만년수만 쓰므로 세액에는 영향이 없었으나 신고서 표시가 틀렸다.
    //   전 세목 공통 헬퍼 `calculateHoldingPeriod`(윤년·월경계 처리 단일 진실)로 교체한다.
    ...toBranchHolding(acquisitionDate, redevelopment.approvalDate),
    lthd: landResult.preApprovalLTHD,
    lthdRate: landResult.lthdRate,
    branchAcqDate: acquisitionDate,
    branchTransferDate: redevelopment.approvalDate,             // §166⑤1호 종기 = 인가일
    // §166①2호 나목 택일 — 개산공제와 실제 필요경비를 합산하지 않는다.
    expenses: preApprovalNecessaryExpense(landResult.estimatedDeduction, redevelopment.preApprovalExpenses ?? 0),
    residenceStartDate: undefined,
    residenceEndDate: undefined,
    residenceMonths: undefined,
    lthdHoldingPart: landResult.preApprovalLTHD,               // 표1 = 보유분만 (거주분 0)
    lthdResidencePart: 0,
  };

  // postApprovalExistingHouse: 항상 0 (토지 입주권 — §95② 별표2 [비고] 1호)
  const postApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: 0,
    apportionedAcquisition: 0,
    gain: 0,
    holdingMonths: 0,
    holdingDays: undefined,
    lthd: 0,
    lthdRate: 0,
    branchAcqDate: undefined,
    branchTransferDate: undefined,
    expenses: 0,
    residenceStartDate: undefined,
    residenceEndDate: undefined,
    residenceMonths: undefined,
    lthdHoldingPart: 0,
    lthdResidencePart: 0,
  };

  // settlement: 인가후 분 (§166①1호 인가후양도차익, LTHD 없음)
  // 신고서 양식 표 표기:
  //   - 양도가액 = transferPrice (520M, 실제 양도가 전체)
  //   - 취득가액 = rightsValue (300M, 권리가액 = 의제 취득가)
  //   - 필요경비 = settlementAmount + postApprovalExpenses (청산금 불입액 + 기타 부대비용)
  //   - 양도차익 = transferPrice − rightsValue − (settlementAmount + postApprovalExpenses) = postApprovalGain
  const settlementExpenses = redevelopment.settlementAmount + (redevelopment.postApprovalExpenses ?? 0);
  const settlementDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: transferPrice,                              // 실제 양도가 (전체)
    apportionedAcquisition: redevelopment.rightsValue,               // 권리가액 = 의제 취득가
    gain: landResult.postApprovalGain,                               // 520M − 300M − 100M = 120M
    holdingMonths: 0,                                                // LTHD 없음 — 월수 불필요
    holdingDays: undefined,
    lthd: 0,                                                         // postApprovalLTHD = 0
    lthdRate: 0,
    branchAcqDate: redevelopment.approvalDate,                       // 인가일~양도일
    branchTransferDate: transferDate,
    expenses: settlementExpenses,                                    // 청산금 불입액 + 기타 부대비용
    residenceStartDate: undefined,
    residenceEndDate: undefined,
    residenceMonths: undefined,
    lthdHoldingPart: 0,
    lthdResidencePart: 0,
  };

  const totalGain = preApprovalDetail.gain + settlementDetail.gain;  // postApproval=0
  const totalLthd = preApprovalDetail.lthd;                          // postApproval=0, settlement=0
  const taxableIncome = Math.max(0, totalGain - totalLthd);

  return {
    preApproval: preApprovalDetail,
    postApprovalExistingHouse: postApprovalDetail,
    settlement: settlementDetail,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome,
    },
    salePriceTotal: undefined, // 토지 입주권 — 분양가 개념 없음
    receiveOnlyMode: undefined,
    valuationMeta: {
      method: "estimated_post_disclosure_decree_166_3",
      numerator: redevelopment.landStdPriceAtAcq,
      // 개산공제 산식 표시 base — 100% 공시지가가 아니라 엔진이 실제로 쓴 지분 기준시가.
      lumpDeductionBase: computeLumpSumDeductionBase(
        redevelopment.landStdPriceAtAcq ?? 0,
        input.ownershipRatio,
      ),
      denominator: redevelopment.landStdPriceAtApproval,
      rationale: `§166③ 토지 환산취득가 = 권리가액 ${redevelopment.rightsValue.toLocaleString()} × 취득시공시지가 ${(redevelopment.landStdPriceAtAcq ?? 0).toLocaleString()} / 인가시공시지가 ${(redevelopment.landStdPriceAtApproval ?? 0).toLocaleString()} = ${landResult.convertedAcquisition.toLocaleString()} / 개산공제 §163⑥ = ${computeLumpSumDeductionBase(redevelopment.landStdPriceAtAcq ?? 0, input.ownershipRatio).toLocaleString()} × 3% = ${landResult.estimatedDeduction.toLocaleString()}`,
    },
    estimatedLumpDeduction: landResult.estimatedDeduction,
    // ── echo 필드 (UI 결과 카드 표시용) ──
    landContribDetail: {
      convertedAcquisition: landResult.convertedAcquisition,
      estimatedDeduction: landResult.estimatedDeduction,
      landStdPriceAtAcq: redevelopment.landStdPriceAtAcq ?? 0,
      landStdPriceAtApproval: redevelopment.landStdPriceAtApproval ?? 0,
      preApprovalLTHD: landResult.preApprovalLTHD,
      postApprovalLTHD: 0,
      lthdHoldingStartDate: landResult.lthdHoldingStartDate,
      lthdHoldingEndDate: landResult.lthdHoldingEndDate,
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 사례 39 분기 — 주택 출자 입주권 + 청산금 수령 + 환산취득가
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 주택 출자 입주권(right+receive) 환산취득가 분기 — §166③ PHD 비율 환산.
 *
 * calcRedevHousingContribReceiveEstimated 결과를 RedevelopmentResult 형태로 변환.
 * 3분할 구조 유지 (preApproval / postApprovalExistingHouse / settlement):
 *   - preApproval  : 인가전 분 (§166①2호 나목 + §166③ 환산, LTHD 표1 적용)
 *   - postApproval : gain=0, lthd=0 (§95② 별표2 [비고] 1호 — 입주권 §94①2호 자산)
 *   - settlement   : 인가후 분 (§166①2호 가목, LTHD 없음)
 *
 * 법령 근거:
 *   §166③  : 환산취득가 = floor(권리가액 × 취득당시PHD / 인가당시PHD)
 *   §163⑥  : 개산공제 = floor(취득당시PHD × 3%)
 *   §166①2호 나목: 인가전 = (권리가액 − 환산 − 개산공제) × (권리가액 − 청산금수령) / 권리가액
 *   §166①2호 가목: 인가후 = 양도가액 − (권리가액 − 청산금수령) − 인가후필요경비
 *   §95②   : 별표2 [비고] 1호 — 인가전 분에만 LTHD 표1 적용
 *   §166⑤1호: LTHD 보유기간 = 취득일 ~ 인가일
 *
 * housingStdPriceAtAcq / housingStdPriceAtApproval 미입력 시 —
 *   validation에서 차단되어야 하므로 엔진에서 방어만 (TaxRateNotFoundError via calc 함수)
 */
function runHousingContribReceiveEstimated(
  input: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  const { redevelopment, acquisitionDate, transferDate, transferPrice } = input;

  // housingStdPriceAt* 미입력 방어 — validation에서 차단이 주 방어선이나 엔진 레벨도 방어
  // calcRedevHousingContribReceiveEstimated 내부에서 분모/분자 <= 0 시 throw
  const housingResult = calcRedevHousingContribReceiveEstimated({
    acquisitionDate,
    approvalDate: redevelopment.approvalDate,
    rightsValue: redevelopment.rightsValue,
    transferPrice,
    settlementReceived: redevelopment.settlementAmount, // receive 방향 — 절댓값
    housingStdPriceAtAcq: redevelopment.housingStdPriceAtAcq ?? 0,
    housingStdPriceAtApproval: redevelopment.housingStdPriceAtApproval ?? 0,
    preApprovalExpenses: redevelopment.preApprovalExpenses ?? 0,
    postApprovalExpenses: redevelopment.postApprovalExpenses ?? 0,
    // 실가 경로(`computeRedevelopmentLthd`)와 **같은 leaf**로 파생한다 — 인자 동일성까지
    // 맞춰야 「같은 함수를 쓰는데 결과가 다른」 상태가 생기지 않는다 (E2-03).
    isOneHouseSingle: resolveRedevEffectiveOneHouseSingle(input),
    residencePeriodMonths: resolveRightResidenceMonths(input),
    ownershipRatio: input.ownershipRatio,
    isUnregistered: input.isUnregistered,
  });

  // ─ RedevelopmentBranchDetail 로 변환 ─
  // preApproval: 인가전 분 (§166①2호 나목, LTHD 적용)
  const preApprovalDetail: RedevelopmentBranchDetail = {
    // 의제양도가액 = salePriceTotal (평가액 − 수령청산금)
    apportionedTransfer: housingResult.preApprovalApportionedTransfer,
    // 취득가액 안분 = floor(환산취득가 × salePriceTotal / 권리가액)
    apportionedAcquisition: housingResult.preApprovalApportionedAcquisition,
    gain: housingResult.preApprovalGain,
    // §166⑤1호 — 위 토지 경로와 동일 정정(연단위 절사 → 공통 헬퍼).
    ...toBranchHolding(acquisitionDate, redevelopment.approvalDate),
    lthd: housingResult.preApprovalLTHD,
    lthdRate: housingResult.lthdRate,
    branchAcqDate: acquisitionDate,
    branchTransferDate: redevelopment.approvalDate,   // §166⑤1호 종기 = 인가일
    // 필요경비 (신고서 양식 표 표시용) — §166①2호 나목 택일 **후 안분**.
    //
    // 나목은 (권리가액 − 환산취득가 − 개산공제)에 salePriceTotal / 권리가액 을 곱한다
    // (`redevelopment-housing-contribution.ts:189~197`). 즉 실효 차감액은 이미 안분값이다.
    // 위 양도가액·취득가액도 같은 비율로 안분된 값을 표시하므로 필요경비만 원액을 두면
    // 신고서 인가전 분 열이 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」으로 어긋난다.
    expenses: apportionPreApprovalExpenses(
      preApprovalNecessaryExpense(
        housingResult.estimatedDeduction,
        redevelopment.preApprovalExpenses ?? 0,
      ),
      housingResult.preApprovalApportionedTransfer, // = salePriceTotal (평가액 − 수령청산금)
      redevelopment.rightsValue,
    ),
    residenceStartDate: undefined,
    residenceEndDate: undefined,
    residenceMonths: undefined,
    lthdHoldingPart: housingResult.preApprovalLTHD, // 표1 = 보유분만
    lthdResidencePart: 0,
  };

  // postApprovalExistingHouse: 항상 0 (입주권 right — §95② 별표2 [비고] 1호)
  const postApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: 0,
    apportionedAcquisition: 0,
    gain: 0,
    holdingMonths: 0,
    holdingDays: undefined,
    lthd: 0,
    lthdRate: 0,
    branchAcqDate: undefined,
    branchTransferDate: undefined,
    expenses: 0,
    residenceStartDate: undefined,
    residenceEndDate: undefined,
    residenceMonths: undefined,
    lthdHoldingPart: 0,
    lthdResidencePart: 0,
  };

  // settlement: 인가후 분 (§166①2호 가목, LTHD 없음)
  // 신고서 양식 표 표기:
  //   - 양도가액 = transferPrice (실제 입주권 양도가 전체)
  //   - 취득가액 = salePriceTotal (평가액 − 수령청산금 = §166①2호 가목 공제값)
  //   - 필요경비 = postApprovalExpenses
  //   - 양도차익 = postApprovalGain
  const settlementDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: transferPrice,                           // 실제 양도가 전체
    apportionedAcquisition: housingResult.salePriceTotal,         // 평가액 − 수령청산금
    gain: housingResult.postApprovalGain,
    holdingMonths: 0,                                             // LTHD 없음
    holdingDays: undefined,
    lthd: 0,
    lthdRate: 0,
    branchAcqDate: redevelopment.approvalDate,                    // 인가일~양도일
    branchTransferDate: transferDate,
    expenses: redevelopment.postApprovalExpenses ?? 0,
    residenceStartDate: undefined,
    residenceEndDate: undefined,
    residenceMonths: undefined,
    lthdHoldingPart: 0,
    lthdResidencePart: 0,
  };

  const totalGain = preApprovalDetail.gain + settlementDetail.gain; // postApproval=0
  const totalLthd = preApprovalDetail.lthd;                         // postApproval=0, settlement=0
  const taxableIncome = Math.max(0, totalGain - totalLthd);

  return {
    preApproval: preApprovalDetail,
    postApprovalExistingHouse: postApprovalDetail,
    settlement: settlementDetail,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome,
    },
    salePriceTotal: housingResult.salePriceTotal,
    receiveOnlyMode: undefined,
    valuationMeta: {
      method: "estimated_post_disclosure_decree_166_3",
      numerator: redevelopment.housingStdPriceAtAcq,
      // 개산공제 산식 표시 base — 100% PHD가 아니라 엔진이 실제로 쓴 지분 기준시가.
      lumpDeductionBase: computeLumpSumDeductionBase(
        redevelopment.housingStdPriceAtAcq ?? 0,
        input.ownershipRatio,
      ),
      denominator: redevelopment.housingStdPriceAtApproval,
      rationale:
        `§166③ 주택 환산취득가 = 권리가액 ${redevelopment.rightsValue.toLocaleString()}` +
        ` × 취득시PHD ${(redevelopment.housingStdPriceAtAcq ?? 0).toLocaleString()}` +
        ` / 인가시PHD ${(redevelopment.housingStdPriceAtApproval ?? 0).toLocaleString()}` +
        ` = ${housingResult.convertedAcquisition.toLocaleString()}` +
        ` / 개산공제 §163⑥ = ${computeLumpSumDeductionBase(redevelopment.housingStdPriceAtAcq ?? 0, input.ownershipRatio).toLocaleString()} × 3%` +
        ` = ${housingResult.estimatedDeduction.toLocaleString()}`,
    },
    estimatedLumpDeduction: housingResult.estimatedDeduction,
    // ── echo 필드 (UI 결과 카드 표시용) ──
    housingContribDetail: {
      convertedAcquisition: housingResult.convertedAcquisition,
      estimatedDeduction: housingResult.estimatedDeduction,
      housingStdPriceAtAcq: redevelopment.housingStdPriceAtAcq ?? 0,
      housingStdPriceAtApproval: redevelopment.housingStdPriceAtApproval ?? 0,
      preApprovalLTHD: housingResult.preApprovalLTHD,
      postApprovalLTHD: 0,
      lthdHoldingStartDate: housingResult.lthdHoldingStartDate,
      lthdHoldingEndDate: housingResult.lthdHoldingEndDate,
    },
  };
}

/**
 * 원조합원 분기 — 종전부동산 취득자 기준 §166 안분 산식.
 *
 * 본 함수는 사례 44~47의 기존 동작을 그대로 캡슐화한 것이며, runRedevelopment 의
 * 본문이 분기 라우팅을 받기 위해 추출되었다 (사례 48 승계조합원 도입 동반 리팩토링).
 * 함수명만 변경, 동작은 100% 동일 — 사례 44~47 회귀 anchor 보존.
 */
function runOriginalMember(
  input: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  const { redevelopment, acquisitionDate, transferDate } = input;

  // ─ Step 1: 3분할 양도차익 ─
  const split = computeRedevelopmentSplit(input);

  // ─ Step 2: 분기별 LTHD 보유기간·율 ─
  const lthd = computeRedevelopmentLthd({
    redevelopment,
    acquisitionDate,
    transferDate,
    isSuccessorRightToMoveIn: input.isSuccessorRightToMoveIn,
    isOneHouseSingle: input.isOneHouseSingle,
    residencePeriodMonths: input.residencePeriodMonths,
    priorHouseResidenceMonths: input.priorHouseResidenceMonths,
    newHouseResidenceMonths: input.newHouseResidenceMonths,
  });

  // ─ Step 3: 분기별 LTHD 금액 적용 (묶음 동일 율 — §166⑤2호나목 분배법칙 산술) ─
  //
  // 신고서 양식 표 표시용 메타(branchAcqDate·branchTransferDate·expenses·residence*·lthdHoldingPart·lthdResidencePart)
  // 도 함께 부착. §166⑤ 호별 기산일 정의:
  //   - subject="apt": 인가전·인가후 모두 취득일~신축양도일 (§166⑤2호나목 묶음 동일)
  //                    청산금분 = 인가일~신축양도일 (납부, §166⑤2호가목) 또는 취득일~settlementSaleDate (수령)
  //   - subject="right": 인가전 = 취득일~인가일 (§166⑤1호), 나머지 LTHD 대상 부존재
  const subject = redevelopment.subject;
  const isApt = subject === "apt";
  const isRight = subject === "right";

  // 신고서 표시용 거주기간 분배 — 인가전=prior, 인가후·청산금=new
  const priorResStart = redevelopment.priorResidenceStartDate;
  const priorResEnd = redevelopment.priorResidenceEndDate;
  const newResStart = redevelopment.newResidenceStartDate;
  const newResEnd = redevelopment.newResidenceEndDate;
  const priorMonths = redevelopment.priorHouseResidenceMonths;
  const newMonths = redevelopment.newHouseResidenceMonths;

  // 분기별 LTHD 금액 분리 헬퍼 — total = holdingPart + residencePart (분배법칙 보존)
  function splitLthdAmount(gainAmt: number, branch: typeof lthd.preApproval) {
    if (!branch.applicable || gainAmt <= 0 || branch.rate <= 0) {
      return { total: 0, holdingPart: 0, residencePart: 0 };
    }
    const total = applyLthdToGain(gainAmt, branch.rate);
    const holdingPart = applyLthdToGain(gainAmt, branch.holdingRate);
    const residencePart = total - holdingPart; // 잔여 = 거주분 (정수연산 보존)
    return { total, holdingPart, residencePart };
  }

  const preApprovalLthdAmt = splitLthdAmount(split.preApproval.gain, lthd.preApproval);
  const postApprovalLthdAmt = splitLthdAmount(split.postApprovalExistingHouse.gain, lthd.postApprovalExistingHouse);
  const settlementLthdAmt = splitLthdAmount(split.settlement.gain, lthd.settlement);

  // 인가전 분 표시용 필요경비 — 청산금 **수령** 분기는 §166①2호 나목 비율로 안분
  // (`apportionPreApprovalExpenses` 주석 참조 · 산식은 `redevelopment-settlement.ts:169`).
  // 납부 분기는 안분이 없어 원액이 그대로 정합이다.
  //
  // 🔴 2026-08-26 정정(E1-05 — **표시 전용**): 종전 게이트는 `isRight &&`가 붙어 있었고
  //    주석도 「완공APT 분기는 안분이 없어」라고 적었다. 그러나 `computeAptReceive`는
  //    완공APT **수령**에도 §166①2호 나목 안분을 그대로 적용한다(§166②2호 준용) —
  //    양도가액·취득가액·양도차익이 모두 축소되는데 필요경비만 원액으로 남아
  //    인가전 분 열이 어긋났다(실측 Δ5,000,000). 주석 자체가 오판의 근거였다.
  const rawPreApprovalExpenses = preApprovalNecessaryExpense(
    split.estimatedLumpDeduction ?? 0,
    redevelopment.preApprovalExpenses,
  );
  const preApprovalDisplayExpenses =
    redevelopment.settlementDirection === "receive"
      ? apportionPreApprovalExpenses(
          rawPreApprovalExpenses,
          split.preApproval.apportionedTransfer, // = 평가액 − 청산금 (splitReceive의 분자와 동일)
          redevelopment.rightsValue,
        )
      : rawPreApprovalExpenses;

  /**
   * 인가후 필요경비 **표시 몫** — 엔진이 한 번만 차감한 금액을 열에 나눠 붙인다.
   *
   * 🔴 2026-08-26 신설(E1-06 — **표시 전용**): 종전에는 인가후 기존주택분과 청산금분에
   *    **각각 원액**이 붙어 신고서 필요경비 열 합계가 정확히 2배가 됐다(실측 9,000,000 → 18,000,000).
   *
   * 분기별로 「엔진이 어디서 차감했는가」가 다르다 — 그 자리에만 붙인다:
   *
   * | 분기 | 차감 위치 | 표시 |
   * |---|---|---|
   * | 완공APT + 납부 | `splitAptPay` 이전 인가후양도차익에서 1회 → 평가액:청산금 비율로 갈림 | 같은 비율로 안분 |
   * | 완공APT + 수령 | `computeAptReceive`의 인가후 기존주택분에서만 | 기존주택분 전액 · 청산금분 0 |
   * | 완공APT + 수령(단독신고) | **차감 없음**(receiveOnly 조기반환이 값을 쓰지 않는다) | 양쪽 0 |
   * | 입주권 (납부·수령) | 청산금분(§166①1호·①2호 가목)에서 1회 | 청산금분 전액 (종전과 동일) |
   */
  const rawPostApprovalExpenses = redevelopment.postApprovalExpenses ?? 0;
  const postApprovalExpenseShare = ((): { existingHouse: number; settlement: number } => {
    if (!isApt) return { existingHouse: 0, settlement: rawPostApprovalExpenses };
    if (redevelopment.receiveOnlyMode === true) return { existingHouse: 0, settlement: 0 };
    if (redevelopment.settlementDirection === "receive") {
      return { existingHouse: rawPostApprovalExpenses, settlement: 0 };
    }
    // §166②1호 — 분양가 = 평가액 + 납부청산금. floor 잔차는 청산금분이 흡수한다
    // (`splitAptPay`의 양도차익 분할과 같은 규약 — memory `feedback_floor_residual_absorption`).
    const salePriceTotal = redevelopment.rightsValue + redevelopment.settlementAmount;
    if (salePriceTotal <= 0) return { existingHouse: rawPostApprovalExpenses, settlement: 0 };
    const existingHouse = safeMultiplyThenDivide(
      rawPostApprovalExpenses,
      redevelopment.rightsValue,
      salePriceTotal,
    );
    return { existingHouse, settlement: rawPostApprovalExpenses - existingHouse };
  })();

  const preApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: split.preApproval.apportionedTransfer,
    apportionedAcquisition: split.preApproval.apportionedAcquisition,
    gain: split.preApproval.gain,
    holdingMonths: lthd.preApproval.holdingMonths,
    holdingDays: lthd.preApproval.holdingDays,
    lthd: preApprovalLthdAmt.total,
    lthdRate: lthd.preApproval.applicable ? lthd.preApproval.rate : 0,
    branchAcqDate: acquisitionDate,
    branchTransferDate: isRight ? redevelopment.approvalDate : transferDate,
    expenses: preApprovalDisplayExpenses,
    residenceStartDate: priorResStart,
    residenceEndDate: priorResEnd,
    residenceMonths: priorMonths,
    lthdHoldingPart: preApprovalLthdAmt.holdingPart,
    lthdResidencePart: preApprovalLthdAmt.residencePart,
  };

  // 인가후 기존건물분 거주기간 — §154⑧ 통산 (prior + new)
  // 표시용 거주월수만 통산 적용. 입주일·퇴거일은 종전·신축 어느 한쪽도 단독 대표값이 아니므로 미부착.
  const postApprovalResidenceMonths =
    priorMonths !== undefined || newMonths !== undefined
      ? (priorMonths ?? 0) + (newMonths ?? 0)
      : undefined;

  const postApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: split.postApprovalExistingHouse.apportionedTransfer,
    apportionedAcquisition: split.postApprovalExistingHouse.apportionedAcquisition,
    gain: split.postApprovalExistingHouse.gain,
    holdingMonths: lthd.postApprovalExistingHouse.holdingMonths,
    holdingDays: lthd.postApprovalExistingHouse.holdingDays,
    lthd: postApprovalLthdAmt.total,
    lthdRate: lthd.postApprovalExistingHouse.applicable
      ? lthd.postApprovalExistingHouse.rate
      : 0,
    branchAcqDate: isApt ? acquisitionDate : undefined,
    branchTransferDate: isApt ? transferDate : undefined,
    expenses: postApprovalExpenseShare.existingHouse,
    // 인가후 분 입주일 = 종전주택 입주일 (없으면 신축주택 입주일 fallback)
    // 인가후 분 퇴거일 = 신축주택 퇴거일 (없으면 종전주택 퇴거일 fallback)
    // §154⑧ 통산 거주 — 가장 이른 입주~가장 늦은 퇴거 구간 표시.
    residenceStartDate: isApt ? (priorResStart || newResStart) : undefined,
    residenceEndDate: isApt ? (newResEnd || priorResEnd) : undefined,
    residenceMonths: isApt ? postApprovalResidenceMonths : undefined,
    lthdHoldingPart: postApprovalLthdAmt.holdingPart,
    lthdResidencePart: postApprovalLthdAmt.residencePart,
  };

  // 청산금분 기산일
  //   - 완공APT(isApt): 납부=인가일~양도일, 수령=취득일~settlementSaleDate
  //   - 입주권(isRight): 인가일~양도일 (납부·수령 공통)
  //
  // 입주권은 종전에 `isApt ? ... : undefined`라 일자가 비어 신고서 인가후 분 열의
  // 취득일자·양도일자가 "-"로 표시됐다(2026-08-13 제보 — 실가 모드에서 노출).
  // 환산 경로는 이미 인가일~양도일을 넣고 있어(`:293·294`, `:457·458`) 같은 값으로 맞춘다.
  // §166①2호 가목의 인가후 분은 인가일 이후 기간이다(LTHD 미적용은 §95② 단서 — 일자 표시와 별개).
  const settlementAcqDate = isApt
    ? redevelopment.settlementDirection === "pay"
      ? redevelopment.approvalDate
      : acquisitionDate
    : isRight
      ? redevelopment.approvalDate
      : undefined;
  const settlementTransferDate = isApt
    ? redevelopment.settlementDirection === "pay"
      ? transferDate
      : (redevelopment.settlementSaleDate ?? transferDate)
    : isRight
      ? transferDate
      : undefined;

  const settlementDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: split.settlement.apportionedTransfer,
    apportionedAcquisition: split.settlement.apportionedAcquisition,
    gain: split.settlement.gain,
    holdingMonths: lthd.settlement.holdingMonths,
    holdingDays: lthd.settlement.holdingDays,
    lthd: settlementLthdAmt.total,
    lthdRate: lthd.settlement.applicable ? lthd.settlement.rate : 0,
    branchAcqDate: settlementAcqDate,
    branchTransferDate: settlementTransferDate,
    // §166①2호 가목(입주권): 인가후 분 필요경비 전액 · 완공APT는 위 `postApprovalExpenseShare` 참조
    expenses: postApprovalExpenseShare.settlement,
    residenceStartDate: isApt ? newResStart : undefined,
    residenceEndDate: isApt ? newResEnd : undefined,
    residenceMonths: isApt ? newMonths : undefined,
    lthdHoldingPart: settlementLthdAmt.holdingPart,
    lthdResidencePart: settlementLthdAmt.residencePart,
  };

  // ─ Step 4: 합계 ─
  const totalGain = preApprovalDetail.gain + postApprovalDetail.gain + settlementDetail.gain;
  const totalLthd = preApprovalDetail.lthd + postApprovalDetail.lthd + settlementDetail.lthd;
  const taxableIncome = Math.max(0, totalGain - totalLthd);

  return {
    preApproval: preApprovalDetail,
    postApprovalExistingHouse: postApprovalDetail,
    settlement: settlementDetail,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome,
    },
    salePriceTotal: split.salePriceTotal,
    receiveOnlyMode: redevelopment.receiveOnlyMode === true ? true : undefined,
    valuationMeta: split.valuationMeta,
    estimatedLumpDeduction: split.estimatedLumpDeduction,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Re-export 편의용
// ──────────────────────────────────────────────────────────────────────────────

// 분기 활성 판정·finalize emit 빌더는 `redevelopment-dispatch.ts`로 분리됐다(2026-08-23, 800줄 정책).
// 기존 import 경로를 유지하기 위해 여기서 re-export한다.
export { isRedevelopmentActive, buildLthdEmitLines } from "./redevelopment-dispatch";
export type { RedevelopmentLthdEmitLine } from "./redevelopment-dispatch";

export type { RedevelopmentInfo, RedevelopmentResult, RedevelopmentBranchDetail } from "./types/transfer-redevelopment.types";
export { computeRedevelopmentValuation } from "./redevelopment-valuation";
export { computeRedevelopmentSplit } from "./redevelopment-split";
export { computeRedevelopmentLthd } from "./redevelopment-lthd";
export { computeSalePriceTotal, computeSettlementPreview } from "./redevelopment-settlement";
