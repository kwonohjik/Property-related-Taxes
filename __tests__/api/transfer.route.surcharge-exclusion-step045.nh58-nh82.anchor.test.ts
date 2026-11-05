/**
 * route anchor — 조특법 §99·§99의3 리뷰 레인 L3: NH-58 · NH-82 (STEP 0.45 감면주택 다주택 중과 배제 선판정).
 *
 * - NH-58 — 조세특례제한법 §129②(미등기양도자산에는 양도소득세 감면 규정 미적용)면 그 주택은 소득세법 시행령 §167의3①5호
 *   「…에 따라 양도소득세가 감면되는 주택」이 아니다. STEP 4.6 차감(`transfer-tax-income-steps.ts`)은 이미 막는데 STEP 0.45만
 *   중과 배제를 걸었다. 세액은 그대로다(미등기 70%가 중과세율보다 이긴다 — 아래 대조) — 중과 판정 결과와 단계 표시가 달라진다.
 * - NH-82 — 산입되는 조합원입주권·분양권이 있는 세대(소득세법 §104⑦2호·4호)의 근거는 소득세법 시행령 §167의11①2호(각 1개)·
 *   §167의4③2호(합 3 이상)다(둘 다 「제167조의3제1항제2호부터 제8호까지 및 제8호의2 중 어느 하나에 해당하는 주택」 — MST 290841).
 *   종전에는 세대 구성과 무관하게 「§167의3①5호·§167의10①2호」였다. 세액 불변.
 *
 * 형제 경로: 단건 route(STEP 0.45) · 겸용 route(NH-09 선판정) · 다주택 중과 판정 메뉴 route(`surcharge-judgment-payload.ts`).
 * 세율: 단건·판정 메뉴는 프로덕션 fallback(양도 2021-09-01) · 겸용은 mock(`makeMockRatesWithHouseEngine`, 정본 세액 아님).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { runSingle } from "../calc/_helpers/single-multi-route-parity";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import { POST as TRANSFER_POST } from "@/app/api/calc/transfer/route";
import { POST as JUDGMENT_POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return {
    ...actual,
    checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
    getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
    shouldBypassRateLimit: vi.fn().mockReturnValue(true),
  };
});

const TD = "2021-09-01";
const HOUSE_BASIS = "소령 §167의3①5호·§167의10①2호";
const STEP = "감면주택 다주택 중과 배제";

const red993 = () => ({
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder", firstContract993: "yes" as const,
  standardPriceAtAcquisition993: "100,000,000",
  standardPriceAt5Years: "200,000,000",
  standardPriceAtTransfer993: "400,000,000",
  exclusiveAreaSqm993: "84",
  region993: "outside_speculation",
});
/** 강남 주택 · §99의3 1호(계약 2002-12-01 — 법률 제6762호 부칙 §29① 종전 규정 · 84㎡라 고급주택 아님) */
function form(p: { unreg?: boolean; price?: string; otherHouses: number; rights?: number; withRed?: boolean }): TransferFormData {
  const base = createDefaultTransferFormData() as unknown as Record<string, unknown>;
  const asset = {
    ...makeDefaultAsset(1), assetKind: "housing", addressJibun: "서울특별시 강남구 역삼동 1-1", regionCode: "1168010100",
    acquisitionCause: "purchase", acquisitionDate: "2003-06-01", assetContractDate: "2002-12-01",
    actualSalePrice: p.price ?? "10,000,000,000", fixedAcquisitionPrice: "300,000,000", standardPriceAtTransfer: "400,000,000",
    reductions: p.withRed === false ? [] : [red993()], residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  };
  const houses = Array.from({ length: p.otherHouses }, (_, i) => ({
    ...createHouseEntry(`h${i + 2}`), region: "capital", regionCode: "1168010100", acquisitionDate: "2010-01-01",
    officialPrice: "500,000,000", acquisitionPrice: "300,000,000", exclusiveArea: "84", isApartment: true,
  }));
  const rights = Array.from({ length: p.rights ?? 0 }, (_, i) => ({
    id: `r${i}`, type: "redevelopment_right", acquisitionDate: "2019-01-01", region: "capital", regionCriteria: "REGION", rightValue: "500000000",
  }));
  return {
    ...base, transferDate: TD, contractTotalPrice: p.price ?? "10,000,000,000", assets: [asset], houses,
    presaleRights: rights, householdNoPresaleRightsConfirmed: (p.rights ?? 0) === 0, isOneHousehold: true,
    householdHousingCount: String(p.otherHouses + 1), isRegulatedArea: true, wasRegulatedAtAcquisition: false, isUnregistered: p.unreg ?? false,
  } as unknown as TransferFormData;
}
type Steps = Array<{ label: string; legalBasis?: string }>;
async function single(f: TransferFormData) {
  const x = await runSingle(f);
  expect(x.status, JSON.stringify(x.json).slice(0, 300)).toBe(200);
  const r = x.r as Record<string, unknown>;
  const mh = r.multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; exclusionReasons: { type: string }[] };
  return {
    tax: x.totalTax,
    surcharge: mh.surchargeApplicable,
    reasons: mh.exclusionReasons.map((e) => e.type),
    step: ((r.steps ?? []) as Steps).filter((s) => s.label === STEP).map((s) => s.legalBasis),
    body: x.body,
  };
}

describe("NH-58 단건 — 미등기면 STEP 0.45가 중과를 배제하지 않는다 (조특법 §129②)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>);
  });
  it.each([1, 2])("다른 주택 %i채 · 미등기 · §99의3 선택 → 중과 판정 유지 · 배제 단계 없음 · 세액은 감면 미선택 대조와 같다(7,469,000,000)", async (n) => {
    const sel = await single(form({ unreg: true, otherHouses: n }));
    const ctl = await single(form({ unreg: true, otherHouses: n, withRed: false }));
    expect(sel.surcharge).toBe(true);
    expect(sel.reasons).not.toContain("tax_special_exemption");
    expect(sel.step).toEqual([]);
    expect(sel.tax).toBe(7_469_000_000);
    expect(sel.tax).toBe(ctl.tax);
  });
  it("짝 — 등기 자산은 종전대로 배제(2,371,222,500 · 단계 근거 「§167의3①5호·§167의10①2호」)", async () => {
    const r = await single(form({ otherHouses: 1 }));
    expect(r.surcharge).toBe(false);
    expect(r.reasons).toEqual(["tax_special_exemption"]);
    expect(r.step).toEqual([HOUSE_BASIS]);
    expect(r.tax).toBe(2_371_222_500);
  });
});

describe("NH-58 판정 메뉴 route — 단건과 같은 게이트", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>);
  });
  async function judge(f: TransferFormData) {
    const { body } = await single(f);
    const res = await JUDGMENT_POST(new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
      method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify({ property: body }),
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = (await res.json()) as any;
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    return json.data.headline.result as { surchargeApplicable: boolean; exclusionReasons: { type: string }[] };
  }
  it("미등기 · §99의3 → 중과 유지(단건과 같다) · 짝: 등기 → 배제", async () => {
    const unreg = await judge(form({ unreg: true, otherHouses: 1 }));
    expect(unreg.surchargeApplicable).toBe(true);
    expect(unreg.exclusionReasons.map((e) => e.type)).not.toContain("tax_special_exemption");
    const reg = await judge(form({ otherHouses: 1 }));
    expect(reg.surchargeApplicable).toBe(false);
    expect(reg.exclusionReasons.map((e) => e.type)).toEqual(["tax_special_exemption"]);
  });
});

describe("NH-82 단건 — 산입 조합원입주권이 있는 세대의 STEP 0.45 근거", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>);
  });
  it.each([
    ["주택 1 + 입주권 1(§104⑦2호)", 0],
    ["주택 2 + 입주권 1(§104⑦4호)", 1],
  ])("%s → 근거 「소득세법 시행령 §167의4③2호·§167의11①2호」 · 세액 불변(84,204,998)", async (_l, n) => {
    const r = await single(form({ price: "800,000,000", otherHouses: n, rights: 1 }));
    expect(r.step).toEqual([MULTI_HOUSE.TAX_INCENTIVE_HOUSE_RIGHT_REFERENCE_BASIS]);
    expect(MULTI_HOUSE.TAX_INCENTIVE_HOUSE_RIGHT_REFERENCE_BASIS).toBe("소득세법 시행령 §167의4③2호·§167의11①2호");
    expect(r.tax).toBe(84_204_998);
  });
  it("짝 — 입주권이 지방 3억 이하(§167의4②1호·§167의11②1호 불산입)면 주택만의 세대 근거", async () => {
    const f = form({ price: "800,000,000", otherHouses: 1, rights: 1 });
    (f as unknown as { presaleRights: Record<string, unknown>[] }).presaleRights[0] = {
      ...(f as unknown as { presaleRights: Record<string, unknown>[] }).presaleRights[0], region: "non_capital", regionCriteria: "VALUE", rightValue: "200000000",
    };
    const r = await single(f);
    expect(r.step).toEqual([HOUSE_BASIS]);
  });
});

/* ── 겸용 route (NH-09 선판정과 같은 leaf) ───────────────────────────────── */
const mixedHouse = (id: string, acq: string, over: Record<string, unknown> = {}) => ({
  id, region: "capital" as const, acquisitionDate: acq, officialPrice: 800_000_000, isInherited: false, isLongTermRental: false, ...over,
});
const r993Engine = {
  type: "new_99_3", contractDate993: "2002-03-01", acquisitionType993: "from_builder", firstContract993: "yes" as const, region993: "outside_speculation",
  standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000, standardPriceAtTransfer993: 400_000_000,
  exclusiveAreaSqm993: 84, isResident993: true, isHousingConstructionBusiness993: false, hasOccupancyAtContract: false,
  isRecontractExcluded993: false, recontractUnavoidableCause993: false, isRedevelopedNewHouse993: false,
};
const ACQ = "2003-09-01";
type Mixed = {
  total: { totalPayable: number };
  steps: { id: string; legalBasis?: string }[];
  multiHouseSurcharge?: { surchargeType: string; exclusionReasons: { type: string }[] };
};
async function mixed(over: Record<string, unknown>): Promise<Mixed> {
  const body = {
    transferPrice: 1_100_000_000, acquisitionPrice: 300_000_000, acquisitionDate: ACQ, transferDate: "2026-06-01",
    expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 3, isRegulatedArea: true,
    wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true,
    annualBasicDeductionUsed: 0, residencePeriodMonths: 0, sellingHouseId: "selling",
    propertyType: "mixed-use-house",
    mixedUse: {
      isMixedUseHouse: true, residentialFloorArea: 100, nonResidentialFloorArea: 100, buildingFootprintArea: 100, totalLandArea: 200,
      landAcquisitionDate: ACQ, buildingAcquisitionDate: ACQ,
      transferStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
      acquisitionStandardPrice: { housingPrice: 100_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 500_000 },
      residencePeriodYears: 0, zoneType: "general_residential", isOneHouseExempt: false,
    },
    houses: [mixedHouse("selling", ACQ), mixedHouse("h2", "2015-03-01"), mixedHouse("h3", "2015-03-01")],
    reductions: [r993Engine],
    ...over,
  };
  const res = await TRANSFER_POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(withIdentityStdInBody(body)),
  }));
  const json = (await res.json()) as { data: { result: Mixed } };
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result;
}
const exclusionStep = (m: Mixed) => m.steps.filter((s) => s.id === "surcharge-exclusion-by-reduction").map((s) => s.legalBasis);

describe("겸용 route — NH-58 · NH-82", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
  });
  it("NH-58 미등기 · §99의3 → 배제 단계 없음 · 감면 미선택 대조와 같은 판정·세액", async () => {
    const sel = await mixed({ isUnregistered: true });
    const ctl = await mixed({ isUnregistered: true, reductions: [] });
    expect(exclusionStep(sel)).toEqual([]);
    expect(sel.multiHouseSurcharge?.surchargeType).toBe(ctl.multiHouseSurcharge?.surchargeType);
    expect(sel.multiHouseSurcharge?.exclusionReasons.map((e) => e.type)).not.toContain("tax_special_exemption");
    expect(sel.total.totalPayable).toBe(ctl.total.totalPayable);
  });
  it("짝 — 등기 3주택은 종전대로 배제 · 근거 「§167의3①5호·§167의10①2호」", async () => {
    expect(exclusionStep(await mixed({}))).toEqual([HOUSE_BASIS]);
  });
  it("NH-82 주택 2 + 입주권 1 → 근거 「소득세법 시행령 §167의4③2호·§167의11①2호」", async () => {
    const m = await mixed({
      householdHousingCount: 2,
      houses: [mixedHouse("selling", ACQ), mixedHouse("h2", "2015-03-01")],
      presaleRights: [{ id: "r0", type: "redevelopment_right", acquisitionDate: "2019-01-01", region: "capital", regionCriteria: "REGION", rightValue: 500_000_000 }],
    });
    expect(exclusionStep(m)).toEqual([MULTI_HOUSE.TAX_INCENTIVE_HOUSE_RIGHT_REFERENCE_BASIS]);
  });
});
