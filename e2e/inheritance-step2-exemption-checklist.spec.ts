/**
 * E2E: 비과세·과세가액 불산입 Step2 체크리스트 패널 (2026-06-13)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 *
 * 검증:
 *  ① 마스터 "여" → 체크리스트 패널(칩 그리드) 노출
 *  ② 칩 체크 → 해당 그룹 자동 펼침 + 입력 섹션 노출
 *  ③ 칩 재클릭(체크 해제) → 입력 섹션 숨김 (그룹에 다른 체크 항목 없으면 그룹 사라짐)
 *  ④ 디폴트 접힘 (체크 없으면 그룹 노출 안 됨)
 *  ⑤ 금양임야·묘토 칩 선택 시 2억원 한도 안내 표시
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, addLandAsset } from "./_helpers/tax-flow";

/** 공통: Step0 → Step1 → Step2(마스터 여) */
async function gotoExemptionStep(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2026");
  await page.getByLabel("월").first().fill("5");
  await page.getByLabel("일").first().fill("15");
  await addHeir(page, "heir", "child");
  await page.getByRole("button", { name: /^다음/ }).click(); // Step0 → Step1
  await addLandAsset(page, { area: "100", unitPrice: "1000000" });
  await page.getByRole("button", { name: /^다음/ }).click(); // Step1 → Step2
  await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
}

test.describe("비과세 체크리스트 패널 (Step2)", () => {
  test("CL-1: 마스터 토글 없이 체크리스트 패널(칩 그리드) 바로 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 마스터 토글 제거 — 체크리스트 패널이 Step2 진입 시 바로 노출
    await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();

    // 비과세(§12) 그룹 칩 노출
    await expect(page.getByRole("button", { name: /금양임야/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /묘토/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /족보·제구/ }).first()).toBeVisible();

    // 과세가액 불산입(§16·§17) 그룹 칩 노출
    await expect(page.getByRole("button", { name: /공익법인 출연/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /공익신탁 출연/ }).first()).toBeVisible();
  });

  test("CL-2: 칩 체크 → 해당 그룹 자동 펼침 + 입력란 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 초기: 금양임야 항목 전체 텍스트 미노출 (그룹 접힘)
    await expect(page.getByText("금양임야 (禁養林野)")).not.toBeVisible();

    // 금양임야 칩 클릭 → 비과세 그룹 자동 펼침
    await page.getByRole("button", { name: /금양임야/ }).first().click();

    // 항목 노출
    await expect(page.getByText("금양임야 (禁養林野)")).toBeVisible();
    // 금액 입력란 노출
    await expect(page.getByPlaceholder("금액 입력").first()).toBeVisible();
    // 면적 입력란 노출
    await expect(page.getByPlaceholder("분묘에 속한 면적 (㎡)")).toBeVisible();
  });

  test("CL-3: 칩 재클릭(체크 해제) → 해당 항목 입력 섹션 숨김", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 족보·제구 칩 체크
    await page.getByRole("button", { name: /족보·제구/ }).first().click();
    // 입력 섹션에서 rule.name 텍스트 확인
    await expect(page.getByText("족보·제구 (族譜·祭具)")).toBeVisible();

    // 다시 클릭(해제)
    await page.getByRole("button", { name: /족보·제구/ }).first().click();

    // 족보·제구 항목명이 입력 섹션에서 숨김
    // (비과세 그룹에 체크된 항목 없으면 그룹 자체가 사라짐)
    await expect(page.getByText("족보·제구 (族譜·祭具)")).not.toBeVisible();
  });

  test("CL-4: 초기 체크 없으면 그룹 접이식 카드 미노출 (디폴트 접힘)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 체크리스트 패널은 보이지만 입력 섹션(그룹 카드) 미노출
    await expect(page.getByText(/비과세.*불산입 선택/)).toBeVisible();
    // 그룹 접이식 카드 헤더들이 없음 (체크 항목 없으므로 섹션 자체 미렌더)
    await expect(page.getByText("금양임야 (禁養林野)")).not.toBeVisible();
    await expect(page.getByText("공익법인 출연 재산")).not.toBeVisible();
  });

  test("CL-5: 금양임야·묘토 체크 시 2억원 한도 안내 노출", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);

    // 금양임야 칩 클릭
    await page.getByRole("button", { name: /금양임야/ }).first().click();

    // 2억원 한도 안내 노출
    await expect(page.getByText(/금양임야와 묘토의 비과세 합계/)).toBeVisible();
    await expect(page.getByText(/2억원 한도/).first()).toBeVisible();
  });
});
