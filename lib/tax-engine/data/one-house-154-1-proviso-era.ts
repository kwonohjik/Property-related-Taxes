/**
 * 「소득세법 시행령」 §154①2호 가목 괄호·나·다목 기한 — **대통령령 제19327호(2006.2.9.) 개정의 적용 범위** 연혁.
 * (개정 없는 확정 역사 데이터. 정적 상수.)
 *
 * 제19327호가 신설한 두 문언:
 *   - 가목 「주택 및 그 부수토지(**사업인정 고시일 전에 취득한 주택 및 그 부수토지에 한한다**)의 …」
 *   - 나·다목 「… 세대전원이 출국하는 경우. 다만, **출국일부터 2년 이내에 양도하는 경우에 한한다**」
 *     (종전 2006.1.1. 시행본은 「국외이주 기타 재정경제부령이 정하는 경우」 — 「소득세법 시행규칙」 제71조제2항 · 양도 기한 없음)
 *
 * 적용 범위(DRF 부칙 원문 2026-10-11 실독, MST 72871 — 조문 상수는 `legal-codes/transfer.ts`의 `ONE_HOUSE_PROVISO_2006_ADDENDA`):
 *
 * | 구간 | 가목 괄호(고시일 전 취득) | 나·다목 2년 기한 | 근거 |
 * |---|---|---|---|
 * | 양도일 < 2006-02-09 | 없음 | 없음 | 부칙 제3조 「시행 후 최초로 양도하는 분부터」 |
 * | 양도일 ≤ 2007-12-31 이고 시행 전 취득한 주택 / 시행 전 출국한 세대 | 없음(종전 규정) | 없음(종전 규정) | 부칙 제30조①·② |
 * | 그 밖 | 적용 | 적용 | 현행 |
 *
 * 경계: 「시행당시 … 취득한/출국한」은 **시행일(2006-02-09) 전**으로 읽었다 — 시행일 당일 취득·출국은 신 규정(확인 필요).
 */
/** 대통령령 제19327호 시행일(공포일 시행) — 이 날 이후 양도분부터 신 문언(부칙 제3조) */
export const PROVISO_2006_REVISION_EFFECTIVE = new Date("2006-02-09");
/** 부칙 제30조 경과조치의 양도 기한 */
export const PROVISO_2006_TRANSITION_TRANSFER_END = new Date("2007-12-31");

const before = (d: Date, limit: Date) => d.getTime() < limit.getTime();

/**
 * 가목 괄호 「사업인정 고시일 전에 취득한 주택에 한한다」가 이 양도에 적용되는가.
 * false면 고시일과 무관하게 수용 단서를 본다(종전 규정).
 */
export function expropriationNoticeDateRequirementApplies(input: { acquisitionDate: Date; transferDate: Date }): boolean {
  if (before(input.transferDate, PROVISO_2006_REVISION_EFFECTIVE)) return false; // 부칙 제3조
  // 부칙 제30조① — 시행 전 취득한 주택을 2007-12-31까지 양도
  if (
    before(input.acquisitionDate, PROVISO_2006_REVISION_EFFECTIVE) &&
    input.transferDate.getTime() <= PROVISO_2006_TRANSITION_TRANSFER_END.getTime()
  ) {
    return false;
  }
  return true;
}

/**
 * 나·다목 「출국일부터 2년 이내에 양도」가 이 양도에 적용되는가.
 * false면 출국 후 양도 기한이 없다(종전 규정).
 */
export function overseasTwoYearDeadlineApplies(input: { departureDate: Date; transferDate: Date }): boolean {
  if (before(input.transferDate, PROVISO_2006_REVISION_EFFECTIVE)) return false; // 부칙 제3조
  // 부칙 제30조② — 시행 전 출국한 세대가 2007-12-31까지 양도
  if (
    before(input.departureDate, PROVISO_2006_REVISION_EFFECTIVE) &&
    input.transferDate.getTime() <= PROVISO_2006_TRANSITION_TRANSFER_END.getTime()
  ) {
    return false;
  }
  return true;
}
