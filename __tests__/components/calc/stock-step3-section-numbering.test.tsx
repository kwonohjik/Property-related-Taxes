/**
 * @vitest-environment jsdom
 *
 * 주식 양도세 Step3 — 섹션 번호 순차 anchor
 *
 * 계획서: docs/00-pm/stock-multi-asset-filing-loss-offset.plan.md §2 G-1 · §6.2
 *
 * 2026-09-12에 ③ 「이월결손금 통산 (PR-3 예정)」 섹션을 **삭제**하고 뒤 섹션을 당겼다
 * (④→③ · ⑤→④). 삭제만 하고 번호를 안 당기면 화면이 **①②④⑤**가 되어 사용자에게는
 * 버그로 보인다.
 *
 * 🔑 **이 anchor 없이는 아무도 그것을 잡지 못한다.** 실측했다 — Step3을 렌더하는 테스트 3개
 *    (`stock-filing-type-gating` · `stock-penalty-detail-step3` · `stock-basic-deduction-gate`)와
 *    E2E 4 spec의 단언은 **전부 제목 텍스트**를 쓴다. RTL `getNodeText`는 요소의 **직계 텍스트
 *    노드만** 이어붙이는데 번호는 자식 `<span>` 안에 있어 매칭 문자열에 애초에 들어가지 않는다.
 *    ⇒ 번호를 아무렇게나 바꿔도 기존 게이트는 전부 초록이다.
 *
 * 선례: `UnlistedStockV2SectionNumbering.test.tsx` (비상장 V2 1~9 순차).
 *
 * ⚠️ 두 갈래는 **상호배타**다 — `isExitTax`(`Step3.tsx:108` `marketType === "exit_tax"`)가
 *    ③을 「신고·납부 §118의15」로, 아니면 「신고 유형 §105①·§110①」 + ④ 가산세로 가른다.
 *    그래서 기대 개수가 다르다(3 vs 4).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    transferDate: "2025-03-15",
    filingType: "preliminary",
    ...o,
  };
}

/**
 * 섹션 번호 badge — `SectionTitle`(`Step3.tsx:45-54`)이 만드는
 * `rounded-full bg-violet-600` span 의 텍스트.
 */
function sectionNumbers(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("h2 > span"))
    .filter((el) => {
      const cls = el.className ?? "";
      return cls.includes("rounded-full") && cls.includes("bg-violet-600");
    })
    .map((el) => (el.textContent ?? "").trim());
}

describe("[SS] Step3 섹션 번호 — 삭제 후에도 빈 번호가 없다", () => {
  it("SS-1: 일반 종목(코스피)은 1·2·3·4 순차", () => {
    const { container } = render(<Step3 form={form()} onChange={() => {}} />);
    expect(sectionNumbers(container)).toEqual(["1", "2", "3", "4"]);
  });

  it("SS-2: 국외전출세는 1·2·3 순차 (④ 가산세는 배선이 없어 렌더하지 않는다)", () => {
    const { container } = render(
      <Step3 form={form({ marketType: "exit_tax" })} onChange={() => {}} />,
    );
    expect(sectionNumbers(container)).toEqual(["1", "2", "3"]);
  });

  it("SS-3: 기타자산(과점주주)에서도 1·2·3·4 순차 — ② 필드 게이트가 번호를 바꾸지 않는다", () => {
    const { container } = render(
      <Step3
        form={form({ marketType: "other_asset", isQualifyingBlockShareholder: true })}
        onChange={() => {}}
      />,
    );
    expect(sectionNumbers(container)).toEqual(["1", "2", "3", "4"]);
  });

  it("SS-4: 중복·누락 없음 (Set 크기 = 길이)", () => {
    const { container } = render(<Step3 form={form()} onChange={() => {}} />);
    const ns = sectionNumbers(container);
    expect(new Set(ns).size).toBe(ns.length);
  });

  it("SS-5: 삭제한 ③ 안내가 화면에 남아 있지 않다", () => {
    const { container } = render(<Step3 form={form()} onChange={() => {}} />);
    // 「이월결손금」은 법령에 없는 개념이고(§102① 후단 — 양도소득에 결손금 이월 없음),
    // 「PR-3」은 사용자에게 의미 없는 내부 PR 번호다. 둘 다 렌더돼선 안 된다.
    expect(container.textContent).not.toContain("이월결손금");
    expect(container.textContent).not.toContain("PR-3");
  });
});
