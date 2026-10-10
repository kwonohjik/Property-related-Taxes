/**
 * E2E: 토지·건물 분리(split) 일반 매매 주택 — 토지 환산 파트의 사이드바 취득가액·필요경비 (2026-10-10)
 *
 * 종전: 계산 후 입력 단계로 돌아와도 취득가액이 「계산 후 표시」에 갇혔고(결과 해소 분기가 원인 혼합에만 열림),
 * 필요경비는 토지 개산공제(§163⑥)가 빠져 「-」였다.
 * 지금: 엔진이 실제로 차감한 파트 합. 토지 양도가액 = 900,000,000 × 3억/4억 = 675,000,000(기준시가 안분),
 * 토지 환산취득가 = 675,000,000 × 1억(500,000 × 200㎡) / 3억 = 225,000,000 → 취득가액 225,000,000 + 건물 300,000,000,
 * 필요경비 = 1억 × 3% = 3,000,000.
 *
 * ⚠️ 수치 정본은 vitest anchor(`split-sidebar-result-resolution.anchor.test.ts`). 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect, type Page } from "@playwright/test";
import { housing, seedWizard, singleSeed } from "./_helpers/split-acq-display";

async function sidebarAmount(page: Page, label: string): Promise<string> {
  const row = page
    .locator('[data-slot="wizard-sidebar"]')
    .locator("div.text-sm", { has: page.getByText(label, { exact: true }) })
    .first();
  await expect(row).toBeVisible();
  return ((await row.textContent()) ?? "").replace(label, "").trim();
}

test("일반 매매 split · 토지 환산: 계산 전 「계산 후 표시」 → 계산 후 엔진 파트 합 · 개산공제", async ({ page }) => {
  test.setTimeout(150_000);
  await seedWizard(page, singleSeed([housing({ landAcqMode: "estimated", buildingAcqMode: "actual", buildingAcquisitionPrice: "300000000" })]));
  await expect(page.locator('[data-slot="wizard-sidebar"]')).toBeVisible();
  expect(await sidebarAmount(page, "취득가액")).toBe("계산 후 표시");

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  expect((await reqP).postDataJSON()).toMatchObject({ landAcqMode: "estimated", buildingAcqMode: "actual", isSeparateAcquisition: true });
  await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 60_000 });
  // 결과 화면에는 사이드바가 없다 — 입력 단계로 돌아와 본다
  await page.getByRole("button", { name: "이전" }).first().click();
  await expect(page.locator('[data-slot="wizard-sidebar"]')).toBeVisible();
  expect(await sidebarAmount(page, "취득가액")).toBe("525,000,000");
  expect(await sidebarAmount(page, "필요경비")).toBe("3,000,000");
});
