/**
 * route anchor — 조특법 §99·§99의3 **상속·증여로 받은 종전주택의 재개발 조합원 갈래** (레인 L14 · 계획서 `docs/00-pm/nh99-redev-inherited-member.plan.md`).
 * 폼 → ⑧ → ④ → ⑫ → ⑭ → 엔진. leaf 단위 판정은 `__tests__/tax-engine/transfer/nh99-l14-redev-inherited-member.anchor.test.ts`.
 *
 * 수정 전 같은 입력의 총세액을 it 이름에 적었다. 대조 열은 매매(또는 감면 미선택)로 바꾼 같은 사실이다.
 * 세율: route 폴백 세율(양도 2005·2003은 `makeMockRates`, 중과·판정 메뉴 시료는 프로덕션 폴백) — 시료별 구분은 각 describe 머리말.
 *
 *  Q-1 a  원조합원(주택 출자) · 인가일 전 취득 상속·증여 → 면제 + 「확인 필요」 고지
 *  Q-2 a  인가일 뒤 상속·증여 승계 → §99(사용승인일 현재 조합원)만 허용 · §99의3은 NOT_MEMBER_AT_APPROVAL 유지
 *  Q-3 b  공유 종전주택 일부 지분 → 지분(자산 카드)별 판정
 *  Q-4 a  판정 메뉴가 계산기와 같은 조합원 갈래 인자를 본다
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
import { runCalc, allIssues, captureBody, postTransfer } from "@/__tests__/calc/_helpers/redev-one-house-route";
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

describe("Q-1 a — §99의3 · 원조합원 · 종전주택 상속 (준공 2002-05-25)", () => {
  const A = { redevCompletionDate: "2002-05-25" };
  it("S1 양도 2005-03-01(5년 이내) · 총세액 25,815,247 (수정 전 98,476,714 — 불성립 ACQUIRED_BY_INHERITANCE_OR_GIFT) = 매매 대조", async () => {
    const inh = await go(apt({ ...A, reductions: [r993()] }), "2005-03-01");
    const pur = await go(apt({ ...A, ...PURCHASE, reductions: [r993()] }), "2005-03-01");
    expect(inh.issues).toEqual([]);
    expect(inh.eligible).toBe(true);
    expect(inh.codes).toEqual([]);
    expect(inh.tax).toBe(25_815_247);
    expect(pur.tax).toBe(25_815_247);
    expect(noticed(inh.warnings)).toBe(true);
    expect(noticed(pur.warnings)).toBe(false);
  });
  it("감면 미선택 대조 98,476,714 — 감면이 없으면 세액이 바뀌지 않는다(원인은 세액 계산의 다른 축을 건드리지 않음)", async () => {
    expect((await go(apt({ ...A, reductions: [] }), "2005-03-01")).tax).toBe(98_476_714);
  });
  it("S2 증여 취득 원조합원 · 같은 25,815,247 (수정 전 98,476,714)", async () => {
    const g = await go(apt({ ...A, ...GIFT, reductions: [r993()] }), "2005-03-01");
    expect(g.issues).toEqual([]);
    expect(g.eligible).toBe(true);
    expect(g.tax).toBe(25_815_247);
    expect(noticed(g.warnings)).toBe(true);
  });
  it("V-11 이월과세 증여(carryover_gift) 취득 원조합원도 증여와 같다 — 25,815,247 (수정 전 98,476,714). 수증자 취득시기를 의제하지 않는 현행 정책은 그대로", async () => {
    const CAR = {
      giftRegistryDate: "1996-03-01", donorAcquisitionDate: "1990-01-01", donorAcquisitionCause: "purchase", donorAcquisitionPrice: "100000000", useEstimatedAcquisition: false,
      estimationMode: "", giftTaxAmount: "0", donorCapitalExpenditure: "0", giftDateValuation: "100000000", exclusionDeclared: {}, donorHouseholdHoldingStartDate: "1990-01-01",
    };
    const cg = { ...GIFT, acquisitionCause: "carryover_gift", fixedAcquisitionPrice: "", acquisitionPrice: "100000000", carryover: CAR, giftSameHousehold: "" };
    const x = await go(apt({ ...A, ...cg, reductions: [r993()] }), "2005-03-01");
    expect(x.issues).toEqual([]);
    expect(x.eligible).toBe(true);
    expect(x.tax).toBe(25_815_247);
    expect(noticed(x.warnings)).toBe(true);
  });
  it("S3 양도 2010-06-30(5년 경과) · 양도 당시 기준시가 4억 → 68,508,445 (수정 전 83,846,714)", async () => {
    const x = await go(apt({ ...A, reductions: [r993({ standardPriceAtTransfer993: "400000000" })] }), "2010-06-30");
    expect(x.issues).toEqual([]);
    expect(x.tax).toBe(68_508_445);
    expect((await go(apt({ ...A, ...PURCHASE, reductions: [r993({ standardPriceAtTransfer993: "400000000" })] }), "2010-06-30")).tax).toBe(68_508_445);
  });
});

describe("Q-1 a — §99 · 원조합원 · 종전주택 상속 (인가 1996-09-01 · 준공 1999-03-01)", () => {
  const A = { redevApprovalDate: "1996-09-01", redevCompletionDate: "1999-03-01" };
  it("S4 양도 2003-03-01 · 총세액 27,307,638 (수정 전 103,612,142) = 매매 대조", async () => {
    const inh = await go(apt({ ...A, reductions: [r99()] }), "2003-03-01");
    const pur = await go(apt({ ...A, ...PURCHASE, reductions: [r99()] }), "2003-03-01");
    expect(inh.issues).toEqual([]);
    expect(inh.tax).toBe(27_307_638);
    expect(pur.tax).toBe(27_307_638);
    expect(inh.eligible).toBe(true);
    expect(noticed(inh.warnings)).toBe(true);
    expect(noticed(pur.warnings)).toBe(false);
  });
});

describe("Q-2 a — 인가일 뒤 상속 승계 (승계조합원)", () => {
  it("S6 §99 · 사망 1998-08-01(인가 1996-09-01 뒤 · 준공 1999-03-01 전) → 적용 24,160,000 (수정 전 132,880,000) = 승계 매매 대조", async () => {
    const o = { ...SUCC, acquisitionDate: "1998-08-01", redevApprovalDate: "1996-09-01", redevCompletionDate: "1999-03-01" };
    const inh = await go(apt({ ...o, reductions: [r99()] }), "2003-03-01");
    const pur = await go(apt({ ...o, ...PURCHASE, reductions: [r99()] }), "2003-03-01");
    expect(inh.issues).toEqual([]);
    expect(inh.eligible).toBe(true);
    expect(inh.tax).toBe(24_160_000);
    expect(pur.tax).toBe(24_160_000);
    expect(noticed(inh.warnings)).toBe(true);
    expect(inh.warnings.some((w) => w.includes("§99는 인가일 요건이 없음"))).toBe(true);
  });
  it("S6x §99 · 준공 1999-03-01 뒤(1999-05-01) 상속 = 완성된 신축주택을 받은 것 → 불성립 유지 132,880,000", async () => {
    const x = await go(apt({ ...SUCC, acquisitionDate: "1999-05-01", redevApprovalDate: "1996-09-01", redevCompletionDate: "1999-03-01", reductions: [r99()] }), "2003-05-01");
    expect(x.eligible).toBe(false);
    expect(x.codes).toEqual(["ACQUIRED_BY_INHERITANCE_OR_GIFT"]);
    expect(x.tax).toBe(132_880_000);
  });
  it("S7 §99의3 · 인가 2000-09-01 뒤 상속 승계 → NOT_MEMBER_AT_APPROVAL 유지 146,960,000(사유가 인가일 요건으로 바뀐다) = 승계 매매 대조", async () => {
    const o = { ...SUCC, acquisitionDate: "2002-08-01", redevCompletionDate: "2002-12-20" };
    const inh = await go(apt({ ...o, reductions: [r993()] }), "2005-03-01");
    const pur = await go(apt({ ...o, ...PURCHASE, reductions: [r993()] }), "2005-03-01");
    expect(inh.eligible).toBe(false);
    expect(inh.codes).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(inh.tax).toBe(146_960_000);
    expect(pur.codes).toEqual(["NOT_MEMBER_AT_APPROVAL"]);
    expect(pur.tax).toBe(146_960_000);
    expect(noticed(inh.warnings)).toBe(false);
  });
});

describe("불성립 유지 — 입력 모순 (토지만 출자 원조합원의 상속은 L16에서 면제로 바뀜 — transfer.route.nh99-l16-redev-member-land-pre2002.anchor)", () => {
  it("⑧ — 인가일 뒤 취득인데 승계 표시가 없으면 막는다(엔진 날짜 가드의 입력단 짝)", async () => {
    const x = await go(apt({ acquisitionDate: "2001-03-01", redevCompletionDate: "2002-05-25", reductions: [r993()] }), "2005-03-01");
    expect(x.issues.some((i) => i.field === "redevApprovalDate")).toBe(true);
  });
});

describe("Q-3 b — 공유 종전주택 일부 지분 (축 B: 60% 매매 + 40% 상속)", () => {
  const share = (n: string, settle: string, over: Record<string, unknown>) =>
    apt({ assetId: "b" + n, ownershipNumerator: n, ownershipDenominator: "100", redevSettlementAmount: settle, redevCompletionDate: "2002-05-25", reductions: [r993()], ...over });
  const PUR = { ...PURCHASE, fixedAcquisitionPrice: "" };
  async function axisB(second: Record<string, unknown>) {
    const f = form([share("60", "30000000", PUR), share("40", "20000000", second)], "2005-03-01", "500000000");
    const body = await captureBody(f);
    const r = await postTransfer(body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agg = r.json?.data?.aggregated as any;
    return { issues: allIssues(f), status: r.status, total: agg?.totalTax as number, props: (agg?.properties ?? []) as { incomeDeductionReducible?: number }[] };
  }
  it("지분별 판정 — 40% 지분이 상속이어도 그 지분의 감면이 선다. 총세액 25,815,247 = 단건 S1 = 매매+매매 (수정 전 51,644,198: 상속 지분만 감면 소실)", async () => {
    const mixed = await axisB({ acquisitionCause: "inheritance" });
    const both = await axisB(PUR);
    expect(mixed.issues).toEqual([]);
    expect(mixed.total).toBe(25_815_247);
    expect(both.total).toBe(25_815_247);
    expect(mixed.props.map((p) => p.incomeDeductionReducible)).toEqual(both.props.map((p) => p.incomeDeductionReducible));
    expect(mixed.props.every((p) => (p.incomeDeductionReducible ?? 0) > 0)).toBe(true);
  });
});

describe("함께 양도(컴패니언) — 같은 엔진 (주택 1 + 원조합원 상속 완공 APT)", () => {
  const house = () =>
    ({
      ...makeDefaultAsset(1), assetId: "h1", addressJibun: "경기도 테스트시 테스트동 9", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2000-03-01",
      useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000", actualSalePrice: "300000000", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "100000000", transferType: "regular",
    }) as unknown as AssetForm;
  const total = async (c: AssetForm) => {
    const f = form([house(), c], "2005-03-01", "800000000");
    const body = await captureBody(f);
    const r = await postTransfer(body);
    return { issues: allIssues(f), status: r.status, total: r.json?.data?.aggregated?.determinedTax as number | undefined };
  };
  const C = { assetId: "c2", standardPriceAtTransfer: "250000000", redevCompletionDate: "2002-05-25", fixedAcquisitionPrice: "", reductions: [r993()] };
  it("컴패니언 원조합원 상속 → 총세액 19,615,058 (수정 전 90,911,587) = 매매 대조", async () => {
    const inh = await total(apt(C));
    const pur = await total(apt({ ...C, ...PURCHASE }));
    expect(inh.issues).toEqual([]);
    expect(inh.status).toBe(200);
    expect(inh.total).toBe(19_615_058);
    expect(pur.total).toBe(19_615_058);
    expect((await total(apt({ ...C, reductions: [] }))).total).toBe(90_911_587);
  });
});

/* ── Q-4 a · 중과 배제 STEP 0.45 + 판정 메뉴 (프로덕션 폴백 세율 · 양도 2021-09-01) ───────────── */
describe("STEP 0.45 · 판정 메뉴 — 원조합원 완공 APT(준공 2012-06-01 · 잔여주택 계약 「예」) · 주택 1채 더 · 조정대상지역", () => {
  const TD = "2021-09-01";
  const fallback = () => vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>);
  const f2 = (cause: "inheritance" | "purchase", red: boolean): TransferFormData => {
    const base = createDefaultTransferFormData() as unknown as Record<string, unknown>;
    const a = apt({
      ...(cause === "purchase" ? { ...PURCHASE, fixedAcquisitionPrice: "" } : {}), addressJibun: "서울특별시 강남구 역삼동 1-1", regionCode: "1168010100",
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
  async function both(cause: "inheritance" | "purchase", red: boolean) {
    const x = await runSingle(f2(cause, red));
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

  it("상속 원조합원 + §99의3 → 계산기 총세액 119,433,683 · 중과 배제 (수정 전 402,655,000 · 중과 유지)", async () => {
    const r = await both("inheritance", true);
    expect(r.tax).toBe(119_433_683);
    expect(r.calc).toEqual({ surcharge: false, reasons: ["tax_special_exemption"] });
  });
  it("🔑 판정 메뉴 = 계산기 — 상속·매매 모두 배제 (수정 전 판정 메뉴는 조합원 갈래 인자를 받지 못해 매매 원조합원도 중과 유지)", async () => {
    for (const cause of ["inheritance", "purchase"] as const) {
      const r = await both(cause, true);
      expect(r.judge).toEqual(r.calc);
      expect(r.judge).toEqual({ surcharge: false, reasons: ["tax_special_exemption"] });
    }
  });
  it("짝 — 감면 미선택이면 상속·매매 모두 중과 유지 402,655,000(계산기·판정 메뉴 일치)", async () => {
    for (const cause of ["inheritance", "purchase"] as const) {
      const r = await both(cause, false);
      expect(r.tax).toBe(402_655_000);
      expect(r.judge).toEqual(r.calc);
      expect(r.calc.surcharge).toBe(true);
    }
  });
});
