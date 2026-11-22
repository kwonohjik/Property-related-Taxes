/**
 * anchor — 재개발(완공 APT·원조합원 입주권)·다필지 자산이 **일괄 신고**에 들어가면 기본공제를 「소득세법」 §103②대로
 * **감면소득금액 외의 양도소득금액에서 먼저** 공제하고, §90① `A × (B − C) / D × E`의 B·E를 감면율 前 버킷으로 복원한다.
 * (§155⑳ 경로 #3586과 같은 결함의 형제 경로 — 연간 합산은 화면 ⑧·Zod가 두 자산을 막아 도달하지 않는다.)
 *
 * 종전(master 8c34879fc 실측 · 워크플로 측정 + 독립 반박 재현):
 *   재개발 — ⓐ 결과가 `reducibleIncomeBuckets`를 싣지 않아 집계가 율이 곱해진 `reducibleIncome`을 B(율 1)로 합성했고,
 *            ⓑ 집계가 `skipBasicDeduction: true`로 불러도 `transfer-tax-redevelopment.ts`가 기본공제 2,500,000을 또 뺐다.
 *            ⇒ 기본공제가 감면 주택에 붙어 §77 감면 과소·총세액 과다(현금 + 토지 3억: 486,423,447 → 486,334,504).
 *   다필지 — ⓐ만(ⓑ는 이미 skip을 본다). 함께 양도한 자산의 소득이 기본공제보다 작을 때(C > 0) C를 율 없이 빼
 *            감면 과대·총세액 과소(§77 현금: 150,205,778 → 150,289,100 · 일반 경로 대조군과 같다).
 *
 * 세액은 mock 세율표 값이다(구조 증거). 다필지는 같은 실행의 일반 경로(parcelMode 끔) 대조군과 비교하고,
 * 재개발은 §90① 손계산 기대값(A·D = 집계 산출세액·과세표준, B = §77 상세 cashIncome·bondIncome, E = 율)을 원 단위로 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../tax-engine/transfer-tax/redevelopment/_helpers";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";

vi.mock("@/lib/db/tax-rates", async (io) => {
  const a = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...a, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;
const agg = (r: { status: number; json: { data: { aggregated: AggregateTransferResult } } }) => {
  expect(r.status).toBe(200);
  return r.json.data.aggregated;
};
const basicOf = (a: AggregateTransferResult) => a.properties.map((p) => p.allocatedBasicDeduction);

// ── 재개발 ────────────────────────────────────────────────────────────
const EXPR_CASH = { type: "public_expropriation", expropriationCash: "2000000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2022-01-01" };
const EXPR_MIX = { ...EXPR_CASH, expropriationCash: "1000000000", expropriationBond: "1000000000" };
const RIGHT = { assetKind: "right_to_move_in", redevSubject: "right" };
const landOf = (sale: string) => ({ assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", fixedAcquisitionPrice: "100,000,000", actualSalePrice: sale, addressJibun: "제주특별자치도 테스트동 9" });

function redevForm(reduction: Obj, landSale: string | null, extra: Obj = {}) {
  const assetOver = { reductions: [reduction], transferCause: "public_expropriation", expropriationNoticeDate: "2022-01-01", ...extra };
  const f = redevAptForm({ count: "2", houses: [houseRow("h2", "2012-01-01", { acquisitionOrigin: "general" } as never)], formOver: { isOneHousehold: true }, assetOver });
  if (landSale) {
    f.assets.push({ ...makeDefaultAsset(2), ...landOf(landSale) } as never);
    Object.assign(f, { contractTotalPrice: String(2_000_000_000 + Number(landSale.replace(/,/g, ""))), bundledSaleMode: "actual" });
  }
  return f;
}

describe("재개발 일괄 — §103② 기본공제는 감면 외 소득(토지)에서 먼저 · §90① B는 율 前 버킷", () => {
  it("RD-1 완공 APT §77 현금 10% + 토지 3억 — 기본공제는 토지에 · 감면 = 476,535,000 × 1,064,000,000 × 10% / 1,205,500,000", async () => {
    const a = agg(await runCalc(redevForm(EXPR_CASH, "300,000,000")));
    expect(basicOf(a)).toEqual([0, 2_500_000]);
    expect(a.reductionAmount).toBe(42_059_995);
    expect(a.totalTax).toBe(486_334_504);
  });

  it("RD-2 토지 소득 720,000 < 기본공제 — C = 1,780,000이 현금 버킷(10%)에서 빠진다", async () => {
    const a = agg(await runCalc(redevForm(EXPR_CASH, "101,000,000")));
    expect(basicOf(a)).toEqual([1_780_000, 720_000]);
    expect(a.reductionAmount).toBe(41_205_900);
    expect(a.totalTax).toBe(416_179_590);
  });

  it("RD-3 §77 현금 10%·채권 15% 혼합 + 토지 3억 — 두 버킷 율 그대로", async () => {
    const a = agg(await runCalc(redevForm(EXPR_MIX, "300,000,000")));
    expect(a.reductionAmount).toBe(52_574_993);
    expect(a.totalTax).toBe(476_871_005);
  });

  it("RD-4 원조합원 입주권 §77 현금 + 토지 3억 — 같은 경로", async () => {
    const a = agg(await runCalc(redevForm(EXPR_CASH, "300,000,000", RIGHT)));
    expect(basicOf(a)).toEqual([0, 2_500_000]);
    expect(a.reductionAmount).toBe(57_903_535);
    expect(a.totalTax).toBe(648_295_318);
  });

  it("RD-5 단건(완공 APT만) — 감면 외 소득이 없어 C = 2,500,000 그대로(종전과 같다)", async () => {
    const r = await runCalc(redevForm(EXPR_CASH, null));
    expect(r.status).toBe(200);
    const res = r.json.data.result as Obj;
    expect(res.basicDeduction).toBe(2_500_000);
    expect(res.reductionAmount).toBe(41_173_500);
    expect(res.totalTax).toBe(415_852_350);
  });

  it("RD-6 엔진 — skipBasicDeduction: true면 기본공제 0·기본공제 단계 없음 · §77 버킷(율 前 B)을 싣는다", () => {
    const input = baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice: 525_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2005-04-09"),
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      redevelopment: case44RedevelopmentInfo(),
      reductions: [{ type: "public_expropriation", cashCompensation: 525_000_000, bondCompensation: 0, businessApprovalDate: new Date("2025-01-10") }],
    } as Partial<TransferTaxInput>);
    const rates = makeMockRates();
    const skip = calculateTransferTax({ ...input, skipBasicDeduction: true }, rates);
    expect(skip.redevelopmentDetail).toBeDefined();
    expect(skip.basicDeduction).toBe(0);
    expect(skip.steps.some((s) => s.label === "기본공제")).toBe(false);
    expect(skip.reducibleIncomeBuckets).toEqual([{ income: 201_912_143, rate: 0.15 }]);
    const normal = calculateTransferTax(input, rates);
    expect(normal.basicDeduction).toBe(2_500_000);
    expect(normal.steps.some((s) => s.label === "기본공제")).toBe(true);
  });
});

// ── 다필지 ────────────────────────────────────────────────────────────
const MP_CASH = { type: "public_expropriation", expropriationCash: "1000000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2024-01-01" };
const MP_MIX = { ...MP_CASH, expropriationCash: "600000000", expropriationBond: "400000000" };
const MP_RL = { type: "replacement_land_comp", rlCashComp: "0", rlLandComp: "1000000000" };
const parcel = (id: string) => ({ id, acquisitionDate: "2014-01-02", acquisitionMethod: "actual", acquisitionArea: "150", transferArea: "150", acquisitionPrice: "200000000", expenses: "0", capitalExpenditure: "0", transferExpense: "0",
  standardPricePerSqmAtAcq: "", standardPricePerSqmAtTransfer: "", useDayAfterReplotting: false, replottingConfirmDate: "", useExchangeLandReduction: false, entitlementArea: "", allocatedArea: "", priorLandArea: "", compensationPerSqm: "", compensationBasisStdPrice: "" });

function mpForm(parcelMode: boolean, reduction: Obj, companionAcq: string) {
  const f = createDefaultTransferFormData();
  const primary = {
    ...makeDefaultAsset(1), assetKind: "land", landNature: "standalone", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
    fixedAcquisitionPrice: "400,000,000", actualSalePrice: "1,000,000,000",
    ...(parcelMode ? { parcelMode: true, parcels: [parcel("p1"), parcel("p2")] } : {}),
    reductions: [reduction], transferCause: "public_expropriation", expropriationNoticeDate: "2020-01-01",
  };
  const companion = { ...makeDefaultAsset(2), assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300", transferArea: "300", fixedAcquisitionPrice: companionAcq, actualSalePrice: "300,000,000", addressJibun: "서울 강남구 테스트동 2" };
  f.assets = [primary as never, companion as never];
  Object.assign(f, { transferDate: "2026-09-18", filingDate: "2026-11-30", contractTotalPrice: "1300000000", bundledSaleMode: "actual", householdHousingCount: "0", isOneHousehold: true });
  return f;
}

describe("다필지 일괄 — §90① B·E 버킷을 실어 일반 경로(필지 1개)와 같은 배분·같은 감면", () => {
  const SMALL = "299,000,000"; // 함께 양도한 토지 소득금액 700,000 < 기본공제 → C > 0
  for (const [name, red, reduction, total, basic] of [
    ["MP-1 §77 현금 15%", MP_CASH, 23_361_000, 150_289_100, [1_800_000, 700_000]],
    ["MP-2 §77 현금 15%·채권 20%", MP_MIX, 26_488_143, 147_474_670, undefined],
    ["MP-3 §77의2 대토 40%", MP_RL, 62_296_000, 115_247_600, undefined],
  ] as const) {
    it(`${name} · 함께 양도 소득 < 기본공제 — 일반 경로 대조군과 같다`, async () => {
      const mp = agg(await runCalc(mpForm(true, red, SMALL)));
      const gen = agg(await runCalc(mpForm(false, red, SMALL)));
      expect(mp.reductionAmount).toBe(gen.reductionAmount);
      expect(mp.totalTax).toBe(gen.totalTax);
      expect(basicOf(mp)).toEqual(basicOf(gen));
      expect(mp.reductionAmount).toBe(reduction);
      expect(mp.totalTax).toBe(total);
      if (basic) expect(basicOf(mp)).toEqual(basic);
    });
  }

  it("MP-4 §77 현금 · 함께 양도 소득 ≥ 기본공제(C = 0) — 세액은 종전과 같고 기본공제는 토지에", async () => {
    const mp = agg(await runCalc(mpForm(true, MP_CASH, "100,000,000")));
    expect(basicOf(mp)).toEqual([0, 2_500_000]);
    expect(mp.reductionAmount).toBe(24_585_967);
    expect(mp.totalTax).toBe(212_535_629);
  });
});
