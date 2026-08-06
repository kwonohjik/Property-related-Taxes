/**
 * Pre-Do anchor — §100③ 가드의 **엔진 통합** (Phase 1-C · U-8)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §3.2 · §12.4 · §12.10
 * 이 파일은 **구현 전에** 작성돼 현행에서 실패한다(정책 `feedback_pre_anchor_verification`).
 *
 * 1-A(`judgeDeemedUnclearSplit`)·1-B(`resolveSaleApportionBasis`)는 순수 함수만 만들었고
 * **어느 계산 경로에도 연결되지 않았다**. 1-C가 그 둘을 `calcSplitGain`에 배선한다 ⇒ 여기서
 * **처음으로 세액이 바뀐다**.
 *
 * ## 조문
 *
 * 「소득세법」 제100조 제3항: 구분 기장한 가액이 안분계산한 가액과 **100분의 30 이상 차이**가
 * 있으면 가액 구분이 **불분명한 때로 본다**(⇒ 같은 조 제2항에 따라 안분값을 적용). 단서의 예외는
 * 「소득세법 시행령」 제166조 제8항 1호·2호.
 *
 * ## fixture — 계획서 §3.2 probe (원단위 실측 재현)
 *
 * 주택 · 양도 2024-06-01 15억 · **토지 취득 2014-06-01 / 건물 취득 2016-06-01**(보유기간 상이) ·
 * 취득가액 파트 4억 + 4억(둘 다 실가) · 양도시 기준시가 토지 9억 / 건물 6억
 * ⇒ **안분값 = 토지 9억 / 건물 6억**.
 *
 * 적정범위(개구간): 토지 (6.3억, 11.7억) · 건물 (4.2억, 7.8억). 합이 15억으로 묶여 있으므로
 * 실효 범위는 **토지 (7.2억, 10.8억)** 이다 — 작은 파트(건물)가 실질 제약이다(§11.3).
 *
 * | 신고 방식 | 토지/건물 | 현행 세액 | 가드 도입 후 |
 * |---|---|---|---|
 * | 일괄(안분) | 9억 / 6억 | 228,195,000 | 228,195,000 (불변) |
 * | 구분 · 범위 안 | 10억 / 5억 | 226,347,000 | 226,347,000 (불변) |
 * | 구분 · 토지 몰아주기 | 14억 / 1억 | 199,551,000 | **228,195,000** |
 * | 구분 · 건물 몰아주기 | 1억 / 14억 | 218,031,000 | **228,195,000** |
 * | 구분 · 건물 정확히 −30% | 10.8억 / 4.2억 | 224,868,600 | **228,195,000** |
 * | 구분 · 1원 안쪽 | 1,079,999,999 / 420,000,001 | 224,868,600 | 224,868,600 (불변) |
 *
 * 🔴 마지막 두 fixture는 **현행에서 세액이 같다**(224,868,600 — 과세표준 절사가 1원을 흡수한다).
 *    가드 도입 후 **갈라지는 것**이 경계가 정확히 30%에서 물린다는 증거다.
 *
 * ## 고정 계약
 *   U-8-1  발동 시 세액이 **안분 결과와 일치**한다
 *   U-8-2  범위 안 구분값은 **그대로 쓴다** — 가드가 과잉 발동하지 않는다
 *   U-8-3  경계 — 정확히 30%는 발동 · 1원 안쪽은 미발동
 *   U-8-4  한쪽만 입력해 **잔액으로 도출된 파트도 판정 대상**이다
 *   U-8-5  §166⑧ 예외를 선택하면 발동하지 않는다
 *   U-8-6  판정 결과가 `splitDetail.saleSplitJudgment`에 실린다(표시 계층이 읽을 값 — 1-E U-9)
 *   U-8-7  ⏳ 안분 basis가 없으면 **1-C에서는 판정하지 않는다** — 1-D에서 필수화되면 갱신된다
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 안분값 = 토지 9억 / 건물 6억 (양도시 기준시가 9억 : 6억 비율 × 총액 15억) */
const APPORTIONED = { land: 900_000_000, building: 600_000_000 };
/** 일괄양도(안분) 세액 — 발동 시 이 값으로 되돌아와야 한다 */
const TAX_APPORTIONED = 228_195_000;

const mk = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2016-06-01"), // 건물
    landAcquisitionDate: new Date("2014-06-01"), // 토지 — 2년 먼저 취득(장특공제가 갈린다)
    acquisitionPrice: 0,
    landAcquisitionPrice: 400_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    landStandardPriceAtTransfer: 900_000_000,
    buildingStandardPriceAtTransfer: 600_000_000,
    isOneHousehold: false,
    householdHousingCount: 1,
    isRegulatedArea: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    ...over,
  });

const taxOf = (over: Partial<TransferTaxInput> = {}) => calculateTransferTax(mk(over), rates).totalTax;
const splitOf = (over: Partial<TransferTaxInput> = {}) => calculateTransferTax(mk(over), rates).splitDetail;

describe("U-8-1 — 발동 시 세액이 안분 결과와 일치한다", () => {
  it("일괄양도(안분)의 기준값을 먼저 고정한다", () => {
    const r = calculateTransferTax(mk(), rates);
    expect(r.splitDetail!.land.transferPrice).toBe(APPORTIONED.land);
    expect(r.splitDetail!.building.transferPrice).toBe(APPORTIONED.building);
    expect(r.totalTax).toBe(TAX_APPORTIONED);
  });

  it("🔴 토지 몰아주기(14억/1억) — 199,551,000 → 안분값으로 되돌아온다", () => {
    const over = { landTransferPrice: 1_400_000_000, buildingTransferPrice: 100_000_000 };
    expect(splitOf(over)!.land.transferPrice).toBe(APPORTIONED.land);
    expect(splitOf(over)!.building.transferPrice).toBe(APPORTIONED.building);
    expect(taxOf(over)).toBe(TAX_APPORTIONED);
  });

  it("🔴 건물 몰아주기(1억/14억) — 218,031,000 → 안분값으로 되돌아온다", () => {
    const over = { landTransferPrice: 100_000_000, buildingTransferPrice: 1_400_000_000 };
    expect(taxOf(over)).toBe(TAX_APPORTIONED);
  });

  it("구분값이 안분값과 같으면 아무 일도 일어나지 않는다 (일관성)", () => {
    expect(taxOf({ landTransferPrice: 900_000_000, buildingTransferPrice: 600_000_000 })).toBe(
      TAX_APPORTIONED,
    );
  });
});

describe("U-8-2 — 범위 안 구분값은 그대로 쓴다 (과잉 발동 금지)", () => {
  it("토지 10억 / 건물 5억 — 이탈 11.1% · 16.7% → 구분값 유지", () => {
    const over = { landTransferPrice: 1_000_000_000, buildingTransferPrice: 500_000_000 };
    expect(splitOf(over)!.land.transferPrice).toBe(1_000_000_000);
    expect(taxOf(over)).toBe(226_347_000);
    // 안분 세액과 **달라야** 한다 — 같아지면 가드가 과잉 발동한 것이다.
    expect(taxOf(over)).not.toBe(TAX_APPORTIONED);
  });
});

describe("U-8-3 — 경계는 「이상」이다", () => {
  /**
   * 두 fixture는 **현행에서 세액이 같다**(224,868,600). 가드가 붙으면 갈라진다 —
   * 이 갈라짐이 경계가 정확히 30%에 물린다는 증거다.
   */
  it("건물이 정확히 −30%(4.2억)이면 **발동**한다", () => {
    const over = { landTransferPrice: 1_080_000_000, buildingTransferPrice: 420_000_000 };
    const d = splitOf(over)!.saleSplitJudgment!;
    expect(d.buildingOver).toBe(true);
    expect(d.buildingDeviationBp).toBe(3000); // 정확히 30.00%
    expect(d.landOver).toBe(false); // 토지는 20%
    expect(taxOf(over)).toBe(TAX_APPORTIONED);
  });

  it("1원 안쪽(건물 420,000,001)은 **미발동** — 개구간이다", () => {
    const over = { landTransferPrice: 1_079_999_999, buildingTransferPrice: 420_000_001 };
    expect(splitOf(over)!.saleSplitJudgment!.deemedUnclear).toBe(false);
    expect(taxOf(over)).toBe(224_868_600);
  });
});

describe("U-8-4 — 잔액으로 도출된 파트도 판정 대상이다", () => {
  /**
   * 실무 자료 「실수유형」이 지적한 함정: 한쪽만 검증하고 나머지를 차액으로 결정하면 놓친다.
   * 토지만 14억을 입력해 건물이 잔액 1억으로 도출된 경우에도 건물 이탈(83.3%)을 잡아야 한다.
   */
  it("토지만 14억 입력 → 건물 잔액 1억의 이탈(83.3%)로 발동", () => {
    const over = { landTransferPrice: 1_400_000_000 };
    const d = splitOf(over)!.saleSplitJudgment!;
    expect(d.declared).toEqual({ land: 1_400_000_000, building: 100_000_000 });
    expect(d.buildingOver).toBe(true);
    expect(d.buildingDeviationBp).toBe(8333); // |1억−6억|/6억 = 83.33%
    expect(taxOf(over)).toBe(TAX_APPORTIONED);
  });

  it("건물만 1억 입력 → 토지 잔액 14억. 같은 판정이다", () => {
    expect(taxOf({ buildingTransferPrice: 100_000_000 })).toBe(TAX_APPORTIONED);
  });
});

describe("U-8-5 — §166⑧ 예외를 선택하면 발동하지 않는다", () => {
  const over = { landTransferPrice: 1_400_000_000, buildingTransferPrice: 100_000_000 };

  it("예외 없음 → 발동 (대조군)", () => {
    expect(taxOf(over)).toBe(TAX_APPORTIONED);
  });

  it("1호(다른 법령에 따라 구분) → 구분값 유지 = 199,551,000", () => {
    expect(taxOf({ ...over, saleSplitExemption: "other_law" })).toBe(199_551_000);
  });

  it("2호(철거 후 토지만 사용) → 구분값 유지", () => {
    expect(taxOf({ ...over, saleSplitExemption: "demolished_land_only" })).toBe(199_551_000);
  });

  it("예외로 면했어도 **이탈 사실은 기록**한다 — 신고서 각주 재료다", () => {
    const d = splitOf({ ...over, saleSplitExemption: "other_law" })!.saleSplitJudgment!;
    expect(d.deemedUnclear).toBe(false);
    expect(d.buildingOver).toBe(true);
    expect(d.exemptionApplied).toBe("other_law");
  });
});

describe("U-8-6 — 판정 결과가 결과에 실린다 (표시 계층 재료)", () => {
  it("구분·안분·적용 3쌍과 basis 종류를 모두 노출한다", () => {
    const d = splitOf({ landTransferPrice: 1_400_000_000, buildingTransferPrice: 100_000_000 })!
      .saleSplitJudgment!;
    expect(d.deemedUnclear).toBe(true);
    expect(d.declared).toEqual({ land: 1_400_000_000, building: 100_000_000 });
    expect(d.apportioned).toEqual(APPORTIONED);
    expect(d.applied).toEqual(APPORTIONED);
    expect(d.basisKind).toBe("std_price");
    // 표시 계층이 **그대로 읽을** 이탈률 — 재계산 금지(계획서 §12.5)
    expect(d.landDeviationBp).toBe(5555); // |14억−9억|/9억 = 55.55%
    expect(d.buildingDeviationBp).toBe(8333);
  });

  it("구분 기재가 없는 일괄양도에는 판정이 **없다** — 비교 대상이 없다", () => {
    expect(splitOf()!.saleSplitJudgment).toBeUndefined();
  });
});

describe("U-8-7 — ⏳ 안분 basis가 없으면 1-C에서는 판정하지 않는다", () => {
  /**
   * ⚠️ **한시 계약이다.** 30% 판정은 안분값을 요구하고, 안분값은 양도시 기준시가(또는 감정가액)에서
   * 나온다. 현행 UI는 구분양도 + 둘 다 실가 조합에서 기준시가 칸을 열지 않으므로
   * (`saleStdPlacement` — `lib/calc/transfer-tax-split-acq-mode.ts`), 지금 필수화하면 fixture
   * 최대 26건이 함께 깨진다. 1-D가 그 축을 정리한다.
   *
   * 계획서 §12.7은 「기준시가 없으면 판정 건너뛰기」를 **영구 설계로는 채택하지 않는다**고
   * 확정했다 — 칸을 비워 우회할 수 있으면 가드가 아니다. ⇒ **1-D에서 이 anchor는 「차단」으로
   * 갱신된다.** 그때 이 describe를 지우지 말고 계약을 뒤집을 것.
   */
  it("양도시 기준시가 미입력 + 30% 초과 구분 → 판정 없이 구분값 그대로", () => {
    const over: Partial<TransferTaxInput> = {
      landStandardPriceAtTransfer: undefined,
      buildingStandardPriceAtTransfer: undefined,
      landTransferPrice: 1_400_000_000,
      buildingTransferPrice: 100_000_000,
    };
    expect(splitOf(over)!.saleSplitJudgment).toBeUndefined();
    expect(taxOf(over)).toBe(199_551_000);
  });
});
