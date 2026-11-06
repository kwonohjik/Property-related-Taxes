/**
 * 검증 매니페스트 추가분 — 조특법 §99·§99의3·§99의4(신축주택·농어촌주택등)의 **하위 법령·같은 조 다른 항**
 *
 * 리뷰 NH-43·NH-48·NH-69(`docs/reviews/new-housing-99-review-2026-11.md`): 감면 판정 사유가 인용하는
 * 조특령 §99①②·§99의3②④·§99의4②⑥·조특칙 §44의4·조특법 §99의4③이 `transfer-reductions/` 리터럴로만 있어
 * 커버리지 모수와 `npm run verify:legal` 밖이었다. 상수는 `legal-codes/transfer-house.ts`
 * `NEW_HOUSING_SUB_ARTICLE`.
 *
 * `additions-transfer-decree.ts`(741줄)에 넣지 않고 따로 둔 것은 800줄 정책 때문이다.
 *
 * 키워드는 모두 KoreanLaw MCP로 실독한 현행 본문의 verbatim 표현이다(2026-11-05 —
 * 조특법 MST 284389 · 조특령 MST 288915 · 조특칙 MST 289267). 2025.12.30.·2026.1.2. 개정으로
 * 「기획재정부령」이 「재정경제부령」으로 바뀐 문언은 부처 명칭이라 키워드에서 뺐다.
 */

import type { VerificationRule } from "../verifier-types";

export const TRANSFER_NEW_HOUSING_ADDITIONS: VerificationRule[] = [
  {
    // ① 감면대상 양도소득금액 계산(1호 5년 이내·재개발 단서 / 2호 5년 후) · ② 재분양·대체취득 배제(법 §99①2호 단서)
    id: "TRANSFER_DECREE.NEW_99_INCOME_AND_RECONTRACT",
    citation: "조특령 §99",
    keywords: [
      "법 제99조제1항에 따른 양도소득세 과세대상소득금액에서 빼는 양도소득금액",
      "취득일부터 5년 후에 양도하는 경우 감면대상 양도소득금액은 다음 계산식에 따라 계산한 금액으로 한다",
      "법 제99조제1항제2호 단서에서",
      "1998년 5월 21일이전에 주택건설사업자와 주택분양계약을 체결한 분양계약자가 당해 계약을 해제하고",
    ],
    keywordMode: "ALL",
  },
  {
    // ② 감면대상 양도소득금액 계산 · ④ 재분양·대체취득 배제(법 §99의3①1호)
    id: "TRANSFER_DECREE.NEW_99_3_INCOME_AND_RECONTRACT",
    citation: "조특령 §99의3",
    keywords: [
      "법 제99조의3제1항에 따른 양도소득세 과세대상소득금액에서 빼는 양도소득금액",
      "취득일부터 5년 후에 양도하는 경우 감면대상 양도소득금액은 다음 계산식에 따라 계산한 금액으로 한다",
      "2001년 5월 23일전에 주택건설사업자와 주택분양계약을 체결한 분양계약자가 당해 계약을 해제하고",
    ],
    keywordMode: "ALL",
  },
  {
    // ③2호 — 조합원 주택 기간 경과 후 사용승인 + 조합의 기간 내 잔여주택 직접 계약 사실(리뷰 NH-27 · `NEW_99_MEMBER_REMAINDER`)
    id: "TRANSFER_DECREE.NEW_99_MEMBER_REMAINDER",
    citation: "조특령 §99",
    keywords: [
      "조합원이 주택조합등으로부터 취득하는 주택으로서 신축주택취득기간 경과후에 사용승인 또는 사용검사를 받는 주택",
      "주택조합등이 조합원외의 자와 신축주택취득기간내에 잔여주택에 대한 매매계약",
    ],
    keywordMode: "ALL",
  },
  {
    // ③2호 — 인가일 현재 조합원 주택 기간 경과 후 사용승인 + 조합의 기간 내 잔여주택 직접 계약 사실(리뷰 NH-16 · `NEW_99_3_MEMBER_REMAINDER`)
    id: "TRANSFER_DECREE.NEW_99_3_MEMBER_REMAINDER",
    citation: "조특령 §99의3",
    keywords: [
      "이 주택조합등으로부터 취득하는 주택으로서 신축주택취득기간 경과후에 사용승인 또는 사용검사를 받는 주택",
      "주택조합등이 조합원외의 자와 신축주택취득기간내에 잔여주택에 대한 매매계약",
    ],
    keywordMode: "ALL",
  },
  {
    // ② 「대통령령으로 정하는 동」(농어촌주택 소재지 — 2026.2.27. 개정) · ⑥ 「대통령령으로 정하는 고향」
    id: "TRANSFER_DECREE.NEW_99_4_DONG_AND_HOMETOWN",
    citation: "조특령 §99의4",
    keywords: [
      "시 지역에 속한 동을 말한다",
      "대통령령으로 정하는 고향",
      "10년 이상 거주한 사실이 있는 지역",
    ],
    keywordMode: "ALL",
  },
  {
    // 령 §99② 단서·§99의3④ 단서의 제외 사유 — 소득세법 시행규칙 §71③ 사유로 다른 주택 분양
    id: "TRANSFER_RULE.NEW_HOUSING_RECONTRACT_EXCEPTION",
    citation: "조특칙 §44의4",
    keywords: [
      "영 제99조제2항 단서 및 영 제99조의3제4항 단서",
      "「소득세법 시행규칙」 제71조제3항의 규정에 의한 사유로 당해주택건설업자로부터 다른 주택을 분양받아 취득하는 경우의 주택",
    ],
    keywordMode: "ALL",
  },
  {
    // ③ 같은·연접 지역 배제 (농어촌주택 = 읍·면·동, 고향주택 = 시)
    id: "SPECIAL.RURAL_HOUSE_ADJACENT_EXCLUSION",
    citation: "조특법 §99의4",
    keywords: [
      "행정구역상 같은 읍ㆍ면ㆍ동 또는 연접한 읍ㆍ면ㆍ동에 있는 경우",
      "행정구역상 같은 시 또는 연접한 시에 있는 경우에는 제1항을 적용하지 아니한다",
    ],
    keywordMode: "ALL",
  },
];
