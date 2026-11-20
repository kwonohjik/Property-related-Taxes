/**
 * PR-13b anchor (2026-11 리뷰 D-31·D-32 2단계 · 결정 Q-11) — 출처 줄의 넘긴 메뉴 메타 + 계산 결론 대조 배지.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import { calcVerdictDiffers } from "@/lib/calc/one-house-judgment-provenance";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { OneHouseJudgmentProvenanceLine } from "@/components/calc/results/transfer/OneHouseJudgmentProvenanceLine";
import type { CalculationRecord } from "@/lib/storage/types";

const store = new Map<string, CalculationRecord>();
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { get: async (id: string) => store.get(id) ?? null },
}));
function seed(resultData: Record<string, unknown>) {
  store.set("rec-1", {
    id: "rec-1", userId: "u1", taxType: "one_house_exemption", title: "판정", inputData: {}, resultData,
    taxLawVersion: "2026-06-01", linkedCalculationId: null, clientId: null, inputHash: "h1",
    createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T01:00:00.000Z",
  } as CalculationRecord);
}
beforeEach(() => store.clear());
afterEach(cleanup);
const text = () => (screen.getByTestId("one-house-judgment-provenance").textContent ?? "").replace(/\s+/g, " ");

describe("메뉴 메타", () => {
  it("넘기기 patch가 메뉴를 늘 싣는다(기본 1주택 · 중과는 surcharge)", () => {
    const f = createInitialOneHouseJudgmentForm();
    expect(toTransferFormPatch(f, "rec-1", "h1")).toHaveProperty("sourceJudgmentMenu", "one_house");
    expect(toTransferFormPatch(f, undefined, undefined, "surcharge")).toHaveProperty("sourceJudgmentMenu", "surcharge");
  });
  it("중과 메뉴에서 넘긴 값은 원본이 없는 것이 정상 — 제목 「다주택 중과 판정」·확인 불가 경고가 아니다", async () => {
    render(<OneHouseJudgmentProvenanceLine form={{ importedOneHouseFacts: {} as never, sourceJudgmentMenu: "surcharge" }} />);
    await waitFor(() => expect(screen.getByTestId("one-house-judgment-provenance")).toBeTruthy());
    expect(text()).toContain("출처 — 다주택 중과 판정");
    expect(text()).not.toContain("확인할 수 없습니다");
  });
  it("대조 — 메뉴 없음(구 세션)은 확인 불가 문구", async () => {
    render(<OneHouseJudgmentProvenanceLine form={{ importedOneHouseFacts: {} as never }} />);
    await waitFor(() => expect(screen.getByTestId("one-house-judgment-provenance")).toBeTruthy());
    expect(text()).toContain("확인할 수 없습니다");
  });
});

describe("계산 결론 대조 배지(OH-18)", () => {
  it.each([
    ["비과세", { isExempt: true }, false],
    ["비과세", { isExempt: false }, true],
    ["비과세", { isExempt: false, isPartialExempt: true }, true],
    ["부분 비과세", { isExempt: false, isPartialExempt: true }, false],
    ["과세", { isExempt: false }, false],
    ["과세", { isExempt: true }, true],
    ["기간분 비과세", { isExempt: false }, undefined],
    ["해석이 갈림", { isExempt: true }, undefined],
    ["비과세", { isExempt: false, isExemptCore: true as const }, undefined],
  ] as const)("%s × %j → %s", (label, calc, want) => {
    expect(calcVerdictDiffers(label, calc)).toBe(want);
  });
  it("원본 비과세 · 계산기 과세면 「판정 결과와 다름」 · 같으면 없음", async () => {
    seed({ judgment: { isExempt: true, isPartialExempt: false } });
    const form = { sourceJudgmentId: "rec-1", sourceJudgmentInputHash: "h1", importedOneHouseFacts: {} as never, sourceJudgmentMenu: "one_house" as const };
    const r = render(<OneHouseJudgmentProvenanceLine form={form} calcExemption={{ isExempt: false }} />);
    await waitFor(() => expect(screen.getByTestId("provenance-verdict-differs")).toBeTruthy());
    expect(text()).toContain("출처 — 1세대1주택 비과세 판정");
    r.unmount();
    render(<OneHouseJudgmentProvenanceLine form={form} calcExemption={{ isExempt: true }} />);
    await waitFor(() => expect(screen.getByTestId("provenance-verdict")).toBeTruthy());
    expect(screen.queryByTestId("provenance-verdict-differs")).toBeNull();
  });
});
