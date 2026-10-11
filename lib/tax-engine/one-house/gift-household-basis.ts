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
 * - 국세청 회신 원문(국세법령정보시스템에서 본문 확인 — 2026-10-12. 0444·0353·1182·463·445·350은 본문을 직접 읽었고, 2198·2097·912·921·1818·34는
 *   그 본문의 「관련 예규」란에 실린 요지로 확인했다):
 *   · 사전-2023-법규재산-0444 · 사전-2026-법규재산-0353: 별도세대에게 증여한 주택은 이월과세가 적용돼도 취득시기가 「증여를 받은 날」이고
 *     그 날로 영 §154① 거주요건 적용 여부를 판정한다.
 *   · 서면5팀-350 · 서면5팀-2198 · 서면4팀-2097 · 서면4팀-912: 동일세대원 간 증여는 증여자의 보유기간(서면4팀-912는 거주기간까지)을 통산하고,
 *     **양도일 현재 가족관계가 해소된 경우에는 증여를 받은 날**부터 센다.
 *   · 서면5팀-463 · 서면5팀-921(2007.3.21.) · 서면5팀-1818 · 서면4팀-34: 배우자에게 증여한 뒤 이혼하면 증여일부터 센다. 이혼 후 같은 배우자와
 *     재결합한 경우도 보유기간 기산일은 증여를 받은 날이다(463·921). 반면 재산세과-445(2009)는 재결합 사안에서 5년 이내 배우자 증여의
 *     보유 기산일을 증여자 취득일이라고 답했다 — 법 §95④ 단서(이월과세) 사안이라 시나리오 A의 보유 기산과 같은 말이다. 재결합의 세대 통산은
 *     정면 해석이 갈리므로 「아니오」로 계산하고 확인 필요를 둔다(결정 #34).
 *   · 서면-2022-부동산-1182: 조정대상지역 지정 전에 부부 공동명의로 취득한 주택의 본인 지분을 지정 후 배우자에게 증여해도 거주요건을 적용하지
 *     않는다 — 혼인 유지 배우자는 세대의 당초 취득 시점으로 읽는다. **지분** 증여 사안이라 주택 전부 증여의 정면 해석은 아니다.
 *   「같은 세대」 기준 시점은 위 회신들의 「양도일 현재」 문언과 증여 후 이혼·재결합 회신을 합쳐 「증여일부터 양도일까지 계속」으로 읽는다
 *   (결정 #34 하위 1 나). 혼인·합가 전에 취득한 주택의 통산 시작일, 주택 전부를 증여한 경우, 세대 당초 취득 때 지정 지역이던 주택을
 *   해제된 뒤 증여한 경우(거울상)는 정면 해석을 확인하지 못해 확인 필요로 둔다.
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
    | "donorRelation"
  >,
  holdingAlreadyAtDonor: boolean,
): GiftHouseholdBasis {
  return {
    giftDate: ct.giftRegistryDate,
    donorAcquisitionDate: ct.donorAcquisitionDate,
    // 관계 「그 외」는 이 질문을 묻지 않는다(결정 #34 — 입력 경로 없음, ⑤·⑧·④와 같은 술어). 답이 없는 채로 미확인(any-mode 보수 판정 +
    // 「입력되지 않아」 고지)으로 읽으면 사용자가 풀 수 없는 막다른 고지에 세액만 오른다 — 증여 취득시기의 본칙(영 §162①5호, 증여를 받은 날)대로
    // 별도 세대로 읽는다. 호출자가 명시로 답한 값(API 직접 호출)은 그대로 존중한다.
    continuousSameHousehold:
      ct.donorSameHouseholdContinuous ?? (ct.donorRelation === "other" ? false : undefined),
    householdHoldingStartDate: ct.donorHouseholdHoldingStartDate,
    donorDeceased: ct.donorDeceased === true ? true : undefined,
    ...(holdingAlreadyAtDonor ? { holdingAlreadyAtDonor: true } : {}),
  };
}
