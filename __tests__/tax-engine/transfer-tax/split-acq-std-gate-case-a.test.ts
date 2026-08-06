/**
 * 별개 취득 케이스 a — 양쪽 실가를 아는 경우 취득시 기준시가는 계산에 필요 없다.
 *
 * 계획서: docs/02-design/features/transfer-split-acq-std-gate-relaxation.plan.md (PR1)
 *
 * 사용자 확정 규칙(2026-07-29):
 *   ① 양도가액을 토지·건물로 구분(계약서 구분 또는 양도시 기준시가 비율)
 *   ② 취득가액 — a: 양쪽 실가 있음 → 각 실가로 양도차익 계산
 *                b: 한쪽만 실가 → 없는 쪽만 환산(파트 양도안분액 × 취득시/양도시 기준시가)
 *                c: 양쪽 다 없음 → 양쪽 환산
 *   ③ 케이스 a에서 취득시 기준시가는 **전혀 필요 없다**
 *
 * 🔴 현행 결함: `calcApportionRatio`가 null이면 `calcSplitGain`이 무조건 null을 반환해
 * (transfer-tax-split-gain.ts:330-331) 분리 계산이 **오류 없이 비활성**된다. 별개 취득은
 * 자산 전체 취득가액 칸이 UI에 없어 acquisitionPrice=0 → 양도차익이 양도가액 전액이 된다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { calcTransferGain } from "@/lib/tax-engine/transfer-tax-helpers";
import { baseTransferInput } from "../_helpers/mock-rates";

/** 사용자 보고 시나리오 — 주택, 토지 2025-01-08 / 건물 2025-08-29 별개 취득 */
const caseA = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing",
    acquisitionDate: new Date("2025-08-29"),
    landAcquisitionDate: new Date("2025-01-08"),
    transferDate: new Date("2026-03-01"),
    transferPrice: 500_000_000,
    acquisitionPrice: 0, // 별개 취득 — 총액 칸이 UI에 없어 0
    isSeparateAcquisition: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: 150_000_000,
    buildingAcquisitionPrice: 100_000_000,
    // 양도가액 구분양도 — 규칙 ①의 "계약서 구분" 경로
    saleSplitMode: "actual",
    landTransferPrice: 300_000_000,
    buildingTransferPrice: 200_000_000,
    // **양도시** 기준시가 — Phase 1-D부터 구분 기재 시 필수다(§100③ 판정이 안분값을 요구한다).
    // 구분 기재값과 같은 3:2로 둬 의제가 발동하지 않게 한다 ⇒ 이 describe의 관심사
    // (**취득시** 기준시가 없이도 성립하는가)는 그대로 남는다.
    landStandardPriceAtTransfer: 300_000_000,
    buildingStandardPriceAtTransfer: 200_000_000,
    // ⚠️ **취득시** 기준시가 3요소를 **일부러 넣지 않는다** — 규칙 ③
    ...over,
  });

describe("케이스 a — 취득시 기준시가 없이도 분리 계산이 성립한다", () => {
  it("🔴 a-1 분리 계산이 비활성되지 않는다", () => {
    const r = calcSplitGain(caseA());
    expect(r, "양쪽 실가를 아는데 취득시 기준시가가 없다고 분리 전체를 죽이면 안 된다").not.toBeNull();
    expect(r!.land.acquisitionPrice).toBe(150_000_000);
    expect(r!.building.acquisitionPrice).toBe(100_000_000);
  });

  it("🔴 a-1b 양도차익 = 양도가액 − 파트 취득가액 합 (취득가 0원 과세 방지)", () => {
    const g = calcTransferGain(caseA());
    expect(g.splitDetail, "분리 경로로 계산돼야 한다").toBeTruthy();
    expect(g.gain, "500,000,000이면 취득가액이 통째로 무시된 것").toBe(250_000_000);
  });

  it("a-2 취득시 기준시가를 넣어도 결과가 같다 (안 쓰인다는 불변성)", () => {
    const without = calcTransferGain(caseA()).gain;
    const withStd = calcTransferGain(
      caseA({
        standardPricePerSqmAtAcquisition: 1_000_000,
        acquisitionArea: 200,
        standardPriceAtAcquisition: 500_000_000,
      }),
    ).gain;
    expect(withStd).toBe(without);
  });

  it("a-4 일괄양도(양도시 기준시가 비율 안분) 경로도 성립", () => {
    const r = calcSplitGain(
      caseA({
        saleSplitMode: "apportioned",
        landTransferPrice: undefined,
        buildingTransferPrice: undefined,
        landStandardPriceAtTransfer: 300_000_000,
        buildingStandardPriceAtTransfer: 200_000_000,
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.land.transferPrice).toBe(300_000_000);
    expect(r!.building.transferPrice).toBe(200_000_000);
  });

  it("a-6 안분비율이 산출되지 않으면 apportionRatio는 undefined (0.0% 침묵 오표시 금지)", () => {
    const r = calcSplitGain(caseA());
    expect(r!.apportionRatio, "0으로 채우면 '토지 0.0% : 건물 100.0%'로 거짓 표시된다").toBeUndefined();
    expect(r!.note).not.toContain("안분비");
  });

  it("a-7 케이스 a는 취득시 기준시가를 쓰지 않았으므로 '역산' 안내를 띄우지 않는다", () => {
    const r = calcSplitGain(caseA());
    expect(r!.building.stdPriceDerivedFromTotal).toBe(false);
  });
});

describe("케이스 b·c — 환산 파트가 있으면 취득시 기준시가가 필요하다 → **차단**", () => {
  it("b-1 건물만 환산 + 취득시 기준시가 없음 → 차단(throw)", () => {
    // 조용한 null(단일자산 경로 → 취득가액 0) 대신 명시 오류. feedback_no_silent_apportion_fallback
    // 2026-07-30 파트별 분해 — 메시지가 **어느 파트가 비었는지** 지목한다. 토지는 실거래가라
    // 그 기준시가가 계산에 등장하지 않으므로 "개별공시지가"가 아니라 **건물분**을 요구하는 것이 정확하다
    // (계획서 transfer-split-acq-std-part-gating.plan.md §3.2 (2)).
    expect(() => calcSplitGain(caseA({ buildingAcqMode: "estimated" }))).toThrow(/건물분/);
  });

  it("b-2 건물만 환산 + 취득시 기준시가 있음 → 환산 성립", () => {
    const r = calcSplitGain(
      caseA({
        buildingAcqMode: "estimated",
        standardPricePerSqmAtAcquisition: 1_000_000,
        acquisitionArea: 200,
        standardPriceAtAcquisition: 500_000_000,
        landStandardPriceAtTransfer: 300_000_000,
        buildingStandardPriceAtTransfer: 200_000_000,
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.land.acquisitionPrice, "실가 파트는 그대로").toBe(150_000_000);
    // 건물 환산 = 건물 양도가 2억 × (건물 취득시 기준시가 3억 / 건물 양도시 기준시가 2억)
    expect(r!.building.acquisitionPrice).toBe(300_000_000);
  });

  it("c-2 양쪽 환산 + 취득시 기준시가 없음 → 차단(throw)", () => {
    expect(() =>
      calcSplitGain(caseA({ landAcqMode: "estimated", buildingAcqMode: "estimated" })),
    ).toThrow(/개별공시지가/);
  });
});

describe("회귀 0 — 비-별개취득은 종전 동작 유지", () => {
  it("r-1 취득일 동일(겸용·소유자분리 경로) + 파트 금액 미입력 → 종전대로 null", () => {
    // 비-별개취득은 자산 전체 취득가액이 **UI에 존재**하므로 단일 자산 경로가 정상 산출을 낸다.
    // 별개취득처럼 "취득가액 0"이 되지 않으므로 차단 대상이 아니다(회귀 0).
    const r = calcSplitGain(
      caseA({
        isSeparateAcquisition: false,
        landAcquisitionDate: new Date("2025-08-29"), // 건물과 동일
        landAcquisitionPrice: undefined,
        buildingAcquisitionPrice: undefined,
        acquisitionPrice: 250_000_000,
      }),
    );
    expect(r).toBeNull();
  });

  it("r-2 별개취득 + legacy expenses 총액 + 파트 자본적지출 미입력 → 차단", () => {
    expect(() => calcSplitGain(caseA({ expenses: 30_000_000 }))).toThrow(/개별공시지가/);
  });
});

/**
 * 다건 집계 — 계산 오류에 자산 번호를 붙인다.
 * `transfer-tax-aggregate.ts`의 자산 루프에는 try/catch가 없어 예외가 route까지 그대로
 * 전파되는데, 다건에서는 메시지만으로 어느 자산이 원인인지 알 수 없다.
 */
describe("다건 — 오류 메시지에 자산 번호", () => {
  it("2번째 자산이 원인이면 '자산 2'로 지목한다", async () => {
    const { calculateTransferTaxAggregate } = await import("@/lib/tax-engine/transfer-tax-aggregate");
    const { makeMockRates } = await import("../_helpers/mock-rates");
    const ok = { ...caseA(), propertyId: "A", label: "자산 A" };
    // 2번째 자산만 결함 — 취득시 기준시가 없이 환산 파트
    const bad = { ...caseA({ buildingAcqMode: "estimated" }), propertyId: "B", label: "자산 B" };
    expect(() =>
      calculateTransferTaxAggregate(
        { taxYear: 2026, annualBasicDeductionUsed: 0, properties: [ok, bad] } as never,
        makeMockRates(),
      ),
    ).toThrow(/자산 2/);
  });
});
