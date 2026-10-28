/**
 * 이월과세 × 당초 증여 때 인수한 채무 부분(매입분) — **조각 규칙을 적용할 수 없는 입력** 판정 (무의존 leaf).
 *
 * 조각 규칙(`carryover-debt-pieces.ts`)은 카드 한 장의 취득 사실을 증여분·매입분 둘로 나눌 수 있는 입력에만 정의된다.
 * 나눌 방법이 없거나(파트·필지별 값) 다른 엔진 분기로 가는 입력이면 채무 토글이 켜져 있어도 **조용히 한 덩어리로 계산하지 않고 막는다**.
 *
 * 키 이름만 보는 함수라 와이어 본문(⑫ Zod refine)과 엔진 입력(집계 파생 단위의 방어선)이 **같은 키 목록**을 쓴다 — 두 벌이면 한쪽만 고쳐진다.
 * 폼 쪽 술어(`lib/calc/carryover-gift-assumed-debt.ts` `carryoverPurchasedPartScope`)는 AssetForm 기준이라 별개 함수이고,
 * reason 문자열은 이 파일의 상수를 같이 쓴다. 설계서 `docs/02-design/features/carryover-gift-debt-purchased-part.engine.design.md` §3.4.
 */

/** 사용자에게 보이는 사유 — ⑤ 안내·⑧ 메시지·⑫ 메시지가 같은 문자열을 쓴다. */
export const DEBT_PIECES_REASON = {
  propertyType: "분양권·입주권·재개발·겸용은 지원하지 않습니다",
  /** 일반건물은 카드(`general_building_unit`)로 풀려 지원하지만, 와이어 최상위·엔진 모양 서브객체로는 채무를 받지 않는다 — 파트(`landCarryoverPart`/`buildingCarryoverPart`)로만 들어온다. */
  generalBuildingShape: "일반건물은 파트별 이월과세 입력(토지·건물)으로만 채무를 받습니다",
  burdenedGift: "지금 양도하는 자산도 부담부증여입니다",
  ownerSplit: "토지·건물 소유자 분리 또는 별개 취득(파트별 계산)입니다",
  donorEstimation: "증여자 취득가액을 개별주택가격 미공시(공동주택 최초고시 전) 환산 또는 1990.8.30. 전 토지·다필지·상속 평가로 정합니다",
  donorBuilt: "증여자가 신축·증축한 건물(소득세법 제114조의2 가산세)입니다",
  reductions: "감면(조세특례제한법 등)을 함께 적용합니다",
  acquisitionFacts: "취득 시점에 따라 달라지는 입력(동일조정기간·용도변경·보유기간 직접 지정 등)이 있습니다",
  appurtenant: "주택부수토지(1세대1주택 단위)입니다",
  nblDetails: "비사업용 토지 정밀판정 입력이 있습니다",
  depreciation: "감가상각비(소득세법 제97조 제3항)가 있습니다",
} as const;

/** `general_building_unit` = 일반건물 카드(토지·건물 파트가 카드로 풀린 뒤의 엔진 입력 — `general-building-route-cards.ts`). 와이어 `general_building`은 아니다. */
const SUPPORTED_PROPERTY_TYPES = new Set(["housing", "land", "building", "general_building_unit"]);

const present = (v: unknown): boolean => v !== undefined && v !== null;
const nonEmptyArray = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

/** 지원하지 않는 입력이면 사유, 지원하면 `null`. `input`은 와이어 본문이든 엔진 입력이든 키 이름이 같으면 된다. */
export function carryoverDebtPiecesUnsupportedReason(input: Record<string, unknown>): string | null {
  if (input.propertyType === "general_building" || present(input.generalBuildingValuation)) return DEBT_PIECES_REASON.generalBuildingShape;
  if (present(input.propertyType) && !SUPPORTED_PROPERTY_TYPES.has(input.propertyType as string)) return DEBT_PIECES_REASON.propertyType;
  if (present(input.mixedUse) || present(input.redevelopment)) return DEBT_PIECES_REASON.propertyType;
  if (input.transferType === "burdened_gift" || present(input.burdenedGiftInfo)) return DEBT_PIECES_REASON.burdenedGift;
  if (
    (present(input.selfOwns) && input.selfOwns !== "both") ||
    input.isSeparateAcquisition === true ||
    present(input.landAcquisitionDate) ||
    present(input.landAcqMode) ||
    present(input.buildingAcqMode) ||
    present(input.landCarryoverTaxation) ||
    present(input.buildingCarryoverTaxation) ||
    present(input.carryoverGiftEvent) ||
    present(input.splitCarryoverBasis) ||
    present(input.landCarryoverPart) ||
    present(input.buildingCarryoverPart)
  )
    return DEBT_PIECES_REASON.ownerSplit;
  if (
    present(input.preHousingDisclosure) ||
    present(input.pre1990Land) ||
    nonEmptyArray(input.parcels) ||
    present(input.inheritedAcquisition) ||
    present(input.inheritedHouseValuation) ||
    present(input.commercialInheritanceValuation) ||
    present(input.commercialBuildingValuation)
  )
    return DEBT_PIECES_REASON.donorEstimation;
  const ct = input.carryoverTaxation as { donorBuilt?: unknown } | undefined;
  if (present(ct?.donorBuilt)) return DEBT_PIECES_REASON.donorBuilt;
  if (nonEmptyArray(input.reductions) || present(input.rentalReductionDetails) || present(input.newHousingDetails)) return DEBT_PIECES_REASON.reductions;
  if (
    present(input.sameAdjustmentPeriod) ||
    present(input.nonHousingToHousingConversion) ||
    present(input.houseToCommercialConversion) ||
    present(input.manualHoldingPeriodOverride) ||
    present(input.exemptionHoldingStartDate) ||
    present(input.residenceTransitionAcquisitionDate) ||
    present(input.residenceRightConversionDate) ||
    present(input.newBuildRightAcquisitionDate)
  )
    return DEBT_PIECES_REASON.acquisitionFacts;
  // `primaryContextForCompanionRate`는 함께 양도 컴패니언 전체가 받는 주 자산 컨텍스트라 토지 카드(부수토지 일체과세 판정)만 본다 — 주택 카드는 무관하다.
  if ((input.propertyType === "land" && present(input.primaryContextForCompanionRate)) || present(input.appurtenantHouseVerdict) || input.landNature === "appurtenant_to_housing")
    return DEBT_PIECES_REASON.appurtenant;
  if (present(input.nonBusinessLandDetails) || present(input.nonBusinessLandRaw)) return DEBT_PIECES_REASON.nblDetails;
  if (typeof input.depreciationAmount === "number" && input.depreciationAmount > 0) return DEBT_PIECES_REASON.depreciation;
  return null;
}
