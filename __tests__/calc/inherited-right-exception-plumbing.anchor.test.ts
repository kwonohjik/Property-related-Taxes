/**
 * anchor — §89② 상속 권리 예외 ④→⑫→⑭ 배관 (C1-01 Phase 3)
 *
 * 신규 필드가 **9개**(권리 7 + 폼-전역 2)라 한 층만 빠져도 조용히 사라진다.
 * ⑫ Zod는 모르는 키를 버리고, 그 결과는 **비과세를 더 주는 방향**(예외가 인정되지 않아
 * 판정 불가로 남음)이거나 **덜 주는 방향**(부정 선언이 사라져 예외가 잘못 인정됨)으로 갈린다.
 *
 * 🔑 특히 `decedentOwnedHouseAtDeath`가 사라지면 「피상속인이 주택을 보유했다」는 사실이
 *    엔진에 닿지 않아 §156의2⑥이 **잘못 인정**된다(과소과세).
 */
import { describe, it, expect } from "vitest";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
// ⚠️ barrel과 순환 import — 서브를 먼저 로드하면 TDZ로 터진다.
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

/** 권리 항목의 상속 축 7필드 — ①④⑫⑭ 네 층을 모두 지나야 한다. */
const RIGHT_FIELDS = [
  "isRankingDisqualifiedInheritedRight",
  "isCoInherited",
  "isLargestCoInheritedShareholder",
  "decedentOwnedHouseAtDeath",
  "decedentOwnedOtherRightTypeAtDeath",
  "decedentSameHouseholdAtInheritance",
  "parentalCareMergeInheritedRight",
] as const;

function entry(over: Partial<PresaleRightEntry> = {}): PresaleRightEntry {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: "2022-03-01",
    region: "capital",
    isInherited: true,
    ...over,
  };
}

/** ④ → ⑫ → ⑭ 전 구간을 실제로 태운다. */
function throughAllLayers(e: PresaleRightEntry) {
  const payload = buildPresaleRightsPayload("housing", [e]);
  if (!payload) throw new Error("④ payload 없음");
  const parsed = payload.map((p) => presaleRightSchema.parse(p));
  const engine = mapPresaleRightsToEngine(parsed);
  if (!engine) throw new Error("⑭ 매핑 없음");
  return engine[0];
}

describe("권리 항목 상속 7필드 — ④→⑫→⑭", () => {
  it("★ `true`가 전 구간을 살아서 통과한다", () => {
    const over = Object.fromEntries(RIGHT_FIELDS.map((f) => [f, true]));
    const engine = throughAllLayers(entry(over)) as unknown as Record<string, unknown>;
    for (const f of RIGHT_FIELDS) {
      expect(engine[f], f).toBe(true);
    }
  });

  it("🔑 `false`도 보존된다 — 「선언 안 함」과 「아님」을 섞지 않는다", () => {
    const over = Object.fromEntries(RIGHT_FIELDS.map((f) => [f, false]));
    const engine = throughAllLayers(entry(over)) as unknown as Record<string, unknown>;
    for (const f of RIGHT_FIELDS) {
      expect(engine[f], f).toBe(false);
    }
  });

  it("미선언은 undefined로 남는다", () => {
    const engine = throughAllLayers(entry()) as unknown as Record<string, unknown>;
    for (const f of RIGHT_FIELDS) {
      expect(engine[f], f).toBeUndefined();
    }
  });

  it("⑫ 스키마가 7필드를 **전부** 안다 (집합 대조 — 한 방향이라도 어긋나면 strip)", () => {
    const payload = buildPresaleRightsPayload(
      "housing",
      [entry(Object.fromEntries(RIGHT_FIELDS.map((f) => [f, true])))],
    )![0] as unknown as Record<string, unknown>;
    for (const f of RIGHT_FIELDS) {
      expect(Object.keys(payload), `④ payload에 ${f}`).toContain(f);
      const parsed = presaleRightSchema.parse(payload) as unknown as Record<string, unknown>;
      expect(Object.keys(parsed), `⑫ 통과 후 ${f}`).toContain(f);
    }
  });
});
