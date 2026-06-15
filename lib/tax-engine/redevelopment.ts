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

import {
  computeRedevelopmentSplit,
  type RedevelopmentSplitInput,
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

  // 사례 39 — 주택 출자 입주권 + 청산금 수령 + §164⑤ PHD 2-point 환산취득가 분기.
  // 구분 조건: housingStdPriceAtAcq + housingStdPriceAtApproval (PHD 직접 입력)를 사용.
  // ※ 사례 36-A2-ii(managementDisposalHousingPrice+acquisitionHousingPrice 사용 §166③ 경로)와 다름.
  if (
    input.redevelopment.originalAssetType === "housing" &&
    input.redevelopment.subject === "right" &&
    input.redevelopment.settlementDirection === "receive" &&
    input.useEstimatedAcquisition === true &&
    (input.redevelopment.housingStdPriceAtAcq ?? 0) > 0 &&
    (input.redevelopment.housingStdPriceAtApproval ?? 0) > 0
  ) {
    return runHousingContribReceiveEstimated(input);
  }

  // 사례 37 — 토지 출자 입주권 + 환산취득가 분기.
  // originalAssetType="land" + useEstimatedAcquisition=true 시 §166③ 공시지가 환산 산식 적용.
  // (주택 출자 환산과 별개 공식 — managementDisposalHousingPrice 대신 landStdPriceAt* 사용)
  if (
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
  });

  // ─ RedevelopmentBranchDetail 로 변환 ─
  // preApproval: 인가전 분 (LTHD 적용)
  const preApprovalDetail: RedevelopmentBranchDetail = {
    apportionedTransfer: redevelopment.rightsValue,             // 의제 양도가액 = 권리가액
    apportionedAcquisition: landResult.convertedAcquisition,    // §166③ 환산취득가
    gain: landResult.preApprovalGain,
    holdingMonths: Math.floor(
      // 취득일 ~ 인가일 보유월수 (§166⑤1호)
      // computeRightLthd 내부 동일 로직 — lthdResult.preApproval.holdingMonths 재사용 불가(직접 접근)
      // landResult.lthdHoldingYears × 12 는 연단위 절사 — 월단위 재산출 필요
      // → redevelopment-lthd.ts computeRightLthd 결과에서 가져오는 것이 일치성 보장
      // 단, import 순환 방지 위해 landResult.lthdHoldingYears × 12 사용 (표1 공제율 결정에 충분)
      landResult.lthdHoldingYears * 12,
    ),
    holdingDays: undefined,
    lthd: landResult.preApprovalLTHD,
    lthdRate: landResult.lthdRate,
    branchAcqDate: acquisitionDate,
    branchTransferDate: redevelopment.approvalDate,             // §166⑤1호 종기 = 인가일
    expenses: landResult.estimatedDeduction + (redevelopment.preApprovalExpenses ?? 0), // 개산공제 + 인가전필요경비
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
      denominator: redevelopment.landStdPriceAtApproval,
      rationale: `§166③ 토지 환산취득가 = 권리가액 ${redevelopment.rightsValue.toLocaleString()} × 취득시공시지가 ${(redevelopment.landStdPriceAtAcq ?? 0).toLocaleString()} / 인가시공시지가 ${(redevelopment.landStdPriceAtApproval ?? 0).toLocaleString()} = ${landResult.convertedAcquisition.toLocaleString()} / 개산공제 §163⑥ = ${landResult.estimatedDeduction.toLocaleString()}`,
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
 * 주택 출자 입주권(right+receive) 환산취득가 분기 — §164⑤ PHD 비율 환산.
 *
 * calcRedevHousingContribReceiveEstimated 결과를 RedevelopmentResult 형태로 변환.
 * 3분할 구조 유지 (preApproval / postApprovalExistingHouse / settlement):
 *   - preApproval  : 인가전 분 (§166①2호 나목 + §164⑤ 환산, LTHD 표1 적용)
 *   - postApproval : gain=0, lthd=0 (§95② 별표2 [비고] 1호 — 입주권 §94①2호 자산)
 *   - settlement   : 인가후 분 (§166①2호 가목, LTHD 없음)
 *
 * 법령 근거:
 *   §164⑤  : 환산취득가 = floor(권리가액 × 취득당시PHD / 인가당시PHD)
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
  });

  // ─ RedevelopmentBranchDetail 로 변환 ─
  // preApproval: 인가전 분 (§166①2호 나목, LTHD 적용)
  const preApprovalDetail: RedevelopmentBranchDetail = {
    // 의제양도가액 = salePriceTotal (평가액 − 수령청산금)
    apportionedTransfer: housingResult.preApprovalApportionedTransfer,
    // 취득가액 안분 = floor(환산취득가 × salePriceTotal / 권리가액)
    apportionedAcquisition: housingResult.preApprovalApportionedAcquisition,
    gain: housingResult.preApprovalGain,
    holdingMonths: Math.floor(housingResult.lthdHoldingYears * 12),
    holdingDays: undefined,
    lthd: housingResult.preApprovalLTHD,
    lthdRate: housingResult.lthdRate,
    branchAcqDate: acquisitionDate,
    branchTransferDate: redevelopment.approvalDate,   // §166⑤1호 종기 = 인가일
    // 필요경비 = 개산공제 + 인가전필요경비 (신고서 양식 표 표시용)
    expenses:
      housingResult.estimatedDeduction +
      (redevelopment.preApprovalExpenses ?? 0),
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
      denominator: redevelopment.housingStdPriceAtApproval,
      rationale:
        `§164⑤ 주택 환산취득가 = 권리가액 ${redevelopment.rightsValue.toLocaleString()}` +
        ` × 취득시PHD ${(redevelopment.housingStdPriceAtAcq ?? 0).toLocaleString()}` +
        ` / 인가시PHD ${(redevelopment.housingStdPriceAtApproval ?? 0).toLocaleString()}` +
        ` = ${housingResult.convertedAcquisition.toLocaleString()}` +
        ` / 개산공제 §163⑥ = ${housingResult.estimatedDeduction.toLocaleString()}`,
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
    expenses: redevelopment.preApprovalExpenses + (split.estimatedLumpDeduction ?? 0),
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
    expenses: isApt ? (redevelopment.postApprovalExpenses ?? 0) : 0,
    // 인가후 분 입주일 = 종전주택 입주일 (없으면 신축주택 입주일 fallback)
    // 인가후 분 퇴거일 = 신축주택 퇴거일 (없으면 종전주택 퇴거일 fallback)
    // §154⑧ 통산 거주 — 가장 이른 입주~가장 늦은 퇴거 구간 표시.
    residenceStartDate: isApt ? (priorResStart || newResStart) : undefined,
    residenceEndDate: isApt ? (newResEnd || priorResEnd) : undefined,
    residenceMonths: isApt ? postApprovalResidenceMonths : undefined,
    lthdHoldingPart: postApprovalLthdAmt.holdingPart,
    lthdResidencePart: postApprovalLthdAmt.residencePart,
  };

  // 청산금분 기산일: 납부=인가일~양도일, 수령=취득일~settlementSaleDate
  const settlementAcqDate = isApt
    ? redevelopment.settlementDirection === "pay"
      ? redevelopment.approvalDate
      : acquisitionDate
    : undefined;
  const settlementTransferDate = isApt
    ? redevelopment.settlementDirection === "pay"
      ? transferDate
      : (redevelopment.settlementSaleDate ?? transferDate)
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
    expenses: redevelopment.postApprovalExpenses ?? 0, // §166①2호 가목: 인가후 분 필요경비 (양도비·자본적지출)
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
// finalize 입력 빌더 — transfer-tax-finalize.ts LTHD 3줄 emit 용
// ──────────────────────────────────────────────────────────────────────────────

/**
 * finalize emit 용 LTHD 라인 3줄 산출.
 * code === 'LTHD' 라인 ID + 금액·율·gain·holdingMonths 노출.
 *
 * FilingFormTable 3열 표시와 1:1 매칭되어야 함 (anchor: lines.length === 3).
 */
export interface RedevelopmentLthdEmitLine {
  lineId: "preApproval" | "postApprovalExistingHouse" | "settlement";
  code: "LTHD";
  gain: number;
  rate: number;
  amount: number;
  holdingMonths: number;
  applicable: boolean;
}

export function buildLthdEmitLines(result: RedevelopmentResult): RedevelopmentLthdEmitLine[] {
  // 사례 48 — 승계조합원 분기: postApprovalExistingHouse 단일 line emit.
  if (result.successorMemberApplied === true) {
    return [
      {
        lineId: "postApprovalExistingHouse",
        code: "LTHD",
        gain: result.postApprovalExistingHouse.gain,
        rate: result.postApprovalExistingHouse.lthdRate,
        amount: result.postApprovalExistingHouse.lthd,
        holdingMonths: result.postApprovalExistingHouse.holdingMonths,
        applicable:
          result.postApprovalExistingHouse.lthd > 0 ||
          result.postApprovalExistingHouse.gain > 0,
      },
    ];
  }

  return [
    {
      lineId: "preApproval",
      code: "LTHD",
      gain: result.preApproval.gain,
      rate: result.preApproval.lthdRate,
      amount: result.preApproval.lthd,
      holdingMonths: result.preApproval.holdingMonths,
      applicable: result.preApproval.lthd > 0 || result.preApproval.gain > 0,
    },
    {
      lineId: "postApprovalExistingHouse",
      code: "LTHD",
      gain: result.postApprovalExistingHouse.gain,
      rate: result.postApprovalExistingHouse.lthdRate,
      amount: result.postApprovalExistingHouse.lthd,
      holdingMonths: result.postApprovalExistingHouse.holdingMonths,
      applicable:
        result.postApprovalExistingHouse.lthd > 0 ||
        result.postApprovalExistingHouse.gain > 0,
    },
    {
      lineId: "settlement",
      code: "LTHD",
      gain: result.settlement.gain,
      rate: result.settlement.lthdRate,
      amount: result.settlement.lthd,
      holdingMonths: result.settlement.holdingMonths,
      applicable: result.settlement.lthd > 0 || result.settlement.gain > 0,
    },
  ];
}

// ──────────────────────────────────────────────────────────────────────────────
// 활성 분기 판정 (transfer-tax.ts STEP 분기용)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * TransferTaxInput.redevelopment 존재 + propertyType 호환 여부 판정.
 *
 * propertyType="redevelopment_apt" 또는 "right_to_move_in" + redevelopment 입력 시 활성.
 * 그 외는 false → transfer-tax.ts 의 일반 분기 사용.
 */
export function isRedevelopmentActive(
  propertyType: string,
  redevelopment: RedevelopmentInfo | undefined,
): boolean {
  if (redevelopment == null) return false;
  if (propertyType === "redevelopment_apt") return redevelopment.subject === "apt";
  if (propertyType === "right_to_move_in") return redevelopment.subject === "right";
  return false;
}

// ──────────────────────────────────────────────────────────────────────────────
// Re-export 편의용
// ──────────────────────────────────────────────────────────────────────────────

export type { RedevelopmentInfo, RedevelopmentResult, RedevelopmentBranchDetail } from "./types/transfer-redevelopment.types";
export { computeRedevelopmentValuation } from "./redevelopment-valuation";
export { computeRedevelopmentSplit } from "./redevelopment-split";
export { computeRedevelopmentLthd } from "./redevelopment-lthd";
export { computeSalePriceTotal, computeSettlementPreview } from "./redevelopment-settlement";
