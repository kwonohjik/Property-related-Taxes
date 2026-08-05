/**
 * anchor — 재산세 분리과세 **공장용지 입력 카드** (⑤ UI 위젯)
 *
 * 계획: docs/02-design/features/property-separate-taxation-factory-limit.plan.md
 *
 * ## 이 테스트가 지키는 것
 *
 * 1. **「그 밖의 시지역」은 면적을 묻지 않는다** — 그 경로는 분리과세가 아니라 별도합산
 *    (§101①1호)이다. 면적 칸을 띄우면 사용자가 채우고 계산을 눌렀다가 엔진에서 막힌다.
 *    대신 "별도합산으로 가라"고 지목해야 한다.
 * 2. **단서(허가 미이행)를 켜면 면적을 묻지 않는다** — 면적과 무관하게 전량 제외이므로
 *    묻는 것 자체가 오입력을 부른다.
 * 3. **연면적과 바닥면적을 섞지 않는다** — 별표6은 **연면적**이 분모다. 재산세 별도합산
 *    (§101①1호)은 **바닥면적**을 쓴다. 같은 「공장」이라도 값이 다르다
 *    (조심 2025서2489 실례: 연면적 89,865.838 vs 바닥면적 81,473.36).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step2Separated } from "@/components/calc/property/Step2Separated";
import { INITIAL_FORM, type FormState } from "@/components/calc/property/shared";

afterEach(cleanup);

const view = (over: Partial<FormState> = {}) =>
  render(
    <Step2Separated
      form={{ ...INITIAL_FORM, stSeparatedType: "factory", ...over } as FormState}
      onChange={vi.fn()}
    />,
  );

describe("공장 입지 유형 — 법문의 2분기를 반영한다", () => {
  it("PTF-1: 공장용지가 아니면 입지 선택 자체가 없다", () => {
    view({ stSeparatedType: "farmland" });
    expect(screen.queryByTestId("pt-factory-total-area")).toBeNull();
  });

  it("PTF-2: 입지 미선택이면 면적 입력이 열리지 않는다", () => {
    view({ stFactoryLocation: "" });
    expect(screen.queryByTestId("pt-factory-total-area")).toBeNull();
  });

  it("PTF-3: 산업단지·공업지역을 고르면 면적 입력이 열린다", () => {
    view({ stFactoryLocation: "industrial_zone" });
    expect(screen.getByTestId("pt-factory-total-area")).toBeTruthy();
    expect(screen.getByTestId("pt-factory-floor-area")).toBeTruthy();
    expect(screen.getByTestId("pt-factory-rate")).toBeTruthy();
  });

  it("PTF-4: 읍·면지역·도시지역 외도 같은 입력이 열린다 (§102①1호 각 목 가)", () => {
    view({ stFactoryLocation: "other" });
    expect(screen.getByTestId("pt-factory-total-area")).toBeTruthy();
  });
});

describe("🔴 「그 밖의 시지역」은 분리과세가 아니다 — 면적을 묻지 않고 경로를 지목한다", () => {
  it("PTF-5: 면적 입력이 열리지 않는다", () => {
    view({ stFactoryLocation: "urban" });
    expect(screen.queryByTestId("pt-factory-total-area")).toBeNull();
    expect(screen.queryByTestId("pt-factory-floor-area")).toBeNull();
    expect(screen.queryByTestId("pt-factory-rate")).toBeNull();
  });

  it("PTF-6: 별도합산으로 가라고 지목한다 (§101①1호 · 바닥면적 × 배율)", () => {
    // ⚠️ ToneCard는 `...props`를 spread하지 않아 `data-testid`가 DOM에 도달하지 않는다
    //    (하이픈 JSX 속성이라 TS는 통과시킨다 — 죽은 셀렉터가 된다). 텍스트로 조회한다.
    // ⚠️ "분리과세 대상이 아닙니다"는 기존 골프장 안내 카드에도 있어 **다중 매치**가 된다.
    //    이 카드에만 있는 도입부로 좁힌다.
    view({ stFactoryLocation: "urban" });
    const card = screen.getByText(/이 지역의 공장용지는/).closest("p")!;
    expect(card.textContent).toContain("분리과세 대상이 아닙니다");
    expect(card.textContent).toContain("§101①1호");
    expect(card.textContent).toContain("별도합산");
    expect(card.textContent).toContain("바닥면적");
  });
});

describe("§102①1호 단서 — 허가 미이행이면 면적을 묻지 않는다", () => {
  it("PTF-7: 단서 토글 ON이면 면적 입력이 닫힌다 (전량 제외이므로 묻지 않는다)", () => {
    view({ stFactoryLocation: "industrial_zone", stFactoryIsUnpermitted: true });
    expect(screen.queryByTestId("pt-factory-total-area")).toBeNull();
    expect(screen.queryByTestId("pt-factory-rate")).toBeNull();
  });

  it("PTF-8: 단서 토글 자체는 계속 보인다 (끄면 다시 면적을 물어야 한다)", () => {
    view({ stFactoryLocation: "industrial_zone", stFactoryIsUnpermitted: true });
    expect(screen.getByRole("switch", { name: /허가·사용승인 미이행/ })).toBeTruthy();
  });
});

describe("문구 — 오입력을 부르는 표현을 쓰지 않는다", () => {
  it("PTF-9: 연면적 칸은 「바닥면적이 아님」을 명시한다", () => {
    view({ stFactoryLocation: "industrial_zone" });
    expect(screen.getByText(/바닥면적이 아닙니다/)).toBeTruthy();
  });

  it("PTF-10: 추가 인정면적 안내에서 마목을 제외하고 귀속처를 지목한다", () => {
    view({ stFactoryLocation: "industrial_zone" });
    const label = screen.getByText(/추가 인정면적/);
    expect(label.textContent).toContain("나·다·라·바");
    expect(screen.getByText(/오염피해 인접토지\(마목\)는 위 부속토지 면적에 넣으세요/)).toBeTruthy();
  });

  it("PTF-11: 부속토지 칸은 마목 합산을 안내한다 (별표6 3호마 = 부속토지 편입)", () => {
    view({ stFactoryLocation: "industrial_zone" });
    expect(screen.getByText(/인접토지가 있으면 그 면적도 여기에 합산합니다/)).toBeTruthy();
  });
});
