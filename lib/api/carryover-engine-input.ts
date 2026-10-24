/**
 * ⑭ `carryoverTaxation`(§97의2) 와이어 → 엔진 입력 변환 — 단건·컴패니언 route 매핑이 **같은 함수**를 쓴다.
 *
 * **키를 열거하지 않는다**(spread + 일자만 덮어쓰기). 종전 열거형은 ⑫·④가 실제로 보내던
 * `donorRelation`·`donorDeceased`(① 관계요건 배제 판정축)를 빠뜨려 침묵 strip했다. spread는 키를 세지
 * 않으므로 누락이 구조적으로 불가능하다 — ⑫에 필드가 늘면 여기 수정 없이 따라간다.
 * ⚠️ 반대 방향은 tsc가 잡지 못한다(spread에는 excess property check가 걸리지 않는다).
 *    ⑫에 엔진 미수용 필드를 추가할 때는 여기서 걸러낼 것.
 *
 * 일자는 `toDate` 필수 — JSON 경유 string이 그대로 도달하면 `Date < string` 비교가 침묵 false가 된다
 * (`lib/api/date-coerce.ts`). 게이트(`acquisitionCause === "carryover_gift"`)는 엔진이 판정한다.
 */
import type { z } from "zod";
import { toDate, toOptionalDate } from "./date-coerce";
import { toEngineDonorBuilt } from "./donor-built-engine-input";
import type { carryoverTaxationEngineShape } from "./transfer-tax-building-schemas";
import type { CarryoverTaxationInput } from "@/lib/tax-engine/types/transfer-carryover.types";

export function toEngineCarryoverTaxation(
  ct: z.infer<typeof carryoverTaxationEngineShape> | undefined,
  /** 오류 메시지의 필드 경로 접두사 — 예: `carryoverTaxation` · `companionAssets[].carryoverTaxation` */
  label: string,
): CarryoverTaxationInput | undefined {
  if (!ct) return undefined;
  return {
    ...ct,
    giftRegistryDate: toDate(ct.giftRegistryDate, `${label}.giftRegistryDate`),
    donorAcquisitionDate: toDate(ct.donorAcquisitionDate, `${label}.donorAcquisitionDate`),
    // 결정 #33·#34 — 세대 보유 시작일도 일자라 spread의 string을 덮어쓴다(전송하지 않았으면 undefined).
    donorHouseholdHoldingStartDate: toOptionalDate(ct.donorHouseholdHoldingStartDate),
    // §114조의2 증여자 신축·증축 — 신축·증축일(Date).
    donorBuilt: toEngineDonorBuilt(ct.donorBuilt, label),
  };
}
