/**
 * 판정 메뉴 route 단계 6~6.8 — 주택 수 제외 → 판정 → §155⑳ → §89①4호 → 비거주자 → 잔금 전 멸실 특약.
 *
 * route에서 그대로 옮겼다. 양론 표시(P4)가 **같은 파이프라인을 반대 입장 입력으로 한 번 더** 돌려야 해서
 * 함수로 뺐다 — 재판정을 손으로 줄여 쓰면(예: `judgeOneHouseExemptionFromInput`만 부르기) §155⑳·§89①4호·
 * 비거주자 단계를 건너뛴 결론이 나온다(`feedback_early_return_branch_skips_pipeline_stages`).
 */
import { presaleRightStartDate, type ParsedRates } from "@/lib/tax-engine/transfer-tax-helpers";
import { runHouseCountExclusionStep } from "@/lib/tax-engine/transfer-tax-house-exclusion-step";
import { resolveHceGeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-tax-precalc";
import {
  oneRightInputAfterSpecialActExclusionOf,
  rightSalePopDeclineUnconfirmedNotice,
} from "@/lib/tax-engine/one-house/right-sale-special-act-exclusion";
import { POP_DECLINE_71_2_UNCONFIRMED_ID } from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import { resolveRentalResidenceComposition } from "@/lib/tax-engine/transfer-tax-rental-residence-composition";
import { judgeOneHouseExemptionFromInput } from "@/lib/tax-engine/one-house/judge";
import { buildRentalHousingVerdict, applyRentalHousingVerdict } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import { rosterCountsRentalUnits } from "@/lib/tax-engine/transfer-tax-rental-housing-judge";
import { buildOneRightVerdict, applyOneRightVerdict } from "@/lib/tax-engine/one-house/one-right-verdict";
import { applyNonResidentVerdict } from "@/lib/tax-engine/one-house/non-resident";
import { applyDemolishedBeforeBalanceVerdict } from "@/lib/tax-engine/one-house/demolished-before-balance";
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
   *
   * §99의4①·§98의9① 「취득 전 보유」의 일반주택 취득일도 계산기(`transfer-tax.ts` STEP 0.9)와 같은 값이다. 넘기지 않으면
   * 증여일로 폴백해, 같은 세대로 증여받은 주택(세대 보유 통산 시작일)에서 농어촌주택 제외가 빠지고 계산기와 결론이 갈렸다
   * (`docs/00-pm/multi-house-surcharge-menu-residuals.plan.md` §1).
   */
  const steps: CalculationStep[] = [];
  const generalHouseAcquisitionDate = resolveHceGeneralHouseAcquisitionDate(engineInput);
  const exclusion = runHouseCountExclusionStep(engineInput, steps, generalHouseAcquisitionDate);
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
      ? resolveRentalResidenceComposition(engineInput, parsedRates, generalHouseAcquisitionDate)
      : undefined,
  );
  // F-1 Q-3 — 불성립이어도 명부에 「장기임대」 행이 있으면 엔진이 임대주택을 센 판정을 유지한다(계산기 STEP 0.96과 같은 술어).
  const afterRental = applyRentalHousingVerdict(coreJudgment, rentalVerdict, rosterCountsRentalUnits(engineInput));

  /**
   * 단계 6.6: §89①4호 1세대1입주권 (P4-3b).
   *
   * 🔴 §155⑳과 **방향이 반대다** — 여기는 비과세를 **켠다**. `checkExemption`의 자산 게이트
   *    (`propertyType !== "housing"`)가 입주권을 항상 과세로 돌려보내기 때문에, 켜 주지 않으면
   *    판정 메뉴가 §89①4호 비과세를 영원히 말하지 못한다.
   */
  // 조특법상 소유주택으로 보지 않는 주택은 가·나목 「다른 주택」에서 뺀다(G065 — §155②③ 상속주택 제외는 빼지 않는다).
  //   명부에서 도출하는 §71의2① 인구감소지역주택도 함께 뺀다(결정 #42 — 법률이 4호를 직접 적는다).
  //   계산기 §166 분기(`transfer-tax-redevelopment-steps.ts`)가 같은 함수를 부른다(결정 #2).
  const oneRightVerdict = buildOneRightVerdict(
    isRightSale ? oneRightInputAfterSpecialActExclusionOf(engineInput) : engineInput,
    isRightSale,
  );
  const afterOneRightVerdict = applyOneRightVerdict(afterRental, oneRightVerdict);
  // §71의2 후보가 모름으로 불성립했고 그것이 가·나목 결론을 가를 때만 확인 필요(결정 #42) — 주택 양도의 고지 수집기는 입주권을 보지 않는다.
  const popNotice = isRightSale ? rightSalePopDeclineUnconfirmedNotice(engineInput) : undefined;
  const afterOneRight =
    popNotice && !afterOneRightVerdict.undetermined.some((u) => u.id === POP_DECLINE_71_2_UNCONFIRMED_ID)
      ? {
          ...afterOneRightVerdict,
          undetermined: [...afterOneRightVerdict.undetermined, { id: POP_DECLINE_71_2_UNCONFIRMED_ID, reason: popNotice }],
        }
      : afterOneRightVerdict;

  /**
   * 단계 6.7: 양도일 현재 비거주자(소득세법 §121② 단서 · 시행령 §180의2) — 판정 메뉴 전용.
   * 주택 양도면 §154①2호 나·다목 예외가 아니면 비과세를 끈다(2010.1.1. 전 양도분은 판정 보류).
   * 입주권 양도는 위 §89①4호 판정이 이미 걸렀다(2020.1.1. 이후).
   */
  const afterNonResident = applyNonResidentVerdict(afterOneRight, engineInput, isRightSale);

  /**
   * 단계 6.8: 매매특약에 따른 잔금 전 주택 멸실(결정 #46) — 판정 메뉴 전용.
   * 2022-12-20 이후 계약이면 양도물건을 잔금청산일 현황(나대지)으로 판정해 주택 비과세를 거둔다.
   */
  const judgment = applyDemolishedBeforeBalanceVerdict(afterNonResident, engineInput, isRightSale);

  return { exclusion, rentalVerdict, oneRightVerdict, judgment };
}
