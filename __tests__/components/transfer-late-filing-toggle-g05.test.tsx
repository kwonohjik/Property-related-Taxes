/**
 * @vitest-environment jsdom
 *
 * ⑤ G-05 — 기한 후 신고 감면 **배제 토글**이 Step6 무신고 분기에 배선됐는가
 *
 * 🔑 **`ToggleCard` 를 직접 렌더하면 안 된다** — 그러면 「Step6 에 배선됐는가」와
 *    「무신고에서만 열리는가」를 검증하지 못한다(메모리 `feedback_leaf_anchor_skips_zod_layer`
 *    의 UI 판). 조건부 블록은 **열어 봐야** 존재를 증명할 수 있다 — G-07 B1 에서 라디오
 *    `name` 뮤테이션이 GREEN 이었던 것이 정확히 이 함정이었다(기본 상태만 본 테스트).
 *
 * 왜 무신고에서만인가: 「국세기본법」 §48②2호·§48②3호라목은 **둘 다** 「제47조의2에 따른
 * 가산세만 해당」이다. 과소신고는 §48②**1호**(수정신고 — `AmendmentBlock`)가 담당한다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step6 } from "@/app/calc/transfer-tax/steps/Step6";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

const TITLE = "세무서 결정 예고 후 기한 후 신고";

function form(o: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    enablePenalty: true,
    transferDate: "2025-01-10",
    filingDate: "2025-04-15",
    ...o,
  };
}

function renderStep6(o: Partial<TransferFormData> = {}) {
  render(<Step6 form={form(o)} onChange={() => {}} determinedTax={100_000_000} />);
}

describe("G05-U1 배제 토글은 무신고 분기에서만 열린다", () => {
  it("G05-U1-1: 🔴 무신고면 토글이 렌더된다", () => {
    renderStep6({ filingType: "none" });
    expect(screen.getByText(TITLE)).toBeTruthy();
  });

  it("G05-U1-2: ⛔ 과소신고에는 없다 — §48②1호(수정신고)가 담당하는 축이다", () => {
    renderStep6({ filingType: "under" });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("G05-U1-3: ⛔ 초과환급신고에도 없다", () => {
    renderStep6({ filingType: "excess_refund" });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("G05-U1-4: ⛔ 정상신고면 가산세 블록 자체가 닫혀 토글도 없다", () => {
    renderStep6({ filingType: "correct" });
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("G05-U1-5: 🔑 §48②1호 수정신고 토글과 **다른 문구**다 — 두 축이 섞이지 않는다", () => {
    renderStep6({ filingType: "none" });
    expect(screen.getByText(TITLE)).toBeTruthy();
    // 수정신고 축(§48②1호)의 토글 제목
    expect(screen.queryByText("세무서 경정 예고 후 수정신고")).toBeNull();
  });

  it("G05-U1-6: 설명에 두 조문이 모두 적혀 있다", () => {
    renderStep6({ filingType: "none" });
    expect(
      screen.getByText(/국세기본법 §48②2호·3호라목 감면 배제/),
    ).toBeTruthy();
  });
});
