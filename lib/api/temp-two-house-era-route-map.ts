/**
 * ⑭ §155①2호 조정대상지역 일시적 2주택 사실 — Zod 통과 본문 → 엔진 `temporaryTwoHouse` 하위 필드
 * (OH-01 A2b). 단건(`app/api/calc/transfer/engine-input.ts`)·다건(`multi/route.ts`)이 **같은 함수**를
 * 쓴다 — 한쪽만 매핑하면 그 경로에서 침묵 strip된다(F04 전례).
 *
 * 날짜는 JSON 경유로 string이 되므로 `toOptionalDate`로 바꾼다(`lib/api/date-coerce.ts`).
 */
import type { z } from "zod";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { temporaryTwoHouseSchema } from "./transfer-tax-schema-temp-two-house";

type Parsed = z.infer<typeof temporaryTwoHouseSchema>;

export function mapTemporaryTwoHouseEraFacts(tt: Parsed) {
  return {
    newHouseRegionCode: tt.newHouseRegionCode,
    newHouseRegulatedAtAcquisition: tt.newHouseRegulatedAtAcquisition,
    previousHouseRegulatedAtNewAcquisition: tt.previousHouseRegulatedAtNewAcquisition,
    newHouseContractDate: toOptionalDate(tt.newHouseContractDate),
    wholeHouseholdMoveInDate: toOptionalDate(tt.wholeHouseholdMoveInDate),
    existingTenantLeaseEndDate: toOptionalDate(tt.existingTenantLeaseEndDate),
  };
}
