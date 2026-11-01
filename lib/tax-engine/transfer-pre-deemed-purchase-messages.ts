/**
 * 의제취득일 전 «매수» 영 §176조의2④ — ⑧·⑫ 공용 문구.
 * 화면(⑤⑧)이 import하므로 엔진 본체(`transfer-pre-deemed-purchase.ts` → `transfer-tax-helpers` → DB)를 끌어오지 않게 따로 둔다.
 */
import { TRANSFER } from "./legal-codes/transfer";

/** 1965.01. 전 취득 + 배율 미입력(Q-7) */
export const PRE_DEEMED_PURCHASE_PPI_RATIO_REQUIRED_MESSAGE =
  "실제 취득월이 생산자물가지수 계열(1965.01.~) 전이라 물가상승 배율을 직접 입력해야 합니다 — " +
  `배율은 1984.12. 지수를 취득월 지수로 나눈 비율 (${TRANSFER.PRE_DEEMED_PURCHASE_MAX} 2호 · ${TRANSFER.PRE_DEEMED_PPI_RATE_RULE})`;
