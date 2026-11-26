/**
 * ④ 주식 양도세 API 변환 — §97의2④ 가업상속공제 자산 의제 취득가액 body 구성 (800줄 정책 분리)
 *
 * `stock-transfer-tax-api.ts`의 `buildStockTransferApiBody`가 부른다. 단건(`callStockTransferTaxAPI`)과
 * 다종목(`callStockTransferTaxAggregateAPI`의 `items`)이 **같은 빌더**를 거치므로 여기 한 곳이다.
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.4(④⑬)
 *
 * 🔑 술어(`allowsStockFamilyBusiness`)를 통과하고 토글이 ON일 때만 싣는다 — 취득원인·취득방식을 바꾼 뒤
 *    폼에 남은 값(잔존값)이 body에 새면 안 된다(계획서 Q-10 · 값은 지우지 않는다).
 * 🔑 적용률 법정량은 **양도일 era의 쌍만** 싣는다(`buildStockFamilyBusinessInput`). % 직접 입력은 없다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { buildStockFamilyBusinessInput, isStockFbOn } from "./stock-family-business";

export function appendFamilyBusinessBody(body: Record<string, unknown>, form: StockTransferFormData): void {
  if (!isStockFbOn(form)) return;
  const fb = buildStockFamilyBusinessInput(form);
  if (fb) body.familyBusinessInheritance = fb;
}
