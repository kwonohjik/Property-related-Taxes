/**
 * anchor — §89② 조합원입주권 축 시행일 필드 ④→⑫→⑭ 배관 (R-2)
 *
 * `managementDisposalApprovalDate`는 **일자**라 층마다 다르게 깨진다:
 *   · ④ 빈 문자열(미입력)을 그대로 실으면 ⑫가 `z.string().date()`로 400을 낸다
 *   · ⑫ 모르는 키는 조용히 버려진다
 *   · ⑭ string → Date 변환을 빠뜨리면 `Date < string` 비교가 **침묵 false**가 되어
 *     2006-01-01 전 인가분이 그대로 §89② 대상이 된다(`lib/api/date-coerce.ts` 규약)
 *
 * ⚠️ 이 필드가 사라지면 **불리 방향**이다 — 적용 대상이 아닌 입주권이 대상이 되어
 *    1세대1주택 비과세가 잘못 배제된다.
 */
import { describe, it, expect } from "vitest";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
// ⚠️ barrel과 순환 import — 서브를 먼저 로드하면 TDZ로 터진다(Phase 1 전례).
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

function entry(over: Partial<PresaleRightEntry> = {}): PresaleRightEntry {
  return {
    id: "r1",
    type: "redevelopment_right",
    acquisitionDate: "2015-10-01",
    region: "capital",
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

describe("④ → ⑫ → ⑭", () => {
  it("★ 인가일이 전 구간을 살아서 통과하고 **Date**로 도착한다", () => {
    const engine = throughAllLayers(entry({ managementDisposalApprovalDate: "2005-06-01" }));
    expect(engine.managementDisposalApprovalDate).toBeInstanceOf(Date);
    expect(engine.managementDisposalApprovalDate!.toISOString().slice(0, 10)).toBe("2005-06-01");
  });

  it("🔑 미입력(빈 문자열)은 키를 만들지 않는다 — ⑫가 400을 내면 안 된다", () => {
    const payload = buildPresaleRightsPayload("housing", [
      entry({ managementDisposalApprovalDate: "" }),
    ])![0];
    expect(payload.managementDisposalApprovalDate).toBeUndefined();
    expect(() => presaleRightSchema.parse(payload)).not.toThrow();
    expect(throughAllLayers(entry()).managementDisposalApprovalDate).toBeUndefined();
  });

  it("⑫ 스키마가 이 키를 안다 (집합 대조 — 어긋나면 침묵 strip)", () => {
    const payload = buildPresaleRightsPayload("housing", [
      entry({ managementDisposalApprovalDate: "2010-05-01" }),
    ])![0] as unknown as Record<string, unknown>;
    expect(Object.keys(payload)).toContain("managementDisposalApprovalDate");
    const parsed = presaleRightSchema.parse(payload) as unknown as Record<string, unknown>;
    expect(Object.keys(parsed)).toContain("managementDisposalApprovalDate");
  });

  it("⑫ 일자 형식이 아니면 거부한다", () => {
    expect(
      presaleRightSchema.safeParse({
        ...entry(),
        managementDisposalApprovalDate: "2005-06",
      }).success,
    ).toBe(false);
  });

  it("🔑 분양권 행에도 키 자체는 통과한다 — 게이트는 엔진 술어가 종류로 가른다", () => {
    // ⑤는 조합원입주권 행에만 칸을 열지만, ④가 종류를 재판정하면 진실이 둘이 된다.
    const engine = throughAllLayers(
      entry({ type: "presale_right", managementDisposalApprovalDate: "2010-05-01" }),
    );
    expect(engine.managementDisposalApprovalDate).toBeInstanceOf(Date);
  });
});
