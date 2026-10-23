/**
 * E2E: 부담부증여 양도소득세 — §155① 종전·신규 주택 취득 선후 (계획서 `docs/00-pm/temp-two-house-acquisition-order.plan.md` D-1·Q-2 (a))
 *
 * 증여 주택(종전 주택)보다 먼저 취득한 주택을 「신규 주택」으로 넣고 §154① 단서 3호(부득이 — 1년 요건 면제)를 고르면,
 * 입력은 막지 않고(Q-2 (a)) 양도세 엔진이 일시적 2주택을 적용하지 않으며 결과 화면에 그 이유가 보인다.
 * 세액·요건 표 단언은 anchor가 고정한다(`__tests__/calc/temp-two-house-acquisition-order.anchor.test.ts` AO-3).
 * 양도세 API는 모킹하지 않는다 — 결과 화면의 경고가 엔진에서 왔는지가 이 spec의 과녁이다.
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify, fillDateAndVerify } from "./_helpers/tax-flow";
import { addApartmentWithDebt, enableBurdenedTransferToggle, fillApartmentTransferInfo } from "./_helpers/gift-burdened-transfer";

type Page = Parameters<typeof fillDateAndVerify>[0];

const ORDER_TEXT = /먼저 취득했습니다 — 양도하는 주택이 나중에 취득한 주택이라 일시적 2주택/;

async function seed(page: Page, newHouse: { y: string; m: string; d: string }) {
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, { year: "2024", month: "5", day: "1" });
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();

  const dialog = await addApartmentWithDebt(page);
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog); // 취득 2010-03-15 · 거주 120개월 — 아래에서 이 시료로 바꾼다

  // 증여 주택 취득일 2021-09-01 · 거주 30개월(§154① 단서 3호는 거주 1년 이상)
  const acqYear = dialog.getByRole("textbox", { name: "연도" }).last();
  await acqYear.fill("2021");
  await dialog.getByRole("textbox", { name: "월" }).last().fill("9");
  await dialog.getByRole("textbox", { name: "일" }).last().fill("1");
  await expect(acqYear).toHaveValue("2021");
  await fillAndVerify(dialog.locator("[data-testid='bg-transfer-residence'] input"), "30");

  const count = dialog.getByTestId("bg-transfer-house-count");
  await count.fill("2");
  await expect(count).toHaveValue("2");
  await expect(dialog.getByTestId("bg-transfer-prev-acq-date")).toHaveText("2021-09-01");
  const newDate = dialog
    .getByText("신규 주택 취득일", { exact: true })
    .locator("xpath=ancestor::div[.//input[@aria-label='연도']][1]");
  await newDate.getByRole("textbox", { name: "연도" }).fill(newHouse.y);
  await newDate.getByRole("textbox", { name: "월" }).fill(newHouse.m);
  await newDate.getByRole("textbox", { name: "일" }).fill(newHouse.d);
  await expect(newDate.getByRole("textbox", { name: "연도" })).toHaveValue(newHouse.y);

  await dialog.getByTestId("proviso-reason-unavoidable").click();
  return dialog;
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  const transfer = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const res = await transfer;
  expect(res.ok(), `양도세 API ${res.status()}`).toBe(true);
  return {
    request: res.request().postDataJSON() as { temporaryTwoHouse?: Record<string, unknown>; oneHouseExemptionProviso?: { reason: string } },
    result: ((await res.json()) as { data: { result: { isExempt: boolean; warnings?: string[] } } }).data.result,
  };
}

test("[BTO-1] 신규 주택을 먼저 취득 + 3호 — 입력은 통과 · 일시적 2주택 미적용 · 결과 화면에 이유", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, { y: "2021", m: "6", d: "1" });
  const { request, result } = await calculate(page);
  expect(request.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2021-09-01", newAcquisitionDate: "2021-06-01" });
  expect(request.oneHouseExemptionProviso).toMatchObject({ reason: "unavoidable" });
  expect(result.isExempt).toBe(false);
  expect(result.warnings ?? []).toEqual(expect.arrayContaining([expect.stringMatching(ORDER_TEXT)]));
  await expect(page.getByText(ORDER_TEXT).first()).toBeVisible();
});

test("[BTO-2] 짝 — 신규 주택을 나중에(1년 안) 취득 + 3호 — 면제가 그대로 작동해 비과세 · 이유 문장 없음", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, { y: "2021", m: "12", d: "1" });
  const { result } = await calculate(page);
  expect(result.isExempt).toBe(true);
  expect(result.warnings ?? []).not.toEqual(expect.arrayContaining([expect.stringMatching(ORDER_TEXT)]));
});
