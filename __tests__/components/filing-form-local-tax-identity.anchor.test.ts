/**
 * anchor: 신고서 양식의 **지방소득세 3행이 검산되고, 32행 서식이 두 빌더에서 같다**
 * (결과탭 코드리뷰 Lane 3 · V5 — #082).
 *
 * ## 축 1 — 지방소득세 3행 항등식
 *
 *   지방소득세 산출세액 − 지방세 감면세액 = 지방세 결정세액
 *
 * 이 서식은 지방세 감면을 0으로 고정하므로 「산출세액 ≡ 결정세액」이어야 한다. 종전에는
 * 집계 빌더가 산출세액 base를 **재계산**했는데, `aggregated.penaltyTax`는 국세기본법
 * 신고불성실·납부지연분까지 합한 총액이라 엔진이 실제로 쓴 base(§114의2 건물분)보다 커졌고
 * 「산출세액 > 결정세액 · 감면 0」이라는 모순이 표에 그대로 인쇄됐다. 같은 화면의 상세명세서는
 * 그 두 값을 「산출세액 X − 감면세액 0 = Y」 문자열로 찍으므로 **산식이 스스로를 반증**했다.
 *
 * ⇒ 값 자체는 이미 정정됐다(`localCalculatedTax`·`localDeterminedTax` 모두 엔진 값).
 *   여기서는 그 항등식을 **세 모드(단건·집계·겸용) 전부**에 못박는다 — 종전에 항등식 anchor가
 *   0건이라 재계산으로 되돌아가도 아무도 알려주지 않았다.
 *
 * ## 축 2 — 32행 구조 대조
 *
 * 별지 제84호서식 32행이 **두 개의 독립 빌더**로 구현돼 있다(단건 `buildRowsFromOrder` ·
 * 집계 `buildAggregateRows`). 한쪽에만 행을 넣거나 라벨을 고치면 다른 쪽이 조용히 갈린다.
 * 집계 전용 4행(기납부·차감납부 국세/지방세)을 제외하면 **행 순서·라벨이 완전히 같아야** 한다.
 *
 * 법령: 지방세법 §103의3 (지방소득세 과세표준 = 결정세액) · 소득세법 §114의2
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  makeMockRates,
  baseTransferInput,
  makeMockRatesWithHouseEngine,
} from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 무신고 + 미납 — 국기법 가산세를 **일부러** 만든다(그것이 종전 오염원이었다). */
const PENALTY = {
  filingPenaltyDetails: {
    determinedTax: 141_060_000,
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "none" as const,
    penaltyReason: "normal" as const,
  },
  delayedPaymentDetails: {
    unpaidTax: 100_000_000,
    paymentDeadline: D("2026-08-31"),
    actualPaymentDate: D("2026-12-31"),
  },
};

function land(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    acquisitionDate: D("2010-01-01"),
    transferDate: D("2026-06-01"),
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000,
    expenses: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,
    ...PENALTY,
    ...o,
  } as Partial<TransferTaxInput>);
}

type Rows = ReturnType<typeof buildRows>;

function num(rows: Rows, label: string): number {
  const r = rows.find((x) => x.label === label);
  expect(r, `행 「${label}」이 없다`).toBeDefined();
  const v = r!.values.total;
  return typeof v === "number" ? v : 0;
}

function formData(price: number) {
  const fd = createDefaultTransferFormData();
  return { ...fd, contractTotalPrice: String(price) } as typeof fd;
}

function singleRows() {
  const result = calculateTransferTax(land(), rates);
  const { mode } = deriveColumns(result, undefined, undefined, undefined);
  return { result, rows: buildRows(result, mode, formData(1_000_000_000)) };
}

function aggregate() {
  return calculateTransferTaxAggregate(
    {
      taxYear: 2026,
      annualBasicDeductionUsed: 0,
      properties: [
        { ...land(), propertyId: "p1", propertyLabel: "토지 A" } as never,
        {
          ...land({ transferPrice: 1_400_000_000, acquisitionPrice: 500_000_000 }),
          propertyId: "p2",
          propertyLabel: "토지 B",
        } as never,
      ],
    },
    rates,
  );
}

function aggregateRows() {
  const agg = aggregate();
  const meta = { properties: agg.properties, aggregated: agg } as never;
  const { mode } = deriveColumns(agg as never, meta, undefined, undefined);
  return { agg, rows: buildRows(agg as never, mode, formData(2_400_000_000), undefined, undefined, undefined, undefined, meta) };
}

function mixedRows() {
  const b = calcMixedUseTransferTax(
    3_000_000_000,
    D("2026-06-01"),
    { ...mixedUseCase14(), isOneHouseExempt: false, ...PENALTY } as never,
    makeMockRatesWithHouseEngine(),
  );
  const result = mixedUseToFilingResult(b);
  const { mode } = deriveColumns(result, undefined, undefined, undefined);
  return { b, rows: buildRows(result, mode, formData(3_000_000_000)) };
}

// ── L-0 구별력 ──────────────────────────────────────────────────────
/**
 * 국기법 가산세가 0이면 「결정세액 + 총가산세」와 「결정세액 + §114의2분」이 같은 값이라
 * 종전의 재계산 방식으로 되돌려도 표가 똑같이 나온다 — 측정이 성립하지 않는다.
 */
describe("L-0 격자 — 국세기본법 가산세가 실제로 발생한다", () => {
  it("단건·집계 모두 가산세 > 0이고 지방세 base와 구별된다", () => {
    const { result } = singleRows();
    // ⚠️ 단건은 두 축이 다른 필드에 있다 — `penaltyTax`는 §114의2 환산가액적용가산세,
    //   국기법 §47의2~§47의4분은 `penaltyDetail.totalPenalty`다. 종전 오염 산식이 더한 것은 **후자**다.
    const singleTotalPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
    expect(singleTotalPenalty, "가산세 0이면 이 anchor는 아무것도 구별하지 못한다").toBeGreaterThan(0);
    expect(result.localIncomeTax).toBeGreaterThan(0);
    // 종전 오염 산식과 정본이 실제로 다른 값을 낸다.
    expect(Math.floor((result.determinedTax + singleTotalPenalty) * 0.1)).not.toBe(
      result.localIncomeTax,
    );

    const { agg } = aggregateRows();
    expect(agg.penaltyTax, "집계 `penaltyTax`는 국기법분까지 합한 총액이다").toBeGreaterThan(0);
    expect(Math.floor((agg.determinedTax + agg.penaltyTax) * 0.1)).not.toBe(agg.localIncomeTax);

    const { b } = mixedRows();
    expect(b.total.penaltyTax).toBeGreaterThan(0);
    expect(Math.floor((b.total.determinedTax + b.total.penaltyTax) * 0.1)).not.toBe(
      b.total.localTax,
    );
  });
});

// ── L-1 3행 항등식 ──────────────────────────────────────────────────
describe("L-1 지방소득세 산출세액 − 지방세 감면세액 = 지방세 결정세액", () => {
  it("단건", () => {
    const { result, rows } = singleRows();
    expect(num(rows, "지방소득세 산출세액") - num(rows, "지방세 감면세액")).toBe(
      num(rows, "지방세 결정세액"),
    );
    expect(num(rows, "지방세 결정세액")).toBe(result.localIncomeTax);
  });

  it("집계(다건·일괄)", () => {
    const { agg, rows } = aggregateRows();
    expect(num(rows, "지방소득세 산출세액") - num(rows, "지방세 감면세액")).toBe(
      num(rows, "지방세 결정세액"),
    );
    expect(num(rows, "지방세 결정세액")).toBe(agg.localIncomeTax);
  });

  it("겸용", () => {
    const { b, rows } = mixedRows();
    expect(num(rows, "지방소득세 산출세액") - num(rows, "지방세 감면세액")).toBe(
      num(rows, "지방세 결정세액"),
    );
    expect(num(rows, "지방세 결정세액")).toBe(b.total.localTax);
  });
});

// ── L-2 32행 구조 대조 ──────────────────────────────────────────────
describe("L-2 별지 제84호서식 — 두 빌더의 행 구성이 같다", () => {
  /** 집계 전용 4행 — §111③ 예정신고 정산은 신고 단위 개념이라 단건 표에 없다. */
  const AGGREGATE_ONLY = [
    "기납부세액 (예정신고, §111③)",
    "차감납부할세액",
    "기납부세액 (지방, 예정신고)",
    "차감납부할 지방소득세",
  ];

  it("집계 라벨에서 집계 전용 4행을 빼면 단건 라벨과 순서까지 같다", () => {
    const single = singleRows().rows.map((r) => r.label);
    const agg = aggregateRows()
      .rows.map((r) => r.label)
      .filter((l) => !AGGREGATE_ONLY.includes(l));
    expect(agg).toEqual(single);
  });

  it("집계 전용 4행은 실제로 집계에만 있다", () => {
    const single = new Set(singleRows().rows.map((r) => r.label));
    const agg = new Set(aggregateRows().rows.map((r) => r.label));
    for (const label of AGGREGATE_ONLY) {
      expect(agg.has(label), `집계에 「${label}」이 없다`).toBe(true);
      expect(single.has(label), `단건에 「${label}」이 있다 — 목록이 stale하다`).toBe(false);
    }
  });
});
