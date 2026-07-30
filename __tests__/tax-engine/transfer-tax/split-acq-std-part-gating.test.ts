/**
 * anchor: 별개취득 취득시 기준시가 — **파트별** 요구 (소득세법 §99①1호 가목·나목, 시행령 §163⑥).
 *
 * 계획서: docs/02-design/features/transfer-split-acq-std-part-gating.plan.md §3
 *
 * 🔴 현행 결함: `requiresAcqStdPrice`(transfer-tax-split-acq-mode.ts:267)가 파트를 구분하지 않고
 *   "하나라도 non-actual이면 true"를 반환하고, `calcAcqStdPair`가 토지분 산출 불가 시 **쌍 전체를
 *   null**로 만든다(split-gain.ts:54). 그래서 **토지=실거래가 + 건물=환산**에서 토지 공시지가·면적이
 *   계산 어디에도 쓰이지 않는데도 미입력이면 throw한다.
 *
 * 불변식:
 *   · 개산공제 base는 **그 파트 자신의 취득시 기준시가**다(§163⑥1호 토지·2호 건물 — 별개 호).
 *   · 실가(actual) 파트의 기준시가는 취득가액 계산에 등장하지 않는다 → 요구하지 않는다.
 *   · 안분 비율(`apportionRatio`)이 실제로 소비될 때만 **양쪽** 기준시가를 요구한다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

/** 구분양도(양도가액 직접입력) — 양도가액 축에 안분 비율이 필요 없는 셋업 */
const BASE = {
  propertyType: "building",
  transferDate: new Date("2025-10-01"),
  acquisitionDate: new Date("2025-08-29"),
  landAcquisitionDate: new Date("2025-01-08"),
  transferPrice: 500_000_000,
  isSeparateAcquisition: true,
  saleSplitMode: "actual",
  landTransferPrice: 300_000_000,
  buildingTransferPrice: 200_000_000,
  landStandardPriceAtTransfer: 200_000_000,
  buildingStandardPriceAtTransfer: 98_280_000,
} as unknown as TransferTaxInput;

const input = (over: Record<string, unknown>) =>
  ({ ...BASE, ...over }) as unknown as TransferTaxInput;

describe("T1 — 토지 실가 + 건물 환산: 토지 기준시가는 요구하지 않는다", () => {
  const r = () =>
    calcSplitGain(
      input({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: 150_000_000,
        buildingStandardPriceAtAcquisition: 99_960_000,
        // standardPricePerSqmAtAcquisition · acquisitionArea 미제공 — 계산에 쓰이지 않는다
      }),
    );

  it("throw 없이 산출된다", () => {
    expect(r).not.toThrow();
  });

  it("건물 개산공제 = 건물 취득시 기준시가 × 3% (§163⑥2호가목)", () => {
    expect(r()!.building.appraisalDeduction).toBe(2_998_800);
  });

  it("실가 파트인 토지는 개산공제 0 · stdPriceAtAcq 미표시", () => {
    expect(r()!.land.appraisalDeduction).toBe(0);
    expect(r()!.land.stdPriceAtAcq).toBeUndefined();
  });

  it("건물 환산취득가 = 건물 양도가 × (취득시 ÷ 양도시) — 토지 기준시가 무관", () => {
    expect(r()!.building.acquisitionPrice).toBe(203_418_803);
  });

  it("토지 취득가액은 입력 실지거래가액 그대로", () => {
    expect(r()!.land.acquisitionPrice).toBe(150_000_000);
  });
});

describe("T2 — 토지 환산 + 건물 실가: 건물 기준시가는 요구하지 않는다", () => {
  const r = () =>
    calcSplitGain(
      input({
        landAcqMode: "estimated",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: 100_000_000,
        standardPricePerSqmAtAcquisition: 1_000_000,
        acquisitionArea: 100,
        // buildingStandardPriceAtAcquisition 미제공
      }),
    );

  it("throw 없이 산출된다", () => {
    expect(r).not.toThrow();
  });

  it("토지 환산취득가 = 토지 양도가 × (토지 취득시 ÷ 토지 양도시)", () => {
    // 300,000,000 × (100,000,000 ÷ 200,000,000)
    expect(r()!.land.acquisitionPrice).toBe(150_000_000);
  });

  it("토지 개산공제 = 토지 취득시 기준시가 × 3% (§163⑥1호)", () => {
    expect(r()!.land.appraisalDeduction).toBe(3_000_000);
  });

  it("실가 파트인 건물은 개산공제 0", () => {
    expect(r()!.building.appraisalDeduction).toBe(0);
    expect(r()!.building.acquisitionPrice).toBe(100_000_000);
  });
});

describe("T3 — 필요한 파트가 비면 어느 파트인지 명시해 차단한다", () => {
  it("양쪽 환산 + 건물 기준시가 미입력 → 건물분을 지목", () => {
    expect(() =>
      calcSplitGain(
        input({
          landAcqMode: "estimated",
          buildingAcqMode: "estimated",
          standardPricePerSqmAtAcquisition: 1_000_000,
          acquisitionArea: 100,
        }),
      ),
    ).toThrow(/건물/);
  });

  it("양쪽 환산 + 토지 공시지가·면적 미입력 → 토지분을 지목", () => {
    expect(() =>
      calcSplitGain(
        input({
          landAcqMode: "estimated",
          buildingAcqMode: "estimated",
          buildingStandardPriceAtAcquisition: 99_960_000,
        }),
      ),
    ).toThrow(/토지/);
  });
});

describe("T4 — 회귀: 기준시가가 모두 있는 경우 종전 수치 불변", () => {
  const full = () =>
    calcSplitGain(
      input({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: 150_000_000,
        buildingStandardPriceAtAcquisition: 99_960_000,
        standardPricePerSqmAtAcquisition: 1_000_000,
        acquisitionArea: 100,
      }),
    )!;

  it("건물 환산취득가·개산공제가 파트 독립 산정과 동일", () => {
    expect(full().building.acquisitionPrice).toBe(203_418_803);
    expect(full().building.appraisalDeduction).toBe(2_998_800);
  });

  it("자본적지출 — 실가 파트는 전액 차감, 환산 파트는 §97②2호 본문(가목) 채택으로 0", () => {
    const r = calcSplitGain(
      input({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: 150_000_000,
        buildingStandardPriceAtAcquisition: 99_960_000,
        standardPricePerSqmAtAcquisition: 1_000_000,
        acquisitionArea: 100,
        landDirectExpenses: 10_000_000,
        buildingDirectExpenses: 20_000_000,
      }),
    )!;
    expect(r.land.directExpenses).toBe(10_000_000);
    expect(r.building.directExpenses).toBe(0);
    expect(r.building.appraisalDeduction).toBe(2_998_800);
    expect(r.building.swapApplied).toBe(false);
  });

  it("양쪽 실가 + 자본적지출 — 양쪽 전액 차감, 개산공제 없음", () => {
    const r = calcSplitGain(
      input({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 150_000_000,
        buildingAcquisitionPrice: 100_000_000,
        landDirectExpenses: 10_000_000,
        buildingDirectExpenses: 20_000_000,
      }),
    )!;
    expect(r.land.directExpenses).toBe(10_000_000);
    expect(r.building.directExpenses).toBe(20_000_000);
    expect(r.land.appraisalDeduction).toBe(0);
    expect(r.building.appraisalDeduction).toBe(0);
  });
});

describe("T5 — note 문구: 환산 파트가 있으면 '실지거래가액'이라 하지 않는다", () => {
  it("토지 실가 + 건물 환산 (비율 미산출)", () => {
    const r = calcSplitGain(
      input({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: 150_000_000,
        buildingStandardPriceAtAcquisition: 99_960_000,
      }),
    )!;
    expect(r.apportionRatio, "안분 비율은 소비되지 않으므로 정의되지 않는다").toBeUndefined();
    expect(r.note).not.toMatch(/실지거래가액/);
  });

  it("양쪽 실가 — 종전 문구 유지", () => {
    const r = calcSplitGain(
      input({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: 150_000_000,
        buildingAcquisitionPrice: 100_000_000,
      }),
    )!;
    expect(r.note).toMatch(/실지거래가액/);
  });
});

describe("T6 — 회귀: 비-별개취득 레거시 역산 경로는 불변", () => {
  it("취득일 동일(소유자 분리 등) + 토지 3요소 미입력 → 종전대로 null", () => {
    const r = calcSplitGain({
      ...BASE,
      isSeparateAcquisition: undefined,
      acquisitionDate: new Date("2025-01-08"),
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: 200_000_000,
      saleSplitMode: "apportioned",
      landTransferPrice: undefined,
      buildingTransferPrice: undefined,
    } as unknown as TransferTaxInput);
    expect(r).toBeNull();
  });

  it("비-별개취득 + 총액 역산: 건물분 = 총액 − 토지분 (§99①1호 라목)", () => {
    const r = calcSplitGain({
      ...BASE,
      isSeparateAcquisition: undefined,
      acquisitionDate: new Date("2025-01-08"),
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: 200_000_000,
      standardPricePerSqmAtAcquisition: 1_000_000,
      acquisitionArea: 100,
    } as unknown as TransferTaxInput)!;
    // 토지분 100,000,000 / 건물분 = 200,000,000 − 100,000,000
    expect(r.land.stdPriceAtAcq).toBe(100_000_000);
    expect(r.building.stdPriceAtAcq).toBe(100_000_000);
    expect(r.building.stdPriceDerivedFromTotal).toBe(true);
  });
});
