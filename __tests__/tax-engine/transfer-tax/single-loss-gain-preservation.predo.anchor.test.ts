/**
 * Pre-Do anchor — **단건 양도차손이 0으로 지워진다** (2026-09-16)
 *
 * 계획서: `docs/00-pm/transfer-single-loss-gain-preservation.plan.md`
 *
 * ## 결함
 *
 * 취득가액 > 양도가액이면 단건 엔진이 양도차익을 `Math.max(0, gain)`으로 **바닥 처리**한다.
 * 그러면 신고서 양식이 취득가액을 「양도가액 − 양도차익 − 필요경비」로 **역산**해
 * **취득가액 = 양도가액**이라는 값을 만들어낸다 — 사용자가 입력한 금액과 무관하다.
 *
 * 제보(양도 100,000,000 / 취득 120,000,000): 신고서 취득가액이 **100,000,000**으로 찍혔다.
 *
 * ## 🔴 바닥은 **세 곳**이고, 주석이 달린 한 줄은 제보 케이스의 범인이 아니다
 *
 * | # | 위치 | 담당 경로 |
 * |---|---|---|
 * | ① | `transfer-tax-helpers.ts:398` | **일반 단건** (`calcTransferGain` 본체) ← 제보 |
 * | ② | `transfer-tax-helpers.ts:300` | 토지·건물 **취득일 분리** 합산 |
 * | ③ | `transfer-tax.ts:391` | 소유자 분리(`selfOwns`) |
 *
 * ③에만 「STEP 2a: 손실 → 0 ... §102② 통산용」이라는 주석이 있어 정본처럼 보이지만,
 * ③만 걷어내면 제보 케이스는 **여전히 0이다**(`ownerRawGain`이 ①에서 이미 바닥 처리돼 온다).
 * A-5·A-6이 ②·③를 각각 따로 고정하는 이유다.
 *
 * ## 세액은 바뀌지 않는다
 *
 * `transfer-tax.ts`의 `if (transferGain <= 0)` 조기반환이 음수도 흡수해
 * `taxBase: 0` · `calculatedTax: 0`을 낸다. A-2·A-7·A-8은 **통과 상태로 시작**하는
 * 회귀 안전망이다 — 이 수정이 세액과 §102② 통산을 건드리지 않음을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";

const rates = makeMockRates();

/** 제보 케이스 — 양도 100,000,000 / 취득 120,000,000 / 경비 0 → 차손 20,000,000 */
const REPORTED_TRANSFER = 100_000_000;
const REPORTED_ACQUISITION = 120_000_000;
const REPORTED_LOSS = -20_000_000;

function runReported(overrides?: Partial<TransferTaxInput>): TransferTaxResult {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: REPORTED_TRANSFER,
      acquisitionPrice: REPORTED_ACQUISITION,
      acquisitionDate: new Date("2020-04-01"),
      transferDate: new Date("2026-06-03"),
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      ...overrides,
    }),
    rates,
  );
}

/** 신고서 표에서 한 행의 합계 셀을 꺼낸다 */
function rowTotal(rows: ReturnType<typeof buildRows>, label: string): number | string | null {
  const row = rows.find((r) => r.label === label);
  if (!row) throw new Error(`신고서 행 없음: ${label}`);
  return row.values.total;
}

// ============================================================
// A-0 · A-1 · A-3 — 제보 재현 (착수 전 실패)
// ============================================================

describe("A-0/A-1/A-3: 단건 차손이 결과에 보존된다", () => {
  it("A-0 🔴 양도차익 = −20,000,000 (종전: 0)", () => {
    expect(runReported().transferGain).toBe(REPORTED_LOSS);
  });

  it("A-1 🔴 과세대상 양도차익도 −20,000,000 (종전: 0)", () => {
    expect(runReported().taxableGain).toBe(REPORTED_LOSS);
  });

  /**
   * 🔑 **항등식** — PR #1640에서 고친 「산출세액 근거」와 같은 종류의 결함이 한 단계 앞에 있었다.
   *    산식은 `100,000,000 - 120,000,000`이라 적어 놓고 금액은 `0`이었다.
   */
  it("A-3 🔴 「양도차익 계산」 step의 금액이 산식을 재현한다", () => {
    const r = runReported();
    const step = r.steps.find((s) => s.label === "양도차익 계산");
    expect(step).toBeDefined();
    expect(step!.amount).toBe(REPORTED_TRANSFER - REPORTED_ACQUISITION);
    // 산식 문자열이 양쪽 금액을 실제로 담고 있어야 항등식 단언이 의미를 갖는다
    expect(step!.formula).toContain("100,000,000");
    expect(step!.formula).toContain("120,000,000");
  });
});

// ============================================================
// A-2 · A-7 — 세액 불변 (통과 상태로 시작 · 회귀 안전망)
// ============================================================

describe("A-2/A-7: 세액과 장특공제는 바뀌지 않는다", () => {
  it("A-2 ✅ 과세표준·산출세액·총납부세액이 모두 0", () => {
    const r = runReported();
    expect(r.taxBase).toBe(0);
    expect(r.calculatedTax).toBe(0);
    expect(r.determinedTax).toBe(0);
    expect(r.totalTax).toBe(0);
  });

  /** §95② — 장특공제는 「양도차익에 공제율을 곱하여」다. 차손에 곱하면 불리해지므로 미적용. */
  it("A-7 ✅ 장기보유특별공제 = 0 (소득세법 §95② — 차손엔 미적용)", () => {
    const r = runReported();
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.longTermHoldingRate).toBe(0);
  });
});

// ============================================================
// A-4 — 신고서 취득가액 역산 (착수 전 실패)
// ============================================================

describe("A-4: 신고서 양식이 입력한 취득가액을 되살린다", () => {
  it("A-4 🔴 취득가액 행 = 120,000,000 (종전: 100,000,000 — 양도가액과 동일)", () => {
    const rows = buildRows(runReported(), "single", undefined, undefined, REPORTED_TRANSFER);
    expect(rowTotal(rows, "취득가액")).toBe(REPORTED_ACQUISITION);
  });

  it("A-4b 🔴 전체 양도차익 행 = −20,000,000", () => {
    const rows = buildRows(runReported(), "single", undefined, undefined, REPORTED_TRANSFER);
    expect(rowTotal(rows, "전체 양도차익")).toBe(REPORTED_LOSS);
  });

  /**
   * 신고서 표의 **자기일관성** — 양도가액 = 취득가액 + 필요경비 + 전체 양도차익.
   *
   * ⚠️ **이 단언은 현재 결함을 잡지 못한다 (구별력 0)**. 취득가액이 「양도가액 − 양도차익 −
   *    필요경비」로 **역산**되기 때문에 항등식은 어떤 값에서도 **자동으로 성립**한다 —
   *    결함 상태(100,000,000 + 0 + 0 = 100,000,000)에서도 통과한다.
   *    남겨 두는 이유는 **수정 후의 회귀 안전망**이다: 훗날 누군가 역산을 걷어내고 취득가액을
   *    별도 경로로 싣는다면 그때는 이 항등식이 깨질 수 있다.
   *    ⇒ 결함 탐지는 A-4(절대값)가 담당한다. (memory `feedback_mutation_zero_discrimination_is_not_proof`)
   */
  it("A-4c ✅ 표가 자기일관 — 양도가액 = 취득가액 + 필요경비 + 양도차익", () => {
    const rows = buildRows(runReported(), "single", undefined, undefined, REPORTED_TRANSFER);
    const num = (label: string) => Number(rowTotal(rows, label) ?? 0);
    expect(num("취득가액") + num("필요경비") + num("전체 양도차익")).toBe(
      num("양도가액"),
    );
  });

  it("A-4d ✅ 비과세 양도차익 행은 0으로 남는다 (차손은 비과세분이 아니다)", () => {
    const rows = buildRows(runReported(), "single", undefined, undefined, REPORTED_TRANSFER);
    expect(rowTotal(rows, "비과세 양도차익")).toBe(0);
  });
});

// ============================================================
// A-5 · A-6 — 나머지 두 바닥 (착수 전 실패)
// ============================================================

describe("A-5/A-6: 분리 경로의 바닥도 함께 걷힌다", () => {
  /**
   * 토지·건물 **분리 산정** 공용 픽스처.
   *
   * 양도가액 100,000,000을 양도시 기준시가 비율(토지 50 : 건물 50)로 안분해 각 50,000,000,
   * 취득가액은 각 60,000,000 ⇒ 파트별 −10,000,000 · 합 −20,000,000.
   *
   * ⚠️ 양도가액을 **구분 기재**(`landTransferPrice`/`buildingTransferPrice`)하면 §100③ 판정을
   *    위해 양도시 토지·건물 기준시가가 **둘 다** 필요해 `TaxCalculationError`로 막힌다.
   *    그래서 여기서는 구분 기재 없이 기준시가 비율 안분에 맡긴다.
   */
  function splitInput(overrides: Partial<TransferTaxInput>): TransferTaxInput {
    return baseTransferInput({
      propertyType: "housing",
      transferPrice: REPORTED_TRANSFER,
      acquisitionPrice: REPORTED_ACQUISITION,
      acquisitionDate: new Date("2020-04-01"),
      transferDate: new Date("2026-06-03"),
      expenses: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      landAcquisitionPrice: 60_000_000,
      buildingAcquisitionPrice: 60_000_000,
      landStandardPriceAtTransfer: 50_000_000,
      buildingStandardPriceAtTransfer: 50_000_000,
      ...overrides,
    } as Partial<TransferTaxInput>);
  }

  /** ② `transfer-tax-helpers.ts:300` — 토지·건물 **취득일 분리** 합산 */
  it("A-5 🔴 취득일 분리 경로에서 차손이 보존된다", () => {
    const r = calculateTransferTax(
      splitInput({
        isSeparateAcquisition: true,
        landAcquisitionDate: new Date("2020-04-01"),
        buildingAcquisitionDate: new Date("2021-04-01"),
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(r.transferGain).toBe(REPORTED_LOSS);
  });

  /**
   * ③ `transfer-tax.ts:391` — 소유자 분리(`selfOwns`). 본인 신고분(건물)만 차손으로 잡힌다.
   * 기존 회귀 `owner-split-case12.test.ts`가 같은 축을 −11,215,066으로 고정하고 있다.
   */
  it("A-6 🔴 소유자 분리(selfOwns) 경로에서 차손이 보존된다", () => {
    const r = calculateTransferTax(
      splitInput({
        // `splitDetail`이 있어야 `selfOwns` 분기가 산다 — 없으면 전체 차익으로 떨어진다
        isSeparateAcquisition: true,
        landAcquisitionDate: new Date("2020-04-01"),
        buildingAcquisitionDate: new Date("2021-04-01"),
        selfOwns: "building_only",
      } as Partial<TransferTaxInput>),
      rates,
    );
    // 본인 신고분 = 건물분만 (50,000,000 − 60,000,000)
    expect(r.transferGain).toBe(-10_000_000);
  });
});

// ============================================================
// A-8 — 다건 §102② 통산 회귀 (통과 상태로 시작)
// ============================================================

describe("A-8: 다건 합산의 §102② 통산은 이 수정으로 바뀌지 않는다", () => {
  function makeItem(id: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput {
    return {
      ...(baseTransferInput() as unknown as TransferTaxItemInput),
      propertyId: id,
      propertyLabel: id,
      ...o,
    };
  }

  const aggInput: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 0,
    properties: [
      makeItem("GAIN", {
        propertyType: "land",
        transferPrice: 300_000_000,
        acquisitionPrice: 100_000_000,
        acquisitionDate: new Date("2020-04-01"),
        transferDate: new Date("2026-06-03"),
        isOneHousehold: false,
        householdHousingCount: 0,
      }),
      makeItem("LOSS", {
        propertyType: "land",
        transferPrice: REPORTED_TRANSFER,
        acquisitionPrice: REPORTED_ACQUISITION,
        acquisitionDate: new Date("2020-04-01"),
        transferDate: new Date("2026-06-03"),
        isOneHousehold: false,
        householdHousingCount: 0,
      }),
    ],
  };

  it("A-8 ✅ 차손이 같은 세율군 안에서 통산되고 과세표준이 그만큼 줄어든다", () => {
    const r = calculateTransferTaxAggregate(aggInput, rates);

    // 차손 자산은 합산 경로에서도 음수를 유지한다
    const loss = r.properties.find((p) => p.propertyId === "LOSS")!;
    expect(loss.transferGain).toBe(REPORTED_LOSS);

    // §102② — 같은 호(일반누진) 안에서 전액 통산
    expect(r.lossOffsetTable).toEqual([
      expect.objectContaining({
        fromPropertyId: "LOSS",
        toPropertyId: "GAIN",
        amount: 20_000_000,
        scope: "same_group",
      }),
    ]);

    /*
     * 손계산 검산 (엔진 출력 베끼기 금지):
     *   GAIN 양도차익 200,000,000 − 장특 12%(6년 이상 7년 미만, §95② 표1) 24,000,000 = 176,000,000
     *   차손 통산(§102②)                                              − 20,000,000 = 156,000,000
     *   기본공제(§103①)                                                − 2,500,000 = 153,500,000
     */
    const gain = r.properties.find((p) => p.propertyId === "GAIN")!;
    expect(gain.incomeAfterOffset).toBe(156_000_000);
    expect(r.taxBase).toBe(153_500_000);
  });

  it("A-8b ✅ 통산 대상이 없으면 잔여 차손은 소멸한다 (이월 불인정)", () => {
    const r = calculateTransferTaxAggregate(
      { ...aggInput, properties: [aggInput.properties[1]] },
      rates,
    );
    expect(r.taxBase).toBe(0);
    expect(r.calculatedTax).toBe(0);
  });
});

// ============================================================
// A-10 — 차손 고지 (§102② 안내) · 다건에는 닿지 않는다
// ============================================================

describe("A-10: 차손 고지가 단건에만 붙는다", () => {
  it("A-10 🔴 전체 양도차익 행에 §102② 통산 안내가 붙는다", () => {
    const rows = buildRows(runReported(), "single", undefined, undefined, REPORTED_TRANSFER);
    const row = rows.find((r) => r.label === "전체 양도차익")!;
    const note = row.roseNotes?.total ?? "";
    expect(note).toContain("양도차손 20,000,000");
    expect(note).toContain("§102②");
  });

  it("A-10b ✅ 차익 자산에는 고지가 붙지 않는다 (구별력 확보)", () => {
    const gainResult = runReported({ acquisitionPrice: 50_000_000 });
    expect(gainResult.transferGain).toBeGreaterThan(0);
    const rows = buildRows(gainResult, "single", undefined, undefined, REPORTED_TRANSFER);
    const row = rows.find((r) => r.label === "전체 양도차익")!;
    expect(row.roseNotes?.total).toBeUndefined();
  });
});

// ============================================================
// A-9 — 같은 화면 두 카드의 「양도소득금액」 정합 (착수 전 실패)
// ============================================================

describe("A-9: 신고서와 상세명세서가 같은 양도소득금액을 말한다", () => {
  it("A-9 🔴 두 카드의 양도소득금액이 일치한다 (종전: −20,000,000 vs 0)", () => {
    const r = runReported();
    const rows = buildRows(r, "single", undefined, undefined, REPORTED_TRANSFER);
    const items = buildStatementItems(r, undefined, undefined, undefined, REPORTED_TRANSFER);

    const filing = rowTotal(rows, "양도소득금액");
    const statement = items.get("incomeAmount")?.value;

    expect(statement).toBe(filing);
    // §95① — 양도소득금액 = 양도차익 − 장기보유특별공제. 차손이면 음수가 그대로다.
    expect(filing).toBe(REPORTED_LOSS);
  });
});
