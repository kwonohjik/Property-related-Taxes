/**
 * anchor — §99-164-10 **산정 근거의 결과 노출**(`GeneralBuildingOutput.convertedHousing`).
 *
 * 계획서: `docs/02-design/features/gb-first-disclosure-3point-integration.plan.md` ⑦ 결과 카드
 *
 * 고정 계약:
 *   FD-13  2-way(증축 없음) 경로에서 `convertedHousing`이 실린다
 *   FD-14  **3-way(증축) 경로에도** 실린다 — 한쪽만 채우면 증축 자산에서만 근거가 사라진다
 *   FD-15  `hasFirstDisclosure`가 꺼져 있으면 `undefined` (회귀 0)
 *   FD-16  🔑 detail은 **`rawInput` 기준**이다 — override 후 값으로 재계산하면 분자가
 *          환산값으로 바뀌어 「환산주택가격 = 환산주택가격 × … ÷ …」 순환 숫자가 된다
 *   FD-17  안분 두 항의 합이 환산주택가격과 정확히 일치한다 (건물분이 잔액 흡수)
 *
 * ## 왜 FD-16이 중요한가
 *
 * `applyConvertedHousingPriceOverride`는 `acquisitionLandPricePerSqm`·
 * `acquisitionBuildingStdPrice`를 **덮어쓴다**. 그 뒤의 input으로 detail을 만들면 분자
 * (취득 당시 기준시가 합계)가 이미 환산주택가격이라, 화면이 그럴듯하지만 틀린 산식을 보여준다.
 * 값이 우연히 비슷해 눈으로는 못 잡는다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

/** landArea 100 · 단가 300,000 → 취득 토지 30,000,000 (정확히 떨어지는 값) */
const BASE: GeneralBuildingInput = {
  totalTransferPrice: 800_000_000,
  transferDate: new Date("2024-02-19"),
  acquisitionDate: new Date("1995-03-15"),
  landArea: 100,
  buildingArea: 180,
  buildingFootprintArea: 90,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 300_000,
  acquisitionBuildingStdPrice: 14_000_000,
  buildingAcquisitionCause: "purchase",
  // 비사업용토지 판정이 필수로 요구한다(미입력 시 throw) — 이 anchor의 관심사는 아니다.
  zoneType: "commercial",
  hasFirstDisclosure: true,
  firstDisclosurePrice: 100_000_000,
  firstDisclosureLandStdPrice: 28_000_000,
  firstDisclosureBuildingStdPrice: 12_000_000,
};

/**
 * 취득 30,000,000 + 14,000,000 = 44,000,000
 * 최초공시 28,000,000 + 12,000,000 = 40,000,000
 * 환산 = 100,000,000 × 44,000,000 ÷ 40,000,000 = 110,000,000
 * 토지분 = 110,000,000 × 30,000,000 ÷ 44,000,000 = 75,000,000
 */
const EXPECTED = {
  converted: 110_000_000,
  acqTotal: 44_000_000,
  firstDiscTotal: 40_000_000,
  convertedLand: 75_000_000,
  convertedBuilding: 35_000_000,
};

describe("FD-13 — 2-way 경로에서 산정 근거가 결과에 실린다", () => {
  const out = buildGeneralBuildingAssetCards(BASE);

  it("convertedHousing이 존재한다", () => {
    expect(out.convertedHousing).toBeDefined();
  });

  it("네 항과 결과가 집행기준 산식대로다", () => {
    const c = out.convertedHousing!;
    expect(c.firstDisclosurePrice).toBe(100_000_000);
    expect(c.acqTotal).toBe(EXPECTED.acqTotal);
    expect(c.firstDiscTotal).toBe(EXPECTED.firstDiscTotal);
    expect(c.converted).toBe(EXPECTED.converted);
  });

  it("FD-17: 안분 두 항의 합이 환산주택가격과 정확히 일치한다", () => {
    const c = out.convertedHousing!;
    expect(c.convertedLand).toBe(EXPECTED.convertedLand);
    expect(c.convertedBuilding).toBe(EXPECTED.convertedBuilding);
    expect(c.convertedLand + c.convertedBuilding).toBe(c.converted);
  });
});

describe("FD-16 — detail은 override **이전** 값으로 계산된다", () => {
  it("분자가 환산주택가격이 아니라 원래 취득 당시 기준시가다", () => {
    const c = buildGeneralBuildingAssetCards(BASE).convertedHousing!;
    // override 후 값으로 계산했다면 acqTotal이 110,000,000(=converted) 근처가 된다.
    expect(c.acqTotal).toBe(44_000_000);
    expect(c.acqTotal).not.toBe(EXPECTED.converted);
    // 항별로도 원본이어야 한다.
    expect(c.acqLandStd).toBe(30_000_000);
    expect(c.acqBuildingStd).toBe(14_000_000);
  });

  it("엔진이 실제로 취득 기준시가를 덮어썼음을 함께 확인한다 (전제 확증)", () => {
    const out = buildGeneralBuildingAssetCards(BASE);
    // 덮어쓰지 않았다면 FD-16은 아무것도 지키지 않는 테스트가 된다.
    // 토지 단가는 75,000,000 / 100㎡ = 750,000으로 바뀐다(원래 300,000).
    expect(out.acquisition).toBeDefined();
    expect(out.convertedHousing!.convertedLand / BASE.landArea).toBe(750_000);
    expect(BASE.acquisitionLandPricePerSqm).toBe(300_000);
  });
});

describe("FD-14 — 증축(3-way) 경로에도 실린다", () => {
  const withExtension = buildGeneralBuildingAssetCards({
    ...BASE,
    extensionInfo: {
      extensionDate: new Date("2015-06-01"),
      extensionArea: 50,
      acquisitionExtensionBuildingStdPrice: 10_000_000,
      transferExtensionBuildingStdPrice: 12_000_000,
      extensionAcquisitionCause: "purchase",
    },
  });

  it("convertedHousing이 사라지지 않는다", () => {
    expect(withExtension.convertedHousing).toBeDefined();
    expect(withExtension.convertedHousing!.converted).toBe(EXPECTED.converted);
  });
});

describe("FD-15 — 미발동 시 undefined (회귀 0)", () => {
  it("hasFirstDisclosure=false면 실리지 않는다", () => {
    const out = buildGeneralBuildingAssetCards({ ...BASE, hasFirstDisclosure: false });
    expect(out.convertedHousing).toBeUndefined();
  });

  it("분모가 0이면 실리지 않는다 (환산 불성립)", () => {
    const out = buildGeneralBuildingAssetCards({
      ...BASE,
      firstDisclosureLandStdPrice: 0,
      firstDisclosureBuildingStdPrice: 0,
    });
    expect(out.convertedHousing).toBeUndefined();
  });
});
