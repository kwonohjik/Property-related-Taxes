/**
 * 조특법 §98①1호 세율 20% 특례 — 결과 고지 (세액 불변).
 *
 * 1. **중과 우선 고지** (리뷰 US-01 · Q-11 (b) 사용자 결정 2026-11-08)
 *    법 §98①1호는 「같은 법 제104조제1항에도 불구하고 100분의 20」만 정한다. 다주택 중과(소득세법 §104⑦)는 「제1항에도
 *    불구하고」로 시작하지 않는 별개 항이고, 소령 §167의3①3호는 §98 감면 임대주택 중 「5년 이상 임대한 국민주택」만 중과에서
 *    뺀다. 그래서 임대 확인이 없는 §98 주택이 중과 대상이면 엔진은 중과세율을 적용한다(`transfer-tax-rate-calc.ts`).
 *    이 순서를 정면으로 다룬 해석례는 찾지 못했다 — 확인 필요를 함께 적는다.
 *
 * 2. **기본세율 비교 고지** (리뷰 US-48 · Q-10 (b) 사용자 결정 2026-11-08)
 *    §98①은 「선택하여 적용받을 수 있다」이고 조특령 §98④는 과세특례적용신고서 제출로 신청한다. 20%를 적용했을 때
 *    같은 과세표준·같은 중과 판정으로 §104① 기본세율 산출세액을 함께 적는다. 어느 쪽을 고를지는 납세자 몫이라
 *    엔진은 고르지 않는다(자동 선택 (a) 아님). 유리·불리 표현은 쓰지 않는다.
 */
import { MULTI_HOUSE } from "./legal-codes";
import { resolveSurchargeApplication, type SurchargeApplicationInput } from "./transfer-tax-surcharge-predicate";
import type { MultiHouseSurchargeResult } from "./types/multi-house-surcharge.types";

type SurchargeRulesArg = Parameters<typeof resolveSurchargeApplication>[2];

export const UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE =
  "조세특례제한법 §98①1호의 세율 100분의 20은 소득세법 §104①(기본세율)에 갈음하는 특례입니다. 이 주택은 다주택 중과(소득세법 §104⑦) 대상이어서 " +
  "중과세율을 적용하고 장기보유특별공제를 배제했습니다. 5년 이상 임대한 국민주택이면 " + MULTI_HOUSE.TAX_INCENTIVE_RENTAL_3_WITH_TWO_HOUSE_BASIS + "에 따라 " +
  "중과가 배제되어 세율 20%가 적용됩니다 — §98 감면 카드의 「5년 이상 임대」를 확인하세요. 20% 특례와 중과의 적용 순서를 정면으로 다룬 해석례는 " +
  "확인하지 못했습니다(확인 필요).";

export function unsold98GeneralRateComparisonNotice(flatRateTax: number, generalRateTax: number): string {
  return (
    `조세특례제한법 §98①은 선택하여 적용받는 특례입니다(조세특례제한법 시행령 §98④ — 과세특례적용신고서 제출). ` +
    `같은 과세표준에 세율 20%를 적용한 산출세액은 ${flatRateTax.toLocaleString()}원이고, 소득세법 §104① 기본세율을 적용한 산출세액은 ` +
    `${generalRateTax.toLocaleString()}원입니다(다주택 중과 판정은 같은 조건). §98 감면 선택을 해제하면 기본세율로 계산합니다.`
  );
}

export function unsold98RateNotices(args: {
  /** STEP 7에서 forceFlatRate20을 주입했는가(§98 적격) */
  flatRate20Active: boolean;
  /** 산출세액 계산에 넘긴 입력 — 중과 판정 leaf가 같은 값을 본다 */
  taxRateInput: SurchargeApplicationInput;
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined;
  surchargeSpecialRules: SurchargeRulesArg;
  /** 20%를 적용한 산출세액 */
  flatRateTax: number;
  /** 같은 과세표준·같은 경로에서 forceFlatRate20 없이 구한 산출세액 — 20%를 적용했을 때만 부른다 */
  generalRateTax: () => number;
}): string[] {
  if (!args.flatRate20Active) return [];
  const { isRateSurchargeApplied } = resolveSurchargeApplication(
    args.taxRateInput,
    args.multiHouseSurchargeResult,
    args.surchargeSpecialRules,
  );
  if (isRateSurchargeApplied) return [UNSOLD_98_SURCHARGE_PRECEDENCE_NOTICE];
  return [unsold98GeneralRateComparisonNotice(args.flatRateTax, args.generalRateTax())];
}
