/**
 * 국외 부동산 법령 상수(TRANSFER_FOREIGN_RE) ↔ 검증 매니페스트 정합.
 *
 * 커버리지 게이트(`legal-verification-coverage-complete`)는 조 단위라 상수가 다른 조문을 가리켜도,
 * 또는 상수가 파서에서 null이 돼 모수에서 빠져도 초록이다. 여기서 상수마다 (1) 알려진 조문으로 파싱되고
 * (2) 그 조문을 항 단위로 고정하는 매니페스트 행이 있음을 확인한다.
 */
import { describe, it, expect } from "vitest";
import { TRANSFER_FOREIGN_RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import { TRANSFER_FOREIGN_RE as FROM_BARREL } from "@/lib/tax-engine/legal-codes";
import { articleKeys } from "@/lib/legal-verification/coverage";
import { VERIFICATION_MANIFEST } from "@/lib/legal-verification/verifier-manifest";
import { collectCitedCitations } from "@/lib/legal-verification/coverage-collect";

const EXPECTED_KEYS: Record<keyof typeof TRANSFER_FOREIGN_RE, string> = {
  SECTION_118_2_SCOPE: "소득세법 제118조의2",
  SECTION_118_2_FX_GAIN_PROVISO: "소득세법 제118조의2",
  SECTION_118_3_TRANSFER_VALUE: "소득세법 제118조의3",
  SECTION_118_4_NECESSARY_EXPENSES: "소득세법 제118조의4",
  SECTION_118_5_RATE: "소득세법 제118조의5",
  SECTION_118_5_RATE_ADJUSTMENT: "소득세법 제118조의5",
  SECTION_118_6_FOREIGN_TAX: "소득세법 제118조의6",
  SECTION_118_6_1_1_CREDIT: "소득세법 제118조의6",
  SECTION_118_6_1_2_EXPENSE: "소득세법 제118조의6",
  SECTION_118_7_BASIC_DEDUCTION: "소득세법 제118조의7",
  SECTION_118_7_DEDUCTION_ORDER: "소득세법 제118조의7",
  SECTION_118_8_MUTATIS_NO_LTHD: "소득세법 제118조의8",
  SECTION_102_2_LOSS_OFFSET: "소득세법 제102조",
  DECREE_154_1_DOMESTIC_ONE_HOUSE: "소득세법 시행령 제154조",
  DECREE_178_3_MARKET_VALUE: "소득세법 시행령 제178조의3",
  DECREE_178_4_1_ACQUISITION_COST: "소득세법 시행령 제178조의4",
  DECREE_178_5_2_INSTALLMENT: "소득세법 시행령 제178조의5",
  DECREE_178_2_4_UNREGISTERED: "소득세법 시행령 제178조의2",
  DECREE_178_5_FX_BASE_RATE: "소득세법 시행령 제178조의5",
  DECREE_178_7_FOREIGN_TAX: "소득세법 시행령 제178조의7",
  LOCAL_SPECIAL_97_3_FOREIGN_TAX_CREDIT: "지방세특례제한법 제97조",
  LOCAL_103_4_CREDIT_CAP: "지방세법 제103조의4",
  LOCAL_103_3_3_RATE: "지방세법 제103조의3",
  LOCAL_103_3_FOREIGN_TAX_BASE: "지방세법 제103조",
  LOCAL_92_1_RATE_TABLE: "지방세법 제92조",
  LOCAL_BASIC_59_ROUNDING: "지방세기본법 제59조",
  TREASURY_47_1_ROUND_10: "국고금 관리법 제47조",
  RULE_60_2_FTC_FX_RATE: "소득세법 시행규칙 제60조",
};

describe("TRANSFER_FOREIGN_RE 상수", () => {
  it("배럴(legal-codes.ts)에서도 같은 객체가 나온다", () => {
    expect(FROM_BARREL).toBe(TRANSFER_FOREIGN_RE);
  });

  it("상수 키 집합이 기대표와 같다 (상수 추가 시 이 표도 함께 갱신)", () => {
    expect(Object.keys(TRANSFER_FOREIGN_RE).sort()).toEqual(Object.keys(EXPECTED_KEYS).sort());
  });

  it.each(Object.entries(EXPECTED_KEYS))("%s 는 정확히 한 조문으로 파싱된다", (name, expected) => {
    const citation = TRANSFER_FOREIGN_RE[name as keyof typeof TRANSFER_FOREIGN_RE];
    expect(articleKeys(citation)).toEqual([expected]);
  });

  it("전 상수가 커버리지 수집기에 잡힌다 (수집기 열거 누락 방지)", () => {
    const collected = new Set(collectCitedCitations());
    for (const c of Object.values(TRANSFER_FOREIGN_RE)) expect(collected.has(c)).toBe(true);
  });

  it("상수마다 같은 조문을 가리키는 매니페스트 행이 있다", () => {
    const manifestKeys = new Set(VERIFICATION_MANIFEST.flatMap((r) => articleKeys(r.citation)));
    for (const key of new Set(Object.values(EXPECTED_KEYS))) expect(manifestKeys.has(key)).toBe(true);
  });

  it("항 단위 의존 문언이 매니페스트 키워드에 동결돼 있다", () => {
    const byId = (id: string) => VERIFICATION_MANIFEST.find((r) => r.id === id);
    expect(byId("TRANSFER_FOREIGN_RE.MUTATIS_LIST")?.keywords[0]).toContain("제97조제3항");
    expect(byId("TRANSFER_FOREIGN_RE.DECREE_154_1_DOMESTIC_ONE_HOUSE")?.keywords).toContain(
      "양도일 현재 국내에 1주택을 보유하고 있는 경우로서",
    );
    expect(byId("TRANSFER_FOREIGN_RE.LOCAL_103_3_3_RATE")?.keywords.join("")).toContain(
      "표준세율은 제92조제1항에 따른 세율과 같다",
    );
    expect(byId("TRANSFER_FOREIGN_RE.DECREE_178_2_4_UNREGISTERED")?.keywords).toContain(
      "부동산에 관한 권리로서 미등기 양도자산",
    );
  });
});
