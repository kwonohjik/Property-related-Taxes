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
export type ResidenceIntervalLike = { moveInDate: string; moveOutDate: string };

export function collectResidenceIntervalErrors(args: {
  periods: ResidenceIntervalLike[];
  /** 거주 산입 시작 기준일(통상 취득일). 없으면 그 검사를 건너뛴다. */
  acquisitionDate?: string;
  transferDate?: string;
}): string[] {
  const { periods, acquisitionDate, transferDate } = args;
  const errors: string[] = [];

  periods.forEach((p, i) => {
    const label = `거주 구간 #${i + 1}`;
    const firstError = (() => {
      if (!p.moveInDate) return `${label}: 입주일을 입력하세요.`;
      if (!p.moveOutDate)
        return `${label}: 퇴거일을 입력하세요. (양도일까지 거주한 경우 양도일을 퇴거일로 입력)`;
      if (p.moveOutDate < p.moveInDate) return `${label}: 퇴거일은 입주일보다 이후여야 합니다.`;
      if (acquisitionDate && p.moveInDate < acquisitionDate)
        return `${label}: 입주일이 취득일(${acquisitionDate})보다 빠릅니다. 거주기간은 보유기간 중 거주만 산입됩니다 (소령 §154①·법 §95⑤). 취득 전 임차 거주는 제외하고 입력하세요.`;
      if (transferDate && p.moveInDate > transferDate)
        return `${label}: 입주일은 양도일 이전이어야 합니다.`;
      if (transferDate && p.moveOutDate > transferDate)
        return `${label}: 퇴거일은 양도일 이전이어야 합니다.`;
      return null;
    })();
    if (firstError) errors.push(firstError);
  });

  // 겹침 — 입주일 정렬 후 인접 비교. 퇴거일 = 다음 입주일(이사 당일)은 겹침이 아니다(초과만 차단).
  const complete = periods
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.moveInDate && p.moveOutDate)
    .sort((a, b) => (a.moveInDate < b.moveInDate ? -1 : a.moveInDate > b.moveInDate ? 1 : 0));
  for (let i = 1; i < complete.length; i++) {
    const prev = complete[i - 1];
    const cur = complete[i];
    if (prev.moveOutDate > cur.moveInDate) {
      errors.push(
        `거주 구간 #${prev.idx + 1}(퇴거 ${prev.moveOutDate})과 #${cur.idx + 1}(입주 ${cur.moveInDate})이 겹칩니다. 구간이 겹치면 거주기간이 이중 계산되므로 구간을 분리하거나 합쳐서 입력하세요.`,
      );
    }
  }

  return errors;
}
