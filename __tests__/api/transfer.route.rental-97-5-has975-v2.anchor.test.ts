/**
 * anchor — §97의5 «선택 사실» 기준으로 §97의3·§97의4를 배제하는 현행 동작 고정 (V-6 계획서 V-2).
 * 계획서 docs/00-pm/rental-97-5-has975-v2.plan.md (Q-1 a · Q-2 a).
 *
 * 조특법 §97의5②는 «중복하여 적용하지 아니한다»만 정하고 «선택»·«적용받는 경우»를 가르지 않는다.
 * 해석례·재결도 0건이라 기준을 바꿀 근거가 없다 → 현행(선택 사실)을 **고정**한다. 이 테스트가 깨지면
 * 기준이 바뀐 것이니 계획서 §4를 먼저 다시 본다.
 *
 * 고정하는 것
 *  1) 엔진: §97의5 항목이 있으면 **부적격이어도** §97의3·§97의4를 `OVERLAP_EXCLUDED_BY_97_5`로 돌린다(순서 무관).
 *  2) ⑧·⑫: §97의5 적격 여부와 무관하게 §97의3/4와의 조합을 400으로 막는다.
 *  3) 대조: §97의5 단독·§97의3 단독은 각자 200이다.
 * 세율표는 route 폴백이다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { evaluateRental97Lthd, evaluateRental97TaxAmount } from "@/lib/tax-engine/transfer-reductions/rental-97-router";
import { POST } from "@/app/api/calc/transfer/route";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/rate-limit")>();
  return { ...actual, checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }) };
});
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const STAT_5 = /\(조특법 §97의5②\)/;

// ── route 쪽 픽스처 (V-6 anchor와 같은 틀) ─────────────────────────────────────
const rentalCommon = {
  registrationDate: "2014-01-01", rentalStartDate: "2014-01-01", isTaxRegistered: true, taxRegistrationDate: "2014-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
const r973 = () => ({ ...getReductionDefault("rental_97_3"), ...rentalCommon, stdPriceAtAcquisition: "100,000,000", stdPriceAtTransfer: "400,000,000" });
const r974 = () => ({ ...getReductionDefault("rental_97_4"), ...rentalCommon, rental974Category: "purchase_a", region: "capital" });
const r975 = () => ({ ...getReductionDefault("rental_97_5"), ...rentalCommon, isPurchaseRental: true });

// 취득일 2003-03-01 → 등록(2014-01-01)이 취득일부터 3개월을 넘어 §97의5 부적격(REGISTRATION_AFTER_3_MONTHS)
const ACQ_INELIGIBLE = "2003-03-01";
// 취득일 2014-01-01 → 등록과 같은 날이라 §97의5 적격
const ACQ_ELIGIBLE = "2014-01-01";

function card(reductions: unknown[], acq: string): AssetForm {
  return Object.assign({ ...makeDefaultAsset(1) }, x({
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq,
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reductions as never,
  })) as AssetForm;
}
function form(c: AssetForm): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2025-08-01", contractTotalPrice: "900000000", assets: [c], isOneHousehold: false, householdHousingCount: "2",
  }) as TransferFormData;
}
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Any;
  return { status: res.status, fieldErrors: (json.error?.fieldErrors ?? {}) as Record<string, string[]>, result: json.data?.result ?? json.data };
}
const step8 = (f: TransferFormData) => validateStep2Reductions(2, f)?.message;

// ── 엔진 쪽 픽스처 (rental-97-5-overlap-exclusion.anchor 와 같은 틀) ───────────────
const D = (s: string) => new Date(`${s}T00:00:00`);
const CTX = { transferDate: D("2029-01-01"), acquisitionDate: D("2018-06-01"), stdPriceAtAcquisition: 500_000_000, stdPriceAtTransfer: 900_000_000, calculatedTax: 100_000_000 };
const E973 = {
  type: "rental_97_3", registrationDate: D("2018-08-01"), rentalStartDate: D("2018-09-01"), isTaxRegistered: true, taxRegistrationDate: D("2018-08-01"),
  officialPriceAtStart: 600_000_000, stdPriceAtRentalStart: 600_000_000, isNationalHousingScale: true, region: "capital", rentalContinuesToTransfer: true,
};
const E974 = { ...E973, type: "rental_97_4" };
const E975 = { ...E973, type: "rental_97_5", isPurchaseRental: true };
// 취득일(2018-06-01)로부터 3개월을 넘긴 2019-01-01 등록 → §97의5 부적격
const E975_INELIGIBLE = { ...E975, registrationDate: D("2019-01-01"), rentalStartDate: D("2019-01-01"), taxRegistrationDate: D("2019-01-01") };
const codes = (r: Any) => (r && !r.isEligible ? (r.ineligibleReasons ?? []).map((i: Any) => i.code) : []);

describe("엔진 — §97의5가 부적격이어도 선택돼 있으면 §97의3·§97의4를 배제한다 (현행 기준 고정)", () => {
  it("전제: 이 §97의5 픽스처는 정말 부적격이다(REGISTRATION_AFTER_3_MONTHS)", () => {
    const r = evaluateRental97TaxAmount([E975_INELIGIBLE] as Any, CTX as Any);
    expect(r?.isEligible).toBe(false);
    expect(codes(r)).toContain("REGISTRATION_AFTER_3_MONTHS");
  });
  it("전제: 같은 맥락에서 §97의3 단독은 적격이다", () => {
    expect(evaluateRental97Lthd([E973] as Any, CTX as Any)?.isEligible).toBe(true);
  });
  it.each([
    ["§97의3 + 부적격 §97의5", [E973, E975_INELIGIBLE]],
    ["부적격 §97의5 + §97의3", [E975_INELIGIBLE, E973]],
    ["§97의4 + 부적격 §97의5", [E974, E975_INELIGIBLE]],
    ["부적격 §97의5 + §97의4", [E975_INELIGIBLE, E974]],
  ])("%s — §97의3/4는 OVERLAP_EXCLUDED_BY_97_5로 부적격(배열 순서 무관)", (_n, reds) => {
    const r = evaluateRental97Lthd(reds as Any, CTX as Any);
    expect(r?.isEligible).toBe(false);
    expect(codes(r)).toEqual(["OVERLAP_EXCLUDED_BY_97_5"]);
    expect((r as Any)?.legalBasis).toBe("조특법 §97의5②");
  });
  it("적격 §97의5와 결과가 같다 — 배제 사유는 §97의5 적격 여부와 무관", () => {
    const eligible = evaluateRental97Lthd([E973, E975] as Any, CTX as Any);
    const ineligible = evaluateRental97Lthd([E973, E975_INELIGIBLE] as Any, CTX as Any);
    expect(codes(eligible)).toEqual(codes(ineligible));
  });
});

describe("⑧·⑫ — §97의5 적격 여부와 무관하게 §97의3/4 조합을 400으로 막는다", () => {
  const CASES: Array<[string, () => unknown[]]> = [
    ["[§97의5, §97의3]", () => [r975(), r973()]],
    ["[§97의3, §97의5]", () => [r973(), r975()]],
    ["[§97의5, §97의4]", () => [r975(), r974()]],
    ["[§97의4, §97의5]", () => [r974(), r975()]],
  ];
  describe.each([["부적격 §97의5", ACQ_INELIGIBLE], ["적격 §97의5", ACQ_ELIGIBLE]])("%s", (_label, acq) => {
    it.each(CASES)("%s — ⑧ 문구(§97의5②) 그대로 ⑫도 400", async (_n, mk) => {
      const f = form(card(mk(), acq));
      const m8 = step8(f) ?? "";
      expect(m8).toMatch(STAT_5);
      const r = await post(f);
      expect(r.status).toBe(400);
      expect(Object.values(r.fieldErrors).flat()).toContain(m8);
    });
  });
});

describe("대조 — 단독은 각자 200이고 §97의5 부적격은 결과 상세에 사유가 남는다", () => {
  it("부적격 §97의5 단독: 200 · 세액감면 0 · REGISTRATION_AFTER_3_MONTHS", async () => {
    const r = await post(form(card([r975()], ACQ_INELIGIBLE)));
    expect(r.status).toBe(200);
    expect(r.result.rental97TaxDetail?.isEligible).toBe(false);
    expect((r.result.rental97TaxDetail?.ineligibleReasons ?? []).map((i: Any) => i.code)).toContain("REGISTRATION_AFTER_3_MONTHS");
    expect(r.result.reductionAmount).toBe(0);
  });
  it("§97의3 단독: 200 · 적격 · 총세액 144,899,332(부적격 §97의5 단독 185,966,000보다 적다)", async () => {
    const r = await post(form(card([r973()], ACQ_INELIGIBLE)));
    expect(r.status).toBe(200);
    expect(r.result.rental97LthdDetail?.isEligible).toBe(true);
    expect(r.result.totalTax).toBe(144_899_332);
  });
  it("적격 §97의5 단독: 200 · 총세액 38,466,000 · 감면 192,330,000", async () => {
    const r = await post(form(card([{ ...r975() }], ACQ_ELIGIBLE)));
    expect(r.status).toBe(200);
    expect(r.result.rental97TaxDetail?.isEligible).toBe(true);
    expect(r.result.totalTax).toBe(38_466_000);
    expect(r.result.reductionAmount).toBe(192_330_000);
  });
});
