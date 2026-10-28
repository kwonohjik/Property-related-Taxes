/**
 * 함께 양도 × 부수토지 카드 — 「주택부수토지로서」 보유 시작일.
 *
 * 카드가 짝 주택보다 **늦게 취득**된 토지면 그 토지는 취득 전에는 부수토지가 아니었다 — 「소득세법」 §95④(보유기간은 그 자산의 취득일부터 양도일까지)에 따라
 * 시작일은 `max(카드 취득일, 짝 주택 취득일, 합가일)`이다. 장특 표2 보유연수·단기세율 기산·§104⑦ 후단 비교가 모두 이 한 날짜를 쓴다
 * (주 카드의 분리취득 분기 · 같은 사실을 주택 카드 하나로 합쳐 입력한 값과 같아진다).
 * 계획서 `docs/02-design/features/bundled-appurtenant-card-later-land-holding.plan.md`.
 */
import type { TransferTaxInput } from "./types/transfer.types";

type HouseVerdict = NonNullable<TransferTaxInput["appurtenantHouseVerdict"]>;

function laterOf(a: Date, b: Date | undefined): Date {
  return b !== undefined && b.getTime() > a.getTime() ? b : a;
}

/** 짝 주택 쪽 시작일 — 합가일이 주택 취득일보다 늦으면 합가일(재산46014-610). */
export function appurtenantCardHouseStart(v: HouseVerdict): Date {
  return laterOf(v.houseAcquisitionDate, v.houseMergeDate);
}

/** 부수토지 카드의 「주택부수토지로서」 보유 시작일 = `max(카드 취득일, 짝 주택 취득일, 합가일)`. */
export function appurtenantCardHoldingStart(v: HouseVerdict, cardAcquisitionDate: Date | undefined): Date {
  const houseStart = appurtenantCardHouseStart(v);
  return cardAcquisitionDate === undefined ? houseStart : laterOf(houseStart, cardAcquisitionDate);
}

/**
 * 짝 주택보다 늦게 취득한 부수토지 카드에만 — 보유기간을 카드 취득일부터로 보았다는 고지. 다른 세대는 일반 토지라 이 기준이 값에 닿지 않아 말하지 않는다.
 * 토지가 주택보다 늦은 방향을 정면으로 다룬 해석은 찾지 못해 「확인이 필요합니다」를 병기한다(계획서 V-8 · Q-3 a).
 */
export function appurtenantCardLaterLandNotice(input: TransferTaxInput): string | undefined {
  const v = input.appurtenantHouseVerdict;
  if (input.oneHouseUnitRole !== "appurtenant_land" || !v || v.houseLandOnlyOtherHousehold === true) return undefined;
  if (input.acquisitionDate.getTime() <= appurtenantCardHouseStart(v).getTime()) return undefined;
  return (
    `함께 양도한 부수토지 카드 — 이 토지(${input.acquisitionDate.toISOString().slice(0, 10)} 취득)가 짝 주택(${appurtenantCardHouseStart(v).toISOString().slice(0, 10)}부터 보유)보다 ` +
    "늦게 취득돼, 주택부수토지로서의 보유기간을 짝 주택이 아니라 카드 취득일부터로 보아 장기보유특별공제 표2 보유연수·단기세율 보유기간을 판정했습니다" +
    "(「소득세법」 §95④ 「그 자산의 취득일부터 양도일까지」). 토지가 주택보다 늦게 취득된 경우를 정면으로 다룬 해석은 확인하지 못해 확인이 필요합니다."
  );
}
