/**
 * anchor — 교재 사례: 배우자에게 증여받은 상가건물을 1년 안에 양도 · 이월과세(소득세법 §97의2) 적용·미적용 비교.
 *
 * ## 자료
 * - 을(배우자) 취득 2017.4.1. 실거래가 600,000,000 · 자본적지출 15,000,000
 * - 갑 증여받음 2026.3.1. 시가 800,000,000 · 증여세 산출세액 30,000,000(신고세액공제 후 납부 29,100,000)
 * - 갑 양도 2026.10.5. 900,000,000 · 갑의 자본적지출 20,000,000
 * - 장기보유특별공제율 8년 이상 9년 미만 16% · 9년 이상 10년 미만 18%
 *
 * ## 손계산 (교재 해답 — 엔진 값을 쓰지 않음)
 * 이월과세 적용(A): 900,000,000 − 600,000,000 − (15,000,000 + 20,000,000) − 증여세 산출세액 30,000,000 = 235,000,000
 *   보유 2017.4.1.~2026.10.5. = 9년 → 18% → 42,300,000 · 양도소득금액 192,700,000
 *   과세표준 190,200,000 → 3,706만 + (190,200,000 − 150,000,000) × 38% = 52,336,000
 * 이월과세 미적용(B): 900,000,000 − 800,000,000 − 20,000,000 = 80,000,000 · 보유 7개월 → 장기보유특별공제 0
 *   과세표준 77,500,000 × 50%(보유 1년 미만) = 38,750,000
 * 판정(§97의2②3호): A 52,336,000 ≥ B 38,750,000 → 이월과세 적용 · 갑의 산출세액 52,336,000
 *
 * 증여세 상당액 칸에는 신고세액공제 후 납부액이 아니라 산출세액(30,000,000)을 넣는다 — 화면 입력값 그대로다.
 *
 * ## 경로
 * 화면 폼 → ⑧ `validateStepDetailed`(4단계) → ④ `callTransferTaxAPI` body → ⑫ Zod → ⑭ route → 엔진.
 * 자산 종류 「건물(토지 제외)」·「상업용건물·오피스텔」 두 갈래가 같은 값이어야 한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { bodyOf } from "@/__tests__/calc/_helpers/carryover-donor-built-bg-form";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

function textbookForm(kind: AssetForm["assetKind"]): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2026-10-05";
  f.contractTotalPrice = "900,000,000";
  f.isOneHousehold = false;
  f.householdHousingCount = "0";
  f.assets[0] = {
    ...makeDefaultAsset(1),
    assetKind: kind,
    acquisitionCause: "carryover_gift",
    acquisitionDate: "2026-03-01",
    capitalExpenditure: "20,000,000",
    transferExpense: "0",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2026-03-01",
      donorAcquisitionDate: "2017-04-01",
      donorAcquisitionPrice: "600,000,000",
      giftDateValuation: "800,000,000",
      giftTaxAmount: "30,000,000",
      donorCapitalExpenditure: "15,000,000",
      donorRelation: "spouse",
    },
  } as AssetForm;
  return withTestAddress(f);
}

async function runScreenPath(kind: AssetForm["assetKind"]) {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  const f = textbookForm(kind);
  const issues = [0, 1, 2, 3].map((s) => validateStepDetailed(s, f));
  const body = await bodyOf(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  return { issues, status: res.status, result: json.data?.result };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("교재 — 배우자 증여 상가건물 이월과세 적용·미적용 비교 (§97의2)", () => {
  for (const kind of ["building", "commercial_building"] as const) {
    describe(kind, () => {
      it("⑧ 4단계 모두 통과 · route 200", async () => {
        const { issues, status } = await runScreenPath(kind);
        expect(issues).toEqual([null, null, null, null]);
        expect(status).toBe(200);
      });

      it("이월과세 적용(A) — 양도소득금액 192,700,000 · 산출세액 52,336,000", async () => {
        const { result } = await runScreenPath(kind);
        const a = result.carryoverTaxationDetail.scenarioA;
        expect(a.acquisitionPrice).toBe(600_000_000);
        expect(a.donorCapexAddedToExpense).toBe(15_000_000);
        expect(a.effectiveCapex).toBe(35_000_000);
        expect(a.giftTaxAddedToExpense).toBe(30_000_000);
        expect(a.transferGain).toBe(235_000_000);
        expect(a.determinedTax).toBe(52_336_000);
      });

      it("이월과세 미적용(B) — 양도소득금액 80,000,000 · 산출세액 38,750,000(보유 1년 미만 50%)", async () => {
        const { result } = await runScreenPath(kind);
        const b = result.carryoverTaxationDetail.scenarioB;
        expect(b.acquisitionPrice).toBe(800_000_000);
        expect(b.transferGain).toBe(80_000_000);
        expect(b.longTermHoldingDeduction).toBe(0);
        expect(b.taxBase).toBe(77_500_000);
        expect(b.calculatedTax).toBe(38_750_000);
        expect(b.determinedTax).toBe(38_750_000);
      });

      it("판정 — A 채택 · 최종 결과가 A 값(장특 18% 42,300,000 · 과세표준 190,200,000 · 38%)", async () => {
        const { result } = await runScreenPath(kind);
        const d = result.carryoverTaxationDetail;
        expect(d.isEligible).toBe(true);
        expect(d.adoptedScenario).toBe("A");
        expect(d.exclusionReason).toBeUndefined();
        expect(result.transferGain).toBe(235_000_000);
        expect(result.longTermHoldingRate).toBe(0.18);
        expect(result.longTermHoldingDeduction).toBe(42_300_000);
        expect(result.transferGain - result.longTermHoldingDeduction).toBe(192_700_000);
        expect(result.basicDeduction).toBe(2_500_000);
        expect(result.taxBase).toBe(190_200_000);
        expect(result.appliedRate).toBe(0.38);
        expect(result.calculatedTax).toBe(52_336_000);
      });
    });
  }
});
