/**
 * route anchor — 조특법 §99·§99의3 재개발 조합원 갈래 후속 (레인 L19 · L16 #2981이 남긴 V-c).
 * 토지만 출자한 원조합원이 종전 토지를 **관리처분계획 인가일 뒤**에 취득한 경우 — 주택 출자 원조합원과 같은 ⑧ 가드·⑫ 거울을 건다.
 *
 * 법적 근거: 소득세법 §88 9호(조합원입주권 = 인가로 취득한 입주자 선정 지위, «그 조합원으로부터 취득한 것» 포함) ·
 *   조특령 §99의3③2호·⑤(관리처분계획 인가일 현재의 조합원). 인가일 뒤 취득은 출자 자산이 토지뿐이어도 승계조합원이다.
 *
 * 수정 전(master f84c80260) 같은 입력: 주택 출자 인가 뒤 취득 = ⑧만 차단(⑫ 200) · 토지만 출자 인가 뒤 취득 = ⑧ 통과 + ⑫ 200 + 원조합원 산식 계산,
 * 토지만 출자 + 승계조합원 모드 = ⑧이 «종전 자산 취득가액(실거래가)» 요구(승계라 화면에 그 칸이 없는 막다른 길).
 * 세율: route 폴백 세율(`makeMockRates`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", async (o) => ({
  ...(await o<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { runCalc } from "@/__tests__/calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

const mock = () => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
beforeEach(mock);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

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
const LAND = { redevOriginalAssetType: "land" };
const A993 = { redevCompletionDate: "2002-05-25" };
const A99 = { redevApprovalDate: "1996-09-01", redevCompletionDate: "1999-03-01" };
/** ⑧ 인가일 순서 이슈 / ⑫ 응답 */
const orderIssue = (issues: { field?: string; message: string }[]) => issues.filter((i) => i.field === "redevApprovalDate" && /인가일은 취득일 이후여야 합니다/.test(i.message));
async function probe(a: AssetForm, transferDate: string) {
  const r = await runCalc(form([a], transferDate));
  const d = r.result?.new993Detail ?? r.result?.new99Detail;
  return { status: r.status as number, issues: r.issues, order: orderIssue(r.issues), json: r.json as Loose, tax: r.result?.totalTax as number | undefined, eligible: d?.isEligible as boolean | undefined };
}
const approvalPathIssue = (json: Loose) => JSON.stringify(json).includes("approvalDate");

describe("L19 — §99의3 · 종전 부동산 취득이 인가일(2000-09-01) 뒤 (준공 2002-05-25 · 양도 2005-03-01)", () => {
  const AFTER = "2001-03-01";
  for (const [kind, k] of [["주택 출자", {}], ["토지만 출자", LAND]] as const) {
    for (const [cause, c] of [["매매", PURCHASE], ["상속", {}]] as const) {
      it(`${kind} · ${cause} 인가 뒤 취득 → ⑧ 차단 1건 · ⑫ 400 (수정 전 ${kind === "주택 출자" ? "⑧ 차단 · ⑫ 200" : "⑧ 통과 · ⑫ 200"})`, async () => {
        const x = await probe(apt({ ...A993, ...k, ...c, acquisitionDate: AFTER, reductions: [r993()] }), "2005-03-01");
        expect(x.order).toHaveLength(1);
        expect(x.order[0].message).toMatch(/소득세법 §88 9호/);
        expect(x.status).toBe(400);
        expect(approvalPathIssue(x.json)).toBe(true);
        expect(x.tax).toBeUndefined();
      });
    }
    it(`${kind} · 인가 전 취득(1996-03-01) → ⑧ 이슈 없음 · 200 (회귀 안전망)`, async () => {
      const x = await probe(apt({ ...A993, ...k, ...PURCHASE, acquisitionDate: "1996-03-01", reductions: [r993()] }), "2005-03-01");
      expect(x.order).toEqual([]);
      expect(x.status).toBe(200);
    });
    it(`${kind} · 취득일 = 인가일(2000-09-01) 같은 날 → 모순 아님: ⑧ 이슈 없음 · 200`, async () => {
      const x = await probe(apt({ ...A993, ...k, ...PURCHASE, acquisitionDate: "2000-09-01", reductions: [r993()] }), "2005-03-01");
      expect(x.order).toEqual([]);
      expect(x.status).toBe(200);
    });
  }
  it("🔑 토지만 출자 + 승계조합원 모드 · 인가 뒤 취득 → ⑧ 이슈 없음 · 200 · 26,280,000 = 주택 출자 승계와 같다 (수정 전 ⑧이 «종전 자산 취득가액» 요구)", async () => {
    const land = await probe(apt({ ...A993, ...LAND, ...PURCHASE, ...SUCC, acquisitionDate: AFTER, reductions: [r993()] }), "2005-03-01");
    const house = await probe(apt({ ...A993, ...PURCHASE, ...SUCC, acquisitionDate: AFTER, reductions: [r993()] }), "2005-03-01");
    expect(land.issues).toEqual([]);
    expect(land.status).toBe(200);
    expect(land.eligible).toBe(true);
    expect(land.tax).toBe(26_280_000);
    expect(house.tax).toBe(26_280_000);
  });
  it("토지만 출자 · 인가일 비움 → ⑧이 인가일을 요구한다 (수정 전 ⑧ 통과 · ⑫ 400)", async () => {
    const x = await probe(apt({ ...A993, ...LAND, ...PURCHASE, acquisitionDate: "1996-03-01", redevApprovalDate: "", reductions: [r993()] }), "2005-03-01");
    expect(x.issues.some((i) => i.field === "redevApprovalDate" && /인가일을 입력하세요/.test(i.message))).toBe(true);
    expect(x.status).toBe(400);
  });
});

describe("L19 — §99 · 종전 부동산 취득이 인가일(1996-09-01) 뒤 (준공 1999-03-01 · 양도 2003-03-01)", () => {
  for (const [kind, k] of [["주택 출자", {}], ["토지만 출자", LAND]] as const) {
    it(`${kind} · 인가 뒤 취득(1998-03-01) → ⑧ 차단 · ⑫ 400`, async () => {
      const x = await probe(apt({ ...A99, ...k, ...PURCHASE, acquisitionDate: "1998-03-01", reductions: [r99()] }), "2003-03-01");
      expect(x.order).toHaveLength(1);
      expect(x.status).toBe(400);
    });
  }
  it("토지만 출자 + 승계조합원 모드 → 200 · 23,400,000 = 주택 출자 승계(§99는 사용승인일 현재 조합원이면 족하다)", async () => {
    const land = await probe(apt({ ...A99, ...LAND, ...PURCHASE, ...SUCC, acquisitionDate: "1998-03-01", reductions: [r99()] }), "2003-03-01");
    const house = await probe(apt({ ...A99, ...PURCHASE, ...SUCC, acquisitionDate: "1998-03-01", reductions: [r99()] }), "2003-03-01");
    expect(land.issues).toEqual([]);
    expect(land.status).toBe(200);
    expect(land.tax).toBe(23_400_000);
    expect(house.tax).toBe(23_400_000);
  });
});

describe("L19 — 짝: L16 토지만 출자 인가 전 상속·증여는 그대로 (18,977,142)", () => {
  it("상속 1996-03-01 → 18,977,142 · 증여 → 18,977,142", async () => {
    const inh = await probe(apt({ ...A993, ...LAND, reductions: [r993()] }), "2005-03-01");
    const gift = await probe(apt({ ...A993, ...LAND, ...GIFT, reductions: [r993()] }), "2005-03-01");
    expect(inh.status).toBe(200);
    expect(inh.tax).toBe(18_977_142);
    expect(gift.tax).toBe(18_977_142);
  });
});
