/**
 * 같은 날 양도 순서(소득세법 시행령 §154⑨) — 화면·결과가 읽는 **파생 사실**과 고지 문구 (결정 #40).
 *
 * 술어는 `same-day-transfer-order.ts`, 주택 수에서 빼는 일은 `household-house-count.ts`의 `housesOwnedAtTransfer` 한 곳이다.
 * 여기는 「무엇을 뺐는가」「순서를 안 골랐는가」를 **읽기만** 한다 — store에 쓰지 않는다(useEffect 미러링 금지).
 */
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import {
  countedHouseRows,
  isOwnedAtTransfer,
  type HouseRowForCount,
} from "@/lib/calc/household-house-count";
import { houseCountSelfOffset } from "@/lib/calc/housing-like-asset";
import { isSameDayFirstTransferred, isSameDayOrderUndecided } from "@/lib/calc/same-day-transfer-order";

export interface SameDayRowRef<T extends HouseRowForCount> {
  /** 명부 화면의 순번(1부터) — 표의 「No.」와 같다. */
  no: number;
  row: T;
}

function rowsWhere<T extends HouseRowForCount>(
  houses: readonly T[] | undefined,
  transferDate: string | undefined,
  pred: (h: T) => boolean,
): SameDayRowRef<T>[] {
  const out: SameDayRowRef<T>[] = [];
  (houses ?? []).forEach((row, i) => {
    // 취득일이 있고 양도일 현재 이미 취득한 행만 — 같은 날·이후 취득 행은 다른 사유(양도 후 취득)로 이미 빠진다.
    if (row.acquisitionDate && isOwnedAtTransfer(row.acquisitionDate, transferDate) && pred(row)) out.push({ no: i + 1, row });
  });
  return out;
}

/** §154⑨ 선택(「먼저 양도」)으로 주택 수에서 뺀 행 — 결과 화면·사이드바 표시용. */
export function sameDayExcludedRows<T extends HouseRowForCount>(
  houses: readonly T[] | undefined,
  transferDate: string | undefined,
): SameDayRowRef<T>[] {
  return rowsWhere(houses, transferDate, isSameDayFirstTransferred);
}

/** 같은 날 양도라고 표시했지만 순서를 고르지 않아 주택 수에 넣은 행. */
export function sameDayUndecidedRows<T extends HouseRowForCount>(
  houses: readonly T[] | undefined,
  transferDate: string | undefined,
): SameDayRowRef<T>[] {
  return rowsWhere(houses, transferDate, isSameDayOrderUndecided);
}

/** 결과 화면 한 줄 — 「보유 주택 2(취득일 2018-01-01)」. */
export function sameDayRowLabel(ref: SameDayRowRef<HouseRowForCount>): string {
  return `보유 주택 ${ref.no}(취득일 ${ref.row.acquisitionDate})`;
}

/** 결과·사이드바에 같이 쓰는 근거 문구. */
export const SAME_DAY_EXCLUDED_BASIS = `${TRANSFER.SAME_DAY_TRANSFER_ORDER}(중과는 ${TRANSFER.SAME_DAY_TRANSFER_ORDER_SURCHARGE}이 준용)`;

/**
 * 순서를 고르지 않았을 때의 고지 — **결론을 가를 수 있을 때만**(세대 주택 수가 2채 이상일 때) 낸다.
 *
 * 주택 수가 1채 이하면 그 행을 빼도 1주택 판정·중과 판정이 바뀔 수 없다. 2채 이상이면 먼저 양도한 것으로 선택할 때
 * 비과세 여부·중과 주택 수가 달라질 수 있다. 어느 쪽이 유리한지는 말하지 않는다 — 선택은 거주자의 몫이다(법문).
 */
export function sameDayOrderNotice(args: {
  primaryKind: string | undefined;
  houses: readonly HouseRowForCount[] | undefined;
  transferDate: string | undefined;
}): string | null {
  const undecided = sameDayUndecidedRows(args.houses, args.transferDate);
  if (undecided.length === 0) return null;
  const total = houseCountSelfOffset(args.primaryKind) + countedHouseRows(args.houses, args.transferDate);
  if (total < 2) return null;
  const labels = undecided.map((r) => `보유 주택 ${r.no}`).join("·");
  return (
    `${labels}은(는) 같은 날 양도한다고 표시했지만 양도 순서를 고르지 않아 양도일 현재 보유 주택(주택 수)에 넣어 판정했습니다. ` +
    `2개 이상의 주택을 같은 날 양도하면 거주자가 선택하는 순서대로 양도한 것으로 보므로(${TRANSFER.SAME_DAY_TRANSFER_ORDER}) ` +
    `「먼저 양도한 것으로 선택」하면 그 주택이 주택 수에서 빠져 판정이 달라질 수 있습니다(확인 필요).`
  );
}
