/**
 * §34의3⑮ 배당소득 공제 (W11 · RC-D).
 *
 * 종전에는 `const dividendDeduction = 0;`으로 **상수 고정**이었고, 배당소득·배당가능이익을
 * 담을 필드가 엔진 타입·⑫Zod·폼 어디에도 없었다 — 「좁은 입력 경로」가 아니라 **경로 0**이다.
 * §⑮는 「공제한다」는 강행 규정이자 납세자에게 **유리한** 공제이므로, 미반영은
 * 「법 근거 없이 불리하게 적용」하는 방향이다.
 *
 * ⚠️ 1호와 2호는 **분모가 완전히 다르다**. 1호는 (수혜법인 배당가능이익 × 직접보유비율),
 *    2호는 ([간접출자법인 배당가능이익 + 수혜법인 배당가능이익 × 그 법인의 수혜법인 지분율]
 *    × 지배주주등의 그 법인에 대한 직접보유비율)이다. 한쪽 헬퍼를 돌려쓰면 조용히 틀린다([S15-5]).
 */
import { describe, it, expect } from "vitest";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import {
  splitIndirectOverByPath,
  sumIndirectPaths,
  fracMaxZeroSub,
  reduceFracBig,
} from "@/lib/tax-engine/gift-deemed/related-corp-helpers";
import type { RelatedCorpInput } from "@/lib/tax-engine/gift-deemed/types";

const R = (pct: number) => ({ numer: Math.round(pct * 100), denom: 10_000 });

/** 직접 60% 단독 — directGain 1,200,000,000 (간접 없음) */
const DIRECT_ONLY: RelatedCorpInput = {
  enterpriseSize: "small",
  totalSales: 100_000_000_000,
  preTaxAdjOperatingIncome: 10_000_000_000,
  taxableIncome: 10_000_000_000,
  corporateTaxNet: 2_000_000_000,
  shareholders: [
    { id: "gap", name: "갑", relation: "self", directRatio: R(60), isCorporate: false },
    { id: "x", name: "기타", relation: "other", directRatio: R(40), isCorporate: false },
  ],
  intermediaryCorps: [],
  salesPartners: [
    { id: "D", name: "D", salesAmount: 80_000_000_000, isRelated: true },
    { id: "E", name: "기타", salesAmount: 20_000_000_000, isRelated: false },
  ],
};

/** 직접 20% + A법인(수혜법인 50%) 경유 간접 40% — directGain 480,000,000 / indirectGain 720,000,000 */
const WITH_INDIRECT: RelatedCorpInput = {
  enterpriseSize: "small",
  totalSales: 100_000_000_000,
  preTaxAdjOperatingIncome: 10_000_000_000,
  taxableIncome: 10_000_000_000,
  corporateTaxNet: 2_000_000_000,
  shareholders: [
    { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
    { id: "A", name: "A법인", relation: "other", directRatio: R(50), isCorporate: true },
    { id: "x", name: "기타", relation: "other", directRatio: R(30), isCorporate: false },
  ],
  intermediaryCorps: [
    { corpShareholderId: "A", stakeInBeneficiary: R(50), owners: [{ individualId: "gap", ratio: R(80) }] },
  ],
  salesPartners: [
    { id: "D", name: "D", salesAmount: 80_000_000_000, isRelated: true },
    { id: "E", name: "기타", salesAmount: 20_000_000_000, isRelated: false },
  ],
};

const gapOf = (inp: RelatedCorpInput) =>
  calcRelatedCorpGift(inp).recipientBreakdown?.find((b) => b.recipientName === "갑");

describe("§⑮1호 — 수혜법인으로부터 받은 배당", () => {
  it("[S15-0] 배당 입력이 없으면 종전 결과 그대로다 (공제 도입이 기존 사안을 건드리지 않는다)", () => {
    const g = gapOf(DIRECT_ONLY);
    expect(g?.directGain).toBe(1_200_000_000);
    expect(g?.subtotal).toBe(1_200_000_000);
    expect(g?.dividendDeduction).toBe(0);
  });

  it("[S15-1] 배당 300,000,000 · 배당가능이익 5,000,000,000 · 직접 60% → 120,000,000 공제", () => {
    // 조문 계산식: 300,000,000 × 1,200,000,000 ÷ (5,000,000,000 × 0.6) = 120,000,000
    const g = gapOf({
      ...DIRECT_ONLY,
      distributableProfit: 5_000_000_000,
      shareholders: DIRECT_ONLY.shareholders.map((s) =>
        s.id === "gap" ? { ...s, dividendFromBeneficiary: 300_000_000 } : s,
      ),
    });
    expect(g?.dividendDeduction).toBe(120_000_000);
    expect(g?.subtotal).toBe(1_080_000_000); // 종전 1,200,000,000 — 120,000,000원 과다였다
  });

  it("[S15-2] 배당가능이익(분모)이 없으면 엔진은 공제하지 않는다 — 실제 관문은 ⑧validate다", () => {
    // 「자동 안분 fallback 금지」. 분모를 임의로 채우면 공제가 근거 없이 커진다.
    const g = gapOf({
      ...DIRECT_ONLY,
      shareholders: DIRECT_ONLY.shareholders.map((s) =>
        s.id === "gap" ? { ...s, dividendFromBeneficiary: 300_000_000 } : s,
      ),
    });
    expect(g?.dividendDeduction).toBe(0);
    expect(g?.subtotal).toBe(1_200_000_000);
  });

  it("[S15-3] 단서 「공제 후 음수는 0」 — 초과분은 버려지고 기록값도 실제 차감액이다", () => {
    const g = gapOf({
      ...DIRECT_ONLY,
      distributableProfit: 5_000_000_000,
      shareholders: DIRECT_ONLY.shareholders.map((s) =>
        s.id === "gap" ? { ...s, dividendFromBeneficiary: 50_000_000_000 } : s,
      ),
    });
    expect(g?.subtotal).toBe(0);
    // 산식값은 20,000,000,000이지만 실제 차감은 1,200,000,000이다 — 표시↔차감 일관성.
    expect(g?.dividendDeduction).toBe(1_200_000_000);
  });

  it("[S15-4] 공제는 「해당 출자관계」에만 걸린다 — 직접 초과분이 간접이익을 먹지 않는다", () => {
    const g = gapOf({
      ...WITH_INDIRECT,
      distributableProfit: 5_000_000_000,
      shareholders: WITH_INDIRECT.shareholders.map((s) =>
        s.id === "gap" ? { ...s, dividendFromBeneficiary: 50_000_000_000 } : s,
      ),
    });
    expect(g?.directGain).toBe(480_000_000);
    expect(g?.indirectGain).toBe(720_000_000);
    // 직접분은 0으로 클램프되지만 간접 720,000,000은 온전히 남는다.
    expect(g?.subtotal).toBe(720_000_000);
  });
});

describe("§⑮2호 — 간접출자법인으로부터 받은 배당", () => {
  const WITH_DIV_N2: RelatedCorpInput = {
    ...WITH_INDIRECT,
    distributableProfit: 5_000_000_000,
    intermediaryCorps: [
      {
        corpShareholderId: "A",
        stakeInBeneficiary: R(50),
        distributableProfit: 2_000_000_000,
        owners: [{ individualId: "gap", ratio: R(80), dividendIncome: 400_000_000 }],
      },
    ],
  };

  it("[S15-5] 분모 = [2,000,000,000 + 5,000,000,000×50%] × 80% = 3,600,000,000 → 80,000,000 공제", () => {
    // 400,000,000 × 720,000,000 ÷ 3,600,000,000 = 80,000,000
    const g = gapOf(WITH_DIV_N2);
    expect(g?.dividendDeduction).toBe(80_000_000);
    expect(g?.subtotal).toBe(1_120_000_000); // 1,200,000,000 − 80,000,000
  });

  it("[S15-6] 1호와 2호는 다른 축이다 — 같은 배당액을 1호 자리에 넣으면 값이 달라진다", () => {
    // 종전 코드에는 공제 슬롯이 **직접 쪽 하나뿐**이었다. 두 호를 한 자리에 모으면
    // 분모가 뒤바뀌어 조용히 틀린다. 같은 400,000,000이 호에 따라 80,000,000 vs 192,000,000이다.
    const asClause1 = gapOf({
      ...WITH_INDIRECT,
      distributableProfit: 5_000_000_000,
      shareholders: WITH_INDIRECT.shareholders.map((s) =>
        s.id === "gap" ? { ...s, dividendFromBeneficiary: 400_000_000 } : s,
      ),
    });
    // 400,000,000 × 480,000,000 ÷ (5,000,000,000 × 20%) = 192,000,000
    expect(asClause1?.dividendDeduction).toBe(192_000_000);
    expect(asClause1?.dividendDeduction).not.toBe(gapOf(WITH_DIV_N2)?.dividendDeduction);
  });

  it("[S15-9] 단서는 「해당 출자관계」별로 건다 — 간접 공제가 간접이익을 넘어도 직접이익을 먹지 않는다", () => {
    // 배당 100억 → 산식값이 indirectGain 720,000,000을 훌쩍 넘는다.
    const g = gapOf({
      ...WITH_DIV_N2,
      intermediaryCorps: [
        {
          corpShareholderId: "A",
          stakeInBeneficiary: R(50),
          distributableProfit: 2_000_000_000,
          owners: [{ individualId: "gap", ratio: R(80), dividendIncome: 10_000_000_000 }],
        },
      ],
    });
    expect(g?.dividendDeduction).toBe(720_000_000); // 간접이익까지만
    expect(g?.subtotal).toBe(480_000_000); // 직접 480,000,000은 온전히 남는다
  });

  it("[S15-7] 간접출자법인 배당가능이익이 없어도 수혜법인 몫이 있으면 분모가 성립한다", () => {
    // 분모 = [0 + 5,000,000,000×50%] × 80% = 2,000,000,000
    // 400,000,000 × 720,000,000 ÷ 2,000,000,000 = 144,000,000
    const g = gapOf({
      ...WITH_DIV_N2,
      intermediaryCorps: [
        {
          corpShareholderId: "A",
          stakeInBeneficiary: R(50),
          owners: [{ individualId: "gap", ratio: R(80), dividendIncome: 400_000_000 }],
        },
      ],
    });
    expect(g?.dividendDeduction).toBe(144_000_000);
  });
});

describe("출자관계별 공제의 합이 간접이익을 넘지 않는다", () => {
  it("[S15-10] 2경유 전액 과다공제 — 간접분이 정확히 0이 되고 음수로 새지 않는다", () => {
    // `sec15n2`는 관계별 floor의 **합**, `indirectGain`은 합산 후 **1회** floor다.
    // `floor(a) + floor(b) ≤ floor(a + b)` 이므로 합이 총액을 넘을 수 없다 — 이 부등호가
    // 뒤집힌다고 적었다가 뮤테이션에서 잡혔다. 방향을 여기서 고정한다.
    const TWO_PATHS: RelatedCorpInput = {
      enterpriseSize: "small",
      totalSales: 100_000_000_000,
      preTaxAdjOperatingIncome: 10_000_000_007, // 나누어떨어지지 않게 — floor가 실제로 일한다
      taxableIncome: 10_000_000_007,
      corporateTaxNet: 3,
      shareholders: [
        { id: "gap", name: "갑", relation: "self", directRatio: R(20), isCorporate: false },
        { id: "A", name: "A법인", relation: "other", directRatio: R(30), isCorporate: true },
        { id: "B", name: "B법인", relation: "other", directRatio: R(20), isCorporate: true },
        { id: "x", name: "기타", relation: "other", directRatio: R(30), isCorporate: false },
      ],
      intermediaryCorps: [
        { corpShareholderId: "A", stakeInBeneficiary: R(30), distributableProfit: 1_000_000_000,
          owners: [{ individualId: "gap", ratio: R(70), dividendIncome: 99_000_000_000 }] },
        { corpShareholderId: "B", stakeInBeneficiary: R(20), distributableProfit: 1_000_000_000,
          owners: [{ individualId: "gap", ratio: R(90), dividendIncome: 99_000_000_000 }] },
      ],
      distributableProfit: 5_000_000_000,
      salesPartners: [
        { id: "D", name: "D", salesAmount: 80_000_000_000, isRelated: true },
        { id: "E", name: "기타", salesAmount: 20_000_000_000, isRelated: false },
      ],
    };
    const g = gapOf(TWO_PATHS);
    expect(g?.indirectGain).toBeGreaterThan(0); // 두 경유 모두 살아 있다(구별력 확보)
    // 배당이 각 관계의 이익을 통째로 넘어서므로 간접분은 정확히 0으로 소진된다.
    expect(g?.subtotal).toBe(g?.directGain);
    expect(g?.subtotal).toBeGreaterThanOrEqual(0);
  });
});

describe("§⑬ 후단 — 한계보유비율의 출자관계별 배분", () => {
  const path = (id: string, numer: bigint, denom: bigint) => ({ corpShareholderId: id, numer, denom });

  it("[S15-SPLIT] 관계별 초과분의 합 = 합산 후 차감분 (단계7 합산 경로와의 드리프트 가드)", () => {
    // `splitIndirectOverByPath`는 §⑮2호 전용이고 단계7은 종전 합산 경로를 쓴다.
    // 두 경로가 **같은 분수**임을 여기서 고정한다 — 어긋나면 화면의 간접초과와
    // 배당공제의 base가 서로 다른 값을 가리키게 된다.
    const cases: { paths: ReturnType<typeof path>[]; ded: { numer: number; denom: number } }[] = [
      { paths: [path("A", 40n, 100n), path("B", 5n, 100n)], ded: { numer: 10, denom: 100 } },
      { paths: [path("A", 3n, 100n), path("B", 4n, 100n)], ded: { numer: 10, denom: 100 } },
      { paths: [path("A", 2n, 100n)], ded: { numer: 10, denom: 100 } },
      { paths: [path("A", 25n, 100n), path("B", 25n, 100n), path("C", 1n, 100n)], ded: { numer: 3, denom: 100 } },
    ];
    for (const { paths, ded } of cases) {
      const { overs, remaining } = splitIndirectOverByPath(paths, ded);
      // 관계별 초과분의 분수 합
      let n = 0n;
      let d = 1n;
      for (const { over } of overs) {
        n = n * BigInt(over.denom) + BigInt(over.numer) * d;
        d = d * BigInt(over.denom);
      }
      const summed = reduceFracBig(n, d);
      const total = sumIndirectPaths(paths);
      const aggregate = fracMaxZeroSub(reduceFracBig(total.numer, total.denom), ded);
      expect(summed).toEqual(aggregate);
      // 잔여 차감분도 합산 경로와 같아야 한다 (직접초과 계산의 입력이다)
      expect(remaining).toEqual(fracMaxZeroSub(ded, reduceFracBig(total.numer, total.denom)));
    }
  });

  it("[S15-8] 「작은 것부터 뺀다」 — 작은 관계가 먼저 소진된다", () => {
    const { overs } = splitIndirectOverByPath(
      [path("big", 40n, 100n), path("small", 5n, 100n)],
      { numer: 10, denom: 100 },
    );
    const small = overs.find((o) => o.corpShareholderId === "small");
    const big = overs.find((o) => o.corpShareholderId === "big");
    expect(small?.over).toEqual({ numer: 0, denom: 1 }); // 5%가 통째로 차감에 쓰인다
    expect(big?.over).toEqual({ numer: 7, denom: 20 }); // 40% − 잔여 5% = 35%
  });
});
