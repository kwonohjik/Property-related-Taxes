/**
 * 신고서 ③ 세율구분 코드 — 주택 세율을 받은 부수토지 카드는 주택 코드로 적는다
 * (계획서 `docs/02-design/features/bundled-appurtenant-card-o18-o21-display.plan.md` O-21 · Q-2 a).
 *
 * 부수토지 카드(한 장·이내분)는 「소득세법」 §104①2호 «주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다)»에 따라 주택 단기세율(60%/70%)을 받는데
 * 신고서 코드는 `assetKind: "land"`라 «주택 및 조합원입주권 제외» 코드 1-15/1-20(정본 40%/50%)이 적혔다 — 한 열에서 코드와 ⑨세율이 어긋났다.
 * 대통령령 한도를 넘는 초과분 · 독립 나대지 · 다른 세대 토지만 본인 카드는 일반 토지라 1-15/1-20 그대로다.
 *
 * 정본: 「소득세법 시행규칙」 별지 제84호서식 작성방법 3쪽 «과세대상자산 및 세율» — ② 1-15(1~2년 · 주택 제외) 40% · ③ 1-20(1년 미만 · 주택 제외) 50% ·
 *       ⑤ 1-39(1~2년 · 주택 및 조합원입주권) 60% · ⑥ 1-46(1년 미만 · 주택·입주권·분양권) 70%. (KoreanLaw MCP `get_annexes` `[008400]` 본문, 2026-10-30.)
 * oracle은 구현 비의존: 위 «코드 → 세율» 표를 상수로 두고, **고정세율 코드가 적힌 모든 열의 ⑨세율이 그 코드의 세율과 같다**를 격자로 단언한다.
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
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { resolveFilingRateCode } from "@/components/calc/results/transfer/filing-rate-code";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 정본 표(별지 제84호서식 작성방법 3쪽)의 «코드 → 단일세율» — 고정세율 코드만 */
const FIXED_RATE_BY_CODE: Record<string, string> = { "1-15": "40%", "1-20": "50%", "1-39": "60%", "1-46": "70%" };

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };
const land = (id: string, acq: string, area: number, extra: Loose = {}) => ({
  assetId: id, assetLabel: `부수토지 ${id}`, assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase", acquisitionDate: acq,
  fixedAcquisitionPrice: 200_000_000, standardPriceAtTransfer: 400_000, directExpenses: 0, isOneHousehold: true, areaM2: area, reductions: [], ...extra,
});
const COMMON = {
  transferDate: "2026-06-15", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, residencePeriodMonths: 60,
  isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, reductions: [], annualBasicDeductionUsed: 0,
  isOneHousehold: true, householdHousingCount: 2,
};
const fwd = (houseAcq: string, cardAcq: string, area = 100, over: Loose = {}, cardExtra: Loose = {}) => ({
  ...COMMON, ...ZONE, propertyType: "housing", acquisitionDate: houseAcq, transferPrice: 1_600_000_000, acquisitionPrice: 800_000_000, acquisitionArea: area,
  totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 1_600_000, companionAssets: [land("c1", cardAcq, area, cardExtra)], ...over,
});
const NON_SUR = { householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false };

/** 신고서 «세율구분 코드»·«세율» 행의 열별 값 */
async function filing(body: Loose, cardKind: string, cardNature: string | undefined) {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  const a = (res.json as Loose).data.aggregated;
  const f = createDefaultTransferFormData() as Loose;
  f.transferDate = body.transferDate;
  f.assets = [{ assetId: "primary", assetKind: "housing" }, { assetId: "c1", assetKind: cardKind, ...(cardNature ? { landNature: cardNature } : {}) }];
  const rows = buildAggregateRows(aggregateToFilingResult(a), { properties: a.properties, aggregated: a } as never, f as never) as Loose[];
  const pick = (label: string) => (rows.find((r) => r.label === label)?.values ?? {}) as Record<string, string | undefined>;
  return { code: pick("세율구분 코드"), rate: pick("세율"), cards: a.properties as Loose[], aggregated: a };
}
const APP = "appurtenant_to_housing";

describe("부수토지 카드 신고서 코드 — 주택 세율을 받으면 주택 코드", () => {
  it("🔑 F1 중과 짝 · 둘 다 2025-01-01(1~2년 · 한 장): 주택·카드 모두 1-39 · 세율 60% (수정 전 카드 1-15)", async () => {
    const r = await filing(fwd("2025-01-01", "2025-01-01"), "land", APP);
    expect([r.code.primary, r.code.c1, r.rate.primary, r.rate.c1]).toEqual(["1-39", "1-39", "60%", "60%"]);
  });

  it("🔑 F2 1년 미만(2025-12-01): 주택·카드 모두 1-46 · 70% (수정 전 카드 1-20)", async () => {
    const r = await filing(fwd("2025-12-01", "2025-12-01"), "land", APP);
    expect([r.code.primary, r.code.c1, r.rate.primary, r.rate.c1]).toEqual(["1-46", "1-46", "70%", "70%"]);
  });

  it("🔑 F3 중과 없음(1주택 · 비조정) 1~2년: 카드 1-39 — 중과와 무관하다", async () => {
    const r = await filing(fwd("2025-01-01", "2025-01-01", 100, NON_SUR), "land", APP);
    expect([r.code.primary, r.code.c1, r.rate.c1]).toEqual(["1-39", "1-39", "60%"]);
  });

  it("🔑 F4 분리 배치(200㎡ → 이내분·초과분): 이내분 1-39(60%) · **초과분 1-15(40%) 그대로**", async () => {
    const r = await filing(fwd("2025-01-01", "2025-01-01", 200), "land", APP);
    expect([r.code.primary, r.code.c1__appurtenant, r.code.c1__excess]).toEqual(["1-39", "1-39", "1-15"]);
    expect([r.rate.c1__appurtenant, r.rate.c1__excess]).toEqual(["60%", "40%"]);
  });

  it("F5 중과 2014·2014(§104⑦ 승): 주택·카드 모두 1-47 불변", async () => {
    const r = await filing(fwd("2014-01-01", "2014-01-01"), "land", APP);
    expect([r.code.primary, r.code.c1]).toEqual(["1-47", "1-47"]);
  });

  it("F6 독립 나대지(landNature non_appurtenant · 2025-01-01 · 1~2년): 토지 코드 1-15 · 40%", async () => {
    const r = await filing(fwd("2025-01-01", "2025-01-01", 100, {}, { landNature: "non_appurtenant" }), "land", "non_appurtenant");
    expect([r.code.c1, r.rate.c1]).toEqual(["1-15", "40%"]);
  });

  it("🔑 F7 oracle 격자: 고정세율 코드가 적힌 **모든 열**의 ⑨세율 = 정본 표의 그 코드 세율", async () => {
    const samples: [string, Loose, string, string | undefined][] = [
      ["중과 1~2년", fwd("2025-01-01", "2025-01-01"), "land", APP],
      ["중과 1년 미만", fwd("2025-12-01", "2025-12-01"), "land", APP],
      ["비중과 1~2년", fwd("2025-01-01", "2025-01-01", 100, NON_SUR), "land", APP],
      ["비중과 1년 미만", fwd("2025-12-01", "2025-12-01", 100, NON_SUR), "land", APP],
      ["분리 1~2년", fwd("2025-01-01", "2025-01-01", 200), "land", APP],
      ["분리 1년 미만", fwd("2025-12-01", "2025-12-01", 200), "land", APP],
      ["카드 옛 토지 · 주택 단기", fwd("2025-01-01", "2014-01-01"), "land", APP],
      ["주택 옛 · 카드 단기", fwd("2014-01-01", "2025-01-01"), "land", APP],
      ["독립 나대지 1~2년", fwd("2025-01-01", "2025-01-01", 100, {}, { landNature: "non_appurtenant" }), "land", "non_appurtenant"],
      ["독립 나대지 1년 미만", fwd("2025-12-01", "2025-12-01", 100, {}, { landNature: "non_appurtenant" }), "land", "non_appurtenant"],
    ];
    let checked = 0;
    for (const [name, body, kind, nature] of samples) {
      const r = await filing(body, kind, nature);
      for (const [col, code] of Object.entries(r.code)) {
        const expected = code ? FIXED_RATE_BY_CODE[code] : undefined;
        if (!expected) continue;
        checked += 1;
        expect(r.rate[col], `${name} · ${col} · 코드 ${code}`).toBe(expected);
      }
    }
    // 격자가 비어 있으면 통과가 아무것도 증명하지 못한다
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it("F8 세액 불변: 합계가 코드 변경과 무관하다 — (800,000,000 + 200,000,000 − 2,500,000) × 60% × 1.1 = 658,350,000", async () => {
    const r = await filing(fwd("2025-01-01", "2025-01-01"), "land", APP);
    expect(r.aggregated.totalTax).toBe(658_350_000);
  });
});

describe("resolveFilingRateCode — 엔진이 확정한 세율로 주택 세율 여부를 가른다", () => {
  const code = (clause: string, kind: string, date: string, appliedRate?: number) =>
    resolveFilingRateCode({ rateClause: clause as never, assetKind: kind as never, transferDate: date, ...(appliedRate !== undefined ? { appliedRate } : {}) });

  it("land · 104-1-2 · 60% → 1-39 / 40% → 1-15", () => {
    expect(code("104-1-2", "land", "2026-06-15", 0.6)).toBe("1-39");
    expect(code("104-1-2", "land", "2026-06-15", 0.4)).toBe("1-15");
  });
  it("land · 104-1-3 · 70% → 1-46 / 50% → 1-20", () => {
    expect(code("104-1-3", "land", "2026-06-15", 0.7)).toBe("1-46");
    expect(code("104-1-3", "land", "2026-06-15", 0.5)).toBe("1-20");
  });
  it("세율을 모르면(미전달) 종전대로 토지 코드", () => {
    expect(code("104-1-2", "land", "2026-06-15")).toBe("1-15");
    expect(code("104-1-3", "land", "2026-06-15")).toBe("1-20");
  });
  it("'21.6.1. 이전 양도는 주택·토지 세율이 같아(40%/50%) 세율로 가를 수 없다 — 토지 코드 유지", () => {
    expect(code("104-1-2", "land", "2021-05-31", 0.4)).toBe("1-15");
    expect(code("104-1-3", "land", "2021-05-31", 0.5)).toBe("1-20");
  });
  it("'21.6.1. 이전에는 세율이 60%/70%로 보여도 주택 코드로 올리지 않는다(정본 ⑤·⑥은 '21.6.1. 이후 양도분 코드) — 토지 코드 유지", () => {
    expect(code("104-1-2", "land", "2021-05-31", 0.6)).toBe("1-15");
    expect(code("104-1-3", "land", "2021-05-31", 0.7)).toBe("1-20");
  });
  it("주택 자산은 세율과 무관하게 종전 그대로(1-39/1-46)", () => {
    expect(code("104-1-2", "housing", "2026-06-15", 0.6)).toBe("1-39");
    expect(code("104-1-3", "housing", "2026-06-15", 0.7)).toBe("1-46");
  });
  it("분양권·다른 호(비사업용·중과·일반)는 세율에 영향받지 않는다", () => {
    expect(code("104-1-2", "presale_right", "2026-06-15", 0.6)).toBeUndefined();
    expect(code("104-1-3", "presale_right", "2026-06-15", 0.7)).toBe("1-46");
    expect(code("104-1-8", "land", "2026-06-15", 0.6)).toBe("1-11");
    expect(code("104-7-1", "land", "2026-06-15", 0.6)).toBe("1-47");
    expect(code("104-1-1", "land", "2026-06-15", 0.6)).toBe("1-10");
  });
});
