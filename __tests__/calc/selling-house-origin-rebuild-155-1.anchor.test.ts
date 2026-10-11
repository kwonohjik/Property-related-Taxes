/**
 * 결정 #43 하위 2 가) — 양도 주택이 기존주택의 연장(자가 재건축·원조합원 기존주택 완공)이면 §155① 종전주택 취득일은
 * 사용승인일이 아니라 **헐기 전 주택 취득일**이다 (판정 메뉴 route · ⑤ 노출 · ⑧ 검증 · 3중 패턴).
 *
 * 사실: 양도 주택 A 사용승인 2020-02-01(헐기 전 주택 취득 2012-05-01) · 명부 C 2019-06-01 취득 · 양도 2022-05-20 · 비조정 · 8억.
 *
 * | # | 사실 | 기대 |
 * |---|---|---|
 * | P-1 | 갈래 = 자가 재건축 + 헐기 전 취득일 2012-05-01 | 종전 2012-05-01 → 신규 C · 3년 이내 → 비과세(155-1) |
 * | N-1 | 갈래 비움(일반 취득) | C가 A보다 먼저 취득 → 일반 2주택 → 과세 |
 * | N-2 | 갈래만 고르고 날짜 비움 | ⑧ 오류 · 날짜는 쓰지 않는다(과세 그대로) |
 * | N-3 | 명부가 없으면(질문이 닫힌 상태) 남은 옛 값은 읽지 않는다 | 대체값 없음 |
 * | N-4 | 헐기 전 취득일이 사용승인일보다 늦다 | ⑧ 오류 |
 * | N-5 | 재개발 신축(redevelopment_apt)은 이 질문을 받지 않는다 | 질문 닫힘 · 대체값 없음 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { deriveCalcTemporaryTwoHouse } from "@/lib/calc/transfer-tax-api-body-blocks";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import {
  sellingHouseOriginIssue,
  sellingHouseOriginQuestionVisible,
  sellingHousePreviousDateOverride,
} from "@/lib/calc/selling-house-origin-scope";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2022-05-20")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

const YC = "4180025000";

const form = (asset: Record<string, unknown> = {}) => ({
  isOneHousehold: true,
  transferDate: "2022-05-20",
  contractTotalPrice: "800000000",
  asset: { assetKind: "housing", acquisitionDate: "2020-02-01", regionCode: YC, ...asset },
  houses: [{ id: "c", acquisitionOrigin: "general", region: "capital", acquisitionDate: "2019-06-01", regionCode: YC }],
});

const ids = (r: Awaited<ReturnType<typeof observeRaw>>) => (r.j?.appliedExceptions ?? []).map((e: { id: string }) => e.id);
const errors = (r: Awaited<ReturnType<typeof observeRaw>>) => r.issues.filter((x) => x.startsWith("error"));

describe("양도 주택 취득 경위 — 판정 메뉴 route", () => {
  it("P-1 자가 재건축 + 헐기 전 취득일 → 종전주택 2012-05-01 → C가 신규 주택 → 비과세", async () => {
    const r = await observeRaw(
      mkCase("2022-05-21", form({ sellingHouseRebuildKind: "self_rebuild", sellingHouseExistingAcquisitionDate: "2012-05-01" })),
    );
    expect(errors(r)).toEqual([]);
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).toContain("155-1-temporary-two-house");
    expect((r.body as { temporaryTwoHouse: { previousAcquisitionDate: string } }).temporaryTwoHouse.previousAcquisitionDate).toBe("2012-05-01");
  });
  it("P-1 원조합원 기존주택 완공도 같은 규칙이다", async () => {
    const r = await observeRaw(
      mkCase("2022-05-21", form({ sellingHouseRebuildKind: "original_member_house", sellingHouseExistingAcquisitionDate: "2012-05-01" })),
    );
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).toContain("155-1-temporary-two-house");
  });
  it("N-1 갈래를 비우면(일반 취득) C가 양도 주택보다 먼저 취득 → 일시적 2주택이 아니다 → 과세", async () => {
    const r = await observeRaw(mkCase("2022-05-21", form()));
    expect(errors(r)).toEqual([]);
    expect(r.j.isExempt).toBe(false);
    expect(ids(r)).not.toContain("155-1-temporary-two-house");
    expect((r.body as { temporaryTwoHouse?: unknown }).temporaryTwoHouse).toBeUndefined();
  });
  it("N-2 갈래만 고르고 날짜를 비우면 ⑧이 막고, 날짜는 쓰지 않는다", async () => {
    const r = await observeRaw(mkCase("2022-05-21", form({ sellingHouseRebuildKind: "self_rebuild" })));
    expect(errors(r).some((x) => x.includes("sellingHouseExistingAcquisitionDate"))).toBe(true);
    expect(r.j.isExempt).toBe(false);
  });
});

describe("양도 주택 취득 경위 — leaf", () => {
  const A = { assetKind: "housing", acquisitionDate: "2020-02-01", sellingHouseRebuildKind: "self_rebuild", sellingHouseExistingAcquisitionDate: "2012-05-01" } as never;
  it("대체값 — 질문이 열려 있고 갈래·날짜가 모두 있을 때만", () => {
    expect(sellingHousePreviousDateOverride(A, 1)).toBe("2012-05-01");
    expect(sellingHousePreviousDateOverride({ ...(A as object), sellingHouseRebuildKind: undefined } as never, 1)).toBeUndefined();
    expect(sellingHousePreviousDateOverride({ ...(A as object), sellingHouseExistingAcquisitionDate: undefined } as never, 1)).toBeUndefined();
  });
  it("N-3 명부가 없으면 질문이 닫혀 남은 옛 값을 읽지 않는다", () => {
    expect(sellingHouseOriginQuestionVisible(A, 0)).toBe(false);
    expect(sellingHousePreviousDateOverride(A, 0)).toBeUndefined();
    expect(sellingHousePreviousDateOverride(A, undefined)).toBeUndefined();
  });
  it("N-5 재개발 신축·토지 등은 질문을 받지 않는다", () => {
    expect(sellingHouseOriginQuestionVisible({ assetKind: "redevelopment_apt" }, 2)).toBe(false);
    expect(sellingHouseOriginQuestionVisible({ assetKind: "land" }, 2)).toBe(false);
    expect(sellingHousePreviousDateOverride({ ...(A as object), assetKind: "redevelopment_apt" } as never, 2)).toBeUndefined();
  });
  it("N-4 ⑧ — 날짜 누락·사용승인일보다 늦은 날짜는 오류, 일반 취득은 오류 없음", () => {
    expect(sellingHouseOriginIssue({ ...(A as object), sellingHouseExistingAcquisitionDate: undefined } as never, 1)?.field).toBe("sellingHouseExistingAcquisitionDate");
    expect(sellingHouseOriginIssue({ ...(A as object), sellingHouseExistingAcquisitionDate: "2020-02-02" } as never, 1)?.message).toContain("늦을 수 없");
    expect(sellingHouseOriginIssue({ ...(A as object), sellingHouseExistingAcquisitionDate: "2020-02-01" } as never, 1)).toBeNull();
    expect(sellingHouseOriginIssue({ assetKind: "housing", acquisitionDate: "2020-02-01" } as never, 1)).toBeNull();
    expect(sellingHouseOriginIssue(A, 0)).toBeNull();
  });
});

describe("양도 주택 취득 경위 — 계산기 ④⑧", () => {
  const calcForm = (asset: Record<string, unknown>) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2022-05-20";
    f.isOneHousehold = true;
    Object.assign(f.assets[0], { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2020-02-01", regionCode: YC, ...asset });
    f.houses = [
      { id: "c", acquisitionOrigin: "general", region: "non_capital", regionCode: YC, acquisitionDate: "2019-06-01", officialPrice: "100000000" },
    ] as never;
    return f;
  };
  it("④ 갈래·날짜가 있으면 종전주택 취득일이 헐기 전 주택 취득일이고 신규 주택은 C다 (짝: 갈래 없음 → 도출 없음)", () => {
    const f = calcForm({ sellingHouseRebuildKind: "self_rebuild", sellingHouseExistingAcquisitionDate: "2012-05-01" });
    const d = deriveCalcTemporaryTwoHouse(f, f.assets[0]);
    expect(d).toMatchObject({ previousAcquisitionDate: "2012-05-01", newAcquisitionDate: "2019-06-01", newHouseRowId: "c" });
    const g = calcForm({});
    expect(deriveCalcTemporaryTwoHouse(g, g.assets[0])).toBeUndefined();
  });
  it("⑧ 갈래만 고르고 날짜를 비우면 계산기도 같은 오류로 막는다 (판정 메뉴와 같은 leaf)", () => {
    const f = calcForm({ sellingHouseRebuildKind: "self_rebuild" });
    const msgs = collectStepIssues(1, f).map((i) => i.message);
    expect(msgs.some((m) => m.includes("헐기 전(기존) 주택 취득일"))).toBe(true);
    const ok = calcForm({});
    expect(collectStepIssues(1, ok).map((i) => i.message).some((m) => m.includes("헐기 전(기존) 주택 취득일"))).toBe(false);
  });
});
