/**
 * route anchor — 조특법 §99·§99의3 재개발 조합원 갈래 후속 (레인 L16 · 계획서 `docs/00-pm/nh99-redev-inherited-member.plan.md` V-5 · V-10).
 * 폼 → ⑧ → ④ → ⑫ → ⑭ → 엔진. leaf 단위 판정은 `__tests__/tax-engine/transfer/nh99-l16-redev-member-land-pre2002.anchor.test.ts`.
 *
 *  L14-1  토지만 출자한 원조합원이 종전 토지를 상속·증여로 취득 → 취득 원인 게이트 면제(주택 출자와 같은 취급) + 「확인 필요」 고지
 *  L14-2  §99의3 — 2001.12.31. 이전 조합원 지위 승계는 종전 규정(대통령령 제17458호 부칙 제11조): NOT_MEMBER_AT_APPROVAL 대신 사용승인일 현재 조합원으로 판정
 *
 * 수정 전 같은 입력의 총세액을 it 이름에 적었다. 세율: route 폴백 세율(양도 2005·2003은 `makeMockRates`, 중과·판정 메뉴 시료는 프로덕션 폴백).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", async (o) => ({
  ...(await o<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { runCalc } from "@/__tests__/calc/_helpers/redev-one-house-route";
import { runSingle } from "../calc/_helpers/single-multi-route-parity";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { POST as JUDGMENT_POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

const mock = () => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
beforeEach(mock);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const NOTICE = /정면으로 다룬 해석례는 확인하지 못했습니다/;

/** 종전주택 상속개시 1996-03-01(피상속인 취득 1985-01-01) · 관리처분 인가 2000-09-01 · 주택 출자 원조합원 · 5억 양도 · 권리가액 3억 · 청산금 납부 5천만 */
const apt = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1), assetId: "a1", addressJibun: "경기도 테스트시 테스트동 1", assetKind: "redevelopment_apt", redevSubject: "apt",
    acquisitionCause: "inheritance", acquisitionDate: "1996-03-01", decedentAcquisitionDate: "1985-01-01", publishedValueAtInheritance: "100000000",
    inheritanceValuationMethod: "supplementary", transferType: "regular", actualSalePrice: "500000000",
    redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2000-09-01", redevOriginalAssetType: "housing",
    redevRightsValue: "300000000", redevSettlementDirection: "pay", redevSettlementAmount: "50000000", redevPreApprovalExpenses: "0",
    useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevIsSuccessorMember: "no", ...over,
  }) as unknown as AssetForm;
const PURCHASE = { acquisitionCause: "purchase", decedentAcquisitionDate: "", publishedValueAtInheritance: "", inheritanceValuationMethod: "" };
const GIFT = {
  acquisitionCause: "gift", decedentAcquisitionDate: "", publishedValueAtInheritance: "", inheritanceValuationMethod: "", giftDonorRelation: "other",
  giftSameHousehold: "no", donorAcquisitionDate: "1990-01-01", fixedAcquisitionPrice: "100000000",
};
/** 인가일 뒤 입주권 승계 — 승계 매매는 취득가액(fixedAcquisitionPrice)이 필수, 청산금 분기는 미지원이라 0 */
const SUCC = { redevIsSuccessorMember: "yes", redevSettlementAmount: "0", redevActualAcquisitionPrice: "", fixedAcquisitionPrice: "100000000" };
const form = (assets: AssetForm[], transferDate: string, contract = assets[0].actualSalePrice) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate, filingDate: transferDate, totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets, contractTotalPrice: contract,
  }))) as TransferFormData;
const r993 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99_3"), acquisitionType993: "self_built", standardPriceAtAcquisition993: "100000000", standardPriceAt5Years: "160000000",
  standardPriceAtTransfer993: "250000000", exclusiveAreaSqm993: "84", region993: "outside_speculation", isResident993: true,
  isHousingConstructionBusiness993: false, houseType993: "apartment", previousHouseStdPrice993: "60000000", ...over,
});
const r99 = (over: Record<string, unknown> = {}) => ({
  ...getReductionDefault("new_99"), acquisitionType99: "self_built", standardPriceAtAcquisition99: "100000000", standardPriceAt5Years99: "160000000",
  standardPriceAtTransfer99: "250000000", exclusiveAreaSqm99: "84", houseType99: "apartment", isResident99: true, isHousingConstructionBusiness99: false,
  previousHouseStdPrice99: "60000000", ...over,
});
async function go(a: AssetForm, transferDate: string) {
  const r = await runCalc(form([a], transferDate));
  const d = r.result?.new993Detail ?? r.result?.new99Detail;
  return {
    status: r.status as number, issues: r.issues, tax: r.result?.totalTax as number | undefined, eligible: d?.isEligible as boolean | undefined,
    codes: (d?.ineligibleReasons ?? []).map((x: { code: string }) => x.code) as string[], warnings: (d?.warnings ?? []) as string[],
  };
}
const noticed = (w: string[]) => w.some((x) => NOTICE.test(x));
const LAND = { redevOriginalAssetType: "land" };

describe("L14-1 — 토지만 출자 원조합원 · §99의3 (준공 2002-05-25 · 양도 2005-03-01)", () => {
  const A = { ...LAND, redevCompletionDate: "2002-05-25" };
  it("상속 → 총세액 18,977,142 (수정 전 104,374,285 — ACQUIRED_BY_INHERITANCE_OR_GIFT) = 매매 대조", async () => {
    const inh = await go(apt({ ...A, reductions: [r993()] }), "2005-03-01");
    const pur = await go(apt({ ...A, ...PURCHASE, reductions: [r993()] }), "2005-03-01");
    expect(inh.issues).toEqual([]);
    expect(inh.eligible).toBe(true);
    expect(inh.codes).toEqual([]);
    expect(inh.tax).toBe(18_977_142);
    expect(pur.tax).toBe(18_977_142);
    expect(noticed(inh.warnings)).toBe(true);
    expect(inh.warnings.some((w) => w.includes("종전 토지를 상속·증여로 취득했으나"))).toBe(true);
    expect(noticed(pur.warnings)).toBe(false);
  });
  it("증여 → 같은 18,977,142 (수정 전 104,374,285)", async () => {
    const g = await go(apt({ ...A, ...GIFT, reductions: [r993()] }), "2005-03-01");
    expect(g.issues).toEqual([]);
    expect(g.eligible).toBe(true);
    expect(g.tax).toBe(18_977_142);
    expect(noticed(g.warnings)).toBe(true);
  });
  it("짝 — 감면 미선택 대조 104,374,285 (감면이 실제로 서 있다)", async () => {
    expect((await go(apt({ ...A, reductions: [] }), "2005-03-01")).tax).toBe(104_374_285);
  });
  it("짝 — 주택 출자 원조합원은 L14 그대로 29,593,927 (토지만 출자와 분모만 다르다)", async () => {
    const h = await go(apt({ redevCompletionDate: "2002-05-25", reductions: [r993()] }), "2005-03-01");
    expect(h.tax).toBe(29_593_927);
    expect(h.warnings.some((w) => w.includes("종전주택을 상속·증여로 취득했으나"))).toBe(true);
  });
  it("짝 — 종전 토지 취득이 인가일(2000-09-01) 뒤인 상속은 면제하지 않는다 — L19부터 ⑧(인가일 순서)·⑫가 먼저 막는다(수정 전 ⑧ 통과 · 엔진 날짜 가드 불성립 112,640,000)", async () => {
    const r = await runCalc(form([apt({ ...A, acquisitionDate: "2001-03-01", reductions: [r993()] })], "2005-03-01"));
    expect(r.issues.some((i) => i.field === "redevApprovalDate" && /인가일은 취득일 이후여야 합니다/.test(i.message))).toBe(true);
    expect(r.status).toBe(400);
  });
});

describe("L14-1 — 토지만 출자 원조합원 · §99 (인가 1996-09-01 · 준공 1999-03-01 · 양도 2003-03-01)", () => {
  const A = { ...LAND, redevApprovalDate: "1996-09-01", redevCompletionDate: "1999-03-01" };
  it("상속 → 18,900,000 (수정 전 103,950,000) = 매매 대조 · 감면 미선택 103,950,000", async () => {
    const inh = await go(apt({ ...A, reductions: [r99()] }), "2003-03-01");
    const pur = await go(apt({ ...A, ...PURCHASE, reductions: [r99()] }), "2003-03-01");
    expect(inh.issues).toEqual([]);
    expect(inh.eligible).toBe(true);
    expect(inh.tax).toBe(18_900_000);
    expect(pur.tax).toBe(18_900_000);
    expect(noticed(inh.warnings)).toBe(true);
    expect((await go(apt({ ...A, reductions: [] }), "2003-03-01")).tax).toBe(103_950_000);
  });
});

describe("L14-2 — §99의3 승계조합원 × 승계일 (인가 2000-09-01 · 준공 2002-05-25 · 양도 2005-03-01)", () => {
  const A = { ...SUCC, redevCompletionDate: "2002-05-25" };
  const PRIOR = /대통령령 제17458호 부칙 제11조/;
  it("2001-06-01 매매 승계 → 26,280,000 (수정 전 144,540,000 — NOT_MEMBER_AT_APPROVAL) · 종전 규정 고지", async () => {
    const x = await go(apt({ ...A, acquisitionDate: "2001-06-01", ...PURCHASE, reductions: [r993()] }), "2005-03-01");
    expect(x.issues).toEqual([]);
    expect(x.eligible).toBe(true);
    expect(x.codes).toEqual([]);
    expect(x.tax).toBe(26_280_000);
    expect(x.warnings.some((w) => PRIOR.test(w))).toBe(true);
    expect(noticed(x.warnings)).toBe(false);
  });
  it("🔑 경계 — 2001-12-31 승계 26,280,000 · 2002-01-01 승계 144,540,000(NOT_MEMBER_AT_APPROVAL 유지, 감면 미선택 대조와 같다)", async () => {
    const last = await go(apt({ ...A, acquisitionDate: "2001-12-31", ...PURCHASE, reductions: [r993()] }), "2005-03-01");
    const first = await go(apt({ ...A, acquisitionDate: "2002-01-01", ...PURCHASE, reductions: [r993()] }), "2005-03-01");
    const ctl = await go(apt({ ...A, acquisitionDate: "2002-01-01", ...PURCHASE, reductions: [] }), "2005-03-01");
    expect(last.tax).toBe(26_280_000);
    expect(last.eligible).toBe(true);
    expect(first.eligible).toBe(false);
    expect(first.codes).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(first.tax).toBe(144_540_000);
    expect(ctl.tax).toBe(144_540_000);
    expect(first.warnings.some((w) => PRIOR.test(w))).toBe(false);
  });
  it("상속·증여 승계(2001-06-01) → 26,280,000 (수정 전 144,540,000) · 종전 규정 고지 + 「확인 필요」", async () => {
    const inh = await go(apt({ ...A, acquisitionDate: "2001-06-01", reductions: [r993()] }), "2005-03-01");
    const gift = await go(apt({ ...A, acquisitionDate: "2001-06-01", ...GIFT, fixedAcquisitionPrice: "100000000", reductions: [r993()] }), "2005-03-01");
    for (const x of [inh, gift]) {
      expect(x.issues).toEqual([]);
      expect(x.eligible).toBe(true);
      expect(x.tax).toBe(26_280_000);
      expect(x.warnings.some((w) => PRIOR.test(w))).toBe(true);
      expect(noticed(x.warnings)).toBe(true);
    }
  });
  it("짝 — §99는 L14 그대로(인가일 요건이 없는 조문): 승계 1998-08-01 · 2001-12-31 모두 23,400,000 · 종전 규정 고지 없음", async () => {
    const B = { ...SUCC, ...PURCHASE, redevApprovalDate: "1996-09-01", redevCompletionDate: "1999-03-01" };
    for (const d of ["1998-08-01", "2001-12-31"]) {
      const x = await go(apt({ ...B, acquisitionDate: d, reductions: [r99()] }), "2003-03-01");
      expect(x.tax).toBe(23_400_000);
      expect(x.warnings.some((w) => PRIOR.test(w))).toBe(false);
    }
  });
});

/* ── STEP 0.45 · 판정 메뉴 (프로덕션 폴백 세율 · 양도 2021-09-01) ───────────── */
describe("STEP 0.45 · 판정 메뉴 — 승계조합원 완공 APT(준공 2012-06-01 · 잔여주택 계약 「예」) · 주택 1채 더 · 조정대상지역", () => {
  const TD = "2021-09-01";
  const fallback = () => vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>);
  const f2 = (acq: string, red: boolean): TransferFormData => {
    const base = createDefaultTransferFormData() as unknown as Record<string, unknown>;
    const a = apt({
      ...SUCC, ...PURCHASE, acquisitionDate: acq, addressJibun: "서울특별시 강남구 역삼동 1-1", regionCode: "1168010100",
      actualSalePrice: "800,000,000", redevCompletionDate: "2012-06-01", standardPriceAtTransfer: "400,000,000", reductions: red ? [r993({ remainderContract993: "yes" })] : [],
    });
    const houses = [{
      ...createHouseEntry("h2"), region: "capital", regionCode: "1168010100", acquisitionDate: "2010-01-01", officialPrice: "500,000,000",
      acquisitionPrice: "300,000,000", exclusiveArea: "84", isApartment: true,
    }];
    return {
      ...base, transferDate: TD, contractTotalPrice: "800,000,000", assets: [a], houses, presaleRights: [], householdNoPresaleRightsConfirmed: true,
      isOneHousehold: true, householdHousingCount: "2", isRegulatedArea: true, wasRegulatedAtAcquisition: false, isUnregistered: false,
    } as unknown as TransferFormData;
  };
  async function both(acq: string, red: boolean) {
    const x = await runSingle(f2(acq, red));
    expect(x.status, JSON.stringify(x.json).slice(0, 300)).toBe(200);
    const mh = (x.r as Loose).multiHouseSurchargeEvaluation as { surchargeApplicable: boolean; exclusionReasons: { type: string }[] };
    const res = await JUDGMENT_POST(new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
      method: "POST", headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify({ property: x.body }),
    }));
    const j = (await res.json()) as Loose;
    expect(res.status, JSON.stringify(j).slice(0, 300)).toBe(200);
    const jr = j.data.headline.result as { surchargeApplicable: boolean; exclusionReasons: { type: string }[] };
    return {
      tax: x.totalTax, calc: { surcharge: mh.surchargeApplicable, reasons: mh.exclusionReasons.map((e) => e.type) },
      judge: { surcharge: jr.surchargeApplicable, reasons: jr.exclusionReasons.map((e) => e.type) },
    };
  }
  beforeEach(fallback);

  it("2001-06-01 승계 + §99의3 → 계산기·판정 메뉴 모두 중과 배제 (수정 전 둘 다 중과 유지)", async () => {
    const r = await both("2001-06-01", true);
    expect(r.calc).toEqual({ surcharge: false, reasons: ["tax_special_exemption"] });
    expect(r.judge).toEqual(r.calc);
  });
  it("🔑 짝 — 2002-01-01 승계는 둘 다 중과 유지 · 감면 미선택 대조와 세액이 같다", async () => {
    const r = await both("2002-01-01", true);
    const ctl = await both("2002-01-01", false);
    expect(r.calc.surcharge).toBe(true);
    expect(r.judge).toEqual(r.calc);
    expect(r.tax).toBe(ctl.tax);
  });
});
