/**
 * ⑫⑭ 배선 가드 — 상업용건물 부수토지 초과분 판정 (Phase C)
 *
 * 이 두 지점은 **TypeScript가 잡지 못한다**:
 *   ⑫ Zod 스키마에 필드가 없으면 요청 본문에서 조용히 stripping 된다.
 *   ⑭ route가 엔진 input에 매핑하지 않으면 STEP 0.62가 no-op으로 지나간다.
 * 둘 다 "에러 없이 중과가 사라지는" 실패라 anchor로 고정한다.
 */
import { describe, it, expect } from "vitest";
import { commercialAppurtenantLandSchema } from "@/lib/api/transfer-tax-building-schemas";
import { propertySchema as transferTaxRequestSchema } from "@/lib/api/transfer-tax-schema";
import { buildTransferEngineInput } from "@/app/api/calc/transfer/engine-input";

// 상업지역 3배 · 대지 1,200㎡ · 바닥 200㎡ → 기준면적 600㎡ · 초과 600㎡ — 초과분이 있어 토지·건물 구분 기준시가(partBasis)가 필수다(NBL2611-V5-BX01).
const PART_BASIS = { acquisitionLandStd: 360_000_000, acquisitionBuildingStd: 240_000_000, transferLandStd: 720_000_000, transferBuildingStd: 480_000_000 };
const CAL = {
  totalLandArea: 1200,
  totalBuildingFootprintArea: 200,
  zoneType: "commercial",
  partBasis: PART_BASIS,
};

/** 최소 유효 요청 본문 — 상업용건물 실거래가 양도. */
const baseBody = () => ({
  propertyType: "commercial_building" as const,
  transferPrice: 1_200_000_000,
  acquisitionPrice: 600_000_000,
  transferDate: "2024-06-01",
  acquisitionDate: "2014-06-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isOneHousehold: false,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false, // §104③ 최상위 필드(필수) — 부수토지 §101① 단서 축과 다르다
  isNonBusinessLand: false,
  residencePeriodMonths: 0,
  reductions: [],
});

describe("W-1 (⑫) — Zod 스키마가 필드를 보존한다", () => {
  it("최상위 요청 스키마가 commercialAppurtenantLand를 통과시킨다 (침묵 strip 금지)", () => {
    const parsed = transferTaxRequestSchema.safeParse({
      ...baseBody(),
      commercialAppurtenantLand: CAL,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.commercialAppurtenantLand).toEqual(CAL);
    }
  });

  it("미제공 시 undefined (optional — 현행 동작 불변)", () => {
    const parsed = transferTaxRequestSchema.safeParse(baseBody());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.commercialAppurtenantLand).toBeUndefined();
  });
});

describe("W-2 (⑩) — refine: 배율을 결정할 수 없는 입력은 API에서 차단", () => {
  it("용도지역 없이 제출하면 거부한다 (엔진 throw 전에 400)", () => {
    const r = commercialAppurtenantLandSchema.safeParse({
      totalLandArea: 1200,
      totalBuildingFootprintArea: 200,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.includes("zoneType"))).toBe(true);
  });

  it("§101① 단서(허가·사용승인 미이행)면 용도지역 없이도 통과 — 배율이 불필요하다", () => {
    const r = commercialAppurtenantLandSchema.safeParse({
      totalLandArea: 1200,
      totalBuildingFootprintArea: 200,
      unapprovedBuilding: true,
      partBasis: PART_BASIS,
    });
    expect(r.success).toBe(true);
  });

  it("면적은 양수여야 한다", () => {
    expect(
      commercialAppurtenantLandSchema.safeParse({ ...CAL, totalLandArea: 0 }).success,
    ).toBe(false);
    expect(
      commercialAppurtenantLandSchema.safeParse({ ...CAL, totalBuildingFootprintArea: -1 }).success,
    ).toBe(false);
  });
});

describe("W-2b (⑫) — 초과분이 있으면 토지·건물 구분 기준시가가 필수다 (NBL2611-V5-BX01 · 자동 안분 fallback 금지)", () => {
  const { partBasis: _omit, ...withoutBasis } = CAL;
  void _omit;
  it("초과분이 있는데 partBasis가 없으면 거부한다", () => {
    const r = commercialAppurtenantLandSchema.safeParse(withoutBasis);
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.includes("partBasis"))).toBe(true);
  });

  it("§101① 단서(전량 비사업용)도 partBasis가 필수다", () => {
    const r = commercialAppurtenantLandSchema.safeParse({ totalLandArea: 1200, totalBuildingFootprintArea: 200, unapprovedBuilding: true });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path.includes("partBasis"))).toBe(true);
  });

  it("초과분이 없으면 partBasis 없이 통과한다 (녹지 7배 → 기준면적 1,400㎡ ≥ 대지)", () => {
    expect(commercialAppurtenantLandSchema.safeParse({ ...withoutBasis, zoneType: "green" }).success).toBe(true);
  });

  it("취득 당시·양도 당시 각각 토지·건물 합이 0이면 거부한다", () => {
    expect(commercialAppurtenantLandSchema.safeParse({ ...CAL, partBasis: { ...PART_BASIS, acquisitionLandStd: 0, acquisitionBuildingStd: 0 } }).success).toBe(false);
    expect(commercialAppurtenantLandSchema.safeParse({ ...CAL, partBasis: { ...PART_BASIS, transferLandStd: 0, transferBuildingStd: 0 } }).success).toBe(false);
  });

  it("partBasis가 침묵 strip되지 않는다", () => {
    const r = commercialAppurtenantLandSchema.safeParse(CAL);
    expect(r.success && r.data.partBasis).toEqual(PART_BASIS);
  });
});

describe("W-3 (⑭) — route가 엔진 input에 매핑한다", () => {
  it("buildTransferEngineInput 결과에 commercialAppurtenantLand가 살아 있다", () => {
    const parsed = transferTaxRequestSchema.parse({
      ...baseBody(),
      commercialAppurtenantLand: CAL,
    });
    const engineInput = buildTransferEngineInput(
      parsed as never,
      new Date("2024-06-01"),
      new Date("2014-06-01"),
      undefined,
    );
    expect(engineInput.commercialAppurtenantLand).toEqual(CAL);
  });

  it("미제공 시 엔진 input에도 없다 (spread 조건부 — 빈 객체 주입 금지)", () => {
    const parsed = transferTaxRequestSchema.parse(baseBody());
    const engineInput = buildTransferEngineInput(
      parsed as never,
      new Date("2024-06-01"),
      new Date("2014-06-01"),
      undefined,
    );
    expect("commercialAppurtenantLand" in engineInput).toBe(false);
  });
});
