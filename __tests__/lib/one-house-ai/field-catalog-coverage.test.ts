/**
 * 필드 사전 커버리지 — 해석례 평가셋의 손 매핑 폼(`__tests__/calc/one-house-rulings/cases`)에 쓰인 칸과 값을
 * 필드 사전(`ONE_HOUSE_FIELD_CATALOG`)이 모두 받아들이는가.
 *
 * 사전에 없는 칸은 추출기가 낼 수 없고(`applyExtraction`이 버린다), 형식 검증이 막는 값은 추출해도 폼에 들어가지 않는다.
 * 손 매핑 폼은 엔진 판정이 기대값과 맞는 실제 입력이므로, 이 집합이 추출이 닿아야 하는 최소 범위다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import { catalogKeyOf, coerceValue, flattenForm, parsePath, ROW_MARKER } from "@/lib/one-house-ai/apply-extraction";
import type { FieldSpec } from "@/lib/one-house-ai/field-catalog.types";

const DIR = path.join(__dirname, "../../calc/one-house-rulings/cases");
const forms = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as { id: string; form?: object }[])
  .filter((c) => c.form);
const specs = new Map<string, FieldSpec>(ONE_HOUSE_FIELD_CATALOG.map((s) => [s.path, s]));

describe("필드 사전 커버리지", () => {
  it("경로가 중복되지 않는다", () => {
    expect(specs.size).toBe(ONE_HOUSE_FIELD_CATALOG.length);
  });

  it("평가셋 손 매핑 폼의 칸은 모두 사전에 있고, 값은 그 칸의 형식 검증을 통과한다", () => {
    const problems: string[] = [];
    for (const c of forms) {
      for (const [p, v] of flattenForm(c.form as never)) {
        // 행 표지 · 빈 칸 · 빈 배열 · 입력 모드(추출기가 정한다)는 사실이 아니다
        if (v === ROW_MARKER || v === "" || Array.isArray(v) || p === "asset.residenceInputMode") continue;
        const segs = parsePath(p);
        const spec = segs ? specs.get(catalogKeyOf(segs)) : undefined;
        if (!spec) {
          problems.push(`${c.id} ${p}: 사전에 없음`);
          continue;
        }
        const r = coerceValue(spec, String(v));
        if ("error" in r) problems.push(`${c.id} ${p}: ${r.error}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
