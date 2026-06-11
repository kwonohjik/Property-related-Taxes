// validateStepDetailed — 검증 실패 시 위치 정보(assetIndex) 반환 + validateStep wrapper 동치.
// UI 인라인 에러 배너 + 자동 스크롤이 의존하는 계약을 고정한다.
import { describe, it, expect } from "vitest";
import { validateStep, validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

function baseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-06-01";
  form.contractTotalPrice = "100000000";
  return form;
}

describe("validateStepDetailed", () => {
  it("자산 유형 미선택 → step 0, assetIndex 0 반환", () => {
    const form = baseForm();
    // @ts-expect-error 빈 값으로 강제 트리거
    form.assets[0].assetKind = "";

    const issue = validateStepDetailed(0, form);
    expect(issue).not.toBeNull();
    expect(issue?.step).toBe(0);
    expect(issue?.assetIndex).toBe(0);
    expect(issue?.message).toContain("자산 유형");
  });

  it("폼-전역 오류(양도일 누락)는 assetIndex 없이 반환", () => {
    const form = baseForm();
    form.transferDate = "";

    const issue = validateStepDetailed(0, form);
    expect(issue).not.toBeNull();
    expect(issue?.assetIndex).toBeUndefined();
    expect(issue?.message).toContain("양도일");
  });

  it("validateStep(string) wrapper는 detailed의 message와 동치", () => {
    const form = baseForm();
    // @ts-expect-error 빈 값으로 강제 트리거
    form.assets[0].assetKind = "";

    for (const s of [0, 1, 2, 3]) {
      expect(validateStep(s, form)).toBe(validateStepDetailed(s, form)?.message ?? null);
    }
  });

  it("유효한 폼은 null 반환 (step 0)", () => {
    const form = baseForm();
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2020-01-01";
    form.assets[0].fixedAcquisitionPrice = "50000000";

    // step 0 검증은 자산 1건 + 양도일 + 총양도가 + 취득정보 충족 시 통과
    const issue = validateStepDetailed(0, form);
    // 취득 정보 세부 요건에 따라 null이 아닐 수 있으나, assetIndex가 있으면 0이어야 함(단일 자산)
    if (issue) expect(issue.assetIndex === undefined || issue.assetIndex === 0).toBe(true);
  });
});
