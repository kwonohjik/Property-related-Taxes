/**
 * F35 — 겸용주택 **배율초과 비사업용토지** × 신고서 양식 4열 표 **characterization anchor**.
 *
 * ⚠️ 이 파일은 「맞다」를 단언하지 않는다. **「지금 이렇다」를 고정**한다.
 *    아래 F35 표시로 붙은 기대값은 **현행 동작이며 오분류**다. 결함을 고치면 그 기대값이
 *    **바뀌어야 정상**이다 — 바뀌지 않으면 고친 것이 표 축에 도달하지 않은 것이다.
 *
 * ── 결함 (표시 축. 세액은 불변) ─────────────────────────────────────────────
 * 겸용주택 부수토지가 배율(수도권 주·상·공 3배)을 초과하면 엔진은 그 초과분 양도차익을
 * `nonBusinessLandPart`로 **분리**하고 「소득세법」 제104조 제5항 본문 후단에 따라
 * **별개 자산**으로 과세한다(과세표준에 그대로 들어간다). 그런데 신고서 어댑터
 * `components/calc/results/mixed-use/MixedUseResultCardAdapter.ts:39-46`은
 *   · `transferGain` = 주택분 + 상가분   ← 비사토 차익이 **주택분 안에 그대로 남아 있다**
 *   · `taxableGain`  = 주택분 안분과세분 + 상가분   ← 비사토 차익이 **빠진다**
 * 로 조립한다. 표의 「비과세 양도차익」은 `FilingFormTableHelpers.ts:636`에서
 * `전체 양도차익 − 과세대상 양도차익`으로 유도되므로, **과세되는 비사업용토지 양도차익이
 * 통째로 「비과세」로 계상**된다.
 *
 * 4열(주택분토지·주택분건물·상가분토지·상가분건물) 쪽도 같은 방향이다 —
 * `FilingFormTableFinancials.ts:30-38`의 `housingExemptRatio`
 * (= `hp.proratedTaxableGain / hp.transferGain`)가 비사토 차익까지 **주택분 토지의
 * 비과세로 흡수**한다. 그래서 **「4열 합 = 합계」 불변식은 현재 (틀린 채로) 맞고 있다**.
 * 어댑터만 고치면 그 불변식이 깨진다 — 두 지점을 함께 봐야 한다는 것이 이 anchor의 요지다.
 *
 * ── 착수 전 필수(축 C) 이유 — 회귀 감지가 0이었다 ────────────────────────────
 * 신고서 표를 보는 기존 anchor 4건은 **전부 배율초과가 없는** 픽스처다:
 *   · `__tests__/components/mixed-use-filing-form-4col.anchor.test.tsx`        → `mixedUseCase14()` (토지 168.3㎡)
 *   · `__tests__/components/mixed-use-filing-form-per-part-date.anchor.test.tsx` → `mixedUseCase14()`
 *   · `__tests__/components/mixed-use-statement-acquisition-actual.anchor.test.ts` → 인라인(토지 200㎡ · 정착 100㎡)
 *   · `__tests__/components/calc/detailed-statement-lthd-fallback.test.tsx`     → 인라인(토지 200㎡ · 정착 100㎡)
 * 실측(2026-08): 어댑터 `taxableGain`·`longTermHoldingDeduction`에 `nonBusinessLandPart`를
 * 가산하는 변이를 넣고 `npm run test:transfer`(596파일 6,598테스트)를 돌려도 **0건**이 빨개졌다.
 *
 * ── 배율초과 발동 조건 (`transfer-tax-mixed-use-helpers.ts:426-443`) ─────────
 *   주택 부수토지면적 > 주택 정착면적 × 배율
 *   · 주택 부수토지면적 = round2(전체토지 × 주택연면적비율)
 *   · 주택 정착면적     = round2(건물정착면적 × 주택연면적비율)
 *   · 배율 = `non-business-land/urban-area.ts:112-116` 수도권 도시지역 주·상·공 **3배**
 *   ⇒ 주택연면적비율이 양변에 같이 곱해지므로(round2 반올림 오차만 남는다) 실질 조건은
 *     **`전체토지면적 > 건물정착면적 × 배율`** 이다 — 주택/상가 면적비와 무관하다.
 *     사례14 기본값(전체토지 168.3 · 정착 100 · 3배 → 300㎡ 필요)은 **미발동**,
 *     `mixedUseExcessLand()`(전체토지 1,000)는 **발동**.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUseCase14,
  mixedUseExcessLand,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../_helpers/mixed-use-fixture";

const rates = makeMockRates();

const ROW_LABELS = {
  transferGain: "전체 양도차익",
  exemptGain: "비과세 양도차익",
  taxableGain: "과세대상 양도차익",
  ltDeduction: "장기보유특별공제",
  incomeAmount: "양도소득금액",
  basicDeduction: "기본공제",
  taxBase: "과세표준",
} as const;

const PART_COLS = ["housingLand", "housingBuilding", "commercialLand", "commercialBuilding"] as const;

/** 픽스처 1건을 엔진 → 어댑터 → 신고서 표까지 관통시켜 관측 지점을 모아준다. */
function observe(transferPrice: number, asset: ReturnType<typeof mixedUseCase14>) {
  const breakdown = calcMixedUseTransferTax(transferPrice, CASE14_TRANSFER_DATE, asset, rates);
  const result = mixedUseToFilingResult(breakdown);
  const { mode, columns } = deriveColumns(result);
  const rows = buildRows(result, mode, undefined, undefined, transferPrice);
  const cell = (key: keyof typeof ROW_LABELS, col: string): number => {
    const row = rows.find((r) => r.label === ROW_LABELS[key]);
    if (!row) throw new Error(`row not found: ${ROW_LABELS[key]}`);
    const value = row.values[col];
    return typeof value === "number" ? value : 0;
  };
  const partSum = (key: keyof typeof ROW_LABELS): number =>
    PART_COLS.reduce((sum, col) => sum + cell(key, col), 0);
  return { breakdown, result, mode, columns, rows, cell, partSum };
}

// ══════════════════════════════════════════════════════════════════════
// 전제 — 배율초과가 실제로 발동하는가 / 기존 픽스처는 왜 못 잡는가
// ══════════════════════════════════════════════════════════════════════

describe("F35 전제: 배율초과 발동 조건", () => {
  it("P-1 기준 사례14(전체토지 168.3㎡)는 배율초과 **미발동** — 기존 anchor가 이 축을 못 본다", () => {
    const { breakdown } = observe(CASE14_TRANSFER_PRICE, mixedUseCase14());
    expect(breakdown.nonBusinessLandPart).toBeNull();
    expect(breakdown.housingPart.nonBusinessTransferRatio).toBe(0);
  });

  it("P-2 전체토지 1,000㎡ → 배율초과 발동 (수도권 주거지역 3배)", () => {
    const { breakdown } = observe(CASE14_TRANSFER_PRICE, mixedUseExcessLand());
    const nb = breakdown.nonBusinessLandPart;
    expect(nb).not.toBeNull();
    expect(nb!.appliedMultiplier).toBe(3);
    // 주택 부수토지 216.03㎡ − 허용 64.80㎡(= 정착 21.60 × 3) = 151.23㎡
    expect(nb!.excessArea).toBeCloseTo(151.23, 2);
    expect(breakdown.housingPart.nonBusinessTransferRatio).toBeCloseTo(0.7000416608804332, 12);
  });

  it("P-3 신고서 표 모드는 배율초과 여부와 무관하게 mixed-4col 4열 — **비사토 전용 열이 없다**", () => {
    const { mode, columns } = observe(CASE14_TRANSFER_PRICE, mixedUseExcessLand());
    expect(mode).toBe("mixed-4col");
    expect(columns.map((c) => c.key)).toEqual([
      "total", "housingLand", "housingBuilding", "commercialLand", "commercialBuilding",
    ]);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 케이스 A — 주택분 양도가액 12억 **이하**(전액 비과세) + 배율초과
//   양도가액 23억 · 전체토지 1,000㎡
//   주택분 양도가액 351,599,527원 ⇒ housingExemptRatio = 0 (분자 proratedTaxableGain = 0)
// ══════════════════════════════════════════════════════════════════════

describe("F35 케이스 A: 12억 이하 주택분(전액 비과세) + 배율초과", () => {
  const o = observe(CASE14_TRANSFER_PRICE, mixedUseExcessLand());
  const nb = o.breakdown.nonBusinessLandPart!;

  it("A-0 엔진 관측값 (비사업용토지 파트)", () => {
    expect(nb.transferGain).toBe(235_336_494);
    expect(nb.longTermDeductionAmount).toBe(70_600_948);
    expect(nb.incomeAmount).toBe(164_735_546);
    expect(nb.additionalRate).toBe(0.1);
    // 비사토 차익은 주택분 토지차익 336,174,985원 **안에서** 잘려 나온 값이다.
    expect(o.breakdown.housingPart.landTransferGain).toBe(336_174_985);
    expect(o.breakdown.housingPart.proratedTaxableGain).toBe(0);
  });

  it("A-1 전체 양도차익 4열 — 실측 고정 · 4열 합 == 합계 (정확)", () => {
    expect(o.cell("transferGain", "housingLand")).toBe(336_174_985);
    expect(o.cell("transferGain", "housingBuilding")).toBe(0);
    expect(o.cell("transferGain", "commercialLand")).toBe(1_119_934_807);
    expect(o.cell("transferGain", "commercialBuilding")).toBe(7_164_209);
    expect(o.cell("transferGain", "total")).toBe(1_463_274_001);
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
  });

  it("A-2 과세대상 양도차익 4열 — 실측 고정", () => {
    // ⚠️ F35: 주택분 토지 0원은 **현행 동작이며 오분류다**. 이 칸에는 배율초과 비사업용토지
    //    양도차익 235,336,494원이 과세대상으로 잡혀야 한다(어느 열에 실을지가 (가)/(나) 선택).
    //    수정 시 이 기대값이 바뀌어야 정상.
    expect(o.cell("taxableGain", "housingLand")).toBe(0);
    expect(o.cell("taxableGain", "housingBuilding")).toBe(0);
    expect(o.cell("taxableGain", "commercialLand")).toBe(1_119_934_807);
    expect(o.cell("taxableGain", "commercialBuilding")).toBe(7_164_209);
    // ⚠️ F35: 합계도 비사토 차익만큼 과소다. 수정 시 1,127,099,016 → 1,362,435,510 이 되어야 정상.
    expect(o.cell("taxableGain", "total")).toBe(1_127_099_016);
  });

  it("A-3 비과세 양도차익 4열 — 실측 고정", () => {
    // ⚠️ F35: 주택분 토지 336,174,985원 **안에 비사업용토지 235,336,494원이 섞여 있다** — 오분류.
    //    수정 시 100,838,491원(= 336,174,985 − 235,336,494)이 되어야 정상.
    expect(o.cell("exemptGain", "housingLand")).toBe(336_174_985);
    expect(o.cell("exemptGain", "housingBuilding")).toBe(0);
    expect(o.cell("exemptGain", "commercialLand")).toBe(0);
    expect(o.cell("exemptGain", "commercialBuilding")).toBe(0);
    expect(o.cell("exemptGain", "total")).toBe(336_174_985);
  });

  it("A-4 🔴 오분류 금액 = 비사업용토지 양도차익 전액 (235,336,494원)", () => {
    // 「비과세」로 계상된 금액에서 비사토 차익을 빼면 정상 비과세액이 나온다 —
    // 즉 오분류 금액은 **정확히** nonBusinessLandPart.transferGain 이다.
    const misclassified = nb.transferGain;
    expect(misclassified).toBe(235_336_494);
    expect(o.cell("exemptGain", "total") - misclassified).toBe(100_838_491);
    // 과세대상 쪽에서는 같은 금액이 빠져 있다.
    expect(o.cell("taxableGain", "total")).toBe(
      o.breakdown.housingPart.proratedTaxableGain + o.breakdown.commercialPart.transferGain,
    );
    expect(o.cell("taxableGain", "total") + misclassified).toBe(1_362_435_510);
  });

  it("A-5 장기보유특별공제 4열 — 실측 고정 (비사토 장특 70,600,948원 누락)", () => {
    expect(o.cell("ltDeduction", "housingLand")).toBe(0);
    expect(o.cell("ltDeduction", "housingBuilding")).toBe(0);
    expect(o.cell("ltDeduction", "commercialLand")).toBe(335_980_441);
    expect(o.cell("ltDeduction", "commercialBuilding")).toBe(2_149_262);
    // ⚠️ F35: 합계에 비사토 장특(70,600,948)이 빠져 있다 — 현행 동작. 수정 시 408,730,652 이 되어야 정상.
    expect(o.cell("ltDeduction", "total")).toBe(338_129_704);
  });

  it("A-6 양도소득금액 4열 — 실측 고정", () => {
    expect(o.cell("incomeAmount", "housingLand")).toBe(0);
    expect(o.cell("incomeAmount", "housingBuilding")).toBe(0);
    expect(o.cell("incomeAmount", "commercialLand")).toBe(783_954_365);
    expect(o.cell("incomeAmount", "commercialBuilding")).toBe(5_014_946);
    expect(o.cell("incomeAmount", "total")).toBe(788_969_312);
  });

  it("A-7 🔴 표 내부 자기모순: 과세표준 − (양도소득금액 − 기본공제) = 비사토 양도소득금액", () => {
    // 과세표준은 엔진값(비사토 포함)인데 양도소득금액 행은 어댑터값(비사토 제외)이라
    // **같은 표 안에서 두 행이 어긋난다**. 이 차이가 F35의 가장 직접적인 관측 신호다.
    expect(o.cell("basicDeduction", "total")).toBe(2_500_000);
    expect(o.cell("taxBase", "total")).toBe(951_204_858);
    const gap = o.cell("taxBase", "total") - (o.cell("incomeAmount", "total") - o.cell("basicDeduction", "total"));
    expect(gap).toBe(nb.incomeAmount);
    expect(gap).toBe(164_735_546);
  });

  it("A-8 「4열 합 = 합계」 불변식 — (가)/(나) 어느 쪽을 택하든 지켜야 할 계약", () => {
    // 전체 양도차익은 정확 일치, floor 안분 행은 ±4원(기존 4col anchor A4와 동일 tolerance).
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
    for (const key of ["taxableGain", "exemptGain", "ltDeduction", "incomeAmount"] as const) {
      expect(Math.abs(o.partSum(key) - o.cell(key, "total"))).toBeLessThanOrEqual(4);
    }
  });

  it("A-9 세액은 결함의 영향을 받지 않는다 — 표시 축 결함임을 고정", () => {
    // 과세표준·결정세액은 엔진(`buildTotalTax`)이 비사토를 포함해 산정한 값 그대로다.
    expect(o.result.taxBase).toBe(951_204_858);
    expect(o.result.determinedTax).toBe(363_566_040);
    expect(o.result.totalTax).toBe(399_922_644);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 케이스 B — 주택분 양도가액 12억 **초과**(안분 과세) + 배율초과
//   양도가액 100억 · 전체토지 1,000㎡ · 주택 공시가격 50억
//   housingExemptRatio 가 0도 1도 아닌 중간값 ⇒ 4열 floor 안분이 실제로 동작하는 분기
// ══════════════════════════════════════════════════════════════════════

describe("F35 케이스 B: 12억 초과 주택분(안분 과세) + 배율초과", () => {
  const HIGH_VALUE_TRANSFER = 10_000_000_000;
  const o = observe(
    HIGH_VALUE_TRANSFER,
    mixedUseExcessLand({
      transferStandardPrice: {
        housingPrice: 5_000_000_000,
        commercialBuildingPrice: 100_000_000,
        landPricePerSqm: 6_100_000,
      },
    }),
  );
  const nb = o.breakdown.nonBusinessLandPart!;

  it("B-0 엔진 관측값 (비사업용토지 파트 + 12억 안분 발동)", () => {
    expect(o.breakdown.housingPart.isExempt).toBe(false);
    expect(o.breakdown.apportionment.housingTransferPrice).toBe(5_059_593_409);
    expect(nb.transferGain).toBe(922_700_197);
    expect(nb.longTermDeductionAmount).toBe(276_810_059);
    expect(nb.incomeAmount).toBe(645_890_138);
  });

  it("B-1 전체 양도차익 4열 — 실측 고정 · 4열 합 == 합계 (정확)", () => {
    expect(o.cell("transferGain", "housingLand")).toBe(1_318_064_694);
    expect(o.cell("transferGain", "housingBuilding")).toBe(3_726_104_173);
    expect(o.cell("transferGain", "commercialLand")).toBe(2_895_152_209);
    expect(o.cell("transferGain", "commercialBuilding")).toBe(69_934_308);
    expect(o.cell("transferGain", "total")).toBe(8_009_255_384);
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
  });

  it("B-2 과세대상 양도차익 4열 — 실측 고정", () => {
    // ⚠️ F35: 비사토 922,700,197원이 과세대상에서 빠진 값들이다 — 현행 동작이며 오분류.
    expect(o.cell("taxableGain", "housingLand")).toBe(821_533_070);
    expect(o.cell("taxableGain", "housingBuilding")).toBe(2_322_433_651);
    expect(o.cell("taxableGain", "commercialLand")).toBe(2_895_152_209);
    expect(o.cell("taxableGain", "commercialBuilding")).toBe(69_934_308);
    expect(o.cell("taxableGain", "total")).toBe(6_109_053_239);
  });

  it("B-3 비과세 양도차익 4열 — 실측 고정", () => {
    // ⚠️ F35: 주택분 토지·건물 두 칸에 걸쳐 비사토 922,700,197원이 「비과세」로 흡수돼 있다.
    //    `housingExemptRatio`가 비사토를 분모(hp.transferGain)에만 남기고 분자에서 뺀 결과다.
    expect(o.cell("exemptGain", "housingLand")).toBe(496_531_624);
    expect(o.cell("exemptGain", "housingBuilding")).toBe(1_403_670_522);
    expect(o.cell("exemptGain", "commercialLand")).toBe(0);
    expect(o.cell("exemptGain", "commercialBuilding")).toBe(0);
    expect(o.cell("exemptGain", "total")).toBe(1_900_202_145);
  });

  it("B-4 🔴 오분류 금액 = 비사업용토지 양도차익 전액 (922,700,197원)", () => {
    const misclassified = nb.transferGain;
    // 정상 비과세액 = 주택분 양도차익 − 비사토 이전분 − 주택분 안분과세분
    const properExempt =
      o.breakdown.housingPart.transferGain - misclassified - o.breakdown.housingPart.proratedTaxableGain;
    expect(properExempt).toBe(977_501_948);
    expect(o.cell("exemptGain", "total")).toBe(properExempt + misclassified);
    expect(o.cell("taxableGain", "total") + misclassified).toBe(7_031_753_436);
  });

  it("B-5 장기보유특별공제 4열 — 실측 고정 (비사토 장특 276,810,059원 누락)", () => {
    expect(o.cell("ltDeduction", "housingLand")).toBe(657_226_455);
    expect(o.cell("ltDeduction", "housingBuilding")).toBe(1_857_946_921);
    expect(o.cell("ltDeduction", "commercialLand")).toBe(868_545_661);
    expect(o.cell("ltDeduction", "commercialBuilding")).toBe(20_980_292);
    // ⚠️ F35: 수정 시 3,681,509,390 이 되어야 정상.
    expect(o.cell("ltDeduction", "total")).toBe(3_404_699_331);
  });

  it("B-6 양도소득금액 4열 — 실측 고정", () => {
    expect(o.cell("incomeAmount", "housingLand")).toBe(164_306_614);
    expect(o.cell("incomeAmount", "housingBuilding")).toBe(464_486_730);
    expect(o.cell("incomeAmount", "commercialLand")).toBe(2_026_606_547);
    expect(o.cell("incomeAmount", "commercialBuilding")).toBe(48_954_015);
    expect(o.cell("incomeAmount", "total")).toBe(2_704_353_908);
  });

  it("B-7 🔴 표 내부 자기모순: 과세표준 − (양도소득금액 − 기본공제) = 비사토 양도소득금액", () => {
    expect(o.cell("basicDeduction", "total")).toBe(2_500_000);
    expect(o.cell("taxBase", "total")).toBe(3_347_744_046);
    const gap = o.cell("taxBase", "total") - (o.cell("incomeAmount", "total") - o.cell("basicDeduction", "total"));
    expect(gap).toBe(nb.incomeAmount);
    expect(gap).toBe(645_890_138);
  });

  it("B-8 「4열 합 = 합계」 불변식 — (가)/(나) 어느 쪽을 택하든 지켜야 할 계약", () => {
    expect(o.partSum("transferGain")).toBe(o.cell("transferGain", "total"));
    for (const key of ["taxableGain", "exemptGain", "ltDeduction", "incomeAmount"] as const) {
      expect(Math.abs(o.partSum(key) - o.cell(key, "total"))).toBeLessThanOrEqual(4);
    }
  });

  it("B-9 세액은 결함의 영향을 받지 않는다 — 표시 축 결함임을 고정", () => {
    expect(o.result.taxBase).toBe(3_347_744_046);
    expect(o.result.determinedTax).toBe(1_449_642_128);
    expect(o.result.totalTax).toBe(1_594_606_340);
  });
});
