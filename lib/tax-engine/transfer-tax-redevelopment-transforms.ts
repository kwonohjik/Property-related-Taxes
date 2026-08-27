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
import { preApprovalNecessaryExpense } from "./redevelopment-split";
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
/**
 * LTHD 분해 필드(보유분·거주분)를 **0으로 덮는다** — 값이 정의돼 있을 때만.
 *
 * undefined를 0으로 바꾸면 「분해 없음」(§95② 표1 등)이 「분해했는데 0」으로 뜻이 바뀌어
 * 신고서가 없는 구분을 인쇄한다.
 */
function zeroLthdParts(b: RedevelopmentBranchDetail): Partial<RedevelopmentBranchDetail> {
  return {
    ...(b.lthdHoldingPart !== undefined ? { lthdHoldingPart: 0 } : {}),
    ...(b.lthdResidencePart !== undefined ? { lthdResidencePart: 0 } : {}),
  };
}

/**
 * LTHD 총액을 축소했을 때 분해 필드를 **같은 비율로** 다시 나눈다.
 *
 * 보유분 비율(`lthdHoldingPart / lthd`)을 보존하고 floor 잔차는 거주분이 흡수한다
 * (memory `feedback_floor_residual_absorption`) — 「공제 = 보유분 + 거주분」이 항상 성립한다.
 */
function scaleLthdParts(
  b: RedevelopmentBranchDetail,
  scaledLthd: number,
): Partial<RedevelopmentBranchDetail> {
  const hasSplit = b.lthdHoldingPart !== undefined || b.lthdResidencePart !== undefined;
  if (!hasSplit) return {};
  if (scaledLthd <= 0) return { lthdHoldingPart: 0, lthdResidencePart: 0 };
  const holdingFraction = b.lthd > 0 ? (b.lthdHoldingPart ?? 0) / b.lthd : 1;
  const holdingPart = Math.floor(scaledLthd * holdingFraction);
  return { lthdHoldingPart: holdingPart, lthdResidencePart: scaledLthd - holdingPart };
}

export function applyLthdExclusion(r: RedevelopmentResult): RedevelopmentResult {
  const zeroBranch = (b: RedevelopmentBranchDetail): RedevelopmentBranchDetail => ({
    ...b,
    lthd: 0,
    lthdRate: 0,
    ...zeroLthdParts(b),
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
 * 분기별로 floor 적용 — 예제 xlsx 결과 일치 (xlsx D17·E17·F17 각각 분기별 산정 후 합산).
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
    return {
      ...branch,
      gain: taxableGain,
      lthd: taxableLthd,
      gainBeforeAllocation: originalGain,
      nontaxableGain,
      // 12억 안분 후 보유분/거주분은 같은 비율로 재산정 (공용 leaf — E3-05로 4곳 단일화)
      ...scaleLthdParts(branch, taxableLthd),
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
    // 🔴 2026-08-26 신설(E3-05) — 종전에는 분해 2필드가 원값으로 남아 신고서가
    //    「청산금 열 공제 0 · 보유분 52,500,000」을 함께 인쇄했다.
    ...zeroLthdParts(redev.settlement),
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
 * 「양도일 현재 세대가 **분양권**을 보유하는가」 — §89①4호 **가·나목 공용 leaf**.
 *
 * 두 목이 같은 사실을 요구한다:
 *   · 가목 — 「양도일 현재 다른 주택 **또는 분양권**을 보유하지 아니할 것」
 *   · 나목 — 「… 1주택을 보유한 경우(**분양권을 보유하지 아니하는 경우로 한정한다**)로서 …」
 *
 * ⚠️ **`presaleRights.length`를 세면 안 된다.** 이 배열은 「분양권」과 「조합원입주권」을 함께
 *    담는 목록(`PresaleRight.type`)이고, 조문이 배제하는 것은 **분양권**뿐이다. 조합원입주권
 *    개수는 본문과 `householdRightCount`가 이미 본다 — 길이로 세면 양도 대상 입주권 자신을
 *    목록에 적어 넣은 사용자가 근거 없이 비과세를 잃는다.
 *
 * ⚠️ **미제공(undefined)은 「보유하지 않음」으로 본다.** 비과세를 배제하는 방향이 불리 적용이라,
 *    사실이 입력되지 않았다는 이유만으로 납세자에게 불리하게 단정하지 않는다. 사용자가 분양권을
 *    선언할 입력 경로는 ⑤가 함께 열어야 한다(열지 않으면 이 게이트는 no-op이다).
 */
export function householdHoldsPresaleRight(input: TransferTaxInput): boolean {
  return input.presaleRights?.some((p) => p.type === "presale_right") === true;
}

/** §89①4호 나목 — 「해당 1주택을 취득한 날부터 **3년** 이내에 해당 조합원입주권을 양도할 것」 */
const CLAUSE_NA_YEARS = 3;

/**
 * **§89①4호 전용 술어** — 어느 목으로 비과세가 성립하는가 (2026-08-25 신설 · C1-03 · E3-03).
 *
 * ## 왜 별도 술어인가
 *
 * 종전에는 두 판정이 **서로 다른 값**을 보고 있었다:
 *   · 전액 비과세  → `applyOneRightExemption`의 4조건(가목만)
 *   · 12억 안분    → `isOneHouseSingle`(= 세대 주택수 1) — **요건을 하나도 보지 않는다**
 *
 * 그래서 12억 **이하**에서는 나목 충족자에게 줄 비과세가 없어 과대과세가 나고(C1-03),
 * 12억 **초과**에서는 요건 미검증 안분이 걸려 과소과세가 났다(E3-03 · 실측 Δ 409,152,700).
 * 한 조문의 요건이므로 **하나의 술어**가 두 효과를 함께 가른다.
 *
 * ## 조문 (법제처 실독 — 소득세법 [시행 2026-07-01] §89①4호)
 *
 * > 조합원입주권을 **1개** 보유한 1세대[관리처분계획의 인가일 … 현재 제3호가목에 해당하는
 * > 기존주택을 소유하는 세대]가 다음 각 목의 **어느 하나**의 요건을 충족하여 양도하는 경우 …
 * > 가. 양도일 현재 다른 주택 또는 분양권을 보유하지 아니할 것
 * > 나. 양도일 현재 1조합원입주권 외에 1주택을 보유한 경우(분양권을 보유하지 아니하는 경우로
 * >     한정한다)로서 해당 1주택을 취득한 날부터 3년 이내에 해당 조합원입주권을 양도할 것
 *
 * 본문 요건(인가일 현재 §89①3호가목 기존주택 소유)은 `exemptionEligibleAtApproval` 자기선언으로
 * 받는다 — 기존 설계를 그대로 승계한다(이중 판정 금지).
 *
 * ⚠️ 호출부가 `subject === "right"` 가드를 이미 걸었다고 가정한다. 완공 신축주택(subject="apt")은
 *    §89①**3호**이고 `checkExemption`이 담당한다.
 */
export function resolveOneRightExemptionClause(
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  input: TransferTaxInput,
): "ga" | "na" | undefined {
  // ── 각 목 공통(본문) ──
  if (
    redevInfo.exemptionEligibleAtApproval !== true ||
    input.isOneHousehold !== true ||
    input.householdRightCount !== 1 // 「조합원입주권을 1개 보유한 1세대」
  ) {
    return undefined;
  }

  // 가·나목 **양쪽**이 분양권 미보유를 요구한다 — 목을 가르기 전에 한 번 본다.
  if (householdHoldsPresaleRight(input)) return undefined;

  // ── 가목: 다른 주택 0채 ──
  if (input.householdHousingCount === 0) return "ga";

  // ── 나목: 1주택 + 그 주택 취득일부터 3년 이내 양도 ──
  if (input.householdHousingCount === 1) {
    const acquired = redevInfo.otherHouseAcquisitionDate;
    // 취득일 미입력이면 3년 요건을 **판정할 수 없다**. 「모르니까 준다」도, 「모르니까 뺏는다」도
    // 하지 않는다 — 나목 불성립으로 두고(비과세·안분 모두 미적용) 화면이 사유를 안내한다.
    if (!acquired) return undefined;
    const deadline = new Date(acquired);
    deadline.setFullYear(deadline.getFullYear() + CLAUSE_NA_YEARS);
    return input.transferDate <= deadline ? "na" : undefined;
  }

  return undefined;
}

/**
 * 사례 36 — §89①4호 가목 1세대1입주권 비과세 게이트.
 *
 * 트리거 (AND 5조건):
 *   1. subject === "right"  ◀── 사례 45/47 (apt) 경로 완전 격리
 *   2. exemptionEligibleAtApproval === true  ◀── 기존 필드 재사용 (사례 47 도입)
 *      (인가일 기준 종전주택 §89①3호 가목 요건 충족 — 사용자 자기선언)
 *   3. householdHousingCount === 0 AND householdRightCount === 1
 *      (양도일 현재 다른 주택 없음 + 1입주권만 — §89①4호 가목 본문)
 *   4. isOneHousehold === true
 *   5. **세대 보유 분양권 없음** — 가목 「다른 주택 **또는 분양권**을 보유하지 아니할 것」
 *      (2026-08-25 신설 — L1-03. 종전에는 법문의 이 부분이 게이트·주석·UI 안내문에서
 *       모두 지워져 있어, 분양권 보유 세대도 전액 비과세됐다. 실측 Δ 58,910,000)
 *
 * 동작:
 *   - transferPrice ≤ 12억 → 3분기 모두 gain/lthd 0 마스킹 → 산출세액 0 (전액 비과세)
 *     → oneRightExemptionApplied = true
 *   - transferPrice > 12억 → §89①4호 각 목 외의 부분 단서 + §95③ 안분
 *     → taxableRatio × 각 분기 gain/lthd 보존, 비과세분 마스킹
 *     → oneRightHighValueApplied = true
 *
 * 법령 근거:
 *   - 소득세법 §89①4호 가목 본문: 1세대1입주권 비과세
 *   - 소득세법 §89①4호 각 목 외의 부분 단서: 12억 초과 시 안분과세
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

  // 트리거 조건 2~5: 본문 + 가·나목 — 단일 술어(`resolveOneRightExemptionClause`)에 위임한다.
  // 종전에는 여기서 조건을 직접 나열해 **가목만** 구현돼 있었고(나목 부재 = C1-03),
  // 12억 안분은 이 함수 밖에서 요건 없이 발동했다(E3-03).
  const clause = resolveOneRightExemptionClause(redevInfo, input);
  if (!clause) {
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
      // 🔴 2026-08-26 신설(E3-05) — 분해 2필드를 남기면 전액 비과세인데도
      //    신고서 보유분 열에 210,000,000이 인쇄된다(실측).
      ...zeroLthdParts(branch),
    });
    return {
      ...redev,
      preApproval: maskBranch(redev.preApproval),
      postApprovalExistingHouse: maskBranch(redev.postApprovalExistingHouse),
      settlement: maskBranch(redev.settlement),
      total: { gain: 0, lthd: 0, taxableIncome: 0 },
      oneRightExemptionApplied: true,
      oneRightExemptionClause: clause,
    };
  } else {
    // ── 12억 초과 안분과세 (§89①4호 각 목 외의 부분 단서 + §95③) ──
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
        // 🔴 2026-08-26 신설(E3-05) — `applyHighValueAllocation`과 **같은 leaf**를 쓴다.
        //    종전에는 이쪽만 분해를 안 건드려 안분 후 공제 84,000,000 vs 보유분 210,000,000이 됐다.
        ...scaleLthdParts(branch, taxableLthd),
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
      oneRightExemptionClause: clause,
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
  //
  // 🔴 2026-08-25 정정(E1-02): 종전 산식은 **필요경비와 개산공제를 나란히 두 항으로** 보여줬다.
  //    §166①1호 후단·①2호 나목은 「§97①2·3호 **또는** §163⑥」 **택일**이라 실제로 차감되는 항은
  //    언제나 **하나**다. 두 항을 다 보여주면 (a) 신고서 인가전 분 열(택일 값 1개)과 서로 다른
  //    진실이 되고 (b) 산식 산술이 amount와 맞지 않는다.
  //    ⇒ 계산과 같은 헬퍼(`preApprovalNecessaryExpense`)가 고른 **하나만** 근거와 함께 표시한다.
  const preApprovalLumpDeduction = redev.estimatedLumpDeduction ?? 0;
  const preApprovalExpenseChosen = preApprovalNecessaryExpense(
    preApprovalLumpDeduction,
    redevInfo.preApprovalExpenses,
  );
  const preApprovalExpenseLabel =
    preApprovalLumpDeduction > 0 ? "개산공제(시행령 §163⑥)" : "필요경비(법 §97①2·3호)";
  steps.push({
    label: "인가전 분 양도차익",
    formula:
      `의제 양도가액 ${redev.preApproval.apportionedTransfer.toLocaleString()}` +
      ` - 취득가 ${redev.preApproval.apportionedAcquisition.toLocaleString()}` +
      ` - ${preApprovalExpenseLabel} ${preApprovalExpenseChosen.toLocaleString()}`,
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
