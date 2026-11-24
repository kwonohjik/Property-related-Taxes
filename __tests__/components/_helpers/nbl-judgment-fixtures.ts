/**
 * 비사업용 토지 결과 카드·판정 메뉴 컴포넌트 테스트용 판정 fixture — 폼 → ④ raw → 엔진 input → `judgeNonBusinessLand`.
 *
 * 메뉴 route(DB·rate limit 의존)를 부르지 않고 같은 순수 함수 체인(계산기 ⑭·메뉴 route와 같은 함수)을 직접 돌린다.
 * 세율 규칙은 `DEFAULT_NON_BUSINESS_LAND_RULES`(route의 `loadJudgmentRateMap` 결과와 같은 기본값).
 */
import { buildNblEngineInput, buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandJudgment } from "@/lib/tax-engine/non-business-land/types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function nblLandAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetId: "asset-fixed-1",
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2021-01-01",
    acquisitionArea: "1000",
    transferArea: "1000",
    addressJibun: "서울 강남구 테스트동 1",
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherStateHistoryMode: "unchanged",
    nblOtherHasBuilding: false,
    ...over,
  } as AssetForm;
}

/** 폼(자산 + 양도일) → 엔진 판정 — 메뉴 route와 같은 체인. */
export function judgeFromAsset(over: Partial<AssetForm> = {}, transferDate = "2024-06-01"): NonBusinessLandJudgment {
  const raw = buildNonBusinessLandRaw(nblLandAsset(over), transferDate);
  if (!raw) throw new Error("fixture: raw가 만들어지지 않았습니다(지목·면적·취득일 확인)");
  const input = buildNblEngineInput(raw as Parameters<typeof buildNblEngineInput>[0]);
  if (!input) throw new Error("fixture: 엔진 input이 만들어지지 않았습니다");
  return judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
}

/** JSON 왕복 — 응답(`NextResponse.json`)과 같은 직렬화로 맞춘다(Date → ISO 문자열). */
export const jsonRound = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const GRACE_ROW = { reasonCode: "use_prohibited", anchorDate: "2022-01-01", endDate: "2022-12-31" };

/** 결과 카드 기준 마크업 케이스(PR-1) — 사업용·비사업용·부분 면적·의제·재촌·양도일 의제·유예. */
export const CARD_CASES: Record<string, { over: Partial<AssetForm>; transferDate?: string }> = {
  nonBusinessVacant: { over: {} },
  businessFarmSelf: {
    over: {
      nblLandType: "farmland", nblZoneType: "agriculture_forest", acquisitionDate: "2014-01-01", nblFarmingSelf: true,
      nblLandSigunguCode: "11680", nblLandSigunguName: "서울 강남구",
      nblBusinessUsePeriods: [{ startDate: "2014-01-02", endDate: "2023-12-31", usageType: "자경" }],
      nblResidenceHistories: [{ sigunguCode: "11680", sigunguName: "서울 강남구", startDate: "2014-01-02", endDate: "2024-06-01", hasResidentRegistration: true }],
    } as Partial<AssetForm>,
  },
  unconditionalExempt: {
    over: { nblLandType: "farmland", nblZoneType: "agriculture_forest", acquisitionCause: "inheritance", acquisitionDate: "2005-05-01", decedentAcquisitionDate: "1980-01-01" } as Partial<AssetForm>,
    transferDate: "2009-06-01",
  },
  housingArea: {
    over: { nblLandType: "housing_site", nblZoneType: "general_residential", nblHousingFootprint: "100", nblIsMetropolitanArea: "no" } as Partial<AssetForm>,
  },
  deemedAndGrace: {
    over: { nblDeemedTransferReason: "public_sale", nblDeemedTransferDate: "2024-03-01", nblGracePeriods: [GRACE_ROW] } as Partial<AssetForm>,
  },
  farmGrace: {
    over: {
      nblLandType: "farmland", nblZoneType: "residential", acquisitionDate: "2015-01-01", nblFarmingSelf: false,
      nblGracePeriods: [GRACE_ROW], nblUrbanIncorporationDate: "2022-06-01",
    } as Partial<AssetForm>,
  },
};
