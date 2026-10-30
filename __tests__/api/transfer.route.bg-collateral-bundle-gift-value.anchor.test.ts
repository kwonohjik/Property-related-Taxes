/**
 * anchor — 함께 부담부증여(일반건물 쌍)의 상증법 평가 승자: 승자가 자산마다 다르면(혼합) ⑫ 도 400 (계획서 `docs/00-pm/bg-collateral-bundle-gift-value.plan.md` Q-1 b)
 *
 * ⑧ `transfer-tax-validate.ts:334-366` — 「Σmax ≠ max(Σ성분)」이라 담보평가(§66)·임대평가(§61⑤)가 max 인 자산이 섞이면 합산 증여가액이 ΣAᵢ 와 어긋난다.
 * 수정 전 ⑫ 는 이 게이트가 없어 **혼합 승자에서 200 + 증여가액이 ΣA 보다 작았다**(200M ~ 487.8M 적음, 시장 모드 담보 1.2B + 보충 1.0B 는 증여세 58,200,000 vs 오라클 101,850,000 = 43,650,000 과소).
 * 균일 승자(둘 다 담보/둘 다 임대/둘 다 보충)는 ⑫ 가 맞게 계산하므로 막지 않는다 — ⑧ 은 비보충 승자를 전부 막는 상위 집합이다.
 * 수정 후: `bgBundleMixedWinner`(`transfer-tax-schema-gb-bg-refines.ts`) — 자산별 승자가 서로 다르면 400.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const BASE: Partial<AssetForm> = {
  assetKind: "general_building", addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: "150000000", gbLandArea: "205", gbBuildingArea: "300", gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential", gbTransferLandPricePerSqm: "5514000", gbTransferBuildingValue: "259072400", actualSalePrice: "1600000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2010-05-01", useEstimatedAcquisition: false,
};
const gbAsset = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, BASE, ...over) as AssetForm;
const SALE = 1_600_000_000;
const bundle = (assets: AssetForm[]): TransferFormData => {
  const f = newForm() as unknown as Record<string, unknown>;
  Object.assign(f, { transferDate: "2026-02-16", filingDate: "2026-05-31", assets, assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: String(SALE + 400_000_000) });
  return f as unknown as TransferFormData;
};
const post2 = async (b: unknown) => {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b) }));
  return { status: res.status, j: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
};
const base = { transferType: "burdened_gift", transferCause: "general", bgDonorRelation: "lineal_descendant",
  bgCoDonorLandStdPriceAtAcq: "10,000,000", bgCoDonorBuildingStdPriceAtAcq: "40,000,000", bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "205000000", bgActualAcquisitionBuilding: "150000000",
  acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", landAcquisitionDate: "2010-05-01", acquisitionDate: "2010-05-01", hasSeperateLandAcquisitionDate: false, bgLendingDepositTotal: "0" } as unknown as Partial<AssetForm>;
/** 자산 한 장의 평가 승자를 정하는 입력. 시가 모드: sup(보충) · mort(담보 — 채무 1.2B > 시가 1.0B). 기준시가 모드: ssup(보충) · smort(담보) · srent(임대). */
const MK: Record<string, Record<string, string>> = {
  sup: { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "400,000,000", bgMortgageSetAmount: "400,000,000" },
  mort: { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" },
  ssup: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000" },
  smort: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "1,600,000,000", bgMortgageSetAmount: "1,600,000,000" },
  srent: { bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000", bgAnnualRentTotal: "200,000,000" },
};
async function pair(x: Record<string, string>, y: Record<string, string>, ratios: [string, string] = ["100", "100"]) {
  const own = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" }) as unknown as Partial<AssetForm>;
  const f = bundle([gbAsset(1, { ...base, ...x } as unknown as Partial<AssetForm>, own(ratios[0])), gbAsset(2, { ...base, ...y } as unknown as Partial<AssetForm>, own(ratios[1]))]);
  const r = await post2(await captureBody(f));
  const iss = allIssues(f).map((q) => String(q));
  const bg = r.status === 200 ? r.j.data.aggregated.burdenedGift : undefined;
  const cards = r.status === 200 ? r.j.data.transferBurdenedGiftBreakdown?.cards : undefined;
  return {
    gate: iss.filter((m) => m.includes("함께 양도와 같이")).length, status: r.status, gross: bg?.giftTax?.grossGiftValue as number | undefined, finalTax: bg?.giftTax?.finalTax as number | undefined,
    wholeMax: bg?.giftValuation?.max as number | undefined, sumA: cards?.reduce((t: number, c: any) => t + (c.breakdown?.giftValuation?.max ?? 0), 0) as number | undefined, // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

describe("CB-1 승자 조합 13쌍 — ⑧ 게이트(비보충 승자가 있으면 차단) · ⑫ 는 혼합 승자만 400", () => {
  const PAIRS: [string, string][] = [["sup", "sup"], ["mort", "sup"], ["sup", "mort"], ["mort", "mort"], ["ssup", "ssup"], ["smort", "ssup"], ["ssup", "smort"], ["smort", "smort"], ["srent", "ssup"], ["ssup", "srent"], ["srent", "srent"], ["srent", "smort"], ["smort", "srent"]];
  it("균일 승자(5쌍)는 ⑫ 200 · 증여가액 = ΣA (1원 내) / 혼합 승자(8쌍)는 ⑫ 400 (수정 전 200 · 증여가액 < ΣA 200M ~ 487.8M)", async () => {
    const uniform: string[] = []; const mixed: string[] = [];
    for (const [x, y] of PAIRS) {
      const r = await pair(MK[x], MK[y]);
      if (x === y) { expect(r.status).toBe(200); expect(Math.abs((r.sumA ?? 0) - (r.wholeMax ?? 0))).toBeLessThanOrEqual(1); uniform.push(`${x}|게이트 ${r.gate}`); }
      else { expect(r.gate).toBeGreaterThan(0); mixed.push(`${x}+${y}|${r.status}`); }
    }
    expect(uniform).toEqual(["sup|게이트 0", "mort|게이트 2", "ssup|게이트 0", "smort|게이트 2", "srent|게이트 2"]);
    expect(mixed).toEqual(["mort+sup|400", "sup+mort|400", "smort+ssup|400", "ssup+smort|400", "srent+ssup|400", "ssup+srent|400", "srent+smort|400", "smort+srent|400"]);
  }, 300_000);
  it("증여세 과소였던 혼합(담보 1.2B + 보충 1.0B)은 ⑫ 400 · 같은 증여가액(2.2B)을 보충 승으로 만든 쌍(오라클)은 ⑧ 통과 · 200 · 증여세 101,850,000 불변", async () => {
    const mixedR = await pair(MK.mort, MK.sup);
    const oracle = await pair({ ...MK.sup, bgMarketValueAtTransfer: "1,200,000,000", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" }, MK.sup);
    expect([mixedR.gate > 0, mixedR.status]).toEqual([true, 400]);
    expect([oracle.gate, oracle.status, oracle.gross, oracle.finalTax]).toEqual([0, 200, 2_200_000_000, 101_850_000]);
  }, 120_000);

});

describe("CB-2 거짓 차단 없음 — 지분율 4조합(100/100 · 100/50 · 50/100 · 50/50) × 13쌍: ⑧ 통과이면 ⑫ 도 200", () => {
  it("⑧ 통과 셀 중 ⑫ 400 = 0 · 승자가 서로 다른 셀은 ⑧ 이 막고 ⑫ 도 400 (⑧ 이 ⑫ 의 상위 집합)", async () => {
    const PAIRS: [string, string][] = [["sup", "sup"], ["mort", "sup"], ["sup", "mort"], ["mort", "mort"], ["ssup", "ssup"], ["smort", "ssup"], ["ssup", "smort"], ["smort", "smort"], ["srent", "ssup"], ["ssup", "srent"], ["srent", "srent"], ["srent", "smort"], ["smort", "srent"]];
    const t: Record<string, number> = {};
    for (const [x, y] of PAIRS) for (const r of [["100", "100"], ["100", "50"], ["50", "100"], ["50", "50"]] as [string, string][]) {
      const res = await pair(MK[x], MK[y], r);
      const k = `${res.gate > 0 ? "⑧게이트" : "⑧통과"}|${res.status}`; t[k] = (t[k] ?? 0) + 1;
    }
    expect(t).toEqual({ "⑧통과|200": 8, "⑧게이트|400": 32, "⑧게이트|200": 12 }); // ⑧게이트|200 12 = 균일 비보충(담보·임대) 3쌍 × 4 — ⑫ 가 맞게 계산해 막지 않는다
  }, 300_000);
});

describe("CB-3 지분 소유 쌍의 승자는 ⑧(폼 값)과 ⑫(payload 값)이 다르게 볼 수 있다 — 현재 동작의 기록 (확인 필요)", () => {
  /**
   * 시가 1.0B · 채무 0.6B · 지분 50%: ⑧ 은 폼의 채무 0.6B 를 그대로 보고 담보(0.6B)가 시가×50%(0.5B)를 이긴다고 막는다.
   * 그러나 ④ 는 지분 소유 컴패니언의 채무를 지분율로 줄여 보내(payload 0.3B) ⑫ 는 두 자산 모두 보충 승으로 읽어 막지 않는다 — 엔진이 읽는 값과 같은 쪽이다.
   * 이 쌍에서 집계 증여가액(1.5B)과 카드별 증여가액 합(2.0B)이 다른 것은 지분 소유 카드가 물건 전체 값을 보여 주는 탓일 수 있으나 **분석하지 않았다**(「확인 필요」).
   */
  const D6 = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1,000,000,000", bgMortgageDebtAmount: "600,000,000", bgMortgageSetAmount: "600,000,000" };
  it("100/100 은 둘 다 보충 → ⑧ 통과 · 200 · 100/50 은 ⑧ 게이트(폼 기준 담보 승) · ⑫ 200(payload 기준 둘 다 보충)", async () => {
    const even = await pair(MK.sup, D6, ["100", "100"]);
    const half = await pair(MK.sup, D6, ["100", "50"]);
    expect([even.gate, even.status]).toEqual([0, 200]);
    expect([half.gate > 0, half.status]).toEqual([true, 200]);
  }, 120_000);
});
