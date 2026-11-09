/**
 * Q-19 (US-41·US-46) — 「최초 매매계약일」은 조문 칸이 정본이고 필수다.
 *
 *  - 엔진: §98·§98의2·§98의3·§98의5·§98의7은 자산-수준 매매계약일(assetContractDate)로 대신하지 않는다.
 *  - ⑧: §98·§98의2 조문 칸 필수 (§98의3 매수·§98의5·§98의7은 종전부터 필수).
 *  - ⑤: 사전판정은 조문 칸만 본다(칸이 비면 낙관 통과).
 *  - 명부 행 ⑥: §98·§98의2·§98의3·§98의5·§98의7 매매계약일 필수.
 */
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { evaluateAnyHybridFromReduction } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
import { requiresRowContractDate } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { collectSpecialHouseExclusionRowErrors } from "@/lib/calc/house-count-exclusion-reduction-validate";
import { buildPeriodContext } from "@/components/calc/transfer/UnifiedReductionPanel";

const D = (s: string) => new Date(s);

function formWith(acq: string, transfer: string, reduction: AssetReductionForm, assetContractDate = "") {
  const form = createDefaultTransferFormData();
  form.transferDate = transfer;
  form.assets[0] = { ...form.assets[0], acquisitionDate: acq, assetContractDate, reductions: [reduction] };
  return form;
}

describe("Q-19 엔진 — 자산 계약일 대체 제거", () => {
  const ctx = (assetContractDate?: Date) => ({
    transferDate: D("2026-11-01"),
    acquisitionDate: D("2013-03-15"),
    assetContractDate,
    transferIncome: 100_000_000,
  });
  it("§98의7: 조문 칸이 비고 자산 칸만 있으면 MISSING_CONTRACT_DATE 부적격 (수정 전: 적격)", () => {
    const r = evaluateAnyHybridFromReduction({ type: "unsold_98_7", acquisitionPrice987: 500_000_000 } as never, ctx(D("2012-10-15")));
    expect(r?.isEligible).toBe(false);
    expect(r?.ineligibleReasons.map((x) => x.code)).toContain("MISSING_CONTRACT_DATE");
  });
  it("§98의7: 조문 칸이 있으면 자산 칸과 무관하게 판정", () => {
    const r = evaluateAnyHybridFromReduction(
      { type: "unsold_98_7", contractDate987: D("2012-10-15"), acquisitionPrice987: 500_000_000 } as never,
      ctx(D("2010-01-01")),
    );
    expect(r?.ineligibleReasons.map((x) => x.code)).not.toContain("MISSING_CONTRACT_DATE");
  });
  it("§98의3·§98의5: 자산 칸만 있으면 MISSING_CONTRACT_DATE", () => {
    for (const type of ["unsold_98_3", "unsold_98_5"]) {
      const r = evaluateAnyHybridFromReduction({ type, houseType983: "purchased" } as never, ctx(D("2010-06-01")));
      expect(r?.ineligibleReasons.map((x) => x.code)).toContain("MISSING_CONTRACT_DATE");
    }
  });
});

describe("Q-19 ⑧ — 조문 칸 필수", () => {
  it("§98: 조문 칸이 비면 차단, 자산 칸만 입력해도 차단", () => {
    const r = { type: "unsold_98", contractDate98: "" } as AssetReductionForm;
    expect(validateStep(2, formWith("1996-06-01", "2024-06-01", r, "1996-05-01"))).toContain("§98 적용: 최초 매매계약일");
  });
  it("§98: 조문 칸 입력 시 이 검사는 통과", () => {
    const r = { type: "unsold_98", contractDate98: "1996-05-01" } as AssetReductionForm;
    expect(validateStep(2, formWith("1996-06-01", "2024-06-01", r)) ?? "").not.toContain("최초 매매계약일");
  });
  it("§98의2: 조문 칸이 비면 차단", () => {
    const r = { type: "unsold_98_2", contractDate982: "", occupiedAtContract982: "no" } as AssetReductionForm;
    expect(validateStep(2, formWith("2009-03-02", "2024-06-01", r, "2009-01-01"))).toContain("§98의2 적용: 최초 매매계약일");
  });
  it("§98의5·§98의7: 자산 칸만 입력해도 차단 (종전과 동일)", () => {
    const r5 = { type: "unsold_98_5", contractDate985: "" } as AssetReductionForm;
    expect(validateStep(2, formWith("2010-06-01", "2024-06-01", r5, "2010-05-20"))).toContain("§98의5 적용: 최초 매매계약일");
    const r7 = { type: "unsold_98_7", contractDate987: "" } as AssetReductionForm;
    expect(validateStep(2, formWith("2013-03-15", "2024-06-01", r7, "2012-10-15"))).toContain("§98의7 적용: 최초 매매계약일");
  });
});

describe("Q-19 ⑤ — 사전판정은 조문 칸만 본다", () => {
  const asset = (assetContractDate: string, r: Record<string, unknown>) =>
    ({ ...createDefaultTransferFormData().assets[0], acquisitionDate: "2011-06-01", assetContractDate, reductions: [r] }) as never;

  it("§98의5: 자산 칸이 창 밖이어도 조문 칸이 창 안이면 선택 가능 (수정 전: 불가)", () => {
    const ctx = buildPeriodContext(asset("2011-06-01", { type: "unsold_98_5", contractDate985: "2010-05-20" }), "2026-11-01");
    expect(checkReductionPeriod("unsold_98_5", ctx).inPeriod).toBe(true);
  });
  it("§98의5: 조문 칸이 비면 자산 칸이 창 밖이어도 낙관 통과", () => {
    const ctx = buildPeriodContext(asset("2011-06-01", {}), "2026-11-01");
    expect(checkReductionPeriod("unsold_98_5", ctx).inPeriod).toBe(true);
  });
  it("§98의5: 조문 칸이 창 밖이면 불가", () => {
    const ctx = buildPeriodContext(asset("2010-06-01", { type: "unsold_98_5", contractDate985: "2011-06-01" }), "2026-11-01");
    expect(checkReductionPeriod("unsold_98_5", ctx).inPeriod).toBe(false);
  });
  it("§98: 취득일이 창 밖이어도 조문 칸이 비면 낙관 통과 → 조문 칸에 도달 가능", () => {
    const a = { ...createDefaultTransferFormData().assets[0], acquisitionDate: "1999-03-01", reductions: [] } as never;
    expect(checkReductionPeriod("unsold_98", buildPeriodContext(a, "2026-11-01")).inPeriod).toBe(true);
  });
  it("직접 호출(articleContractDates 없음)은 종전대로 contractDate", () => {
    expect(checkReductionPeriod("unsold_98_5", { transferDate: D("2016-01-01"), contractDate: D("2010-05-13") }).inPeriod).toBe(false);
  });
});

describe("Q-19 · US-46 명부 행 ⑥ — 매매계약일 필수", () => {
  it.each(["unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_7", "unsold_98_8", "unsold_99_2"])("%s 필수", (article) => {
    expect(requiresRowContractDate(article)).toBe(true);
    const errs = collectSpecialHouseExclusionRowErrors({ article, houseAcquisitionDate: "2013-06-01", houseContractDate: "", requirementsConfirmed: true } as never);
    expect(errs.join()).toContain("매매계약일");
  });
  it("계약일을 넣으면 통과", () => {
    expect(
      collectSpecialHouseExclusionRowErrors({ article: "unsold_98_7", houseAcquisitionDate: "2013-06-01", houseContractDate: "2012-10-15", requirementsConfirmed: true } as never),
    ).toEqual([]);
  });
  it("§98의6·임대개시 조문은 대상 아님", () => {
    expect(requiresRowContractDate("unsold_98_6")).toBe(false);
    expect(requiresRowContractDate("rental_97")).toBe(false);
  });
});
