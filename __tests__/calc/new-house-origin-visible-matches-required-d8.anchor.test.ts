/**
 * 결정 #43 — 신규 주택 취득 경위 질문의 ⑤ 노출과 ⑧ 필수가 **같은 목록**을 읽는다 (막다른 오류 방지).
 *
 * 합가 D8 「상대 쪽 두 주택」 짝(B → C)은 C가 양도 주택(A)보다 먼저 취득돼도 신규 주택으로 도출된다(사전-2026-법규재산-0643).
 * ⑧은 그 행(C)에 경위를 요구하는데 ⑤가 「양도 주택보다 나중 취득」만 열면 C에는 답할 칸이 없다.
 *
 * | # | 사실 | 기대 |
 * |---|---|---|
 * | P-1 | A 2015-02-22 · B 2010-11-23 · C 2012-04-19(상대 쪽) · 혼인 2022-11-23 | 도출 C · ⑧ 요구 · ⑤ 연다 |
 * | N-1 | 도출되지 않은 행 | 양도 주택보다 먼저 취득했으면 ⑤ 닫힘 · ⑧ 요구 없음 |
 */
import { describe, it, expect, vi } from "vitest";
import { mkCase } from "./_one-house-pr3a-judge-route";
import { buildCaseForm } from "./one-house-rulings/harness";
import { judgmentDerivedNewHouse } from "@/lib/calc/one-house-judgment-temp-two-house";
import { newHouseOriginIssue, newHouseOriginQuestionVisible } from "@/lib/calc/new-house-origin-scope";
import { primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";

const f = {
  isOneHousehold: true,
  transferDate: "2023-06-01",
  contractTotalPrice: "800000000",
  marriageDate: "2022-11-23",
  isFirstTransferredInMerge: true,
  asset: { assetKind: "housing", acquisitionDate: "2015-02-22" },
  houses: [
    { id: "b", region: "capital", acquisitionDate: "2010-11-23", mergeOrigin: "counterpart_side" },
    { id: "c", region: "capital", acquisitionDate: "2012-04-19", mergeOrigin: "counterpart_side" },
  ],
};

function build() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2023-06-02T03:00:00Z"));
  try {
    return buildCaseForm(mkCase("2023-06-02", f));
  } finally {
    vi.useRealTimers();
  }
}

describe("신규 주택 경위 — ⑤ 노출 = ⑧ 필수 (D8 상대 쪽 짝)", () => {
  const form = build();
  const derived = judgmentDerivedNewHouse(form);
  const primaryDate = primaryAcquisitionDateOf(form.assets?.[0]);
  const rowC = form.houses!.find((h) => h.id === "c")!;
  const rowB = form.houses!.find((h) => h.id === "b")!;

  it("P-1 상대 쪽 짝 C가 신규 주택으로 도출되고, C는 양도 주택보다 먼저 취득했다", () => {
    expect(derived?.newHouseRowId).toBe("c");
    expect(rowC.acquisitionDate! < primaryDate!).toBe(true);
  });
  it("P-1 ⑧이 C에 경위를 요구하면 ⑤는 C에 질문을 연다", () => {
    expect(newHouseOriginIssue(rowC, derived?.newHouseRowId)?.field).toBe("acquisitionOrigin");
    expect(newHouseOriginQuestionVisible(form.assets?.[0]?.assetKind, primaryDate, rowC, derived?.newHouseRowId)).toBe(true);
  });
  it("N-1 도출되지 않은 행(B)은 ⑧도 요구하지 않고, 양도 주택보다 먼저 취득했으면 ⑤도 닫혀 있다", () => {
    expect(newHouseOriginIssue(rowB, derived?.newHouseRowId)).toBeNull();
    expect(newHouseOriginQuestionVisible(form.assets?.[0]?.assetKind, primaryDate, rowB, derived?.newHouseRowId)).toBe(false);
  });
  it("N-1 도출 결과를 넘기지 않으면(직접 선언 경로) 종전 후보 술어 그대로다", () => {
    expect(newHouseOriginQuestionVisible(form.assets?.[0]?.assetKind, primaryDate, rowC)).toBe(false);
  });
});
