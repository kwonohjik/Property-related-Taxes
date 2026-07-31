import type { ZoneType } from "../non-business-land/types";
import type { PreHousingDisclosureInput, PreHousingDisclosureResult, TransferTaxInput } from "./transfer.types";
import type { AmendmentDetail } from "./transfer-amendment.types";
import type { ExprTotalValuationDetail } from "../transfer-tax-expropriation-valuation";
import type { InheritedAcquisitionDetail } from "../transfer-tax-mixed-use-inheritance";
import type {
  MultiHouseSurchargeInput,
  MultiHouseSurchargeResult,
} from "./multi-house-surcharge.types";

/** §164⑨1호 겸용주택 공익수용 특례 산출근거 (계획 P7/D8) — 주택분·상가분 각 목별. */
export interface MixedUseExpropriationDetail {
  /** 주택분(라목 개별주택가격 총액) */
  housing?: ExprTotalValuationDetail;
  /** 상가분(가목 토지 기준시가) */
  commercialLand?: ExprTotalValuationDetail;
}

/**
 * 겸용주택(1세대 1주택 + 상가) 양도소득세 분리계산 타입
 *
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분부터 주택연면적 ≥ 상가연면적이라도 강제 분리.
 * 설계 문서: docs/02-design/features/transfer-tax-mixed-use-house.engine.design.md
 */

// ──────────────────────────────────────────
// 입력 타입
// ──────────────────────────────────────────

/**
 * 양도시 또는 취득시 기준시가 (주택부분 + 상가부분 구분)
 *
 * - 주택부분 = 개별주택공시가격 (주택건물 + 주택부수토지 일괄 단일값)
 * - 상가부분 = (개별공시지가 × 상가부수토지 면적) + 상가건물 기준시가
 */
export interface MixedUseStandardPrice {
  /** 개별주택공시가격 — 주택건물+주택부수토지 일괄 */
  housingPrice: number;
  /** 상가건물 기준시가 — 토지 제외, 국세청 고시 */
  commercialBuildingPrice: number;
  /** 개별공시지가 (원/㎡) — 상가부수토지 산정용 */
  landPricePerSqm: number;
}

/**
 * 겸용주택 자산-수준 입력.
 * AssetForm.assetType === "mixed-use-house" 일 때 활성화.
 */
export interface MixedUseAssetInput {
  /** 겸용주택 분리계산 플래그 */
  isMixedUseHouse: true;

  // ── 면적 (㎡, 건축물대장) ──
  /** 주택 연면적 (4·5층 단독주택 등 거주용 합계) */
  residentialFloorArea: number;
  /** 비주택(상가·사무·근린·주차장) 연면적 합계 */
  nonResidentialFloorArea: number;
  /** 건물 정착면적 = 1층 면적. 부수토지 배율 초과 판정 기준 */
  buildingFootprintArea: number;
  /** 전체 토지 면적 */
  totalLandArea: number;
  /**
   * [신규] 주택 부수토지 면적 수동 지정 (㎡) — PHD OFF(일반 §97) 전용.
   * ⚠️ 취득·양도 양시점 공통 필지 면적(용도변경 없으면 acqDerived=derived). 시점 무관.
   * 미제공(undefined) 시 `totalLandArea × 주택연면적비율`로 자동 산출. 0은 적법(three-state).
   * PHD ON 경로는 preHousingDisclosure.landArea가 담당하므로 배타 —
   * API 변환에서 usePreHousingDisclosure=false일 때만 주입.
   */
  residentialLandAreaOverride?: number;

  /**
   * [신규] 상가 부수토지 면적 수동 지정 (㎡) — PHD OFF(일반 §97) 전용.
   * ⚠️ 취득·양도 양시점 공통 필지 면적. `residentialLandAreaOverride`와 동일 축.
   * 미제공(undefined) 시 `residualArea(totalLandArea, 주택부수토지)` 잔액. 0은 적법(three-state).
   * 주택·상가 **둘 다 제공** 시 각 값을 그대로 사용(잔액 미적용) → 합계 불일치 가능 → validate가 차단.
   */
  commercialLandAreaOverride?: number;

  /**
   * [신규] 주택 정착면적 수동 지정 (㎡) — §168의12 배율초과 NBL 판정에 사용.
   * 미제공(undefined) 시 `buildingFootprintArea × 주택연면적비율`. 0은 적법(three-state).
   * 상가 정착면적은 항상 잔액이며 별도 필드가 없다(엔진 소비처 0건 — UI 표시 전용).
   */
  residentialFootprintOverride?: number;

  // ── 분리 취득일 ──
  /** 토지 취득일. 사례14 = 1992-01-01 */
  landAcquisitionDate: Date;
  /** 건물 취득일·신축일. 사례14 = 1997-09-12 */
  buildingAcquisitionDate: Date;

  /** 양도시 기준시가 */
  transferStandardPrice: MixedUseStandardPrice;
  /** 취득시 기준시가. housingPrice 미제공 시 PHD 환산 경로로 분기 */
  acquisitionStandardPrice: Omit<MixedUseStandardPrice, "housingPrice"> & {
    housingPrice?: number;
  };

  /** PHD 3-시점 자동 환산 옵션 (1992~2005 개별주택가격 미공시 케이스) */
  usePreHousingDisclosure?: boolean;
  /**
   * PHD 3-시점 환산 입력 — usePreHousingDisclosure=true 시 필수.
   * landArea: 미제공 시 엔진이 양도시 주택부수토지 면적으로 자동 주입.
   * 최초 공시 당시 전체가 주택이었던 경우 등 사용자가 직접 지정 가능.
   */
  preHousingDisclosure?: Omit<PreHousingDisclosureInput, "landArea"> & { landArea?: number };
  /**
   * 실거주 연수. 표2 활성 시 **거주분 공제율**(거주연수×4%, 최대 40%)에 사용.
   * 표2 게이트(대상 판정)는 `table2ResidencePeriodYears`(통산) 우선 — 미제공 시 이 값으로 fallback.
   */
  residencePeriodYears: number;

  /**
   * §154⑧3호 표2 '대상 판정'용 통산 거주 연수 (상속개시 후 실거주 + 상속개시 전 동일세대 통산 거주).
   * 표2 게이트(`useTable2`)만 이 값을 사용하고, 표2 거주분 공제율은 `residencePeriodYears`(실거주)를 별도 사용
   * (사전법령해석재산 2021-202: 대상 판정=통산, 공제율=상속개시일 기산). 두 기간은 disjoint.
   * 미제공 시 `residencePeriodYears`로 fallback(비상속·별도세대 = 실거주) → 기존 회귀 0.
   */
  table2ResidencePeriodYears?: number;

  /** 수도권 여부 — 배율 판정용 (미제공 시 true로 보수 처리) */
  isMetropolitanArea?: boolean;
  /** 도시지역 용도지역 — 배율 판정용 (non-business-land ZoneType과 동일) */
  zoneType?: ZoneType;

  /**
   * 1세대 1주택 비과세 요건 충족 여부.
   * - true: 주택분 양도가액 12억 이하 비과세, 거주 2년+ 시 표2 거주공제 (최대 80%)
   * - false: 다주택자·2년 미거주 등으로 1세대 1주택 비과세 미적용 → 12억 안분 X, 표1 적용
   *
   * AssetForm.isOneHousehold(L235) 값을 그대로 전달.
   * 미주입 시 true (기존 겸용주택 사례14 등 backward compat).
   */
  isOneHouseExempt?: boolean;

  // ── 영 §154① 요건 판정 입력 (Phase A — 거주요건 + 단서 각호 면제) ──
  // 셋 다 **폼-전역(top-level)** 값이다. 클라이언트는 `mixedUse` 객체가 아니라 body 최상위로
  // 보내므로(⑫ Zod는 이미 정의됨) route가 `mixedAsset` 조립 시 명시 주입한다
  // — `ownershipRatio`·`isUnregistered`와 같은 경로.

  /**
   * 취득 당시 조정대상지역 여부 (영 §154① 본문 후단) — **거주 2년** 요건 게이트.
   * 미주입(undefined) 시 false 취급 → 거주요건 면제(종전 동작 불변).
   */
  wasRegulatedAtAcquisition?: boolean;

  /**
   * 법정동코드 10자리. 제공 시 **건물 취득일 기준** `isRegulatedByBjdCode()` 정밀 판정,
   * 미제공 시 위 `wasRegulatedAtAcquisition` boolean fallback.
   */
  regionCode?: string;

  /**
   * 영 §154① **단서** 각호 면제 사유.
   * 1~3호 = 보유·거주 **둘 다** 면제 / 5호 = 거주만 면제 (법문 실측 2026-07-31).
   * ⚠️ 날짜 필드는 **Date 변환 완료본**만 주입할 것 — Zod 출력(string)을 그대로 넘기면
   *    `addYears`·`>=` 비교가 침묵 오작동한다(`lib/api/date-coerce.ts` 규약).
   */
  oneHouseExemptionProviso?: TransferTaxInput["oneHouseExemptionProviso"];

  /**
   * 법 §104⑦ 다주택 중과 판정 입력 — 정본 `determineMultiHouseSurcharge`에 그대로 넘긴다.
   *
   * `houses`·`presaleRights`·`isOneHousehold`·`isRegulatedArea`·`gracePeriod` 등은 전부
   * **폼-전역(top-level)** 값이라 `data.mixedUse`에 없다 → route가 조립해 주입한다.
   * 미주입(undefined)이면 중과 판정 자체를 건너뛴다(종전 경로 완전 불변).
   *
   * ⚠️ `temporaryTwoHouse`(중과용 `{previousHouseId, newHouseId}`)는 담지 않는다 —
   *    단건 경로에서도 route가 `multiHouseTemporaryTwoHouse`를 채우지 않아 상시 undefined다
   *    (저장소 전체 정의·소비 2곳뿐). 별건 조사 대상(계획서 §11 U-7).
   */
  multiHouse?: Omit<
    MultiHouseSurchargeInput,
    "transferDate" | "sellingHouseMeetsOneHouseRequirements" | "temporaryTwoHouse"
  > & {
    /** 양도 당시 조정대상지역 boolean fallback (`regulatedAreaHistory` 미매칭 시). */
    isRegulatedArea: boolean;
  };

  // ── §164⑨1호 공익수용 특례 (계획 P7/D8, 일반 §97 전용) ──
  // 목별 독립 적용: 주택분(라목 개별주택가격 총액) + 상가분(가목 토지 기준시가). 상가 건물분·모든
  // 안분은 원값(§80⑧·§166⑥·D16-GB). 차감은 각 부분 환산 분모에만. PHD·4부분은 미적용(후속).
  /** 양도원인 — "public_expropriation" 시 §164⑨1호 게이트 */
  transferCause?: "general" | "public_expropriation";
  /** 주택분 보상액 총액 (원) — min(개별주택가격, 보상액, 보상기초) 후보 */
  housingCompensationTotal?: number;
  /** 주택분 보상액 산정 기초 기준시가 총액 (원) */
  housingCompensationBasisTotal?: number;
  /** 상가분 토지 보상액 총액 (원) — min(상가 토지 기준시가, 보상액, 보상기초) 후보 */
  commercialLandCompensationTotal?: number;
  /** 상가분 토지 보상액 산정 기초 개별공시지가 총액 (원) */
  commercialLandCompensationBasisTotal?: number;

  /**
   * 보유 중 일부 용도변경 옵션 — 양도시 겸용이지만 취득시 단일 용도였던 경우.
   *
   * - house_to_commercial: 취득시 전체 주택 → 양도시 일부 상가화 (PDF 갑氏)
   * - commercial_to_house: 취득시 전체 상가 → 양도시 일부 주택화 (미러)
   *
   * 시행령 §166⑥ + 집행기준 99-164-10 (재산-1384, 2009.7.8.)
   */
  partialUsageChange?: {
    direction: "house_to_commercial" | "commercial_to_house";
    /** 취득시 주택연면적 — 미주입 시 양도시 합계로 자동 도출 */
    acqResidentialArea?: number;
    /** 취득시 상가연면적 — 미주입 시 양도시 합계로 자동 도출 */
    acqCommercialArea?: number;
    /**
     * 용도변경일 — 입력 시 시간 비례 분할로 LTHD를 정확 계산.
     * 집행기준 89-154-24 (주택 사용 기간 통산) 취지를 반영.
     * 미입력·취득일/양도일 경계 밖이면 fallback (전체 보유기간 LTHD).
     */
    usageChangeDate?: Date;
  };

  // ── 상속 취득가액 엔진 정합 (소령 §163⑨) ──

  /**
   * 상속 취득 게이트 — true면 취득가액을 환산이 아닌 상속개시일 평가액(직접)으로 산정.
   * 소령 §163⑨. API 변환에서 `asset.acquisitionCause === "inheritance"`로 단일 소스 파생
   * (display fallback·API fallback·validate 3중 미러 — mirror-pattern 스킬).
   * undefined/false → 기존 환산 경로 완전 불변(A-regression).
   */
  acquisitionByInheritance?: boolean;

  /**
   * 주택분 상속개시일 평가액(원) — 상속세 신고 시 시가·감정가로 신고한 경우 그 금액.
   * 미제공 시 `acquisitionStandardPrice.housingPrice`(보충적평가, 상증법 §61)를
   * **그대로**(fallback, ??) 사용 — §163⑨ 본문은 단일 값이지 두 후보의 max가 아님.
   * `usePreHousingDisclosure` 활성 시엔 §164⑦ 환산값과 **max** 비교(§163⑨2호).
   * acquisitionByInheritance=false면 무시.
   */
  housingInheritedValue?: number;

  /**
   * 상가분(토지+건물 합계) 상속개시일 평가액(원) — 신고가액.
   * 미제공 시 `acquisitionStandardPrice.landPricePerSqm × 상가부수토지면적 + commercialBuildingPrice`
   * (보충적평가 합계)를 그대로 사용.
   * acquisitionByInheritance=false면 무시.
   */
  commercialInheritedValue?: number;

  /**
   * 주택분 실제 필요경비(자본적지출+양도비, 원) — 개산공제 대체.
   * 상속(실지거래가액 의제) 모드는 개산공제(§163⑥) 적용 대상이 아니므로, 실제 지출이 있으면
   * 이 필드로 입력. **취득시 토지/건물 기준시가 비율로 안분**(splitDeemedExpense — 개산공제 슬롯과
   * 동일 기준, 취득시 기준시가 합 0이면 전액 건물분). 미제공 시 0(공제 없음 → 순수 실가만).
   * acquisitionByInheritance=false면 무시.
   */
  housingInheritedExpense?: number;

  /** 상가분 실제 필요경비(원) — 위와 동일 원리(상가부분 전용, 취득시 토지/건물 기준시가 비율 안분). */
  commercialInheritedExpense?: number;

  /**
   * 증여 취득가액 직접 산정 게이트(소령 §163⑨) — 순수 증여(§34~§42의3 증여의제 제외).
   * true면 상속과 **동일하게** reported 필드(housingInheritedValue 등)를 소비 —
   * 증여일 상증법 §60~66 평가액을 취득당시 실지거래가액으로 직접 사용(환산·개산공제 배제).
   * API에서 `acquisitionCause === "gift" && 취득일 ≥ 1985-01-01`로 파생. acquisitionByInheritance와 상호배타.
   * undefined/false → 기존 환산 경로 완전 불변(A-regression).
   */
  acquisitionByGift?: boolean;

  /**
   * 겸용 매매 취득 실거래가 직접 사용 게이트(법 §97①1호가목·§100²).
   * true면 `acquisitionActualTotalPrice`(총 취득 실거래가)를 법 §100② 취득시 기준시가 비율로
   * 주택분/상가분·토지/건물에 안분해 취득가액으로 직접 사용(환산·§163⑥ 개산공제 배제).
   * API에서 `acquisitionCause === "purchase" && !환산 && !감정 && !매매사례`로 파생.
   * acquisitionByInheritance·acquisitionByGift와 **상호배타**(취득원인 단일).
   * undefined/false → 기존 환산 경로 완전 불변(A-regression).
   * ⚠️ 미공시(PHD)·보유중용도변경·공익수용 조합은 미지원(엔진 throw).
   */
  useActualAcquisition?: boolean;
  /**
   * 겸용 총 취득 실거래가(원) — useActualAcquisition=true일 때만 소비.
   * 법 §100② 취득시 기준시가 비율로 주택분/상가분 안분 후 각 토지/건물 안분.
   */
  acquisitionActualTotalPrice?: number;

  /**
   * 겸용 감정가액·매매사례가액 취득가액 게이트(법 §97①1호나목·§176의2②③ 추계).
   * true면 acquisitionActualTotalPrice(감정가액 또는 매매사례가액 총액)를 법 §100² 비율로 안분해
   * 취득가액으로 사용하되, 개산공제(§163⑥, 취득시 기준시가×3%)는 적용(실거래가와 달리 추계라 개산공제 유지).
   * API에서 acquisitionCause==="purchase" && (isAppraisal || isSalesCase)로 파생.
   * useActualAcquisition·byInheritance·byGift와 상호배타. PHD·용도변경·공익수용 조합 미지원(throw).
   */
  useAppraisalSalesAcquisition?: boolean;
  /**
   * 공유지분율 (0 < r ≤ 1, 미전달 시 1). **개산공제(소득령 §163⑥) base 축소 전용**.
   *
   * 기준시가·면적은 물건 전체(100%) 값을 유지한다 — 환산 산식에서 분자·분모로 함께 나타나 상쇄되고,
   * §166⑥ 안분 비율도 100% 스케일을 전제하기 때문이다. 호출부가 `TransferTaxInput.ownershipRatio`를
   * 그대로 내려준다(서브엔진 재판정 금지).
   *
   * 설계: docs/02-design/features/transfer-fractional-lump-sum-deduction.engine.design.md §2.1
   */
  ownershipRatio?: number;
  /**
   * 미등기양도자산 여부(소득세법 §104③) — §163⑥ 개산공제율 3/100 → **3/1000** 전환.
   * 호출부가 `TransferTaxInput.isUnregistered`를 그대로 내려준다(서브엔진 재판정 금지).
   * 율 산출은 `estimatedDeductionRate()` 단일 경유.
   */
  isUnregistered?: boolean;
}

// ──────────────────────────────────────────
// 파생값 (엔진 자동 산출)
// ──────────────────────────────────────────

/** 면적 비율로 자동 산출되는 파생값 */
export interface MixedUseDerivedAreas {
  /** 주택연면적 비율 = residential / (residential + nonResidential) */
  residentialRatio: number;
  /** 주택부수토지 면적 = totalLandArea × residentialRatio */
  residentialLandArea: number;
  /** 상가부수토지 면적 = totalLandArea × (1 − residentialRatio) */
  commercialLandArea: number;
  /** 주택 정착면적 = buildingFootprintArea × residentialRatio */
  residentialFootprintArea: number;
}

// ──────────────────────────────────────────
// 출력 타입
// ──────────────────────────────────────────

/** 양도가액 안분 결과 */
export interface MixedUseApportionment {
  /** 주택부분 기준시가 = 개별주택공시가격 */
  housingStandardPrice: number;
  /** 상가부분 기준시가 = (공시지가 × 상가부수토지 면적) + 상가건물 기준시가 */
  commercialStandardPrice: number;
  /** 주택비율 = housingStandardPrice / 합계 */
  housingRatio: number;
  /** 주택 양도가액 */
  housingTransferPrice: number;
  /** 상가 양도가액 */
  commercialTransferPrice: number;
}

/** 주택부분 계산 결과 */
export interface MixedUseHousingPart {
  /** 주택부분 환산취득가액 (§97 또는 §164⑤ PHD) */
  estimatedAcquisitionPrice: number;
  /** PHD로 역산된 취득시 개별주택가격 (PHD 모드 한정) */
  phdEstimatedAcqHousingPrice?: number;
  /** PHD 3-시점 산식 상세 (UI 표시용) */
  phdResult?: PreHousingDisclosureResult;
  /** 주택부분 양도차익 합계 */
  transferGain: number;
  /** 토지분 양도차익 */
  landTransferGain: number;
  /** 건물분 양도차익 */
  buildingTransferGain: number;
  /** 토지분 양도가액 (안분) — 산식 표시용 */
  landTransferPrice: number;
  /** 토지분 환산취득가액 (안분) — 산식 표시용 */
  landAcqPrice: number;
  /** 토지분 개산공제 (취득시 토지분 기준시가 × 3%, §163⑥) — 산식 표시용 */
  landAppraisalDed: number;
  /** 취득시 토지분 기준시가 — 개산공제 산식 표시용 */
  landStdPriceAtAcq?: number;
  /** 건물분 양도가액 (안분) — 산식 표시용 */
  buildingTransferPrice: number;
  /** 건물분 환산취득가액 (안분) — 산식 표시용 */
  buildingAcqPrice: number;
  /** 건물분 개산공제 (취득시 건물분 기준시가 × 3%, §163⑥) — 산식 표시용 */
  buildingAppraisalDed: number;
  /** 취득시 건물분 기준시가 — 개산공제 산식 표시용 */
  buildingStdPriceAtAcq?: number;
  /** 12억 이하 → 전액 비과세 */
  isExempt: boolean;
  /** 12억 초과 안분 후 과세대상 양도차익 */
  proratedTaxableGain: number;
  /** 장기보유공제 표 (1 또는 2) */
  longTermDeductionTable: 1 | 2;
  /** 장기보유공제율 */
  longTermDeductionRate: number;
  /** 장기보유공제액 */
  longTermDeductionAmount: number;
  /**
   * echo — 장특공제 보유/거주 기간분 분리 표시용(산식·세액 불변).
   * 표2: 거주분 = 각 부분 거주율 직접 산정, 보유분 = 총액 − 거주분(잔액 흡수·합 불변식).
   * 표1: 거주분 0, 보유분 = 총액. 대표 연수·율은 건물 기준(longTermDeductionRate와 동일 관례).
   */
  holdingDeductionAmount?: number;
  residenceDeductionAmount?: number;
  holdingYears?: number;
  residenceYears?: number;
  holdingDeductionRate?: number;
  residenceDeductionRate?: number;
  /** 양도소득금액 */
  incomeAmount: number;
  /** 주택 토지분 양도차익 중 비사업용으로 이전된 비율 */
  nonBusinessTransferRatio: number;
  /** 비사업용으로 이전된 양도차익 */
  nonBusinessTransferredGain: number;

  /**
   * 상속 취득가액 산정 상세 — `calculationRoute.acquisitionConversionRoute`가
   * "inheritance_direct" | "inheritance_phd_max"일 때만 존재. 비상속 시 undefined.
   */
  inheritedAcquisitionDetail?: InheritedAcquisitionDetail;
}

/** 상가부분 계산 결과 */
export interface MixedUseCommercialPart {
  /** 상가부분 환산취득가액 */
  estimatedAcquisitionPrice: number;
  /** 상가부분 양도차익 합계 */
  transferGain: number;
  /**
   * 파트별 양도소득금액 — 「소득세법」 제104조 제1항 제2·3호 단기세율은 토지·건물 **각각의**
   * 보유기간으로 갈린다. 장특이 이미 파트별(`buildCommercialPart`의 landDedRate·buildingDedRate)
   * 이므로 같은 축으로 노출한다(재도출 금지).
   */
  landIncomeAmount?: number;
  buildingIncomeAmount?: number;
  /** 토지분 양도차익 */
  landTransferGain: number;
  /** 건물분 양도차익 */
  buildingTransferGain: number;
  /** 토지분 양도가액 (안분) — 산식 표시용 */
  landTransferPrice: number;
  /** 토지분 환산취득가액 (안분) — 산식 표시용 */
  landAcqPrice: number;
  /** 토지분 개산공제 — 산식 표시용 */
  landAppraisalDed: number;
  /** 취득시 토지분 기준시가 — 개산공제 산식 표시용 */
  landStdPriceAtAcq?: number;
  /** 건물분 양도가액 (안분) — 산식 표시용 */
  buildingTransferPrice: number;
  /** 건물분 환산취득가액 (안분) — 산식 표시용 */
  buildingAcqPrice: number;
  /** 건물분 개산공제 — 산식 표시용 */
  buildingAppraisalDed: number;
  /** 취득시 건물분 기준시가 — 개산공제 산식 표시용 */
  buildingStdPriceAtAcq?: number;
  /** 장기보유공제율 (표1, 최대 30%) */
  longTermDeductionRate: number;
  /** 장기보유공제액 */
  longTermDeductionAmount: number;
  /** echo — 보유연수(표1 대표값·거주 개념 없음). 장특공제 분리 표시용(세액 불변). */
  holdingYears?: number;
  /** 양도소득금액 */
  incomeAmount: number;
  /**
   * 취득시 상가부분 기준시가 산출 근거 — 결과 카드 산식 분기 표시용.
   *
   * - "user_input": 사용자가 취득시 상가건물 기준시가 + 개별공시지가를 직접 입력
   *                 (일반 겸용주택, commercial_to_house, house_to_commercial 모든 경로 동일)
   *
   * 참고: 과거에 존재하던 "fallback_apportion"(개별주택공시가격 면적비율 자동 안분) 분기는
   * 세법상 부정확하여 2026-05-01 제거됨. 모든 경로에서 직접 입력만 허용.
   */
  acqStandardSource: "user_input";
  /** 취득시 상가부분 기준시가 합계 (acqLandStd + acqBuildingStd) — 산식 표시용 */
  acqStandardTotal: number;
  /** 취득시 상가부수토지 기준시가 — 산식 표시용 */
  acqStandardLand: number;
  /** 취득시 상가건물 기준시가 — 산식 표시용 */
  acqStandardBuilding: number;

  /**
   * 상속 취득가액 산정 상세 — `calculationRoute.acquisitionConversionRoute`가
   * "inheritance_direct" | "inheritance_phd_max"일 때만 존재. 비상속 시 undefined.
   */
  inheritedAcquisitionDetail?: InheritedAcquisitionDetail;
}

/** 비사업용토지 부분 계산 결과 (배율초과 면적이 있을 때만 생성) */
export interface MixedUseNonBusinessLandPart {
  /** 초과 면적 (㎡) */
  excessArea: number;
  /** 적용 배율 */
  appliedMultiplier: 3 | 5 | 10;
  /** 비사업용 양도차익 (주택 토지분에서 이전) */
  transferGain: number;
  /** 장기보유공제율 (표1) */
  longTermDeductionRate: number;
  /** 장기보유공제액 */
  longTermDeductionAmount: number;
  /** 양도소득금액 */
  incomeAmount: number;
  /** 비사업용토지 +10%p 가산율 (고정) */
  additionalRate: 0.10;
}

/** 합산 세액 */
export interface MixedUseTotalTax {
  /** 합산 양도소득금액 */
  aggregateIncome: number;
  /** 기본공제 250만원 */
  basicDeduction: number;
  /** 과세표준 */
  taxBase: number;
  /** 기본세율 산출세액 */
  taxByBasicRate: number;
  /** 산출세액에 적용된 누진세율 (소수, 예: 0.40) */
  appliedRate: number;
  /** 산출세액에 적용된 누진공제액 */
  progressiveDeduction: number;
  /** 비사업용토지 +10%p 가산세 */
  nonBusinessSurcharge: number;
  /** 양도소득세 */
  transferTax: number;
  /** 지방소득세 (10%) */
  localTax: number;
  /** 총 납부세액 */
  totalPayable: number;
}

/** 결과 카드용 단계별 표시 항목 */
export interface MixedUseStep {
  id: string;
  title: string;
  legalBasis: string;
  values: Array<{ label: string; value: number | string; isResult?: boolean }>;
}

/**
 * 계산 경로 메타 — 학습·검증용. 결과 카드 하단에 노출하여
 * "세액은 맞는데 왜 맞는지"를 설명할 수 있도록 함.
 */
export interface MixedUseCalculationRoute {
  /** 취득시 주택 기준시가 산정 방식 */
  housingAcqPriceSource: "direct_input" | "phd_auto" | "missing";
  /** 환산취득가액 산정 경로 — 상속 2개 값 추가(소령 §163⑨) */
  acquisitionConversionRoute:
    | "section97_direct"        // 비상속 §97 직접환산
    | "phd_corrected"           // 비상속 PHD §164⑤
    | "inheritance_direct"      // 상속·공시(§163⑨ 본문)
    | "inheritance_phd_max"     // 상속·미공시(§163⑨2호 max)
    | "gift_direct"             // 증여·공시(§163⑨ 본문, 상속과 동일)
    | "gift_phd_max"            // 증여·미공시(§163⑨2호/§176의2②2호 max)
    | "section97_actual"        // 매매 취득 실거래가 직접 안분(법 §100²·§97①1호가목)
    | "section176_2_appraisal_sales"; // 감정가액·매매사례가액 추계 안분(§176의2②③·§100²·개산공제 유지)
  /** 주택 장기보유공제 표 분기 사유 */
  housingDeductionTableReason: string;
  /** 부수토지 배율 적용 근거 (지역 + 배율값) */
  landMultiplierReason: string;
  /**
   * 12억 비과세 적용 결과
   * - below_threshold_exempt: 1세대1주택자 + 12억 이하 → 비과세
   * - above_threshold_prorated: 1세대1주택자 + 12억 초과 → 안분 과세
   * - non_one_house_full_taxation: 다주택자 등 1세대1주택 미적용 → 전액 과세
   */
  highValueRule: "below_threshold_exempt" | "above_threshold_prorated" | "non_one_house_full_taxation";
  /** 보유 중 일부 용도변경 분기 사유 (사전 정의 템플릿) */
  partialUsageChangeReason?: string;
}

/** 겸용주택 분리계산 최종 결과 */
export interface MixedUseGainBreakdown {
  /**
   * - "post-2022": 2022.1.1 이후 양도분, 강제 분리계산 완료
   * - "pre-2022-rejected": 2022.1.1 이전 양도분, 처리 불가
   */
  splitMode: "post-2022" | "pre-2022-rejected";

  /** 양도가액 안분 결과 */
  apportionment: MixedUseApportionment;
  /** 주택부분 결과 */
  housingPart: MixedUseHousingPart;
  /** 상가부분 결과 */
  commercialPart: MixedUseCommercialPart;
  /** 비사업용토지 부분 결과 (배율초과 없으면 null) */
  nonBusinessLandPart: MixedUseNonBusinessLandPart | null;
  /** 합산 세액 */
  total: MixedUseTotalTax;
  /** 결과 카드용 단계별 값 */
  steps: MixedUseStep[];
  /** 계산 경로 메타 — 학습·검증용 결과 카드 하단 노출 */
  calculationRoute: MixedUseCalculationRoute;
  /** 경고 메시지 (PHD 적합성, 22.1.1 이전 양도일 등) */
  warnings: string[];
  /**
   * 법 §104⑦ 다주택 중과 판정 결과 — `asset.multiHouse` 미주입 시 undefined.
   * 세율(§104⑦)·장특 배제(§95②)의 단일 근거이며 결과 카드 표시에도 그대로 쓴다
   * (계산-표시 drift 차단 — `feedback_engine_result_display_drift`).
   */
  multiHouseSurcharge?: MultiHouseSurchargeResult;
  /**
   * 보유 중 일부 용도변경 메타 — 결과 카드 "취득시점 자산 구성" 섹션 표시용.
   * partialUsageChange 토글 OFF 시 undefined.
   */
  partialUsageChange?: {
    direction: "house_to_commercial" | "commercial_to_house";
    /** 취득시 주택연면적 (자동 또는 사용자 수정값) */
    acqResidentialArea: number;
    /** 취득시 상가연면적 */
    acqCommercialArea: number;
    /** 사용자가 면적을 수정했는지 여부 */
    isAreaCustomized: boolean;
    /**
     * PHD §164⑤ 환산 분기 (PHD ON + partialUsageChange ON 조합에서만 산출).
     *
     * - "case_a_whole_building": firstDisclosureDate < usageChangeDate.
     *   최초공시 시점에 건물 전체가 주택이었으므로 P_F 가 "전체 건물(미래 상가 부분 포함)"의
     *   가격을 의미. Sum_A·Sum_F 분모/분자에 전체 토지면적·전체 건물 기준시가 사용.
     * - "case_b_housing_only": firstDisclosureDate ≥ usageChangeDate.
     *   최초공시 시점에 이미 겸용 상태. P_F 가 주택분만의 가격이므로 Sum_A·Sum_F 도 주택분만.
     * - undefined: PHD 미사용 또는 일반 겸용주택 (분기 의미 없음).
     */
    phdScopeBranch?: "case_a_whole_building" | "case_b_housing_only";
  };

  /**
   * 용도변경일 기반 LTHD 시간 비례 분할 결과 (Part A).
   * usageChangeDate 입력 + 유효 시에만 생성. 미입력 시 undefined.
   * 집행기준 89-154-24 취지 반영.
   */
  usagePeriodSplit?: {
    /** Period 1 = 취득일 ~ 용도변경일 (단일 용도 기간), 일 단위 */
    period1Days: number;
    /** Period 2 = 용도변경일 ~ 양도일 (혼용 기간), 일 단위 */
    period2Days: number;
    /** Period 1 양도차익 — 100% 단일 용도 */
    period1Gain: number;
    /** Period 2 양도차익 — 양도시점 기준시가 비율로 안분 */
    period2HousingGain: number;
    period2CommercialGain: number;
    /** Period별 LTHD 공제율·공제액 */
    period1LongTermDeductionRate: number;
    period1LongTermDeductionAmount: number;
    period2HousingLongTermDeductionRate: number;
    period2HousingLongTermDeductionAmount: number;
    period2CommercialLongTermDeductionRate: number;
    period2CommercialLongTermDeductionAmount: number;
  };

  /**
   * 수정신고·경정청구 상세 (국세기본법 §45·§45의2).
   *
   * 기준값 = `total.transferTax`(본세 — 지방소득세 제외). 단건 finalize의 determinedTax와 동일 축.
   * `amendment` 미전달 시 undefined — 캐시된 구 결과(IndexedDB)도 안전 통과.
   * `splitMode === "pre-2022-rejected"`이면 amendment 전달 여부와 무관하게 항상 undefined
   * (계산 불가 상태에 부착하면 refundTax = 당초 전액 오표시).
   */
  amendmentDetail?: AmendmentDetail;
  /** §164⑨1호 공익수용 특례 산출근거 (계획 P7/D8) — 주택분·상가분. 적용 시만. */
  expropriationDetail?: MixedUseExpropriationDetail;

  /** 상속 취득 게이트 echo (asset.acquisitionByInheritance 그대로) — UI 재판정 방지용 단일 소스. */
  acquisitionByInheritance?: boolean;
}
