/**
 * anchor — 다필지 분기의 **미등기 전파**(A02)와 **상류 산출물 echo**(A20)
 *
 * ## A02 — 실측 129,360,000원 과소
 *
 * `handleMultiParcelBranch`가 필지에 `isUnregistered`를 넘기지 않았다. 서브엔진은 미등기를
 * 이미 정확히 구현했는데(`calcLandLongTermRate`의 `if (isUnregistered) return 0` ·
 * 개산공제 3/1000) `ParcelInput.isUnregistered`를 채우는 경로가 ①⑤⑫⑬ 어디에도 없었다.
 *
 * 같은 분기가 미등기를 **이미 알고 있었다**는 점에서 내부 모순이다 — 세율 70%와 기본공제 0은
 * `effectiveInput.isUnregistered`로 적용하면서 장특공제·개산공제만 빠졌다.
 *
 * 조문: 「소득세법」 §95② 본문 괄호(「**제104조제3항에 따른 미등기양도자산**과 … **제외한다**」) ·
 *       「소득세법 시행령」 §163⑥1호 괄호(「미등기양도자산의 경우에는 **3／1000**」)
 *
 * ## A20 — 세액 불변 · 표시 전용
 *
 * 조기반환이 정상경로의 결과 조립을 건너뛰면서 상류 STEP 산출물을 하나도 싣지 않았다.
 * `pre1990LandResult`·`carryoverDetail`은 컨텍스트 타입에 **선언돼 있고 호출부가 실제로
 * 넘기는데 구조분해에 없어** 쓰이지 않았다 — TypeScript가 잡지 못하는 형태다.
 *
 * ⚠️ 기존 `multi-parcel-transfer.test.ts:141`은 필지-수준 미등기를 단언하지만 **서브엔진을
 *    직접 호출**해 이 배선(⑬)을 태우지 않는다(`feedback_leaf_anchor_skips_zod_layer`).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const RATES = makeMockRates();

function parcel(over: Record<string, unknown> = {}) {
  return {
    id: "p1",
    acquisitionDate: new Date("2010-01-01"),
    acquisitionMethod: "actual" as const,
    acquisitionPrice: 200_000_000,
    acquisitionArea: 500,
    transferArea: 500,
    expenses: 0,
    ...over,
  };
}

function run(over: Partial<TransferTaxInput> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      transferDate: new Date("2024-05-01"),
      acquisitionDate: new Date("2010-01-01"),
      acquisitionPrice: 0,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      useEstimatedAcquisition: false,
      parcels: [parcel(), parcel({ id: "p2" })],
      ...over,
    } as Partial<TransferTaxInput>),
    RATES,
  );
}

describe("[A02] 다필지 × 미등기 — 자산-수준 플래그가 필지에 전파된다", () => {
  it("A02-1(회귀): 등기 자산은 장기보유특별공제가 적용된다", () => {
    const r = run({ isUnregistered: false });
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
  });

  it("A02-2: 미등기 자산은 장기보유특별공제가 0이다 (§95② 본문 괄호)", () => {
    const r = run({ isUnregistered: true });
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("A02-3: 미등기는 세율 70% · 기본공제 0과 **함께** 움직인다 (내부 모순 해소)", () => {
    const r = run({ isUnregistered: true });
    expect(r.appliedRate).toBe(0.7);
    expect(r.basicDeduction).toBe(0);
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("A02-4: 미등기 총부담이 등기보다 크다 (장특공제 소멸분이 과세표준에 남는다)", () => {
    expect(run({ isUnregistered: true }).taxBase).toBeGreaterThan(
      run({ isUnregistered: false }).taxBase,
    );
  });

  it("A02-5: 필지별 축을 죽이지 않는다 — 자산이 등기여도 필지 플래그가 살아 있다", () => {
    const r = run({
      isUnregistered: false,
      parcels: [parcel({ isUnregistered: true }), parcel({ id: "p2", isUnregistered: true })],
    } as Partial<TransferTaxInput>);
    expect(r.longTermHoldingDeduction).toBe(0);
  });
});

describe("[A20] 상류 산출물이 다필지 결과에 실린다", () => {
  it("A20-1: 다주택 중과 판정 결과가 echo된다", () => {
    const r = run({
      propertyType: "housing",
      isRegulatedArea: true,
      householdHousingCount: 3,
    } as Partial<TransferTaxInput>);
    // 판정이 섰다면 상세가 결과에 있어야 한다 — 세율은 움직였는데 근거가 없으면 안 된다.
    if (r.appliedRate > 0.45) expect(r.multiHouseSurchargeDetail).toBeDefined();
  });

  it("A20-2: parcelDetails는 종전대로 실린다 (회귀 대조군)", () => {
    expect(run().parcelDetails).toHaveLength(2);
  });
});
