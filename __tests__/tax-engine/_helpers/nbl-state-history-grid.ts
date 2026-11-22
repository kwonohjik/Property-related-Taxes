/**
 * NBL-STATE-HISTORY-E0 공용 격자 — Anchor 2(골든 스냅샷)·Anchor 3(고지)가 같은 대표 입력을 쓴다.
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.plan.md §4 E0 · 엔진 계획서 §7.2
 */
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { GracePeriod, NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";

export const d = (s: string) => new Date(`${s}T00:00:00Z`);
const grace = (start: string, end: string): GracePeriod => ({ reasonCode: "use_prohibited", startDate: d(start), endDate: d(end) });

type OL = NonNullable<NonBusinessLandInput["otherLand"]>;

/** 기타토지(잡종지) 1,000㎡ · 2014-01-01 → 2024-01-01(소유 3,651일) 기준 입력. */
function other(ol: Partial<OL> = {}, over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 1000,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: { propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, ...ol },
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

/** 건축물 있음 + 시가표준액 2% 이상(나대지 간주 회피) — 일반주거 4배 · 바닥면적 100㎡ → 허용 400㎡. */
const BUILT: Partial<OL> = { hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 100_000_000, landStandardValue: 200_000_000 };

const REVENUE = { businessType: "parking_operation", currentRevenue: 20_000_000, currentLandValue: 100_000_000 };

/** 대표 입력 격자 — 사업용·비사업용·부분 면적·DM-01·유예·의제양도일·3호·축 B 지분·타 지목. */
export const GRID: Record<string, NonBusinessLandInput> = {
  "G01 나대지·종합합산 → 전량 비사업용(253,960,000)": other(),
  "G02 나대지·별도합산 + 공지상태 근거 → 전량 사업용(198,210,000)": other({ propertyTaxType: "separate", propertyTaxBasis: "vacant_state" }),
  "G03 건축물·별도합산 배율 이내(400㎡) → 사업용": other(BUILT, { landArea: 400, otherLand: { propertyTaxType: "separate", isRelatedToResidenceOrBusiness: false, ...BUILT } as OL }),
  "G04 건축물·별도합산 배율 초과(1,000㎡) → 부분 면적": other({ propertyTaxType: "separate", ...BUILT }),
  "G05 건축물·분리과세 → 사업용": other({ propertyTaxType: "special_sum", ...BUILT }),
  "G06 건축물·비과세·면제 → 사업용": other({ propertyTaxType: "exempt", ...BUILT }),
  "G07 건축물·종합합산 2% 미달 바닥면적분 별도합산 유지 → 부분 면적": other({ propertyTaxType: "comprehensive", hasBuilding: true, buildingFloorArea: 100, buildingStandardValue: 1_000_000, landStandardValue: 1_000_000_000 }),
  "G08 나대지·종합합산 + 유예(사용금지 2014-01-02~2024-01-01) → 유예로 사업용": other({}, { gracePeriods: [grace("2014-01-02", "2024-01-01")] }),
  "G09 나대지·종합합산 + 유예 일부(2022-01-01~2023-01-01) → 비사업용 유지": other({}, { gracePeriods: [grace("2022-01-01", "2023-01-01")] }),
  "G10 나대지·종합합산 + 경매 의제양도일(2020-01-01) → 의제일 기준 기간기준": other({}, { deemedTransferReason: "auction", deemedTransferDate: d("2020-01-01") } as Partial<NonBusinessLandInput>),
  "G11 DM-01 수입금액비율 충족 + 당해 사업개시일 2024-03-01(양도 2024-06-30) → 비사업용": other({}, {
    transferDate: d("2024-06-30"), zoneType: "commercial", revenueTest: { ...REVENUE, currentBusinessStartDate: d("2024-03-01") },
  } as Partial<NonBusinessLandInput>),
  "G12 수입금액비율 충족 · 개시일 없음 → 전 기간 사업용": other({}, { zoneType: "commercial", revenueTest: REVENUE } as Partial<NonBusinessLandInput>),
  "G13 3호 조성 완료 2014-01-01(사업용 기간 처음 2년뿐) → 비사업용": other({ relatedBusinessType: "private_investment_land", privateInvestmentCompletionDate: d("2014-01-01") }, { zoneType: "management" }),
  "G14 3호 조성 완료 2023-06-01 · 취득 2023-06-01 → 사업용": other({ relatedBusinessType: "private_investment_land", privateInvestmentCompletionDate: d("2023-06-01") }, { zoneType: "management", acquisitionDate: d("2023-06-01") }),
  "G15 축 B 지분1(취득 2014-01-01 · 소유 3,651일) 나대지": other(),
  "G16 축 B 지분2(취득 2020-01-01 · 소유 1,460일) 나대지": other({}, { acquisitionDate: d("2020-01-01") }),
  "G17 축 B 지분3(취득 2021-06-01 · 소유 943일) 나대지": other({}, { acquisitionDate: d("2021-06-01") }),
  "G18 소유 0일(취득 2023-12-31 · 양도 2024-01-01) 나대지": other({}, { acquisitionDate: d("2023-12-31") }),
  "G19 타 지목 — 주택부수토지 배율 초과(이력 칸을 소비하지 않는다)": {
    landType: "housing_site", landArea: 200, zoneType: "general_residential", acquisitionDate: d("2014-01-01"), transferDate: d("2024-01-01"),
    housingFootprint: 20, isMetropolitanArea: false, businessUsePeriods: [], gracePeriods: [],
  } as NonBusinessLandInput,
  "G20 타 지목 — 농지 자경(이력 칸을 소비하지 않는다)": {
    landType: "farmland", landArea: 1000, zoneType: "agriculture_forest", acquisitionDate: d("2015-01-01"), transferDate: d("2024-01-01"),
    farmingSelf: true, farmerResidenceDistance: 5, businessUsePeriods: [{ startDate: d("2015-01-02"), endDate: d("2024-01-01"), useType: "자경" }], gracePeriods: [],
  } as unknown as NonBusinessLandInput,
};

/** 모드 4종 — 지금은 엔진이 `landStateHistory`를 모른다(E1 이전). 미전송 = 키 자체가 없다. */
export const MODES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ["미전송", {}],
  ['""', { landStateHistory: { mode: "", events: [] } }],
  ["unchanged", { landStateHistory: { mode: "unchanged", events: [] } }],
  ["unknown", { landStateHistory: { mode: "unknown", events: [] } }],
];

/** 같은 거래(양도 10억 · 취득 3억)의 세액 — 같은 세율 출처로 판정과 세액을 함께 고정한다. */
export function tax(nbl: NonBusinessLandInput) {
  const t = calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 300_000_000,
      acquisitionDate: nbl.acquisitionDate,
      transferDate: nbl.transferDate,
      isOneHousehold: false,
      nonBusinessLandDetails: nbl,
    }),
    makeMockRates(),
  );
  return { calculatedTax: t.calculatedTax, determinedTax: t.determinedTax, localIncomeTax: t.localIncomeTax, totalTax: t.totalTax };
}
