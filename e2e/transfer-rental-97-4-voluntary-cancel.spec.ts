/**
 * §97의4 자진말소 · 가목2) 단서(사목 양도기한) · ⑪1호 자동말소일 연동 — 폼 → 계산 → 결과 (2026-11-03)
 *
 * 가목(민간매입) · 등록 2017.1.2. · 양도 2026.6.1.
 * - 아파트 + 자진말소 2024.3.4. → 사목 기한 2025.3.4. 경과 → §97의4 적용 불가(⑪ 2027.12.31. 대신 사목 기한 · 확인 필요)
 * - 아파트 아님 + 자진말소 2024.3.4. → 기한 없음 · 임대기간 말소일까지 7년 → 4%
 * - 아파트 + 자동말소 2027.6.1. · 양도 2028.5.1. · 연장 입력 없음 → ⑪1호 연동으로 기한 2028.6.1. → 적용
 *
 * worktree 실행: E2E_PORT=3975 npx playwright test e2e/transfer-rental-97-4-voluntary-cancel.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { expandReductionCategory } from "./_helpers/expandReductionCategory";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const REDUCTION = {
  ...getReductionDefault("rental_97_4"),
  registrationDate: "2017-01-02",
  rentalStartDate: "2017-01-02",
  isTaxRegistered: true,
  taxRegistrationDate: "2017-01-02",
  rentIncreaseViolationMode: "none",
  hasVacancyOverGrace: false,
  rental974Category: "purchase_a",
  region: "capital",
  officialPriceAtStart: "300000000",
};

async function openForm(page: Page, transferDate: string, filingDate: string) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionDate: "2016-06-01", reductions: [REDUCTION] },
    formOver: { transferDate, filingDate },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);
}

async function fillDate(page: Page, field: string, ymd: string) {
  const [y, m, d] = ymd.split("-");
  const box = page.locator(`[data-field="reduction.rental_97_4.${field}"]`);
  await box.getByLabel("연도").fill(y);
  await box.getByLabel("월").fill(m);
  await box.getByLabel("일").fill(d);
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세" }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const req = resp.request().postDataJSON() as { assets?: { reductions?: Record<string, unknown>[] }[]; reductions?: Record<string, unknown>[] };
  const red = (req.reductions ?? req.assets?.[0]?.reductions ?? []).find((r) => r.type === "rental_97_4")!;
  const body = (await resp.json()) as { data: { result: Record<string, unknown> } };
  return { red, detail: body.data.result.rental97LthdDetail as Record<string, unknown> };
}

test("아파트 + 자진말소 2024.3.4. → 사목 기한 2025.3.4. 경과 → 적용 불가", async ({ page }) => {
  test.setTimeout(90_000);
  await openForm(page, "2026-06-01", "2026-08-31");
  await page.getByRole("switch", { name: /임대사업자 등록 자진말소/ }).click();
  await fillDate(page, "voluntaryCancelledDate974", "2024-03-04");
  await page.getByTestId("r974-apt-yes").click();
  // 사목이면 ⑪ 연장 사유를 묻지 않는다
  await expect(page.getByTestId("apt-deadline-ext-none-r974")).toHaveCount(0);
  const { red, detail } = await calculate(page);
  expect(red.voluntaryCancelledDate974).toBe("2024-03-04");
  expect(red.aptDeadlineExtension974).toBeUndefined();
  expect(detail.isEligible).toBe(false);
  await expect(page.getByText(/말소일부터 1년이 지난 뒤 양도했습니다/).first()).toBeVisible();
});

test("아파트 아님 + 자진말소 2024.3.4. → 임대기간 말소일까지 7년 → 추가율 4%", async ({ page }) => {
  test.setTimeout(90_000);
  await openForm(page, "2026-06-01", "2026-08-31");
  await page.getByRole("switch", { name: /임대사업자 등록 자진말소/ }).click();
  await fillDate(page, "voluntaryCancelledDate974", "2024-03-04");
  await page.getByTestId("r974-apt-no").click();
  const { detail } = await calculate(page);
  expect(detail.isEligible).toBe(true);
  expect(detail.additionalRate).toBe(0.04);
  await expect(page.getByText(/등록이 자진말소된 날까지만 셉니다/).first()).toBeVisible();
});

test("아파트 + 자동말소 2027.6.1. · 연장 입력 없음 → ⑪1호 연동 기한 2028.6.1. → 2028.5.1. 양도 10%", async ({ page }) => {
  test.setTimeout(90_000);
  await openForm(page, "2028-05-01", "2028-07-31");
  await page.getByRole("switch", { name: /임대사업자 등록 자동말소/ }).click();
  await fillDate(page, "autoCancelledDate974", "2027-06-01");
  await page.getByTestId("r974-apt-yes").click();
  const { red, detail } = await calculate(page);
  expect(red.autoCancelledDate974).toBe("2027-06-01");
  expect(detail.isEligible).toBe(true);
  expect(detail.additionalRate).toBe(0.1);
});
