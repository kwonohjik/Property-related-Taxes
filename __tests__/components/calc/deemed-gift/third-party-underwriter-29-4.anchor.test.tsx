/**
 * anchor: 「상증법」§39①1호 다목 괄호 · 「상증령」§29④ — **인수인 경유 인수·취득도 「직접 배정」에 포함**된다는 안내.
 *
 * 착수 전 실측(2026-09-29):
 *   · 산식은 다목 그대로다(「상증령」§29②1호·5호) — 인수인 경유를 구분하는 입력이 없어도 엔진 편차 0원.
 *     달라지는 것은 **언제부터 포함되느냐**뿐이다(사용자 결정: 안내만 추가 — 엔진·입력 칸 불변).
 *   · 법률 제14388호 부칙 §5①(개정본 MST 188353 DRF 실독) — 「제39조제1항제1호다목의 개정규정은 이 법 시행
 *     (2017.1.1.) 이후 신주를 **인수ㆍ취득하는 경우**부터 적용한다」 ⇒ 자본시장법 §9⑫ 인수인 경유.
 *   · 「상증령」§29④ 〈신설 2017.2.7〉, 대통령령 제27835호(MST 191562) 부칙 §2 「이 영 시행 이후 … 증여받는 분부터」
 *     ⇒ 「제3자에게 증권을 취득시킬 목적으로 그 증권의 전부 또는 일부를 취득한 자」 경유.
 *   · §39 인수인 경유에 관한 해석례·심판례·판례는 찾지 못했다(심판례 7건은 전부 §40 전환사채 — 조심 2016서4311 등).
 *     그래서 그 전 취득분은 「다목 문언에 들지 않는다」까지만 말하고 과세 여부는 직접 검토로 넘긴다
 *     (서울행정법원 2021구합53405에서 과세관청이 §4①6호를 예비적 처분사유로 추가한 사례가 있다).
 *   · 종전 화면: 「제3자 직접배정 (다목)」 라벨뿐 — 인수인 경유 사용자가 이 목을 고를 근거도, 2017년 전 취득분을
 *     고르면 안 된다는 경계도 없었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CapitalIncreaseFields } from "@/components/calc/deemed-gift/capital-forms";
import { ConvertibleStockFields } from "@/components/calc/deemed-gift/convertible-stock-form";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import { THIRD_PARTY_UNDERWRITER_NOTE } from "@/components/calc/deemed-gift/capital-forms-shared";
import { extractInlineLawRefs } from "@/lib/utils/law-url";

afterEach(cleanup);

const optionText = (testId: string) => screen.getByTestId(testId).closest("label")?.textContent ?? "";

const CI: DeemedFormState = { ...INITIAL_DEEMED, type: "capital_increase" };
const CS: DeemedFormState = { ...INITIAL_DEEMED, type: "convertible_stock" };

describe("「제3자 직접배정 (다목)」 선택지 — 인수인 경유 포함 범위와 두 기준일", () => {
  for (const [label, el, prefix] of [
    ["§39 증자", <CapitalIncreaseFields key="ci" form={CI} set={() => {}} />, "ci"],
    ["§39①3호 전환주식", <ConvertibleStockFields key="cs" form={CS} set={() => {}} />, "cs"],
  ] as const) {
    it(`[U294-1] ${label} — 다목 선택지에 인수인(2017.1.1.)·§29④(2017.2.7.)·그 전 직접 검토가 모두 적힌다`, () => {
      render(el);
      const t = optionText(`${prefix}-subtype-third_party`);
      expect(t).toMatch(/자본시장법 §9⑫ 인수인/);
      expect(t).toMatch(/2017\.1\.1\. 이후 인수·취득분부터/);
      expect(t).toMatch(/상증령 §29④/);
      expect(t).toMatch(/2017\.2\.7\. 이후 증여분부터/);
      expect(t).toMatch(/직접 검토/);
    });

    it(`[U294-1+] ${label} 짝 — 다른 목(가·라·나)에는 인수인 안내가 붙지 않는다(다목 괄호의 범위)`, () => {
      render(el);
      for (const v of ["forfeited_realloc", "excess", "no_realloc"]) {
        expect(optionText(`${prefix}-subtype-${v}`)).not.toMatch(/인수인/);
      }
    });
  }

  it("[U294-2] 조문 배지 — §9⑫는 자본시장법, §29④는 상증령으로 귀속된다(「」로 감싸면 §9⑫가 상증법으로 새는 것을 막는다)", () => {
    const refs = extractInlineLawRefs(THIRD_PARTY_UNDERWRITER_NOTE, "상증법").map((r) => r.legalBasis);
    expect(refs).toContain("자본시장법 §9⑫");
    expect(refs).toContain("상속세및증여세법 시행령 §29④");
    expect(refs.some((r) => /^상속세및증여세법 §(9|5)/.test(r))).toBe(false);
  });
});
