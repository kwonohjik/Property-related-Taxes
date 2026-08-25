/**
 * 양도소득세 **세율 결정** 헬퍼 (순수 함수) — 「소득세법」 §104 축.
 *
 *   H-7:  calcTax             — 세액 결정 (T-1 ~ T-4, + T-1.5 부수토지 일체과세)
 *   H-7a: compareWithClause1  — §104① **후단**(둘 이상 호에 해당하면 큰 산출세액)
 *
 * 인접 축은 각각 별 파일이다 — 아래는 **기존 import 경로 유지를 위한 재수출**뿐이다:
 *   · §114조의2 가산세  → transfer-tax-building-penalty.ts  (재수출 O)
 *   · 감면(조특법 §127⑦) → transfer-tax-reductions-calc.ts   (재수출 O)
 *   · §104 각 호 분류·버킷 키 → transfer-tax-rate-clause.ts   (재수출 O)
 *   · 부수토지 일체과세 세율  → appurtenant-land-rate.ts       (재수출 O)
 *   · 다필지 분리(영 §166)   → transfer-tax-multi-parcel-branch.ts
 *     ⚠️ **재수출하지 않는다** — 그쪽이 `calcTax`를 쓰므로 되받으면 순환이 된다.
 */

import {
  applyRate,
  calculateProgressiveTax,
  calculateHoldingPeriod,
} from "./tax-utils";
import { resolveSurchargeApplication } from "./transfer-tax-surcharge-predicate";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { ParsedRates } from "./transfer-tax-helpers";
import { resolveCompanionLandRate } from "./appurtenant-land-rate";
import { getEffectiveAcquisitionDate } from "./transfer-tax-lthd-start";
import { resolveRateBasisAcquisitionDate } from "./transfer-rate-holding-basis";
import { resolveSurchargeAddonRate } from "./data/multi-house-surcharge-rate-history";
import { resolveShortTermRate, type ShortTermAssetClass } from "./data/short-term-rate-history";
// re-export — 기존 import 경로 하위 호환 유지
export {
  resolveCompanionLandRate,
  type CompanionLandRateInput,
  type PrimaryContextForCompanionRate,
  type CompanionLandRateResolution,
} from "./appurtenant-land-rate";
import type { TransferTaxInput } from "./types/transfer.types";
import {
  type RateClause,
  shortTermClause,
  unifiedShortTermClause,
  surchargeClause,
  clauseSet,
} from "./transfer-tax-rate-clause";
// 종전 import 경로 하위 호환 — 호 축 심볼은 이 모듈에서 계속 가져올 수 있다.
export {
  type RateClause,
  PROGRESSIVE_RATE_CLAUSES,
  clauseBucketKey,
} from "./transfer-tax-rate-clause";
import { isCrisisAcqExempt } from "./legal-codes";
// re-export — §114조의2 가산세 축은 별 파일로 옮겼으나 기존 import 경로를 유지한다.
export { calculateBuildingPenalty, resolveExtensionPenaltyBase } from "./transfer-tax-building-penalty";

// ============================================================
// H-7: calcTax — 세액 결정 (T-1 ~ T-4)
// ============================================================


interface CalcTaxResult {
  calculatedTax: number;
  surchargeType?: string;
  surchargeRate?: number;
  appliedRate: number;
  progressiveDeduction: number;
  surchargeSuspended: boolean;
  shortTermNote?: string;
  /** 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 비사업용 토지 +10%p 중과배제(기본세율). 장특은 표1 유지. */
  nblSurchargeExcluded?: boolean;
  /** 적용된 §104 호 — §104⑤2호 단서(동일 호 합산) 판정용. 조특법 특칙 등 §104 밖이면 undefined. */
  rateClause?: RateClause;
  /**
   * 이 자산이 **해당**하는 §104 호 **전부**(문자열 오름차순 정렬).
   *
   * `rateClause`는 §104① 후단·§104⑦ 후단이 고른 **승자**라 「해당 호 집합」을 표현하지 못한다.
   * 그런데 §104⑤2호 **단서**는 「동일한 호의 세율이 적용되고, 그 **적용세율이 둘 이상**인 경우
   * … **각 해당 호별** 세율을 적용하여 산출한 세액 중 **큰** 산출세액」이라 그 집합을 요구한다.
   * ⇒ 다건 그룹핑 키는 이 배열을 써야 승패에 오염되지 않는다
   *   (계획서 `docs/02-design/features/transfer-rate-clause-candidates.plan.md`).
   *
   * ⚠️ **정렬은 결정적이어야 한다** — 순서가 흔들리면 키가 갈려 입력 순서 의존이 재발한다(R-3).
   * `undefined`는 「해당 호를 단정할 수 없음」이다(조특법 특칙 등) — **묶지 않는 것이 안전측**.
   */
  candidateClauses?: RateClause[];
}


/**
 * 누진세율 산출세액 + 적용구간(표시용 baseRate·deduction)을 일괄 계산.
 *
 * brackets는 max 오름차순 정렬 전제 (progressiveRateSchema transform이 보장).
 * calcTax의 T-1.5·T-2·T-2.5·T-3·T-4 5개 분기가 공유 — 중복 제거 + 정렬 가정 단일화.
 */
export function computeBracketBreakdown(
  taxBase: number,
  brackets: ParsedRates["brackets"],
): { progressiveTax: number; baseRate: number; deduction: number } {
  const progressiveTax = calculateProgressiveTax(taxBase, brackets);
  const bracket = brackets.find((b) => taxBase <= (b.max ?? Infinity));
  return {
    progressiveTax,
    baseRate: bracket?.rate ?? brackets[brackets.length - 1].rate,
    deduction: bracket?.deduction ?? 0,
  };
}

/**
 * §104① **후단** — 「하나의 자산이 다음 각 호에 따른 세율 중 둘 이상에 해당할 때에는
 * 해당 세율을 적용하여 계산한 양도소득 산출세액 중 **큰 것**을 그 세액으로 한다」
 *
 * 1호는 「제94조제1항제1호·제2호 및 제4호에 따른 자산」으로 **자산 종류만** 특정한다 —
 * 보유기간·등기·용도 한정이 **없다**. 그래서 특례 호에 해당하는 자산도 **1호에 함께 해당**하고,
 * 두 산출세액 중 큰 것이 그 자산의 산출세액이 된다.
 * (계획서 `docs/02-design/features/transfer-104-1-latter-short-term.plan.md` §6-B)
 *
 * ### 어디에 적용하는가 — 「독립 세율」 호에만
 *
 * | 호 | 세율 구조 | 1호가 이길 수 있나 |
 * |---|---|---|
 * | 8호(비사토)·§104⑦(다주택 중과) | **§55① 누진 + 가산** | **불가** — 가산 ≥ 0이라 항등식으로 1호 이상 |
 * | 2·3호(단기)·10호(미등기)·영§167의5(부수토지 일체과세) | **독립 단일세율** | **가능** — 세율표에 종속 |
 *
 * ⇒ 전자는 호출하지 않는다(순수 no-op). 후자는 **항상** 호출한다 — 「40%는 누진 45%보다
 * 낮으니 …」 같은 **세율값 가정을 코드에 심지 않기 위해서**다. 세율은 DB(`tax_rates`)에서
 * 오므로 누진 최고세율이 오르면 그 가정이 조용히 깨진다.
 *
 * 🔑 **`candidateClauses`는 1호가 이길 때만 1호를 싣는다.** §104⑤2호 단서의 그룹핑 조건이
 *   「동일한 호의 세율이 **적용**되고」라 **적용** 호가 기준이기 때문이다. 무조건 실으면
 *   `clauseBucketKey`가 누진 호 포함으로 판정해 **세율을 키에서 빼고**, 40% 비주택과 60% 주택
 *   단기가 같은 버킷이 된다(분양권 함정과 동형 — `presale-clause-1-bucket-guard.anchor.test.ts`).
 *   진 특례 호는 「각 **해당** 호별」 재계산 대상으로 후보에 함께 남긴다.
 *
 * @param specialTax     특례 호로 계산한 산출세액
 * @param specialClauses 그 특례 호(들) — 1호가 이겨도 「해당 호」로 함께 싣는다
 * @returns 1호가 **더 크면** 1호 결과, 아니면 `null`(호출부가 특례 결과를 그대로 반환)
 */
export function compareWithClause1(
  taxBase: number,
  brackets: ParsedRates["brackets"],
  specialTax: number,
  specialClauses: readonly (RateClause | undefined)[] | undefined,
  specialLabel: string,
): CalcTaxResult | null {
  const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
  // 「큰 것」이므로 **동률에서는 바뀌지 않는다** — 특례 호가 그대로 적용 호로 남는다.
  if (progressiveTax <= specialTax) return null;
  return {
    calculatedTax: progressiveTax,
    appliedRate: baseRate,
    progressiveDeduction: deduction,
    surchargeSuspended: false,
    shortTermNote: `§104① 후단: ${specialLabel} 산출세액보다 §55① 누진세액이 커 1호를 적용`,
    rateClause: "104-1-1",
    candidateClauses: clauseSet("104-1-1", ...(specialClauses ?? [])),
  };
}

export function calcTax(
  taxBase: number,
  parsedRates: ParsedRates,
  input: TransferTaxInput,
  multiHouseSurchargeResult?: MultiHouseSurchargeResult,
): CalcTaxResult {
  const { brackets, surchargeRates, surchargeSpecialRules } = parsedRates;

  // T-1: 미등기 70% 단일세율 (§104①10호)
  if (input.isUnregistered && surchargeRates.unregistered) {
    const flatRate = surchargeRates.unregistered.flatRate;
    const unregisteredTax = applyRate(taxBase, flatRate);
    // §104① 후단 — 10호는 §55①과 무관한 **독립 세율**이라 비교한다(현행 70% > 45%로 늘 10호 승).
    // ※ §104⑦ 중과와의 우열은 별개 축이고 **비교하지 않는 것이 맞다** — ④·⑦ 후단이 비교 대상을
    //   「제1항제2호 또는 제3호」로 한정 열거해 10호를 뺐다(계획서 C-6d ·
    //   `unregistered-104-7-precedence.anchor.test.ts`).
    const clause1 = compareWithClause1(taxBase, brackets, unregisteredTax, ["104-1-10"], "미등기 70%");
    if (clause1) return clause1;
    return {
      calculatedTax: unregisteredTax,
      appliedRate: flatRate,
      progressiveDeduction: 0,
      surchargeSuspended: false,
      rateClause: "104-1-10",
      candidateClauses: clauseSet("104-1-10"),
    };
  }

  // T-1.5: 부수토지 일체과세 세율 분기 (영 §167의5, landNature 명시 입력 기반)
  // companion 토지 자산에 manualHoldingPeriodOverride 또는 landNature/primaryContext가 있으면
  // resolveCompanionLandRate로 세율을 결정하고 조기 반환.
  // [법령 근거] §104①2호 괄호("주택…이에 딸린 토지…포함…이하 이 항에서 같다")·영§167의5
  //            — 주택과 일체과세. §104①후단 — 큰 산출세액 세율.
  //            기재부 재산세제과-1354(2022.10.27) / 조심 2024인3140(2024.9.3. 기각)
  //            ※ 영 §154⑦은 §89①3호가 위임한 비과세 축 — 세율 축과 구분한다(배율은 동일).
  if (
    input.propertyType === "land" &&
    (input.manualHoldingPeriodOverride !== undefined ||
      input.landNature === "appurtenant_to_housing" ||
      input.primaryContextForCompanionRate !== undefined)
  ) {
    const ctx = input.primaryContextForCompanionRate;
    const companionArea =
      // companion의 면적 정보는 acquisitionArea 또는 nonBusinessLandDetails?.landArea에서 추출
      input.acquisitionArea ??
      input.nonBusinessLandDetails?.landArea;

    const resolution = resolveCompanionLandRate(
      {
        assetKind: "land",
        area: companionArea,
        manualHoldingPeriodOverride: input.manualHoldingPeriodOverride,
        landNature: input.landNature,
      },
      ctx
        ? {
            propertyType: ctx.propertyType,
            holdingMonths: ctx.holdingMonths,
            buildingFootprintArea: ctx.buildingFootprintArea,
            isUrbanArea: ctx.isUrbanArea,
            appurtenantLandZone: ctx.appurtenantLandZone,
            bundledSaleMode: ctx.bundledSaleMode,
          }
        : {
            // manualHoldingPeriodOverride만 있고 primaryContext 없는 경우:
            // 조건 판정 없이 수동 오버라이드만 적용 (자동 분기 조건 충족 의미 없음)
            propertyType: "land",
            holdingMonths: 999, // landNature 체크 전에 applied=false → 수동 오버라이드만 동작
          },
      // 영 §167의5 배율 경과조치(2022.1.1.) — 양도일 미전달 시 과거 양도분에 3배 오적용.
      input.transferDate,
    );

    if (resolution.applied) {
      if (resolution.manualProgressive) {
        // 누진세율 강제 (수동 또는 주택 2년 이상 보유 포괄적 일체과세)
        const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
        return {
          calculatedTax: progressiveTax,
          appliedRate: baseRate,
          progressiveDeduction: deduction,
          surchargeSuspended: false,
          shortTermNote: resolution.appliedReason
            ? `부수토지 일체과세(§104①2호·영§167의5): 누진세율`
            : "수동 지정: 누진세율",
          rateClause: "104-1-1",
          candidateClauses: clauseSet("104-1-1"),
        };
      }
      if (resolution.manualRate !== undefined) {
        // 단일세율 강제 (수동 또는 주택 단기보유 70%/60%)
        const isManualOverride = input.manualHoldingPeriodOverride !== undefined;
        // §104① 후단 — **자동 분기(주택 단기 §104①2·3호)일 때만** 비교한다.
        // 수동 오버라이드는 사용자가 세율을 강제한 것이라 해당 호를 단정할 수 없고
        // (그래서 아래 반환도 `rateClause`를 싣지 않는다) 후단의 전제가 성립하지 않는다.
        if (!isManualOverride) {
          const manualClause1 = compareWithClause1(
            taxBase,
            brackets,
            applyRate(taxBase, resolution.manualRate),
            [unifiedShortTermClause(resolution.manualRate)],
            `부수토지 일체과세 ${Math.round(resolution.manualRate * 100)}%`,
          );
          if (manualClause1) return manualClause1;
        }
        return {
          calculatedTax: applyRate(taxBase, resolution.manualRate),
          appliedRate: resolution.manualRate,
          progressiveDeduction: 0,
          surchargeSuspended: false,
          shortTermNote: isManualOverride
            ? `수동 지정: ${Math.round(resolution.manualRate * 100)}%`
            : `부수토지 일체과세(§104①2호·영§167의5): ${Math.round(resolution.manualRate * 100)}%`,
          // 수동 오버라이드는 사용자가 세율을 강제한 것이라 적용 호를 알 수 없다 → undefined(묶지 않음).
          ...(isManualOverride
            ? {}
            : {
                rateClause: unifiedShortTermClause(resolution.manualRate),
                candidateClauses: clauseSet(unifiedShortTermClause(resolution.manualRate)),
              }),
        };
      }
      if (resolution.unifiedRate !== undefined) {
        // 자동 분기: 부수토지 일체과세 (70% 또는 60%)
        // 한도 초과분(excessArea > 0)이 있어도 단건 엔진에서는 전체 taxBase에 단일세율 적용.
        // 초과분 분리는 aggregate/route 레이어에서 companion을 별도 자산으로 분리하여 처리.
        //
        // §104① 후단 — 여기서 강제되는 것은 주택 단기세율(§104①2·3호)이라 **독립 세율**이다.
        // 그 토지도 §94①1호 자산이므로 1호에 함께 해당한다 ⇒ 비교한다.
        const unifiedClause = unifiedShortTermClause(resolution.unifiedRate);
        const unifiedClause1 = compareWithClause1(
          taxBase,
          brackets,
          applyRate(taxBase, resolution.unifiedRate),
          [unifiedClause],
          `부수토지 일체과세 ${Math.round(resolution.unifiedRate * 100)}%`,
        );
        if (unifiedClause1) return unifiedClause1;
        return {
          calculatedTax: applyRate(taxBase, resolution.unifiedRate),
          appliedRate: resolution.unifiedRate,
          progressiveDeduction: 0,
          surchargeSuspended: false,
          shortTermNote: `부수토지 일체과세(§104①2호·영§167의5): ${Math.round(resolution.unifiedRate * 100)}%`,
          rateClause: unifiedShortTermClause(resolution.unifiedRate),
          candidateClauses: clauseSet(unifiedShortTermClause(resolution.unifiedRate)),
        };
      }
    }
    // applied=false → 기존 경로(본래 보유기간 기준) 계속 진행
  }

  // 술어는 `transfer-tax-surcharge-predicate.ts` **단일 소스**다 (2026-08-25).
  // 종전에는 이 자리와 `transfer-tax.ts` STEP 4 앞에 같은 판정이 복제돼 있었고,
  // 두 복제본 모두 `redevelopment_apt`를 빠뜨렸다 — 같은 파일 `isHousingLikeProp`(:434)이
  // 「신축APT는 주택」으로 단기세율을 매기는 것과 정면으로 모순이었다.
  // ⚠️ **세율 축(`isRateSurchargeApplied`)도 leaf에서 받는다** — 종전에는 이 아래에서
  //   `multiHouseSurchargeResult.surchargeApplicable`을 **직접** 읽어 leaf를 우회했고,
  //   그래서 자산 게이트(§104⑦ 「주택」)가 세율에 닿지 못했다(실측: 입주권 정밀 경로 0.68).
  const {
    isSuspended: suspended,
    isRateSurchargeApplied: surchargeApplicable,
    effectiveSurchargeType,
  } = resolveSurchargeApplication(input, multiHouseSurchargeResult, surchargeSpecialRules);

  const roundRate = (r: number) => Math.round(r * 10000) / 10000;

  // P5 특례 (조특법 §98①1호): 세율 20% 단일 — §104①에도 불구하고 누진·단기·중과세율 전체 대체.
  // STEP 7에서 eligible 시 forceFlatRate20 주입 (엔진 내부 플래그).
  if (input.forceFlatRate20) {
    return {
      calculatedTax: applyRate(taxBase, 0.2),
      appliedRate: 0.2,
      progressiveDeduction: 0,
      surchargeSuspended: false,
      shortTermNote: "조특법 §98①1호 — 양도소득세 세율 20% (§104① 불구)",
    };
  }

  // 보유기간 기산 (§104② — 상속은 피상속인·**이월과세**는 증여자 취득일, 사례 48 승계조합원은 준공일).
  // 판정은 `transfer-rate-holding-basis.ts` 단일 소스. **단순 증여(`gift`)는 통산하지 않는다** —
  // §104②2호의 대상은 「§97의2①에 **해당하는 자산**」뿐이고 단서는 3개 호 한정 열거다.
  // T-2 비사업용 토지 §104①후단 비교와 T-2.5 단기 특례세율이 공유.
  const successorRateBasis = getEffectiveAcquisitionDate(input);
  const isSuccessorRedev =
    input.propertyType === "redevelopment_apt" &&
    input.redevelopment?.isSuccessorMember === true &&
    input.redevelopment?.completionDate !== undefined;
  const rateBasisAcquisitionDate = isSuccessorRedev
    ? successorRateBasis
    : resolveRateBasisAcquisitionDate(input);
  const holdingForRate = calculateHoldingPeriod(rateBasisAcquisitionDate, input.transferDate);
  const holdingMonthsTotal = holdingForRate.years * 12 + holdingForRate.months;

  // T-2: 비사업용 토지 누진 + 10%p (§104①8호)
  if (input.isNonBusinessLand && surchargeRates.non_business_land) {
    // 부칙 §9270호 §14① — 2009.3.16~2012.12.31 취득 토지는 +10%p 중과 배제(→§104①1호 기본누진). 장특은 표1 유지.
    const nblCrisisExcluded = isCrisisAcqExempt(input.landAcquisitionDate ?? input.acquisitionDate);
    const additionalRate = nblCrisisExcluded ? 0 : surchargeRates.non_business_land.additionalRate;
    // 단일 필지 기준면적 초과분 부분 면적안분(목장 §168의10③·기타토지 §168의11①) — 중과분(+10%p)만 비사업용 면적비율로 안분(누진 기본세액은 전체 taxBase). 연접 다필지(§168의11⑤)·복합용도(§168의11⑥) 미구현
    const ratio = input.nonBusinessLandAreaRatio ?? 1;
    const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
    const surchargedBase = applyRate(taxBase, ratio); // ratio=1이면 surchargedBase=taxBase (회귀)
    const surchargeAmount = applyRate(surchargedBase, additionalRate);
    const nblTax = progressiveTax + surchargeAmount;

    // §104① 후단 — 하나의 자산이 둘 이상의 호에 해당하면 큰 산출세액을 적용.
    // 비사업용 토지(§104①8호)를 단기보유하면 토지 단기세율(1년 미만 50%·1~2년 40%, §104①3·2호)과
    // 비교하여 큰 세액. 토지이므로 주택 단기세율(70%/60%)이 아닌 50%/40% 사용.
    const nblShortTermRate =
      holdingMonthsTotal < 12 ? 0.50 :
      holdingMonthsTotal < 24 ? 0.40 :
      null;
    // 부칙 §9270호 §14①로 가산이 배제되면 **해당 호 자체가 §104①1호**다 — 정본
    // `legal-codes/surcharge-transition.ts:42`가 「중과세율 배제(→**§104①1호 기본세율**,
    // 보유 2년 미만이면 §104①2·3호 단기)」로 확정한 해석이다(「기획재정부 재산세제과-1422」
    // 2023.12.26. · 서울행정법원 2024구단72950).
    //
    // 2026-08-02 Q2 — 종전에는 가산이 0인데도 호 표기가 `"104-1-8"`이라 **일반 비사업용 토지와
    //   같은 버킷**에 들어갔다. 합산 대표가 위기취득이면 가산이 통째로 사라지고 아니면
    //   위기취득분에까지 가산이 붙어 **순서 의존 36,600,000**이었다(계획서 §9).
    const nblBaseClause: RateClause = nblCrisisExcluded ? "104-1-1" : "104-1-8";
    // §104① 후단 비교 대상이 되는 **해당 호 집합** — 승자와 무관하게 아래 두 반환이 **공유**한다.
    // 2년 이상이면 단기 호에 해당하지 않아 하나뿐이다.
    //
    // ※ 8호 ↔ **1호**는 비교하지 않는다 — 8호 세액은 「§55① 누진 + 가산(≥0)」이라 **항등식으로**
    //   1호 이상이다(`compareWithClause1` 표). 위기취득 배제로 가산이 0이면 동률인데, 그때는
    //   `nblBaseClause` 자체가 `"104-1-1"`이라 이미 1호다. 단기 호는 독립 세율이라 아래에서 비교한다.
    const nblCandidates = clauseSet(
      nblBaseClause,
      nblShortTermRate !== null ? shortTermClause(holdingMonthsTotal) : undefined,
    );
    if (nblShortTermRate !== null) {
      const nblShortTermTax = applyRate(taxBase, nblShortTermRate);
      if (nblShortTermTax > nblTax) {
        return {
          calculatedTax: nblShortTermTax,
          appliedRate: nblShortTermRate,
          progressiveDeduction: 0,
          surchargeSuspended: false,
          shortTermNote: `보유기간 ${holdingMonthsTotal < 12 ? "1년" : "2년"} 미만 단기세율 적용 (§104①후단: 비사업용 누진세액과 비교한 큰 세액)`,
          ...(nblCrisisExcluded ? { nblSurchargeExcluded: true } : {}),
          // 8호가 아니라 단기세율(2·3호)이 채택됐다 — **적용** 호는 그쪽이다.
          // 다만 **해당** 호는 둘 다이므로 `candidateClauses`는 아래 8호 반환과 같다.
          rateClause: shortTermClause(holdingMonthsTotal),
          candidateClauses: nblCandidates,
        };
      }
    }
    return {
      calculatedTax: nblTax,
      surchargeType: nblCrisisExcluded ? undefined : "non_business_land",
      surchargeRate: nblCrisisExcluded ? undefined : roundRate(additionalRate),
      appliedRate: roundRate(baseRate + additionalRate * ratio), // 실효 가산율(면적비율 반영); 부칙배제 시 additionalRate=0 → baseRate
      progressiveDeduction: deduction,
      surchargeSuspended: false,
      ...(nblCrisisExcluded ? { nblSurchargeExcluded: true } : {}),
      rateClause: nblBaseClause,
      candidateClauses: nblCandidates,
    };
  }

  // T-2.5: 단기보유 특례세율 (소득세법 §104①2~3호, 7~8호)
  // 사례 48 — 승계조합원 신축APT 양도 시 기산일 = 준공일 (사전-2019-법령해석재산-0649).
  // 보유기간 기산(rateBasisAcquisitionDate·holdingMonthsTotal)은 T-2 앞에서 계산됨 (§104② 공유).
  const isHousingLikeProp =
    input.propertyType === "housing" ||
    input.propertyType === "right_to_move_in" ||
    input.propertyType === "presale_right" ||
    input.propertyType === "redevelopment_apt"; // 신축APT는 주택 — §104①2/3호 60%/70%
  // P3 특칙 (§98의3④·§98의5③·§98의6③): 세율 = §104①1호 강제 — 단기세율(§104①2·3호) 배제.
  // "§104①3호 불구" 법문이나 "세율은 1호" 강제이므로 2호(1년 미만)도 배제됨 (설계 검토 #4).
  /**
   * 🔴 **양도일(시행일) 축 도입 (2026-08-25 — S1-01).**
   *
   * 종전 식은 `input.transferDate`를 **한 번도 읽지 않고** 현행(2021-06-01 시행) 세율만 적용했다.
   * 그런데 「1년 미만 70% / 1~2년 60% / 2년 이상 분양권 60%」는 전부 **2021-06-01 시행분**이다
   * (법률 제17477호, 2020-08-18 공포). 그 전에는 §104①이 이렇게 달랐다(법제처 DRF 실독):
   *   · 1호 = §55① 누진 — **분양권 괄호 없음**
   *   · 2호 = 40%[주택·조합원입주권 **제외** ⇒ 누진]
   *   · 3호 = 50%(주택·조합원입주권 **40%**)
   *   · 4호 = **조정대상지역 주택분양권 50%** (2018-01-01 신설 → 2020-08-18 삭제)
   *
   * 같은 저장소가 §104⑦ 가산율은 `resolveSurchargeAddonRate`로, §55① 누진표는
   * `loadFallbackTransferRates(targetDate)`로 **이미 양도일 축을 타는데** 이 식만 빠져 있었다.
   * 수정신고·경정청구 화면과 다건 `taxYear`(min 2000)가 과거 양도일을 정면으로 지원하므로
   * 도달 가능한 결함이었다(실측: 2020-06-01 양도 분양권 5년 보유 — 60% 178,500,000 vs
   * 법정 누진 93,650,000 = **84,850,000원 과대**).
   *
   * 시행일별 표·근거는 `data/short-term-rate-history.ts` 주석 참조.
   */
  const shortTermAssetClass: ShortTermAssetClass =
    input.propertyType === "presale_right"
      ? "presale_right"
      : isHousingLikeProp
        ? "housing_or_right"
        : "other";
  const shortTermResolution = input.suppressShortTermRate
    ? null
    : resolveShortTermRate(input.transferDate, holdingMonthsTotal, shortTermAssetClass, {
        isRegulatedArea: input.isRegulatedArea,
        // §104①4호 단서 — 「1세대가 보유하고 있는 주택이 없는 경우로서 대통령령으로 정하는 경우」.
        // 시행령이 정하는 세부 요건까지는 입력에 없으므로 무주택 사실만 반영한다(과잉 과세 회피).
        householdHasNoHouse: input.householdHousingCount === 0,
      });
  const shortTermFlatRate = shortTermResolution?.rate ?? null;
  const shortTermNote =
    shortTermFlatRate === null
      ? undefined
      : shortTermResolution?.clause === "104-1-4"
        ? "조정대상지역 주택분양권 50% 세율(소득세법 §104①4호 — 2018.1.1~2021.5.31 양도분)"
        : shortTermResolution?.clause === "104-1-1"
          ? "분양권 60% 세율(소득세법 §104①1호)"
          : holdingMonthsTotal < 12
            ? "보유기간 1년 미만 특례세율 적용"
            : "보유기간 2년 미만 특례세율 적용";

  if (shortTermFlatRate !== null) {
    const shortTermTax = applyRate(taxBase, shortTermFlatRate);
    // 호는 시행일별 표가 함께 돌려준다 — 분양권 2년 이상 60%는 §104①**1호**(2·3호가 아니다),
    // 2018~2021.5 조정대상지역 분양권은 **4호**다.
    const stClause: RateClause =
      shortTermResolution?.clause ??
      (holdingMonthsTotal < 24 ? shortTermClause(holdingMonthsTotal) : "104-1-1");
    // §104③: 다주택 중과세율과 비교하여 더 높은 세율 적용.
    // 중과 정보·가산율은 **후보 판정에도 필요**하므로 비교 블록 밖에서 구한다
    // (종전에는 `if` 안에 있어 「해당 호 집합」을 만들 수 없었다).
    // 종전 `if (surchargeApplicable && effectiveSurchargeType !== "none")` 블록이 하던
    // 타입 narrowing을 변수로 옮긴다("none" 제외).
    const stSurchargeType =
      surchargeApplicable && effectiveSurchargeType !== "none" ? effectiveSurchargeType : undefined;
    const stSurchargeInfo = stSurchargeType
      ? stSurchargeType === "multi_house_3plus"
        ? surchargeRates.multi_house_3plus
        : surchargeRates.multi_house_2
      : undefined;
    // 양도일 기준 중과 가산율 (§104⑦ 시행일별). null = 2018.4.1 이전 → 중과 미적용.
    const stHistoricalRate = stSurchargeType
      ? resolveSurchargeAddonRate(input.transferDate, stSurchargeType)
      : null;
    // §104⑦ 후단 비교 대상이 되는 **해당 호 집합** — 승자와 무관하게 아래 두 반환이 **공유**한다.
    const stCandidates = clauseSet(
      stClause,
      stSurchargeInfo && stHistoricalRate !== null
        ? surchargeClause(effectiveSurchargeType)
        : undefined,
    );
    if (stSurchargeInfo && stHistoricalRate !== null) {
      const additionalRateST = stHistoricalRate;
      const { progressiveTax: progressiveTaxST, baseRate: baseRateST, deduction: deductionST } = computeBracketBreakdown(taxBase, brackets);
      const surchargeTaxST = progressiveTaxST + applyRate(taxBase, additionalRateST);
      if (surchargeTaxST > shortTermTax) {
        return {
          calculatedTax: surchargeTaxST,
          surchargeType: effectiveSurchargeType,
          surchargeRate: roundRate(additionalRateST),
          appliedRate: roundRate(baseRateST + additionalRateST),
          progressiveDeduction: deductionST,
          surchargeSuspended: false,
          shortTermNote,
          rateClause: surchargeClause(effectiveSurchargeType),
          candidateClauses: stCandidates,
        };
      }
    }
    // §104① 후단 — 단기 자산도 §94①1호·2호 자산이라 **1호에 함께 해당**한다(2·3호는 독립 세율).
    // 종전에는 이 비교가 없어 40% 단기세율이 그대로 나갔다(과소 33,935,000 @ 과세표준 19.975억).
    // 분양권 2년 이상(60%)은 `stClause`가 이미 `"104-1-1"`이라 비교 대상이 없다.
    // ⚠️ ⑦ 중과가 발동 중이어도 안전하다 — ⑦ 세율은 누진 + 가산이라 항상 1호 이상이고,
    //   여기 도달했다는 것은 그 ⑦조차 단기에 졌다는 뜻이므로 1호도 진다.
    if (stClause !== "104-1-1") {
      const clause1 = compareWithClause1(
        taxBase,
        brackets,
        shortTermTax,
        stCandidates,
        `단기세율 ${Math.round(shortTermFlatRate * 100)}%`,
      );
      if (clause1) return clause1;
    }

    return {
      calculatedTax: shortTermTax,
      appliedRate: shortTermFlatRate,
      progressiveDeduction: 0,
      surchargeSuspended: false,
      shortTermNote,
      rateClause: stClause,
      candidateClauses: stCandidates,
    };
  }

  // T-3: 다주택 중과세
  if (surchargeApplicable && effectiveSurchargeType !== "none") {
    const surchargeInfo = effectiveSurchargeType === "multi_house_3plus"
      ? surchargeRates.multi_house_3plus
      : surchargeRates.multi_house_2;

    // 양도일 기준 중과 가산율 (§104⑦ 시행일별: 2018.4.1~ +10/+20, 2021.6.1~ +20/+30).
    // null = 2018.4.1 이전 양도 → 중과 미적용(아래 일반 누진세율로 fall through).
    const historicalRate = resolveSurchargeAddonRate(input.transferDate, effectiveSurchargeType);
    if (surchargeInfo && historicalRate !== null) {
      const additionalRate = historicalRate;
      const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);
      const surchargeAmount = applyRate(taxBase, additionalRate);
      return {
        calculatedTax: progressiveTax + surchargeAmount,
        surchargeType: effectiveSurchargeType,
        surchargeRate: roundRate(additionalRate),
        appliedRate: roundRate(baseRate + additionalRate),
        progressiveDeduction: deduction,
        surchargeSuspended: false,
        rateClause: surchargeClause(effectiveSurchargeType),
        // 2년 이상이라 §104⑦ 후단(단기 비교)이 없다 — 해당 호가 하나뿐이다.
        // ※ **1호**와도 비교하지 않는다 — ⑦ 세액은 「§55① 누진 + 가산(≥0)」이라 항등식으로 1호 이상이다.
        candidateClauses: clauseSet(surchargeClause(effectiveSurchargeType)),
      };
    }
  }

  // T-4: 일반 누진세율
  const { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets);

  return {
    calculatedTax: progressiveTax,
    appliedRate: baseRate,
    progressiveDeduction: deduction,
    surchargeSuspended: suspended,
    rateClause: "104-1-1",
    candidateClauses: clauseSet("104-1-1"),
  };
}

// ============================================================
// H-8: calcReductions — transfer-tax-reductions-calc.ts로 분리 (800줄 정책, 2026-06-11)
// 외부 import 호환 re-export.
// ============================================================

export { calcReductions, type ReductionsResult } from "./transfer-tax-reductions-calc";
