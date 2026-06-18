/**
 * resolvePropertyTaxJurisdiction — 재산세 합산 단위(과세권자) 정규화 anchor.
 * Plan: docs/00-pm/comprehensive-land-jurisdiction-aggregation.plan.md §4-A·6
 */
import { describe, it, expect } from "vitest";
import { resolvePropertyTaxJurisdiction } from "../../../lib/geo/property-tax-jurisdiction";

describe("resolvePropertyTaxJurisdiction", () => {
  it("일반구(시+구) → 시 단위 축약", () => {
    expect(resolvePropertyTaxJurisdiction("용인시 기흥구")).toBe("용인시");
    expect(resolvePropertyTaxJurisdiction("용인시 수지구")).toBe("용인시");
    expect(resolvePropertyTaxJurisdiction("성남시 분당구")).toBe("성남시");
    expect(resolvePropertyTaxJurisdiction("수원시 영통구")).toBe("수원시");
    expect(resolvePropertyTaxJurisdiction("경기도 용인시 기흥구")).toBe("경기도 용인시");
  });

  it("자치구(단일 구) → 그대로", () => {
    expect(resolvePropertyTaxJurisdiction("송파구")).toBe("송파구");
    expect(resolvePropertyTaxJurisdiction("강남구")).toBe("강남구");
  });

  it("특별시/광역시 + 구(수동) → 가드로 미축약", () => {
    expect(resolvePropertyTaxJurisdiction("서울특별시 송파구")).toBe("서울특별시 송파구");
    expect(resolvePropertyTaxJurisdiction("부산광역시 해운대구")).toBe("부산광역시 해운대구");
  });

  it("시/군 단독 → 그대로", () => {
    expect(resolvePropertyTaxJurisdiction("평창군")).toBe("평창군");
    expect(resolvePropertyTaxJurisdiction("경기 용인시")).toBe("경기 용인시");
    expect(resolvePropertyTaxJurisdiction("용인시")).toBe("용인시");
  });

  it("빈/공백", () => {
    expect(resolvePropertyTaxJurisdiction("")).toBe("");
    expect(resolvePropertyTaxJurisdiction("  용인시 기흥구  ")).toBe("용인시");
  });
});
