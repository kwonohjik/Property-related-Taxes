/**
 * 증여받은 주택의 「증여자와 계속 같은 세대」 사실 — **확인 필요 고지 문구와 결론 가름 게이트의 단일 leaf** (결정 #33·#34·#38 · #38 후속 겸용)
 *
 * 단건 판정(`era-undetermined.ts` `collectEraUndetermined` · `era-notice-relevance.ts`)과 겸용 엔진
 * (`transfer-tax-mixed-use-exemption.ts` — 결과에 판정 보류 칸이 없어 경고로 싣는다)이 **같은 문구·같은 반사실 규칙**을 쓴다.
 * 판정 날짜는 여기서 고르지 않는다 — `gift-household-basis.ts`가 정한다.
 */
import type { TransferTaxInput } from "../types/transfer.types";
import {
  giftHouseholdConfirmedSeparate,
  giftHouseholdConsolidationStart,
  giftHouseholdUnconfirmed,
  type GiftHouseholdBasis,
} from "./gift-household-basis";

/** 증여받은 주택의 증여자와 같은 세대 여부가 미확인이라 보수적으로 판정했고, 그 확인이 비과세 결론을 가른다 (결정 #33·#34·#38). */
export const GIFT_HOUSEHOLD_UNCONFIRMED_ID = "gift-household-continuity-unconfirmed";
/** 같은 세대 통산을 적용했는데 정면 해석 없는 세부(통산 시작일·주택 전부 증여·「취득 당시」 이동)가 결론을 가른다. */
export const GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID = "gift-household-consolidation-detail-unverified";
/**
 * 증여자와의 세대 사실이 엔진에 오지 않아 통산을 반영하지 못했다 — 통산하면 결론이 달라질 수 있다. 판정 메뉴와 계산기 단건 첫 자산은 그 칸을
 * 필수로 받으므로(결정 #38-1) 이 고지는 세대 사실을 받지 않는 경로에서 난다 — 건물만 증여받은 주택(D2) · 함께 양도하는 두 번째 이후 자산 ·
 * 다건 계산(#38-3 범위 밖) · 사실 없이 부른 API. 문구는 그 경로들을 그대로 적는다(「이 화면은 입력받지 않아」·「판정 메뉴에서 입력」은
 * D2처럼 판정 메뉴에도 칸이 없는 경로에서 틀린다).
 */
export const GIFT_HOUSEHOLD_NOT_REFLECTED_ID = "gift-household-not-reflected-unverified";
/** 증여자가 양도 전에 사망해 통산 없이 계산했고, 통산하면 결론이 달라진다. */
export const GIFT_HOUSEHOLD_DONOR_DECEASED_ID = "gift-household-donor-deceased-unverified";
/** 증여 뒤 이혼했다가 같은 사람과 재결합해 통산 없이 계산했고, 통산하면 결론이 달라진다 (결정 #34 조건 · #38-6). */
export const GIFT_HOUSEHOLD_REJOINED_ID = "gift-household-rejoined-unverified";

/**
 * 세대 사실 상태에 맞는 확인 필요 고지. 결론을 가르는지는 호출부가 `giftHouseholdFactDecides`로 따로 본다.
 * 사실이 없으면(`gift` 미전달) 증여 취득일 때만 「반영하지 못했다」를 낸다. 별도세대로 확인되면 고지가 없다.
 */
export function giftHouseholdNotice(
  gift: GiftHouseholdBasis | undefined,
  acquisitionCause: TransferTaxInput["acquisitionCause"],
): { id: string; reason: string } | undefined {
  return !gift
    ? acquisitionCause === "gift"
      ? {
          id: GIFT_HOUSEHOLD_NOT_REFLECTED_ID,
          reason:
            "증여받은 주택은 증여자와 증여일부터 양도일까지 계속 같은 세대였다면 증여자 세대의 보유기간을 통산하고 「취득 당시」도 세대가 보유를 " +
            "시작한 날로 보지만(조심 2022서7583), 이 계산에는 증여자와의 세대 관계가 입력되지 않아 증여일부터 보유기간을 세어 판정했습니다 — " +
            "같은 세대였다면 결론이 달라질 수 있으니 확인이 필요합니다. 세대 관계는 1세대1주택 판정 메뉴와 양도세 계산기 단건의 첫 번째 자산" +
            "(주택을 증여받은 경우)에서 입력받으며, 건물만 증여받은 주택·함께 양도하는 두 번째 이후 자산·다건 계산에서는 입력받지 않습니다.",
        }
      : undefined
    : gift.donorDeceased === true
      ? {
          id: GIFT_HOUSEHOLD_DONOR_DECEASED_ID,
          reason:
            "증여자가 양도 전에 사망한 경우 증여자 세대의 보유기간을 통산하는지에 대한 정면 해석은 확인하지 못했습니다. " +
            "통산 없이 증여일부터 보유기간을 세어 판정했으니, 증여 후 양도 전까지 증여자와 계속 같은 세대였다면 확인이 필요합니다.",
        }
      : gift.rejoinedAfterDivorce === true
        ? {
            id: GIFT_HOUSEHOLD_REJOINED_ID,
            reason:
              "증여 뒤 이혼했다가 같은 사람과 재결합한 경우 증여자 세대의 보유기간을 통산하는지에 대해서는 해석이 갈립니다 — " +
              "보유기간은 증여를 받은 날부터 센다는 회신(서면5팀-463·921)과 증여자의 취득일부터 센다는 회신(재산세과-445)이 있고 정면 해석은 확인하지 못했습니다. " +
              "통산 없이 증여일부터 보유기간을 세어 판정했으니, 통산하면 결론이 달라질 수 있어 확인이 필요합니다.",
          }
      : giftHouseholdConfirmedSeparate(gift)
        ? undefined
        : giftHouseholdUnconfirmed(gift)
          ? {
              id: GIFT_HOUSEHOLD_UNCONFIRMED_ID,
              reason:
                "증여자와 증여일부터 양도일까지 계속 같은 세대였는지(배우자는 혼인 유지) 입력되지 않아, 증여일부터 보유기간을 세고 " +
                "「취득 당시」 조정대상지역은 증여일과 증여자 취득일 중 어느 하나라도 지정 중이면 거주요건을 적용해 판정했습니다. " +
                "같은 세대였다면 증여자 세대의 보유기간이 통산되어 결론이 달라질 수 있으니 확인이 필요합니다.",
            }
          : {
              id: GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID,
              reason:
                "증여자와 계속 같은 세대였다는 입력에 따라 세대가 보유를 시작한 날부터 보유기간을 통산하고 그 날을 「취득 당시」로 보았습니다" +
                "(조심 2022서7583 — 보유기간은 양도인 세대 기준). 혼인·합가 전에 취득한 주택의 통산 시작일, 주택 전부를 증여한 경우, " +
                "거주요건이 새로 붙는 방향의 「취득 당시」 이동은 정면 해석을 확인하지 못해 확인이 필요합니다(세대가 보유를 시작한 날에는 조정대상지역이었다가 " +
                "해제된 뒤 증여한 주택은 증여일을 기준으로 보아 거주요건을 적용하지 않았습니다). 통산은 비과세 판정에만 쓰고 " +
                "장기보유특별공제(표2 대상 판정 포함)와 세율 보유기간은 증여일 기준으로 계산했습니다.",
            };
}

/**
 * 세대 사실을 바꾼 **반사실 판정**이 현재 판정(`base`)과 다른가 — 고지 게이트. `verdictOf`는 같은 입력에 세대 사실만 바꿔 다시 판정한 값이다.
 *
 * 반사실 입력은 세대 관계가 확정(통산 성립·별도세대)이라 이 고지를 다시 만들지 않는다 — 통산 성립 가정은 한 번 더 별도세대
 * 가정과 비교할 수 있으나 그 호출은 확정이므로 재귀 깊이가 2를 넘지 않는다.
 */
export function giftHouseholdFactDecides(
  g: GiftHouseholdBasis,
  base: string,
  verdictOf: (basis: GiftHouseholdBasis) => string,
): boolean {
  if (g.householdDateStrict) return false; // 반사실 입력은 고지를 만들지 않는다 — 재귀 차단
  const separate = (): string =>
    verdictOf({ ...g, donorDeceased: undefined, rejoinedAfterDivorce: undefined, continuousSameHousehold: false });
  // 통산 성립 가정 — 시작일을 모르면 증여자 취득일을 시작일로 둔다(세대 보유 시작일의 가장 이른 값).
  const consolidated = (): string | undefined =>
    g.donorAcquisitionDate.getTime() < g.giftDate.getTime()
      ? verdictOf({
          ...g,
          donorDeceased: undefined,
          rejoinedAfterDivorce: undefined,
          continuousSameHousehold: true,
          householdHoldingStartDate: giftHouseholdConsolidationStart(g) ?? g.donorAcquisitionDate,
        })
      : undefined;
  // 사망·재결합 — 통산하지 않고 계산했으므로 「통산했다면」 결론이 달라질 때만 고지한다.
  if (g.donorDeceased === true || g.rejoinedAfterDivorce === true) {
    const c = consolidated();
    return c !== undefined && c !== base;
  }
  // 통산 성립 — 별도세대 가정과 비교하고, 거울상(세대 보유 시작일에 지정 중 · 증여일에 비지정)을 세대 취득일로 읽는 가정(strict)과도 비교한다.
  if (giftHouseholdConsolidationStart(g)) {
    return separate() !== base || verdictOf({ ...g, householdDateStrict: true }) !== base;
  }
  if (giftHouseholdUnconfirmed(g)) {
    const c = consolidated();
    return separate() !== base || (c !== undefined && c !== base);
  }
  return false;
}
