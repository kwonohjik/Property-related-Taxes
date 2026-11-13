import { test, expect } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 §3①4호(미임대 민간건설임대 · 소유) — 첫 드롭다운 → 임대등록 유형 동기화 → 4호 칸(⑤) → ④ 전송 → 엔진.
 * 2025 과세연도 · 8억 · 120㎡ · 2022 등록 · 사용승인 2024-03-01 · 임대개시일 없음.
 * 임대한 적 없음 → 성립 · 있음 → 불성립 + 사유.
 *
 * worktree 실행: E2E_PORT=3103 npx playwright test e2e/comprehensive-rental-459ho.spec.ts
 */
async function run(page: import("@playwright/test").Page, neverRented: "yes" | "no") {
  await page.goto("/calc/comprehensive-tax");
  await page.getByRole("radio", { name: "2025" }).check();
  await page.getByRole("button", { name: /^다음/ }).click();
  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill("800000000");
  await page.getByPlaceholder("0.00").first().fill("120");
  await expandHouseAdvanced(page);
  await page
    .getByRole("dialog")
    .locator('select:has(option[value="vacant_construction_rental"])')
    .selectOption("vacant_construction_rental");
  await closeHouseModal(page);
  await page.getByRole("button", { name: /^다음/ }).click();
  await expect(page.locator('select:has(option[value="vacant_construction"])')).toHaveValue("vacant_construction");
  await page.getByLabel("연도").first().fill("2022");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("1");
  const approval = page.getByTestId("comprehensive-4ho-usage-approval-date");
  await approval.getByLabel("연도").fill("2024");
  await approval.getByLabel("월").fill("3");
  await approval.getByLabel("일").fill("1");
  await page.getByTestId(`comprehensive-4ho-never-rented-${neverRented}`).check();
  // 4호는 「소유」 — 임대개시일·임대료 칸을 묻지 않는다
  await expect(page.getByText("임대개시일").first()).toBeVisible();
  await expect(page.getByText("현재 임대료 (월)")).toHaveCount(0);
  await page.getByRole("button", { name: /^다음/ }).click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.ok()).toBe(true);
  return r.request().postDataJSON() as { properties: { rentalInfo?: Record<string, unknown> }[] };
}

test("459HO-E2E-1: 4호 미임대 → 성립(임대개시일 없이)", async ({ page }) => {
  test.setTimeout(90_000);
  const body = await run(page, "yes");
  expect(body.properties[0].rentalInfo).toMatchObject({
    registrationType: "vacant_construction",
    usageApprovalDate: "2024-03-01",
    neverRentedSinceApproval: true,
  });
  expect(body.properties[0].rentalInfo?.rentalStartDate).toBeUndefined();
  await expect(page.getByText(/합산배제/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toHaveCount(0);
});

test("459HO-E2E-2: 4호 임대한 적 있음 → 불성립 + 사유", async ({ page }) => {
  test.setTimeout(90_000);
  await run(page, "no");
  await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("임대된 사실이 있음", {
    timeout: 30_000,
  });
});
