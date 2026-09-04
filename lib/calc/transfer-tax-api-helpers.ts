/**
 * 양도소득세 API 변환 헬퍼 — toEngineReductions + buildAssetPayload (companionAssets용)
 * transfer-tax-api.ts 800줄 정책에 따라 분리.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
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
// ─── ④ 자산 기본 파생(상속 구분·지분율·양도비) — transfer-tax-api-asset-basics.ts로 분리
//     (800줄 정책 + `companion-payload`와의 **순환 차단**, 재export 호환) ───
export {
  deriveInheritanceHouseKind,
  deriveEngineInheritanceAssetKind,
  isFractionalRatio,
  isFractionalRatioStr,
  getOwnershipRatio,
  ownershipRatioError,
  isFractionalOwnership,
  isFullFractionalBundle,
  effectiveTransferExpenseFor,
} from "./transfer-tax-api-asset-basics";

export { toEngineReductions, toSelfCultivatedExpropriatedLand } from "./transfer-tax-api-reductions";

// ─── ④ 상업용건물·오피스텔 환산취득가 (소령 §164⑥) — transfer-tax-api-commercial.ts로 분리 (800줄 정책, 재export 호환) ───
export { buildCommercialAppurtenantLand } from "./transfer-tax-api-commercial";
export { buildCommercialBuildingValuation } from "./transfer-tax-api-commercial";
// ⑬ 컴패니언 payload에서 직접 호출한다 — 위 재수출은 호출부 호환용이라 이 파일 스코프엔 없다.

// ─── ④ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — transfer-tax-api-rental-housing.ts로 분리 (800줄 정책, 재export 호환) ───
export { toRentalHousingExceptionApi } from "./transfer-tax-api-rental-housing";


// ─── ④ 일반건물(토지+건물 일괄) API 변환 — transfer-tax-api-gb.ts로 분리 (800줄 정책, 재export 호환) ───
export { buildGeneralBuildingValuation } from "./transfer-tax-api-gb";

// ⑤ 렌더 게이트와 **같은 소스**를 쓴다 — 종전에는 세 벌이 복제돼 `redevelopment_apt`가
// 여기만 빠져 있었다(`lib/calc/housing-like-asset.ts` 헤더 참조). 재export로 호출부 호환 유지.
export { isHousingLike } from "./housing-like-asset";

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

// ─── ④ 컴패니언 자산 payload — transfer-tax-api-companion-payload.ts로 분리 (800줄 정책, 재export 호환) ───
export { buildAssetPayload } from "./transfer-tax-api-companion-payload";

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
