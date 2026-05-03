import { describe, it, expect } from "vitest";
import { toDate, toOptionalDate, coerceDates } from "@/lib/api/date-coerce";

describe("date-coerce — silent string|Date 비교 버그 차단 헬퍼", () => {
  describe("toDate (필수)", () => {
    it("ISO 문자열 → Date", () => {
      const d = toDate("2026-05-03", "transferDate");
      expect(d).toBeInstanceOf(Date);
      expect(d.getFullYear()).toBe(2026);
    });
    it("Date 객체는 그대로 통과", () => {
      const orig = new Date("2026-05-03");
      expect(toDate(orig, "x")).toBe(orig);
    });
    it("invalid 문자열 → throw", () => {
      expect(() => toDate("not-a-date", "x")).toThrow(/Invalid date string/);
    });
    it("undefined → throw (필수 필드)", () => {
      expect(() => toDate(undefined, "transferDate")).toThrow(/Expected Date/);
    });
    it("invalid Date 객체 → throw", () => {
      expect(() => toDate(new Date("invalid"), "x")).toThrow(/Invalid Date/);
    });
  });

  describe("toOptionalDate", () => {
    it.each([null, undefined, ""])("%p → undefined", (v) => {
      expect(toOptionalDate(v)).toBeUndefined();
    });
    it("ISO 문자열 → Date", () => {
      const d = toOptionalDate("2026-04-21");
      expect(d).toBeInstanceOf(Date);
      expect(d?.getMonth()).toBe(3);
    });
    it("invalid 문자열 → undefined (silent skip)", () => {
      expect(toOptionalDate("not-a-date")).toBeUndefined();
    });
  });

  describe("coerceDates — 선언형 bulk", () => {
    it("최상위 경로", () => {
      const out = coerceDates(
        { transferDate: "2026-05-03", other: 42 },
        ["transferDate"]
      );
      expect(out.transferDate).toBeInstanceOf(Date);
      expect(out.other).toBe(42);
    });

    it("중첩 경로", () => {
      const out = coerceDates(
        { partialUsageChange: { usageChangeDate: "2025-01-15", mode: "x" } },
        ["partialUsageChange.usageChangeDate"]
      );
      expect((out.partialUsageChange as { usageChangeDate: unknown }).usageChangeDate).toBeInstanceOf(Date);
    });

    it("배열 요소 [] 표기", () => {
      const out = coerceDates(
        {
          assets: [
            { acquisitionDate: "2020-03-10" },
            { acquisitionDate: "2022-07-22" },
          ],
        },
        ["assets[].acquisitionDate"]
      );
      const arr = out.assets as unknown as Array<{ acquisitionDate: Date }>;
      expect(arr[0].acquisitionDate).toBeInstanceOf(Date);
      expect(arr[1].acquisitionDate).toBeInstanceOf(Date);
    });

    it("경로 없음·null·빈문자열은 건너뜀", () => {
      const out = coerceDates(
        { a: null, b: { c: "" }, d: undefined },
        ["a", "b.c", "d", "nonexistent.path"]
      );
      expect(out.a).toBeNull();
      expect((out.b as { c: unknown }).c).toBe("");
      expect(out.d).toBeUndefined();
    });

    it("invalid 문자열 → throw (silent 차단 목적)", () => {
      expect(() =>
        coerceDates({ transferDate: "garbage" }, ["transferDate"])
      ).toThrow(/Invalid date string for "transferDate"/);
    });

    it("원본 객체 변경 안 함 (immutable)", () => {
      const input = { transferDate: "2026-05-03" };
      const out = coerceDates(input, ["transferDate"]);
      expect(input.transferDate).toBe("2026-05-03");
      expect(out.transferDate).toBeInstanceOf(Date);
    });

    it("silent bug 시나리오: Date < string 비교", () => {
      // 변환 전: string < string 은 lexicographic, 의도하지 않은 결과
      const before = "2026-01-01" < "2025-12-31"; // false (예상은 true: 2026이 더 미래이므로 후자가 작다)
      expect(before).toBe(false); // lexicographic은 옳지만 Date 비교를 의도한 사용자에게는 silent

      // 변환 후: Date < Date 는 시간 기준 정상
      const out = coerceDates(
        { a: "2026-01-01", b: "2025-12-31" },
        ["a", "b"]
      );
      const aDate = out.a as unknown as Date;
      const bDate = out.b as unknown as Date;
      expect(aDate > bDate).toBe(true); // 정상 동작
    });
  });
});
