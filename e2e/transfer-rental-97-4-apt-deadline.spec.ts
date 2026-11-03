/**
 * §97의4 가목2) 아파트 양도기한 — 폼 → 계산 → 결과 (리뷰 2026-11-02 R-2)
 *
 * 가목(민간매입) 아파트 · 등록 2017.1.2. · 양도 2028.7.3. (임대 11년 → 추가율 10%).
 * 소령 §167의3①2호 가목2): 아파트 매입임대는 ⑪ 기한(2027.12.31. · 연장 사유가 있으면 그 날)까지 양도해야 가목에 해당.
 * - 「연장 사유 없음」 → 기한 경과 → §97의4 적용 불가
 * - ⑪1호 등록말소일 2027.9.1. → 기한 2028.9.1. → 적용(10%)
 *
 * worktree 실행: E2E_PORT=3974 npx playwright test e2e/transfer-rental-97-4-apt-deadline.spec.ts
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

async function openForm(page: Page) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("h2", "2010-01-01")],
    assetOver: { acquisitionDate: "2016-06-01", reductions: [REDUCTION] },
    formOver: { transferDate: "2028-07-03", filingDate: "2028-09-30" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expandReductionCategory(page, /장기임대주택/);
  await page.getByTestId("r974-apt-yes").click();
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

test("연장 사유 없음 → 기한 경과 → 적용 불가 사유 표시", async ({ page }) => {
  test.setTimeout(90_000);
  await openForm(page);
  await page.getByTestId("apt-deadline-ext-none-r974").click();
  const { red, detail } = await calculate(page);
  expect(red.isApartment974).toBe(true);
  expect(red.aptDeadlineExtension974).toEqual({ confirmedNone: true });
  expect(detail.isEligible).toBe(false);
  await expect(page.getByText(/기한이 지난 뒤 양도했습니다/).first()).toBeVisible();
});

test("⑪1호 등록말소일 2027-09-01 → 기한 2028.9.1. → 추가율 10%", async ({ page }) => {
  test.setTimeout(90_000);
  await openForm(page);
  await page.getByTestId("apt-deadline-ext-has-r974").click();
  const d1 = page.getByTestId("apt-deadline-ext-d1-r974");
  await d1.getByLabel("연도").fill("2027");
  await d1.getByLabel("월").fill("09");
  await d1.getByLabel("일").fill("01");
  const { red, detail } = await calculate(page);
  expect(red.aptDeadlineExtension974).toEqual({ dutyPeriodEndCancellationDate: "2027-09-01" });
  expect(detail.isEligible).toBe(true);
  expect(detail.additionalRate).toBe(0.1);
});
