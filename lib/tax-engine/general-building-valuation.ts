/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음. 순수 함수.
 * 단방향 의존: 이 파일은 transfer-tax-aggregate.ts에서 생성된 카드를 공급하며
 *             transfer-tax.ts 또는 aggregate를 import하지 않음 (역방향 금지).
 *
 * 법령 근거:
 *   소득세법 시행령 §166 ⑥ — 토지·건물 등 여러 자산 일괄 양도 시 기준시가 비율 안분
 *   소득세법 시행령 §176조의2 ② — 환산취득가액 (취득시/양도시 기준시가 비율)
 *   소득세법 §97 ② 2호 + 시행령 §163 ⑥ — 개산공제율 (등기 자산 3%, 미등기 0.3%)
 *   소득세법 §104조의3 + 시행령 §168의8 — 비사업용토지 판정 (건물 부수토지 배율)
 *
 * P0-2 원칙: 모든 금액 원(정수) 단위. Math.round() 금지 — Math.floor() 사용.
 * BigInt 원칙: 분자 ≈ 2.15×10¹⁷ 초과 시 safeMultiplyThenDivide() 자동 fallback.
 */

// `safeMultiplyThenDivide`는 Phase 2에서 미사용이 됐다 — 양도가 안분을 `resolveSaleApportionBasis`로
// 옮기면서 그 함수 안으로 들어갔다(산식은 동일). 내 변경이 만든 고아 import만 제거한다.
import { computeEstimatedDeduction, computeLumpSumDeductionBase } from "./tax-utils";
import { TRANSFER, ESTIMATED_DEDUCTION_RATE } from "./legal-codes";
import { apportionLandByBusinessArea } from "./general-building-area-apportion";
import { judgeAppurtenantLandExcess } from "./appurtenant-land-excess";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import { buildGeneralBuildingAssetCardsWithExtension } from "./general-building-extension";
import { applyConvertedHousingPriceOverride } from "./general-building-converted-housing";
import { calculateConvertedAcquisition } from "./general-building-converted-acquisition";
import { applyPartAcqModes } from "./general-building-part-acq";
import { resolveSaleApportionBasis } from "./sale-split-apportion-basis";
import { judgeDeemedUnclearSplit } from "./sale-split-deemed-unclear";
import type { SaleSplitJudgmentDetail } from "./types/transfer-split-gain.types";

// ============================================================
// 개산공제율 상수 (시행령 §163 ⑥)
// ============================================================

/**
 * 등기 자산(토지·일반건물·주택·오피스텔 등) 개산공제율 — 시행령 §163 ⑥.
 * SSOT: legal-codes `ESTIMATED_DEDUCTION_RATE.LAND_BUILDING` (상가 엔진과 공유).
 */
export const ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = ESTIMATED_DEDUCTION_RATE.LAND_BUILDING;

/**
 * 미등기양도자산 개산공제율 — 시행령 §163 ⑥.
 * ⚠️ 현재 미사용: 일반건물·상가 환산 경로는 등기 자산 전제(3% 고정)이며,
 *    route helper가 `estimatedDeductionRate: 0.03`을 주입한다. 미등기양도자산을
 *    지원하려면 route helper·validate에서 이 율로 wiring해야 한다.
 */
export const ESTIMATED_DEDUCTION_RATE_UNREGISTERED = ESTIMATED_DEDUCTION_RATE.UNREGISTERED;

// 비사업용토지 면적 직접 안분 헬퍼 (§104의3) — 800줄 정책으로 sibling 분리. 하위호환 re-export.
export { apportionLandByBusinessArea };

// ============================================================
// 공개 타입 — `types/general-building.types.ts`로 분리(2026-08-06, 800줄 정책)
// ============================================================

/**
 * 종전 경로에서 계속 import할 수 있도록 **재수출**한다 — `GeneralBuildingInput`만 18파일이
 * 이 경로를 쓴다(`lib/tax-engine/CLAUDE.md` 「타입 파일 분리 기준」).
 * 계약 가드: `__tests__/tax-engine/general-building-valuation-types-split.anchor.test.ts` T-2
 */
export type {
  GeneralBuildingInput,
  GeneralBuildingAllocation,
  GeneralBuildingAcquisition,
  GeneralBuildingEstimatedDeduction,
  AssetCardForAggregate,
  GeneralBuildingOutput,
} from "./types/general-building.types";

import type {
  GeneralBuildingInput,
  GeneralBuildingAllocation,
  GeneralBuildingEstimatedDeduction,
  AssetCardForAggregate,
  GeneralBuildingOutput,
} from "./types/general-building.types";

// ============================================================
// 내부 계산 함수
// ============================================================

/**
 * Step 1: 양도가 안분 (소득세법 시행령 §166 ⑥)
 *
 * 양도일 기준시가 비율로 토지·건물 양도가를 안분한다.
 *
 * 산식:
 *   토지 기준시가 = 양도시 공시지가(원/㎡) × 토지면적
 *   합계 기준시가 = 토지 기준시가 + 양도시 건물기준시가
 *   토지 양도가 = INT(총양도가 × 토지기준시가 / 합계기준시가)  ← BigInt 연산 필수
 *   건물 양도가 = 총양도가 − 토지양도가  (잔액 보정, 이중 floor 오차 방지)
 *
 * ⚠️ BigInt 필수: 분자 ≈ 925,000,000 × 920,550,000 ≈ 8.5×10¹⁷ > MAX_SAFE_INTEGER(9.0×10¹⁵)
 */
function allocateBundledTransferPrice(input: GeneralBuildingInput): {
  allocation: GeneralBuildingAllocation;
  /** 구분 기재가 있을 때만 채워진다 — 일괄양도는 비교 대상이 없어 판정하지 않는다 */
  judgment?: SaleSplitJudgmentDetail;
} {
  // 토지 기준시가 총액
  const landStdTotal = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );

  /**
   * 안분 basis — split 경로와 **같은 함수**를 쓴다(계획서 §16.2).
   *
   * 종전 인라인 산식과 **완전히 동일**하다(`floor(safeMultiplyThenDivide(총액, 토지std, 합계std))`
   * + 잔액 보정) — 그래서 회귀가 0이고, 그 대가로 「부가가치세법 시행령」 제64조 제1항의
   * basis 서열(감정평가가액 > 기준시가)이 일반건물에도 따라온다.
   */
  const basis = resolveSaleApportionBasis({
    totalTransferPrice: input.totalTransferPrice,
    transferDate: input.transferDate,
    stdPrice: { land: landStdTotal, building: input.transferBuildingStdPrice },
  });
  if (!basis.apportioned) {
    // 토지·건물 기준시가 합이 0 — 나눌 근거가 없다. 0으로 메우면 조용한 오답이 된다.
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "일반건물: 양도시 토지·건물 기준시가가 모두 0이라 양도가액을 안분할 수 없습니다 (소득세법 시행령 §166⑥).",
      { what: "양도가액" },
    );
  }
  const apportioned = basis.apportioned;

  // ── 구분 기재 없음(일괄양도) — 안분값이 곧 양도가액이다. 비교 대상이 없어 판정하지 않는다.
  const landIn = input.landTransferPrice;
  const buildingIn = input.buildingTransferPrice;
  if (landIn == null && buildingIn == null) return { allocation: apportioned };

  /**
   * ── 구분 기재 있음 — 한쪽만 주면 반대쪽은 `총액 − 입력값`으로 **유일하게 확정**된다.
   *
   * 🔴 도출된 파트도 판정 대상이다(계획서 §11.3 · S-8). 「한쪽만 검증하고 나머지는 차액으로
   *    결정」이 실무 자료가 지적한 실수유형이고, 수학적으로도 **작은 파트가 실질 제약**이다
   *    — 차이 금액은 양쪽이 같은데 분모가 작아 비율이 크다.
   */
  // 양쪽 다 주어졌으면 **합이 총액과 같아야** 한다 — 다르면 양도가액 합계가 어긋난 채 계산돼
  // 조용한 오답이 된다. 총액을 아는 곳이 여기뿐이라 이 검증은 엔진이 갖는다(validate는 자산
  // 하나만 받는데 단건 총액은 폼-전역 `contractTotalPrice`에서 온다).
  if (landIn != null && buildingIn != null && landIn + buildingIn !== input.totalTransferPrice) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `일반건물: 토지·건물 양도가액의 합(${(landIn + buildingIn).toLocaleString()}원)이 총 양도가액(${input.totalTransferPrice.toLocaleString()}원)과 다릅니다 — 한쪽만 입력하면 나머지는 총액에서 자동 계산됩니다.`,
      { what: "양도가액", reason: "sale_split_sum_mismatch" },
    );
  }

  const declared = {
    land: landIn ?? input.totalTransferPrice - buildingIn!,
    building: buildingIn ?? input.totalTransferPrice - landIn!,
  };
  const judged = judgeDeemedUnclearSplit({
    declared,
    apportioned,
    ...(input.saleSplitExemption ? { exemption: input.saleSplitExemption } : {}),
  });

  return {
    allocation: judged.applied,
    judgment: {
      deemedUnclear: judged.deemedUnclear,
      declared,
      apportioned,
      applied: judged.applied,
      basisKind: basis.kind!,
      ...(basis.appraisalRejected ? { appraisalRejected: basis.appraisalRejected } : {}),
      ...judged.detail,
    },
  };
}

/**
 * Step 3: 개산공제 (소득세법 §97 ② 2호 + 시행령 §163 ⑥)
 *
 * 취득시 기준시가에 개산공제율을 곱해 필요경비를 산정한다.
 *
 * 토지 산식: INT(취득시 공시지가(원/㎡) × 면적 × 율)
 * 건물 산식: INT(취득시 건물기준시가 총액 × 율)
 *
 * 법정 기본율: 등기 자산 3%, 미등기 0.3%
 */
function calculateEstimatedDeduction(
  input: GeneralBuildingInput,
  rate: number,
): GeneralBuildingEstimatedDeduction {
  const acqLandStdTotal = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );

  // 공유지분 축소(§163⑥ base) — 성분별 독립 적용. 토지는 §99①1호 가목(개별공시지가),
  // 건물은 나목(국세청장 산정)으로 **별도 공시**라 결합 총액 개념이 없다.
  const landDed = computeEstimatedDeduction(acqLandStdTotal, rate, input.ownershipRatio);
  const buildingDed = computeEstimatedDeduction(
    input.acquisitionBuildingStdPrice,
    rate,
    input.ownershipRatio,
  );

  return {
    land: landDed,
    building: buildingDed,
    landBase: computeLumpSumDeductionBase(acqLandStdTotal, input.ownershipRatio),
    buildingBase: computeLumpSumDeductionBase(
      input.acquisitionBuildingStdPrice,
      input.ownershipRatio,
    ),
  };
}

// ============================================================
// 공개 메인 함수
// ============================================================

/**
 * 일반건물(토지+건물 일괄) 환산취득가 계산 — 자산 카드 2장 생성
 *
 * 5단 파이프라인:
 *   1. 양도가 안분 (§166⑥ 기준시가 비율)
 *   2. 환산취득가 (§176의2②)
 *   3. 개산공제 (§163⑥ 3%)
 *   4. 비사업용토지 판정 (배율 내 여부)
 *   5. 자산 카드 2장 (토지·건물) 생성 → aggregate 엔진에 위임
 *
 * @param input 일반건물 환산 입력
 * @returns 중간 계산값 + 비사업용 판정 + 자산 카드 2장
 *
 * 법령 근거:
 *   TRANSFER.GENERAL_BUILDING_APPORTIONMENT — §166⑥
 *   TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ — §176의2②
 *   TRANSFER.GENERAL_BUILDING_LUMP_DEDUCTION — §97②2호 + §163⑥
 *   NBL.BUILDING_SITE — §168의8 (건물 부수토지 배율)
 */
export function buildGeneralBuildingAssetCards(
  rawInput: GeneralBuildingInput,
): GeneralBuildingOutput {
  // ── 사례 35 후속-1: §99-164-10 환산주택가격 분기 ──────────────────
  // hasFirstDisclosure=true 시 acquisition*StdPrice를 환산주택가격 안분값으로 override.
  // 이후 모든 다운스트림 로직(2-way·3-way·NBL 등)은 effective input 사용 → 변경 최소화.
  const input = applyConvertedHousingPriceOverride(rawInput);

  // ── 증축 분기 (사례 33 — extensionInfo 활성 시 3-way 안분) ──────────
  if (input.extensionInfo) {
    /**
     * 🔴 **R-4 — 증축 조합에서는 구분 기재를 받지 않는다** (계획서 §5 S-10 · §7 R-4).
     *
     * 3-way 안분은 건물을 **본체·증축 2장**으로 나누는데, 계약서의 「건물 양도가액」 하나를
     * 그 둘에 배분할 근거가 없다(Q-4 미확정). 근거 없이 면적비나 기준시가비로 나누면
     * **조용한 오답**이 된다 — 취득 축 V-3에서 같은 이유로 차단한 선례를 따른다.
     */
    if (input.landTransferPrice != null || input.buildingTransferPrice != null) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "증축이 있는 일반건물은 토지·건물 양도가액 구분 기재를 지원하지 않습니다 — 건물 구분가액을 본체와 증축분에 배분할 법령상 근거가 확정되지 않았습니다. 일괄양도(기준시가 비율 안분)로 계산하세요.",
        { what: "양도가액", reason: "extension_split_unsupported" },
      );
    }
    return buildGeneralBuildingAssetCardsWithExtension(input, input.extensionInfo);
  }

  // ── 기존 2-way 분기 (사례 31·32 — extensionInfo 미입력 시) ──────────

  // 개산공제율 결정 (기본 3%)
  const rate =
    input.estimatedDeductionRate ?? ESTIMATED_DEDUCTION_RATE_LAND_BUILDING;

  // Step 1: 양도가 안분 (§166⑥) + 구분 기재 시 §100③ 30% 의제 판정 (Phase 2)
  // 법령 참조: TRANSFER.GENERAL_BUILDING_APPORTIONMENT
  const { allocation, judgment: saleSplitJudgment } = allocateBundledTransferPrice(input);

  // Step 2: 환산취득가 (§176의2②) — 토지 분모만 §164⑨ 공익수용 특례 override(토지 전용, D16-GB).
  // 법령 참조: TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ
  const { acquisition: acquisitionConverted, expropriationValuationDetail } = calculateConvertedAcquisition(
    input,
    allocation,
  );

  // Step 3: 개산공제 (§163⑥)
  // 법령 참조: TRANSFER.GENERAL_BUILDING_LUMP_DEDUCTION
  const estimatedDeductionConverted = calculateEstimatedDeduction(input, rate);

  /**
   * Step 3.5: **파트별 취득 방식** (2026-08-05 P3) — 비-환산 파트는 그 파트의 실지거래가액을
   * 쓰고 개산공제(§163⑥)를 적용하지 않는다. 두 파트가 모두 환산이면 위 값을 그대로 통과시킨다
   * (회귀 0). 산식 정본은 `calcPartAcquisitionPrice` — split 경로와 같은 함수다.
   */
  const partAcq = applyPartAcqModes(input, acquisitionConverted, estimatedDeductionConverted);
  if (partAcq.missingParts.length > 0) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      `일반건물: ${partAcq.missingParts.join("·")} 취득가액을 입력하세요 — `
        + `환산이 아닌 파트는 그 파트의 실지거래가액이 필요합니다 (소득세법 §97①1호).`,
      { missingParts: partAcq.missingParts },
    );
  }
  const acquisition = { ...acquisitionConverted, ...partAcq.acquisition };
  const estimatedDeduction = { ...estimatedDeductionConverted, ...partAcq.estimatedDeduction };

  /**
   * 비사업용토지 판정 — **건축물(비주택) 부속토지**
   *
   * 근거 체인: 「소득세법」 제104조의3 제1항 제4호 나목 →
   *   「지방세법」 제106조 제1항 제2호(별도합산과세대상) →
   *   「지방세법 시행령」 제101조 제1항 제2호(바닥면적 × 제2항 적용배율)
   *
   * ⚠️ 「소득세법 시행령」 제168조의12는 **주택** 부수토지 배율이므로 이 경로에 쓰지 않는다.
   *   제101조 제2항에는 수도권 축이 없다(용도지역만으로 결정).
   *
   * 2026-05-09: 사용자 직접 입력 면적 기준. 균등층 가정 폐지.
   * 2026-07-30: 곱셈 대상을 **각 층 중 최대 바닥면적**으로 정정(종전 안내는 건축면적 — 조심 2025지0451 배척).
   * 2026-07-30: 「소득세법 시행령」 제168조의12(주택) 배율을 잘못 쓰던 것을
   *   「지방세법 시행령」 제101조 제2항으로 정정(22개 용도지역·수도권 조합 중 19개 오답이었다).
   *   초과분 면적(nonBusinessArea)·비율(nonBusinessRatio) 계산 → 토지 카드 분할 중과.
   */

  // 판정 본체는 공용 헬퍼(`appurtenant-land-excess.ts`) — GB 환산·증축·실거래가 3경로와
  // CB가 같은 로직을 공유한다. 여기서 재구현 금지.
  const {
    multiplier: appliedMultiplier,
    multiplierDetail,
    allowedLandArea,
    isWithinLimit: isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
  } = judgeAppurtenantLandExcess({
    landArea: input.landArea,
    buildingFootprintArea: input.buildingFootprintArea,
    zoneType: input.zoneType,
    isUnregistered: input.isUnregistered,
    context: "일반건물",
  });

  // Step 5: 자산 카드 생성 (aggregate 엔진 위임용)
  // 초과분이 있으면 토지를 사업용·비사업용 2장으로 분할 (§104의3 초과분만 중과)
  /**
   * 토지 카드 취득일 (M-1a) — `input.acquisitionDate`는 **건물** 취득일이다.
   * 미주입 시 건물 취득일과 동일(분리 OFF)로 본다 — 「분리 OFF면 두 날짜가 같다」 불변식.
   * 건물 카드는 아래 `buildingAcqDate`가 담당한다.
   */
  const landAcqDate = input.landAcquisitionDate ?? input.acquisitionDate;

  const assetCards: AssetCardForAggregate[] = [];

  if (!isWithinNblRatio && nonBusinessRatio >= 1) {
    // 전체 비사업용 (1장) — 인정면적 0이라 사업용분이 존재하지 않는다.
    //
    // 2026-07-29 정정(#591 감사 R7 — 표시 전용, 세액 불변): 종전에는 이 경우에도 분할 분기로
    // 들어가 **전액 0원짜리 "토지-사업용(1001)" 유령 카드**가 생성됐다. 무허가건축물
    // (`isUnregistered` → `allowedLandArea = 0`)이 대표 케이스다.
    // 근거: 지방세법 시행령 §101①단서 + 소득세법 §104의3①4호나목 — 무허가건축물 부속토지는
    // **전체 비사업용**으로 사업용분이 없다. 0원 카드는 양도차익 기여가 0이라 세액은 같지만,
    // 결과 화면에 존재하지 않는 자산이 한 장 더 뜨고 신고서 행 수가 어긋난다.
    assetCards.push({
      propertyId: "land_nbl",
      propertyLabel: "토지-비사업용(1001)",
      propertyType: "land",
      transferPrice: allocation.land,
      acquisitionPrice: acquisition.land,
      expenses: estimatedDeduction.land,
      usedEstimatedAcquisition: partAcq.landUsedEstimated,
      estimatedBase: partAcq.landUsedEstimated ? acquisition.land : 0,
      estimatedDeduction: estimatedDeduction.land,
      acquisitionDate: landAcqDate,
      transferDate: input.transferDate,
      isNonBusinessLand: true,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  } else if (!isWithinNblRatio && nonBusinessRatio > 0) {
    // 토지 카드 1: 사업용 (인정면적 직접 안분 — round 의존 제거)
    const landBusinessTransfer = apportionLandByBusinessArea(allocation.land, allowedLandArea, input.landArea);
    const landBusinessAcq = apportionLandByBusinessArea(acquisition.land, allowedLandArea, input.landArea);
    const landBusinessExp = apportionLandByBusinessArea(estimatedDeduction.land, allowedLandArea, input.landArea);
    assetCards.push({
      propertyId: "land_business",
      propertyLabel: "토지-사업용(1001)",
      propertyType: "land",
      transferPrice: landBusinessTransfer,
      acquisitionPrice: landBusinessAcq,
      expenses: landBusinessExp,
      usedEstimatedAcquisition: partAcq.landUsedEstimated,
      estimatedBase: partAcq.landUsedEstimated ? landBusinessAcq : 0,
      estimatedDeduction: landBusinessExp,
      acquisitionDate: landAcqDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
    // 토지 카드 2: 비사업용 초과분 (원단위 잔여 흡수)
    assetCards.push({
      propertyId: "land_nbl",
      propertyLabel: "토지-비사업용초과분(1002)",
      propertyType: "land",
      transferPrice: allocation.land - landBusinessTransfer,
      acquisitionPrice: acquisition.land - landBusinessAcq,
      expenses: estimatedDeduction.land - landBusinessExp,
      usedEstimatedAcquisition: partAcq.landUsedEstimated,
      estimatedBase: partAcq.landUsedEstimated ? acquisition.land - landBusinessAcq : 0,
      estimatedDeduction: estimatedDeduction.land - landBusinessExp,
      acquisitionDate: landAcqDate,
      transferDate: input.transferDate,
      isNonBusinessLand: true,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  } else {
    // 전체 사업용 (1장)
    assetCards.push({
      propertyId: "land",
      propertyLabel: "토지(1001)",
      propertyType: "land",
      transferPrice: allocation.land,
      acquisitionPrice: acquisition.land,
      expenses: estimatedDeduction.land,
      usedEstimatedAcquisition: partAcq.landUsedEstimated,
      estimatedBase: partAcq.landUsedEstimated ? acquisition.land : 0,
      estimatedDeduction: estimatedDeduction.land,
      acquisitionDate: landAcqDate,
      transferDate: input.transferDate,
      isNonBusinessLand: false,
      landAcquisitionCause: input.landAcquisitionCause,
      decedentAcquisitionDate: input.decedentAcquisitionDate,
      donorAcquisitionDate: input.donorAcquisitionDate,
      carryoverTaxation: input.landCarryoverTaxation,
    });
  }

  // 건물 카드
  // isSelfBuilt: buildingAcquisitionCause에서 도출 (단일 진실 원천 — 라우트 헬퍼도 동일 로직 적용).
  // input.isSelfBuilt가 명시되어 있더라도 buildingAcquisitionCause 우선 (두 진실 원천 방지).
  const isSelfBuiltForCard = input.buildingAcquisitionCause === "newConstruction";
  // 건물 취득일: buildingAcquisitionDate 우선 (사례 32 — 영 §162①4호 빠른 날),
  //             미입력 시 acquisitionDate fallback (사례 31 호환 — purchase·inheritance·gift 경로).
  // isSelfBuilt=true 경로(newConstruction)는 validate⑧이 buildingAcquisitionDate 미입력을 차단하므로 fallback 발동 불가.
  const buildingAcqDate = input.buildingAcquisitionDate ?? input.acquisitionDate;
  assetCards.push({
    propertyId: "building",
    propertyLabel: "건물(3001)",
    propertyType: "general_building_unit",
    transferPrice: allocation.building,
    acquisitionPrice: acquisition.building,
    expenses: estimatedDeduction.building,
    usedEstimatedAcquisition: partAcq.buildingUsedEstimated,
    estimatedBase: partAcq.buildingUsedEstimated ? acquisition.building : 0,
    estimatedDeduction: estimatedDeduction.building,
    acquisitionDate: buildingAcqDate,
    transferDate: input.transferDate,
    isNonBusinessLand: false,
    isSelfBuilt: isSelfBuiltForCard,
    buildingAcquisitionDate: buildingAcqDate,
    buildingAcquisitionCause: input.buildingAcquisitionCause,  // 건물 취득원인 패스스루
    // #6: 건물 inheritance/gift 시 보조 필드 패스.
    // 우선순위: 건물 전용 분리 필드(buildingDecedent/buildingDonor) 우선,
    //          미입력 시 자산-수준 단일 필드(decedent/donor) fallback (#6 호환).
    ...(input.buildingAcquisitionCause === "inheritance"
      ? (() => {
          const buildingDecedent =
            input.buildingDecedentAcquisitionDate ?? input.decedentAcquisitionDate;
          return buildingDecedent ? { decedentAcquisitionDate: buildingDecedent } : {};
        })()
      : {}),
    ...(input.buildingAcquisitionCause === "gift"
      ? (() => {
          const buildingDonor =
            input.buildingDonorAcquisitionDate ?? input.donorAcquisitionDate;
          return buildingDonor ? { donorAcquisitionDate: buildingDonor } : {};
        })()
      : {}),
  });

  // 산식 분모/분자 변수 (UI 자산별 산식 인라인 표시용 — 사례 31 경로)
  const landStdTotalForFormula = Math.floor(
    input.transferLandPricePerSqm * input.landArea,
  );
  const acqLandStdTotalForFormula = Math.floor(
    input.acquisitionLandPricePerSqm * input.landArea,
  );

  // 사례 35: 주택→상가 용도변경 3필드를 모든 자산 카드에 일괄 propagate
  if (input.houseToCommercialConversion) {
    for (const c of assetCards) {
      c.houseToCommercialConversion = input.houseToCommercialConversion;
      c.conversionDate = input.conversionDate;
      c.wasMultiHouseAtConversion = input.wasMultiHouseAtConversion;
    }
  }

  return {
    allocation,
    // 구분 기재가 있을 때만 채워진다 — 일괄양도에 `{deemedUnclear:false}`를 넣으면
    // 「판정했고 통과했다」로 침묵 오표시된다(split 경로와 같은 계약).
    ...(saleSplitJudgment ? { saleSplitJudgment } : {}),
    acquisition,
    estimatedDeduction,
    buildingFootprintArea: input.buildingFootprintArea,
    appliedMultiplier,
    multiplierDetail,
    allowedLandArea,
    isWithinNblRatio,
    nonBusinessArea,
    nonBusinessRatio,
    assetCards,
    // ── 산식 변수 (사례 31 — 2-way 안분, extensionStdTotal·acqExtensionStdTotal 미사용)
    landStdTotal: landStdTotalForFormula,
    buildingStdTotal: input.transferBuildingStdPrice,
    acqLandStdTotal: acqLandStdTotalForFormula,
    acqBuilding1StdTotal: input.acquisitionBuildingStdPrice,
    // §164⑨ 1호 공익수용 특례 산출근거 (토지 전용 — 게이트 미충족 시 undefined)
    expropriationValuationDetail,
  };
}


// ============================================================
// 내부 계산값 노출 (단위 테스트 직접 접근용)
// ============================================================

/**
 * 토지 양도차익 계산 (단위 테스트용)
 * transferGain = 양도가 − 환산취득가 − 개산공제
 */
export function calcLandGain(output: GeneralBuildingOutput): number {
  return (
    output.allocation.land -
    output.acquisition.land -
    output.estimatedDeduction.land
  );
}

/**
 * 건물 양도차익 계산 (단위 테스트용)
 * transferGain = 양도가 − 환산취득가 − 개산공제 (차손 가능)
 */
export function calcBuildingGain(output: GeneralBuildingOutput): number {
  return (
    output.allocation.building -
    output.acquisition.building -
    output.estimatedDeduction.building
  );
}

// ── 법령 참조 재수출 (import 편의) ──
export { TRANSFER };
