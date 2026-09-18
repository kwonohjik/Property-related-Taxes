/**
 * 안전망 공백 메우기 — 비율 상수·경계·분기 (RC-Q 재측정 잔여분).
 *
 * 리뷰 RC-Q(13건)를 현행 master에 대해 **전수 재측정**한 결과 6건은 W8~W14의 anchor가 이미
 * 닫았고, 여기 있는 것들이 남은 공백이다. **코드는 맞는데 아무도 고정하지 않던 것들**이라
 * 이 파일은 대부분 anchor만 추가한다 — 단, [L-0]만은 실제 결함(W11 회귀)을 고친 것이다.
 *
 * ⚠️ 경계 anchor는 **반드시 양성 짝과 쌍으로** 둔다. 「정확히 문턱이면 비과세」 단독은
 *    상수를 어느 방향으로 흔들어도 통과할 수 있다(feedback_negative_anchor_needs_positive_twin).
 *    쌍으로 두면 문턱 **하향 드리프트**(= 과다과세 방향)까지 함께 잡힌다.
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import type { RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const R = (pct: number) => ({ numer: Math.round(pct * 100), denom: 10_000 });
const BILLION = 1_000_000_000;

/** 총매출 1,000억 고정 — 특수관계매출만 바꿔 거래비율을 정확히 조준한다. */
function mk(
  size: "small" | "medium" | "large",
  relatedSales: number,
  extra: Partial<RelatedCorpInput> = {},
): RelatedCorpInput {
  return {
    enterpriseSize: size,
    totalSales: 100 * BILLION,
    preTaxAdjOperatingIncome: 10 * BILLION,
    taxableIncome: 10 * BILLION,
    corporateTaxNet: 2 * BILLION,
    fiscalYearEndDate: "2025-12-31",
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
      { id: "x", name: "기타", relation: "other", directRatio: R(80), isCorporate: false },
    ],
    intermediaryCorps: [],
    salesPartners: [
      { id: "D", name: "D", salesAmount: relatedSales, isRelated: true },
      { id: "E", name: "기타", salesAmount: 100 * BILLION - relatedSales, isRelated: false },
    ],
    ...extra,
  } as RelatedCorpInput;
}

describe("과세요건 문턱 — 「초과」이지 「이상」이 아니다 (상증령 §34의3⑦)", () => {
  // 정확히 정상거래비율이면 **비과세**다. 이 쌍은 두 가지를 동시에 잡는다:
  //   ① `>` → `>=` 드리프트 (RC-6-d)
  //   ② NORMAL_TRADE_RATIO **하향** 드리프트 (RC-6-c) — 문턱이 내려가면 「정확히」가 「초과」가 된다
  const CASES = [
    ["small", 50, 50.1, 800_000, "상증법 §45의3①1호가목"],
    ["medium", 40, 40.1, 241_200_000, "상증법 §45의3①1호가목"],
    ["large", 30, 30.1, 401_600_000, "상증법 §45의3①1호나목1)"],
  ] as const;

  for (const [size, exact, over, overValue, clause] of CASES) {
    it(`[B-${size}] 거래비율이 정확히 ${exact}%면 비과세 — 「이상」으로 바뀌면 세금이 생긴다`, () => {
      const r = calcRelatedCorpGift(mk(size, exact * BILLION));
      expect(r.taxRequirementMet).toBe(false);
      expect(r.applied).toBe(false);
      expect(r.deemedGiftValue).toBe(0);
    });

    it(`[B-${size}+] 양성 짝 — ${over}%면 과세된다 (${clause})`, () => {
      const r = calcRelatedCorpGift(mk(size, Math.round(over * BILLION)));
      expect(r.taxRequirementMet).toBe(true);
      expect(r.deemedGiftValue).toBe(overValue);
      expect(r.taxRequirementClause).toBe(clause);
    });
  }

  it("[B-large-2] 일반기업의 30% 정확 일치가 나목2)로도 새지 않는다", () => {
    // 나목2)는 「정상거래비율의 3분의 2 초과 **그리고** 특수관계매출 1천억 초과」다.
    // 30%면 3분의 2(20%)는 넘지만 특수관계매출이 300억이라 1천억 문턱에서 걸린다.
    const r = calcRelatedCorpGift(mk("large", 30 * BILLION));
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("1천억원 이하");
  });
});

describe("수증자 한계보유비율 문턱 — 「초과」이지 「이상」이 아니다 (상증령 §34의3⑧⑨)", () => {
  function withEul(size: "medium" | "large", eulPct: number) {
    return calcRelatedCorpGift(
      mk(size, size === "large" ? 60 * BILLION : 70 * BILLION, {
        shareholders: [
          { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
          { id: "eul", name: "을", relation: "relative", directRatio: R(eulPct), isCorporate: false },
          { id: "x", name: "기타", relation: "other", directRatio: R(80 - eulPct), isCorporate: false },
        ],
      } as Partial<RelatedCorpInput>),
    );
  }

  it("[M-large] 일반기업 — 정확히 3%인 친족은 수증자가 아니다", () => {
    const r = withEul("large", 3);
    expect(r.recipientBreakdown?.map((x) => x.recipientName)).toEqual(["갑"]);
    expect(r.deemedGiftValue).toBe(880_000_000);
  });

  it("[M-large+] 양성 짝 — 3.01%면 수증자가 된다", () => {
    const r = withEul("large", 3.01);
    expect(r.recipientBreakdown?.map((x) => x.recipientName)).toEqual(["갑", "을"]);
    expect(r.deemedGiftValue).toBe(1_012_440_000);
  });

  it("[M-medium] 중견 — 정확히 10%인 친족은 수증자가 아니다", () => {
    // ⚠️ 중견은 한계보유비율(10%)보다 계산식 차감(5%)이 **작다** — 경계 주주를 잘못 포함하면
    //    초과분이 0이 아니라 5%p로 남아 일반기업보다 오히려 영향이 크다.
    const r = withEul("medium", 10);
    expect(r.recipientBreakdown?.map((x) => x.recipientName)).toEqual(["갑"]);
    expect(r.deemedGiftValue).toBe(600_000_000);
  });

  it("[M-medium+] 양성 짝 — 10.01%면 수증자가 되고 200,400,000원이 더해진다", () => {
    const r = withEul("medium", 10.01);
    expect(r.deemedGiftValue).toBe(800_400_000);
  });
});

describe("법인세 안분 분기 — 세무조정후영업손익 < 각 사업연도 소득금액 (상증령 §34의3⑫2호나목)", () => {
  it("[C-0] 안분된다 — 법인세 순세액 × (영업손익 ÷ 소득금액)만 차감한다", () => {
    // 2,000,000,000 × 6,000,000,000/10,000,000,000 = 1,200,000,000 차감
    // ⇒ 세후영업이익 6,000,000,000 − 1,200,000,000 = 4,800,000,000
    const r = calcRelatedCorpGift(mk("small", 80 * BILLION, { preTaxAdjOperatingIncome: 6 * BILLION }));
    expect(r.baseAfterTaxProfit).toBe(4_800_000_000);
    expect(r.deemedGiftValue).toBe(144_000_000);
  });

  it("[C-1] 대조 — 영업손익 ≥ 소득금액이면 전액 차감한다 (비율 1 초과 시 1로 본다)", () => {
    const r = calcRelatedCorpGift(mk("small", 80 * BILLION, { preTaxAdjOperatingIncome: 10 * BILLION }));
    expect(r.baseAfterTaxProfit).toBe(8_000_000_000);
    expect(r.deemedGiftValue).toBe(240_000_000);
  });
});

describe("영업손실 — 증여재산가액은 음수가 될 수 없다", () => {
  const LOSS = mk("small", 80 * BILLION, {
    preTaxAdjOperatingIncome: -10 * BILLION,
    shareholders: [
      { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
      { id: "A", name: "A법인", relation: "other", directRatio: R(50), isCorporate: true },
      { id: "x", name: "기타", relation: "other", directRatio: R(30), isCorporate: false },
    ],
    intermediaryCorps: [
      { corpShareholderId: "A", stakeInBeneficiary: R(50), owners: [{ individualId: "gap", ratio: R(80) }] },
    ],
  } as Partial<RelatedCorpInput>);

  it("[L-0] 직접·간접이 모두 음수여도 소계·합계가 0이다 (W11 회귀 수정)", () => {
    // 🔴 W11에서 바깥 `max(0, …)`을 「죽은 코드」라며 뺐는데, 그 증명은 `directGain ≥ 0`일 때만
    //    성립했다. 영업손실이면 `Math.min(0, 음수)`가 음수를 골라 실측 **−900,000,000원**이 나왔다.
    const r = calcRelatedCorpGift(LOSS);
    const gap = r.recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap?.directGain).toBeLessThan(0); // 원시 곱은 음수다(화면에 그대로 보인다)
    expect(gap?.indirectGain).toBeLessThan(0);
    expect(gap?.subtotal).toBe(0); // 소계는 0으로 잘린다
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });

  it("[L-1] 배당공제가 음수로 기록되지 않는다 — 화면의 §⑮ 열에 −1,500,000,000이 찍혔다", () => {
    const gap = calcRelatedCorpGift(LOSS).recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap?.dividendDeduction).toBe(0);
    expect(gap?.dividendDeduction).toBeGreaterThanOrEqual(0);
  });

  it("[L-3] 영업손실 + 간접출자법인 배당 — 공제가 «음수 차감»이 되어 이익을 만들어내지 않는다", () => {
    // 이 조합이라야 경유별 `pathGain` 클램프에 도달한다(배당이 없으면 그 루프가 돌지 않는다).
    // 클램프가 없으면: pathGain = −720,000,000 → `computeSec15Clause2`는 0을 돌려주는데
    // `Math.min(0, −720,000,000)`이 **음수를 골라** sec15n2가 음수가 되고,
    // `indirectBase(0) − (−720,000,000)` = **+720,000,000** — 영업손실인데 세금이 생긴다.
    const withDividend = calcRelatedCorpGift({
      ...LOSS,
      distributableProfit: 5 * BILLION,
      intermediaryCorps: [
        {
          corpShareholderId: "A",
          stakeInBeneficiary: R(50),
          distributableProfit: 2 * BILLION,
          owners: [{ individualId: "gap", ratio: R(80), dividendIncome: 400_000_000 }],
        },
      ],
    } as RelatedCorpInput);
    const gap = withDividend.recipientBreakdown?.find((b) => b.recipientName === "갑");
    expect(gap?.indirectGain).toBeLessThan(0);
    expect(gap?.dividendDeduction).toBe(0);
    expect(gap?.subtotal).toBe(0);
    expect(withDividend.deemedGiftValue).toBe(0);
  });

  it("[L-2] 사유가 원인을 가리키지 않고 «영업손실»이라고 말한다", () => {
    // 「과세제외매출·차감비율 때문」이라고 적으면 SC-N에서 고친 「1억원 미만」과 같은 실패다.
    const r = calcRelatedCorpGift(LOSS);
    expect(r.exclusionReason).toContain("영업손실");
    expect(r.exclusionReason).toContain("§45의3①2호");
  });
});
