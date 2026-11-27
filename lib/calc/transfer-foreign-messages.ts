/**
 * 국외자산 부동산 — 계산 경로 분기 문구. 의존성은 법령 상수(`TRANSFER_FOREIGN_RE`)뿐.
 *
 * U1의 「계산 연결 전」 차단 문구(`FOREIGN_CALC_PENDING_MESSAGE`)는 U2가 ④ 호출을 연결하면서 걷었다.
 * 남은 것: 국내 호출 가드(국외 폼이 국내 계산 경로로 새는 것을 막는다) · 다건(연간 합산) 차단 안내. 이력 저장 보류 안내는 U3가 걷었다.
 */

import { TRANSFER_FOREIGN_RE as RE } from "../tax-engine/legal-codes/transfer-foreign-realestate";

/**
 * `callTransferTaxAPI`(국내 전용) 가드 — 국외 폼은 `callForeignRealEstateAPI`로만 계산한다.
 * 이 가드가 없으면 빈 국내 자산이 조용히 계산된다.
 */
export const FOREIGN_DOMESTIC_PATH_GUARD_MESSAGE =
  "국외자산 부동산은 국내 양도소득세 계산 경로로 계산할 수 없습니다. 국외 전용 계산(callForeignRealEstateAPI)을 사용하세요.";

/**
 * 다건(`/multi` 연간 합산) 차단 안내 — 사용자 결정 D-M(2026-11-27): 국외 자산 여러 개는 한 건의 계산 안(`foreignAssets[]` ≤ 20)에서 받는다.
 * 합산 화면에서 사용자가 국외 건을 만나는 모든 자리(건 목록 · 건 편집 · 합산 계산 검증)가 이 한 문구를 쓴다.
 */
export const MULTI_FOREIGN_UNSUPPORTED_MESSAGE =
  "국외 자산은 한 건 계산 안에서 여러 개를 추가하세요. 연간 합산(다건) 계산에는 국외 건을 넣을 수 없으니, 이 건은 단건 계산기에서 계산하세요.";

/**
 * 같은 과세기간 국내 양도소득과 합산하지 않음 — 입력 화면 안내(`ForeignUnsupportedNotice`)와 결과 «확인 필요»
 * (`DOMESTIC_TRANSFER_NOT_AGGREGATED`)가 같은 문구를 쓴다. 합산 누진 여부는 법문상 확인하지 못했다(엔진 계획 V-5 · Q-8).
 */
export const FOREIGN_DOMESTIC_NOT_AGGREGATED_TEXT = `같은 과세기간에 국내 부동산 등을 양도했더라도 이 계산은 국외자산만 계산하며 국내 양도소득과 합산하지 않습니다. 기본공제는 국외자산분(${RE.SECTION_118_7_BASIC_DEDUCTION})을 따로 적용했습니다. 국내와 국외의 양도소득과세표준을 합산해 ${RE.SECTION_118_5_RATE}의 세율을 적용하는지는 법문상 확인하지 못했으니, 국내 양도가 있으면 세무 전문가에게 확인하세요.`;

/**
 * 이 계산이 지원하지 않는 상황 — 엔진 계획 Q-5·Q-6·Q-13·V-4·V-14가 «차단 또는 고지»로 정한 항목.
 * 입력 화면 안내 카드(목록)와 결과 «확인 필요» 코드 `UNSUPPORTED_SITUATIONS_NOT_EVALUATED`가 이 표 하나를 읽는다.
 * 상속·증여 취득과 외화차입 취득은 입력 칸이 없어(⑫가 거부) 직접 API 호출은 400이지만, 화면에서는 «내가 해당하는지»를 알 수 있게 항목으로 둔다.
 */
export const FOREIGN_UNSUPPORTED_ITEMS = [
  {
    key: "inherited",
    text: `상속·증여로 취득한 국외자산 — 매매로 취득한 경우만 계산합니다. ${RE.DECREE_178_4_1_ACQUISITION_COST}이 취득가액에 준용하는 규정에는 상속·증여 취득가액이 없습니다.`,
  },
  {
    key: "fxBorrow",
    text: `외화를 차입해 취득한 자산의 환차익 — ${RE.SECTION_118_2_FX_GAIN_PROVISO}은 환율변동으로 외화차입금에서 생긴 환차익을 양도소득에서 제외하지만, 계산식을 법령에서 찾지 못해 반영하지 않습니다.`,
  },
  {
    key: "installment",
    text: `장기할부조건 양도 — ${RE.DECREE_178_5_2_INSTALLMENT}에 따른 양도일·취득일 기준 환산은 지원하지 않습니다. 입력한 항목별 날짜와 환율 그대로 계산합니다.`,
  },
  {
    key: "market",
    text: `실지거래가액을 확인할 수 없어 시가로 계산하는 경우 — ${RE.SECTION_118_3_TRANSFER_VALUE} ①과 ${RE.DECREE_178_3_MARKET_VALUE}의 시가 산정은 지원하지 않습니다.`,
  },
  {
    key: "exemption",
    text: `비과세 — 1세대1주택 비과세는 ${RE.DECREE_154_1_DOMESTIC_ONE_HOUSE}이 양도일 현재 국내에 1주택을 보유할 것을 요건으로 하므로 국외 주택은 대상이 아닙니다. 그 밖의 비과세·감면은 판정하지 않습니다.`,
  },
] as const;

/** 결과 «확인 필요» 한 장에 담는 미지원 상황 문구 */
export const FOREIGN_UNSUPPORTED_RESULT_TEXT = `다음 경우는 계산하지 않았습니다. 해당하면 이 결과를 그대로 쓰지 말고 세무 전문가에게 확인하세요. ${FOREIGN_UNSUPPORTED_ITEMS.map((it, i) => `${"①②③④⑤⑥⑦⑧"[i]} ${it.text}`).join(" ")}`;
