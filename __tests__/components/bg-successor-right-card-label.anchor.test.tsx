/**
 * 승계조합원 입주권 × 부담부증여 — 결과 명세의 자산별 취득가 라벨은 「입주권 취득가」(계획서 `bg-successor-rtmi-acquisition-input.plan.md` V-2 · 2026-11-12).
 * 종전: 「건물 취득가 = 실지취득가 400,000,000 × 채무비율 40.0000%」(값은 맞다 — 승계취득가액 3억 + 추가분담금 1억). 입주권은 권리(소득세법 §94①2호가목)다.
 * 원조합원 입주권은 「종전 부동산 취득가(인가 전 분)」 그대로다(대조). 시료는 E2E `bg-successor-rtmi-acquisition-input.spec.ts` · `transfer.sidebar-burdened-gift-acquisition.anchor.test.ts`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
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
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const COMMON = {
  addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase", transferType: "burdened_gift",
  bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600000000",
  bgRightMemberRightsValue: "1200000000", bgRightPaidInstallments: "200000000", bgRightPremium: "100000000",
  redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01",
};
const SUCCESSOR = {
  ...COMMON, isSuccessorRightToMoveIn: true, acquisitionDate: "2020-01-01", successorRightAcqPrice: "300000000", successorRightAddedContribution: "100000000",
  successorRightStdPaidAtAcq: "250000000", successorRightStdPremiumAtAcq: "50000000", bgActualAcquisitionTotal: "", actualSalePrice: "1500000000", fixedAcquisitionPrice: "500000000",
};
const ORIGINAL = {
  ...COMMON, isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", bgActualAcquisitionTotal: "300000000", redevOriginalAssetType: "housing",
  redevRightsValue: "900000000", redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false,
  standardPriceAtAcq: "", standardPriceAtTransfer: "",
};
const formOf = (a: Record<string, unknown>) =>
  rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", householdHousingCount: "2", isOneHousehold: false, contractTotalPrice: "1500000000",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets: [Object.assign({ ...makeDefaultAsset(1) }, a) as unknown as AssetForm],
  })) as TransferFormData;
async function cardText(a: Record<string, unknown>) {
  const f = formOf(a);
  expect(allIssues(f)).toEqual([]);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
  expect(res.status).toBe(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (await res.json()).data as any;
  const { container } = render(<SingleDetailCards result={d.result} formData={f} asset={f.assets[0]} />);
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

describe("승계 입주권 부담부증여 — 결과 명세 취득가 라벨(V-2)", () => {
  it("승계: 「입주권 취득가 = 실지취득가 400,000,000」 · 「건물 취득가」 없음", async () => {
    const t = await cardText(SUCCESSOR);
    expect(t).toContain("입주권 취득가 = 실지취득가 400,000,000 × 채무비율 40.0000%");
    expect(t).not.toContain("건물 취득가");
  });
  it("🔴 짝: 원조합원 입주권은 「종전 부동산 취득가(인가 전 분)」 그대로", async () => {
    const t = await cardText(ORIGINAL);
    expect(t).toContain("종전 부동산 취득가(인가 전 분)");
    expect(t).not.toContain("입주권 취득가");
  });
});

/** 축 B 승계 입주권 두 지분(60/40) · 시가 · 담보 — 시료는 `transfer.route.bg-successor-rtmi-axis-b.anchor.test.ts` XB-1 첫 행. */
const share = (id: string, num: string, std: [string, string]) =>
  Object.assign({ ...makeDefaultAsset(id === "p" ? 1 : 2) }, {
    ...COMMON, isSuccessorRightToMoveIn: true, redevIsSuccessorMember: "yes", acquisitionDate: "2020-01-01", successorRightAcqPrice: "300000000",
    successorRightAddedContribution: "100000000", bgActualAcquisitionTotal: "400000000", redevOriginalAssetType: "housing", redevRightsValue: "900000000",
    redevSettlementDirection: "pay", redevSettlementAmount: "200000000", redevPreApprovalExpenses: "0", useEstimatedAcquisition: false, standardPriceAtAcq: "", standardPriceAtTransfer: "",
    bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1500000000",
    bgMortgageDebtAmount: "3000000000", bgMortgageSetAmount: "3000000000", successorRightStdPaidAtAcq: std[0], successorRightStdPremiumAtAcq: std[1],
    assetId: id, ownershipNumerator: num, ownershipDenominator: "100",
  }) as unknown as AssetForm;

describe("축 B 승계 입주권 — 묶음 결과는 카드별 줄(`BgBundleCardAcqRows`)이라 종전에도 「건물 취득가」가 없다(회귀 방지)", () => {
  it("「건물 취득가」 없음 · 카드별 「취득가액 = 취득시 기준시가(지분분)」", async () => {
    const f = rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
      transferDate: "2026-02-16", filingDate: "2026-04-30", householdHousingCount: "2", isOneHousehold: false, totalTransferExpense: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assetSplitMode: "fractional", contractTotalPrice: "3000000000",
      assets: [share("p", "60", ["200000000", "100000000"]), share("s2", "40", ["150000000", "50000000"])],
    })) as TransferFormData;
    expect(allIssues(f)).toEqual([]);
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(await captureBody(f)) }));
    expect(res.status).toBe(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (await res.json()).data as any;
    expect(d.transferBurdenedGiftBreakdown).toBeDefined();
    const el = render(<BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />).container;
    const t = (el.textContent ?? "").replace(/\s+/g, " ");
    expect(t).toContain("취득가액 = 취득시 기준시가(지분분) 180,000,000");
    expect(t).not.toContain("건물 취득가");
  });
});
