/**
 * 함께 양도 × 부수토지 카드 — 짝 주택의 다주택 중과(§104⑦) 판정을 카드가 따른다.
 *
 * 「소득세법」 §104⑦은 「주택(이에 딸린 토지를 포함한다)을 양도하는 경우」에 중과를 걸고, §95②은 「같은 조 제7항 각 호에 따른 자산」을 장기보유특별공제에서 뺀다.
 * 부수토지 카드는 `propertyType: "land"`라 자산 게이트(`SURCHARGE_SUBJECT_PROPERTY_TYPES`)에 걸리지 않아 이 둘을 받지 못했다 — 같은 사실을 한 카드로 합쳐 입력한 값과 갈렸다.
 * 카드는 짝 주택이 푼 판정(`SurchargeApplication`)을 verdict로 받아 **그대로** 따른다(재판정 금지 — 이중 진실). 다른 세대 토지만 본인은 짝 주택의 판정이 이미 «중과 없음»이다.
 * 계획서 `docs/02-design/features/bundled-appurtenant-card-multi-house-surcharge.plan.md`.
 */
import { appurtenantCardHoldingStart } from "./appurtenant-card-holding-start";
import type { SurchargeApplication } from "./transfer-tax-surcharge-predicate";
import type { TransferTaxInput } from "./types/transfer.types";

export const APPURTENANT_CARD_SURCHARGE_NOTICE =
  "함께 양도한 부수토지 카드 — 짝 주택이 다주택 중과(「소득세법」 §104⑦) 대상이라 「주택(이에 딸린 토지를 포함한다)」인 이 부수토지에도 " +
  "중과 규정(§104⑦ 세율·보유기간 2년 미만 세율 비교)을 적용하고 장기보유특별공제는 배제했습니다(§95② 본문 「제104조제7항 각 호에 따른 자산」 제외).";

type CardArg = Pick<TransferTaxInput, "oneHouseUnitRole" | "appurtenantHouseVerdict">;

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

/** 중과가 실제로 걸리는 짝 주택의 부수토지 카드(한시 배제 중이 아닌)에만 — 값이 바뀌는 조합에서만 말한다. */
export function appurtenantCardSurchargeNotice(input: CardArg): string | undefined {
  return appurtenantCardHouseSurcharge(input)?.isSurchargeApplied === true ? APPURTENANT_CARD_SURCHARGE_NOTICE : undefined;
}
