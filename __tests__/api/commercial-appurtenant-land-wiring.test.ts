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

const CAL = {
  totalLandArea: 1200,
  totalBuildingFootprintArea: 200,
  zoneType: "commercial",
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
  isUnregistered: false,
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
      isUnregistered: true,
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

describe("W-3 (⑭) — route가 엔진 input에 매핑한다", () => {
  it("buildTransferEngineInput 결과에 commercialAppurtenantLand가 살아 있다", () => {
    const parsed = transferTaxRequestSchema.parse({
      ...baseBody(),
      commercialAppurtenantLand: CAL,
    });
    const engineInput = buildTransferEngineInput(parsed as never);
    expect(engineInput.commercialAppurtenantLand).toEqual(CAL);
  });

  it("미제공 시 엔진 input에도 없다 (spread 조건부 — 빈 객체 주입 금지)", () => {
    const parsed = transferTaxRequestSchema.parse(baseBody());
    const engineInput = buildTransferEngineInput(parsed as never);
    expect("commercialAppurtenantLand" in engineInput).toBe(false);
  });
});
