/**
 * anchor — `isInherited`(§89② 상속 예외 축) 4계층 배관 (C1-01 · Phase 1)
 *
 * 「소득세법 시행령」 §156의2⑥·⑦ · §156의3④·⑤는 **상속받은 권리**를 §89② 배제의 예외로 둔다.
 * 순위 규칙(피상속인 소유·거주기간)은 아직 미구현이라, 엔진은 이 값을 「판정 불가」 신호로 써서
 * **배제를 켜지 않는다**. 즉 이 필드가 어느 층에서든 조용히 사라지면 상속 권리를 가진 세대에
 * §89② 배제가 **잘못 적용**된다 — 세액이 커지는 방향이라 특히 위험하다.
 *
 * ⑫ Zod는 **모르는 키를 조용히 버린다**. 그래서 ④ → ⑫ → ⑭를 실제로 태워 값을 추적한다
 * (memory `feedback_api_zod_schema_sync` · `feedback_leaf_anchor_skips_zod_layer`).
 */
import { describe, it, expect } from "vitest";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
// ⚠️ `transfer-tax-schema-sub`는 barrel(`transfer-tax-schema`)과 **순환 import** 관계다.
//    서브를 먼저 로드하면 barrel의 최상위 스키마 조립이 TDZ로 터진다 — barrel을 먼저 태운다.
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

function entry(over: Partial<PresaleRightEntry> = {}): PresaleRightEntry {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: "2022-03-01",
    region: "capital",
    ...over,
  };
}

describe("isInherited — ④ → ⑫ → ⑭ 4계층 배관", () => {
  it("④ 폼 → payload에 실린다", () => {
    const payload = buildPresaleRightsPayload("housing", [entry({ isInherited: true })]);
    expect(payload?.[0].isInherited).toBe(true);
  });

  it("⑫ Zod가 키를 버리지 않는다", () => {
    const payload = buildPresaleRightsPayload("housing", [entry({ isInherited: true })])![0];
    const parsed = presaleRightSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.isInherited).toBe(true);
  });

  it("⑭ route 매핑이 엔진 입력까지 옮긴다", () => {
    const payload = buildPresaleRightsPayload("housing", [entry({ isInherited: true })])!;
    const parsed = payload.map((p) => presaleRightSchema.parse(p));
    const engineInput = mapPresaleRightsToEngine(parsed);
    expect(engineInput?.[0].isInherited).toBe(true);
  });

  it("미체크는 undefined로 남는다 — 「선언 안 함」과 「상속 아님」을 섞지 않는다", () => {
    const payload = buildPresaleRightsPayload("housing", [entry()])!;
    expect(payload[0].isInherited).toBeUndefined();
    const parsed = presaleRightSchema.parse(payload[0]);
    expect(parsed.isInherited).toBeUndefined();
    expect(mapPresaleRightsToEngine([parsed])?.[0].isInherited).toBeUndefined();
  });

  it("false도 그대로 보존된다 (명시적 「상속 아님」)", () => {
    const payload = buildPresaleRightsPayload("housing", [entry({ isInherited: false })])!;
    const parsed = presaleRightSchema.parse(payload[0]);
    expect(mapPresaleRightsToEngine([parsed])?.[0].isInherited).toBe(false);
  });
});
