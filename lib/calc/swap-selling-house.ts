/**
 * D6 「이 주택을 양도 예정 주택으로 바꿔 판정」 — 양도 주택(assets[0]) ↔ 명부 행 맞바꾸기
 * (계획서 `multi-house-surcharge-judgment-menu.plan.md` §4.3 · V-6 · P9).
 *
 * 사용자 결정(2026-10-23): **주택 속성은 옮긴다**. 소재지·취득일·양도 당시 기준시가·상속 사실과, 양쪽에 같은 뜻의 칸이 있는
 * 중과 배제 사실(사원용·저당권·문화유산·어린이집·부득이·소송·장기임대·조특 감면 임대)을 서로 옮긴다.
 * 양도 행위 사실(예상 양도가액·거주기간·§155 특례 입력·§154① 단서·11호 공고 전 매매계약·한시 유예 나·다목)과
 * 한쪽에만 있는 칸은 비우고, **값이 있었던 것만** 묶음 이름으로 돌려준다(화면이 고지 — 조용히 버리지 않는다).
 *
 * 🔑 명부 행 칸의 처분은 `ROW_FIELD_DISPOSITION`이 정한다 — `satisfies Record<keyof HouseEntry, …>`라 행 칸이 새로 생기면
 *    컴파일이 실패해 처분을 정하게 만든다. 「옮김」 칸은 `swap-selling-house.test.ts`가 왕복으로 값을 확인한다.
 */
import { deriveHouseRegionFromCode } from "./house-region";
import { effectiveSellingTaxIncentiveRental } from "./tax-incentive-rental-scope";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry, RentalDeclaration, TaxIncentiveRentalFacts } from "@/lib/stores/calc-wizard-asset-nbl";

type SellingExclusion = NonNullable<OneHouseJudgmentFormData["sellingHouseExclusion"]>;

/** 「옮김」 — 아래 두 변환 함수가 상대편 칸으로 옮긴다. 문자열은 비울 때 고지할 묶음 이름이다. */
type Disposition = "carried" | string;

const RENTAL_KEYS = [
  "isLongTermRental", "isApartment", "isRegisteredRental", "rentalRegistrationDate", "businessRegistrationDate", "rentalPeriodYears",
  "rentalCancelledDate", "rentalCancellationReason", "rentalType", "rentIncreaseUnder5Pct", "rentIncreaseContractDate",
  "isNationalSizeHousing", "hasMinimum2Units", "hasMinimum5UnitsInCity", "rentalLandArea", "rentalTotalFloorArea", "isConvertedToSale",
  "firstSaleContractDate", "acquisitionOfficialPrice", "rentalStartOfficialPrice", "hasHalfDutyPeriodMet", "isSoldWithin1YearOfCancellation",
  "rentalCancellationDate", "saMokBaseArticle", "isExcluded918Rule", "isExcludedAfter20200711Apt", "isExcludedShortToLongChange",
  "hasContractDepositProof", "rentalAptDeadlineExtension",
] as const satisfies readonly (keyof RentalDeclaration)[];

const TAX_INCENTIVE_KEYS = [
  "isTaxIncentiveRental", "isTaxIncentiveRentalPurchase", "taxIncentiveRentalRegistrationType", "isUrbanLifeHousingApartment",
  "taxIncentiveRentalAptDeadlineExtension", "rentalPeriodYears", "isNationalSizeHousing", "isApartment",
] as const satisfies readonly (keyof TaxIncentiveRentalFacts)[];

/** 양쪽에 같은 이름·같은 뜻으로 있는 중과 배제 사실(§167의3①4·8·8의2호 · §167의10①3·7호) */
const SAME_NAME_EXCLUSION_KEYS = [
  "isMortgageExecution", "isEmployeeHousing", "freeProvisionYears", "isDayCareCenter", "dayCareOperationYears", "dayCareEndDate",
  "dayCareInUse", "isUnavoidableReason", "unavoidableResidenceYears", "unavoidableReasonResolvedDate", "unavoidableReasonUnresolved",
  "acquisitionOfficialPrice", "isLitigationHousing", "litigationAcquisitionDate", "litigationPending",
] as const satisfies readonly (keyof SellingExclusion & keyof HouseEntry)[];

const ADDRESS_KEYS = [
  "addressRoad", "addressJibun", "buildingName", "addressDetail", "addressDong", "addressHo", "longitude", "latitude",
] as const satisfies readonly (keyof AssetForm & keyof HouseEntry)[];

const INHERITED_DETAIL = "상속 주택 세부(공동상속·피상속인 세대 등 1세대1주택 판정 칸)";
const RURAL = "농어촌주택 사실(§155⑦)";
const OUTSIDE_CAPITAL = "수도권 밖 부득이 취득 사실(§155⑧)";
const RIGHT_ORIGIN = "신규 주택 취득 경위(§155① — 분양권·입주권·재건축)";
const POP_DECLINE = "인구감소지역 사실";

export const ROW_FIELD_DISPOSITION = {
  id: "carried",
  region: "수도권 구분(직접 선택)",
  acquisitionDate: "carried",
  officialPrice: "carried",
  isInherited: "carried",
  isLongTermRental: "carried",
  isApartment: "아파트 여부",
  isOfficetel: "주거용 오피스텔 여부",
  isUnsoldHousing: "미분양주택 여부",
  soldSameDay: "같은 날 양도 순서",
  sameDayTransferOrder: "같은 날 양도 순서",
  acquisitionOrigin: RIGHT_ORIGIN,
  rightAcquisitionDate: RIGHT_ORIGIN,
  rightApprovalDate: RIGHT_ORIGIN,
  acquisitionPrice: "취득가액·전용면적(미분양 판정용)",
  exclusiveArea: "취득가액·전용면적(미분양 판정용)",
  isUnsoldNewHouse: "신축·미분양 사실",
  completionDate: "신축·미분양 사실",
  isSpouseOwned: "배우자 보유·합가 사실",
  spouseHeldAtTransfer: "배우자 보유·합가 사실",
  mergeOrigin: "배우자 보유·합가 사실",
  nonHeirBequest: "carried",
  inheritedDate: "carried",
  isCoInherited: INHERITED_DETAIL,
  isLargestCoInheritedShareholder: INHERITED_DETAIL,
  decedentSameHouseholdAtInheritance: "carried",
  decedentHouseholdUnknown: INHERITED_DETAIL,
  decedentHouseholdSeparate: INHERITED_DETAIL,
  parentalCareMergeInheritedHouse: "carried",
  reInheritedFromSeparateHousehold: INHERITED_DETAIL,
  inheritedGiftedToHouseholdMember: INHERITED_DETAIL,
  isRankingDisqualifiedInheritedHouse: "carried",
  oneHouseCulturalHeritage: "carried",
  oneHouseRuralHouse: RURAL,
  ruralHouseKind: RURAL,
  ruralOutsideCapitalEupMyeon: RURAL,
  ruralUrbanZone: RURAL,
  ruralDecedentResidenceYears: RURAL,
  ruralOwnerResidenceYears: RURAL,
  ruralLandAreaSqm: RURAL,
  ruralWholeHouseholdMoved: RURAL,
  ruralHighPriceAtAcquisition: RURAL,
  ruralReturnedToFarmExitHouse: RURAL,
  ruralFarmlandBasis: RURAL,
  ruralFarmlandHolder: RURAL,
  ruralPriorReturnFarmExemption: RURAL,
  ruralGeneralHouseBeforeReturn: RURAL,
  oneHouseUnavoidableOutsideCapital: OUTSIDE_CAPITAL,
  unavoidableOutsideCapitalReason: OUTSIDE_CAPITAL,
  unavoidableOutsideCapitalResolvedDate: OUTSIDE_CAPITAL,
  unavoidableOutsideCapitalUnresolved: OUTSIDE_CAPITAL,
  countExclusion: "조세특례제한법 주택 수 제외 선언",
  isTaxIncentiveRental: "carried",
  isTaxIncentiveRentalPurchase: "carried",
  taxIncentiveRentalRegistrationType: "carried",
  isUrbanLifeHousingApartment: "carried",
  taxIncentiveRentalAptDeadlineExtension: "carried",
  isRegisteredRental: "carried",
  rentalRegistrationDate: "carried",
  businessRegistrationDate: "carried",
  rentalPeriodYears: "carried",
  rentalCancelledDate: "carried",
  rentalCancellationReason: "carried",
  rentalType: "carried",
  rentIncreaseUnder5Pct: "carried",
  rentIncreaseContractDate: "carried",
  isNationalSizeHousing: "carried",
  hasMinimum2Units: "carried",
  hasMinimum5UnitsInCity: "carried",
  rentalLandArea: "carried",
  rentalTotalFloorArea: "carried",
  isConvertedToSale: "carried",
  firstSaleContractDate: "carried",
  acquisitionOfficialPrice: "carried",
  rentalStartOfficialPrice: "carried",
  hasHalfDutyPeriodMet: "carried",
  isSoldWithin1YearOfCancellation: "carried",
  rentalCancellationDate: "carried",
  saMokBaseArticle: "carried",
  isExcluded918Rule: "carried",
  isExcludedAfter20200711Apt: "carried",
  isExcludedShortToLongChange: "carried",
  hasContractDepositProof: "carried",
  rentalAptDeadlineExtension: "carried",
  isUnavoidableReason: "carried",
  unavoidableResidenceYears: "carried",
  unavoidableReasonResolvedDate: "carried",
  unavoidableReasonUnresolved: "carried",
  isLitigationHousing: "carried",
  litigationAcquisitionDate: "carried",
  litigationPending: "carried",
  isMortgageExecution: "carried",
  isEmployeeHousing: "carried",
  freeProvisionYears: "carried",
  isDayCareCenter: "carried",
  dayCareOperationYears: "carried",
  dayCareEndDate: "carried",
  dayCareInUse: "carried",
  isRedevelopmentZone: "재개발·재건축 구역 여부",
  isPopulationDeclineArea: POP_DECLINE,
  populationAreaType: POP_DECLINE,
  popDeclSoleAtAcquisition: POP_DECLINE,
  popDeclAcquiredByGift: POP_DECLINE,
  popDeclDonorHousehold: POP_DECLINE,
  popDeclPriorRight: POP_DECLINE,
  popDeclPriorRightDate: POP_DECLINE,
  addressRoad: "carried",
  addressJibun: "carried",
  buildingName: "carried",
  addressDetail: "carried",
  addressDong: "carried",
  addressHo: "carried",
  longitude: "carried",
  latitude: "carried",
  regionCode: "carried",
  inDesignatedDistrict: "carried",
  addressPnu: "carried",
  addressLookupFilled: "주소 조회 표시",
  officialPriceYear: "기준시가 조회 연도",
} as const satisfies Record<keyof HouseEntry, Disposition>;

/** 세대 사실 — 어느 주택을 양도하든 같다. 나머지 폼 칸은 초기값으로 돌린다. */
const KEEP_FORM_KEYS = [
  "isOneHousehold", "transferDate", "presaleRights", "marriageDate", "parentalCareMergeDate", "parentalCareParentAge",
  "transferorNonResident", "nonResidentPeriod", "nonResidentStartDate", "residentFromDate", "legacyHouseCountPrecedence",
] as const satisfies readonly (keyof OneHouseJudgmentFormData)[];

function formKeyGroup(key: string): string {
  if (key === "contractTotalPrice") return "예상 양도가액";
  if (key.startsWith("residence")) return "거주기간";
  if (key === "gracePeriod") return "한시 유예 나·다목 사실";
  if (key.startsWith("finalHouseRestart")) return "최종 1주택 보유기간 재기산";
  if (key.startsWith("proviso")) return "보유·거주요건 단서(§154①)";
  if (key === "isUnregistered") return "미등기 여부";
  if (key === "surchargeSellingRightValue") return "양도 조합원입주권의 종전 주택의 가격";
  return "1세대1주택 특례 입력";
}

function assetKeyGroup(key: string): string {
  if (key.startsWith("residence")) return "거주기간";
  if (key.startsWith("gift") || key.startsWith("donor")) return "증여 취득 사실";
  if (key.startsWith("decedent") || key.startsWith("inherit")) return "상속 취득 세부(피상속인 취득일 등)";
  return "양도 주택의 그 밖의 입력";
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** 고지할 만한 값인가 — 빈 문자열·false·빈 배열은 「입력 없음」이다(행은 팩토리 기본값이 없는 키가 많아 기본값 비교만으로는 오고지한다) */
const meaningful = (v: unknown) => !(v === undefined || v === null || v === "" || v === false || (Array.isArray(v) && v.length === 0));
const pick = <T extends object, K extends keyof T>(o: T | undefined, keys: readonly K[]): Partial<Pick<T, K>> => {
  const out: Partial<Pick<T, K>> = {};
  for (const k of keys) if (o && o[k] !== undefined) out[k] = o[k];
  return out;
};

/** 명부 행 → 양도 주택 자산 — 판정 폼 초기 자산에서 시작한다(판정 메뉴 기본값 · 그 밖의 칸은 비운다) */
function assetFromRow(row: HouseEntry, prev: AssetForm, base: AssetForm): AssetForm {
  const inherited = row.isInherited;
  return {
    ...base,
    assetId: prev.assetId,
    assetKind: "housing",
    acquisitionCause: inherited ? "inheritance" : "purchase",
    acquisitionDate: row.acquisitionDate,
    // 분리 OFF 불변식 `landAcquisitionDate === acquisitionDate`(`calc-wizard-asset-migrate.ts` M-1a)
    landAcquisitionDate: row.acquisitionDate,
    standardPriceAtTransfer: row.officialPrice,
    regionCode: row.regionCode,
    regionInDesignatedDistrict: row.inDesignatedDistrict,
    addressPnu: row.addressPnu,
    ...Object.fromEntries(ADDRESS_KEYS.map((k) => [k, row[k] ?? ""])),
    ...(inherited
      ? {
          inheritanceDate: row.inheritedDate ?? "",
          nonHeirBequest: row.nonHeirBequest,
          decedentSameHouseholdBeforeInheritance: row.decedentSameHouseholdAtInheritance === true,
          parentalCareMergeInheritedHouse: row.parentalCareMergeInheritedHouse,
          isRankingDisqualifiedInheritedHouse: row.isRankingDisqualifiedInheritedHouse,
        }
      : {}),
  };
}

/** 명부 행 → 양도 주택 배제 사실 */
function exclusionFromRow(row: HouseEntry): SellingExclusion {
  return {
    ...pick(row, SAME_NAME_EXCLUSION_KEYS),
    ...(row.oneHouseCulturalHeritage ? { isCulturalHeritage: true } : {}),
    ...(row.isLongTermRental ? { longTermRental: pick(row, RENTAL_KEYS) } : {}),
    ...(row.isTaxIncentiveRental ? { taxIncentiveRental: pick(row, TAX_INCENTIVE_KEYS) } : {}),
  };
}

/** 옛 양도 주택(자산 + 배제 사실) → 명부 행. 행 id는 맞바꾼 행의 id를 물려받는다(표 순서 유지). */
function rowFromSelling(asset: AssetForm, se: SellingExclusion | undefined, id: string): HouseEntry {
  const inherited = asset.acquisitionCause === "inheritance";
  const ltr = se?.longTermRental?.isLongTermRental ? se.longTermRental : undefined;
  const tir = effectiveSellingTaxIncentiveRental(se);
  return {
    ...createHouseEntry(id),
    region: deriveHouseRegionFromCode(asset.regionCode),
    regionCode: asset.regionCode,
    inDesignatedDistrict: asset.regionInDesignatedDistrict,
    addressPnu: asset.addressPnu,
    ...Object.fromEntries(ADDRESS_KEYS.map((k) => [k, asset[k] || undefined])),
    acquisitionDate: asset.acquisitionDate,
    officialPrice: asset.standardPriceAtTransfer ?? "",
    ...(inherited
      ? {
          isInherited: true,
          inheritedDate: asset.inheritanceDate || asset.acquisitionDate || undefined,
          nonHeirBequest: asset.nonHeirBequest,
          decedentSameHouseholdAtInheritance: asset.decedentSameHouseholdBeforeInheritance,
          parentalCareMergeInheritedHouse: asset.parentalCareMergeInheritedHouse,
          isRankingDisqualifiedInheritedHouse: asset.isRankingDisqualifiedInheritedHouse ?? false,
        }
      : {}),
    ...pick(se, SAME_NAME_EXCLUSION_KEYS),
    ...(se?.isCulturalHeritage ? { oneHouseCulturalHeritage: true } : {}),
    ...(ltr ? pick(ltr, RENTAL_KEYS) : {}),
    ...(tir ? pick(tir, TAX_INCENTIVE_KEYS) : {}),
  };
}

export interface SwapSellingHouseResult {
  form: OneHouseJudgmentFormData;
  /** 값이 있었는데 옮기지 못해 비운 입력의 묶음 이름(중복 없음) */
  cleared: string[];
}

export function swapSellingHouse(form: OneHouseJudgmentFormData, houseId: string): SwapSellingHouseResult {
  const row = form.houses.find((h) => h.id === houseId);
  const prevAsset = form.assets[0];
  if (!row || !prevAsset) return { form, cleared: [] };
  const se = form.sellingHouseExclusion;
  const cleared = new Set<string>();

  // ① 명부 행에서 옮기지 못한 칸
  for (const [key, disposition] of Object.entries(ROW_FIELD_DISPOSITION) as [keyof HouseEntry, Disposition][]) {
    if (disposition === "carried" || !meaningful(row[key])) continue;
    if (key === "region" && row.regionCode) continue; // 소재지 코드에서 다시 파생된다
    if (key === "isApartment" && (row.isLongTermRental || row.isTaxIncentiveRental)) continue; // 임대 사실로 옮겨진다
    // 「일반 취득」은 권리·재건축 사실이 아니다 — 양도 주택에는 이 질문이 없고 잃는 사실도 없다
    if (key === "acquisitionOrigin" && row.acquisitionOrigin === "general") continue;
    cleared.add(disposition);
  }
  // ② 옛 양도 주택의 배제 사실 중 행에 칸이 없는 것
  if (se?.isTaxSpecialExemption) cleared.add("조세특례제한법 감면 중과 배제 선언");
  if (se?.saleDepositReceived || se?.saleContractDate) cleared.add("공고 전 매매계약(11호)");
  // ③ 옛 양도 주택 자산에서 행으로 옮기지 못한 칸
  const carriedAssetKeys = new Set<string>([
    "assetId", "assetLabel", "assetKind", "acquisitionCause", "acquisitionDate", "landAcquisitionDate", "standardPriceAtTransfer", "regionCode",
    "regionInDesignatedDistrict", "addressPnu", ...ADDRESS_KEYS, "inheritanceDate", "nonHeirBequest",
    "decedentSameHouseholdBeforeInheritance", "parentalCareMergeInheritedHouse", "isRankingDisqualifiedInheritedHouse",
  ]);
  const initial = createInitialOneHouseJudgmentForm();
  const defaultAsset = initial.assets[0] as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(prevAsset)) {
    if (!carriedAssetKeys.has(key) && meaningful(value) && !same(value, defaultAsset[key])) cleared.add(assetKeyGroup(key));
  }
  // ④ 폼 칸 — 세대 사실만 남긴다
  const skip = new Set<string>([...KEEP_FORM_KEYS, "assets", "houses", "sellingHouseExclusion"]);
  for (const [key, value] of Object.entries(form)) {
    if (!skip.has(key) && meaningful(value) && !same(value, (initial as unknown as Record<string, unknown>)[key])) {
      cleared.add(formKeyGroup(key));
    }
  }

  const nextExclusion = exclusionFromRow(row);
  // store `updateFormData`는 얕은 병합이다 — 새 폼에 키가 없으면 옛 값(예: `gracePeriod`)이 남으므로 옛 키를 전부 명시한다.
  const unset = Object.fromEntries(Object.keys(form).map((k) => [k, undefined]));
  return {
    form: {
      ...(unset as Partial<OneHouseJudgmentFormData>),
      ...initial,
      ...pick(form, KEEP_FORM_KEYS),
      assets: [assetFromRow(row, prevAsset, initial.assets[0])],
      houses: form.houses.map((h) => (h.id === houseId ? rowFromSelling(prevAsset, se, row.id) : h)),
      sellingHouseExclusion: Object.keys(nextExclusion).length > 0 ? nextExclusion : undefined,
    },
    cleared: [...cleared],
  };
}
