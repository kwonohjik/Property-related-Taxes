/**
 * 주택·건물 토지·건물 분리 계산에서 **토지 파트 취득원인**(`landAcquisitionCause`) 입력 규칙 — Phase D0.
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §4 D0 (G-1·G-2·G-3)
 *
 * 엔진(`calcSplitGain` 진입)·⑫(`refineSplitPartCause`)·⑧(`validateSplitDirectInputs`)이 **이 함수 하나**를
 * 공유한다. 셋이 따로 판정하면 「⑧ 통과 ↔ ⑫ 400」 막다른 길이 생긴다.
 *
 * D0 규칙(G-1·G-2·G-3)은 토지 취득일이 있을 때만 본다 — 엔진이 토지 파트 원인을 읽는 조건과 같다
 * (`resolveLandStatutoryAcquisitionDate` — 토지 취득일이 없으면 원인을 쓰지 않는다).
 *
 * D2(계획서 §12 · 설계 `transfer-acq-cause-mixed-d2.engine.design.md` §4.2)는 **건물이 상속·증여이고 토지가 매매**인 반대 방향이다
 * (`landAcquisitionCause: "purchase"` overlay). 세액 산식은 그대로이고, 엔진이 틀리게 읽거나 읽지 않는 결합만 막는다.
 *
 * D1(계획서 §10 · 설계 `transfer-acq-cause-mixed-d1.engine.design.md` §3)은 **토지 상속·증여가 지정됐는데
 * 엔진이 그 원인을 읽지 않거나 틀리게 읽는** 결합을 막는다(실측: 소유자 분리·가업상속·건물 비매매는 원인이
 * 조용히 무시되고, 토지 취득일이 비면 토지 파트가 통째로 빠진다). 순서 = 첫 항목이 엔진 throw·⑧ 표시이므로
 * 결합 자체가 미지원인 구조 규칙을 먼저 둔다(「환산 못 함」이 먼저 뜨면 틀린 레버를 가리킨다 — PHD 실례).
 *
 * P1(`docs/02-design/features/transfer-split-part-carryover.engine.design.md` §6)은 **파트 이월과세**(`carryover_gift`)를 연다.
 * 종전 G-1(토지 이월과세 전면 차단)·`:249`(건물 이월과세 + 토지 매매)는 「파트 서브객체 필수」(S1)로 바뀌었고,
 * 서브객체가 있는 입력의 계산은 해결자(`transfer-tax-split-carryover.ts`)가 한다. 상호배제·호스트·1세대1주택 게이트는 S0~S9.
 */
import type { PartAcqMode } from "./transfer-tax-split-acq-price";

export interface SplitPartCauseFacts {
  /** 주택·건물(토지 포함) 자산인가 — 분리 계산 대상(`calcSplitGain`과 같은 범위) */
  isSplitable: boolean;
  hasLandAcquisitionDate: boolean;
  landAcquisitionCause?: string;
  hasLandDecedentAcquisitionDate: boolean;
  /** 토지 파트 **유효** 산정방식 — 명시값이 없으면 호출부가 자산 단위 플래그에서 파생해 넘긴다 */
  landMode: PartAcqMode;
  // ── D1 (전부 선택 — 생략 = 그 결합이 아니다) ──
  /** 토지 취득일(상속개시일·증여일) YYYY-MM-DD — §163⑨ 단서 1호 날짜 판정 */
  landAcquisitionDate?: string;
  /** 자산 단위 취득원인 = 주택 split 컨벤션상 **건물** 파트 원인 */
  buildingAcquisitionCause?: string;
  selfOwns?: string;
  isBurdenedGift?: boolean;
  hasPreHousingDisclosure?: boolean;
  hasFamilyBusinessInheritance?: boolean;
  // ── D1-4 (§163⑨ 단서 1호 max) ──
  /** 영 §164④ 가액(②) 총액 — 양수면 「있음」. 생략·0 = ② 없음 (엔진은 `landSec164Value`, ⑧은 ④가 실제로 보내는 값) */
  landSec164Value?: number;
  /** 면적 입력 방식 「일부 양도」 — 평가액이 취득 전체분인지 양도분인지 미확정이라 단서 구간에서 차단한다 */
  isPartialAreaTransfer?: boolean;
  // ── D2 (건물 상속·증여 + 토지 매매) ──
  /** 건물 파트 **유효** 산정방식 — 생략 = 확인하지 않는다 */
  buildingMode?: PartAcqMode;
  /** 건물 취득일 = 상속개시일·증여일 YYYY-MM-DD (자산 단위 `acquisitionDate`) */
  buildingAcquisitionDate?: string;
  /**
   * 자산 단위 상속 취득가액 의제 payload 동봉 여부 — `inheritedAcquisition ∨ inheritedHouseValuation ∨ pre1990Land ∨
   * commercialInheritanceValuation`(컴패니언은 `inheritanceValuation` 포함). **호출 시점 입력**에서 읽는다.
   */
  hasAssetLevelAcquisitionValuation?: boolean;
  /** 파트 취득가액 입력 유무(> 0) — 생략 = 확인하지 않는다. 같은 날(별개 취득 아님)은 파트 완결 규칙(V1·V2)이 꺼져 있어 여기서 요구한다 */
  hasBuildingAcquisitionPrice?: boolean;
  hasLandAcquisitionPrice?: boolean;
  // ── D2-4 (건물 상속·증여, 영 §163⑨ 단서 2호 max — 단독·다가구주택만) ──
  /** 주택(`housing`) 자산인가 — 생략 = 아니다(모름 = 불성립). 비주택 `building`은 영 §164⑤ 체계라 종전 Y4 차단을 유지한다 */
  isHousing?: boolean;
  /** 주택 구분 — 단독·다가구(`house_individual`)만 ②를 연다. 생략·`house_apart` = 차단(공동주택은 영 §164⑥ 체계 — 모름 = 불성립) */
  buildingHouseKind?: BuildingHouseKind;
  /** 건물 몫 영 §164⑦ 가액(②) 총액(지분 스케일 후) — 양수면 「있음」. 생략·0 = ② 없음 */
  buildingSec164Value?: number;
  // ── P1 파트 이월과세 (전부 선택 — 생략 = 그 결합이 아니다) ──
  /** 토지·건물 파트 이월과세 서브객체 존재 (와이어 `*CarryoverPart` ⇔ 엔진 `*CarryoverTaxation`) */
  hasLandCarryover?: boolean;
  hasBuildingCarryover?: boolean;
  /** 자산 단위 `carryoverTaxation` 존재 — 파트 서브객체와 상호배제(R-1) */
  hasTopLevelCarryover?: boolean;
  /** 파트 이월과세를 **받지 않는 자리**(컴패니언)이면 명시 `false` — 생략·true = 받는다. 다건은 키 단위 거부 규칙(`MULTI_REJECT_RULES`)이 막는다 */
  partCarryoverSupported?: boolean;
  /** ⑫ 전용 — 컴패니언(함께 양도 2번째 이후 자산)이 하나라도 있다 (엔진은 생략) */
  hasCompanions?: boolean;
  /** 증여 사건 `giftRegistryDate` YYYY-MM-DD — 있으면 「증여 사건 있음」이다 */
  carryoverGiftDate?: string;
  /** 1세대1주택 비과세 게이트 입력 (`checkExemptionCore`가 비과세 평가를 시작하는 조건과 같다) */
  isOneHousehold?: boolean;
  isUnregistered?: boolean;
  /** `input.expenses`(deprecated 총액) > 0 — 파트 이월과세와 함께 쓸 수 없다(S8) */
  hasLegacyExpenses?: boolean;
}

/** 단서 2호 ②가 열리는 주택 구분 — ④가 `deriveInheritanceHouseKind`(UI·API 공용 파생)로 보낸다. */
export type BuildingHouseKind = "house_individual" | "house_apart";

export type SplitPartCauseField =
  | "landAcquisitionCause"
  | "landAcqMode"
  | "landDecedentAcquisitionDate"
  | "landAcquisitionDate"
  | "landSec164Value"
  | "buildingSec164Value"
  | "areaScenario"
  // D2 — 건물 파트 칸
  | "buildingAcqMode"
  | "acquisitionDate"
  | "inheritedAcquisition"
  | "buildingAcquisitionPrice"
  | "landAcquisitionPrice"
  // P1 — 파트 이월과세
  | "landCarryoverPart"
  | "buildingCarryoverPart"
  | "carryoverGiftEvent"
  | "carryoverTaxation"
  | "isOneHousehold"
  | "expenses";

export interface SplitPartCauseIssue {
  field: SplitPartCauseField;
  message: string;
}

// ── P1 파트 이월과세 메시지 (소득세법 §97의2①·영 §163의2②) ──
export const PART_CARRYOVER_INPUT_REQUIRED_MESSAGE =
  "토지·건물 파트를 이월과세(증여)로 취득했다면 그 파트의 증여자 취득일·취득가액(landCarryoverPart/buildingCarryoverPart)과 증여 사건(carryoverGiftEvent)이 "
  + "함께 필요합니다 — 비우면 취득가액(증여자의 취득 당시 금액)·장기보유특별공제 기산일(증여자 취득일)·증여세 상당액이 빠진 채 계산됩니다 "
  + "(소득세법 §97의2①·§95④ 단서)";

export const PART_CARRYOVER_STRAY_MESSAGE =
  "이월과세 파트 입력(landCarryoverPart/buildingCarryoverPart/carryoverGiftEvent)은 해당 파트의 취득원인이 이월과세(증여)일 때만 보낼 수 있습니다 — "
  + "조용히 버려지지 않도록 막습니다 (소득세법 §97의2①)";

export const PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE =
  "다건 합산·함께 양도 2번째 이후 자산에서는 토지·건물 파트 이월과세를 지원하지 않습니다 — 신고 전체 결정세액 비교(소득세법 §92③2호)가 필요한 입력입니다";

export const PART_CARRYOVER_COMPANION_MESSAGE =
  "함께 양도(일괄양도)하는 자산이 있으면 첫 자산의 토지·건물 파트 이월과세를 지원하지 않습니다 — §97의2②3호 세액 비교는 신고 전체의 양도소득 결정세액으로 해야 하는데 "
  + "단건 비교는 다른 자산과의 §104⑤ 누진 합산·§102② 통산을 볼 수 없습니다 (소득세법 §92③2호·§97의2②3호)";

export const PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE =
  "자산 단위 이월과세(carryoverTaxation)와 토지·건물 파트 이월과세는 함께 쓸 수 없고, 자산 단위 이월과세에는 토지·건물 취득일 분리 입력도 쓸 수 없습니다 — "
  + "증여자가 토지·건물을 다른 날 취득했다면 자산 단위 입력 대신 파트 이월과세(landCarryoverPart/buildingCarryoverPart)로 입력하세요 (소득세법 §97의2①)";

export const PART_CARRYOVER_DATE_MISMATCH_MESSAGE =
  "이월과세 파트의 취득일은 증여 등기접수일과 같아야 합니다 — 수증자 쪽 취득일은 증여 등기접수일 한 곳에서 입력합니다 (소득세법 §97의2③)";

export const PART_CARRYOVER_LEGACY_EXPENSES_MESSAGE =
  "파트 이월과세 계산에서는 자산 단위 필요경비 총액(expenses)을 쓸 수 없습니다 — 토지·건물 파트별 자본적지출 칸으로 입력하세요 "
  + "(총액이 있으면 파트에 다시 나뉘어 증여세 상당액 산입이 반대 파트 경비를 밀어냅니다)";

export const PART_CARRYOVER_ONE_HOUSE_MESSAGE =
  "1세대1주택 비과세(소득세법 §89①3호)와 겹치는 토지·건물 파트 이월과세는 아직 지원하지 않습니다 — "
  + "§97의2②2호(제1항을 적용할 경우 1세대1주택 양도에 해당하게 되는 경우) 판정이 필요합니다";

export const LAND_INHERITED_ESTIMATION_MESSAGE =
  "상속·증여로 취득한 토지는 취득가액을 환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다 — "
  + "상속개시일·증여일 현재 평가액이 취득당시 실지거래가액입니다 (소득세법 §97①1호·같은 법 시행령 §163⑨)";

export const LAND_DECEDENT_DATE_REQUIRED_MESSAGE =
  "상속으로 취득한 토지는 피상속인 취득일이 필요합니다 — 세율 판정 보유기간을 피상속인이 취득한 날부터 통산합니다 (소득세법 §104②1호)";

/** 「소득세법 시행령」 §163⑨ 단서 1호 — 「1990년 8월 30일 개별공시지가가 고시되기 전에 상속 또는 증여받은 토지」. */
export const SEC_163_9_LAND_FIRST_DISCLOSURE = "1990-08-30";

export const LAND_CAUSE_BURDENED_GIFT_MESSAGE =
  "부담부증여로 양도하는 자산에는 토지 취득원인을 따로 지정할 수 없습니다 — 채무 인수분을 양도로 보는 안분"
  + "(소득세법 시행령 §159)이 토지·건물 취득가액 구분과 함께 계산되지 않습니다";

export const LAND_CAUSE_PHD_MESSAGE =
  "개별주택가격이 공시되기 전에 취득한 주택의 환산(소득세법 시행령 §164⑦)은 토지·건물을 모두 환산할 때만 쓰는데, "
  + "상속·증여로 취득한 토지는 환산할 수 없습니다(같은 법 시행령 §163⑨) — 「토지는 다른 원인으로 취득」을 끄거나 "
  + "개별주택가격 미공시 환산을 끄세요";

export const LAND_CAUSE_FAMILY_BUSINESS_MESSAGE =
  "가업상속공제가 적용된 자산(소득세법 §97의2④) 입력은 토지만 상속·증여받은 계산과 함께 쓸 수 없습니다";

export const LAND_CAUSE_OWNER_SPLIT_MESSAGE =
  "토지·건물 중 한쪽만 소유한 자산에는 토지 취득원인을 따로 지정할 수 없습니다 — 소유한 파트의 취득원인을 "
  + "자산 취득원인으로 입력하세요";

export const LAND_CAUSE_BUILDING_CAUSE_MESSAGE =
  "건물을 상속·증여·이월과세·부담부증여로 취득한 자산에서 토지 취득원인을 따로 지정하는 기능은 지원하지 않습니다 — "
  + "건물이 상속·증여이면 토지 취득원인은 매매만 지정할 수 있습니다";

export const LAND_CAUSE_DATE_REQUIRED_MESSAGE =
  "토지를 상속·증여로 취득했다면 토지 상속개시일(증여일)이 필요합니다 — 비우면 토지·건물을 나눠 계산하지 못해 "
  + "토지 취득원인과 토지 취득가액이 계산에서 빠집니다";

/**
 * 영 §163⑨ 단서 1호 구간인가 — 토지 상속·증여 ∧ 토지 취득일(상속개시일·증여일) < 1990-08-30(엄격 — 고시일 당일은 「고시되기 전」이 아니다).
 * 엔진·⑫·⑧·④·브리지가 이 술어 하나를 쓴다(단일 소스). 날짜는 `YYYY-MM-DD…` 문자열(시각 꼬리 허용).
 */
export function isSec163_9LandProviso(cause: string | undefined, landDate: string | undefined): boolean {
  return (cause === "inheritance" || cause === "gift") && !!landDate && landDate.slice(0, 10) < SEC_163_9_LAND_FIRST_DISCLOSURE;
}

export const LAND_SEC164_REQUIRED_MESSAGE =
  "1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 취득가액은 상속개시일(증여일) 현재 평가액과 소득세법 시행령 §164④ 가액 "
  + "중 많은 금액이므로 §164④ 가액(토지등급 환산, landSec164Value)이 필요합니다 (같은 법 시행령 §163⑨ 단서 1호)";

export const LAND_SEC164_PARTIAL_MESSAGE =
  "토지 일부만 양도하는 경우(면적 입력 방식 「일부 양도」)는 1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지의 영 §164④ 비교를 "
  + "지원하지 않습니다 — 평가액이 취득 전체분인지 양도분인지 정해지지 않았고 면적으로 자동 안분하지 않습니다 (같은 법 시행령 §163⑨ 단서 1호)";

// ── D2 메시지 (건물 상속·증여 + 토지 매매) ──
export const BUILDING_CAUSE_BURDENED_OVERLAY_MESSAGE =
  "건물을 부담부증여로 취득한 자산에서는 토지 취득원인을 따로 지정할 수 없습니다 — "
  + "부담부증여 분리(같은 법 시행령 §159)는 지원하지 않습니다";

export const BUILDING_CAUSE_BURDENED_GIFT_MESSAGE =
  "부담부증여로 양도하는 자산에는 건물 상속·증여와 토지 매매를 따로 입력할 수 없습니다 — 채무 인수분을 양도로 보는 안분"
  + "(소득세법 시행령 §159)이 토지·건물 취득가액 구분과 함께 계산되지 않습니다";

export const BUILDING_CAUSE_PHD_MESSAGE =
  "개별주택가격이 공시되기 전에 취득한 주택의 환산(소득세법 시행령 §164⑦)은 토지·건물을 모두 환산할 때만 쓰는데, "
  + "상속·증여로 취득한 건물은 환산할 수 없습니다(같은 법 시행령 §163⑨) — 「토지는 다른 원인으로 취득」을 끄거나 "
  + "개별주택가격 미공시 환산을 끄세요";

export const BUILDING_CAUSE_FAMILY_BUSINESS_MESSAGE =
  "가업상속공제가 적용된 자산(소득세법 §97의2④) 입력은 건물만 상속받고 토지를 따로 매수한 계산과 함께 쓸 수 없습니다";

export const BUILDING_CAUSE_DATE_REQUIRED_MESSAGE =
  "건물을 상속·증여로 취득하고 토지를 따로 매수했다면 토지 취득일이 필요합니다 — 비우면 토지·건물을 나눠 계산하지 못해 "
  + "토지 매수 정보와 건물 평가액이 계산에서 빠집니다";

export const BUILDING_CAUSE_ESTIMATION_MESSAGE =
  "상속·증여로 취득한 건물은 취득가액을 환산취득가·감정가액·매매사례가액으로 산정할 수 없습니다 — "
  + "상속개시일·증여일 현재 평가액이 취득당시 실지거래가액입니다 (소득세법 §97①1호·같은 법 시행령 §163⑨)";

/** 「소득세법 시행령」 §163⑨ 단서 2호 — 건물 기준시가(개별주택가격 등)가 고시되기 전. 개별주택가격 최초공시일 2005-04-30(저장소 주택 게이트 상수와 같은 보수적 상위 집합). */
export const SEC_163_9_BUILDING_FIRST_DISCLOSURE = "2005-04-30";

export const BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE =
  "건물 기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전에 상속·증여받은 건물의 취득가액은 상속개시일(증여일) 현재 평가액과 "
  + "소득세법 시행령 §164⑤~⑦ 가액 중 많은 금액인데, 토지를 따로 취득한 경우의 이 비교는 지원하지 않습니다 "
  + "(같은 법 시행령 §163⑨ 단서 2호). 정확한 고시일은 자산 종류별로 달라 개별주택가격 최초공시일(2005.4.30.) 이전 취득을 "
  + "보수적으로 모두 막습니다 — 건물 상속개시일(증여일)을 확인하거나 「토지는 다른 원인으로 취득」을 끄세요";

/** 단서 2호 ② 비교가 열리는 공동의 술어 — 주택 ∧ 단독·다가구. ④(브리지)·엔진 해결자·leaf가 이 한 줄을 쓴다. */
export function isSec163_9BuildingSec164Open(isHousing: boolean | undefined, kind: string | undefined): boolean {
  return !!isHousing && kind === "house_individual";
}

export const BUILDING_CAUSE_APARTMENT_MESSAGE =
  "건물 기준시가가 고시되기 전에 상속·증여받은 건물의 평가액과 「소득세법 시행령」 제164조 제7항 가액의 건물 몫 비교(같은 영 제163조 제9항 단서 제2호)는 "
  + "단독·다가구주택으로 확인된 주택만 지원합니다 — 공동주택은 국세청장이 고시한 공동주택가격이 있었는지에 따라 적용 조문(같은 영 제164조 제6항·제7항)이 "
  + "달라 이 계산기는 다루지 않습니다. 단독·다가구주택으로 확인되지 않으면(공동주택 포함) 계산하지 않습니다";

export const BUILDING_SEC164_REQUIRED_MESSAGE =
  "건물 기준시가(개별주택가격)가 고시되기 전에 상속·증여받은 단독·다가구주택의 건물 취득가액은 상속개시일(증여일) 현재 평가액과 "
  + "「소득세법 시행령」 제164조 제7항 가액의 건물 몫 중 많은 금액이므로 그 건물 몫(buildingSec164Value)이 필요합니다 "
  + "(같은 영 제163조 제9항 단서 제2호)";

export const BUILDING_SEC164_PARTIAL_MESSAGE =
  "토지 일부만 양도하는 경우(면적 입력 방식 「일부 양도」)는 건물 기준시가 고시 전에 상속·증여받은 단독·다가구주택의 "
  + "「소득세법 시행령」 제164조 제7항 가액 비교(같은 영 제163조 제9항 단서 제2호)를 지원하지 않습니다 — "
  + "최초공시 당시 부수토지 전체 면적이 정해지지 않고 면적으로 자동 안분하지 않습니다";

export const BUILDING_CAUSE_ASSET_VALUATION_MESSAGE =
  "토지·건물을 따로 취득한 계산에서 건물 평가액은 건물 취득가액 칸으로 입력합니다 — 자산 단위 상속 취득가액 의제"
  + "(inheritedAcquisition 등)는 쓰이지 않으며 결과에 실제와 다른 취득가액이 표시됩니다";

export const BUILDING_CAUSE_BUILDING_PRICE_REQUIRED_MESSAGE =
  "건물을 상속·증여로 취득하고 토지를 따로 매수한 계산에는 건물 취득가액(상속개시일 평가액·증여 신고가액)이 필요합니다 — 비우면 "
  + "자산 단위 취득가액이 없어 건물 취득가액이 0으로 계산됩니다 (소득세법 시행령 §163⑨)";

export const BUILDING_CAUSE_LAND_PRICE_REQUIRED_MESSAGE =
  "건물을 상속·증여로 취득하고 토지를 따로 매수한 계산에는 토지 취득가액이 필요합니다 — 비우면 토지 취득가액이 0으로 계산됩니다 "
  + "(소득세법 §97①1호·시행령 §163①)";

export const LAND_CAUSE_ABSENT_MESSAGE =
  "건물을 상속·증여로 취득하고 토지 취득일이 건물 취득일과 다른데 토지 취득원인이 없습니다 — 비우면 토지가 건물과 같은 "
  + "상속·증여로 읽혀 피상속인 보유기간이 토지에도 통산됩니다. 토지를 매수했다면 토지 취득원인을 「매매」로 지정하세요";

/** 「건물 경계일」 — 건물 취득일(상속개시일·증여일)이 영 §163⑨ 단서 2호 구간인가 (엄격 `<`). 엔진·⑫·⑧이 이 술어 하나를 쓴다. */
export function isSec163_9BuildingProviso(cause: string | undefined, buildingDate: string | undefined): boolean {
  return (cause === "inheritance" || cause === "gift") && !!buildingDate && buildingDate.slice(0, 10) < SEC_163_9_BUILDING_FIRST_DISCLOSURE;
}

/** 건물(자산 단위) 원인이 이 값이면 **토지 상속·증여** 혼합은 지원하지 않는다(D3). 미지정은 매매로 본다(엔진 헬퍼 기본값). */
const BUILDING_CAUSE_UNSUPPORTED = new Set(["inheritance", "gift", "carryover_gift", "burdened_gift"]);
/** 토지가 **이월과세**일 때 함께 지원하지 않는 건물 원인 — 건물도 이월과세(C)는 허용한다. */
const BUILDING_CAUSE_UNSUPPORTED_WITH_LAND_CARRYOVER = new Set(["inheritance", "gift", "burdened_gift"]);

/** 영 §163⑨ 단서 술어는 이월과세(증여)를 증여로 읽는다 — 증여일이 단서 구간이면 단순 증여와 같이 막는다. */
const asGift = (c: string | undefined) => (c === "carryover_gift" ? "gift" : c);

export const PART_CARRYOVER_LAND_VALUATION_REQUIRED_MESSAGE =
  "이월과세 토지 파트에는 증여 당시 토지 평가액(토지 취득가액 칸)이 필요합니다 — 증여세 상당액 안분의 분자이자 이월과세를 적용하지 않을 때의 취득가액입니다 "
  + "(소득세법 시행령 §163의2②·§163⑨)";

export const PART_CARRYOVER_BUILDING_VALUATION_REQUIRED_MESSAGE =
  "이월과세 건물 파트에는 증여 당시 건물 평가액(건물 취득가액 칸)이 필요합니다 — 증여세 상당액 안분의 분자이자 이월과세를 적용하지 않을 때의 취득가액입니다 "
  + "(소득세법 시행령 §163의2②·§163⑨)";

/** 위반 항목을 모두 돌려준다(엔진은 첫 항목으로 던지고, ⑫는 전부 기록하고, ⑧은 첫 항목을 칸에 붙인다). */
export function collectSplitPartCauseIssues(f: SplitPartCauseFacts): SplitPartCauseIssue[] {
  if (!f.isSplitable) {
    // 토지·건물을 나눠 계산하지 않는 자산에 실린 파트 이월과세 입력은 조용히 버려진다 — 막는다.
    const stray: SplitPartCauseIssue[] = [];
    if (f.hasLandCarryover) stray.push({ field: "landCarryoverPart", message: PART_CARRYOVER_STRAY_MESSAGE });
    if (f.hasBuildingCarryover) stray.push({ field: "buildingCarryoverPart", message: PART_CARRYOVER_STRAY_MESSAGE });
    if (f.carryoverGiftDate) stray.push({ field: "carryoverGiftEvent", message: PART_CARRYOVER_STRAY_MESSAGE });
    return stray;
  }
  const issues: SplitPartCauseIssue[] = [];
  const cause = f.landAcquisitionCause;
  const buildingCause = f.buildingAcquisitionCause;
  const hasLand = !!f.hasLandCarryover;
  const hasBuilding = !!f.hasBuildingCarryover;
  const hasPart = hasLand || hasBuilding;
  const hasEvent = !!f.carryoverGiftDate;
  const hasTop = !!f.hasTopLevelCarryover;
  // 🔑 **파트 서브객체가 없는 기존 입력은 P1 전과 상태·세액이 같아야 한다**(회귀 격자 `regression-grid.test.ts`). 종전 G-1은 토지 취득일이 있을 때만
  //    토지 이월과세 원인을 읽었다 — 토지 취득일도 서브객체·사건도 없는 원인만의 토지 이월과세는 엔진이 읽지 않아 종전에도 통과했다. 그 입력을 새로 막지 않는다.
  const landCarry = cause === "carryover_gift" && (!!f.hasLandAcquisitionDate || hasLand || !!f.carryoverGiftDate);
  const buildingCarry = buildingCause === "carryover_gift";
  const mixed = cause === "inheritance" || cause === "gift" || landCarry;

  // ── P1 입구 규칙 (S0·S2′·S3·S1) — 앞이 레버가 다른 항목을 가리지 않게 호스트 → 상호배제 → 입력 짝 순이다.
  // S0 — 파트 이월과세를 받지 않는 자리(컴패니언). 입력이 있는 칸마다 짚는다(칸 없는 400 금지).
  if (f.partCarryoverSupported === false && (hasPart || hasEvent || landCarry)) {
    issues.push({ field: "landAcquisitionCause", message: PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE });
    if (hasEvent) issues.push({ field: "carryoverGiftEvent", message: PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE });
    if (hasLand) issues.push({ field: "landCarryoverPart", message: PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE });
    if (hasBuilding) issues.push({ field: "buildingCarryoverPart", message: PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE });
  }
  // S2′ — 주 자산 파트 이월과세 + 함께 양도 자산: 단건 ②3호 비교가 신고 전체 결정세액을 못 본다(N-1).
  if (f.hasCompanions && hasPart)
    issues.push({ field: hasLand ? "landCarryoverPart" : "buildingCarryoverPart", message: PART_CARRYOVER_COMPANION_MESSAGE });
  // S3 — 자산 단위 이월과세와의 상호배제(R-1). 파트 서브객체가 있으면 자산 단위와 함께 쓸 수 없다.
  //   서브객체가 **없는** 입력은 종전에 막히던 결합만 같은 집합으로 닫는다: 건물 이월과세 호스트 + 토지 overlay `purchase`(종전 `:249`) /
  //   + 토지 overlay 이월과세(종전 G-1). 토지 원인이 없는 «자산 단위 + 토지·건물 취득일 분리 입력»(소유자 분리·PHD 후퇴 송신 포함)은 종전에 통과하는 정상 경로이거나
  //   엔진 재귀(Y8)가 던지는 경로라 **여기서 닫지 않는다**(첫 구현이 닫아 소유자 분리 H-5 정상 경로를 400으로 만든 회귀를 고쳤다).
  const topConflict = hasTop && (hasPart || (buildingCarry && (cause === "purchase" || landCarry)));
  if (topConflict) issues.push({ field: "carryoverTaxation", message: PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE });
  // S1 — 취득원인 ⇔ 서브객체. 필수 누락(G-1을 대체: 서브객체가 없으면 취득가액 0 침묵 계산)과 stray(조용히 버리지 않는다).
  if (!topConflict) {
    if (landCarry && !hasLand) issues.push({ field: "landCarryoverPart", message: PART_CARRYOVER_INPUT_REQUIRED_MESSAGE });
    if (buildingCarry && !hasBuilding && !hasTop && (cause === "purchase" || landCarry))
      issues.push({ field: "buildingCarryoverPart", message: PART_CARRYOVER_INPUT_REQUIRED_MESSAGE });
  }
  if (hasLand && !landCarry) issues.push({ field: "landCarryoverPart", message: PART_CARRYOVER_STRAY_MESSAGE });
  if (hasBuilding && !buildingCarry) issues.push({ field: "buildingCarryoverPart", message: PART_CARRYOVER_STRAY_MESSAGE });
  if (hasPart && !hasEvent) issues.push({ field: "carryoverGiftEvent", message: PART_CARRYOVER_INPUT_REQUIRED_MESSAGE });
  if (hasEvent && !hasPart) issues.push({ field: "carryoverGiftEvent", message: PART_CARRYOVER_STRAY_MESSAGE });

  // D1 구조 규칙 — 토지 상속·증여·이월과세가 지정됐을 때만(원인이 없거나 매매면 결합이 아니다).
  if (mixed) {
    const unsupportedBuildingCauses = landCarry ? BUILDING_CAUSE_UNSUPPORTED_WITH_LAND_CARRYOVER : BUILDING_CAUSE_UNSUPPORTED;
    const structural: [boolean, string][] = [
      [!!f.isBurdenedGift, LAND_CAUSE_BURDENED_GIFT_MESSAGE],
      [!!f.hasPreHousingDisclosure, LAND_CAUSE_PHD_MESSAGE],
      [!!f.hasFamilyBusinessInheritance, LAND_CAUSE_FAMILY_BUSINESS_MESSAGE],
      // 엔진은 소유자 분리에서 토지 원인을 읽지 않는다(land_only 실측 — 통산이 조용히 빠진다).
      [f.selfOwns !== undefined && f.selfOwns !== "both", LAND_CAUSE_OWNER_SPLIT_MESSAGE],
      [unsupportedBuildingCauses.has(buildingCause ?? ""), LAND_CAUSE_BUILDING_CAUSE_MESSAGE],
    ];
    for (const [hit, message] of structural) if (hit) issues.push({ field: "landAcquisitionCause", message });
    // G-12 — 토지 취득일이 없으면 분리 계산이 성립하지 않아 토지 파트가 통째로 빠진다(⑫ 200 · splitDetail 없음).
    if (!f.hasLandAcquisitionDate) issues.push({ field: "landAcquisitionDate", message: LAND_CAUSE_DATE_REQUIRED_MESSAGE });
  }

  // D2 — 건물 상속·증여·이월과세 + 토지 매매(overlay `purchase`). 구조 → 토지 취득일 → (이하 토지 취득일 있을 때) 경계일 → 방식 → 자산 단위 평가.
  const buildingInherited = buildingCause === "inheritance" || buildingCause === "gift";
  /** 날짜가 있을 때의 건물 몫 규칙 — D2(토지 매매)와 C(토지도 이월과세)가 함께 쓴다. */
  const buildingRules = (landPurchase: boolean) => {
    // Y4 — 영 §163⑨ 단서 2호 구간. 단독·다가구주택만 ②(영 §164⑦ 건물 몫)와 max로 열린다(D2-4). 그 밖은 종전 차단:
    //   비주택(일반건물 §164⑤ 체계) → Y4a · 단독·다가구가 아니거나 모름(공동주택 §164⑥ 체계) → Y4d ·
    //   일부 양도(기준 면적 미확정, 자동 안분 금지) → Y4b · ② 없음 → Y4c.
    if (isSec163_9BuildingProviso(asGift(buildingCause), f.buildingAcquisitionDate)) {
      if (!f.isHousing) issues.push({ field: "acquisitionDate", message: BUILDING_CAUSE_PRE_DISCLOSURE_MESSAGE });
      else if (!isSec163_9BuildingSec164Open(f.isHousing, f.buildingHouseKind))
        issues.push({ field: "acquisitionDate", message: BUILDING_CAUSE_APARTMENT_MESSAGE });
      else if (f.isPartialAreaTransfer) issues.push({ field: "areaScenario", message: BUILDING_SEC164_PARTIAL_MESSAGE });
      else if (!((f.buildingSec164Value ?? 0) > 0))
        issues.push({ field: "buildingSec164Value", message: BUILDING_SEC164_REQUIRED_MESSAGE });
    }
    // S6 — 건물 파트 방식은 실가뿐(이월과세도 증여 당시 평가액이 취득가액 — 영 §163⑨)
    if (f.buildingMode !== undefined && f.buildingMode !== "actual")
      issues.push({ field: "buildingAcqMode", message: BUILDING_CAUSE_ESTIMATION_MESSAGE });
    if (f.hasAssetLevelAcquisitionValuation)
      issues.push({ field: "inheritedAcquisition", message: BUILDING_CAUSE_ASSET_VALUATION_MESSAGE });
    // Y9·S7 — 파트 가액 완결. 날짜가 다르면 파트 완결 규칙(⑫ V1·V2)도 요구하나, 같은 날은 그 규칙이 꺼져 있어 취득가액 0이 조용히 계산된다.
    if (f.hasBuildingAcquisitionPrice === false)
      issues.push({
        field: "buildingAcquisitionPrice",
        message: buildingCarry ? PART_CARRYOVER_BUILDING_VALUATION_REQUIRED_MESSAGE : BUILDING_CAUSE_BUILDING_PRICE_REQUIRED_MESSAGE,
      });
    if (landPurchase && f.hasLandAcquisitionPrice === false && (f.landMode === "actual" || f.landMode === "appraisal"))
      issues.push({ field: "landAcquisitionPrice", message: BUILDING_CAUSE_LAND_PRICE_REQUIRED_MESSAGE });
  };
  if (cause === "purchase") {
    if (buildingCause === "burdened_gift")
      issues.push({ field: "landAcquisitionCause", message: BUILDING_CAUSE_BURDENED_OVERLAY_MESSAGE });
    if (buildingInherited || buildingCarry) {
      const structural: [boolean, string][] = [
        [!!f.isBurdenedGift, BUILDING_CAUSE_BURDENED_GIFT_MESSAGE],
        [!!f.hasPreHousingDisclosure, BUILDING_CAUSE_PHD_MESSAGE],
        [!!f.hasFamilyBusinessInheritance, BUILDING_CAUSE_FAMILY_BUSINESS_MESSAGE],
        [f.selfOwns !== undefined && f.selfOwns !== "both", LAND_CAUSE_OWNER_SPLIT_MESSAGE],
      ];
      for (const [hit, message] of structural) if (hit) issues.push({ field: "landAcquisitionCause", message });
      if (!f.hasLandAcquisitionDate) issues.push({ field: "landAcquisitionDate", message: BUILDING_CAUSE_DATE_REQUIRED_MESSAGE });
      else buildingRules(true);
    }
  } else if (landCarry && buildingCarry) {
    // C — 구조·토지 취득일은 위 토지 규칙이 이미 본다. 건물 몫의 나머지만 같은 규칙을 쓴다.
    if (f.hasLandAcquisitionDate) buildingRules(false);
  } else if (
    // Y8 — 토지 overlay 부재 + 건물 상속·증여·이월과세 + 분리 입력: 토지가 건물과 같은 원인으로 읽혀 피상속인·증여자 보유기간이 통산된다(D2-B3).
    // 소유자 분리·PHD는 토지 취득일을 건물 취득일로 후퇴시켜 보내므로(같은 날) 이 조건에 걸리지 않는다.
    // 부담부증여도 제외 — 파트 세율·원인을 읽지 않고(§159 안분이 총액을 덮는다) 기존 경로가 분리 입력을 그대로 받는다.
    // 자산 단위 이월과세(S3가 이미 짚는다)는 제외 — 「토지 취득원인을 매매로 지정하라」는 안내는 그 입력의 레버가 아니다.
    !cause && (buildingInherited || buildingCarry) && !f.isBurdenedGift && !hasTop && (f.selfOwns === undefined || f.selfOwns === "both") && f.hasLandAcquisitionDate
    && !!f.landAcquisitionDate && !!f.buildingAcquisitionDate
    && f.landAcquisitionDate.slice(0, 10) !== f.buildingAcquisitionDate.slice(0, 10)
  ) {
    issues.push({ field: "landAcquisitionCause", message: LAND_CAUSE_ABSENT_MESSAGE });
  }

  // S8 — 자산 단위 필요경비 총액이 있으면 반대 파트 경비가 증여세 산입에 밀린다(`splitPair`가 한쪽만 입력된 파트의 반대편을 총액 − 입력값으로 도출).
  if (f.hasLegacyExpenses && hasPart)
    issues.push({ field: "expenses", message: PART_CARRYOVER_LEGACY_EXPENSES_MESSAGE });
  // S9 — 1세대1주택 비과세와 겹치면 §97의2②2호 판정이 필요하다(P5 전까지 막는다). 게이트는 `checkExemptionCore`가 비과세 평가를 시작하는 조건과 같다
  // (비주택 `building`은 비과세 평가가 없다 · 모름 = 불성립). `isOneHousehold`는 ④가 폼에서 실제로 싣는 값이어야 한다(3중 패턴).
  if (hasPart && f.isHousing && f.isOneHousehold === true && !f.isUnregistered)
    issues.push({ field: "isOneHousehold", message: PART_CARRYOVER_ONE_HOUSE_MESSAGE });

  if (!f.hasLandAcquisitionDate) return issues;

  // S5 — 이월과세 파트의 취득일은 증여 등기접수일이다(Q-8). 한 곳 입력 규약을 엔진·⑫도 강제한다.
  if (f.carryoverGiftDate) {
    const gift = f.carryoverGiftDate.slice(0, 10);
    if (hasLand && f.landAcquisitionDate && f.landAcquisitionDate.slice(0, 10) !== gift)
      issues.push({ field: "landAcquisitionDate", message: PART_CARRYOVER_DATE_MISMATCH_MESSAGE });
    if (hasBuilding && f.buildingAcquisitionDate && f.buildingAcquisitionDate.slice(0, 10) !== gift)
      issues.push({ field: "acquisitionDate", message: PART_CARRYOVER_DATE_MISMATCH_MESSAGE });
  }

  // Q-7(D1-4) — §163⑨ 단서 1호: 평가액(①)과 영 §164④ 가액(②) 중 많은 금액. ②가 없으면 비교할 수 없어 차단한다.
  // 일부 양도는 ①의 기준 면적이 미확정이라 먼저 막는다(② 입력으로 풀리지 않는 사유가 앞).
  if (isSec163_9LandProviso(asGift(cause), f.landAcquisitionDate)) {
    if (f.isPartialAreaTransfer) issues.push({ field: "areaScenario", message: LAND_SEC164_PARTIAL_MESSAGE });
    else if (!((f.landSec164Value ?? 0) > 0))
      issues.push({ field: "landSec164Value", message: LAND_SEC164_REQUIRED_MESSAGE });
  }

  // G-2·S6 — 일반건물 파트 규칙(`transfer-tax-validate-gb.ts` blockEstimation · `gbPartAllowedModes`)과 같다.
  if ((cause === "inheritance" || cause === "gift" || landCarry) && f.landMode !== "actual")
    issues.push({ field: "landAcqMode", message: LAND_INHERITED_ESTIMATION_MESSAGE });

  // S7 — 이월과세 토지 파트의 증여 당시 평가액(안분 분자·B 취득가액)
  if (landCarry && f.hasLandAcquisitionPrice === false)
    issues.push({ field: "landAcquisitionPrice", message: PART_CARRYOVER_LAND_VALUATION_REQUIRED_MESSAGE });

  // G-3 — 비우면 통산이 조용히 빠져 단기세율이 된다. 일반건물 토지 상속도 필수다(`transfer-tax-schema-required-refines-gb.ts:80`).
  if (cause === "inheritance" && !f.hasLandDecedentAcquisitionDate)
    issues.push({ field: "landDecedentAcquisitionDate", message: LAND_DECEDENT_DATE_REQUIRED_MESSAGE });

  return issues;
}
