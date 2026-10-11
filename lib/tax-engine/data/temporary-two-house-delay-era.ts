/**
 * 「소득세법 시행령」 §155⑱ 처분기한 예외 사유 — **양도일 연혁** (S15-14)
 * (개정 없는 확정 역사 데이터. 정적 상수 — `temporary-two-house-deadline-era.ts`와 같은 규약.)
 *
 * §155① 본문 괄호 「(제18항에 따른 사유에 해당하는 경우를 포함한다)」가 가리키는 ⑱은 처분기한(3년 등)을 넘겨도 §155①을 적용하는
 * 사유를 정한다. 종전 구현은 양도일 연혁 없이 현행 문언(사유 해당만으로 충분)을 전 구간에 적용했다. 원문은 아래와 같다
 * (법제처 DRF · KoreanLaw MCP 실독 2026-10-11).
 *
 * ## ① 「그 방법으로 양도」 요건 — 2022.2.15. 전 양도분
 *
 * 2017.2.3.~2022.2.14. 시행본 ⑱(MST 191522 · 214261 · 229391):
 * > 법 제89조제1항제4호나목에서 "대통령령으로 정하는 사유"란 다른 주택을 취득한 날부터 3년이 되는 날 현재 다음 각 호의 어느 하나에
 * > 해당하는 경우로서 **해당 각 호의 매각 등의 방법으로 양도하는 경우**를 말한다.
 *
 * 대통령령 제32420호(2022.2.15. 공포·시행, MST 240311)가 이 문구를 삭제했다(「…해당하는 경우를 말한다」). 부칙 제2조②는
 * 「양도소득세에 관한 개정규정은 … 시행일 이후 양도하는 경우부터 적용한다」이다 ⇒ **양도일이 2022-02-15 이후면 사유 해당만으로**,
 * 그 전이면 **사유 해당 + 그 방법으로 양도** 둘 다 필요하다.
 *
 * 2017.2.3. 전에는 ⑱이 없었고 §155①이 「기획재정부령(재정경제부령)으로 정하는 사유」를 가리켰다. 「소득세법 시행규칙」 §72①(2002.2.1. ·
 * 2009.9.2. · 2011.8.3. · 2012.2.28. · 2016.3.16. 시행본 실독)이 같은 구조다 — 「…다음 각 호의 어느 하나에 해당하는 경우로서
 * 해당 각 호의 어느 하나의 방법에 따라 양도된 경우」. 이 요건이 실독으로 확인된 가장 이른 시행본이 2002.2.1.이라 그 전 양도분에는
 * 요건을 단정하지 않는다(법적 근거 없이 불리하게 적용하지 않는다).
 *
 * ## ② 호별 신설 시기 — 양도일 기준
 *
 * | 호 | 사유 | 신설 | 근거 |
 * |---|---|---|---|
 * | 1~3호 | 한국자산관리공사 매각 의뢰 · 법원 경매 신청 · 공매 진행 중 | 실독한 전 구간 | 규칙 §72① 1~3호 |
 * | 4호 | 정비사업 현금청산금 지급 소송 | 2012.2.28. | 규칙 제265호(2012.2.28.) §72①4호 · 부칙 제2조② 「시행 후 최초로 양도하는 분부터」 |
 * | 5호 | 정비사업 매도청구소송 | 2020.2.11. | 제30395호 ⑱5호 · 부칙 제2조② |
 * |   | (수용재결 추가) | 2021.2.17. | 제31442호 ⑱5호 · 부칙 제2조② — 이 입력은 두 사유를 한 칸으로 받아 2020.2.11.부터 연다 |
 *
 * ⚠️ 4호의 「소송절차는 종료되었으나 해당 청산금을 지급받지 못한 경우」(2017.2.3. 신설)와 5호의 「종료되었으나 매도대금 등을 지급받지
 * 못한 경우」는 입력이 「진행 중」과 「종료·미지급」을 가르지 않아 이 leaf가 가르지 못한다 — 2017.2.3. 전의 4호는 「진행 중」만이다.
 */
import { TRANSFER } from "../legal-codes";
import type { TemporaryTwoHouseDelayReason } from "../types/transfer.types";

/** 「그 방법으로 양도」 요건이 실독으로 확인된 가장 이른 시행본(소득세법 시행규칙 제241호, 2002.2.1.). 이 날 전은 단정하지 않는다. */
export const TT_DELAY_METHOD_VERIFIED_FROM = new Date("2002-02-01");
/** 대통령령 제32420호 시행일 — 이 날 이후 양도분부터 「그 방법으로 양도」 요건이 없다(부칙 제2조②). */
export const TT_DELAY_METHOD_DROPPED_TRANSFER_START = new Date("2022-02-15");
/** 4호(현금청산금 소송) — 규칙 제265호 부칙 제2조② 이후 양도분. */
export const TT_DELAY_CASH_SETTLEMENT_TRANSFER_START = new Date("2012-02-28");
/** 5호(매도청구소송·수용재결) — 제30395호 부칙 제2조② 이후 양도분. 수용재결은 제31442호(2021.2.17.)가 더했다. */
export const TT_DELAY_EXPROPRIATION_TRANSFER_START = new Date("2020-02-11");

const CLAUSE_NO: Record<TemporaryTwoHouseDelayReason, string> = {
  kamco: "1호",
  auction: "2호",
  public_sale: "3호",
  cash_settlement_suit: "4호",
  expropriation_suit: "5호",
};

const day = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, ".") + ".";

/** 이 양도일의 §155⑱에 「해당 각 호의 매각 등의 방법으로 양도」 요건이 있는가 — 2002-02-01 이상 2022-02-15 미만. */
export function isDisposalDelayMethodRequired(transferDate: Date): boolean {
  const t = transferDate.getTime();
  return t >= TT_DELAY_METHOD_VERIFIED_FROM.getTime() && t < TT_DELAY_METHOD_DROPPED_TRANSFER_START.getTime();
}

/** 이 사유(호)가 이 양도일에 시행 중인 §155⑱에 있는가. */
export function isDisposalDelayReasonAvailable(reason: TemporaryTwoHouseDelayReason, transferDate: Date): boolean {
  const t = transferDate.getTime();
  if (reason === "cash_settlement_suit") return t >= TT_DELAY_CASH_SETTLEMENT_TRANSFER_START.getTime();
  if (reason === "expropriation_suit") return t >= TT_DELAY_EXPROPRIATION_TRANSFER_START.getTime();
  return true;
}

export interface DisposalDelayResolution {
  /** 사유가 처분기한(요건 B)을 치유하는가 */
  applied: boolean;
  /** 방법 요건이 있는 양도일인데 「그 방법으로 양도」가 확인되지 않았다(선언 없음·아니다 모두) — 모름 = 불성립 + 확인 필요 */
  methodPending: boolean;
  /** 고른 사유(호)가 이 양도일의 §155⑱에 없다 */
  reasonUnavailable: boolean;
  /** 사유를 골랐는데 적용하지 않은 이유(카드·고지 문구). 적용했거나 사유를 고르지 않았으면 없다. */
  note?: string;
}

/**
 * §155⑱ 사유가 이 양도에서 **실제로** 처분기한을 치유하는가 — 요건 B(`judgeTemporaryTwoHouseTiming`)·적용 근거 표시·구 §167의10①8호
 * (`qualifiesOldClause8TemporaryTwoHouse`)가 **같은 술어**를 쓴다.
 *
 * @param disposedByThatMethod 「해당 각 호의 매각 등의 방법으로 양도」 선언. 방법 요건이 없는 양도일에는 보지 않는다.
 */
export function resolveDisposalDelay(p: {
  reason?: TemporaryTwoHouseDelayReason;
  disposedByThatMethod?: boolean;
  transferDate: Date;
}): DisposalDelayResolution {
  const none = { applied: false, methodPending: false, reasonUnavailable: false };
  if (p.reason === undefined) return none;
  if (!isDisposalDelayReasonAvailable(p.reason, p.transferDate)) {
    const from =
      p.reason === "cash_settlement_suit" ? TT_DELAY_CASH_SETTLEMENT_TRANSFER_START : TT_DELAY_EXPROPRIATION_TRANSFER_START;
    return {
      ...none,
      reasonUnavailable: true,
      note:
        `§155⑱ ${CLAUSE_NO[p.reason]} 사유는 ${day(from)} 이후 양도분부터 있는 호입니다 — 이 양도일에 시행 중인 ` +
        `${TRANSFER.TEMPORARY_TWO_HOUSE}⑱에는 없어 처분기한 예외를 적용하지 않았습니다.`,
    };
  }
  if (isDisposalDelayMethodRequired(p.transferDate) && p.disposedByThatMethod !== true) {
    // 폼은 「선언 안 함」과 「아니다」를 가르지 않는다(토글 하나) — 둘 다 확인되지 않은 것이다(모름 = 불성립).
    return {
      ...none,
      methodPending: true,
      note:
        `${day(TT_DELAY_METHOD_DROPPED_TRANSFER_START)} 전 양도분의 ${TRANSFER.TEMPORARY_TWO_HOUSE}⑱은 「다른 주택을 취득한 날부터 3년이 되는 날 현재」 ` +
        "각 호의 사유에 해당하는 경우로서 「해당 각 호의 매각 등의 방법으로 양도하는 경우」에만 적용됩니다. " +
        "그 방법으로 양도했는지 확인되지 않아 처분기한 예외를 적용하지 않았습니다(확인 필요).",
    };
  }
  return { ...none, applied: true };
}
