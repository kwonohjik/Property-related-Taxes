/**
 * 부수토지 카드의 세율군 이름 — 엔진이 정한 호(`104-1-2/3`)를 따른다
 * (계획서 `docs/02-design/features/appurtenant-card-o22-v9-o20-display.plan.md` O-20 · Q-3 a).
 *
 * 카드는 일체과세(§104①2호 괄호·영 §167의5)로 **짝 주택의 단기 호**를 적용받는데, `classifyRateGroup`이 카드 **자기 취득일**(2014 → 24개월 이상)로 가르면
 * 군이 `progressive`가 돼 «일반 누진 60%» 행이 따로 남았다(단일 60%인데 «누진»). 세액은 같다 — 군 이름은 기본공제 대상(`unregistered`만 제외)·군별 몫 합계에 영향이 없다.
 *
 * 독립 산식(모의 세율표 · 양도 2026-06-15 · 주택 1,600,000,000(취득 800,000,000, 2025-01-01) · 부수토지 400,000,000(취득 200,000,000, 2014-01-01) 100㎡ · 기본공제 2,500,000):
 *   · 중과 짝(2주택·조정): (800,000,000 + 200,000,000 − 2,500,000) × 60% = 598,500,000 → ×1.1 = **658,350,000**(장특 배제).
 *   · 비중과(1주택·비조정): 카드 장특 12년 24% = 48,000,000 → (800,000,000 + 152,000,000 − 2,500,000) × 60% = 569,700,000 → ×1.1 = **626,670,000**.
 * 취득일이 달라 «합쳐 입력»과는 같은 사실이 아니다(토지 취득일이 하나뿐) — 대조하지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { capResidenceToHolding } from "../calc/_helpers/held-residence";
import { AggregatedTaxSummary } from "@/components/calc/results/BundledAllocationSubCards";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const land = (id: string, acq: string, area: number) => ({
  assetId: id, assetLabel: `부수토지 ${id}`, assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: acq,
  fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: area, reductions: [],
});
const COMMON = {
  transferDate: "2026-06-15", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 60,
  isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
  isOneHousehold: true, householdHousingCount: 2,
};
const NON_SUR = { householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false };
const fwd = (houseAcq: string, cardAcq: string, area = 100, over: Loose = {}) => ({
  ...COMMON, ...ZONE, propertyType: "housing", acquisitionDate: houseAcq, transferPrice: 1_600_000_000, acquisitionPrice: 800_000_000, acquisitionArea: area,
  totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, companionAssets: [land("c1", cardAcq, area)], ...over,
});

async function run(body: Loose) {
  const res = await postTransfer(capResidenceToHolding(body));
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  const aggregated = (res.json as Loose).data.aggregated;
  const { container } = render(<AggregatedTaxSummary aggregated={aggregated} />);
  const rows = Array.from(container.querySelectorAll("tr")).map((tr) => tr.textContent ?? "");
  const groups = (aggregated.groupTaxes as Loose[]).map((g) => g.group);
  const groupOf = (id: string) => (aggregated.properties as Loose[]).find((p) => p.propertyId === id)?.rateGroup;
  return { aggregated, rows, groups, groupOf };
}

describe("부수토지 카드 군 이름 — 짝 주택이 단기이고 카드 자기 취득일은 오래된 경우", () => {
  it("🔑 U 중과 짝 · 주택 2025-01-01 · 카드 2014-01-01: 카드도 단기보유 · 군 하나 · «세율 60%» · 합계 658,350,000 불변 (수정 전 «일반 누진 60%» 행 따로)", async () => {
    const r = await run(fwd("2025-01-01", "2014-01-01"));
    expect([r.groupOf("primary"), r.groupOf("c1")]).toEqual(["short_term", "short_term"]);
    expect(r.groups).toEqual(["short_term"]);
    expect(r.rows.find((x) => x.startsWith("세율"))).toBe("세율60%");
    expect(r.rows.join("\n")).not.toContain("일반 누진");
    expect(r.aggregated.groupTaxes[0].groupTaxBase).toBe(997_500_000);
    expect(r.aggregated.calculatedTax).toBe(598_500_000);
    expect(r.aggregated.totalTax).toBe(658_350_000);
  });

  it("🔑 X 비중과(1주택·비조정) · 같은 취득일: 같은 결과 — 카드 장특 24% 반영 합계 626,670,000 불변", async () => {
    const r = await run(fwd("2025-01-01", "2014-01-01", 100, NON_SUR));
    expect([r.groupOf("primary"), r.groupOf("c1")]).toEqual(["short_term", "short_term"]);
    expect(r.groups).toEqual(["short_term"]);
    expect(r.aggregated.groupTaxes[0].groupTaxBase).toBe(949_500_000);
    expect(r.aggregated.calculatedTax).toBe(569_700_000);
    expect(r.aggregated.totalTax).toBe(626_670_000);
  });

  it("Y 1년 미만(주택 2025-12-01 · 카드 2014-01-01): 카드 단기보유 · 70%", async () => {
    const r = await run(fwd("2025-12-01", "2014-01-01", 100, NON_SUR));
    expect([r.groupOf("primary"), r.groupOf("c1")]).toEqual(["short_term", "short_term"]);
    const c1 = (r.aggregated.properties as Loose[]).find((p) => p.propertyId === "c1")!;
    expect([c1.rateClause, c1.appliedRate]).toEqual(["104-1-3", 0.7]);
  });
});

describe("불변 — 분류가 바뀌면 안 되는 조합", () => {
  it("T 둘 다 2025(카드도 단기): 단기보유 한 군 · 합계 658,350,000", async () => {
    const r = await run(fwd("2025-01-01", "2025-01-01"));
    expect(r.groups).toEqual(["short_term"]);
    expect(r.aggregated.totalTax).toBe(658_350_000);
  });

  it("V 주택 2014(중과) · 카드 2025(자기 취득일이 단기): 다주택 중과 + 단기보유 두 군 그대로 · 합계 636,361,000", async () => {
    const r = await run(fwd("2014-01-01", "2025-01-01"));
    expect([r.groupOf("primary"), r.groupOf("c1")]).toEqual(["multi_house_surcharge", "short_term"]);
    expect([...r.groups].sort()).toEqual(["multi_house_surcharge", "short_term"]);
    expect(r.aggregated.totalTax).toBe(636_361_000);
  });

  it("W 둘 다 2014 · 200㎡(중과 + 비사업용 초과분): 군 구성 불변 — 이내분은 중과 군 · 초과분은 비사업용 군", async () => {
    const r = await run(fwd("2014-01-01", "2014-01-01", 200));
    expect([r.groupOf("primary"), r.groupOf("c1__appurtenant"), r.groupOf("c1__excess")]).toEqual(["multi_house_surcharge", "multi_house_surcharge", "non_business_land"]);
    expect(r.aggregated.totalTax).toBe(594_649_000);
  });

  it("Z 비중과 · 둘 다 2014(누진): 일반 누진 한 군 · 합계 43,901,000 — 호 104-1-1은 단기로 옮기지 않는다", async () => {
    const r = await run(fwd("2014-01-01", "2014-01-01", 100, NON_SUR));
    expect(r.groups).toEqual(["progressive"]);
    expect(r.aggregated.totalTax).toBe(43_901_000);
  });

  it("🔑 불변식(격자): 호가 §104①2·3호(104-1-2/3)인 모든 자산은 군이 short_term이다 — 위 시료 전부", async () => {
    const samples: Loose[] = [
      fwd("2025-01-01", "2014-01-01"), fwd("2025-01-01", "2014-01-01", 100, NON_SUR), fwd("2025-12-01", "2014-01-01", 100, NON_SUR),
      fwd("2025-01-01", "2025-01-01"), fwd("2014-01-01", "2025-01-01"), fwd("2014-01-01", "2014-01-01", 200), fwd("2014-01-01", "2014-01-01", 100, NON_SUR),
    ];
    let checked = 0;
    for (const body of samples) {
      const res = await postTransfer(capResidenceToHolding(body));
      for (const p of (res.json as Loose).data.aggregated.properties as Loose[]) {
        if (p.rateClause === "104-1-2" || p.rateClause === "104-1-3") {
          checked += 1;
          expect(p.rateGroup, `${p.propertyId} · ${p.rateClause}`).toBe("short_term");
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });
});
