/**
 * 배우자등 이월과세(「소득세법」 §97의2) — **적용배제 판정 단일 소스**
 *
 * ## 왜 leaf로 뽑았나
 *
 * 종전에는 이 판정이 `calcCarryoverScenarios`(단건 엔진 전용) **안에만** 있었다. 그런데
 * 일반건물 부담부증여 경로(F27)는 단건 엔진을 거치지 않고 라우트가 §159 안분을 직접 부르므로,
 * 같은 판정을 그쪽에서 다시 쓰려면 **복사**하는 수밖에 없었다.
 *
 * 복사하면 「기간 10년/5년 경계」·「증여자 사망」·「수용 2년」 중 하나만 고쳐졌을 때
 * **같은 사실관계가 경로에 따라 갈린다**. 그래서 술어를 하나로 두고 두 경로가 **같은 인자**로
 * 부른다(memory `feedback_shared_predicate_argument_parity`).
 *
 * ## 판정 순서가 곧 조문 순서다
 *
 * 1. **가업상속공제 자산** — 방어코드(⑧이 이미 차단한다)
 * 2. **적용기간 연수** — §97의2③ · 부칙 제19196호 §18: 증여 등기접수일이 2023-01-01 前이면 5년
 * 3. **관계 요건** — §97의2① 괄호(증여자 사망). 기간보다 **앞**이다: 관계를 못 채우면 애초에
 *    대상 자산이 아니다.
 * 4. **기간 초과** — §97의2③ (일수 기반 정밀 비교)
 * 5. **사용자 선언 적용배제** — §97의2②1호(수용 2년 내) · 2호(§89①3호 1세대1주택 비과세)
 *
 * ⚠️ **§97의2②3호(세액 비교)는 여기 없다** — 그것은 두 시나리오를 계산해야 판정되므로
 *    호출부(단건 `calcCarryoverScenarios` Step 6 · 다건 `resolveFilingUnitCarryoverScope` ·
 *    일반건물 §159 분기)가 각자 처리한다.
 */
import { addYears } from "date-fns";
import { isCarryoverRelationExcluded } from "./carryover-donor-death";
import type { TransferTaxInput } from "./types/transfer.types";

type CarryoverTaxationInput = NonNullable<TransferTaxInput["carryoverTaxation"]>;

/**
 * 「10년 룰」 시행 경계 — 「소득세법」 §97의2③ 개정(법률 제19196호) 부칙 §18.
 * 증여 등기접수일이 이 날 **前**이면 5년, 이후면 10년.
 *
 * ⚠️ 선언은 사용처보다 **위**에 둔다 — 아래로 내리면 다른 모듈이 초기화 시점에 참조할 때
 *    TDZ로 터진다(같은 실수가 `transfer-tax-schema-sub.ts`에서 이미 한 번 잠복했다).
 */
export const TEN_YEAR_RULE_CUTOFF = new Date("2023-01-01");

/** §97의2②3호(세액 비교) **이전**에 확정되는 배제 사유. */
export type CarryoverExclusionReason =
  | "family_business"
  | "relation_invalid"
  | "period_exceeded"
  | "expropriation"
  | "one_house_exemption";

export interface CarryoverEligibility {
  /** §97의2①을 적용해 시나리오 A를 만들 수 있는가 */
  isEligible: boolean;
  /** §97의2③ 적용기간 (증여 등기접수일 기준 5년 / 10년) */
  applicablePeriodYears: 5 | 10;
  /** 미적용 사유 — `isEligible === false`일 때만 채워진다. */
  exclusionReason?: CarryoverExclusionReason;
}

/**
 * 세액 비교 이전 단계의 적용 여부를 판정한다.
 *
 * @param ct           이월과세 입력 (증여 등기접수일·관계·사망·선언 배제)
 * @param transferDate 양도일 — 기간 초과 판정 기준
 */
export function judgeCarryoverEligibility(
  ct: CarryoverTaxationInput,
  transferDate: Date,
): CarryoverEligibility {
  // §97의2③ · 부칙 제19196호 §18 — 2023-01-01 前 증여분은 5년.
  const applicablePeriodYears: 5 | 10 = ct.giftRegistryDate < TEN_YEAR_RULE_CUTOFF ? 5 : 10;

  if (ct.exclusionDeclared?.isFamilyBusinessInheritedAsset) {
    // 적용기간은 판정 전 확정값이라 그대로 싣는다(dummy 금지 — 결과 카드가 「5년 룰」을 잘못 쓴다).
    return { isEligible: false, applicablePeriodYears, exclusionReason: "family_business" };
  }
  if (isCarryoverRelationExcluded(ct.donorRelation, ct.donorDeceased, ct.giftRegistryDate)) {
    return { isEligible: false, applicablePeriodYears, exclusionReason: "relation_invalid" };
  }
  if (transferDate > addYears(ct.giftRegistryDate, applicablePeriodYears)) {
    return { isEligible: false, applicablePeriodYears, exclusionReason: "period_exceeded" };
  }
  if (ct.exclusionDeclared?.expropriationWithin2Years) {
    return { isEligible: false, applicablePeriodYears, exclusionReason: "expropriation" };
  }
  if (ct.exclusionDeclared?.oneHouseExemptionApplies) {
    return { isEligible: false, applicablePeriodYears, exclusionReason: "one_house_exemption" };
  }
  return { isEligible: true, applicablePeriodYears };
}
