/**
 * anchor: 파트가 **자기 호(`rateClause`)를 들고** 밖으로 나온다 (P12 1단계)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md §4.10
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * §104⑤2호 **본문**의 계산 단위는 예규가 확정했다 —
 *   「"자산별"에서 "자산"의 의미는 동법 **제104조 각 호별로 합산한 자산**을 의미」
 *   (「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」 2018.6.21.)
 *
 * 그런데 자산 하나가 **둘 이상의 호에 걸치는** 경우가 있다:
 *   · split — 토지 파트와 건물 파트의 취득일이 달라 호가 갈린다
 *   · 부분 비사토 — 한 필지가 §104①8호(비사업용)와 그 외로 나뉜다(§104⑤ 본문 후단 의제)
 *
 * 다건 `aggregateByGroup`은 그룹 키가 **자산 단위**라 이런 자산을 호별로 나눌 수 없고,
 * 그래서 같은 호 다른 자산과의 합산이 끊긴다(§D-7 · §D-12 — 과소 51,000,000 · 23,400,000).
 *
 * **1단계는 계산을 바꾸지 않는다** — 파트에 호를 실어 aggregate가 읽을 수 있게만 한다.
 * 세액 판정은 2단계(그룹 키를 파트 단위로 전환)에서 바뀐다.
 *
 * ⚠️ 이 파일은 **세액을 단정하지 않는다.** 세액 불변은 기존 anchor 전체가 이미 지킨다.
 *   여기서는 **파트 구조·호·불변식**만 고정한다.
 */
import { describe, it, expect } from "vitest";
import { resolveSplitAwareTax } from "@/lib/tax-engine/transfer-tax-split-rate";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const parsedRates = parseRatesFromMap(makeMockRates());
const D = (s: string) => new Date(s);

/**
 * split 자산 — 자산 단위 취득일은 **장기**인데 **토지 파트만 단기**.
 * 주택은 `resolveAppurtenantLandRateBasisDate`가 `max(토지, 건물)`을 쓰므로
 * 토지를 **나중에** 취득해야 파트 기산일이 갈린다(§D-7 조합 구성).
 */
function splitInput(): TransferTaxInput {
  return {
    ...baseTransferInput(),
    propertyType: "housing",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2010-01-01"), // 건물 — 16년 → §104①1호
    landAcquisitionDate: D("2025-08-01"), // 토지 — 10개월 → §104①3호(주택부수토지 70%)
    transferPrice: 1_000_000_000,
    acquisitionPrice: 400_000_000,
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 100_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
  };
}

/** 한 필지 중 절반만 비사업용 — §104⑤ 본문 후단이 **별개 자산으로 의제**한다. */
function partialNblInput(): TransferTaxInput {
  return {
    ...baseTransferInput(),
    propertyType: "land",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2015-01-01"), // 위기취득 중과배제(부칙 §9270호 §14①) 구간 밖
    transferPrice: 300_000_000,
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: true,
    nonBusinessLandAreaRatio: 0.5,
    expenses: 0,
  };
}

describe("P12 1단계 — split 파트가 호를 들고 나온다", () => {
  it("A-1: 토지 파트 §104①3호 · 건물 파트 §104①1호", () => {
    const input = splitInput();
    const splitDetail = calcSplitGain(input);
    expect(splitDetail).not.toBeNull();

    const r = resolveSplitAwareTax({
      taxBase: 510_000_000,
      transferIncome: 510_000_000, // 기본공제 소진 가정
      basicDeduction: 0,
      splitDetail: splitDetail!,
      parsedRates,
      taxRateInput: input,
    });

    const parts = r.splitPartDetail?.parts;
    expect(parts).toBeDefined();
    const byKind = Object.fromEntries((parts ?? []).map((p) => [p.kind, p]));
    // 토지 = 1년 미만 주택부수토지 70% → §104①3호 / 건물 = 2년 이상 누진 → §104①1호
    expect(byKind.land?.rateClause).toBe("104-1-3");
    expect(byKind.building?.rateClause).toBe("104-1-1");
    expect(byKind.land?.appliedRate).toBe(0.7);
  });

  it("A-3a: Σ 파트 과세표준 = 자산 과세표준 · Σ 파트 세액 = perAssetTotal", () => {
    const input = splitInput();
    const r = resolveSplitAwareTax({
      taxBase: 510_000_000,
      transferIncome: 510_000_000,
      basicDeduction: 0,
      splitDetail: calcSplitGain(input)!,
      parsedRates,
      taxRateInput: input,
    });
    const d = r.splitPartDetail!;
    expect(d.parts.reduce((s, p) => s + p.taxBase, 0)).toBe(510_000_000);
    expect(d.parts.reduce((s, p) => s + p.calculatedTax, 0)).toBe(d.perAssetTotal);
  });
});

describe("P12 1단계 — 부분 비사토도 같은 형태로 파트를 낸다", () => {
  it("A-2: 파트 2개 — 비사업용 §104①8호 · 그 외 §104①1호", () => {
    const input = partialNblInput();
    const r = resolveSplitAwareTax({
      taxBase: 234_000_000,
      transferIncome: 234_000_000,
      basicDeduction: 0,
      splitDetail: undefined, // 토지·건물 분리취득이 아니다 — 한 필지 내부 분할이다
      parsedRates,
      taxRateInput: input,
    });

    const parts = r.splitPartDetail?.parts;
    expect(parts).toBeDefined();
    expect(parts).toHaveLength(2);
    const nbl = parts!.find((p) => p.kind === "non_business_land");
    const other = parts!.find((p) => p.kind !== "non_business_land");
    expect(nbl?.rateClause).toBe("104-1-8"); // 누진 + 10%p
    expect(other?.rateClause).toBe("104-1-1"); // §55① 누진
    // 면적비율 0.5 안분 — `applyRate`(floor) 규약을 따른다
    expect(nbl?.taxBase).toBe(117_000_000);
    expect(other?.taxBase).toBe(117_000_000);
  });

  it("A-3b: 불변식 — Σ 파트 과세표준 = 자산 과세표준", () => {
    const input = partialNblInput();
    const r = resolveSplitAwareTax({
      taxBase: 234_000_000,
      transferIncome: 234_000_000,
      basicDeduction: 0,
      splitDetail: undefined,
      parsedRates,
      taxRateInput: input,
    });
    const d = r.splitPartDetail!;
    expect(d.parts.reduce((s, p) => s + p.taxBase, 0)).toBe(234_000_000);
    expect(d.parts.reduce((s, p) => s + p.calculatedTax, 0)).toBe(d.perAssetTotal);
  });

  it("A-3c: Σ 파트 기본공제 배분 = 자산 기본공제 (clamp 없이 성립)", () => {
    // `computePartialNblTax`는 배분액을 **clamp하지 않는다** — 음수가 될 수 없기 때문이다:
    //   `transferIncome ≥ taxBase`이고 `applyRate`가 floor라 `nblIncome ≥ nblBase`,
    //   `floor(ti·r) − floor(tb·r) ≤ ⌈(ti−tb)·r⌉ ≤ ti − tb`(r ≤ 1)라 그 외 파트도 음수가 안 된다.
    // 엔진이 조용히 0으로 깎으면 오답이 눈에 띄지 않으므로, 그 불변식을 여기서 고정한다.
    const input = partialNblInput();
    const r = resolveSplitAwareTax({
      taxBase: 231_500_000, // 양도소득금액 234,000,000 − 기본공제 2,500,000
      transferIncome: 234_000_000,
      basicDeduction: 2_500_000,
      splitDetail: undefined,
      parsedRates,
      taxRateInput: input,
    });
    const parts = r.splitPartDetail!.parts;
    expect(parts.every((p) => p.allocatedBasicDeduction >= 0)).toBe(true);
    expect(parts.reduce((s, p) => s + p.allocatedBasicDeduction, 0)).toBe(2_500_000);
    expect(parts.reduce((s, p) => s + p.income, 0)).toBe(234_000_000);
    expect(parts.reduce((s, p) => s + p.taxBase, 0)).toBe(231_500_000);
  });

  it("A-2b: 전량 비사토(ratio 1)는 나눌 대상이 없어 파트를 내지 않는다", () => {
    const input = { ...partialNblInput(), nonBusinessLandAreaRatio: undefined };
    const r = resolveSplitAwareTax({
      taxBase: 234_000_000,
      transferIncome: 234_000_000,
      basicDeduction: 0,
      splitDetail: undefined,
      parsedRates,
      taxRateInput: input,
    });
    expect(r.splitPartDetail).toBeUndefined();
  });
});
