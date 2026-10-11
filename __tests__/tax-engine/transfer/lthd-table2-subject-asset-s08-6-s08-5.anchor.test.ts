/**
 * S08-6 · S08-5 anchor — 장기보유특별공제 표2(1세대1주택)의 **대상 자산 축**과 짝 주택 의제 전달.
 *
 * 「소득세법」 §95② 단서(현행 MST 280405 · 2015.5.13. 시행본 MST 170924 원문 확인): 표2는 「대통령령으로 정하는 1세대 1주택
 * (이에 딸린 토지를 포함한다)에 해당하는 **자산**」 전용이다. 대상은 ① 자산 축(주택·배율 이내 부수토지)과 ② 1주택 축
 * (「소득세법 시행령」 §159의4 — 주택 수 제외 후 1주택 ∨ §155·§156의2 등 의제)의 곱이다(`lthd-table2-subject.ts`).
 *
 * ## S08-6 (수정 전 실측)
 *  - 토지 단독 2015 양도 · 화면 기본값(1세대·1주택)이 그대로 전송돼 표2 80%(route 9,438,000) — 1세대 아님과 같은 표1 20%(77,935,000)여야 한다.
 *  - 일괄양도 **배율 초과** 카드(비사업용 토지 — §104의3①5호, 재산세과-791)가 `{...base}` 복제로 표2 60%(48,000,000).
 *    같은 사실의 단건 G-2 초과분은 표1 24%(19,200,000)다.
 *  - **판정 불가** 카드(면적 없음 → 배율 이내인지 모름)가 L-1b에서 표1·표2 중 큰 값 60%(90,000,000). 「모름 = 혜택 불성립」이라 표1 24%.
 * ## S08-5 (수정 전 실측)
 *  - 짝 주택이 §155① 일시적 2주택·조특법 §98의7 주택 수 제외로 1주택인데 부수토지 카드는 자기 원시 주택 수(2)로 표1(6,857,142) —
 *    단일 입력(4,801,500)과 1,697,142원 어긋남. 합산 엔진이 짝 주택의 표2 「1주택」 축을 `appurtenantHouseVerdict.oneHouseForTable2`로 넘긴다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { isLthdTable2SubjectAsset, resolveLthdTable2OneHouseAxis } from "@/lib/tax-engine/lthd-table2-subject";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "../../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TD = "2026-02-16";
const rates = loadFallbackTransferRates(new Date(TD));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(rates as never);
});

// ── 일괄양도 route 입력 (F13 계열) ───────────────────────────────────────────
/** 1세대1주택 · 2014 취득 · 거주 5년 · 수도권 주거지역(배율 3배) · 정착면적 100㎡ → 한도 300㎡ */
const primary = (house: number, land: number, over: object = {}) => ({
  propertyType: "housing",
  transferPrice: house,
  transferDate: TD,
  acquisitionPrice: house / 2,
  acquisitionDate: "2014-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 60,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: true,
  reductions: [],
  annualBasicDeductionUsed: 0,
  buildingFootprintArea: 100,
  isUrbanArea: true,
  appurtenantLandZone: "metropolitan_residential",
  totalSalePrice: house + land,
  standardPriceAtTransferForApportion: house / 1000,
  ...over,
});
const land = (price: number, over: object = {}) => ({
  assetId: "c1",
  assetLabel: "부수토지",
  assetKind: "land",
  landNature: "appurtenant_to_housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-01",
  fixedAcquisitionPrice: price / 2,
  standardPriceAtTransfer: price / 1000,
  directExpenses: 0,
  isOneHousehold: true,
  areaM2: 200,
  reductions: [],
  ...over,
});
type Prop = { propertyId: string; rateGroup: string; longTermHoldingDeduction: number; isExempt?: boolean };
type Agg = { totalTax: number; warnings?: string[]; properties: Prop[] };
async function post(body: object): Promise<Agg> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data!.aggregated;
}
const byId = (a: Agg, id: string) => a.properties.find((p) => p.propertyId === id)!;

describe("S08-6 — 표2 대상 자산 축 leaf", () => {
  it("주택은 대상, 순수 토지·건물·상가는 아니다 — 토지는 배율 이내로 확인된 부수토지 카드만", () => {
    expect(isLthdTable2SubjectAsset({ propertyType: "housing" })).toBe(true);
    expect(isLthdTable2SubjectAsset({ propertyType: "land" })).toBe(false);
    expect(isLthdTable2SubjectAsset({ propertyType: "land", oneHouseUnitRole: "appurtenant_land" })).toBe(true);
    expect(isLthdTable2SubjectAsset({ propertyType: "land", oneHouseUnitRole: "house" })).toBe(false);
    for (const t of ["building", "commercial_building", "general_building", "general_building_unit"] as const) {
      expect(isLthdTable2SubjectAsset({ propertyType: t }), t).toBe(false);
    }
  });
  it("1주택 축 — 1세대 아님은 아니다 · 주택 수 1 ∨ 의제", () => {
    expect(resolveLthdTable2OneHouseAxis({ isOneHousehold: true, householdHousingCount: 1 }, undefined)).toBe(true);
    expect(resolveLthdTable2OneHouseAxis({ isOneHousehold: true, householdHousingCount: 2 }, undefined)).toBe(false);
    expect(resolveLthdTable2OneHouseAxis({ isOneHousehold: true, householdHousingCount: 2 }, true)).toBe(true);
    expect(resolveLthdTable2OneHouseAxis({ isOneHousehold: false, householdHousingCount: 1 }, true)).toBe(false);
  });
});

describe("S08-6 — 토지·건물 단독 양도는 1세대1주택 플래그가 있어도 표1", () => {
  const landSolo = (over: object) => ({
    propertyType: "land",
    transferPrice: 500_000_000,
    transferDate: "2015-06-01",
    acquisitionPrice: 200_000_000,
    acquisitionDate: "2005-01-01",
    acquisitionCause: "purchase",
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    ...over,
  });
  async function postSingle(body: object) {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    return json.data.result;
  }

  it("🔑 토지 단독 2015 양도 · 기본 세대 플래그 → 1세대 아님과 같은 공제율·공제액 (수정 전 0.8 vs 0.2 · 240,000,000 vs 60,000,000)", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
    const a = await postSingle(landSolo({}));
    const b = await postSingle(landSolo({ isOneHousehold: false, householdHousingCount: 2 }));
    expect(a.longTermHoldingRate).toBe(b.longTermHoldingRate);
    expect(a.longTermHoldingDeduction).toBe(b.longTermHoldingDeduction);
    // 표1이면 최대 30% — 표2(2015 양도는 보유 연 8%·10년 80%)가 아니다. (표1 공제율 연혁은 이 anchor 밖이다.)
    expect(a.longTermHoldingRate).toBeLessThanOrEqual(0.3);
    expect(a.totalTax).toBe(b.totalTax);
    // 산식 문구도 표1이다 — 표2 문구(「보유 N년×4%」)가 나오면 공제율과 어긋난다.
    const s = (a.steps as { label: string; formula: string }[]).find((x) => x.label === "장기보유특별공제");
    expect(s?.formula).not.toContain("×4%");
  });

  it("건물(일반건물) 단독 양도도 같다", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
    const a = await postSingle(landSolo({ propertyType: "building" }));
    const b = await postSingle(landSolo({ propertyType: "building", isOneHousehold: false, householdHousingCount: 2 }));
    expect(a.longTermHoldingRate).toBe(b.longTermHoldingRate);
  });

  it("긍정 짝 — 주택 단독 1세대1주택(거주 요건 충족)은 표2 그대로", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_500_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date("2024-06-01"),
        householdHousingCount: 1,
        isOneHousehold: true,
        residencePeriodMonths: 60,
      } as Partial<TransferTaxInput>),
      makeMockRates(),
    );
    expect(r.longTermHoldingRate).toBeCloseTo(0.6, 10); // 보유 10년 40% + 거주 5년 20%
  });

  it("④ 폼(기본 세대 플래그 · 토지 자산만) → ⑫ → ⑭ route — 토지 단독 2015 양도 표1", async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
    const mk = (one: boolean) => {
      const f = createDefaultTransferFormData();
      const asset = {
        ...makeDefaultAsset(1),
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2005-01-01",
        fixedAcquisitionPrice: "200000000",
        actualSalePrice: "500000000",
        addressJibun: "서울 테스트동 1",
      } as unknown as AssetForm;
      return {
        ...f,
        transferDate: "2015-06-01",
        contractTotalPrice: "500000000",
        isOneHousehold: one,
        householdHousingCount: one ? "1" : "2",
        householdNoOtherHousesConfirmed: true,
        householdNoPresaleRightsConfirmed: true,
        assets: [asset],
      };
    };
    const a = await runCalc(mk(true) as never);
    const b = await runCalc(mk(false) as never);
    expect(a.status).toBe(200);
    expect(a.body.propertyType).toBe("land");
    expect(a.result.longTermHoldingRate).toBe(b.result.longTermHoldingRate);
    expect(a.result.longTermHoldingRate).toBeLessThanOrEqual(0.3); // 표2 80%가 아니다 (표1 연혁은 이 anchor 밖)
  });
});

describe("S08-6 — 일괄양도 배율 초과 카드·판정 불가 카드는 표1", () => {
  it("🔑 F13-3 배율 초과(면적 500㎡ > 한도 300㎡) → 초과 카드 표1 24% · 공제 19,200,000 (수정 전 표2 60% · 48,000,000)", async () => {
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000, { areaM2: 500 })] });
    expect(byId(a, "c1__excess").rateGroup).toBe("non_business_land");
    expect(byId(a, "c1__excess").longTermHoldingDeduction).toBe(19_200_000);
    // 주택 수 2(1세대 아님) 대조군의 초과 카드와 같다 — 1세대1주택 여부가 초과 카드의 공제율을 가르지 않는다.
    const two = await post({
      ...primary(1_000_000_000, 400_000_000, { householdHousingCount: 2 }),
      companionAssets: [land(400_000_000, { areaM2: 500 })],
    });
    expect(byId(two, "c1__excess").longTermHoldingDeduction).toBe(19_200_000);
  });

  it("🔑 F13-5 면적 없음(배율 이내인지 판정 불가) → 카드 표1 24% · 공제 48,000,000 (수정 전 표1·표2 중 큰 값 60% · 120,000,000)", async () => {
    // 「모름 = 혜택 불성립」 — 비과세도 표2도 주지 않는다. 경고는 종전 그대로 낸다.
    // 부수토지 400,000,000 − 취득 200,000,000 = 양도차익 200,000,000 × 표1 12년 24% = 48,000,000.
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000, { areaM2: undefined })] });
    expect(a.warnings?.join("\n") ?? "").toContain("배율 이내인지 판정하지 못했습니다");
    expect(byId(a, "c1").isExempt).not.toBe(true);
    expect(byId(a, "c1").longTermHoldingDeduction).toBe(48_000_000);
    // 1세대 아님(주택 수 2) 대조군의 같은 카드와 같다.
    const two = await post({
      ...primary(1_000_000_000, 400_000_000, { householdHousingCount: 2 }),
      companionAssets: [land(400_000_000, { areaM2: undefined })],
    });
    expect(byId(two, "c1").longTermHoldingDeduction).toBe(48_000_000);
  });

  it("긍정 짝 — 배율 이내로 확인된 부수토지(면적 200㎡ ≤ 300㎡) 카드는 표2 60% 그대로", async () => {
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000)] });
    // 주택(10억) + 부수토지(4억) = 14억 합산 — 부수토지 장특은 표2 60%(양도차익 × 12억 초과분 비율 후)
    expect(byId(a, "c1").longTermHoldingDeduction).toBe(17_142_856);
  });
});

describe("S08-5 — 의제·제외로 1주택인 짝 주택의 부수토지 카드도 표2", () => {
  const singleTax = (over: Partial<TransferTaxInput>) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferPrice: 1_400_000_000,
        acquisitionPrice: 700_000_000,
        acquisitionDate: new Date("2014-01-01"),
        transferDate: new Date(TD),
        householdHousingCount: 1,
        isOneHousehold: true,
        residencePeriodMonths: 60,
        ...over,
      } as Partial<TransferTaxInput>),
      rates,
    ).totalTax;

  it("🔑 §155① 일시적 2주택 → 부수토지 장특 17,142,856(표2 60%) · 합계 4,801,500 = 단일 입력 (수정 전 6,857,142 · 6,498,642)", async () => {
    const a = await post({
      ...primary(1_000_000_000, 400_000_000, {
        householdHousingCount: 2,
        temporaryTwoHouse: { previousAcquisitionDate: "2014-01-01", newAcquisitionDate: "2025-06-01" },
      }),
      companionAssets: [land(400_000_000)],
    });
    expect(byId(a, "c1").longTermHoldingDeduction).toBe(17_142_856);
    expect(a.totalTax).toBe(4_801_500);
    expect(a.totalTax).toBe(
      singleTax({
        householdHousingCount: 2,
        temporaryTwoHouse: { previousAcquisitionDate: new Date("2014-01-01"), newAcquisitionDate: new Date("2025-06-01") },
      } as never),
    );
  });

  it("🔑 조특법 §98의7 주택 수 제외(count 2) → 같은 값 4,801,500", async () => {
    const a = await post({
      ...primary(1_000_000_000, 400_000_000, {
        householdHousingCount: 2,
        specialHouseExclusions: [{ article: "unsold_98_7", houseAcquisitionDate: "2012-10-15", requirementsConfirmed: true }],
      }),
      companionAssets: [land(400_000_000)],
    });
    expect(byId(a, "c1").longTermHoldingDeduction).toBe(17_142_856);
    expect(a.totalTax).toBe(4_801_500);
  });

  it("대조 · 부정 짝 — 의제도 제외도 없는 진짜 2주택이면 부수토지 카드는 표1(전액 과세 · 200,000,000 × 24% = 48,000,000) — 표2를 주지 않는다", async () => {
    const a = await post({
      ...primary(1_000_000_000, 400_000_000, { householdHousingCount: 2 }),
      companionAssets: [land(400_000_000)],
    });
    expect(byId(a, "c1").longTermHoldingDeduction).toBe(48_000_000);
  });

  it("긍정 짝 · 실제 1주택(count 1)은 종전과 같다 — 4,801,500", async () => {
    const a = await post({ ...primary(1_000_000_000, 400_000_000), companionAssets: [land(400_000_000)] });
    expect(a.totalTax).toBe(4_801_500);
  });
});
