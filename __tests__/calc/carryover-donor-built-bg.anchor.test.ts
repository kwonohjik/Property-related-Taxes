/**
 * anchor — 부담부증여 × 이월과세 × 당초 증여자 신축·증축 §114조의2 (PR-4: ④ 전송 · ⑧ 검증 · ⑧↔⑫ 정합 · ⑤ 술어)
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-4)
 *
 *  · DBG-S   적용 범위 술어(`donorBuiltBgApplicable`) — K-5 환산·K-7 감정만, 다른 두 술어와 상호배타
 *  · DBG-P   ④ payload — `burdenedGiftInfo.carryoverDonorBasis.donorBuilt` 전송 · 증축 감정가액 · stale 미전송 · 양도인 본인 신축 축 분리
 *  · DBG-V   ⑧ validate — 미입력 차단(자동 fallback 금지) · 범위 밖 stale 은 요구하지 않는다
 *  · DBG-G   ⑧↔⑫ 격자 — ⑧ 통과 ⇒ ⑫(Zod) 통과 (UI 통과 ↔ 400 모순 0)
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { buildBurdenedGiftInfo } from "@/lib/calc/transfer-tax-api-burdened-gift";
import { donorBuiltApplicable } from "@/lib/calc/donor-built-scope";
import { donorBuiltPartApplicable } from "@/lib/calc/donor-built-part-scope";
import { donorBuiltBgApplicable, donorBuiltBgActive } from "@/lib/calc/donor-built-bg-scope";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => vi.unstubAllGlobals());

import { bgAsset as asset, bgForm as form, bodyOf } from "./_helpers/carryover-donor-built-bg-form";
const donorBuiltOf = (body: Record<string, unknown>) =>
  ((body.burdenedGiftInfo as { carryoverDonorBasis?: { donorBuilt?: Record<string, unknown> } } | undefined)?.carryoverDonorBasis)?.donorBuilt;
const issues = (f: TransferFormData) => collectStepIssues(0, f).map((i) => i.message ?? String(i));

describe("DBG-S 적용 범위 술어", () => {
  it("K-5 환산 · K-7 감정 + 이월과세 + 부담부증여 → 적용·활성", () => {
    for (const m of ["converted", "appraisal"] as const) {
      expect(donorBuiltBgApplicable(asset(m))).toBe(true);
      expect(donorBuiltBgActive(asset(m))).toBe(true);
    }
  });
  it("토글 OFF 면 비활성 · 실지(K-4)·매매사례가액(K-6)·기준시가(K-1~K-3)는 비노출", () => {
    expect(donorBuiltBgActive(asset("converted", { donorBuilt: false }))).toBe(false);
    expect(donorBuiltBgApplicable(asset("converted", {}, { bgAcquisitionMethod: "actual" }))).toBe(false);
    expect(donorBuiltBgApplicable(asset("converted", {}, { bgAcquisitionMethod: "salesCase" }))).toBe(false);
    expect(donorBuiltBgApplicable(asset("converted", {}, { bgValuationMode: "sangjeungbeop_standard" }))).toBe(false);
  });
  it("토지·겸용주택·이월과세 아님·부담부증여 아님은 비노출", () => {
    expect(donorBuiltBgApplicable(asset("converted", {}, { assetKind: "land" }))).toBe(false);
    expect(donorBuiltBgApplicable(asset("converted", {}, { isMixedUseHouse: true }))).toBe(false);
    expect(donorBuiltBgApplicable(asset("converted", {}, { acquisitionCause: "purchase" }))).toBe(false);
    expect(donorBuiltBgApplicable(asset("converted", {}, { transferType: "regular" }))).toBe(false);
  });
  it("자산 전체·분리 이월과세 술어와 상호배타 — 부담부증여는 저쪽 둘이 거절한다", () => {
    const a = asset("converted");
    expect(donorBuiltApplicable(a, { transferDate: "2026-02-16" })).toBe(false);
    expect(donorBuiltPartApplicable(a)).toBe(false);
  });
});

describe("DBG-P ④ payload", () => {
  it("신축: burdenedGiftInfo.carryoverDonorBasis.donorBuilt 로 실린다 (carryoverTaxation 에는 없다)", async () => {
    const body = await bodyOf(form(asset("converted")));
    expect(donorBuiltOf(body)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect((body.carryoverTaxation as { donorBuilt?: unknown }).donorBuilt).toBeUndefined();
  });
  it("증축 K-5: 바닥면적 + 증축 부분 기준시가 / 증축 K-7: 바닥면적 + info.presumedExtensionAppraisalValue (기준시가 칸은 싣지 않는다)", async () => {
    const co = { donorBuiltType: "extension" as const, donorBuiltExtensionArea: "90.5", donorBuiltExtensionStdPrice: "40,000,000" };
    expect(donorBuiltOf(await bodyOf(form(asset("converted", co))))).toEqual({
      buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 90.5, extensionStdPriceAtAcquisition: 40_000_000,
    });
    const body = await bodyOf(form(asset("appraisal", co, { bgPresumedExtensionAppraisal: "80,000,000" })));
    expect(donorBuiltOf(body)).toEqual({ buildingType: "extension", constructionDate: "2022-01-10", extensionFloorArea: 90.5 });
    expect((body.burdenedGiftInfo as { presumedExtensionAppraisalValue?: number }).presumedExtensionAppraisalValue).toBe(80_000_000);
  });
  it("범위 밖 stale 은 전송하지 않는다 — 토글 OFF / 실지로 되돌림 / 이월과세 아님", async () => {
    expect(donorBuiltOf(await bodyOf(form(asset("converted", { donorBuilt: false }))))).toBeUndefined();
    expect(donorBuiltOf(await bodyOf(form(asset("converted", {}, { bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionTotal: "100,000,000" }))))).toBeUndefined();
  });
  it("stale 증축 감정가액은 신축에서는 보내지 않는다 / 양도인 본인 신축 축은 이월과세에서 보내지 않는다(두 축 분리)", async () => {
    const a = asset("appraisal", { donorBuiltType: "new" }, { bgPresumedExtensionAppraisal: "80,000,000", isSelfBuilt: true, buildingType: "extension", constructionDate: "2024-01-01" });
    const body = await bodyOf(form(a));
    expect((body.burdenedGiftInfo as { presumedExtensionAppraisalValue?: number }).presumedExtensionAppraisalValue).toBeUndefined();
    expect(body.isSelfBuilt).not.toBe(true);
    expect(buildBurdenedGiftInfo(a) as unknown as Record<string, unknown>).toBeTruthy();
  });
});

describe("DBG-V ⑧ validate — 미입력은 차단 (자동 fallback 금지)", () => {
  it("정상 입력(K-5·K-7)은 통과한다", () => {
    expect(issues(form(asset("converted")))).toEqual([]);
    expect(issues(form(asset("appraisal")))).toEqual([]);
  });
  it.each([
    ["구분 미선택", { donorBuiltType: "" as const }, /구분을 선택/],
    ["신축·증축일 미입력 (증여자 취득일로 채우지 않는다)", { donorBuiltDate: "" }, /대신 채우지 않습니다/],
    ["신축일이 당초 증여자 취득일보다 앞", { donorBuiltDate: "2000-05-31" }, /당초 증여자 취득일/],
    ["신축일이 증여 등기접수일보다 뒤", { donorBuiltDate: "2023-06-02" }, /증여 등기접수일/],
  ])("%s → 차단", (_l, co, re) => {
    for (const m of ["converted", "appraisal"] as const) expect(issues(form(asset(m, co))).join("\n")).toMatch(re);
  });
  it("증축 — 바닥면적 / K-5 증축 부분 기준시가 / K-7 증축 부분 감정가액(게이트 열림) 미입력 → 차단", () => {
    const ext = { donorBuiltType: "extension" as const };
    expect(issues(form(asset("converted", ext))).join("\n")).toMatch(/바닥면적/);
    expect(issues(form(asset("converted", { ...ext, donorBuiltExtensionArea: "90" }))).join("\n")).toMatch(/기준시가/);
    expect(issues(form(asset("appraisal", { ...ext, donorBuiltExtensionArea: "90" }))).join("\n")).toMatch(/증축한 부분의 감정가액/);
  });
  it("증축 K-7 감정가액이 당초 증여자 감정가액 총액보다 크면 차단 / 85㎡ 이하(게이트 닫힘)는 요구하지 않는다", () => {
    const ext = { donorBuiltType: "extension" as const, donorBuiltExtensionArea: "90" };
    expect(issues(form(asset("appraisal", ext, { bgPresumedExtensionAppraisal: "250,000,000" }))).join("\n")).toMatch(/클 수 없습니다/);
    expect(issues(form(asset("appraisal", { ...ext, donorBuiltExtensionArea: "85" }))).join("\n")).toBe("");
  });
  it("범위 밖 stale (토글 OFF · 실지) 은 요구하지 않는다 — 화면에 없는 칸을 요구하지 않는다", () => {
    expect(issues(form(asset("converted", { donorBuilt: false, donorBuiltType: "", donorBuiltDate: "" })))).toEqual([]);
  });
});

describe("DBG-G ⑧↔⑫ 격자 — ⑧ 통과 ⇒ ⑫ 통과", () => {
  interface Cell { label: string; f: () => TransferFormData }
  const cells: Cell[] = [];
  for (const m of ["converted", "appraisal"] as const)
    for (const type of ["new", "extension", ""] as const)
      for (const full of [true, false])
        for (const date of ["2022-01-10", "2000-05-31", "2023-06-02", ""])
          for (const area of ["90", "85"]) {
            const co: Partial<CarryoverTaxationForm> = {
              donorBuiltType: type,
              donorBuiltDate: date,
              ...(type === "extension" ? { donorBuiltExtensionArea: area, donorBuiltExtensionStdPrice: full ? "40,000,000" : "" } : {}),
            };
            cells.push({ label: `${m}/${type || "미선택"}/${full ? "완비" : "누락"}/${date || "빈칸"}/${area}`, f: () => form(asset(m, co, type === "extension" && full ? { bgPresumedExtensionAppraisal: "80,000,000" } : {})) });
          }
  it(`격자 ${cells.length}셀 — ⑧이 통과시킨 입력은 ⑫(Zod)도 통과한다`, async () => {
    let passed = 0;
    for (const { label, f } of cells) {
      const ff = f();
      if (issues(ff).length > 0) continue;
      passed++;
      const parsed = propertySchema.safeParse(await bodyOf(ff));
      expect(parsed.success, `${label}: ⑧ 통과인데 ⑫ 거부 — ${parsed.success ? "" : JSON.stringify(parsed.error.issues.map((i) => i.path.join(".") + ":" + i.message))}`).toBe(true);
    }
    expect(passed).toBeGreaterThanOrEqual(8); // 격자가 전부 막혀 공허하지 않다
  });
  it("날짜 범위 위반은 ⑧·⑫ 둘 다 막는다 — 같은 기준(당초 증여자 취득일 ≤ 신축일 ≤ 증여 등기접수일)", async () => {
    for (const date of ["2000-05-31", "2023-06-02"]) {
      const f = form(asset("converted", { donorBuiltDate: date }));
      expect(issues(f).length).toBeGreaterThan(0);
      expect(propertySchema.safeParse(await bodyOf(f)).success).toBe(false);
    }
  });
});
