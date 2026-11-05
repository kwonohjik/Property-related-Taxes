/**
 * NH-60 — AI 추출 필드 사전에 §99의4 고향 요건(`meetsHometownRequirement`)이 있어야 추출값이 폼에 들어간다.
 * 사전에 없으면 `applyExtraction`이 그 사실을 버린다(엔진 HOMETOWN_UNCONFIRMED로 불적용).
 */
import { describe, it, expect } from "vitest";
import { applyExtraction } from "@/lib/one-house-ai/apply-extraction";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";

describe("필드 사전 — §99의4 고향 요건", () => {
  it("houses[].countExclusion.reduction.meetsHometownRequirement 추출값이 행에 들어간다", () => {
    const { form, issues } = applyExtraction(
      {
        rows: [{ collection: "houses", rowId: "H", description: "고향주택" }],
        facts: [
          { path: "houses[H].countExclusion.reduction.type", value: "new_99_4_hometown", evidence: "원문" },
          { path: "houses[H].countExclusion.reduction.meetsHometownRequirement", value: "true", evidence: "원문" },
        ],
        missingFacts: [],
        notes: [],
      },
      ONE_HOUSE_FIELD_CATALOG,
    );
    expect(issues).toEqual([]);
    expect(form.houses).toEqual([
      { id: "H", countExclusion: { reduction: { type: "new_99_4_hometown", meetsHometownRequirement: true } } },
    ]);
  });
});
