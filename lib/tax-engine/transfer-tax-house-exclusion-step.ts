/**
 * STEP 0.9 + 0.95: 주택수 제외(§99의4·§98의9·보유 감면주택·상속주택) → 비과세 판정용 유효 주택수 산정.
 *
 * transfer-tax.ts 800줄 정책 분리. effectiveInput의 reductions·houses에서 §89①3호 의제 주택수 제외를
 * 합산해 exemptionJudgeInput(householdHousingCount 차감)을 만들고 관련 step을 push한다.
 * 중과 주택수는 불변(R-D) — 비과세 판정 한정.
 *
 * 순환 의존 방지: 이 파일은 transfer-tax.ts를 import하지 않는다.
 */

import { resolveInheritedHouseExclusion, buildInheritedExclusionSteps } from "./transfer-inheritance-exclusion";
import { resolveHouseCountExclusion, buildHouseCountExclusionStep } from "./transfer-reductions/unsold-98-9";
import { resolveSpecialHouseExclusions } from "./transfer-reductions/unsold-hybrid-p5";
import type { TransferTaxInput, CalculationStep } from "./types/transfer.types";

/**
 * STEP 0.9 + 0.95 실행 — 비과세 판정용 유효 주택수(exemptionJudgeInput) 산정 + step push.
 * @param steps 계산 step 배열 (in-place push)
 */
export function runHouseCountExclusionStep(effectiveInput: TransferTaxInput, steps: CalculationStep[]) {
  // STEP 0.9: §99의4·§98의9 주택수 제외 (소법 §89①3호 의제) — §99의4 우선 1건(F-4) 적용,
  // 비과세·12억 안분·LTHD 표2에 유효 주택수(count−1) 반영. 중과는 §167의3 별개 — 원본(R-D).
  const { appliedList: hceApplied, new994Detail, unsold989Detail } = resolveHouseCountExclusion(
    effectiveInput.reductions,
    { generalHouseAcquisitionDate: effectiveInput.acquisitionDate, transferDate: effectiveInput.transferDate },
  );
  // STEP 0.95 (P5 모드 2): 보유 감면주택 N-way 주택수 제외 — 7개 조문 ② + §98 령②·⑥ + §99②.
  // 비과세(§89①3호) 판정 주택수만 차감 — 중과 주택수는 원본 유지 (R-D).
  const specialHouseExclusionDetail = resolveSpecialHouseExclusions(
    effectiveInput.specialHouseExclusions,
    effectiveInput.transferDate,
  );
  // §155②③ 상속·공동상속주택 비과세 주택수 제외 (2-A2) — 단독(§155②)·공동소수지분(§155③) 풀 분리, 각 최대 1채.
  // 양도(일반)주택이 상속개시 2년내 피상속인 증여분이면 §155② 게이트-오프. 최대지분 공동상속(§155③ 단서)은 산입. 중과 주택수는 불변(R-D).
  const inheritedSellingId = effectiveInput.sellingHouseId ?? effectiveInput.houses?.[0]?.id;
  const inheritedExclusion = resolveInheritedHouseExclusion(
    effectiveInput.houses,
    inheritedSellingId,
    effectiveInput.generalHouseGiftedFromDecedentWithin2yr,
  );
  const totalExcluded =
    hceApplied.length + specialHouseExclusionDetail.excludedCount + inheritedExclusion.excludedCount;
  const exemptionJudgeInput = totalExcluded > 0
    ? { ...effectiveInput, householdHousingCount: Math.max(effectiveInput.householdHousingCount - totalExcluded, 0) }
    : effectiveInput;
  // 둘 다 적격이면 §99의4 → §98의9 순으로 각각 1채씩 (D4-01) — 주택 수는 순차 체이닝
  let hceCursor = effectiveInput.householdHousingCount;
  for (const applied of hceApplied) {
    const after = Math.max(hceCursor - 1, 0);
    steps.push(buildHouseCountExclusionStep(applied, hceCursor, after));
    hceCursor = after;
  }
  if (specialHouseExclusionDetail.excludedCount > 0) {
    steps.push({
      label: "보유 감면주택 주택수 제외 (§89①3호 의제)",
      formula: `${specialHouseExclusionDetail.entries.filter((e) => e.eligible).map((e) => e.articleLabel).join(" · ")} — 주택수 ${effectiveInput.householdHousingCount} → ${exemptionJudgeInput.householdHousingCount} (비과세 판정 한정 — 중과 주택수 불변)`,
      amount: 0,
      legalBasis: specialHouseExclusionDetail.entries.filter((e) => e.eligible).map((e) => e.legalBasis).join(" · "),
    });
  }
  steps.push(
    ...buildInheritedExclusionSteps(
      inheritedExclusion,
      // 상속 제외 진입 시점 주택수 = 원본 − hce − 감면주택 (단독→공동 순 체이닝은 헬퍼가 처리)
      effectiveInput.householdHousingCount -
        hceApplied.length -
        specialHouseExclusionDetail.excludedCount,
    ),
  );

  return { exemptionJudgeInput, new994Detail, unsold989Detail, specialHouseExclusionDetail };
}
