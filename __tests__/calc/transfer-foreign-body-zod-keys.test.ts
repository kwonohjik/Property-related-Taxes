/**
 * ⑬↔⑫ 국외 부동산 — 빌더(`buildForeignRealEstateBody`)가 보내는 body 키 ↔ Zod 스키마 키 **양방향** 가드.
 *
 * Zod `z.object`는 모르는 키를 **조용히 제거**한다(strip). 빌더가 키를 추가했는데 스키마에 없으면 엔진에 닿지 않고, 스키마에만 있고 빌더가 안 보내면
 * 입력칸이 있어도 엔진이 그 값을 못 본다 — TypeScript가 못 잡는 침묵 실패(⑫⑬). 모든 선택 필드를 채운 최대 폼으로 양쪽을 대조한다.
 */
import { describe, it, expect } from "vitest";
import type { ZodType } from "zod";
import { foreignRealEstateBaseSchema, foreignRealEstateInputSchema } from "@/lib/api/transfer-foreign-schema";
import { buildForeignRealEstateBody } from "@/lib/calc/transfer-foreign-body";
import { foreignForm, gainAsset2, k1Asset } from "./_foreign-form-fixture";

/** 빌더가 의도적으로 보내지 않는 스키마 키 — 엔진에 칸이 없어 Zod가 «막기 위해서만» 둔 literal(사용자 결정 C-3·엔진 Q-6·V-14) */
const SCHEMA_ONLY_BLOCKERS = new Set(["assets[].acquisitionCause", "assets[].foreignBorrowAcquired"]);

type Def = { type: string; shape?: Record<string, ZodType>; element?: ZodType; innerType?: ZodType };
const defOf = (s: ZodType) => (s as unknown as { _zod: { def: Def } })._zod.def;

/** Zod 스키마의 키 경로 전부 — 객체 키는 `a.b`, 배열 원소는 `a[]` */
function schemaPaths(schema: ZodType, prefix = ""): string[] {
  const def = defOf(schema);
  if (def.type === "object") {
    return Object.entries(def.shape ?? {}).flatMap(([k, v]) => {
      const p = prefix ? `${prefix}.${k}` : k;
      return [p, ...schemaPaths(v, p)];
    });
  }
  if (def.type === "array") return schemaPaths(def.element as ZodType, `${prefix}[]`);
  if (def.type === "optional" || def.type === "default" || def.type === "nullable") return schemaPaths(def.innerType as ZodType, prefix);
  return [];
}

function bodyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v) => bodyPaths(v, `${prefix}[]`));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([k, v]) => {
      if (v === undefined) return [];
      const p = prefix ? `${prefix}.${k}` : k;
      return [p, ...bodyPaths(v, p)];
    });
  }
  return [];
}

/** 모든 선택 칸을 채운 폼 — 자본적지출·양도비·외국납부세액 행 + 외국납부세액 토글 */
function maxForm() {
  const row = { date: "2026-07-10", amountForeign: "1000", exchangeRate: "1100" };
  return foreignForm(
    { foreignTaxEnabled: true, foreignTaxMethod: "credit" },
    [k1Asset({ capitalRows: [row], costRows: [row], taxRows: [row] }), gainAsset2({ capitalRows: [row], taxRows: [row] })],
  );
}

describe("⑬↔⑫ 빌더 body 키 ↔ Zod 키", () => {
  const { body } = buildForeignRealEstateBody(maxForm());
  const sent = new Set(bodyPaths(body));
  const schema = new Set(schemaPaths(foreignRealEstateBaseSchema));

  it("빌더가 보내는 모든 키는 Zod 스키마에 있다 — 없으면 조용히 strip된다", () => {
    const stripped = [...sent].filter((k) => !schema.has(k));
    expect(stripped).toEqual([]);
  });

  it("Zod 스키마의 모든 키는 빌더가 보낸다 — 의도적 미전송(차단용 literal)만 예외", () => {
    const unsent = [...schema].filter((k) => !sent.has(k) && !SCHEMA_ONLY_BLOCKERS.has(k));
    expect(unsent).toEqual([]);
  });

  it("예외 목록은 실제 스키마 키만 가리킨다(스키마가 바뀌면 이 목록도 같이 본다)", () => {
    for (const k of SCHEMA_ONLY_BLOCKERS) expect(schema.has(k)).toBe(true);
  });

  it("JSON을 거친 body를 Zod가 파싱해도 값이 하나도 사라지지 않는다(strip 실측)", () => {
    const wire = JSON.parse(JSON.stringify(body));
    const parsed = foreignRealEstateBaseSchema.parse(wire);
    expect(parsed).toEqual(wire);
  });

  it("route가 쓰는 스키마(기본 모양 + refine)도 K-1 최대 폼 body를 통과시킨다", () => {
    const r = foreignRealEstateInputSchema.safeParse(JSON.parse(JSON.stringify(body)));
    expect(r.success).toBe(true);
  });
});
