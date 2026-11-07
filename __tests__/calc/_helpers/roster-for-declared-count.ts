/**
 * 시료 정합 — 「다른 보유 주택이 없습니다」 확정(✓) + 세대 주택 수 N(자기 몫과 다름) + 명부 0행을 **같은 주택 수의 명부**로 바꾼다.
 *
 * 그 조합은 확정 사실(다른 주택 없음)과 주택 수가 모순이라 ⑧이 막는다(리뷰 US-31 · `confirmedNoOtherHousesDiverges`).
 * 종전 시료는 이 모순으로 ⑧을 통과시키며 「주택 수 N」 계산을 태웠다. 여기서는 다른 주택 N − 자기 몫 행을 명부에 넣고 확정을 끈다 —
 * 파생 주택 수(자기 몫 + 양도일 전 취득 행)가 N이라 ④가 싣는 주택 수는 같다. 명부가 실리면 엔진이 정밀 판정을 탈 수 있다
 * (주택 수 산정 규칙이 있는 세율표에서만 — 기본 `makeMockRates`에는 규칙이 없어 종전처럼 원시 플래그로 판정한다).
 *
 * 다른 주택 행은 1950-01-01 취득 · 수도권 · 기준시가 3억 아파트(어느 각 호에도 해당하지 않는 일반 주택)다 — 양도 자산보다 먼저 취득해
 * 일시적 2주택의 「신규 주택」 질문이 생기지 않게 한다.
 * 주택 수가 자기 몫보다 작으면(주택인데 0채) 자기 몫으로 맞춘다 — 확정 토글이 켜질 때 쓰는 값과 같다.
 */
import { houseCountSelfOffset, usesHouseCountRoster } from "@/lib/calc/housing-like-asset";
import { householdFactsKindOfForm } from "@/lib/calc/household-facts-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export const otherHouseRow = (id: string): HouseEntry =>
  ({
    id,
    region: "capital",
    acquisitionDate: "1950-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
  }) as unknown as HouseEntry;

export function rosterForDeclaredCount<T>(form: T): T {
  const f = form as unknown as TransferFormData;
  if (!f.householdNoOtherHousesConfirmed || f.legacyHouseCountPrecedence || (f.houses?.length ?? 0) > 0) return form;
  const kind = householdFactsKindOfForm(f);
  if (!usesHouseCountRoster(kind)) return form;
  const declared = parseInt(f.householdHousingCount ?? "", 10);
  const others = declared - houseCountSelfOffset(kind);
  if (others < 0 || Number.isNaN(others)) return { ...f, householdHousingCount: String(houseCountSelfOffset(kind)) } as unknown as T;
  if (others === 0) return form;
  return {
    ...f,
    houses: Array.from({ length: others }, (_, i) => otherHouseRow(`declared-other-${i + 1}`)),
    householdNoOtherHousesConfirmed: false,
  } as unknown as T;
}
