/**
 * 검증 매니페스트 추가분 — 소득세법 **시행령** 다주택 중과(§167의3·§167의4·§167의10·§167의11)
 *
 * `additions-transfer-decree.ts`가 800줄을 넘어 「다주택 중과」 절을 옮겼다(2026-10-20). 규칙 내용은 그대로이고,
 * 중과 한시 배제·경과규정(12의2)과 12호 가~라목 항목을 이때 새로 등록했다.
 * 키워드는 모두 법제처 조문 본문에 실재하는 법문 표현(강학상 용어 금지).
 */

import type { VerificationRule } from "../verifier-types";

/**
 * 중과 한시 배제·경과규정(legal-codes `SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW`·`SURCHARGE_TRANSITION`) —
 * §167의3①12의2 · §167의4③6의2 · §167의10①12의2 · §167의11①12. 네 호 문언이 같다(MST 290841 실독 2026-10-20).
 * 2026.2.27.(제36129호) 가·나·다목 신설 · 2026.4.23.(제36276호) 나목 「허가 신청」 완화를 거쳤다 — 또 바뀌면 여기서 잡힌다.
 */
const SURCHARGE_SUSPENSION_KEYWORDS = [
  "법 제95조제4항에 따른 보유기간이 2년",
  "2026년 5월 9일까지 양도하는 주택",
  "해당 주택을 양도하기 위해 2026년 5월 9일까지 그 주택부수토지의 거래에 대한 토지거래허가를 신청하였을 것",
  "2026년 5월 10일 이후에 매매계약을 체결한 경우에는 2026년 9월 9일까지(다음 표에 따른 지역에 소재한 주택의 경우 2026년 11월 9일까지) 양도해야 한다",
  "해당 주택을 양도하기 위해 2026년 5월 9일까지 매매계약을 체결하고 계약금을 지급받은 사실이 증빙서류에 의해 확인될 것",
  "매매계약 체결일부터 4개월[나목4)의 표에 따른 지역에 소재한 주택의 경우 6개월] 이내에 양도할 것",
];

export const TRANSFER_DECREE_SURCHARGE_ADDITIONS: VerificationRule[] = [
  {
    id: "TRANSFER_DECREE.THREE_HOUSE_SCOPE",
    citation: "소득세법 시행령 §167의3",
    keywords: [
      "1세대 3주택 이상에 해당하는 주택",
      "주택을 3개 이상",
      "기준시가의 합계액",
      "3억원을 초과하지 않는 주택",
      // ⑪ 가목2)·나목2)·라목8)·마목4) 아파트 양도기한 — Q-1(대통령령 제36737호, 2026.9.30. 공포) 신설
      "제11항에 따른 기한까지 양도할 것",
      "2027년 12월 31일과 해당 호에서 정하는 날 중 가장 늦은 날",
      "임대주택 등록이 말소되는 날부터 1년이 되는 날",
      "조정대상지역의 공고일부터 1년이 되는 날",
      "이전고시일부터 1년이 되는 날",
      // 3호 후단(조특법 §97·§97의2·§98 감면대상장기임대주택) 아파트 양도기한 — Q-3(대통령령 제36737호) 신설
      "장기일반민간임대주택 중 아파트",
      "도시형 생활주택인 아파트는 제외한다",
      "단기민간임대주택 중 아파트를 임대하는 민간매입임대주택인 경우",
      "제11항에 따른 기한까지 양도하는 주택으로 한정한다",
      // ⑥ 같은 날 2개 이상 주택 양도 — 결정방법은 §154⑨ 준용(결정 #40 · 중과도 같은 명부 술어를 쓴다, MST 290841 실독 2026-10-11)
      "2개 이상의 주택을 같은 날에 양도하는 경우 그 결정방법에 대하여는 제154조제9항의 규정을 준용한다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.TWO_HOUSE_SCOPE",
    citation: "소득세법 시행령 §167의10",
    keywords: [
      "1세대 2주택에 해당하는 주택",
      "주택을 2개",
      "취학, 근무상의 형편, 질병의 요양",
    ],
    keywordMode: "ALL",
  },
  {
    // E-14c — 주택 + 조합원입주권·분양권 **각각 1개** 세대(법 §104⑦2호)의 중과 배제. 13호가 §156의2·§156의3·
    // 조특법 의제를 받는다(제155조는 인용하지 않는다 — 15호와 다르다).
    id: "TRANSFER_DECREE.HOUSE_RIGHT_ONE_EACH_SURCHARGE_EXCLUSION",
    citation: "소득세법 시행령 §167의11",
    keywords: [
      "주택과 조합원입주권 또는 분양권을 각각 1개씩 소유하고 있는 1세대",
      "제156조의2, 제156조의3 또는",
      "같은 항의 요건을 모두 충족하는 주택",
    ],
    keywordMode: "ALL",
  },
  {
    // E-14c — 주택 + 권리 합 3 이상 세대(법 §104⑦4호)의 중과 배제. ③7호가 제155조·§156의2·§156의3·조특법 의제를 받는다.
    id: "TRANSFER_DECREE.HOUSE_RIGHT_3PLUS_SURCHARGE_EXCLUSION",
    citation: "소득세법 시행령 §167의4",
    keywords: [
      "주택과 조합원입주권 또는 분양권 수의 합이 3개 이상인 1세대",
      "제155조, 제156조의2, 제156조의3 또는",
      "같은 항의 요건을 모두 충족하는 주택",
    ],
    keywordMode: "ALL",
  },
  {
    // 결정 #47 — 혼인 5년 내 「양도일 현재」 배우자 보유 차감. 응답 질문·엔진 차감·확인 필요 고지가 이 문언에 기댄다(MST 290841 실독 2026-10-11).
    id: "TRANSFER_DECREE.MARRIAGE_SUBTRACT_THREE_HOUSE",
    citation: "소득세법 시행령 §167의3",
    keywords: [
      "혼인한 날 현재 제1항에 따른 1세대3주택 이상에 해당하는 주택을 보유하게 된 경우로서 그 혼인한 날부터 5년 이내에 해당 주택을 양도하는 경우에는 양도일 현재 양도자의 배우자가 보유한 주택 수",
      "혼인한 날부터 5년 이내에 새로운 주택을 취득한 경우 해당 주택의 취득일 이후 양도하는 주택에 대해서는 이를 적용하지 아니한다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.MARRIAGE_SUBTRACT_HOUSE_RIGHT_3PLUS",
    citation: "소득세법 시행령 §167의4",
    keywords: [
      "양도일 현재 배우자가 보유한 제2항에 따른 주택, 조합원입주권 또는 분양권의 수를 차감하여 해당 1세대가 보유한 주택, 조합원입주권 또는 분양권의 수를 계산한다",
      "혼인한 날부터 5년 이내에 새로운 주택, 조합원입주권 또는 분양권을 취득한 경우",
    ],
    keywordMode: "ALL",
  },
  // 공고 전 매매계약 중과 배제(legal-codes `PRE_DESIGNATION_CONTRACT_EXCLUSION` — 계획서 regulated-area-region-code-match).
  // 네 호 문언이 같다(MST 286211 실독 2026-09-29). 호가 옮겨지거나 문언이 바뀌면 여기서 잡힌다.
  {
    id: "TRANSFER_DECREE.PRE_DESIGNATION_CONTRACT_THREE_HOUSE",
    citation: "소득세법 시행령 §167의3",
    keywords: ["조정대상지역의 공고가 있은 날 이전에 해당 지역의 주택을 양도하기 위하여 매매계약을 체결하고 계약금을 지급받은 사실이 증빙서류에 의하여 확인되는 주택"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.PRE_DESIGNATION_CONTRACT_TWO_HOUSE",
    citation: "소득세법 시행령 §167의10",
    keywords: ["조정대상지역의 공고가 있은 날 이전에 해당 지역의 주택을 양도하기 위하여 매매계약을 체결하고 계약금을 지급받은 사실이 증빙서류에 의하여 확인되는 주택"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.PRE_DESIGNATION_CONTRACT_HOUSE_RIGHT_ONE_EACH",
    citation: "소득세법 시행령 §167의11",
    keywords: ["조정대상지역의 공고가 있은 날 이전에 해당 지역의 주택을 양도하기 위하여 매매계약을 체결하고 계약금을 지급받은 사실이 증빙서류에 의하여 확인되는 주택"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.PRE_DESIGNATION_CONTRACT_HOUSE_RIGHT_3PLUS",
    citation: "소득세법 시행령 §167의4",
    keywords: ["조정대상지역의 공고가 있은 날 이전에 해당 지역의 주택을 양도하기 위하여 매매계약을 체결하고 계약금을 지급받은 사실이 증빙서류에 의하여 확인되는 주택"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.SURCHARGE_SUSPENSION_THREE_HOUSE",
    citation: "소득세법 시행령 §167의3",
    keywords: SURCHARGE_SUSPENSION_KEYWORDS,
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.SURCHARGE_SUSPENSION_HOUSE_RIGHT_3PLUS",
    citation: "소득세법 시행령 §167의4",
    keywords: SURCHARGE_SUSPENSION_KEYWORDS,
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.SURCHARGE_SUSPENSION_TWO_HOUSE",
    citation: "소득세법 시행령 §167의10",
    keywords: SURCHARGE_SUSPENSION_KEYWORDS,
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_DECREE.SURCHARGE_SUSPENSION_HOUSE_RIGHT_ONE_EACH",
    citation: "소득세법 시행령 §167의11",
    keywords: SURCHARGE_SUSPENSION_KEYWORDS,
    keywordMode: "ALL",
  },
  {
    // §167의3①12호 가~라목(소형 신축·준공 후 미분양·인구감소지역·관심지역) — 주택 수 산정 제외 + 중과 배제.
    // 나목 7억(2026.2.27.)·취득기간 2027.12.31.(2026.9.30.)·다·라목(2026.2.27. 신설)을 엔진이 상수로 들고 있다
    // (`multi-house-surcharge-count.ts`). 다·라목에 등록·신청 요건이 없다는 판단도 이 문언에 기댄다. MST 290841 실독 2026-10-20.
    id: "TRANSFER_DECREE.THREE_HOUSE_12_SPECIAL_HOUSES",
    citation: "소득세법 시행령 §167의3",
    keywords: [
      "2024년 1월 10일부터 2027년 12월 31일까지 취득하는 주택으로서 다음의 요건을 모두 갖춘 소형 신축주택",
      "2024년 1월 10일부터 2027년 12월 31일까지 취득하는 주택으로서 다음의 요건을 모두 갖춘 준공 후 미분양주택",
      "취득가액이 7억원 이하일 것",
      "2026년 1월 1일 이후 취득하는 주택으로서 다음의 요건을 모두 갖춘 주택",
      "해당 주택 취득일 현재 4억원(수도권 밖의 인구감소지역인 경우 9억원)을 초과하지 않을 것",
      "취득 당시 수도권 밖의 지역으로서 인구감소관심지역에 소재할 것",
      "동일한 시ㆍ군ㆍ구에 소재하는 주택이 아닐 것",
    ],
    keywordMode: "ALL",
  },
];
