/**
 * 재개발/재건축 — **결과 변환 · steps emit** 헬퍼
 *
 * `transfer-tax-redevelopment.ts` 800줄 정책 분리 (2026-08-25 · 811줄에서 분리).
 * 오케스트레이터(`calculateRedevelopmentTax`)가 순서대로 호출하는 순수 변환 함수들이다:
 *
 *   A.5 `applyHighValueAllocation`  — §95③ 12억 초과 안분
 *   A.6 `applySettlementExemption`  — 청산금 수령분 1세대1주택 비과세 차감
 *   A.7 `applyOneRightExemption`    — §89①4호 가목 1세대1입주권 비과세
 *   A.8 `applyLthdExclusion`        — §95② 다주택 중과 시 장특공제 배제
 *   B   `emitRedevelopmentSteps`    — 분기별 양도차익·LTHD steps
 *
 * ⚠️ **호출 순서가 계약이다** — A.5의 안분 결과 위에 A.6·A.7이 얹히고, A.8은 그 전부를 0으로
 *    덮는다. 순서를 바꾸면 안분 비율이 배제 후 값에 적용된다.
 */

import { REDEVELOPMENT } from "./legal-codes";
import type {
  TransferTaxInput,
  RedevelopmentResult,
  RedevelopmentBranchDetail,
  CalculationStep,
} from "./types/transfer.types";

/** §95③·영 §160 고가주택 기준 — 오케스트레이터와 **같은 값을 쓴다**(양쪽 하드코딩 금지). */
export const HIGH_VALUE_THRESHOLD = 1_200_000_000;

/**
 * §95② 배제 — 분기 3개와 합계의 LTHD를 **함께** 0으로 만든다.
 *
 * 양도소득금액(`taxableIncome = gain − lthd`)도 다시 계산해야 한다 — 그러지 않으면
 * 「공제는 0인데 소득금액은 공제 후 값」이라는 모순이 과세표준까지 흘러간다.
 * 보유분/거주분(`lthdHoldingPart`·`lthdResidencePart`)은 값이 있을 때만 0으로 덮는다
 * (undefined를 0으로 바꾸면 「분해 없음」이 「분해했는데 0」으로 뜻이 바뀐다).
 */
export function applyLthdExclusion(r: RedevelopmentResult): RedevelopmentResult {
  const zeroBranch = (b: RedevelopmentBranchDetail): RedevelopmentBranchDetail => ({
    ...b,
    lthd: 0,
    lthdRate: 0,
    ...(b.lthdHoldingPart !== undefined ? { lthdHoldingPart: 0 } : {}),
    ...(b.lthdResidencePart !== undefined ? { lthdResidencePart: 0 } : {}),
  });
  return {
    ...r,
    preApproval: zeroBranch(r.preApproval),
    postApprovalExistingHouse: zeroBranch(r.postApprovalExistingHouse),
    settlement: zeroBranch(r.settlement),
    total: { ...r.total, lthd: 0, taxableIncome: r.total.gain },
  };
}

/**
 * 1세대1주택 + 양도가액 > 12억 시 분기별 양도차익·LTHD 를 과세대상으로 축소.
 *
 * 산식 (시행령 §160):
 *   taxableRatio  = (transferPrice − 12억) / transferPrice
 *   branchTaxableGain = floor(branchGain × taxableRatio)
 *   branchTaxableLthd = floor(branchTaxableGain × branchRate)
 *
 * 분기별로 floor 적용 — 양도코리아 xlsx 결과 일치 (xlsx D17·E17·F17 각각 분기별 산정 후 합산).
 *
 * @param redevRaw runRedevelopment 결과 (분기별 gain·lthd 가 전체 양도차익 기준)
 * @param transferPrice 양도가액 (양도가액 - 12억 비율 산정용)
 * @param redevInfo 입력 redevelopment (lthdResidenceAttribution 부착용)
 */
export function applyHighValueAllocation(
  redevRaw: RedevelopmentResult,
  transferPrice: number,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
): RedevelopmentResult {
  const taxableRatio = (transferPrice - HIGH_VALUE_THRESHOLD) / transferPrice;
  const nontaxableThreshold = HIGH_VALUE_THRESHOLD;

  // 분기별 과세대상 양도차익·LTHD 산정 (정수연산 — 분기별 floor)
  const scaleBranch = (branch: RedevelopmentResult["preApproval"]) => {
    if (branch.gain <= 0) {
      return { ...branch, gainBeforeAllocation: branch.gain, nontaxableGain: 0 };
    }
    const originalGain = branch.gain;
    const taxableGain = Math.floor(originalGain * taxableRatio);
    const nontaxableGain = originalGain - taxableGain; // 정수연산 보존: 비과세 = 안분 전 - 과세대상
    const taxableLthd = branch.lthdRate > 0 ? Math.floor(taxableGain * branch.lthdRate) : 0;
    // 12억 안분 후 보유분/거주분 비율은 lthdHoldingPart/lthd 비율로 보존
    const hasSplit = branch.lthdHoldingPart !== undefined || branch.lthdResidencePart !== undefined;
    let taxableHoldingPart: number | undefined;
    let taxableResidencePart: number | undefined;
    if (hasSplit && taxableLthd > 0) {
      const holdingFraction = branch.lthd > 0 ? (branch.lthdHoldingPart ?? 0) / branch.lthd : 1;
      taxableHoldingPart = Math.floor(taxableLthd * holdingFraction);
      taxableResidencePart = taxableLthd - taxableHoldingPart;
    } else if (hasSplit) {
      taxableHoldingPart = 0;
      taxableResidencePart = 0;
    }
    return {
      ...branch,
      gain: taxableGain,
      lthd: taxableLthd,
      gainBeforeAllocation: originalGain,
      nontaxableGain,
      ...(hasSplit ? { lthdHoldingPart: taxableHoldingPart, lthdResidencePart: taxableResidencePart } : {}),
    };
  };

  const preApproval = scaleBranch(redevRaw.preApproval);
  const postApprovalExistingHouse = scaleBranch(redevRaw.postApprovalExistingHouse);
  const settlement = scaleBranch(redevRaw.settlement);

  const totalGain = preApproval.gain + postApprovalExistingHouse.gain + settlement.gain;
  const totalLthd = preApproval.lthd + postApprovalExistingHouse.lthd + settlement.lthd;
  const taxableIncome = totalGain - totalLthd;

  // 12억 안분 메타 (UI·결과카드 표시용)
  const nontaxableGain = redevRaw.total.gain - Math.floor(redevRaw.total.gain * taxableRatio);
  const taxableGainTotal = Math.floor(redevRaw.total.gain * taxableRatio);

  // LTHD 거주월수 귀속 메타 (사전법령해석재산 2020-386 + §154⑧ 노출)
  const prior = redevInfo.priorHouseResidenceMonths ?? 0;
  const newMonths = redevInfo.newHouseResidenceMonths ?? 0;
  const existingResidenceMonths =
    redevInfo.priorHouseResidenceMonths !== undefined || redevInfo.newHouseResidenceMonths !== undefined
      ? prior + newMonths
      : 0;
  const payResidenceMonths =
    redevInfo.priorHouseResidenceMonths !== undefined || redevInfo.newHouseResidenceMonths !== undefined
      ? newMonths
      : 0;

  return {
    ...redevRaw,
    preApproval,
    postApprovalExistingHouse,
    settlement,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome,
    },
    highValueAllocation: {
      nontaxableGain,
      taxableGain: taxableGainTotal,
      taxableRatio,
      nontaxableThreshold,
    },
    lthdResidenceAttribution: {
      existingResidenceMonths,
      payResidenceMonths,
      existingTable: preApproval.lthdRate > 0.30 ? "table2" : "table1",
      payTable: settlement.lthdRate > 0.30 ? "table2" : "table1",
      ...(redevInfo.priorResidenceStartDate && redevInfo.priorResidenceEndDate
        ? {
            priorPeriod: {
              start: redevInfo.priorResidenceStartDate,
              end: redevInfo.priorResidenceEndDate,
            },
          }
        : {}),
      ...(redevInfo.newResidenceStartDate && redevInfo.newResidenceEndDate
        ? {
            newPeriod: {
              start: redevInfo.newResidenceStartDate,
              end: redevInfo.newResidenceEndDate,
            },
          }
        : {}),
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — Step A.6 사례 47 settlement 비과세 차감
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 47 (신축APT 양도 + 청산금 수령 동시신고) settlement 분기 비과세 차감.
 *
 * PDF 사례수정 2 (2)-1번 주석:
 *   "청산금 수령액은 기존부동산이 비과세 요건을 갖추었고 관리처분계획인가일 현재
 *    기존부동산 평가액이 12억원 이하이므로 고가주택에 해당하지 않아 비과세된다."
 *
 * 근거: 서면2016-법령해석재산-2705 (비과세 판정 시점 = 관리처분계획인가일)
 *
 * 트리거 (AND):
 *   1. settlementDirection === "receive"
 *   2. exemptionEligibleAtApproval === true (인가일 기준 1세대1주택 비과세 요건 충족)
 *   3. rightsValue ≤ HIGH_VALUE_THRESHOLD (1,200,000,000)
 *   4. receiveOnlyMode !== true (사례 46 단독신고는 별도 분기 — 본 함수 미적용)
 *   5. isOneHouseSingle === true (LTHD 표2 진입 가드)
 *
 * 동작:
 *   - 3분기 gainAfterAllocation·lthdAfterAllocation 모두 보존 (안분 후 trace)
 *   - settlement.gain → 0 마스킹 (totalGain 재계산용)
 *   - settlement.lthd → 0 마스킹 (totalLthd 재계산용)
 *   - exemptedGain/exemptedLthd 메타 분리 저장
 *   - settlementExemptionApplied = true 플래그
 *
 * 미적용 케이스에서는 redev 입력 그대로 반환 (회귀 안전).
 */
export function applySettlementExemption(
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  isOneHouseSingle: boolean,
): RedevelopmentResult {
  // 트리거 조건 검사
  if (
    redevInfo.settlementDirection !== "receive" ||
    redevInfo.exemptionEligibleAtApproval !== true ||
    redevInfo.rightsValue > HIGH_VALUE_THRESHOLD ||
    redevInfo.receiveOnlyMode === true ||
    !isOneHouseSingle
  ) {
    return redev;
  }

  const exemptedGain = redev.settlement.gain;
  const exemptedLthd = redev.settlement.lthd;

  // settlement 마스킹 + 3분기 안분 후 값 trace 보존
  const newPreApproval = {
    ...redev.preApproval,
    gainAfterAllocation: redev.preApproval.gain,
    lthdAfterAllocation: redev.preApproval.lthd,
  };
  const newPostApprovalExistingHouse = {
    ...redev.postApprovalExistingHouse,
    gainAfterAllocation: redev.postApprovalExistingHouse.gain,
    lthdAfterAllocation: redev.postApprovalExistingHouse.lthd,
  };
  const newSettlement = {
    ...redev.settlement,
    gainAfterAllocation: redev.settlement.gain,
    lthdAfterAllocation: redev.settlement.lthd,
    gain: 0,
    lthd: 0,
  };

  // total 재계산 (settlement 마스킹 반영)
  const totalGain =
    newPreApproval.gain + newPostApprovalExistingHouse.gain + newSettlement.gain;
  const totalLthd =
    newPreApproval.lthd + newPostApprovalExistingHouse.lthd + newSettlement.lthd;

  return {
    ...redev,
    preApproval: newPreApproval,
    postApprovalExistingHouse: newPostApprovalExistingHouse,
    settlement: newSettlement,
    total: {
      gain: totalGain,
      lthd: totalLthd,
      taxableIncome: totalGain - totalLthd,
    },
    settlementExemptionApplied: true,
    exemptedGain,
    exemptedLthd,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — Step A.7 사례 36 1세대1입주권 비과세 (§89①4호 가목)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 사례 36 — §89①4호 가목 1세대1입주권 비과세 게이트.
 *
 * 트리거 (AND 4조건):
 *   1. subject === "right"  ◀── 사례 45/47 (apt) 경로 완전 격리
 *   2. exemptionEligibleAtApproval === true  ◀── 기존 필드 재사용 (사례 47 도입)
 *      (인가일 기준 종전주택 §89①3호 가목 요건 충족 — 사용자 자기선언)
 *   3. householdHousingCount === 0 AND householdRightCount === 1
 *      (양도일 현재 다른 주택 없음 + 1입주권만 — §89①4호 가목 본문)
 *   4. isOneHousehold === true
 *
 * 동작:
 *   - transferPrice ≤ 12억 → 3분기 모두 gain/lthd 0 마스킹 → 산출세액 0 (전액 비과세)
 *     → oneRightExemptionApplied = true
 *   - transferPrice > 12억 → §89①4호 가목 단서 + §95③ 안분
 *     → taxableRatio × 각 분기 gain/lthd 보존, 비과세분 마스킹
 *     → oneRightHighValueApplied = true
 *
 * 법령 근거:
 *   - 소득세법 §89①4호 가목 본문: 1세대1입주권 비과세
 *   - 소득세법 §89①4호 가목 단서: 12억 초과 시 안분과세
 *   - 소득세법 §95③ + 시행령 §160: 안분 산식 (taxableRatio = (양도가 − 12억) / 양도가)
 *   - 시행령 §154: 1세대 범위
 *
 * 국세청 해석례 근거 (분모 = transferPrice 단일 — 해석 A):
 *   - "고가주택에 해당하는 조합원입주권 양도차익 산정방법" (국세청, 2010.11.01)
 *   - "1세대1주택인 고가주택의 입주권을 양도하는 경우 양도차익 산정방법" (국세청, 2008.01.10)
 *   (링크: https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000144597)
 *
 * 미적용 케이스에서는 redev 입력 그대로 반환 (회귀 안전).
 * subject="right" 가드로 사례 44~48 (apt) 경로 영향 0.
 */
export function applyOneRightExemption(
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  input: TransferTaxInput,
): RedevelopmentResult {
  // 트리거 조건 1: subject 가드 — apt 경로 완전 격리
  if (redevInfo.subject !== "right") {
    return redev;
  }

  // 트리거 조건 2~4: 자기선언 + 세대 구성
  if (
    redevInfo.exemptionEligibleAtApproval !== true ||
    input.isOneHousehold !== true ||
    input.householdHousingCount !== 0 ||
    input.householdRightCount !== 1
  ) {
    return redev;
  }

  if (input.transferPrice <= HIGH_VALUE_THRESHOLD) {
    // ── 전액 비과세 (12억 이하) ──
    // 3분기 모두 trace 보존 후 0 마스킹
    const maskBranch = (branch: RedevelopmentResult["preApproval"]) => ({
      ...branch,
      gainAfterAllocation: branch.gain,
      lthdAfterAllocation: branch.lthd,
      gain: 0,
      lthd: 0,
    });
    return {
      ...redev,
      preApproval: maskBranch(redev.preApproval),
      postApprovalExistingHouse: maskBranch(redev.postApprovalExistingHouse),
      settlement: maskBranch(redev.settlement),
      total: { gain: 0, lthd: 0, taxableIncome: 0 },
      oneRightExemptionApplied: true,
    };
  } else {
    // ── 12억 초과 안분과세 (§89①4호 가목 단서 + §95③) ──
    // apt 분기 applyHighValueAllocation 과 동일 taxableRatio 로직 적용
    // 단, isOneHouseSingle 조건(householdHousingCount===1)과 별개로 right 전용 처리
    const taxableRatio = (input.transferPrice - HIGH_VALUE_THRESHOLD) / input.transferPrice;

    const scaleBranch = (branch: RedevelopmentResult["preApproval"]) => {
      if (branch.gain <= 0) {
        return { ...branch, gainBeforeAllocation: branch.gain, nontaxableGain: 0 };
      }
      const originalGain = branch.gain;
      const taxableGain = Math.floor(originalGain * taxableRatio);
      const nontaxableGain = originalGain - taxableGain;
      // subject="right": postApprovalExistingHouse.gain=0, settlement LTHD=0 (§94①2호)
      const taxableLthd = branch.lthdRate > 0 ? Math.floor(taxableGain * branch.lthdRate) : 0;
      return {
        ...branch,
        gain: taxableGain,
        lthd: taxableLthd,
        gainBeforeAllocation: originalGain,
        nontaxableGain,
      };
    };

    const preApproval = scaleBranch(redev.preApproval);
    const postApprovalExistingHouse = scaleBranch(redev.postApprovalExistingHouse);
    const settlement = scaleBranch(redev.settlement);

    const totalGain = preApproval.gain + postApprovalExistingHouse.gain + settlement.gain;
    const totalLthd = preApproval.lthd + postApprovalExistingHouse.lthd + settlement.lthd;
    const nontaxableGainTotal = redev.total.gain - Math.floor(redev.total.gain * taxableRatio);
    const taxableGainTotal = Math.floor(redev.total.gain * taxableRatio);

    return {
      ...redev,
      preApproval,
      postApprovalExistingHouse,
      settlement,
      total: {
        gain: totalGain,
        lthd: totalLthd,
        taxableIncome: totalGain - totalLthd,
      },
      oneRightHighValueApplied: true,
      highValueAllocation: {
        nontaxableGain: nontaxableGainTotal,
        taxableGain: taxableGainTotal,
        taxableRatio,
        nontaxableThreshold: HIGH_VALUE_THRESHOLD,
      },
    };
  }
}

/**
 * **완공 신축주택(subject="apt") §89①3호가목 전액 비과세 마스킹** (2026-08-25 — E3-01).
 *
 * ## 왜 필요했나
 * 재개발 분기는 `transfer-tax.ts` STEP 0.65에서 **조기 반환**해 STEP 1(`checkExemption`)을
 * 건너뛴다. 그런데 `calculateRedevelopmentTax`는 §95③ **12억 초과 안분(`applyHighValueAllocation`)만**
 * 구현해 두어, 그 전제인 **§89①3호가목 비과세 자체가 없었다**. 결과:
 *
 * | 양도가액 | 종전 세액 | 법령상 |
 * |---|---|---|
 * | 10억 | 59,785,000 | **0** |
 * | 12억 | 98,241,000 | **0** |
 * | 12억+1원 | 0 (안분으로 과세분≈0) | 0 |
 *
 * 12억 경계에서 **1원 차이로 9,824만원이 사라지는 불연속**이었다. 입주권(subject="right")
 * 경로는 `applyOneRightExemption`이 전액 비과세를 이미 구현해 두어 정반대의 비대칭이었다.
 *
 * ## 판정은 여기서 하지 않는다
 * 요건 판정(§154① 보유·거주, §155 각 특례, §91① 미등기 배제 등)은 **일반 주택 경로와 같은
 * `checkExemption`**이 내리고, 이 함수는 그 결과를 받아 **마스킹만** 한다. 판정을 여기서
 * 재현하면 같은 질문에 두 개의 답이 생긴다(`feedback_ui_engine_dual_truth_avoidance`).
 *
 * ## 12억 초과는 이 함수가 손대지 않는다
 * 부분 비과세(고가주택)는 기존 `applyHighValueAllocation`(Step A.5)이 그대로 담당한다 —
 * 호출부가 `exemptionResult.isPartialExempt`로 그 트리거를 건다.
 *
 * 법령 근거: 소득세법 §89①3호 가목 · §95③ / 시행령 §154① · §160
 *
 * @param redev  3분할 원본 결과
 * @param redevInfo `subject` 가드용 — "apt"가 아니면 그대로 반환한다
 * @param isExempt `checkExemption`의 전액 비과세 판정 결과
 */
export function applyAptOneHouseExemption(
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  isExempt: boolean,
): RedevelopmentResult {
  // subject 가드 — 입주권(§89①4호) 경로 완전 격리. 두 규정이 겹치면 안 된다.
  if (redevInfo.subject !== "apt" || !isExempt) return redev;

  // 3분기 trace 보존 후 0 마스킹 — `applyOneRightExemption`의 12억 이하 분기와 동형.
  // 합계만 0으로 두면 결과 화면이 「공제 0인데 분기엔 값이 있다」로 어긋난다
  // (memory `feedback_engine_result_display_drift`).
  const maskBranch = (branch: RedevelopmentResult["preApproval"]) => ({
    ...branch,
    gainAfterAllocation: branch.gain,
    lthdAfterAllocation: branch.lthd,
    gain: 0,
    lthd: 0,
  });

  return {
    ...redev,
    preApproval: maskBranch(redev.preApproval),
    postApprovalExistingHouse: maskBranch(redev.postApprovalExistingHouse),
    settlement: maskBranch(redev.settlement),
    total: { gain: 0, lthd: 0, taxableIncome: 0 },
    aptOneHouseExemptionApplied: true,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 내부 헬퍼 — 3분할 양도차익·LTHD steps emit
// ──────────────────────────────────────────────────────────────────────────────

export function emitRedevelopmentSteps(
  steps: CalculationStep[],
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
): void {
  // 환산 메타 (UI 배지)
  if (redev.valuationMeta && redev.valuationMeta.method !== "actual") {
    steps.push({
      label: "환산취득가 적용",
      formula: redev.valuationMeta.rationale,
      amount: redev.preApproval.apportionedAcquisition,
      legalBasis: REDEVELOPMENT.CONVERTED_ACQ,
    });
  }

  // 분양가 (subject="apt" 만 의미)
  if (redev.salePriceTotal != null && redevInfo.subject === "apt") {
    const sign = redevInfo.settlementDirection === "pay" ? "+" : "-";
    steps.push({
      label: "분양가",
      formula: `권리가액 ${redevInfo.rightsValue.toLocaleString()} ${sign} 청산금 ${redevInfo.settlementAmount.toLocaleString()}`,
      amount: redev.salePriceTotal,
      legalBasis: REDEVELOPMENT.EVALUATION,
    });
  }

  // 인가전 분 양도차익
  //
  // 2026-07-29 정정(#591 감사 R7 — 표시 전용, 세액 불변): 환산 모드에서는 필요경비에
  // §163⑥ 개산공제가 함께 차감되는데(`redevelopment.ts:192·516` — expenses = 개산공제 +
  // 인가전필요경비) 산식 문자열이 그 항을 빠뜨려 **표시 산술 결과와 amount가 어긋났다**.
  // 사례 44: 219,218,500 − 141,221,534 − 0 = 77,996,966 ≠ amount 75,445,917 (차 = 개산공제 2,551,049).
  // 실가 모드(개산공제 0)에서는 항을 붙이지 않아 종전 표시가 유지된다.
  // 결과 루트 필드 — 타입 주석이 "인가전 양도차익에서 차감됨. 실가 모드 시 0 또는 undefined"로
  // 이 step 전용임을 명시하고 있다(`transfer-redevelopment.types.ts:577-581`).
  const preApprovalLumpDeduction = redev.estimatedLumpDeduction ?? 0;
  steps.push({
    label: "인가전 분 양도차익",
    formula:
      `의제 양도가액 ${redev.preApproval.apportionedTransfer.toLocaleString()}` +
      ` - 취득가 ${redev.preApproval.apportionedAcquisition.toLocaleString()}` +
      ` - 필요경비 ${redevInfo.preApprovalExpenses.toLocaleString()}` +
      // 개산공제 항의 근거(§163⑥)는 step 전체의 legalBasis(§166①·②)와 다르므로 항에 병기한다.
      (preApprovalLumpDeduction > 0
        ? ` - 개산공제(시행령 §163⑥) ${preApprovalLumpDeduction.toLocaleString()}`
        : ""),
    amount: redev.preApproval.gain,
    legalBasis: redevInfo.subject === "apt" ? REDEVELOPMENT.APT_PAY : REDEVELOPMENT.RIGHT_PAY,
  });

  // 인가후 기존주택분 양도차익 (apt 만)
  if (redev.postApprovalExistingHouse.gain > 0) {
    steps.push({
      label: "인가후 기존주택분 양도차익",
      formula: `안분 양도가 ${redev.postApprovalExistingHouse.apportionedTransfer.toLocaleString()} - 안분 취득가 ${redev.postApprovalExistingHouse.apportionedAcquisition.toLocaleString()}`,
      amount: redev.postApprovalExistingHouse.gain,
      legalBasis: REDEVELOPMENT.APT_PAY,
    });
  }

  // 청산금 분 양도차익
  if (redev.settlement.gain > 0) {
    steps.push({
      label: redevInfo.settlementDirection === "pay" ? "청산금 납부분 양도차익" : "청산금 수령분 양도차익",
      formula: `안분 양도가 ${redev.settlement.apportionedTransfer.toLocaleString()} - 안분 취득가 ${redev.settlement.apportionedAcquisition.toLocaleString()}`,
      amount: redev.settlement.gain,
      legalBasis: redevInfo.settlementDirection === "pay" ? REDEVELOPMENT.APT_PAY : REDEVELOPMENT.RIGHT_RECEIVE,
    });
  }

  // LTHD 3줄 (finalize emit 매칭 — FilingFormTable 3열)
  pushLthdStep(steps, "인가전 분 장기보유공제", redev.preApproval.gain, redev.preApproval.lthdRate, redev.preApproval.lthd, redev.preApproval.holdingMonths);
  pushLthdStep(steps, "인가후 기존주택분 장기보유공제", redev.postApprovalExistingHouse.gain, redev.postApprovalExistingHouse.lthdRate, redev.postApprovalExistingHouse.lthd, redev.postApprovalExistingHouse.holdingMonths);
  pushLthdStep(steps, "청산금 분 장기보유공제", redev.settlement.gain, redev.settlement.lthdRate, redev.settlement.lthd, redev.settlement.holdingMonths);
}

function pushLthdStep(
  steps: CalculationStep[],
  label: string,
  gain: number,
  rate: number,
  amount: number,
  holdingMonths: number,
): void {
  if (gain <= 0 && amount === 0) return; // 대상 부존재 분기 skip
  const years = Math.floor(holdingMonths / 12);
  const months = holdingMonths % 12;
  steps.push({
    label,
    formula: `양도차익 ${gain.toLocaleString()} × ${Math.round(rate * 100)}% (보유 ${years}년 ${months}개월, ${REDEVELOPMENT.LTHD_PERIOD})`,
    amount,
    legalBasis: REDEVELOPMENT.LTHD_PERIOD,
  });
}
