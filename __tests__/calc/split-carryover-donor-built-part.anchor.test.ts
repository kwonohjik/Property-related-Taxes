/**
 * anchor — split 건물 파트 이월과세(P6) × 증여자 신축·증축 §114조의2 (PR-3: ①②③ 폼 · ④ 전송 · ⑧ 검증 · ⑧↔⑫ 정합)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-3)
 *
 *  · DBP-S   적용 범위 술어(`donorBuiltPartApplicable`) — 건물 파트가 환산일 때만, 자산 전체 술어와 상호배타
 *  · DBP-P   ④ payload — `buildingCarryoverPart.donorBuilt` 전송 · 토지 파트 미전송 · stale 미전송
 *  · DBP-V   ⑧ validate — 미입력 차단(자동 fallback 금지) · 범위 밖 stale 은 요구하지 않는다
 *  · DBP-G   ⑧↔⑫ 격자 — ⑧ 통과 ⇒ ⑫(Zod) 통과 (UI 통과 ↔ 400 모순 0)
 */
import { describe, it, expect } from "vitest";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { donorBuiltApplicable } from "@/lib/calc/donor-built-scope";
import { donorBuiltPartApplicable, donorBuiltPartActive } from "@/lib/calc/donor-built-part-scope";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { cAsset, cForm, bodyOf, issuesOf } from "./_helpers/split-carryover-c-form";
import { bAsset, bForm, B_CARRYOVER } from "./_helpers/split-carryover-b-form";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/** 건물 파트 환산 + 증여자 신축 — 신축일은 건물 증여자 취득일(2015-06-01)과 증여 등기접수일(2023-03-01) 사이 */
const EST: Partial<CarryoverTaxationForm> = {
  partEstimated: true,
  donorAcquisitionPrice: "",
  donorStandardPriceAtAcquisition: "30,000,000",
  donorBuilt: true,
  donorBuiltType: "new",
  donorBuiltDate: "2020-01-01",
};

const cWith = (co: Partial<CarryoverTaxationForm> = {}, over: Record<string, unknown> = {}) => {
  const base = cAsset();
  return cAsset({ carryover: { ...base.carryover, ...EST, ...co }, ...over });
};
const bWith = (co: Partial<CarryoverTaxationForm> = {}, over: Record<string, unknown> = {}) =>
  bAsset({ carryover: { ...B_CARRYOVER, ...EST, ...co }, ...over });

const buildingPart = (body: Record<string, unknown>) =>
  body.buildingCarryoverPart as { donorBuilt?: Record<string, unknown> } | undefined;
const landPart = (body: Record<string, unknown>) => body.landCarryoverPart as { donorBuilt?: unknown } | undefined;

describe("DBP-S 적용 범위 술어", () => {
  it("C·B 건물 파트 환산 + 토글 ON → 적용·활성", () => {
    for (const a of [cWith(), bWith()]) {
      expect(donorBuiltPartApplicable(a)).toBe(true);
      expect(donorBuiltPartActive(a)).toBe(true);
    }
  });
  it("자산 전체 술어와 상호배타 — 파트 이월과세는 전체 술어가 거절한다", () => {
    for (const a of [cWith(), bWith()]) expect(donorBuiltApplicable(a, { transferDate: "2025-06-30" })).toBe(false);
  });
  it("건물 파트가 실가 입력이면 비노출(환산 아님) / 토글 OFF 면 비활성", () => {
    expect(donorBuiltPartApplicable(cWith({ partEstimated: false }))).toBe(false);
    expect(donorBuiltPartApplicable(cWith({ donorBuilt: false }))).toBe(true);
    expect(donorBuiltPartActive(cWith({ donorBuilt: false }))).toBe(false);
  });
  it("엔진·⑫가 거부하는 조합은 비노출 — 토지 종류·부담부증여·함께 양도 두 번째 이후 자산·겸용주택", () => {
    expect(donorBuiltPartApplicable(cWith({}, { assetKind: "land" }))).toBe(false);
    expect(donorBuiltPartApplicable(cWith({}, { transferType: "burdened_gift" }))).toBe(false);
    expect(donorBuiltPartApplicable(cWith({}, { isMixedUseHouse: true }))).toBe(false);
    expect(donorBuiltPartApplicable(cWith(), { isNonPrimary: true })).toBe(false);
  });
  it("A(토지만 이월과세)는 건물 파트가 없다 → 비노출", () => {
    const a = bAsset({ acquisitionCause: "purchase", landCauseHost: "", carryover: { ...CARRYOVER_DEFAULTS, ...EST } });
    expect(donorBuiltPartApplicable(a)).toBe(false);
  });
});

describe("DBP-P ④ payload", () => {
  it("C: buildingCarryoverPart.donorBuilt 를 싣고 토지 파트에는 싣지 않는다", async () => {
    const body = await bodyOf(cForm({}, cWith()));
    expect(buildingPart(body)?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2020-01-01" });
    expect(landPart(body)?.donorBuilt).toBeUndefined();
    expect(body.carryoverTaxation).toBeUndefined();
  });
  it("B: 건물 파트에 싣는다", async () => {
    const body = await bodyOf(bForm({}, bWith()));
    expect(buildingPart(body)?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2020-01-01" });
  });
  it("증축: 바닥면적·증축 부분 기준시가를 싣는다", async () => {
    const body = await bodyOf(cForm({}, cWith({ donorBuiltType: "extension", donorBuiltExtensionArea: "90.5", donorBuiltExtensionStdPrice: "12,000,000" })));
    expect(buildingPart(body)?.donorBuilt).toEqual({
      buildingType: "extension",
      constructionDate: "2020-01-01",
      extensionFloorArea: 90.5,
      extensionStdPriceAtAcquisition: 12_000_000,
    });
  });
  it("범위 밖 stale 은 전송하지 않는다 — 토글 OFF / 실가 입력으로 되돌림", async () => {
    expect(buildingPart(await bodyOf(cForm({}, cWith({ donorBuilt: false }))))?.donorBuilt).toBeUndefined();
    expect(buildingPart(await bodyOf(cForm({}, cWith({ partEstimated: false, donorAcquisitionPrice: "50,000,000" }))))?.donorBuilt).toBeUndefined();
  });
  it("증축 stale 칸은 신축에서는 보내지 않는다", async () => {
    const body = await bodyOf(cForm({}, cWith({ donorBuiltType: "new", donorBuiltExtensionArea: "90", donorBuiltExtensionStdPrice: "12,000,000" })));
    expect(buildingPart(body)?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2020-01-01" });
  });
});

describe("DBP-V ⑧ validate — 미입력은 차단 (자동 fallback 금지)", () => {
  const msgs = (f: ReturnType<typeof cForm>) => issuesOf(f).map((i) => i.message ?? String(i)).join("\n");
  it("정상 입력(C·B)은 통과한다", () => {
    expect(issuesOf(cForm({}, cWith()))).toEqual([]);
    expect(issuesOf(bForm({}, bWith()))).toEqual([]);
  });
  it.each([
    ["구분 미선택", { donorBuiltType: "" as const }, /구분을 선택/],
    ["신축·증축일 미입력 (증여자 취득일로 채우지 않는다)", { donorBuiltDate: "" }, /대신 채우지 않습니다/],
    ["신축일이 건물 증여자 취득일보다 앞", { donorBuiltDate: "2015-05-31" }, /증여자 취득일/],
    ["신축일이 증여 등기접수일보다 뒤", { donorBuiltDate: "2023-03-02" }, /증여 등기접수일/],
  ])("C · %s → 차단", (_l, co, re) => {
    expect(msgs(cForm({}, cWith(co)))).toMatch(re);
    expect(msgs(bForm({}, bWith(co)))).toMatch(re);
  });
  it("증축 · 바닥면적 / 증축 부분 기준시가 미입력 → 차단", () => {
    expect(msgs(cForm({}, cWith({ donorBuiltType: "extension" })))).toMatch(/바닥면적/);
    expect(msgs(cForm({}, cWith({ donorBuiltType: "extension", donorBuiltExtensionArea: "100" })))).toMatch(/기준시가/);
  });
  it("범위 밖 stale (토글 OFF · 실가 입력) 은 요구하지 않는다 — 화면에 없는 칸을 요구하지 않는다", () => {
    expect(issuesOf(cForm({}, cWith({ donorBuilt: false, donorBuiltType: "", donorBuiltDate: "" })))).toEqual([]);
    expect(issuesOf(cForm({}, cWith({ partEstimated: false, donorAcquisitionPrice: "50,000,000", donorBuiltType: "", donorBuiltDate: "" })))).toEqual([]);
  });
});

describe("DBP-G ⑧↔⑫ 격자 — ⑧ 통과 ⇒ ⑫ 통과", () => {
  interface Cell { label: string; build: () => ReturnType<typeof cForm> }
  const cells: Cell[] = [];
  for (const host of ["C", "B"] as const)
    for (const type of ["new", "extension", ""] as const)
      for (const full of [true, false])
        for (const dateCase of ["inside", "before", "after", "empty"] as const) {
          const co: Partial<CarryoverTaxationForm> = {
            donorBuiltType: type,
            donorBuiltDate: dateCase === "inside" ? "2020-01-01" : dateCase === "before" ? "2015-05-31" : dateCase === "after" ? "2023-03-02" : "",
            ...(type === "extension" ? { donorBuiltExtensionArea: full ? "100" : "", donorBuiltExtensionStdPrice: full ? "15,000,000" : "" } : {}),
          };
          cells.push({
            label: `${host}/${type || "미선택"}/${full ? "완비" : "누락"}/${dateCase}`,
            build: () => (host === "C" ? cForm({}, cWith(co)) : bForm({}, bWith(co))),
          });
        }
  it(`격자 ${cells.length}셀 — ⑧이 통과시킨 입력은 ⑫(Zod)도 통과한다`, async () => {
    let passed = 0;
    for (const { label, build } of cells) {
      const f = build();
      if (issuesOf(f).length > 0) continue;
      passed++;
      const body = await bodyOf(f);
      const parsed = propertySchema.safeParse(body);
      expect(parsed.success, `${label}: ⑧ 통과인데 ⑫ 거부 — ${parsed.success ? "" : JSON.stringify(parsed.error.issues.map((i) => i.path.join(".") + ":" + i.message))}`).toBe(true);
    }
    expect(passed).toBeGreaterThanOrEqual(6); // 격자가 전부 막혀 공허하지 않다
  });
  it("완비 + 날짜 범위 안 + 구분 선택 셀은 전부 ⑧을 통과한다(⑧이 과하게 막지 않는다)", () => {
    for (const { label, build } of cells.filter((c) => c.label.includes("완비") && c.label.endsWith("inside") && !c.label.includes("미선택")))
      expect(issuesOf(build()), label).toEqual([]);
  });
  it("날짜 범위 위반은 ⑧·⑫ 둘 다 막는다 — 같은 기준(증여자 취득일 ≤ 신축일 ≤ 증여 등기접수일)", async () => {
    for (const date of ["2015-05-31", "2023-03-02"]) {
      const f = cForm({}, cWith({ donorBuiltDate: date }));
      expect(issuesOf(f).length).toBeGreaterThan(0);
      const parsed = propertySchema.safeParse(await bodyOf(f));
      expect(parsed.success).toBe(false);
    }
  });
});
