/**
 * ⑭ `carryoverTaxation.donorBuilt` 와이어(ISO 문자열) → 엔진 입력(Date) 변환 — 단건·컴패니언 route 매핑이 **같은 함수**를 쓴다.
 *
 * JSON 경유 string 이 엔진에 그대로 도달하면 `Date` 비교(5년 기산 `addYears` · 증여자 취득일 순서)가 침묵 false 가 된다(`lib/api/date-coerce.ts`).
 */
import { toDate } from "./date-coerce";
import type { DonorBuiltWire } from "./transfer-tax-schema-donor-built";
import type { DonorBuiltInput } from "@/lib/tax-engine/types/transfer-carryover.types";

export function toEngineDonorBuilt(db: DonorBuiltWire | undefined, label: string): DonorBuiltInput | undefined {
  if (!db) return undefined;
  return { ...db, constructionDate: toDate(db.constructionDate, `${label}.donorBuilt.constructionDate`) };
}
