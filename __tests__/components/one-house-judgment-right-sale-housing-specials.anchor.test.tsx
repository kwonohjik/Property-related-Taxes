/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴: **입주권 양도에는 주택 양도 특례 입력(영 §155의2 장기저당담보 · §156의2⑤ 대체주택)이 없다** (S10-8).
 *
 * 둘 다 **양도하는 주택**의 특례다 — 「소득세법 시행령」 §155의2① 「…주택을 양도하는 경우에는 제154조제1항의 규정을 적용함에
 * 있어 거주기간의 제한을 받지 아니한다」, 같은 영 §156의2⑤ 대체주택 양도 시 제154조제1항 적용. 조합원입주권 양도(법 §89①4호)에는
 * 적용 여지가 없고 엔진도 무시한다(`transfer-tax-exemption.ts`의 `propertyType !== "housing"` 조기 반환). 그런데 ⑤ 칸이 남아 있어
 * ⑧은 쓰이지 않는 필수값(3~4건)을 요구하고 사이드바는 「선언한 특례」로 적었다. 상생임대(§155의3 · M10)와 같은
 * `judgmentSaleIsHousing` 게이트로 ⑤·④·⑧·사이드바를 함께 닫는다(3중 패턴). 주택 양도 짝은 칸·검증·전송이 그대로다.
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | L-1 | ⑤ | §155의2 칸: 입주권 양도엔 없고 주택 양도엔 있다 |
 * | L-2 | ⑧·④·사이드바 | 입주권 양도: 필수값 오류 0 · 싣지 않음 · 선언 없음 / 주택 양도: 오류 3 · 싣음 · 선언 있음 |
 * | R-1 | ⑤·⑧·④·사이드바 | 대체주택: 입주권 양도 + 명부 2채에는 블록·오류·전송·선언이 없다 |
 * | R-2 | 🔑 긍정 짝 | 주택 양도 + 명부 2채는 블록·오류·전송·선언이 그대로 있다 |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { Step2 } from "@/app/calc/one-house-exemption/steps/Step2";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps, computeOneHouseJudgmentSummary } from "@/lib/calc/one-house-exemption-validate";
import { buildCaseForm, type RulingCase } from "../calc/one-house-rulings/harness";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const RIGHT = { assetKind: "right_to_move_in", redevSubject: "right", redevExemptionEligibleAtApproval: "yes", acquisitionDate: "2015-03-01", redevApprovalDate: "2021-05-01" };
const HOUSE = { assetKind: "housing", acquisitionDate: "2018-01-01" };
const HOUSES = [{ id: "h1", region: "capital", acquisitionDate: "2019-01-01" }, { id: "h2", region: "capital", acquisitionDate: "2020-01-01" }];
const mk = (asset: object, top: Record<string, unknown> = {}, houses: object[] = []): OneHouseJudgmentFormData =>
  buildCaseForm({
    id: "x", docNo: "-", docDate: "-", basis: "current", today: "2026-10-11", summary: "-", bucket: "match",
    form: { isOneHousehold: true, transferDate: "2025-09-01", contractTotalPrice: "800000000", ...top, asset, houses } as never,
  } as RulingCase);
const MORTGAGE = { longTermMortgageSpecial: true, longTermMortgageContractDate: "2020-01-01", longTermMortgageBorrowerAge: "65", longTermMortgageContractYears: "10" };
const errFields = (f: OneHouseJudgmentFormData, p: string) =>
  validateAllSteps(f).filter((e) => e.severity === "error" && e.field?.startsWith(p)).map((e) => e.field);
const declared = (f: OneHouseJudgmentFormData) => computeOneHouseJudgmentSummary(f).find((x) => x.label === "선언한 특례")?.value ?? "";

describe("S10-8 L §155의2 장기저당담보 — 입주권 양도엔 없다", () => {
  it("L-1 ⑤ 칸 없음 · 주택 양도 짝은 있음", () => {
    render(<Step3 form={mk(RIGHT)} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-long-term-mortgage")).toBeNull();
    cleanup();
    render(<Step3 form={mk(HOUSE)} onChange={() => {}} />);
    expect(screen.getByTestId("one-house-long-term-mortgage")).toBeTruthy();
  });
  it("L-2 ⑧ 필수값 오류 없음 · ④ 싣지 않음 · 사이드바 선언 없음 (주택 양도 짝은 반대)", () => {
    expect(errFields(mk(RIGHT, { longTermMortgageSpecial: true }), "longTermMortgage")).toEqual([]);
    expect(errFields(mk(HOUSE, { longTermMortgageSpecial: true }), "longTermMortgage").length).toBe(3);
    expect((buildOneHouseExemptionApiBody(mk(RIGHT, MORTGAGE)) as Record<string, unknown>).longTermMortgageHouse).toBeUndefined();
    expect((buildOneHouseExemptionApiBody(mk(HOUSE, MORTGAGE)) as Record<string, unknown>).longTermMortgageHouse).toBeDefined();
    expect(String(declared(mk(RIGHT, MORTGAGE)))).not.toContain("장기저당담보주택");
    expect(String(declared(mk(HOUSE, MORTGAGE)))).toContain("장기저당담보주택");
  });
});

describe("S10-8 R §156의2⑤ 대체주택 — 입주권 양도 + 명부 2채엔 없다", () => {
  // ④는 필수값(인가일·준공일)이 다 차야 싣는다 — 「빈 값이라 안 실렸다」가 게이트 때문이라고 오독하지 않게 가득 채운 폼도 쓴다.
  const REPL = { replacementHouseSpecial: true, replBusinessApprovalDate: "2018-01-01" };
  const REPL_FULL = { ...REPL, replCompletionDate: "2024-01-01", replResidenceMonths: "12", replWillResideNewHouse: true };

  it("R-2 🔑 긍정 짝 — 주택 양도 + 명부 2채는 블록·오류·전송·선언이 그대로 있다", () => {
    render(<Step2 form={mk(HOUSE, REPL, HOUSES)} onChange={() => {}} />);
    expect(screen.queryAllByText(/대체주택 비과세 특례 해당/).length).toBe(1);
    expect(errFields(mk(HOUSE, REPL, HOUSES), "repl").length).toBeGreaterThan(0);
    const full = mk(HOUSE, REPL_FULL, HOUSES);
    expect(errFields(full, "repl")).toEqual([]);
    expect((buildOneHouseExemptionApiBody(full) as Record<string, unknown>).replacementHouse).toBeDefined();
    expect(String(declared(full))).toContain("대체주택");
  });

  it("R-1 ⑤ · ⑧ · ④ · 사이드바 — 입주권 양도 + 명부 2채", () => {
    render(<Step2 form={mk(RIGHT, REPL, HOUSES)} onChange={() => {}} />);
    expect(screen.queryAllByText(/대체주택 비과세 특례 해당/).length).toBe(0);
    expect(errFields(mk(RIGHT, REPL, HOUSES), "repl")).toEqual([]);
    const full = mk(RIGHT, REPL_FULL, HOUSES);
    expect((buildOneHouseExemptionApiBody(full) as Record<string, unknown>).replacementHouse).toBeUndefined();
    expect(String(declared(full))).not.toContain("대체주택");
  });
});
