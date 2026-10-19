/**
 * anchor(route ⑫⑭) — 구주택 멸실·신축 통산(`landRebuildPriorHouse`, 해석 (5)).
 * 엔진 anchor(`appurtenant-land-rebuild-rate-basis.anchor.test.ts`)가 못 보는 Zod(⑫)·Route 매핑(⑭, 단건·다건)·컴패니언 명시 거부를 고정한다.
 * 엔진 anchor와 같은 시드이므로 세액이 같아야 한다(S1 195,309,999 / 입력 없음 362,250,000 — mock 세율 실측).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));

const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 1_000_000_000,
  transferDate: "2025-09-01",
  acquisitionCause: "newConstruction",
  acquisitionDate: "2025-01-01",
  landAcquisitionDate: "2022-01-01",
  acquisitionPrice: 450_000_000,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
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
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 300_000_000,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 300_000_000,
  landAcquisitionPrice: 200_000_000,
  buildingAcquisitionPrice: 250_000_000,
};
const REBUILD = { startMode: "since_land", demolitionDate: "2023-05-31", footprintUnchanged: true };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
const req = (url: string, b: object) =>
  new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
async function single(over: Record<string, unknown>) {
  const res = await POST(req("http://l/api/calc/transfer", { ...BASE, ...over }));
  const body = (await res.json()) as J;
  return { status: res.status, body, r: body?.data?.result as J, text: JSON.stringify(body) };
}
async function multi(over: Record<string, unknown>) {
  const res = await MULTI(
    req("http://l/api/calc/transfer/multi", {
      taxYear: 2025,
      annualBasicDeductionUsed: 0,
      properties: [{ propertyId: "p1", propertyLabel: "p1", reductions: [], ...BASE, ...over }],
    }),
  );
  const body = (await res.json()) as J;
  return { status: res.status, body, text: JSON.stringify(body) };
}

describe("⑫⑭ 단건 — 와이어가 엔진에 도달한다 (침묵 strip 금지)", () => {
  it("RR-1 입력 없음: 362,250,000 (회귀 가드) · echo 없음", async () => {
    const x = await single({});
    expect(x.status, x.text).toBe(200);
    expect(x.r.calculatedTax).toBe(362_250_000);
    expect(x.r.splitDetail.land.rateHoldingAggregation).toBeUndefined();
  });

  it("RR-2 since_land: 195,309,999 · echo 구간 2개 · Date 변환(⑭)이 엔진에서 문자열 비교로 새지 않는다", async () => {
    const x = await single({ landRebuildPriorHouse: REBUILD });
    expect(x.status, x.text).toBe(200);
    expect(x.r.calculatedTax).toBe(195_309_999);
    expect(x.r.splitDetail.land.rateHoldingAggregation).toMatchObject({ totalMonths: 25, equivalentBasisDate: "2023-08-02" });
    expect((x.r.warnings as string[]).some((w) => w.includes("통산한 25개월"))).toBe(true);
  });

  it("RR-3 later: 구주택 취득일이 와이어를 통해 엔진에 간다 (315,249,999)", async () => {
    const x = await single({ landRebuildPriorHouse: { startMode: "later", priorHouseStartDate: "2023-01-01", demolitionDate: "2023-07-31", footprintUnchanged: true } });
    expect(x.status, x.text).toBe(200);
    expect(x.r.calculatedTax).toBe(315_249_999);
    expect(x.r.splitDetail.land.rateHoldingAggregation.startRule).toBe("input_date");
  });
});

describe("⑫ 거부 — 엔진 진입·⑧과 같은 leaf 문구", () => {
  it("RR-4 정착면적 확인 false / later인데 날짜 없음 / since_land인데 날짜 있음 / 날짜 순서", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...REBUILD, footprintUnchanged: false }, "정착면적이 구주택보다 늘어난"],
      [{ ...REBUILD, startMode: "later" }, "구주택 취득일(본인 소유 개시일)이 필요"],
      [{ ...REBUILD, priorHouseStartDate: "2022-06-01" }, "함께 보낼 수 없습니다"],
      [{ ...REBUILD, demolitionDate: "2025-01-01" }, "날짜 순서"],
      [{ ...REBUILD, demolitionDate: "2021-12-31" }, "날짜 순서"],
    ];
    for (const [rebuild, needle] of cases) {
      const x = await single({ landRebuildPriorHouse: rebuild });
      expect(x.status, needle).toBe(400);
      expect(x.text).toContain(needle);
    }
  });

  it("RR-5 호스트: 건물 신축이 아님 / 토지 취득일 없음 / 비주택 / 겸용 → 400", async () => {
    expect((await single({ acquisitionCause: "purchase", landRebuildPriorHouse: REBUILD })).text).toContain("신축(자가건축)");
    expect((await single({ landAcquisitionDate: undefined, isSeparateAcquisition: undefined, landRebuildPriorHouse: REBUILD })).status).toBe(400);
    const nonHousing = await single({ propertyType: "building", landRebuildPriorHouse: REBUILD });
    expect(nonHousing.status).toBe(400);
    expect(nonHousing.text).toContain("주택(토지·건물 취득일이 다른 분리 계산)");
  });

  it("RR-6 컴패니언 자리는 키를 받아서 명시 거부 — strip 후 통산 없이 200으로 계산하지 않는다", async () => {
    const res = await POST(
      req("http://l/api/calc/transfer", {
        propertyType: "land",
        transferDate: "2025-09-01",
        transferPrice: 600_000_000,
        acquisitionDate: "2010-01-01",
        acquisitionPrice: 200_000_000,
        expenses: 0,
        useEstimatedAcquisition: false,
        householdHousingCount: 0,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        isOneHousehold: false,
        reductions: [],
        annualBasicDeductionUsed: 0,
        residencePeriodMonths: 0,
        standardPriceAtTransferForApportion: 400_000_000,
        totalSalePrice: 1_000_000_000,
        companionAssets: [
          {
            assetId: "c1",
            assetLabel: "주택",
            assetKind: "housing",
            standardPriceAtTransferForApportion: 400_000_000,
            standardPriceAtTransfer: 400_000_000,
            directExpenses: 0,
            acquisitionCause: "newConstruction",
            acquisitionDate: "2025-01-01",
            fixedAcquisitionPrice: 150_000_000,
            reductions: [],
            isOneHousehold: false,
            landAcquisitionDate: "2022-01-01",
            landRebuildPriorHouse: REBUILD,
          },
        ],
      }),
    );
    const text = JSON.stringify(await res.json());
    expect(res.status, text).toBe(400);
    expect(text).toContain("companionAssets");
    expect(text).toContain("함께 양도");
  });
});

describe("⑭ 다건 합산 — 옮긴다 (단건과 같은 세액)", () => {
  it("RR-7 다건 1건: 입력 없음과 입력 있음의 결정세액 차이가 단건 산출세액 차이(362,250,000 → 195,309,999)와 같다", async () => {
    const a = await multi({});
    const b = await multi({ landRebuildPriorHouse: REBUILD });
    expect(a.status, a.text).toBe(200);
    expect(b.status, b.text).toBe(200);
    const taxOf = (x: J) => x.body.data.determinedTax ?? x.body.data.result?.determinedTax ?? x.body.data.aggregate?.determinedTax;
    expect(taxOf(a)).toBeDefined();
    expect(taxOf(a) - taxOf(b)).toBe(362_250_000 - 195_309_999);
  });

  it("RR-8 다건에서도 같은 거부 — 정착면적 false → 400", async () => {
    const x = await multi({ landRebuildPriorHouse: { ...REBUILD, footprintUnchanged: false } });
    expect(x.status).toBe(400);
    expect(x.text).toContain("정착면적");
  });
});

describe("⑫ 스키마 자체 — 엔진 안전망 없이도 같은 위치를 짚는다 (⑫≡⑧≡엔진 leaf)", () => {
  it("RR-9 propertySchema: 정착면적 false → path landRebuildPriorHouse.footprintUnchanged · 순서 위반 → demolitionDate", () => {
    const paths = (rebuild: object) =>
      propertySchema.safeParse({ ...BASE, landRebuildPriorHouse: rebuild }).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(paths({ ...REBUILD, footprintUnchanged: false })).toContain("landRebuildPriorHouse.footprintUnchanged");
    expect(paths({ ...REBUILD, demolitionDate: "2025-01-01" })).toContain("landRebuildPriorHouse.demolitionDate");
    expect(paths(REBUILD)).toEqual([]);
  });
});
