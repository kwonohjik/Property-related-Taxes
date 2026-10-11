/**
 * 「소득세법 시행령」 §154① 본문 요건(보유·거주)을 **양도일 연혁대로** 한 구절로 옮긴다 — 불성립 사유 문구의 단일 소스(X2-3).
 *
 * 종전에는 「§154① 보유 2년(취득 당시 조정대상지역이면 거주 2년)」을 리터럴로 적어, 2012.6.28. 이전 양도분(보유 3년)과
 * 2011.6.2. 이전 서울·과천·5개 신도시 양도분(보유기간 중 거주 2년)에서 같은 화면의 요건 검토표(`requirement-review.ts`)와 어긋났다.
 * 연수·구간은 판정이 쓰는 leaf(`data/one-house-holding-residence-era.ts`)를 그대로 부른다 — 여기서 판정하지 않는다.
 *
 * | 양도일 | 구절 |
 * |---|---|
 * | 2003-11-20 ~ 2011-06-02 | 보유 3년(서울·과천·5개 신도시 주택이면 보유기간 중 거주 2년) |
 * | 2011-06-03 ~ 2012-06-28 | 보유 3년 |
 * | 2012-06-29 ~ 조정대상지역 거주요건 도입 전 | 보유 2년 |
 * | 도입 후(`prePolicyDate` 2017-08-03~) | 보유 2년(취득 당시 조정대상지역이면 거주 2년) |
 */
import { shortArticle, TRANSFER } from "../legal-codes";
import {
  CAPITAL_NEWTOWN_RESIDENCE_YEARS,
  isCapitalNewTownResidenceEra,
  resolveOneHouseMinHoldingYears,
} from "../data/one-house-holding-residence-era";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";

type OneHouseRule = OneHouseSpecialRulesData["one_house_exemption"];

export function baseRequirementPhrase(
  transferDate: Date,
  rule: Pick<OneHouseRule, "minHoldingYears" | "regulatedAreaMinResidenceYears" | "prePolicyDate">,
): string {
  const holdingYears = resolveOneHouseMinHoldingYears(transferDate, rule.minHoldingYears);
  const residence = isCapitalNewTownResidenceEra(transferDate)
    ? `서울·과천·5개 신도시 주택이면 보유기간 중 거주 ${CAPITAL_NEWTOWN_RESIDENCE_YEARS}년`
    : transferDate >= new Date(rule.prePolicyDate)
      ? `취득 당시 조정대상지역이면 거주 ${rule.regulatedAreaMinResidenceYears}년`
      : undefined;
  return `${shortArticle(TRANSFER.ONE_HOUSE_REQUIREMENT)}① 보유 ${holdingYears}년${residence ? `(${residence})` : ""}`;
}
