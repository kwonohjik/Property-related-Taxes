/**
 * 「소득세법 시행령」 §155① **조정대상지역 처분기한 단축 규정의 위치** — 양도일 연혁별 호 번호 (X2-1)
 *
 * 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」하면 처분기한이 짧아지는
 * 규정은 시행본마다 **들어 있는 칸이 다르다**(법제처 시행일자별 원문 확인 — 2026-10-11):
 *
 * | 양도일 | 단축 규정의 위치 | 시행본 |
 * |---|---|---|
 * | 2018-10-23 ~ 2020-02-10 | 호 없음 — ① 본문의 「3년 이내[… 2년 이내]」 괄호 | MST 207800(2019.4.1. 시행) |
 * | 2020-02-11 ~ 2023-01-11 | **①2호** (1호는 3년 일반 기한) | MST 214635(2020.2.18.) · MST 242735(2022.5.31.) |
 * | 2023-01-12 ~ 2026-09-30 | 없음 (조정 구분 없이 본문 3년) | 제33267호 |
 * | 2026-10-01 이후 | **①1호** (2호는 「제1호 외의 경우: 3년」) | MST 290841(2026.10.1.) |
 *
 * 연혁 경계는 `temporary-two-house-deadline-era.ts`의 상수를 그대로 쓴다 — 날짜를 여기서 다시 적지 않는다.
 * 2026-10-01 이후 「①2호」는 단축이 **아닌** 3년 쪽을 가리키므로, 단축을 말하는 문구가 그것을 인용하면 반대 조문이 된다.
 */
import {
  TT_REGULATED_1Y_TRANSFER_START,
  TT_REGULATED_2026_TRANSFER_START,
  TT_REGULATED_ABOLISHED_TRANSFER_START,
} from "./temporary-two-house-deadline-era";

/** `§155` 뒤에 붙는 항·호 표기 — 호가 없는 시행본(본문 괄호)과 단축 규정이 없는 구간은 `"①"`. */
export type RegulatedShortenedClauseRef = "①" | "①1호" | "①2호";

export function resolveRegulatedShortenedClauseRef(transferDate: Date): RegulatedShortenedClauseRef {
  const t = transferDate.getTime();
  if (t >= TT_REGULATED_2026_TRANSFER_START.getTime()) return "①1호";
  if (t >= TT_REGULATED_ABOLISHED_TRANSFER_START.getTime()) return "①";
  if (t >= TT_REGULATED_1Y_TRANSFER_START.getTime()) return "①2호";
  return "①";
}
