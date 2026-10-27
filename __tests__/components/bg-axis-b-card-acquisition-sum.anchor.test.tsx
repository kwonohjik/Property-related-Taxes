/**
 * anchor ⑦: 축 B × 부담부증여 결과 명세 — 지분 카드별 행 · 합계 · 신고서 취득가액 합계 · 신고서 표 배지.
 * 계획서 `docs/02-design/features/bg-axis-b-card-acquisition-sum.plan.md`(Q-1 a · Q-2 a · Q-3 a).
 *
 * 수정 전: 「건물 취득가 = 실지취득가 400,000,000 × 채무비율 40%」 한 줄(첫 지분 값) · 「신고서 취득가액 합계」는 첫 지분 값(원 + 원 100,000,000).
 * 시료는 route anchor `__tests__/api/transfer.route.bg-axis-b-card-acquisition-sum.anchor.test.ts`와 같다.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type A = Record<string, unknown>;
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const first = (over: A) =>
  ({
    ...makeDefaultAsset(1), assetId: "p", addressJibun: "서울 강남구 테스트동 9-9", assetKind: "right_to_move_in", redevSubject: "right",
    acquisitionCause: "purchase", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgMortgageDebtAmount: "600,000,000",
    bgDonorRelation: "lineal_descendant", bgRightMemberRightsValue: "1,200,000,000", bgRightPaidInstallments: "200,000,000", bgRightPremium: "100,000,000",
    redevApprovalLawBasis: "urban_renovation_art_74", redevApprovalDate: "2018-06-01", standardPriceAtAcq: "", standardPriceAtTransfer: "", ...HALF, ...over,
  }) as AssetForm;
const share = (over: A) =>
  ({ ...makeDefaultAsset(2), assetId: "s", ...HALF, acquisitionCause: "purchase", redevApprovalDate: "2018-06-01", ...over }) as AssetForm;
const SUCC: A = { ...successorRightTogglePatch(true), acquisitionDate: "2020-01-01", successorRightAcqPrice: "300,000,000", successorRightAddedContribution: "100,000,000" };
const ORIG: A = {
  isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01", redevOriginalAssetType: "housing", redevRightsValue: "900,000,000",
  redevSettlementDirection: "pay", redevSettlementAmount: "100,000,000", redevPreApprovalExpenses: "0", redevApprovalLawBasis: "urban_renovation_art_74",
};
const ACQ3 = { bgActualAcquisitionTotal: "300,000,000" };
const rights = (p: AssetForm, s: AssetForm) =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assetSplitMode: "fractional", contractTotalPrice: "1500000000", assets: [p, s],
  }) as TransferFormData;

const PRES: A = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "appraisal" };
const house = (id: number, num: string, acq: string, over: A) =>
  ({
    ...makeDefaultAsset(id), assetId: id === 1 ? "p" : `s${id}`, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
    acquisitionDate: acq, ownershipNumerator: num, ownershipDenominator: "100", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant",
    bgLendingDepositTotal: "300000000", bgMortgageDebtAmount: "300000000", standardPriceAtTransfer: "1000000001", ...PRES, ...over,
  }) as AssetForm;
const houses = Object.assign(createDefaultTransferFormData(), {
  transferDate: "2024-03-01", filingDate: "2024-05-31", contractTotalPrice: "1000000000", totalTransferExpense: "0", householdHousingCount: "2",
  isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  assets: [
    house(1, "60", "2009-03-01", { bgPresumedAcquisitionTotal: "400000000", standardPriceAtAcq: "200000000" }),
    house(2, "40", "2012-03-01", { bgPresumedAcquisitionTotal: "500000000", standardPriceAtAcq: "300000000" }),
  ],
}) as TransferFormData;

async function view(f: TransferFormData) {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const d = r.json.data;
  const c = render(
    <BundledAllocationCard apportionment={d.apportionment} aggregated={d.aggregated} transferBurdenedGiftBreakdown={d.transferBurdenedGiftBreakdown} formData={f} />,
  ).container;
  const texts = (id: string) => [...c.querySelectorAll(`[data-testid="${id}"]`)].map((e) => e.textContent ?? "");
  return { c, texts };
}

describe("입주권 — 지분 카드별 행 (Q-2 a · Q-3 a)", () => {
  it("R-1 승계 4억 + 원조합원 3억 — 원조합원 행은 인가 전 분 · 카드별 신고서 값 · 합계 140,000,000 · 신고서 합계 180,000,000", async () => {
    const { c, texts } = await view(rights(first({ ...SUCC, ...ACQ3 }), share(ORIG)));
    expect(texts("bg-bundle-card")).toEqual(["자산 1 (지분 50%) — 실지취득가액 안분 · §97①1호가목", "자산 2 (지분 50%) — 실지취득가액 안분 · §97①1호가목"]);
    const rows = texts("bg-bundle-card-acquisition");
    expect(rows[0]).toBe("취득가액 = 실지취득가(지분분) 200,000,000 × 채무비율 40.0000%80,000,000");
    expect(rows[1]).toBe("종전 부동산 취득가(인가 전 분) = 실지취득가(지분분) 150,000,000 × 채무비율 40.0000%60,000,000");
    expect(texts("bg-bundle-card-redev-filing")).toEqual([expect.stringContaining("100,000,000")]);
    expect(texts("bg-bundle-acquisition-total")[0]).toBe("취득가액 합계 (카드별 계산 결과 — 원조합원 지분은 인가 전 분)140,000,000");
    expect(texts("bg-redev-filing-acquisition")[0]).toContain("180,000,000");
    // 첫 지분 값으로 그린 한 줄 산식은 그리지 않는다(수정 전 「건물 취득가 = 실지취득가 400,000,000 × 채무비율 40.0000%」)
    expect(c.textContent).not.toContain("실지취득가 400,000,000");
  });

  it("R-2 원조합원 + 원조합원 — 신고서 취득가액 합계 200,000,000(수정 전 첫 지분 100,000,000)", async () => {
    const { texts } = await view(rights(first({ ...ORIG, ...ACQ3 }), share(ORIG)));
    expect(texts("bg-bundle-card-redev-filing")).toHaveLength(2);
    expect(texts("bg-redev-filing-acquisition")[0]).toContain("200,000,000");
    expect(texts("bg-bundle-acquisition-total")[0]).toContain("120,000,000");
  });

  it("R-3 승계 4억 + 승계 6억 — 합계 200,000,000(수정 전 160,000,000) · §166 줄 없음 · 합계 문구 「세액에 쓰인 값」", async () => {
    const { texts } = await view(rights(first(SUCC), share({ ...SUCC, successorRightAcqPrice: "500,000,000" })));
    expect(texts("bg-bundle-acquisition-total")[0]).toBe("취득가액 합계 (카드별 계산 결과 — 세액에 쓰인 값)200,000,000");
    expect(texts("bg-bundle-card-redev-filing")).toEqual([]);
    expect(texts("bg-redev-filing-acquisition")).toEqual([]);
  });
});

describe("주택 감정가액 — 근거 값 「지분분」 · 카드별 개산공제 (Q-3 a)", () => {
  it("R-4 4억(60%) / 5억(40%) — 행 144,000,000 · 120,000,000 · 개산공제 2,160,000 × 2 · 합계 264,000,000", async () => {
    const { texts } = await view(houses);
    expect(texts("bg-bundle-card-acquisition")).toEqual([
      "취득가액 = 감정가액(지분분) 240,000,000 × 채무비율 60.0000%144,000,000",
      "취득가액 = 감정가액(지분분) 200,000,000 × 채무비율 60.0000%120,000,000",
    ]);
    expect(texts("bg-bundle-card-estimated-deduction")).toEqual([
      "개산공제 = 취득시 기준시가(지분분) 120,000,000 × 채무비율 60.0000% × 개산공제율 3%2,160,000",
      "개산공제 = 취득시 기준시가(지분분) 120,000,000 × 채무비율 60.0000% × 개산공제율 3%2,160,000",
    ]);
    expect(texts("bg-bundle-acquisition-total")[0]).toContain("264,000,000");
  });

  it("R-5 신고서 표 배지 — 의제 카드가 없으면 의제 문구를 쓰지 않는다", async () => {
    const { c } = await view(houses);
    const badge = [...c.querySelectorAll("span[title]")].map((e) => e.getAttribute("title") ?? "").find((s) => s.includes("§159①"));
    expect(badge).toContain("자산별 §159①1호 취득가액 × 채무비율 — 부담부증여 명세 참조");
    expect(badge).not.toContain("의제취득일");
  });
});
