/**
 * F-12 가드 — 다건 스키마(⑫ `propertyItemSchema`)의 **모든 키**는 셋 중 하나다:
 *   ⑭ 매핑(`multi/route.ts`의 `p.<key>`) · ⑫ 거부 규칙 · 근거 있는 무효과 목록.
 *
 * 새 키를 스키마에 넣고 ⑭를 잊으면 여기서 실패한다 — 종전에는 69개 키가 이 분류 밖에서 조용히 버려졌고,
 * 그중 §164⑨·소유자 분리는 화면 입력까지 세액에 닿지 않았다(anchor `...-single-only-keys-f12`).
 * 매핑 판정은 route 원문의 정적 스캔이다(`p.<key>` 참조) — 매핑 식이 바뀌어도 키 참조가 남는 한 통과한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { z } from "zod";
import { propertyItemSchema } from "@/lib/api/transfer-tax-schema";
import {
  MULTI_REJECT_RULES,
  MULTI_IGNORED_KEYS,
  refineMultiUnsupported,
} from "@/lib/api/transfer-tax-schema-multi-refines";

const route = readFileSync("app/api/calc/transfer/multi/route.ts", "utf8");
const mapped = new Set([...route.matchAll(/\bp\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));

// zod v4의 superRefine은 객체 스키마를 그대로 돌려준다(래퍼 없음) — `.shape`로 키를 읽는다.
const keys = Object.keys(propertyItemSchema.shape);
const rejected = new Set(Object.keys(MULTI_REJECT_RULES));
const ignored = new Set(Object.keys(MULTI_IGNORED_KEYS));

describe("F-12 다건 키 분류", () => {
  it("스키마 키가 스캔된다(가드 자체의 구별력)", () => {
    expect(keys.length).toBeGreaterThan(100);
    expect(mapped.has("transferPrice")).toBe(true);
  });

  it("모든 키가 매핑·거부·무효과 중 하나", () => {
    const unclassified = keys.filter((k) => !mapped.has(k) && !rejected.has(k) && !ignored.has(k));
    expect(unclassified).toEqual([]);
  });

  it("무효과 목록은 매핑·거부와 겹치지 않는다(모순 분류 금지)", () => {
    expect([...ignored].filter((k) => mapped.has(k) || rejected.has(k))).toEqual([]);
  });

  it("거부·무효과 목록에 스키마에 없는 키가 없다(stale 금지)", () => {
    const known = new Set(keys);
    expect([...rejected, ...ignored].filter((k) => !known.has(k))).toEqual([]);
  });

  it("거부 규칙은 값이 있을 때만 걸린다 — 없는 값·기본값은 통과", () => {
    const issues = (data: Record<string, unknown>) => {
      const out: string[] = [];
      refineMultiUnsupported(data, { addIssue: (i: { path?: (string | number)[] }) => out.push(String(i.path?.[0])) } as unknown as z.RefinementCtx);
      return out;
    };
    expect(issues({})).toEqual([]);
    expect(issues({ transferType: "regular", acquisitionCause: "purchase", companionAssets: [] })).toEqual([]);
    expect(issues({ transferType: "burdened_gift" })).toEqual(["transferType"]);
    expect(issues({ acquisitionCause: "burdened_gift" })).toEqual(["acquisitionCause"]);
    expect(issues({ companionAssets: [{}] })).toEqual(["companionAssets"]);
    expect(issues({ reductions: [{ type: "self_farming" }] })).toEqual([]);
    expect(issues({ reductions: [{ type: "unsold_98" }] })).toEqual(["reductions"]);
    const scalar = new Set(["transferType", "acquisitionCause", "companionAssets", "reductions"]);
    for (const k of rejected) {
      if (scalar.has(k)) continue;
      expect(issues({ [k]: {} })).toEqual([k]);
    }
  });
});
