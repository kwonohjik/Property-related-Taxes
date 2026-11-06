/**
 * anchor — NH-38·NH-39 형제 경로와 ①~⑭ 배선.
 *   · 겸용(§77) 단건 route · §155⑳ 특례 경로 · 다건 route 자산별(예정신고 농특세 base 주입)
 *   · ④ 단건·다건 payload(기납부 농특세 · 당초 농특세) · 이력 prefill
 * 세율표는 mock(`makeMockRates`) — 정본 세액이 아니다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { withIdentityStdInBody } from "../tax-engine/_helpers/mixed-use-identity-std";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateDelayedPaymentPenalty } from "@/lib/tax-engine/transfer-tax-penalty";
import { buildPenaltyAmendmentPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { extractOriginalRuralSurtax } from "@/lib/calc/transfer-amendment-entry";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CalculationRecord } from "@/lib/storage/types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
async function post(handler: (r: NextRequest) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(
    new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
const lateOf = (unpaid: number, deadline: string, paid: string) =>
  calculateDelayedPaymentPenalty({ unpaidTax: unpaid, paymentDeadline: new Date(deadline), actualPaymentDate: new Date(paid) })
    .delayedPaymentPenalty;

// ── 겸용(§77 공익수용 — 리뷰 F17-B 픽스처) ──
const MIXED = {
  transferPrice: 1_500_000_000, transferDate: "2024-03-01", acquisitionPrice: 300_000_000, acquisitionDate: "2009-03-01",
  expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isNonBusinessLand: false, isOneHousehold: false, annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
  propertyType: "mixed-use-house" as const,
  reductions: [{ type: "public_expropriation", cashCompensation: 800_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: "2024-01-01" }],
  mixedUse: {
    isMixedUseHouse: true as const, residentialFloorArea: 60, nonResidentialFloorArea: 40, buildingFootprintArea: 50, totalLandArea: 100,
    landAcquisitionDate: "2009-03-01", buildingAcquisitionDate: "2009-03-01",
    transferStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
    acquisitionStandardPrice: { housingPrice: 150_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 1_000_000 },
    residencePeriodYears: 0, zoneType: "general_residential" as const,
  },
};

describe("NH-38 겸용 route", () => {
  it("§77 농특세 1,064,086의 납부지연가산세가 totalPayable에 별도로 더해진다", async () => {
    const plain = await post(SINGLE, "http://localhost/api/calc/transfer", withIdentityStdInBody(MIXED));
    const late = await post(
      SINGLE,
      "http://localhost/api/calc/transfer",
      withIdentityStdInBody({
        ...MIXED,
        delayedPaymentDetails: { unpaidTax: 0, unpaidTaxMode: "manual", paymentDeadline: "2024-05-31", actualPaymentDate: "2024-12-31" },
      }),
    );
    expect(late.status, JSON.stringify(late.json.error)).toBe(200);
    const t = late.json.data.result.total;
    expect(t.ruralSurtax).toBe(1_064_086);
    expect(t.penaltyTax).toBe(0); // 소득세 완납(manual 0)
    const expected = lateOf(1_064_086, "2024-05-31", "2024-12-31");
    expect(expected).toBe(49_863); // 1,064,086 × 213일 × 0.022% = 49,863.07
    expect(t.ruralSurtaxDelayedPenalty.penalty).toBe(expected);
    expect(t.totalPayable).toBe(plain.json.data.result.total.totalPayable + expected);
  });
});

// ── §155⑳ 거주주택 특례 경로(§77 — D10-03 픽스처) ──
describe("NH-38 §155⑳ 특례 경로", () => {
  const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
    applyException: true, scenario: "A",
    rentalUnits: [{
      businessRegistrationDate: new Date("2018-06-01"), rentalRegistrationDate: new Date("2018-06-01"),
      rentalCategory: "long_general" as const, rentalAcquisitionType: "purchase" as const, isApartment: false,
      region: "non-metro" as const, isExcluded918Rule: false, standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    }],
  };
  const run = (over: Partial<TransferTaxInput> = {}) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 1_500_000_000, acquisitionPrice: 1_100_000_000,
        acquisitionDate: new Date("2014-06-01"), transferDate: new Date("2024-06-01"), residencePeriodMonths: 60,
        isOneHousehold: true, householdHousingCount: 1, expenses: 0,
        reductions: [{ type: "public_expropriation", cashCompensation: 1_500_000_000, bondCompensation: 0, businessApprovalDate: new Date("2020-01-01") }],
        rentalHousingException: rentalException, ...over,
      }),
      makeMockRates(),
    );
  it("특례 경로에서도 농특세 미납분 가산세가 totalTax에 별도로 들어간다", () => {
    const plain = run();
    expect(plain.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(plain.ruralSurtax).toBeGreaterThan(0);
    const r = run({
      delayedPaymentDetails: { unpaidTax: 0, unpaidTaxMode: "manual", paymentDeadline: new Date("2024-08-31"), actualPaymentDate: new Date("2025-08-31") },
    });
    const expected = lateOf(plain.ruralSurtax!, "2024-08-31", "2025-08-31");
    expect(expected).toBeGreaterThan(0);
    expect(r.ruralSurtaxDelayedPenalty?.penalty).toBe(expected);
    expect(r.totalTax).toBe(plain.totalTax + expected);
  });
});

// ── 다건 route 자산별 — base = 예정신고 농특세(route 주입) ──
describe("NH-38 다건 route 자산별", () => {
  const ITEM = {
    propertyId: "p1", propertyLabel: "자산 1", propertyType: "land", transferPrice: 1_000_000_000, transferDate: "2024-03-01",
    acquisitionPrice: 300_000_000, acquisitionDate: "2010-01-15", expenses: 0, useEstimatedAcquisition: false,
    householdHousingCount: 0, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    isNonBusinessLand: false, isOneHousehold: false, residencePeriodMonths: 0,
    reductions: [{ type: "public_expropriation", cashCompensation: 1_000_000_000, bondCompensation: 0, bondHoldingYears: null, businessApprovalDate: "2023-01-01" }],
  };
  it("자산별 납부지연 입력이 있으면 그 자산의 예정신고 농특세에 가산세가 붙고 totalTax에 들어간다", async () => {
    const plain = await post(MULTI, "http://localhost/api/calc/transfer/multi", { taxYear: 2024, properties: [ITEM] });
    expect(plain.status, JSON.stringify(plain.json.error)).toBe(200);
    const late = await post(MULTI, "http://localhost/api/calc/transfer/multi", {
      taxYear: 2024,
      properties: [{ ...ITEM, delayedPaymentDetails: { unpaidTax: 0, unpaidTaxMode: "manual", paymentDeadline: "2024-05-31", actualPaymentDate: "2024-12-31" } }],
    });
    expect(late.status, JSON.stringify(late.json.error)).toBe(200);
    const d = late.json.data;
    expect(d.ruralSurtax).toBeGreaterThan(0);
    const assetRural = d.properties[0].ruralSurtaxDelayedPenalty;
    // base = 그 자산만의 예정신고 농특세(기본공제 반영 · 단건 route 값) — 집계용 2차 계산(기본공제 제외) 값이 아니다(F03과 같은 축)
    const singleBody = Object.fromEntries(Object.entries(ITEM).filter(([k]) => k !== "propertyId" && k !== "propertyLabel"));
    const single = await post(SINGLE, "http://localhost/api/calc/transfer", { ...singleBody, annualBasicDeductionUsed: 0 });
    expect(single.status, JSON.stringify(single.json.error)).toBe(200);
    expect(assetRural.ruralSurtax).toBe(single.json.data.result.ruralSurtax);
    expect(assetRural.penalty).toBe(lateOf(assetRural.ruralSurtax, "2024-05-31", "2024-12-31"));
    expect(d.ruralSurtaxDelayedPenalty).toBe(assetRural.penalty);
    expect(d.totalTax).toBe(plain.json.data.totalTax + assetRural.penalty);
    // ⑭ 다건 기납부 농특세 — 전액 납부면 농특세분 가산세 없음
    const paid = await post(MULTI, "http://localhost/api/calc/transfer/multi", {
      taxYear: 2024,
      properties: [{ ...ITEM, delayedPaymentDetails: { unpaidTax: 0, unpaidTaxMode: "manual", paidRuralSurtax: assetRural.ruralSurtax, paymentDeadline: "2024-05-31", actualPaymentDate: "2024-12-31" } }],
    });
    expect(paid.status, JSON.stringify(paid.json.error)).toBe(200);
    expect(paid.json.data.ruralSurtaxDelayedPenalty).toBeUndefined();
    expect(paid.json.data.totalTax).toBe(plain.json.data.totalTax);
  });
});

// ── ④ payload · 이력 prefill ──
function form(o: Partial<TransferFormData> = {}): TransferFormData {
  return { ...createDefaultTransferFormData(), enablePenalty: true, paymentDeadline: "2024-05-31", ...o };
}
describe("④ 단건·다건 payload", () => {
  it("기납부 농특세: 값 → paidRuralSurtax · 빈 값·0 → 키 없음(엔진 0)", () => {
    const pd = (f: TransferFormData) => (buildPenaltyAmendmentPayload(f) as Json).delayedPaymentDetails;
    const pp = (f: TransferFormData) => (buildPropertyPayload(f) as Json).delayedPaymentDetails;
    expect(pd(form({ priorPaidRuralSurtax: "1,234,000" })).paidRuralSurtax).toBe(1_234_000);
    expect(pp(form({ priorPaidRuralSurtax: "1,234,000" })).paidRuralSurtax).toBe(1_234_000);
    expect("paidRuralSurtax" in pd(form({ priorPaidRuralSurtax: "" }))).toBe(false);
    expect("paidRuralSurtax" in pp(form({ priorPaidRuralSurtax: "0" }))).toBe(false);
  });
  it("당초 농특세: 단건 amendment에 originalRuralSurtax", () => {
    const a = (buildPenaltyAmendmentPayload(form({ amendmentMode: true, originalDeterminedTax: "66,890,000", originalRuralSurtax: "12,034,000" })) as Json).amendment;
    expect(a.originalRuralSurtax).toBe(12_034_000);
    const b = (buildPenaltyAmendmentPayload(form({ amendmentMode: true, originalDeterminedTax: "1", originalRuralSurtax: "" })) as Json).amendment;
    expect("originalRuralSurtax" in b).toBe(false);
  });
  it("당초 농특세: 다건 신고서 단위 amendment에 originalRuralSurtax", async () => {
    const cap: { body?: Json } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: {} }) } as unknown as Response;
    }));
    try {
      const properties = [{ propertyId: "p1", propertyLabel: "건1", form: createDefaultTransferFormData(), completionPercent: 100 }];
      await callMultiTransferTaxAPI(
        {
          taxYear: 2024, properties, activePropertyIndex: 0, activeStep: "settings", annualBasicDeductionUsed: "0",
          basicDeductionAllocation: "EARLIEST_TRANSFER", priorPaidTax: "0", priorPaidLocalTax: "0", priorPaidTaxEdited: false,
          priorPaidLocalTaxEdited: false, amendmentMode: true, correctionKind: "amend", originalDeterminedTax: "1,000",
          originalRuralSurtax: "21,675,000",
        } as never,
        properties as never,
      );
    } catch {
      /* 본문만 본다 */
    }
    vi.unstubAllGlobals();
    expect(cap.body?.amendment?.originalRuralSurtax).toBe(21_675_000);
  });
  it("이력 prefill — 단건 result · 겸용 total · 집계 aggregated의 농특세 총액", () => {
    const rec = (resultData: object) => ({ resultData }) as unknown as CalculationRecord;
    expect(extractOriginalRuralSurtax(rec({ result: { ruralSurtax: 13_238_000 } }))).toBe(13_238_000);
    expect(extractOriginalRuralSurtax(rec({ result: { total: { ruralSurtax: 1_064_086 } } }))).toBe(1_064_086);
    expect(extractOriginalRuralSurtax(rec({ aggregated: { ruralSurtax: 7_843_200 } }))).toBe(7_843_200);
    expect(extractOriginalRuralSurtax(rec({ result: {} }))).toBeUndefined();
  });
});
