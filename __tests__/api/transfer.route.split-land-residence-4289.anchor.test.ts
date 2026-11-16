/**
 * Pre-Do anchor — 분리취득 부수토지 · 건물 증여 전 동일세대 거주의 표2 거주기간 공제율 (서면-2025-법규재산-4289)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §2·§7 (시료 S1)
 * S1: 토지 2000-06-01 매수(취득가액 1억) · 건물 2012-10-01 같은 세대 배우자 증여(취득가액 5천만) · 증여 전 함께 거주 132개월 ·
 *     증여 후 본인 거주 0 · 2025-01-15 양도 20억(토지 14억·건물 6억) · 1세대 1주택 · 비조정.
 * 손계산(`makeMockRates()` = 2024 누진표): 양도차익 토지 13억·건물 5.5억 → 12억 초과분 안분(×8/20) → 과세 양도차익 토지 5.2억·건물 2.2억.
 *   현행(토지 표1 30% · 건물 표1 24%): 공제 156,000,000 + 52,800,000 → 과세표준 528,700,000 → 산출세액 528,700,000×42% − 35,940,000 = 186,114,000
 *   4289 적용(토지 표2 80% · 건물 표2 40%): 공제 416,000,000 + 88,000,000 → 과세표준 233,500,000 → 233,500,000×38% − 19,940,000 = 68,790,000
 *     토지 80% = 보유 24년분 40% 상한 + 거주 11년분 40% — 거주 개월 = 본인 0 + 증여 전 동일세대 132 → 11년.
 *     건물 40% = 보유 12년 → 표2 보유분 40% 상한 + 거주 0년(증여일부터 본인 기간 — 사전-2025-법규재산-1126·0506 질의2).
 *
 * 이 파일은 화면 경로의 서버 쪽 전부(Zod ⑫ → route ⑭ → 엔진)를 잠근다. 엔진·leaf 직접은 `__tests__/tax-engine/transfer/split-land-residence-4289.engine.test.ts`.
 * Pre-Do(구현 전) 실패 메시지: `expected 0.3 to be close to 0.8`(⑫가 새 키를 조용히 strip → 표1 186,114,000).
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
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import {
  LAND_PART_RESIDENCE_GATE_MESSAGE,
  LAND_PART_RESIDENCE_COMPANION_MESSAGE,
  LAND_PART_RESIDENCE_RENTAL_20_MESSAGE,
  LAND_PART_RESIDENCE_STRAY_MESSAGE,
  LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE,
  landPartResidenceMonthsExceedsMessage,
} from "@/lib/tax-engine/transfer-split-land-residence";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

/** S1 — D2 증여 호스트(건물 증여 + 토지 매수) 1세대 1주택. */
const S1 = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 2_000_000_000,
  transferDate: "2025-01-15",
  acquisitionDate: "2012-10-01",
  acquisitionCause: "gift",
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2000-06-01",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: true,
  householdHousingCount: 1,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 1_400_000_000,
  buildingTransferPrice: 600_000_000,
  landStandardPriceAtTransfer: 1_400_000_000,
  buildingStandardPriceAtTransfer: 600_000_000,
  landAcquisitionPrice: 100_000_000,
  buildingAcquisitionPrice: 50_000_000,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function post(over: Record<string, unknown>): Promise<{ status: number; body: any; r: any }> {
  const merged: Record<string, unknown> = { ...S1, ...over };
  for (const k of Object.keys(merged)) if (merged[k] === "__DEL__") delete merged[k];
  const res = await POST(req(merged));
  const body = await res.json();
  return { status: res.status, body, r: body?.data?.result };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("4289 Pre-Do — S1 화면 경로(route)", () => {
  it("현행(토글 없음): 표1 — 토지 30% · 건물 24% · 산출세액 186,114,000", async () => {
    const { status, r } = await post({});
    expect(status).toBe(200);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.3, 10);
    expect(r.splitDetail.building.longTermRate).toBeCloseTo(0.24, 10);
    expect(r.calculatedTax).toBe(186_114_000);
  });

  it("4289 적용(토글 ON · 132개월): 토지 80% · 건물 40% · 산출세액 68,790,000", async () => {
    const { status, r } = await post({ landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: 132 });
    expect(status).toBe(200);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.8, 10);
    expect(r.splitDetail.building.longTermRate).toBeCloseTo(0.4, 10);
    expect(r.calculatedTax).toBe(68_790_000);
  });
});

const ON = (months?: number) => ({ landPartDonorSameHousehold: true, ...(months === undefined ? {} : { landPartPriorHouseholdResidenceMonths: months }) });

describe("4289 — 화면 경로 결과(⑭ 매핑 · 파트 echo · 산식 문구 · 고지)", () => {
  it("ON 132개월: 파트별 거주 연수 echo 토지 11 · 건물 0 · 산출세액 68,790,000 · 장특 504,000,000 · 고지 1건", async () => {
    const { status, r } = await post(ON(132));
    expect(status).toBe(200);
    expect(r.splitDetail.land.residenceYears).toBe(11);
    expect(r.splitDetail.building.residenceYears).toBe(0);
    expect(r.splitDetail.land.residenceDeductionRate).toBe(0.4);
    expect(r.longTermHoldingDeduction).toBe(504_000_000);
    expect((r.warnings as string[]).filter((w) => w.includes("서면-2025-법규재산-4289"))).toHaveLength(1);
  });

  it("산식 문구(982-step 대상 판정 경유): 토지 「거주 11년×4% = 40%」 · 건물 「거주 0년(2년 미만 …)」 — 표2 형식 · 표1 형식으로 떨어지지 않는다", async () => {
    const { r } = await post(ON(132));
    const text = (r.steps as { label: string; formula: string }[]).filter((s) => /장기보유|거주 기간분/.test(s.label)).map((s) => s.formula).join(" | ");
    expect(text).toContain("거주 11년×4% = 40%");
    expect(text).toContain("거주 0년(2년 미만 — 거주기간 공제 없음)");
    expect(text).not.toContain("30% 한도");
  });

  it("OFF 짝: 4289 고지·거주 연수 없음(0/0)", async () => {
    const { r } = await post({});
    expect(r.splitDetail.land.residenceYears).toBe(0);
    expect((r.warnings ?? []).filter((w: string) => w.includes("서면-2025-법규재산-4289"))).toHaveLength(0);
  });

  it("다건(연간 합산) parity — 같은 입력의 건별 산출세액·장특·파트 공제율이 단건과 같다(⑭ 다건 매핑)", async () => {
    const single = await post(ON(132));
    const multiBody = (over: Record<string, unknown>) => ({
      taxYear: 2025,
      properties: [{
        propertyId: "p1", propertyLabel: "p1", ...S1, transferCause: "general", acquisitionMethod: "actual", householdRightCount: 0,
        reductions: [], specialHouseExclusions: [], householdNoPresaleRightsConfirmed: false, ...over,
      }],
      annualBasicDeductionUsed: 0, basicDeductionAllocation: "EARLIEST_TRANSFER", priorPaidTax: 0, priorPaidLocalTax: 0, priorReductionUsage: [],
    });
    const postMulti = async (over: Record<string, unknown>) => {
      const res = await MULTI(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(multiBody(over)) }));
      return { status: res.status, body: await res.json() };
    };
    const on = await postMulti(ON(132));
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    const p = on.body.data.properties[0];
    expect(p.refCalculatedTax).toBe(single.r.calculatedTax);
    expect(p.longTermHoldingDeduction).toBe(single.r.longTermHoldingDeduction);
    expect(p.splitDetail.land.longTermRate).toBeCloseTo(0.8, 10);
    expect(p.splitDetail.building.longTermRate).toBeCloseTo(0.4, 10);
    expect(p.splitDetail.land.residenceYears).toBe(11);
    // 긍정 짝 — 키를 빼면 현행 186,114,000
    const off = await postMulti({});
    expect(off.body.data.properties[0].refCalculatedTax).toBe(186_114_000);
    // 다건도 같은 게이트·상한 — 상한 초과·빈칸은 400
    expect((await postMulti(ON(149))).status).toBe(400);
    expect((await postMulti(ON())).status).toBe(400);
  });
});

describe("4289 — 함께 양도(일괄양도)의 첫 자산(주 자산)은 받는다 (Q-6 a — 두 번째 이후 자산만 막는다)", () => {
  it("S1 + 토지 컴패니언: ON이면 주 자산 파트 공제율 토지 80% · 건물 40% · 산출세액 68,790,000 / OFF 30%·24% · 186,114,000", async () => {
    const land = buildAssetPayload(
      {
        ...makeDefaultAsset(2), assetId: "c1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
        fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000",
      } as unknown as AssetForm,
      "actual",
      "2025-01-15",
    ) as Record<string, unknown>;
    const bundled = async (over: Record<string, unknown>) => {
      const res = await POST(req({
        ...S1, ...over, standardPriceAtTransferForApportion: 2_000_000_000, totalSalePrice: 2_300_000_000,
        bundledSaleMode: "actual", primaryActualSalePrice: 2_000_000_000, companionAssets: [land],
      }));
      const body = await res.json();
      return { status: res.status, body, primary: body?.data?.aggregated?.properties?.[0] };
    };
    const on = await bundled(ON(132));
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    expect(on.body.data.mode).toBe("bundled");
    expect(on.primary.splitDetail.land.longTermRate).toBeCloseTo(0.8, 10);
    expect(on.primary.splitDetail.building.longTermRate).toBeCloseTo(0.4, 10);
    expect(on.primary.refCalculatedTax).toBe(68_790_000);
    const off = await bundled({});
    expect(off.primary.splitDetail.land.longTermRate).toBeCloseTo(0.3, 10);
    expect(off.primary.refCalculatedTax).toBe(186_114_000);
  });
});

describe("4289 — ⑫ 차단(엔진·⑧과 같은 leaf) · 막다른 길 없는 정확한 문구", () => {
  const issues = (body: Record<string, unknown>) => {
    const r = propertySchema.safeParse(body);
    return r.success ? [] : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  };
  const mine = (body: Record<string, unknown>) => issues(body).filter((i) => i.path.startsWith("landPart") || i.path.includes(".landPart"));

  it("기준(ON 132 · OFF)은 issue 0", () => {
    expect(issues({ ...S1, ...ON(132) })).toEqual([]);
    expect(issues({ ...S1 })).toEqual([]);
  });

  it("토글 ON + 빈칸 → landPartPriorHouseholdResidenceMonths 400 · 상한 148 통과 · 149 400 · 개월만 있고 토글 없음 400", async () => {
    expect(mine({ ...S1, ...ON() })).toEqual([{ path: "landPartPriorHouseholdResidenceMonths", message: LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE }]);
    expect(mine({ ...S1, ...ON(148) })).toEqual([]);
    expect(mine({ ...S1, ...ON(149) })).toEqual([{ path: "landPartPriorHouseholdResidenceMonths", message: landPartResidenceMonthsExceedsMessage(148, false) }]);
    expect(mine({ ...S1, landPartPriorHouseholdResidenceMonths: 132 })).toEqual([{ path: "landPartPriorHouseholdResidenceMonths", message: LAND_PART_RESIDENCE_STRAY_MESSAGE }]);
    expect((await post(ON(149))).status).toBe(400);
    expect((await post(ON())).status).toBe(400);
  });

  it("증여자 건물 취득일(선택 칸 — 최상위 donorAcquisitionDate)이 토지 취득일보다 늦으면 상한이 줄어든다(2005-03-01 → 91개월)", async () => {
    expect(mine({ ...S1, donorAcquisitionDate: "2005-03-01", ...ON(91) })).toEqual([]);
    expect(mine({ ...S1, donorAcquisitionDate: "2005-03-01", ...ON(92) })).toEqual([{ path: "landPartPriorHouseholdResidenceMonths", message: landPartResidenceMonthsExceedsMessage(91, true) }]);
    expect((await post({ donorAcquisitionDate: "2005-03-01", ...ON(92) })).status).toBe(400);
    expect((await post({ donorAcquisitionDate: "2005-03-01", ...ON(91) })).status).toBe(200);
  });

  it("D2 상속(+ 값)은 400 · 이월과세·부담부증여·소유자 분리·overlay 부재도 400 — 게이트 문구", async () => {
    const inh = { ...S1, acquisitionCause: "inheritance", decedentAcquisitionDate: "1990-01-01", donorAcquisitionDate: undefined, ...ON(132) };
    expect(mine(inh)).toEqual([{ path: "landPartDonorSameHousehold", message: LAND_PART_RESIDENCE_GATE_MESSAGE }]);
    expect((await post({ acquisitionCause: "inheritance", decedentAcquisitionDate: "1990-01-01", ...ON(132) })).status).toBe(400);
    expect(mine({ ...S1, transferType: "burdened_gift", ...ON(132) }).map((i) => i.message)).toContain(LAND_PART_RESIDENCE_GATE_MESSAGE);
    expect(mine({ ...S1, selfOwns: "land_only", ...ON(132) }).map((i) => i.message)).toContain(LAND_PART_RESIDENCE_GATE_MESSAGE);
    expect(mine({ ...S1, landAcquisitionCause: undefined, ...ON(132) }).map((i) => i.message)).toContain(LAND_PART_RESIDENCE_GATE_MESSAGE);
    expect(mine({ ...S1, acquisitionCause: "purchase", ...ON(132) }).map((i) => i.message)).toContain(LAND_PART_RESIDENCE_GATE_MESSAGE);
  });

  it("§155⑳ 거주주택 특례 선언 → 400(Q-7 b) · 선언하지 않으면(applyException false) 통과", () => {
    const rh = (applyException: boolean) => ({ rentalHousingException: { applyException, scenario: "B", rentalUnits: [] } });
    expect(mine({ ...S1, ...ON(132), ...rh(true) }).map((i) => i.message)).toContain(LAND_PART_RESIDENCE_RENTAL_20_MESSAGE);
    expect(mine({ ...S1, ...ON(132), ...rh(false) })).toEqual([]);
  });

  it("컴패니언(함께 양도 두 번째 이후)은 키를 받아서 400 — strip하면 조용히 버려진다 · 키를 빼면 이 규칙 issue 0", () => {
    const c = buildAssetPayload(
      {
        ...makeDefaultAsset(2), assetId: "c1", assetKind: "housing", acquisitionCause: "gift", acquisitionDate: "2012-10-01",
        donorAcquisitionDate: "1999-01-01", landCauseHost: "gift", landAcquisitionCause: "purchase", landAcquisitionDate: "2000-06-01",
        hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "100000000",
        buildingAcquisitionPrice: "50000000", standardPriceAtTransfer: "2000000000", landStandardPriceAtTransfer: "1400000000",
        buildingStandardPriceAtTransfer: "600000000",
      } as unknown as AssetForm,
      "apportioned",
      "2025-01-15",
    ) as Record<string, unknown>;
    const body = (companion: Record<string, unknown>) => ({
      propertyType: "land", transferDate: "2025-01-15", transferPrice: 300_000_000, acquisitionDate: "2015-01-01", acquisitionPrice: 100_000_000,
      expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
      isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, reductions: [], annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
      standardPriceAtTransferForApportion: 400_000_000, totalSalePrice: 2_300_000_000, companionAssets: [companion],
    });
    expect(c.landPartDonorSameHousehold).toBeUndefined(); // ④ 컴패니언 payload는 새 키를 싣지 않는다(⑭ 미매핑)
    expect(mine(body(c))).toEqual([]);
    const withKey = mine(body({ ...c, ...ON(24) }));
    expect(withKey.map((i) => i.path)).toContain("companionAssets.0.landPartDonorSameHousehold");
    expect(withKey[0].message).toBe(LAND_PART_RESIDENCE_COMPANION_MESSAGE);
  });
});
