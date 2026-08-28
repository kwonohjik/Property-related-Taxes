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

  /**
   * §155① 일시적 2주택 — 종전·신규주택 취득일. **폼-전역** 값이라 route가 주입한다.
   *
   * 겸용 서브엔진이 이것으로 §155① 의제 성립을 선판정해(`resolveDeemedOneHouseBy155`)
   * 중과 배제(영 §167의10①15호 ① 요소)에 넘긴다. 미주입 시 의제 미성립 — 종전 동작 불변.
   */
  temporaryTwoHouse?: { previousAcquisitionDate: Date; newAcquisitionDate: Date };

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
   * ⚠️ `deemedOneHouseBy155`(§167의10①15호 ① 요소)는 담지 않는다 — 겸용 서브엔진이
   *    §155① 정본(`resolveDeemedOneHouseBy155`)으로 **자체 선판정**한다(Phase B2).
   *    폼-전역 `temporaryTwoHouse`는 `MixedUseAssetInput.temporaryTwoHouseSpecial`로 이미 들어온다.
   */
  multiHouse?: Omit<
    MultiHouseSurchargeInput,
    "transferDate" | "sellingHouseMeetsOneHouseRequirements" | "deemedOneHouseBy155"
  > & {
    /** 양도 당시 조정대상지역 boolean fallback (`regulatedAreaHistory` 미매칭 시). */
    isRegulatedArea: boolean;
  };

  /**
   * 🔴 법 §104⑦ 중과 **원시 플래그 fallback** — `multiHouse`(정밀)가 없을 때만 쓴다.
   *
   * ## 왜 필요한가 (2026-08-25)
   *
   * `multiHouse`는 `houses[]`가 있어야 조립된다(`route.ts` — 「`houses` 미전송이면 undefined →
   * 엔진이 중과 판정을 건너뛴다」). 그래서 사용자가 **세대 보유 주택 목록을 채우지 않으면
   * 겸용주택에는 중과가 통째로 미적용**됐다 — 실측 505,484,136원 과소과세
   * (조정지역·2주택: 세율 0.65→0.45 · 주택분 장특공제 0→445,655,171).
   *
   * 일반 주택(`housing`)·재개발APT는 같은 상황에서 `SURCHARGE_FALLBACK_PROPERTY_TYPES`로
   * 중과가 걸린다. **겸용만 달랐다** — 자산 종류가 세액을 가르는 좌우 불일치였다.
   *
   * ⚠️ **fallback은 근사다.** 주택 수 제외(영 §167의3① 각 호)·상속 5년 배제·혼인 합가 차감을
   *    반영하지 못한다. 그래서 정밀 판정이 있으면 **재판정하지 않고** 그것을 쓰고,
   *    fallback으로 계산했을 때는 결과에 경고를 남긴다(`warnings`).
   *
   * 🔑 `householdHousingCount`는 **양도하는 겸용주택 자신을 포함한** 세대 보유 주택 수다.
   *    §104⑦ 각 호의 「1세대 2주택」이 세대 소유분 전체를 세므로 +1 보정을 하지 않는다.
   *    일반 주택 경로(`transfer-tax-surcharge-predicate.ts`)도 같은 규약이다.
   */
  surchargeFallback?: {
    isRegulatedArea: boolean;
    householdHousingCount: number;
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

  /**
   * 🔴 **조특법 감면·가산세** (F17-B, 2026-08-23) — 종전에는 이 축이 **통째로 없었다**.
   *
   * 클라이언트는 자산 종류와 무관하게 `reductions`·`filingPenaltyDetails`를 body에 싣고
   * Zod·⑧도 통과시키는데, 겸용 분기가 엔진에 넘기지 않아 **세액이 1원도 안 움직였다**
   * (실측 `totalPayable` 60,853,408 → 60,853,408). 호출부가 `TransferTaxInput`의 같은 이름
   * 필드를 그대로 내려준다(서브엔진 재판정 금지 — `ownershipRatio`·`isUnregistered`와 같은 경로).
   */
  reductions?: import("./transfer.types").TransferReduction[];
  filingPenaltyDetails?: import("./transfer.types").TransferTaxInput["filingPenaltyDetails"];
  delayedPaymentDetails?: import("./transfer.types").TransferTaxInput["delayedPaymentDetails"];
  /** 조특법 §133 5년 누적 한도 판정용 과거 이력 */
  priorReductionUsage?: { year: number; type: string; amount: number }[];
  /** §77 농특세 비과세 — 「직접 경작한 토지」(농특세령 §4①1호) */
  isSelfCultivatedExpropriatedLand?: boolean;

  /**
   * 🔴 **자산 단위 공통 자본적지출**(「소득세법」 제97조 제1항 제2호) — 2026-08-07 신설(W-3).
   *
   * 종전에는 겸용주택에 필요경비를 넣을 **경로 자체가 없었다**(UI가 칸을 숨기고
   * `CompanionAssetCard.tsx:350`, 엔진도 소비하지 않았다) ⇒ 자본적지출이 있는 겸용주택
   * 보유자는 계산기를 쓸 수 없었다. **실측: 비용을 어떻게 넣어도 세액 Δ=0.**
   *
   * 주택분↔상가분 안분 근거는 「소득세법」 제100조 제2항 **후문**:
   * 「이 경우 **공통되는 취득가액과 양도비용**은 **해당 자산의 가액에 비례하여** 안분계산한다」.
   * 자본적지출은 취득에 부수하므로 **취득시** 기준시가 축(`apportionAcquisitionPrice`)이다.
   *
   * ⚠️ **파트별 직접 입력이 우선한다** — `housingInheritedExpense`·`commercialInheritedExpense`가
   *    있으면 그 파트는 안분하지 않는다. 후문이 안분하라는 것은 「**공통되는**」 것뿐이다.
   * ⚠️ **환산 모드에서는 무시된다** — §97②2호 **본문**이 개산공제로 갈음한다.
   *    (같은 항 2호 **단서**의 가목·나목 택일은 겸용에 미구현 — 비교 단위를 정해야 해 별건.)
   */
  capitalExpenditure?: number;

  /**
   * 🔴 **자산 단위 공통 양도비**(「소득세법」 제97조 제1항 제3호) — 2026-08-07 신설(W-3).
   *
   * 양도에 부수하므로 **양도시** 기준시가 축(`apportionTransferPrice`)으로 안분한다
   * (`capitalExpenditure`와 **시점이 다르다** — P-2·W-5에서 확립한 교리).
   */
  transferExpense?: number;
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
  /**
   * §97 직접 환산에서 **분자로 쓴 취득시 개별주택공시가격** — 산식 표시 전용 echo.
   * 상가분의 `acqStandardTotal`과 같은 층위다. 0이면 「미공시」를 함께 표시한다(#077).
   */
  acqHousingStandardPrice?: number;
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
  /**
   * 비사업용토지 +10%p 가산세 — **총액에 별도로 가산되는 금액**.
   *
   * ⚠️ 배율 초과분이 §104⑤2호 파트(`kind: "non_business_land"`)로 들어가면 가산은 **그 파트
   * 세액 안에서** 계산되므로 이 값은 **0**이다(§104⑤ 본문 후단 — 별개 자산 의제).
   * `rateParts` 미전달 fallback 경로에서만 0이 아니다. 계획서 D-8 · P6.
   */
  nonBusinessSurcharge: number;
  /**
   * 채택된 세율 근거 — **표시-계산 drift 차단용 단일 소스**.
   *   "progressive"   §104⑤1호(합산 과세표준 누진) — `transferTax = taxByBasicRate + nonBusinessSurcharge`
   *                   (§104⑤ 경로에서는 `nonBusinessSurcharge = 0`이라 `= taxByBasicRate`)
   *   "clause2"       §104⑤2호(자산별 산출세액 합) — `transferTax ≠ taxByBasicRate`
   *   "unregistered"  §104①10호 70% 단일세율
   * 미주입(구 캐시 결과) 시 결과 카드는 값 비교로 fallback 추론한다.
   */
  rateBasis?: "progressive" | "clause2" | "unregistered";
  /** 적용된 §104⑦ 다주택 중과 가산율(0.20·0.30). 미적용 시 undefined. */
  surchargeAddon?: number;
  /** 양도소득세 **산출세액** (감면 차감 전) */
  transferTax: number;
  /**
   * 조특법 감면세액 (F17-B, 2026-08-23) — **세액감면형만**.
   *
   * 종전에는 이 필드 자체가 없어서 겸용주택에서 §77 공익수용을 골라도 세액이 1원도
   * 안 움직였다(실측 Δ 0 · `MixedUseAssetInput`에 감면 필드 0건).
   *
   * ⚠️ **차감형·하이브리드**(`ALL_INCOME_DEDUCTION_IDS` 11종)는 여기 들어오지 않는다 —
   *    양도소득금액을 차감하는 구조인데 겸용은 소득금액이 **주택분·상가분·비사토분**으로
   *    갈려 있어 어느 파트에서 빼야 하는지 정한 명문이 없다(§155⑳ 경로의 §161 안분과 같은
   *    성질의 미결). 그 사실은 `warnings`로 고지한다.
   */
  reductionAmount: number;
  /** 채택된 감면 유형 라벨 (표시용). 감면 없으면 undefined. */
  reductionType?: string;
  /**
   * 채택된 감면의 **식별자**(`public_expropriation` 등 — 라벨이 아니다).
   *
   * 종전에는 이 값이 어댑터에 실리지 않아 겸용 신고서 ⑲ 세액감면대상금액이 감면과 무관하게
   * **0**으로 찍혔고, 상세명세서 산식은 「감면 대상 없음」이라 같은 화면의 ⑮ 감면세액과
   * **자기모순**이었다(결과탭 코드리뷰 #049).
   */
  reductionTypeApplied?: string;
  /** 감면대상 소득금액 — ⑲의 default 경로 값. */
  reducibleIncome?: number;
  /**
   * 감면 산출근거 카드가 읽는 detail 묶음.
   *
   * 겸용 결과뷰에는 `ReductionDetailCards`가 아예 없었다 — 나머지 세 결과뷰는 모두 갖는다.
   * §77 요건 미충족으로 감면이 0이 된 경우에도 **사유를 알려주는 카드가 없어** 「왜 안 붙었는지」가
   * 화면에서 사라졌다.
   */
  reductionDetails?: import("./transfer-result.types").TransferReductionDetailSource;
  /** 결정세액 = 산출세액 − 감면세액 */
  determinedTax: number;
  /**
   * 신고불성실·납부지연 가산세 (국세기본법 §47의2~§47의4).
   * 국세기본법 §47의3④의 부적용 사유는 한정 열거이고 **자산 종류에 따른 예외가 없다**.
   */
  penaltyTax: number;
  /** 농어촌특별세 = 감면세액 × 20% (농특세법 §5①1호 · 비과세는 시행령 §4 열거) */
  ruralSurtax: number;
  /** 지방소득세 (결정세액 × 10%) */
  localTax: number;
  /** 총 납부세액 = 결정세액 + 지방소득세 + 가산세 + 농특세 */
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

  /**
   * 🔴 §97②2호 **단서** 판정 — **환산 경로 전용** (2026-08-07 W-8).
   *
   * · `estimatedSide` **가목** = (주택분 + 상가분) 환산취득가액 + 개산공제 = 필요경비 **전체**
   * · `directSide`    **나목** = 자산 단위 자본적지출 + 양도비
   *
   * 실비를 명시 입력하지 않았거나 실가·상속·증여 경로면 **undefined**(비교 자체를 하지 않는다).
   *
   * ⚠️ `chosen === "direct"`이면 각 파트의 `landAcqPrice`·`buildingAcqPrice`가 **0**이 된다 —
   *    가목이 「환산취득가액 **과** 개산공제의 **합계액**」이라 둘은 필요경비 전체를 놓고 겨루고,
   *    나목 채택 시 취득가액을 별도 차감하면 **이중차감**이기 때문이다.
   *
   * ⚠️ **비교 단위는 자산 단위**다 — 겸용의 취득모드 플래그가 전부 자산 단위라 파트별로
   *    갈리지 않는다(`general-building-swap.ts:144-148`의 확립된 규칙).
   */
  necessaryExpenseProviso?: {
    estimatedSide: number;
    directSide: number;
    chosen: "estimated" | "direct";
  };

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
   * 🔴 §95② 장기보유특별공제 **배제 판정 echo** — 표시가 계산을 **재도출하지 않게** 한다.
   *
   * ## 왜 필요한가 (2026-08-25)
   *
   * `MixedUseResultCard`는 「판정은 엔진 결과를 그대로 읽는다 — 재도출 금지」라 적어 두고도
   * 실제로는 `multiHouseSurcharge.surchargeType !== "none" && !isSurchargeSuspended`를
   * **다시 계산**했다. 그래서 원시 플래그 fallback으로 배제된 경우
   * (`multiHouseSurcharge`가 아예 없다) 화면이 **「장기보유공제 (표1, 0.0%)」**로 표시됐다 —
   * 공제는 0인데 **보유기간이 짧아서 0인 것처럼** 읽혔다.
   *
   * ⇒ 배제 여부·표시 문구에 필요한 값을 **엔진이 확정해 실어 보낸다**.
   *    미배제면 `undefined`(카드가 종전 산식 표시를 유지한다).
   */
  surchargeLthdExclusion?: {
    /** 표시 문구용 세대 주택 수 — 정밀은 `effectiveHouseCount`, fallback은 입력값 그대로. */
    houseCount: number;
    /** 원시 플래그 근사로 판정했는가 — 화면이 한계를 함께 말해야 한다. */
    fromFallback: boolean;
  };
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
   * 🔴 2026-08-10 폐지 — `usagePeriodSplit`(용도변경 시간비례 LTHD 분할).
   *
   * 근거로 달려 있던 「집행기준 89-154-24」는 **존재하지 않는 문서**였고, 법문·예규는 정반대다:
   *   「소득세법」 §95④(보유기간 = 취득일~양도일) · 사전-2021-법령해석재산-0333(겸용주택
   *   주택부분→상가 용도변경 시 **기산일 = 취득일**) · 사전-2022-법규재산-0427(고가 겸용주택
   *   보유기간 = 취득일~양도일 · 표2는 **주택 부분에 한정** ⇒ 나누는 축은 기간이 아니라 부분).
   * ❌ 이 필드를 되살리지 말 것. `partialUsageChange`는 **면적 안분·PHD Case A**용으로 남아 있다.
   */

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
