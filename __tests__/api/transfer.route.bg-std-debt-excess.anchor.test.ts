/**
 * anchor — **기준시가 모드 부담부증여 채무 초과(B/C > 1)** ⑧↔엔진 정합 (계획서 `docs/00-pm/bg-single-fractional-and-debt-excess.plan.md` 2).
 *
 * 종전: 기준시가 모드는 ⑧에 이 검사가 없어(「엔진 fail-fast」) 자산의 채무가 자기 증여가액을 넘으면 ⑧ 통과 → 엔진 `EXCESS_BURDENED_GIFT`가 **일반 Error → 500 INTERNAL_ERROR**였다.
 * 수정: ① 엔진이 `TaxCalculationError(INVALID_INPUT)`로 던진다 → 400(`lib/api/tax-error-response.ts` 규약). ② ⑧이 시가 모드와 같은 검사를 엔진과 같은 증여가액(`companionBurdenedGiftValuations`)으로 먼저 한다.
 *
 * · SD-1 격자 — 단건 100% · 지분 50%(축 A) · 함께 양도 묶음(주 자산·컴패니언 채무 위치 × 채무 수준): ⑧ 「채무액(」 차단 ⇔ 엔진 EXCESS(400). ⑧ 통과 셀은 엔진 200.
 * · SD-2 상태 코드 — 엔진 초과는 500이 아니라 400 INVALID_INPUT.
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
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
/** 부담부증여 주택(기준시가 모드): 양도시 기준시가 10억 · 보증금 2억 + 차입금 2억 → 보충적평가(10억)가 담보평가(4억)를 이긴다. */
const house = (id: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(id) }, x({
  assetId: `h${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000", actualSalePrice: "", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "200000000", bgMortgageDebtAmount: "200000000", bgMortgageSetAmount: "200000000",
}), ...over) as AssetForm;
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const bundle = (assets: AssetForm[], extra: Record<string, unknown> = {}): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "", assetSplitMode: "companion", bundledSaleMode: "actual" }, extra) as TransferFormData;
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  return { status: res.status, j: (await res.json()) as any, body }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const DEBT = (d: string, set = "1,000") => x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: d, bgMortgageSetAmount: set });
const NONE = x({ bgLendingDepositTotal: "0", bgMortgageDebtAmount: "0", bgMortgageSetAmount: "0" });
const BIG = x({ standardPriceAtTransfer: "3000000000" });
const HALF = x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });

type Cell = { name: string; assets: AssetForm[]; excess: boolean };
// excess = 자산 중 하나라도 자기 채무 > 자기 증여가액(기준시가 모드 C = 보충적 10억 · 담보는 설정액 1,000이라 못 이김 · BIG 은 30억).
const CELLS: Cell[] = [
  { name: "단건 100% · 채무 2억", assets: [house(1, DEBT("200000000"))], excess: false },
  { name: "단건 100% · 채무 15억 > 10억", assets: [house(1, DEBT("1,500,000,000"))], excess: true },
  { name: "단건 100% · 담보 승(채무 12억 = 설정액 12억 > 기준시가 10억) — C 가 담보평가액이라 초과 아님", assets: [house(1, DEBT("1,200,000,000", "1,200,000,000"))], excess: false },
  { name: "단건 50%(축 A) · 채무 3억 ≤ 시가분 5억", assets: [house(1, HALF, DEBT("300000000"))], excess: false },
  { name: "단건 50%(축 A) · 채무 7억 > 시가분 5억", assets: [house(1, HALF, DEBT("700000000"))], excess: true },
  { name: "단건 50%(축 A) · 담보 승(채무 7억 = 설정액 7억) — C 가 담보평가액이라 초과 아님", assets: [house(1, HALF, DEBT("700000000", "700000000"))], excess: false },
  { name: "묶음 · 둘 다 2억", assets: [house(1, DEBT("200000000")), house(2, DEBT("200000000"))], excess: false },
  { name: "묶음 · 주 자산 15억 > A1 · 컴패니언 0", assets: [house(1, DEBT("1,500,000,000")), house(2, NONE)], excess: true },
  { name: "묶음 · 둘 다 15억", assets: [house(1, DEBT("1,500,000,000")), house(2, DEBT("1,500,000,000"))], excess: true },
  { name: "묶음 · 주 자산 15억 · 컴패니언 A2=30억 채무 0 (합계는 이내인데 주 자산 자기 초과)", assets: [house(1, DEBT("1,500,000,000")), house(2, BIG, NONE)], excess: true },
  { name: "묶음 · 주 자산 A1=30억 채무 5억 · 컴패니언 15억 > A2 10억", assets: [house(1, BIG, DEBT("500,000,000")), house(2, DEBT("1,500,000,000"))], excess: true },
  { name: "묶음 · 담보 승 쌍(각 12억 = 설정액 12억)", assets: [house(1, DEBT("1,200,000,000", "1,200,000,000")), house(2, DEBT("1,200,000,000", "1,200,000,000"))], excess: false },
];
const msgOf = (f: TransferFormData) => allIssues(f).map(String).filter((m) => m.includes("채무액("));

describe("SD-1 기준시가 모드 B/C > 1 — ⑧ 차단 ⇔ 엔진 EXCESS(400), ⑧ 통과 셀은 엔진 200", () => {
  it.each(CELLS)("$name", async ({ assets, excess }) => {
    const f = assets.length === 1 ? (Object.assign(createDefaultTransferFormData(), FORM, { assets, contractTotalPrice: "" }) as TransferFormData) : bundle(assets);
    const r = await post(f);
    expect(msgOf(f).length > 0).toBe(excess);
    if (excess) {
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.j)).toContain("EXCESS_BURDENED_GIFT");
    } else {
      expect(r.status).toBe(200);
    }
  });
});

describe("SD-2 엔진 초과의 상태 코드", () => {
  it("API 직접 호출(⑧ 우회) — 500 INTERNAL_ERROR 가 아니라 400 INVALID_INPUT", async () => {
    const r = await post(bundle([house(1, DEBT("1,500,000,000")), house(2, NONE)]));
    expect(r.status).toBe(400);
    expect(r.j.error.code).toBe("INVALID_INPUT");
    expect(r.j.error.message).toContain("[EXCESS_BURDENED_GIFT]");
  });
});
