/**
 * §63④ 예금·적금 auto 모드 미수이자·원천징수세액 — route(⑭) 주입.
 *
 * 엔진은 날짜 연산을 하지 않아 auto 모드 항목은 **주입된 미수이자**를 기대한다(없으면 원금만으로 평가).
 * 종전에는 화면 ④(`InheritanceTaxForm` buildInput·`gift-api` buildGiftTaxInput)만 주입해
 * API 직접 호출은 원금만으로 계산됐다(2026-09-30 Zod↔엔진 필수 점검 2차 「저축」).
 *
 * ④와 **같은 leaf·같은 평가기준일**(상속개시일·증여일)을 쓴다. auto 모드는 항상 다시 계산해 덮어쓰므로
 * ④가 이미 주입한 요청에는 같은 값이 다시 들어간다(멱등).
 */
import { toDate } from "@/lib/api/date-coerce";
import { injectSavingsAccrualIfAuto } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export function injectSavingsAccrualForItems<T>(items: T[], valuationDate: string, field: string): T[] {
  const date = toDate(valuationDate, field);
  return items.map((i) => injectSavingsAccrualIfAuto(i as unknown as EstateItem, date) as unknown as T);
}
