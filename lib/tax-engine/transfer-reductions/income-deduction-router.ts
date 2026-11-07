/**
 * 차감형(양도소득금액 차감) 감면 공용 라우터 — §99의3 · §99 · §98의8
 *
 * transfer-tax.ts STEP 4.6의 §99의3 단독 분기를 일반화 (P1, 2026-06-11).
 * - 평가: reductions[]에서 차감형 1건을 찾아 해당 evaluator 호출 (§127⑦ — 1건만)
 * - 차감: eligible 시 reducibleTransferIncome을 양도소득금액에서 차감
 * - 농특세: finalize 2-pass (감면 전후 산출세액 차 × 20% — 농특세법 §2①1호 소득공제)
 * - 중과 배제: 소령 §167의3①5호(3주택)·§167의10①2호(2주택 — ①5호 준용)에 §99·§99의3·§98의8
 *   열거 — eligible 시 STEP 0.5에서 양도 주택에 isTaxSpecialExemption 자동 주입.
 *   (§99의3 기구현은 수동 토글만 있었음 — D-11 정정으로 자동화)
 */

import { coerceOptionalDate } from "../tax-utils";
import { MULTI_HOUSE } from "../legal-codes/transfer";
import { resolveHighValuePriceCheck } from "../one-house/threshold";
import { evaluateNew993, type New993Result } from "./new-99-3";
import { evaluateNew99, type New99Result } from "./new-99";
import type { RedevMemberNewHouse } from "./new-99-redev-member";
import { redevMemberGateCause } from "./new-99-redev-member";
import { isLandOnlyOriginalMember, withRedevMemberGateNotice } from "./new-99-redev-member";
import { evaluateUnsold988, type Unsold988Result } from "./unsold-98-8";
import { type UnsoldHybridResult } from "./unsold-hybrid";
import {
  evaluateAnyHybridFromReduction,
  ALL_HYBRID_IDS,
  RATE_SPECIAL_REDUCTION_IDS,
} from "./unsold-hybrid-p3";
export { RATE_SPECIAL_REDUCTION_IDS };

export type IncomeDeductionId =
  | "new_99_3"
  | "new_99"
  | "unsold_98_8"
  | "unsold_98_7"
  | "unsold_99_2"
  | "unsold_98_3"
  | "unsold_98_5"
  | "unsold_98_6"
  | "unsold_98_2"
  | "unsold_98_4"
  | "unsold_98";

/**
 * **항상** 소득차감형(§90② — 양도소득금액 차감)인 조문.
 * metadata `effectCategory: "capital_gain"` 과 같은 집합이다.
 * 하이브리드(§98의2~§98의7·§99의2·§98)와 달리 5년 분기가 없어 언제나 차감형이다.
 */
const ALWAYS_INCOME_DEDUCTION_IDS: ReadonlyArray<string> = ["new_99", "new_99_3", "unsold_98_8"];

/**
 * 이 감면이 **소득차감형 트랙**(STEP 4.6)을 타는가 — §127⑦ 트랙 교차 판정 단일 소스.
 *
 * 🔴 §127⑦ 중복배제 max는 `calcReductions`의 **세액감면형 후보 안에서만** 돈다.
 *   소득차감형은 STEP 4.6에서 별도로 양도소득금액을 깎으므로, 두 트랙을 동시에 선택하면
 *   §127⑦을 우회해 **이중 혜택**이 된다(코드리뷰 D10-01 — 실측 결정세액 16,035,410 과소).
 *
 * 하이브리드 8종은 5년 **이내**면 세액감면형(그래서 §127⑦ max에 합류해 문제가 없고),
 * 5년 **후**면 차감형이다 — `evaluateAnyHybridFromReduction`이 `effectCategory`로 가르는
 * 것과 같은 축이다. ⑧ validate가 이 함수를 재사용해 판정을 복제하지 않는다.
 */
export function isIncomeDeductionTrack(type: string, isWithin5Years: boolean): boolean {
  if (ALWAYS_INCOME_DEDUCTION_IDS.includes(type)) return true;
  if (ALL_HYBRID_IDS.includes(type)) return !isWithin5Years;
  return false;
}

/**
 * 이 감면이 **세액감면형 트랙**(STEP 8 `calcReductions` §127⑦ max)을 타는가.
 *
 * 하이브리드는 5년 이내일 때만 이 트랙이다. legacy id(폼 마이그레이션 전 저장분)도 포함한다.
 */
export function isTaxAmountTrack(type: string, isWithin5Years: boolean): boolean {
  if (isIncomeDeductionTrack(type, isWithin5Years)) return false;
  if (ALL_HYBRID_IDS.includes(type)) return isWithin5Years;
  return TAX_AMOUNT_TRACK_IDS.includes(type);
}

/** 세액감면형 조문 (metadata `effectCategory: "tax_amount"` + legacy id) */
const TAX_AMOUNT_TRACK_IDS: ReadonlyArray<string> = [
  // §97 시리즈 (§97의3은 장특공제 대체라 세액감면 트랙이 아니다)
  "rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_5",
  // standalone
  "self_farming", "public_expropriation", "gb_designated_land", "replacement_land_comp",
  // legacy (폼 마이그레이션 전 저장분)
  "self_farming_inherited", "self_farming_incorp",
  "long_term_rental", "new_housing", "unsold_housing",
];

/**
 * 차감형·세액감면형 라우터가 처리하는 전체 조문 ID (11종).
 * 다건(multi) 합산 경로는 이 체계를 미지원하므로 `validateMultiSupportedMode`에서 명시 차단에 사용.
 */
export const ALL_INCOME_DEDUCTION_IDS: ReadonlyArray<IncomeDeductionId> = [
  "new_99_3",
  "new_99",
  "unsold_98_8",
  "unsold_98_7",
  "unsold_99_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
  "unsold_98_4",
  "unsold_98",
];

/** 중과 배제 대상 (소령 §167의3①5호 열거 — §98의4는 **비열거**라 제외, P4-5 anchor) */
export const SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS: ReadonlyArray<IncomeDeductionId> = [
  "new_99_3",
  "new_99",
  "unsold_98_8",
  "unsold_98_7",
  "unsold_99_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_2",
  // §98 — 소령 §167의3①3호 (감면대상장기임대주택 — 5년+ 임대 국민주택) 경로 (P5)
  "unsold_98",
];

/** 라우터 평가 컨텍스트 — 자산-수준 입력에서 추출 (TransferTaxInput 직접 의존 회피) */
export interface IncomeDeductionContext {
  transferDate: Date;
  acquisitionDate: Date;
  /** 자산-수준 매매계약일 (§99의3 contractDate993 fallback — Round 9 우선순위 유지) */
  assetContractDate?: Date;
  transferPrice: number;
  /**
   * **물건 전체(100%) 양도가액** — 지분 모드에서만 `transferPrice`와 다르다.
   * 고가주택 가액 요건(§99의3·§99)은 물건 전체 기준이므로 이 값을 쓴다. 미전달 시 단독소유로 보아
   * `transferPrice`로 후퇴한다(`TransferTaxInput.totalPropertyTransferPrice`가 지분 모드에서만 채워짐).
   */
  totalPropertyTransferPrice?: number;
  /**
   * **부담부증여 증여가액 기준 물건 전체 가액** — 부담부증여에서 `transferPrice`는 채무액 placeholder라 고가주택 판정에 쓸 수 없다.
   * 소령 §156① 고가주택 판정은 «이전방식에 관계없이 1주택의 전체가액» — 부담부증여는 당해 주택의 증여가액
   * (서면인터넷방문상담4팀-1692·-1526 · 국심2007서2099). 지분이면 «지분 증여가액 ÷ 지분율»(물건 전체) — §89①3호 판정(`checkExemptionCore`)과
   * 같은 소스(`TransferTaxInput.burdenedGiftDenominator`)다. 있으면 `totalPropertyTransferPrice`·`transferPrice`보다 우선한다 (NH-10).
   */
  burdenedGiftDenominator?: number;
  /**
   * 소유자 분리 축 — `"land_only"`(토지만 본인 소유)면 §99·§99의3은 신축주택(건물) 취득자가 아니라 적용 배제된다 (NH-08 · Q-28).
   * 차감(STEP 4.6)과 중과 배제 선판정(STEP 0.45)이 같은 값을 넘겨야 «감면은 안 되는데 중과만 배제»되는 어긋남이 없다.
   */
  selfOwns?: "both" | "building_only" | "land_only";
  /**
   * 자산 취득 원인 — §99·§99의3은 상속·증여(지분 포함)로 받은 주택에 적용되지 않는다 (NH-03 · NH-17 · NH-40).
   * 미전달이면 매매로 본다(최초 계약 여부 3-state가 판정한다).
   */
  acquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction" | "burdened_gift";
  /** 재개발 자산의 승계조합원(관리처분계획 인가일 뒤 입주권 승계) — §99의3 불성립(조특령 §99의3③2호·⑤, NH-16) */
  isRedevSuccessorMember?: boolean;
  /**
   * 재개발·재건축 완공 아파트 조합원 갈래(`redevMemberNewHouseOf`) — §99·§99의3을 자기건설(조합원 취득 포함) 축으로 판정한다:
   * 기간·고가주택 기준일·5년 기산일이 준공일이고(NH-36 · NH-63 · 서면인터넷방문상담4팀-2145), 주택을 출자한 원조합원이면 재개발 변형이
   * 자산 사실에서 정해진다(NH-32). 재개발 Step C.5와 중과 배제 선판정 STEP 0.45가 같은 값을 넘긴다.
   */
  redevMemberNewHouse?: RedevMemberNewHouse;
  standardPriceAtTransfer?: number;
  /** 양도소득금액 (양도차익 − 장특공제). 중과 배제 선판정 시 0 전달 가능 (적격 판정에 무관) */
  transferIncome: number;
}

export interface IncomeDeductionResolution {
  /** 차감(소득금액 공제) 적용 조문 — 없으면 undefined */
  appliedId?: IncomeDeductionId;
  /**
   * 효과 경로 무관 적격 조문 — 중과 배제(소령 §167의3①5호 "감면되는 주택") 판정용 (P2).
   * 하이브리드 5년 내(세액감면 경로)는 appliedId 없이 eligibleId만 설정됨.
   * 기존 차감 3조문은 eligibleId === appliedId.
   */
  eligibleId?: IncomeDeductionId;
  /**
   * 요건은 모두 충족했고 5년 후 안분 기준시가만 없어 부적격인 하이브리드 조문(리뷰 US-35).
   * 차감은 0 + 사유(`MISSING_STD_PRICE`)로 남기지만, 소령 §167의3①5호 「감면되는 주택」 여부는 요건으로 정해진다 —
   * 중과 배제 선판정(`resolveSurchargeExclusionByReduction`)만 읽는다. 기준시가는 요건이 아니라 공제액 계산 인자다(조특령 §40① 준용).
   */
  requirementsMetId?: IncomeDeductionId;
  /** 차감액 (적용 조문의 reducibleTransferIncome) */
  reducible: number;
  new993Detail?: New993Result;
  new99Detail?: New99Result;
  unsold988Detail?: Unsold988Result;
  unsold987Detail?: UnsoldHybridResult;
  unsold992Detail?: UnsoldHybridResult;
  unsold983Detail?: UnsoldHybridResult;
  unsold985Detail?: UnsoldHybridResult;
  unsold986Detail?: UnsoldHybridResult;
  unsold982Detail?: UnsoldHybridResult;
  unsold984Detail?: UnsoldHybridResult;
  unsold98Detail?: UnsoldHybridResult;
  /** step 표시용 — 적용/불적격 공통 */
  stepLabel?: string;
  legalBasis?: string;
  ineligibleMessages?: string;
  /** 하이브리드 5년 내 — 세액감면 경로 안내 step용 (P2) */
  taxAmountMode?: boolean;
  /** §98의2 특칙 전용 — 장특 표2·기본세율 안내 step용 (P4) */
  specialOnlyMode?: boolean;
}

/** reduction variant 멤버 — 구조적 타이핑 (stub.types 직접 import 회피, §98의9 선례) */
interface ReductionLike {
  type: string;
  [key: string]: unknown;
}

const STEP_LABELS: Record<IncomeDeductionId, string> = {
  new_99_3: "§99의3 신축주택 과세특례",
  new_99: "§99 신축주택 감면",
  unsold_98_8: "§98의8 준공후미분양 50% 공제",
  unsold_98_7: "§98의7 미분양주택 과세특례",
  unsold_99_2: "§99의2 신축주택등 과세특례",
  unsold_98_3: "§98의3 미분양주택 과세특례",
  unsold_98_5: "§98의5 수도권 밖 미분양 과세특례",
  unsold_98_6: "§98의6 준공후미분양 과세특례",
  unsold_98_2: "§98의2 지방 미분양주택 과세특례",
  unsold_98_4: "§98의4 비거주자 주택취득 과세특례",
  unsold_98: "§98 미분양 국민주택 과세특례",
};

const HYBRID_DETAIL_FIELDS: Record<string, keyof Pick<IncomeDeductionResolution,
  "unsold987Detail" | "unsold992Detail" | "unsold983Detail" | "unsold985Detail" | "unsold986Detail"
  | "unsold982Detail" | "unsold984Detail" | "unsold98Detail">> = {
  unsold_98_7: "unsold987Detail",
  unsold_99_2: "unsold992Detail",
  unsold_98_3: "unsold983Detail",
  unsold_98_5: "unsold985Detail",
  unsold_98_6: "unsold986Detail",
  unsold_98_2: "unsold982Detail",
  unsold_98_4: "unsold984Detail",
  unsold_98: "unsold98Detail",
};

/**
 * 차감형 감면 통합 평가 — transfer-tax.ts STEP 4.6 + STEP 0.45(중과 배제 선판정) 진입점.
 *
 * 각 조문을 순서대로 평가하되 **적격(eligibleId)을 만나면 즉시 채택**하고, 부적격이면 다음 후보를
 * 계속 평가한다 (리뷰 M-1: 부적격 선순위가 적격 후순위를 차단하던 first-match 버그 해소).
 * 적격 후보가 없으면 첫 부적격 결과를 표시용으로 반환.
 * (조특법 §127⑦ 복수 적격 "납세자 선택 1건"은 UI 카테고리 라디오로 입력 단계에서 1건만 허용.)
 */
export function resolveIncomeDeduction(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution {
  if (!reductions || reductions.length === 0) return { reducible: 0 };

  const evaluators: Array<() => IncomeDeductionResolution | null> = [
    () => evalNew993(reductions, ctx),
    () => evalNew99(reductions, ctx),
    () => evalUnsold988(reductions, ctx),
    () => evalHybrid(reductions, ctx),
  ];

  let firstIneligible: IncomeDeductionResolution | undefined;
  for (const evaluate of evaluators) {
    const res = evaluate();
    if (!res) continue; // 해당 조문이 reductions에 없음
    if (res.eligibleId) return res; // 적격 — 즉시 채택
    if (!firstIneligible) firstIneligible = res; // 부적격 — 표시용 보관 (적격 없을 때만 사용)
  }
  return firstIneligible ?? { reducible: 0 };
}

/** §99의3 — 호출 로직·필드 fallback 동일 유지 (M-1 추출, 미입력 시 null) */
function evalNew993(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
  const r993 = reductions.find((x) => x.type === "new_99_3") as ReductionLike | undefined;
  if (r993) {
    // Round 9 정정 (2026-05-06): contractDate993 (legacy) → assetContractDate 우선순위
    const effectiveContractDate =
      coerceOptionalDate(r993.contractDate993 as Date | string | undefined) ?? ctx.assetContractDate;
    const member = ctx.redevMemberNewHouse;
    // 종전주택을 상속·증여로 취득한 조합원 갈래는 신축주택 취득 원인 게이트를 면제한다 (L14 Q-1 a · Q-2 a)
    const memberCause = redevMemberGateCause({ acquisitionCause: ctx.acquisitionCause, member });
    const detail = evaluateNew993({
      transferDate: ctx.transferDate,
      // 조합원 갈래 — 신축주택 취득일 = 사용검사필증 교부일(준공일) (NH-63 · 서면인터넷방문상담4팀-2145)
      acquisitionDate: member?.completionDate ?? ctx.acquisitionDate,
      contractDate: member ? undefined : effectiveContractDate,
      usageApprovalDate: member ? member.completionDate : coerceOptionalDate(r993.usageApprovalDate993 as Date | string | undefined),
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: (r993.standardPriceAtAcquisition993 as number | undefined) ?? 0,
      standardPriceAt5Years: (r993.standardPriceAt5Years as number | undefined) ?? 0,
      standardPriceAtTransfer:
        (r993.standardPriceAtTransfer993 as number | undefined) ?? ctx.standardPriceAtTransfer ?? 0,
      isRecontractExcluded: r993.isRecontractExcluded993 as boolean | undefined,
      recontractUnavoidableCause: r993.recontractUnavoidableCause993 as boolean | undefined,
      // 조합원 갈래는 출자 자산 사실에서 정한다 — 주택 출자 원조합원만 재개발 변형 (NH-32)
      isRedevelopedNewHouse: member ? member.houseContributed : (r993.isRedevelopedNewHouse993 as boolean | undefined),
      previousHouseStdPriceAtAcquisition: r993.previousHouseStdPrice993 as number | undefined,
      wholePropertyTransferPrice: resolveHighValuePriceCheck(ctx),
      isLandOnlyOwner: ctx.selfOwns === "land_only",
      exclusiveAreaSqm: (r993.exclusiveAreaSqm993 as number | undefined) ?? 0, // 고가주택 면적기준(2002.12.31 이전 취득) 판정용
      region: (r993.region993 as "outside_speculation" | "speculation" | undefined) ?? "outside_speculation",
      isResident: (r993.isResident993 as boolean | undefined) ?? true,
      isHousingConstructionBusiness: (r993.isHousingConstructionBusiness993 as boolean | undefined) ?? false,
      acquisitionType: member ? "self_built" : ((r993.acquisitionType993 as "from_builder" | "self_built" | undefined) ?? "from_builder"),
      hasOccupancyAtContract: r993.hasOccupancyAtContract as boolean | undefined,
      constructionStartedBefore2003: r993.constructionStartedBefore2003_993 as "yes" | "no" | "unknown" | undefined,
      luxuryFacts: {
        houseType: r993.houseType993 as "apartment" | "detached" | undefined,
        grossFloorAreaSqm: r993.grossFloorAreaSqm993 as number | undefined,
        attachedLandAreaSqm: r993.attachedLandAreaSqm993 as number | undefined,
        stdPriceFloorMet: r993.stdPriceFloorMet993 as "yes" | "no" | "unknown" | undefined,
        luxuryFacility: r993.luxuryFacility993 as "yes" | "no" | "unknown" | undefined,
      },
      acquisitionCause: memberCause.acquisitionCause,
      firstContract: r993.firstContract993 as "yes" | "no" | "unknown" | undefined,
      // 2001.12.31. 이전 승계조합원은 종전 규정이라 «인가일 현재 조합원» 게이트(NOT_MEMBER_AT_APPROVAL)를 건너뛴다 (L16 — 조특령 대통령령 제17458호 부칙 제11조)
      isRedevSuccessorMember: ctx.isRedevSuccessorMember === true && !memberCause.priorRuleSuccessor,
      redevMember: member
        ? { completionDate: member.completionDate, remainderContract: r993.remainderContract993 as "yes" | "no" | "unknown" | undefined }
        : undefined,
      // 농특세는 finalize에서 2-pass 재계산 (placeholder 0)
      calculatedTaxBeforeReduction: 0,
      calculatedTaxAfterReduction: 0,
    });
    return withAllocationOnlyRequirementsMet("new_99_3", detail, buildResolution("new_99_3", detail.isEligible, detail.reducibleTransferIncome,
      detail.ineligibleReasons.map((x) => x.message).join(" · "), detail.legalBasis,
      { new993Detail: withRedevMemberGateNotice(detail, memberCause, "new_99_3", isLandOnlyOriginalMember(member)) }));
  }
  return null;
}

/** §99 — P1 신규 (M-1 추출, 미입력 시 null) */
function evalNew99(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
  const r99 = reductions.find((x) => x.type === "new_99") as ReductionLike | undefined;
  if (r99) {
    const member = ctx.redevMemberNewHouse;
    // 종전주택을 상속·증여로 취득한 조합원 갈래는 신축주택 취득 원인 게이트를 면제한다 (L14 Q-1 a · Q-2 a)
    const memberCause = redevMemberGateCause({ acquisitionCause: ctx.acquisitionCause, member });
    const detail = evaluateNew99({
      transferDate: ctx.transferDate,
      // 조합원 갈래 — 신축주택 취득일 = 사용검사필증 교부일(준공일) (NH-63 · 서면인터넷방문상담4팀-2145)
      acquisitionDate: member?.completionDate ?? ctx.acquisitionDate,
      contractDate: member ? undefined : coerceOptionalDate(r99.contractDate99 as Date | string | undefined) ?? ctx.assetContractDate,
      usageApprovalDate: member ? member.completionDate : coerceOptionalDate(r99.usageApprovalDate99 as Date | string | undefined),
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r99.standardPriceAtAcquisition99 as number | undefined,
      standardPriceAt5Years: r99.standardPriceAt5Years99 as number | undefined,
      standardPriceAtTransfer:
        (r99.standardPriceAtTransfer99 as number | undefined) ?? ctx.standardPriceAtTransfer,
      wholePropertyTransferPrice: resolveHighValuePriceCheck(ctx),
      isLandOnlyOwner: ctx.selfOwns === "land_only",
      exclusiveAreaSqm: r99.exclusiveAreaSqm99 as number | undefined,
      houseType: r99.houseType99 as "apartment" | "detached" | undefined,
      grossFloorAreaSqm: r99.grossFloorAreaSqm99 as number | undefined,
      attachedLandAreaSqm: r99.attachedLandAreaSqm99 as number | undefined,
      stdPriceFloorMet: r99.stdPriceFloorMet99 as "yes" | "no" | "unknown" | undefined,
      luxuryFacility: r99.luxuryFacility99 as "yes" | "no" | "unknown" | undefined,
      acquisitionCause: memberCause.acquisitionCause,
      firstContract: r99.firstContract99 as "yes" | "no" | "unknown" | undefined,
      isResident: (r99.isResident99 as boolean | undefined) ?? true,
      isHousingConstructionBusiness: (r99.isHousingConstructionBusiness99 as boolean | undefined) ?? false,
      acquisitionType: member ? "self_built" : ((r99.acquisitionType99 as "from_builder" | "self_built" | undefined) ?? "from_builder"),
      isNationalHousing: (r99.isNationalHousing99 as boolean | undefined) ?? false,
      hasOccupancyAtContract: r99.hasOccupancyAtContract99 as boolean | undefined,
      isRecontractExcluded: r99.isRecontractExcluded99 as boolean | undefined,
      recontractUnavoidableCause: r99.recontractUnavoidableCause99 as boolean | undefined,
      // 조합원 갈래는 출자 자산 사실에서 정한다 — 주택 출자 원조합원만 재개발 변형 (NH-32)
      isRedevelopedNewHouse: member ? member.houseContributed : (r99.isRedevelopedNewHouse99 as boolean | undefined),
      previousHouseStdPriceAtAcquisition: r99.previousHouseStdPrice99 as number | undefined,
      redevMember: member
        ? { completionDate: member.completionDate, remainderContract: r99.remainderContract99 as "yes" | "no" | "unknown" | undefined }
        : undefined,
    });
    return withAllocationOnlyRequirementsMet("new_99", detail, buildResolution("new_99", detail.isEligible, detail.reducibleTransferIncome,
      detail.ineligibleReasons.map((x) => x.message).join(" · "), detail.legalBasis,
      { new99Detail: withRedevMemberGateNotice(detail, memberCause, "new_99", isLandOnlyOriginalMember(member)) }));
  }
  return null;
}

/** §98의8 — P1 신규 (M-1 추출, 미입력 시 null) */
function evalUnsold988(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
  const r988 = reductions.find((x) => x.type === "unsold_98_8") as ReductionLike | undefined;
  if (r988) {
    const detail = evaluateUnsold988({
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      /**
       * 🔴 **자산-수준 매매계약일 fallback을 여기만 빠뜨리고 있었다** (2026-09-05 · 코드리뷰 Q15).
       *
       * 감면 그룹 상단의 자산-수준 「매매계약일」(`assetContractDate`)은 「신축·미분양·임대 감면
       * 시한 판정의 1차 기준」이라고 화면이 안내하고, §99의3(:240)·§99(:283)는 그 값을 fallback으로
       * 읽는다. 그런데 §98의8만 조문 전용 필드(`contractDate988`)만 봐서, 사용자는 **같은 날짜를
       * 두 번** 입력해야 했다. ⑧만 완화하면 계약일 없이 통과해 **조용히 감면 미적용**이 된다
       * ⇒ 엔진에 fallback을 넣고 ⑧을 같은 술어로 맞춘다(3중 패턴).
       */
      contractDate:
        coerceOptionalDate(r988.contractDate988 as Date | string | undefined) ??
        ctx.assetContractDate,
      acquisitionPrice: r988.acquisitionPrice988 as number | undefined,
      exclusiveAreaSqm: r988.exclusiveAreaSqm988 as number | undefined,
      rentalContractDate: coerceOptionalDate(r988.rentalContractDate988 as Date | string | undefined),
      rentalStartDate: coerceOptionalDate(r988.rentalStartDate988 as Date | string | undefined),
      rentalEndDate: coerceOptionalDate(r988.rentalEndDate988 as Date | string | undefined),
      inheritedRentalMonths: r988.inheritedRentalMonths988 as number | undefined,
      isResident: (r988.isResident988 as boolean | undefined) ?? true,
      isUnsoldAfterCompletion: r988.isUnsoldAfterCompletion988 as boolean | undefined,
      isFirstContract: r988.isFirstContract988 as boolean | undefined,
      isNotRecontract: r988.isNotRecontract988 as boolean | undefined,
      transferIncome: ctx.transferIncome,
      standardPriceAtAcquisition: r988.standardPriceAtAcquisition988 as number | undefined,
      standardPriceAt5Years: r988.standardPriceAt5Years988 as number | undefined,
      standardPriceAtTransfer:
        (r988.standardPriceAtTransfer988 as number | undefined) ?? ctx.standardPriceAtTransfer,
    });
    const resolution = buildResolution("unsold_98_8", detail.isEligible, detail.reducibleTransferIncome,
      detail.ineligibleReasons.map((x) => x.message).join(" · "), detail.legalBasis,
      { unsold988Detail: detail });
    // 안분 분모 0(NH-76)은 공제액 계산 인자라 요건 판정이 아니다 — 소령 §167의3①5호 「감면되는 주택」 여부는 요건으로 정해진다(하이브리드와 같은 독법).
    return !detail.isEligible && detail.ineligibleReasons.length > 0 && detail.ineligibleReasons.every((x) => x.code === "ALLOCATION_DENOMINATOR_ZERO")
      ? { ...resolution, requirementsMetId: "unsold_98_8" }
      : resolution;
  }
  return null;
}

/**
 * 하이브리드 (P2 §98의7·§99의2 + P3 §98의3·§98의5·§98의6 + P4·P5) — 5년 후만 차감,
 * 5년 내는 세액감면(calcReductions). M-1 추출, 미입력·평가 불가 시 null.
 */
function evalHybrid(
  reductions: ReadonlyArray<{ type: string }>,
  ctx: IncomeDeductionContext,
): IncomeDeductionResolution | null {
  const rHybrid = reductions.find((x) => ALL_HYBRID_IDS.includes(x.type)) as
    | ReductionLike
    | undefined;
  if (rHybrid) {
    const detail = evaluateAnyHybridFromReduction(rHybrid, {
      transferDate: ctx.transferDate,
      acquisitionDate: ctx.acquisitionDate,
      assetContractDate: ctx.assetContractDate,
      standardPriceAtTransfer: ctx.standardPriceAtTransfer,
      transferIncome: ctx.transferIncome,
    });
    if (detail) {
      const id = detail.id;
      const detailField = { [HYBRID_DETAIL_FIELDS[id]]: detail };
      const isIncomeDeduction = detail.isEligible && detail.effectCategory === "income_deduction";
      return {
        // 5년 내(tax_amount)는 appliedId 미설정 — STEP 4.6 차감 없음 (calcReductions 경로와 이중 혜택 차단)
        appliedId: isIncomeDeduction ? id : undefined,
        eligibleId: detail.isEligible ? id : undefined,
        // 하이브리드는 요건 판정을 모두 마친 뒤 안분 단계(`computeHybridEffect`)에서만 MISSING_STD_PRICE·ALLOCATION_DENOMINATOR_ZERO(NH-76)를 낸다 — 그 사유뿐이면 요건 충족이다.
        requirementsMetId:
          !detail.isEligible &&
          detail.ineligibleReasons.length > 0 &&
          detail.ineligibleReasons.every((x) => x.code === "MISSING_STD_PRICE" || x.code === "ALLOCATION_DENOMINATOR_ZERO")
            ? id
            : undefined,
        reducible: isIncomeDeduction ? detail.reducibleTransferIncome : 0,
        stepLabel: STEP_LABELS[id],
        legalBasis: detail.legalBasis,
        ineligibleMessages: detail.isEligible
          ? undefined
          : detail.ineligibleReasons.map((x) => x.message).join(" · "),
        taxAmountMode: detail.isEligible && detail.effectCategory === "tax_amount",
        specialOnlyMode:
          detail.isEligible &&
          (detail.effectCategory === "lthd_rate_special" || detail.effectCategory === "flat_rate_20"),
        ...detailField,
      };
    }
  }
  return null;
}

/**
 * §99·§99의3 — 요건 판정을 모두 마친 뒤 안분 단계에서만 나는 사유(기준시가 미입력·분모 0, NH-76)뿐이면 요건 충족이다.
 * 차감은 0 + 사유로 남기고, 소령 §167의3①5호 「감면되는 주택」 중과 배제 선판정만 `requirementsMetId`를 읽는다(§98의8·하이브리드와 같은 독법).
 */
function withAllocationOnlyRequirementsMet(
  id: "new_99" | "new_99_3",
  detail: { isEligible: boolean; ineligibleReasons: ReadonlyArray<{ code: string }> },
  resolution: IncomeDeductionResolution,
): IncomeDeductionResolution {
  return !detail.isEligible &&
    detail.ineligibleReasons.length > 0 &&
    detail.ineligibleReasons.every((x) => x.code === "MISSING_STD_PRICE" || x.code === "ALLOCATION_DENOMINATOR_ZERO")
    ? { ...resolution, requirementsMetId: id }
    : resolution;
}

function buildResolution(
  id: IncomeDeductionId,
  isEligible: boolean,
  reducible: number,
  ineligibleMessages: string,
  legalBasis: string,
  details: Pick<IncomeDeductionResolution, "new993Detail" | "new99Detail" | "unsold988Detail">,
): IncomeDeductionResolution {
  return {
    appliedId: isEligible ? id : undefined,
    eligibleId: isEligible ? id : undefined,
    reducible: isEligible ? reducible : 0,
    stepLabel: STEP_LABELS[id],
    legalBasis,
    ineligibleMessages: isEligible ? undefined : ineligibleMessages,
    ...details,
  };
}

/** STEP 4.6 계산 단계 표시 — transfer-tax.ts 본문 압축용 (800줄 정책) */
export function buildIncomeDeductionStep(
  resolution: IncomeDeductionResolution,
  incomeBefore: number,
  incomeAfter: number,
): { label: string; formula: string; amount: number; legalBasis: string } {
  // 특칙 전용 (§98의2 장특 표2·기본세율 / §98 세율 20%) — 차감·감면 없음, 안내 (P4·P5)
  if (resolution.specialOnlyMode) {
    const is98 = resolution.stepLabel?.startsWith("§98 ");
    return {
      label: `${resolution.stepLabel} — ${is98 ? "세율 20% 특례 적용" : "특칙 적용 (장특 표2·기본세율)"}`,
      formula: is98
        ? "감면세액 없음 — 양도소득세 세율 20% 단일 적용 (§104① 불구, 법 §98①1호)"
        : "감면세액 없음 — 장기보유특별공제 표2 보유기간별 공제율 + §104①1호 기본세율 적용 (법 §98의2①)",
      amount: 0,
      legalBasis: resolution.legalBasis ?? "",
    };
  }
  // 하이브리드 5년 내 — 차감 없음, 세액감면 경로 안내 (P2)
  if (resolution.taxAmountMode) {
    return {
      label: `${resolution.stepLabel} — 5년 이내 양도 (세액감면 경로)`,
      formula: "취득일부터 5년 이내 양도 — 감면세액 단계에서 양도소득세 100% 세액감면 적용",
      amount: 0,
      legalBasis: resolution.legalBasis ?? "",
    };
  }
  if (resolution.appliedId) {
    return {
      label: `${resolution.stepLabel} — 양도소득금액 차감`,
      formula: `양도소득금액 ${incomeBefore.toLocaleString()} - 감면 양도소득금액 ${resolution.reducible.toLocaleString()} = ${incomeAfter.toLocaleString()}`,
      amount: incomeAfter,
      legalBasis: resolution.legalBasis ?? "",
    };
  }
  return {
    label: `${resolution.stepLabel} — 적용 불가`,
    formula: resolution.ineligibleMessages ?? "",
    amount: 0,
    legalBasis: resolution.legalBasis ?? "",
  };
}

/** STEP 0.45 중과 배제 단계 표시 */
/** 중과 배제 근거 조문 라벨 — 배제 단계와 5호 자기 선언 고지(`surcharge-self-declared-reduction-notice.ts`)가 같은 표를 쓴다. */
export function exclusionArticleLabel(id: IncomeDeductionId): string {
  return EXCLUSION_ARTICLE_LABELS[id];
}

const EXCLUSION_ARTICLE_LABELS: Record<IncomeDeductionId, string> = {
  new_99_3: "조특법 §99의3",
  new_99: "조특법 §99",
  unsold_98_8: "조특법 §98의8",
  unsold_98_7: "조특법 §98의7",
  unsold_99_2: "조특법 §99의2",
  unsold_98_3: "조특법 §98의3",
  unsold_98_5: "조특법 §98의5",
  unsold_98_6: "조특법 §98의6",
  unsold_98_2: "조특법 §98의2",
  unsold_98_4: "조특법 §98의4",
  unsold_98: "조특법 §98",
};

export function buildSurchargeExclusionStep(exclusion: {
  appliedId?: IncomeDeductionId;
  legalBasis?: string;
}): { label: string; formula: string; amount: number; legalBasis: string } {
  // appliedId는 중과 배제(excluded=true) 시 항상 set — fallback은 도달 불가이나 특정 조문
  // 하드코딩("§99의3") 대신 중립 표현으로 오표시 방지 (리뷰 Low #3 방어).
  const article = exclusion.appliedId ? EXCLUSION_ARTICLE_LABELS[exclusion.appliedId] : "조특법 감면주택";
  return {
    label: "감면주택 다주택 중과 배제",
    formula: `${article} 감면주택 양도 — 중과세율 적용 제외`,
    amount: 0,
    legalBasis: exclusion.legalBasis ?? "",
  };
}

/**
 * STEP 0.45 — 차감형 감면주택 중과 배제 선판정.
 * 적격 판정은 날짜·가액·면적·토글만 사용 (양도소득금액 무관) → transferIncome=0으로 호출.
 * eligible이면 양도 주택(sellingHouse)에 isTaxSpecialExemption을 주입해
 * 기존 중과 엔진 경로(multi-house-surcharge-helpers — "조세특례제한법 특례 적용 주택")로 배제.
 */
export function resolveSurchargeExclusionByReduction(
  reductions: ReadonlyArray<{ type: string }> | undefined,
  ctx: Omit<IncomeDeductionContext, "transferIncome"> & {
    /**
     * 조특법 §129② — 미등기양도자산에는 감면 규정을 적용하지 않으므로 소령 §167의3①5호 「…에 따라 양도소득세가
     * 감면되는 주택」이 아니다. STEP 4.6 차감(`transfer-tax-income-steps.ts`)과 같은 게이트(NH-58). 단건·겸용·판정 메뉴가 넘긴다.
     */
    isUnregistered?: boolean;
  },
): SurchargeExclusionByReduction {
  const { isUnregistered, ...deductionCtx } = ctx;
  if (isUnregistered) return { excluded: false };
  const resolution = resolveIncomeDeduction(reductions, { ...deductionCtx, transferIncome: 0 });
  // P2: appliedId → eligibleId 기준 — 하이브리드 5년 내(세액감면 경로)도 §167의3①5호
  // "감면되는 주택"에 해당하므로 효과 경로 무관 적격이면 배제.
  // US-35 — 5년 후 안분 기준시가만 없는 하이브리드도 요건을 갖춘 「감면되는 주택」이다(차감 0은 STEP 4.6이 따로 남긴다).
  const surchargeId = resolution.eligibleId ?? resolution.requirementsMetId;
  if (surchargeId && SURCHARGE_EXCLUDED_INCOME_DEDUCTION_IDS.includes(surchargeId)) {
    return {
      excluded: true,
      appliedId: surchargeId,
      // §98은 3호 (감면대상장기임대주택 — 5년+ 임대 국민주택), 나머지는 5호 열거
      legalBasis:
        surchargeId === "unsold_98"
          ? "소령 §167의3①3호·§167의10①2호"
          : "소령 §167의3①5호·§167의10①2호",
    };
  }
  return { excluded: false };
}

export type SurchargeExclusionByReduction = { excluded: boolean; appliedId?: IncomeDeductionId; legalBasis?: string };

/**
 * 배제 근거를 세대 구성에 맞춘다(NH-82). 위 근거(§167의3①·§167의10①2호)는 주택만 가진 세대(법 §104⑦1호·3호)의 것이다 —
 * 산입되는 조합원입주권·분양권이 있는 세대(같은 항 2호·4호)는 소령 §167의11①2호·§167의4③2호가 같은 §167의3①2호~8호를 준용한다.
 * 판정 결과는 바꾸지 않는다(세액 불변). 산입 여부는 중과 판정 뒤에야 알므로 호출부가 그 결과로 넘긴다(`surchargeHouseholdCountsRights`).
 */
export function withSurchargeExclusionRegime(
  exclusion: SurchargeExclusionByReduction,
  householdCountsRights: boolean,
): SurchargeExclusionByReduction {
  return exclusion.excluded && householdCountsRights
    ? { ...exclusion, legalBasis: MULTI_HOUSE.TAX_INCENTIVE_HOUSE_RIGHT_REFERENCE_BASIS }
    : exclusion;
}
