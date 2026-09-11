/**
 * 상속·증여 UI 리뷰 G3 — 「0을 삼키는 fallback」 축 anchor (순수).
 *
 * `|| undefined`는 0을 falsy로 보고 삼킨다. 그 값이
 *   · 엔진의 `?? 기본값`을 되살리는 열쇠일 때(IG-014) → 기본값이 영영 발동하지 않고
 *   · 사용자가 넣어야 하는 정당한 0일 때(IG-051·IG-120) → 저장 자체가 안 된다.
 * 방향이 항목마다 **반대**이므로 각각 쌍둥이로 고정한다.
 */
import { describe, it, expect } from "vitest";

import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { validateUnlistedStockV2 } from "@/lib/calc/inheritance-validate-unlisted";
import { estateItemSchema } from "@/lib/validators/estate-item-schema";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const D = (patch: Partial<DeemedFormState>): DeemedFormState =>
  ({ ...INITIAL_DEEMED, giftDate: "2026-01-01", ...patch }) as DeemedFormState;

// ════════════════════════════════════════════════════
// IG-014 — 합병대가 미입력이 엔진의 `?? face`를 죽였다
// ════════════════════════════════════════════════════

describe("[G3-H] IG-014 — 합병대가는 «미입력»과 «0»이 달라야 한다", () => {
  const base = {
    type: "merger" as const,
    mrgCaseType: "non_stock" as const,
    mrgFaceValue: "5000",
    mrgOvervaluedPrice: "3000",
    mrgMajorShares: "1000",
  };

  it("H-1: 🔴 미입력이면 undefined로 보낸다 (엔진의 `?? face`가 살아난다)", () => {
    const input = buildDeemedGiftInput(D({ ...base, mrgConsideration: "" }));
    expect((input as { mergeConsideration?: number }).mergeConsideration).toBeUndefined();
  });

  it("H-2: 양성 쌍둥이 — 입력하면 그 값이 그대로 간다", () => {
    const input = buildDeemedGiftInput(D({ ...base, mrgConsideration: "4000" }));
    expect((input as { mergeConsideration?: number }).mergeConsideration).toBe(4000);
  });

  it("H-3: 🔴 0을 「미입력」으로 보내면 `base = min(face, 0) = 0`이 되어 이익이 항상 0원이었다", () => {
    // 회귀 방향 고정 — 종전 구현은 여기서 0을 냈다.
    const input = buildDeemedGiftInput(D({ ...base, mrgConsideration: "" }));
    expect((input as { mergeConsideration?: number }).mergeConsideration).not.toBe(0);
  });
});

// ════════════════════════════════════════════════════
// IG-028 · IG-029 — 5년 현금 배열은 «자리 고정 + null»
// ════════════════════════════════════════════════════

describe("[G3-I] IG-028·IG-029 — 미입력 칸은 0도 구멍도 아닌 null이다", () => {
  const item = (cash: (number | null)[]): unknown => ({
    id: "i1",
    category: "unlisted_stock",
    name: "법인",
    marketValue: 1_000_000_000,
    // 비상장주식은 legacy·V2 중 하나가 필수 — 이 anchor의 축이 아니므로 최소 legacy를 붙인다.
    unlistedStockData: {
      totalShares: 10_000,
      ownedShares: 5_000,
      netAssetValue: 1_000_000_000,
      weightedNetIncome: 0,
      capitalizationRate: 0.1,
    },
    corporateNonBusinessAssets: { currentCash: 10_000_000_000, cashByYearEnd: cash },
  });

  it("I-1: 🔴 null이 섞인 배열을 Zod가 받아들인다 (종전엔 400)", () => {
    const r = estateItemSchema.safeParse(item([null, null, 500_000_000]));
    expect(r.success).toBe(true);
  });

  it("I-2: 양성 쌍둥이 — 전부 숫자인 배열도 그대로 통과한다 (회귀 0)", () => {
    const r = estateItemSchema.safeParse(item([1, 2, 3, 4, 5]));
    expect(r.success).toBe(true);
  });

  it("I-3: 양성 대조군 — 음수는 여전히 거절한다 (넓히기가 과하지 않았다)", () => {
    const r = estateItemSchema.safeParse(item([-1]));
    expect(r.success).toBe(false);
  });

  it("I-4: 🔴 희소 배열(구멍)은 JSON에서 null이 된다 — 이것이 400의 원인이었다", () => {
    const sparse: number[] = [];
    sparse[2] = 500_000_000;
    expect(JSON.parse(JSON.stringify(sparse))).toEqual([null, null, 500_000_000]);
  });
});

// ════════════════════════════════════════════════════
// IG-057 — 평가심의위 신청 평가액은 ⑧에서 막는다
// ════════════════════════════════════════════════════

describe("[G3-J] IG-057 — ⑫ Zod positive()와 ⑧이 같은 것을 요구한다", () => {
  // 이 anchor의 축은 evaluationCommittee뿐이다 — 앞선 핵심 검증(사업연도 3개 등)은
  // 통과시켜야 그 «다음»에 놓인 축에 도달한다(기존 v2 테스트의 최소 팩토리와 동형).
  const fy = (offset: number) => ({
    fiscalYearLabel: String(2026 - offset),
    fiscalYearEndDate: new Date(2026 - offset, 11, 31),
    taxableIncome: 0,
  });
  const v2Base = {
    corpName: "테스트법인",
    businessStartDate: new Date(2010, 0, 1),
    evaluationDate: new Date(2026, 0, 1),
    faceValuePerShare: 5000,
    totalShares: 1000,
    ownedShares: 100,
    isRealEstateHeavy: false,
    fiscalYears: [fy(1), fy(2), fy(3)],
    capitalChanges: [],
    netAssetValueRaw: {
      bsTotalAssets: 0, assetValuationDelta: 0, corpTaxReservedAmount: 0,
      paidInCapitalIncrease: 0, otherEarnedRights: 0, prepaidExpenses: 0,
      preGiftRetainedEarnings: 0, bsTotalLiabilities: 0, corporateTaxPayable: 0,
      farmingSurtax: 0, localIncomeTax: 0, dividendPayable: 0, retirementProvision: 0,
      otherProvision: 0, reserveExcluded: 0, allowanceExcluded: 0, deferredTaxAdjustment: 0,
    },
    isContinuousLossLastThreeYears: false,
    capitalizationRate: 0.1,
    isMaxShareholder: false,
    companySize: "large",
  };
  const make = (ec: unknown): EstateItem =>
    ({
      id: "s1",
      category: "unlisted_stock",
      name: "비상장",
      unlistedStockValuationV2: { ...v2Base, evaluationCommittee: ec },
    }) as unknown as EstateItem;

  it("J-1: 🔴 신청 평가액 0(토글 ON 기본값)이면 ⑧이 막는다", () => {
    const err = validateUnlistedStockV2(
      make({ method: "dcf", taxpayerPerShareValuation: 0 }),
      { evaluationDateFallback: "2026-01-01" },
    );
    expect(err).toContain("평가심의위 신청 평가액");
  });

  it("J-2: 🔴 기타 평가법인데 사유가 비면 막는다 (Zod superRefine의 짝)", () => {
    const err = validateUnlistedStockV2(
      make({ method: "other", taxpayerPerShareValuation: 12_000, methodNotes: "  " }),
      { evaluationDateFallback: "2026-01-01" },
    );
    expect(err).toContain("평가법 사유");
  });

  it("J-3: 양성 쌍둥이 — 값이 있으면 이 축으로는 막지 않는다", () => {
    const err = validateUnlistedStockV2(
      make({ method: "dcf", taxpayerPerShareValuation: 12_000 }),
      { evaluationDateFallback: "2026-01-01" },
    );
    expect(err ?? "").not.toContain("평가심의위 신청 평가액");
  });

  it("J-4: 양성 대조군 — 신청 자체가 없으면 막지 않는다", () => {
    const err = validateUnlistedStockV2(make(undefined), {
      evaluationDateFallback: "2026-01-01",
    });
    expect(err ?? "").not.toContain("평가심의위 신청 평가액");
  });
});
