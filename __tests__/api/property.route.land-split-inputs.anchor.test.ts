/**
 * PSA-E4 — 같은 관할구역 합산 입력(`otherSeparateAggregateValue`·`otherComprehensiveValue`)의 입구: ⑫ Zod · ④ 변환 · ⑧ validate.
 * - 침묵 strip 가드: 새 키가 Zod 객체에 선언돼 엔진에 도달하는가(빠지면 합산이 사라져 이 필지 단독 세액이 된다).
 * - 요구 술어 하나(`propertyLandSplitRequiredFor`)가 ⑧·⑫를 정한다 — 격자 전수 대조(UI 통과 ↔ 400 막다른 길 금지).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("offline")) };
});

import { POST } from "@/app/api/calc/property/route";
import { PROPERTY_LAND_SPLIT_INPUT_MESSAGE } from "@/lib/tax-engine/property-land-split-tax";
import {
  INITIAL_FORM,
  buildPropertyTaxRequestBody,
  validateStep,
  type FormState,
} from "@/components/calc/property/shared";

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

const S4_ITEM = {
  id: "p1",
  jurisdictionCode: "000000",
  landArea: 1000,
  officialLandPrice: 1_000_000,
  zoningDistrict: "industrial",
  buildingFloorArea: 100,
};
const S4 = { objectType: "land", landTaxType: "separate_aggregate", publishedPrice: 1_000_000_000, targetDate: "2026-06-01", separateAggregateItem: S4_ITEM };
const detailsOf = (json: { error?: { details?: Record<string, string[]> } }) => json.error?.details ?? {};

describe("⑫ — 새 키 선언(침묵 strip 가드)과 요구 술어", () => {
  it("S-5 타 종합합산 2억 → 이 필지 몫 1,912,500 반영(총액 3,063,000) — 키가 strip되면 합산이 사라져 2,988,000", async () => {
    const r = await post({ ...S4, otherSeparateAggregateValue: 0, otherComprehensiveValue: 200_000_000 });
    expect(r.status).toBe(200);
    expect(r.json.data.determinedTax).toBe(2_552_500);
    expect(r.json.data.totalPayable).toBe(3_063_000);
    expect(r.json.data.landSplit.comprehensive.share).toBe(1_912_500);
  });

  it("S-6 타 별도합산 1억 → 총액 3,036,000", async () => {
    const r = await post({ ...S4, otherSeparateAggregateValue: 100_000_000, otherComprehensiveValue: 0 });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(3_036_000);
  });

  it("K-39 이관분이 있는데 타 종합합산 빈칸 → 400(자동 0 금지) · 문구는 엔진 상수", async () => {
    const r = await post({ ...S4, otherSeparateAggregateValue: 0 });
    expect(r.status).toBe(400);
    expect(detailsOf(r.json).otherComprehensiveValue).toEqual([PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherComprehensiveValue]);
    expect(detailsOf(r.json).otherSeparateAggregateValue).toBeUndefined();
  });

  it("별도합산분이 있는데 타 별도합산 빈칸 → 400", async () => {
    const r = await post({ ...S4, otherComprehensiveValue: 0 });
    expect(r.status).toBe(400);
    expect(detailsOf(r.json).otherSeparateAggregateValue).toEqual([PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherSeparateAggregateValue]);
  });

  it("K-40 전량 별도합산(이관 0) — 타 종합합산 비요구·무시(stale 값 있어도 200 · 별도합산분만)", async () => {
    const item = { ...S4_ITEM, landArea: 300, zoningDistrict: "commercial" };
    const clean = await post({ ...S4, publishedPrice: 300_000_000, separateAggregateItem: item, otherSeparateAggregateValue: 0 });
    const stale = await post({ ...S4, publishedPrice: 300_000_000, separateAggregateItem: item, otherSeparateAggregateValue: 0, otherComprehensiveValue: 777_000_000 });
    expect(clean.status).toBe(200);
    expect(stale.status).toBe(200);
    expect(clean.json.data.totalPayable).toBe(516_000);
    expect(stale.json.data.totalPayable).toBe(516_000);
  });

  it("K-41 전량 이관(철거 1년 초과) — 타 별도합산 비요구", async () => {
    const item = { ...S4_ITEM, landArea: 300, zoningDistrict: "commercial", demolished: true, demolishedDate: "2025-05-31" };
    const r = await post({ ...S4, publishedPrice: 300_000_000, separateAggregateItem: item, otherComprehensiveValue: 0 });
    expect(r.status).toBe(200);
    expect(r.json.data.totalPayable).toBe(960_000);
  });

  it("K-42·C13·C14 직접 종합합산 — 타 종합합산 항상 요구(빈칸 400) · 0 = 960,000 · 1억 = 1,035,000", async () => {
    const base = { objectType: "land", landTaxType: "comprehensive_aggregate", publishedPrice: 300_000_000, targetDate: "2026-06-01" };
    expect((await post(base)).status).toBe(400);
    const zero = await post({ ...base, otherComprehensiveValue: 0 });
    expect(zero.json.data.totalPayable).toBe(960_000);
    const merged = await post({ ...base, otherComprehensiveValue: 100_000_000 });
    expect(merged.json.data.totalPayable).toBe(1_035_000);
  });

  it("K-43 음수·소수 → 400", async () => {
    const base = { ...S4, otherSeparateAggregateValue: 0 };
    expect((await post({ ...base, otherComprehensiveValue: -1 })).status).toBe(400);
    expect((await post({ ...base, otherComprehensiveValue: 1.5 })).status).toBe(400);
    expect((await post({ ...base, otherComprehensiveValue: "0" })).status).toBe(400);
  });

  it("분리과세·주택 — 합산 칸 비요구(보내도 무해)", async () => {
    const sep = await post({ objectType: "land", landTaxType: "separated", publishedPrice: 100_000_000, targetDate: "2026-06-01", separateTaxationItem: { isFarmland: true } });
    expect(sep.status).toBe(200);
    const house = await post({ objectType: "housing", publishedPrice: 300_000_000, targetDate: "2026-06-01", otherComprehensiveValue: 5 });
    expect(house.status).toBe(200);
  });
});

describe("④ 변환 — 요구된 칸만 싣는다", () => {
  const form = (over: Partial<FormState>): FormState => ({
    ...INITIAL_FORM,
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: "300,000,000",
    saZoningDistrict: "commercial",
    saLandArea: "300",
    saBuildingFloorArea: "100",
    ...over,
  });

  it("전량 별도합산 폼 — 별도합산 칸만 body에, 비요구 종합합산 칸의 stale 값은 보내지 않는다", () => {
    const body = buildPropertyTaxRequestBody(form({ otherSeparateAggregateValue: "1,000", otherComprehensiveValue: "9,999" }));
    expect(body.otherSeparateAggregateValue).toBe(1000);
    expect("otherComprehensiveValue" in body).toBe(false);
  });

  it("0은 «없음» 입력이라 body에 0으로 실린다 · 빈칸은 싣지 않는다", () => {
    const zero = buildPropertyTaxRequestBody(form({ otherSeparateAggregateValue: "0" }));
    expect(zero.otherSeparateAggregateValue).toBe(0);
    const blank = buildPropertyTaxRequestBody(form({ otherSeparateAggregateValue: "" }));
    expect("otherSeparateAggregateValue" in blank).toBe(false);
  });

  it("주택·분리과세 폼 — 합산 칸 비전송", () => {
    const h = buildPropertyTaxRequestBody({ ...INITIAL_FORM, objectType: "housing", publishedPrice: "300000000", otherSeparateAggregateValue: "5", otherComprehensiveValue: "5" });
    expect("otherSeparateAggregateValue" in h).toBe(false);
    expect("otherComprehensiveValue" in h).toBe(false);
  });
});

describe("⑧↔⑫ parity 격자 — 합산 칸 요구 판정이 같다(UI 통과 ↔ 200 · UI 차단 ↔ 400 + 같은 문구)", () => {
  const year = new Date().getFullYear();
  const SCENARIOS: Array<{ name: string; form: Partial<FormState> }> = [
    { name: "직접 종합합산", form: { landTaxType: "comprehensive_aggregate", publishedPrice: "300,000,000" } },
    { name: "전량 별도합산", form: { saZoningDistrict: "commercial", saLandArea: "300", saBuildingFloorArea: "100", publishedPrice: "300,000,000" } },
    { name: "별도합산 + 면적 초과 이관", form: { saZoningDistrict: "industrial", saLandArea: "1000", saBuildingFloorArea: "100", publishedPrice: "1,000,000,000" } },
    {
      name: "철거 1년 초과 전량 이관",
      form: { saZoningDistrict: "commercial", saLandArea: "300", saBuildingFloorArea: "100", publishedPrice: "300,000,000", saDemolished: true, saDemolishedDate: `${year - 2}-01-01` },
    },
    {
      name: "철거 유예 안(별도합산 유지) + 면적 초과",
      form: { saZoningDistrict: "commercial", saLandArea: "1000", saBuildingFloorArea: "100", publishedPrice: "1,000,000,000", saDemolished: true, saDemolishedDate: `${year}-03-01` },
    },
  ];
  const VALUES = ["", "0", "5,000,000"];

  for (const sc of SCENARIOS) {
    for (const sep of VALUES) {
      for (const comp of VALUES) {
        it(`${sc.name} · 타 별도합산 [${sep || "빈칸"}] · 타 종합합산 [${comp || "빈칸"}]`, async () => {
          const form: FormState = {
            ...INITIAL_FORM,
            objectType: "land",
            landTaxType: "separate_aggregate",
            ...sc.form,
            otherSeparateAggregateValue: sep,
            otherComprehensiveValue: comp,
          };
          expect(validateStep(2, form), "step 2 선행 통과").toBeNull();
          const issue = validateStep(3, form);
          const r = await post(buildPropertyTaxRequestBody(form));
          if (issue === null) {
            expect(r.status, JSON.stringify(r.json)).toBe(200);
          } else {
            expect(r.status).toBe(400);
            expect(Object.values(detailsOf(r.json)).flat()).toContain(issue);
          }
        });
      }
    }
  }
});
