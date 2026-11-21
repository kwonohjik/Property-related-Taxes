/**
 * 함께 양도 × 부수토지 카드 — 짝 주택의 다주택 중과(§104⑦) 판정을 카드가 따른다.
 *
 * 「소득세법」 §104⑦은 「주택(이에 딸린 토지를 포함한다)을 양도하는 경우」에 중과를 걸고, §95②은 「같은 조 제7항 각 호에 따른 자산」을 장기보유특별공제에서 뺀다.
 * 부수토지 카드는 `propertyType: "land"`라 자산 게이트(`SURCHARGE_SUBJECT_PROPERTY_TYPES`)에 걸리지 않아 이 둘을 받지 못했다 — 같은 사실을 한 카드로 합쳐 입력한 값과 갈렸다.
 * 카드는 짝 주택이 푼 판정(`SurchargeApplication`)을 verdict로 받아 **그대로** 따른다(재판정 금지 — 이중 진실). 다른 세대 토지만 본인은 짝 주택의 판정이 이미 «중과 없음»이다.
 * 계획서 `docs/02-design/features/bundled-appurtenant-card-multi-house-surcharge.plan.md`.
 */
import { appurtenantCardHoldingStart } from "./appurtenant-card-holding-start";
import { resolveShortTermRate } from "./data/short-term-rate-history";
import { MULTI_HOUSE_SURCHARGE_START_DATE } from "./data/multi-house-surcharge-rate-history";
import type { SurchargeApplication } from "./transfer-tax-surcharge-predicate";
import type { TransferTaxInput } from "./types/transfer.types";

const NOTICE_HEAD =
  "함께 양도한 부수토지 카드 — 짝 주택이 다주택 중과(「소득세법」 §104⑦) 대상이라 「주택(이에 딸린 토지를 포함한다)」인 이 부수토지에도 ";
/** §95② 본문 괄호 원문 — «제104조제3항에 따른 미등기양도자산과 같은 조 제7항 각 호에 따른 자산은 제외한다» */
const NOTICE_LTHD = "장기보유특별공제는 배제했습니다(§95② 본문 괄호 「같은 조 제7항 각 호에 따른 자산」 제외 — §104⑦ 각 호 자산).";
/** §104①2·3호 괄호의 주택 — «주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다…)» */
const NOTICE_LAND_AS_HOUSING = "부수토지도 주택(이에 딸린 토지로서 대통령령으로 정하는 토지를 포함한다)이므로";

export const APPURTENANT_CARD_SURCHARGE_NOTICE =
  NOTICE_HEAD +
  `중과 규정(§104⑦ 세율·보유기간 2년 미만 세율 비교)을 적용하고 ${NOTICE_LTHD} ` +
  `보유기간이 2년 미만이면 비교하는 §104①2·3호 세율은 ${NOTICE_LAND_AS_HOUSING} 주택 단기세율(1~2년 60% · 1년 미만 70%)입니다.`;

/**
 * 짝 주택의 중과가 장특 배제(§95②)에만 걸리고 세율은 기본세율인 카드 — 위기취득(부칙 제9270호 §14①) 등 세율 축만 빠진 판정
 * (`SurchargeApplication.isRateSurchargeApplied === false`). 카드 세율도 짝 주택처럼 중과하지 않는다(`appurtenantCardFollowsSurchargeRate`).
 */
export const APPURTENANT_CARD_SURCHARGE_LTHD_ONLY_NOTICE =
  NOTICE_HEAD + `${NOTICE_LTHD} 세율은 짝 주택과 같이 §104⑦ 중과 세율을 적용하지 않았습니다.`;

/**
 * 양도일 시행본에 맞춘 고지 문구 — §104⑦ 후단의 비교 범위가 시행일마다 다르다(「소득세법」 시행본 실독):
 *   - 2021.6.1. 이후: «보유기간이 2년 미만인 경우 … 제1항제2호 또는 제3호의 세율»(주택 1~2년 60% · 1년 미만 70%) = 위 상수
 *   - 2018.4.1.~2021.5.31.: «보유기간이 1년 미만인 경우 … 제1항제3호의 세율»(주택 40%) — 1~2년은 §104①2호가 주택을 제외해 비교할 단기세율이 없다
 * 주택 단기세율은 세율 계산(`calcTax` → `resolveShortTermRate` `housing_or_right`)과 같은 표에서 읽는다 — 문구와 세액이 갈리지 않게.
 * 2018.4.1. 전 양도분에는 호출부가 고지하지 않는다(§104⑦ 시행 전 — `appurtenantCardSurchargeNotice`).
 */
export function appurtenantCardSurchargeNoticeText(transferDate: Date): string {
  const under12 = resolveShortTermRate(transferDate, 0, "housing_or_right").rate;
  const under24 = resolveShortTermRate(transferDate, 12, "housing_or_right").rate;
  if (under12 === 0.7 && under24 === 0.6) return APPURTENANT_CARD_SURCHARGE_NOTICE;
  const pct = (r: number) => `${(r * 100).toFixed(0)}%`;
  if (under12 !== null && under24 === null) {
    return (
      NOTICE_HEAD +
      `중과 규정(§104⑦ 세율·보유기간 1년 미만 세율 비교)을 적용하고 ${NOTICE_LTHD} ` +
      `보유기간이 1년 미만이면 비교하는 §104①3호 세율은 ${NOTICE_LAND_AS_HOUSING} 주택 세율(1년 미만 ${pct(under12)})입니다.`
    );
  }
  return NOTICE_HEAD + `중과 규정(§104⑦ 세율)을 적용하고 ${NOTICE_LTHD}`;
}

type CardArg = Pick<TransferTaxInput, "oneHouseUnitRole" | "appurtenantHouseVerdict" | "transferDate">;

/** 배율 이내로 확인된 부수토지 카드가 짝 주택에서 받은 중과 판정 — 카드가 아니거나 verdict 미주입이면 `undefined`(종전). */
export function appurtenantCardHouseSurcharge(input: CardArg): SurchargeApplication | undefined {
  return input.oneHouseUnitRole === "appurtenant_land" ? input.appurtenantHouseVerdict?.houseSurcharge : undefined;
}

/** 세율 축 — 짝 주택에 중과 세율이 걸리는 카드(일체과세 분기를 끄고 §104⑦ 경로를 탄다). */
export function appurtenantCardFollowsSurchargeRate(input: CardArg): boolean {
  return appurtenantCardHouseSurcharge(input)?.isRateSurchargeApplied === true;
}

/**
 * §104⑦ 후단(보유기간 2년 미만이면 중과 세율과 §104①2·3호 세율 중 큰 세액)의 보유기간은 «주택부수토지로서»의 보유다 — `max(카드 취득일, 짝 주택 취득일, 합가일)`부터
 * (`appurtenantCardHoldingStart`). 카드가 짝 주택·합가일보다 이르거나 같으면 짝 주택 취득일(합가일이 늦으면 합가일)이고, 늦게 취득된 카드는 카드 취득일이다
 * — 일체과세 분기(T-1.5)·장특 표2와 같은 시작일이다(계획서 `bundled-appurtenant-card-later-land-holding.plan.md` Q-2 a).
 */
export function appurtenantCardSurchargeRateInput(input: TransferTaxInput): TransferTaxInput {
  const v = input.appurtenantHouseVerdict;
  if (!v || !appurtenantCardFollowsSurchargeRate(input)) return input;
  return { ...input, acquisitionDate: appurtenantCardHoldingStart(v, input.acquisitionDate) };
}

/**
 * 중과가 실제로 걸리는 짝 주택의 부수토지 카드(한시 배제 중이 아닌)에만 — 값이 바뀌는 조합에서만 말한다.
 * §104⑦ 시행(2018.4.1.) 전 양도분은 말하지 않는다 — 판정 술어의 fallback(조정대상지역 · 주택 수 2 이상)에는 양도일 조건이 없고(시행일 게이트는 세율 층 `resolveSurchargeAddonRate`),
 * 그 시기 카드는 중과 세율도 장특 배제도 받지 않는다(그때 §95② 괄호에 §104⑦ 자산이 없다).
 */
export function appurtenantCardSurchargeNotice(input: CardArg): string | undefined {
  const h = appurtenantCardHouseSurcharge(input);
  if (h?.isSurchargeApplied !== true || input.transferDate < new Date(MULTI_HOUSE_SURCHARGE_START_DATE)) return undefined;
  return h.isRateSurchargeApplied ? appurtenantCardSurchargeNoticeText(input.transferDate) : APPURTENANT_CARD_SURCHARGE_LTHD_ONLY_NOTICE;
}
