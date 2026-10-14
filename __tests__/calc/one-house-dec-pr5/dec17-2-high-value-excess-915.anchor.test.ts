/**
 * #17-2 고가주택(12억 초과 부분과세) + 배율 초과 부수토지 — 기획재정부 재산세제과-915(2011.10.27.) 회신 방식.
 *
 * 한도 내(기준면적 이내) 토지분 과세 양도차익 = max(0, 전체 부수토지 양도차익의 12억 안분값 − 초과분 양도차익)
 * 초과분 양도차익(X) = floor(토지 양도차익 × 초과면적 / 토지면적) — 12억 안분 없이 전액 과세(종전과 같다)
 * 건물분 = 건물 양도차익의 12억 안분값(종전과 같다)
 *
 * 시료: 같은 날 취득(2012-01-02) 주택, 토지 500㎡ · 정착면적 100㎡ · 수도권 주거지역(한도 300㎡ · 초과 200㎡ → X 비율 0.4),
 * 양도 2026-02-16. 12억 안분 비율 r = (양도가 − 12억) / 양도가 — 양도가 20억이면 0.4(= X 비율 → L'=X 경계),
 * 15억이면 0.2(L'<X → 0 하한), 30억이면 0.6(L'>X).
 *
 * | 시료 | 수정 전 과세 양도차익 | 수정 후 |
 * |---|---|---|
 * | 20억 경계(L'=X) | 771,428,571 | 600,000,000 |
 * | 30억(L'>X) | 1,728,571,427 | 1,499,999,999 |
 * | 15억(L'<X, 0 하한) | 348,571,428 | 292,857,143 |
 * | 12억 이하·비과세 아님·나중 취득 토지 겹침 | (불변) | (불변) |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { highValueExcessFormulaNotice } from "@/lib/tax-engine/transfer-tax-appurtenant-land";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "../_helpers/redev-one-house-route";
import { runSingle, runMulti } from "../_helpers/single-multi-route-parity";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const rates = makeMockRates();
const TD = "2026-02-16";
const TWELVE = 1_200_000_000n;

/** 영 §160① 12억 안분 — 곱셈 먼저 · 나눗셈 나중(BigInt 독립 도출, 엔진 출력을 베끼지 않는다). */
const prorateAt = (price: number) => (gain: number): number =>
  gain <= 0 ? gain : Number((BigInt(gain) * (BigInt(price) - TWELVE)) / BigInt(price));
/** 초과분 양도차익 — 토지 양도차익 × 초과 200㎡ / 토지 500㎡ */
const excessShare = (landGain: number): number => Math.floor(landGain * 0.4);
/** 재산세제과-915 회신 방식의 파트 기대값 */
function expected915(price: number, landGain: number, buildingGain: number) {
  const p = prorateAt(price);
  const x = excessShare(landGain);
  const land = Math.max(0, p(landGain) - x);
  const building = p(buildingGain);
  return { x, land, building, total: x + land + building };
}

const base = {
  propertyType: "housing" as const, transferDate: new Date(TD),
  acquisitionDate: new Date("2012-01-02"), acquisitionPrice: 500_000_000, expenses: 0, useEstimatedAcquisition: false,
  isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
  buildingFootprintArea: 100, acquisitionArea: 500, appurtenantLandZone: "metropolitan_residential" as const,
};
const split = {
  landAcquisitionDate: new Date("2012-01-02"),
  standardPriceAtAcquisition: 300_000_000, standardPricePerSqmAtAcquisition: 400_000, buildingStandardPriceAtAcquisition: 150_000_000,
  landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000,
};
const run = (over: Record<string, unknown> = {}) =>
  calculateTransferTax(baseTransferInput({ ...base, transferPrice: 2_000_000_000, ...split, ...over } as never), rates);

/** 파트 정합 — Σ파트 과세 양도차익 = 자산 과세 양도차익, Σ파트 장특 = 자산 장특 */
function expectPartsConsistent(r: ReturnType<typeof run>) {
  const s = r.splitDetail!;
  const nb = s.nonBusinessLandPart!;
  expect(nb.taxableGainAfterProration! + s.land.taxableGainAfterProration! + s.building.taxableGainAfterProration!).toBe(r.taxableGain);
  expect(s.land.longTermDeduction + s.building.longTermDeduction + nb.longTermDeduction).toBe(r.longTermHoldingDeduction);
}

describe("#17-2 ① L'≥X — 전체 부수토지 12억 안분값에서 초과분을 뺀다 (수정 전: 초과분을 뺀 나머지를 다시 안분)", () => {
  it("30억 — 토지 한도 내 분 285,714,286 · 건물 642,857,142 · 초과분 571,428,571 · 총 과세 양도차익 1,499,999,999", () => {
    const r = run({
      transferPrice: 3_000_000_000, landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 600_000_000,
    });
    expect(r.isPartialExempt).toBe(true);
    const s = r.splitDetail!;
    const e = expected915(3_000_000_000, s.land.gain, s.building.gain);
    expect(e.land).toBeGreaterThan(0); // L' > X 시료임을 고정
    expect(s.nonBusinessLandPart!.taxableGainAfterProration).toBe(e.x);
    expect(s.land.taxableGainAfterProration).toBe(e.land);
    expect(s.building.taxableGainAfterProration).toBe(e.building);
    expect(r.taxableGain).toBe(e.total);
    // 손계산 고정값 — 수정 전 1,728,571,427
    expect(s.land.taxableGainAfterProration).toBe(285_714_286);
    expect(r.taxableGain).toBe(1_499_999_999);
    expect(r.totalTax).toBe(235_191_000);
    expectPartsConsistent(r);
  });

  it("L'≥X이면 총 과세 양도차익 = 전체(토지+건물) 12억 안분값과 같다 (X가 두 번 반영되지 않는다)", () => {
    const r = run({
      transferPrice: 3_000_000_000, landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 600_000_000,
    });
    const s = r.splitDetail!;
    const p = prorateAt(3_000_000_000);
    // 파트별 floor 때문에 최대 2원 차이 — 전체 안분과 같은 값이어야 한다(수정 전은 X(1−r) ≈ 2.3억 더 컸다)
    expect(Math.abs(r.taxableGain - p(s.land.gain + s.building.gain))).toBeLessThanOrEqual(2);
  });

  it("area 400(초과 100㎡ · X 비율 0.25) + 20억 — L'(0.4) > X(0.25): 한도 내 토지 111,290,323", () => {
    const r = run({ acquisitionArea: 400 });
    const s = r.splitDetail!;
    const p = prorateAt(2_000_000_000);
    const x = Math.floor(s.land.gain * 0.25);
    expect(s.nonBusinessLandPart!.taxableGainAfterProration).toBe(x);
    expect(s.land.taxableGainAfterProration).toBe(p(s.land.gain) - x);
    expect(s.land.taxableGainAfterProration).toBe(111_290_323);
    expect(r.taxableGain).toBe(600_000_000);
    expect(r.totalTax).toBe(67_497_774);
    expectPartsConsistent(r);
  });
});

describe("#17-2 ② L'<X — 0 하한 (음수 토지분은 없는 것으로 본다)", () => {
  it("15억 — r=0.2 < 0.4: 한도 내 토지분 0 · 총 과세 양도차익 = X + 건물 안분 = 292,857,143", () => {
    const r = run({ transferPrice: 1_500_000_000 });
    const s = r.splitDetail!;
    const e = expected915(1_500_000_000, s.land.gain, s.building.gain);
    expect(prorateAt(1_500_000_000)(s.land.gain)).toBeLessThan(e.x); // 0 하한이 걸리는 시료임을 고정
    expect(s.land.taxableGainAfterProration).toBe(0); // 음수가 아니다
    expect(s.nonBusinessLandPart!.taxableGainAfterProration).toBe(185_714_286);
    expect(s.building.taxableGainAfterProration).toBe(107_142_857);
    expect(r.taxableGain).toBe(292_857_143); // 수정 전 348,571,428
    expect(r.taxableGain).toBe(e.total);
    expect(r.totalTax).toBe(41_870_714);
    expectPartsConsistent(r);
  });

  it("12.5억 — 0 하한 + 건물 안분이 작은 값 (총 152,142,857)", () => {
    const r = run({ transferPrice: 1_250_000_000 });
    expect(r.splitDetail!.land.taxableGainAfterProration).toBe(0);
    expect(r.taxableGain).toBe(152_142_857);
    expectPartsConsistent(r);
  });
});

describe("#17-2 ④ 경계 — 정확히 L'=X", () => {
  it("20억(r=0.4=X 비율) — 한도 내 토지분 0 · 총 과세 양도차익 600,000,000 (수정 전 771,428,571)", () => {
    const r = run();
    const s = r.splitDetail!;
    expect(prorateAt(2_000_000_000)(s.land.gain)).toBe(excessShare(s.land.gain)); // L' = X 정확히 일치
    expect(s.land.taxableGainAfterProration).toBe(0);
    expect(r.taxableGain).toBe(600_000_000);
    expect(r.totalTax).toBe(89_283_857);
    expectPartsConsistent(r);
  });
});

describe("#17-2 ③ 건물 양도차익 0 (토지만 차익) — 직접 입력 모드", () => {
  const actual = (price: number, landT: number, buildT: number, landAcq: number, buildAcq: number) => ({
    transferPrice: price, acquisitionPrice: landAcq + buildAcq,
    isSeparateAcquisition: true, selfOwns: "both", landAcquisitionDate: new Date("2012-01-02"),
    landTransferPrice: landT, buildingTransferPrice: buildT, landAcquisitionPrice: landAcq, buildingAcquisitionPrice: buildAcq,
    landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
    landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: buildT,
    standardPriceAtAcquisition: undefined, standardPricePerSqmAtAcquisition: undefined, buildingStandardPriceAtAcquisition: undefined,
  });

  it("20억 · 건물 차익 0 — L'=X=400,000,000 경계: 한도 내 토지 0 · 총 400,000,000 (수정 전 640,000,000)", () => {
    const r = run(actual(2_000_000_000, 1_500_000_000, 500_000_000, 500_000_000, 500_000_000));
    const s = r.splitDetail!;
    expect(s.building.gain).toBe(0);
    expect(s.land.taxableGainAfterProration).toBe(0);
    expect(s.building.taxableGainAfterProration).toBe(0);
    expect(r.taxableGain).toBe(400_000_000);
    expectPartsConsistent(r);
  });

  it("30억 · 건물 차익 0 — L'(1,200,000,000) > X(800,000,000): 한도 내 토지 400,000,000 · 총 1,200,000,000", () => {
    const r = run(actual(3_000_000_000, 2_500_000_000, 500_000_000, 500_000_000, 500_000_000));
    const s = r.splitDetail!;
    expect(s.building.gain).toBe(0);
    expect(s.land.taxableGainAfterProration).toBe(400_000_000);
    expect(r.taxableGain).toBe(1_200_000_000);
    expectPartsConsistent(r);
  });
});

describe("#17-2 ⑤⑥⑦ 불변 — 이 산식이 닿지 않는 경로", () => {
  it("⑤ 12억 이하(전액 비과세) + 초과분 — 한도 내 토지·건물 0, 초과분만 과세 (총세액 9,296,570 불변)", () => {
    const r = run({ transferPrice: 1_000_000_000 });
    const s = r.splitDetail!;
    expect(r.isPartialExempt).toBe(false);
    expect(s.land.taxableGainAfterProration).toBe(0);
    expect(s.building.taxableGainAfterProration).toBe(0);
    expect(r.taxableGain).toBe(85_714_286);
    expect(r.totalTax).toBe(9_296_570);
  });

  it("⑥ 비과세 아님(2주택) — 초과분 분리 + 나머지 전액 과세 (안분 없음, 1,500,000,000 · 총세액 460,828,500 불변)", () => {
    const r = run({ isOneHousehold: false, householdHousingCount: 2 });
    const s = r.splitDetail!;
    expect(s.nonBusinessLandPart!.taxableGainAfterProration).toBe(285_714_286);
    expect(s.land.taxableGainAfterProration).toBe(428_571_429);
    expect(s.building.taxableGainAfterProration).toBe(785_714_285);
    expect(r.taxableGain).toBe(1_500_000_000);
    expect(r.totalTax).toBe(460_828_500);
    // 안분하지 않은 경로에서 회신 방식을 적용했다고 적지 않는다
    expect(r.steps.find((st) => st.label === "부수토지 비과세 제외")!.formula).not.toContain("재산세제과-915");
  });

  const laterLandOver = (price: number, landT: number, buildT: number) => ({
    transferPrice: price, acquisitionPrice: 600_000_000, acquisitionDate: new Date("2004-01-01"),
    isSeparateAcquisition: true, selfOwns: "both", landAcquisitionDate: new Date("2025-06-01"),
    landTransferPrice: landT, buildingTransferPrice: buildT,
    landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 200_000_000,
    landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
    landStandardPriceAtTransfer: landT, buildingStandardPriceAtTransfer: buildT,
    standardPriceAtAcquisition: undefined, standardPricePerSqmAtAcquisition: undefined, buildingStandardPriceAtAcquisition: undefined,
  });

  it("⑦ 나중 취득 토지(G-3) + 초과분 + 고가주택 — 토지분 전체 전액 과세(안분 없음), 건물만 안분: 종전과 같다 (토지 800,000,000 = 초과분 320,000,000 + 480,000,000)", () => {
    const r = run(laterLandOver(2_000_000_000, 1_200_000_000, 800_000_000));
    expect(r.isPartialExempt).toBe(true);
    const s = r.splitDetail!;
    expect(s.nonBusinessLandPart!.taxableGainAfterProration).toBe(320_000_000);
    expect(s.land.taxableGainAfterProration).toBe(480_000_000);
    expect(s.building.taxableGainAfterProration).toBe(240_000_000);
    expect(r.taxableGain).toBe(1_040_000_000);
    expect(r.totalTax).toBe(550_209_000);
    expect(r.steps.find((st) => st.label === "부수토지 비과세 제외")!.formula).not.toContain("재산세제과-915");
  });

  it("⑦ 12억 이하 + 나중 취득 토지 + 초과분도 종전과 같다 (총세액 134,475,000)", () => {
    const r = run(laterLandOver(1_000_000_000, 600_000_000, 400_000_000));
    expect(r.taxableGain).toBe(200_000_000);
    expect(r.totalTax).toBe(134_475_000);
  });
});

describe("#17-2 고지 — 해석례 근거를 사실로 서술하고 불확실 표현·유불리 표현이 없다", () => {
  const notice = (r: ReturnType<typeof run>) => (r.warnings ?? []).find((w) => w.includes("고가주택에 배율 초과 부수토지"));

  it("고가주택 + 초과분 — 재산세제과-915 회신 방식·기본통칙 95-1을 밝히고 «확인이 필요합니다»는 없다", () => {
    const w = notice(run());
    expect(w).toBeDefined();
    expect(w).toContain("재산세제과-915");
    expect(w).toContain("2011.10.27.");
    expect(w).toContain("기본통칙 95-1");
    expect(w).toContain("법령이 아니라");
    expect(w).not.toContain("해석마다");
    expect(w).not.toContain("확인이 필요");
    expect(w).not.toMatch(/유리|불리|절감|절세/);
  });

  it("12억 이하 · 초과분 없음 — 고지 없음", () => {
    expect(notice(run({ transferPrice: 1_000_000_000 }))).toBeUndefined();
    expect(notice(run({ acquisitionArea: 250 }))).toBeUndefined();
  });

  it("기준금액은 양도일 연혁 — 9억 시대(2020-06-01) 양도의 고지에 «12억»이 박히지 않고 «9억»으로 쓴다", () => {
    const w = notice(run({ transferDate: new Date("2020-06-01"), transferPrice: 1_500_000_000, acquisitionArea: 700 }));
    expect(w).toBeDefined();
    expect(w).toContain("9억 안분");
    expect(w).not.toContain("12억");
    expect(notice(run())).toContain("12억 안분");
  });

  it("나중 취득 토지 겹침 — 회신 방식을 적용하지 않았다고 밝힌다 (거짓 근거 서술 금지)", () => {
    const r = run({
      transferPrice: 2_000_000_000, acquisitionPrice: 600_000_000, acquisitionDate: new Date("2004-01-01"),
      isSeparateAcquisition: true, selfOwns: "both", landAcquisitionDate: new Date("2025-06-01"),
      landTransferPrice: 1_200_000_000, buildingTransferPrice: 800_000_000,
      landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 200_000_000,
      landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
      landStandardPriceAtTransfer: 1_200_000_000, buildingStandardPriceAtTransfer: 800_000_000,
      standardPriceAtAcquisition: undefined, standardPricePerSqmAtAcquisition: undefined, buildingStandardPriceAtAcquisition: undefined,
    });
    const w = notice(r);
    expect(w).toContain("나중에 취득한 부수토지");
    expect(w).toContain("적용하지 않았습니다");
  });

  it("단위 — 게이트: isPartialExempt가 아니거나 초과 파트가 없으면 null", () => {
    expect(highValueExcessFormulaNotice(undefined, true, new Date("2024-01-01"))).toBeNull();
    expect(highValueExcessFormulaNotice(run().splitDetail, false, new Date("2024-01-01"))).toBeNull();
  });

  it("계산 단계(부수토지 비과세 제외)에 회신 방식과 음수 → 0 표기가 남는다", () => {
    const hi = run({ transferPrice: 3_000_000_000, landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 600_000_000 });
    const f1 = hi.steps.find((s) => s.label === "부수토지 비과세 제외")!.formula;
    expect(f1).toContain("재산세제과-915");
    expect(f1).toContain("285,714,286");
    expect(f1).not.toContain("음수여서 0");
    const lo = run({ transferPrice: 1_500_000_000 });
    expect(lo.steps.find((s) => s.label === "부수토지 비과세 제외")!.formula).toContain("음수여서 0");
    const exempt = run({ transferPrice: 1_000_000_000 });
    expect(exempt.steps.find((s) => s.label === "부수토지 비과세 제외")!.formula).not.toContain("재산세제과-915");
  });
});

describe("#17-2 ⑩ route(폼→④→⑧→⑫→⑭) — 단건과 다건이 같은 파트 값을 낸다", () => {
  const HOUSE: Record<string, unknown> = {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2012-01-02",
    fixedAcquisitionPrice: "500000000", actualSalePrice: "3000000000", addressJibun: "서울 테스트동 1",
    residenceInputMode: "direct", residencePeriodMonthsAsset: "120",
    buildingFootprintArea: "100", appurtenantLandZone: "metropolitan_residential", isUrbanArea: true, areaScenario: "same",
    acquisitionArea: "500", transferArea: "500",
    standardPriceAtAcq: "300000000", standardPricePerSqmAtAcq: "400000", buildingStandardPriceAtAcq: "150000000",
    standardPricePerSqmAtTransfer: "1600000", buildingStandardPriceAtTransfer: "600000000",
  };
  const form = (price: string, over: Record<string, unknown> = {}) =>
    ({
      ...createDefaultTransferFormData(),
      transferDate: TD, contractTotalPrice: price,
      isOneHousehold: true, householdHousingCount: "1", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
      residencePeriodMonths: "120",
      assets: [{ ...makeDefaultAsset(1), ...HOUSE, actualSalePrice: price, ...over } as unknown as AssetForm],
    }) as never;

  it("30억 — 단건 route: 한도 내 토지 > 0 이고 Σ파트 = 자산 과세 양도차익", async () => {
    const r = await runCalc(form("3000000000"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    const s = r.result.splitDetail;
    expect(r.result.isPartialExempt).toBe(true);
    expect(s.nonBusinessLandPart.taxableGainAfterProration + s.land.taxableGainAfterProration + s.building.taxableGainAfterProration).toBe(r.result.taxableGain);
    const e = expected915(3_000_000_000, s.land.gain, s.building.gain);
    expect(s.land.taxableGainAfterProration).toBe(e.land);
    expect(r.result.taxableGain).toBe(e.total);
    expect(r.result.warnings.some((w: string) => w.includes("재산세제과-915"))).toBe(true);
  }, 60_000);

  it("15억(0 하한) — 단건 route 한도 내 토지분 0", async () => {
    const r = await runCalc(form("1500000000", { standardPricePerSqmAtTransfer: "800000", buildingStandardPriceAtTransfer: "400000000" }));
    expect(r.issues).toEqual([]);
    expect(r.result.splitDetail.land.taxableGainAfterProration).toBe(0);
  }, 60_000);

  it.each([["30억", "3000000000", {}], ["15억", "1500000000", { standardPricePerSqmAtTransfer: "800000", buildingStandardPriceAtTransfer: "400000000" }]])(
    "%s — 다건 route 파트 값이 단건 route와 같다",
    async (_n, price, over) => {
      const f = form(price as string, over as Record<string, unknown>);
      const s = await runSingle(f);
      const m = await runMulti([f]);
      expect(s.status).toBe(200);
      expect(m.status).toBe(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sd = (s.r as any).splitDetail;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (m.props[0] as any).splitDetail;
      expect(md.land.taxableGainAfterProration).toBe(sd.land.taxableGainAfterProration);
      expect(md.building.taxableGainAfterProration).toBe(sd.building.taxableGainAfterProration);
      expect(md.nonBusinessLandPart.taxableGainAfterProration).toBe(sd.nonBusinessLandPart.taxableGainAfterProration);
      // 파트 장특 합 = 단건 자산 장특 (다건 결과에는 자산 과세 양도차익이 아닌 파트 echo가 실린다)
      expect(md.land.longTermDeduction + md.building.longTermDeduction + md.nonBusinessLandPart.longTermDeduction)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .toBe((s.r as any).longTermHoldingDeduction);
    },
    60_000,
  );
});
