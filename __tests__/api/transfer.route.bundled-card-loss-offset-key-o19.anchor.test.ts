/**
 * 함께 양도 × 부수토지 카드 — §102② 차손 통산의 «같은 세율» 키(`lossOffsetRateKey`)가 주택·카드에서 일관된다
 * (계획서 `docs/02-design/features/land-only-o19-loss-offset-card-key.plan.md` O-19 · Q-1 a — 코드 불변, 안전망 추가).
 *
 * 「소득세법 시행령」 §167의2①: 양도차손은 ① 같은 세율을 적용받는 자산의 양도소득금액에서 먼저, ② 다른 세율 자산에서 안분해 공제한다.
 * 키가 깨지면 ①이 조용히 ②로 떨어져 세액이 바뀌는데(`loss-offset-rate-key.ts` 헤더 — 실측 각 5,197,222원), 번들 × 통산을 보는 테스트가 없었다
 * (카드 키를 `solo:`로 깨도 bundled*·companion*·calc 791개 파일이 전부 통과 — 계획서 V-5).
 *
 * 독립 산식(2026-06-15 양도 · 조정지역 · 모의 세율표 · 기본공제 2,500,000):
 *   - 단기 60%: (주택 900,000,000 + 카드 ± 200,000,000 − 2,500,000) × 60% × 1.1 (지방소득세 10%)
 *       이익 → 724,350,000 / 차손 → (900,000,000 − 200,000,000 − 2,500,000) × 60% × 1.1 = 460,350,000
 *   - 주택 2014(2주택 중과 §104⑦1호 = 누진 + 20%p) · 카드 2025 차손(단일 60%, 다른 세율): 소득 697,500,000 × 62%(42% 구간 − 35,940,000 + 20%p) = 396,510,000 → × 1.1 = 436,161,000
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { capResidenceToHolding } from "../calc/_helpers/held-residence";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const LOSS_PRICE = 600_000_000; // 양도 4억 − 취득 6억 = 차손 2억
const GAIN_PRICE = 200_000_000; // 양도 4억 − 취득 2억 = 차익 2억

const landCard = (id: string, acquisitionDate: string, fixedAcquisitionPrice: number) => ({
  assetId: id, assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate,
  fixedAcquisitionPrice, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: 100, reductions: [],
});

/** 주택(주 카드) 16억·취득 7억 + 자기 토지 100㎡ — 카드는 `companionAssets`로 얹는다 */
const forward = (houseAcq: string, householdHousingCount: number, companionAssets: Loose[]) => ({
  propertyType: "housing", transferPrice: 1_600_000_000, transferDate: "2026-06-15", acquisitionPrice: 700_000_000, acquisitionDate: houseAcq,
  acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount, residencePeriodMonths: 12, isRegulatedArea: true,
  wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, reductions: [], annualBasicDeductionUsed: 0,
  ...ZONE, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, isSeparateAcquisition: true, landAcquisitionDate: houseAcq,
  landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: 800_000_000, buildingTransferPrice: 800_000_000,
  landAcquisitionPrice: 400_000_000, buildingAcquisitionPrice: 300_000_000, acquisitionArea: 100, transferArea: 100,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000, companionAssets,
});

/** 역방향 — 부수토지가 첫 자산, 주택이 컴패니언 */
const reverse = (houseAcq: string, cardAcq: string, cardPrice: number, householdHousingCount: number) => ({
  transferDate: "2026-06-15", acquisitionDate: cardAcq, acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 12,
  isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
  isOneHousehold: true, householdHousingCount, propertyType: "land", landNature: "appurtenant_to_housing", transferPrice: 400_000_000, acquisitionPrice: cardPrice,
  acquisitionArea: 100, transferArea: 100, ...ZONE, totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 400_000,
  companionAssets: [{
    assetId: "h1", assetLabel: "주택", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: houseAcq, fixedAcquisitionPrice: 700_000_000,
    standardPriceAtTransfer: 1_600_000, directExpenses: 0, isOneHousehold: true, reductions: [], ...ZONE,
    companionHousingLand: { landAreaM2: 100, footprintM2: 100, zone: "metropolitan_residential" },
  }],
});

type Row = { propertyId: string; appliedRate: number; rateClause?: string; lossOffsetRateKey: string; income: number };
type Table = { fromPropertyId: string; toPropertyId: string; amount: number; scope: string };
type Agg = { totalTax: number; properties: Row[]; lossOffsetTable: Table[] };
async function agg(body: Loose): Promise<Agg> {
  const res = await postTransfer(capResidenceToHolding(body));
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated as Agg;
}
const row = (a: Agg, id: string) => a.properties.find((p) => p.propertyId === id)!;
const tableOf = (a: Agg) => a.lossOffsetTable.map((t) => `${t.fromPropertyId}->${t.toPropertyId}:${t.amount}:${t.scope}`);

describe("O-19 — 단기 2주택(주택·카드 모두 2025-01-01): 카드 키 = 주택 키 `rate:0.6`", () => {
  it("🔑 K1 카드 차익: 두 행 모두 60% · 104-1-2 · `rate:0.6` · 통산 없음 · 합계 724,350,000", async () => {
    const a = await agg(forward("2025-01-01", 2, [landCard("c1", "2025-01-01", GAIN_PRICE)]));
    for (const id of ["primary", "c1"]) {
      const r = row(a, id);
      expect([r.appliedRate, r.rateClause, r.lossOffsetRateKey], id).toEqual([0.6, "104-1-2", "rate:0.6"]);
    }
    expect(a.lossOffsetTable).toEqual([]);
    expect(a.totalTax).toBe(724_350_000); // (900,000,000 + 200,000,000 − 2,500,000) × 60% × 1.1
  });

  it("🔑 K2 카드 차손: 차손 카드도 같은 키 `rate:0.6` → 1호 `same_group` 한 줄 · 합계 460,350,000 (차손 카드의 세율은 차손 결과 에코 또는 calcTax(0) 재계산값)", async () => {
    const a = await agg(forward("2025-01-01", 2, [landCard("c1", "2025-01-01", LOSS_PRICE)]));
    expect(row(a, "c1").income).toBe(-200_000_000);
    expect([row(a, "primary").lossOffsetRateKey, row(a, "c1").lossOffsetRateKey]).toEqual(["rate:0.6", "rate:0.6"]);
    expect(tableOf(a)).toEqual(["c1->primary:200000000:same_group"]);
    expect(a.totalTax).toBe(460_350_000); // (900,000,000 − 200,000,000 − 2,500,000) × 60% × 1.1
  });

  it("K3 1주택(비중과)도 같다 — 주택·카드 단기 60%: 차손은 `same_group`, 합계 460,350,000", async () => {
    const a = await agg(forward("2025-01-01", 1, [landCard("c1", "2025-01-01", LOSS_PRICE)]));
    expect(tableOf(a)).toEqual(["c1->primary:200000000:same_group"]);
    expect(a.totalTax).toBe(460_350_000);
  });
});

describe("O-19 — 세율이 실제로 다르면 키도 다르다(거짓 병합 방지)", () => {
  it("🔑 K4 주택 2014(2주택 중과 `prog:104-7-1`) · 카드 2025 차손(단일 60% `rate:0.6`): `other_group` · 합계 436,161,000", async () => {
    const a = await agg(forward("2014-01-01", 2, [landCard("c1", "2025-01-01", LOSS_PRICE)]));
    expect(row(a, "primary").lossOffsetRateKey).toBe("prog:104-7-1");
    expect(row(a, "c1").lossOffsetRateKey).toBe("rate:0.6");
    expect(tableOf(a)).toEqual(["c1->primary:200000000:other_group"]);
    expect(a.totalTax).toBe(436_161_000);
  });

  it("K5 주택·카드 모두 2014(2주택 중과): 둘 다 `prog:104-7-1` → `same_group`", async () => {
    const a = await agg(forward("2014-01-01", 2, [landCard("c1", "2014-01-01", LOSS_PRICE)]));
    expect([row(a, "primary").lossOffsetRateKey, row(a, "c1").lossOffsetRateKey]).toEqual(["prog:104-7-1", "prog:104-7-1"]);
    expect(tableOf(a)).toEqual(["c1->primary:200000000:same_group"]);
  });
});

describe("O-19 — 입력 순서(주택 먼저 ↔ 부수토지 먼저)와 무관하게 같은 통산", () => {
  it("🔑 K6 단기 · 차손: 순 = 역 — 합계 460,350,000 · scope `same_group` · 금액 200,000,000", async () => {
    const f = await agg(forward("2025-01-01", 2, [landCard("c1", "2025-01-01", LOSS_PRICE)]));
    const r = await agg(reverse("2025-01-01", "2025-01-01", LOSS_PRICE, 2));
    expect([f.totalTax, r.totalTax]).toEqual([460_350_000, 460_350_000]);
    expect(f.lossOffsetTable.map((t) => [t.amount, t.scope])).toEqual([[200_000_000, "same_group"]]);
    expect(r.lossOffsetTable.map((t) => [t.amount, t.scope])).toEqual([[200_000_000, "same_group"]]);
  });

  it("K7 주택 2014 · 카드 2025 차손: 순 = 역 = 436,161,000 · 둘 다 `other_group`", async () => {
    const f = await agg(forward("2014-01-01", 2, [landCard("c1", "2025-01-01", LOSS_PRICE)]));
    const r = await agg(reverse("2014-01-01", "2025-01-01", LOSS_PRICE, 2));
    expect([f.totalTax, r.totalTax]).toEqual([436_161_000, 436_161_000]);
    expect(f.lossOffsetTable.map((t) => t.scope)).toEqual(["other_group"]);
    expect(r.lossOffsetTable.map((t) => t.scope)).toEqual(["other_group"]);
  });
});

describe("O-19 — 3행(주택 + 차손 카드 + 이익 카드): 차손은 같은 세율에 먼저(1호), 다른 세율 카드로는 가지 않는다", () => {
  const cards = (swap: boolean) => {
    const loss = landCard("c1", "2014-01-01", LOSS_PRICE); // 주택과 같은 2014 → 같은 세율
    const gain = landCard("c2", "2025-01-01", GAIN_PRICE); // 단기 60% → 다른 세율
    return swap ? [gain, loss] : [loss, gain];
  };

  it.each([
    ["2주택 중과", 2],
    ["1주택", 1],
  ])("🔑 K8 %s — c1(차손, 주택과 같은 세율) → primary `same_group` 한 줄만, c2(이익, 다른 세율)로는 안 간다 (카드 순서 교환에도 동일)", async (_n, hc) => {
    for (const swap of [false, true]) {
      const a = await agg(forward("2014-01-01", hc, cards(swap)));
      expect(a.lossOffsetTable, `swap=${swap}`).toHaveLength(1);
      const t = a.lossOffsetTable[0];
      expect([t.fromPropertyId, t.toPropertyId, t.scope]).toEqual(["c1", "primary", "same_group"]);
      // 부수토지 단위 몫 정수 분배의 1원 잔액만 입력 순서에 따라 움직인다(계획서 O-23 — 기록만)
      expect(t.amount).toBeGreaterThanOrEqual(hc === 2 ? 266_666_666 : 106_666_666);
      expect(t.amount).toBeLessThanOrEqual(hc === 2 ? 266_666_667 : 106_666_667);
      expect(row(a, "c2").income).toBeGreaterThan(0);
    }
  });
});
