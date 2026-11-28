/**
 * 취득세 브라우저 실측 결함 회귀 — F-1·F-2 (계획: docs/00-pm/acquisition-browser-findings-5.plan.md)
 *
 * - F-1: 고급주택이 아닌 상속 주택도 「다음」만으로 ⑤ 법인·특수에 도달해 세율특례 §15①2호가목
 *   (상속 1가구1주택 0.8%)을 켤 수 있다. 종전엔 ⑤를 건너뛰어 사이드바로만 들어갈 수 있었다.
 * - F-2: 6~9억 주택 선형보간 세율 근거 「지방세법 §11①8호 나목」이 결과 화면에 보인다.
 *
 * 실행: E2E_PORT=3100 npx playwright test e2e/acquisition-browser-findings.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { fillAndVerify } from "./_helpers/tax-flow";

function toggleSwitch(page: Page, title: string) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByRole("switch", { name: new RegExp(`^${escaped}`) });
}

async function turnOn(page: Page, title: string) {
  const sw = toggleSwitch(page, title);
  await expect(sw).toBeVisible();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
}

async function open(page: Page) {
  await page.goto("/calc/acquisition-tax");
  await page.waitForFunction(() => {
    const el = document.querySelector('input[placeholder="계약서상 거래금액"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

const next = (page: Page) => page.getByRole("button", { name: /다음/ }).click();

async function fillFirstDate(page: Page, y: string, m: string, d: string) {
  await page.getByPlaceholder("YYYY").first().fill(y);
  await page.getByPlaceholder("MM").first().fill(m);
  await page.getByPlaceholder("DD").first().fill(d);
  await expect(page.getByPlaceholder("YYYY").first()).toHaveValue(y);
}

async function selectHouseCountOne(page: Page) {
  await expect(page.getByText("취득 후 보유 주택 수")).toBeVisible();
  await page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "1주택 (기본세율)" }) })
    .selectOption("1");
}

async function calc(page: Page) {
  const respP = page.waitForResponse(
    (r) => r.url().includes("/api/calc/acquisition") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /취득세 계산/ }).click();
  const resp = await respP;
  expect(resp.status()).toBe(200);
  const json = (await resp.json()) as Record<string, unknown>;
  await expect(page.getByText(/납부세액 합계|최종 납부세액/).first()).toBeVisible();
  return (json.data ?? json) as Record<string, unknown>;
}

test("[F-1] 비고급 상속 주택 20억 — 「다음」으로 ⑤ 도달 · 상속 1가구1주택 0.8% = 16,000,000", async ({ page }) => {
  await open(page);
  await page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "농지 상속" }) })
    .selectOption("inheritance");
  await fillFirstDate(page, "2026", "06", "01");
  await next(page);
  await fillAndVerify(page.getByPlaceholder("금액 입력").first(), "2000000000");
  await next(page);
  await selectHouseCountOne(page);
  await next(page);
  await next(page); // ④ → ⑤ (종전엔 ⑥으로 건너뜀)

  await turnOn(page, "세율특례 §15 해당");
  await turnOn(page, "1가구 1주택 충족");
  await next(page);

  const data = await calc(page);
  expect(data.appliedRate).toBe(0.008);
  expect(data.acquisitionTax).toBe(16_000_000);
});

test("[F-2] 개인 1주택 7.5억 — 결과 화면에 「지방세법 §11①8호 나목」", async ({ page }) => {
  await open(page);
  await fillAndVerify(page.getByPlaceholder("계약서상 거래금액"), "750000000");
  await fillFirstDate(page, "2026", "11", "01");
  await next(page);
  await next(page);
  await selectHouseCountOne(page);
  await next(page);
  await next(page); // ④ → ⑤
  await next(page); // ⑤ → ⑥

  const data = await calc(page);
  expect(data.rateType).toBe("linear_interpolation");
  expect(data.legalBasis as string[]).toContain("지방세법 §11①8호 나목");
  await expect(page.getByText(/§11①8호 나목/).first()).toBeVisible();
});
