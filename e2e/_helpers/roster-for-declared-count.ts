/**
 * E2E 시드 정합 — 「다른 보유 주택이 없습니다」 확정(✓) + 세대 주택 수 N(자기 몫과 다름) + 명부 0행을 **같은 주택 수의 명부**로 바꾼다.
 *
 * 그 조합은 ⑧이 막는다(리뷰 US-31 — `lib/calc/household-house-count.ts` `confirmedNoOtherHousesDiverges`). 다른 주택 N − 자기 몫 행을 넣고
 * 확정을 끈다 — 파생 주택 수가 N이라 ④가 싣는 주택 수는 같다. vitest 시료는 `__tests__/calc/_helpers/roster-for-declared-count.ts`(같은 규칙).
 */
import { houseCountSelfOffset, usesHouseCountRoster } from "../../lib/calc/housing-like-asset";
import { householdFactsKindOfForm } from "../../lib/calc/household-facts-asset";

type Seed = Record<string, unknown>;

export function rosterForDeclaredCount<T extends Seed>(form: T): T {
  const f = form as Seed & { assets?: { assetKind?: string }[]; houses?: unknown[] };
  if (f.householdNoOtherHousesConfirmed !== true || f.legacyHouseCountPrecedence === true || (f.houses?.length ?? 0) > 0) return form;
  if (!Array.isArray(f.assets)) return form;
  const kind = householdFactsKindOfForm(f as never);
  if (!usesHouseCountRoster(kind)) return form;
  const declared = parseInt(String(f.householdHousingCount ?? ""), 10);
  const others = declared - houseCountSelfOffset(kind);
  if (others < 0 || Number.isNaN(others)) return { ...form, householdHousingCount: String(houseCountSelfOffset(kind)) };
  if (others === 0) return form;
  return {
    ...form,
    houses: Array.from({ length: others }, (_, i) => ({
      id: `declared-other-${i + 1}`,
      region: "capital",
      acquisitionDate: "1950-01-01",
      officialPrice: "300000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
    })),
    householdNoOtherHousesConfirmed: false,
  };
}

/** sessionStorage 시드(`{ state: { formData } }`) 또는 formData 자체에 `rosterForDeclaredCount`를 적용한다. */
export function seedWithDeclaredRoster<T>(seed: T): T {
  if (!seed || typeof seed !== "object") return seed;
  const s = seed as { state?: { formData?: Seed } } & Seed;
  if (s.state?.formData) return { ...s, state: { ...s.state, formData: rosterForDeclaredCount(s.state.formData) } } as T;
  if (Array.isArray(s.assets)) return rosterForDeclaredCount(s) as T;
  return seed;
}
