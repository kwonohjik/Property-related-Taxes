/**
 * 증여받은 주택의 「증여자와 계속 같은 세대」 사실과 그에 따른 기준일 — **단일 leaf**
 * (1세대1주택 코드 리뷰 결정 #33 G4-1 · #34 G4-2 · #38 G4-5)
 *
 * ## 무엇을 정하는가
 *
 * 증여받은 주택의 §154① 비과세 판정은 **증여자와의 세대 관계**에 따라 기준일이 갈린다.
 *
 * | 사실 | 보유기간 기산 | 「취득 당시」 조정대상지역 | 2017.8.3. 경과규정 |
 * |---|---|---|---|
 * | 증여일부터 양도일까지 **계속 같은 세대** | 세대가 보유를 시작한 날(통산) | 세대 보유 시작일**과** 증여일 **둘 다** 지정 중일 때만 거주요건 | 세대 보유 시작일 |
 * | 별도 세대(또는 중간에 세대 분리) | 증여일 | 증여일 | 증여일 |
 * | **미확인** | 증여일 | 증여일·증여자 취득일 **어느 하나라도** 지정 중이면 거주요건 | 증여일(늦은 날) |
 *
 * - 미확인은 어느 방향이든 유리하게 읽지 않는다(원칙 1 — 모름 = 혜택 불성립).
 * - 같은 세대 확인 시 「둘 다 지정 중일 때만」인 이유(결정 #38 하위 2 가): 세대 보유 시작일에는 지정 중이었으나 해제된 뒤 증여한 주택(거울상)
 *   은 정면 해석이 없어 근거 없이 불리하게 바꾸지 않는다 — 증여일 기준을 유지한다. 반대 방향(세대 보유 시작일에 비지정, 증여일에 지정 중)은
 *   세대 당초 취득일을 본다(결정 #33). 거울상이 결론을 가르면 확인 필요를 고지한다.
 *
 * ## 근거 (원문 확인분만)
 *
 * - 「소득세법 시행령」 제162조제1항제5호: 증여 취득시기는 「증여를 받은 날」 — 별도세대는 증여일.
 * - 「소득세법」 제88조제6호: 1세대는 거주자와 그 배우자가 구성하는 가족단위 — 배우자는 혼인 중이면 같은 세대.
 * - 조심 2022서7583(2023.3.16.): 보유기간도 「양도인 세대」가 보유한 기간으로 해석 — 이월과세를 적용하지 않아도 통산.
 * - 별도세대 증여는 증여일, 혼인 유지 배우자는 세대 당초 취득일이라는 국세청 회신(사전-2023-법규재산-0444 ·
 *   사전-2026-법규재산-0353 · 서면-2022-부동산-1182)은 리뷰 결정 #33이 인용한 것으로 **본문은 이 저장소에서 확인하지 못했다**
 *   — 문언 근거(위 두 조문)로 설계하고 회신 세부는 확인 필요로 둔다.
 *
 * ## 쓰는 곳 — 이 파일 밖에서 날짜를 따로 고르지 않는다
 *
 * `transfer-tax-exemption-holding.ts`(보유 기산 · 조정 판정 · 경과규정) · `transfer-tax-carryover.ts`(A/B 입력) ·
 * 주택 수 제외 특례의 취득일(D4-05, `resolveHouseCountExclusionDate`).
 *
 * ⚠️ 통산은 §154① 비과세 판정에만 쓴다. 장기보유특별공제와 §104② 세율 보유기간은 증여일 기준을 유지한다
 *    (결정 #38 조건). §155② 상속주택 특례로는 넓히지 않는다.
 */

import type { TransferTaxInput } from "../types/transfer.types";

/** 증여받은 주택의 세대 사실 — 엔진 입력(`TransferTaxInput.giftHouseholdBasis`). */
export interface GiftHouseholdBasis {
  /** 수증자가 증여받은 날(증여 등기접수일·증여일). 시행령 §162①5호의 취득시기. */
  giftDate: Date;
  /** 증여자가 이 주택을 취득한 날. */
  donorAcquisitionDate: Date;
  /**
   * 증여일부터 양도일까지 증여자와 **계속 같은 세대**였는가.
   * 배우자는 법 §88 6호 기준 혼인 유지(사실상 이혼이 아님), 그 밖의 친족은 같은 주소·생계 계속.
   * **undefined = 미확인**(API 직접 호출·옛 이력) — 유리하게 읽지 않는다.
   */
  continuousSameHousehold?: boolean;
  /** 세대가 이 주택 보유를 시작한 날(증여자 취득일 이후 혼인·합가한 경우 그 날). `continuousSameHousehold === true`일 때만 의미가 있다. */
  householdHoldingStartDate?: Date;
  /**
   * 보유기간 기산이 이미 증여자 취득일로 옮겨진 입력인가 — 이월과세 시나리오 A(법 §95④ 단서).
   * 이 입력에서는 보유 기산을 건드리지 않고 「취득 당시」 기준일만 옮긴다.
   */
  holdingAlreadyAtDonor?: boolean;
  /**
   * 증여자가 양도 전에 사망했는가 — 통산하지 않고 계산하며 확인 필요를 고지한다(정면 해석 없음).
   * true이면 `continuousSameHousehold`와 무관하게 통산하지 않는다.
   */
  donorDeceased?: boolean;
  /**
   * **반사실 판정 전용** — 같은 세대 확인 시 「취득 당시」 조정대상지역을 증여일을 섞지 않고 세대 보유 시작일만으로 본다(거울상을 세대
   * 취득일로 읽는 쪽). 확인 필요 고지가 「거울상이 결론을 가르는가」를 알아내는 데에만 쓴다 — 입력 경로가 없다.
   */
  householdDateStrict?: boolean;
}

/**
 * 통산이 **성립한** 경우의 세대 보유 시작일. 아니면 undefined.
 *
 * 성립 조건: 계속 같은 세대 확인 + 시작일 입력 + 증여자 취득일 ≤ 시작일 < 증여일.
 * 시작일이 범위 밖이면 입력 오류이므로(⑧이 막는다) 통산하지 않고 미확인으로 본다.
 */
export function giftHouseholdConsolidationStart(b: GiftHouseholdBasis | undefined): Date | undefined {
  if (!b || b.donorDeceased === true || b.continuousSameHousehold !== true) return undefined;
  const s = b.householdHoldingStartDate;
  if (!s) return undefined;
  if (s.getTime() < b.donorAcquisitionDate.getTime()) return undefined;
  if (s.getTime() >= b.giftDate.getTime()) return undefined;
  return s;
}

/** 「계속 같은 세대」가 **아니라고 확인**된 경우(별도세대·세대 분리·증여자 사망). 통산하지 않는다. */
export function giftHouseholdConfirmedSeparate(b: GiftHouseholdBasis | undefined): boolean {
  return !!b && (b.donorDeceased === true || b.continuousSameHousehold === false);
}

/** 세대 관계가 미확인인가 — 통산 여부를 모르는 상태(`true`인데 시작일이 없거나 범위 밖인 경우 포함). */
export function giftHouseholdUnconfirmed(b: GiftHouseholdBasis | undefined): boolean {
  return !!b && !giftHouseholdConfirmedSeparate(b) && giftHouseholdConsolidationStart(b) === undefined;
}

/**
 * §154① **보유기간 기산일 override** — 통산이 성립하고 보유 기산이 아직 증여일인 입력에서만.
 * 이월과세 시나리오 A(`holdingAlreadyAtDonor`)는 이미 증여자 취득일이라 건드리지 않는다.
 */
export function giftHouseholdHoldingStart(b: GiftHouseholdBasis | undefined): Date | undefined {
  if (b?.holdingAlreadyAtDonor) return undefined;
  return giftHouseholdConsolidationStart(b);
}

/**
 * 「취득 당시」 기준일 — 거주요건의 취득 당시 조정대상지역 판정일 후보들과 2017.8.3. 경과규정 기준일.
 *
 * - `mode: "any"`  — 후보 중 **어느 하나라도** 지정 중이면 거주요건 적용(확인된 별도세대는 후보가 증여일 하나라 같은 말이다).
 * - `mode: "all"`  — 후보가 **모두** 지정 중일 때만 거주요건 적용(같은 세대 확인 — 위 거울상 규칙).
 * - 통산 성립: 후보 [세대 보유 시작일, 증여일] · all / 경과규정 기준일은 세대 보유 시작일.
 * - 확인된 별도세대: [증여일] / 증여일.
 * - 미확인: [증여일, 증여자 취득일] · any / 경과규정 기준일은 늦은 날(증여일).
 */
export function resolveGiftResidenceDates(b: GiftHouseholdBasis): {
  judgmentDates: Date[];
  mode: "any" | "all";
  transitionDate: Date;
} {
  const start = giftHouseholdConsolidationStart(b);
  if (start) {
    return b.householdDateStrict
      ? { judgmentDates: [start], mode: "any", transitionDate: start }
      : { judgmentDates: [start, b.giftDate], mode: "all", transitionDate: start };
  }
  if (giftHouseholdConfirmedSeparate(b)) return { judgmentDates: [b.giftDate], mode: "any", transitionDate: b.giftDate };
  const donorEarlier = b.donorAcquisitionDate.getTime() < b.giftDate.getTime();
  return {
    judgmentDates: donorEarlier ? [b.giftDate, b.donorAcquisitionDate] : [b.giftDate],
    mode: "any",
    transitionDate: b.giftDate,
  };
}

/**
 * §99의4①·§98의9①의 「그 주택 취득 **전에 보유하던** 다른 주택」 판정용 일반주택 취득일 (D4-05).
 *
 * 세대 연속이 **확인된** 경우에만 세대 보유 시작일을 쓴다. 미확인(배우자 포함)·별도세대는 양도자 본인의 취득일이다 —
 * 종전에는 배우자 증여면 사실 확인 없이 증여자 취득일을 썼으나, 양도 전에 이혼한 배우자까지 세대로 보게 되므로
 * 사실이 입력으로 확인될 때만 쓴다(결정 #33).
 */
export function resolveHouseCountExclusionDate(
  acquisitionDate: Date,
  basis: GiftHouseholdBasis | undefined,
): Date {
  return giftHouseholdConsolidationStart(basis) ?? acquisitionDate;
}

/**
 * 이월과세 입력에서 세대 사실을 뽑는다 — 시나리오 A/B 입력과 D4-05가 같은 사실을 본다.
 * @param holdingAlreadyAtDonor 시나리오 A(보유 기산이 증여자 취득일)면 true
 */
export function carryoverGiftHouseholdBasis(
  ct: Pick<
    NonNullable<TransferTaxInput["carryoverTaxation"]>,
    | "giftRegistryDate"
    | "donorAcquisitionDate"
    | "donorSameHouseholdContinuous"
    | "donorHouseholdHoldingStartDate"
    | "donorDeceased"
  >,
  holdingAlreadyAtDonor: boolean,
): GiftHouseholdBasis {
  return {
    giftDate: ct.giftRegistryDate,
    donorAcquisitionDate: ct.donorAcquisitionDate,
    continuousSameHousehold: ct.donorSameHouseholdContinuous,
    householdHoldingStartDate: ct.donorHouseholdHoldingStartDate,
    donorDeceased: ct.donorDeceased === true ? true : undefined,
    ...(holdingAlreadyAtDonor ? { holdingAlreadyAtDonor: true } : {}),
  };
}
