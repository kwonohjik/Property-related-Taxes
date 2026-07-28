/**
 * P2b 도달 anchor — `ownershipRatio`가 **서브엔진까지 실제로 도달**하는가.
 *
 * 계획서: docs/02-design/features/transfer-fractional-lump-sum-deduction.plan.md (rev.2) §9 P2b
 * 엔진 설계: 같은 이름 .engine.design.md §2.1(타입 7종) · §6(silent fallback 판정표)
 *
 * ⚠️ **이 파일의 `it.fails` 6건은 현재 의도적으로 실패한다.**
 *    P2b는 **타입 + 호출부 전파**까지만 착지시켰다 — 각 서브엔진의 개산공제 산출 지점은
 *    아직 지분율을 쓰지 않는다(P3a·P3b·P3c). 따라서 값은 종전 그대로다.
 *
 *    설계 §6이 "타입 미추가 → 지분 미적용 → **차단**"으로 못박은 이유가 이것이다:
 *    도달 실패와 단독소유(ratio=1)는 결과가 같아 **조용히 구분되지 않는다**.
 *    그래서 도달 요건을 실행 가능한 형태로 먼저 고정한다.
 *
 *    **P3가 착지하면 이 6건이 통과하기 시작해 `it.fails`가 오히려 실패한다** —
 *    그때 `it.fails` → `it`로 바꾸는 것이 경로별 완료 신호다.
 *
 * 법령: 소득세법 §97②2호 가목("합계액") · 소득령 §163⑥1호·2호가목.
 * floor 순서: A 확정 — `floor(floor(std × 지분) × rate)` (계획서 §12).
 *
 * **미포함 2경로 (P3c에서 anchor 신설)**: 일반건물(`GeneralBuildingInput`) ·
 * 겸용주택(`MixedUseAssetInput`). 두 경로는 입력 fixture가 커서 P3c의 실제 적용 anchor와
 * 함께 세우는 편이 중복이 없다. **타입·호출부 전파는 P2b에서 이미 완료**했다
 * (`general-building-route-helper.ts` `dispatchGeneralBuilding` 신규 인자 · `route.ts` mixedAsset 주입).
 */
import { describe, it, expect } from "vitest";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { calcRedevLandContribEstimated } from "@/lib/tax-engine/redevelopment-land-contribution";
import { calcRedevHousingContribReceiveEstimated } from "@/lib/tax-engine/redevelopment-housing-contribution";
import { calculateMultiParcelTransfer } from "@/lib/tax-engine/multi-parcel-transfer";
import { calculateCommercialBuildingValuation } from "@/lib/tax-engine/commercial-building-valuation";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_LAND_HOUSING_AT_ACQ,
  PHD_BLDG_HOUSING_AT_ACQ,
  PHD_LAND_LUMP_DED,
} from "./_helpers/pre-housing-disclosure-fixture";
import { CB_VALUATION_INPUT_C01, TRANSFER_PRICE as CB_TRANSFER_PRICE } from "./_helpers/case-29-fixtures";

const RATIO = 0.5;

/** 확정 산식(A) — 지분 기준시가를 먼저 확정한 뒤 율 적용 */
const expectedDeduction = (std: number, rate: number, ratio: number) =>
  Math.floor(Math.floor(std * ratio) * rate);

// ════════════════════════════════════════════════════════════
// R1 — PHD(개별주택가격 미공시 취득) · 소득령 §164⑤ + §163⑥2호가목
// ════════════════════════════════════════════════════════════
describe("R1: PreHousingDisclosureInput → 개산공제 지분 도달", () => {
  it("도달 전 회귀 가드 — ownershipRatio 미전달 시 종전 값 불변", () => {
    const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, PHD_INPUT);
    expect(r.landLumpDeduction).toBe(PHD_LAND_LUMP_DED);
  });

  it("✅ P3b 착지 — 지분 50% → 토지분 개산공제 = floor(floor(토지 라목가액 × 0.5) × 3%)", () => {
    const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, {
      ...PHD_INPUT,
      ownershipRatio: RATIO,
    });
    expect(r.landLumpDeduction).toBe(
      expectedDeduction(PHD_LAND_HOUSING_AT_ACQ, 0.03, RATIO),
    );
  });

  // ⚠️ 이 자리에 있던 「토지분 + 건물분 = 라목총액 기준 (잔액 흡수)」 anchor는 **폐기됐다**.
  //    §166⑥·§163⑥에 결합총액 기준 단일 법정액을 강제하는 문언이 없고, 실제 구현했더니
  //    Excel 정본(D-7-2)과 1원 어긋나 14건이 깨졌다(2026-07-28). 성분별 독립이 정본이다.
  it("✅ P3b 착지 — 건물분도 자기 안분 기준시가로 독립 산출된다", () => {
    const r = calcPreHousingDisclosureGain(PHD_TRANSFER_PRICE, {
      ...PHD_INPUT,
      ownershipRatio: RATIO,
    });
    expect(r.buildingLumpDeduction).toBe(
      expectedDeduction(PHD_BLDG_HOUSING_AT_ACQ, 0.03, RATIO),
    );
  });
});

// ════════════════════════════════════════════════════════════
// R2 — 재개발 토지 무상귀속 환산 · 소득령 §166③ + §163⑥1호
// ════════════════════════════════════════════════════════════
describe("R2: RedevLandContribInput → 개산공제 지분 도달", () => {
  const mk = (over: Record<string, unknown> = {}) => ({
    acquisitionDate: new Date("2005-03-10"),
    approvalDate: new Date("2018-06-20"),
    rightsValue: 400_000_000,
    transferPrice: 900_000_000,
    settlementPaid: 50_000_000,
    landStdPriceAtAcq: 120_000_001, // 홀수 — floor 편차 유도
    landStdPriceAtApproval: 300_000_000,
    postApprovalExpenses: 0,
    ...over,
  });

  it("도달 전 회귀 가드 — 미전달 시 물건 전체 × 3%", () => {
    const r = calcRedevLandContribEstimated(mk());
    expect(r.estimatedDeduction).toBe(Math.floor(120_000_001 * 0.03));
  });

  it.fails("🔴 지분 50% → floor(floor(120,000,001 × 0.5) × 3%)", () => {
    const r = calcRedevLandContribEstimated(mk({ ownershipRatio: RATIO }));
    expect(r.estimatedDeduction).toBe(expectedDeduction(120_000_001, 0.03, RATIO));
  });
});

// ════════════════════════════════════════════════════════════
// R3 — 재개발 주택 출자 + 청산금 수령 환산 · 소득령 §166③ + §163⑥2호가목
// ════════════════════════════════════════════════════════════
describe("R3: RedevHousingContribReceiveEstimatedInput → 개산공제 지분 도달", () => {
  const mk = (over: Record<string, unknown> = {}) => ({
    acquisitionDate: new Date("2004-08-01"),
    approvalDate: new Date("2019-03-15"),
    rightsValue: 500_000_000,
    transferPrice: 620_000_000,
    settlementReceived: 30_000_000,
    housingStdPriceAtAcq: 180_000_001,
    housingStdPriceAtApproval: 420_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    ...over,
  });

  it("도달 전 회귀 가드 — 미전달 시 물건 전체 × 3%", () => {
    const r = calcRedevHousingContribReceiveEstimated(mk());
    expect(r.estimatedDeduction).toBe(Math.floor(180_000_001 * 0.03));
  });

  it.fails("🔴 지분 50% → floor(floor(180,000,001 × 0.5) × 3%)", () => {
    const r = calcRedevHousingContribReceiveEstimated(mk({ ownershipRatio: RATIO }));
    expect(r.estimatedDeduction).toBe(expectedDeduction(180_000_001, 0.03, RATIO));
  });
});

// ════════════════════════════════════════════════════════════
// R4 — 다필지 · 필지별 독립 적용 (필지 간 합계 불변식은 존재하지 않음 — 설계 §3 E2 I1)
// ════════════════════════════════════════════════════════════
describe("R4: MultiParcelInput → 필지별 개산공제 지분 도달", () => {
  const mk = (over: Record<string, unknown> = {}) => ({
    propertyType: "land" as const,
    totalTransferPrice: 300_000_000,
    transferDate: new Date("2023-05-01"),
    parcels: [
      {
        id: "p1",
        acquisitionDate: new Date("2001-04-10"),
        acquisitionMethod: "estimated" as const,
        acquisitionArea: 300,
        transferArea: 300,
        standardPricePerSqmAtAcq: 100_001, // 300 × 100,001 = 30,000,300
        standardPricePerSqmAtTransfer: 500_000,
        isUnregistered: false,
      },
    ],
    ...over,
  });
  const STD_AT_ACQ = 300 * 100_001;

  it("도달 전 회귀 가드 — 미전달 시 필지 기준시가 전체 × 3%", () => {
    const r = calculateMultiParcelTransfer(mk());
    expect(r.parcelResults[0].estimatedDeduction).toBe(Math.floor(STD_AT_ACQ * 0.03));
  });

  it.fails("🔴 지분 50% → 필지별 floor(floor(기준시가 × 0.5) × 3%)", () => {
    const r = calculateMultiParcelTransfer(mk({ ownershipRatio: RATIO }));
    expect(r.parcelResults[0].estimatedDeduction).toBe(
      expectedDeduction(STD_AT_ACQ, 0.03, RATIO),
    );
  });
});

// ════════════════════════════════════════════════════════════
// R5 — 상가·오피스텔 환산 · 소득령 §164⑥ (총액 1곳 + 기존 잔액 흡수 구조)
// ════════════════════════════════════════════════════════════
describe("R5: CommercialBuildingValuationInput → 개산공제 지분 도달", () => {
  it.fails("🔴 지분 50% → 개산공제 합계가 지분 기준시가 기준으로 축소된다", () => {
    const whole = calculateCommercialBuildingValuation(
      CB_VALUATION_INPUT_C01,
      CB_TRANSFER_PRICE,
    );
    const half = calculateCommercialBuildingValuation(
      { ...CB_VALUATION_INPUT_C01, ownershipRatio: RATIO },
      CB_TRANSFER_PRICE,
    );
    expect(half.estimatedDeductionTotal).toBeLessThan(whole.estimatedDeductionTotal);
  });

  it("토지분 + 건물분 = 합계 (기존 잔액 흡수 구조 — 지분 적용 후에도 유지되어야 함)", () => {
    const r = calculateCommercialBuildingValuation(
      { ...CB_VALUATION_INPUT_C01, ownershipRatio: RATIO },
      CB_TRANSFER_PRICE,
    );
    expect(r.estimatedDeductionLand + r.estimatedDeductionBuilding).toBe(
      r.estimatedDeductionTotal,
    );
  });
});
