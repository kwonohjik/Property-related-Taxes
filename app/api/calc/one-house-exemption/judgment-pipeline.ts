/**
 * 판정 메뉴 route 단계 6~6.7 — 주택 수 제외 → 판정 → §155⑳ → §89①4호 → 비거주자.
 *
 * route에서 그대로 옮겼다. 양론 표시(P4)가 **같은 파이프라인을 반대 입장 입력으로 한 번 더** 돌려야 해서
 * 함수로 뺐다 — 재판정을 손으로 줄여 쓰면(예: `judgeOneHouseExemptionFromInput`만 부르기) §155⑳·§89①4호·
 * 비거주자 단계를 건너뛴 결론이 나온다(`feedback_early_return_branch_skips_pipeline_stages`).
 */
import { presaleRightStartDate, type ParsedRates } from "@/lib/tax-engine/transfer-tax-helpers";
import { runHouseCountExclusionStep } from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { oneRightInputAfterSpecialActExclusion } from "@/lib/tax-engine/one-house/right-sale-special-act-exclusion";
import { resolveRentalResidenceComposition } from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import { buildRentalHousingVerdict, applyRentalHousingVerdict } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import { buildOneRightVerdict, applyOneRightVerdict } from "@/lib/tax-engine/one-house/one-right-verdict";
import { applyNonResidentVerdict } from "@/lib/tax-engine/one-house/non-resident";
import type { CalculationStep, TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

export function runOneHouseJudgmentPipeline(
  engineInput: TransferTaxInput,
  parsedRates: ParsedRates,
  judgmentBaseDate: Date,
  isRightSale: boolean,
) {
  /**
   * 단계 6: 주택 수 제외 → 판정.
   *
   * 계산기(`transfer-tax.ts` STEP 0.9 → STEP 1)와 **같은 순서·같은 함수**다.
   * `steps`는 계산기 표시용이라 여기서는 받아서 버린다 — 판정 메뉴는 세액 산식을 보여주지 않는다.
   */
  const steps: CalculationStep[] = [];
  const exclusion = runHouseCountExclusionStep(engineInput, steps);
  const coreJudgment = judgeOneHouseExemptionFromInput(
    exclusion.exemptionJudgeInput,
    parsedRates.oneHouseSpecialRules,
    presaleRightStartDate(parsedRates),
    { judgmentBaseDate },
  );

  /**
   * 단계 6.5: §155⑳ 장기임대주택 특례 (P4-3a).
   *
   * 계산기는 이것을 **STEP 2.5**(`checkExemption` 이후)에서 본다. 판정 route는 거기까지
   * 가지 않으므로 여기서 **같은 leaf**를 부른다. 부르지 않으면 임대 요건을 하나도 보지 않은 채
   * 「1주택 → 비과세」가 나온다(over-exemption).
   */
  // D12 — 세대 구성(3중첩 불가 등)도 계산기 STEP 2.5와 같은 판정을 거친다. 주택 수 제외 기준일은 위 단계 6과 같다.
  const rentalVerdict = buildRentalHousingVerdict(
    engineInput,
    engineInput.rentalHousingException?.applyException
      ? resolveRentalResidenceComposition(engineInput, parsedRates)
      : undefined,
  );
  const afterRental = applyRentalHousingVerdict(coreJudgment, rentalVerdict);

  /**
   * 단계 6.6: §89①4호 1세대1입주권 (P4-3b).
   *
   * 🔴 §155⑳과 **방향이 반대다** — 여기는 비과세를 **켠다**. `checkExemption`의 자산 게이트
   *    (`propertyType !== "housing"`)가 입주권을 항상 과세로 돌려보내기 때문에, 켜 주지 않으면
   *    판정 메뉴가 §89①4호 비과세를 영원히 말하지 못한다.
   */
  // 조특법상 소유주택으로 보지 않는 주택은 가·나목 「다른 주택」에서 뺀다(G065 — §155②③ 상속주택 제외는 빼지 않는다).
  const oneRightVerdict = buildOneRightVerdict(
    isRightSale ? oneRightInputAfterSpecialActExclusion(engineInput, exclusion) : engineInput,
    isRightSale,
  );
  const afterOneRight = applyOneRightVerdict(afterRental, oneRightVerdict);

  /**
   * 단계 6.7: 양도일 현재 비거주자(소득세법 §121② 단서 · 시행령 §180의2) — 판정 메뉴 전용.
   * 주택 양도면 §154①2호 나·다목 예외가 아니면 비과세를 끈다(2010.1.1. 전 양도분은 판정 보류).
   * 입주권 양도는 위 §89①4호 판정이 이미 걸렀다(2020.1.1. 이후).
   */
  const judgment = applyNonResidentVerdict(afterOneRight, engineInput, isRightSale);

  return { exclusion, rentalVerdict, oneRightVerdict, judgment };
}
