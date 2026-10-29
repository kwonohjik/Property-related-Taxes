/**
 * anchor — 일반건물 **부담부증여(§159) × 폼 총 양도비** (계획서 `docs/00-pm/gb-total-transfer-expense-loss.plan.md` §12 실측)
 *
 * 오라클 — 총 양도비 N을 한 번 입력한 결과는 같은 금액을 이미 되던 채널(자산 카드의 양도비 칸)로 넣은 결과와 카드별 필요경비·세액이 ±0으로 같다.
 *  · 축 B(지분): 총 N ≡ 각 지분 카드 양도비 칸 N (100% 기준 — 엔진이 × 지분율).
 *  · 함께 양도: 총 N ≡ 자산 칸 N/2씩 (두 자산 양도가액 균등). 부담부증여는 물건 단위 §159 채무비율(K-4 0.5)이 양도비에도 곱해진다.
 *
 * 🔑 축 B 부담부증여는 `buildGeneralBuildingShares`의 총 양도비 병합이 **그대로 닿는다**(부담부증여 가드 없음). 이 병합을 부담부증여만 건너뛰면
 *    총 양도비가 소실돼 K-4 실지가 91,135,000(양도비 없음)으로 돌아간다 — 이 파일이 그 회귀를 막는다(종전엔 부담부증여 셀을 고정한 테스트가 없었다).
 * 🔑 함께 양도 쪽은 `withBundledCommonExpense`에 가드 둘이 겹쳐 있다(부담부증여 · 실가+선언 채널 비움). **하나씩 걷으면 값이 그대로**고(실측 M2·M3),
 *    **둘 다 걷으면** 옛 필요경비 칸(`directExpenses`) 직접분이 선언 채널에 가려 소실된다(아래 마지막 셀만 빨강). 하나만 남아도 안전하다는 뜻이지 둘 다 필요 없다는 뜻이 아니다.
 * 수치는 mock 세율표 실측값이다(전후 대조가 목적). 픽스처: 시가 10억 · 채무 5억(K-4 실지취득 3억) · 양도 2026-03-01 · 취득 2015-03-01.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const MARKET = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000",
};
const K4 = { ...MARKET, bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "150,000,000", bgActualAcquisitionBuilding: "150,000,000" };
const K5 = { ...MARKET, bgAcquisitionMethod: "converted" };

function gb(id: number, over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(id),
    addressJibun: `서울 강남구 테스트동 ${id}-${id}`,
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    gbBuildingAcquisitionCause: "purchase",
    ...over,
  } as AssetForm;
}
const base = (assets: AssetForm[], over: Record<string, unknown>): TransferFormData =>
  ({
    transferDate: "2026-03-01", filingDate: "2026-05-31", assets, houses: [], presaleRights: [],
    totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, ...over,
  }) as unknown as TransferFormData;
/** 함께 양도 — 서로 다른 물건 두 건 */
const companion = (a: AssetForm[], total = "0") => base(a, { assetSplitMode: "companion", contractTotalPrice: "", totalTransferExpense: total });
/** 축 B — 같은 물건 60/40 지분(자산 2는 취득 정보만) */
function shares(bg: object, s1: object = {}, s2: object = {}, total = "0"): TransferFormData {
  const a1 = gb(1, { ...bg, ownershipNumerator: "60", ownershipDenominator: "100", ...s1 });
  const a2 = {
    ...makeDefaultAsset(2), assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: "2015-03-01",
    ownershipNumerator: "40", ownershipDenominator: "100", gbBuildingAcquisitionCause: "purchase",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", ...s2,
  } as AssetForm;
  return base([a1, a2], { assetSplitMode: "fractional", contractTotalPrice: "1,000,000,000", totalTransferExpense: total });
}

async function run(f: TransferFormData) {
  const issues = [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f));
  expect(issues).toEqual([]);
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0, ...cap.body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    }),
  }));
  const json = (await res.json()) as { data?: { aggregated?: Record<string, unknown> }; error?: unknown };
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  const a = json.data!.aggregated!;
  const ps = a.properties as { necessaryExpense: number }[];
  return { tax: a.totalTax as number, cards: ps.map((p) => p.necessaryExpense) };
}

describe("BT-1 축 B(지분) × 부담부증여 — 총 양도비가 카드·파트 필요경비에 닿는다", () => {
  it("K-4 실지 · 총 5,000,000 → 필요경비 Σ 2,500,000(= 5,000,000 × 채무비율 0.5) · 세액 90,319,900 (양도비 없음 91,135,000)", async () => {
    const none = await run(shares(K4));
    const tot = await run(shares(K4, {}, {}, "5,000,000"));
    expect(none).toEqual({ tax: 91_135_000, cards: [0, 0, 0, 0] });
    expect(tot).toEqual({ tax: 90_319_900, cards: [750_000, 750_000, 500_000, 500_000] });
  });

  it.each([
    ["K-4 실지 5,000,000", K4, "5,000,000"],
    ["K-4 실지 400,000,000(양도차익이 크게 줄어드는 규모)", K4, "400,000,000"],
    ["K-5 환산 5,000,000(개산공제만 — 양도비는 필요경비에 안 든다)", K5, "5,000,000"],
    ["K-5 환산 700,000,000(§97②2호 단서 발동)", K5, "700,000,000"],
  ])("총 N ≡ 각 지분 카드 양도비 칸 N — %s", async (_n, bg, n) => {
    const a = await run(shares(bg, {}, {}, n));
    const b = await run(shares(bg, { transferExpense: n }, { transferExpense: n }));
    expect(a).toEqual(b);
  });

  it("K-5 환산 700,000,000 → 단서(나목)가 채택돼 필요경비 = 양도비 × 채무비율 × 지분율 (카드 105,000,000·70,000,000)", async () => {
    const r = await run(shares(K5, {}, {}, "700,000,000"));
    expect(r.cards).toEqual([105_000_000, 105_000_000, 70_000_000, 70_000_000]);
  });
});

describe("BT-2 함께 양도 × 부담부증여 — 총 양도비가 자산 칸 입력과 같다", () => {
  it("K-4 실지 · 총 5,000,000 → 카드마다 625,000 · 세액 210,662,100 (양도비 없음 211,563,000)", async () => {
    const none = await run(companion([gb(1, K4), gb(2, K4)]));
    const tot = await run(companion([gb(1, K4), gb(2, K4)], "5,000,000"));
    expect(none.tax).toBe(211_563_000);
    expect(tot).toEqual({ tax: 210_662_100, cards: [625_000, 625_000, 625_000, 625_000] });
  });

  it.each([
    ["K-4 실지 5,000,000", K4, "5,000,000", "2,500,000"],
    ["K-4 실지 400,000,000", K4, "400,000,000", "200,000,000"],
    ["K-5 환산 800,000,000(단서 미발동)", K5, "800,000,000", "400,000,000"],
    ["K-5 환산 1,200,000,000(단서 발동)", K5, "1,200,000,000", "600,000,000"],
    ["K-5 환산 3,000,000,000(양도차손)", K5, "3,000,000,000", "1,500,000,000"],
  ])("총 N ≡ 자산 칸 N/2씩 — %s", async (_n, bg, n, half) => {
    const a = await run(companion([gb(1, bg), gb(2, bg)], n));
    const b = await run(companion([gb(1, { ...bg, transferExpense: half }), gb(2, { ...bg, transferExpense: half })]));
    expect(a).toEqual(b);
  });

  it("K-5 환산 1,200,000,000 → 단서 채택 · 카드 150,000,000씩 · 세액 107,646,000 (800,000,000이면 개산공제 1,500,000만 · 139,906,800)", async () => {
    const hi = await run(companion([gb(1, K5), gb(2, K5)], "1,200,000,000"));
    const lo = await run(companion([gb(1, K5), gb(2, K5)], "800,000,000"));
    expect(hi).toEqual({ tax: 107_646_000, cards: [150_000_000, 150_000_000, 150_000_000, 150_000_000] });
    expect(lo).toEqual({ tax: 139_906_800, cards: [1_500_000, 1_500_000, 1_500_000, 1_500_000] });
  });

  it("비대칭 채무(자산1 2.5억 · 자산2 5억) · 총 6,000,000 → 물건 단위 채무비율 0.375가 곱해져 카드마다 562,500 · 자산 칸 3,000,000씩과 같다", async () => {
    const d1 = { bgMortgageDebtAmount: "250,000,000", bgMortgageSetAmount: "250,000,000" };
    const a = await run(companion([gb(1, { ...K4, ...d1 }), gb(2, K4)], "6,000,000"));
    const b = await run(companion([gb(1, { ...K4, ...d1, transferExpense: "3,000,000" }), gb(2, { ...K4, transferExpense: "3,000,000" })]));
    expect(a).toEqual({ tax: 149_773_800, cards: [562_500, 562_500, 562_500, 562_500] });
    expect(b).toEqual(a);
  });

  it("옛 필요경비 칸(`directExpenses`) 3,000,000 + 총 5,000,000 → 자산1 선언 칸 5,500,000 · 자산2 2,500,000과 같다(직접분이 소실되지 않는다)", async () => {
    const a = await run(companion([gb(1, { ...K4, directExpenses: "3,000,000" }), gb(2, K4)], "5,000,000"));
    const b = await run(companion([gb(1, { ...K4, transferExpense: "5,500,000" }), gb(2, { ...K4, transferExpense: "2,500,000" })]));
    expect(a).toEqual({ tax: 210_121_560, cards: [1_375_000, 1_375_000, 625_000, 625_000] });
    expect(b).toEqual(a);
  });
});

describe("BT-3 축 B × 부담부증여 — 옛 필요경비 칸 + 총 양도비", () => {
  it("K-4 실지 · 카드1 옛 칸 3,000,000 + 총 5,000,000 → 카드1 칸 8,000,000 · 카드2 칸 5,000,000 과 같다 (세액 90,026,464 · 직접분 소실 시 90,319,900)", async () => {
    const a = await run(shares(K4, { directExpenses: "3,000,000" }, {}, "5,000,000"));
    const b = await run(shares(K4, { transferExpense: "8,000,000" }, { transferExpense: "5,000,000" }));
    expect(a).toEqual(b);
    expect(a.tax).toBe(90_026_464);
  });
});

