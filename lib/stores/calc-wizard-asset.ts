/**
 * AssetForm 관련 타입·팩토리·마이그레이션
 * calc-wizard-store.ts 800줄 정책에 따라 분리.
 *
 * 겸용주택 + 보유 중 일부 용도변경 관련 필드 디폴트·마이그레이션은
 * `calc-wizard-asset-mixed-use.ts`로 별도 분리(800줄 정책 준수, 2026-04-30).
 * NBL 관련 서브 타입(NblBusinessUsePeriod 등 4종)은
 * `calc-wizard-asset-nbl.ts`로 별도 분리(2026-05-11).
 */

import type { ResidencePeriod } from "./calc-wizard-asset-residence";
import type { CarryoverTaxationForm } from "./calc-wizard-asset-carryover";
export type { ResidencePeriod, CarryoverTaxationForm };
export { type ParcelFormItem, migrateParcel } from "./calc-wizard-parcel";
import type { ParcelFormItem } from "./calc-wizard-parcel";

// ── NBL 서브 타입 (별도 모듈, 800줄 정책) ──
export type {
  NblBusinessUsePeriod,
  ResidenceHistoryInput,
  GracePeriodInput,
  NblGracePeriodInput,
  HouseEntry,
  PresaleRightEntry,
} from "./calc-wizard-asset-nbl";

// ── 감면 폼 타입 (별도 모듈, 800줄 정책) ──
export type {
  AssetReductionForm,
  ReductionType,
  PriorReductionUsageItem, SpecialHouseExclusionFormItem,
} from "./calc-wizard-asset-reduction";
import type { AssetReductionForm } from "./calc-wizard-asset-reduction";

// ── 팩토리·마이그레이션은 별도 모듈 (800줄 정책) ──
export { makeDefaultAsset, makeDefaultCompanionAsset, migrateAsset } from "./calc-wizard-asset-factory";

/**
 * 자산 1건의 폼 상태 (문자열 기반).
 * 주된 자산과 동반 자산을 구분하지 않고 동일한 구조로 관리.
 * assets[0]이 대표 자산 (isPrimaryForHouseholdFlags = true).
 */
import type { BurdenedGiftFormSlice } from "./calc-wizard-asset-bg";
export type { BurdenedGiftFormSlice } from "./calc-wizard-asset-bg";
import type { RedevelopmentFormSlice } from "./calc-wizard-asset-redev";
export type { RedevelopmentFormSlice } from "./calc-wizard-asset-redev";
import type { InheritanceAcquisitionFormSlice } from "./calc-wizard-asset-inheritance-acq";
export type { InheritanceAcquisitionFormSlice } from "./calc-wizard-asset-inheritance-acq";
import type { NblOtherFormSlice } from "./calc-wizard-asset-nbl-other";
export type { NblOtherFormSlice } from "./calc-wizard-asset-nbl-other";
import type { GeneralBuildingFormSlice } from "./calc-wizard-asset-gb";
export type { GeneralBuildingFormSlice } from "./calc-wizard-asset-gb";
// 일부양도 취득가액 안분 계산기 (B4-2b) — UI 전용 슬라이스
import type { PartialAreaApportionFormSlice } from "./calc-wizard-asset-partial-area";
export type { PartialAreaApportionFormSlice, PartialApportionBasis } from "./calc-wizard-asset-partial-area";
import type { NblJudgmentFormSlice } from "./calc-wizard-asset-nbl-judgment";
export type { NblJudgmentFormSlice } from "./calc-wizard-asset-nbl-judgment";
import type { CommercialBuildingFormSlice } from "./calc-wizard-asset-cb";
export type { CommercialBuildingFormSlice } from "./calc-wizard-asset-cb";
// 비주택 → 주택 용도변경 (「소득세법」 §95⑤·⑥ · 시행령 §154⑤ 단서)
import type { UsageConversionFormSlice } from "./calc-wizard-asset-usage-conversion";
export type { UsageConversionFormSlice } from "./calc-wizard-asset-usage-conversion";

export interface AssetForm extends BurdenedGiftFormSlice, RedevelopmentFormSlice, InheritanceAcquisitionFormSlice, NblOtherFormSlice, GeneralBuildingFormSlice, PartialAreaApportionFormSlice, NblJudgmentFormSlice, CommercialBuildingFormSlice, UsageConversionFormSlice {
  assetId: string;
  assetLabel: string;
  /**
   * 자산 종류 — 6종 (API 전달 시 right_to_move_in/presale_right → housing 으로 변환,
   * commercial_building → "building" + commercialBuildingValuation 서브객체로 분리 전달)
   */
  assetKind: "housing" | "land" | "building" | "right_to_move_in" | "presale_right" | "commercial_building" | "general_building" | "redevelopment_apt";
  /** 입주권 승계조합원 여부 (assetKind === "right_to_move_in" 일 때만 의미) */
  isSuccessorRightToMoveIn: boolean;
  /**
   * 조합원입주권 **승계취득가액** (원) — `isSuccessorRightToMoveIn === true` 전용.
   *
   * 승계조합원은 「소득세법 시행령」 §166①의 적용 대상이 아니다 — 그 항은 「조합원이 당해 조합에
   * 기존건물과 그 부수토지를 **제공하고 취득한** 입주자로 선정된 지위를 양도하는 경우」로 요건을
   * 한정하는데, 승계자는 제공한 사실이 없다. 따라서 취득가액은 §97①1호 가목의 **실지거래가액**
   * 이고, 그 구성은 「권리가액 상당 + 프리미엄」이다(기준-2025-법규재산-0057, 2025-06-19).
   *
   * ⚠️ §166 섹션의 `redevActualAcquisitionPrice`(= 인가 **전** 종전 부동산의 취득가액)와는
   *    **다른 사실**이다. 승계자에게는 「인가 전 종전 부동산」 자체가 없다. 한 필드로 겸용하면
   *    라벨을 문자대로 따른 사용자가 종전 소유자의 취득가액을 넣어 과대과세된다(실측 97,922,000원).
   */
  successorRightAcqPrice: string;
  /**
   * 조합원입주권 승계취득 **이후 납입한 추가분담금**(원) — `isSuccessorRightToMoveIn === true` 전용.
   *
   * 기준-2025-법규재산-0057은 승계취득 케이스의 취득가액을 「권리가액 + 취득 이후 조합원
   * 분양계약에 따라 납입한 추가분담금 + (입증되는) 프리미엄」의 합으로 본다. API 변환이
   * `successorRightAcqPrice`와 합산해 엔진 `acquisitionPrice` 한 값으로 보낸다(엔진 필드 신설 없음).
   *
   * 미입력("")은 0으로 본다 — 승계 직후 양도라 추가분담금이 없을 수 있다.
   */
  successorRightAddedContribution: string;

  /**
   * ── 승계 입주권 §165① 기준시가 4칸 — 추계(환산·감정·매매사례) 전용 ──────────────
   *
   * 「소득세법 시행령」 §165①: 법 §99①2호 **가목**의 「대통령령으로 정하는 방법에 따라 평가한
   * 가액」이란 「**취득일 또는 양도일까지 납입한 금액과 취득일 또는 양도일 현재의 프리미엄에
   * 상당하는 금액을 합한 금액**」을 말한다.
   *
   * ⇒ 시점마다 **납입액 + 프리미엄** 2칸으로 받고 합산한다. 합계 1칸으로 받지 않는 이유는
   *   §165①의 구성과 1:1이라 사용자가 검산할 수 있고, 화면 미리보기로 합계를 확인시킬 수 있어서다.
   *   합산은 `transfer-successor-right.ts`의 헬퍼가 **단일 소스**로 수행한다(UI 미리보기·④ 변환 공용).
   *
   * ⚠️ 기존 `standardPriceAtAcq`·`standardPriceAtTransfer`와 **다른 칸**이다. 그 둘은 토지·건물의
   *    개별공시지가·건물기준시가(§99①1호)를 받는 칸이고, 이쪽은 §99①2호 가목의 권리 기준시가다.
   *    엔진에는 둘 다 `standardPriceAtAcquisition`/`standardPriceAtTransfer` 한 쌍으로 도달하므로
   *    ④ 변환에서 **승계일 때만** 이 4칸의 합계로 교체한다.
   *
   * 사용 범위:
   *   · 환산       → 4칸 전부 (§176의2②2호 분자·분모)
   *   · 감정·매매사례 → 취득 2칸만 (§163⑥ 개산공제 base)
   *   · 실거래가    → 미사용
   */
  successorRightStdPaidAtAcq: string;
  successorRightStdPremiumAtAcq: string;
  successorRightStdPaidAtTransfer: string;
  successorRightStdPremiumAtTransfer: string;
  /**
   * 「소득세법」 §104③ 미등기양도자산 — **컴패니언(2번째 이후) 자산 전용**.
   *
   * 주 자산은 폼-전역 `TransferFormData.isUnregistered`(Step4 ⑤ 특수 상황)를 쓴다. 일괄양도는
   * 자산마다 등기 여부가 다를 수 있어(한 물건은 등기·다른 물건은 미등기) 자산-수준 필드가 필요하다.
   *
   * ⚠️ 일반건물은 이 필드를 쓰지 않는다 — 토지·건물이 별개 등기부라 `gbLandUnregistered`·
   *    `gbBuildingUnregistered` 2축이다. 컴패니언 `assetKind` enum에도 `general_building`이
   *    없다(지분 분할 GB는 companion 경로를 쓰지 않는다 — `transfer-tax-schema-sub.ts:289`).
   */
  isUnregistered: boolean;
  /** 세대 Step(Step3/4)의 1세대1주택 비과세·다주택 중과 판정 기준 대표 자산 여부 */
  isPrimaryForHouseholdFlags: boolean;
  /** 양도시점 기준시가 (안분 키, 문자열) */
  standardPriceAtTransfer: string;
  /** 양도시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtTransferLabel: string;
  /**
   * ① 동일조정기간 내 취득·양도 시 「양도당시 기준시가」 환산 (소령 §164⑧ · 소칙 §80①~⑤).
   *
   * 취득·양도 기준시가가 같아지는 구간(보유기간 중 새 기준시가 미고시)에서만 의미가 있다.
   * 환산 모드에서 두 값이 같으면 환산취득가액 = 양도가액이 되어 양도차익이 0이 되므로,
   * 이 입력이 없으면 과세 자체가 성립하지 않는다.
   *
   * ⚠️ 3중 패턴 — 여기 기본값(`sapFormula: "prev"`)은 ④ API 변환·⑧ validation과 **같아야** 한다.
   */
  /** 가목("prev", 기본) | 나목("new" — 양도일+2월 내 새 고시 + 확정신고 선택) */
  sapFormula: "prev" | "new";
  /** 가목 — 전기의 기준시가 (§80②2호) */
  sapPriorStdPrice: string;
  /** 나목 — 새로운 기준시가 */
  sapNewStdPrice: string;
  /** 기준시가 조정월수 (§80②1호). 빈 값이면 12 */
  sapAdjustMonths: string;
  /** 전기 기준시가 부존재 시 대체 산정 근거 (§80③1~3호) */
  sapPriorBasis: "direct" | "nearby_land" | "first_notice_rate" | "ratio_conversion";
  /**
   * §80③ 대체 산정 피연산자 — **UI 전용**이다(엔진에 보내지 않는다).
   *
   * 산정 결과는 `calcPriorStdPriceSubstitute`(엔진 leaf)로 계산해 `sapPriorStdPrice`에
   * 적어 넣는다. 즉 엔진이 받는 값은 여전히 「전기의 기준시가」 하나뿐이고, 피연산자는
   * 그 값을 어떻게 얻었는지를 폼에 남겨 재편집 가능하게 하는 역할만 한다.
   */
  /** §80③2호 — 국세청장이 최초로 고시한 기준시가 */
  sapFirstNoticeStdPrice: string;
  /** §80③2호 — 취득연도·신축연도·구조·내용연수를 고려해 고시한 기준율 (%) */
  sapNoticeBaseRate: string;
  /** §80③3호 — 전기의 (가목 + 나목) 합계액 */
  sapPriorLandBuildingSum: string;
  /** §80③3호 — 취득당시의 (가목 + 나목) 합계액 */
  sapAcqLandBuildingSum: string;
  /** 값 출처 — 자동 조회 / 수동 입력. 표시 전용 */
  sapPriceSource: "lookup" | "manual";
  /** 환산 사용 여부 토글 — OFF면 ④가 `sameAdjustmentPeriod`를 아예 보내지 않는다 */
  sapEnabled: boolean;
  /**
   * 직접 귀속 필요경비 (deprecated — backward-compat 유지).
   * 신규 입력은 `capitalExpenditure` + `transferExpense` 분리 사용.
   */
  directExpenses: string;
  /** 자본적 지출액 (소득세법 §97① 가목) — §97② 단서 swap 비교에 사용 */
  capitalExpenditure: string;
  /** 양도비 (소득세법 §97① 나목) — §97② 단서 swap 비교에 사용 */
  transferExpense: string;

  // ── 자산별 감면 (복수 선택 허용, 조특법 §127⑦) ──
  /** 이 자산에 적용할 감면 목록. 복수 체크 가능, 엔진이 §127⑦ 규칙 적용. */
  reductions: AssetReductionForm[];

  /** 상속 취득가액 산정 모드: auto=보충적평가, manual=직접입력 */
  /** 상속개시일 (YYYY-MM-DD) */
  inheritanceDate: string;
  /** 자산 종류 (토지/단독주택/공동주택 — 보충적평가용) */
  inheritanceAssetKind: "land" | "house_individual" | "house_apart";
  /**
   * 취득 당시 **토지** 면적 (㎡) — 축 A. 취득 기준시가 산정, Pre1990 환산, NBL landArea.
   *
   * ⚠️ **전 자산유형에서 토지 면적이다** — `assetKind === "building"`("건물(토지 제외)")도
   *    포함한다(2026-07-30 U-12 실측). 그 라벨은 「소득세법」 제99조 제1항 제1호 **나목**의
   *    *기준시가 공시 범위*를 뜻하고, 부수토지는 **가목**으로 별도 평가된다:
   *      `toPropertyType(building_non_residential)` → "land"(`StandardPriceInput.tsx:69~70`)
   *      → 조회 대상이 개별공시지가이고 이 필드가 그 곱셈 인자다.
   *    PR #912가 이를 "건물 연면적"으로 오라벨링했고 후속 마이그레이션이 값을
   *    `buildingFloorArea`로 옮기며 축 A를 비웠다 — **철회됨**. 건물 연면적은 별도 필드다.
   */
  acquisitionArea: string;
  /** 양도 당시 **토지** 면적 (㎡) — 축 A. 양도 기준시가 산정. */
  transferArea: string;
  /**
   * 건물 연면적 (㎡) — 축 B. 각 층 바닥면적의 합.
   *
   * 소비처: 「건물 기준시가 계산서」의 곱셈 인자(`standardPrice = floor(㎡당 × 연면적)`,
   * `building-standard-price-helpers.ts:111`). `BuildingStdPriceModalButton`의
   * `prefill.floorArea`로 주입되어 **취득·최초공시·양도 3시점에 같은 값**이 쓰인다.
   *
   * 시점 쌍이 아닌 **단일 필드**다(GB `gbBuildingArea` 선례). 연면적의 취득↔양도 차이는
   * 증축 전용 필드(`extensionFloorArea`)가 담당한다.
   */
  buildingFloorArea: string;
  /**
   * 면적 입력 시나리오 (UI 전용, API 전송 시 제외)
   * - "same"      : 취득면적 = 양도면적 (일반, 기본값)
   * - "partial"   : 일부 양도 — 취득 토지 중 일부만 양도
   * - "reduction" : 환지처분 (감환지) — 교부면적 < 권리면적 (소득령 §162①9호 단서)
   * - "increase"  : 환지처분 (증환지) — 교부면적 > 권리면적 (증가분은 별도 취득 분리)
   * UI에서 의제취득면적을 acquisitionArea에, 환지확정일 익일을 acquisitionDate에 사전 반영.
   */
  areaScenario: "same" | "partial" | "reduction" | "increase";
  /** 환지처분확정일 (areaScenario=reduction/increase 시, YYYY-MM-DD) */
  replottingConfirmDate: string;
  /** 환지 권리면적 (㎡, areaScenario=reduction 시) */
  entitlementArea: string;
  /** 환지 교부면적 (㎡, areaScenario=reduction 시) */
  allocatedArea: string;
  /** 환지 이전 종전면적 (㎡, areaScenario=reduction 시, 의제취득면적 산식에 사용) */
  priorLandArea: string;
  /**
   * 증환지 증가분 자산 여부 (handleAddIncrease로 자동 추가된 자산).
   * true 시 당초분(assets[0])에서 양도시 기준시가(㎡당·총액)를 live fallback으로 파생 —
   * 증가분 추가 순서와 무관하게 자동 반영(당초분을 나중에 조회/입력해도 적용). UI·API·validate 3중.
   */
  isReplotIncrement: boolean;
  /** 상속개시일 직전 공시가격: 토지=원/㎡, 주택=원 총액 */
  publishedValueAtInheritance: string;
  /**
   * 「가목(§163⑨ 평가액)을 확인할 수 없음」 명시 선언 — pre-deemed(기준일 < 1985.1.1.) 전용.
   *
   * 「소득세법」 §97①1호 **단서**는 나목(환산 등 추계)을 「가목의 실지거래가액을 확인할 수 없는
   * 경우에 **한정**」한다. ①(상증법 평가액)도 ②(§164④~⑦)도 없으면 그 예외에 해당한다고
   * **선언**해야 나목으로 갈 수 있다 — 비워둔 것이 곧 선언은 아니다.
   *
   * ⚠️ **엔진에 보내지 않는다**(validate 계층 게이트). 선언 결과는 payload에 이미 드러난다 —
   *    ① 미입력이면 `reportedValue` 키가 실리지 않아 `clauseA=0` → `converted`로 간다.
   */
  preDeemedClauseAUnconfirmed: boolean;
  /** 직접 입력 취득가액 (매매 actual / 상속 manual / 증여 신고가액) */
  fixedAcquisitionPrice: string;

  // ── 자산별 소재지 (Step1 자산 편집 Sheet에서 입력) ──
  /** 주소 (Vworld 도로명) */
  addressRoad: string;
  /** 주소 (Vworld 지번) */
  addressJibun: string;
  /** 상세주소 */
  addressDetail: string;
  /** 선택한 동(예: "201동") — 공동주택 기준시가 조회 세대 식별 (UI 전용, 엔진 미전송) */
  addressDong: string;
  /** 선택한 호(예: "3204") — 공동주택 기준시가 조회 세대 식별 (UI 전용, 엔진 미전송) */
  addressHo: string;
  /** 건물명 */
  buildingName: string;
  /** 경도 */
  longitude: string;
  /** 위도 */
  latitude: string;

  // ── 조정대상지역 조회 결과 (주택 전용) ──
  /** 취득 시점 조정대상지역 여부 (주택만 조회, 비주택은 null) */
  isRegulatedAreaAtAcq: boolean | null;
  /** 양도 시점 조정대상지역 여부 (주택만 조회, 비주택은 null) */
  isRegulatedAreaAtTransfer: boolean | null;
  /**
   * 법정동코드 10자리 (AddressSearch PNU 앞 10자리).
   * 제공 시 엔진이 isRegulatedByBjdCode()로 정밀 판정.
   * 미제공 시 isRegulatedArea boolean fallback.
   */
  regionCode?: string;
  /**
   * 전체 PNU 19자리 (AddressSearch 결과). UI 전용 — 건물 기준시가 모달 prefill 시
   * 건축물대장 조회(BuildingRegisterLookupField) 활성화용. 엔진/검증 입력 아님.
   * 미제공(레거시·PNU 없는 주소) 시 모달에서 재조회 필요(종전 동작).
   */
  addressPnu?: string;

  // ── 취득시기 상이 필지 분리 (assetKind === "land" 전용) ──
  /** 토지 내 취득시기 상이 필지 분리 계산 여부 (소득세법 시행령 §162①9호 단서) */
  parcelMode: boolean;
  /** 취득시기 상이 필지 목록 */
  parcels: ParcelFormItem[];

  isOneHousehold: boolean;
  /** 거주 정보 — 1세대1주택 표2 장특공제용 (자세한 타입은 calc-wizard-asset-residence.ts) */
  residenceInputMode: "interval" | "direct";
  residencePeriods: ResidencePeriod[];
  residencePeriodMonthsAsset: string;
  /** actual 모드 시 이 자산의 계약서상 양도가액 */
  actualSalePrice: string;
  /**
   * 공유 지분율 분자 (기본 100). 같은 물건을 다회 분할 취득(지분 단계취득)한 자산에서
   * 본 자산이 보유한 지분의 분자. 미설정 시 100 (단독 소유).
   * UI 입력은 100% 기준값(양도가·취득가·필요경비 등 모든 금액). API 변환 시 × ratio 자동 적용.
   * 예제 사례 27 (아파트 2회 지분취득) 패턴.
   */
  ownershipNumerator: string;
  /**
   * 공유 지분율 분모 (기본 100). 100/100 = 단독 소유.
   */
  ownershipDenominator: string;
  /**
   * 「나머지 지분은 타인 소유」 선언 — **표시·검증 전용. API로 보내지 않는다.**
   *
   * 지분율 < 100%인 **단건** 자산은 폼 데이터만으로 두 사용자가 구별되지 않는다:
   *  - 축 A(공유 소유): 물건의 60%만 내 것 → 이 1건으로 계산하는 것이 **정확**
   *  - 축 B 오입력: 100% 내 것인데 60%+40% 2회 취득 → 나머지 40%가 **통째로 누락**
   *
   * 그래서 종전에는 둘 다 막았다(`transfer-tax-validate-asset.ts` Gate-A). 그런데 ① 기본정보에는
   * 「공유 지분율」 입력칸과 「100% 기준으로 입력하세요」 안내가 **그대로 렌더**되어(`AssetSectionBasic`),
   * 값을 넣으면 통과 경로가 없는 dead-end였다(memory `feedback_ui_gate_removes_sole_input_path`).
   *
   * ⇒ 사용자가 **스스로 축 A임을 선언**하면 통과시킨다. 판정은 사용자, 계산은 엔진.
   *   자동판정은 금지다 — 폼 데이터로 판별 불가라 추정하면 조용히 틀린다.
   *
   * 계산에는 영향이 없다. 세액은 `ownershipNumerator/Denominator`가 결정하고 그 배선
   * (④⑫⑬⑭ + 엔진)은 이미 완비돼 있다. 이 필드는 게이트 통과 신호일 뿐이다.
   *
   * 계획서: `docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md`
   */
  ownershipRemainderThirdParty: "" | "yes";
  /** 취득 원인 — purchase=매매, inheritance=상속, gift=증여, carryover_gift=이월과세(증여), newConstruction=신축(자가건축)
   * @deprecated `"burdened_gift"`는 D-1(2026-05-12) 이후 deprecation. 양도 시점의 거래 형태이지 취득 사건이 아님.
   * 신규 데이터는 `transferType: "burdened_gift"` 사용. 레거시 데이터는 normalize에서 자동 변환.
   */
  acquisitionCause: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction" | "burdened_gift";

  /**
   * 양도 형태 (양도자 관점) — Phase 2(2026-05-12) 신규.
   * "regular": 일반 양도 (매매·교환 등)
   * "burdened_gift": 부담부증여 (소령 §159) — 채무 인수분을 유상 양도로 의제
   * "": 미선택 (UI 기본값 "regular"로 자동 보정)
   *
   * 부담부증여는 "취득" 사건이 아니라 "양도" 사건이므로 acquisitionCause와 별도 차원의 필드.
   * 부담부증여 ON 시 acquisitionCause는 증여자 당초 취득 정보(매매·상속·증여·신축)를 받음.
   */
  transferType: "" | "regular" | "burdened_gift";

  // ── 공익수용·협의매수 (양도원인) — #1 NBL 의제·#2 §77 감면·#3 환산 min[] 공용 사실 ──
  /**
   * 양도원인 — 공익수용·협의매수 여부. 기본 "general".
   * (종전 주석의 "assetKind==='land' 전용"은 **사실이 아니다** — `TransferModeBlock`의
   *  `SUPPORTED_ASSET_KINDS` 5종(housing·land·building·general_building·commercial_building)에 노출된다.)
   */
  transferCause: "general" | "public_expropriation";
  /**
   * 사업인정고시일 (YYYY-MM-DD) — NBL(§168의14③3호)·§77 고시일 단일 소스.
   * NBL publicNoticeDate·§77 businessApprovalDate에 fallback(`섹션필드 || 이 값`)으로 공급.
   */
  expropriationNoticeDate: string;
  /**
   * 보상가액 (원/㎡) — 양도당시 기준시가 차감 특례(**소득세법 시행령 §164⑨ 1호**)의 후보②.
   * 현행 노출 조건: 환산 + 토지 + 양도 ≥ 2009.02.04 (게이트가 법령 범위보다 좁음 — 계획 P3).
   * ※ 다필지는 필지별 값을 쓴다(`ParcelFormItem.compensationPerSqm`) — 필지마다 공시지가가 달라
   *   min[] 선택이 독립이기 때문. 이 자산-수준 필드는 단건 경로 전용.
   */
  compensationPerSqm: string;
  /** 보상액 산정의 기초가 되는 기준시가 (원/㎡) — 위 min[]의 후보③ */
  compensationBasisStdPrice: string;
  /**
   * §164⑨2호 공매·경락 대상 여부 (계획 P4). transferCause(1호 수용)와 **배타(N3)**.
   * ON 시 auctionPrice로 min(양도당시 기준시가 총액, 공매·경락가액). land·building UI 노출.
   */
  isAuctionTransfer: boolean;
  /** 그 공매 또는 경락가액 (총액, 원) — §164⑨2호 min의 후보 */
  auctionPrice: string;
  /**
   * 주택 수용 보상액 총액 (원) — §164⑨1호 주택 총액 트랙(P5). 개별주택가격은 총액이라
   * 원/㎡ 후보(compensationPerSqm)가 아닌 총액을 쓴다. housing 자산 전용.
   */
  housingCompensationTotal: string;
  /** 주택 수용 보상액 산정 기초 기준시가 총액 (원) — §164⑨1호 주택 총액 min 후보 */
  housingCompensationBasisTotal: string;
  /**
   * 토지분 보상액 총액 (원) — §164⑨1호 건물 split 토지분 트랙(P6/D6). 토지·건물 취득일 분리
   * 양도 시, **토지분** 환산 분모만 min(양도시 토지 기준시가 총액, 보상액, 보상기초)로 낮춘다.
   * 건물(나목) split 전용. 주택 split은 총액 미분해라 미지원(Q6 — validate 차단).
   */
  splitLandCompensationTotal: string;
  /** 토지분 보상액 산정 기초 기준시가 총액 (원) — §164⑨1호 건물 split min 후보 */
  splitLandCompensationBasisTotal: string;

  // ── 신축(자가건축) 취득일 4-시점 (영 §162①4호) ──
  /**
   * 사용승인일 (YYYY-MM-DD) — 영 §162①4호 취득일 기준.
   * 신축주택의 취득일은 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 가장 이른 날.
   * acquisitionCause === "newConstruction" 시 필수 (또는 4시점 중 최소 1개).
   */
  occupancyApprovalDate: string;
  /**
   * 사용검사필증 교부일 (YYYY-MM-DD) — 도시계획법·건축법 용어 차이로 별도 입력.
   * 영 §162①4호: 실무상 사용승인일과 동일하거나 별도 시점일 수 있음. 입력 시 4시점 비교에 포함.
   */
  approvalCertificateDate: string;
  /**
   * 임시사용승인일 (YYYY-MM-DD) — 사용승인일보다 이른 경우에만 입력.
   * 영 §162①4호: 임시사용승인일이 사용승인일보다 이르면 임시사용승인일을 취득일로 봄.
   */
  temporaryApprovalDate: string;
  /**
   * 사실상 사용일 (YYYY-MM-DD) — 사용승인 전 실제 입주·사용한 경우.
   * 영 §162①4호: 사실상 사용일이 가장 이른 날이면 이 날을 취득일로 봄.
   */
  actualUseDate: string;

  // ── 부수토지 한도 산정 (영 §167의5 — 세율 축, 3단계) ──
  /**
   * @deprecated isUrbanArea 단일 boolean은 영 §167의5 3단계(3/5/10배) 표현 못함.
   * 신규 입력은 appurtenantLandZone 사용. 하위호환 위해 유지.
   */
  isUrbanArea: boolean | undefined;
  /**
   * 부수토지 인정 한도 zone (영 §167의5):
   * - "metropolitan_residential": 수도권 도시지역 + 주거·상업·공업 → 3배
   * - "non_metropolitan_or_green": 수도권 녹지 또는 수도권 외 도시지역 → 5배
   * - "non_urban": 도시지역 외 → 10배
   * undefined: 미선택 (자동 분기 시 가장 보수적 3배 적용)
   */
  appurtenantLandZone:
    | "metropolitan_residential"
    | "non_metropolitan_or_green"
    | "non_urban"
    | undefined;

  // ── companion 토지 세율 수동 오버라이드 ──
  /**
   * 부수토지 세율 수동 오버라이드.
   * undefined: 자동 분기 (엔진이 조건 판단)
   * "shortTermHousing70": 70% 강제 (주택 단기 세율)
   * "shortTerm60":        60% 강제 (1~2년 단기 세율)
   * "progressive":        누진세율 강제 (기본세율)
   */
  manualHoldingPeriodOverride: "shortTermHousing70" | "shortTerm60" | "progressive" | undefined;

  // ── 토지 자산 성격 (사례 28 — landNature 명시 입력 정책) ──
  /**
   * 토지 자산의 성격 (assetKind === "land" 전용).
   * - "appurtenant": 부수토지 — 주택·건물에 딸린 토지 (§89①3가 비과세 대상)
   * - "standalone":  독립 나대지 — 주택·건물과 무관한 순수 토지
   * undefined: 미선택 (일괄양도 land+housing 조합 시 validate에서 차단)
   *
   * 이 필드는 엔진이 appurtenantLandRateMode(폼-수준) 대신 자산-수준에서 일체과세 판단을 위해 사용.
   * 단독 토지 양도 시에는 엔진에 전달되지만 "standalone"이면 일체과세 분기를 타지 않음.
   */
  landNature: "appurtenant" | "standalone" | undefined;
  /** 이월과세(증여) 서브객체 — acquisitionCause === "carryover_gift" 시만 사용 (§97조의2) */
  carryover?: CarryoverTaxationForm;
  /** 본인 취득일 (YYYY-MM-DD) */
  acquisitionDate: string;
  /**
   * 매매계약일 — 분양계약일/일반매매계약일 (계약금 납부 기준일).
   * Round 9 (2026-05-06): 신축·미분양·임대 감면 13개 조문(§99·§99의3·§98 시리즈·§97의2·§97의5·§99의2)의
   * 시한 판정 1차 기준. 미입력 시 acquisitionDate fallback (조문 단서: "매매계약 + 계약금 납부 = 취득").
   * 주택 자산만 의미 있음. 토지·건물은 미사용.
   */
  assetContractDate?: string;
  /** 피상속인 취득일 (상속 시 단기보유 통산용, YYYY-MM-DD) */
  decedentAcquisitionDate: string;
  /** §154⑧3호 — 상속개시 당시 상속인·피상속인 동일세대 여부 (상속주택 자체 양도 보유기간 통산) */
  decedentSameHouseholdBeforeInheritance: boolean;
  /** §154⑧3호 — 상속개시 전 동일세대 거주·보유 개시일 (YYYY-MM-DD, 비과세 보유기간 기산) */
  decedentCohabitationHoldingStartDate: string;
  /** §154⑧3호 — 상속개시 전 동일세대 통산 거주 개월 (비과세 거주요건·표2 대상 판정용, 공제율은 실거주 별도) */
  decedentCohabitationResidenceMonths: string;
  /** 증여자 취득일 (YYYY-MM-DD) */
  donorAcquisitionDate: string;
  /** 매매 환산취득가 사용 여부 */
  useEstimatedAcquisition: boolean;
  /** 매매 감정가액 사용 여부 (소득세법 §97 + 시행령 §163⑥). useEstimatedAcquisition과 상호 배타.
   *  true 시 fixedAcquisitionPrice를 감정가액으로 해석, 개산공제 자동 적용. */
  isAppraisalAcquisition: boolean;
  /** 매매사례가액(추계) 취득 모드 — 소득세법 시행령 §176의2③1호.
   *  useEstimatedAcquisition·isAppraisalAcquisition 모두 false 일 때 매매사례가액 모드 선택 가능.
   *  3중 배타: isSalesCaseAcquisition=true 이면 다른 두 모드는 false 강제. */
  isSalesCaseAcquisition: boolean;
  /** 매매사례가액 (원) — isSalesCaseAcquisition=true 시 엔진으로 전달.
   *  RTMS 자동조회 onSelect 콜백으로만 자동채움. 수동 수정 시 similarSalesSource 제거. */
  similarSalesValue: string;
  /** RTMS 자동조회 출처 배지 — "rtms_auto" | undefined. 수동 수정 시 제거. */
  similarSalesSource: "rtms_auto" | undefined;
  /** 취득 주소의 시군구코드 (5자리) — RtmsSimilarSalesModal sigunguCode prop.
   *  주소 AddressSearch onChange → resolveSigunguCode()로 파생. NBL 전용 nblLandSigunguCode와 별개. */
  acquisitionSigunguCode: string;
  /** 본인이 신축·증축한 건물 여부 (§114조의2 가산세). acquisitionCause === "purchase" + 매매·housing/building 전용 */
  isSelfBuilt: boolean;
  /** 신축·증축 구분 */
  buildingType: "new" | "extension" | "";
  /** 신축·증축 완공일 (YYYY-MM-DD) */
  constructionDate: string;
  /** 증축 시 증축 부분 바닥면적 (㎡) — buildingType === "extension" 필수 */
  extensionFloorArea: string;
  /**
   * 증축부분 취득(증축완공)당시 기준시가 총액 (원).
   * buildingType === "extension" + K-5 환산 시 §114조의2① 증축부분 한정 base 산출용.
   * ★ extensionStdPriceAtTransfer(증축부분 양도기준시가)는 §176의2②2호 산식에서 상쇄되므로 입력 불필요.
   */
  extensionStdPriceAtAcquisition: string;

  // ── 토지/건물 취득일 분리 (housing·building 공통) ──
  /**
   * 토지·건물의 소유자가 다른 경우 본인 소유 부분 지정 (소령 §166⑥, §168②).
   * "both" (기본): 토지·건물 모두 본인.
   * "building_only": 건물만 본인 (토지는 배우자·타인 소유).
   * "land_only": 토지만 본인.
   */
  selfOwns: "both" | "building_only" | "land_only";
  /** 토지와 건물의 취득일이 다른지 여부 (원시취득·신축 등) */
  hasSeperateLandAcquisitionDate: boolean;
  /** 토지 취득일 (YYYY-MM-DD) — hasSeperateLandAcquisitionDate === true 시 필수 */
  landAcquisitionDate: string;
  /**
   * **토지 파트의 취득 원인** — 건물을 신축하고 그 토지는 상속·증여로 취득한 경우(2026-07-30).
   *
   * `acquisitionCause`는 자산 단위 단일값이라 "건물=신축 / 토지=상속"을 표현할 수 없었다.
   * ""(미설정)이면 토지도 자산 전체 원인을 따른다(종전 동작).
   *
   * ⚠️ **엔진에는 전달하지 않는다.** 엔진은 파트별 취득 *방식*(`landAcqMode` 4-way)만 알고
   *    취득 *원인*은 모른다. 이 값은 취득가액 칸의 라벨·안내를 바꾸는 **UI 전용**이며,
   *    실제 계산은 사용자가 입력한 평가액이 `landAcquisitionPrice`(actual 모드)로 흐른다.
   *    상속 §163⑨ 평가액·증여 신고가액은 모두 "확인된 취득가액"이라 이 처리가 법령상 정합적이다.
   */
  landAcquisitionCause: "" | "inheritance" | "gift";
  /**
   * 토지 파트 피상속인 취득일 — `landAcquisitionCause === "inheritance"` 시 「소득세법」
   * 제104조 제2항 제1호 보유기간 통산(세율 판정)에 쓰인다. 미입력 시 토지 취득일 기준(현행).
   */
  landDecedentAcquisitionDate: string;
  /** 토지 파트 증여자 취득일 — `landAcquisitionCause === "gift"` 시 §104②2호 통산 */
  landDonorAcquisitionDate: string;
  /**
   * 토지 파트 취득 방식 — 4-way 독립(소득령 §166⑥, 토지·건물 취득일 분리 모드 전용).
   * `landSplitMode`(구, 취득·양도 겸용 토글)를 대체 — 취득은 이 필드가 단일 소스.
   * ""(미선택) 시 자산 전체 레거시 플래그에서 파생 — `lib/calc/transfer-tax-split-acq-mode.ts` 참조.
   */
  landAcqMode: "" | "actual" | "estimated" | "appraisal" | "salesCase";
  /** 건물 파트 취득 방식 — landAcqMode와 완전 독립(파트별 4-way) */
  buildingAcqMode: "" | "actual" | "estimated" | "appraisal" | "salesCase";
  /**
   * 양도가액 **토지·건물 안분 방식** — 이 자산 **내** 토지·건물 분리 축.
   * 자산 **간** 일괄양도 안분 축인 `bundledSaleMode`(폼-전역)와 레벨이 달라 공존한다.
   *
   * | 값 | 의미 | 근거 |
   * |---|---|---|
   * | `"actual"` | 구분양도 — 계약서에 구분 기재 | 「소득세법」 §100② |
   * | `"appraisal"` | 감정평가액으로 안분 | §166⑥ → 「부가가치세법 시행령」 §64①1호 |
   * | `"apportioned"` | 양도시 기준시가 비율로 안분 (기본) | §166⑥ → 부가령 §64①2호 |
   *
   * 🔴 **`"appraisal"`은 2026-08-07 신설**이다. 종전에는 「일괄양도」 라디오 + 「감정평가가액으로
   *    안분」 **토글**이 따로 있어, 라디오 라벨이 「기준시가 비율로 안분」인데 토글을 켜면 실제로는
   *    감정평가액으로 안분되는 **라벨-동작 모순**이 있었다(사용자 보고). 안분 basis는 축 하나이므로
   *    3-way 라디오로 합쳤다.
   *
   * ⚠️ **엔진은 이 필드를 읽지 않는다**(`transfer-tax-api-split.ts:75` 실측). 실제 스위치는
   *    payload에 값이 실리는지 여부다 — `"actual"`이면 `land/buildingTransferPrice`,
   *    `"appraisal"`이면 `land/buildingAppraisalAtTransfer`가 전달된다. 그래서 모드를 바꿀 때
   *    **쓰지 않는 쪽 값을 비워야** 화면에 없는 값이 basis를 조용히 가르지 않는다.
   */
  saleSplitMode: "apportioned" | "actual" | "appraisal";
  /**
   * 양도시 **감정평가가액** — 안분 basis 서열 **1순위**
   * (「부가가치세법 시행령」 제64조 제1항 제1호 단서 · 「소득세법 시행령」 제166조 제6항이 차용).
   * 있으면 양도시 기준시가보다 **우선**해 양도가액을 안분한다.
   *
   * ⚠️ 토지·건물 **양쪽 다** 있어야 채택된다 — 한쪽만이면 엔진이 「미평가」로 보고 배제한다.
   */
  landAppraisalAtTransfer: string;
  /** 양도시 감정평가가액 (건물분) — 위와 동일한 규칙 */
  buildingAppraisalAtTransfer: string;
  /**
   * 감정일자 — **시기 요건 판정에 필수**다. 유효 창 = [(양도연도 − 1)-01-01, 양도연도-12-31]
   * (부가령 §64①1호 괄호 + 「소득세법」 제5조 제1항 역년). 벗어나면 기준시가로 후퇴한다.
   */
  appraisalDateAtTransfer: string;
  /**
   * 「소득세법 시행령」 제166조 제8항 **예외** — 선택하면 §100③ 30% 의제가 발동하지 않는다.
   * 3-state(`partialAcqDistinct` 선례): ""(미선택) 기본.
   */
  saleSplitExemption: "" | "other_law" | "demolished_land_only";
  /** 예외 **근거** — 선택 시 필수(validate 차단). 남용 억제 + 신고서 각주 재료. */
  saleSplitExemptionNote: string;
  /** 토지 파트 매매사례가액 (원) — landAcqMode === "salesCase" 시 직접입력, 미입력 시 §166⑥ 안분 */
  landSalesCaseValue: string;
  /** 건물 파트 매매사례가액 (원) — buildingAcqMode === "salesCase" 시 직접입력 */
  buildingSalesCaseValue: string;
  /** 토지 양도가액 (실제 모드 또는 안분 override) */
  landTransferPrice: string;
  /** 건물 양도가액 (실제 모드 또는 안분 override) */
  buildingTransferPrice: string;
  /** 토지 취득가액 (실거래가 모드 시) */
  landAcquisitionPrice: string;
  /** 건물 취득가액 (실거래가 모드 시) */
  buildingAcquisitionPrice: string;
  /** 토지 자본적지출·필요경비 */
  landDirectExpenses: string;
  /** 건물 자본적지출·필요경비 */
  buildingDirectExpenses: string;
  /** 토지 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  landStandardPriceAtTransfer: string;
  /** 건물 양도시 기준시가 — 환산취득가 분리 계산 시 사용 */
  buildingStandardPriceAtTransfer: string;

  // ── 개별주택가격 미공시 취득 환산 (§164⑤) ──
  /** true 시 3-시점 미공시 취득 환산 모드 활성화 */
  usePreHousingDisclosure: boolean;
  /** 최초 고시일 (YYYY-MM-DD, 사용자 직접 입력) */
  phdFirstDisclosureDate: string;
  /** 최초 고시 개별주택가격 P_F (원) */
  phdFirstDisclosureHousingPrice: string;
  /** 취득당시 선택 연도 (문자열 "2013" 등, 자동추천 또는 수동 변경) */
  phdLandPriceYearAtAcq: string;
  /** true = 수동 변경됨, false = 자동추천 */
  phdLandPriceYearAtAcqIsManual: boolean;
  /** 취득당시 토지 단위 공시지가 (원/㎡) — **토지값 트랙**(부수토지 기준시가 = 공시지가 × 면적). 엔진 입력 */
  phdLandPricePerSqmAtAcq: string;
  /**
   * 취득 ≤2000 — 2001.1.1 현재 단위 공시지가 (원/㎡). **위치지수 트랙**(건물 기준시가 산정, 소령 §164⑤).
   * `phdLandPricePerSqmAtAcq`(취득당시 연도 토지값)와 의미가 달라 혼용 금지 — 트랙 판정은
   * `lib/calc/phd-acq-land-price-track.ts` 단일 소스.
   * **엔진 미전달(UI 전용)**: 배치 모달 입력 보존 + 상가건물 모달 prefill 소스.
   */
  phdLandPricePerSqmAtAcq2001: string;
  /** 취득당시 건물 기준시가 (원) */
  phdBuildingStdPriceAtAcq: string;
  /** 최초공시일 선택 연도 */
  phdLandPriceYearAtFirst: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtFirstIsManual: boolean;
  /** 최초공시일 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtFirst: string;
  /** 최초공시일 건물 기준시가 (원) */
  phdBuildingStdPriceAtFirst: string;
  /** 양도시 개별주택가격 P_T (원) */
  phdTransferHousingPrice: string;
  /** 양도시 선택 연도 */
  phdLandPriceYearAtTransfer: string;
  /** true = 수동 변경됨 */
  phdLandPriceYearAtTransferIsManual: boolean;
  /** 양도시 토지 단위 공시지가 (원/㎡) */
  phdLandPricePerSqmAtTransfer: string;
  /** 양도시 건물 기준시가 (원) */
  phdBuildingStdPriceAtTransfer: string;
  /**
   * 겸용주택 PHD 주택부수토지 면적 수동 지정 (㎡).
   * 비어 있으면 엔진이 양도시 주택연면적 비율로 자동 계산.
   * 최초 공시 당시 전체가 주택이었던 경우 전체 토지 면적으로 수정.
   */
  phdResidentialLandArea: string;

  /**
   * Case A 4부분 안분 전용 (취득시 전체 주택 → 양도시 일부 상가, 최초공시 < 용도변경일).
   * 엑셀 사례 기준: 취득시·최초공시 시점에는 건물 전체가 주택이었으나
   * 양도시점 기준으로 "주택건물 부분"과 "상가건물 부분"의 기준시가를 각각 분리 입력.
   * Case A 비활성 시 빈 문자열 유지.
   */
  /** 취득시 상가건물 기준시가 (원) — Case A 4부분 안분용 */
  phdCommercialBuildingStdPriceAtAcq: string;
  /** 최초공시일 상가건물 기준시가 (원) — Case A 4부분 안분용 */
  phdCommercialBuildingStdPriceAtFirst: string;

  /** 매매 estimated 시 취득시점 기준시가 (원, 환산 분자) */
  standardPriceAtAcq: string;
  /** 취득시 기준시가 레이블 (API 조회 결과 표시용) */
  standardPriceAtAcqLabel: string;
  /** 의제취득일(1985.1.1.) 시점 기준시가 직접 입력 override 사용 여부 (PreDeemedInputs 전용) */
  useStandardPriceAtAcqOverride: boolean;
  /** 양도시 기준시가 직접 입력 override 사용 여부 (PreDeemedInputs 전용) */
  useStandardPriceAtTransferOverride: boolean;

  /**
   * 건물분 취득시 기준시가 (원) — `assetKind==="building"` + 토지·건물 취득시기 상이 전용.
   *
   * 소득세법 §99①1호 나목(국세청장 산정·고시). 기준일은 **건물 취득일**의 직전 고시분(소득령 §164③) —
   * 토지분(㎡당 공시지가 × 면적)은 토지 취득일 기준이라 시점이 다르다.
   * 미입력 시 `standardPriceAtAcq` 총액에서 역산으로 후퇴한다(한시).
   */
  buildingStandardPriceAtAcq: string;

  /** 취득 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtAcq: string;
  /** 양도 시점 ㎡당 공시지가 (원/㎡, 토지·비주거건물 전용) */
  standardPricePerSqmAtTransfer: string;

  // ── 상속 주택 환산취득가 보조 입력 (주택 자산 + 상속개시일 < 2005-04-30) ──
  /** true 시 3-시점 보조 계산 활성화 */
  inhHouseValEnabled: boolean;
  /** 최초 고시일 (기본 "2005-04-30") */
  inhHouseValFirstDisclosureDate: string;
  /** 토지 면적 (㎡) */
  inhHouseValLandArea: string;
  /** 양도시 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtTransfer: string;
  /** 최초고시 시점 개별공시지가 (원/㎡) */
  inhHouseValLandPricePerSqmAtFirst: string;
  /** 상속개시일 시점 개별공시지가 (원/㎡) — 1990-08-30 이후 시 직접 입력 */
  inhHouseValLandPricePerSqmAtInheritance: string;
  /** 양도시 개별주택가격 (원) */
  inhHouseValHousePriceAtTransfer: string;
  /** 최초고시 시점 개별주택가격 (원) */
  inhHouseValHousePriceAtFirst: string;
  /** 양도당시 건물기준시가 (원) — 국세청 기준시가. 양도시 합계 기준시가의 건물 성분 */
  inhHouseValBuildingStdPriceAtTransfer: string;
  /** 최초고시 시점 건물기준시가 (원) — §164⑤ Sum_F 분모: 토지기준시가 + 이 값. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtFirst: string;
  /** 상속개시일 시점 건물기준시가 (원) — §164⑤ Sum_A 분자의 건물 성분. 국세청 기준시가 */
  inhHouseValBuildingStdPriceAtInheritance: string;
  /** 상속개시일 시점 주택가격 직접 입력 override 사용 여부 */
  inhHouseValUseHousePriceOverride: boolean;
  /** 상속개시일 시점 주택가격 직접 입력 override (원) */
  inhHouseValHousePriceAtInheritanceOverride: string;
  // 1990-08-30 이전 토지 등급가액 환산은 기존 pre1990* 7필드 재사용

  // ── 1990.8.30. 이전 취득 토지 환산 (assetKind === "land" + acquisitionDate < 1990-08-30) ──
  pre1990Enabled: boolean;
  pre1990PricePerSqm_1990: string;
  pre1990PricePerSqm_atTransfer: string;
  pre1990Grade_current: string;
  pre1990Grade_prev: string;
  pre1990Grade_atAcq: string;
  pre1990GradeMode: "number" | "value";


  // ── 비사업용 토지 정밀 판정 → NblJudgmentFormSlice (calc-wizard-asset-nbl-judgment.ts)
  // ── 상속 부동산 취득가액 의제 — InheritanceAcquisitionFormSlice (calc-wizard-asset-inheritance-acq.ts) ──

  // ── 장기임대주택 보유자 거주주택 비과세 특례 (소령 §155⑳) ──
  rentalHousingException: {
    applyException: boolean;
    /** 거주주택 양도(A) / PHRP 양도(B) */
    scenario: 'A' | 'B';
    rentalUnits: Array<{
      /** 세무서 사업자등록일 §168 (YYYY-MM-DD) */
      businessRegistrationDate: string;
      /** 지자체 임대사업자등록신청일 민특법§5 (YYYY-MM-DD) */
      rentalRegistrationDate: string;
      /** 임대구분 (의무기간·cap 파생 소스). existing_business=나목·unsold_08_09=라목(미분양) */
      rentalCategory: 'long_general' | 'short_6y' | 'pre_2018' | 'existing_business' | 'unsold_08_09';
      rentalAcquisitionType: 'purchase' | 'construction';
      isApartment: boolean;
      /** 소재지역 수도권/비수도권 (918 조정취득은 isExcluded918Rule 별도) */
      region: 'seoul-metro' | 'non-metro';
      /** 소재지 법정동코드 10자리 (주소 검색 시 자동 채움 — region 자동판별 소스·자동배지 신호). 미검색 시 "" */
      regionCode: string;
      /** 918 조정취득 배제(2018.9.14 이후 조정대상지역 신규취득). 마목 hard·아목 carve-out */
      isExcluded918Rule: boolean;
      /** 아목 918 carve-out — 조정대상지역 공고 전 계약 + 계약금 지급 증빙 */
      hasContractDepositProof: boolean;
      /** 마·바목 단기→장기 변경신고 배제 여부 */
      isExcludedShortToLongChange: boolean;
      /** 임대개시일 기준시가 (원, 문자열) — 가/다/마/바/아/자/구법 */
      standardPriceAtRentalStart: string;
      /** 취득당시 기준시가 (원, 문자열) — 나목(취득당시 3억) */
      acquisitionOfficialPrice: string;
      /** 국민주택규모 충족 자기확인 — 나목 */
      isNationalSizeHousing: boolean;
      /** 대지면적 ㎡ (건설임대 규모요건, 문자열) */
      rentalLandArea: string;
      /** 연면적/전용면적 ㎡ (건설임대 규모요건, 문자열) */
      rentalTotalFloorArea: string;
      /** 2호 이상 임대 충족 자기확인 (건설임대·나목) */
      hasMinimum2Units: boolean;
      /** 같은 시·군 5호 이상 임대 충족 (라목 미분양) */
      hasMinimum5UnitsInCity: boolean;
      /** 최초 분양계약일 (라목 미분양 2008.6.11~2009.6.30, YYYY-MM-DD) */
      firstSaleContractDate: string;
      /** 실제 임대 개월 수 (direct 모드 값·legacy fallback) */
      rentalMonths: string;
      /** 임대기간 입력 모드 — direct(개월 직접)·interval(시작~종료일 다중 기간) */
      rentalInputMode: "interval" | "direct";
      /** 임대 구간 (interval 모드, 비연속 허용). 개월은 API 변환 시 deriveRentalMonths로 합산 */
      rentalPeriods: Array<{ start: string; end: string }>;
      /** 임대주택 지번 주소 — 임대개시일 기준시가 Vworld 조회용(UI 상태·엔진 미전송) */
      rentalAddressJibun: string;
      /** 공동주택 동(예: "324") — 임대개시일 기준시가 세대 식별용(UI 상태·엔진 미전송) */
      rentalDong: string;
      /** 공동주택 호(예: "1004") — 임대개시일 기준시가 세대 식별용(UI 상태·엔진 미전송) */
      rentalHo: string;
      /** §155⑳㉓ 말소 특례 — 자진(의무기간 1/2↑)·자동말소 후 5년 내 거주주택 양도 여부 (가·다·라·마목) */
      rentalAutoTermination: boolean;
      /** 기타 요건 충족 자기확인 (5%증액 등) */
      requirementsConfirmed: boolean;
    }>;
    /** B 시나리오: 직전거주주택 양도일 (YYYY-MM-DD) */
    priorResidenceTransferDate?: string;
    /** B 시나리오: 취득 당시 기준시가 P_acq (원, 문자열) */
    standardPriceAtAcquisitionForPhrp?: string;
    /** B 시나리오: 직전양도 당시 기준시가 P_prior (원, 문자열) */
    standardPriceAtPriorTransfer?: string;
    /** B 시나리오: 현 양도 당시 기준시가 P_transfer (원, 문자열) */
    standardPriceAtTransferForPhrp?: string;
  };


  // ── 일반건물(general_building) + 겸용주택 필드 → GeneralBuildingFormSlice로 분리 ──
  // (calc-wizard-asset-gb.ts — 800줄 정책 준수, Phase 2 2026-06-22)

  // ── 부담부증여 (소령 §159 + 증여세 통합 §53·§56·§57·§69 + §47② 사전증여 합산) ──
  // bg* 필드 일체는 BurdenedGiftFormSlice로 분리 (calc-wizard-asset-bg.ts).

  // ── 재개발/재건축 (시행령 §166) — RedevelopmentFormSlice로 분리 (calc-wizard-asset-redev.ts) ──

  // ── 가업상속공제 §97의2④ 의제 취득가액 (소령 §163의2③) ──
  /** 가업상속공제 의제 취득가액 입력. undefined = 미사용 (일반 §97 산식). */
  familyBusinessInheritance?: {
    /** 피상속인 원취득가액 (원) */
    decedentAcquisitionPrice: number;
    /** 상속개시일 현재 자산가액 (원) — §60·§63 보충적 평가 */
    inheritanceMarketValue: number;
    /** 가업상속공제적용률 0~1 (소령 §163의2③) */
    fbDeductionAppliedRate: number;
    /** 상속개시일 (YYYY-MM-DD) */
    inheritanceDate: string;
    /** 피상속인 자본적지출 — §97의2④1호 base에 가산(적용률이 곱해진다) */
    decedentCapitalExpenditure?: number;
  };
}

/** 하위 호환 별칭 — 기존 코드에서 CompanionAssetForm을 참조하는 곳에 사용 */
export type CompanionAssetForm = AssetForm;
