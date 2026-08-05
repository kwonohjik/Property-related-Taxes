/**
 * anchor — 재산세 **분리과세 조문 인용**이 현행 법문과 일치하는가
 *
 * 계획: docs/02-design/features/property-separate-taxation-factory-limit.plan.md
 *
 * ## 왜 이 파일이 필요한가 — 다른 어떤 게이트도 못 잡는다
 *
 * 이 상수들은 결과 화면의 `legalBasis`로 **사용자에게 그대로 노출**된다. 그런데:
 *
 * - `verify:legal` 매니페스트는 「지방세법 시행령」 §102를 **조 단위**로만 검증한다
 *   (`additions-local-decree.ts` `LOCAL_DECREE.SEPARATE_TAXATION_LAND`) — 항·호가 틀려도 통과한다.
 * - `legal-verification-coverage-complete`는 "모수 안이 100%"만 본다 — 인용의 **정확성**은 안 본다.
 * - 기존 엔진 테스트는 `legalBasis` 문자열을 단언하지 않았다(2026-08-06 실측: 33건 중 0건).
 *
 * ⇒ 실제로 **6개 전부가 한 항씩 밀려 있었다**. 그 상태로 통과하고 있었다.
 *
 * ## 현행 법문 (법제처 MST 287223 · 시행 2026-07-01 실측)
 *
 * 「지방세법 시행령」 §102의 각 항은 법 §106①3호 **가~아목에 1:1 대응**한다:
 *
 * | 항 | 법 §106①3호 | 내용 |
 * |---|---|---|
 * | §102① 1호 | 가목 | **공장용지** — 공장입지기준면적 범위 |
 * | §102① 2호 | 가목 | 전ㆍ답ㆍ과수원 |
 * | §102① 3호 | 가목 | 목장용지 — 가축별 기준면적 범위 |
 * | §102② 1호 | 나목 | 보전산지ㆍ특수산림사업지구 임야 |
 * | §102③    | 다목 | 고급오락장 부속토지 |
 * | §102⑥ 1호 | 바목 | 염전 |
 * | §102⑥ 4호 | 바목 | 여객자동차터미널ㆍ물류터미널 |
 *
 * 세율은 「지방세법」 §111①1호 다목이 따로 정한다 — **§102의 항 번호와 무관**하다:
 *   1) 가목의 **전ㆍ답ㆍ과수원ㆍ목장용지** + 나목 임야 → 0.07%
 *   2) 다목 골프장ㆍ고급오락장 → 4%
 *   3) **그 밖의 토지** → 0.2%   ← 같은 가목이라도 **공장용지는 여기**다
 */
import { describe, it, expect } from "vitest";
import { PROPERTY } from "@/lib/tax-engine/legal-codes";

const S = PROPERTY.SEPARATE;

describe("분리과세 조문 인용 — 시행령 §102 항·호가 현행 법문과 일치한다", () => {
  it("CITE-1: 공장용지는 §102①1호다 (종전 §102②1호 — 한 항 밀림)", () => {
    expect(S.STANDARD_FACTORY).toBe("지방세법 시행령 §102①1호");
  });

  it("CITE-2: 농지(전ㆍ답ㆍ과수원)는 §102①2호다 (종전 §102①1호 = 공장용지 자리)", () => {
    expect(S.LOW_RATE_FARMLAND).toContain("시행령 §102①2호");
  });

  it("CITE-3: 목장용지는 §102①3호다 (종전 §102①2호)", () => {
    expect(S.LOW_RATE_LIVESTOCK).toBe("지방세법 시행령 §102①3호");
  });

  it("CITE-4: 보전산지ㆍ특수산림사업지구는 §102②1호다 (종전 §102①3호 = 목장용지 자리)", () => {
    expect(S.LOW_RATE_FOREST).toBe("지방세법 시행령 §102②1호");
  });

  it("CITE-5: 염전은 §102⑥1호다 (종전 §102②6호 = 임야 항)", () => {
    expect(S.STANDARD_SALT_FIELD).toBe("지방세법 시행령 §102⑥1호");
  });

  it("CITE-6: 터미널은 §102⑥4호다 (종전 §102② = 임야 항)", () => {
    expect(S.STANDARD_TERMINAL).toBe("지방세법 시행령 §102⑥4호");
  });
});

describe("서로 다른 대상이 같은 조문을 가리키지 않는다", () => {
  it("CITE-7: 6개 인용이 모두 서로 다르다 (밀림이 재발하면 충돌한다)", () => {
    const cites = [
      S.STANDARD_FACTORY,
      S.LOW_RATE_FARMLAND,
      S.LOW_RATE_LIVESTOCK,
      S.LOW_RATE_FOREST,
      S.STANDARD_SALT_FIELD,
      S.STANDARD_TERMINAL,
    ];
    expect(new Set(cites).size).toBe(6);
  });

  it("CITE-8: 어느 인용도 §102②6호ㆍ§102②를 쓰지 않는다 (종전 오류 문자열)", () => {
    // 「지방세법 시행령」 §102②는 **임야**다. 염전ㆍ터미널이 여기 있을 수 없다.
    expect(S.STANDARD_SALT_FIELD).not.toContain("§102②6호");
    expect(S.STANDARD_TERMINAL).not.toBe("지방세법 시행령 §102②");
  });
});

describe("세율 배정 — §111①1호 다목은 §102의 항 번호를 따르지 않는다", () => {
  it("CITE-9: 공장용지는 가목이지만 0.07%가 아니다 (다목3) 그 밖의 토지 = 0.2%)", () => {
    // §111①1호 다목1)이 가목 중 **전ㆍ답ㆍ과수원ㆍ목장용지**로 한정하기 때문이다.
    // 인용이 §102①1호(가목)로 바뀌어도 세율을 0.07%로 끌고 가면 안 된다는 계약.
    expect(S.STANDARD_FACTORY).toContain("§102①1호");
    expect(S.LOW_RATE_FARMLAND).toContain("다목(1)");
    // 저율 3종만 다목(1) 계열이고 공장용지는 아니다
    expect(S.STANDARD_FACTORY).not.toContain("다목");
  });
});
