/**
 * 비사업용 토지 판정 메뉴 anchor 공용 harness — 계산기 폼 → ④ 본문 → (계산기 route | 메뉴 route).
 *
 * 계획서: docs/01-plan/features/nbl-judgment-menu.engine.plan.md §6 (A-1~A-7 · M-1~M-7).
 * ⚠️ `vi.mock("@/lib/db/tax-rates")`·`vi.mock("@/lib/api/rate-limit")`은 vitest 호이스팅 때문에 **각 테스트 파일에서** 선언한다.
 */
import { NextRequest } from "next/server";
import { POST as POST_MENU } from "@/app/api/calc/non-business-land-judgment/route";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 토지 1건 + 정밀판정 ON 폼. 취득 2021-01-01 · 양도 2024-06-01 · 기타토지 1,000㎡ 기본(세목 구분 ‘종합합산’ · 건축물 이력 ‘변동 없음’). */
export function landForm(over: Partial<AssetForm> = {}, formOver: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  return {
    ...f,
    transferDate: "2024-06-01",
    filingDate: "2025-08-31",
    contractTotalPrice: "1000000000",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2021-01-01",
        acquisitionArea: "1000",
        transferArea: "1000",
        addressJibun: "서울 강남구 테스트동 1",
        fixedAcquisitionPrice: "300000000",
        actualSalePrice: "1000000000",
        isNonBusinessLand: true,
        nblUseDetailedJudgment: true,
        nblLandType: "other_land",
        nblZoneType: "general_residential",
        nblOtherPropertyTaxType: "comprehensive",
        nblOtherStateHistoryMode: "unchanged",
        nblOtherHasBuilding: false,
        ...over,
      } as AssetForm,
    ],
    ...formOver,
  } as TransferFormData;
}

export async function postMenu(body: unknown) {
  const res = await POST_MENU(
    new NextRequest("http://localhost/api/calc/non-business-land-judgment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as Loose;
  return { status: res.status, json, data: json?.data as Loose | undefined };
}

/** JSON 왕복 — 응답(`NextResponse.json`)과 같은 직렬화로 맞춘다(Date → ISO 문자열). */
export const jsonRound = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export interface MenuGridRow {
  id: string;
  scenario: string;
  asset: Partial<AssetForm>;
  form?: Partial<TransferFormData>;
}

const GRACE_ROW = { reasonCode: "use_prohibited", anchorDate: "2022-01-01", endDate: "2022-12-31" };

/**
 * parity 격자 — 전 6지목 · 무조건 의제 · 상속 · 수유자 · 유예 · 도시편입 · 양도일 의제 · 공동소유.
 * 각 행은 ⑧을 통과해야 한다(A-3) — 그래야 «⑧ 통과 ⇒ 메뉴 200 ∧ 계산기 NBL 경로 동일»이 한 격자로 닫힌다.
 */
export const MENU_GRID: MenuGridRow[] = [
  { id: "G1-vacant", scenario: "기타토지 나대지 3년 5개월 · 사용 없음 → 비사업용", asset: {} },
  {
    id: "G2-farm-self",
    scenario: "농지 자경 8년(재촌 거주) → 사업용",
    asset: {
      nblLandType: "farmland", nblZoneType: "agriculture_forest", acquisitionDate: "2014-01-01", nblFarmingSelf: true,
      nblLandSigunguCode: "11680", nblLandSigunguName: "서울 강남구",
      nblBusinessUsePeriods: [{ startDate: "2014-01-02", endDate: "2023-12-31", usageType: "자경" }],
      nblResidenceHistories: [{ sigunguCode: "11680", sigunguName: "서울 강남구", startDate: "2014-01-02", endDate: "2024-06-01", hasResidentRegistration: true }],
    } as Partial<AssetForm>,
  },
  {
    id: "G3-farm-rent",
    scenario: "농지 임대(자경 아님) → 비사업용",
    asset: { nblLandType: "farmland", nblZoneType: "agriculture_forest", acquisitionDate: "2014-01-01", nblFarmingSelf: false },
  },
  {
    id: "G4-farm-grace",
    scenario: "농지 + 부득이한 사유 유예(사용금지) + 도시편입일",
    asset: {
      nblLandType: "farmland", nblZoneType: "residential", acquisitionDate: "2015-01-01", nblFarmingSelf: false,
      nblGracePeriods: [GRACE_ROW], nblUrbanIncorporationDate: "2022-06-01",
    } as Partial<AssetForm>,
  },
  {
    id: "G5-forest-inherit",
    scenario: "임야 상속(피상속인 취득 1990) · 3년 안 양도",
    asset: {
      nblLandType: "forest", nblZoneType: "management", acquisitionCause: "inheritance",
      acquisitionDate: "2022-03-01", decedentAcquisitionDate: "1990-01-01", nblForestInheritedWithin3Years: true, nblForestInheritanceDate: "2022-03-01",
    } as Partial<AssetForm>,
  },
  {
    id: "G6-forest-bequest",
    scenario: "임야 수유자(상속인 아님) — 상속 특례 미적용",
    asset: {
      nblLandType: "forest", nblZoneType: "management", acquisitionCause: "inheritance", nonHeirBequest: true,
      acquisitionDate: "2022-03-01", decedentAcquisitionDate: "1990-01-01",
    } as Partial<AssetForm>,
  },
  {
    id: "G7-pasture",
    scenario: "목장용지 · 축산업 비영위",
    asset: { nblLandType: "pasture", nblZoneType: "management", acquisitionDate: "2016-01-01" },
  },
  {
    id: "G8-housing",
    scenario: "주택 부수토지 · 정착면적 100㎡ · 수도권 아님",
    asset: { nblLandType: "housing_site", nblZoneType: "general_residential", nblHousingFootprint: "100", nblIsMetropolitanArea: "no" },
  },
  {
    id: "G9-housing-deemed",
    scenario: "주택 부수토지 + 양도일 의제(경매) — 이 지목은 의제를 읽지 않는다",
    asset: {
      nblLandType: "housing_site", nblZoneType: "general_residential", nblHousingFootprint: "100", nblIsMetropolitanArea: "no",
      nblDeemedTransferReason: "auction", nblDeemedTransferDate: "2023-12-01",
    } as Partial<AssetForm>,
  },
  {
    id: "G10-villa",
    scenario: "별장 부수토지 · 사용 없음 확인",
    asset: { nblLandType: "villa_land", nblZoneType: "management", nblHousingFootprint: "100", nblVillaNoUseConfirmed: true, nblIsMetropolitanArea: "no" } as Partial<AssetForm>,
  },
  {
    id: "G11-other-deemed",
    scenario: "기타토지 + 양도일 의제(공매) + 유예",
    asset: { nblDeemedTransferReason: "public_sale", nblDeemedTransferDate: "2024-03-01", nblGracePeriods: [GRACE_ROW] } as Partial<AssetForm>,
  },
  {
    id: "G12-expropriation",
    scenario: "공익수용(고시일 후 양도) — 무조건 사업용 의제 후보",
    asset: { nblLandType: "farmland", nblZoneType: "agriculture_forest", acquisitionDate: "2015-01-01", transferCause: "public_expropriation", expropriationNoticeDate: "2022-01-01" } as Partial<AssetForm>,
    form: { transferDate: "2023-06-01" },
  },
  {
    id: "G13-inherit-pre2007",
    scenario: "2006.12.31. 이전 상속 → 무조건 사업용 의제(영 §168의14③1호)",
    asset: { nblLandType: "farmland", nblZoneType: "agriculture_forest", acquisitionCause: "inheritance", acquisitionDate: "2005-05-01", decedentAcquisitionDate: "1980-01-01" } as Partial<AssetForm>,
    form: { transferDate: "2024-06-01" },
  },
  {
    id: "G14-share",
    scenario: "공유 지분 1/2(나머지 타인) 기타토지",
    asset: { ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes" } as Partial<AssetForm>,
  },
  {
    id: "G15-grace-other",
    scenario: "기타토지 + 유예(사용금지)",
    asset: { nblGracePeriods: [GRACE_ROW] } as Partial<AssetForm>,
  },
];

/**
 * 이월과세 격자 — 증여자 취득 → 증여 등기접수 → 양도.
 * A(이월과세 적용)가 채택되게 증여자 취득가 낮음 · 증여 당시 평가액 높음, B(배제)가 채택되게 10년 초과 보유를 쓴다.
 */
export const CARRYOVER_BASE: Partial<AssetForm> = {
  acquisitionCause: "carryover_gift",
  acquisitionDate: "",
  nblZoneType: "general_residential",
  carryover: {
    giftRegistryDate: "2022-06-01",
    donorAcquisitionDate: "2012-01-01",
    donorAcquisitionPrice: "100000000",
    useEstimatedAcquisition: false,
    giftDateValuation: "800000000",
    giftTaxAmount: "0",
    donorRelation: "spouse",
    exclusionDeclared: {},
  },
} as unknown as Partial<AssetForm>;

export const CARRYOVER_GRID: MenuGridRow[] = [
  { id: "C1-A-adopted", scenario: "이월과세 · 양도 2023-12-01(증여 후 2년 이내) — 시나리오 A 채택 후보", asset: CARRYOVER_BASE, form: { transferDate: "2023-12-01" } },
  { id: "C2-B-adopted", scenario: "이월과세 · 증여 후 10년 초과 양도 → 적용 제외(B 채택)", asset: { ...CARRYOVER_BASE, carryover: { ...(CARRYOVER_BASE.carryover as object), giftRegistryDate: "2013-06-01", donorAcquisitionDate: "2005-01-01" } as never }, form: { transferDate: "2024-06-01" } },
];
