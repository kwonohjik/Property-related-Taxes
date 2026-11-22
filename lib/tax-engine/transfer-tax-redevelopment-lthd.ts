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
import { resolveHighValueHouseThreshold } from "./one-house/threshold";
import { applyFairMarketRatio } from "./tax-utils";
import { applyRentalGainShare } from "./transfer-reductions/rental-97-shared-helpers";
import { isLandContributedNewBuild } from "./redevelopment-lthd";
import { existingBuildingLthdBases } from "./redevelopment-existing-netting";

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
    lthdRateBasis: undefined, // 공제율 선택 근거는 배제된 율에는 맞지 않는다
    lthdHoldingOnlyTable2: undefined,
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
 * ## 조합원입주권(`subject="right"`)은 인가전 분에만
 *
 * 소득세법 §95② 괄호 「조합원입주권을 양도하는 경우에는 「도시 및 주거환경정비법」 제74조에 따른
 * 관리처분계획 인가 … 전 토지분 또는 건물분의 양도차익으로 한정한다」 — 특례도 장기보유특별공제액을
 * 계산하는 규정이라 같은 괄호 안에 있다. 입주권의 청산금 분기는 §166①2호 가목의 **인가후 분**
 * (프리미엄)이라 공제 대상 양도차익이 없다. 종전에는 세 분기에 모두 씌워 인가후 분에도 특례율이
 * 붙었다(G-7′ — 시료 장특 155,500,000, 맞는 값 68,000,000).
 *
 * @param special `evaluateRental97Lthd` 결과에서 뽑은 값. `overrideRate`(§97의3) 또는
 *   `additionalRate`(§97의4) 중 하나만 온다.
 * @param subject 재개발 입력의 `subject` — `"right"`면 인가전 분에만 적용한다.
 */
export function applyRental97LthdSpecial(
  r: RedevelopmentResult,
  special: {
    /** §97의3 — 임대분 대체 공제율 (0.7) */
    overrideRate?: number;
    /** §97의3 — 임대기간분 양도차익 비율 (조특령 §97의3⑤). §97의4는 1 */
    rentalGainRatio: number;
    /** 같은 비율의 정수 분수 — 금액 안분은 이것으로(`applyRentalGainShare`) */
    rentalGainFraction?: { num: number; den: number };
    /** §97의4 — 임대기간별 추가 공제율 */
    additionalRate?: number;
  },
  subject: NonNullable<TransferTaxInput["redevelopment"]>["subject"],
): RedevelopmentResult {
  // 완공 아파트의 두 분기는 부호가 다르면 상계한 기존건물분에 특례를 적용한다(§166②1호 — `existingBuildingLthdBases`).
  const bases = subject === "right" ? undefined : existingBuildingLthdBases(r.preApproval, r.postApprovalExistingHouse);
  const applyBranch = (b: RedevelopmentBranchDetail, base: number = b.gain): RedevelopmentBranchDetail => {
    const gain = Math.max(base, 0);
    if (gain <= 0) return b;

    if (special.overrideRate !== undefined) {
      // §97의3 — 임대분 × 70% + 비임대분 × 그 분기의 §166⑤ 율
      const rentalGain = applyRentalGainShare(gain, special);
      const nonRentalGain = gain - rentalGain;
      const lthd =
        applyFairMarketRatio(rentalGain, special.overrideRate) + applyFairMarketRatio(nonRentalGain, b.lthdRate);
      const blendedRate =
        special.overrideRate * special.rentalGainRatio + b.lthdRate * (1 - special.rentalGainRatio);
      return { ...b, lthd, lthdRate: blendedRate, lthdRateBasis: undefined, lthdHoldingOnlyTable2: undefined, ...clearLthdParts(b) };
    }

    if (special.additionalRate !== undefined) {
      // §97의4 — 기본 공제율이 0(보유 3년 미만)이면 가산하지 않는다. 정상 경로와 같은 규약.
      if (b.lthdRate <= 0) return b;
      const combined = b.lthdRate + special.additionalRate;
      return { ...b, lthd: applyFairMarketRatio(gain, combined), lthdRate: combined, lthdRateBasis: undefined, lthdHoldingOnlyTable2: undefined, ...clearLthdParts(b) };
    }
    return b;
  };

  const preApproval = applyBranch(r.preApproval, bases?.pre);
  // 입주권은 인가후 분(청산금 분기)에 공제 대상 차익이 없다 — 원래 값(lthd 0) 그대로 둔다.
  const postApprovalExistingHouse = subject === "right" ? r.postApprovalExistingHouse : applyBranch(r.postApprovalExistingHouse, bases?.post);
  const settlement = subject === "right" ? r.settlement : applyBranch(r.settlement);
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
 * 적용된 표 — 거주분이 붙었으면 표2다(표1에는 거주분이 없다).
 *
 * 종전에는 「공제율 > 30%」로 짐작했는데, 표2가 30% 이하로 이기는 경우(재산세과-1693 비교·보유 3~4년)
 * 「표1 (보유만)」으로 잘못 보였다. 분해값이 없으면(분해 전 결과) 종전 짐작을 쓴다.
 */
function appliedTable(branches: RedevelopmentBranchDetail[]): "table1" | "table2" {
  // 2009~2020 양도분의 표2는 보유 연 8% 단일축이라 거주분이 0이어도 표2다 — 표지가 붙은 분기가 있으면 표2.
  if (branches.some((b) => b.lthdHoldingOnlyTable2 === true)) return "table2";
  if (branches.every((b) => b.lthdResidencePart === undefined)) {
    return branches[0].lthdRate > 0.3 ? "table2" : "table1";
  }
  return branches.some((b) => (b.lthdResidencePart ?? 0) > 0) ? "table2" : "table1";
}

/**
 * 고가주택·고가 입주권 안분(영 §160①)을 분기 양도차익에 나눠 적용한다 — R-c08-12(2026-11-22 사용자 결정 b).
 *
 * - **합계** = 양도차익 전체(분기 합) × 분자 ÷ 분모를 한 번 절사한 값. 안분 박스의 「과세대상 양도차익」과 같은 값이다.
 * - **분기** = 각 분기 × 분자 ÷ 분모를 절사한 뒤, 합계와의 차이를 1원씩 나눈다(최대잉여 방식). 모자라면 나머지가 큰 분기부터
 *   1원씩 더하고, 넘치면(차손 분기가 섞인 경우) 나머지가 작은 분기부터 1원씩 뺀다. 나머지가 같으면 배열 앞 분기
 *   (인가전 → 인가후 → 청산금). 분기 합 = 합계가 정확히 성립하고, 분기마다 정확값의 내림·올림 중 하나다.
 *
 * 절사는 0 방향이다 — 음수(차손)는 절댓값을 안분해 부호를 붙인 값이다(종전 분기 안분 `−prorate(−차손)`·
 * 청산금 수령분 `applySettlementExemption`과 같은 방향). 분기 합이 음수면 부호를 뒤집어 배분한 뒤
 * 다시 부호를 붙이는 것과 같다 — 합계는 종전 안분 박스 `prorate(분기 합)`(큰 값의 BigInt 0 방향 절사)과 같은 값이다.
 *
 * 정수(BigInt) 연산이다. 분기별로 따로 절사하면 분기 합이 합계보다 최대 (분기 수 − 1)원 작아진다(종전 실측 148,148,147 vs 148,148,148).
 */
export function prorateBranchGains(
  gains: number[],
  numerator: number,
  denominator: number,
): { shares: number[]; total: number } {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  const products = gains.map((g) => BigInt(g) * n);
  // BigInt 나눗셈은 0 방향 절사다.
  const bases = products.map((p) => p / d);
  const remainders = products.map((p, i) => p - bases[i] * d); // 이익 분기 [0, d) · 차손 분기 (−d, 0]
  const total = products.reduce((a, b) => a + b, 0n) / d;
  let left = total - bases.reduce((a, b) => a + b, 0n);
  const step = left > 0n ? 1n : -1n;
  const order = gains
    .map((_, i) => i)
    .sort((a, b) => {
      const diff = step > 0n ? remainders[b] - remainders[a] : remainders[a] - remainders[b];
      return diff > 0n ? 1 : diff < 0n ? -1 : a - b;
    });
  const shares = [...bases];
  for (const i of order) {
    if (left === 0n) break;
    shares[i] += step;
    left -= step;
  }
  return { shares: shares.map(Number), total: Number(total) };
}

/**
 * 1세대1주택 + 양도가액 > 12억 시 분기별 양도차익·LTHD 를 과세대상으로 축소.
 *
 * 산식 (시행령 §160):
 *   taxableRatio  = (transferPrice − 12억) / transferPrice            (표시용 비율)
 *   과세대상 양도차익 합계 = 분기 양도차익 합 × (transferPrice − 12억) / transferPrice 를 0 방향 절사   (곱셈 먼저 — 정수 비례)
 *   branchTaxableGain = 합계를 분기 비율로 나눈 값(최대잉여 방식 — `prorateBranchGains`)
 *   branchTaxableLthd = floor(branchTaxableGain × branchRate)
 *
 * 합계를 먼저 정하고 분기에 나눈다(R-c08-12 · 2026-11-22) — 종전에는 분기마다 내림해 합산해서
 * 분기 합이 안분 박스의 합계보다 1원 작을 수 있었다.
 *
 * @param redevRaw runRedevelopment 결과 (분기별 gain·lthd 가 전체 양도차익 기준)
 * @param transferPrice 12억 비교·안분 분모 — 호출부가 판정과 **같은 값**을 넘긴다(지분 모드면 물건 전체 가액,
 *   부담부증여면 증여가액 C — `resolveHighValuePriceCheck`)
 * @param redevInfo 입력 redevelopment (lthdResidenceAttribution 부착용)
 */
export function applyHighValueAllocation(
  redevRaw: RedevelopmentResult,
  transferPrice: number,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  /**
   * 양도일 — G-5 고가주택 기준금액(6억/9억/12억)의 시점 축.
   *
   * 🔴 **호출부의 「고가 판정」과 반드시 같은 값이어야 한다.** 판정이 시점 기준(예 6억)으로
   *    「초과」라 해 놓고 여기서 12억으로 나누면 `taxableRatio`가 **음수**가 된다
   *    (7억 양도 → (7억 − 12억)/7억 = −0.71).
   */
  transferDate: Date,
  /**
   * 🔴 **청산금 수령 방향에서는 청산금 분기를 안분하지 않는다** (L-12, 2026-09-28).
   *
   * 청산금 수령분은 종전주택 일부의 양도로 **따로** 판정·안분한다 — 기준은 권리가격과 청산금분
   * 양도일의 기준금액이다(서면-2016-법령해석재산-2705 질의2). 신축주택의 비율을 쓸 근거가 없다.
   * `true`면 청산금 분기를 그대로 두고, 안분 메타(`highValueAllocation`)도 **신축주택분
   * (인가전 분 + 인가후 기존건물분)만**으로 산정한다. 청산금분은 Step A.6이 판정한다.
   */
  keepSettlement = false,
): RedevelopmentResult {
  const threshold = resolveHighValueHouseThreshold(transferDate);
  const taxableRatio = (transferPrice - threshold) / transferPrice;
  const nontaxableThreshold = threshold;

  // 분기별 과세대상 양도차익 (정수연산 — 합계를 먼저 절사하고 분기에 최대잉여 방식으로 나눈다 · `prorateBranchGains`).
  // 양도차손 분기도 같은 비율로 안분한다(2026-11-16) — §160①의 대상은 신축주택 양도차익 전체(분기 합)라 분기마다 같은 비율을 곱해야
  // 합계를 안분한 값과 같다. 종전에는 손실 분기를 안분하지 않아 손실 전액이 안분된 이익을 지웠다(인가전 −3억 · 양도 15억 → 합계 −140,000,001,
  // 맞는 값 99,999,999). 일반 경로 `calcOneHouseProration`도 부호와 무관하게 안분한다.
  // 🔴 수령 방향(keepSettlement)은 청산금 분기를 배분 대상에서 뺀다 — 합계도 신축주택분(인가전 분 + 인가후 기존건물분)만이다.
  const scaledInputs = keepSettlement
    ? [redevRaw.preApproval, redevRaw.postApprovalExistingHouse]
    : [redevRaw.preApproval, redevRaw.postApprovalExistingHouse, redevRaw.settlement];
  const { shares, total: taxableGainTotal } = prorateBranchGains(
    scaledInputs.map((b) => b.gain),
    transferPrice - threshold,
    transferPrice,
  );
  const scaleGain = (branch: RedevelopmentBranchDetail, taxableGain: number): RedevelopmentBranchDetail => {
    const originalGain = branch.gain;
    // 정수연산 보존: 비과세 = 안분 전 - 과세대상
    return { ...branch, gain: taxableGain, gainBeforeAllocation: originalGain, nontaxableGain: originalGain - taxableGain };
  };
  // 안분 후 공제 — 기준 금액 × 그 분기 공제율. 완공 아파트의 두 분기는 부호가 다르면 상계한 기존건물분에 공제한다(§166②1호).
  const withLthd = (branch: RedevelopmentBranchDetail, base: number, netted: boolean): RedevelopmentBranchDetail => {
    const taxableLthd = base > 0 && branch.lthdRate > 0 ? applyFairMarketRatio(base, branch.lthdRate) : 0;
    return {
      ...branch,
      lthd: taxableLthd,
      lthdBaseGain: netted && branch.gain > 0 ? base : undefined,
      // 12억 안분 후 보유분/거주분은 같은 비율로 재산정 (공용 leaf — E3-05로 4곳 단일화)
      ...scaleLthdParts(branch, taxableLthd),
    };
  };

  const preScaled = scaleGain(redevRaw.preApproval, shares[0]);
  const postScaled = scaleGain(redevRaw.postApprovalExistingHouse, shares[1]);
  const bases = redevInfo.subject === "apt" ? existingBuildingLthdBases(preScaled, postScaled) : undefined;
  const preApproval = withLthd(preScaled, bases?.pre ?? preScaled.gain, bases !== undefined);
  const postApprovalExistingHouse = withLthd(postScaled, bases?.post ?? postScaled.gain, bases !== undefined);
  const settlementScaled = keepSettlement ? undefined : scaleGain(redevRaw.settlement, shares[2]);
  const settlement = settlementScaled ? withLthd(settlementScaled, settlementScaled.gain, false) : redevRaw.settlement;

  const totalGain = preApproval.gain + postApprovalExistingHouse.gain + settlement.gain;
  const totalLthd = preApproval.lthd + postApprovalExistingHouse.lthd + settlement.lthd;
  const taxableIncome = totalGain - totalLthd;

  // 12억 안분 메타 (UI·결과카드 표시용) — keepSettlement면 신축주택분만. 과세대상 = 위 분기 배분의 합계(같은 값).
  const allocationBase = scaledInputs.reduce((s, b) => s + b.gain, 0);
  const nontaxableGain = allocationBase - taxableGainTotal;

  // LTHD 거주월수 귀속 메타 (사전법령해석재산 2020-386 + §154⑧ 노출)
  // #12 — 토지만 출자한 원조합원은 종전 거주를 세지 않는다(`computeRedevelopmentLthd`와 같은 규칙 — 표시가 적용 공제율과 어긋나지 않게).
  const landNewBuild = isLandContributedNewBuild(redevInfo);
  const priorInput = landNewBuild ? undefined : redevInfo.priorHouseResidenceMonths;
  const prior = priorInput ?? 0;
  const newMonths = redevInfo.newHouseResidenceMonths ?? 0;
  const existingResidenceMonths =
    priorInput !== undefined || redevInfo.newHouseResidenceMonths !== undefined
      ? prior + newMonths
      : 0;
  const payResidenceMonths =
    priorInput !== undefined || redevInfo.newHouseResidenceMonths !== undefined
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
      existingTable: appliedTable([redevRaw.preApproval, redevRaw.postApprovalExistingHouse]),
      payTable: appliedTable([redevRaw.settlement]),
      ...([redevRaw.preApproval, redevRaw.postApprovalExistingHouse, redevRaw.settlement].some((b) => b.lthdHoldingOnlyTable2 === true)
        ? { table2HoldingOnly: true as const }
        : {}),
      ...(!landNewBuild && redevInfo.priorResidenceStartDate && redevInfo.priorResidenceEndDate
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

