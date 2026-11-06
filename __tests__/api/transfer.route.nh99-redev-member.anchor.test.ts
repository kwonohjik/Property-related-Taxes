/**
 * anchor — §99·§99의3 **재개발 완공 아파트 조합원 갈래** 화면 경로(폼 → ⑧ → ④ → ⑫ → ⑭ → 엔진)
 * (리뷰 `docs/reviews/new-housing-99-review-2026-11.md` NH-36 · NH-63 · NH-32 · NH-16 ③2호 · NH-27 — 레인 L5).
 *
 * 수정 전: 화면 시한 게이트가 종전주택 취득일로 판정해 카드 선택이 막혔고(NH-36), 직접 넣어도 5년을 종전주택 취득일부터 셌으며(NH-63),
 * 재개발 변형은 기본 꺼진 토글에만 의존했다(NH-32). 기간 경과 후 사용승인 조합원 주택(조특령 §99의3③2호·§99③2호)은 입력 경로가 없었다.
 * 수정 후: 준공일(사용승인·사용검사일 — 서면인터넷방문상담4팀-2145) 축 · 주택 출자면 변형 고정 · 잔여주택 계약 사실 3-state.
 * 대조 수치(수정 전 같은 입력): A 45,986,070 · B 110,502,857(불성립) · C 109,560,000(불성립) · C2 61,243,000.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
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
import { captureBody, postTransfer } from "@/__tests__/calc/_helpers/redev-one-house-route";

beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });

const apt = (over: Record<string, unknown>) => ({
  ...makeDefaultAsset(1), assetId: "a1", addressJibun: "경기도 테스트시 테스트동 1", assetKind: "redevelopment_apt", redevSubject: "apt",
  acquisitionCause: "purchase", acquisitionDate: "1995-03-01", transferType: "regular", actualSalePrice: "600000000",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "1999-01-01", redevOriginalAssetType: "housing",
  redevRightsValue: "300000000", redevSettlementDirection: "pay", redevSettlementAmount: "50000000", redevPreApprovalExpenses: "0",
  useEstimatedAcquisition: false, redevActualAcquisitionPrice: "100000000", redevIsSuccessorMember: "no",
  ...over,
}) as unknown as AssetForm;
const form = (a: AssetForm, transferDate: string) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate, filingDate: transferDate, totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets: [a], contractTotalPrice: a.actualSalePrice,
  }) as TransferFormData;
const r993 = (over: Record<string, unknown>) => ({
  ...getReductionDefault("new_99_3"), acquisitionType993: "self_built", standardPriceAtAcquisition993: "200000000", standardPriceAt5Years: "300000000",
  standardPriceAtTransfer993: "350000000", exclusiveAreaSqm993: "84", region993: "outside_speculation", isResident993: true,
  isHousingConstructionBusiness993: false, houseType993: "apartment", previousHouseStdPrice993: "100000000", ...over,
});
const r99 = (over: Record<string, unknown>) => ({
  ...getReductionDefault("new_99"), acquisitionType99: "self_built", standardPriceAtAcquisition99: "200000000", standardPriceAt5Years99: "300000000",
  standardPriceAtTransfer99: "400000000", exclusiveAreaSqm99: "84", houseType99: "apartment", isResident99: true, isHousingConstructionBusiness99: false,
  previousHouseStdPrice99: "100000000", ...over,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = (r: any) => r.result?.new993Detail ?? r.result?.new99Detail;

describe("A — §99의3 · 주택 출자 원조합원 · 준공 2002-06-30(기간 안) · 양도 2006-03-01", () => {
  it("5년은 준공일부터(이내) · 재개발 변형 고정 → (350,000,000 − 200,000,000) ÷ (350,000,000 − 100,000,000) = 0.6 · 총세액 53,417,071", async () => {
    const r = await runCalc(form(apt({ redevCompletionDate: "2002-06-30", reductions: [r993({ usageApprovalDate993: "2002-06-30" })] }), "2006-03-01"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(d(r).isWithin5Years).toBe(true);
    expect(d(r).fiveYearRatio).toBe(0.6);
    expect(d(r).previousHouseStdPriceApplied).toBe(100_000_000);
    expect(r.result.totalTax).toBe(53_417_071);
  });
  it("감면 없는 세액 불변 — 준공일을 실어도 다른 판정이 바뀌지 않는다(수정 전 126,657,142)", async () => {
    const r = await runCalc(form(apt({ redevCompletionDate: "2002-06-30", reductions: [] }), "2006-03-01"));
    expect(r.result.totalTax).toBe(126_657_142);
  });
  it("④가 주택 출자 원조합원의 준공일을 싣는다 — 비우면 ⑧이 준공일 칸을, ⑫가 400을 낸다", async () => {
    const ok = await captureBody(form(apt({ redevCompletionDate: "2002-06-30", reductions: [r993({})] }), "2006-03-01"));
    expect((ok.redevelopment as { completionDate?: string }).completionDate).toBe("2002-06-30");
    const blank = form(apt({ redevCompletionDate: "", reductions: [r993({})] }), "2006-03-01");
    const r = await runCalc(blank);
    expect(r.issues.some((i) => i.field === "redevCompletionDate")).toBe(true);
    expect(r.status).toBe(400);
  });
});

describe("B — §99의3 ③2호 · 인가 2004-01-01 · 준공 2008-06-30(기간 경과 후) · 양도 2016-06-01", () => {
  const bOver = { redevApprovalDate: "2004-01-01", redevCompletionDate: "2008-06-30" };
  const run = (rc: string) => runCalc(form(apt({ ...bOver, reductions: [r993({ standardPriceAtTransfer993: "400000000", remainderContract993: rc })] }), "2016-06-01"));
  it("잔여주택 계약 사실 「예」 → 적용 · 비율 1/3 · 총세액 74,084,999 (감면 없음 110,502,857)", async () => {
    const r = await run("yes");
    expect(r.issues).toEqual([]);
    expect(d(r).isEligible).toBe(true);
    expect(d(r).reducibleTransferIncome).toBe(105_714_286);
    expect(r.result.totalTax).toBe(74_084_999);
  });
  it("「아니오」 불성립 · 「모름」 불성립 + 확인 필요 · 빈 값은 ⑧이 묻는다", async () => {
    expect(d(await run("no")).ineligibleReasons.map((x: { code: string }) => x.code)).toEqual(["NO_REMAINDER_CONTRACT"]);
    const u = await run("unknown");
    expect(d(u).ineligibleReasons.map((x: { code: string }) => x.code)).toEqual(["REMAINDER_CONTRACT_UNCONFIRMED"]);
    expect(u.result.totalTax).toBe(110_502_857);
    expect((await run("")).issues.map((i) => i.field)).toContain("reduction.new_99_3.remainderContract993");
  });
});

describe("C — §99 · 조특령 §99③2호 · 종전 1990 · 인가 1997-01-01", () => {
  const cOver = { acquisitionDate: "1990-03-01", redevApprovalDate: "1997-01-01" };
  it("준공 2000-06-30(기간 경과 후) + 잔여주택 계약 「예」 → 적용 · 총세액 73,425,000 (감면 없음 109,560,000)", async () => {
    const r = await runCalc(form(apt({ ...cOver, redevCompletionDate: "2000-06-30", reductions: [r99({ remainderContract99: "yes" })] }), "2016-06-01"));
    expect(r.issues).toEqual([]);
    expect(d(r).isEligible).toBe(true);
    expect(r.result.totalTax).toBe(73_425_000);
    const no = await runCalc(form(apt({ ...cOver, redevCompletionDate: "2000-06-30", reductions: [r99({ remainderContract99: "no" })] }), "2016-06-01"));
    expect(d(no).ineligibleReasons.map((x: { code: string }) => x.code)).toEqual(["NO_REMAINDER_CONTRACT"]);
  });
  it("준공 1999-03-01(기간 안) · 양도 2003-06-01 → 5년 이내 변형 안분 2/3 · 총세액 43,052,499", async () => {
    const r = await runCalc(form(apt({ ...cOver, redevCompletionDate: "1999-03-01", reductions: [r99({})] }), "2003-06-01"));
    expect(r.issues).toEqual([]);
    expect(d(r).isWithin5Years).toBe(true);
    expect(d(r).fiveYearRatio).toBeCloseTo(2 / 3, 12);
    expect(r.result.totalTax).toBe(43_052_499);
  });
});

describe("⑫ — 직접 API: 완공 아파트 조합원 §99의3에 준공일이 없으면 400", () => {
  it("redevelopment.completionDate를 지우면 거부된다", async () => {
    const body = await captureBody(form(apt({ redevCompletionDate: "2002-06-30", reductions: [r993({})] }), "2006-03-01"));
    const rd = { ...(body.redevelopment as Record<string, unknown>) };
    delete rd.completionDate;
    const r = await postTransfer({ ...body, redevelopment: rd });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("completionDate");
  });
});
