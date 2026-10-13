/**
 * ⑭ 증여받은 주택의 「증여자와 계속 같은 세대」 사실 — Zod 통과 본문 → 엔진 `giftHouseholdBasis` (결정 #38).
 * 단건(`app/api/calc/transfer/engine-input.ts`)·다건(`multi/route.ts`)이 **같은 함수**를 쓴다 — 한쪽만 매핑하면 그 경로에서
 * 사실이 침묵 strip되어 통산이 빠진다(결정 #38-3: 다건이 이 매핑을 갖지 않아 같은 입력이 단건 0 · 다건 229,075,000이었다).
 *
 * **답한 경우에만** 만든다 — 칸이 없는 경로(건물만 증여받은 주택 D2 · 함께 양도하는 두 번째 이후 자산 · 사실 없이 부른 API)는 미전송이고,
 * 그때는 종전 판정(증여일 기준)에 엔진이 확인 필요를 고지한다. 증여자 취득일 없이는 만들 수 없다.
 * 날짜는 JSON 경유로 string이 되므로 `toDate`·`toOptionalDate`로 바꾼다(`lib/api/date-coerce.ts`).
 */
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";

export function mapGiftHouseholdBasis(src: {
  acquisitionCause?: string;
  acquisitionDate: string | Date;
  donorAcquisitionDate?: string | Date;
  giftSameHouseholdContinuous?: boolean;
  giftHouseholdHoldingStartDate?: string | Date;
  /** 결정 #38-7 — 증여 전 동일세대 거주 개월. 미전송 = 미답(통산 없이 판정, 결론을 가를 때만 엔진이 확인 필요 고지) · 0 = 거주한 적 없음. */
  giftPriorHouseholdResidenceMonths?: number;
  /** 결정 #38-6 — 증여자 사망. 「계속 같은 세대」를 묻지 않고 통산 없이 계산한다(엔진이 확인 필요 고지). */
  giftDonorDeceased?: boolean;
  /** 결정 #38-6 — 이혼 후 재결합(배우자). 「아니오」로 계산하고 통산하면 결론이 갈릴 때만 엔진이 확인 필요 고지. */
  giftRejoinedAfterDivorce?: boolean;
}): GiftHouseholdBasis | undefined {
  if (src.acquisitionCause !== "gift" || !src.donorAcquisitionDate) return undefined;
  if (src.giftSameHouseholdContinuous === undefined && src.giftDonorDeceased !== true && src.giftRejoinedAfterDivorce !== true) return undefined;
  return {
    giftDate: toDate(src.acquisitionDate, "acquisitionDate"),
    donorAcquisitionDate: toDate(src.donorAcquisitionDate, "donorAcquisitionDate"),
    continuousSameHousehold: src.giftSameHouseholdContinuous,
    householdHoldingStartDate: toOptionalDate(src.giftHouseholdHoldingStartDate),
    priorHouseholdResidenceMonths: src.giftPriorHouseholdResidenceMonths,
    donorDeceased: src.giftDonorDeceased === true ? true : undefined,
    rejoinedAfterDivorce: src.giftRejoinedAfterDivorce === true ? true : undefined,
  };
}
