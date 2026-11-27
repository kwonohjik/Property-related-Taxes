/**
 * 국외전출세 국외주식 — 입력 중 간주양도가액(원화 환산) 미리보기 (엔진 환산 leaf 호출)
 *
 * 환산은 **엔진의 `toKrwExact`**(종목당 총액 1회 절사 · 정수 산술)를 그대로 쓴다 — 화면에서 `Math.floor(외화 × 환율 × 주수)`를
 * 다시 쓰면 부동소수 오차로 1원이 갈리고(10,000 × 40 × 1,300.10 → 520,039,999), 5억 경계(영 §178의8②1호)의 과세/제외 판단 근거가 어긋난다.
 * 합계·임계 비교는 엔진 몫이다 — 이 미리보기는 **종목별 값**까지만 만들고 «제외 예상» 같은 판정을 하지 않는다(계획 D-5).
 */

import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-store";
import { toKrwExact } from "@/lib/tax-engine/stock-transfer/exit-tax-fx";
import { parseFloatOrUndef, parseIntOrUndef } from "./stock-transfer-tax-api-parse";

/** 국외주식 행의 출국일 시가 총액(원화, 환산 참고). 입력이 덜 찼거나 환산 불가면 null */
export function foreignDepartureValueKrw(h: ExitTaxHoldingForm): number | null {
  if (h.marketType !== "foreign_stock") return null;
  const shares = parseIntOrUndef(h.shareCount);
  const price = parseFloatOrUndef(h.departureDayPriceForeign);
  const rate = parseFloatOrUndef(h.departureExchangeRate);
  if (shares === undefined || price === undefined || rate === undefined) return null;
  try {
    const krw = toKrwExact(price, rate, shares);
    return krw > 0 ? krw : null;
  } catch {
    return null;
  }
}
