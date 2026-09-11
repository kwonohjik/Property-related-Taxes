/**
 * 재개발 §166 — **장기보유특별공제(LTHD) 변형** 전용 (800줄 분리, 2026-09-11)
 *
 * `transfer-tax-redevelopment-transforms.ts` 가 809줄로 정책(트리거 800 · 착지 ≤700)을
 * 넘겨 분리했다. 이음매는 **함수 단위 이동**이다 — 이 블록은 바깥 함수를 **하나도
 * 참조하지 않는다**(단방향 실측 후 이동). 반대로 바깥이 이 파일의 4개를 부른다.
 *
 * ⚠️ 원본이 이 파일을 **재export** 한다(import 사이트 무변경 —
 *    [[feedback_800line_split_export_preservation]]).
 */

import type {
  TransferTaxInput,
  RedevelopmentResult,
  RedevelopmentBranchDetail,
} from "./types/transfer.types";

/**
 * §95③·영 §160 고가주택 기준 — 오케스트레이터와 **같은 값을 쓴다**(양쪽 하드코딩 금지).
 *
 * 🔑 이 상수는 분리된 두 파일이 **함께 쓴다**. 원본에 두면 「원본 → 이 파일 → 원본」 순환이
 *    되므로 **아래쪽(이 파일)에 둔다** — 원본이 여기서 import 하면 방향이 하나로 유지된다
 *    ([[feedback_800line_split_playbook]] 「순환은 재export 탓」).
 */
export const HIGH_VALUE_THRESHOLD = 1_200_000_000;

export function zeroLthdParts(b: RedevelopmentBranchDetail): Partial<RedevelopmentBranchDetail> {
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
export function scaleLthdParts(
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
 * A.8b — 조특법 §97의3①(임대분 70% **대체**) · §97의4①(추가율 **가산**)을 분기별 LTHD에 반영.
 *
 * ## 왜 §166⑤ 3분기와 충돌하지 않는가
 *
 * 소령 §166⑤은 **장기보유특별공제의 「보유기간」을 정하는** 규정이다(1호 인가전 / 2호가목
 * 청산금납부분 / 2호나목 기존건물분). 그런데:
 *
 * - **§97의3**은 임대분에 **100분의 70 고정**을 준다. 율이 고정이면 보유기간이 개입할 여지가
 *   없으므로 3분기 구조는 **비임대분에만** 걸린다 — 지금 각 분기가 이미 하는 일 그대로다.
 *   두 축은 충돌하지 않고 곱해진다.
 * - **§97의4**는 통상 율에 추가율을 **더한다**. `Σ 차익ᵢ × 추가율 = 총차익 × 추가율`이라
 *   분기별로 더하든 전체에 더하든 값이 같다.
 *
 * ⇒ 두 조문 모두 분기별 결합에 별도 규칙이 필요 없다. 정상 경로(`transfer-tax-lthd.ts`)가
 *   쓰는 산식을 분기마다 그 분기의 율로 돌리면 된다.
 *
 * ## 임대분 안분비율을 분기별로 다시 뽑지 않는 이유
 *
 * 조특령 §97의3② 후단: 「재개발사업ㆍ재건축사업 … 의 시행으로 임대할 수 없는 경우에는 해당
 * 주택의 관리처분계획 인가일 **전 6개월부터 준공일 후 6개월까지의 기간 동안 계속하여 임대한
 * 것으로 보되**, 임대기간 계산 시에는 실제 임대기간만 포함한다」 — 임대가 인가 전부터 준공
 * 후까지 **이어진 것으로 본다**. 그러면 령 §97의3⑤의 비율(임대개시일~임대 마지막 날 기준시가
 * 상승분 ÷ 전체)이 세 구간에 걸쳐 산정되는 것이 자연스럽고, 분기별로 따로 뽑을 근거가 없다.
 *
 * @param special `evaluateRental97Lthd` 결과에서 뽑은 값. `overrideRate`(§97의3) 또는
 *   `additionalRate`(§97의4) 중 하나만 온다.
 */
export function applyRental97LthdSpecial(
  r: RedevelopmentResult,
  special: {
    /** §97의3 — 임대분 대체 공제율 (0.7) */
    overrideRate?: number;
    /** §97의3 — 임대기간분 양도차익 비율 (조특령 §97의3⑤). §97의4는 1 */
    rentalGainRatio: number;
    /** §97의4 — 임대기간별 추가 공제율 */
    additionalRate?: number;
  },
): RedevelopmentResult {
  const applyBranch = (b: RedevelopmentBranchDetail): RedevelopmentBranchDetail => {
    const gain = Math.max(b.gain, 0);
    if (gain <= 0) return b;

    if (special.overrideRate !== undefined) {
      // §97의3 — 임대분 × 70% + 비임대분 × 그 분기의 §166⑤ 율
      const rentalGain = Math.floor(gain * special.rentalGainRatio);
      const nonRentalGain = gain - rentalGain;
      const lthd =
        Math.floor(rentalGain * special.overrideRate) + Math.floor(nonRentalGain * b.lthdRate);
      const blendedRate =
        special.overrideRate * special.rentalGainRatio + b.lthdRate * (1 - special.rentalGainRatio);
      return { ...b, lthd, lthdRate: blendedRate, ...clearLthdParts(b) };
    }

    if (special.additionalRate !== undefined) {
      // §97의4 — 기본 공제율이 0(보유 3년 미만)이면 가산하지 않는다. 정상 경로와 같은 규약.
      if (b.lthdRate <= 0) return b;
      const combined = b.lthdRate + special.additionalRate;
      return { ...b, lthd: Math.floor(gain * combined), lthdRate: combined, ...clearLthdParts(b) };
    }
    return b;
  };

  const preApproval = applyBranch(r.preApproval);
  const postApprovalExistingHouse = applyBranch(r.postApprovalExistingHouse);
  const settlement = applyBranch(r.settlement);
  const lthd = preApproval.lthd + postApprovalExistingHouse.lthd + settlement.lthd;

  return {
    ...r,
    preApproval,
    postApprovalExistingHouse,
    settlement,
    total: { ...r.total, lthd, taxableIncome: r.total.gain - lthd },
  };
}

/**
 * 특례 적용 후에는 **보유분/거주분 분해가 성립하지 않는다**.
 *
 * §95② 표2의 보유분·거주분은 「보유기간 × 4% + 거주기간 × 4%」라는 분해인데, 특례는 그 위에
 * 임대분 70%를 덮거나(§97의3) 임대기간별 추가율을 더한다(§97의4). 분해값을 그대로 두면
 * 「보유분 + 거주분 ≠ 공제액」이 되어 결과 화면·신고서에서 합이 안 맞는다.
 * 분해가 **있었던** 분기만 undefined로 되돌린다(0으로 덮으면 「분해했는데 0」이 된다).
 */
function clearLthdParts(
  b: RedevelopmentBranchDetail,
): Partial<Pick<RedevelopmentBranchDetail, "lthdHoldingPart" | "lthdResidencePart">> {
  if (b.lthdHoldingPart === undefined && b.lthdResidencePart === undefined) return {};
  return { lthdHoldingPart: undefined, lthdResidencePart: undefined };
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

