/**
 * 일반건물(실가) 라우트 — **부담부증여 × 배우자등 이월과세(§97의2)** 진입점 (F27, 2026-08-23)
 *
 * `general-building-route-actual.ts` 800줄 정책 분리. 카드 조립(그쪽)과 **시나리오 비교**(이쪽)는
 * 층이 다르다 — 이쪽은 그쪽을 **두 번 호출**해 신고단위 결정세액을 비교한다.
 */
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { judgeCarryoverEligibility } from "@/lib/tax-engine/transfer-tax-carryover-eligibility";
import {
  assertCarryoverDonorBasis,
  applyCarryoverDonorBasis,
} from "@/lib/tax-engine/transfer-tax-carryover-burdened-gift";
import {
  runActualGeneralBuildingOnce,
  type GeneralBuildingActualPricePayload,
} from "./general-building-route-actual";
import type {
  GeneralBuildingRouteResult,
  GbAssetLevelInputs,
} from "./general-building-route-cards";

/**
 * 일반건물(실가) × **부담부증여 × 배우자등 이월과세** — 「소득세법」 §97의2 배선 (F27, 2026-08-23)
 *
 * ## 종전 결함
 *
 * `assetKind === "general_building"`은 `route.ts`가 이 경로로 분기해 §159 안분
 * (`buildBurdenedGiftBreakdown`)을 **직접** 부르는데, `info`를 원본 그대로 넘겨
 * §97의2①1호 취득가액 치환도 ①3호 증여세 산입도 하지 않았다. 그 치환은
 * `applyCarryoverDonorBasis`에서만 일어나고 그 함수는 **단건 엔진 STEP 0.475에서만**
 * 호출되기 때문이다.
 *
 * 반면 ⑧(`transfer-tax-validate-bg.ts`)은 일반건물에서도 「당초 증여자」 취득 당시
 * 기준시가 두 칸을 **필수로 요구**하고 ⑤가 그 칸을 렌더한다 ⇒ **입력을 강제하면서 반영하지
 * 않는** 상태였다. 실측: `bgCoDonor` 토지 15억·건물 2억 → **1원·1원**으로 바꿔도 결정세액
 * 97,468,157 · 양도차익 311,020,394 · LTHD 0이 **전 필드 동일**(Δ 0). 같은 수치를 단건
 * 경로에 넣으면 Δ = **+17,913,684**였다.
 *
 * ## 왜 결합이 성립하는가 (조문)
 *
 * · 법 §88조1호 각 목 외의 부분 **후단** — 부담부증여 채무액 부분은 「양도로 보며」.
 * · 영 §159①1호 — 「양도로 보는 부분에 대한 양도차익을 계산할 때 그 취득가액 및 양도가액은」
 *   1호 취득가액 = A × B / C, **A = 「법 제97조제1항제1호에 따른 가액」**.
 * · §97의2①1호는 **바로 그 「제97조제1항제1호에 따른 금액」**을 당초 증여자 취득 당시 값으로
 *   치환한다 ⇒ 두 조문이 **같은 슬롯**을 가리키므로 결합이 문언상 성립한다.
 * · §97의2②의 적용배제는 **3개 호뿐**(수용·§89①3호·세액비교)이며 부담부증여를 배제하는
 *   문언이 **없다**(요건 조항 본문·괄호까지 읽어 확인).
 *
 * ## ②3호 비교는 **신고단위 결정세액**으로 한다
 *
 * 「제1항을 적용하여 계산한 양도소득 **결정세액**이 제1항을 적용하지 아니하고 계산한 양도소득
 * 결정세액보다 적은 경우」 — 일반건물은 카드 여러 장이 하나의 신고를 이루므로 카드별로 비교할
 * 수 없다. 그래서 **aggregate 전체를 두 번** 돌려 신고단위 결정세액을 비교한다
 * (N-1에서 확정한 §92③2호 규약 승계).
 *
 * ## 🔑 K-18을 건드리지 않는다
 *
 * `gb-carryover-api-validate.predo.anchor.test.ts`(K-18)가 부담부증여에서
 * `landCarryoverTaxation` **부재**를 고정한다. 그 근거는 「§159와 §97의2가 각각 취득가액을
 * 만드는 중복 배선 회피」이지 「일반건물에 §97의2 미적용」이 아니다 —
 * 여기처럼 **§159 분기 안에서** 처리하면 두 줄기가 겹치지 않는다.
 */
export function calculateGeneralBuildingActualTransfer(
  payload: GeneralBuildingActualPricePayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
  assetLevel?: GbAssetLevelInputs,
): GeneralBuildingRouteResult {
  const run = (p: GeneralBuildingActualPricePayload) =>
    runActualGeneralBuildingOnce(p, taxYear, annualBasicDeductionUsed, priorReductionUsage, rates, assetLevel);

  const ct = assetLevel?.carryoverTaxation;
  const info = payload.burdenedGiftInfo;
  // 부담부증여 × 이월과세 조합이 아니면 종전 그대로 (회귀 0).
  if (!ct || !info) return run(payload);

  // §97의2①괄호·②1·2호·③ — **단건 엔진과 같은 leaf**로 판정한다(복사 금지).
  const eligibility = judgeCarryoverEligibility(ct, payload.transferDate);
  if (!eligibility.isEligible) return run(payload);

  /**
   * 「당초 증여자」 값 필수 — **fail-fast**. 없으면 시나리오 A = B가 되어 §97의2가 조용히
   * 무력화되고 사용자는 「검토했고 불리해서 미적용」이라는 근거 없는 판정을 받는다.
   * (⑧이 앞에서 알려주므로 정상 경로에서는 여기 닿지 않는다.)
   */
  assertCarryoverDonorBasis(info, ct);

  const resultB = run(payload);
  const resultA = run({
    ...payload,
    // ①1호 취득가액 치환 + ①3호 증여세 상당액 — §159 안분 단계가 소비한다.
    burdenedGiftInfo: applyCarryoverDonorBasis(info, ct.giftTaxAmount),
    /**
     * §95④ 단서 — 보유기간을 **당초 증여자가 취득한 날**부터 기산한다.
     * 세 축을 모두 옮겨야 한다: 자산 단위(`acquisitionDate`)와 파트별 두 축이 각각
     * 카드의 보유기간·LTHD·§104② 단기 판정을 만든다.
     */
    acquisitionDate: ct.donorAcquisitionDate,
    landAcquisitionDate: ct.donorAcquisitionDate,
    buildingAcquisitionDate: ct.donorAcquisitionDate,
  });

  // §97의2②3호 — A가 B보다 **적으면** ①을 적용하지 않는다.
  const adopted: "A" | "B" =
    resultA.aggregated.determinedTax >= resultB.aggregated.determinedTax ? "A" : "B";
  const chosen = adopted === "A" ? resultA : resultB;

  chosen.aggregated.burdenedGiftCarryoverDetail = {
    isEligible: true,
    applicablePeriodYears: eligibility.applicablePeriodYears,
    adoptedScenario: adopted,
    determinedTaxA: resultA.aggregated.determinedTax,
    determinedTaxB: resultB.aggregated.determinedTax,
    donorAcquisitionDate: ct.donorAcquisitionDate,
    giftTaxAmount: ct.giftTaxAmount,
  };
  return chosen;
}
