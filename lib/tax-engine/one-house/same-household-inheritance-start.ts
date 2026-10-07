import type { TransferTaxInput } from "../types/transfer.types";

/**
 * §154⑧3호 동일세대 상속 — 상속개시 전 동일세대로 보유하기 시작한 날(보유기간 통산 기산일).
 *
 * M4 — 거주요건의 「취득 당시」(조정대상지역 여부 · 2017.8.3. 경과규정)도 이 날로 본다:
 * 서면-2020-법령해석재산-3884(2017.8.2. 이전 동일세대 피상속인 취득 → 2017.8.3. 이후 상속받아 양도해도 거주요건
 * 없음) · 서면-2024-부동산-2580(동일세대 피상속인이 지정 중 취득 → 해제 뒤 상속 → 거주요건 적용).
 * 보유 기산일(`resolveBaseHoldingStartDate`)과 같은 조건이다 — 두 벌로 두면 한쪽만 옮겨진다.
 * 판정 메뉴 ⑤(취득 당시 조정대상지역 자동 판정)도 이 함수로 기준일을 고른다.
 */
export function sameHouseholdInheritanceHoldingStart(
  input: Pick<
    TransferTaxInput,
    "acquisitionCause" | "decedentSameHouseholdBeforeInheritance" | "decedentCohabitationHoldingStartDate" | "acquisitionDate"
  >,
): Date | undefined {
  return input.acquisitionCause === "inheritance" &&
    input.decedentSameHouseholdBeforeInheritance === true &&
    input.decedentCohabitationHoldingStartDate &&
    input.decedentCohabitationHoldingStartDate < input.acquisitionDate
    ? input.decedentCohabitationHoldingStartDate
    : undefined;
}
