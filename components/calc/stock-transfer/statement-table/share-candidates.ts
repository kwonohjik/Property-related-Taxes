/**
 * share-candidates — 주식수 칸의 «값 후보» (계획서 §4.7 · Q-1).
 *
 * 후보 둘:
 *   1. Step1 「양도·취득 일자 및 주식수」의 **발행주식 총수** (`totalIssuedShares`)
 *   2. **상대 계산서**의 같은 열 주식수 (순손익 ↔ 순자산)
 *
 * 2번이 후보인 근거는 종전 화면의 안내 문구다 — *"순손익 주식수와 보통 동일.
 * 분할·증자 시에만 다르게 입력하세요."* 그 관계를 클릭 한 번으로 옮길 수 있게 한다.
 *
 * 🔴 **자동 채움이 아니다.** 값이 비어 있어도 알아서 넣지 않는다 — 사용자가 칩을 눌러야 한다.
 *    [[feedback_useeffect_store_mirror_forbidden]] · [[feedback_no_silent_apportion_fallback]]
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StatementColumn } from "./statement-table-types";

export function shareCandidates(
  form: StockTransferFormData,
  col: StatementColumn,
  /** 상대 계산서의 주식수 폼 키 prefix — 순손익에서는 `naShareCount`, 순자산에서는 `niShareCount` */
  counterpartPrefix: "niShareCount" | "naShareCount",
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];

  const issued = (form.totalIssuedShares ?? "").replace(/,/g, "");
  if (issued) out.push({ label: "발행주식 총수", value: issued });

  const counterpart = (
    (form[`${counterpartPrefix}${col}` as keyof StockTransferFormData] as string) ?? ""
  ).replace(/,/g, "");
  if (counterpart && counterpart !== issued) {
    out.push({
      label: counterpartPrefix === "naShareCount" ? "순자산 주식수" : "순손익 주식수",
      value: counterpart,
    });
  }

  return out;
}
