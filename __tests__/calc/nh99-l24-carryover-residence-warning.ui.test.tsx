/**
 * @vitest-environment jsdom
 *
 * 이월과세 주택 — Step4 「⚠️ 조정대상지역 거주요건(2년) 불충족」 경고 (레인 L24). calc·route 단언은 `.anchor.test.ts` / `__tests__/api/…l24…`.
 * 수정 전: 게이트가 칸 없는 `acquisitionDate`(정상 경로 "")를 읽어 경고가 영원히 안 떴다.
 * 부정형(안 뜬다)에는 같은 렌더의 긍정 짝(R1·R2)을 같은 파일에 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { carryoverResidenceForm } from "./_helpers/l24-carryover-residence-form";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const WARN = "조정대상지역 거주요건(2년) 불충족";
const warns = (f: ReturnType<typeof carryoverResidenceForm>) => {
  cleanup();
  render(<Step4 form={f} onChange={() => {}} />);
  return (document.body.textContent ?? "").includes(WARN);
};

describe("Step4 거주요건 불충족 경고 — 이월과세는 증여 등기접수일로 판정", () => {
  it("🔑 R1 잔재 빔 · 등기 2019-03-01(경과규정 뒤·거주 6개월) → 경고 (수정 전: 게이트에서 영원히 숨김)", () => {
    expect(warns(carryoverResidenceForm("", "2019-03-01"))).toBe(true);
  });
  it("🔑 R2 잔재 2015 · 등기 2019-03-01 → 경고 (잔재가 아니라 등기접수일로 판정 — 엔진 isExempt=false 와 일치)", () => {
    expect(warns(carryoverResidenceForm("2015-01-01", "2019-03-01"))).toBe(true);
  });
  it("🔑 R3 잔재 2016-01 · 등기 2016-06(경과규정 2017.8.3. 전) → 경고 없음 (엔진 isExempt=true)", () => {
    expect(warns(carryoverResidenceForm("2016-01-01", "2016-06-01"))).toBe(false);
  });
  it("🔑 R4 잔재 빔 · 등기 2016-06 → 경고 없음", () => {
    expect(warns(carryoverResidenceForm("", "2016-06-01"))).toBe(false);
  });
  it("🔑 R5 잔재 2019-03 · 등기 2016-06 → 경고 없음 (잔재가 뒤여도 등기접수일이 경과규정 앞)", () => {
    expect(warns(carryoverResidenceForm("2019-03-01", "2016-06-01"))).toBe(false);
  });
  it("미완 입력 — 등기접수일 빔(잔재 있어도) → 경고 없음 (⑧이 등기접수일 칸을 막는다 — 잔재로 채우지 않는다)", () => {
    expect(warns(carryoverResidenceForm("2019-03-01", ""))).toBe(false);
    expect(warns(carryoverResidenceForm("", ""))).toBe(false);
  });
  it("거주기간 입력이 없으면 성급한 경고 없음 (기존 게이트 유지)", () => {
    expect(warns(carryoverResidenceForm("", "2019-03-01", "carryover_gift", { residencePeriodMonthsAsset: "", residencePeriods: [] }))).toBe(false);
  });
  it("대조(불변) — 일반 매매 주택: 취득일 2019-03-01 → 경고, 2016-06-01 → 없음", () => {
    expect(warns(carryoverResidenceForm("2019-03-01", "", "purchase"))).toBe(true);
    expect(warns(carryoverResidenceForm("2016-06-01", "", "purchase"))).toBe(false);
  });
  it("경고 문구가 렌더 DOM 에서 조회된다 (testing-library 텍스트)", () => {
    render(<Step4 form={carryoverResidenceForm("", "2019-03-01")} onChange={() => {}} />);
    expect(screen.getByText(/조정대상지역 거주요건\(2년\) 불충족/)).toBeTruthy();
  });
});
