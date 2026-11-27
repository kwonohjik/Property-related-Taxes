/**
 * 검증 매니페스트 추가분 — 국외자산 부동산 양도소득세(소득세법 §118의2~§118의8) 의존 문언
 *
 * 상수: `TRANSFER_FOREIGN_RE.*` (`legal-codes/transfer-foreign-realestate.ts`).
 * 소득세법 §118의2~§118의8 7개 조문의 기본 행은 `additions-transfer.ts`(`TRANSFER.OVERSEAS_*`)에 이미 있다 —
 * 여기는 **같은 조문이어도 이 기능이 기대는 항·문구**를 추가로 고정하는 행과, 미등록이던 조문(영 §178의2)이다.
 * 키워드는 모두 KoreanLaw MCP 실독 본문(2026-11-27: 소득세법 MST 280405 · §118의8은 efYd=20260701 ·
 * 소득세법 시행령 MST 290841 · 지방세법 MST 282559)에서 verbatim으로 뽑았다. 법령 상수에 법률번호 괄호는 쓰지 않는다.
 * 영 §162①3호 장기할부 문언은 해석 충돌(계획서 엔진 V-10)이 풀리기 전이라 등록하지 않았다.
 */

import type { VerificationRule } from "../verifier-types";

export const TRANSFER_FOREIGN_REALESTATE_ADDITIONS: VerificationRule[] = [
  {
    id: "TRANSFER_FOREIGN_RE.SCOPE_AND_FX_GAIN_PROVISO",
    citation: "소득세법 §118의2",
    keywords: [
      "계속 5년 이상 국내에 주소 또는 거소를 둔 자만 해당한다",
      "토지 또는 건물의 양도로 발생하는 소득",
      "국외에서 외화를 차입하여 취득한 자산",
      "환율변동으로 인하여 외화차입금으로부터 발생하는 환차익",
    ],
    keywordMode: "ALL",
  },
  {
    /** PR-3: 한도 A × B / C의 A·B·C 정의와 두 방법의 선택 문언 — 한도 함수 재사용과 필요경비 산입 분기의 근거 */
    id: "TRANSFER_FOREIGN_RE.FOREIGN_TAX_METHODS_AND_LIMIT",
    citation: "소득세법 §118의6",
    keywords: [
      "다음 각 호의 방법 중 하나를 선택하여 적용할 수 있다",
      "공제한도금액",
      "제118조의5에 따라 계산한 해당 과세기간의 국외자산에 대한 양도소득",
      "해당 국외자산 양도소득금액",
      "해당 과세기간의 국외자산에 대한 양도소득금액",
      "국외자산 양도소득세액을 해당 과세기간의 필요경비에 산입하는 방법",
    ],
    keywordMode: "ALL",
  },
  {
    /** PR-3: 국외 부동산 외국납부세액 세액공제방법의 지방소득세 공제 — 소득세 공제금액의 100분의 10 */
    id: "TRANSFER_FOREIGN_RE.LOCAL_SPECIAL_97_3_FOREIGN_TAX_CREDIT",
    citation: "지방세특례제한법 §97 ③",
    keywords: [
      "국외자산의 양도소득에 대하여 해당 외국에서 과세를 하는 경우",
      "제118조의6제1항제1호에 따라 납부세액을 공제한 경우",
      "그 공제금액의 100분의 10에 상당하는 금액을 양도소득분 개인지방소득 산출세액에서 공제받을 수 있다",
    ],
    keywordMode: "ALL",
  },
  {
    /** PR-3: 지방소득세 외국납부세액 공제가 산출세액을 넘지 못하는 근거(양도소득 세액공제는 지방세특례제한법에 위임) */
    id: "TRANSFER_FOREIGN_RE.LOCAL_103_4_CREDIT_CAP",
    citation: "지방세법 §103의4",
    keywords: [
      "양도소득에 대한 개인지방소득세의 세액공제 및 세액감면에 관한 사항은",
      "공제세액 또는 감면세액이 산출세액을 초과하는 경우에는 그 초과금액은 없는 것으로 한다",
    ],
    keywordMode: "ALL",
  },
  {
    /** U5: 입력·결과의 «미지원 상황» 고지가 인용하는 문언 — 실지거래가액 미확인 시 시가 */
    id: "TRANSFER_FOREIGN_RE.TRANSFER_VALUE_MARKET_FALLBACK",
    citation: "소득세법 §118의3 ①",
    keywords: [
      "양도 당시의 실지거래가액을 확인할 수 없는 경우에는 양도자산이 소재하는 국가의 양도 당시 현황을 반영한 시가에 따르되",
    ],
    keywordMode: "ALL",
  },
  {
    /** U5: 장기할부 미지원 고지의 근거 문언(영 §162①3호 자체는 해석 충돌 V-10으로 미등록) */
    id: "TRANSFER_FOREIGN_RE.DECREE_178_5_2_INSTALLMENT",
    citation: "소득세법 시행령 §178의5 ②",
    keywords: [
      "제162조제1항제3호의 규정에 의한 장기할부조건의 경우에는",
      "양도가액 또는 취득가액을 수령하거나 지출한 날로 본다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_FOREIGN_RE.RATE_ADJUSTMENT_104_4",
    citation: "소득세법 §118의5 ②",
    keywords: ["세율의 조정에 관하여는 제104조제4항을 준용한다"],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_FOREIGN_RE.BASIC_DEDUCTION_ORDER",
    citation: "소득세법 §118의7 ②",
    keywords: [
      "감면소득금액 외의 양도소득금액에서 먼저 공제하고",
      "해당 과세기간에 먼저 양도하는 자산의 양도소득금액에서부터 순서대로 공제한다",
    ],
    keywordMode: "ALL",
  },
  {
    /** 준용 목록 전체 한 문장 — §102(통산)·§103(기본공제)·§104(세율)·§97①②(환산)가 목록에 없다는 계획의 전제를 동결한다. */
    id: "TRANSFER_FOREIGN_RE.MUTATIS_LIST",
    citation: "소득세법 §118의8",
    keywords: [
      "제89조, 제90조, 제92조, 제95조, 제97조제3항, 제98조, 제100조, 제101조, 제105조부터 제107조까지, 제110조부터 제112조까지, 제114조, 제114조의2 및 제115조부터 제118조까지를 준용한다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_FOREIGN_RE.DECREE_154_1_DOMESTIC_ONE_HOUSE",
    citation: "소득세법 시행령 §154 ①",
    keywords: [
      "현재 국내에 1주택을 보유하고 있는 경우로서 해당 주택의 보유기간이 2년",
      "양도일 현재 국내에 1주택을 보유하고 있는 경우로서",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_FOREIGN_RE.DECREE_178_2_4_UNREGISTERED",
    citation: "소득세법 시행령 §178의2 ④",
    keywords: [
      "법 제118조의2제5호에서",
      "국외에 있는 자산으로서 법 제94조제1항제4호에 따른 기타자산",
      "부동산에 관한 권리로서 미등기 양도자산",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_FOREIGN_RE.LOCAL_103_3_3_RATE",
    citation: "지방세법 §103의3 ③",
    keywords: [
      "「소득세법」 제118조의2제1호",
      "제5호에 따른 자산의 양도소득에 대한 개인지방소득세의 표준세율은 제92조제1항에 따른 세율과 같다",
    ],
    keywordMode: "ALL",
  },
  {
    id: "TRANSFER_FOREIGN_RE.LOCAL_103_3_FOREIGN_TAX_BASE",
    citation: "지방세법 §103 ③",
    keywords: [
      "거주자의 국외자산 양도소득에 대한 개인지방소득세 과세표준은",
      "제118조의3, 제118조의4 및 제118조의6부터 제118조의8까지의 규정에 따라 계산한 소득세의 과세표준",
    ],
    keywordMode: "ALL",
  },
  {
    /** 시행본마다 금액만 다르고(1천200만원 표 → 1천400만원 표) 「종합소득에 대한 … 표준세율」 문언과 1천분의 6 첫 구간은 같다 */
    id: "TRANSFER_FOREIGN_RE.LOCAL_92_1_RATE_TABLE",
    citation: "지방세법 §92 ①",
    keywords: ["거주자의 종합소득에 대한 개인지방소득세의 표준세율은 다음 표와 같다", "과세표준의 1천분의 6"],
    keywordMode: "ALL",
  },
  {
    /** 외국납부세액 세액공제의 원화 환산일 — 「납부한 때」 (KoreanLaw MCP 실독 2026-11-28 · MST 286379) */
    id: "TRANSFER_FOREIGN_RE.RULE_60_2_FTC_FX_RATE",
    citation: "소득세법 시행규칙 §60 ②",
    keywords: ["외국납부세액의 원화환산은 외국세액을 납부한 때의", "기준환율 또는 재정환율에 의한다"],
    keywordMode: "ALL",
  },
];
