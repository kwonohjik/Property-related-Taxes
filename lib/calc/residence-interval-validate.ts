/**
 * ⑧ 거주 구간(입주일~퇴거일) 입력 검증 — **입력 형태에 묶이지 않는 순수 함수**.
 *
 * 거주 구간은 ④에서 `sumResidenceMonths`로 **단순 합산**된다(취득일·양도일로 자르지 않고
 * 겹침도 빼지 않으며 퇴거일이 비면 0개월). 그래서 합산 전에 여기서 막아야 한다:
 *
 *   · 입주일·퇴거일 누락 / 퇴거일 < 입주일
 *   · 입주일 < 취득일 — 「소득세법 시행령」 §154① 괄호 「그 보유기간 중 거주기간」·법 §95⑤.
 *     취득 전 임차 거주는 보유기간 밖이다.
 *   · 입주일·퇴거일 > 양도일
 *   · 구간 겹침 — 같은 기간을 두 번 센다.
 *
 * 🔑 호출부가 셋이 될 수 있다 — 양도세 계산기(주택) · 판정 메뉴(OH-07) · 재개발APT(OH-49).
 *    폼 타입을 받지 않고 구간 배열과 두 날짜만 받는 이유다. 규칙이 한 벌이어야 한 화면만
 *    고쳐지는 일이 없다.
 *
 * 반환: 사람이 읽는 메시지 배열(구간별 첫 오류 1건 + 겹침 건수만큼). 빈 배열이면 통과.
 */
import { fieldError } from "./transfer-tax-validate-field";
import type { IssueField } from "./transfer-tax-validate-field";
import { residenceIntervalMonths } from "@/lib/stores/calc-wizard-asset-residence";

export type ResidenceIntervalLike = { moveInDate: string; moveOutDate: string };

/**
 * 증여받은 주택을 증여자와 계속 같은 세대로 보유한 경우의 안내 — 증여 전 거주는 구간·개월 직접 입력이 아니라 별도 칸에 입력한다(결정 #38-7).
 * 「취득 전 거주는 제외하라」는 오류가 그 칸의 존재를 모르는 사용자를 막다른 길에 두지 않게 한다. 호출부가 `giftPriorResidenceAsked`로 게이트한다.
 */
const GIFT_PRIOR_HINT =
  " 증여 전 증여자와 같은 세대로 거주한 기간은 「증여 전 동일세대 거주기간」 칸에 개월 수로 입력하세요(비과세 거주요건과 표2 대상 판정에 통산됩니다).";

/**
 * 기준일이 합가일일 때(`startKind: "merge"`)의 문구 — 토지만 본인 × 같은 세대 합가의 거주기간은 동일세대원으로서 건물 소유자와 함께 거주한 기간만 통산한다
 * (기준-2025-법규재산-0040 · 재산46014-610). 취득일 문구(「취득 전 임차 거주」)는 이 경우 맞지 않는다.
 */
const MERGE_BASIS = "토지만 본인 주택의 거주기간은 동일세대원으로서 건물 소유자와 함께 거주한 기간만 통산됩니다 (기준-2025-법규재산-0040 · 재산46014-610). 합가 전 거주는 제외하고 입력하세요.";

export function collectResidenceIntervalErrors(args: {
  periods: ResidenceIntervalLike[];
  /** 거주 산입 시작 기준일(통상 취득일, 토지만 본인 합가는 합가일). 없으면 그 검사를 건너뛴다. */
  acquisitionDate?: string;
  /** `"merge"`면 기준일을 세대 합가일로 읽어 문구를 바꾼다(기본: 취득일). */
  startKind?: "acquisition" | "merge";
  transferDate?: string;
  /** 증여 전 동일세대 거주 칸이 있는 입력이면 true — 취득 전 입주 오류에 그 칸을 안내한다. */
  giftPriorHint?: boolean;
}): string[] {
  const { periods, acquisitionDate, transferDate } = args;
  const errors: string[] = [];

  periods.forEach((p, i) => {
    const label = `거주 구간 #${i + 1}`;
    const firstError = (() => {
      if (!p.moveInDate) return fieldError(`residencePeriods.${i}.moveInDate`, `${label}: 입주일을 입력하세요.`);
      if (!p.moveOutDate)
        return fieldError(`residencePeriods.${i}.moveOutDate`, `${label}: 퇴거일을 입력하세요. (양도일까지 거주한 경우 양도일을 퇴거일로 입력)`);
      if (p.moveOutDate < p.moveInDate) return fieldError(`residencePeriods.${i}.moveOutDate`, `${label}: 퇴거일은 입주일보다 이후여야 합니다.`);
      if (acquisitionDate && p.moveInDate < acquisitionDate && args.startKind === "merge")
        return fieldError(`residencePeriods.${i}.moveInDate`, `${label}: 입주일이 세대 합가일(${acquisitionDate})보다 빠릅니다. ${MERGE_BASIS}`);
      if (acquisitionDate && p.moveInDate < acquisitionDate)
        return fieldError(`residencePeriods.${i}.moveInDate`, `${label}: 입주일이 취득일(${acquisitionDate})보다 빠릅니다. 거주기간은 보유기간 중 거주만 산입됩니다 (소령 §154①·법 §95⑤). 취득 전 임차 거주는 제외하고 입력하세요.${args.giftPriorHint ? GIFT_PRIOR_HINT : ""}`);
      if (transferDate && p.moveInDate > transferDate)
        return fieldError(`residencePeriods.${i}.moveInDate`, `${label}: 입주일은 양도일 이전이어야 합니다.`);
      if (transferDate && p.moveOutDate > transferDate)
        return fieldError(`residencePeriods.${i}.moveOutDate`, `${label}: 퇴거일은 양도일 이전이어야 합니다.`);
      return null;
    })();
    if (firstError) errors.push(firstError);
  });

  // 겹침 — 입주일 정렬 후 인접 비교. 앞 구간 퇴거일 ≥ 다음 입주일이면 차단한다.
  // 거주기간은 「전입일부터 전출일까지」 **초일 산입**이라(`residenceIntervalMonths`) 퇴거일 = 다음 입주일인
  // 같은 날은 두 구간에 한 번씩 들어가 이중 계산된다(소령 §154⑥ — 같은 하루를 두 번 셀 근거는 문언에 없다).
  // 옛 「이사 당일은 겹침 아님」 예외는 반개구간 셈 때 맞던 것이다(결정 문서 #37).
  const complete = periods
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.moveInDate && p.moveOutDate)
    .sort((a, b) => (a.moveInDate < b.moveInDate ? -1 : a.moveInDate > b.moveInDate ? 1 : 0));
  for (let i = 1; i < complete.length; i++) {
    const prev = complete[i - 1];
    const cur = complete[i];
    if (prev.moveOutDate > cur.moveInDate) {
      // 나중 구간의 입주일이 앞 구간 퇴거일보다 이르다 — 그 입주일을 고치면 겹침이 풀린다
      errors.push(
        fieldError(
          `residencePeriods.${cur.idx}.moveInDate`,
          `거주 구간 #${prev.idx + 1}(퇴거 ${prev.moveOutDate})과 #${cur.idx + 1}(입주 ${cur.moveInDate})이 겹칩니다. 구간이 겹치면 거주기간이 이중 계산되므로 날짜를 바로잡거나 한 구간으로 합쳐서 입력하세요.`,
        ),
      );
    } else if (prev.moveOutDate === cur.moveInDate) {
      // 같은 날 — 계속 거주였다면 한 구간으로, 실제 재입주일이 다르면 그 날짜로. 「다음 날로 옮겨 나누라」는
      // 안내는 하지 않는다(나누면 같은 거주가 1개월 적게 나올 수 있다).
      errors.push(
        fieldError(
          `residencePeriods.${cur.idx}.moveInDate`,
          `거주 구간 #${prev.idx + 1}의 퇴거일과 #${cur.idx + 1}의 입주일이 같은 날(${cur.moveInDate})입니다. 그날이 두 구간에 모두 산입되어 이중 계산됩니다. 계속 거주했다면 한 구간으로 합쳐서 입력하고, 실제 재입주일이 다르면 그 날짜로 수정하세요.`,
        ),
      );
    }
  }

  return errors;
}

/**
 * 개월 수 **직접 입력**의 상한 — 거주 산입 시작 기준일(통상 취득일)부터 양도일까지의 개월 수.
 *
 * 구간 입력은 위 규칙(입주일 ≥ 기준일 · 퇴거일 ≤ 양도일 · 겹침 금지)으로 이 범위를 넘을 수 없다.
 * 직접 입력에는 날짜가 없어 같은 상한만 건다 — 두 모드가 허용하는 최댓값이 같아야 한다.
 * 개월 수는 구간과 같은 §154⑥ 초일 산입 leaf(`residenceIntervalMonths`)로 센다.
 *
 * 근거: 「소득세법 시행령」 §154① 괄호 「그 보유기간 중 거주기간」·법 §95⑤.
 * 날짜가 없거나 역전이면 판정하지 않는다(그 누락은 다른 ⑧이 막는다).
 *
 * @returns 오류 메시지(fieldError 형식) 또는 null
 */
export function directResidenceMonthsOverflowError(args: {
  months: number;
  acquisitionDate?: string;
  /** `"merge"`면 기준일을 세대 합가일로 읽어 문구를 바꾼다(기본: 취득일). */
  startKind?: "acquisition" | "merge";
  transferDate?: string;
  field: IssueField;
  /** 증여 전 동일세대 거주 칸이 있는 입력이면 true — 상한 초과 오류에 그 칸을 안내한다. */
  giftPriorHint?: boolean;
}): string | null {
  const { months, acquisitionDate, transferDate, field } = args;
  if (!acquisitionDate || !transferDate || transferDate < acquisitionDate) return null;
  const max = residenceIntervalMonths(acquisitionDate, transferDate);
  if (months <= max) return null;
  if (args.startKind === "merge")
    return fieldError(field, `거주기간: ${months}개월이 세대 합가일(${acquisitionDate})부터 양도일까지의 ${max}개월을 넘습니다. ${MERGE_BASIS}`);
  return fieldError(
    field,
    `거주기간: ${months}개월이 취득일(${acquisitionDate})부터 양도일까지의 ${max}개월을 넘습니다. ` +
      `거주기간은 보유기간 중 거주만 산입됩니다 (소령 §154①·법 §95⑤). 취득 전 임차 거주는 제외하고 입력하세요.${args.giftPriorHint ? GIFT_PRIOR_HINT : ""}`,
  );
}
