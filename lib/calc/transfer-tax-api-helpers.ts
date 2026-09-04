/**
 * 양도소득세 API 변환 헬퍼 — toEngineReductions + buildAssetPayload (companionAssets용)
 * transfer-tax-api.ts 800줄 정책에 따라 분리.
 */

import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { buildMixedUsePayload } from "./transfer-tax-api-mixed-use";
import { buildCarryoverPayload } from "./transfer-tax-api-carryover";
import { replotIncrementStdPriceAtTransfer } from "./replot-increment-std-price";
// ④ 분리취득 축 — 단건과 **같은 공용 빌더**(자산-무관 함수라 컴패니언도 그대로 쓴다).
import { buildSplitPayload, makeRatioed } from "./transfer-tax-api-split";
import {
  isExprValuationEligibleAssetKind,
  isAuctionEligibleAssetKind,
  isHousingExprEligibleAssetKind,
  isSplitLandExprEligibleAssetKind,
} from "@/lib/tax-engine/expropriation-scope";
import { differenceInYears } from "date-fns";
import {
  isWithinSurchargeSuspensionWindow,
  MULTI_HOUSE,
  TEMP_TWO_HOUSE_PROVISO_REASONS,
} from "@/lib/tax-engine/legal-codes/transfer";

/**
 * 상속 주택 개별/공동 구분 — **UI·API 공용 단일 소스**.
 *
 * `inheritanceAssetKind`는 미선택("")으로 시작하고, 픽커(InheritanceHouseKindPicker)가
 * 동·호 유무로 기본값을 **표시**한다. 이 파생을 복제하지 말고 이 함수를 호출할 것 —
 * 소비처가 raw 비교(`=== "house_individual"`)를 하면 픽커에 "개별"이 선택돼 보이는데도
 * 그 소비처만 false가 되어, 이미 checked인 라디오를 다시 눌러도 change가 안 나 **막힌다**
 * (2026-07-30 실측: HouseValuationSection 3시점 일괄 계산 버튼이 초기 진입 시 미노출).
 * 세액 무관 — 조회 DB(개별주택가격 vs 공동주택가격)·라벨·게이팅용.
 */
export function deriveInheritanceHouseKind(
  asset: AssetForm,
): "house_individual" | "house_apart" {
  if (asset.inheritanceAssetKind === "house_individual") return "house_individual";
  if (asset.inheritanceAssetKind === "house_apart") return "house_apart";
  return asset.addressDong && asset.addressHo ? "house_apart" : "house_individual";
}

/**
 * 상속 취득가액 엔진 payload용 assetKind 파생 — 상단 `asset.assetKind` 기준.
 *
 * 엔진(inheritance-acquisition)은 land(단가×면적/legacyFallback) vs house(총액)만 구분하므로
 * land vs 非land 이분으로 매핑한다. housing/redevelopment는 개별/공동 refinement를 유지하되
 * (조회 DB·라벨용, 세액 무관), 미선택 시 동·호 유무로 도출. 그 외(건물·권리 등)는 총액-safe house_apart.
 * 상단 자산 구분 라디오 폐지 후에도 §164⑦(helpers.ts:142)·다건 land 안분이 항상 정확하도록 보장.
 */
export function deriveEngineInheritanceAssetKind(
  asset: AssetForm,
): "land" | "house_individual" | "house_apart" {
  if (asset.assetKind === "land") return "land";
  if (asset.assetKind === "housing" || asset.assetKind === "redevelopment_apt") {
    return deriveInheritanceHouseKind(asset);
  }
  return "house_apart";
}

/**
 * 다주택 중과 한시배제(소득세법 시행령 §167의3①12의2·§167의10①12의2) 여부 —
 * 양도일 ∈ [2022-05-10, 2026-05-09] AND 양도 주택 보유기간 2년 이상(§95④).
 * true면 중과 전면배제(일반세율) → UI ④ 섹션 숨김 + 해당 검증 skip(양쪽 단일 술어).
 * 엔진 determineMultiHouseSurcharge의 배제 조건(양도일 윈도우 + differenceInYears≥2)과 동일.
 */
export function isMultiHouseSurchargeSuppressed(
  transferDate: string | undefined | null,
  acquisitionDate: string | undefined | null,
): boolean {
  if (!isWithinSurchargeSuspensionWindow(transferDate) || !transferDate || !acquisitionDate)
    return false;
  return (
    differenceInYears(new Date(transferDate), new Date(acquisitionDate)) >=
    MULTI_HOUSE.SURCHARGE_SUSPENSION_MIN_HOLDING_YEARS
  );
}

/** §154① 단서 카드 노출 맥락 — 1주택 / 일시적 2주택 / 미노출. */
export type ProvisoMode = "one_house" | "temporary_two_house" | null;

/**
 * §154① 단서 카드 노출 여부 + 맥락(mode) 단일 파생.
 * 1주택 → one_house. 2주택+일시적특례 → temporary_two_house(§155① 준용). 그 외(순수 2주택·대체주택·3주택+) → 숨김.
 * UI(Step4 렌더·배치)·API 조립·validation이 이 단일 함수를 공유(mirror-pattern).
 */
export function provisoGate(args: {
  isOneHousehold: boolean;
  isHousing: boolean;
  householdHousingCount: string;
  temporaryTwoHouseSpecial: boolean;
}): { visible: boolean; mode: ProvisoMode } {
  if (!args.isOneHousehold || !args.isHousing) return { visible: false, mode: null };
  const n = parseInt(args.householdHousingCount, 10);
  if (n === 1) return { visible: true, mode: "one_house" };
  if (n === 2 && args.temporaryTwoHouseSpecial) return { visible: true, mode: "temporary_two_house" };
  return { visible: false, mode: null };
}

/**
 * §154① 단서 reason 정규화 — temporary_two_house 모드에서 화이트리스트(1·2가·3호) 밖 reason은 "" 로 취급.
 * UI 선택표시·API 조립·validation 3곳이 단일 소비 → 옵션 필터로 숨긴 stale 무효 reason이 엔진/검증에 도달하지 않음.
 * (1주택 모드서 나·다목·5호 선택 후 일시적 2주택 전환 시 데드락 방지 — 파생이라 clear-onChange 불필요.)
 */
export function effectiveProvisoReason(mode: ProvisoMode, reason: string | undefined | null): string {
  if (!reason) return "";
  if (mode === null) return ""; // 카드 숨김(순수 다주택·3주택+·비주택·비1세대) — stale reason 미전송·검증 skip(데드락 방지)
  if (mode === "temporary_two_house" && !TEMP_TWO_HOUSE_PROVISO_REASONS.has(reason)) return "";
  return reason;
}
// 800줄 분리 (P1, 2026-06-11) — 외부 import 호환을 위해 re-export 보존
import { toEngineReductions, toSelfCultivatedExpropriatedLand } from "./transfer-tax-api-reductions";
import { buildSameAdjustmentPeriodInput } from "./transfer-same-adjustment-period-input";
export { toEngineReductions, toSelfCultivatedExpropriatedLand } from "./transfer-tax-api-reductions";

// ─── ④ 상업용건물·오피스텔 환산취득가 (소령 §164⑥) — transfer-tax-api-commercial.ts로 분리 (800줄 정책, 재export 호환) ───
export { buildCommercialAppurtenantLand } from "./transfer-tax-api-commercial";
export { buildCommercialBuildingValuation } from "./transfer-tax-api-commercial";
// ⑬ 컴패니언 payload에서 직접 호출한다 — 위 재수출은 호출부 호환용이라 이 파일 스코프엔 없다.
import { buildCommercialAppurtenantLand } from "./transfer-tax-api-commercial";
import { buildCommercialBuildingValuation } from "./transfer-tax-api-commercial";
import { buildRedevelopmentPayload as buildRedevPayloadForCompanion } from "./transfer-tax-api-redev";
import { buildGeneralBuildingValuation as buildGeneralBuildingValuationForCompanion } from "./transfer-tax-api-gb";

// ─── ④ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — transfer-tax-api-rental-housing.ts로 분리 (800줄 정책, 재export 호환) ───
export { toRentalHousingExceptionApi } from "./transfer-tax-api-rental-housing";


// ─── ④ 일반건물(토지+건물 일괄) API 변환 — transfer-tax-api-gb.ts로 분리 (800줄 정책, 재export 호환) ───
export { buildGeneralBuildingValuation } from "./transfer-tax-api-gb";

// ⑤ 렌더 게이트와 **같은 소스**를 쓴다 — 종전에는 세 벌이 복제돼 `redevelopment_apt`가
// 여기만 빠져 있었다(`lib/calc/housing-like-asset.ts` 헤더 참조). 재export로 호출부 호환 유지.
export { isHousingLike } from "./housing-like-asset";

/**
 * 분자·분모(number)에서 지분 모드 여부 판정. 단일 진실 공급원.
 * 분자 < 분모이고 둘 다 양수면 true (지분 모드). 100/100, 50/50 등 분자=분모는 false (단독).
 * NaN·0·음수 등 비정상 입력은 false (안전 fallback).
 */
export function isFractionalRatio(numerator: number, denominator: number): boolean {
  if (!isFinite(numerator) || !isFinite(denominator)) return false;
  if (denominator <= 0 || numerator <= 0) return false;
  return numerator < denominator;
}

/**
 * 분자·분모(string)에서 지분 모드 여부 판정. UI 폼 필드 전용 어댑터.
 */
export function isFractionalRatioStr(numerator: string, denominator: string): boolean {
  return isFractionalRatio(parseFloat(numerator), parseFloat(denominator));
}

/**
 * 자산의 공유 지분 비율을 [0..1] 실수로 계산.
 * 미설정/단독 소유 시 1.0. 분모 ≤ 0 또는 NaN 시 1.0 (안전 fallback).
 */
export function getOwnershipRatio(asset: AssetForm): number {
  const n = parseFloat(asset.ownershipNumerator || "100");
  const d = parseFloat(asset.ownershipDenominator || "100");
  if (!isFinite(n) || !isFinite(d) || d <= 0 || n <= 0) return 1.0;
  return Math.min(n / d, 1.0);
}

/** 지분 모드 여부 (자산 단위 어댑터). isFractionalRatio 단일 진실 공급원에 위임. */
export function isFractionalOwnership(asset: AssetForm): boolean {
  return isFractionalRatioStr(
    asset.ownershipNumerator || "100",
    asset.ownershipDenominator || "100",
  );
}

/**
 * "진짜 지분 모드(같은 물건 분할 취득)" 판정 — 전 자산이 fractional(분자<분모)인 경우만 true.
 * route.ts:423 `isFullFractionalBundle`(primary + 전 companion fractional)와 동일 기준.
 * companion 모드(다른 물건 함께양도)에 우연히 부분소유(1/2) 자산이 섞인 경우(primary=100/100)는
 * every=false로 배제 — 그 경우 각 자산 basic이 상이하므로 primary 병합을 하면 안 됨.
 */
export function isFullFractionalBundle(assets: AssetForm[]): boolean {
  return (
    assets.length > 1 &&
    assets.every((a) =>
      isFractionalRatioStr(a.ownershipNumerator, a.ownershipDenominator),
    )
  );
}

/**
 * 지분 모드 companion 자산에 primary의 기본정보(basic)를 병합한 새 자산 반환(순수 함수).
 * 같은 물건을 지분(%)별로 나눈 것이므로 자산종류·면적·토지성격은 primary와 동일.
 * UI에서 companion ① 기본정보를 숨기므로, API 변환·validate가 이 병합값을 사용한다.
 *
 * 병합 필드 = 같은 물건·같은 양도 사건이라 전 지분 공통인 값:
 *  - 기본정보(①): assetKind·acquisitionArea·transferArea·areaScenario·landNature
 *    (buildAssetPayload emit + validate basic 검사의 합집합. 소재지·좌표는 미emit·미검사 → 제외)
 *  - 양도정보(②): transferType·transferCause (양도 형태 드라이버 — companion ② UI 숨김 대응.
 *    ✅ **2026-09-03 정정**: 지분 분할도 **부담부증여를 지원**한다 — 아래 bg* 필드를 함께
 *    병합한다. **공익수용만** 여전히 validate가 차단한다)
 *  - 비사업용 토지 여부: **필지 자체의 성질**이라 전 지분 공통 (V10-f, 2026-09-02 코드리뷰).
 *    빠져 있던 동안에는 사용자가 Step4 토글을 **명시적으로 켠** 상태에서 지분1만 중과되고
 *    지분2 이상은 빠졌다(실측 341,517,000 → 416,178,400, 74,661,400원 과소).
 *    승계 근거가 「⑬ emit + ⑧ 검사의 합집합」이므로 ⑬가 이 키를 싣게 된 이상 여기에도 있어야 한다.
 * 취득측(취득원인·취득일·취득가액·지분율·필요경비)은 지분별 상이 → 병합 안 함.
 */
export function mergePrimaryBasic(a: AssetForm, primary: AssetForm): AssetForm {
  return {
    ...a,
    assetKind: primary.assetKind,
    acquisitionArea: primary.acquisitionArea,
    transferArea: primary.transferArea,
    areaScenario: primary.areaScenario,
    landNature: primary.landNature,
    transferType: primary.transferType,
    transferCause: primary.transferCause,
    /**
     * 부담부증여(소령 §159) 하위필드 — **물건 단위 값**이라 전 지분 공통이다 (축 B, 2026-09-03).
     *
     * 컴패니언 카드는 ② 양도정보를 숨기므로 이 값들이 primary에만 있다. 병합하지 않으면
     * ④가 컴패니언의 `burdenedGiftInfo`를 만들지 못해 **그 지분만 §159를 타지 않는다**.
     *
     * 채무 4필드는 여기서 **원본(물건 전체)** 을 그대로 옮긴다 — 지분 안분은 ④
     * (`buildBurdenedGiftInfo`의 `debtScaleRatio`)가 자산별 지분율로 한 번만 적용한다.
     */
    /**
     * 상가(§101①·환산) 하위필드 — **물건 단위 값**이라 전 지분 공통이다 (축 B, 2026-09-03).
     * 컴패니언 카드는 ① 기본정보를 숨기므로 병합하지 않으면 ④가 서브객체를 만들지 못해
     * **그 지분만** 부수토지 초과 세율·환산을 잃는다(부담부증여 bg*와 같은 축).
     */
    cbTotalLandArea: primary.cbTotalLandArea,
    cbTotalBuildingFootprintArea: primary.cbTotalBuildingFootprintArea,
    cbZoneType: primary.cbZoneType,
    cbUnapprovedBuilding: primary.cbUnapprovedBuilding,
    cbLandArea: primary.cbLandArea,
    cbExclusiveArea: primary.cbExclusiveArea,
    cbSharedArea: primary.cbSharedArea,
    cbUnitPriceAtTransfer: primary.cbUnitPriceAtTransfer,
    cbUnitPriceAtFirstOrAcq: primary.cbUnitPriceAtFirstOrAcq,
    cbLandPricePerSqmAtTransfer: primary.cbLandPricePerSqmAtTransfer,
    cbLandPricePerSqmAtFirst: primary.cbLandPricePerSqmAtFirst,
    cbBuildingStdPriceAtTransfer: primary.cbBuildingStdPriceAtTransfer,
    cbBuildingStdPriceAtFirst: primary.cbBuildingStdPriceAtFirst,
    cbBuildingStdPriceAtAcq: primary.cbBuildingStdPriceAtAcq,
    cbPrevStdPriceSum: primary.cbPrevStdPriceSum,
    cbStdPriceAdjustMonths: primary.cbStdPriceAdjustMonths,
    bgValuationMode: primary.bgValuationMode,
    bgDonorRelation: primary.bgDonorRelation,
    bgLendingDepositTotal: primary.bgLendingDepositTotal,
    bgMortgageDebtAmount: primary.bgMortgageDebtAmount,
    bgAnnualRentTotal: primary.bgAnnualRentTotal,
    bgMortgageSetAmount: primary.bgMortgageSetAmount,
    bgMarketValueAtTransfer: primary.bgMarketValueAtTransfer,
    bgMarketValueAtAcquisition: primary.bgMarketValueAtAcquisition,
    bgAcquisitionMethod: primary.bgAcquisitionMethod,
    bgActualAcquisitionLand: primary.bgActualAcquisitionLand,
    bgActualAcquisitionBuilding: primary.bgActualAcquisitionBuilding,
    bgActualAcquisitionTotal: primary.bgActualAcquisitionTotal,
    isNonBusinessLand: primary.isNonBusinessLand,
  };
}

/**
 * ⑬ 1990.8.30. 이전 취득 토지 기준시가 환산 sub-object 빌드 (단건·다건 공용 단일 진실).
 *
 * 엔진 STEP 0.4(`transfer-tax.ts`)가 pre1990Land 존재 시 취득기준시가를 grade에서 재산출하고
 * acquisitionPrice=0·useEstimatedAcquisition=true를 override한다. 양도시 기준시가는 상위
 * standardPriceAtTransfer로 공급하므로 sub-object에 담지 않는다(pTsf 제거).
 *
 * 필수 필드(등급 3종·면적·1990 ㎡당가) 미충족 시 `{}` 반환 — 상위 spread에서 무해.
 */
export function buildPre1990LandPayload(
  primary: AssetForm,
  transferDate: string,
): { pre1990Land: object } | Record<string, never> {
  const buildGrade = (raw: string) => {
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return primary.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };
  const gCur = buildGrade(primary.pre1990Grade_current ?? "");
  const gPrev = buildGrade(primary.pre1990Grade_prev ?? "");
  const gAcq = buildGrade(primary.pre1990Grade_atAcq ?? "");
  // A01(2026-09-02): 일부양도(partial)에서 **양도분 면적**을 써야 한다.
  // 종전에는 여기만 raw `acquisitionArea`(취득 전체면적)를 썼고, 최상위 `acquisitionArea`
  // (`transfer-tax-api.ts:483`)와 다필지 payload(`transfer-tax-api-parcels.ts:68`)는 이미
  // `resolveAcqAreaForStdPrice`를 경유했다 — **세 경로 중 pre1990만 어긋나 있었다**.
  // 양도시 기준시가는 `StandardPriceInput`이 양도면적 기준으로 산출하므로 분자만
  // (취득면적/양도면적)배 부풀려져 환산비율이 1.0이 되고 양도차익이 통째로 0이 됐다
  // (실측 154,704,000원 과소 — 전액 소멸).
  // 콤마 제거는 stale 저장소 방어로 유지한다(현행 DecimalInput 저장값에는 콤마가 없다).
  const areaSqm =
    resolveAcqAreaForStdPrice({
      areaScenario: primary.areaScenario,
      acquisitionArea: (primary.acquisitionArea ?? "").replace(/,/g, ""),
      transferArea: (primary.transferArea ?? "").replace(/,/g, ""),
    }) ?? 0;
  const p1990 = parseAmount(primary.pre1990PricePerSqm_1990 ?? "");
  if (!gCur || !gPrev || !gAcq || areaSqm <= 0 || p1990 <= 0) return {};
  return {
    pre1990Land: {
      acquisitionDate: primary.acquisitionDate,
      transferDate,
      areaSqm,
      pricePerSqm_1990: p1990,
      grade_1990_0830: gCur,
      gradePrev_1990_0830: gPrev,
      gradeAtAcquisition: gAcq,
    },
  };
}

/**
 * 100% 기준 금액에 지분 비율을 적용 (정수 floor).
 * 본체는 엔진 `tax-utils.ts` 단일 소스 — 엔진(개산공제 base)과 API 변환이 **같은 절사 규약**을
 * 써야 사이드바 미리보기와 엔진 결과가 어긋나지 않는다(실측 0.49% 1원 차).
 */
export { applyRatio };

/**
 * 엔진 `acquisitionArea`로 보낼 면적 — **취득 당시 단가에 곱할 면적**.
 *
 * 일부양도(`areaScenario === "partial"`)에서는 취득 전체 면적이 아니라 **양도한 부분의
 * 면적**이다. 「소득세법 시행령」 제176조의2 제2항 제2호의 "취득당시의 기준시가"는
 * 법 제114조 제7항 문맥상 **양도자산의** 것이고, 일부양도에서는 양도한 부분이 그 자산이다.
 * 조심 2018부0572(2018.05.03, 기각)도 "각 필지의 취득 당시 기준시가"를 안분 기준으로 삼았다.
 *
 * 환지(`reduction`)는 예외다 — UI가 이미 `acquisitionArea`에 **의제취득면적**
 * (`priorLandArea × allocatedArea / entitlementArea`)을 계산해 넣으므로 그대로 쓴다
 * (`transfer-tax-api.ts:499` 주석 · `multi-parcel-transfer.ts:326` 동일 산식).
 * `increase`(증환지)는 증가분이 별도 자산으로 분리되므로 당초분은 전체 면적이 맞다.
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §0 C-6 · §3.3 L-4
 */
/**
 * 취득 당시 기준시가 산정에 **양도분 면적**을 써야 하는 시나리오인가.
 *
 * `partial`(일부 양도)에서만 참이다. `reduction`(감환지)은 UI가 이미 `acquisitionArea`에
 * 의제취득면적을 넣으므로 그대로 통과시키고, `increase`(증환지)는 증가분이 별개 자산으로
 * 분리되므로 당초분은 전체 면적이 맞다(계획서 BR4).
 *
 * ⑤UI(`CompanionAcqPurchaseBlock`의 취득시 `StandardPriceInput`)와 ④변환이 **같은 술어**를
 * 공유하게 하려고 분리했다 — 갈리면 화면이 파생한 총액과 엔진이 쓰는 면적이 어긋난다
 * (§9-7 실측: 총세액 27,827,432 vs 79,199,706 = **51,372,274원 과소과세**).
 */
export function usesTransferAreaForAcqStdPrice(areaScenario?: string): boolean {
  return (areaScenario ?? "same") === "partial";
}

export function resolveAcqAreaForStdPrice(asset: {
  areaScenario?: string;
  acquisitionArea?: string;
  transferArea?: string;
}): number | undefined {
  const acq = asset.acquisitionArea ? parseFloat(asset.acquisitionArea) || undefined : undefined;
  if (!usesTransferAreaForAcqStdPrice(asset.areaScenario)) return acq;
  const tr = asset.transferArea ? parseFloat(asset.transferArea) || undefined : undefined;
  // 양도면적 미입력(입력 중) 시 전체 면적 fallback — 차단은 validate 소관이며
  // 여기서 undefined로 떨구면 기준시가 경로가 조용히 비활성된다.
  return tr ?? acq;
}

/**
 * 자산별 effective transferExpense 계산 (B3 폼-수준 안분 로직).
 * 우선순위:
 *   1. 자산-수준 transferExpense 직접 입력 (>0): 지분 모드 시 × ratio, 단독 모드는 그대로
 *   2. 폼-수준 totalTransferExpense × ratio (지분 모드 + 자산-수준 미입력)
 *   3. 폼-수준 totalTransferExpense 그대로 (단독 모드 — 일반적으로 미사용)
 *   4. 0
 */
export function effectiveTransferExpenseFor(
  asset: AssetForm,
  ratio: number,
  fractional: boolean,
  totalTransferExpense?: number,
): number {
  const direct = parseAmount(asset.transferExpense);
  if (direct > 0) {
    return fractional ? applyRatio(direct, ratio) : direct;
  }
  if (fractional && totalTransferExpense && totalTransferExpense > 0) {
    return applyRatio(totalTransferExpense, ratio);
  }
  return 0;
}


/**
 * 자산 1건 → 번들 companionAssets 배열 항목 변환.
 *
 * 지분 모드(ownershipRatio < 1.0): 사용자 입력값은 100% 기준이므로 × ratio 자동 적용.
 * 영향 필드: fixedSalePrice·fixedAcquisitionPrice·directExpenses·capitalExpenditure·transferExpense·publishedValueAtInheritance.
 *
 * @param totalTransferExpense 폼-수준 총 양도비 (B3) — 자산-수준 transferExpense가 0이면 ratio 안분으로 자동 사용.
 */
export function buildAssetPayload(
  asset: AssetForm,
  bundledSaleMode: "actual" | "apportioned",
  transferDate: string,
  totalContractPrice?: number,
  totalTransferExpense?: number,
  primary?: AssetForm,
  // 1세대1주택 여부는 세대 단위 — asset.isOneHousehold(기본 false·동기화 부재)가 아닌
  // form.isOneHousehold(Step4 "1세대 해당" 토글)를 세대 단위 단일 소스로 전달받는다.
  formIsOneHousehold?: boolean,
  /**
   * 컴패니언(다른 물건) 함께 부담부증여 — 신고 단위 B를 자산가액 비율로 재배분한 이 카드의
   * 채무액(소령 §159①②). 산정은 `apportionCompanionBurdenedGiftDebt` 단일 지점.
   * 축 B(지분 분할)에서는 넘기지 않는다 — 그쪽은 지분율 스케일이 §159의 B/C를 보존한다.
   */
  burdenedGiftDebtOverride?: number,
  /**
   * ⑬ 겸용주택 컴패니언 전용 — `buildMixedUsePayload`가 폼-전역 값(거주개월·계약총액·세대 축)을
   * 읽어야 해서 폼을 통째로 받는다.
   *
   * ⚠️ optional이지만 **누락이 조용하지 않다** — ⑩ refine이 `mixed_use_house`에 `mixedUse`를
   *    강제하므로 빠지면 400이 된다(침묵 오산이 아니라 명시 실패).
   */
  form?: TransferFormData,
) {
  const reductions = toEngineReductions(asset.reductions ?? [], asset.acquisitionCause, asset.expropriationNoticeDate);

  // 증환지 증가분: standardPriceAtTransfer 빈값 시 당초분(primary) ㎡당 × 증가분 면적 파생.
  // ⑤·⑥·⑧과 **같은 leaf** — 규칙을 복제하면 한 곳만 빠뜨려도 조용히 어긋난다.
  const replotIncStdAtTransfer = replotIncrementStdPriceAtTransfer(asset, primary);

  /**
   * §166⑥ **안분 키** — 사용자가 자산 카드에 입력한 「양도시 기준시가」(증환지 증가분은 파생값).
   *
   * 🔑 아래 `standardPriceAtTransfer`와 **같은 식에서 출발하지만 역할이 다르다**(V-10).
   *    이월과세 `general` 환산 컴패니언에서는 `...cp.topLevelOverrides`가
   *    `standardPriceAtTransfer`를 **증여자 축 환산 분모**(§97①1호나목)로 덮어쓰므로,
   *    안분 키를 같은 칸에 실으면 사용자 입력값이 사라진다. 그래서 전용 키로 나눠 보낸다 —
   *    primary가 이미 `standardPriceAtTransferForApportion`(폼-전역)으로 두 역할을 분리해
   *    보내는 것과 **같은 방식**이다.
   */
  const stdAtTransferForApportion =
    parseAmount(asset.standardPriceAtTransfer) > 0
      ? parseAmount(asset.standardPriceAtTransfer)
      : replotIncStdAtTransfer;

  /**
   * ⑬ 상가 자산-수준 서브객체 — 컴패니언(다른 물건)·축 B 공통.
   *
   * 🔑 **둘 다 지분 스케일을 하지 않는다.**
   * - `commercialAppurtenantLand`: 대지·바닥 **면적**(§101① 배율 판정)이라 물건 단위 사실이다.
   *   지분으로 줄이면 초과분 판정 자체가 달라져 §104①8호 +10%p가 틀린다.
   * - `commercialBuildingValuation`: 환산 기준시가는 분자·분모로 함께 나타나 **약분**된다
   *   (재개발 권리가액 같은 절대금액 성분과 구별 — 판별 규칙은 계획서 참조).
   */
  const cbAppurtenantLand = buildCommercialAppurtenantLand(asset);
  const cbValuation = buildCommercialBuildingValuation(asset, transferDate);

  // 감환지: acquisitionArea에 의제취득면적이 UI에서 이미 계산됨
  const effectiveLandArea = asset.acquisitionArea ? parseFloat(asset.acquisitionArea) : undefined;

  // 공유 지분 비율 — 단독 소유는 1.0, 지분 모드는 < 1.0
  const ratio = getOwnershipRatio(asset);
  const fractional = ratio < 1.0;

  const inheritanceValuation =
    asset.acquisitionCause === "inheritance"
      ? {
          inheritanceDate: asset.inheritanceDate || asset.acquisitionDate,
          assetKind: deriveEngineInheritanceAssetKind(asset),
          landAreaM2: effectiveLandArea,
          // 지분 모드: 100% 기준 입력값(공동주택가격 등)에 × ratio 적용
          publishedValueAtInheritance: fractional
            ? applyRatio(parseAmount(asset.publishedValueAtInheritance), ratio)
            : parseAmount(asset.publishedValueAtInheritance),
        }
      : undefined;

  const fixedAcqRaw =
    (asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition && asset.fixedAcquisitionPrice) ||
    (asset.acquisitionCause === "gift" && asset.fixedAcquisitionPrice) ||
    // 사례 28 — 신축(자가건축): fixedAcquisitionPrice = 신축비용(취득가액)
    (asset.acquisitionCause === "newConstruction" && asset.fixedAcquisitionPrice)
      ? parseAmount(asset.fixedAcquisitionPrice)
      : undefined;

  // 사례 28 — 신축(자가건축): 4시점 중 가장 빠른 날을 acquisitionDate로 자동 도출 (영 §162①4호).
  // UI 측 onChange 자동 동기화의 fallback (페이지 reload 후 마운트 시 이미 입력된 데이터에 대비).
  const newConstructionAcqDate =
    asset.acquisitionCause === "newConstruction"
      ? (() => {
          const dates = [
            asset.occupancyApprovalDate,
            asset.approvalCertificateDate,
            asset.temporaryApprovalDate,
            asset.actualUseDate,
          ].filter((d): d is string => !!d && d.length === 10);
          return dates.length > 0 ? dates.sort()[0] : undefined;
        })()
      : undefined;
  const fixedAcquisitionPrice = fixedAcqRaw !== undefined && fractional
    ? applyRatio(fixedAcqRaw, ratio)
    : fixedAcqRaw;

  // 양도가액 결정: 지분 모드는 contractTotalPrice × ratio (사용자 actualSalePrice 무시).
  // 단독은 기존 동작 — actualSalePrice 입력값 사용.
  const fixedSalePriceRaw =
    bundledSaleMode === "actual" && asset.actualSalePrice
      ? parseAmount(asset.actualSalePrice)
      : undefined;
  const fixedSalePrice = fractional && totalContractPrice && totalContractPrice > 0
    ? applyRatio(totalContractPrice, ratio)
    : fixedSalePriceRaw;

  return {
    /**
     * ④ 토지·건물 **분리취득** 축 (N-6(A), 2026-08-23) — 단건과 **같은 공용 빌더**를 쓴다.
     *
     * `buildSplitPayload`는 처음부터 `AssetForm`을 받는 자산-무관 함수였고, ⑤ UI의
     * 「토지·건물 취득일 다름」 토글도 자산 인덱스를 보지 않는다. 그런데 이 빌더가 그것을
     * **부르지 않아** 컴패니언에서 분리취득을 켜도 값이 통째로 사라졌다(⑫에도 칸이 없었다).
     *
     * ⚠️ 스프레드를 **맨 앞에** 둔다 — 아래 명시 키(`standardPriceAtAcquisition` 등)가
     *    이기도록. `buildSplitPayload`는 별개취득에서 결합 총액을 `undefined`로 덮어쓰는데,
     *    그 override는 **단건 body에서만** 성립하는 규약이다(본체가 먼저 설정하고 빌더가 뒤에
     *    온다). 컴패니언은 순서가 반대라 여기서는 앞에 둔다.
     * ⚠️ 부담부증여는 제외된다 — `isSplitPayloadActive`가 막는다(§159가 총액을 override하므로
     *    파트 직접 입력과 결합하면 잔액이 음수가 된다).
     */
    ...buildSplitPayload(asset, {
      isBurdenedGift: asset.transferType === "burdened_gift",
      // PHD(§164⑤)는 컴패니언 미지원 — N-6 (B)에서 ⑤·⑧을 함께 닫았다.
      usesPhd: false,
      ratioed: makeRatioed(ratio, fractional),
    }),
    assetId: asset.assetId,
    assetLabel: asset.assetLabel,
    /**
     * ⑬ 자산 종류는 **접지 않고 그대로 보낸다** (2026-09-03).
     *
     * 종전에는 `toEngineAssetKind`가 `presale_right`·`right_to_move_in`을 `"housing"`으로
     * 접었다. 그 fold는 200을 내면서 §104①1호 60% 단일세율(분양권)·§166 3분할(입주권)을
     * **통째로 삭제**했고, 부수적으로 `resolveHousingContextFromCompanion`이 **정착면적 없는
     * 권리**를 부수토지 배율의 기준 주택으로 집게 만들었다. 두 자산의 ⑩⑫를 열면서
     * fold가 항등이 되어 함수를 제거했다.
     *
     * ⚠️ `general_building`은 ⑩ enum에 아직 없다 — ⑧이 막고 있고, 열려면 토지·건물 2파트
     *    산출물 축을 함께 배관해야 한다.
     */
    /**
     * 🔄 **겸용주택 → `mixed_use_house` (2026-09-04).** UI는 `housing` + `isMixedUseHouse`로
     *    모델링하지만, ⑫ 컴패니언 enum은 전용 값을 쓴다 — ⑭가 그 값으로 파트 확장 분기를
     *    고르기 때문이다. `housing`으로 접으면 주택·상가 분리 없이 계산된다(침묵 오산).
     */
    assetKind:
      asset.assetKind === "housing" && asset.isMixedUseHouse
        ? ("mixed_use_house" as const)
        : asset.assetKind,
    /**
     * ⑬ 겸용 서브객체 — **primary와 같은 빌더**(`buildMixedUsePayload`)를 자산별로 부른다.
     * ⑭가 이것으로 겸용 서브엔진을 돌려 파트 카드 4~5장을 만든다.
     */
    ...(() => {
      const mu = form ? buildMixedUsePayload(asset, form) : undefined;
      return mu !== undefined ? { mixedUse: mu } : {};
    })(),
    // ④ 공익수용 §164⑨ 1호 특례 — **컴패니언 자산도 지원**(계획 Q5).
    //
    // 🔴 `transferCause`는 **1호 트랙의 게이트**다(엔진 `applyExpropriationValuation`:112 ·
    //    `applyHousingExpropriationValuation`:257). 이것을 싣지 않으면 아래 min[] 후보값을
    //    아무리 실어도 1호는 **한 번도 발동하지 않는다**. 게이트는 1호가 도달하는 트랙
    //    (원/㎡ 가·나목 + 주택 총액 라목)의 합집합 — 그 밖은 아래와 같은 이유로 막는다.
    //    ⚠️ 2호(공매·경락)는 조문상 수용을 요건으로 하지 않으므로 `transferCause`에 **종속시키지 않는다**.
    ...((isExprValuationEligibleAssetKind(asset.assetKind) ||
      isHousingExprEligibleAssetKind(asset.assetKind)) && asset.transferCause
      ? { transferCause: asset.transferCause }
      : {}),
    // min[] 3후보 값은 여기서 실어야
    // `buildCompanionEngineInputs`가 엔진 input에 매핑할 수 있다(⑫ 컴패니언 스키마 동반 필수).
    //
    // ⚠️ **적격 자산일 때만 전송**(UI 노출 조건과 동일 — `isExprValuationEligibleAssetKind`).
    //    무게이트로 두면 안 되는 이유: `bundled-split-helpers.ts:190`이 컴패니언 propertyType을
    //    `housing|building` 외 **전부 "land"로 뭉갠다**. 상가 컴패니언에 stale 보상값이 남아 있으면
    //    **토지 의미로 특례가 잘못 발동**한다. 여기서 막으면 원천 차단된다.
    ...(isExprValuationEligibleAssetKind(asset.assetKind)
      ? {
          standardPricePerSqmAtTransfer:
            parseAmount(asset.standardPricePerSqmAtTransfer) || undefined,
          transferArea: parseFloat(asset.transferArea) || undefined,
          compensationPerSqm: parseAmount(asset.compensationPerSqm) || undefined,
          compensationBasisStdPrice: parseAmount(asset.compensationBasisStdPrice) || undefined,
        }
      : {}),
    // §164⑨2호 공매·경락 (P4) — 컴패니언도 지원(1호와 대칭). 적격 자산(land·building·housing)만 전송.
    ...(isAuctionEligibleAssetKind(asset.assetKind)
      ? {
          isAuctionTransfer: asset.isAuctionTransfer || undefined,
          auctionPrice: parseAmount(asset.auctionPrice) || undefined,
        }
      : {}),
    // §164⑨1호 주택 총액 트랙 (P5) — 컴패니언 주택도 지원. 주택일 때만 전송.
    ...(isHousingExprEligibleAssetKind(asset.assetKind)
      ? {
          housingCompensationTotal: parseAmount(asset.housingCompensationTotal) || undefined,
          housingCompensationBasisTotal: parseAmount(asset.housingCompensationBasisTotal) || undefined,
        }
      : {}),
    // §97①1호나목 **환산 분모**. 이월과세 general 환산에서만 아래 `cp.topLevelOverrides`가
    // 증여자 양도시 기준시가로 덮어쓴다 — 그 override는 의도된 것이다.
    standardPriceAtTransfer: stdAtTransferForApportion,
    /** §166⑥ 안분 키 — override 대상이 아니다(위 const JSDoc 참조). */
    standardPriceAtTransferForApportion: stdAtTransferForApportion,
    // ④ §164⑧ 동일조정기간 환산 — 단건과 같은 빌더(단일 소스)
    sameAdjustmentPeriod: buildSameAdjustmentPeriodInput(asset),
    standardPriceAtAcquisition:
      asset.acquisitionCause === "purchase" && asset.useEstimatedAcquisition && asset.standardPriceAtAcq
        ? parseAmount(asset.standardPriceAtAcq)
        : undefined,
    // 개산공제 base 축소용 — 기준시가(위)는 물건 전체 raw, 지분 적용은 엔진이 개산공제에서만.
    ownershipRatio: fractional ? ratio : undefined,
    /**
     * ⑬ 부담부증여(소령 §159) — 축 B(지분 분할 취득) 컴패니언. 누락 시 **침묵 stripping**이라
     * 그 지분만 §159를 타지 않아 세액이 조용히 틀린다.
     *
     * 채무는 **이 자산의 지분율로 안분**해 보낸다(축 A와 반대 — 근거는 `buildBurdenedGiftInfo`).
     * 평가액·기준시가는 물건 전체 raw로 두고 엔진이 `ownershipRatio`로 줄인다.
     */
    /** ⑬ 상가 서브객체 — 열거 누락 시 침묵 stripping이라 그 자산만 환산·부수토지 축을 잃는다. */
    ...(cbAppurtenantLand !== undefined ? { commercialAppurtenantLand: cbAppurtenantLand } : {}),
    ...(cbValuation !== undefined ? { commercialBuildingValuation: cbValuation } : {}),
    /**
     * ⑬ 시행령 §166 서브객체 — 입주권·재개발APT 컴패니언.
     *
     * **primary와 같은 빌더**를 자산별로 부른다(`buildRedevelopmentPayload`). 그 빌더는 절대금액
     * 성분(권리가액·필요경비)의 지분 스케일을 이미 안고 있는데, 컴패니언은 각 자산이 자기 물건의
     * 100%라 `ownershipRatio`를 넘기지 않는다 — 축 A(공유지분)와 갈리는 지점이다.
     *
     * 누락 시 침묵 strip이라 그 자산만 §166을 잃고 일반 주택 산식으로 계산된다.
     */
    ...(asset.assetKind === "right_to_move_in" || asset.assetKind === "redevelopment_apt"
      ? { redevelopment: buildRedevPayloadForCompanion(asset) }
      : {}),
    /**
     * ⑬ 일반건물 서브객체 — 컴패니언 함께양도. **primary와 같은 빌더**를 쓴다.
     *
     * ⑭가 이것을 받아 `buildGbPartCards`로 **토지·건물 파트 카드**를 만든다. 누락 시 침묵
     * strip이라 그 자산이 토지·건물 분리 없이 계산된다(route 5-a-3이 도달 못 하던 종전 상태).
     */
    ...(() => {
      const gbv = asset.assetKind === "general_building"
        ? buildGeneralBuildingValuationForCompanion(asset, transferDate)
        : undefined;
      return gbv !== undefined ? { generalBuildingValuation: gbv } : {};
    })(),
    ...(asset.transferType === "burdened_gift"
      ? {
          // ⑬ 엔진 §159 게이트가 보는 값 — `burdenedGiftInfo`만으로는 발동하지 않는다.
          transferType: "burdened_gift" as const,
          burdenedGiftInfo: {
            ...buildBurdenedGiftInfo(asset, fractional ? ratio : undefined),
            // 컴패니언(다른 물건) 축에서만 실린다. 축 B는 undefined라 스프레드가 무해하다.
            ...(burdenedGiftDebtOverride !== undefined
              ? { assumedDebtOverride: burdenedGiftDebtOverride }
              : {}),
          },
        }
      : {}),
    directExpenses: fractional
      ? applyRatio(parseAmount(asset.directExpenses), ratio)
      : parseAmount(asset.directExpenses),
    // §97② 단서 swap 분리 입력 — 자산-수준 자본적 지출·양도비.
    // 지분 모드: 100% 기준 입력값에 × ratio 자동 적용.
    // 양도비는 자산-수준 직접 입력 우선, 0이면 폼-수준 totalTransferExpense × ratio fallback (B3).
    capitalExpenditure: (() => {
      const directCapex = parseAmount(asset.capitalExpenditure);
      const directExp = parseAmount(asset.transferExpense);
      const effExpense = effectiveTransferExpenseFor(asset, ratio, fractional, totalTransferExpense);
      // capex/transferExpense 또는 effExpense 중 하나라도 있으면 swap 분리 활성
      if (!directCapex && !directExp && !effExpense) return undefined;
      return fractional ? applyRatio(directCapex, ratio) : directCapex;
    })(),
    transferExpense: effectiveTransferExpenseFor(asset, ratio, fractional, totalTransferExpense) || undefined,
    reductions,
    // ④ §77 직접 경작 토지 — 농특세령 §4①1호 괄호. 단건 ④와 **같은 leaf** (D11-02).
    //    종전에는 단건이 `primary.reductions`만 봐서 컴패니언 자산은 항상 undefined였고,
    //    같은 농지를 주 자산에 두면 0원 / 컴패니언에 두면 감면세액 × 20%가 부과됐다.
    isSelfCultivatedExpropriatedLand: toSelfCultivatedExpropriatedLand(asset.reductions),
    inheritanceValuation,
    fixedAcquisitionPrice,
    // 세대 단위 — form.isOneHousehold(토글) 사용. asset.isOneHousehold는 UI 미동기화(기본 false)라
    // companion 주택이 일괄양도에서 항상 1세대1주택 비과세 미적용되던 버그 정정.
    isOneHousehold: formIsOneHousehold ?? asset.isOneHousehold,
    /**
     * §104③ 미등기양도자산 — **자산 단위**다(세대 단위인 위 `isOneHousehold`와 다르다).
     *
     * 일괄양도는 물건마다 등기 여부가 다를 수 있어 자산-수준 값을 그대로 싣는다. 주 자산은
     * 이 함수를 거치지 않고 폼-전역 값을 쓴다(`transfer-tax-api.ts:415`).
     *
     * ⑫Zod(`transfer-tax-schema-sub.ts:319`)·⑭엔진 매핑(`bundled-split-helpers.ts:246`)은
     * 이미 있었고 **여기서만 빠져 있었다** — 그래서 컴패니언 미등기가 항상 false였다.
     */
    isUnregistered: asset.isUnregistered,
    /**
     * §104①8호 비사업용 토지 중과 — **자산 단위**다(위 `isUnregistered`와 같은 층위).
     *
     * ⑫Zod(`transfer-tax-schema-sub.ts:463`)·⑭엔진 매핑(`bundled-split-helpers.ts:388`)은
     * 이미 있었고 **여기서만 빠져 있었다** — 그래서 서버가 `?? false`로 받아 컴패니언 토지의
     * 중과가 **항상 누락**됐다(V10-a, 2026-09-02 코드리뷰. 실측 328,541,400 → 332,805,000).
     * `isUnregistered`가 같은 모양으로 빠져 있던 것과 동일한 결함이다.
     *
     * assetKind 게이트는 단건(`transfer-tax-api.ts`)과 같은 조건 — 토지가 아니면 싣지 않는다(3중 패턴).
     */
    isNonBusinessLand: asset.assetKind === "land" ? (asset.isNonBusinessLand ?? false) : undefined,
    fixedSalePrice,
    /** 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용 (단독 소유는 미설정) */
    totalPropertyTransferPrice: fractional ? totalContractPrice : undefined,
    acquisitionCause: asset.acquisitionCause,
    useEstimatedAcquisition:
      asset.acquisitionCause === "purchase" ? asset.useEstimatedAcquisition : undefined,
    acquisitionDate: asset.acquisitionDate || newConstructionAcqDate || undefined,
    // Round 9 (2026-05-06): 자산-수준 매매계약일 (§99의3 등 13개 매매계약일 기준 조문)
    assetContractDate: asset.assetContractDate || undefined,
    decedentAcquisitionDate:
      asset.acquisitionCause === "inheritance" && asset.decedentAcquisitionDate
        ? asset.decedentAcquisitionDate
        : undefined,
    // §154⑧3호 상속주택 자체 양도 보유기간 통산
    decedentSameHouseholdBeforeInheritance:
      asset.acquisitionCause === "inheritance"
        ? asset.decedentSameHouseholdBeforeInheritance
        : undefined,
    decedentCohabitationHoldingStartDate:
      asset.acquisitionCause === "inheritance" && asset.decedentCohabitationHoldingStartDate
        ? asset.decedentCohabitationHoldingStartDate
        : undefined,
    decedentCohabitationResidenceMonths:
      asset.acquisitionCause === "inheritance" && asset.decedentSameHouseholdBeforeInheritance
        ? parseInt(asset.decedentCohabitationResidenceMonths) || 0
        : undefined,
    donorAcquisitionDate:
      asset.acquisitionCause === "gift" && asset.donorAcquisitionDate
        ? asset.donorAcquisitionDate
        : asset.acquisitionCause === "carryover_gift" && asset.carryover?.donorAcquisitionDate
        ? asset.carryover.donorAcquisitionDate
        : undefined,
    // 이월과세(증여) 전용 서브객체 — carryover_gift 시만 빌드
    // "general" 환산 모드에서 topLevelOverrides.standardPrice* 를 최상위에 주입
    ...(() => {
      const cp = buildCarryoverPayload(asset, transferDate, ratio);
      if (!cp) return {};
      return {
        carryoverTaxation: cp.carryoverTaxation,
        ...cp.topLevelOverrides,
      };
    })(),
    // ⑬ 사례 28 — companion 토지 세율 수동 오버라이드 (부수토지 일체과세 §104①2호·영§167의5)
    // undefined이면 엔진 자동 분기. 빈 문자열·null은 undefined로 정규화.
    manualHoldingPeriodOverride: asset.manualHoldingPeriodOverride ?? undefined,
    // ⑬ 토지 성질 명시 입력 (landNature) — 폼 enum → 엔진 enum 변환
    // 폼: "appurtenant"/"standalone" → 엔진: "appurtenant_to_housing"/"non_appurtenant"
    ...(asset.assetKind === "land" && asset.landNature !== undefined
      ? {
          landNature:
            asset.landNature === "appurtenant"
              ? ("appurtenant_to_housing" as const)
              : ("non_appurtenant" as const),
        }
      : {}),
    // ⑬ 사례 28 — companion 신축주택 정착면적·도시지역·4시점 (자동 분기용)
    // primary가 land이고 companion이 housing인 케이스에서 부수토지 한도 산정.
    ...(asset.acquisitionCause === "newConstruction"
      ? {
          buildingFootprintArea: asset.buildingFootprintArea
            ? parseFloat(asset.buildingFootprintArea)
            : undefined,
          isUrbanArea: asset.isUrbanArea,
          appurtenantLandZone: asset.appurtenantLandZone,
          occupancyApprovalDate: asset.occupancyApprovalDate || undefined,
          approvalCertificateDate: asset.approvalCertificateDate || undefined,
          temporaryApprovalDate: asset.temporaryApprovalDate || undefined,
          actualUseDate: asset.actualUseDate || undefined,
        }
      : {}),
  };
}

// ─── 재개발/재건축 (시행령 §166) — RedevelopmentInfo 서브객체 변환 ───
// buildRedevelopmentPayload는 800줄 정책에 따라 transfer-tax-api-redev.ts로 분리 (2026-05-15).
export { buildRedevelopmentPayload } from "./transfer-tax-api-redev";

/**
 * ⑬ 공익수용 양도당시 기준시가 차감 특례 (**소득세법 시행령 §164⑨ 1호**) 엔진 input 필드.
 * 엔진이 게이트(환산·수용·2009.02.04) 판정 — 여기선 원값만 전달(변환 계층 — 게이트 아님).
 * 원/㎡=parseAmount(정수), 면적=parseFloat(소수 ㎡).
 *
 * 자산종류 게이트는 **UI·validate·엔진 3층 모두**에 있다(계획 Q4 — 3층 명시).
 * 판정은 `lib/tax-engine/expropriation-scope.ts` **단일 소스** 위임 — 세 층이 같은 목록을 조회한다.
 */
export function buildExpropriationInput(primary: AssetForm) {
  return {
    transferCause: primary.transferCause,
    // §164⑨1호 per-sqm(가~다목) — **per-sqm 적격 자산일 때만** 전송(`buildAssetPayload` 컴패니언과 대칭).
    // ⚠️ 무게이트면 land→housing 전환 시 stale per-sqm 값이 주택 총액 트랙을 침묵 shadowing한다
    //    (엔진도 housing 배제로 방어하나 여기서도 원천 차단 — 코드리뷰 2026-07-16).
    ...(isExprValuationEligibleAssetKind(primary.assetKind)
      ? {
          standardPricePerSqmAtTransfer: parseAmount(primary.standardPricePerSqmAtTransfer) || undefined,
          transferArea: parseFloat(primary.transferArea) || undefined,
          compensationPerSqm: parseAmount(primary.compensationPerSqm) || undefined,
          compensationBasisStdPrice: parseAmount(primary.compensationBasisStdPrice) || undefined,
        }
      : {}),
    // §164⑨2호 공매·경락 (P4) — **적격 자산(land·building)일 때만** 전송(UI 노출 조건과 동일).
    // ⚠️ 무게이트면 assetKind를 land→housing으로 바꿔도 stale isAuctionTransfer가 남아
    //    housing(2호는 면적 게이트가 없음)에 침묵 발동한다. 여기서 원천 차단(코드리뷰 2026-07-16).
    ...(isAuctionEligibleAssetKind(primary.assetKind)
      ? {
          isAuctionTransfer: primary.isAuctionTransfer || undefined,
          auctionPrice: parseAmount(primary.auctionPrice) || undefined,
        }
      : {}),
    // §164⑨1호 주택 총액 트랙 (P5) — 주택일 때만 전송(엔진이 게이트).
    ...(isHousingExprEligibleAssetKind(primary.assetKind)
      ? {
          housingCompensationTotal: parseAmount(primary.housingCompensationTotal) || undefined,
          housingCompensationBasisTotal: parseAmount(primary.housingCompensationBasisTotal) || undefined,
        }
      : {}),
    // §164⑨1호 건물 split 토지분 트랙 (P6/D6) — 건물 자산일 때만 전송(엔진이 split·수용·환산 게이트).
    // 토지·건물 취득일 분리 양도 시 토지분 환산 분모만 낮춘다. 주택 split은 Q6 미지원(validate 차단).
    ...(isSplitLandExprEligibleAssetKind(primary.assetKind)
      ? {
          splitLandCompensationTotal: parseAmount(primary.splitLandCompensationTotal) || undefined,
          splitLandCompensationBasisTotal: parseAmount(primary.splitLandCompensationBasisTotal) || undefined,
        }
      : {}),
  };
}

// ─── ④⑬ §156의2⑤ 대체주택 비과세 특례 FLAT → nested (TS 미감지 영역 — 누락 시 침묵 strip) ───
/** 폼 → replacementHouse nested payload. 토글 OFF 또는 필수 날짜 미입력 시 {} */
export function buildReplacementHousePayload(form: TransferFormData): object {
  if (!form.replacementHouseSpecial || !form.replBusinessApprovalDate || !form.replCompletionDate)
    return {};
  return {
    replacementHouse: {
      businessApprovalDate: form.replBusinessApprovalDate,
      completionDate: form.replCompletionDate,
      replacementResidenceMonths: parseInt(form.replResidenceMonths || "0", 10),
      willResideNewHouse: form.replWillResideNewHouse,
    },
  };
}

// ─── ④⑬ §89② 3년 초과 예외 FLAT → 판별 유니온 (TS 미감지 영역 — 누락 시 침묵 strip) ───
/**
 * 폼 → `rightThreeYearException` payload.
 * 「소득세법 시행령」 §156의2④·§156의3③ / 「소득세법 시행규칙」 §75①.
 *
 * ⚠️ **미선언(`""`)은 키 자체를 만들지 않는다** — 엔진이 `undefined`를 「판정 불가」로 읽어
 *    종전 동작을 유지한다. `"none"`(해당 없음)과 반드시 구별해야 한다.
 * ⚠️ 필수값이 비면 키를 만들지 않는다 — 완성일 없는 `new_house`, 사유 없는 `delay`는
 *    입력 중인 상태이지 선언이 아니다.
 */
export function buildRightThreeYearExceptionPayload(form: TransferFormData): object {
  const kind = form.rightThreeYearExceptionKind;
  if (kind === "none") return { rightThreeYearException: { kind: "none" } };
  /**
   * ④2호 **전단** — 「완성되기 전」 양도는 **완성일을 요구하지 않는다**(R-3).
   * 사업이 진행 중이면 준공일 자체가 정해지지 않는다.
   */
  if (kind === "before_completion") {
    return {
      rightThreeYearException: {
        kind: "before_completion",
        movedInWithin3Years: form.rightMovedInWithin3Years,
        residedOneYearOrMore: form.rightResidedOneYearOrMore,
      },
    };
  }
  if (kind === "new_house") {
    if (!form.rightNewHouseCompletionDate) return {};
    return {
      rightThreeYearException: {
        kind: "new_house",
        completionDate: form.rightNewHouseCompletionDate,
        movedInWithin3Years: form.rightMovedInWithin3Years,
        residedOneYearOrMore: form.rightResidedOneYearOrMore,
      },
    };
  }
  if (kind === "delay") {
    if (!form.rightDisposalDelayReason) return {};
    return {
      rightThreeYearException: {
        kind: "delay",
        reason: form.rightDisposalDelayReason,
        disposedByThatMethod: form.rightDisposedByThatMethod,
      },
    };
  }
  return {};
}

// ─── ④⑬ §89② 합가 예외 FLAT → 판별 유니온 (TS 미감지 영역 — 누락 시 침묵 strip) ───
/**
 * 폼 → `mergedHouseholdFirstHouse` payload. 「소득세법 시행령」 §156의2⑧·⑨.
 *
 * ⚠️ **미선언(`""`)은 키 자체를 만들지 않는다** — 엔진이 `undefined`를 「판정 불가」로 읽어
 *    종전 동작을 유지한다. `"none"`(해당 없음)과 반드시 구별해야 한다.
 * ⚠️ 갈래마다 **요구 필드가 다르다** — 가목은 둘(인가일 이후 취득 · 1년 이상 거주),
 *    나·다목은 하나(권리 취득 전부터 소유), 3·5호는 없다. 통째로 spread하면 ⑫가 거부한다.
 */
export function buildMergedHouseholdFirstHousePayload(form: TransferFormData): object {
  const kind = form.mergedHouseholdFirstHouseKind;
  /**
   * 🔴 **allow-list로 판정한다.** 「빈 문자열만 걸러내고 나머지를 통과」시키면 신규 필드가 없는
   *    stale sessionStorage 폼에서 `kind: undefined`가 그대로 실려 ⑫가 요청 전체를 400으로
   *    거부한다(2026-08-26 실측 — 무관한 파이프라인 테스트 2건이 먼저 터졌다).
   *    memory `feedback_new_asset_field_stale_sessionstorage_guard`.
   */
  const DECLARED = [
    "house_only",
    "initial_right",
    "succeeded_right",
    "presale_right",
    "right_only",
    "none",
  ] as const;
  if (!(DECLARED as readonly string[]).includes(kind)) return {};
  if (kind === "initial_right") {
    return {
      mergedHouseholdFirstHouse: {
        kind,
        acquiredAfterApproval: form.mergedHouseholdAcquiredAfterApproval,
        residedOneYear: form.mergedHouseholdResidedOneYear,
      },
    };
  }
  if (kind === "succeeded_right" || kind === "presale_right") {
    return {
      mergedHouseholdFirstHouse: {
        kind,
        ownedBeforeRight: form.mergedHouseholdOwnedBeforeRight,
      },
    };
  }
  return { mergedHouseholdFirstHouse: { kind } };
}
