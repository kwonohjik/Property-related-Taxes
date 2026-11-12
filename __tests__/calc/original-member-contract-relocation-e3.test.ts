/**
 * 리뷰 E-3 — 기존주택 원조합원 입주권 행의 새 사실(계약일 · §155⑯) 동기화: ④ payload · ⑧ 검증 · ⑫ Zod · ⑭ Route.
 * 엔진 판정은 `__tests__/tax-engine/transfer/original-member-right-canonical-timing-e3.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { buildPresaleRightsPayload } from "@/lib/calc/presale-rights-payload";
import { originalMemberFactErrors } from "@/lib/calc/right-member-origin-scope";
// ⚠️ barrel과 순환 import — 서브를 먼저 로드하면 TDZ로 터진다(`redev-right-approval-date-plumbing.anchor.test.ts`와 같다).
import "@/lib/api/transfer-tax-schema";
import { presaleRightSchema } from "@/lib/api/transfer-tax-schema-sub";
import { mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";

const row = (over: Partial<PresaleRightEntry> = {}): PresaleRightEntry =>
  ({
    id: "p1",
    type: "redevelopment_right",
    acquisitionDate: "2020-03-02",
    region: "capital",
    memberOrigin: "original_house",
    ...over,
  }) as PresaleRightEntry;

const FACTS = {
  originalMemberContractDate: "2019-12-01",
  originalMemberPublicInstitutionRelocation: true,
  originalMemberRelocatedInstitutionJibun: "충청남도 천안시 서북구 ○○동 1",
  originalMemberRelocatedSigunguCode: "4413300000",
};

describe("④ payload", () => {
  it("기존주택 원조합원 행 → 계약일·⑯ 선언·이전지 코드를 싣는다(지번은 표시용이라 싣지 않는다)", () => {
    const [p] = buildPresaleRightsPayload("housing", [row(FACTS)])!;
    expect(p.originalMemberContractDate).toBe("2019-12-01");
    expect(p.originalMemberPublicInstitutionRelocation).toBe(true);
    expect(p.originalMemberRelocatedSigunguCode).toBe("4413300000");
    expect(p).not.toHaveProperty("originalMemberRelocatedInstitutionJibun");
  });
  it("⑯ 토글을 끄면 남은 이전지 코드는 싣지 않는다", () => {
    const [p] = buildPresaleRightsPayload("housing", [row({ ...FACTS, originalMemberPublicInstitutionRelocation: false })])!;
    expect(p.originalMemberPublicInstitutionRelocation).toBeUndefined();
    expect(p.originalMemberRelocatedSigunguCode).toBeUndefined();
    expect(p.originalMemberContractDate).toBe("2019-12-01");
  });
  it("승계취득·세대원 건물 소유(= 상가·토지 원조합원으로 읽음) 행에 남은 값은 싣지 않는다", () => {
    for (const over of [{ memberOrigin: "successor" as const }, { originalHouseBuildingOwner: "household_member" as const }]) {
      const [p] = buildPresaleRightsPayload("housing", [row({ ...FACTS, ...over })])!;
      expect(p.originalMemberContractDate).toBeUndefined();
      expect(p.originalMemberPublicInstitutionRelocation).toBeUndefined();
    }
  });
});

describe("⑧ 검증", () => {
  it("계약일이 기존주택 취득일보다 늦으면 막는다 · 같은 날은 통과", () => {
    expect(
      originalMemberFactErrors([row({ originalMemberContractDate: "2020-03-03" })], "2021-06-01").map((e) => e.field),
    ).toEqual(["presaleRights.0.originalMemberContractDate"]);
    expect(originalMemberFactErrors([row({ originalMemberContractDate: "2020-03-02" })], "2021-06-01")).toEqual([]);
  });
  it("승계취득 행에 남은 계약일은 보지 않는다(④가 싣지 않는 값)", () => {
    expect(
      originalMemberFactErrors([row({ memberOrigin: "successor", originalMemberContractDate: "2020-03-03" })], "2021-06-01"),
    ).toEqual([]);
  });
});

describe("⑫ Zod · ⑭ Route", () => {
  it("세 필드가 스키마를 통과해 엔진에 Date·코드로 도달한다", () => {
    const [p] = buildPresaleRightsPayload("housing", [row(FACTS)])!;
    const parsed = presaleRightSchema.parse(JSON.parse(JSON.stringify(p)));
    const [r] = mapPresaleRightsToEngine([parsed], "2021-06-01")!;
    expect(r.originalMemberContractDate).toBeInstanceOf(Date);
    expect(r.originalMemberContractDate?.toISOString().slice(0, 10)).toBe("2019-12-01");
    expect(r.originalMemberPublicInstitutionRelocation).toBe(true);
    expect(r.originalMemberRelocatedSigunguCode).toBe("4413300000");
  });
  it("이전지 코드는 10자리 숫자만 받는다", () => {
    expect(() => presaleRightSchema.parse({ id: "p1", type: "redevelopment_right", acquisitionDate: "2020-03-02", region: "capital", originalMemberRelocatedSigunguCode: "44133" })).toThrow();
  });
});
