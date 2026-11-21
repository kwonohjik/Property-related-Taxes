/**
 * anchor: 🔴 R-c06-01 — 겸용주택 신고서 표·상세명세서의 「가산세액」·「총결정세액」이
 * 국세기본법 가산세를 **두 번** 더하지 않는다.
 *
 * ## 종전 결함
 *
 * 신고서 표(`FilingFormTableHelpers.ts`)와 상세명세서(`DetailedStatementLateStages.ts`)는
 * 가산세를 `penaltyTax + penaltyDetail.totalPenalty`로 합산한다. 이 식은 단건 엔진 형상
 * (penaltyTax = 「소득세법」 §114조의2분, penaltyDetail = 「국세기본법」 §47의2~§47의4분)을 전제로 한다.
 * 그런데 겸용 어댑터(`mixedUseToFilingResult`)는 penaltyTax 슬롯에 국기법분을 그대로 넣고,
 * G-43(b06d09589) 이후로는 같은 금액을 penaltyDetail에도 실었다 → 같은 가산세가 두 번 합산됐다.
 * (리뷰 probe: 엔진 가산세 36,411,636 → 표 72,823,272 · 총결정세액 197,084,290 → 233,495,926)
 *
 * 종전 anchor(`transfer-penalty-attribution.anchor.test.ts`)는 손으로 만든 픽스처에 penaltyDetail이
 * 없어 이 결함을 가렸다 — 여기서는 **실제 겸용 엔진 결과**(mixedUseCase14 + 무신고 20% + 납부지연)를 쓴다.
 *
 * 단건(§114조의2 + 국기법)·집계 경로의 값이 바뀌지 않음도 함께 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../tax-engine/_helpers/mixed-use-identity-std";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../tax-engine/_helpers/mixed-use-fixture";

const rates = makeMockRates();

type Row = { label: string; values: Record<string, number | string | null> };
const rowTotal = (rows: Row[], label: string) => {
  const r = rows.find((x) => x.label === label);
  expect(r, `행 「${label}」이 없다`).toBeDefined();
  return r!.values.total as number;
};

/** G-43 anchor와 같은 시료 — 무신고(20%) + 납부지연. determinedTax·unpaidTax는 엔진이 집계값으로 주입한다. */
const PENALTY = {
  filingPenaltyDetails: {
    determinedTax: 0,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "none" as const,
    penaltyReason: "normal" as const,
  },
  delayedPaymentDetails: {
    unpaidTax: 0,
    paymentDeadline: new Date("2024-08-31"),
    actualPaymentDate: new Date("2024-12-31"),
  },
};

function mixedWithPenalty() {
  const breakdown = calcMixedUseTransferTax(
    CASE14_TRANSFER_PRICE,
    CASE14_TRANSFER_DATE,
    { ...mixedUseCase14(), ...PENALTY },
    rates,
  );
  return { breakdown, result: mixedUseToFilingResult(breakdown) };
}

describe("R-c06-01 겸용 — 가산세를 한 번만 더한다", () => {
  it("MX-0: 전제 — 엔진 가산세가 실재하고 상세가 승계된다(구별력)", () => {
    const { breakdown, result } = mixedWithPenalty();
    expect(breakdown.total.penaltyTax).toBe(36_411_636);
    expect(result.penaltyDetail?.totalPenalty).toBe(breakdown.total.penaltyTax);
  });

  it("MX-1: 🔴 신고서 표(mixed-4col) 「가산세액」·「총결정세액」 = 엔진 값", () => {
    const { breakdown, result } = mixedWithPenalty();
    const mode = deriveColumns(result).mode;
    expect(mode).toBe("mixed-4col");
    const rows = buildRows(result, mode, createDefaultTransferFormData()) as unknown as Row[];
    const t = breakdown.total;
    expect(rowTotal(rows, "가산세액")).toBe(t.penaltyTax);
    expect(rowTotal(rows, "총결정세액")).toBe(t.determinedTax + t.penaltyTax);
    expect(rowTotal(rows, "총결정세액")).toBe(197_084_290);
  });

  it("MX-2: 🔴 상세명세서 「가산세액」·「총결정세액」 = 엔진 값, 국기법 항 하나뿐", () => {
    const { breakdown, result } = mixedWithPenalty();
    const items = buildStatementItems(result, createDefaultTransferFormData(), undefined, undefined, undefined);
    const t = breakdown.total;
    expect(items.get("penaltyTax")?.value).toBe(t.penaltyTax);
    expect(items.get("totalDeterminedTax")?.value).toBe(t.determinedTax + t.penaltyTax);
    const formula = items.get("penaltyTax")!.formula as string;
    expect(formula).not.toContain("§114조의2");
    expect(formula).toContain(`신고불성실·납부지연 가산세 ${t.penaltyTax.toLocaleString()}`);
  });

  it("MX-3: 지방소득세 칸은 엔진 값 그대로(가산세 축 변경과 무관)", () => {
    const { breakdown, result } = mixedWithPenalty();
    const rows = buildRows(result, deriveColumns(result).mode, createDefaultTransferFormData()) as unknown as Row[];
    expect(rowTotal(rows, "지방세 결정세액")).toBe(breakdown.total.localTax);
  });
});

// ── 형제 경로 고정: 단건(§114조의2 + 국기법) ────────────────────────────
/** 토지 실가 + 건물 신축 환산 별개취득 — §114조의2 발동(`transfer-penalty-attribution` P-1과 같은 형상). */
function singleBothPenalties() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "building",
      transferPrice: 1_000_000_000,
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2021-03-10"),
      landAcquisitionDate: new Date("2015-05-01"),
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      landAcquisitionPrice: 200_000_000,
      acquisitionPrice: 200_000_000,
      landTransferPrice: 700_000_000,
      buildingTransferPrice: 300_000_000,
      saleSplitMode: "actual",
      buildingStandardPriceAtAcquisition: 225_000_000,
      standardPricePerSqmAtAcquisition: 3_000_000,
      acquisitionArea: 100,
      landStandardPriceAtTransfer: 700_000_000,
      buildingStandardPriceAtTransfer: 300_000_000,
      isSelfBuilt: true,
      constructionDate: new Date("2021-03-10"),
      buildingType: "new",
      isOneHousehold: false,
      householdHousingCount: 0,
      delayedPaymentDetails: {
        unpaidTax: 100_000_000,
        paymentDeadline: new Date("2024-08-31"),
        actualPaymentDate: new Date("2024-12-31"),
      },
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("R-c06-01 형제 — 단건 경로는 두 축의 합 그대로", () => {
  it("SG-1: 신고서 표·명세서 가산세 = §114조의2분 + 국기법분", () => {
    const r: TransferTaxResult = singleBothPenalties();
    const statutory = r.penaltyDetail?.totalPenalty ?? 0;
    expect(r.penaltyTax, "§114조의2가 실재해야 구별력").toBeGreaterThan(0);
    expect(statutory, "국기법분도 실재해야 구별력").toBeGreaterThan(0);

    const rows = buildRows(r, "single", createDefaultTransferFormData()) as unknown as Row[];
    expect(rowTotal(rows, "가산세액")).toBe(r.penaltyTax + statutory);
    expect(rowTotal(rows, "총결정세액")).toBe(r.determinedTax + r.penaltyTax + statutory);

    const items = buildStatementItems(r, createDefaultTransferFormData(), undefined, undefined, undefined);
    expect(items.get("penaltyTax")?.value).toBe(r.penaltyTax + statutory);
  });
});

// ── 형제 경로 고정: 집계 어댑터(슬롯 = 총액, penaltyDetail 없음) ─────────────
describe("R-c06-01 형제 — 집계 경로는 엔진 총액 그대로", () => {
  it("AG-1: 집계 명세서 가산세 = 엔진 penaltyTax(국기법 포함 총액)", () => {
    const a = calculateTransferTaxAggregate(
      {
        taxYear: 2026,
        annualBasicDeductionUsed: 0,
        properties: [
          {
            ...baseTransferInput({
              propertyType: "land",
              transferPrice: 1_000_000_000,
              acquisitionPrice: 400_000_000,
              acquisitionDate: new Date("2015-03-01"),
              transferDate: new Date("2026-03-01"),
              householdHousingCount: 0,
              isOneHousehold: false,
            }),
            propertyId: "primary",
            propertyLabel: "primary",
          } as never,
        ],
        delayedPaymentDetails: {
          unpaidTax: 0,
          paymentDeadline: new Date("2026-05-31"),
          actualPaymentDate: new Date("2026-12-31"),
        },
      } as never,
      rates,
    );
    expect(a.penaltyTax, "국기법 가산세가 실재해야 구별력").toBeGreaterThan(0);
    const meta: AggregateMeta = { properties: a.properties, aggregated: a };
    const items = buildStatementItems(aggregateToFilingResult(a), createDefaultTransferFormData(), undefined, meta, undefined);
    expect(items.get("penaltyTax")?.value).toBe(a.penaltyTax);
    expect(items.get("totalDeterminedTax")?.value).toBe(a.determinedTax + a.penaltyTax);
  });
});
