/**
 * 「소득세법 시행령」 §154①2호 후단 — **수용 잔존주택 양도 기한** 연혁 (개정 없는 확정 역사 데이터. 정적 상수.)
 *
 * 「이 경우 가목에 있어서는 그 양도일 또는 수용일부터 N년 이내에 양도하는 그 잔존주택 및 그 부수토지를
 * 포함하는 것으로 한다」의 N (법제처 시행본 실독 2026-10-08):
 *
 * | 양도일 | N | 근거 |
 * |---|---|---|
 * | ~ 2013-02-14 | 2년 | 2013-01-16 시행본(MST 131624) 「2년 이내」 |
 * | 2013-02-15 ~ | 5년 | 대통령령 제24356호(MST 132503) — 부칙 제2조② 「양도소득에 관한 개정규정은 이 영 시행 후 최초로 양도하는 분부터」 |
 *
 * 2005년 전 양도분은 다루지 않는다(사용자 결정 2026-10-07 — 그 전 양도 계산 수요 없음).
 */
export const EXPROPRIATION_REMNANT_5Y_TRANSFER_START = new Date("2013-02-15");

/** 수용일부터 잔존주택을 양도해야 하는 기한(년) — 양도일 기준. */
export function resolveExpropriationRemnantYears(transferDate: Date): 2 | 5 {
  return transferDate.getTime() >= EXPROPRIATION_REMNANT_5Y_TRANSFER_START.getTime() ? 5 : 2;
}
