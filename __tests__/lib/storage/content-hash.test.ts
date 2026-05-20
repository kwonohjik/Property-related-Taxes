import { describe, expect, it } from "vitest";
import { stableStringify, computeContentHash } from "@/lib/storage/content-hash";

describe("stableStringify — 안정성 규약", () => {
  it("객체 키 순서가 달라도 동일 문자열 (4-9)", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ b: 1, a: 2 })).toBe(`{"a":2,"b":1}`);
  });

  it("undefined 값 키는 제거 (4-10)", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(`{"a":1}`);
  });

  it("null은 보존", () => {
    expect(stableStringify({ a: null })).toBe(`{"a":null}`);
  });

  it("Date 인스턴스는 toISOString", () => {
    const d = new Date("2026-05-21T00:00:00.000Z");
    expect(stableStringify({ d })).toBe(`{"d":"2026-05-21T00:00:00.000Z"}`);
  });

  it("NaN·Infinity는 null로 치환", () => {
    expect(stableStringify({ a: NaN, b: Infinity, c: -Infinity })).toBe(
      `{"a":null,"b":null,"c":null}`
    );
  });

  it("배열 순서는 보존", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(stableStringify([3, 1, 2])).not.toBe(stableStringify([1, 2, 3]));
  });

  it("중첩 객체 키도 재귀 정렬", () => {
    expect(stableStringify({ x: { b: 2, a: 1 } })).toBe(
      stableStringify({ x: { a: 1, b: 2 } })
    );
  });

  it("함수·Symbol은 제거", () => {
    const sym = Symbol("s");
    expect(
      stableStringify({ a: 1, fn: () => 0, sym })
    ).toBe(`{"a":1}`);
  });

  it("순환 참조는 throw", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => stableStringify(obj)).toThrow(/circular/i);
  });

  it("bigint은 문자열로", () => {
    expect(stableStringify({ a: 100n })).toBe(`{"a":"100"}`);
  });
});

describe("computeContentHash", () => {
  it("같은 입력+같은 결과면 같은 해시", async () => {
    const h1 = await computeContentHash({ a: 1, b: 2 }, { tax: 100 });
    const h2 = await computeContentHash({ b: 2, a: 1 }, { tax: 100 });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it("입력이 다르면 다른 해시", async () => {
    const h1 = await computeContentHash({ a: 1 }, { tax: 100 });
    const h2 = await computeContentHash({ a: 2 }, { tax: 100 });
    expect(h1).not.toBe(h2);
  });

  it("결과가 다르면 다른 해시", async () => {
    const h1 = await computeContentHash({ a: 1 }, { tax: 100 });
    const h2 = await computeContentHash({ a: 1 }, { tax: 200 });
    expect(h1).not.toBe(h2);
  });

  it("16 hex chars", async () => {
    const h = await computeContentHash({ a: 1 }, { tax: 100 });
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });
});
