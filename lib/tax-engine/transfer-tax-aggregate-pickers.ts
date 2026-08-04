/**
 * 다건 엔진 — 단건 결과에서 상세를 추리는 **picker** 6종 + 세율군 1-pass 집계.
 *
 * transfer-tax-aggregate.ts 800줄 정책에 따라 분리(2026-08-04, Phase A-0).
 * 전부 순수 함수이며 단건 결과(`SingleResult`)만 읽는다.
 *
 * ⚠️ `pickValuationDetails` · `pickReductionDetails`는 **엔진 result echo의 전파 관문**이다 —
 *    타입만 넓히고 여기를 빠뜨리면 일괄 경로에서 값이 조용히 비어 화면에 안 뜬다.
 *    회귀 가드: `__tests__/api/transfer.route.bundled-swallows-special.test.ts`
 */
import type { calculateTransferTax } from "./transfer-tax";
import { TRANSFER } from "./legal-codes";
import { aggregateByGroup, applyGeneralProgressive } from "./transfer-tax-aggregate-helpers";
import type { AssetRecord } from "./transfer-tax-aggregate-helpers";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  TransferReductionDetailSource,
  TransferValuationDetailSource,
} from "./types/transfer-result.types";

/** 단건 엔진 결과 타입 (import 순환 회피용 별칭) */
export type SingleResult = ReturnType<typeof calculateTransferTax>;

/**
 * 단건 결과 → 자산별 breakdown으로 옮길 **평가·판정 상세 13종** (R1-a·R1-b).
 *
 * `pickReductionDetails()`(감면 24종)와 같은 목적·같은 유지 규칙이다.
 * 목록은 `TransferValuationDetailSource`(transfer-result.types.ts)와 **1:1로 맞춘다** —
 * 타입만 넓히고 여기를 빠뜨리면 일괄 경로에서 값이 조용히 비어 화면에 안 뜬다.
 * 회귀 가드: `__tests__/api/transfer.route.bundled-swallows-special.test.ts`
 */
export function pickValuationDetails(r: SingleResult): TransferValuationDetailSource {
  return {
    commercialBuildingValuationDetail: r.commercialBuildingValuationDetail,
    nonBusinessLandJudgmentDetail: r.nonBusinessLandJudgmentDetail,
    nblSurchargeExcluded: r.nblSurchargeExcluded,
    multiHouseSurchargeDetail: r.multiHouseSurchargeDetail,
    expropriationValuationDetail: r.expropriationValuationDetail,
    housingExpropriationValuationDetail: r.housingExpropriationValuationDetail,
    auctionValuationDetail: r.auctionValuationDetail,
    preHousingDisclosureDetail: r.preHousingDisclosureDetail,
    rentalHousingExceptionDetail: r.rentalHousingExceptionDetail,
    familyBusinessDetail: r.familyBusinessDetail,
    carryoverTaxationDetail: r.carryoverTaxationDetail,
    splitDetail: r.splitDetail,
    pre1990LandValuationDetail: r.pre1990LandValuationDetail,
  };
}

/**
 * 단건 결과 → 자산별 breakdown으로 옮길 **감면·취득가액 상세 24종**을 추린다.
 *
 * ## 왜 필요한가
 *
 * 일괄(bundled) 모드는 자산별로 `calculateTransferTax`를 완전히 호출하므로 **계산은 정상**인데,
 * `PerPropertyBreakdown` 조립 시 결과의 Detail을 버려서 **산출근거 카드가 화면에 안 나왔다**.
 * 감면은 금액이 크고 근거 제시 요구가 강해 우선 복구한다.
 *
 * ## 유지 규칙
 *
 * 필드 목록은 `TransferReductionDetailSource`(transfer-result.types.ts)와 **1:1로 맞춘다**.
 * 타입만 넓히고 여기를 빠뜨리면 일괄 경로에서 값이 조용히 비어 화면에 안 뜬다(침묵 누락).
 * 회귀 가드: `__tests__/api/transfer.route.bundled-swallows-special.test.ts`가 두 목록의
 * 동기화를 소스 수준에서 검증한다.
 */
export function pickReductionDetails(r: SingleResult): TransferReductionDetailSource {
  return {
    selfFarmingReductionDetail: r.selfFarmingReductionDetail,
    inheritedAcquisitionDetail: r.inheritedAcquisitionDetail,
    inheritedHouseValuationDetail: r.inheritedHouseValuationDetail,
    newHousingReductionDetail: r.newHousingReductionDetail,
    rentalReductionDetail: r.rentalReductionDetail,
    rental97LthdDetail: r.rental97LthdDetail,
    usageConversionDetail: r.usageConversionDetail,
    rental97TaxDetail: r.rental97TaxDetail,
    new994Detail: r.new994Detail,
    unsold989Detail: r.unsold989Detail,
    new99Detail: r.new99Detail,
    unsold988Detail: r.unsold988Detail,
    unsold987Detail: r.unsold987Detail,
    unsold992Detail: r.unsold992Detail,
    unsold983Detail: r.unsold983Detail,
    unsold985Detail: r.unsold985Detail,
    unsold986Detail: r.unsold986Detail,
    unsold982Detail: r.unsold982Detail,
    unsold984Detail: r.unsold984Detail,
    unsold98Detail: r.unsold98Detail,
    new993Detail: r.new993Detail,
    publicExpropriationDetail: r.publicExpropriationDetail,
    replacementLandDetail: r.replacementLandDetail,
    gbDesignatedLandDetail: r.gbDesignatedLandDetail,
    specialHouseExclusionDetail: r.specialHouseExclusionDetail,
  };
}


/** effectCategory === "income_deduction"인 하이브리드 detail 탐색(§98의3·§98의5·§98의6·§98의7 등 5년후). */
export function activeIncomeDeductionHybrid(r: SingleResult) {
  return [
    r.unsold987Detail, r.unsold992Detail, r.unsold983Detail, r.unsold985Detail,
    r.unsold986Detail, r.unsold982Detail, r.unsold984Detail, r.unsold98Detail,
  ].find((d) => d?.isEligible && d.effectCategory === "income_deduction");
}

/**
 * 자산의 income-deduction 감면(§99의3·§99·§98의8·하이브리드 5년후)이 소득금액에서 차감한 금액.
 * §127⑦ 택일이라 자산당 최대 1건 → `??` 체인(합산 아님). 단건 엔진이 이미 적용한 값을 집계로 승계.
 */
export function incomeDeductionReducibleOf(r: SingleResult): number {
  if (r.isExempt) return 0;
  return Math.max(0,
    r.new993Detail?.reducibleTransferIncome ??
    r.new99Detail?.reducibleTransferIncome ??
    r.unsold988Detail?.reducibleTransferIncome ??
    activeIncomeDeductionHybrid(r)?.reducibleTransferIncome ?? 0);
}

/** 농특세 비과세(§98의3·§98의5 — ruralSurtaxExempt) income-deduction 차감분. 해당분은 농특세 baseline에서 제외. */
export function ruralSurtaxExemptReducibleOf(r: SingleResult): number {
  if (r.isExempt) return 0;
  const h = activeIncomeDeductionHybrid(r);
  return h?.ruralSurtaxExempt === true ? Math.max(0, h.reducibleTransferIncome) : 0;
}

/** 세율군 집계 + 전체누진 + §104⑤ 비교과세를 income 배열로 1-pass 산출(농특세 2-pass 공용). */
export function computeGroupsAndComparison(
  records: AssetRecord[],
  incomeArray: number[],
  allocatedBasic: number[],
  rates: TaxRatesMap,
) {
  const { groupTaxes, assetPartTax, clause8TaxBase, clause8Tax, clause1BucketTaxBase, clause1BucketTax } =
    aggregateByGroup(records, incomeArray, allocatedBasic, rates);
  const calculatedTaxByGroups = groupTaxes.reduce((s, g) => s + g.groupCalculatedTax, 0);
  const totalIncome = incomeArray.reduce((s, v) => s + v, 0);
  const totalBasic = allocatedBasic.reduce((s, v) => s + v, 0);
  const generalTaxBase = Math.max(0, totalIncome - totalBasic);
  const calculatedTaxByGeneral = applyGeneralProgressive(generalTaxBase, rates);
  /**
   * ⚠️ **`hasSurchargeGroup`은 §104⑤의 적용 요건이 아니라 「표시」 판정이다.**
   *
   * 법문은 「해당 과세기간에 §94①1호·2호 및 4호에서 규정한 자산을 **둘 이상 양도하는 경우**
   * … 다음 각 호의 금액 중 **큰 것**으로 한다」이다 — 중과·단기 자산의 존재는 요건에 없다.
   * 종전에는 그 그룹이 없으면 **비교 자체를 건너뛰고** 2호를 그대로 채택했다. 그래서
   * `progressive` 그룹 안에서 버킷이 갈리면(파트 자산·수동 세율 오버라이드 등) 1호가 더 커도
   * 반영되지 않는 경로가 남아 있었다. ⇒ **MAX를 무조건으로** 돌린다.
   *
   * 📌 **현재 세액은 변하지 않는다**(전체 13,083건 불변으로 확인). 구조적 이유가 있다:
   *   1호는 §55① 누진이라 **최고 한계세율이 45%**인데, 2호에서 따로 떨어져 나갈 수 있는
   *   단일세율 호는 **40%(①2호 비주택)·50%(①3호 비주택)·60%(①2호 주택·분양권)·70%(①3호 주택,
   *   ⑩호 미등기)** 뿐이라 대부분 45%를 웃돈다. 실측해도 1호가 이기는 조합이 나오지 않았다
   *   (H-70%·B-50% 등 6종). 유일한 후보인 40% 구간도 재현하지 못했다.
   *   ⇒ 세액 정정이 아니라 **문언 정합 + 잠복 경로 제거**다.
   *
   * `comparedTaxApplied`는 **표시 전용**이라 종전 의미를 그대로 둔다(UI 배지·PDF가 `"none"`을
   * 「중과·단기 없음」으로 읽는다 — `MultiTransferTaxSummaryCard.tsx:119·147` · `ResultPdfDocument.tsx:304`).
   * 1호가 이기는 순간에만 `"general"`로 바뀌는데, 그 경우는 종전에 **틀린 값을 내던** 경로다.
   *
   * ❌ **단일 자산(`properties.length === 1`)에도 비교가 도는 것은 이번에 건드리지 않았다.**
   *   §104⑤은 「둘 이상」이 요건이라 문언상 미적용이 맞지만, 끄면 세액이 **내려갈** 수 있다 —
   *   `calcTax`는 일반 단기 자산에서 §104① **후단**(1호 누진 vs 2·3호 단기 중 큰 것)을 수행하지
   *   않는데, 지금은 이 MAX가 그 비교를 대신 공급하고 있다. 어느 쪽이 정답인지는 **미판정**이다.
   */
  const hasSurchargeGroup = groupTaxes.some((g) =>
    g.group === "multi_house_surcharge" || g.group === "non_business_land" ||
    g.group === "unregistered" || g.group === "short_term");
  const calculatedTax = Math.max(calculatedTaxByGroups, calculatedTaxByGeneral);
  const comparedTaxApplied: "groups" | "general" | "none" =
    calculatedTaxByGeneral > calculatedTaxByGroups
      ? "general"
      : hasSurchargeGroup
        ? "groups"
        : "none";
  return { groupTaxes, assetPartTax, calculatedTaxByGroups, calculatedTaxByGeneral, calculatedTax, comparedTaxApplied, clause8TaxBase, clause8Tax, clause1BucketTaxBase, clause1BucketTax };
}

/** 감면 유형별 주 법령 조문 매핑 (한도 조문과 별개) */
export function resolveTypeLegalBasis(type: string): string {
  switch (type) {
    case "self_farming":
      return TRANSFER.REDUCTION_SELF_FARMING;
    case "self_farming_inherited":
      return `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INHERITED}`;
    case "self_farming_incorp":
      return `${TRANSFER.REDUCTION_SELF_FARMING} + ${TRANSFER.REDUCTION_SELF_FARMING_INCORP}`;
    case "public_expropriation":
      return TRANSFER.REDUCTION_PUBLIC_EXPROPRIATION;
    case "long_term_rental":
      return TRANSFER.REDUCTION_LONG_RENTAL;
    case "new_housing":
      return TRANSFER.REDUCTION_NEW_HOUSING;
    case "unsold_housing":
      return TRANSFER.REDUCTION_UNSOLD_HOUSING;
    default:
      return TRANSFER.REDUCTION_OVERLAP_EXCLUSION;
  }
}
