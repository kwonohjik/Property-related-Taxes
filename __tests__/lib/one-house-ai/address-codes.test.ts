/**
 * 소재지 코드 칸은 AI가 채우지 않는다 — 계획서 docs/00-pm/one-house-ai-recorded-leftovers.plan.md §3.3-1 (Q-3 a).
 * 재관측에서 모델이 「나주」를 옛 전남 체계 `4617000000`으로 넣어 연접 표(통합 12 체계)를 비켜 갔다.
 */
import { describe, it, expect } from "vitest";
import { ADDRESS_CODE_PATHS, withoutAddressCodes } from "@/lib/one-house-ai/address-codes";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import type { OneHouseExtraction } from "@/lib/one-house-ai/extraction-schema";

const base = (over: Partial<OneHouseExtraction>): OneHouseExtraction => ({ rows: [], facts: [], missingFacts: [], notes: [], ...over });

describe("withoutAddressCodes", () => {
  it("코드 사실을 빼고 같은 경로의 「주소 검색으로 입력」 질문으로 바꾼다 — 행 경로도", () => {
    const out = withoutAddressCodes(
      base({
        rows: [{ collection: "houses", rowId: "B", description: "B주택" }],
        facts: [
          { path: "publicInstitutionRelocation", value: "true", evidence: "기관이 나주로 이전" },
          { path: "relocatedSigunguCode", value: "4617000000", evidence: "기관이 2017.3.1. 나주로 이전" },
          { path: "houses[B].regionCode", value: "1168010100", evidence: "강남구 역삼동 B아파트" },
        ],
      }),
    );
    expect(out.facts.map((f) => f.path)).toEqual(["publicInstitutionRelocation"]);
    expect(out.missingFacts.map((m) => m.path)).toEqual(["relocatedSigunguCode", "houses[B].regionCode"]);
    expect(out.missingFacts[0].question).toContain("「이전한 기관·법인 소재지」 칸은 화면의 주소 검색으로 입력하세요");
    expect(out.missingFacts[0].question).toContain("「기관이 2017.3.1. 나주로 이전」");
    expect(out.rows).toHaveLength(1); // 행은 그대로 — 주택 수에 든다
  });

  it("모델이 이미 그 칸을 물었으면 질문을 겹쳐 넣지 않는다", () => {
    const asked = { path: "asset.regionCode", question: "양도 주택 주소는?", why: "조정대상지역" };
    const out = withoutAddressCodes(base({ facts: [{ path: "asset.regionCode", value: "4113510300", evidence: "분당" }], missingFacts: [asked] }));
    expect(out.facts).toEqual([]);
    expect(out.missingFacts).toEqual([asked]);
  });

  it("코드 사실이 없으면 그대로 돌려준다", () => {
    const e = base({ facts: [{ path: "transferDate", value: "2024-06-15", evidence: "양도" }] });
    expect(withoutAddressCodes(e)).toBe(e);
  });

  // 새 문자열 칸이 생기면 코드 칸인지 판단을 요구한다
  it("필드 사전의 `string` 칸은 모두 코드 칸 목록에 있고, 목록의 칸은 모두 사전에 있다", () => {
    const stringKeys = ONE_HOUSE_FIELD_CATALOG.filter((s) => s.kind === "string").map((s) => s.path).sort();
    expect(stringKeys).toEqual([...ADDRESS_CODE_PATHS].sort());
  });
});
