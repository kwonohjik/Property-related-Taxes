/**
 * 부수토지 카드 중과 고지 문구 — §104⑦ 후단 비교 범위의 시행일 연혁(세액 후보 ⑦ · #3552 후속).
 *
 * 「소득세법」 §104⑦ 후단(시행본 실독):
 *   - 2018.4.1.~2021.5.31.(2021.1.1. 시행 제17758호까지): «보유기간이 1년 미만인 경우 … 제1항제3호의 세율» — 주택 40%
 *   - 2021.6.1. 이후: «보유기간이 2년 미만인 경우 … 제1항제2호 또는 제3호의 세율» — 주택 60%·70%
 * 수정 전: 양도일과 무관하게 «2년 미만 · 1~2년 60% · 1년 미만 70%» 고정 문구.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import {
  APPURTENANT_CARD_SURCHARGE_NOTICE,
  appurtenantCardSurchargeNoticeText,
} from "@/lib/tax-engine/appurtenant-card-surcharge";

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

const D = (s: string) => new Date(s);
const HEAD = "함께 양도한 부수토지 카드 — 짝 주택이 다주택 중과(「소득세법」 §104⑦) 대상이라 「주택(이에 딸린 토지를 포함한다)」인 이 부수토지에도 ";
const LTHD = "장기보유특별공제는 배제했습니다(§95② 본문 괄호 「같은 조 제7항 각 호에 따른 자산」 제외 — §104⑦ 각 호 자산).";
const ERA_2018 =
  HEAD +
  `중과 규정(§104⑦ 세율·보유기간 1년 미만 세율 비교)을 적용하고 ${LTHD} ` +
  "보유기간이 1년 미만이면 비교하는 §104①3호 세율은 부수토지도 주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다)이므로 주택 세율(1년 미만 40%)입니다.";
const CURRENT =
  HEAD +
  `중과 규정(§104⑦ 세율·보유기간 2년 미만 세율 비교)을 적용하고 ${LTHD} ` +
  "보유기간이 2년 미만이면 비교하는 §104①2·3호 세율은 부수토지도 주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다)이므로 주택 단기세율(1~2년 60% · 1년 미만 70%)입니다.";
const LTHD_ONLY = HEAD + `${LTHD} 세율은 짝 주택과 같이 §104⑦ 중과 세율을 적용하지 않았습니다.`;

describe("leaf — appurtenantCardSurchargeNoticeText", () => {
  it("2021.6.1. 이후 — 2년 미만 · 60%/70%(§95②·§104① 괄호는 원문대로)", () => {
    expect(APPURTENANT_CARD_SURCHARGE_NOTICE).toBe(CURRENT);
    expect(appurtenantCardSurchargeNoticeText(D("2021-06-01"))).toBe(APPURTENANT_CARD_SURCHARGE_NOTICE);
    expect(appurtenantCardSurchargeNoticeText(D("2026-06-15"))).toBe(APPURTENANT_CARD_SURCHARGE_NOTICE);
  });
  it("🔑 2018.4.1.~2021.5.31. — 1년 미만 · §104①3호 · 40% (수정 전 60%/70% 문구)", () => {
    expect(appurtenantCardSurchargeNoticeText(D("2021-05-31"))).toBe(ERA_2018);
    expect(appurtenantCardSurchargeNoticeText(D("2018-04-01"))).toBe(ERA_2018);
  });
});

type Agg = { warnings?: string[]; properties: { propertyId: string; appliedRate: number; rateClause?: string; longTermHoldingDeduction: number }[] };
const two = (td: string, acq: string) => ({
  primary: {
    propertyType: "housing", transferPrice: 500_000_000, transferDate: td, acquisitionPrice: 250_000_000, acquisitionDate: acq,
    acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 2, residencePeriodMonths: 0,
    isRegulatedArea: true, wasRegulatedAtAcquisition: true, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false,
    reductions: [], annualBasicDeductionUsed: 0, buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential",
    totalSalePrice: 800_000_000, standardPriceAtTransferForApportion: 500_000,
  },
  land: {
    assetId: "c1", assetLabel: "부수토지", assetKind: "land", landNature: "appurtenant_to_housing", acquisitionCause: "purchase",
    acquisitionDate: acq, fixedAcquisitionPrice: 150_000_000, standardPriceAtTransfer: 300_000, directExpenses: 0,
    isOneHousehold: false, areaM2: 200, reductions: [],
  },
});
async function postTwo(td: string, acq: string): Promise<{ json: string; agg: Agg }> {
  vi.mocked(preloadTaxRates).mockResolvedValue(loadFallbackTransferRates(D(td)) as never);
  const { primary, land } = two(td, acq);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...primary, companionAssets: [land] }) }),
  );
  const body = (await res.json()) as { data?: { aggregated: Agg }; error?: unknown };
  expect(res.status, JSON.stringify(body.error)).toBe(200);
  return { json: JSON.stringify(body.data), agg: body.data!.aggregated };
}
const card = (a: Agg) => a.properties.find((p) => p.propertyId === "c1")!;

describe("화면 경로(route) — 2주택 조정 · 부수토지 카드 고지", () => {
  it("🔑 2020.6.1. 양도 · 10개월 — 2018 시행 문구 · 카드는 §104⑦ 후단 비교에서 3호 40%", async () => {
    const { json, agg } = await postTwo("2020-06-01", "2019-08-01");
    expect(json).toContain(ERA_2018);
    expect(json).not.toContain(CURRENT);
    // 카드(양도차익 1.5억, 1년 미만)는 3호 40%가 이긴다 — 2020 §55① 누진 1.5억: 1,590만 + 6,200만×35% = 3,760만 · +10%p 1,500만 = 5,260만 < 40% 6,000만
    //   (기본공제 250만을 카드가 받아도 3,672.5만 + 1,475만 = 5,147.5만 < 5,900만 — 순서 같음). 수정 전 문구라면 «1~2년 60%·1년 미만 70%»로 비교 세율을 잘못 말한다.
    expect([card(agg).appliedRate, card(agg).rateClause]).toEqual([0.4, "104-1-3"]);
  });
  it("🔑 2018.3.31. 양도(§104⑦ 시행 전) — 고지 없음(수정 전 «§104⑦ 중과 적용·장특 배제» 고지) · 카드 장특은 실제로 공제", async () => {
    const { json, agg } = await postTwo("2018-03-31", "2013-01-01");
    expect(json).not.toContain(HEAD);
    expect(card(agg).longTermHoldingDeduction).toBeGreaterThan(0);
  });
  it("🔑 위기취득(2010.6.1. 취득 · 부칙 제9270호 §14①) 2020.6.1. 양도 — 장특 배제만 말한다(수정 전 «§104⑦ 세율 적용»)", async () => {
    const { json, agg } = await postTwo("2020-06-01", "2010-06-01");
    expect(json).toContain(LTHD_ONLY);
    expect(json).not.toContain(ERA_2018);
    expect([card(agg).rateClause, card(agg).longTermHoldingDeduction]).toEqual(["104-1-1", 0]);
  });
});
