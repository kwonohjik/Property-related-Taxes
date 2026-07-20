/**
 * 일반건물(general_building) 상속 취득가액 엔진 정합 — §163⑨ 직접 산정 anchor.
 *
 * 버그: 일반건물을 상속(토지·건물 모두)으로 취득해 양도 시, 실거래가(actual) 경로가
 *   취득가액을 `bundledAcquisitionPrice ?? engineInput.acquisitionPrice ?? 0`(둘 다 0)에서만
 *   가져와 **취득가 0 → 양도가 전액 과세**. (route.ts:720 · api-helpers fixedAcqRaw 상속 제외)
 * 수정: 상속 시 토지·건물 각 상속개시일 평가액을 취득당시 실지거래가액으로 **직접 배정**
 *   (소득세법 시행령 §163⑨ — §166⑥ 안분 아님, KoreanLaw 검증). 개산공제 미적용(§163⑥).
 *   양도가액만 §166⑥ 안분 유지.
 *
 * Phase 1 = C1(토지·건물 모두 상속, actual 모드) 전용. 환산 경로(경로 A)의 both-inheritance는
 *   실 UI 도달 불가(validation V2 차단)이며 case-6 합성 테스트가 별도로 잠금(Phase 2 대상).
 *
 * 설계: docs/02-design/features/transfer-general-building-inheritance-acquisition.engine.design.md §5
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingActualTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

// ── 잠금 입력값 (case-6과 동일한 양도가 안분 인자 + 상속개시일 평가액 직접) ──
const TRANSFER_DATE = new Date("2023-02-19");
const INHERITANCE_START_DATE = new Date("2008-03-17"); // 상속개시일 = 토지·건물 취득일
const DECEDENT_ACQ_DATE = new Date("1995-06-15"); // 피상속인 취득일 (영 §95④)

const TOTAL_TRANSFER_PRICE = 1_620_000_000;
const LAND_AREA = 205;
const BUILDING_FOOTPRINT_AREA = 135.64;
const TRANSFER_LAND_PRICE_PER_SQM = 5_514_000;
const TRANSFER_BUILDING_STD_PRICE = 259_072_400;

const INHERITED_LAND_VALUE = 900_000_000; // 상속개시일 토지 평가액 (개별공시지가×면적 or 신고가)
const INHERITED_BUILDING_VALUE = 250_000_000; // 상속개시일 건물 신고가액

/** C1 상속 payload (actualPriceMode 경로). actualAcquisitionPrice=0 = 현행 버그 상황 재현. */
const C1_PAYLOAD = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  acquisitionDate: INHERITANCE_START_DATE,
  landArea: LAND_AREA,
  buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
  transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
  transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
  zoneType: "general_residential",
  isMetropolitan: true,
  actualAcquisitionPrice: 0, // bundledAcq 미충전 (상속은 fixedAcquisitionPrice 미채움)
  actualExpenses: 0,
  // §163⑨ 상속 취득가액 직접 산정
  acquisitionByInheritance: true,
  buildingAcquisitionByInheritance: true,
  inheritedLandValue: INHERITED_LAND_VALUE,
  inheritedBuildingValue: INHERITED_BUILDING_VALUE,
  // §95④ 단기보유 기산점
  landAcquisitionCause: "inheritance" as const,
  decedentAcquisitionDate: DECEDENT_ACQ_DATE,
};

describe("일반건물 상속 취득가액 §163⑨ 직접 산정 (Phase 1 = C1, actual 모드)", () => {
  const result = calculateGeneralBuildingActualTransfer(C1_PAYLOAD, 2023, 0, [], makeMockRates());
  const apport = result.apportionment.apportioned;
  const landAlloc = apport.find((a) => a.assetKind === "land");
  const buildingAlloc = apport.find((a) => a.assetKind === "building");
  const cards = result.aggregated.generalBuildingValuationDetail?.assetCards ?? [];
  const landCard = cards.find((c) => c.propertyType === "land");
  const buildingCard = cards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #1 — 토지 취득가액 = 상속개시일 토지 평가액 900,000,000 (환산 아님)", () => {
    expect(landAlloc?.allocatedAcquisitionPrice).toBe(INHERITED_LAND_VALUE);
  });
  it("anchor #2 — 건물 취득가액 = 상속개시일 건물 평가액 250,000,000 (환산 아님)", () => {
    expect(buildingAlloc?.allocatedAcquisitionPrice).toBe(INHERITED_BUILDING_VALUE);
  });
  it("anchor #3 — 양도가액은 §166⑥ 안분 유지 (토지 1,317,938,332)", () => {
    expect(landAlloc?.allocatedSalePrice).toBe(1_317_938_332);
  });
  it("anchor #4 — 양도가액 건물분 302,061,668 (잔액)", () => {
    expect(buildingAlloc?.allocatedSalePrice).toBe(302_061_668);
  });
  it("anchor #5 — 전 카드 개산공제 0 (§163⑨ 실지거래가액 의제 → §163⑥ 미적용)", () => {
    expect(cards.every((c) => c.estimatedDeduction === 0)).toBe(true);
  });
  it("anchor #6 — 토지 카드 취득가액 = 상속평가액 900,000,000", () => {
    expect(landCard?.acquisitionPrice).toBe(INHERITED_LAND_VALUE);
  });
  it("anchor #7 — 건물 카드 취득가액 = 상속평가액 250,000,000", () => {
    expect(buildingCard?.acquisitionPrice).toBe(INHERITED_BUILDING_VALUE);
  });
  it("anchor #8 — §95④ 토지 카드 landAcquisitionCause='inheritance' + 피상속인 취득일", () => {
    expect(landCard?.landAcquisitionCause).toBe("inheritance");
    expect(landCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });
  it("anchor #9 — §95④ 건물 카드 buildingAcquisitionCause='inheritance' + 피상속인 취득일", () => {
    expect(buildingCard?.buildingAcquisitionCause).toBe("inheritance");
    expect(buildingCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });
  it("anchor #10 — 결과 echo: acquisitionByInheritance·buildingAcquisitionByInheritance", () => {
    const detail = result.aggregated.generalBuildingValuationDetail;
    expect(detail?.acquisitionByInheritance).toBe(true);
    expect(detail?.buildingAcquisitionByInheritance).toBe(true);
  });
});

describe("일반건물 상속 — 현행 버그 대비 (게이트 없으면 취득가 0)", () => {
  // 상속 게이트 미설정 = 현행 동작: actualAcquisitionPrice=0 안분 → 취득가 0 (양도가 전액 과세).
  const buggyPayload = {
    ...C1_PAYLOAD,
    acquisitionByInheritance: false,
    buildingAcquisitionByInheritance: false,
  };
  const result = calculateGeneralBuildingActualTransfer(buggyPayload, 2023, 0, [], makeMockRates());
  const apport = result.apportionment.apportioned;

  it("현행 회귀 — 게이트 OFF 시 토지·건물 취득가 0 (버그 baseline)", () => {
    const landAlloc = apport.find((a) => a.assetKind === "land");
    const buildingAlloc = apport.find((a) => a.assetKind === "building");
    expect(landAlloc?.allocatedAcquisitionPrice).toBe(0);
    expect(buildingAlloc?.allocatedAcquisitionPrice).toBe(0);
  });
});
