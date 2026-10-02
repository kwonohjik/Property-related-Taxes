/**
 * anchor: §97 시리즈 「3개월 초과 공실」 선택이 복원(새로고침·이력 불러오기)에서 사라지지 않는다 (C2).
 *
 * 결함(입력 유실): `normalizeRentalAndSplitFields`가 §97 감면의 `hasVacancyOverGrace`를 **매번** null로 되돌렸다.
 *   이 되돌리기는 D1-03(구 키 `hasVacancyOver6Months` = 「6개월 초과 공실」 → 3개월 기준 새 질문)에서 온 것인데,
 *   그 구 키는 폼 키 자체가 달라서 **새 키(`hasVacancyOverGrace`)가 있다는 것은 새 질문에 답했다는 뜻**이다.
 *   그런데도 새 키까지 지워 「없음」을 고른 뒤 새로고침하면 라디오가 풀렸다(R1과 같은 부류 — 막다른 길은 아님).
 *
 * ⇒ 새 키가 있으면 보존하고(true/false 모두), **없을 때만** null(미선택)로 둔다. 구 세션은 새 키가 없으므로
 *   D1-03 의도(다시 묻기)는 그대로다.
 */
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getStandaloneDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

const RENTAL_TYPES = ["rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_3", "rental_97_4", "rental_97_5"] as const;

function restoredVacancy(type: string, patch: Record<string, unknown>) {
  const base = getStandaloneDefault(type as never) as unknown as Record<string, unknown>;
  const raw = { ...makeDefaultAsset(1), reductions: [{ ...base, type, ...patch }] };
  const migrated = migrateAsset(raw) as unknown as { reductions: Array<Record<string, unknown>> };
  return migrated.reductions[0].hasVacancyOverGrace;
}

describe("C2 — 복원이 hasVacancyOverGrace 선택을 지우지 않는다", () => {
  for (const type of RENTAL_TYPES) {
    it(`🔑 ${type}: 「없음」(false) 보존`, () => {
      expect(restoredVacancy(type, { hasVacancyOverGrace: false })).toBe(false);
    });
    it(`🔑 ${type}: 「있음」(true) 보존`, () => {
      expect(restoredVacancy(type, { hasVacancyOverGrace: true, vacancyPeriods: [{ startDate: "", endDate: "" }] })).toBe(true);
    });
  }

  it("긍정 짝: 미선택(null)은 null 그대로", () => {
    expect(restoredVacancy("rental_97_main", { hasVacancyOverGrace: null })).toBeNull();
  });
  it("긍정 짝(D1-03 의도 보존): 새 키가 없는 구 세션은 null — 다시 묻는다", () => {
    expect(restoredVacancy("rental_97_main", { hasVacancyOverGrace: undefined, hasVacancyOver6Months: false })).toBeNull();
  });
});
