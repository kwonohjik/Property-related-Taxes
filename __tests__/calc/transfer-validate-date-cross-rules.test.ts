// 양도세 교차 날짜·구간 검증 5종 anchor (ui-upgrade 2차, 2026-06-12)
//
// 갭 점검에서 발견된 미검증 루틴:
//  1. 거주 구간 겹침 — sumResidenceMonths 단순 합산으로 이중 계산 (probe 실증 36→48개월)
//  2. 입주일 < 취득일 — 거주기간은 보유기간 중 거주만 산입 (소령 §154①·법 §95⑤2호 확인)
//  3. 이월과세 날짜 순서 — 증여자 취득 → 증여 등기 → 양도
//  4. 신축·증축 완공일 > 양도일 모순 (완공 당일 양도는 허용)
//  5. 신고일 < 양도일 모순 — 예정신고는 양도 후 (법 §105①1호 확인)
import { describe, it, expect } from "vitest";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

function baseForm() {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-06-01";
  form.contractTotalPrice = "100000000";
  form.assets[0].assetKind = "housing";
  form.assets[0].acquisitionDate = "2020-01-01";
  form.assets[0].fixedAcquisitionPrice = "50000000";
  return form;
}

function residenceForm() {
  const form = baseForm();
  form.isOneHousehold = true;
  form.householdHousingCount = "1";
  form.assets[0].residenceInputMode = "interval";
  return form;
}

describe("거주 구간 겹침·취득일 경계 (step 1)", () => {
  it("T-01: 겹치는 두 구간 → 겹침 차단 오류", () => {
    const form = residenceForm();
    form.assets[0].residencePeriods = [
      { moveInDate: "2020-02-01", moveOutDate: "2022-02-01" },
      { moveInDate: "2021-02-01", moveOutDate: "2023-02-01" },
    ];
    const issues = collectStepIssues(1, form);
    expect(issues.some((it) => it.message.includes("겹칩니다"))).toBe(true);
  });

  it("T-02: 동일 구간 2회 입력 → 겹침 차단", () => {
    const form = residenceForm();
    form.assets[0].residencePeriods = [
      { moveInDate: "2020-02-01", moveOutDate: "2022-02-01" },
      { moveInDate: "2020-02-01", moveOutDate: "2022-02-01" },
    ];
    const issues = collectStepIssues(1, form);
    expect(issues.some((it) => it.message.includes("겹칩니다"))).toBe(true);
  });

  it("T-03: 퇴거일 = 다음 입주일 (이사 당일) → 겹침 아님, 통과", () => {
    const form = residenceForm();
    form.assets[0].residencePeriods = [
      { moveInDate: "2020-02-01", moveOutDate: "2021-02-01" },
      { moveInDate: "2021-02-01", moveOutDate: "2022-02-01" },
    ];
    const issues = collectStepIssues(1, form);
    expect(issues.some((it) => it.message.includes("겹칩니다"))).toBe(false);
  });

  it("T-04: 입력 순서가 뒤섞여도 (정렬 후 비교) 겹침 탐지", () => {
    const form = residenceForm();
    form.assets[0].residencePeriods = [
      { moveInDate: "2022-01-01", moveOutDate: "2023-06-01" },
      { moveInDate: "2020-02-01", moveOutDate: "2022-06-01" }, // 앞 구간이 뒤에 입력됨
    ];
    const issues = collectStepIssues(1, form);
    expect(issues.some((it) => it.message.includes("겹칩니다"))).toBe(true);
  });

  it("T-05: 입주일 < 취득일 → 보유기간 중 거주만 산입 안내 차단 (소령 §154①·법 §95⑤)", () => {
    const form = residenceForm();
    form.assets[0].residencePeriods = [
      { moveInDate: "2019-06-01", moveOutDate: "2022-01-01" }, // 취득(2020-01-01) 전 임차 거주
    ];
    const issues = collectStepIssues(1, form);
    const hit = issues.find((it) => it.message.includes("입주일이 취득일"));
    expect(hit).toBeTruthy();
    expect(hit!.message).toContain("보유기간 중 거주만 산입");
  });

  it("T-06: 입주일 = 취득일 → 통과 (취득 당일 입주)", () => {
    const form = residenceForm();
    form.assets[0].residencePeriods = [
      { moveInDate: "2020-01-01", moveOutDate: "2022-01-01" },
    ];
    const issues = collectStepIssues(1, form);
    expect(issues.some((it) => it.message.includes("입주일이 취득일"))).toBe(false);
  });
});

describe("이월과세 날짜 순서 (step 0)", () => {
  function carryoverForm() {
    const form = baseForm();
    form.assets[0].acquisitionCause = "carryover_gift";
    form.assets[0].carryover = {
      giftRegistryDate: "2022-01-01",
      donorAcquisitionDate: "2015-01-01",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "100000000",
      useEstimatedAcquisition: false,
    } as never;
    return form;
  }

  it("T-07: 증여자 취득일 ≥ 증여 등기접수일 → 차단", () => {
    const form = carryoverForm();
    form.assets[0].carryover!.donorAcquisitionDate = "2022-01-01"; // 등기일과 동일
    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("증여자 취득일은 증여 등기접수일보다 이전"))).toBe(true);
  });

  it("T-08: 증여 등기접수일 ≥ 양도일 → 차단", () => {
    const form = carryoverForm();
    form.assets[0].carryover!.giftRegistryDate = "2024-06-01"; // 양도일과 동일
    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("증여 등기접수일은 양도일보다 이전"))).toBe(true);
  });

  it("T-09: 정상 순서 (취득 < 등기 < 양도) → 날짜 순서 오류 없음", () => {
    const form = carryoverForm();
    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("이전이어야"))).toBe(false);
  });
});

describe("신축·증축 완공일 / 신고일 순서 (step 0)", () => {
  it("T-10: 증축 완공일 > 양도일 → 차단", () => {
    const form = baseForm();
    form.assets[0].isSelfBuilt = true;
    form.assets[0].buildingType = "extension";
    form.assets[0].constructionDate = "2024-07-01"; // 양도일(2024-06-01) 이후
    form.assets[0].extensionFloorArea = "30";
    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("완공일이 양도일"))).toBe(true);
  });

  it("T-11: 완공일 = 양도일 (완공 당일 양도) → 허용", () => {
    const form = baseForm();
    form.assets[0].isSelfBuilt = true;
    form.assets[0].buildingType = "extension";
    form.assets[0].constructionDate = "2024-06-01";
    form.assets[0].extensionFloorArea = "30";
    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("완공일이 양도일"))).toBe(false);
  });

  it("T-12: 신고일 < 양도일 → 예정신고 모순 차단 (법 §105①1호)", () => {
    const form = baseForm();
    form.filingDate = "2024-05-01"; // 양도일(2024-06-01) 이전
    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("예정신고는 양도 후에만"))).toBe(true);
  });

  it("T-13: 신고일 = 양도일 (양도 당일 전자신고) → 허용", () => {
    const form = baseForm();
    form.filingDate = "2024-06-01";
    const issues = collectStepIssues(0, form);
    expect(issues.some((it) => it.message.includes("예정신고는 양도 후에만"))).toBe(false);
  });
});
