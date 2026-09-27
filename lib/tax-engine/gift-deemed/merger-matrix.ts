/**
 * 합병 §38 — 주주 매트릭스 (Phase B).
 * 다수 대주주 동시 산출 + 동일인 자기증여 차감(재산세과-799, 2009.4.24.) + 증여자별 안분.
 * 사례2(교재) 전수 동결. 일반성은 KoreanLaw 예규 본문으로 추가 검증.
 */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide, safeMulDivRound } from "../tax-utils";
import { isSameMergerShareholder } from "./capital-helpers";
import { resolveMergedPrice } from "./merger-valuation";
import { FOR_PROFIT_DONEE_REASON } from "./taxpayer-gate";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, MergerInput, MergerMatrix } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

export function calcMergerMatrix(input: MergerInput): DeemedGiftResult {
  const sh = input.shareholders!;
  const { mergedSharePrice: merged, computedSimpleAvg } = resolveMergedPrice(input);

  const overTotal = sh.overvalued.reduce((s, x) => s + x.shares, 0); // = preMergerShares
  const underTotal = sh.undervalued.reduce((s, x) => s + x.shares, 0);
  // 교부총수 = 과대평가법인 합병전 주식수 × 환산비
  const exchangedTotal = safeMultiplyThenDivide(overTotal, sh.exchangeRatio.numer, sh.exchangeRatio.denom);
  // ㉯ = 과대평가법인 1주평가 × (합병전 주식수 ÷ 교부총수)
  const adjustedOvervalued =
    exchangedTotal > 0 ? safeMultiplyThenDivide(input.overvaluedSharePrice, overTotal, exchangedTotal) : 0;
  const perShareGain = Math.max(0, merged - adjustedOvervalued);

  const allocation: Record<string, Record<string, number>> = {};
  const recipients: MergerMatrix["recipients"] = [];
  let totalDeemedGift = 0;

  for (const k of sh.overvalued) {
    const grantedShares = safeMultiplyThenDivide(k.shares, sh.exchangeRatio.numer, sh.exchangeRatio.denom);
    const grossGain = safeMultiply(perShareGain, grantedShares);

    // 자기증여 차감: 동일인이 과소평가(증여자측)법인 주주이기도 하면
    //   self = grossGain × (동일인 과소평가지분 ÷ 과대평가지분)
    //        = grossGain × (donor.shares/underTotal) ÷ (k.shares/overTotal)
    const donorSelf = sh.undervalued.find((u) => isSameMergerShareholder(k.id, u.id));
    const selfGift =
      donorSelf && k.shares > 0 && underTotal > 0
        ? safeMulDivRound(grossGain, donorSelf.shares * overTotal, k.shares * underTotal)
        : 0;
    const netGain = Math.max(0, grossGain - selfGift);

    // §28④1 기준금액 = Min(합병후평가 × 교부주식수 × 30%, 3억) — 수증자별 개별 판정
    const threshold = Math.min(applyRate(safeMultiply(merged, grantedShares), 0.3), ABSOLUTE_THRESHOLD);
    const meetsThreshold = netGain > 0 && netGain >= threshold;
    // 「상증법」§2 9호·§4의2①·③ — 영리법인은 수증자가 아니다. 이 행만 빠지고, 같은 사람이
    // 증여자(undervalued)로서 갖는 몫과 아래 증여자별 안분은 그대로다.
    const forProfitOut = meetsThreshold && k.isForProfitCorp === true;
    const applied = meetsThreshold && !forProfitOut;
    if (applied) totalDeemedGift += netGain;

    recipients.push({
      id: k.id, name: k.name, grossGain, selfGift, netGain, applied, threshold,
      ...(forProfitOut && { excludedReason: FOR_PROFIT_DONEE_REASON }),
    });

    // 증여자별 안분: 순이익을 (자기 제외) 증여자 지분으로 안분. 마지막 증여자 잔액 흡수(floor 정합).
    const donors = sh.undervalued.filter((j) => !isSameMergerShareholder(k.id, j.id));
    const donorTotal = donors.reduce((s, j) => s + j.shares, 0);
    allocation[k.id] = {};
    let allocated = 0;
    donors.forEach((j, idx) => {
      const amt =
        idx === donors.length - 1
          ? netGain - allocated // 잔액 흡수 (feedback_floor_residual_absorption)
          : donorTotal > 0
            ? safeMulDivRound(netGain, j.shares, donorTotal)
            : 0;
      allocation[k.id][j.id] = amt;
      allocated += amt;
    });
  }

  const mergerMatrix: MergerMatrix = { recipients, allocation, totalDeemedGift };

  const breakdown: CalculationStep[] = [
    { label: "합병 후 1주당 평가가액", amount: merged, lawRef: GIFT.MERGER_VALUATION },
    { label: "과대평가법인 1주당 평가가액 (합병전÷교부 비율 조정)", amount: adjustedOvervalued },
    { label: "1주당 이익", amount: perShareGain },
    ...recipients.map((r) => ({
      // 제외된 행은 정의어(§31① 「증여재산가액」)를 달지 않고 금액을 「제외 전」으로 남긴다(7-12와 같은 규칙)
      label: r.excludedReason
        ? `${r.name} 제외 전 산출 이익 (영리법인 수증자 — 과세 제외)`
        : `${r.name} 증여재산가액${r.applied ? "" : " (기준금액 미만 제외)"}`,
      amount: r.applied || r.excludedReason ? r.netGain : 0,
      note: r.selfGift > 0 ? `차감전 ${r.grossGain.toLocaleString()} − 자기증여 ${r.selfGift.toLocaleString()}` : undefined,
    })),
    { label: "증여재산가액 합계", amount: totalDeemedGift, lawRef: GIFT.MERGER, note: "§38 주주 매트릭스" },
  ];

  return {
    type: "merger",
    applied: totalDeemedGift > 0,
    deemedGiftValue: totalDeemedGift,
    breakdown,
    exclusionReason:
      totalDeemedGift > 0
        ? undefined
        : recipients.some((r) => r.excludedReason)
          ? FOR_PROFIT_DONEE_REASON
          : "전 수증자 이익이 기준금액(합병후평가 30%·3억 중 적은 금액) 미만",
    legalBasis: GIFT.MERGER,
    mergerMatrix,
    thresholdEcho: computedSimpleAvg !== undefined ? { computedMergedPrice: computedSimpleAvg } : undefined,
  };
}
