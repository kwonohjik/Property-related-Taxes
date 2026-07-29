/**
 * P2b 도달 anchor — `ownershipRatio`가 **서브엔진까지 실제로 도달**하는가.
 *
 * 계획서: docs/02-design/features/transfer-fractional-lump-sum-deduction.plan.md (rev.2) §9 P2b
 * 엔진 설계: 같은 이름 .engine.design.md §2.1(타입 7종) · §6(silent fallback 판정표)
 *
 * ✅ **전건 green — P3c 착지로 완주했다.**
 *    P2b는 타입 + 호출부 전파까지만 세우고 `it.fails` 6건으로 도달 요건을 고정했으며,
 *    P3b(R1) · P3c(R2~R5)가 산출식에 지분을 적용하면서 순차로 뒤집혔다.
 *
 *    설계 §6이 "타입 미추가 → 지분 미적용 → **차단**"으로 못박은 이유가 이것이다:
 *    도달 실패와 단독소유(ratio=1)는 결과가 같아 **조용히 구분되지 않는다**.
 *    그래서 도달 요건을 실행 가능한 형태로 먼저 고정한다.
 *
 *    `it.fails`가 통과 전환 시점에 스스로 실패해 완료를 알리는 방식이 경로별로 4회 작동했다.
 *
 * 법령: 소득세법 §97②2호 가목("합계액") · 소득령 §163⑥1호·2호가목.
 * floor 순서: A 확정 — `floor(floor(std × 지분) × rate)` (계획서 §12).
 *
 * **겸용주택(`MixedUseAssetInput`)** 경로 anchor는 `fractional-lump-sum-per-part.test.ts`가 담당한다
 * (PHD 성분별 독립 — 겸용 주택분·상가분이 같은 규약을 공유).
 * **일반건물(`GeneralBuildingInput`)**은 아래 R6.
 */
import { describe, it, expect } from "vitest";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { calcRedevLandContribEstimated } from "@/lib/tax-engine/redevelopment-land-contribution";
import { calcRedevHousingContribReceiveEstimated } from "@/lib/tax-engine/redevelopment-housing-contribution";
import { calculateMultiParcelTransfer } from "@/lib/tax-engine/multi-parcel-transfer";
import { calculateCommercialBuildingValuation } from "@/lib/tax-engine/commercial-building-valuation";
import { buildGeneralBuildingAssetCards, type GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";
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

  it("✅ P3c 착지 — 지분 50% → floor(floor(120,000,001 × 0.5) × 3%)", () => {
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

  it("✅ P3c 착지 — 지분 50% → floor(floor(180,000,001 × 0.5) × 3%)", () => {
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

  it("✅ P3c 착지 — 지분 50% → 필지별 floor(floor(기준시가 × 0.5) × 3%)", () => {
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
  it("✅ P3c 착지 — 지분 50% → 개산공제 합계가 지분 기준시가 기준으로 축소된다", () => {
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

// ════════════════════════════════════════════════════════════
// R6 — 일반건물(가목 토지 + 나목 건물) · 성분별 독립 (P3c)
//   토지는 §99①1호 가목(개별공시지가), 건물은 나목(국세청장 산정)으로 **별도 공시**다.
//   결합 총액 개념이 없어 잔액 흡수 대상이 아니다.
// ════════════════════════════════════════════════════════════
describe("R6: GeneralBuildingInput → 개산공제 지분 도달", () => {
  const ACQ_LAND_PER_SQM = 500_001;
  const LAND_AREA = 200;
  const ACQ_BLDG_STD = 180_000_001;
  const gb = (over: Record<string, unknown> = {}) => ({
    landArea: LAND_AREA,
    buildingArea: 300,
    buildingFootprintArea: 120,
    totalTransferPrice: 1_200_000_000,
    transferDate: new Date("2024-05-01"),
    acquisitionDate: new Date("2010-03-01"),
    transferLandPricePerSqm: 3_000_000,
    transferBuildingStdPrice: 400_000_000,
    acquisitionLandPricePerSqm: ACQ_LAND_PER_SQM,
    acquisitionBuildingStdPrice: ACQ_BLDG_STD,
    zoneType: "commercial",
    ...over,
  }) as unknown as GeneralBuildingInput;

  it("도달 전 회귀 가드 — 미전달 시 물건 전체 × 3%", () => {
    const r = buildGeneralBuildingAssetCards(gb());
    expect(r.estimatedDeduction.land).toBe(Math.floor(ACQ_LAND_PER_SQM * LAND_AREA * 0.03));
    expect(r.estimatedDeduction.building).toBe(Math.floor(ACQ_BLDG_STD * 0.03));
  });

  it("✅ P3c 착지 — 지분 50% → 토지·건물 각각 자기 기준시가 지분분으로", () => {
    const r = buildGeneralBuildingAssetCards(gb({ ownershipRatio: RATIO }));
    expect(r.estimatedDeduction.land).toBe(
      expectedDeduction(ACQ_LAND_PER_SQM * LAND_AREA, 0.03, RATIO),
    );
    expect(r.estimatedDeduction.building).toBe(
      expectedDeduction(ACQ_BLDG_STD, 0.03, RATIO),
    );
  });
});
