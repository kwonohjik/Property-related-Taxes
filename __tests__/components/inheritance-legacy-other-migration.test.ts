/**
 * @vitest-environment jsdom
 *
 * migrateLegacyOtherHeirs — 기존 "기타(other)" 상속인 복원 마이그레이션 anchor
 * 설계: docs/02-design/features/prior-gift-donee-classification-fix.* (후속)
 *
 * 과거 isHeir 미설정으로 저장된 "기타"를 비상속인(false)으로 정규화(신규 기본값 일치).
 * 대습·명시값·비기타는 보존.
 */
import { describe, it, expect } from "vitest";
import { migrateLegacyOtherHeirs } from "@/components/calc/inheritance/shared";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("migrateLegacyOtherHeirs", () => {
  it("M-1 기존 기타(isHeir 미설정·비대습) → isHeir=false (며느리)", () => {
    const form = {
      heirs: [{ id: "o", relation: "other", name: "윤며느리" } as Heir],
    };
    expect(migrateLegacyOtherHeirs(form).heirs[0].isHeir).toBe(false);
  });
  it("M-2 대습(substituteGroupId) → isHeir 미설정 보존(상속인)", () => {
    const form = {
      heirs: [
        { id: "s", relation: "other", substituteGroupId: "subst-1" } as Heir,
      ],
    };
    expect(migrateLegacyOtherHeirs(form).heirs[0].isHeir).toBeUndefined();
  });
  it("M-3 명시 isHeir=true(4촌 방계) 보존", () => {
    const form = {
      heirs: [{ id: "b", relation: "other", isHeir: true } as Heir],
    };
    expect(migrateLegacyOtherHeirs(form).heirs[0].isHeir).toBe(true);
  });
  it("M-4 명시 isHeir=false 보존", () => {
    const form = {
      heirs: [{ id: "o", relation: "other", isHeir: false } as Heir],
    };
    expect(migrateLegacyOtherHeirs(form).heirs[0].isHeir).toBe(false);
  });
  it("M-5 비-기타(child) 무변경", () => {
    const form = { heirs: [{ id: "c", relation: "child" } as Heir] };
    expect(migrateLegacyOtherHeirs(form).heirs[0].isHeir).toBeUndefined();
  });
  it("M-6 변경 없으면 원본 참조 반환 (불필요 리렌더 방지)", () => {
    const form = { heirs: [{ id: "c", relation: "child" } as Heir] };
    expect(migrateLegacyOtherHeirs(form)).toBe(form);
  });
  it("M-7 heirs 없음 → 원본 반환", () => {
    const form = {};
    expect(migrateLegacyOtherHeirs(form)).toBe(form);
  });
});
