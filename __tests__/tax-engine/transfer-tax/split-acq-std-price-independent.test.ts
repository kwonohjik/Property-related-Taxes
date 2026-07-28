/**
 * P2b — 취득시 기준시가 축(B) 파트별 독립. `building` 전용.
 *
 * 설계: docs/02-design/features/transfer-separate-acq-date-per-part-completion.engine.design.md §4 E1
 *
 * 축 B는 축 A와 달리 **propertyType으로 갈린다** — 공시 구조가 다르기 때문이다.
 *
 *  · 주택(소득세법 §99①1호 **라목**): 개별주택가격·공동주택가격은 **부수토지를 포함한 결합 공시**다.
 *    건물분 단독 공시가 존재하지 않으므로 `결합 총액 − 토지분` 역산이 정본이며, 이 역산이
 *    `토지분 + 건물분 ≡ 라목 총액` 항등성을 지켜 개산공제 합계를 법정액(소득령 §163⑥2호가목 —
 *    라목 가액 × 3/100)과 일치시킨다. → **파트 독립 입력을 허용하면 안 된다.**
 *
 *  · 일반 건물(**가목** 토지 + **나목** 건물): 개별공시지가와 국세청장 산정 건물 기준시가가
 *    각각 별도 공시된다. 결합 총액이라는 공시 자체가 없다. 취득시점이 다르면 각 파트는
 *    자기 취득일의 직전 고시분(소득령 §164③)으로 조회해야 하는데, 총액 역산은 건물분에
 *    토지 취득시점을 섞는다. → **파트별 독립이 정본.**
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { baseTransferInput } from "../_helpers/mock-rates";

/**
 * 토지 2015 취득 / 건물 2018 취득.
 * 토지분 = 100만/㎡ × 200㎡ = 2억 · 결합 총액(레거시) 5억 → 역산 건물분 3억
 */
const bldg = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "building",
    acquisitionDate: new Date("2018-06-01"),
    landAcquisitionDate: new Date("2015-06-01"),
    transferDate: new Date("2024-06-01"),
    transferPrice: 1_000_000_000,
    saleSplitMode: "actual",
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    standardPricePerSqmAtAcquisition: 1_000_000,
    acquisitionArea: 200,
    standardPriceAtAcquisition: 500_000_000,
    landStandardPriceAtTransfer: 600_000_000,
    buildingStandardPriceAtTransfer: 400_000_000,
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 250_000_000,
    ...over,
  });

// ════════════════════════════════════════════════════════════
// B2~B6 — 건물분 명시 입력 시 결합 총액 미참조
// ════════════════════════════════════════════════════════════
describe("E1: building + 별개 취득 → 취득시 기준시가 파트별 독립", () => {
  it("건물분 명시 입력 → 토지분은 ㎡당 공시지가 × 면적, 건물분은 입력값", () => {
    const r = calcSplitGain(
      bldg({
        landAcqMode: "appraisal", // 추계 → stdPriceAtAcq가 개산공제 base로 노출된다
        buildingAcqMode: "appraisal",
        buildingStandardPriceAtAcquisition: 350_000_000, // 역산값 3억과 다른 값
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.land.stdPriceAtAcq).toBe(200_000_000);
    expect(r!.building.stdPriceAtAcq, "결합 총액 역산(3억)이 아니라 입력값이어야 한다").toBe(
      350_000_000,
    );
    // 개산공제(§163⑥) 3% — 파트별 독립 base
    expect(r!.land.appraisalDeduction).toBe(6_000_000);
    expect(r!.building.appraisalDeduction).toBe(10_500_000);
  });

  it("🔴 결합 총액(standardPriceAtAcquisition)을 지워도 결과 불변 — 총액 미참조 증명", () => {
    const withTotal = calcSplitGain(
      bldg({
        landAcqMode: "appraisal",
        buildingAcqMode: "appraisal",
        buildingStandardPriceAtAcquisition: 350_000_000,
      }),
    );
    const withoutTotal = calcSplitGain(
      bldg({
        landAcqMode: "appraisal",
        buildingAcqMode: "appraisal",
        buildingStandardPriceAtAcquisition: 350_000_000,
        standardPriceAtAcquisition: undefined,
      }),
    );
    expect(
      withoutTotal,
      "가목·나목이 각각 공시되므로 결합 총액은 애초에 공시되지 않는다 — 필수여선 안 된다",
    ).not.toBeNull();
    expect(withoutTotal!.land.stdPriceAtAcq).toBe(withTotal!.land.stdPriceAtAcq);
    expect(withoutTotal!.building.stdPriceAtAcq).toBe(withTotal!.building.stdPriceAtAcq);
    expect(withoutTotal!.apportionRatio).toEqual(withTotal!.apportionRatio);
  });

  it("안분 비율 분모 = 파트 합계 (2억 + 3.5억 = 5.5억)", () => {
    const r = calcSplitGain(
      bldg({ buildingStandardPriceAtAcquisition: 350_000_000 }),
    );
    expect(r!.apportionRatio.land).toBeCloseTo(200_000_000 / 550_000_000, 10);
    expect(r!.apportionRatio.building).toBeCloseTo(350_000_000 / 550_000_000, 10);
  });

  it("환산 분자도 파트별 독립값을 쓴다", () => {
    const r = calcSplitGain(
      bldg({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        buildingStandardPriceAtAcquisition: 350_000_000,
      }),
    );
    // 건물 환산 = 건물 양도가 4억 × (건물 취득시 3.5억 / 건물 양도시 4억) = 3.5억
    // (역산 3억이었다면 3억이 나온다 — 파트 독립이 실제로 분자를 바꾼다)
    expect(r!.building.acquisitionPrice).toBe(350_000_000);
  });

  it("echo: 건물분 명시 입력 → stdPriceDerivedFromTotal=false, 토지분은 항상 false", () => {
    const r = calcSplitGain(
      bldg({ buildingStandardPriceAtAcquisition: 350_000_000 }),
    );
    expect(r!.land.stdPriceDerivedFromTotal).toBe(false);
    expect(r!.building.stdPriceDerivedFromTotal).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// 레거시 후퇴 (Q4 한시) — 건물분 미입력 시 결합 총액 역산 유지
// ════════════════════════════════════════════════════════════
describe("레거시 후퇴: 건물분 미입력 → 결합 총액 역산 (한시 허용)", () => {
  it("역산값 3억 + echo 표식", () => {
    const r = calcSplitGain(
      bldg({ landAcqMode: "appraisal", buildingAcqMode: "appraisal" }),
    );
    expect(r!.land.stdPriceAtAcq).toBe(200_000_000);
    expect(r!.building.stdPriceAtAcq).toBe(300_000_000); // 5억 − 2억
    expect(r!.building.stdPriceDerivedFromTotal).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════
// H4·H10 — 주택은 라목 결합 유지 (신규 필드가 있어도 무시)
// ════════════════════════════════════════════════════════════
describe("🔴 housing: 라목 결합 공시 — 파트 독립 입력 무시", () => {
  const house = (over: Record<string, unknown> = {}) =>
    bldg({ propertyType: "housing", ...over });

  it("buildingStandardPriceAtAcquisition을 줘도 역산을 유지한다", () => {
    const r = calcSplitGain(
      house({
        landAcqMode: "appraisal",
        buildingAcqMode: "appraisal",
        buildingStandardPriceAtAcquisition: 350_000_000, // 무시돼야 한다
      }),
    );
    expect(r!.building.stdPriceAtAcq, "라목은 부수토지 포함 결합 공시 — 파트 독립이 성립하지 않는다").toBe(
      300_000_000,
    );
    expect(r!.building.stdPriceDerivedFromTotal).toBe(true);
  });

  it("H10: 개산공제 합계 = 라목 총액 × 3% 항등성 (파트 독립을 허용하면 깨지는 값)", () => {
    const r = calcSplitGain(
      house({
        landAcqMode: "appraisal",
        buildingAcqMode: "appraisal",
        buildingStandardPriceAtAcquisition: 350_000_000,
      }),
    );
    const sum = r!.land.appraisalDeduction + r!.building.appraisalDeduction;
    expect(sum, "§163⑥2호가목 — 라목 가액 5억 × 3/100").toBe(15_000_000);
    expect((r!.land.stdPriceAtAcq ?? 0) + (r!.building.stdPriceAtAcq ?? 0)).toBe(500_000_000);
  });
});

// ════════════════════════════════════════════════════════════
// 게이트 회귀 — 비분리·동시취득 building은 종전 역산 유지
// ════════════════════════════════════════════════════════════
describe("게이트 off: building 동시 취득 → 종전 역산 (회귀 0)", () => {
  it("isSeparateAcquisition 미설정 → 신규 필드 무시", () => {
    const r = calcSplitGain(
      bldg({
        isSeparateAcquisition: undefined,
        landAcqMode: "appraisal",
        buildingAcqMode: "appraisal",
        buildingStandardPriceAtAcquisition: 350_000_000,
      }),
    );
    expect(r!.building.stdPriceAtAcq).toBe(300_000_000);
    expect(r!.apportionRatio.land).toBeCloseTo(0.4, 10); // 2억 / 5억
  });

  it("레거시 비율 항등성 — 토지분 > 총액이면 비율 1로 클램프 (종전 동작)", () => {
    const r = calcSplitGain(
      bldg({
        isSeparateAcquisition: undefined,
        standardPriceAtAcquisition: 150_000_000, // 토지분 2억 < 총액
      }),
    );
    expect(r!.apportionRatio.land).toBe(1);
    expect(r!.apportionRatio.building).toBe(0);
  });
});
