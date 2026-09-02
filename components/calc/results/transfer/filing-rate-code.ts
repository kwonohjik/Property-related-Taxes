/**
 * 신고서 ③ 세율구분 — 코드 산정.
 *
 * 정본: 「소득세법 시행규칙」 [별지 제84호서식] 작성방법 「과세대상자산 및 세율」 표
 * (사용자 제공 정본 3~4쪽 실측, 2026-09-02). 본지는 ③세율구분(코드) → … → ⑨세율 →
 * ⑩산출세액 순으로 코드와 세율을 함께 적게 돼 있다.
 *
 * ## 단일 소스
 *
 * 적용 호는 **엔진이 정한 `rateClause`**를 쓴다. 자산종류·보유기간·중과유형으로 여기서
 * 다시 유도하면 이중 진실이 된다 — §104① 후단·§104⑦ 후단 비교의 **승자**는 엔진만 안다.
 *
 * ## 다루지 않는 코드 (도달 불가 — N/A)
 *
 * · **지정지역** 계열 `1-31`·`1-37`·`1-38`·`1-71`·`1-73`
 *   엔진 중과율 테이블에 지정지역 항목 자체가 없고(다주택 2·3+·비사업용·미등기 넷뿐),
 *   「소득세법」 §104의2 지정지역으로 **지정된 사실이 없다**(2026-09-02 확인).
 * · 주식(`1-6x`·`1-70`)·파생상품(`1-80`·`1-81`)·신탁(`1-95`)·국외전출세(`1-94`)·
 *   국외자산(`2-10`) — 이 표는 **부동산 신고서**용이라 대상이 아니다.
 *   주식양도세는 별도 결과뷰가 같은 서식을 재현한다.
 * · 조특법 §98 미분양주택 과세특례(`1-92`) — 세율 특례라 감면 축과 별개이며 미구현.
 *
 * 코드를 단정할 수 없으면 **`undefined`를 돌려 「-」로 비운다** — 틀린 코드를 적는 것보다
 * 비우는 편이 낫다(자동 추정 금지).
 */

import type { RateClause } from "@/lib/tax-engine/transfer-tax-rate-clause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 「'21.6.1. 이후 양도분」 — 주택·조합원입주권·분양권 단기세율 개편 시행일 */
const RATE_2021_06_01 = "2021-06-01";

/** 자산이 정본 표의 「주택 및 조합원입주권」인가 */
function isHousingLike(kind: AssetForm["assetKind"] | undefined): boolean {
  return kind === "housing" || kind === "right_to_move_in" || kind === "redevelopment_apt";
}

/** 자산이 정본 표의 「분양권」인가 */
function isPresaleRight(kind: AssetForm["assetKind"] | undefined): boolean {
  return kind === "presale_right";
}

export interface FilingRateCodeInput {
  /** 엔진이 적용한 §104① 호 */
  rateClause: RateClause | undefined;
  assetKind: AssetForm["assetKind"] | undefined;
  /** 양도일 (YYYY-MM-DD) — 시기 경계 판정 */
  transferDate: string | undefined;
  /**
   * 부칙 <제9270호> §14① — ’09.3.16.~’12.12.31. 취득 토지는 비사업용 +10%p가 배제된다.
   * 정본 ⑮가 그 경우를 **일반세율 코드 1-10**으로 분류한다.
   */
  nblSurchargeExcluded?: boolean;
}

/**
 * ③ 세율구분 코드. 단정할 수 없으면 `undefined`.
 *
 * 정본 대응(국내자산 1. 「소득세법」 §94①1호·2호):
 *   ① 1-10 일반세율 · ② 1-15 1~2년(주택·입주권 제외) · ③ 1-20 1년 미만(주택·입주권 제외)
 *   ④ 1-40 1년 미만 주택·입주권 · ⑤ 1-39 1~2년 주택·입주권(’21.6.1.~)
 *   ⑥ 1-46 1년 미만 주택·입주권·분양권(’21.6.1.~) · ⑦ 1-23 1년 이상 분양권(’21.6.1.~)
 *   ⑧ 1-30 미등기 · ⑨ 1-11 비사업용토지 +10%p · ⑩ 1-35 1~2년 비사업용 · ⑪ 1-36 1년 미만 비사업용
 *   ⑮ 1-10 비사업용토지 ’09.3.16.~’12.12.31. 취득분
 *   ⑲ 1-51 / ㉓ 1-55 조정대상지역 1세대2주택 / 3주택(’18.4.1.~’21.5.31.)
 *   ㉗ 1-47 / ㉝ 1-49 같은 취지(’21.6.1.~ — +20%p / +30%p)
 */
export function resolveFilingRateCode(input: FilingRateCodeInput): string | undefined {
  const { rateClause, assetKind, transferDate, nblSurchargeExcluded } = input;
  if (!rateClause) return undefined;

  const after20210601 = !!transferDate && transferDate >= RATE_2021_06_01;

  switch (rateClause) {
    // ⑧ 미등기 양도 (70%)
    case "104-1-10":
      return "1-30";

    // ⑨~⑪·⑮ 비사업용 토지
    case "104-1-8":
      // 부칙 배제면 「해당 호 자체가 §104①1호」 — 정본 ⑮도 일반세율 코드로 적는다.
      return nblSurchargeExcluded ? "1-10" : "1-11";

    // ② ③ ④ ⑤ ⑥ 단기 보유
    case "104-1-3": // 1년 미만
      if (isPresaleRight(assetKind)) return after20210601 ? "1-46" : undefined;
      if (isHousingLike(assetKind)) return after20210601 ? "1-46" : "1-40";
      return "1-20";
    case "104-1-2": // 1년 이상 2년 미만
      if (isPresaleRight(assetKind)) return undefined; // 분양권은 ⑦(1-23)이 1년 이상 전체를 덮는다
      if (isHousingLike(assetKind)) return after20210601 ? "1-39" : undefined;
      return "1-15";

    // ⑱ 조정대상지역 내 분양권(’18.1.1.~’21.5.31.) — 50%
    case "104-1-4":
      return "1-21";

    // ⑲·㉗ 조정대상지역 1세대2주택 중과
    case "104-7-1":
      return after20210601 ? "1-47" : "1-51";

    // ㉓·㉝ 조정대상지역 1세대3주택 이상 중과
    case "104-7-3":
      return after20210601 ? "1-49" : "1-55";

    // ① 일반세율 — 다만 분양권 2년 이상은 호가 1호이되 단일 60%라 코드가 다르다(⑦ 1-23).
    case "104-1-1":
      if (isPresaleRight(assetKind)) return after20210601 ? "1-23" : undefined;
      return "1-10";
  }
}
