/**
 * 「소득세법 시행령」 §154⑤ 단서 — 다주택 처분 후 **최종 1주택** 보유기간 재기산 판정 leaf (OH-22 · I-1)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §3.4 · §9.7 L-2. 원문(법제처 DRF 실독 2026-09-28):
 *
 * - MST 207800(대통령령 제29523호, 2019.2.12. — ⑤는 2021.1.1. 시행): 「다만, 2주택 이상(제155조, 제155조의2 및
 *   제156조의2에 따라 일시적으로 2주택에 해당하는 경우 해당 2주택은 제외하되, 2주택 이상을 보유한 1세대가
 *   1주택 외의 주택을 모두 양도한 후 신규주택을 취득하여 일시적 2주택이 된 경우는 제외하지 않는다)을 보유한
 *   1세대가 1주택 외의 주택을 모두 양도한 경우에는 양도 후 1주택을 보유하게 된 날부터 보유기간을 기산한다.」
 *   부칙 제1조3호 「제154조제5항의 개정규정: 2021년 1월 1일」 · 제2조② 「양도소득세에 관한 개정규정은 이 영
 *   시행 이후 양도하는 분부터 적용한다.」
 * - MST 229391(대통령령 제31442호, 2021.2.17.): 괄호에 「제156조의3」 추가, 「양도」 → 「처분[양도, 증여 및
 *   용도변경(「건축법」 제19조에 따른 용도변경을 말하며, 주거용으로 사용하던 오피스텔을 업무용 건물로 사실상
 *   용도변경하는 경우를 포함한다)하는 경우를 말한다 …]」. 부칙 제9조 「제154조제5항 단서의 개정규정은 이 영
 *   시행 이후 2주택 이상을 보유한 1세대가 증여 또는 용도변경하는 경우부터 적용한다.」
 * - MST 242735(대통령령 제32654호, 2022.5.31.): 단서 삭제. 부칙 제2조 ① 「2022년 5월 10일 이후 주택을 양도하는
 *   경우부터 적용」 ② 「2022년 5월 10일 전에 주택을 양도한 경우의 보유기간 계산에 관하여는 … 종전의 규정에 따른다.」
 *
 * 해석(taxlaw.nts.go.kr 원문 실독 2026-09-28):
 * - 기획재정부 재산세제과-1132(2020.12.24.) — 「‘21.1.1. 현재 1주택만 보유하고 있는 1세대가 해당 1세대 1주택
 *   보유 상태를 유지하다가 그 주택 양도 시 비과세 판정을 위한 보유기간은 양도하는 당해 주택의 취득일부터 기산」
 *   ⇒ 2020-12-31 이전에 처분을 끝냈으면 재기산 없음.
 * - 기획재정부 재산세제과-1058(2020.12.4.) — 「(제1안) 보유 및 거주기간 모두 새로 기산함」이 타당
 *   ⇒ 거주도 재기산. **기재부 해석이며 판례로 확인된 것은 아니다**(직접 선례 미확보 — 대법원·조세심판원).
 * - 기획재정부 재산세제과-678(2023.5.10.) — 일시적 2주택 허용기간 안에 신규주택을 먼저 과세 양도한 경우 종전주택은
 *   **취득일** 기산(괄호의 일시적 2주택 제외). 재산세제과-194(2020.2.18.) 쟁점5를 이 회신으로 해석 변경.
 * - 재산세제과-194 쟁점7 · 서면-2021-법령해석재산-0565(법령해석과-1745) — 조합원입주권 양도일도 기산일.
 * - 사전-2021-법규재산-0957(법규과-1604, 2022.5.24.) — 2020.12.31. 이전 처분 후 취득한 주택을 **멸실**한 뒤
 *   양도해도 취득일 기산 ⇒ 멸실은 「처분」이 아니다.
 * - 법령해석과-4193(2021.11.30.) — 2021.1.1. 현재 1주택 세대의 신규주택 취득 후: 종전주택을 일시적 2주택으로
 *   양도하면 취득일, 신규주택을 먼저 양도하면 그 양도일(678의 「허용기간 내 과세 양도」와는 사실관계가 다르다).
 *
 * 🔑 이 구간의 재기산은 **언제나 §154① 보유 2년 미충족**으로 이어진다 — 재기산일 ≥ 2021-01-01, 양도일
 *    ≤ 2022-05-09이라 재기산 후 보유기간은 최장 1년 4개월 9일이다. 결론을 뒤집는 것은 보유기간 제한을 면제하는
 *    §154① 단서 1~3호뿐이고 그때는 거주기간 제한도 면제된다 ⇒ 거주 재기산(1058)은 이 구간에서 결론을 바꾸지
 *    못한다. 그래도 §154① 거주요건 술어는 재기산을 반영한다(Step4 안내·기한 안내가 같은 답을 내도록).
 *
 * 범위: 양도일 현재 **1주택**(`householdHousingCount === 1`) 세대. 일시적 2주택 등 §155 의제 경로의 재기산
 * (기획재정부 재산세제과-953, 2021.11.2. — 회신일 이후 양도분 한정 등)은 다루지 않는다(확인 필요).
 */
import { TRANSFER } from "../legal-codes";
import { completedMonthsInclusive } from "../civil-period";
import type { FinalHouseDisposalFact, TransferTaxInput } from "../types/transfer.types";

/** 대통령령 제29523호 부칙 제1조3호·제2조② — 이 날 이후 양도분부터 단서 적용. */
export const FINAL_ONE_HOUSE_RESTART_TRANSFER_START = new Date("2021-01-01");
/** 대통령령 제32654호 부칙 제2조①② — 이 날 이후 양도분은 단서 삭제본. */
export const FINAL_ONE_HOUSE_RESTART_TRANSFER_END_EXCLUSIVE = new Date("2022-05-10");
/** 대통령령 제31442호 시행일(공포일) · 부칙 제9조 — 증여·용도변경은 이 날 이후 행위분만 「처분」. */
export const FINAL_ONE_HOUSE_GIFT_CONVERSION_START = new Date("2021-02-17");

export type FinalOneHouseRestartInput = Pick<
  TransferTaxInput,
  "transferDate" | "acquisitionDate" | "finalOneHouseRestart"
> &
  Partial<Pick<TransferTaxInput, "householdHousingCount">>;

/**
 * 판정 결과.
 * - `out_of_scope`: 양도일이 구간 밖이거나 양도일 현재 1주택 세대가 아니다(단서가 걸리지 않는다).
 * - `undetermined`: 처분 이력을 입력받지 못했다 — 재기산 없음으로 추정하지 않는다(판정 보류 고지).
 * - `no_restart`: 이력은 있으나 재기산일이 되는 처분이 없다(사유 포함).
 * - `restart`: 재기산일(`restartDate`)부터 보유·거주기간을 센다.
 */
export type FinalOneHouseRestartVerdict =
  | { status: "out_of_scope" }
  | { status: "undetermined" }
  | {
      status: "no_restart";
      reason: "no_disposal" | "completed_before_2021" | "not_a_disposal" | "on_or_before_acquisition";
    }
  | { status: "restart"; restartDate: Date };

export function isFinalOneHouseRestartEra(transferDate: Date): boolean {
  const t = transferDate.getTime();
  return (
    t >= FINAL_ONE_HOUSE_RESTART_TRANSFER_START.getTime() &&
    t < FINAL_ONE_HOUSE_RESTART_TRANSFER_END_EXCLUSIVE.getTime()
  );
}

/**
 * 한 건이 단서의 「처분」인가 — 양도는 언제나, 증여·용도변경은 2021-02-17 이후 행위분만(부칙 제9조).
 * 2021-02-16 이전 양도분(제29523호 문언 「양도」)은 증여·용도변경일도 그 전이므로 같은 규칙으로 걸러진다.
 * 괄호의 일시적 2주택 관계(선언)는 뺀다.
 */
function isQualifyingDisposal(p: FinalHouseDisposalFact): boolean {
  if (p.temporaryTwoHouseSpecial) return false;
  if (p.kind === "transfer") return true;
  if (p.kind === "gift" || p.kind === "conversion") {
    return p.date.getTime() >= FINAL_ONE_HOUSE_GIFT_CONVERSION_START.getTime();
  }
  return false; // 그 밖(멸실 등) — 양도·증여·용도변경이 아니다(법규과-1604)
}

export function resolveFinalOneHouseRestart(input: FinalOneHouseRestartInput): FinalOneHouseRestartVerdict {
  if (!isFinalOneHouseRestartEra(input.transferDate)) return { status: "out_of_scope" };
  if (input.householdHousingCount !== undefined && input.householdHousingCount !== 1) {
    return { status: "out_of_scope" };
  }
  const facts = input.finalOneHouseRestart;
  if (!facts) return { status: "undetermined" };
  if (!facts.hadOtherHouseDisposal) return { status: "no_restart", reason: "no_disposal" };
  // 양도일 뒤의 처분은 이 양도의 「처분 후 1주택」이 아니다(⑧이 입력을 막는다).
  const counted = facts.disposals.filter(
    (p) => p.date.getTime() <= input.transferDate.getTime() && isQualifyingDisposal(p),
  );
  if (counted.length === 0) {
    return facts.disposals.length === 0 ? { status: "undetermined" } : { status: "no_restart", reason: "not_a_disposal" };
  }
  const last = Math.max(...counted.map((p) => p.date.getTime()));
  // 재산세제과-1132 — 2021-01-01 현재 이미 1주택이었다(마지막 처분이 그 전) → 취득일 기산.
  if (last < FINAL_ONE_HOUSE_RESTART_TRANSFER_START.getTime()) {
    return { status: "no_restart", reason: "completed_before_2021" };
  }
  // 처분 뒤에 이 주택을 취득했다면 「처분 후 1주택을 보유하게 된 날」이 취득일 이후가 아니다.
  if (last <= input.acquisitionDate.getTime()) return { status: "no_restart", reason: "on_or_before_acquisition" };
  return { status: "restart", restartDate: new Date(last) };
}

/**
 * §154① 보유기간 기산일에 재기산을 얹는다 — `resolveExemptionHoldingStartDate`의 마지막 단계.
 * 다른 보정(§154⑤ 용도변경·§154⑧3호 통산)보다 늦은 날이면 그 날부터 센다.
 */
export function applyFinalOneHouseRestart(input: FinalOneHouseRestartInput, start: Date): Date {
  const v = resolveFinalOneHouseRestart(input);
  return v.status === "restart" && v.restartDate.getTime() > start.getTime() ? v.restartDate : start;
}

/**
 * §154① 거주요건용 거주 개월 — 재기산이면 재기산일 이후만 센다(재산세제과-1058).
 *
 * 엔진은 거주를 개월 수로만 받으므로 재기산일부터 양도일까지의 개월 수로 **상한**을 건다. 이 구간에서는 그
 * 상한이 최장 16개월이라 2년 판정에는 정확하다(상한 < 24 ⇒ 실제 값과 무관하게 미충족). 표2 거주 개월
 * (§95② — 서면-2022-부동산-1386: 취득일부터의 보유기간 중 거주)은 이 함수를 쓰지 않는다.
 */
export function capResidenceMonthsAtRestart(input: FinalOneHouseRestartInput, months: number): number {
  const v = resolveFinalOneHouseRestart(input);
  if (v.status !== "restart") return months;
  return Math.min(months, completedMonthsInclusive(v.restartDate, input.transferDate));
}

const law = `${TRANSFER.ONE_HOUSE_REQUIREMENT}⑤`;
const fmt = (x: Date) => x.toISOString().slice(0, 10);

/** 판정 메뉴 결과 카드·계산기 안내가 함께 쓰는 echo. 구간 밖·미입력이면 싣지 않는다. */
export type FinalOneHouseRestartEcho = {
  /** 재기산을 적용했는가 */
  applied: boolean;
  /** 재기산일(적용 시) */
  restartDate?: Date;
  /** 결과 문장 — 근거 포함 */
  description: string;
  legalBasis: string;
};

const NO_RESTART_TEXT: Record<Extract<FinalOneHouseRestartVerdict, { status: "no_restart" }>["reason"], string> = {
  no_disposal: "이 주택을 보유하는 동안 다른 주택을 처분하지 않았으므로 보유기간은 취득일부터 셉니다.",
  completed_before_2021:
    "다른 주택의 처분을 2020년 12월 31일까지 마쳐 2021년 1월 1일 현재 1주택이었으므로 보유기간은 취득일부터 셉니다" +
    "(기획재정부 재산세제과-1132).",
  not_a_disposal:
    "입력한 처분은 단서의 「처분」(양도, 2021년 2월 17일 이후 증여·용도변경)이 아니거나 일시적 2주택 관계라 " +
    "재기산일이 되지 않습니다 — 보유기간은 취득일부터 셉니다.",
  on_or_before_acquisition:
    "다른 주택을 처분한 날이 이 주택 취득일 이전이라 재기산일이 되지 않습니다 — 보유기간은 취득일부터 셉니다.",
};

export function describeFinalOneHouseRestart(input: FinalOneHouseRestartInput): FinalOneHouseRestartEcho | undefined {
  const v = resolveFinalOneHouseRestart(input);
  if (v.status === "out_of_scope" || v.status === "undetermined") return undefined;
  if (v.status === "no_restart") {
    return { applied: false, description: NO_RESTART_TEXT[v.reason], legalBasis: law };
  }
  const day = fmt(v.restartDate);
  return {
    applied: true,
    restartDate: v.restartDate,
    description:
      `2021년 1월 1일~2022년 5월 9일 양도분으로, 2주택 이상을 보유한 세대가 다른 주택을 모두 처분해 ` +
      `${day}에 1주택이 되었으므로 1세대1주택 비과세 보유기간을 ${day}부터 다시 셉니다(${law} 단서). ` +
      `거주기간도 그날부터 다시 셉니다 — 기획재정부 재산세제과-1058(2020.12.4.) 해석이며 판례로 확인된 것은 아닙니다. ` +
      "장기보유특별공제의 보유기간은 이 재기산과 관계없이 취득일부터 셉니다.",
    legalBasis: law,
  };
}
