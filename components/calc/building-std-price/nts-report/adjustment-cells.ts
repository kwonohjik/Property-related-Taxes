/**
 * 국세청 계산서 Ⅲ·Ⅳ 표의 **조정률 3칸**에 적용 항목 전건을 담는다.
 *
 * 서식은 조정률 칸이 3개로 동결돼 있는데, 엔진은 고시 7구분을 독립 적용해 **최대 7항목**을 낸다.
 * 종전에는 `adjustmentItems?.[0]~[2]` 로 앞 3개만 렌더해 4번째 이후가 경고 없이 사라졌고,
 * 표 머리 산식대로 읽으면 ⑧ 이 재현되지 않았다(실측 6항목 조합: 표시 1.5600 vs 실제 1.0811).
 * PDF 는 전건을 이어 찍어 두 채널이 서로 다른 집합을 보이기까지 했다.
 *
 * ⇒ 3칸을 넘으면 **마지막 칸에 나머지를 병합**한다. 병합 칸의 지수는 나머지 항목들의 곱이므로
 *   세 칸의 곱이 전체 조정률과 정확히 같아진다 — 즉 표만 보고 ⑧ 을 재현할 수 있다.
 */
export interface AdjustmentCell {
  nos: number[];
  rate: number;
}

/** 표시용 칸 수 — 원본 서식 고정값 */
const CELL_COUNT = 3;

export function packAdjustmentCells(
  items: ReadonlyArray<{ nos: number[]; rate: number }> | undefined,
): AdjustmentCell[] {
  const list = items ?? [];
  if (list.length <= CELL_COUNT) return list.map((i) => ({ nos: [...i.nos], rate: i.rate }));

  const head = list.slice(0, CELL_COUNT - 1).map((i) => ({ nos: [...i.nos], rate: i.rate }));
  const tail = list.slice(CELL_COUNT - 1);
  // 나머지 항목의 지수 곱 — 각 지수가 백분율이므로 (곱 ÷ 100^(k−1)) 이 병합 지수다.
  const mergedRate = tail.reduce((acc, i) => acc * i.rate, 1) / 100 ** (tail.length - 1);
  return [...head, { nos: tail.flatMap((i) => i.nos), rate: mergedRate }];
}
