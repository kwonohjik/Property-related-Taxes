/**
 * §45의3 특수관계법인과의 거래를 통한 이익의 증여 의제 (일감몰아주기).
 * 시행령 §34의3. 교재 사례4(중소) 재현: 갑 20,520,000 + 을 16,200,000 = 36,720,000원.
 *
 * ★3개 비율 분리 (혼동 금지 — 중소만 우연히 거래50·보유10으로 같음):
 *   정상거래비율(상증령 §34의3⑦ 과세요건) / 한계보유비율(상증령 §34의3⑨ 수증자) /
 *   계산식 차감비율(상증법 §45의3①2호 · 상증령 §34의3⑬).
 *   ※ 인용은 법령명과 법/령 단계를 함께 적는다 — 항 번호만 쓰면 법과 시행령이 섞인다.
 */
import type { CalculationStep } from "../types/inheritance-gift.types";
import { GIFT } from "../legal-codes/inheritance-gift";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { RelatedCorpInput, DeemedGiftResult, RcRecipientBreakdown } from "./types";
import {
  computeIndirectRatio,
  computeIndirectPaths,
  partitionSec13Paths,
  splitIndirectOverByPath,
  computeSec15Clause1,
  computeSec15Clause2,
  sumIndirectPaths,
  reduceFracBig,
  computeCommonExclusion,
  isSec18SalesPartner,
  isIntermediarySec18,
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

/**
 * §45의3①1호나목2) — 중소·중견이 **아닌** 법인의 추가 과세요건 임계.
 * 상증령 §34의3(1천억원 규정 항) 본문 verbatim:
 *   「법 제45조의3제1항제1호나목2)에서 "대통령령으로 정하는 금액"이란 1천억원을 말한다.」
 *
 * ⚠️ 같은 항 **단서**(사업부문별로 회계를 구분한 경우 「1천억원 × 사업부문별 매출액 ÷ 전체
 *    매출액」으로 안분)는 법 §45의3① 각 호 외 부분 **후단**(사업부문별 계산)에 걸리는데,
 *    그 축이 이 엔진에 없다 — 단서를 흉내 내면 근거 없이 임계를 낮추게 되므로 본문만 쓴다.
 */
const LARGE_RELATED_SALES_THRESHOLD = 100_000_000_000;

const RATIO_DENOM = 100;

/**
 * 과세요건 미충족 사유 — **어느 갈래가 왜 막혔는지**까지 적는다.
 *
 * 종전에는 규모와 무관하게 「특수관계법인거래비율이 정상거래비율 이하」 하나였다.
 * 일반기업은 나목2)라는 **두 번째 갈래**가 있으므로, 그 문구는 25%처럼 나목2) 밴드에
 * 들어간 사안에도 「요건 미충족」을 단정해 **거짓 안전 신호**가 된다.
 */
function buildExclusionReason(size: Size, twoThirdsMet: boolean, relatedNet: number): string {
  if (size !== "large") {
    return "특수관계법인거래비율이 정상거래비율 이하 — 과세요건 미충족 (상증법 §45의3①1호가목)";
  }
  if (!twoThirdsMet) {
    return "특수관계법인거래비율이 정상거래비율의 3분의 2 이하 — 나목1)·2) 모두 미해당 (상증법 §45의3①1호나목)";
  }
  return (
    "특수관계법인거래비율은 정상거래비율의 3분의 2를 초과하나, 특수관계법인에 대한 매출액" +
    `(과세제외매출 차감 후 ${relatedNet.toLocaleString("ko-KR")}원)이 1천억원 이하 — ` +
    "과세요건 미충족 (상증법 §45의3①1호나목2) · 상증령 §34의3)"
  );
}

export function calcRelatedCorpGift(input: RelatedCorpInput): DeemedGiftResult {
  const {
    enterpriseSize,
    totalSales,
    preTaxAdjOperatingIncome,
    taxableIncome,
    corporateTaxNet,
    distributableProfit = 0,
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
  // §45의3①1호**가목**(중소·중견) = 같은 호 **나목1)**「가목에 따른 사유」(일반) — 전 규모 공통.
  //   거래비율 > 정상거래비율: numer/denom > threshold/100 → numer×100 > denom×threshold
  const clauseAMet = tradeRatioNumer * RATIO_DENOM > tradeRatioDenom * normalTrade;

  // §45의3①1호**나목2)** — 중소·중견이 아닌 법인에만 있는 **택일** 요건.
  //   「특수관계법인거래비율이 정상거래비율의 3분의 2를 초과하는 경우로서 특수관계법인에 대한
  //    매출액이 … 대통령령으로 정하는 금액을 초과하는 경우」.
  //   둘 다 조문상 «초과»라 경계값(정확히 3분의 2 · 정확히 1천억원)은 **미해당**이다.
  //
  //   ⚠️ 1천억원과 견줄 「특수관계법인에 대한 매출액」은 법 §45의3④가 「제1항에 따른 매출액에서
  //      … 대통령령으로 정하는 매출액은 제외한다」고 정한 뒤의 금액이다 — 거래비율 분자와
  //      **같은 기준선**(`tradeRatioNumer` = 특수관계매출 − 과세제외매출)을 쓴다.
  //   ⚠️ BigInt — 대기업 매출 규모에서 `denom × normalTrade × 2`가 2^53을 넘는다
  //      (실측: 총매출 300조·비특수관계 225조 → 225e12 × 30 × 2 = 1.35e16 > 9.0e15).
  const twoThirdsMet =
    BigInt(tradeRatioNumer) * 300n > BigInt(tradeRatioDenom) * BigInt(normalTrade) * 2n;
  const clauseB2Met =
    enterpriseSize === "large" && twoThirdsMet && tradeRatioNumer > LARGE_RELATED_SALES_THRESHOLD;

  const taxRequirementMet = clauseAMet || clauseB2Met;
  const taxRequirementClause = clauseAMet
    ? enterpriseSize === "large"
      ? "상증법 §45의3①1호나목1)"
      : "상증법 §45의3①1호가목"
    : clauseB2Met
      ? "상증법 §45의3①1호나목2)"
      : undefined;

  const echo = {
    // §45의3③ — 증여시기는 「수혜법인의 해당 사업연도 종료일」이다(거래일·신고일이 아니다).
    //   저장소 4개 엔진이 쓰는 `appliedLawDate` 관례를 증여의제에도 맞춘다.
    ...(input.fiscalYearEndDate ? { appliedLawDate: input.fiscalYearEndDate } : {}),
    rulingShareholder,
    tradeRatio: { numer: tradeRatioNumer, denom: tradeRatioDenom },
    relatedSales,
    taxableExcludedSales: commonExclusion,
    tradeRatioNumer,
    tradeRatioDenom,
    taxRequirementMet,
    ...(taxRequirementClause ? { taxRequirementClause } : {}),
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
      exclusionReason: buildExclusionReason(enterpriseSize, twoThirdsMet, tradeRatioNumer),
      legalBasis: GIFT.RELATED_CORP,
      // §47① 합산배제증여재산(§45의3). §55①2호 — 증여의제이익 그대로 과세표준(3천만 공제 없음). (H-40·G-4)
      aggregationExcluded: true,
      aggExclClass: "deemed_profit",
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
    // ── §⑭ 출자관계별 추가 과세제외 ──────────────────────────────────────────
    //  대상은 「제10항 각 호의 어느 하나에 해당하지 **아니하는**」 매출처뿐이다(⑭ 본문).
    //  ⑭ 후단 「동시에 해당하는 경우에는 더 큰 금액으로 한다」는 **같은 거래가 여러 호에
    //  동시 해당할 때**의 규칙이므로 매출처 단위 `Math.max`, 매출처 사이는 합산이다
    //  (⑩ 쪽 `computeCommonExclusion`이 같은 구조를 쓴다).
    let additionalExclusion = 0;
    for (const p of salesPartners) {
      if (!p.isRelated || p.exclusionType) continue;
      // ⑭1호 — 「수혜법인이 제18항에 따른 간접출자법인인 특수관계법인과 거래한 매출액」 «전액»
      const sec14n1 = isSec18SalesPartner(p, intermediaryCorps, rulingGroupIds) ? p.salesAmount : 0;
      // ⑭3호 — 「… 매출액에 지배주주등의 그 특수관계법인에 대한 주식보유비율을 곱한 금액」
      const stake = p.rulingShareholderStakes?.find((x) => x.shareholderId === r.id);
      const sec14n3 = stake
        ? safeMultiplyThenDivide(p.salesAmount, stake.ratio.numer, stake.ratio.denom)
        : 0;
      additionalExclusion += Math.max(sec14n1, sec14n3);
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

    // ── 단계7: 보유비율 − 보유비율차감 (한계 간접 우선차감, 음수 방지) ──────────
    //  §⑬ 전단 — 증여의제이익은 「출자관계(**간접보유비율이 1천분의 1 미만인 경우의 해당
    //  출자관계는 제외**)별로 각각 구분하여 계산한 금액을 모두 합하여」 계산한다.
    //
    //  ⚠️ 이 제외는 **이익 계산에만** 건다. 위 `recipients` 필터(§⑧ 수증자 판정 —
    //     직접+간접이 한계보유비율 초과)에는 같은 카브아웃이 없으므로 그쪽은 합산값을
    //     그대로 쓴다. 두 축을 섞으면 법령상 수증자인 사람이 대상에서 빠진다.
    //
    //  ⚠️ 미소 관계를 살려 두면 «세액이 두 방향으로» 틀렸다 —
    //     일반기업은 `OWNERSHIP_RATIO_DEDUCTION.large = 0`이라 그 간접분이 곧바로 이익이 되고,
    //     중소·중견은 미소 관계가 한계보유비율 차감분 일부를 «흡수»해 직접초과가 커진다.
    const allPaths = computeIndirectPaths(r.id, intermediaryCorps, "recipient", rulingGroupIds);
    const { kept: sec13Kept, excluded: sec13Excluded } = partitionSec13Paths(allPaths);
    const indBig = sumIndirectPaths(sec13Kept);
    const ind = reduceFracBig(indBig.numer, indBig.denom);
    const ownershipDeduction: Frac = { numer: OWNERSHIP_RATIO_DEDUCTION[enterpriseSize], denom: RATIO_DENOM };
    const indirectDeduct = fracMin(ind, ownershipDeduction); // 간접에서 먼저 차감
    const remaining = fracMaxZeroSub(ownershipDeduction, indirectDeduct); // 잔여 차감분
    const indirectOver = fracMaxZeroSub(ind, ownershipDeduction);
    const directOver = fracMaxZeroSub(r.directRatio, remaining);

    // 단계8: 직접/간접 출자관계별 증여의제이익 (floor 1회)
    const directGain = applyTwoFractions(pretaxProfit, tradeOver, directOver);
    const indirectGain = indirectOver.numer > 0 ? applyTwoFractions(pretaxProfit, tradeOver, indirectOver) : 0;

    // ── 단계9: §⑮ 배당공제 ────────────────────────────────────────────────
    //  「… 수혜법인 또는 간접출자법인으로부터 배당받은 소득이 있는 경우에는 다음 각 호의
    //    구분에 따른 금액을 **해당 출자관계의** 증여의제이익에서 공제한다. 다만, 공제 후의
    //    금액이 음수인 경우에는 영으로 본다.」
    //
    //  ⚠️ 「해당 출자관계의」가 이 조문의 핵심이다 — 1호는 **직접** 출자관계의 이익에서,
    //     2호는 **그 간접출자법인을 경유한** 출자관계의 이익에서만 뺀다. 종전 코드는
    //     `Math.max(0, directGain - dividendDeduction) + Math.max(0, indirectGain)`으로
    //     공제 슬롯이 **직접 쪽에 하나뿐**이었다 — 2호는 값이 0인 게 아니라 **자리가 없었다**.
    //  단서 「공제 후의 금액이 음수인 경우에는 영으로 본다」 — 초과분은 **버려지지** 다른
    //  출자관계로 넘어가지 않는다. 기록값도 실제 차감액으로 맞춘다(표시↔차감 일관성):
    //  산식값 그대로 두면 화면에 「−200억 / 소계 0」처럼 서로 맞지 않는 두 수가 나란히 찍힌다.
    const sec15n1 = Math.min(
      computeSec15Clause1(r.dividendFromBeneficiary ?? 0, directGain, distributableProfit, r.directRatio),
      directGain,
    );

    //  2호는 경유 법인마다 분모가 다르므로 출자관계별로 계산하고, 음수 방지 클램프도
    //  **관계별로** 건다(조문 단서가 「해당 출자관계의 증여의제이익」을 대상으로 한다).
    let sec15n2 = 0;
    if (sec13Kept.length > 0) {
      const { overs } = splitIndirectOverByPath(sec13Kept, ownershipDeduction);
      for (const { corpShareholderId, over } of overs) {
        if (over.numer <= 0) continue;
        const corp = intermediaryCorps.find((c) => c.corpShareholderId === corpShareholderId);
        if (!corp) continue;
        const owner = corp.owners.find((o) => o.individualId === r.id);
        if (!owner?.dividendIncome) continue;
        const pathGain = applyTwoFractions(pretaxProfit, tradeOver, over);
        const deduction = computeSec15Clause2(
          owner.dividendIncome,
          pathGain,
          corp.distributableProfit ?? 0,
          distributableProfit,
          corp.stakeInBeneficiary,
          owner.ratio,
        );
        sec15n2 += Math.min(deduction, pathGain);
      }
    }

    const dividendDeduction = sec15n1 + sec15n2;
    //  단서의 「음수면 0」은 **공제액을 그 출자관계의 이익까지로 자르는 것**과 같다. 잘라 둔
    //  뒤에 바깥에서 max(0,…)을 또 걸면 관문이 둘이 되어, 한쪽을 지워도 테스트가 빨개지지
    //  않는다(뮤테이션 실측 — 직접 쪽 바깥 클램프가 죽은 코드였다). 관문은 하나로 둔다.
    //
    //  ⚠️ 간접 쪽만 예외다 — `sec15n2`는 **관계별 floor의 합**이고 `indirectGain`은 **합산 후
    //     1회 floor**라, 공제가 각 관계의 이익을 꽉 채우면 합이 최대 (관계수−1)원 더 클 수 있다.
    const subtotal = (directGain - sec15n1) + Math.max(0, indirectGain - sec15n2);

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
      ...(sec13Excluded.length > 0 ? { sec13ExcludedCount: sec13Excluded.length } : {}),
    });
  }

  const deemedGiftValue = rows.reduce((a, b) => a + b.subtotal, 0);

  /**
   * §⑭**2호·4호 미구현 고지**.
   *
   * 2호(지주회사의 다른 자회사·손자회사와 거래 × 지주회사의 그 법인 보유비율)와
   * 4호(간접출자법인의 다른 자법인과 거래 × 그 간접출자법인의 보유비율, 가·나·다목 3요건)는
   * **지주회사 관계·자법인 관계**를 입력 모델이 표현하지 못해 구현하지 않았다.
   *
   * 미구현의 방향은 **과세제외 과소 = 과대과세**라 「법 근거 없이 불리 적용 금지」와 부딪힌다.
   * 그래서 침묵하지 않는다 — ⑭1호(전액)가 걸리지 않은 ⑩ 미해당 특수관계 매출처가 남아 있을
   * 때만(=2호·4호가 «더 큰 금액»이 될 여지가 있을 때만) 고지한다. 여지가 없으면 사라진다.
   */
  const sec14Unmodeled = salesPartners.filter(
    (p) => p.isRelated && !p.exclusionType && !isSec18SalesPartner(p, intermediaryCorps, rulingGroupIds),
  );
  /**
   * §⑱**2호·3호 미구현 고지**.
   *
   * ⑱1호를 충족하지 못한 간접출자법인은 간접보유비율에서 **통째로 빠진다**(recipient 모드).
   * 그 법인이 2호(지배주주등 및 1호 법인이 합산 50% 이상)나 3호(개재법인)에 해당한다면
   * 간접분이 살아나 증여의제이익이 **늘어야** 한다 — 즉 미구현 방향은 **과소과세**다.
   * 2·3호는 「법인이 법인을 보유하는」 구조라 `owners`(개인만)로 표현할 수 없다.
   *
   * ⇒ 1호 미충족 법인이 실제로 있을 때만 고지한다(없으면 빠진 것이 없으므로 고지도 없다).
   */
  const sec18Dropped = intermediaryCorps.filter((c) => !isIntermediarySec18(c, rulingGroupIds));
  const sec18ScopeNotice =
    sec18Dropped.length > 0
      ? `간접출자법인 ${sec18Dropped.length}곳이 상증령 §34의3⑱1호(지배주주등 30% 이상 출자)를 ` +
        `충족하지 않아 간접보유비율에서 제외됐습니다. 같은 항 2호(지배주주등 및 1호 법인이 합산 ` +
        `50% 이상 출자)·3호(개재법인)는 법인이 법인을 보유하는 구조를 입력받지 않아 판정하지 ` +
        `않습니다 — 해당하면 간접분이 살아나 증여의제이익이 늘 수 있으므로 별도 검토가 필요합니다.`
      : undefined;

  const sec14ScopeNotice =
    sec14Unmodeled.length > 0
      ? `상증령 §34의3⑭ 2호(지주회사의 다른 자회사·손자회사)·4호(간접출자법인의 다른 자법인)는 ` +
        `지주회사·자법인 관계를 입력받지 않아 계산하지 않습니다. 해당하면 과세제외매출액이 ` +
        `늘어 증여의제이익이 줄 수 있으므로 별도 검토가 필요합니다 (대상 매출처 ${sec14Unmodeled.length}곳).`
      : undefined;

  const breakdown: CalculationStep[] = [
    { label: "특수관계법인 매출 합계", amount: relatedSales, lawRef: GIFT.RELATED_CORP },
    { label: "과세제외매출액(§⑩)", amount: commonExclusion },
    { label: "세후영업이익(공통)", amount: baseAfterTax, note: "§34의3⑫ 과세매출비율 적용 전" },
    {
      label: "증여의제이익 합계",
      amount: deemedGiftValue,
      lawRef: GIFT.RELATED_CORP,
      // 🔴 종전 「§45의3②⑲」는 **존재하지 않는 항**이다 — 법 §45의3은 ①~⑤가 전부이고,
      //    「특수관계법인이 둘 이상이어도 하나의 법인으로부터 받은 것으로 본다」는
      //    **시행령** §34의3⑲이며 그것은 «증여자 특정»이지 출자관계 합산의 근거가 아니다.
      //    합산 근거는 법 §45의3②(직접+간접 각각 계산 후 합산)과 영 §34의3⑬이다.
      //    이 문자열은 `DeemedGiftResultView`가 사용자에게 그대로 렌더한다.
      note: "수증자별 직접+간접 출자관계 합산 (상증법 §45의3② · 상증령 §34의3⑬)",
    },
  ];

  return {
    type: "related_corp",
    applied: deemedGiftValue > 0,
    deemedGiftValue,
    breakdown,
    legalBasis: GIFT.RELATED_CORP,
    // §47① 합산배제증여재산(§45의3). §55①2호 — 증여의제이익 그대로 과세표준(3천만 공제 없음). (H-40·G-4)
    aggregationExcluded: true,
    aggExclClass: "deemed_profit",
    ...(sec14ScopeNotice ? { sec14ScopeNotice } : {}),
    ...(sec18ScopeNotice ? { sec18ScopeNotice } : {}),
    recipientBreakdown: rows,
    baseAfterTaxProfit: baseAfterTax,
    ...echo,
  };
}
