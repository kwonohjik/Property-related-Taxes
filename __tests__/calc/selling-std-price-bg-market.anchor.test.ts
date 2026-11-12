/**
 * anchor(④→⑫→⑭→엔진 · ⑧) — 부담부증여 시가 모드(환산 아님) 양도 주택의 「양도 당시 기준시가」 (O-5).
 * 계획서 `docs/00-pm/bg-market-selling-std-price-o5.plan.md` §1.2 · §4.
 *
 * 수정 전: 이 모드에는 공용 칸이 없어(`stdPriceAtTransferComesFromElsewhere`) ⑧이 안 막고, ④가 양도 주택 행에 0을 실어 backstop이 «산입»으로 읽었다.
 *         사용자가 3억 이하 주택이어도 값을 넣어 풀 방법이 없었다.
 * 수정 후: ⑤ 칸 노출·⑧ 필수·④ 값이 같은 leaf(`selling-std-price-scope.ts`)를 쓴다 — 가액기준·조정이면 비울 때 ⑧이 막고, 값이 1호를 가른다.
 *
 * 공통: 양도 2021-06-01 · 전주 완산구(가액기준 · 조정대상지역) · 명부 강남 2채(공시가 5억) · 시가 모드 비환산 · 취득 실가.
 * 안분 불변 단언 — 비움(0) 과 4억은 같은 세액이다(이 값은 §159 안분에 쓰이지 않고 1호 판정에만 닿는다). 2.5억만 1호로 중과가 빠진다.
 *
 * | 구성 | 비움 = 4억 | 2.5억 |
 * |---|---|---|
 * | 단건 | 80,975,000 | 30,425,000 |
 * | 함께 양도(2채) | 163,790,000 | 85,401,250 |
 * | 축 B(50/50 지분) | 89,072,500 | 33,467,500 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never); });
import { NextRequest } from "next/server";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

const GANGNAM = "1168010100";
const JEONJU = "4511110100";
const row = (id: string): HouseEntry =>
  ({ id, region: "capital", regionCode: GANGNAM, acquisitionDate: "2010-01-01", officialPrice: "500000000", acquisitionOrigin: "general",
     isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false }) as HouseEntry;

function form(houses: HouseEntry[], over: Partial<AssetForm> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2021-06-01",
    contractTotalPrice: "1000000000",
    householdHousingCount: String(1 + houses.length),
    isOneHousehold: true,
    houses,
    presaleRights: [],
    assets: [
      { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", regionCode: JEONJU,
        addressJibun: "전북 전주시 완산구 중앙동1가 1", actualSalePrice: "1000000000", fixedAcquisitionPrice: "500000000", acquisitionPrice: "500000000", ...over },
    ],
  } as unknown as TransferFormData;
}

async function body(f: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  return cap.body!;
}
const sellingRow = (b: Record<string, unknown>) => (b.houses as { id: string; officialPrice: number }[]).find((h) => h.id === "selling")!;


const BG = { transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "500000000", bgMortgageDebtAmount: "300000000", bgLendingDepositTotal: "0" };
const stdIssue = (f: TransferFormData) => collectStepIssues(0, f).some((i) => i.message.includes("양도 당시 기준시가(주택 공시가격)"));

async function run(f: TransferFormData) {
  const b = await body(f);
  const res = await CALC_POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify(b),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  const r = json.data.result as { determinedTax?: number; surchargeType?: string } | undefined;
  const agg = json.data.aggregated as { totalTax?: number } | undefined;
  return { sell: sellingRow(b)?.officialPrice, tax: r?.determinedTax ?? agg?.totalTax, st: r?.surchargeType ?? "none" };
}
const single = (std: string) => form([row("h1"), row("h2")], { ...BG, standardPriceAtTransfer: std } as never);

function bundle(mode: "companion" | "fractional", std: string): TransferFormData {
  const f = form([row("h1"), row("h2")], { ...BG, standardPriceAtTransfer: std } as never) as unknown as { assetSplitMode: string; assets: Record<string, unknown>[] };
  f.assetSplitMode = mode;
  const second = { ...makeDefaultAsset(2), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", regionCode: JEONJU, addressJibun: "전북 전주시 완산구 중앙동1가 2",
    transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "actual", bgLendingDepositTotal: "0", assetId: "A2" };
  if (mode === "fractional") {
    f.assets[0] = { ...f.assets[0], ownershipNumerator: "50", ownershipDenominator: "100" };
    f.assets.push({ ...second, ownershipNumerator: "50", ownershipDenominator: "100", addressJibun: f.assets[0].addressJibun, bgMarketValueAtTransfer: "1000000000", bgActualAcquisitionTotal: "500000000", bgMortgageDebtAmount: "300000000" });
  } else {
    f.assets.push({ ...second, bgMarketValueAtTransfer: "600000000", bgActualAcquisitionTotal: "300000000", bgMortgageDebtAmount: "200000000" });
  }
  return f as unknown as TransferFormData;
}

describe("O-5 ⑧ — 부담부증여 시가(비환산) 양도 주택 기준시가", () => {
  it("[S-1] 비움 → ⑧이 막는다(수정 전: 무경고 산입)", () => {
    expect(stdIssue(single(""))).toBe(true);
  });
  it("[S-2] 값을 넣으면 통과", () => {
    expect(stdIssue(single("400000000"))).toBe(false);
    expect(stdIssue(single("250000000"))).toBe(false);
  });
  it("[S-3] 환산(K-5)은 원래 공용 칸이 있어 그대로 막는다 · 의제취득일 전은 이 칸이 아니다", () => {
    expect(stdIssue(form([row("h1"), row("h2")], { ...BG, bgAcquisitionMethod: "converted" } as never))).toBe(true);
    expect(stdIssue(form([row("h1"), row("h2")], { ...BG, acquisitionCause: "inheritance", acquisitionDate: "1983-05-01", inheritanceStartDate: "1983-05-01" } as never))).toBe(false);
  });
});

describe("O-5 ④→⑭ — 값이 양도 주택 행에 도착해 1호를 가르고 안분은 움직이지 않는다", () => {
  it("[R-1] 단건: 비움 = 4억 80,975,000(3주택 이상) · 2.5억 30,425,000(1호 배제)", async () => {
    const blank = await run(single(""));
    const high = await run(single("400000000"));
    const low = await run(single("250000000"));
    expect([blank.sell, high.sell, low.sell]).toEqual([0, 400_000_000, 250_000_000]);
    expect([blank.tax, high.tax, low.tax]).toEqual([80_975_000, 80_975_000, 30_425_000]);
    expect([blank.st, high.st, low.st]).toEqual(["multi_house_3plus", "multi_house_3plus", "none"]);
  });
  it.each([
    ["companion", 163_790_000, 85_401_250],
    ["fractional", 89_072_500, 33_467_500],
  ] as const)("[R-2] %s: 비움 = 4억 %i · 2.5억 %i", async (mode, high, low) => {
    const blank = await run(bundle(mode, ""));
    const hi = await run(bundle(mode, "400000000"));
    const lo = await run(bundle(mode, "250000000"));
    expect([blank.tax, hi.tax, lo.tax]).toEqual([high, high, low]);
    expect([blank.sell, hi.sell, lo.sell]).toEqual([0, 400_000_000, 250_000_000]);
  });
});
