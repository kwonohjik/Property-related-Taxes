/**
 * S01-9 anchor — 판정 메뉴 ③ 「예상 양도가액」 안내의 고가주택 기준금액은 양도일 연혁이다.
 *
 * 「소득세법 시행령」 §156①: 2015.6.1.본 9억원(MST 168102) · 2008.10.6. 양도분 6억원(MST 88928) · 2021.12.8. 이후 「소득세법」
 * §89①3호 괄호 12억원(MST 280405). 안내가 12억을 리터럴로 적어 결과 화면(9억 초과분 과세)과 모순됐다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { buildCaseForm } from "./one-house-rulings/harness";
import { mkCase } from "./_one-house-pr3a-judge-route";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const hint = (td: string, assetKind: "housing" | "right_to_move_in" = "housing") => {
  const f = buildCaseForm(
    mkCase("2024-06-02", {
      isOneHousehold: true, transferDate: td, contractTotalPrice: "1000000000",
      asset: { assetKind, acquisitionDate: "2000-01-01" }, houses: [],
    }),
  );
  const r = render(<Step3 form={f} onChange={() => {}} />);
  const t = (r.container.textContent ?? "").replace(/\s+/g, " ");
  const i = t.indexOf("예상 양도가액");
  return t.slice(i, i + 60);
};

describe("S01-9 예상 양도가액 안내", () => {
  it("2015-06-01 양도 — 9억", () => {
    const h = hint("2015-06-01");
    expect(h).toContain("9억 초과 여부(고가주택)");
    expect(h).not.toContain("12억");
  });
  it("2008-10-06 양도 — 6억", () => {
    expect(hint("2008-10-06")).toContain("6억 초과 여부(고가주택)");
  });
  it("긍정 짝: 2022-06-01 양도 — 12억", () => {
    expect(hint("2022-06-01")).toContain("12억 초과 여부(고가주택)");
  });
  it("입주권 양도는 §89①4호 연혁(별도 leaf)을 읽는다 — 2017-01-15는 주택 9억과 달리 확인 필요 구간이라 현행 12억", () => {
    expect(hint("2017-01-15", "housing")).toContain("9억 초과 여부(고가주택)");
    expect(hint("2017-01-15", "right_to_move_in")).toContain("12억 초과 여부(고가주택)");
  });
});
