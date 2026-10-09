/**
 * §89② 단서 — 권리를 **취득함으로써** 1주택 + 1권리가 된 세대의 타이밍 예외(800줄 정책 분리).
 *
 * · §156의2③·④ — 조합원입주권(승계취득 — 원조합원은 `one-house/original-member-right.ts`)
 * · §156의3②·③ — 분양권
 *
 * 부모 `transfer-tax-89-2-exclusion.ts`가 진입 조건(권리 1개 · 상속 ⑥ · 합가 ⑧⑨ · 대체주택 ⑤)을 모두 거른 뒤 부른다.
 * 이 파일은 부모를 **타입으로만** 참조한다(런타임 순환 없음).
 */
import type { RightThreeYearException } from "./types/transfer.types";
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import type { Article89Clause2Input, Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
import { deadlineEndFrom, deadlineEndNote, isAfterPeriod, isWithinDeadline } from "./civil-period";
import { TRANSFER } from "./legal-codes";
import { presaleRightDefinitionAcquisitionDate } from "./presale-right-definition-date";
import { waivesPriorHouseOneYearGap } from "./transfer-tax-exemption-requirements";
import {
  clause3RequiresOneYearGap,
  clause4RequiresOneYearGap,
  resolve1562Clause3Years,
  resolve1562DeadlineYears,
} from "./data/article-156-2-completion-era";

/** 동일세대 상속 분양권을 피상속인 취득일로 셌는데 상속개시일로 세면 예외가 성립하는 경우의 확인 필요 문구. */
export const INHERITED_PRESALE_RIGHT_TIMING_START_NOTE =
  "동일세대원으로부터 상속받은 분양권은 피상속인이 취득한 날을 분양권 취득일로 보아 「종전주택 취득 후 1년」·" +
  "「분양권 취득일부터 3년」을 판정했습니다(동일세대 안의 상속은 새로운 취득이 아니라고 본 사전-2023-법규재산-0464 · " +
  "기획재정부 재산세제과-1033과 같은 기준). 분양권을 직접 다룬 해석은 확인되지 않았고 상속개시일로 세면 특례가 " +
  "적용되므로 확인이 필요합니다.";

/**
 * 권리를 **취득함으로써** 1주택 + 1권리가 된 세대의 타이밍 예외 — §156의2③·④(승계취득 입주권) · §156의3②·③(분양권).
 *
 * 권리 취득일은 `presaleRightDefinitionAcquisitionDate` — 동일세대 상속 분양권이면 피상속인 취득일이다
 * (§89② 대상 여부와 같은 leaf · 사용자 결정 2026-10-09). 상속개시일로 세면 예외가 성립하는데 피상속인 취득일로는
 * 성립하지 않으면 확인 필요를 얹는다(`confirmNotes`).
 */
export function resolveAcquiredRightTiming(
  input: Article89Clause2Input,
  right: PresaleRight,
  viaArticle: string | undefined,
): Article89Clause2Result {
  const householdAcq = presaleRightDefinitionAcquisitionDate(right);
  const result = timingFrom(input, right, householdAcq, viaArticle);
  if (householdAcq.getTime() === right.acquisitionDate.getTime() || result.status === "exception_met") return result;
  if (timingFrom(input, right, right.acquisitionDate, viaArticle).status !== "exception_met") return result;
  return { ...result, confirmNotes: [...(result.confirmNotes ?? []), INHERITED_PRESALE_RIGHT_TIMING_START_NOTE] };
}

function timingFrom(
  input: Article89Clause2Input,
  right: PresaleRight,
  rightAcq: Date,
  viaArticle: string | undefined,
): Article89Clause2Result {
  // 「1년 이상이 지난 후」·「3년 이내」 모두 초일불산입 — 응당일 권리 취득은 1년 미경과(§155①과 같은 문언,
  //   조심2020서1405 · 서면2017법령해석재산-785). ③·②의 직접 선례는 미확보(계획서 §7-1).
  //   후단 — §154①1호·2호가목·3호에 해당하면 1년 요건을 적용하지 않는다(③·④ 모두 · §155① 후단과 같은 술어).
  // M7 — 1년 요건은 2012-06-29 이후 양도분부터, N년은 양도일 연혁(`data/article-156-2-completion-era.ts`).
  const oneYearMet =
    !clause3RequiresOneYearGap(input.transferDate) ||
    waivesPriorHouseOneYearGap(input) ||
    isAfterPeriod(input.acquisitionDate, 1, rightAcq);
  const clause3Years = resolve1562Clause3Years(input.transferDate);
  const dl = deadlineEndFrom(rightAcq, clause3Years);
  const note = deadlineEndNote(dl);
  const deadline = dl.end;
  const withinDeadline = isWithinDeadline(rightAcq, clause3Years, input.transferDate);
  const clause = right.type === "redevelopment_right" ? "§156의2 ③" : "§156의3 ②";


  if (oneYearMet && withinDeadline) {
    return { status: "exception_met", exception: `소득세법 시행령 ${clause}`, viaArticle, byTimingClause: true };
  }
  /**
   * OH-30b — ④(§156의3③)의 「종전주택 취득 후 1년이 지난 후 권리 취득」 요건은 대통령령 제32420호
   * (2022-02-15 시행)가 신설했고, 부칙 제12조가 그 전에 취득한 권리에는 **종전 규정**(1년 요건 없음)을
   * 적용한다. ③은 그 전부터 1년 요건이 있었으므로 여기서 풀리는 것은 ④ 경로뿐이다.
   * (구 ④도 「3년이 **지나**」 양도한 경우에만 적용되므로 3년 이내 양도에는 영향이 없다.)
   */
  const clause4Open = oneYearMet || !clause4RequiresOneYearGap(rightAcq);
  if (!withinDeadline && clause4Open) {
    /**
     * 3년을 넘겼다(④의 1년 요건은 충족했거나 적용되지 않는다) — 남은 갈래는 **둘뿐**이다(16항 전수 대조):
     *   · §156의2④ · §156의3③ — 신축주택 완성 후 N년(양도일 연혁 2·3년) 내 세대전원 이사 + 1년 이상 계속 거주
     *   · 시행규칙 §75① — 3년이 되는 날 현재 매각의뢰·경매·공매 **이고 그 방법으로 양도**
     *
     * 🔴 **선언이 없으면 예외 불성립(배제)이다**(2026-10-08 — 종전 「판정 보류 + 비과세」 대체). 종전 근거(신규 필드라
     *    기존 저장분에 값이 없다)는 저장 데이터 전체 삭제(2026-10-05)로 사라졌고, 선언 칸(판정 메뉴 「3년 경과 예외」)이
     *    있으므로 「모름 → 혜택 불성립 + 확인 필요」를 따른다(E011 #2009와 같은 모양).
     */
    const fourthClause =
      right.type === "redevelopment_right"
        ? TRANSFER.RIGHT_3YR_EXCEPTION_156_2_4
        : TRANSFER.PRESALE_3YR_EXCEPTION_156_3_3;
    const declared = input.rightThreeYearException;
    /*
     * 1년 요건을 못 채운 채 여기 온 경우(구 ④ — 2022-02-15 전 취득 권리)는 ④만 열려 있다.
     * 시행규칙 §75①은 ③ 괄호(「3년 이내에 양도하지 못하는 경우」)의 위임이라 ③의 1년 요건을 함께
     * 요구하고, 「3년 이내 양도했으면 비과세」 기한 안내(`deadline`)도 ③ 경로라 낼 수 없다.
     */
    const thirdClauseOpen = oneYearMet;
    if (declared === undefined) {
      return {
        status: "excluded",
        undeclaredArticles: thirdClauseOpen ? [fourthClause, "소득세법 시행규칙 §75 ①"] : [fourthClause],
        ...(thirdClauseOpen ? { deadline, ...(note ? { deadlineNote: note } : {}) } : {}),
      };
    }
    if (
      meetsThreeYearException(declared, input.transferDate) &&
      (thirdClauseOpen || declared.kind !== "delay")
    ) {
      return {
        status: "exception_met",
        viaArticle,
        byTimingClause: true,
        exception:
          // ④2호는 전단·후단이 **같은 항**이다 — 인용을 갈래로 나누면 ⑬ 사후관리 경고가 끊긴다.
          declared.kind === "new_house" || declared.kind === "before_completion"
            ? fourthClause
            : `${right.type === "redevelopment_right" ? "소득세법 시행령 §156의2 ③" : "소득세법 시행령 §156의3 ②"} 후단(소득세법 시행규칙 §75 ①)`,
      };
    }
    return { status: "excluded", ...(thirdClauseOpen ? { deadline, ...(note ? { deadlineNote: note } : {}) } : {}) };
  }

  /**
   * 1년 요건 미충족 — ③은 탈락하고, ④는 3년 이내 양도라 대상이 아니거나(구 ④는 「3년이 지나」
   * 한정) 2022-02-15 이후 취득 권리라 1년 요건을 함께 요구한다. 나머지 예외는 위에서 전부
   * 배제됐다. ⇒ §89② 본문이 그대로 적용된다.
   */
  return { status: "excluded" };
}

/**
 * 3년 초과 예외 선언이 **요건을 충족하는가**.
 *
 * · `new_house` — 「소득세법 시행령」 §156의2④1호·2호 / §156의3③1호·2호
 *   1호: 완성 후 N년 이내 세대전원 이사 + 1년 이상 계속 거주 (둘 다 자기선언)
 *   2호: **완성되기 전 또는 완성된 후 N년 이내**에 종전주택을 양도
 *   N = 양도일 2023-01-12 전 2년 · 이후 3년 (대통령령 제33267호 부칙 제8조 — OH-30).
 *   1호의 이사 기한은 자기선언이라 화면 문구가 같은 N을 묻는다(`RightThreeYearExceptionSection`).
 * · `delay` — 「소득세법 시행규칙」 §75① : 사유 해당 **그리고** 그 방법에 따라 양도
 * · `none` — 명시적 미해당 선언
 */
function meetsThreeYearException(
  declared: RightThreeYearException,
  transferDate: Date,
): boolean {
  if (declared.kind === "none") return false;
  if (declared.kind === "delay") {
    // ⚠️ 요건이 둘이다 — §155⑱(전자만)을 복사하면 후자가 빠진다.
    return declared.disposedByThatMethod === true;
  }
  const movedAndResided =
    declared.movedInWithin3Years === true && declared.residedOneYearOrMore === true;
  if (!movedAndResided) return false;
  /**
   * 2호 **전단** — 「완성되기 전」에 양도했다는 **명시 선언**이면 완성일 비교가 없다.
   * 사업이 진행 중이면 준공일 자체가 정해지지 않으므로 완성일을 요구할 수 없다(R-3).
   */
  if (declared.kind === "before_completion") return true;
  // 2호 후단 — 완성일 + N년 이내(N = 양도일 연혁). 완성일이 양도일보다 뒤인 저장분도 전단으로 성립한다.
  return (
    transferDate < declared.completionDate ||
    isWithinDeadline(declared.completionDate, resolve1562DeadlineYears(transferDate), transferDate)
  );
}
