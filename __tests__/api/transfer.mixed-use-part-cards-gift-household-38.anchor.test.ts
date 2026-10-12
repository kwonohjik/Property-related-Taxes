/**
 * 결정 #38 후속 anchor — 겸용 **파트 카드**(주 자산이 겸용인 함께 양도·지분 묶음)의 서브엔진이 카드 item과 **같은 증여 세대 사실**로
 * §154③ 본문(주택 연면적 > 상가 · 전체 12억 이하 · 1세대1주택 비과세 성립 → 상가 부분도 주택)을 판정한다.
 *
 * 주 자산 item은 `...engineInput`이라 `giftHouseholdBasis`를 싣고, 카드마다 도는 단건 엔진은 그 값으로 §154①을 통산한다. 서브엔진이 사실을
 * 받지 않으면 「예」인데도 §154③ 본문이 불성립해 상가 카드가 상가(land/building)로 남는다 — 같은 물건이 단건 겸용(5-a-2)과 갈린다.
 * 픽스처는 E-7 파트 카드 anchor(`transfer.route.mixed-use-89-2-e7`)의 겸용 서브객체를 증여 취득으로 둔다.
 */
import { describe, it, expect } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { withIdentityHousingBuildingStd } from "../tax-engine/_helpers/mixed-use-identity-std";
import { buildMixedUseCompanionItems, MIXED_USE_PART_IDS } from "@/app/api/calc/transfer/mixed-use-part-cards";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";

const D = (s: string) => new Date(s);
const GIFT = D("2023-09-01");
const TD = D("2024-06-01");
const MIXED_USE = {
  isMixedUseHouse: true as const,
  residentialFloorArea: 60,
  nonResidentialFloorArea: 40,
  buildingFootprintArea: 50,
  totalLandArea: 100,
  landAcquisitionDate: "2023-09-01",
  buildingAcquisitionDate: "2023-09-01",
  transferStandardPrice: { housingPrice: 300_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 2_000_000 },
  acquisitionStandardPrice: { housingPrice: 150_000_000, commercialBuildingPrice: 50_000_000, landPricePerSqm: 1_000_000 },
  residencePeriodYears: 0,
  zoneType: "general_residential" as const,
  isOneHouseExempt: true,
  isMetropolitanArea: true,
};
const basis = (continuousSameHousehold: boolean): GiftHouseholdBasis => ({
  giftDate: GIFT,
  donorAcquisitionDate: D("2000-01-01"),
  continuousSameHousehold,
  householdHoldingStartDate: continuousSameHousehold ? D("2000-01-01") : undefined,
});

function cards(giftHouseholdBasis: GiftHouseholdBasis | undefined) {
  return buildMixedUseCompanionItems(
    withIdentityHousingBuildingStd(MIXED_USE) as never,
    {
      propertyId: "primary",
      propertyLabel: "자산 1",
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      expenses: 0,
      transferDate: TD,
      acquisitionDate: GIFT,
      acquisitionCause: "gift",
      giftHouseholdBasis,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      useEstimatedAcquisition: false,
      isNonBusinessLand: false,
      reductions: [],
    } as never,
    {
      transferDate: TD,
      mixedUseCtx: { rates: makeMockRates(), globals: {} as never },
      primaryEngineInput: { householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false },
    },
    { ownershipRatio: undefined, isUnregistered: false, totalPropertyTransferPrice: undefined, assetId: "primary", assetLabel: "자산 1", allocatedSalePrice: 1_000_000_000 },
  );
}
const commTypes = (cs: { propertyId: string; propertyType: string }[]) =>
  cs
    .filter((c) => c.propertyId.startsWith(MIXED_USE_PART_IDS.commercialLand) || c.propertyId.startsWith(MIXED_USE_PART_IDS.commercialBuilding))
    .map((c) => c.propertyType);

describe("겸용 파트 카드 — 서브엔진 §154③ 본문이 카드 item의 증여 세대 사실을 본다", () => {
  it("[MP-1] 같은 세대(시작일 2000) → §154① 통산 성립 → §154③ 본문 → 상가 카드도 주택 카드 · 카드 item에 같은 사실이 실린다", () => {
    const cs = cards(basis(true));
    expect(commTypes(cs)).toEqual(["housing", "housing"]);
    expect(cs.every((c) => (c as { giftHouseholdBasis?: GiftHouseholdBasis }).giftHouseholdBasis?.continuousSameHousehold === true)).toBe(true);
  });
  it("[MP-2] 별도세대 · 미전달(함께 양도하는 겸용) → 증여일 기산 → 본문 불성립 → 상가 카드는 land/building(짝)", () => {
    expect(commTypes(cards(basis(false)))).toEqual(["land", "building"]);
    expect(commTypes(cards(undefined))).toEqual(["land", "building"]);
  });
});
