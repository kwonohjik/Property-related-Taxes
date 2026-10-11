/**
 * §154① 단서 게이트가 읽는 **제외 후 주택 수** — ⑤(Step4 렌더)·④(API 조립)·⑧(validate)·Step4 거주요건 안내 빌더 공용 (재검증 S03-4).
 *
 * 엔진은 비과세를 §155②③ 상속주택·조특법 소유주택 제외를 뺀 수로 판정한다
 * (`transfer-tax-house-exclusion-step.ts` — `householdHousingCount − totalExcluded`). 게이트가 제외 **전** 수
 * (`resolveHouseholdHousingCount`)를 보면 제외 후 1주택·일시적 2주택인 세대의 단서가 전송되지 않아,
 * 엔진이 단서를 받으면 비과세를 내는데도 과세로 계산된다(196,350,000).
 *
 * 🔑 빼는 행은 엔진 평가기를 그대로 부르는 한 leaf(`exemptionCountExcludedHouseIds`)가 정한다 — 술어를 여기서 다시 쓰지 않는다.
 * 🔑 판정 메뉴는 주택 수 정본이 명부 파생값(`deriveJudgmentHouseCount`)이라 같은 leaf를 `judgmentProvisoMode`에서 부른다.
 */
import { resolveHouseholdHousingCount } from "./household-house-count";
import { exemptionCountExcludedHouseIds } from "./temp-two-house-candidate-exclusion";

type ExemptionCountForm = Parameters<typeof exemptionCountExcludedHouseIds>[0] & {
  householdHousingCount?: string;
  legacyHouseCountPrecedence?: boolean;
};

/**
 * 계산기 폼 → 비과세 판정의 제외 후 주택 수. 스칼라 파싱 기본값(`|| "1"`)은 ⑤·⑧·Step4 호출부의 규약 그대로다.
 * 명부에 제외 행이 없으면 `resolveHouseholdHousingCount`와 같은 값이다.
 */
export function resolveExemptionHousingCount(form: ExemptionCountForm): number {
  const count = resolveHouseholdHousingCount({
    primaryKind: form.assets?.[0]?.assetKind,
    declared: parseInt(form.householdHousingCount || "1", 10) || 0,
    houses: form.houses,
    transferDate: form.transferDate,
    legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
  });
  return Math.max(count - exemptionCountExcludedHouseIds(form).size, 0);
}
