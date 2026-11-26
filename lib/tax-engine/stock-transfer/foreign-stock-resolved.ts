/**
 * 국외주식 단건 — §97의2① 이월과세 판정(②3호 비교)을 거친 계산
 *
 * `stock-transfer-tax.ts`(800줄 정책 위험구간)에 이 배선을 넣지 않으려 떼어 낸 얇은 진입점이다.
 * 단건도 합산과 **같은 `resolveStockCarryover`** 를 탄다(dual-truth 방지 — 종목 1건이면 전체 결정세액이
 * 곧 그 종목의 결정세액이다). 단건 비교 금액은 산출세액 − 외국납부세액공제(가산세 제외, 계획서 Q-7).
 *
 * ⚠️ 이월과세를 선언하지 않았으면 `resolveStockCarryover`가 입력을 그대로 돌려줘 기존 경로는 바뀌지 않는다.
 */
import { calculateForeignStockTax } from "./foreign-stock";
import { foreignDecidedTax } from "./foreign-stock-carryover";
import { resolveStockCarryover } from "./stock-carryover";
import type { ForeignStockInput, ForeignStockResult } from "./types/foreign-stock.types";

export function calculateForeignStockTaxResolved(input: ForeignStockInput): ForeignStockResult {
  const [resolved] = resolveStockCarryover(
    [input],
    (list) => foreignDecidedTax(calculateForeignStockTax(list[0])),
    (i) => calculateForeignStockTax(i).transferGain,
  );
  return calculateForeignStockTax(resolved);
}
