/**
 * STEP 0.5 다주택 중과세 판정 · STEP 0.6 비사업용 토지 정밀 판정
 *
 * transfer-tax.ts 800줄 정책에 따라 분리(2026-08-04, Phase A-0).
 * 둘 다 `workingInput`을 읽어 판정 결과를 내고, NBL은 그 결과로 파생 입력
 * (`effectiveInput`)을 만든다. 세액 계산 자체는 하지 않는다.
 */
import { NBL } from "./legal-codes";
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
