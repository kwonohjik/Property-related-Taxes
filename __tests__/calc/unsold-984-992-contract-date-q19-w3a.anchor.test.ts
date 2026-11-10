/**
 * W3a — Q-19를 §98의4(비거주자 주택취득 10% 감면)·§99의2(신축주택등 과세특례)에 확장.
 * 「최초 매매계약일」은 조문 칸이 정본이고 필수 — 엔진은 자산-수준 매매계약일로 대신하지 않는다.
 *
 * 손계산 기준:
 *  - §98의4 취득기간 2009.3.16~2010.2.11. 취득 2010.6.1(창 밖) + 자산 계약일 2010.1.5(창 안) → 종전 적격(자산 칸 대체),
 *    이제 조문 칸이 비면 OUT_OF_CONTRACT_PERIOD. 조문 칸 2010.1.5이면 적격(10% 감면).
 *  - §99의2 매매계약 2013.4.1~2013.12.31. 조문 칸이 비고 자산 칸 2013.5.1만 있으면 MISSING_CONTRACT_DATE.
 */
import { describe, it, expect } from "vitest";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import { evaluateAnyHybridFromReduction } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";
import { checkReductionPeriod } from "@/lib/tax-engine/transfer-reductions/period-check";
import { buildPeriodContext } from "@/components/calc/transfer/UnifiedReductionPanel";

const D = (s: string) => new Date(s);

function formWith(acq: string, transfer: string, reduction: AssetReductionForm, assetContractDate = "") {
  const form = createDefaultTransferFormData();
  form.transferDate = transfer;
  form.assets[0] = { ...form.assets[0], acquisitionDate: acq, assetContractDate, reductions: [reduction] };
  return form;
}

describe("W3a 엔진 — §98의4·§99의2 자산 계약일 대체 제거", () => {
  const ctx = (acq: string, assetContractDate?: Date) => ({
    transferDate: D("2026-11-01"),
    acquisitionDate: D(acq),
    assetContractDate,
    transferIncome: 100_000_000,
  });
  const base984 = { type: "unsold_98_4", isNonResidentNoPe984: true, isNotUnsold983House984: true };

  it("§98의4: 취득일 창 밖 + 자산 칸만 창 안 → 부적격 (수정 전: 적격)", () => {
    const r = evaluateAnyHybridFromReduction(base984 as never, ctx("2010-06-01", D("2010-01-05")));
    expect(r?.isEligible).toBe(false);
    expect(r?.ineligibleReasons.map((x) => x.code)).toContain("OUT_OF_CONTRACT_PERIOD");
  });
  it("§98의4: 조문 칸이 창 안이면 적격", () => {
    const r = evaluateAnyHybridFromReduction({ ...base984, contractDate984: D("2010-01-05") } as never, ctx("2010-06-01"));
    expect(r?.isEligible).toBe(true);
  });
  it("§98의4: 취득일이 창 안이면 조문 칸이 비어도 엔진은 적격 (OR 구조 유지, 필수는 ⑧)", () => {
    const r = evaluateAnyHybridFromReduction(base984 as never, ctx("2009-06-01"));
    expect(r?.isEligible).toBe(true);
  });
  it("§99의2: 조문 칸이 비고 자산 칸만 있으면 MISSING_CONTRACT_DATE (수정 전: 자산 칸으로 판정)", () => {
    const r = evaluateAnyHybridFromReduction(
      { type: "unsold_99_2", houseType992: "new_or_unsold", acquisitionPrice992: 500_000_000, exclusiveAreaSqm992: 80 } as never,
      ctx("2013-06-01", D("2013-05-01")),
    );
    expect(r?.isEligible).toBe(false);
    expect(r?.ineligibleReasons.map((x) => x.code)).toContain("MISSING_CONTRACT_DATE");
  });
  it("§99의2: 조문 칸이 있으면 MISSING_CONTRACT_DATE 없음", () => {
    const r = evaluateAnyHybridFromReduction(
      { type: "unsold_99_2", houseType992: "new_or_unsold", contractDate992: D("2013-05-01"), acquisitionPrice992: 500_000_000, exclusiveAreaSqm992: 80 } as never,
      ctx("2013-06-01", D("2013-05-01")),
    );
    expect(r?.ineligibleReasons.map((x) => x.code)).not.toContain("MISSING_CONTRACT_DATE");
  });
});

describe("W3a ⑧ — §98의4 조문 칸 필수 (§99의2는 종전부터 필수)", () => {
  it("§98의4: 조문 칸이 비면 차단, 자산 칸만 입력해도 차단", () => {
    const r = { type: "unsold_98_4", contractDate984: "" } as AssetReductionForm;
    expect(validateStep(2, formWith("2009-06-01", "2024-06-01", r, "2009-05-01"))).toContain("§98의4 적용: 최초 매매계약일");
  });
  it("§98의4: 조문 칸 입력 시 이 검사는 통과", () => {
    const r = { type: "unsold_98_4", contractDate984: "2009-05-01" } as AssetReductionForm;
    expect(validateStep(2, formWith("2009-06-01", "2024-06-01", r)) ?? "").not.toContain("최초 매매계약일");
  });
  it("§99의2: 자산 칸만 입력해도 차단", () => {
    const r = { type: "unsold_99_2", houseType992: "new_or_unsold", contractDate992: "" } as AssetReductionForm;
    expect(validateStep(2, formWith("2013-06-01", "2024-06-01", r, "2013-05-01"))).toContain("§99의2 적용: 최초 매매계약일");
  });
});

describe("W3a ⑤ — 사전판정은 조문 칸만 본다", () => {
  const asset = (acq: string, assetContractDate: string, r: Record<string, unknown>) =>
    ({ ...createDefaultTransferFormData().assets[0], acquisitionDate: acq, assetContractDate, reductions: [r] }) as never;

  it("§99의2: 자산 칸이 창 밖이어도 조문 칸이 창 안이면 선택 가능", () => {
    const ctx = buildPeriodContext(asset("2013-06-01", "2013-01-01", { type: "unsold_99_2", contractDate992: "2013-05-01" }), "2026-11-01");
    expect(checkReductionPeriod("unsold_99_2", ctx).inPeriod).toBe(true);
  });
  it("§99의2: 조문 칸이 창 밖이면 불가 (자산 칸이 창 안이어도)", () => {
    const ctx = buildPeriodContext(asset("2013-06-01", "2013-05-01", { type: "unsold_99_2", contractDate992: "2013-01-01" }), "2026-11-01");
    expect(checkReductionPeriod("unsold_99_2", ctx).inPeriod).toBe(false);
  });
  it("§98의4: 취득일이 창 밖이어도 조문 칸이 비면 낙관 통과, 조문 칸이 창 밖이면 불가", () => {
    expect(checkReductionPeriod("unsold_98_4", buildPeriodContext(asset("2010-06-01", "2010-01-05", {}), "2026-11-01")).inPeriod).toBe(true);
    expect(
      checkReductionPeriod("unsold_98_4", buildPeriodContext(asset("2010-06-01", "2010-01-05", { type: "unsold_98_4", contractDate984: "2010-03-01" }), "2026-11-01")).inPeriod,
    ).toBe(false);
  });
  it("직접 호출(articleContractDates 없음)은 종전대로 contractDate", () => {
    expect(checkReductionPeriod("unsold_99_2", { transferDate: D("2026-01-01"), contractDate: D("2013-01-01") }).inPeriod).toBe(false);
  });
});
