import { test, expect } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 §3①1호 가목 — 건설임대 6억/9억 적용례(대통령령 제31447호 부칙 제2조).
 * 2023 과세연도 · 공공건설 8억 · 사용승인 2020 → 6억 기준 불성립 + 사유. 사용승인 2022 → 성립.
 *
 * worktree 실행: E2E_PORT=3103 npx playwright test e2e/comprehensive-usage-approval-6eok.spec.ts
 */
async function run(page: import("@playwright/test").Page, approval: [string, string, string]) {
  await page.goto("/calc/comprehensive-tax");
  await page.getByRole("radio", { name: "2023" }).check();
  await page.getByRole("button", { name: /^다음/ }).click();
  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill("800000000");
  await page.getByPlaceholder("0.00").first().fill("84");
  await expandHouseAdvanced(page);
  await page
    .getByRole("dialog")
    .locator('select:has(option[value="public_construction_rental"])')
    .selectOption("public_construction_rental");
  await closeHouseModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByLabel("연도").first().fill("2018");
  await page.getByLabel("월").first().fill("1");
  await page.getByLabel("일").first().fill("10");
  const approvalBox = page.getByTestId("comprehensive-usage-approval-date");
  await approvalBox.getByLabel("연도").fill(approval[0]);
  await approvalBox.getByLabel("월").fill(approval[1]);
  await approvalBox.getByLabel("일").fill(approval[2]);
  // §3①1호 「2호 이상」 — 이 스펙은 가격 축만 본다
  await page.getByTestId("comprehensive-qualifying-unit-count").locator("input").fill("2");
  const startBox = page.locator('div.space-y-1\\.5:has(> label:has-text("임대개시일"))');
  await startBox.getByLabel("연도").fill("2018");
  await startBox.getByLabel("월").fill("2");
  await startBox.getByLabel("일").fill("1");
  await page.getByRole("button", { name: /^다음/ }).click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.ok()).toBe(true);
  return r.request().postDataJSON() as { properties: { rentalInfo?: Record<string, unknown> }[] };
}

test("6EOK-E2E-1: 사용승인 2020 → 6억 기준 불성립 + 사유", async ({ page }) => {
  test.setTimeout(90_000);
  const body = await run(page, ["2020", "5", "1"]);
  expect(body.properties[0].rentalInfo).toMatchObject({ usageApprovalDate: "2020-05-01" });
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("공시가격 6억 기준", { timeout: 30_000 });
});

test("6EOK-E2E-2: 사용승인 2022 → 9억 기준 성립", async ({ page }) => {
  test.setTimeout(90_000);
  await run(page, ["2022", "1", "10"]);
  await expect(page.getByText(/합산배제/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toHaveCount(0);
});
