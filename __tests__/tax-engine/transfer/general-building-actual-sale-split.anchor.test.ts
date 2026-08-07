/**
 * P-1 anchor — 일반건물 **실가 경로**의 구분양도·감정평가·§166⑧ (Phase 3)
 *
 * 계획서: `docs/02-design/features/gb-actual-path-sale-split-noop.plan.md` §4 · §6.3
 *
 * ## 무엇을 잡는가
 *
 * 종전 실가 경로는 양도가액을 `floor(총액 × 양도시기준시가비율)`로 **자체 계산**했다. 그래서
 * 계약서상 구분 기재(§100②③)·감정평가가액 basis(부가령 §64①1호 단서)·§166⑧ 예외가 **통째로
 * 빠져 있었다** — 세 값 모두 payload에는 실려 오는데 **구조분해를 하지 않아** 버려졌다.
 *
 * **실측(수정 전)**: 구분 기재 3,500,000,000 → 적용 3,816,625,253(안분값) · 판정 흔적 `null`.
 * §100③이 되돌린 것이 아니라 **판정 자체가 실행되지 않았다**.
 *
 * ⇒ 이제 환산 경로와 **같은 함수**(`allocateBundledTransferPrice`)를 쓴다.
 *
 * ## fixture
 *
 * 총액 1,000,000,000 · 양도시 기준시가 토지 600,000,000 / 건물 200,000,000
 * ⇒ 안분값 **토지 750,000,000 / 건물 250,000,000**
 * ⇒ 적정범위(안분값 × 0.7~1.3 개구간): 토지 525,000,000~975,000,000 · 건물 175,000,000~325,000,000
 *
 * **건물이 실질 제약이다** — 분모가 작아 같은 차이 금액이 큰 비율이 된다.
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

const BASE = {
  totalTransferPrice: 1_000_000_000,
  transferDate: new Date("2026-03-01"),
  acquisitionDate: new Date("2015-03-01"),
  landArea: 200,
  buildingFootprintArea: 100,
  transferLandPricePerSqm: 3_000_000, // × 200 = 600,000,000
  transferBuildingStdPrice: 200_000_000,
  acquisitionLandPricePerSqm: 1_000_000,
  acquisitionBuildingStdPrice: 100_000_000,
  zoneType: "commercial",
  isMetropolitan: false,
  isUnregistered: false,
  actualAcquisitionPrice: 500_000_000,
  actualExpenses: 0,
};

function run(over: Record<string, unknown> = {}) {
  return calculateGeneralBuildingActualTransfer(
    { ...BASE, ...over } as never, 2026, undefined, [], rates,
  );
}

function detail(r: ReturnType<typeof run>) {
  return r.aggregated.generalBuildingValuationDetail as unknown as {
    assetCards: Array<{ propertyId: string; transferPrice: number }>;
    saleSplitJudgment?: {
      deemedUnclear: boolean;
      basisKind: string;
      applied: { land: number; building: number };
      apportioned: { land: number; building: number };
      exemptionApplied?: string;
    };
  };
}
const landSale = (r: ReturnType<typeof run>) =>
  detail(r).assetCards.find((c) => c.propertyId.includes("land"))!.transferPrice;
const buildingSale = (r: ReturnType<typeof run>) =>
  detail(r).assetCards.find((c) => c.propertyId.includes("building"))!.transferPrice;

describe("A-5 — 구분 기재가 없으면 종전과 같다 (회귀 0)", () => {
  it("양도시 기준시가 비율 안분 — 750,000,000 / 250,000,000", () => {
    expect(landSale(run())).toBe(750_000_000);
    expect(buildingSale(run())).toBe(250_000_000);
  });

  it("판정하지 않는다 — 비교 대상이 없으므로 `saleSplitJudgment`는 없다", () => {
    // 🔑 `{deemedUnclear:false}`로 메우면 「판정했고 통과했다」로 침묵 오표시된다.
    expect(detail(run()).saleSplitJudgment).toBeUndefined();
  });
});

describe("A-1 — 적정범위 구분 기재는 그대로 적용된다 (§100②)", () => {
  const SPLIT = { landTransferPrice: 800_000_000, buildingTransferPrice: 200_000_000 };

  it("🔴 구분값이 적용된다 — 안분값 750,000,000이 아니다", () => {
    expect(landSale(run(SPLIT))).toBe(800_000_000);
    expect(buildingSale(run(SPLIT))).toBe(200_000_000);
  });

  it("판정 명세가 남는다 — deemedUnclear=false · basisKind='std_price'", () => {
    const j = detail(run(SPLIT)).saleSplitJudgment!;
    expect(j.deemedUnclear).toBe(false);
    expect(j.basisKind).toBe("std_price");
    expect(j.applied).toEqual({ land: 800_000_000, building: 200_000_000 });
    expect(j.apportioned).toEqual({ land: 750_000_000, building: 250_000_000 });
  });
});

describe("A-2 — 30% 이상 차이나면 안분값으로 되돌린다 (§100③)", () => {
  // 건물 100,000,000 → 안분값 250,000,000 대비 편차 60% (토지는 20%로 적정범위 안)
  const OVER = { landTransferPrice: 900_000_000, buildingTransferPrice: 100_000_000 };

  it("🔴 안분값이 적용된다", () => {
    expect(landSale(run(OVER))).toBe(750_000_000);
    expect(buildingSale(run(OVER))).toBe(250_000_000);
  });

  it("의제 사실이 판정 명세에 남는다", () => {
    const j = detail(run(OVER)).saleSplitJudgment!;
    expect(j.deemedUnclear).toBe(true);
    expect(j.applied).toEqual(j.apportioned);
  });

  it("한쪽만 입력해도 도출된 파트가 판정 대상이다 (S-8 · Q-3)", () => {
    // 토지만 900,000,000 → 건물은 100,000,000으로 도출 → 건물 편차 60% → 발동
    const j = detail(run({ landTransferPrice: 900_000_000 })).saleSplitJudgment!;
    expect(j.deemedUnclear).toBe(true);
  });
});

describe("A-3 — 감정평가가액이 기준시가를 이긴다 (부가령 §64①1호 단서)", () => {
  const APPRAISAL = {
    landAppraisalAtTransfer: 400_000_000,
    buildingAppraisalAtTransfer: 400_000_000, // 비율 0.5 — 기준시가 비율 0.75와 다르다
  };

  it("🔴 감정 비율(0.5)로 안분한다 — 기준시가 비율(0.75)이 아니다", () => {
    expect(landSale(run(APPRAISAL))).toBe(500_000_000);
    expect(buildingSale(run(APPRAISAL))).toBe(500_000_000);
  });

  it("구분 기재와 함께 쓰면 **감정 비율이 30% 판정의 기준선**이 된다", () => {
    const j = detail(run({ ...APPRAISAL, landTransferPrice: 800_000_000, buildingTransferPrice: 200_000_000 }))
      .saleSplitJudgment!;
    expect(j.basisKind).toBe("appraisal");
    expect(j.apportioned).toEqual({ land: 500_000_000, building: 500_000_000 });
    // 800,000,000은 감정 안분값 500,000,000 대비 60% 초과 ⇒ 의제 발동
    expect(j.deemedUnclear).toBe(true);
  });
});

describe("A-4 — §166⑧ 예외를 선택하면 의제가 발동하지 않는다", () => {
  it("30% 초과인데도 구분값이 적용된다", () => {
    const r = run({
      landTransferPrice: 900_000_000,
      buildingTransferPrice: 100_000_000,
      saleSplitExemption: "other_law",
    });
    expect(landSale(r)).toBe(900_000_000);
    expect(detail(r).saleSplitJudgment!.deemedUnclear).toBe(false);
    expect(detail(r).saleSplitJudgment!.exemptionApplied).toBe("other_law");
  });
});

describe("A-6 — 부담부증여는 §159가 우선한다 (구분값 무시)", () => {
  const burdenedGiftInfo: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 400_000_000,
    mortgageDebtAmount: 0,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 600_000_000,
    buildingStdPriceAtTransfer: 200_000_000,
    landStdPriceAtAcquisition: 200_000_000,
    buildingStdPriceAtAcquisition: 100_000_000,
    donorRelation: "lineal_descendant",
  };

  it("구분 기재를 넣어도 §159 채무비율 산정이 그대로다 (Phase A 델타 0 고정)", () => {
    const without = run({ burdenedGiftInfo });
    const withSplit = run({
      burdenedGiftInfo,
      landTransferPrice: 800_000_000,
      buildingTransferPrice: 200_000_000,
    });
    expect(landSale(withSplit)).toBe(landSale(without));
    expect(withSplit.aggregated.calculatedTax).toBe(without.aggregated.calculatedTax);
  });

  it("판정 명세도 만들지 않는다 — 비교 대상 자체가 없다", () => {
    expect(detail(run({ burdenedGiftInfo, landTransferPrice: 800_000_000 })).saleSplitJudgment)
      .toBeUndefined();
  });
});
