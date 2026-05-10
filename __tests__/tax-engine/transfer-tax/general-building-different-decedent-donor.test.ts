/**
 * 다른 피상속인/증여자 분리 필드 — 건물 전용 보조 필드 우선순위 검증
 *
 * #6(같은 피상속인 가정)과 #7-a(같은 증여자 가정) 이후 드문 케이스 지원:
 * 토지와 건물이 서로 다른 피상속인(또는 증여자)으로부터 취득된 경우.
 *
 * 비파괴 확장:
 *  - 신규: buildingDecedentAcquisitionDate / buildingDonorAcquisitionDate
 *  - 우선순위: 건물 전용 분리 필드 > 자산-수준 단일 필드 fallback
 *  - 미입력 시 #6 / #7-a 동작 보존
 *
 * 카드 패스 검증만 anchor — 비교과세나 단기보유 분기는 단건 엔진 모듈 책임.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";

// ============================================================
// 잠금 입력값 (사례 32 베이스 + 분리 필드)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const INHERITANCE_START_DATE = new Date("2008-03-17"); // 상속개시일
const TOTAL_TRANSFER_PRICE = 1_620_000_000;

const COMMON_INPUT = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  acquisitionDate: INHERITANCE_START_DATE,
  buildingAcquisitionDate: INHERITANCE_START_DATE,
  landArea: 205,
  buildingArea: 271.28,
  buildingFootprintArea: 135.64,
  transferLandPricePerSqm: 5_514_000,
  transferBuildingStdPrice: 259_072_400,
  acquisitionLandPricePerSqm: 3_920_000,
  acquisitionBuildingStdPrice: 228_146_480,
  zoneType: "general_residential",
  isMetropolitan: true,
};

// ============================================================
// Group 1 — 분리 시나리오: 토지 decedent 1985 / 건물 decedent 2010
// ============================================================

describe("다른 피상속인: 토지·건물 별도 decedent 시점", () => {
  const out = buildGeneralBuildingAssetCards({
    ...COMMON_INPUT,
    landAcquisitionCause: "inheritance" as const,
    buildingAcquisitionCause: "inheritance" as const,
    decedentAcquisitionDate: new Date("1985-01-01"),         // 토지용
    buildingDecedentAcquisitionDate: new Date("2010-06-15"), // 건물 분리 필드 (우선)
  });
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #1 — 토지 카드 decedentAcquisitionDate = 1985-01-01 (자산-수준 단일)", () => {
    expect(landCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1985-01-01");
  });
  it("anchor #2 — 건물 카드 decedentAcquisitionDate = 2010-06-15 (분리 필드 우선)", () => {
    expect(buildingCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("2010-06-15");
  });
  it("anchor #3 — 토지·건물 decedent 값이 다름 (분리 작동 확인)", () => {
    const landDate = landCard?.decedentAcquisitionDate?.toISOString().slice(0, 10);
    const buildingDate = buildingCard?.decedentAcquisitionDate?.toISOString().slice(0, 10);
    expect(landDate).not.toBe(buildingDate);
  });
});

// ============================================================
// Group 2 — fallback: building 분리 미입력 시 #6 호환 동작
// ============================================================

describe("같은 피상속인 fallback (#6 호환): building 분리 필드 미입력", () => {
  const out = buildGeneralBuildingAssetCards({
    ...COMMON_INPUT,
    landAcquisitionCause: "inheritance" as const,
    buildingAcquisitionCause: "inheritance" as const,
    decedentAcquisitionDate: new Date("1995-06-15"),
    // buildingDecedentAcquisitionDate 미입력
  });
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #4 — 토지·건물 모두 1995-06-15 (자산-수준 단일 fallback)", () => {
    expect(landCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
    expect(buildingCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });
});

// ============================================================
// Group 3 — 분리 시나리오 gift: 토지 donor 2000 / 건물 donor 2015
// ============================================================

describe("다른 증여자: 토지·건물 별도 donor 시점", () => {
  const out = buildGeneralBuildingAssetCards({
    ...COMMON_INPUT,
    landAcquisitionCause: "gift" as const,
    buildingAcquisitionCause: "gift" as const,
    donorAcquisitionDate: new Date("2000-04-20"),         // 토지용
    buildingDonorAcquisitionDate: new Date("2015-11-30"), // 건물 분리 필드 (우선)
  });
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #5 — 토지 카드 donorAcquisitionDate = 2000-04-20", () => {
    expect(landCard?.donorAcquisitionDate?.toISOString().slice(0, 10)).toBe("2000-04-20");
  });
  it("anchor #6 — 건물 카드 donorAcquisitionDate = 2015-11-30 (분리 필드 우선)", () => {
    expect(buildingCard?.donorAcquisitionDate?.toISOString().slice(0, 10)).toBe("2015-11-30");
  });
});

// ============================================================
// Group 4 — fallback gift: building 분리 미입력 시 #7-a 호환
// ============================================================

describe("같은 증여자 fallback (#7-a 호환): building 분리 필드 미입력", () => {
  const out = buildGeneralBuildingAssetCards({
    ...COMMON_INPUT,
    landAcquisitionCause: "gift" as const,
    buildingAcquisitionCause: "gift" as const,
    donorAcquisitionDate: new Date("1995-06-15"),
    // buildingDonorAcquisitionDate 미입력
  });
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #7 — 토지·건물 모두 1995-06-15 (단일 donor fallback)", () => {
    expect(landCard?.donorAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
    expect(buildingCard?.donorAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });
});

// ============================================================
// Group 5 — 교차 케이스: 토지 inheritance / 건물 gift (cause 자체가 다름)
// ============================================================

describe("교차 케이스: 토지 상속 / 건물 증여 (acquisitionCause 분리)", () => {
  const out = buildGeneralBuildingAssetCards({
    ...COMMON_INPUT,
    landAcquisitionCause: "inheritance" as const,
    buildingAcquisitionCause: "gift" as const,
    decedentAcquisitionDate: new Date("1990-05-10"),        // 토지 inheritance용
    buildingDonorAcquisitionDate: new Date("2012-08-22"),   // 건물 gift용 분리
  });
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #8 — 토지 카드 decedentAcquisitionDate 설정, donor 미설정", () => {
    expect(landCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1990-05-10");
    expect(landCard?.donorAcquisitionDate).toBeUndefined();
  });
  it("anchor #9 — 건물 카드 donorAcquisitionDate 설정, decedent 미설정", () => {
    expect(buildingCard?.donorAcquisitionDate?.toISOString().slice(0, 10)).toBe("2012-08-22");
    expect(buildingCard?.decedentAcquisitionDate).toBeUndefined();
  });
});
