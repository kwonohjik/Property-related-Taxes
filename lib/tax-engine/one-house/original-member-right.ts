/**
 * 기존주택 원조합원 조합원입주권 — §89② 단서의 예외를 **§156의2③·④가 아니라 §155①**로 판정한다.
 *
 * ## 근거
 *
 * · 「소득세법 시행령」 §156의2③·④는 모두 「국내에 1주택을 소유한 1세대가 그 주택을 양도하기 전에
 *   **조합원입주권을 취득함으로써** 일시적으로 1주택과 1조합원입주권을 소유하게 된 경우」다 — 매매 등으로
 *   입주권을 **새로 취득**한 세대의 규정이다 — 승계취득, 그리고 상가·토지(주택 아님)가 입주권이 된 원조합원
 *   (재산세과-1708 · 서면-2015-법령해석재산-2306 — 취득일 = 관리처분계획인가일). 기존주택이 입주권이 된 원조합원에게는
 *   적용하지 않는다(사용자 결정 2026-10-08).
 * · 원조합원은 기존주택(B)을 먼저 취득해 일시적 2주택이 된 뒤 B가 입주권으로 바뀐 것이다 —
 *   사전-2018-법령해석재산-0620(2019.9.19.): 「B주택을 취득한 날부터 3년 이내에 A주택을 양도하는 경우에는
 *   「소득세법 시행령」 제155조제1항에 따른 1세대1주택 특례가 적용」(같은 취지 서면-2019-부동산-1050). ⇒ 신규 주택 = B,
 *   기산일 = B 취득일.
 *
 * 🔑 기존주택 원조합원 행의 `acquisitionDate`는 **기존주택 취득일**이다(화면 라벨 · 평가셋 관례와 같다).
 *
 * ## 조정대상지역 처분기한
 *
 * 처분기한은 일시적 2주택 경로와 **같은 leaf**(`resolveTemporaryTwoHouseDeadlineEra`)로 정한다. 「두 주택이 신규 주택
 * 취득일에 조정대상지역인가」는 양도 주택의 `regionCode`와 입주권 행의 `regionCode`(기존주택 = 정비구역 소재지)로
 * 판정한다. 모르면 두 경우를 모두 계산해, 결론이 같을 때만 확정한다(결론을 가르면 특례 불성립 + 확인 필요).
 *
 * ## 입주권 행이 받는 §155① 사실 (#2054 후속)
 *
 * 일시적 2주택 경로(`temporaryTwoHouse`)와 같은 의미·같은 leaf다 — 신규 주택 = 기존주택.
 * · `originalMemberMoveInDate`·`originalMemberTenantLeaseEndDate` — §155①2호 가목·단서(2019-12-17 체제, 연혁 leaf가
 *   그 구간에서만 쓴다). 전입일이 없으면 종전처럼 특례 불성립 + 확인 필요다.
 *   기존주택이 1년이 지나기 전에 정비사업으로 멸실돼 전입할 수 없게 돼도 전입기한은 기존주택 취득일부터 1년 그대로다 —
 *   기준-2025-법규재산-0005(2025.5.14. — 가로주택정비사업 멸실). 재개발·입주권 전환을 「부득이한 사유」로 보지 않은
 *   조심 2023중9849 · 2025구0745 · 2025부2163 · 2025인3694도 같은 결론이다. ⇒ 멸실 여부를 받지 않고 법문대로 전입을 본다.
 * · `originalMemberDisposalDelayReason` — §155⑱ 각 호(기존주택 취득일부터 3년이 되는 날 현재). 기한만 치유한다.
 */
import { format } from "date-fns";
import { isRegulatedByBjdCode } from "../data/regulated-areas";
import { resolveTemporaryTwoHouseDeadlineEra } from "../data/temporary-two-house-deadline-era";
import { TRANSFER } from "../legal-codes";
import { judgeTemporaryTwoHouseTiming } from "../transfer-tax-temporary-two-house-timing";
import type { Article89Clause2Result } from "../transfer-tax-89-2-exclusion";
import type { PresaleRight } from "../types/multi-house-surcharge.types";
import type { TransferTaxInput } from "../types/transfer.types";

/**
 * §155① 본문 처분기한 3년 — 규칙 행 `temporary_two_house.disposalDeadlineYears`(seed)와 같은 값.
 * §89② leaf는 규칙 행을 받지 않으므로 상수로 둔다(일치는 anchor가 지킨다).
 */
export const ORIGINAL_MEMBER_BASE_DEADLINE_YEARS = 3;

type OriginalMemberInput = Pick<
  TransferTaxInput,
  "acquisitionDate" | "transferDate" | "regionCode" | "regionInDesignatedDistrict"
>;

type TimingOutcome =
  | { kind: "met"; deadline: Date }
  | { kind: "unmet" }
  | { kind: "unknown"; reason: string };

function regulatedAt(code: string | undefined, inDistrict: boolean | undefined, date: Date): boolean | undefined {
  if (!code) return undefined;
  const j = isRegulatedByBjdCode(code, format(date, "yyyy-MM-dd"), inDistrict);
  // 지구 한정 동인데 지구 안인지 모르면 코드로 정하지 않는다 — 두 경우를 모두 계산한다.
  return j.districtOnly ? undefined : j.isRegulated;
}

/** 기존주택(B) 취득일 기준 §155① 타이밍(1년·처분기한·연혁상 전입 요건). */
function judgeTiming(input: OriginalMemberInput, right: PresaleRight, oneYearWaived: boolean): TimingOutcome {
  const newAcq = right.acquisitionDate;
  // 양도 주택이 B보다 뒤에 취득됐으면 양도 주택이 「신규 주택」이다 — §155①은 종전 주택 양도만 받는다.
  if (input.acquisitionDate.getTime() >= newAcq.getTime()) return { kind: "unmet" };

  const previous = regulatedAt(input.regionCode, input.regionInDesignatedDistrict, newAcq);
  const next = regulatedAt(right.regionCode, right.inDesignatedDistrict, newAcq);
  const candidates =
    previous === false || next === false ? [false] : previous === true && next === true ? [true] : [true, false];

  const outcomes = candidates.map((bothRegulated): TimingOutcome => {
    const era = resolveTemporaryTwoHouseDeadlineEra({
      bothRegulated,
      baseDeadlineYears: ORIGINAL_MEMBER_BASE_DEADLINE_YEARS,
      newAcquisitionDate: newAcq,
      previousAcquisitionDate: input.acquisitionDate,
      // §155①2호 가목·단서 — 일시적 2주택 경로와 같은 leaf에 같은 의미로 넘긴다(신규 주택 = 기존주택).
      moveInDate: right.originalMemberMoveInDate,
      existingTenantLeaseEndDate: right.originalMemberTenantLeaseEndDate,
      transferDate: input.transferDate,
    });
    if (era.moveInRequirementPending) {
      return {
        kind: "unknown",
        reason:
          "기존주택 취득일부터 1년 안에 세대전원이 이사·전입했는지(§155①2호 가목)가 입력되지 않았습니다 — " +
          "분양권·입주권 목록의 그 입주권 행에 기존주택 전입일을 입력하세요",
      };
    }
    const timing = judgeTemporaryTwoHouseTiming({
      previousAcquisitionDate: input.acquisitionDate,
      newAcquisitionDate: newAcq,
      transferDate: input.transferDate,
      deadlineYears: era.years,
      oneYearWaived,
      ...(era.deadlineDate ? { deadlineDate: era.deadlineDate } : {}),
      ...(era.moveInMet !== undefined ? { moveInMet: era.moveInMet } : {}),
      // §155⑱ — 기존주택 취득일부터 3년이 되는 날 현재 각 호 사유면 처분기한을 넘겨도 충족으로 본다.
      ...(right.originalMemberDisposalDelayReason ? { disposalDelayReason: right.originalMemberDisposalDelayReason } : {}),
    });
    return timing.overall ? { kind: "met", deadline: timing.deadline } : { kind: "unmet" };
  });

  // 두 경우 모두 충족이면 결론은 같다 — 안내할 기한은 이른 쪽이다.
  const met = outcomes.filter((o): o is Extract<TimingOutcome, { kind: "met" }> => o.kind === "met");
  if (met.length === outcomes.length) {
    return { kind: "met", deadline: new Date(Math.min(...met.map((o) => o.deadline.getTime()))) };
  }
  if (outcomes.every((o) => o.kind === "unmet")) return { kind: "unmet" };
  const pending = outcomes.find((o) => o.kind === "unknown");
  return {
    kind: "unknown",
    reason:
      pending?.reason ??
      "양도 주택과 기존주택이 기존주택 취득일에 조정대상지역이었는지에 따라 처분기한이 달라지는데 소재지가 입력되지 않았습니다",
  };
}

/** 기존주택 원조합원으로 읽은 결론 — 2주택 축(⑦·⑩·⑪ 준용)은 판정하지 않는다. */
function asOriginalMember(
  input: OriginalMemberInput,
  right: PresaleRight,
  oneYearWaived: boolean,
  viaArticle: string | undefined,
): Article89Clause2Result {
  if (viaArticle) {
    return {
      status: "undetermined",
      openArticles: [`${TRANSFER.ORIGINAL_MEMBER_RIGHT_TEMP_TWO_HOUSE}(원조합원 입주권 — ${viaArticle} 경로)`],
    };
  }
  const t = judgeTiming(input, right, oneYearWaived);
  if (t.kind === "met") {
    return { status: "exception_met", exception: TRANSFER.ORIGINAL_MEMBER_RIGHT_TEMP_TWO_HOUSE, deadline: t.deadline };
  }
  if (t.kind === "unmet") return { status: "excluded" };
  return { status: "excluded", confirmNotes: [`원조합원 입주권의 §155① 일시적 2주택 판정 — ${t.reason}(확인 필요).`] };
}

/**
 * 조합원입주권 1개의 타이밍 예외 — 취득 경위(`memberOrigin`)로 갈래를 고른다.
 *
 * @param viaArticle 2주택 축 준용 근거(⑦·⑩·⑪). 없으면 직접 적용이다.
 * @param successorReading 승계취득으로 읽은 결론(§156의2③·④ — 호출부 기존 경로).
 *
 * 미입력(모름)은 두 갈래가 **같은 결론**일 때만 그대로 두고, 결론을 가르면 특례 불성립 + 확인 필요다.
 */
export function resolveRedevelopmentRightTiming(p: {
  input: OriginalMemberInput;
  right: PresaleRight;
  oneYearWaived: boolean;
  viaArticle: string | undefined;
  successorReading: () => Article89Clause2Result;
}): Article89Clause2Result {
  const origin = p.right.memberOrigin;
  // 상가·토지 원조합원도 입주권을 「취득함으로써」 1주택 + 1입주권이 된 세대다 — ③·④(취득일 = 관리처분계획인가일).
  if (origin === "successor" || origin === "original_non_house") return p.successorReading();
  const original = asOriginalMember(p.input, p.right, p.oneYearWaived, p.viaArticle);
  if (origin === "original_house") return original;

  const successor = p.successorReading();
  const exempt = (r: Article89Clause2Result) => r.status === "exception_met" || r.status === "undetermined";
  const settledExcluded = (r: Article89Clause2Result) => r.status === "excluded" && !r.confirmNotes?.length;
  if (exempt(successor) && exempt(original)) return successor;
  if (settledExcluded(successor) && settledExcluded(original)) return successor;
  // 승계취득 쪽 배제의 부가 정보(미선언 조문·기한)는 그대로 둔다 — 그 위에 확인 필요 사유를 얹는다.
  const base: Article89Clause2Result = successor.status === "excluded" ? successor : { status: "excluded" };
  return {
    ...base,
    confirmNotes: [
      ...(base.confirmNotes ?? []),
      "조합원입주권의 취득 경위(기존주택 원조합원인지)에 따라 결론이 달라지는데 입력되지 않아 특례를 적용하지 " +
        "않았습니다(확인 필요) — 분양권·입주권 목록에서 취득 경위를 선택하세요.",
    ],
  };
}
