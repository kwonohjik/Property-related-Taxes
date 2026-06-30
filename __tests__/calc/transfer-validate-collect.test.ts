// collectStepIssues — 한 단계의 모든 차단 오류 일괄 수집 (두더지잡기 제거, 2026-06-12).
// 계약:
//  - 폼 수준 오류(양도일·총양도가액)와 자산별 오류(자산당 첫 1건)를 한 번에 수집
//  - push 순서 = 기존 validateStepDetailed 검사 순서 → [0]이 기존 첫 오류와 동치
//  - validateStepDetailed/validateStep은 collectStepIssues[0] 위임 (단일 진실)
import { describe, it, expect } from "vitest";
import {
  collectStepIssues,
  validateStepDetailed,
} from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";

function baseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-06-01";
  form.contractTotalPrice = "100000000";
  return form;
}

describe("collectStepIssues — step 0 일괄 수집", () => {
  it("T-01: 양도일·총양도가액·자산 오류를 한 번에 전부 수집", () => {
    const form = baseForm();
    form.transferDate = "";
    form.contractTotalPrice = "";
    // @ts-expect-error 빈 값으로 강제 트리거
    form.assets[0].assetKind = "";

    const issues = collectStepIssues(0, form);
    expect(issues.length).toBe(3);
    expect(issues[0].message).toContain("양도일");
    expect(issues[1].message).toContain("총 양도가액");
    expect(issues[2].message).toContain("자산 유형");
    expect(issues[2].assetIndex).toBe(0);
  });

  it("T-02: 다자산 — 자산별 오류를 자산당 1건씩 모두 수집 (assetIndex 부여)", () => {
    const form = baseForm();
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = ""; // 자산 1: 취득일 누락
    const second = makeDefaultAsset(2);
    second.assetKind = "housing";
    second.acquisitionDate = "2020-01-01";
    second.fixedAcquisitionPrice = ""; // 자산 2: 취득가액 누락
    second.actualSalePrice = "50000000";
    form.assets.push(second);
    form.bundledSaleMode = "actual";
    form.assets[0].actualSalePrice = "50000000";

    const issues = collectStepIssues(0, form);
    const assetIssues = issues.filter((it) => it.assetIndex != null);
    expect(assetIssues.length).toBe(2);
    expect(assetIssues[0].assetIndex).toBe(0);
    expect(assetIssues[0].message).toContain("취득일");
    expect(assetIssues[1].assetIndex).toBe(1);
    expect(assetIssues[1].message).toContain("취득가액");
  });

  it("T-03: 자산 0건이면 단독 오류 1건만 반환 (자산 루프 미진입)", () => {
    const form = baseForm();
    form.transferDate = ""; // 다른 폼 오류가 있어도
    form.assets = [];

    const issues = collectStepIssues(0, form);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain("자산을 최소 1건");
  });

  it("T-04: 양도일 누락 시 자산의 취득일-양도일 순서 검증은 오발동하지 않음", () => {
    const form = baseForm();
    form.transferDate = "";
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2020-01-01";
    form.assets[0].fixedAcquisitionPrice = "50000000";

    const issues = collectStepIssues(0, form);
    // "취득일은 양도일보다 이전" 오류가 빈 transferDate("" 비교)로 잘못 추가되면 안 됨
    expect(issues.some((it) => it.message.includes("취득일은 양도일보다 이전"))).toBe(false);
    expect(issues[0].message).toContain("양도일");
  });

  it("T-05: validateStepDetailed는 collectStepIssues[0]과 동치 (단일 진실)", () => {
    const form = baseForm();
    form.transferDate = "";
    // @ts-expect-error 빈 값으로 강제 트리거
    form.assets[0].assetKind = "";

    for (const s of [0, 1, 2, 3]) {
      const issues = collectStepIssues(s, form);
      expect(validateStepDetailed(s, form)).toEqual(issues[0] ?? null);
    }
  });

  it("T-06: 취득일 ≥ 양도일 → 자산 오류 수집 (기존 규칙 보존)", () => {
    const form = baseForm();
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2024-06-01"; // 양도일과 동일 — 차단
    form.assets[0].fixedAcquisitionPrice = "50000000";

    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("취득일은 양도일보다 이전"))).toBe(true);
  });

  it("T-07: 오류 없는 폼은 빈 배열", () => {
    const form = baseForm();
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2020-01-01";
    form.assets[0].fixedAcquisitionPrice = "50000000";

    expect(collectStepIssues(0, form)).toEqual([]);
  });

  it("T-08: step 1 — 보유 감면주택 행별 오류 일괄 수집", () => {
    const form = baseForm();
    form.householdHousingCount = ""; // 주택 수 미선택
    form.specialHouseExclusions = [
      { article: "", houseAcquisitionDate: "", houseContractDate: "" },
      { article: "조특법 §99의2", houseAcquisitionDate: "", houseContractDate: "" },
    ] as never;

    const issues = collectStepIssues(1, form);
    expect(issues.length).toBe(3);
    expect(issues[0].message).toContain("세대 보유 주택 수");
    expect(issues[1].message).toContain("보유 감면주택 1");
    expect(issues[1].message).toContain("조문");
    expect(issues[2].message).toContain("보유 감면주택 2");
    expect(issues[2].message).toContain("취득일");
  });

  // ── 토글 분리 anchor (회귀 baseline) ──────────────────────────────
  it("T-09 (anchor): 함께양도 actual — 구분 양도가액 합 ≠ 총양도가액 차단", () => {
    const form = baseForm();
    form.contractTotalPrice = "100000000";
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2020-01-01";
    form.assets[0].fixedAcquisitionPrice = "30000000";
    form.assets[0].actualSalePrice = "60000000";
    const second = makeDefaultAsset(2);
    second.assetKind = "housing";
    second.acquisitionDate = "2020-01-01";
    second.fixedAcquisitionPrice = "20000000";
    second.actualSalePrice = "30000000"; // 합 90M ≠ 100M
    form.assets.push(second);
    form.bundledSaleMode = "actual";

    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("총 양도가액과 일치하지 않"))).toBe(true);
  });

  it("T-10 (anchor): 지분분할 — anyFractional 시 합계검증 생략", () => {
    const form = baseForm();
    form.contractTotalPrice = "1000000000";
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2020-01-01";
    form.assets[0].fixedAcquisitionPrice = "300000000";
    form.assets[0].actualSalePrice = "1000000000"; // 100% 기준
    form.assets[0].ownershipNumerator = "60";
    form.assets[0].ownershipDenominator = "100";
    const second = makeDefaultAsset(2);
    second.assetKind = "housing";
    second.acquisitionDate = "2021-01-01";
    second.fixedAcquisitionPrice = "300000000";
    second.actualSalePrice = "1000000000";
    second.ownershipNumerator = "40";
    second.ownershipDenominator = "100";
    form.assets.push(second);
    form.bundledSaleMode = "actual";

    const issues = collectStepIssues(0, form);
    // anyFractional=true → 합계검증 생략 → 합계 불일치 메시지 없음
    expect(issues.some((it) => it.message.includes("총 양도가액과 일치하지 않"))).toBe(false);
  });

  it("T-11 (anchor): 지분분할 토글 ON — ownership 빈칸이면 지분율 입력 차단 (옵션 c)", () => {
    const form = baseForm();
    form.contractTotalPrice = "1000000000";
    form.assets[0].assetKind = "housing";
    form.assets[0].acquisitionDate = "2020-01-01";
    form.assets[0].fixedAcquisitionPrice = "300000000";
    form.assets[0].actualSalePrice = "1000000000";
    form.assets[0].ownershipNumerator = ""; // 토글 B ON 직후 빈칸
    form.assets[0].ownershipDenominator = "";
    const second = makeDefaultAsset(2);
    second.assetKind = "housing";
    second.acquisitionDate = "2021-01-01";
    second.fixedAcquisitionPrice = "300000000";
    second.actualSalePrice = "1000000000";
    second.ownershipNumerator = "";
    second.ownershipDenominator = "";
    form.assets.push(second);

    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("지분율(분자/분모)"))).toBe(true);
  });
});
