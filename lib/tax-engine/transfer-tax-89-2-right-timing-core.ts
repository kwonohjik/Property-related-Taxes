/**
 * §89② 단서 — 권리 취득 타이밍 예외의 **순수 판정 코어** (§156의2③·④ · §156의3②·③).
 *
 * `transfer-tax-89-2-acquired-right-timing.ts`에서 분리했다(결정 #43 · G6-4). 이유: 일시적 2주택 경로가 권리로 취득한 신규 주택의
 * 타이밍을 같은 규칙으로 판정해야 하는데(`one-house/new-house-origin.ts`), 부모 파일은 §154① 단서 면제 술어
 * (`waivesPriorHouseOneYearGap` — `one-house/merge-deeming.ts`)를 import하고 그 파일이 다시 `evaluateTemporaryTwoHouseTiming`을
 * 통해 이 판정을 부르면 순환이 된다. 그래서 **단서 면제 여부를 boolean으로 받는** 코어를 따로 둔다 — 의존은 단방향이다.
 */
import type { RightThreeYearException, TransferTaxInput } from "./types/transfer.types";
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import type { Article89Clause2Result } from "./transfer-tax-89-2-exclusion";
import { deadlineEndFrom, deadlineEndNote, isAfterPeriod, isWithinDeadline } from "./civil-period";
import { TRANSFER } from "./legal-codes";
import {
  clause3RequiresOneYearGap,
  clause4RequiresOneYearGap,
  resolve1562Clause3Years,
  resolve1562DeadlineYears,
} from "./data/article-156-2-completion-era";

/** 이 코어가 읽는 입력 — 양도 주택 취득일(종전주택)·양도일·3년 초과 예외 선언뿐이다. */
export type RightTimingCoreInput = Pick<TransferTaxInput, "acquisitionDate" | "transferDate" | "rightThreeYearException">;

/**
 * @param oneYearWaived §154①1호·2호가목·3호 단서로 「종전주택 취득 후 1년」 요건이 면제되는가 — `waivesPriorHouseOneYearGap(input)`을 호출부가 넘긴다.
 */
export function rightTimingCore(
  input: RightTimingCoreInput,
  oneYearWaived: boolean,
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
    oneYearWaived ||
    isAfterPeriod(input.acquisitionDate, 1, rightAcq);
  const clause3Years = resolve1562Clause3Years(input.transferDate);
  const dl = deadlineEndFrom(rightAcq, clause3Years);
  const note = deadlineEndNote(dl);
  const deadline = dl.end;
  const withinDeadline = isWithinDeadline(rightAcq, clause3Years, input.transferDate);
  const clause = right.type === "redevelopment_right" ? "§156의2 ③" : "§156의3 ②";


  if (oneYearMet && withinDeadline) {
    // 3년 말일이 양도일 곁이면 공휴일 한 날이 결론을 가른다 — 충족 갈래도 그 말일을 고지 후보로 싣는다(#32).
    return {
      status: "exception_met",
      exception: `소득세법 시행령 ${clause}`,
      viaArticle,
      byTimingClause: true,
      noticeDeadlines: [deadline],
    };
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
    // ④ 완성 후 N년 말일 — 이 말일이 양도일 곁이면 충족·불충족 어느 쪽이든 공휴일 한 날이 결론을 가른다(#32).
    const completionEnd = newHouseCompletionDeadlineEnd(declared, input.transferDate);
    const completionNotice = completionEnd ? { noticeDeadlines: [completionEnd] } : {};
    if (
      meetsThreeYearException(declared, input.transferDate) &&
      (thirdClauseOpen || declared.kind !== "delay")
    ) {
      return {
        status: "exception_met",
        viaArticle,
        byTimingClause: true,
        ...completionNotice,
        exception:
          // ④2호는 전단·후단이 **같은 항**이다 — 인용을 갈래로 나누면 ⑬ 사후관리 경고가 끊긴다.
          declared.kind === "new_house" || declared.kind === "before_completion"
            ? fourthClause
            : `${right.type === "redevelopment_right" ? "소득세법 시행령 §156의2 ③" : "소득세법 시행령 §156의3 ②"} 후단(소득세법 시행규칙 §75 ①)`,
      };
    }
    return {
      status: "excluded",
      ...(thirdClauseOpen ? { deadline, ...(note ? { deadlineNote: note } : {}) } : {}),
      ...completionNotice,
    };
  }

  /**
   * 1년 요건 미충족 — ③은 탈락하고, ④는 3년 이내 양도라 대상이 아니거나(구 ④는 「3년이 지나」
   * 한정) 2022-02-15 이후 취득 권리라 1년 요건을 함께 요구한다. 나머지 예외는 위에서 전부
   * 배제됐다. ⇒ §89② 본문이 그대로 적용된다.
   */
  return { status: "excluded" };
}

/**
 * ④1호·2호 후단의 「완성 후 N년」 기한 말일(민법 §161 반영 후) — 이사·거주 자기선언을 갖춘 `new_house` 선언만 가진다.
 * 이사·거주를 못 채웠으면 말일이 결론을 바꾸지 못하므로 말일도 없다. `meetsThreeYearException` 후단과 같은 연수 함수다.
 */
function newHouseCompletionDeadlineEnd(declared: RightThreeYearException, transferDate: Date): Date | undefined {
  if (declared.kind !== "new_house") return undefined;
  if (declared.movedInWithin3Years !== true || declared.residedOneYearOrMore !== true) return undefined;
  return deadlineEndFrom(declared.completionDate, resolve1562DeadlineYears(transferDate)).end;
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
export function meetsThreeYearException(
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
