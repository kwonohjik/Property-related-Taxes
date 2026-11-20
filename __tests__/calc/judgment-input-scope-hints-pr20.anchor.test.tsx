/**
 * PR-20 anchor (2026-11 리뷰 D-48 · D-56 · I-30) — 판정 메뉴 입력의 뜻·범위 안내.
 *
 * | # | 주장 |
 * |---|---|
 * | D-48 | 「예상 양도가액」은 주택(입주권) 전체 — 공동명의면 타인 몫 포함(시행령 §156①). 라벨·안내·검토 행·AI 사전이 같은 말 |
 * | D-56 | 「주택」 선택지·넘기기 카드에 범위 밖 물건(겸용 주택 연면적 ≤ 주택 외 · 배율 초과 부수토지) 안내 |
 * | I-30 | ① 「1세대」 카드에 연혁(사실상 이혼 괄호 2019.1.1. · 소득 기준 2024.2.29.) |
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Step1 } from "@/app/calc/one-house-exemption/steps/Step1";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { buildCaseForm } from "./one-house-rulings/harness";
import { mkCase } from "./_one-house-pr3a-judge-route";
import {
  HOUSEHOLD_DEFINITION_ERA_NOTE,
  JUDGMENT_HOUSING_SCOPE_HINT,
  JUDGMENT_SALE_PRICE_WHOLE_HOUSE_HINT,
  JUDGMENT_SALE_PRICE_WHOLE_RIGHT_HINT,
} from "@/lib/calc/judgment-scope-hints";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const form = (assetKind: "housing" | "right_to_move_in") =>
  buildCaseForm(
    mkCase("2024-06-02", {
      isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "1000000000",
      asset: { assetKind, acquisitionDate: "2000-01-01" }, houses: [],
    }),
  );
const text = (c: HTMLElement) => (c.textContent ?? "").replace(/\s+/g, " ");

describe("D-48 예상 양도가액 = 전체 가액", () => {
  it("주택 — 라벨 「주택 전체」 · §156① 타인 몫 포함 안내", () => {
    const t = text(render(<Step3 form={form("housing")} onChange={() => {}} />).container);
    expect(t).toContain("예상 양도가액 (주택 전체)");
    expect(t).toContain(JUDGMENT_SALE_PRICE_WHOLE_HOUSE_HINT);
    expect(JUDGMENT_SALE_PRICE_WHOLE_HOUSE_HINT).toContain("소득세법 시행령 §156 ①");
  });
  it("입주권 — 라벨 「입주권 전체」 · 유추 확인 필요 안내", () => {
    const t = text(render(<Step3 form={form("right_to_move_in")} onChange={() => {}} />).container);
    expect(t).toContain("예상 양도가액 (입주권 전체)");
    expect(t).toContain(JUDGMENT_SALE_PRICE_WHOLE_RIGHT_HINT);
  });
  it("AI 사전도 전체 가액이라고 말한다", () => {
    const entry = ONE_HOUSE_FIELD_CATALOG.find((f: { path: string }) => f.path === "contractTotalPrice") as { hint: string };
    expect(entry.hint).toContain("다른 사람 몫을 포함한 전체 가액");
  });
});

describe("D-56 범위 밖 물건 안내", () => {
  it("「주택」 선택지에 겸용(§154③ 단서)·배율 초과 부수토지 안내", () => {
    const t = text(render(<Step3 form={form("housing")} onChange={() => {}} />).container);
    expect(t).toContain(JUDGMENT_HOUSING_SCOPE_HINT);
    expect(JUDGMENT_HOUSING_SCOPE_HINT).toContain("소득세법 시행령 §154 ③ 단서");
  });
});

describe("I-30 1세대 연혁", () => {
  it("① 카드에 연혁 단락이 있다", () => {
    render(<Step1 form={form("housing")} onChange={() => {}} />);
    expect(screen.getByTestId("household-definition-era-note").textContent).toBe(HOUSEHOLD_DEFINITION_ERA_NOTE);
    expect(HOUSEHOLD_DEFINITION_ERA_NOTE).toContain("2019.1.1.");
    expect(HOUSEHOLD_DEFINITION_ERA_NOTE).toContain("2024.2.29.");
  });
});
