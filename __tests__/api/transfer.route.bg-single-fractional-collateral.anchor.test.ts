/**
 * anchor — **단건 지분 자산(축 A)의 담보 승** ⑧ 차단 사유 (계획서 `docs/00-pm/bg-single-fractional-and-debt-excess.plan.md` 1).
 *
 * 공유 소유 50% 단건에서 본인 인수 채무가 시가 해당분을 넘고 담보평가가 이기면, 엔진은 200으로 계산하지만(취득가액 = 취득시 기준시가 × 지분 × 채무비율)
 * ⑧은 「채무액이 증여가액 초과」라는 틀린 사유로 막았다(분모가 시가 × 지분율). 담보가 이기려면 채무 합계가 시가 해당분보다 커야 하므로 이 차단에는 항상 걸린다.
 * 화면이 지분 자산의 담보 승 취득가액(⑤ 칸 노출·취득시 기준시가 요구)을 다루지 않아 계산 자체는 막되, 사유를 정확히 말한다.
 *
 * · SF-1 지분 50% 담보 승 — 주택은 S-2가 열었다(⑧ 통과 ∧ ⑫ 200, 상세는 `transfer.route.bg-axis-a-nonsupp-win.anchor.test.ts`) · 그 밖의 종류(재개발 APT)는 ⑧ 1건(지분 자산 담보 승 사유) · 「초과합니다」 사유 아님 · 엔진은 200.
 * · SF-2 진짜 채무 초과(설정액이 작아 담보가 못 이김) — 종전 「초과」 문구 그대로.
 * · SF-3 대조 — 지분 50% 보충 승 통과 · 100% 담보 승 통과(종전 O-5).
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
/** 시가 모드 부담부증여 주택 — 시가 10억 · 채무 7억(설정액 7억) · 실지취득 4억. */
const house = (...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(1) }, x({
  assetId: "h1", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "300000000", actualSalePrice: "", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000", useEstimatedAcquisition: false,
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "700000000", bgMortgageSetAmount: "700000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "400000000",
}), ...over) as AssetForm;
/** 공유 소유 50% — 나머지 지분은 타인 소유 선언(Gate-A 통과, 축 A). */
const HALF = x({ ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });
const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
async function run(a: AssetForm) {
  const f = Object.assign(createDefaultTransferFormData(), FORM, { assets: [a] }) as TransferFormData;
  const issues = allIssues(f).map(String);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  return { issues, status: res.status };
}
const FRAC_WIN = "지분 50%를 가진 자산에서 담보평가액";
const EXCESS = "채무액(";

describe("SF-1 지분 50% 담보 승 — 주택은 계산하고, 확인하지 못한 종류는 정확한 사유로 막는다", () => {
  it("주택: ⑧ 통과 · ⑫ 200 (S-2)", async () => {
    const r = await run(house(HALF));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
  });
  it("재개발 APT: ⑧ 1건(지분 자산 담보 승 사유) · 「채무액(」 초과 사유 없음", async () => {
    const r = await run(house(HALF, x({ assetKind: "redevelopment_apt" })));
    expect(r.issues.filter((m) => m.includes(FRAC_WIN)).length).toBe(1);
    expect(r.issues.some((m) => m.includes(EXCESS))).toBe(false);
  });
});

describe("SF-2 진짜 채무 초과 — 종전 문구 유지", () => {
  it("설정액이 작아 담보가 못 이기는 지분 자산(채무 7억 > 시가 해당분 5억): 「채무액(」 초과", async () => {
    const r = await run(house(HALF, x({ bgMortgageSetAmount: "100000000" })));
    expect(r.issues.some((m) => m.includes(EXCESS))).toBe(true);
    expect(r.issues.some((m) => m.includes(FRAC_WIN))).toBe(false);
  });
});

describe("SF-3 대조", () => {
  it("지분 50% 보충 승(채무 3억) — ⑧ 통과", async () => {
    const r = await run(house(HALF, x({ bgMortgageDebtAmount: "300000000", bgMortgageSetAmount: "300000000" })));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
  });
  it("지분 100% 담보 승(채무 12억 > 시가 10억) — ⑧ 통과(종전 O-5)", async () => {
    const r = await run(house(x({ bgMortgageDebtAmount: "1200000000", bgMortgageSetAmount: "1200000000" })));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
  });
});
