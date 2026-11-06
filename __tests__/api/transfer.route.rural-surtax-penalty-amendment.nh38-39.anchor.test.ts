/**
 * anchor — 조특법 §99·§99의3 리뷰 L6: 농어촌특별세의 납부지연가산세(NH-38)·수정신고·경정청구(NH-39)·§99 농특세 echo(NH-78).
 *
 * 법령
 *   · 「국세기본법」 §2 1호 차목 — 「국세」에 농어촌특별세 포함.
 *   · 「국세기본법」 §47의4① — 괄호가 빼는 국세는 인지세뿐 ⇒ 농특세 미납분에도 납부지연가산세.
 *   · 「국세기본법」 §47의3① 괄호 — 「「농어촌특별세법」에 따른 신고는 제외」 ⇒ 농특세 추가분에 과소신고가산세 없음.
 *   · 「농어촌특별세법」 §7① — 본세를 신고·납부하는 때에 농특세도 함께 신고·납부.
 * 사용자 결정 Q-22: 농특세는 소득세와 **별도 줄**(세목 간 상계 안 함) + 기납부 농특세 입력 칸.
 *   리뷰의 「심판례 노선」(과다납부 농특세를 소득세 기납부로 인정 → 소득세 납부지연가산세 2,034,329)은
 *   결정되지 않았다 — 현행 산식(2,542,911)을 그대로 고정한다(V-13 미확인).
 *
 * 경로: JSON body → ⑫ Zod → ⑭ route(2-pass) → 엔진. 세율표는 mock(`makeMockRates`)이라 정본 세액이 아니다.
 * 시료는 §99·§99의3 「최초 계약」 칸을 «예»로 둔다 — 빈 값은 불성립 + 확인 필요다(#2938).
 * Pre-Do 실측(수정 전 · 같은 픽스처): §99 totalTax 116,564,589(농특세분 가산세 0) · C1 농특세 줄 없음 ·
 *   C4 수정신고 총 납부세액 9,019,634만 · C6 농특세 과납 8,437,000 미표시.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { case44RedevelopmentInfo } from "../tax-engine/transfer-tax/redevelopment/_helpers";

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
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
async function post(body: unknown): Promise<{ status: number; json: Json }> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
async function result(body: unknown) {
  const r = await post(body);
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  return r.json.data.result;
}

// ── §99 (리뷰 A1·C1·C4·C6 픽스처) ──
const BASE99 = {
  propertyType: "housing", transferPrice: 900_000_000, transferDate: "2024-08-01",
  acquisitionPrice: 300_000_000, acquisitionDate: "1999-01-01", expenses: 0,
  useEstimatedAcquisition: false, householdHousingCount: 2, isRegulatedArea: false,
  wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
  isOneHousehold: false, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
};
const R99 = (std5: number) => ({
  type: "new_99", acquisitionType99: "from_builder", firstContract99: "yes", contractDate99: "1998-06-01",
  isResident99: true, isHousingConstructionBusiness99: false, isNationalHousing99: true,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: std5,
  standardPriceAtTransfer99: 250_000_000, hasOccupancyAtContract99: false, exclusiveAreaSqm99: 84,
});
const NONE_FILING = {
  determinedTax: 0, reductionAmount: 0, priorPaidTax: 0, originalFiledTax: 0, excessRefundAmount: 0,
  interestSurcharge: 0, filingType: "none", penaltyReason: "normal",
};
const late99 = (d: Record<string, unknown> = {}) => ({
  ...BASE99, reductions: [R99(160_000_000)], filingPenaltyDetails: NONE_FILING,
  delayedPaymentDetails: { unpaidTax: 0, unpaidTaxMode: "auto", paymentDeadline: "2024-10-31", actualPaymentDate: "2025-10-31", ...d },
});

describe("NH-38 단건 route — 농특세 미납분 납부지연가산세(소득세분과 별도 줄)", () => {
  it("§99 자동(전액 미납): 농특세 13,238,000 × 364일 × 0.022% = 1,060,099 → totalTax 116,564,589 → 117,624,688", async () => {
    const r = await result(late99());
    expect(r.determinedTax).toBe(74_870_000);
    expect(r.ruralSurtax).toBe(13_238_000);
    // 소득세분 가산세는 그대로(무신고·과소신고가산세는 농특세에 붙지 않는다 — §47의2①·§47의3① 괄호)
    expect(r.penaltyDetail.filingPenalty.filingPenalty).toBe(14_974_000);
    expect(r.penaltyDetail.delayedPaymentPenalty.unpaidTax).toBe(74_870_000);
    expect(r.penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty).toBe(5_995_589);
    expect(r.ruralSurtaxDelayedPenalty).toMatchObject({
      ruralSurtax: 13_238_000, paidRuralSurtax: 0, unpaidRuralSurtax: 13_238_000, penalty: 1_060_099,
    });
    expect(r.totalTax).toBe(117_624_688);
    // 지방소득세 base에 넣지 않는다
    expect(r.localIncomeTax).toBe(7_487_000);
    const step = r.steps.find((s: { label: string }) => s.label.startsWith("농어촌특별세 납부지연가산세"));
    expect(step?.amount).toBe(1_060_099);
    expect(step?.formula).toContain("미납 농어촌특별세 13,238,000 × 364일");
  });

  it("기납부 농특세: 일부 납부 → 미납분만 · 전액 납부 → 키 없음(종전 totalTax)", async () => {
    const part = await result(late99({ paidRuralSurtax: 3_238_000 }));
    expect(part.ruralSurtaxDelayedPenalty.unpaidRuralSurtax).toBe(10_000_000);
    expect(part.ruralSurtaxDelayedPenalty.penalty).toBe(800_800); // 10,000,000 × 364 × 0.022%
    expect(part.totalTax).toBe(116_564_589 + 800_800);
    const full = await result(late99({ paidRuralSurtax: 13_238_000 }));
    expect(full.ruralSurtaxDelayedPenalty).toBeUndefined();
    expect(full.totalTax).toBe(116_564_589);
  });

  it("소득세 직접 입력 0(완납)이어도 농특세는 기납부 농특세로 따로 판단한다(세목 간 상계 안 함)", async () => {
    const r = await result(late99({ unpaidTax: 0, unpaidTaxMode: "manual" }));
    expect(r.penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty).toBe(0);
    expect(r.ruralSurtaxDelayedPenalty.penalty).toBe(1_060_099);
  });

  it("§99의3 단건(리뷰 S2 픽스처): 농특세 9,056,666 × 364일 → 725,257", async () => {
    const r = await result({
      ...BASE99, transferPrice: 800_000_000, acquisitionDate: "2003-09-01", transferDate: "2022-08-01",
      reductions: [{
        type: "new_99_3", contractDate993: "2002-03-01", acquisitionType993: "from_builder", firstContract993: "yes", region993: "outside_speculation",
        isResident993: true, isHousingConstructionBusiness993: false, exclusiveAreaSqm993: 84,
        standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000, standardPriceAtTransfer993: 400_000_000,
      }],
      filingPenaltyDetails: NONE_FILING,
      delayedPaymentDetails: { unpaidTax: 0, unpaidTaxMode: "auto", paymentDeadline: "2022-10-31", actualPaymentDate: "2023-10-31" },
    });
    expect(r.ruralSurtax).toBe(9_056_666);
    expect(r.ruralSurtaxDelayedPenalty.penalty).toBe(725_257);
  });

  it("⑫ 음수 기납부 농특세는 400", async () => {
    const r = await post(late99({ paidRuralSurtax: -1 }));
    expect(r.status).toBe(400);
  });
});

// ── 형제 경로(엔진 직접) — 재개발 §166 · 합산 신고서 단위 · 다건 자산별 ──
const rates = makeMockRates();
const D = (v: string) => new Date(v);
const R993redev = {
  type: "new_99_3" as const, contractDate993: "2002-01-01",
  standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 160_000_000, standardPriceAtTransfer993: 250_000_000,
  region993: "outside_speculation" as const, acquisitionType993: "from_builder" as const, firstContract993: "yes" as const,
};

describe("NH-38 형제 경로", () => {
  it("재개발 §166 경로 §99의3(사례 44 · 182일): 농특세 5,950,012 → 238,238", () => {
    const input = baseTransferInput({
      propertyType: "redevelopment_apt", transferPrice: 525_000_000, transferDate: D("2026-02-16"),
      acquisitionDate: D("2005-04-09"), acquisitionPrice: 0, expenses: 0, useEstimatedAcquisition: true,
      isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      redevelopment: case44RedevelopmentInfo(), reductions: [R993redev],
    } as never);
    const plain = calculateTransferTax(input, rates);
    const r = calculateTransferTax(
      { ...input, delayedPaymentDetails: { unpaidTax: plain.determinedTax, unpaidTaxMode: "manual", paymentDeadline: D("2026-04-30"), actualPaymentDate: D("2026-10-30") } },
      rates,
    );
    expect(r.ruralSurtax).toBe(5_950_012);
    expect(r.ruralSurtaxDelayedPenalty?.penalty).toBe(238_238);
    expect(r.totalTax).toBe(plain.totalTax + (r.penaltyDetail?.totalPenalty ?? 0) + 238_238);
  });

  const house = () =>
    ({
      ...baseTransferInput({
        transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2015-07-01"), transferDate: D("2022-08-01"),
        householdHousingCount: 2, reductions: [R993redev],
      } as never),
      propertyId: "p993",
      propertyLabel: "p993",
    }) as never;

  it("합산 신고서 단위(리뷰 D1 픽스처): 농특세 7,843,200 × 364일 → 628,083", () => {
    const delayed = { unpaidTax: 0, unpaidTaxMode: "auto" as const, paymentDeadline: D("2022-10-31"), actualPaymentDate: D("2023-10-31") };
    const plain = calculateTransferTaxAggregate({ taxYear: 2022, annualBasicDeductionUsed: 0, properties: [house()] } as never, rates);
    const agg = calculateTransferTaxAggregate(
      { taxYear: 2022, annualBasicDeductionUsed: 0, properties: [house()], delayedPaymentDetails: delayed } as never,
      rates,
    );
    expect(agg.ruralSurtax).toBe(7_843_200);
    expect(agg.filingUnitRuralSurtaxDelayedPenalty?.penalty).toBe(628_083);
    expect(agg.ruralSurtaxDelayedPenalty).toBe(628_083);
    expect(agg.totalTax).toBe(plain.totalTax + agg.penaltyTax + 628_083);
  });

  it("다건 자산별: route가 주입한 예정신고 농특세(ruralSurtaxForPenalty)가 base · 합계가 totalTax에 들어간다", () => {
    const withDelayed = {
      ...(house() as object),
      delayedPaymentDetails: {
        unpaidTax: 0, unpaidTaxMode: "auto" as const, paymentDeadline: D("2022-10-31"), actualPaymentDate: D("2023-10-31"),
        ruralSurtaxForPenalty: 10_000_000,
      },
    } as never;
    const plain = calculateTransferTaxAggregate({ taxYear: 2022, annualBasicDeductionUsed: 0, properties: [house()] } as never, rates);
    const agg = calculateTransferTaxAggregate({ taxYear: 2022, annualBasicDeductionUsed: 0, properties: [withDelayed] } as never, rates);
    // 10,000,000 × 364일 × 0.022% = 800,800
    expect(agg.properties[0].ruralSurtaxDelayedPenalty?.penalty).toBe(800_800);
    expect(agg.ruralSurtaxDelayedPenalty).toBe(800_800);
    expect(agg.totalTax).toBe(plain.totalTax + agg.penaltyTax + 800_800);
  });
});

// ── NH-39 수정신고·경정청구 ──
const AMEND = {
  correctionKind: "amend", applyUnderReportingPenalty: true, underReportingReason: "normal", underReductionMode: "auto_48_2",
  applyLatePaymentPenalty: true, statutoryFilingDeadline: "2025-05-31", amendedFilingDate: "2026-03-02", amendedPaymentDate: "2026-03-02",
};

describe("NH-39 route — 농특세 정정 별도 줄(양도소득세와 상계 안 함)", () => {
  it("C1 경정청구(당초 §99 미적용 → §99 추가): 소득세 환급 66,190,000 그대로 + 농특세 13,238,000 추가 납부 줄", async () => {
    const r = await result({
      ...BASE99, reductions: [R99(160_000_000)],
      amendment: {
        correctionKind: "refund_claim", originalDeterminedTax: 141_060_000, applyUnderReportingPenalty: false,
        underReportingReason: "normal", underReductionMode: "auto_48_2", applyLatePaymentPenalty: false,
        statutoryFilingDeadline: "2025-05-31", amendedFilingDate: "2026-03-02", claimReasonType: "ordinary",
      },
    });
    const a = r.amendmentDetail;
    expect(a.refundTax).toBe(66_190_000);
    expect(a.ruralSurtax).toEqual({
      originalRuralSurtax: 0, amendedRuralSurtax: 13_238_000, additionalRuralSurtax: 13_238_000,
      latePaymentPenalty: 0, refundRuralSurtax: 0, totalPayable: 13_238_000,
    });
    expect(a.steps.map((s: { label: string }) => s.label)).toContain("농어촌특별세 추가 납부");
  });

  it("C4 수정신고(8.5억 → 9억 · 당초 농특세 12,034,000): 소득세 9,019,634 그대로 + 농특세 1,204,000 + 납부지연 72,577", async () => {
    const r = await result({
      ...BASE99, reductions: [R99(160_000_000)],
      amendment: { ...AMEND, originalDeterminedTax: 66_890_000, originalRuralSurtax: 12_034_000 },
    });
    const a = r.amendmentDetail;
    expect(a.totalPayable).toBe(9_019_634);
    expect(a.ruralSurtax).toEqual({
      originalRuralSurtax: 12_034_000, amendedRuralSurtax: 13_238_000, additionalRuralSurtax: 1_204_000,
      latePaymentPenalty: 72_577, refundRuralSurtax: 0, totalPayable: 1_276_577,
    });
    // 과소신고가산세는 농특세에 붙지 않는다(§47의3① 괄호) — 0원 고지 줄
    const excluded = a.steps.find((s: { label: string }) => s.label.startsWith("농어촌특별세 과소신고가산세"));
    expect(excluded?.amount).toBe(0);
  });

  it("C6 수정신고(5년 시점 기준시가 2억 → 1.6억): 농특세 과납 8,437,000 환급 줄 · 소득세 납부지연 2,542,911 현행 유지(심판례 노선 미채택)", async () => {
    const r = await result({
      ...BASE99, reductions: [R99(160_000_000)],
      amendment: { ...AMEND, originalDeterminedTax: 32_685_000, originalRuralSurtax: 21_675_000 },
    });
    const a = r.amendmentDetail;
    expect(a.latePaymentPenalty).toBe(2_542_911);
    expect(a.totalPayable).toBe(47_680_861);
    expect(a.ruralSurtax).toMatchObject({ additionalRuralSurtax: 0, refundRuralSurtax: 8_437_000, totalPayable: 0 });
  });

  it("농특세가 정정 전후 모두 0이면 키가 없다(종전 결과 불변)", async () => {
    const r = await result({ ...BASE99, reductions: [], amendment: { ...AMEND, originalDeterminedTax: 100_000_000 } });
    expect(r.amendmentDetail.ruralSurtax).toBeUndefined();
  });
});

// ── NH-78 §99 농특세(2-pass) echo ──
describe("NH-78 — §99 농특세 금액·echo 고정", () => {
  it("(감면 전 141,060,000 − 감면 후 74,870,000) × 20% = 13,238,000 — 총액·new99Detail·단계 라벨", async () => {
    const r = await result({ ...BASE99, reductions: [R99(160_000_000)] });
    expect(r.ruralSurtax).toBe(13_238_000);
    expect(r.new99Detail.ruralSurtax).toBe(13_238_000);
    expect(r.new99Detail.taxReductionForRuralSurtax).toBe(66_190_000);
    const step = r.steps.find((s: { label: string }) => s.label === "§99 농어촌특별세 (감면세액 × 20%)");
    expect(step?.amount).toBe(13_238_000);
    expect(r.totalTax).toBe(74_870_000 + 7_487_000 + 13_238_000);
  });
});
