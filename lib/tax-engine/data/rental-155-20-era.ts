/**
 * 「소득세법 시행령」 §155⑳ 장기임대주택 보유자 거주주택 특례 — **연혁 분기** (OH-16 · OH-40)
 * (개정 없는 확정 역사 데이터. 정적 상수 — seed `tax_rates`로 연혁을 표현하지 않는다:
 *  다건 route가 과세기간 말일로 행을 고르므로 자산별 양도일·취득일을 표현할 수 없다.)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.10 · §3.11 · §7(4·5).
 * 본문·부칙은 법제처 DRF `target=eflaw`·`target=law`(MST 269541 부칙) 실독(2026-09-26).
 *
 * ## ① 마목 1) 포함 (OH-16) — 기준축 **양도일**
 *
 * | 양도일 | §155⑳ 「장기임대주택」 괄호 | 근거 |
 * |---|---|---|
 * | 2019-02-12 ~ 2020-10-06 | 「§167의3①2호 **가목부터 바목까지**」 — 마목 단서 1)은 그대로 배제 | MST 207800 |
 * | 2020-10-07 ~ 2021-02-16 | 「§167의3①2호에 따른 주택」 — 마목 1) 포함 문언 없음 | MST 222269 |
 * | **2021-02-17 ~** | 「같은 호 마목에 해당하는 주택의 경우에는 같은 목 1)에 따른 주택[같은 목 2) 및 3)에 해당하지 않는 경우로 한정한다]을 **포함한다**」 | MST 229391(대통령령 제31442호) · 부칙 제2조② 「양도소득세에 관한 개정규정은 이 영 시행 이후 양도하는 분부터」 |
 *
 * ⚠️ 2019-02-12 ~ 2021-02-16 양도분을 문언대로 배제한 **해석례는 확인하지 못했다**(계획서 §7-4 —
 *    검색 0건, 직접 선례 미확보). 문언 결론을 유지한다.
 *
 * ## ② 생애 한 차례·직전거주주택보유주택 1주택 한정 (OH-40) — 기준축 **거주주택 취득일 + 양도일**
 *
 * 2019-02-12 개정(대통령령 제29523호, MST 207800)이 §155⑳ 본문에 두 괄호를 넣었다:
 *   - 「(장기임대주택을 보유하고 있는 경우에는 **생애 한 차례만 거주주택을 최초로 양도하는 경우에 한정**한다)」
 *   - 직전거주주택보유주택 「(민간임대주택으로 등록한 사실이 있는 주택인 경우에는 **1주택 외의 주택을 모두
 *     양도한 후 1주택을 보유하게 된 경우로 한정**한다 …)」
 *
 * - 도입: 제29523호 부칙 제7조① 「제154조제10항제2호 및 제155조제20항(제2호는 제외한다)의 개정규정은
 *   이 영 시행 이후 **취득하는 주택부터** 적용한다」. ② 「다음 각 호 … 종전의 규정에 따른다 —
 *   1. 이 영 시행 당시 거주하고 있는 주택 2. 이 영 시행 전에 거주주택을 취득하기 위해 매매계약을
 *   체결하고 계약금을 지급한 사실이 증빙서류에 의해 확인되는 주택」.
 * - 삭제: 대통령령 제35349호(MST 269541, 2025-02-28 시행) — 두 괄호가 없다. 부칙 제14조 「제155조제20항의
 *   개정규정은 이 영 시행 이후 **주택을 양도하는 경우부터** 적용한다」.
 *
 * ⇒ 게이트 = 「거주주택 취득일 ≥ 2019-02-12 (부칙 제7조② 경과조치 해당분 제외) **AND** 양도일 ≤ 2025-02-27」.
 *
 * ⚠️ **확인 필요**(계획서 §7-5): 같은 부칙 제7조①은 2019-02-12 개정의 「가~라목 → 가~바목 확대」에도
 *    걸린다. 그 문언대로라면 2019-02-12 **전** 취득 거주주택은 종전 ⑳(가~라목)을 따라 마·바목 임대주택이
 *    장기임대주택이 아니게 되는데, 이후 개정본(2020-10-07·2021-02-17)은 「§167의3①2호에 따른 주택」으로
 *    바꾸면서 양도분 부칙만 두었다. 어느 쪽인지 확인하지 못해 **그 분기에서는 경고만** 낸다
 *    (`needsPre2019ArticleScopeNotice`).
 */

/** 대통령령 제31442호 시행일 — 이 날 이후 양도분부터 ⑳에 마목 1) 포함(부칙 제2조②). */
export const RENTAL_155_20_MA1_INCLUSION_TRANSFER_START = new Date("2021-02-17");

/** 대통령령 제29523호 시행일 — 이 날 이후 취득한 거주주택부터 생애 1회·PHRP 1주택 한정(부칙 제7조①). */
export const RENTAL_155_20_LIFETIME_LIMIT_ACQ_START = new Date("2019-02-12");

/** 대통령령 제35349호 시행일 — 이 날 이후 양도분부터 두 괄호 삭제(부칙 제14조). */
export const RENTAL_155_20_LIFETIME_LIMIT_REPEAL_TRANSFER_START = new Date("2025-02-28");

/**
 * ⑳ 경로에서 마목 1)(2018.9.14 이후 조정대상지역 신규취득 — §167의3①2호 마목 단서 1))을
 * **장기임대주택에 포함**하는가 — 양도일 기준(제31442호 부칙 제2조②).
 */
export function isMa1IncludedIn15520(transferDate: Date): boolean {
  return transferDate.getTime() >= RENTAL_155_20_MA1_INCLUSION_TRANSFER_START.getTime();
}

/**
 * 생애 1회·직전거주주택보유주택 1주택 한정 괄호가 **이 양도에 적용되는가**.
 *
 * @param residenceAcquisitionDate 양도하는 거주주택(시나리오 B는 직전거주주택보유주택)의 취득일
 * @param transferDate 양도일
 * @param transitionUnderAddendum7_2 제29523호 부칙 제7조② 경과조치(시행 당시 거주 중 · 시행 전
 *   매매계약·계약금 지급 증빙) 해당 — true면 종전 규정(괄호 없음)
 */
export function isLifetimeLimitEra155_20(
  residenceAcquisitionDate: Date,
  transferDate: Date,
  transitionUnderAddendum7_2: boolean,
): boolean {
  if (transitionUnderAddendum7_2) return false;
  return (
    residenceAcquisitionDate.getTime() >= RENTAL_155_20_LIFETIME_LIMIT_ACQ_START.getTime() &&
    transferDate.getTime() < RENTAL_155_20_LIFETIME_LIMIT_REPEAL_TRANSFER_START.getTime()
  );
}

/**
 * 계획서 §7-5 「확인 필요」 분기 — 2019-02-12 **전** 취득(또는 경과조치 해당) 거주주택에
 * 2019-02-12 개정으로 추가된 목(마·바목) 임대주택이 섞여 있는가. 결론은 바꾸지 않고 경고만 낸다.
 */
export function needsPre2019ArticleScopeNotice(
  residenceAcquisitionDate: Date,
  transitionUnderAddendum7_2: boolean,
  derivedArticles: readonly string[],
): boolean {
  const preRegime =
    transitionUnderAddendum7_2 ||
    residenceAcquisitionDate.getTime() < RENTAL_155_20_LIFETIME_LIMIT_ACQ_START.getTime();
  return preRegime && derivedArticles.some((a) => a === "마" || a === "바");
}
