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
 * · 주식(`1-6x`·`1-70`)·파생상품(`1-80`·`1-81`)·신탁(`1-95`)·국외전출세(`1-94`) — 이 표는 **국내 부동산 신고서**용이라 대상이 아니다.
 *   주식양도세는 별도 결과뷰가 같은 서식을 재현한다.
 * · 국외자산 부동산(`2-10`) — 국내 산식과 섞이지 않는다. 국외 결과뷰가 같은 서식으로 따로 만든다
 *   (`components/calc/results/foreign-realestate/foreign-filing-form-codes.ts`).
 *
 * ## §98 미분양주택 과세특례 (`1-92`)
 *
 * 세율 특례라 §104 호(`rateClause`)에 섞지 않고 엔진의 별도 표지 `specialRateBasis`로 받는다
 * (별지 제84호서식 작성방법 국내자산 6. — 코드표: `filing-form-codes.ts` `SPECIAL_RATE_BASIS_CODE`).
 *
 * 코드를 단정할 수 없으면 **`undefined`를 돌려 「-」로 비운다** — 틀린 코드를 적는 것보다
 * 비우는 편이 낫다(자동 추정 금지).
 */

import type { RateClause, SpecialRateBasis, SurchargeRateClause } from "@/lib/tax-engine/transfer-tax-rate-clause";
import { SPECIAL_RATE_BASIS_CODE } from "./filing-form-codes";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 「'21.6.1. 이후 양도분」 — 주택·조합원입주권·분양권 단기세율 개편 시행일 */
const RATE_2021_06_01 = "2021-06-01";
/** 「'18.4.1.~'21.5.31. 양도분」 — 정본 표의 조정대상지역 다주택 코드(⑲~㉖) 시작일 */
const RATE_2018_04_01 = "2018-04-01";

/**
 * 중과 대상 주택인데 단기세율이 이긴 경우의 정본 코드 — [세대 구성][중과 호][단기 호].
 *   '21.6.1. 이후: ㉘ 1-84 · ㉙ 1-82(1세대2주택) / ㉞ 1-88 · ㉟ 1-86(1세대3주택)
 *     주택 + 조합원입주권·분양권 세대(R-c10-04): ㉛ 1-85 · ㉜ 1-83(각 1개) / ㊲ 1-89 · ㊳ 1-87(그 수의 합이 3 이상)
 *   '18.4.1.~'21.5.31.: ⑳ 1-53(1세대2주택) / ㉔ 1-57(1세대3주택) · 권리 세대 ㉒ 1-54 / ㉖ 1-58 — 1년 미만만 있다(1~2년 행 없음).
 */
const SURCHARGE_SHORT_TERM_CODE_AFTER_20210601 = {
  houses: {
    "104-7-1": { "104-1-3": "1-84", "104-1-2": "1-82" },
    "104-7-3": { "104-1-3": "1-88", "104-1-2": "1-86" },
  },
  withRight: {
    "104-7-1": { "104-1-3": "1-85", "104-1-2": "1-83" },
    "104-7-3": { "104-1-3": "1-89", "104-1-2": "1-87" },
  },
} as const;
const SURCHARGE_UNDER_1Y_CODE_20180401_20210531 = {
  houses: { "104-7-1": "1-53", "104-7-3": "1-57" },
  withRight: { "104-7-1": "1-54", "104-7-3": "1-58" },
} as const;

/**
 * 중과 호 코드 — [세대 구성][중과 호]. '21.6.1. 이후 ㉗ 1-47 · ㉝ 1-49 / 그 전 ⑲ 1-51 · ㉓ 1-55.
 * 주택 + 조합원입주권·분양권 세대(R-c10-04): '21.6.1. 이후 ㉚ 1-48 · ㊱ 1-50 / 그 전 ㉑ 1-52 · ㉕ 1-56.
 */
const SURCHARGE_CODE = {
  after20210601: { houses: { "104-7-1": "1-47", "104-7-3": "1-49" }, withRight: { "104-7-1": "1-48", "104-7-3": "1-50" } },
  before20210601: { houses: { "104-7-1": "1-51", "104-7-3": "1-55" }, withRight: { "104-7-1": "1-52", "104-7-3": "1-56" } },
} as const;

/** 정본 표의 세대 구성 열 — «1세대N주택» / «1세대가 주택과 조합원입주권 또는 분양권을 보유»(R-c10-04) */
const householdColumn = (input: FilingRateCodeInput) => (input.surchargeHouseholdHasCountedRight ? "withRight" : "houses");

/** 중과 대상 주택 단기 코드. 정본에 그 시기·보유기간 행이 없으면 `undefined`(비운다). */
function surchargeShortTermCode(
  input: FilingRateCodeInput,
  sur: SurchargeRateClause,
  shortClause: "104-1-2" | "104-1-3",
): string | undefined {
  const { transferDate } = input;
  if (!transferDate || transferDate < RATE_2018_04_01) return undefined;
  if (transferDate >= RATE_2021_06_01) return SURCHARGE_SHORT_TERM_CODE_AFTER_20210601[householdColumn(input)][sur][shortClause];
  return shortClause === "104-1-3" ? SURCHARGE_UNDER_1Y_CODE_20180401_20210531[householdColumn(input)][sur] : undefined;
}

/** 자산이 정본 표의 「주택 및 조합원입주권」인가 */
function isHousingLike(kind: AssetForm["assetKind"] | undefined): boolean {
  return kind === "housing" || kind === "right_to_move_in" || kind === "redevelopment_apt";
}

/** 자산이 정본 표의 「분양권」인가 */
function isPresaleRight(kind: AssetForm["assetKind"] | undefined): boolean {
  return kind === "presale_right";
}

/** 정본 표의 «주택 및 조합원입주권» 단기세율 — 1~2년 60% · 1년 미만 70% ('21.6.1. 이후). */
const HOUSING_SHORT_RATE = { "104-1-2": 0.6, "104-1-3": 0.7 } as const;
/**
 * '21.6.1. 전 «주택 및 조합원입주권» 1년 미만 세율 40%(§104①3호 괄호 · 정본 ④ 1-40) — 같은 호의 그 밖 자산은 50%(③ 1-20)라 세율로 가른다(R-c10-05).
 * 1~2년은 2014.1.1.~'21.5.31. 주택이 §104①1호(일반세율)라 2호 40%는 토지뿐이다. 2014.1.1. 전은 주택·토지 모두 1년 미만 50% · 1~2년 40%라
 * 세율로 가를 수 없어 토지 코드 그대로다(`SHORT_TERM_RATE_HISTORY` 1990 tier).
 */
const HOUSING_UNDER_1Y_RATE_BEFORE_20210601 = 0.4;

/** 토지 자산이 엔진에서 주택 단기세율을 받았는가 — 부수토지 카드(한도 안) */
function landTakingHousingShortRate(input: FilingRateCodeInput, after20210601: boolean): boolean {
  const { rateClause, appliedRate } = input;
  if (appliedRate === undefined) return false;
  if (rateClause !== "104-1-2" && rateClause !== "104-1-3") return false;
  if (!after20210601) return rateClause === "104-1-3" && Math.abs(appliedRate - HOUSING_UNDER_1Y_RATE_BEFORE_20210601) < 1e-9;
  return Math.abs(appliedRate - HOUSING_SHORT_RATE[rateClause]) < 1e-9;
}

export interface FilingRateCodeInput {
  /** 엔진이 적용한 §104① 호 */
  rateClause: RateClause | undefined;
  /** 엔진이 정한 §104 밖 세율 특례 표지(조특법 §98 20%) — 있으면 `rateClause`보다 우선한다(§104① 불구). */
  specialRateBasis?: SpecialRateBasis;
  assetKind: AssetForm["assetKind"] | undefined;
  /** 양도일 (YYYY-MM-DD) — 시기 경계 판정 */
  transferDate: string | undefined;
  /**
   * 엔진이 그 자산에 적용한 실효세율(`appliedRate`). **주택 세율을 받은 부수토지 카드**를 가르는 데만 쓴다 —
   * 카드는 `assetKind: "land"`이지만 「소득세법」 §104①2호·3호 «주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다)»에 따라
   * 단기세율이 60%/70%라 정본 표의 «주택 및 조합원입주권» 코드(1-39·1-46)에 대응한다. 같은 `104-1-2`가 토지 40%(초과분·독립 나대지)일 수도 있어 호만으로는 알 수 없다.
   * 미전달이면 종전대로 `assetKind`만 본다.
   */
  appliedRate?: number;
  /**
   * 비사업용 +10%p 배제 — 부칙 <제9270호> §14①(’09.3.16.~’12.12.31. 취득) 또는 양도일 유예(§104⑥ · 법률 제12169호 부칙 제20조,
   * ’09.3.16.~’15.12.31. 양도 + 지정지역 아님). 사유와 무관하게 해당 호가 §104①1호라 정본 ⑮가 **일반세율 코드 1-10**으로 분류한다.
   */
  nblSurchargeExcluded?: boolean;
  /**
   * 비사업용 토지(§104①8호)가 단기세율(2·3호)로 과세됨 — 엔진 echo `nonBusinessLandShortTerm`(NBL2611-V9-RI05).
   * 별지 제84호서식은 이 경우를 ⑩ 1-35(1~2년)·⑪ 1-36(1년 미만) «비사업용토지»로 적는다. 호(`104-1-2`·`104-1-3`)만으로는 구분되지 않는다.
   */
  nonBusinessLandShortTerm?: boolean;
  /**
   * 조정대상지역 다주택 중과 대상 주택인데 §104⑦ 후단 비교에서 단기세율(2·3호)이 이김 — 엔진 echo `surchargeShortTermClause`(R-c10-01).
   * 별지 제84호서식은 이 경우를 일반 단기 주택 코드(1-46·1-39·1-40)가 아니라 «조정대상지역 내 주택으로서 1세대2주택(3주택)» 단기 코드로 적는다.
   */
  surchargeShortTermClause?: SurchargeRateClause;
  /**
   * 중과 판정에서 주택 수에 조합원입주권·분양권이 산입된 세대 — 엔진 echo(`surchargeHouseholdHasCountedRight`, R-c10-04).
   * 별지 제84호서식은 이 세대의 중과 대상 주택을 «1세대가 주택과 조합원입주권 또는 분양권을 보유한 경우» 행(1-48·1-50·1-52·1-56 등)으로 따로 적는다.
   * 미전달이면 «1세대N주택» 행이다(명부 없는 fallback 판정은 권리를 세지 않는다).
   */
  surchargeHouseholdHasCountedRight?: boolean;
}

/**
 * ③ 세율구분 코드. 단정할 수 없으면 `undefined`.
 *
 * 정본 대응(국내자산 1. 「소득세법」 §94①1호·2호):
 *   ① 1-10 일반세율 · ② 1-15 1~2년(주택·입주권 제외) · ③ 1-20 1년 미만(주택·입주권 제외)
 *   ④ 1-40 1년 미만 주택·입주권 · ⑤ 1-39 1~2년 주택·입주권(’21.6.1.~)
 *   ⑥ 1-46 1년 미만 주택·입주권·분양권(’21.6.1.~) · ⑦ 1-23 1년 이상 분양권(’21.6.1.~)
 *     (’21.6.1. 전 분양권은 «부동산에 관한 권리»라 ①②③ 1-10·1-15·1-20 — 부표 1 자산종류표. R-c10-03)
 *   ⑧ 1-30 미등기 · ⑨ 1-11 비사업용토지 +10%p · ⑩ 1-35 1~2년 비사업용 · ⑪ 1-36 1년 미만 비사업용
 *     (⑩⑪은 §104① 후단 비교에서 단기세율이 채택된 비사업용토지 — 엔진 표지 `nonBusinessLandShortTerm`. NBL2611-V9-RI05)
 *   ⑮ 1-10 비사업용토지 ’09.3.16.~’12.12.31. 취득분
 *   ⑲ 1-51 / ㉓ 1-55 조정대상지역 1세대2주택 / 3주택(’18.4.1.~’21.5.31.)
 *   ㉗ 1-47 / ㉝ 1-49 같은 취지(’21.6.1.~ — +20%p / +30%p)
 *   ㉑ 1-52 / ㉕ 1-56 · ㉚ 1-48 / ㊱ 1-50 주택과 조합원입주권 또는 분양권 세대(각 1개 / 합 3 이상) — 엔진 표지 `surchargeHouseholdHasCountedRight`. R-c10-04
 *   ⑳ 1-53 / ㉔ 1-57 1년 미만 보유 조정대상지역 1세대2주택 / 3주택(’18.4.1.~’21.5.31.)
 *   ㉘ 1-84 · ㉙ 1-82 / ㉞ 1-88 · ㉟ 1-86 1년 미만 · 1~2년 보유 조정대상지역 1세대2주택 / 3주택(’21.6.1.~)
 *   ㉒ 1-54 / ㉖ 1-58 · ㉛ 1-85 · ㉜ 1-83 / ㊲ 1-89 · ㊳ 1-87 같은 취지의 주택과 조합원입주권 또는 분양권 세대
 *     (⑳㉔㉘㉙㉞㉟은 §104⑦ 후단 비교에서 단기세율이 채택된 중과 대상 주택 — 엔진 표지 `surchargeShortTermClause`. R-c10-01)
 */
export function resolveFilingRateCode(input: FilingRateCodeInput): string | undefined {
  const { rateClause, assetKind, transferDate, nblSurchargeExcluded, specialRateBasis } = input;
  if (specialRateBasis) return SPECIAL_RATE_BASIS_CODE[specialRateBasis];
  if (!rateClause) return undefined;

  const after20210601 = !!transferDate && transferDate >= RATE_2021_06_01;
  const housingLike = isHousingLike(assetKind) || landTakingHousingShortRate(input, after20210601);

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
      if (input.nonBusinessLandShortTerm) return "1-36"; // ⑪ 1년 미만 보유 비사업용토지 (50%)
      if (isPresaleRight(assetKind)) return after20210601 ? "1-46" : "1-20"; // ’21.6.1. 전 분양권 = 부동산에 관한 권리 ③
      if (housingLike && input.surchargeShortTermClause) return surchargeShortTermCode(input, input.surchargeShortTermClause, rateClause);
      if (housingLike) return after20210601 ? "1-46" : "1-40";
      return "1-20";
    case "104-1-2": // 1년 이상 2년 미만
      if (input.nonBusinessLandShortTerm) return "1-35"; // ⑩ 1년 이상 2년 미만 보유 비사업용토지 (40%)
      if (isPresaleRight(assetKind)) return after20210601 ? "1-23" : "1-15"; // ⑦(1-23)이 1년 이상 전체를 덮는다 · 그 전은 ②
      if (housingLike && input.surchargeShortTermClause) return surchargeShortTermCode(input, input.surchargeShortTermClause, rateClause);
      if (housingLike) return after20210601 ? "1-39" : undefined;
      return "1-15";

    // ⑱ 조정대상지역 내 분양권(’18.1.1.~’21.5.31.) — 50%
    case "104-1-4":
      return "1-21";

    // ⑲·㉗ 조정대상지역 1세대2주택 중과 · ㉑·㉚ 주택과 조합원입주권 또는 분양권 각 1개
    // ㉓·㉝ 조정대상지역 1세대3주택 이상 중과 · ㉕·㊱ 주택과 조합원입주권 또는 분양권 합 3 이상
    case "104-7-1":
    case "104-7-3":
      return SURCHARGE_CODE[after20210601 ? "after20210601" : "before20210601"][householdColumn(input)][rateClause];

    // ① 일반세율 — 다만 분양권 2년 이상은 호가 1호이되 단일 60%라 코드가 다르다(⑦ 1-23). ’21.6.1. 전 분양권은 ① 그대로.
    case "104-1-1":
      if (isPresaleRight(assetKind)) return after20210601 ? "1-23" : "1-10";
      return "1-10";
  }
}
