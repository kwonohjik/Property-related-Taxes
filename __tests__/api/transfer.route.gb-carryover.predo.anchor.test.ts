/**
 * anchor — 일반건물 × 배우자등 이월과세(§97의2) **route 계층**.
 *
 * ## ✅ 구현 착지 (2026-08-10)
 *
 * 작성 시점에는 12건이 `it.fails`였다(건물 파트·증여세 안분·한도·환산 모드).
 * route 조립(`composeGbCarryover`) + 엔진 건물 카드 배선 + 환산 기준시가 주입으로
 * **전건 `it` 전환**했다. 이제 이 파일은 **회귀 방어선**이다.
 *
 * ⚠️ 여기서 `it.fails`가 다시 필요해지면 **결함이 재발했다는 신호**다 — 표기를 바꾸지 말고
 *    원인을 고칠 것.
 *
 * 계획: `docs/00-pm/transfer-gb-carryover-wiring.plan.md` (착수 조건 Q1~Q4 전건 확정)
 * 설계: `docs/02-design/features/transfer-gb-carryover-wiring.engine.design.md` D9
 * 정책: `feedback_pre_anchor_verification` — Do 진입 전 **실패하는** anchor로 설계를 환류한다.
 *
 * ## 착지 전에 무엇이 깨져 있었나 (2026-08-10 실측 — 회귀 판별용으로 남긴다)
 *
 * | | 착지 전 |
 * |---|---|
 * | 토지 파트 `landCarryoverTaxation`(엔진 모양 직접 전달) | ✅ 이미 동작 |
 * | 건물 파트 | 🔴 배선 없음 — `buildingCarryoverTaxation` 미존재 |
 * | 증여세 파트별 안분(영 §163의2②) | 🔴 미구현 — 사용자가 안분한 값을 받았다 |
 * | 환산 모드 | 🔴 **취득가액 0** — 43,470,000원 과대과세(계획 §6 Q2) |
 *
 * ## 픽스처
 *
 *   토지 100㎡ · 양도시 2,000,000/㎡ ⇒ 200,000,000  ·  건물 양도시 기준시가 200,000,000
 *   ⇒ §166⑥ 안분 50:50 · 총양도가 10억 ⇒ 토지 500,000,000 / 건물 500,000,000
 *   취득시(수증자) 토지 100,000,000 · 건물 100,000,000
 *   증여 2021-03-01 (10년 이내) · 증여자 취득 2005-06-15
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

// ── 픽스처 ────────────────────────────────────────────────────────────
const GIFT_DATE = "2021-03-01";
const DONOR_ACQ = "2005-06-15";

const GB = {
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential" as const,
  acquisitionLandPricePerSqm: 1_000_000,
  acquisitionBuildingStdPrice: 100_000_000,
  buildingAcquisitionCause: "purchase" as const,
};

const COMMON = {
  propertyType: "general_building" as const,
  transferDate: "2024-03-01",
  transferPrice: 1_000_000_000,
  acquisitionDate: GIFT_DATE,
  acquisitionPrice: 0,
  expenses: 0,
  useEstimatedAcquisition: true,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

/** 엔진 모양 그대로의 서브객체 (기존 경로 · 하위 호환 — 설계 D9-10). */
const engineShaped = (over: object = {}) => ({
  giftRegistryDate: GIFT_DATE,
  donorAcquisitionDate: DONOR_ACQ,
  donorAcquisitionPrice: 150_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 400_000_000,
  ...over,
});

/** 신규 사건 객체 (설계 D9-10). */
const GIFT_EVENT = {
  giftRegistryDate: GIFT_DATE,
  giftTaxCalculated: 100_000_000, // 영 §163의2②1호
  giftTaxBase: 500_000_000, // 영 §163의2②3호 — 안분 분모
};

/** 신규 파트 객체 (설계 D9-10). */
const part = (giftDateAssetValue: number, over: object = {}) => ({
  donorAcquisitionDate: DONOR_ACQ,
  donorAcquisitionPrice: 150_000_000,
  useEstimatedAcquisition: false,
  giftDateAssetValue,
  ...over,
});

const body = (gbOver: object = {}, topOver: object = {}) => ({
  ...COMMON,
  generalBuildingValuation: { ...GB, ...gbOver },
  ...topOver,
});

type Prop = {
  propertyId: string;
  transferGain: number;
  longTermHoldingDeduction: number;
  necessaryExpense: number;
  carryoverTaxationDetail?: {
    isEligible: boolean;
    adoptedScenario: string;
    exclusionReason?: string;
    scenarioA: {
      acquisitionPrice: number;
      giftTaxAddedToExpense: number;
      giftTaxLimitApplied: boolean;
      giftTaxLimitCap: number;
      transferGain: number;
    };
    scenarioB: { acquisitionPrice: number; transferGain: number };
  };
};

async function call(b: object) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );
  const json = await res.json();
  return {
    status: res.status,
    properties: (json.data?.aggregated?.properties ?? []) as Prop[],
    determinedTax: json.data?.aggregated?.determinedTax as number | undefined,
    error: json.error,
  };
}
type Result = Awaited<ReturnType<typeof call>>;
const prop = (r: Result, id: string) => r.properties.find((p) => p.propertyId === id);

describe("GB × 이월과세 — anchor (route)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  // ══════════════════════════════════════════════════════════════════
  // K-12 — 회귀 불변식 (양성 대조군의 기준선)
  // ══════════════════════════════════════════════════════════════════
  describe("K-12: 이월과세 미선택 GB는 원 단위 동일", () => {
    /**
     * ⚠️ **회귀 방어용 스냅샷이지 「정본 세액」이 아니다.** mock 세율표 기준 실측값이다.
     * 이월과세 배선이 이 값을 **원 단위로도 바꾸면 안 된다**는 뜻일 뿐이다.
     */
    it("기준선 — 결정세액 170,660,000", async () => {
      const r = await call(body());
      expect(r.status).toBe(200);
      expect(r.determinedTax).toBe(170_660_000);
      expect(prop(r, "land")?.carryoverTaxationDetail).toBeUndefined();
      expect(prop(r, "building")?.carryoverTaxationDetail).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-01~K-06 — 토지 파트 (엔진 모양 직접 전달 · 지금도 동작)
  // ══════════════════════════════════════════════════════════════════
  describe("K-02·K-03: 적용 / 배제 · 비교과세", () => {
    const landCarry = (ct: object) =>
      body({ landAcquisitionCause: "carryover_gift", landCarryoverTaxation: ct });

    it("K-02a 10년 이내 증여 → 적용 · Scenario A 채택", async () => {
      const r = await call(landCarry(engineShaped()));
      const d = prop(r, "land")?.carryoverTaxationDetail;
      expect(d?.isEligible).toBe(true);
      expect(d?.adoptedScenario).toBe("A");
      // 취득가액 = 증여자 취득가액 (법 §97의2①1호)
      expect(d?.scenarioA.acquisitionPrice).toBe(150_000_000);
    });

    it("K-02b 10년 초과(2013 증여) → 배제 · 취득가액 = 증여 당시 평가액", async () => {
      const old = { ...engineShaped(), giftRegistryDate: "2013-03-01" };
      const r = await call({
        ...body({ landAcquisitionCause: "carryover_gift", landCarryoverTaxation: old }),
        acquisitionDate: "2013-03-01",
      });
      const d = prop(r, "land")?.carryoverTaxationDetail;
      expect(d?.isEligible).toBe(false);
      expect(d?.exclusionReason).toBe("period_exceeded");
      // 통상(B) — 증여 당시 평가액 400,000,000
      expect(d?.scenarioB.acquisitionPrice).toBe(400_000_000);
    });

    /**
     * 🔑 §97의2②3호는 **세액이 큰 쪽**을 채택한다. 증여자 취득가액을 아주 높게 잡으면
     * 이월과세 쪽 세액이 작아져 **B가 채택**돼야 한다 — 「항상 A」가 아님을 고정한다.
     */
    it("K-03 이월 세액 < 통상 세액이면 B 채택", async () => {
      const r = await call(
        landCarry(engineShaped({ donorAcquisitionPrice: 490_000_000, giftDateValuation: 100_000_000 })),
      );
      const d = prop(r, "land")?.carryoverTaxationDetail;
      expect(d?.isEligible).toBe(true);
      expect(d?.adoptedScenario).toBe("B");
    });

    it("K-04 적용배제 선언(1세대1주택)이 파트까지 도달한다", async () => {
      const off = await call(landCarry(engineShaped()));
      const on = await call(
        landCarry(engineShaped({ exclusionDeclared: { oneHouseExemptionApplies: true } })),
      );
      expect(prop(off, "land")?.carryoverTaxationDetail?.isEligible).toBe(true);
      expect(prop(on, "land")?.carryoverTaxationDetail?.isEligible).toBe(false);
    });

    it("K-05 보유기간 기산이 증여자 취득일로 당겨진다 (법 §95④)", async () => {
      const base = await call(body());
      const on = await call(landCarry(engineShaped()));
      // 수증자 기준 2021→2024(3년)보다 증여자 기준 2005→2024가 훨씬 길다
      expect(prop(on, "land")!.longTermHoldingDeduction).toBeGreaterThan(
        prop(base, "land")!.longTermHoldingDeduction,
      );
    });

    it("K-06 증여세 상당액이 필요경비에 산입된다", async () => {
      const zero = await call(landCarry(engineShaped({ giftTaxAmount: 0 })));
      const paid = await call(landCarry(engineShaped({ giftTaxAmount: 30_000_000 })));
      const a = (r: Result) => prop(r, "land")!.carryoverTaxationDetail!.scenarioA;
      expect(a(zero).giftTaxAddedToExpense).toBe(0);
      expect(a(paid).giftTaxAddedToExpense).toBe(30_000_000);
      // 필요경비가 늘면 양도차익이 그만큼 준다
      expect(a(zero).transferGain - a(paid).transferGain).toBe(30_000_000);
    });

    it("K-11 건물 파트는 토지 이월과세에 영향받지 않는다 (음성 + 양성 대조군)", async () => {
      const base = await call(body());
      const on = await call(landCarry(engineShaped()));
      // 양성: 토지는 움직인다
      expect(prop(on, "land")!.transferGain).not.toBe(prop(base, "land")!.transferGain);
      // 음성: 건물은 그대로
      expect(prop(on, "building")!.transferGain).toBe(prop(base, "building")!.transferGain);
      expect(prop(on, "building")?.carryoverTaxationDetail).toBeUndefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-07 — 건물 파트 이월과세 🔴 미구현
  // ══════════════════════════════════════════════════════════════════
  describe("K-07: 건물 파트만 이월과세 (토지는 매매)", () => {
    const buildingOnly = body({
      buildingAcquisitionCause: "carryover_gift",
      buildingCarryoverTaxation: engineShaped(),
    });

    it("건물 카드에 carryoverTaxationDetail이 실린다", async () => {
      const r = await call(buildingOnly);
      expect(prop(r, "building")?.carryoverTaxationDetail?.isEligible).toBe(true);
      expect(prop(r, "building")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(
        150_000_000,
      );
    });

    it("🔑 건물만 움직이고 토지는 불변 (음성 + 양성 대조군)", async () => {
      const base = await call(body());
      const r = await call(buildingOnly);
      expect(prop(r, "building")!.transferGain).not.toBe(prop(base, "building")!.transferGain);
      expect(prop(r, "land")!.transferGain).toBe(prop(base, "land")!.transferGain);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-08 — 토지+건물 둘 다 🔴 미구현
  // ══════════════════════════════════════════════════════════════════
  describe("K-08: 토지+건물 둘 다 이월과세 — 각자 자기 값으로", () => {
    /**
     * 🔑 **두 파트에 서로 다른 값을 준다.** 같은 값을 주면 「한쪽이 다른 쪽을 덮었다」와
     * 「각자 자기 값을 썼다」가 구별되지 않는다.
     */
    const both = body({
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: engineShaped({ donorAcquisitionPrice: 150_000_000 }),
      buildingAcquisitionCause: "carryover_gift",
      buildingCarryoverTaxation: engineShaped({ donorAcquisitionPrice: 80_000_000 }),
    });

    it("두 카드가 각자 자기 증여자 취득가액을 쓴다", async () => {
      const r = await call(both);
      expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(150_000_000);
      expect(prop(r, "building")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(
        80_000_000,
      );
    });

    /**
     * 🔑 **방향을 뒤집어 건다.** 「토지 LTHD > 건물 LTHD」는 건물이 **미배선일 때도 참**이다
     *    (건물이 수증자 취득일 2021을 써서 짧으므로). 그래서 판별력이 없다 —
     *    2026-08-10 실행에서 `it.fails`가 「Expect test to fail」로 되레 실패했다
     *    (메모리 `feedback_anchor_observes_wrong_stage`).
     *
     * ⇒ **건물 증여자 취득일을 토지보다 이르게** 준다. 배선 전에는 건물이 2021(짧음)이라
     *    `building < land`, 배선 후에는 건물이 1995(가장 김)라 `building > land`가 된다.
     */
    it("파트별 증여자 취득일이 다르면 LTHD가 갈린다 (법 §95④)", async () => {
      const r = await call(
        body({
          landAcquisitionCause: "carryover_gift",
          landCarryoverTaxation: engineShaped({ donorAcquisitionDate: "2019-06-15" }),
          buildingAcquisitionCause: "carryover_gift",
          buildingCarryoverTaxation: engineShaped({ donorAcquisitionDate: "1995-06-15" }),
        }),
      );
      expect(prop(r, "building")!.longTermHoldingDeduction).toBeGreaterThan(
        prop(r, "land")!.longTermHoldingDeduction,
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-09 — 증여세 파트별 안분 (영 §163의2②) 🔴 미구현
  // ══════════════════════════════════════════════════════════════════
  describe("K-09: 증여세 상당액 파트별 안분", () => {
    /**
     * 「소득세법 시행령」 §163의2②:
     *   증여세 상당액 = 증여세 **산출세액** × (양도한 **해당 자산가액** ÷ 증여세 **과세가액**)
     *
     * 픽스처 — 산출세액 100,000,000 · 과세가액 500,000,000
     *   토지 자산가액 300,000,000 ⇒ floor(100,000,000 × 300,000,000 / 500,000,000) = 60,000,000
     *   건물 자산가액 200,000,000 ⇒ floor(100,000,000 × 200,000,000 / 500,000,000) = 40,000,000
     *
     * 🔑 **사용자가 안분해 넣지 않는다.** 넣게 하면 두 파트 합이 산출세액을 넘어도 막을 수 없다.
     */
    const apportioned = body({
      carryoverGiftEvent: GIFT_EVENT,
      landAcquisitionCause: "carryover_gift",
      landCarryoverPart: part(300_000_000),
      buildingAcquisitionCause: "carryover_gift",
      buildingCarryoverPart: part(200_000_000),
    });

    it("토지 60,000,000 · 건물 40,000,000 (원 단위)", async () => {
      const r = await call(apportioned);
      expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBe(
        60_000_000,
      );
      expect(prop(r, "building")?.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBe(
        40_000_000,
      );
    });

    /**
     * ⚠️ **「Σ ≤ 산출세액」만 걸면 판별력이 0이다** — 미배선 상태에서는 0 + 0 = 0이라 항상 참이다
     *    (2026-08-10 실행에서 「Expect test to fail」로 걸렸다).
     *    ⇒ **정확한 합**과 함께 건다.
     *
     * 이 픽스처는 자산가액 합(300,000,000 + 200,000,000)이 과세가액과 **같아** Σ = 산출세액이다.
     * 아래 「일부만 양도」 케이스가 일반형(Σ < 산출세액)을 함께 고정한다.
     */
    it("Σ 파트 증여세 상당액 = 100,000,000 (= 산출세액, 자산가액 합 = 과세가액)", async () => {
      const r = await call(apportioned);
      const sum =
        (prop(r, "land")?.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense ?? 0) +
        (prop(r, "building")?.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense ?? 0);
      expect(sum).toBe(100_000_000);
      expect(sum).toBeLessThanOrEqual(GIFT_EVENT.giftTaxCalculated);
    });

    /**
     * 일반형 — 증여받은 재산 중 **일부만** 양도. 과세가액 600,000,000:
     *   토지 floor(100,000,000 × 300,000,000 / 600,000,000) = 50,000,000
     *   건물 floor(100,000,000 × 200,000,000 / 600,000,000) = 33,333,333  ← **floor 확인**
     */
    it("일부만 양도 — 토지 50,000,000 · 건물 33,333,333 (floor)", async () => {
      const r = await call(
        body({
          carryoverGiftEvent: { ...GIFT_EVENT, giftTaxBase: 600_000_000 },
          landAcquisitionCause: "carryover_gift",
          landCarryoverPart: part(300_000_000),
          buildingAcquisitionCause: "carryover_gift",
          buildingCarryoverPart: part(200_000_000),
        }),
      );
      expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBe(
        50_000_000,
      );
      expect(prop(r, "building")?.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBe(
        33_333_333,
      );
    });

    it("비교과세 B 취득가액 = 그 파트의 giftDateAssetValue (같은 값을 겸한다)", async () => {
      const r = await call(apportioned);
      expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioB.acquisitionPrice).toBe(300_000_000);
      expect(prop(r, "building")?.carryoverTaxationDetail?.scenarioB.acquisitionPrice).toBe(
        200_000_000,
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-10 — 안분 한도 (영 §163의2② 후단) 🔴 미구현
  // ══════════════════════════════════════════════════════════════════
  describe("K-10: 증여세 상당액 한도", () => {
    /**
     * 후단: 「필요경비로 산입되는 증여세 상당액은 **양도가액에서 법 §97① 및 ②의 금액을 공제한
     * 잔액을 한도**로 한다」.
     *
     * 토지 양도가 500,000,000 · 증여자 취득가액 490,000,000 ⇒ 한도 ≈ 10,000,000
     * 안분 증여세 60,000,000 > 한도 ⇒ 절사되어야 한다.
     */
    it("한도 초과분이 절사된다", async () => {
      const r = await call(
        body({
          carryoverGiftEvent: GIFT_EVENT,
          landAcquisitionCause: "carryover_gift",
          landCarryoverPart: part(300_000_000, { donorAcquisitionPrice: 490_000_000 }),
        }),
      );
      const a = prop(r, "land")?.carryoverTaxationDetail?.scenarioA;
      expect(a?.giftTaxLimitApplied).toBe(true);
      expect(a?.giftTaxAddedToExpense).toBe(a?.giftTaxLimitCap);
      expect(a!.giftTaxAddedToExpense).toBeLessThan(60_000_000);
    });

    /** 🔑 **미초과 대조군** — 없으면 「항상 절사」와 구별되지 않는다. */
    it("대조군 — 한도 미초과면 안분값 그대로", async () => {
      const r = await call(
        body({
          carryoverGiftEvent: GIFT_EVENT,
          landAcquisitionCause: "carryover_gift",
          landCarryoverPart: part(300_000_000, { donorAcquisitionPrice: 150_000_000 }),
        }),
      );
      const a = prop(r, "land")?.carryoverTaxationDetail?.scenarioA;
      expect(a?.giftTaxLimitApplied).toBe(false);
      expect(a?.giftTaxAddedToExpense).toBe(60_000_000);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // K-14 — 환산 모드 🔴 지금은 취득가액 0 (과대과세)
  // ══════════════════════════════════════════════════════════════════
  describe("K-14: 환산 모드 — 증여자 취득 당시 기준시가로 환산", () => {
    /**
     * 🔴 **현행 실측 — 취득가액 0** (계획 §6 Q2). `calcCarryoverScenarios`가
     * `rawInput.standardPriceAtAcquisition`을 읽는데 GB 카드에 그 필드가 없다.
     * 실가 161,460,000 → 환산 204,930,000 (**43,470,000 과대**), 게다가 비교과세가
     * 그 틀린 A를 채택한다.
     *
     * 기대값 — 토지 양도가 500,000,000 · 증여자 취득 당시 토지 기준시가 60,000,000 ·
     * 양도 당시 토지 기준시가 200,000,000(= 2,000,000 × 100, **엔진이 아는 값**)
     *   ⇒ 환산취득가 = floor(500,000,000 × 60,000,000 / 200,000,000) = **150,000,000**
     *
     * 🔑 「≠ 0」이 아니라 **원 단위 일치**로 건다 — 부정 단언은 다른 이유로 0이 아닐 때도 통과한다.
     */
    it("환산취득가 = 150,000,000 (분모는 엔진이 아는 양도 당시 기준시가)", async () => {
      const r = await call(
        body({
          carryoverGiftEvent: GIFT_EVENT,
          landAcquisitionCause: "carryover_gift",
          landCarryoverPart: part(300_000_000, {
            useEstimatedAcquisition: true,
            donorAcquisitionPrice: undefined,
            donorStandardPriceAtAcquisition: 60_000_000,
          }),
        }),
      );
      expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(150_000_000);
    });

    it("🔴 회귀 가드 — 환산 모드에서 취득가액이 0이 되지 않는다", async () => {
      const r = await call(
        body({
          carryoverGiftEvent: GIFT_EVENT,
          landAcquisitionCause: "carryover_gift",
          landCarryoverPart: part(300_000_000, {
            useEstimatedAcquisition: true,
            donorAcquisitionPrice: undefined,
            donorStandardPriceAtAcquisition: 60_000_000,
          }),
        }),
      );
      expect(prop(r, "land")!.carryoverTaxationDetail!.scenarioA.acquisitionPrice).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // 하위 호환 — 기존 엔진 모양 키를 계속 받는다 (설계 D9-10)
  // ══════════════════════════════════════════════════════════════════
  describe("하위 호환: `landCarryoverTaxation`(엔진 모양)이 계속 동작한다", () => {
    /**
     * 이 키는 `general-building-case-7b-carryover.test.ts`(16건)와 지분 anchor GBF-27이 쓴다.
     * 신규 `*CarryoverPart`를 도입해도 **없애면 안 된다**.
     */
    it("사용자가 안분한 증여세를 그대로 쓴다 (안분 로직이 덮어쓰지 않는다)", async () => {
      const r = await call(
        body({ landAcquisitionCause: "carryover_gift", landCarryoverTaxation: engineShaped() }),
      );
      expect(prop(r, "land")?.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBe(
        30_000_000,
      );
    });
  });
});
