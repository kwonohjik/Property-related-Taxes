/**
 * R-c07-06 — 판정 출처 줄·판정 불러오기 모달의 「저장」 날짜는 한국 시간 기준이다.
 * record의 `updatedAt`은 UTC ISO라 `slice(0, 10)`이면 KST 00:00~08:59 저장분이 하루 전으로 보였다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { kstDateOfIso } from "@/lib/utils/kst-date";

describe("kstDateOfIso (R-c07-06)", () => {
  it("🔑 2026-11-21 08:30 KST(= 11-20 23:30 UTC) 저장 → 2026-11-21", () => {
    expect(kstDateOfIso("2026-11-20T23:30:00.000Z")).toBe("2026-11-21");
  });
  it("경계 — KST 23:59:59는 그날, 자정부터 다음날", () => {
    expect(kstDateOfIso("2026-11-20T14:59:59.999Z")).toBe("2026-11-20");
    expect(kstDateOfIso("2026-11-20T15:00:00.000Z")).toBe("2026-11-21");
  });
  it("해석할 수 없는 값은 앞 10자 그대로", () => {
    expect(kstDateOfIso("2026-11-21")).toBe("2026-11-21");
    expect(kstDateOfIso("garbage-value-x")).toBe("garbage-va");
  });
  it("출처 줄·불러오기 모달 둘 다 UTC 앞 10자 자르기를 쓰지 않는다", () => {
    for (const f of [
      "components/calc/results/transfer/OneHouseJudgmentProvenanceLine.tsx",
      "components/calc/transfer/OneHouseJudgmentLoadModal.tsx",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/updatedAt\.slice\(0, 10\)/);
      expect(src).toContain("kstDateOfIso(");
    }
  });
});
