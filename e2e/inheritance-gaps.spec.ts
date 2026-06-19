/**
 * E2E: 상속세 잔여 갭 5a·4 (2026-06-19)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]] (E2E_PORT=3102)
 *
 * 갭5a: 공익법인 출연 → 동족주식 한도(§16②) 토글 → 주식수 입력 → 초과분 실시간 미리보기
 * 갭4 : 부동산 자산 편집 모달 → 상속인 거주주택(§74②6호) 토글 노출·체크
 *
 * 엔진 numeric은 unit anchor(public-interest-stock-limit.test·payment-in-kind.test)로 검증됨.
 * 본 spec은 UI 위젯 배선(폼→엔진 헬퍼 미리보기·flag 토글)을 브라우저에서 검증.
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir, addLandAsset } from "./_helpers/tax-flow";

/** Step0(상속인·상속개시일) → Step1(재산) → Step2(비과세·불산입) */
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

async function openPublicInterestStockLimit(page: Page) {
  await page.getByRole("button", { name: /공익법인 출연/ }).first().click();
  await expect(page.getByText("공익법인 출연 재산")).toBeVisible();
  await page.getByRole("switch", { name: /동족주식 한도/ }).click();
}

test.describe("갭5a — 공익법인 동족주식 한도 자동계산 (§16②)", () => {
  test("GAP5A-1: 일반 10% — 발행10만·출연1.5만 → 초과 5,000주·50,000,000 미리보기", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);
    await openPublicInterestStockLimit(page);

    await page.getByTestId("pi-total-shares").locator("input").fill("100000");
    await page.getByTestId("pi-donated-shares").locator("input").fill("15000");
    await page.getByTestId("pi-value-per-share").locator("input").fill("10000");

    const preview = page.getByTestId("pi-excess-preview");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("5,000");
    await expect(preview).toContainText("50,000,000");
  });

  test("GAP5A-2: 가목 20% — 한도 2만주 ≥ 출연 1.5만 → 전액 불산입(초과 0)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoExemptionStep(page);
    await openPublicInterestStockLimit(page);

    await page.getByRole("radio", { name: /자선·장학·사회복지/ }).click();
    await page.getByTestId("pi-total-shares").locator("input").fill("100000");
    await page.getByTestId("pi-donated-shares").locator("input").fill("15000");
    await page.getByTestId("pi-value-per-share").locator("input").fill("10000");

    await expect(page.getByTestId("pi-excess-preview")).toContainText("한도 이내");
  });
});

test.describe("갭4 — 물납 상속인 거주주택 분류 (§74②6호)", () => {
  test("GAP4-1: 부동산 편집 모달에 거주주택 토글 노출·체크", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/inheritance-tax");
    await page.getByLabel("연도").first().fill("2026");
    await page.getByLabel("월").first().fill("5");
    await page.getByLabel("일").first().fill("15");
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click(); // Step0 → Step1
    // 편집 모달 유지 — 모달 안 거주주택 토글 조작
    await addLandAsset(page, {
      area: "100",
      unitPrice: "1000000",
      keepModalOpen: true,
    });

    const toggle = page.getByRole("switch", { name: /상속인 거주 주택/ });
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toBeChecked();
  });
});

test.describe("갭3 — 영농 사후관리 prefill 강화 (deathDate·filingDeadline)", () => {
  test("GAP3-1: 쿼리 prefill → 시뮬레이터 신고기한 사전 입력", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(
      "/calc/inheritance-postmgmt?originalDeduction=1000000000&deathDate=2025-01-01&filingDeadline=2025-07-31",
    );
    await expect(
      page.getByRole("heading", { name: "영농상속공제 사후관리 시뮬레이터" }),
    ).toBeVisible();
    // prefill 안내 배너 + 신고기한 값 노출 (배너 고유 텍스트로 한정 — 입력란 라벨과 구분)
    await expect(page.getByText(/메인 마법사에서 진입/)).toBeVisible();
    await expect(page.getByText("2025-07-31")).toBeVisible();
    // 신고기한 DateInput(첫 DateInput) 연도 prefill
    await expect(page.getByLabel("연도").first()).toHaveValue("2025");
  });
});
