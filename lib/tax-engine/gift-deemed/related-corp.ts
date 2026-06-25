/**
 * §45의3 특수관계법인과의 거래를 통한 이익의 증여 의제 (일감몰아주기).
 * 시행령 §34의3. 교재 사례4(중소) 재현: 갑 20,520,000 + 을 16,200,000 = 36,720,000원.
 *
 * ★3개 비율 분리 (혼동 금지 — 중소만 우연히 거래50·보유10으로 같음):
 *   정상거래비율(§⑦ 과세요건) / 한계보유비율(§⑨ 수증자) / 계산식 차감비율(§①2호·§⑬).
 */
import type { CalculationStep } from "../types/inheritance-gift.types";
import { GIFT } from "../legal-codes/inheritance-gift";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { RelatedCorpInput, DeemedGiftResult, RcRecipientBreakdown } from "./types";
import {
  computeIndirectRatio,
  computeCommonExclusion,
  fracMin,
  fracMaxZeroSub,
  applyTwoFractions,
  toDecimal,
  type Frac,
} from "./related-corp-helpers";

type Size = "small" | "medium" | "large";

/** §34의3⑦ 정상거래비율 (과세요건 판정) — 분자(분모 100) */
const NORMAL_TRADE_RATIO: Record<Size, number> = { small: 50, medium: 40, large: 30 };

/** §34의3⑨ 한계보유비율 (수증자 판정) — 분자(분모 100) */
const MARGINAL_OWNERSHIP_RATIO: Record<Size, number> = { small: 10, medium: 10, large: 3 };

/**
 * §45의3①2호 계산식 거래비율차감 (legal_research 박스 verbatim 검증 — get_law_text 미렌더 우회).
 * 가목(중소)="정상거래비율을 초과"(§⑦ 50%) / 나목(중견)="정상거래비율의 100분의50을 초과"(40×50%=20%) / 다목(일반)="100분의5를 초과"(고정 5%).
 */
const TRADE_RATIO_DEDUCTION: Record<Size, number> = { small: 50, medium: 20, large: 5 };

/**
 * §45의3①2호 계산식 보유비율차감 (legal_research 박스 verbatim 검증).
 * 가목(중소)="한계보유비율을 초과"(§⑨ 10%) / 나목(중견)="한계보유비율의 100분의50을 초과"(10×50%=5%) / 다목(일반)="주식보유비율"(차감 없음, 0).
 */
const OWNERSHIP_RATIO_DEDUCTION: Record<Size, number> = { small: 10, medium: 5, large: 0 };

const RATIO_DENOM = 100;

export function calcRelatedCorpGift(input: RelatedCorpInput): DeemedGiftResult {
  const {
    enterpriseSize,
    totalSales,
    preTaxAdjOperatingIncome,
    taxableIncome,
    corporateTaxNet,
    shareholders,
    intermediaryCorps,
    salesPartners,
  } = input;

  const individuals = shareholders.filter((s) => !s.isCorporate);

  // ── 단계1: 지배주주 판정 (ruling 모드 — 전 경유 합산) ──
  const rulingRanked = individuals
    .map((s) => ({
      id: s.id,
      name: s.name,
      decimal:
        toDecimal(s.directRatio) +
        toDecimal(computeIndirectRatio(s.id, intermediaryCorps, "ruling")),
    }))
    .sort((a, b) => b.decimal - a.decimal);
  const rulingShareholder = rulingRanked[0]?.name?.trim() || "지배주주";
  // 지배주주등 = 지배주주 후보(self) + 친족(relative)
  const rulingGroupIds = individuals
    .filter((s) => s.relation === "self" || s.relation === "relative")
    .map((s) => s.id);

  // ── 단계2·3: 특수관계법인·거래비율·과세요건 (수혜법인 단위 1회) ──
  const relatedSales = salesPartners
    .filter((p) => p.isRelated)
    .reduce((a, p) => a + p.salesAmount, 0);
  const commonExclusion = computeCommonExclusion(salesPartners);
  const tradeRatioNumer = relatedSales - commonExclusion;
  const tradeRatioDenom = totalSales - commonExclusion;
  const normalTrade = NORMAL_TRADE_RATIO[enterpriseSize];
  const marginal = MARGINAL_OWNERSHIP_RATIO[enterpriseSize];
  const marginalFrac: Frac = { numer: marginal, denom: RATIO_DENOM };
  // 거래비율 > 정상거래비율: numer/denom > threshold/100 → numer×100 > denom×threshold
  const taxRequirementMet = tradeRatioNumer * RATIO_DENOM > tradeRatioDenom * normalTrade;

  const echo = {
    rulingShareholder,
    tradeRatio: { numer: tradeRatioNumer, denom: tradeRatioDenom },
    relatedSales,
    taxableExcludedSales: commonExclusion,
    tradeRatioNumer,
    tradeRatioDenom,
    taxRequirementMet,
    normalTradeRatio: { numer: normalTrade, denom: RATIO_DENOM } as Frac,
    marginalOwnershipRatio: marginalFrac,
  };

  if (!taxRequirementMet) {
    return {
      type: "related_corp",
      applied: false,
      deemedGiftValue: 0,
      breakdown: [
        { label: "특수관계법인 매출 합계", amount: relatedSales, lawRef: GIFT.RELATED_CORP },
        { label: "과세제외매출액(§⑩)", amount: commonExclusion },
      ],
      exclusionReason: "특수관계법인거래비율이 정상거래비율 이하 — 과세요건 미충족 (§45의3①1호)",
      legalBasis: GIFT.RELATED_CORP,
      recipientBreakdown: [],
      baseAfterTaxProfit: 0,
      ...echo,
    };
  }

  // ── 단계4: 수증자 판정 (recipient 모드 — §⑱ 법인 경유만) ──
  const recipients = individuals
    .filter((s) => s.relation === "self" || s.relation === "relative")
    .filter((s) => {
      const ind = computeIndirectRatio(s.id, intermediaryCorps, "recipient", rulingGroupIds);
      // 직접 + 간접 > 한계: (d.n/d.d + i.n/i.d) > marginal/100
      const totalNumer = s.directRatio.numer * ind.denom + ind.numer * s.directRatio.denom;
      const totalDenom = s.directRatio.denom * ind.denom;
      return totalNumer * RATIO_DENOM > totalDenom * marginal;
    });

  // ── 단계5 공통: 세후영업이익 앞부분 (수혜법인 단위) ──
  // capRatio = min(preTaxAdj/taxableIncome, 1). preTaxAdj ≥ taxableIncome → 1 (전액 차감).
  const capApplied = preTaxAdjOperatingIncome >= taxableIncome;
  const taxDeduct = capApplied
    ? corporateTaxNet
    : safeMultiplyThenDivide(corporateTaxNet, preTaxAdjOperatingIncome, taxableIncome);
  const baseAfterTax = preTaxAdjOperatingIncome - taxDeduct;

  const tradeDeduction = TRADE_RATIO_DEDUCTION[enterpriseSize];
  const rows: RcRecipientBreakdown[] = [];

  for (const r of recipients) {
    // §⑭3호 수증자별 추가 과세제외 (⑩ 미해당 특수관계법인 × 이 수증자 보유비율)
    let additionalExclusion = 0;
    for (const p of salesPartners) {
      if (!p.isRelated || p.exclusionType) continue;
      const stake = p.rulingShareholderStakes?.find((x) => x.shareholderId === r.id);
      if (!stake) continue;
      additionalExclusion += safeMultiplyThenDivide(p.salesAmount, stake.ratio.numer, stake.ratio.denom);
    }
    const totalExclusion = commonExclusion + additionalExclusion;

    // 단계5: 세후영업이익(수증자별) = baseAfterTax × (총매출 − 과세제외) / 총매출
    const pretaxProfit = safeMultiplyThenDivide(baseAfterTax, totalSales - totalExclusion, totalSales);

    // 단계6: 거래비율 − 거래비율차감 (수증자별 과세제외 반영)
    const recTradeNumer = relatedSales - totalExclusion;
    const recTradeDenom = totalSales - totalExclusion;
    const tradeOverNumerBig =
      BigInt(recTradeNumer) * BigInt(RATIO_DENOM) - BigInt(recTradeDenom) * BigInt(tradeDeduction);
    const tradeOver: Frac = {
      numer: Number(tradeOverNumerBig > 0n ? tradeOverNumerBig : 0n),
      denom: recTradeDenom * RATIO_DENOM,
    };

    // 단계7: 보유비율 − 보유비율차감 (한계 간접 우선차감, 음수 방지)
    const ind = computeIndirectRatio(r.id, intermediaryCorps, "recipient", rulingGroupIds);
    const ownershipDeduction: Frac = { numer: OWNERSHIP_RATIO_DEDUCTION[enterpriseSize], denom: RATIO_DENOM };
    const indirectDeduct = fracMin(ind, ownershipDeduction); // 간접에서 먼저 차감
    const remaining = fracMaxZeroSub(ownershipDeduction, indirectDeduct); // 잔여 차감분
    const indirectOver = fracMaxZeroSub(ind, ownershipDeduction);
    const directOver = fracMaxZeroSub(r.directRatio, remaining);

    // 단계8: 직접/간접 출자관계별 증여의제이익 (floor 1회)
    const directGain = applyTwoFractions(pretaxProfit, tradeOver, directOver);
    const indirectGain = indirectOver.numer > 0 ? applyTwoFractions(pretaxProfit, tradeOver, indirectOver) : 0;

    // 단계9: §⑮ 배당공제 — 사례 0 (정밀 산식 SCOPE_OUT, 배당가능이익 입력 미수령)
    const dividendDeduction = 0;
    const subtotal = Math.max(0, directGain - dividendDeduction) + Math.max(0, indirectGain);

    rows.push({
      recipientName: r.name.trim() || "지배주주등",
      directGain,
      indirectGain,
      subtotal,
      pretaxProfit,
      tradeRatioOver: tradeOver,
      directRatioRaw: r.directRatio,
      indirectRatioRaw: ind,
      directOwnershipOver: directOver,
      indirectOwnershipOver: indirectOver,
      additionalExclusion,
      totalExclusion,
      dividendDeduction,
    });
  }

  const deemedGiftValue = rows.reduce((a, b) => a + b.subtotal, 0);

  const breakdown: CalculationStep[] = [
    { label: "특수관계법인 매출 합계", amount: relatedSales, lawRef: GIFT.RELATED_CORP },
    { label: "과세제외매출액(§⑩)", amount: commonExclusion },
    { label: "세후영업이익(공통)", amount: baseAfterTax, note: "§34의3⑫ 과세매출비율 적용 전" },
    {
      label: "증여의제이익 합계",
      amount: deemedGiftValue,
      lawRef: GIFT.RELATED_CORP,
      note: "수증자별 직접+간접 출자관계 합산 (§45의3②⑲ — 단일법인 의제)",
    },
  ];

  return {
    type: "related_corp",
    applied: deemedGiftValue > 0,
    deemedGiftValue,
    breakdown,
    legalBasis: GIFT.RELATED_CORP,
    recipientBreakdown: rows,
    baseAfterTaxProfit: baseAfterTax,
    ...echo,
  };
}
