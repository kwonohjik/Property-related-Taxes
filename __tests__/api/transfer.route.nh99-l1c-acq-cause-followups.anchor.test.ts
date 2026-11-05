/**
 * route anchor — 조특법 §99·§99의3 리뷰 L1 3차 (#2935 후속: NH-03 · NH-17 · NH-40 · NH-02).
 *
 * 1. STEP 0.45 감면주택 중과 배제 선판정(단건 · 겸용 · 다주택 중과 판정 메뉴)이 STEP 4.6 차감과 같은 취득 원인 게이트를 본다.
 *    상속·증여(지분 포함)로 받은 주택은 조세특례제한법 §99①·§99의3①의 «감면되는 주택»이 아니므로 소득세법 시행령
 *    §167의3①5호·§167의10①2호 중과 배제도 없다(사용자 결정 리뷰 Q-3 지분별 — 대법원 2010두6847 · 기준-2024-0151).
 * 3. 최초 계약 여부 빈 값(직접 API·옛 이력) = 불성립 + 확인 필요(사용자 결정). ⑫는 통과시키고 엔진이 확인 필요 고지로 판정한다.
 * 4. 소득세법 시행령 §156 1호나목 «1주택에 딸린 토지의 면적» 495㎡는 딸린 토지 전체 면적이다(사용자 결정) — §99① 「연면적 2배 이내」로 자르지 않는다.
 *
 * 세율: 단건·판정 메뉴는 프로덕션 fallback(양도 2021-09-01) · 겸용은 mock(`makeMockRatesWithHouseEngine`, 정본 세액 아님).
 * 수정 전 세액은 it 이름에 적었다(같은 시료를 수정 전 코드에서 실측).
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
import { allIssues } from "../calc/_one-house-pr3a-calc-route";

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
const fallback = () =>
  vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>);

type Cause = "purchase" | "inheritance" | "gift";
/** §99의3 1호(계약 2002-12-01 — 법률 제6762호 부칙 §29① 종전 규정 · 84㎡) */
const fromBuilder = (firstContract: "" | "yes" = "yes") => ({
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder", contractDate993: "2002-12-01", houseType993: "apartment", firstContract993: firstContract,
  standardPriceAtAcquisition993: "100,000,000", standardPriceAt5Years: "200,000,000", standardPriceAtTransfer993: "400,000,000",
  exclusiveAreaSqm993: "84", region993: "outside_speculation",
});
/** §99의3 2호 자기건설(사용승인 2002-08-02) */
const selfBuilt = () => ({
  ...fromBuilder(""), acquisitionType993: "self_built", contractDate993: "", usageApprovalDate993: "2002-08-02",
});

/** 강남 주택 · 다른 주택 1채 · 조정대상지역 · 양도 2021-09-01 — NH-58 시료(`transfer.route.surcharge-exclusion-step045.nh58-nh82`)에 취득 원인만 바꾼다. */
function form(p: { cause: Cause; red?: Record<string, unknown> | null }): TransferFormData {
  const base = createDefaultTransferFormData() as unknown as Record<string, unknown>;
  const asset = {
    ...makeDefaultAsset(1), assetKind: "housing", addressJibun: "서울특별시 강남구 역삼동 1-1", regionCode: "1168010100",
    acquisitionCause: p.cause, acquisitionDate: "2003-06-01", assetContractDate: "",
    ...(p.cause === "inheritance" ? { decedentAcquisitionDate: "1995-01-01" } : {}),
    actualSalePrice: "10,000,000,000", fixedAcquisitionPrice: "300,000,000", standardPriceAtTransfer: "400,000,000",
    reductions: p.red === null ? [] : [p.red ?? fromBuilder()],
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  };
  const houses = [{
    ...createHouseEntry("h2"), region: "capital", regionCode: "1168010100", acquisitionDate: "2010-01-01",
    officialPrice: "500,000,000", acquisitionPrice: "300,000,000", exclusiveArea: "84", isApartment: true,
  }];
  return {
    ...base, transferDate: TD, contractTotalPrice: "10,000,000,000", assets: [asset], houses,
    presaleRights: [], householdNoPresaleRightsConfirmed: true, isOneHousehold: true,
    householdHousingCount: "2", isRegulatedArea: true, wasRegulatedAtAcquisition: false, isUnregistered: false,
  } as unknown as TransferFormData;
}
type Steps = Array<{ label: string }>;
async function single(f: TransferFormData) {
  const x = await runSingle(f);
  expect(x.status, JSON.stringify(x.json).slice(0, 400)).toBe(200);
  const r = x.r as Record<string, unknown>;
  const mh = r.multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; exclusionReasons: { type: string }[] };
  return {
    tax: x.totalTax,
    surcharge: mh.surchargeApplicable,
    reasons: mh.exclusionReasons.map((e) => e.type),
    step: ((r.steps ?? []) as Steps).filter((s) => s.label === "감면주택 다주택 중과 배제").length,
    codes: ((r.new993Detail as { ineligibleReasons?: { code: string }[] } | undefined)?.ineligibleReasons ?? []).map((q) => q.code),
    body: x.body,
  };
}
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

describe("1. STEP 0.45 단건 — 상속·증여 취득은 감면도 중과 배제도 없다", () => {
  beforeEach(fallback);
  it("§99의3 1호 상속 취득 → 중과 유지 · 배제 단계 없음 · 세액 = 감면 미선택 대조 6,861,772,500 (수정 전 중과 배제 3,287,872,500)", async () => {
    const sel = await single(form({ cause: "inheritance", red: fromBuilder("") }));
    const ctl = await single(form({ cause: "inheritance", red: null }));
    expect(sel.codes).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(sel.surcharge).toBe(true);
    expect(sel.reasons).not.toContain("tax_special_exemption");
    expect(sel.step).toBe(0);
    expect(sel.tax).toBe(ctl.tax);
    expect(ctl.tax).toBe(6_861_772_500);
  });
  it("§99의3 2호 자기건설 주택(지분)을 증여로 취득 → 중과 유지 · 세액 = 대조 6,861,772,500 (NH-40 · 수정 전 3,287,872,500)", async () => {
    const sel = await single(form({ cause: "gift", red: selfBuilt() }));
    const ctl = await single(form({ cause: "gift", red: null }));
    expect(sel.codes).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(sel.surcharge).toBe(true);
    expect(sel.reasons).not.toContain("tax_special_exemption");
    expect(sel.tax).toBe(ctl.tax);
  });
  it("짝 — 매매 · 최초 계약 「예」는 종전대로 배제(2,371,222,500)", async () => {
    const r = await single(form({ cause: "purchase" }));
    expect(r.surcharge).toBe(false);
    expect(r.reasons).toEqual(["tax_special_exemption"]);
    expect(r.tax).toBe(2_371_222_500);
  });
});

describe("1. 다주택 중과 판정 메뉴 route — 단건과 같은 값", () => {
  beforeEach(fallback);
  it("상속 취득 · §99의3 → 중과 유지 / 증여 자기건설 → 중과 유지 / 짝: 매매 「예」 → 배제", async () => {
    const inh = await judge(form({ cause: "inheritance", red: fromBuilder("") }));
    expect(inh.surchargeApplicable).toBe(true);
    expect(inh.exclusionReasons.map((e) => e.type)).not.toContain("tax_special_exemption");
    const gift = await judge(form({ cause: "gift", red: selfBuilt() }));
    expect(gift.surchargeApplicable).toBe(true);
    const buy = await judge(form({ cause: "purchase" }));
    expect(buy.surchargeApplicable).toBe(false);
    expect(buy.exclusionReasons.map((e) => e.type)).toEqual(["tax_special_exemption"]);
  });
});

/* ── 겸용 route (NH-09 선판정) ───────────────────────────────── */
const mixedHouse = (id: string, acq: string) => ({
  id, region: "capital" as const, acquisitionDate: acq, officialPrice: 800_000_000, isInherited: false, isLongTermRental: false,
});
const r993Engine = {
  type: "new_99_3", contractDate993: "2002-03-01", acquisitionType993: "from_builder", region993: "outside_speculation",
  standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000, standardPriceAtTransfer993: 400_000_000,
  exclusiveAreaSqm993: 84, houseType993: "apartment", isResident993: true, isHousingConstructionBusiness993: false, hasOccupancyAtContract: false,
  isRecontractExcluded993: false, recontractUnavoidableCause993: false, isRedevelopedNewHouse993: false,
};
const ACQ = "2003-09-01";
type Mixed = {
  total: { totalPayable: number };
  steps: { id: string }[];
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
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result;
}
const exclusionSteps = (m: Mixed) => m.steps.filter((s) => s.id === "surcharge-exclusion-by-reduction").length;

describe("1. 겸용 route — 상속·증여 취득은 중과 배제 없음", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
  });
  it.each([
    ["상속", { acquisitionCause: "inheritance", decedentAcquisitionDate: "1995-01-01" }],
    ["증여", { acquisitionCause: "gift" }],
  ])("%s 취득 · §99의3(직접 API가 최초 계약 「예」를 실어도) → 배제 단계 없음 · 감면 미선택 대조와 같은 판정·세액", async (_l, cause) => {
    // 최초 계약 「예」를 실어 취득 원인 게이트만으로 막히는지 본다(빈 값이면 3번 확인 필요 게이트가 먼저 막는다)
    const sel = await mixed({ ...cause, reductions: [{ ...r993Engine, firstContract993: "yes" }] });
    const ctl = await mixed({ ...cause, reductions: [] });
    expect(exclusionSteps(sel)).toBe(0);
    expect(sel.multiHouseSurcharge?.exclusionReasons.map((e) => e.type)).not.toContain("tax_special_exemption");
    expect(sel.multiHouseSurcharge?.surchargeType).toBe(ctl.multiHouseSurcharge?.surchargeType);
    expect(sel.total.totalPayable).toBe(ctl.total.totalPayable);
  });
  it("짝 — 매매 · 최초 계약 「예」는 종전대로 배제", async () => {
    expect(exclusionSteps(await mixed({ acquisitionCause: "purchase", reductions: [{ ...r993Engine, firstContract993: "yes" }] }))).toBe(1);
  });
  it("3. 매매 · 최초 계약 빈 값(직접 API) → 배제 없음(불성립 + 확인 필요와 같은 판정)", async () => {
    expect(exclusionSteps(await mixed({ acquisitionCause: "purchase" }))).toBe(0);
  });
});

describe("3. 최초 계약 여부 빈 값 = 불성립 + 확인 필요 (직접 API·옛 이력)", () => {
  beforeEach(fallback);
  it("⑧은 막는다 · ⑫는 통과 · 엔진 FIRST_CONTRACT_UNCONFIRMED · 세액 = 대조 6,861,772,500 · 중과 배제 없음 (수정 전 적용 2,371,222,500)", async () => {
    const f = form({ cause: "purchase", red: fromBuilder("") });
    expect(allIssues(f).some((m) => /최초로 매매계약/.test(m))).toBe(true);
    const sel = await single(f);
    const ctl = await single(form({ cause: "purchase", red: null }));
    expect(JSON.stringify(sel.body)).not.toContain("firstContract993");
    expect(sel.codes).toEqual(["FIRST_CONTRACT_UNCONFIRMED"]);
    expect(sel.surcharge).toBe(true);
    expect(sel.tax).toBe(ctl.tax);
  });
});

describe("4. §156 1호나목 딸린 토지 495㎡ = 딸린 토지 전체 면적", () => {
  beforeEach(fallback);
  it("§99 단독 연면적 200㎡ · 딸린 토지 600㎡(연면적 2배 400㎡ < 495) · 8억 → 고급주택 배제", async () => {
    const asset = {
      ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "1999-03-01", assetContractDate: "",
      actualSalePrice: "800,000,000", fixedAcquisitionPrice: "200,000,000", standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
      reductions: [{
        ...getReductionDefault("new_99"),
        acquisitionType99: "self_built", usageApprovalDate99: "1999-03-01", houseType99: "detached", exclusiveAreaSqm99: "",
        grossFloorAreaSqm99: "200", attachedLandAreaSqm99: "600", stdPriceFloorMet99: "yes", luxuryFacility99: "no",
        standardPriceAtAcquisition99: "100,000,000", standardPriceAt5Years99: "150,000,000", standardPriceAtTransfer99: "400,000,000",
      }],
    };
    const f = Object.assign(createDefaultTransferFormData(), {
      transferDate: "2024-08-01", contractTotalPrice: "800,000,000", assets: [asset], isOneHousehold: false, householdHousingCount: "2",
    }) as unknown as TransferFormData;
    expect(allIssues(f).filter((m) => /99|신축|고급|최초/.test(m))).toEqual([]);
    const x = await runSingle(f);
    expect(x.status).toBe(200);
    expect(JSON.stringify(x.body)).toContain('"attachedLandAreaSqm99":600');
    const det = (x.r as { new99Detail: { ineligibleReasons: { code: string }[] } }).new99Detail;
    expect(det.ineligibleReasons.map((q) => q.code)).toEqual(["HIGH_VALUE_HOUSE"]);
  });
});
