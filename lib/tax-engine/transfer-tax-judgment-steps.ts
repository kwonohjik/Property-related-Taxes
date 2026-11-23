/**
 * STEP 0.5 다주택 중과세 판정 · STEP 0.6 비사업용 토지 정밀 판정
 * · STEP 0.62 상업용건물 부수토지 초과분 판정
 *
 * transfer-tax.ts 800줄 정책에 따라 분리(2026-08-04, Phase A-0).
 * 모두 `workingInput`을 읽어 판정 결과를 내고, 그 결과로 파생 입력
 * (`effectiveInput`)을 만든다. 세액 계산 자체는 하지 않는다.
 */
import { NBL } from "./legal-codes";
import { judgeAppurtenantLandExcess } from "./appurtenant-land-excess";
import { buildingExcessDeemNotices, commercialExcessExpropriationDeem } from "./appurtenant-excess-deeming";
import { NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE } from "./nbl-confirm-notices";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
import { linkTaxIncentiveHouse5ho, withTaxIncentiveHouseNotices } from "./surcharge-tax-incentive-house-link";
import { surchargeHousehold } from "./surcharge-tax-incentive-house-link";
import {
  determineMultiHouseSurcharge,
  type MultiHouseSurchargeInput,
  type MultiHouseSurchargeResult,
} from "./multi-house-surcharge";
import { judgeNonBusinessLand } from "./non-business-land";
import type { NonBusinessLandJudgment } from "./non-business-land";
import {
  qualifiesUnavoidableOutsideCapital,
  meetsOneHouseHoldingResidence,
} from "./transfer-tax-helpers";
import { meetsPublicInstitutionRelocationRegion, relocationContextOf, resolveIsRegulatedAtTransfer } from "./transfer-tax-temporary-two-house-timing";
import { evaluateNew994Para5, type New994Para5Result } from "./transfer-reductions/new-99-4-para5";
import { NEW_99_4_PARA5 } from "./legal-codes/transfer";
import { buildSurchargeExclusionStep } from "./transfer-reductions";
import { withSurchargeExclusionRegime } from "./transfer-reductions";
import { qualifiesOldClause8TemporaryTwoHouse } from "./data/surcharge-old-clauses-era";
import { judgeNewHouseOrigin, OLD_CLAUSE_8_ORIGIN_DIVERGENCE_NOTE } from "./one-house/new-house-origin";
import { waivesTempTwoHousePairOneYearGap } from "./transfer-tax-exemption-requirements";
import type { IncomeDeductionId } from "./transfer-reductions";
import { translateRedevAptForHousingJudgment } from "./one-house/redev-apt-judgment-input";
import { selfDeclaredReductionHouseNotice } from "./surcharge-self-declared-reduction-notice";
import { assembleSurchargeHouseSet } from "./transfer-tax-surcharge-house-set";
import { resolveSurchargeDeemedOneHouseDetail } from "./transfer-tax-surcharge-house-set";
import { surchargeSlotInput } from "./transfer-tax-surcharge-house-set";
export {
  assembleSurchargeHouseSet,
  resolveSurchargeDeemedOneHouse,
  resolveSurchargeDeemedOneHouseDetail,
  surchargeSlotInput,
  type SurchargeHouseSet,
} from "./transfer-tax-surcharge-house-set";


/** `resolveSurchargeExclusionByReduction` 반환형 (조특법 감면주택 중과 배제 선판정) */
type SurchargeExclusionByReduction = { excluded: boolean; appliedId?: IncomeDeductionId; legalBasis?: string };

/** §99의4⑤ 평가 결과 → 계산 과정 한 줄 (성립 · 불성립 사유 모두 남긴다 — 성공만 담으면 실패 사유가 사라진다) */
function buildNew994Para5Step(r: New994Para5Result): CalculationStep {
  return {
    label: r.isEligible ? "농어촌주택등 §99의4⑤ — 중과 비적용 · 장기보유특별공제 허용" : "농어촌주택등 §99의4⑤ — 적용하지 않음",
    formula: r.isEligible
      ? `수도권 조정대상지역 2주택(양도 시 공시가격 합산 ${r.priceSum?.toLocaleString("ko-KR")}원) 중 1주택을 양도하고 ${r.acquisitionDeadline.toISOString().slice(0, 10)}까지 농어촌주택등을 취득 → 소득세법 제104조제7항 미적용`
      : r.reasons.map((x) => x.message).join(" / "),
    amount: 0,
    legalBasis: r.legalBasis,
  };
}

/** §99의4⑤ 결과를 중과 판정 결과에 싣는다 — 배제 사유 문구(성립) · 경고(⑥ 사후관리·확인 필요 / 불성립 사유) */
function withNew994Para5(
  result: MultiHouseSurchargeResult,
  r: New994Para5Result,
  alsoExcludedByReduction: boolean,
): MultiHouseSurchargeResult {
  const warnings = [...(result.warnings ?? []), ...(r.isEligible ? r.notices : r.reasons.map((x) => x.message))];
  if (!r.isEligible || alsoExcludedByReduction) return { ...result, warnings };
  return {
    ...result,
    warnings,
    exclusionReasons: result.exclusionReasons.map((x) =>
      x.type === "tax_special_exemption"
        ? { ...x, detail: `${NEW_99_4_PARA5.PARAGRAPH} — 수도권 조정대상지역 2주택 중 1주택 양도 후 농어촌주택등 취득(2019.1.1.~2020.12.31. 양도분)` }
        : x,
    ),
  };
}

/** ⑥ 주택 수 제외의 확인된 영 §167의3①5호 조문 → 10호 「일반주택」 판정의 5호 주택(결정 #16) — 양도 주택마다 다시 잇는다. */
export function linkSurchargeHousesForSelling(
  rawHouses: NonNullable<TransferTaxInput["houses"]>,
  workingInput: TransferTaxInput,
  sellingId: string,
): NonNullable<TransferTaxInput["houses"]> {
  return linkTaxIncentiveHouse5ho(rawHouses, workingInput.specialHouseExclusions, workingInput.transferDate, sellingId);
}

/** 이월과세 시나리오 A — 양도 행의 §95④ 단서 보유 기산일(증여자 취득일)을 싣는다. 행 취득일은 그대로다. */
function withCarryoverHoldingStart(
  houses: NonNullable<TransferTaxInput["houses"]>,
  workingInput: TransferTaxInput,
  sellingId: string,
): NonNullable<TransferTaxInput["houses"]> {
  const start = workingInput.carryoverHoldingStartDate;
  return start ? houses.map((h) => (h.id === sellingId ? { ...h, holdingPeriodStartDate: start } : h)) : houses;
}

/**
 * STEP 0.5 — houses[] + 주택 수 산정 규칙이 모두 있을 때만 정밀 중과 판정.
 * §155⑳ 불성립이면 카드의 임대 호를 명부에 더한다(`unmetRentalSurchargeHouses`). 명부가 없어도 §155⑳ 거주주택 의제(`noRosterRentalResidenceHouses`)·§155①⑦ 의제와 조특법 제외만의 1주택 의제
 * (확인된 조특법 제외 주택 포함 — `noRosterTwoHouseDeemingHouses`)가 서면 입력된 사실로 행을 구성해 판정한다.
 */
export function runMultiHouseSurchargeStep(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  steps: CalculationStep[],
  surchargeExclusionByReduction: SurchargeExclusionByReduction,
  /** §99의4·§98의9 「취득 전 보유 주택」 판정 기준일 — STEP 0.9와 같은 값(`hceGeneralHouseAcquisitionDate`) */
  generalHouseAcquisitionDate?: Date,
): MultiHouseSurchargeResult | undefined {
  // STEP 0.5: 다주택 중과세 판정 (houses[] 제공 + 주택 수 산정 규칙 로드 완료 시)
  let multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  const houseSet = assembleSurchargeHouseSet(workingInput, parsedRates, generalHouseAcquisitionDate);
  if (houseSet && parsedRates.houseCountExclusionRules) {
    const { rawHouses } = houseSet;
    const sellingId = workingInput.sellingHouseId ?? rawHouses[0].id;
    // ⑥ 주택 수 제외의 확인된 영 §167의3①5호 조문 → 10호 「일반주택」 판정의 5호 주택(결정 #16 공백 · 겸용과 같은 leaf)
    const houses = withCarryoverHoldingStart(linkSurchargeHousesForSelling(rawHouses, workingInput, sellingId), workingInput, sellingId);
    // 조특법 §99의4⑤(2019.1.1.~2020.12.31. 양도) — 양도 뒤 예정신고기한 안에 농어촌주택등을 취득하면 §104⑦ 비적용·장특 허용(리뷰 NH-51).
    //   중과 배제 선판정이라 감면주택(§167의3①5호)과 같은 경로(양도 주택 행의 특례 표지)로 닫는다 — 세율 가산·장특 배제 두 축이 함께 닫힌다.
    const para5 = evaluateNew994Para5({
      transferDate: workingInput.transferDate,
      reductions: workingInput.reductions ?? [],
      houses: workingInput.houses,
      sellingHouseId: sellingId,
      isOneHousehold: workingInput.isOneHousehold,
      isSellingRegulated: resolveIsRegulatedAtTransfer(workingInput),
      presaleRightCount: workingInput.presaleRights?.length ?? 0,
    });
    const para5Applied = para5?.isEligible === true;
    const housesForSurcharge =
      surchargeExclusionByReduction.excluded || para5Applied
        ? houses.map((h) =>
            h.id === sellingId
              ? {
                  ...h,
                  isTaxSpecialExemption: true,
                  // 사용자가 이미 선언했으면 자기 선언 문구를 유지한다 — 자동 판정만 표지를 단다(US-19)
                  ...(h.isTaxSpecialExemption ? {} : { taxSpecialExemptionAutoId: surchargeExclusionByReduction.appliedId ?? "new_99_4_para5" }),
                }
              : h,
          )
        : houses;
    const deemed = resolveSurchargeDeemedOneHouseDetail(workingInput, parsedRates, generalHouseAcquisitionDate);
    const mhInput: MultiHouseSurchargeInput = {
      houses: housesForSurcharge,
      sellingHouseId: sellingId,
      transferDate: workingInput.transferDate,
      isOneHousehold: workingInput.isOneHousehold,
      // §167의10①15호 ① 요소 — §155① 의제 성립 여부를 **비과세 정본으로 선판정**해 주입.
      //   STEP 1(checkExemption)이 뒤에 오므로 그 결과를 받을 수 없다. 배제 2가
      //   `meetsOneHouseHoldingResidence`를 여기서 precompute하는 것과 같은 패턴이다.
      //   ⚠️ 타이밍(요건 A·B)만 본다 — §154① 충족(② 요소)은
      //   `sellingHouseMeetsOneHouseRequirements`가 별도로 담당하며, 중과 엔진이 둘을 AND한다.
      //   E-14 — 주택 수는 원시값이 아니라 비과세 정본의 값이다(`resolveSurchargeDeemedOneHouse`).
      deemedOneHouseBy155: deemed?.basis,
      deemedOneHouseSource: deemed?.source,
      deemedRestsOnInheritedExclusion: deemed?.restsOnInheritedExclusion,
      // 영 §167의10①4호 — §155⑧ 수도권 밖 부득이 주택. 15호와 **별개 호**라 슬롯이 다르다.
      //   요건(2주택·해소일부터 3년) 판정은 비과세와 같은 정본을 쓴다.
      //   #16 — 주택 수는 비과세 E-3.7과 **같은 제외 후 값**이다(종전에는 원시 수라 ③+⑧ 공동상속 소수지분 세대에서 늘 false).
      unavoidableOutsideCapitalHouse: qualifiesUnavoidableOutsideCapital(
        surchargeSlotInput(workingInput, generalHouseAcquisitionDate),
      ),
      // E-14e·f — 2023.2.28. 전 양도분의 구 호(8호 · §167의11①1호). 판정은 `data/surcharge-old-clauses-era.ts`.
      //   8호의 「1주택을 소유한 1세대」는 실제 소유 주택 수다(조심2021중1803) — §155②③·조특법 제외 전 값.
      oldClause8TemporaryTwoHouse: qualifiesOldClause8TemporaryTwoHouse({
        ...workingInput,
        // §155⑯ 세대 5년 — 재산세제과-129. §155① 기한과 **같은 지역 술어**를 쓴다.
        publicInstitutionRelocationMet:
          workingInput.temporaryTwoHouse !== undefined &&
          meetsPublicInstitutionRelocationRegion(workingInput.temporaryTwoHouse, relocationContextOf(workingInput)),
      }),
      rightDeemingCitedByOldClause1: deemed?.citedByOldClause1,
      marriageMerge: workingInput.marriageMerge,
      parentalCareMerge: workingInput.parentalCareMerge,
      presaleRights: workingInput.presaleRights ?? [],
      gracePeriod: workingInput.gracePeriod,
      // §154① 보유·거주 요건 precompute (배제2 §155⑤ 의제 게이트). 미산정 시 undefined → 엔진 충족 간주
      //   재개발 완공APT는 비과세 판정과 같은 번역(승계조합원 준공일 기산 · 거주월수)을 거친다 — G8-4.
      sellingHouseMeetsOneHouseRequirements: parsedRates.oneHouseSpecialRules
        ? meetsOneHouseHoldingResidence(
            translateRedevAptForHousingJudgment(workingInput),
            parsedRates.oneHouseSpecialRules.one_house_exemption,
          )
        : undefined,
    };
    const judge = (hs: NonNullable<TransferTaxInput["houses"]>) =>
      determineMultiHouseSurcharge(
        { ...mhInput, houses: hs },
        parsedRates.houseCountExclusionRules!,
        parsedRates.regulatedAreaHistory ?? null,
        parsedRates.surchargeSpecialRules,
        workingInput.isRegulatedArea,
      );
    // 3호 조문(§97·§97의2·§98) ⑥은 잇지 않는다(5년 임대·국민주택 사실 없음 — 모름 = 불성립) — 결론을 가르면 확인 필요
    multiHouseSurchargeResult = withTaxIncentiveHouseNotices(
      judge(housesForSurcharge),
      housesForSurcharge,
      workingInput.specialHouseExclusions,
      workingInput.transferDate,
      sellingId,
      judge,
    );
    // 구 8호(2023.2.28. 전 양도분)는 신규 주택의 취득 경위 갈래 분리를 적용하지 않는다 — 비과세는 그 갈래로 불성립인데 8호가 성립한 경우만 알린다(결정 #43 하위 1 나).
    if (mhInput.oldClause8TemporaryTwoHouse === true && workingInput.temporaryTwoHouse?.newHouseOrigin) {
      // 짝의 1년 요건 면제와 같은 술어 — D8 상대 쪽 짝이면 A의 단서로 면제하지 않는다(J-3).
      const originVerdict = judgeNewHouseOrigin(workingInput, waivesTempTwoHousePairOneYearGap(workingInput));
      if (originVerdict.blocked) {
        multiHouseSurchargeResult = {
          ...multiHouseSurchargeResult,
          warnings: [...(multiHouseSurchargeResult.warnings ?? []), OLD_CLAUSE_8_ORIGIN_DIVERGENCE_NOTE],
        };
      }
    }
    // §155①⑦·조특법 제외 구성 행은 중과가 배제될 때만 쓴다 — 중과가 남으면 그 결론을 다른 주택의 모르는 사실(1호·10호 등)이
    //   가를 수 있으므로 종전대로 원시 플래그 + 「확인 필요」 고지로 돌린다(`noRosterTwoHouseDeemingHouses`).
    //   구성 행(양도 주택 뒤)의 1호 불산입 여부도 모른다 — 산입 수가 줄어든 모든 경우(앞에서부터 자른 구성)에도
    //   배제될 때만 쓴다(2023.2.28. 전 양도분 3채 → 2채면 15호가 없어 중과 · 2021-09-18 실측 13호 219,087,000 ↔
    //   1호 불산입 명부 597,025,000 — 그 명부의 남은 주택이 ⑥ §99의2(5호)면 지금은 10호 219,087,000이다(결정 #16)).
    if (
      houseSet.fromTwoHouseDeeming &&
      (multiHouseSurchargeResult.surchargeType !== "none" ||
        housesForSurcharge.slice(1).some((_, i) => judge(housesForSurcharge.slice(0, i + 1)).surchargeType !== "none"))
    ) {
      return undefined;
    }
    if (para5) {
      steps.push(buildNew994Para5Step(para5));
      multiHouseSurchargeResult = withNew994Para5(multiHouseSurchargeResult, para5, surchargeExclusionByReduction.excluded);
    }
    // US-19 — 5호 자기 선언이 중과를 뺐는데 입력한 §98 계열 감면은 엔진이 부적격으로 판정했다(다른 조문 근거가 있을 때만 유효 — 고지만)
    const declaredNotice = selfDeclaredReductionHouseNotice(houses, sellingId, workingInput.reductions, surchargeExclusionByReduction, multiHouseSurchargeResult);
    if (declaredNotice) multiHouseSurchargeResult = { ...multiHouseSurchargeResult, warnings: [...(multiHouseSurchargeResult.warnings ?? []), declaredNotice] };
    // 근거는 세대 구성(산입 조합원입주권·분양권 유무)에 맞춘다 — NH-82
    if (surchargeExclusionByReduction.excluded) {
      const household = surchargeHousehold(mhInput.presaleRights, parsedRates.houseCountExclusionRules, multiHouseSurchargeResult);
      steps.push(buildSurchargeExclusionStep(withSurchargeExclusionRegime(surchargeExclusionByReduction, household)));
    }
  }
  return multiHouseSurchargeResult;
}

/** STEP 0.6 — nonBusinessLandDetails 제공 시 정밀 판정 + 파생 입력 생성. */
export function runNonBusinessLandStep(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  steps: CalculationStep[],
): { nonBusinessLandJudgment: NonBusinessLandJudgment | undefined; effectiveInput: TransferTaxInput } {
  // STEP 0.6: 비사업용 토지 정밀 판정 (nonBusinessLandDetails 제공 시)
  let nonBusinessLandJudgment: NonBusinessLandJudgment | undefined;
  // input은 readonly이므로 isNonBusinessLand override를 위한 mutable 복사본 사용
  let effectiveInput = workingInput;
  if (workingInput.nonBusinessLandDetails) {
    nonBusinessLandJudgment = judgeNonBusinessLand(
      workingInput.nonBusinessLandDetails,
      parsedRates.nonBusinessLandJudgmentRules,
    );
    // 판정 결과로 isNonBusinessLand override + 단일 필지 기준면적 초과분 면적안분 비율(목장 §168의10③·기타토지 §168의11①, F3) 항상 주입
    // (입력 플래그=true·판정=true 케이스도 부분안분이 반영되도록 if 밖에서 갱신)
    effectiveInput = {
      ...workingInput,
      isNonBusinessLand: nonBusinessLandJudgment.isNonBusinessLand,
      nonBusinessLandAreaRatio: nonBusinessLandJudgment.surcharge.nonBusinessAreaRatio,
    };
    // [I5] 입력 플래그와 판정 결과가 다를 때만 step 경고 기록
    if (nonBusinessLandJudgment.isNonBusinessLand !== workingInput.isNonBusinessLand) {
      steps.push({
        label: "비사업용 토지 판정 (엔진 재판정)",
        formula: `입력 플래그(${workingInput.isNonBusinessLand ? "비사업용" : "사업용"}) → 정밀 판정 결과: ${nonBusinessLandJudgment.isNonBusinessLand ? "비사업용" : "사업용"}`,
        amount: 0,
        legalBasis: NBL.MAIN,
      });
    }
  }
  return { nonBusinessLandJudgment, effectiveInput };
}

/**
 * STEP 0.62 — 상업용건물·오피스텔 부수토지 기준면적 초과분 비사업용 판정.
 *
 * 근거: 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 →
 *       「지방세법 시행령」 §101①2호(바닥면적 × §101② 적용배율).
 *
 * 판정 본체는 GB와 **같은 헬퍼**(`appurtenant-land-excess.ts`)를 쓴다. 구분소유는 지분율이
 * 판정식에서 약분되므로 집합건물 **전체** 대지·바닥면적만으로 초과 비율이 확정된다
 * (설계 근거: `commercial-appurtenant.types.ts` 헤더 · 계획서 §2.3 안 ㉮).
 *
 * 초과분이 있을 때만 `isNonBusinessLand`를 켠다 — 초과가 0이면 기존 값을 건드리지 않는다.
 *
 * ⚠️ `nonBusinessLandAreaRatio`만 주입하고 `isNonBusinessLand`를 켜지 않으면
 * `transfer-tax-rate-calc.ts`의 중과 분기에 진입하지 못해 **조용히 무효**가 된다.
 *
 * @returns 판정 미대상이면 입력을 그대로 반환한다(현행 동작 불변).
 */
export function runCommercialAppurtenantLandStep(
  workingInput: TransferTaxInput,
  steps: CalculationStep[],
  /** 초과분이 있을 때 «판정하지 않은 사항» 고지를 싣는다(NBL2611-V10-BX06). 생략하면 싣지 않는다. */
  warnings?: string[],
): TransferTaxInput {
  const cal = workingInput.commercialAppurtenantLand;
  if (workingInput.propertyType !== "commercial_building" || !cal) return workingInput;

  // NBL2611-C4(R16) — 공익수용 무조건 의제(영 §168의14③3호)가 성립하면 초과분을 비사업용으로 보지 않는다. 유예(①)는 주택 배율 축이라 넣지 않는다.
  const { deem, outcome } = commercialExcessExpropriationDeem(workingInput);
  const judged = judgeAppurtenantLandExcess({
    landArea: cal.totalLandArea,
    buildingFootprintArea: cal.totalBuildingFootprintArea,
    zoneType: cal.zoneType,
    unapprovedBuilding: cal.unapprovedBuilding,
    expropriationDeem: deem,
    context: "상업용건물",
  });
  if (warnings) {
    for (const n of buildingExcessDeemNotices(outcome, judged.expropriationDeemed?.suppressedArea)) if (!warnings.includes(n)) warnings.push(n);
  }

  if (judged.nonBusinessArea <= 0) return workingInput;

  steps.push({
    label: "부수토지 기준면적 초과분 비사업용 판정",
    formula:
      `기준면적 = 건축물 바닥면적 ${cal.totalBuildingFootprintArea}㎡ × ${judged.multiplier}배 = ${judged.allowedLandArea}㎡ · ` +
      `대지면적 ${cal.totalLandArea}㎡ 중 ${judged.nonBusinessArea}㎡ 초과 (${judged.multiplierDetail})`,
    amount: 0,
    legalBasis: NBL.MAIN,
  });
  // 판정은 도입하지 않는다(리뷰 §7.2 기각) — 다목·§101③·2% 단서·공장 구분을 판정하지 않았다는 사실만 알린다(NBL2611-V10-BX06).
  if (warnings && !warnings.includes(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE)) warnings.push(NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE);

  return {
    ...workingInput,
    isNonBusinessLand: true,
    nonBusinessLandAreaRatio: judged.nonBusinessRatio,
  };
}
