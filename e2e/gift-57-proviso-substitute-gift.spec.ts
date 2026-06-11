/**
 * E2E: 증여세 §57① 단서 — 조부모 증여 + 단서 토글 ON → 결과 할증 0 확인
 *
 * 시나리오:
 *   1. 증여자: 조부모 선택
 *   2. §57① 단서 ToggleCard 노출 확인
 *   3. 단서 토글 ON → 세대생략 할증 배제 표시 확인
 *
 * 주의: worktree에서 실행 시 E2E_PORT=3100 필수 (memory: feedback_e2e_worktree_port_isolation).
 *       서버 미실행 시 미실행 명시 — spec 작성 완료, 실행 미수행.
 */
import { test, expect } from "@playwright/test";
import {
  addLandAsset,
  calcAndWaitResult,
  fillDateAndVerify,
  nextSteps,
} from "./_helpers/tax-flow";

test.describe("§57① 단서 — 조부모 증여 + 할증 배제 토글", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/calc/gift-tax");
  });

  test("[E2E-G57-1] 조부모 선택 시 §57① 단서 ToggleCard 노출", async ({ page }) => {
    // Step0: 증여일 입력
    await page.getByLabel("연도").first().fill("2025");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    // 증여자 select에서 조부모 선택
    await page.locator("select").first().selectOption("grandparent");

    // §57① 단서 토글 노출 확인
    await expect(
      page.getByText("§57① 단서 — 증여자의 최근친 직계비속 사망 (할증 배제)"),
    ).toBeVisible();
  });

  test("[E2E-G57-2] 조부모 외 선택 시 §57① 단서 ToggleCard 미노출", async ({ page }) => {
    // Step0: 증여일 입력
    await page.getByLabel("연도").first().fill("2025");
    await page.getByLabel("월").first().fill("06");
    await page.getByLabel("일").first().fill("01");

    // 부(father) 선택 → 단서 토글 미노출
    await page.locator("select").first().selectOption("father");

    await expect(
      page.getByText("§57① 단서 — 증여자의 최근친 직계비속 사망 (할증 배제)"),
    ).not.toBeVisible();
  });

  test("[E2E-G57-3] 조부모 + 단서 토글 ON → 결과 할증 배제 안내 표시", async ({ page }) => {
    test.setTimeout(90_000);

    // Step0: 증여일 + 조부모 선택 + 단서 토글 ON
    await fillDateAndVerify(page, { year: "2025", month: "6", day: "1" });
    await page.locator("select").first().selectOption("grandparent");
    await page
      .getByText("§57① 단서 — 증여자의 최근친 직계비속 사망 (할증 배제)")
      .click();
    await page.getByRole("button", { name: /^다음/ }).click();

    // Step1: 토지 자산 추가 (검증된 공용 헬퍼) + 자산명 (토지 필수 — 편집 모달 안 입력)
    await addLandAsset(page, {
      area: "300",
      unitPrice: "1000000",
      addButtonName: /증여재산 추가/,
      keepModalOpen: true,
    });
    await page.getByPlaceholder(/본가 토지/).fill("본가 토지");
    await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();

    // Step1→2→3 → 계산 (API 응답 명시 대기)
    await nextSteps(page, 2);
    await calcAndWaitResult(page, { taxType: "gift" });

    // 결과 화면: 단서 배제 안내 (GiftTaxResultView generationSkipProvisoApplied div)
    await expect(
      page.getByText(/세대생략 할증과세 배제 \(상증법 §57① 단서\)/),
    ).toBeVisible({ timeout: 10_000 });

    // 할증 산출근거 카드(detail null로 비활성)가 없는지 확인
    await expect(
      page.getByText(/세대생략 할증과세 산출근거/),
    ).not.toBeVisible();
  });
});
