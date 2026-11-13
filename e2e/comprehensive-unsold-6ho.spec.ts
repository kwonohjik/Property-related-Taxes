import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal, expandHouseAdvanced } from "./_helpers/tax-flow";

/**
 * 종부세 합산배제 §3①6호 미분양매입임대 E2E — 폼 → 계산 → 결과.
 * - 6HO-E2E-1: 2009 미분양 계약·2019 단기 등록(2호였다면 2018.3.31. 상한 불성립) → 6호로 성립
 * - 6HO-E2E-2: 2020-07-11 단기 등록 신청 → 가목 단서 1) 불성립 + 사유
 *
 * worktree 실행: E2E_PORT=3103 npx playwright test e2e/comprehensive-unsold-6ho.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function fillDateIn(page: Page, testId: string, y: string, m: string, d: string): Promise<void> {
  const box = page.getByTestId(testId);
  await box.getByLabel("연도").fill(y);
  await box.getByLabel("월").fill(m);
  await box.getByLabel("일").fill(d);
}

async function toStep3(page: Page): Promise<void> {
  await page.goto(PAGE);
  await page.getByRole("radio", { name: "2025" }).check();
  await clickNext(page);
  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill("250000000");
  await page.getByPlaceholder("0.00").first().fill("84");
  await page.getByRole("dialog").locator('select:has(option[value="metro"])').selectOption("non_metro");
  await expandHouseAdvanced(page);
  await page
    .getByRole("dialog")
    .locator('select:has(option[value="unsold_purchase_rental"])')
    .selectOption("unsold_purchase_rental");
  await closeHouseModal(page);
  await clickNext(page);
  // 자동매칭(exclusionType → rentalRegistrationType)
  await expect(page.locator('select:has(option[value="unsold_purchase"])')).toHaveValue("unsold_purchase");
}

/** 등록일(첫 DateInput) → 6호 칸 → 임대개시일 */
async function fill6ho(page: Page, reg: [string, string, string], application?: [string, string, string]): Promise<void> {
  await page.getByLabel("연도").first().fill(reg[0]);
  await page.getByLabel("월").first().fill(reg[1]);
  await page.getByLabel("일").first().fill(reg[2]);
  await fillDateIn(page, "comprehensive-6ho-contract-date", "2009", "3", "2");
  await page.getByTestId("comprehensive-6ho-first-come-yes").check();
  await page.getByTestId("comprehensive-6ho-unsold-units").locator("input").fill("5");
  await page.getByTestId("comprehensive-6ho-docs-yes").check();
  await page.getByTestId("comprehensive-6ho-kind-short_term").check();
  if (application) await fillDateIn(page, "comprehensive-6ho-rental-application-date", ...application);
  const startBox = page.locator('div.space-y-1\\.5:has(> label:has-text("임대개시일"))');
  await startBox.getByLabel("연도").fill("2020");
  await startBox.getByLabel("월").fill("9");
  await startBox.getByLabel("일").fill("1");
  await clickNext(page);
}

async function calc(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return resp.request().postDataJSON() as { properties: { rentalInfo?: Record<string, unknown> }[] };
}

test.describe("종부세 미분양매입임대(§3①6호) 합산배제", () => {
  test("6HO-E2E-1: 2019 단기 등록 미분양 주택 → 6호로 성립", async ({ page }) => {
    test.setTimeout(90_000);
    await toStep3(page);
    await fill6ho(page, ["2019", "5", "1"]);
    const body = await calc(page);
    expect(body.properties[0].rentalInfo).toMatchObject({
      registrationType: "unsold_purchase",
      unsoldContractDate: "2009-03-02",
      isUnsoldFirstComeSupply: true,
      unsoldUnitCount: 5,
      unsoldDocsSubmitted: true,
      rentalRegistrationKind: "short_term",
    });
    await expect(page.getByText(/합산배제/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toHaveCount(0);
  });

  test("6HO-E2E-2: 2020-07-11 단기 등록 신청 → 가목 단서 1) 불성립", async ({ page }) => {
    test.setTimeout(90_000);
    await toStep3(page);
    await fill6ho(page, ["2020", "7", "20"], ["2020", "7", "11"]);
    const body = await calc(page);
    expect(body.properties[0].rentalInfo).toMatchObject({ rentalApplicationDate: "2020-07-11" });
    await expect(page.getByTestId("comprehensive-exclusion-fail-reasons")).toContainText("단기민간임대주택으로 등록 신청", {
      timeout: 30_000,
    });
  });
});
