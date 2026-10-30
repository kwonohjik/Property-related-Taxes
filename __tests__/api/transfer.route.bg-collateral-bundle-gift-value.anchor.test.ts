/**
 * anchor — 함께 부담부증여(일반건물 쌍)의 상증법 평가 승자: ⑧ 은 승자가 보충적평가가 아닌 자산이 있으면 막고, ⑫ 는 막지 않는다 (계획서 `docs/00-pm/bg-collateral-bundle-gift-value.plan.md` — 측정, 소스 변경 없음)
 *
 * ⑧ `transfer-tax-validate.ts:334-366` — 「Σmax ≠ max(Σ성분)」이라 담보평가(§66)·임대평가(§61⑤)가 max 인 자산이 섞이면 합산 증여가액이 ΣAᵢ 와 어긋난다.
 * ⑫ 는 이 게이트가 없다. 측정: **승자가 자산마다 다를 때(혼합)만** 증여가액·증여세가 틀린다 — 균일 승자(둘 다 담보/둘 다 임대)는 ΣA 와 일치(1원 내)하고 증여세가 구조적으로 0 이거나 맞다.
 * 아래는 **현재 동작의 기록**이다(고쳐지면 반전).
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
async function pair(x: Record<string, string>, y: Record<string, string>) {
  const f = bundle([gbAsset(1, { ...base, ...x } as unknown as Partial<AssetForm>), gbAsset(2, { ...base, ...y } as unknown as Partial<AssetForm>)]);
  const r = await post2(await captureBody(f));
  const iss = allIssues(f).map((q) => String(q));
  const bg = r.status === 200 ? r.j.data.aggregated.burdenedGift : undefined;
  const cards = r.status === 200 ? r.j.data.transferBurdenedGiftBreakdown?.cards : undefined;
  return {
    gate: iss.filter((m) => m.includes("함께 양도와 같이")).length, status: r.status, gross: bg?.giftTax?.grossGiftValue as number | undefined, finalTax: bg?.giftTax?.finalTax as number | undefined,
    wholeMax: bg?.giftValuation?.max as number | undefined, sumA: cards?.reduce((t: number, c: any) => t + (c.breakdown?.giftValuation?.max ?? 0), 0) as number | undefined, // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

describe("CB-1 승자 조합 13쌍 — ⑧ 게이트(비보충 승자가 있으면 차단) · ⑫ 는 전부 200 · 혼합 승자만 증여가액이 ΣA 보다 작다", () => {
  const PAIRS: [string, string][] = [["sup", "sup"], ["mort", "sup"], ["sup", "mort"], ["mort", "mort"], ["ssup", "ssup"], ["smort", "ssup"], ["ssup", "smort"], ["smort", "smort"], ["srent", "ssup"], ["ssup", "srent"], ["srent", "srent"], ["srent", "smort"], ["smort", "srent"]];
  it("균일 승자(5쌍)는 증여가액 = ΣA (1원 내) · 혼합 승자(8쌍)는 증여가액 < ΣA — ⑫ 200", async () => {
    const mixed: Record<string, number> = {}; const uniform: string[] = [];
    for (const [x, y] of PAIRS) {
      const r = await pair(MK[x], MK[y]);
      expect(r.status).toBe(200);
      const gap = (r.sumA ?? 0) - (r.wholeMax ?? 0);
      if (x === y) { expect(Math.abs(gap)).toBeLessThanOrEqual(1); uniform.push(`${x}|게이트 ${r.gate}`); } else { mixed[`${x}+${y}`] = gap; expect(r.gate).toBeGreaterThan(0); }
    }
    expect(uniform).toEqual(["sup|게이트 0", "mort|게이트 2", "ssup|게이트 0", "smort|게이트 2", "srent|게이트 2"]);
    expect(mixed).toEqual({
      "mort+sup": 200_000_000, "sup+mort": 200_000_000, "smort+ssup": 210_557_600, "ssup+smort": 210_557_600,
      "srent+ssup": 277_224_266, "ssup+srent": 277_224_266, "srent+smort": 487_781_866, "smort+srent": 487_781_866,
    });
  }, 300_000);
  it("증여세(최종) — 혼합(담보 1.2B + 보충 1.0B)은 ⑫ 58,200,000, 같은 증여가액(2.2B)을 보충 승으로 만든 오라클은 101,850,000 → 43,650,000 과소", async () => {
    const mixedR = await pair(MK.mort, MK.sup);
    const oracle = await pair({ ...MK.sup, bgMarketValueAtTransfer: "1,200,000,000", bgMortgageDebtAmount: "1,200,000,000", bgMortgageSetAmount: "1,200,000,000" }, MK.sup);
    expect([mixedR.gate > 0, mixedR.gross, mixedR.finalTax]).toEqual([true, 2_000_000_000, 58_200_000]);
    expect([oracle.gate, oracle.gross, oracle.finalTax]).toEqual([0, 2_200_000_000, 101_850_000]);
  }, 120_000);
});
