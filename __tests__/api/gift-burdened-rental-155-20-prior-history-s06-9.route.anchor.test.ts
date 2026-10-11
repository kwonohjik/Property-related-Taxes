/**
 * S06-9 anchor(부담부증여) — 화면에 보이는(필수 표시) 「생애 한 차례」 이력 칸을 ⑧도 요구한다(3중 패턴).
 *
 * 근거: 2024.5.17. 시행 「소득세법 시행령」 §155⑳ 본문 괄호 「(장기임대주택을 보유하고 있는 경우에는 생애 한 차례만 거주주택을
 * 최초로 양도하는 경우에 한정한다)」(MST 262425)는 성립 요건 사실이다. 이력을 모르면 혜택을 적용하지 않는다(사용자 결정
 * 2026-10-04). 계산기 본체의 엔진 쪽 전환은 `rh-155-20-era-d1`·`transfer.route.rental-155-20-d1` OH40-6·OH40-8·D1R-2.
 *
 * 부담부증여 카드는 `mode="full"`이라 이력 라디오가 보이는데 ⑧(`gift-burdened-rental-exception.ts`)은 `"full"`이라 비워도
 * 통과했다 — 필수로 표시된 칸을 비운 채 계산되고, 엔진이 이력 없음으로 비과세를 냈다.
 * 계산기(`calc` 카드)는 칸이 없으므로 ⑧이 막지 않는다 — V-40d(`rental-155-20-d1-client.anchor`)가 그 짝을 고정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { giftBurdenedRentalExceptionError } from "@/lib/calc/gift-burdened-rental-exception";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

type Obj = Record<string, unknown>;
const unit = () => ({ ...makeDefaultRentalUnit(), businessRegistrationDate: "2016-06-01", rentalRegistrationDate: "2016-06-01",
  standardPriceAtRentalStart: "300,000,000", rentalInputMode: "direct" as const, rentalMonths: "96", requirementsConfirmed: true });
const giftForm = { giftDate: "2024-06-01", donor: "father", donorRelation: "lineal_ascendant_adult", priorGifts: [] } as unknown as FormState;
const item = (h: string) => ({
  id: "apt-1", category: "real_estate_apartment", name: "아파트", standardPrice: 800_000_000, leaseDeposit: 300_000_000,
  mortgageAmount: 0, assumedDebtForGift: 300_000_000, monthlyRent: 0,
  burdenedGiftTransferTax: { standardPriceAtAcquisition: 400_000_000, isOneHousehold: true, householdHousingCount: 1, isRegulatedArea: false,
    wasRegulatedAtAcquisition: false, residencePeriodMonths: 60, isUnregistered: false, acquisitionDate: new Date("2019-06-01"),
    rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [unit()], postRegistrationResidenceMonths: "", priorRentalExemptionHistory: h, residenceTransitionUnderAddendum: false },
  } as unknown as BurdenedGiftTransferTaxInput,
}) as EstateItem;
const v8 = (h: string) => {
  const it0 = item(h);
  return giftBurdenedRentalExceptionError(it0, it0.burdenedGiftTransferTax as BurdenedGiftTransferTaxInput, "2024-06-01", "증여 주택");
};
const route = async (h: string) => {
  const res = await SINGLE(new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(buildGiftBurdenedTransferBody(item(h), giftForm)) }));
  return ((await res.json()) as { data: { result: Obj } }).data.result as { totalTax: number };
};

beforeEach(() => vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()));
afterEach(() => vi.unstubAllGlobals());

describe("S06-9 부담부증여 — 이력 칸 ⑧ 동기화", () => {
  it("이력 미선택 → ⑧이 이력 선택을 요구한다(칸이 화면에 있다)", () => {
    expect(v8("")).toContain("이력");
  });
  it("긍정 짝 — 「없음」·「있음」을 고르면 ⑧ 통과", () => {
    expect(v8("none")).toBeNull();
    expect(v8("used")).toBeNull();
  });
  it("⑧을 우회한 API 직접 호출 — 미입력은 「있음」과 같은 과세(모름 = 혜택 불성립), 「없음」은 비과세", async () => {
    const used = await route("used");
    const blank = await route("");
    const none = await route("none");
    expect(used.totalTax).toBeGreaterThan(0);
    expect(blank.totalTax).toBe(used.totalTax);
    expect(none.totalTax).toBe(0);
  });
});
