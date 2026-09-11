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
  type RedevelopmentSplitInput,
} from "./redevelopment-split";
import { runSuccessorMember } from "./redevelopment-successor";
import { scaleRedevelopmentForBurdenedGift } from "./redevelopment-burdened-gift";
import {
} from "./redevelopment-land-contribution";
import {
} from "./redevelopment-housing-contribution";
import type {
  RedevelopmentResult,
} from "./types/transfer-redevelopment.types";

import { isHousingContribEstimatedAxes } from "./redevelopment-branch-gate";
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
  rawInput: RedevelopmentOrchestratorInput,
): RedevelopmentResult {
  /**
   * ─ Step 0: 부담부증여 β 스케일 (소령 §159 × §166) ─
   *
   * **모든 분기보다 먼저** 한 번만 적용한다. 승계조합원·주택출자환산·토지출자환산 셋은
   * `computeRedevelopmentSplit`보다 **앞에서 조기 반환**하므로, 스케일을 split 안에 두면
   * 그 세 경로에 도달하지 않는다.
   *
   * `debtRatio`가 없으면 `rawInput`을 그대로 돌려받는다 — 일반 양도 경로는 무변경이다.
   */
  const scaledRedevelopment = scaleRedevelopmentForBurdenedGift(
    rawInput.redevelopment,
    rawInput.debtRatio,
  );
  /**
   * §166③ 환산 분기는 부담부증여에서 **점화되지 않는다** —
   * `transfer-tax-burdened-gift-step.ts`가 `useEstimatedAcquisition: false`를 강제한다.
   * 그 전제가 깨지면 기준시가(비율항)는 물건 전체인데 평가액(절대항)만 줄어들어 환산 산식이
   * 조용히 틀린다 ⇒ 통과시키지 않고 여기서 멈춘다.
   */
  if (rawInput.debtRatio !== undefined && rawInput.debtRatio !== 1 && rawInput.useEstimatedAcquisition) {
    throw new Error(
      "[redev-burdened-gift] 부담부증여에서 §166③ 환산 분기는 지원하지 않습니다 — " +
        "취득가액은 소령 §159①1호가 정하는 값(기준시가 또는 실지거래가액)을 채무비율로 안분합니다.",
    );
  }
  const input: RedevelopmentOrchestratorInput =
    scaledRedevelopment === rawInput.redevelopment
      ? rawInput
      : { ...rawInput, redevelopment: scaledRedevelopment };

  // 사례 48 — 승계조합원 분기 (관리처분 후 입주권 승계 → 신축APT 양도).
  // §166 안분 우회 + 준공일 기산 LTHD/세율 (사전-2019-법령해석재산-0649).
  if (input.redevelopment.isSuccessorMember === true) {
    return runSuccessorMember(input);
  }

  // 사례 39 — 주택 출자 입주권 + 청산금 수령 + §166③ PHD 2-point 환산취득가 분기.
  // 구분 조건: housingStdPriceAtAcq + housingStdPriceAtApproval (PHD 직접 입력)를 사용.
  // ※ 사례 36-A2-ii(managementDisposalHousingPrice+acquisitionHousingPrice 사용 §166③ 경로)와 다름.
  // 네 축은 공용 leaf가 판정한다(⑤ UI · ⑧ validate · ⑫ Zod와 동일 — E1-04).
  // PHD 2필드 > 0은 **엔진 고유 조건**이다 — 값이 있어야 §166③ 산식을 돌릴 수 있다.
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


export interface RedevelopmentOrchestratorInput extends RedevelopmentSplitInput {
  /** 입주권 양도 시 승계조합원 여부 (§95② 본문 괄호 — LTHD 0) */
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
  /**
   * 부담부증여 채무비율 `r = B/C` (소령 §159①) — **β 스케일**.
   *
   * 미전달·`1`이면 아무 것도 바뀌지 않는다(일반 양도). 값이 오면 §166 산식의 절대 금액항
   * (평가액·청산금·인가전후 필요경비)을 `r`배로 줄여 §159가 이미 안분한 취득가액·양도가액과
   * **스케일을 맞춘다**. 근거·적용 범위는 `redevelopment-burdened-gift.ts` 헤더.
   *
   * ⚠️ `ownershipRatio`(공유지분)와 **독립**이다 — `scaleBurdenedGiftInfo`가 평가액·채무액을
   *    먼저 지분분으로 줄이므로 `B/C`는 지분 중립이고, 두 비율은 서로 다른 축이다.
   */
  debtRatio?: number;
}

// 800줄 분리 — 분기 실행부 3개 + 전용 헬퍼 2개는 `redevelopment-branches.ts` 로 이동했다.
import {
  runLandContribEstimated,
  runHousingContribReceiveEstimated,
  runOriginalMember,
} from "./redevelopment-branches";

// 공개 API 재export — 분리 전 import 사이트 보존.
export { isRedevelopmentActive, buildLthdEmitLines } from "./redevelopment-dispatch";
