/**
 * 2026-11 리뷰 I-22 — AI 필드 사전 ↔ 판정 메뉴 전용 폼 칸 정합 가드.
 * 판정 메뉴 전용 interface 4개의 칸은 사전에 있거나, 아래 제외 목록에 이유와 함께 있어야 한다. 새 칸을 만들고 사전을 잊으면 여기서 깨진다
 * (장기저당 8칸 · `nonResidentResidedAtConversion`이 그렇게 빠져 있었다 — 결정 Q-9 ②로 넣었다).
 */
import { describe, it, expect } from "vitest";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";
import {
  oneHouseJudgmentDemolishedDefaults,
  oneHouseJudgmentNonResidentDefaults,
  oneHouseJudgmentSurchargeDefaults,
} from "@/lib/stores/one-house-judgment-form.types";

/** 사전에 두지 않는 칸 — 이유와 함께 */
const NOT_IN_CATALOG: Record<string, string> = {
  surchargeSellingRightValue: "다주택 중과 메뉴 전용(양도 조합원입주권의 종전 주택 가격) — AI 추출·의견은 1주택 판정 메뉴에서만 연다(결정 Q-9 ②는 장기저당·비거주 전환만 넣기로 했다)",
};

describe("I-22 판정 메뉴 전용 칸 ↔ AI 필드 사전", () => {
  const catalogTop = new Set(ONE_HOUSE_FIELD_CATALOG.map((s) => s.path.split(/[.[]/)[0]));
  const groups = {
    extra: oneHouseJudgmentExtraDefaults,
    nonResident: oneHouseJudgmentNonResidentDefaults,
    demolished: oneHouseJudgmentDemolishedDefaults,
    surcharge: oneHouseJudgmentSurchargeDefaults,
  };
  for (const [name, defaults] of Object.entries(groups)) {
    it(`${name} — 모든 칸이 사전에 있거나 제외 목록에 이유가 있다`, () => {
      const missing = Object.keys(defaults).filter((k) => !catalogTop.has(k) && !(k in NOT_IN_CATALOG));
      expect(missing).toEqual([]);
    });
  }
  it("제외 목록의 칸은 실제로 사전에 없다(넣었으면 목록에서 뺀다)", () => {
    expect(Object.keys(NOT_IN_CATALOG).filter((k) => catalogTop.has(k))).toEqual([]);
  });
});
