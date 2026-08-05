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
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";
import type { ParsedRates } from "./transfer-tax-helpers";
import {
  determineMultiHouseSurcharge,
  type MultiHouseSurchargeInput,
  type MultiHouseSurchargeResult,
} from "./multi-house-surcharge";
import { judgeNonBusinessLand } from "./non-business-land";
import type { NonBusinessLandJudgment } from "./non-business-land";
import { resolveDeemedOneHouseBy155, qualifiesUnavoidableOutsideCapital, meetsOneHouseHoldingResidence } from "./transfer-tax-helpers";
import { buildSurchargeExclusionStep } from "./transfer-reductions";
import type { IncomeDeductionId } from "./transfer-reductions";

/** `resolveSurchargeExclusionByReduction` 반환형 (조특법 감면주택 중과 배제 선판정) */
type SurchargeExclusionByReduction = { excluded: boolean; appliedId?: IncomeDeductionId; legalBasis?: string };

/** STEP 0.5 — houses[] + 주택 수 산정 규칙이 모두 있을 때만 정밀 중과 판정. */
export function runMultiHouseSurchargeStep(
  workingInput: TransferTaxInput,
  parsedRates: ParsedRates,
  steps: CalculationStep[],
  surchargeExclusionByReduction: SurchargeExclusionByReduction,
): MultiHouseSurchargeResult | undefined {
  // STEP 0.5: 다주택 중과세 판정 (houses[] 제공 + 주택 수 산정 규칙 로드 완료 시)
  let multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  if (workingInput.houses && workingInput.houses.length > 0 && parsedRates.houseCountExclusionRules) {
    const sellingId = workingInput.sellingHouseId ?? workingInput.houses[0].id;
    const housesForSurcharge = surchargeExclusionByReduction.excluded
      ? workingInput.houses.map((h) => (h.id === sellingId ? { ...h, isTaxSpecialExemption: true } : h))
      : workingInput.houses;
    if (surchargeExclusionByReduction.excluded) steps.push(buildSurchargeExclusionStep(surchargeExclusionByReduction));
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
      deemedOneHouseBy155: resolveDeemedOneHouseBy155(workingInput, parsedRates.oneHouseSpecialRules),
      // 영 §167의10①4호 — §155⑧ 수도권 밖 부득이 주택. 15호와 **별개 호**라 슬롯이 다르다.
      //   요건(2주택·해소일부터 3년) 판정은 비과세와 같은 정본을 쓴다.
      unavoidableOutsideCapitalHouse: qualifiesUnavoidableOutsideCapital(workingInput),
      marriageMerge: workingInput.marriageMerge,
      parentalCareMerge: workingInput.parentalCareMerge,
      presaleRights: workingInput.presaleRights ?? [],
      gracePeriod: workingInput.gracePeriod,
      // §154① 보유·거주 요건 precompute (배제2 §155⑤ 의제 게이트). 미산정 시 undefined → 엔진 충족 간주
      sellingHouseMeetsOneHouseRequirements: parsedRates.oneHouseSpecialRules
        ? meetsOneHouseHoldingResidence(
            workingInput,
            parsedRates.oneHouseSpecialRules.one_house_exemption,
          )
        : undefined,
    };
    multiHouseSurchargeResult = determineMultiHouseSurcharge(
      mhInput,
      parsedRates.houseCountExclusionRules,
      parsedRates.regulatedAreaHistory ?? null,
      parsedRates.surchargeSpecialRules,
      workingInput.isRegulatedArea,
    );
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
): TransferTaxInput {
  const cal = workingInput.commercialAppurtenantLand;
  if (workingInput.propertyType !== "commercial_building" || !cal) return workingInput;

  const judged = judgeAppurtenantLandExcess({
    landArea: cal.totalLandArea,
    buildingFootprintArea: cal.totalBuildingFootprintArea,
    zoneType: cal.zoneType,
    isUnregistered: cal.isUnregistered,
    context: "상업용건물",
  });

  if (judged.nonBusinessArea <= 0) return workingInput;

  steps.push({
    label: "부수토지 기준면적 초과분 비사업용 판정",
    formula:
      `기준면적 = 건축물 바닥면적 ${cal.totalBuildingFootprintArea}㎡ × ${judged.multiplier}배 = ${judged.allowedLandArea}㎡ · ` +
      `대지면적 ${cal.totalLandArea}㎡ 중 ${judged.nonBusinessArea}㎡ 초과 (${judged.multiplierDetail})`,
    amount: 0,
    legalBasis: NBL.MAIN,
  });

  return {
    ...workingInput,
    isNonBusinessLand: true,
    nonBusinessLandAreaRatio: judged.nonBusinessRatio,
  };
}
