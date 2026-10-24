/**
 * 겸용주택 상속·증여 — 소득세법 시행령 §163⑨ 단서 자산 합계 비교 (PR-6 · 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §17).
 * 폼 → ⑧ → ④ → ⑫ → Route 전 구간.
 *
 * 시료: 겸용 주택 100㎡ · 상가 100㎡ · 토지 200㎡ · 2024-08-20 양도 30억 · 다주택 · mock 세율.
 *   ② = 주택 취득시 개별주택가격 4억 + 상가 (토지 100㎡ × 120만 + 건물 8천만) 2억 = 6억
 *   ③(1985 전) = 주택 413,793,103 + 상가 206,896,551 = 620,689,654
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";

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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine() as never);
});

const T = 3_000_000_000;
const MIX = {
  assetKind: "housing",
  isMixedUseHouse: true,
  addressJibun: "서울 강남구 역삼동 1",
  acquisitionCause: "inheritance",
  acquisitionDate: "1980-03-01",
  inheritanceStartDate: "1980-03-01",
  decedentAcquisitionDate: "1970-01-01",
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  buildingFootprintArea: "100",
  mixedUseTotalLandArea: "200",
  mixedZoneType: "general_residential",
  mixedTransferHousingPrice: "1600000000",
  mixedTransferHousingBuildingStdPrice: "800000000",
  mixedTransferLandPricePerSqm: "12000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "400000000",
  mixedAcqHousingBuildingStdPrice: "380000000",
  mixedAcqCommercialBuildingPrice: "80000000",
  mixedAcqLandPricePerSqm: "1200000",
  actualSalePrice: String(T),
} as Partial<AssetForm>;
const PHD = {
  usePreHousingDisclosure: true,
  useEstimatedAcquisition: true,
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "600000000",
  phdLandPricePerSqmAtAcq: "1200000",
  phdBuildingStdPriceAtAcq: "300000000",
  phdLandPricePerSqmAtFirst: "4000000",
  phdBuildingStdPriceAtFirst: "350000000",
  phdLandPricePerSqmAtTransfer: "12000000",
  phdBuildingStdPriceAtTransfer: "800000000",
  phdTransferHousingPrice: "1600000000",
  mixedAcqHousingPrice: "",
  mixedAcqHousingBuildingStdPrice: "",
} as Partial<AssetForm>;
const Y1990 = { acquisitionDate: "1990-03-01", inheritanceStartDate: "1990-03-01" } as Partial<AssetForm>;
const GIFT = { acquisitionCause: "gift", inheritanceStartDate: "", decedentAcquisitionDate: "", donorAcquisitionDate: "1970-01-01" } as Partial<AssetForm>;
const inh = (h: string, c: string) => ({ mixedHousingInheritedValueOverride: h, mixedCommercialInheritedValueOverride: c }) as Partial<AssetForm>;

const asset = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, MIX, ...over) as AssetForm;
function form(a: AssetForm): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-08-20";
  f.filingDate = "2024-10-31";
  f.contractTotalPrice = String(T);
  f.householdHousingCount = "2";
  f.isOneHousehold = false;
  f.assets = [a];
  return f;
}
async function run(f: TransferFormData) {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = await res.json();
  const issues = [0, 1, 2, 3].flatMap((s) => collectStepIssues(s, f)).map((i) => i.message);
  return { status: res.status, json, body, issues };
}
const ACQ_ISSUE = /겸용|신고가액|평가액|확인할 수 없음|공익수용/;
const tot = (h: number, c: number) => ({ housing: h, commercial: c, total: h + c });

describe("의제취득일(1985.1.1.) 전 — max(Σ①, Σ②, Σ③)", () => {
  it("1980 상속 · ① 4.5억+1억 → Σ③ 620,689,654 > Σ② 6억 > Σ① 5.5억 → ③ (종전 ③만과 같은 세액 676,747,759)", async () => {
    const r = await run(form(asset(inh("450000000", "100000000"))));
    expect(r.issues.filter((m) => ACQ_ISSUE.test(m))).toEqual([]);
    expect(r.status).toBe(200);
    expect((r.body.mixedUse as Record<string, unknown>).sec163_9Compare).toEqual({ era: "pre_deemed", cause: "inheritance" });
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toMatchObject({
      selected: "converted",
      reported: tot(450_000_000, 100_000_000),
      standard: tot(400_000_000, 200_000_000),
      converted: tot(413_793_103, 206_896_551),
    });
    expect(res.total.determinedTax).toBe(676_747_759);
    // R-1(PHD 필수)은 단서 구간만 — 의제취득일 전은 PR-7b-7b 범위라 PHD 없이도 막지 않는다
    expect(r.issues.join()).not.toMatch(/§164⑦ 환산가액/);
  });

  it("🔴 1980 상속 · ① 비움 → 「확인할 수 없음」 선언을 요구하지 않는다(종전: 겸용 ① 칸을 못 읽어 늘 요구)", async () => {
    const r = await run(form(asset()));
    expect(r.issues.filter((m) => ACQ_ISSUE.test(m))).toEqual([]);
    expect(r.json.data.result.sec163_9Comparison).toMatchObject({ reported: null, selected: "converted" });
  });

  it("🔴 1980 상속 PHD · ① 9억+1억 → Σ① 10억 채택 · 결정세액 698,207,732 → 562,935,000", async () => {
    const r = await run(form(asset(PHD, inh("900000000", "100000000"))));
    expect(r.issues.filter((m) => ACQ_ISSUE.test(m))).toEqual([]);
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toMatchObject({ selected: "reported", reported: tot(900_000_000, 100_000_000) });
    expect(res.housingPart.estimatedAcquisitionPrice).toBe(900_000_000);
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(100_000_000);
    expect(res.total.determinedTax).toBe(562_935_000);
  });

  it("🔴 Q-20 — Σ① 승이면 주택 ①(2억)이 주택 ②(§164⑦ 336,000,000)보다 작아도 ①을 쓴다(파트별 max 아님)", async () => {
    const r = await run(form(asset(PHD, inh("200000000", "900000000"))));
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toMatchObject({ selected: "reported", standard: { housing: 336_000_000 } });
    expect(res.housingPart.estimatedAcquisitionPrice).toBe(200_000_000);
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(900_000_000);
  });

  it("🔴 1980 상속 · 공익수용 · ① 9억+3억 → ① 채택으로 계산한다(Q-17 · 종전 ⑧ 차단 · 상가 상속 분기 거부)", async () => {
    const r = await run(form(asset(inh("900000000", "300000000"), {
      transferCause: "public_expropriation",
      housingCompensationTotal: "1500000000",
      housingCompensationBasisTotal: "1600000000",
      mixedCommercialLandCompensationTotal: "1000000000",
      mixedCommercialLandCompensationBasisTotal: "1200000000",
    } as Partial<AssetForm>)));
    expect(r.issues.filter((m) => ACQ_ISSUE.test(m))).toEqual([]);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    // ③은 특례 분모로 계산한 값이다(Q-10 A) — 수용 특례가 없으면 620,689,654
    expect(r.json.data.result.sec163_9Comparison).toMatchObject({ selected: "reported", converted: { total: 685_893_416 } });
  });

  it("🔴 1980 증여 · ① 비움 → ⑧·⑫ 모두 증여 신고가액을 요구한다(Q-16)", async () => {
    const r = await run(form(asset(GIFT)));
    expect(r.issues.join()).toMatch(/의제취득일\(1985\.1\.1\.\) 전 증여 겸용주택은 주택분·상가분 증여 신고가액/);
    expect(r.status).toBe(400);
  });

  it("1980 증여 · ① 4.5억+1억 → ③ 채택(상속과 같은 비교)", async () => {
    const r = await run(form(asset(GIFT, { mixedHousingGiftValueOverride: "450000000", mixedCommercialGiftValueOverride: "100000000" } as Partial<AssetForm>)));
    expect(r.issues.filter((m) => ACQ_ISSUE.test(m))).toEqual([]);
    expect(r.json.data.result.sec163_9Comparison).toMatchObject({ cause: "gift", selected: "converted" });
  });

  it("🔴 ① 한 칸만 → ⑧·⑫ 모두 막는다(Q-19)", async () => {
    const r = await run(form(asset({ mixedHousingInheritedValueOverride: "450000000" } as Partial<AssetForm>)));
    expect(r.issues.join()).toMatch(/주택분·상가분을 모두 입력하거나 모두 비워/);
    expect(r.status).toBe(400);
  });
});

describe("1985 이후 개별주택가격 공시 전 — max(Σ①, Σ②) (Q-18 · Q-21)", () => {
  it("🔴 1990 상속 · PHD 없이 취득시 개별주택가격 4억 직접 입력 → ⑧·⑫ 모두 §164⑦ 토글로 막는다(사용자 결정 R-1 · 종전: ② = 직접 입력 4억 채택 688,935,000)", async () => {
    const r = await run(form(asset(Y1990, inh("300000000", "100000000"))));
    expect(r.issues.join()).toMatch(/개별주택가격 공시\(2005\.4\.30\.\) 전에 상속받은 주택분의 취득당시 기준시가는 §164⑦ 환산가액/);
    expect(r.status).toBe(400);
    expect(r.json.error.fieldErrors["mixedUse.usePreHousingDisclosure"][0]).toMatch(/§164⑦ 환산가액/);
  });

  it("🔴 1990 상속 · PHD 없이 ① 3억+1억 · 개별주택가격 비움 → 400(종전: ⑧ 통과 → API 500)", async () => {
    const r = await run(form(asset(Y1990, inh("300000000", "100000000"), { mixedAcqHousingPrice: "" } as Partial<AssetForm>)));
    expect(r.issues.join()).toMatch(/§164⑦ 환산가액/);
    expect(r.status).toBe(400);
  });

  it("🔴 1990 상속 PHD · 최초 고시일을 상속개시일 전으로 잘못 넣으면 고시일을 고치라고 안내한다(종전: 「3-시점 환산을 끄고 직접 입력」 — 끄면 R-1이 막아 순환)", async () => {
    const r = await run(form(asset(PHD, Y1990, inh("100000000", "100000000"), { phdFirstDisclosureDate: "1989-01-01" } as Partial<AssetForm>)));
    expect(r.issues.join()).toMatch(/개별주택가격은 2005\.4\.30\.에 처음 공시되었으므로/);
    expect(r.issues.join()).not.toMatch(/3-시점 환산을 끄고/);
  });

  it("1990 증여 · PHD 없음 → 같은 차단(⑧ 「증여받은」)", async () => {
    const r = await run(form(asset(Y1990, GIFT, { mixedHousingGiftValueOverride: "300000000", mixedCommercialGiftValueOverride: "100000000" } as Partial<AssetForm>)));
    expect(r.issues.join()).toMatch(/전에 증여받은 주택분의 취득당시 기준시가는 §164⑦ 환산가액/);
    expect(r.status).toBe(400);
  });

  it("🔴 1990 상속 PHD · ① 1억+1억 → 자산 합계 ② 채택 · 상가분도 ②(2억) · 740,595,000 → 709,095,000 (종전 파트별: 주택 ② · 상가 ①)", async () => {
    const r = await run(form(asset(PHD, Y1990, inh("100000000", "100000000"))));
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toMatchObject({ selected: "standard" });
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(200_000_000);
    expect(res.total.determinedTax).toBe(709_095_000);
  });

  it("🔴 2003 상속 PHD · ① 1억+1억 → 상가분은 건물 기준시가 고시(2001.1.1.) 뒤라 단서 밖 — ② 후보의 상가분도 ①(1억) · 주택분만 ②(§164⑦)로 (리뷰 F2 · Q-22)", async () => {
    // R-1 — 주택분 ②는 §164⑦(PHD) 336,000,000(종전 직접 입력 4억)
    const r = await run(form(asset(PHD, { acquisitionDate: "2003-03-01", inheritanceStartDate: "2003-03-01" } as Partial<AssetForm>, inh("100000000", "100000000"))));
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toMatchObject({ era: "clause", commercialOutsideClause: true, selected: "standard", standard: tot(336_000_000, 100_000_000) });
    expect(res.housingPart.estimatedAcquisitionPrice).toBe(336_000_000);
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(100_000_000);
  });

  it("2000-12-31 상속 PHD → 상가분도 단서 안 — ② 후보 상가분 2억", async () => {
    const r = await run(form(asset(PHD, { acquisitionDate: "2000-12-31", inheritanceStartDate: "2000-12-31" } as Partial<AssetForm>, inh("100000000", "100000000"))));
    const res = r.json.data.result;
    expect(res.sec163_9Comparison.commercialOutsideClause).toBeUndefined();
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(200_000_000);
  });

  it("2006 상속(공시 후) → 비교 구간이 아니다(종전 동작 · 키 없음)", async () => {
    const r = await run(form(asset({ acquisitionDate: "2006-03-01", inheritanceStartDate: "2006-03-01" } as Partial<AssetForm>, inh("300000000", "100000000"))));
    expect((r.body.mixedUse as Record<string, unknown>).sec163_9Compare).toBeUndefined();
    expect(r.json.data.result.sec163_9Comparison).toBeUndefined();
  });
});

describe("🔴 1985.1.1.~1990.8.29. 상속 × PHD × 토지등급 환산(§164④) — 화면 막다른 길 해소", () => {
  // 그날 전에는 개별공시지가가 없어 취득시 ㎡당 가액은 PHD 패널의 토지등급 환산에서 온다(직접 칸 비움).
  const Y1988 = {
    acquisitionDate: "1988-05-01",
    inheritanceStartDate: "1988-05-01",
    mixedAcqLandPricePerSqm: "",
    phdLandPricePerSqmAtAcq: "",
    pre1990Enabled: true,
    pre1990GradeMode: "number",
    pre1990Grade_current: "150",
    pre1990Grade_prev: "148",
    pre1990Grade_atAcq: "140",
    pre1990PricePerSqm_1990: "1000000",
  } as Partial<AssetForm>;

  it("① 1억+1억 → ⑧ 통과(종전: 겸용 화면에 없는 「§164⑤~⑦ 8개 항목」 칸으로 막음) · ②(§164⑦ + 상가) 채택", async () => {
    const r = await run(form(asset(PHD, Y1988, inh("100000000", "100000000"))));
    expect(r.issues.join()).not.toMatch(/8개 항목/);
    expect(r.issues.filter((m) => ACQ_ISSUE.test(m))).toEqual([]);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect((r.body.mixedUse as { acquisitionStandardPrice: { landPricePerSqm: number } }).acquisitionStandardPrice.landPricePerSqm).toBe(643_302);
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toMatchObject({ era: "clause", selected: "standard" });
    expect(res.housingPart.estimatedAcquisitionPrice).toBe(291_464_160);
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(144_330_200);
    expect(res.total.determinedTax).toBe(740_659_777);
  });

  it("① 비움 → ⑧ 통과(종전: 상가분 「개별공시지가」를 직접 칸만 봐서 막음 — ④는 등급 환산 값을 보낸다) · 같은 ② 채택", async () => {
    const r = await run(form(asset(PHD, Y1988)));
    expect(r.issues.filter((m) => ACQ_ISSUE.test(m))).toEqual([]);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    expect(r.json.data.result.sec163_9Comparison).toMatchObject({ reported: null, selected: "standard" });
    expect(r.json.data.result.total.determinedTax).toBe(740_659_777);
  });

  it("🔴 짝: 토지등급 4칸 중 하나를 비우면 ⑧이 막는다(PHD 취득시 공시지가 없음)", async () => {
    const r = await run(form(asset(PHD, Y1988, inh("100000000", "100000000"), { pre1990Grade_atAcq: "" } as Partial<AssetForm>)));
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues.join()).not.toMatch(/8개 항목/);
  });
});

describe("🔴 상속 PHD × 공통 자본적지출·양도비 — 주택분 몫도 공제한다(§100② 후문 · 리뷰 게이트 2026-10-24)", () => {
  const CX = { capitalExpenditure: "60000000", transferExpense: "20000000" } as Partial<AssetForm>;
  const ded = (p: { landAppraisalDed: number; buildingAppraisalDed: number }) => p.landAppraisalDed + p.buildingAppraisalDed;

  it("1990 상속 PHD · ① 1억+1억 · 자본적지출 6천만 + 양도비 2천만 → 주택분·상가분 몫의 합 8천만 · 687,203,276 → 683,895,000 (종전: 주택분 공제 0 · 합 68,965,518 — 주택분 양도비 몫 11,034,482 소실)", async () => {
    const r = await run(form(asset(PHD, Y1990, inh("100000000", "100000000"), CX)));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    const res = r.json.data.result;
    expect(ded(res.housingPart)).toBe(48_646_422);
    expect(ded(res.housingPart) + ded(res.commercialPart)).toBe(80_000_000);
    expect(res.total.determinedTax).toBe(683_895_000);
  });

  it("숨은 직접 칸(취득시 개별주택가격)에 남은 값이 있어도 같은 세액(종전: 공통 자본적지출 안분 축을 흔들어 숨은 값 9억이면 702,834,499)", async () => {
    const base = (await run(form(asset(PHD, Y1990, inh("100000000", "100000000"), CX)))).json.data.result.total.determinedTax;
    const stale = (await run(form(asset(PHD, Y1990, inh("100000000", "100000000"), CX, { mixedAcqHousingPrice: "900000000" } as Partial<AssetForm>)))).json.data.result.total.determinedTax;
    expect(stale).toBe(base);
  });

  it("1990 증여 PHD — 같은 규칙", async () => {
    const r = await run(form(asset(PHD, Y1990, GIFT, { mixedHousingGiftValueOverride: "100000000", mixedCommercialGiftValueOverride: "100000000" } as Partial<AssetForm>, CX)));
    const res = r.json.data.result;
    expect(ded(res.housingPart) + ded(res.commercialPart)).toBe(80_000_000);
  });
});

describe("🔴 공유지분 — ② 기준시가 후보도 지분분이다(리뷰 F1 · ①·③과 같은 축)", () => {
  const HALF = { ownershipNumerator: "1", ownershipDenominator: "2" } as Partial<AssetForm>;

  it("1990 상속 PHD 1/2 · ① 비움 → ② 지분분 주택 §164⑦ 168,000,000 + 상가 1억 (종전: 물건 전체 · R-1 전에는 직접 입력 주택 4억의 지분분 2억)", async () => {
    const r = await run(form(asset(HALF, PHD, Y1990)));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    const res = r.json.data.result;
    expect(res.housingPart.estimatedAcquisitionPrice).toBe(168_000_000);
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(100_000_000);
  });

  it("1980 상속 PHD 1/2 · ① 1억+1억(지분분 5천만+5천만) → ② 후보도 지분분(주택 168,000,000)으로 비교", async () => {
    const r = await run(form(asset(HALF, PHD, inh("100000000", "100000000"))));
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toMatchObject({ reported: tot(50_000_000, 50_000_000), standard: tot(168_000_000, 100_000_000) });
    expect(res.sec163_9Comparison.converted.total).toBeGreaterThan(268_000_000);
    expect(res.sec163_9Comparison.selected).toBe("converted");
  });

  it("1990 상속 PHD 1/2 · ① 비움 → ② 지분분 168,000,000의 토지·건물 비율은 물건 전체와 같다", async () => {
    const half = (await run(form(asset(HALF, PHD, Y1990)))).json.data.result.housingPart;
    const full = (await run(form(asset(PHD, Y1990)))).json.data.result.housingPart;
    expect(half.estimatedAcquisitionPrice).toBe(168_000_000);
    expect(full.estimatedAcquisitionPrice).toBe(336_000_000);
    expect(half.landAcqPrice + half.buildingAcqPrice).toBe(168_000_000);
    // 비율 분모가 지분분이면 토지분이 두 배가 된다
    expect(Math.abs(half.landAcqPrice * 2 - full.landAcqPrice)).toBeLessThanOrEqual(1);
  });

  it("2006 상속 1/2 · 주택 ①만(4억 → 지분분 2억) · 개별주택가격 없음 · 공통 자본적지출 1억 → 주택:상가 = 2억 : 상가 보충적 평가 지분분 1억", async () => {
    const r = await run(form(asset(HALF, {
      acquisitionDate: "2006-03-01",
      inheritanceStartDate: "2006-03-01",
      mixedAcqHousingPrice: "",
      mixedHousingInheritedValueOverride: "400000000",
      capitalExpenditure: "100000000",
    } as Partial<AssetForm>)));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    const h = r.json.data.result.housingPart;
    // 자본적지출 지분분 5천만 × 2억 ÷ 3억 (상가 축이 물건 전체 2억이면 × 2억 ÷ 4억 = 2,500만)
    expect(h.landAppraisalDed + h.buildingAppraisalDed).toBe(Math.floor((50_000_000 * 2) / 3));
  });

  it("2006 상속 1/2 · ① 비움(단서 밖 직접 경로) → 지분분 (전 구간 수정 · Q-23)", async () => {
    const r = await run(form(asset(HALF, { acquisitionDate: "2006-03-01", inheritanceStartDate: "2006-03-01" } as Partial<AssetForm>)));
    const res = r.json.data.result;
    expect(res.sec163_9Comparison).toBeUndefined();
    expect(res.housingPart.estimatedAcquisitionPrice).toBe(200_000_000);
    expect(res.commercialPart.estimatedAcquisitionPrice).toBe(100_000_000);
  });
});
