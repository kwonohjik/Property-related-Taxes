/**
 * E2E: 부담부증여 양도소득세 — E-1 한계(e1z) 입력이 요청 본문에 실린다 (계획서 §9.3 E-1 행)
 *
 * 헬퍼·선택자 정책은 `gift-burdened-transfer.spec.ts`와 같다(`_helpers/gift-burdened-transfer.ts`).
 * 양도세 API는 route intercept로 모킹하고 요청 본문을 본다 — 세액 도달은 route anchor가 고정한다
 * (`__tests__/api/gift-burdened-one-house-limits-e1z.route.anchor.test.ts`).
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify, fillDateAndVerify } from "./_helpers/tax-flow";
import { setupTransferApiMock } from "./_helpers/gift-burdened-transfer";

type Page = Parameters<typeof fillDateAndVerify>[0];

async function goToGiftAssets(page: Page, giftDate: { year: string; month: string; day: string }) {
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, giftDate);
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function calculateAndCapture(page: Page, mock: Awaited<ReturnType<typeof setupTransferApiMock>>) {
  await page.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
  await page.getByRole("button", { name: /^다음/ }).click();
  await page.getByRole("button", { name: /^다음/ }).click();
  const transferResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  await transferResponse;
  expect(mock.bodies.length, "양도세 API 호출").toBeGreaterThan(0);
  return mock.bodies[0];
}

/** 토지 추가 + 채무 + 양도소득세 토글 + 취득일·개별공시지가(취득시·양도시) — BT-E2E-4와 같은 입력 */
async function addLandWithTransfer(page: Page) {
  await page.getByRole("button", { name: /증여재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await expect(page.getByTestId("estate-edit-dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/강남 아파트|본가 토지/).fill("서울 토지");
  const marketToggle = dialog.getByRole("switch", { name: /^시가 \(매매/ });
  if ((await marketToggle.getAttribute("aria-checked")) !== "true") await marketToggle.click();
  await fillAndVerify(dialog.getByRole("textbox", { name: "시가 (매매·수용·경매가액)" }), "500000000");
  const collateralToggle = dialog.getByRole("switch", { name: /담보·임대/ });
  if ((await collateralToggle.getAttribute("aria-checked")) !== "true") await collateralToggle.click();
  await fillAndVerify(dialog.getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" }), "100000000");
  await fillAndVerify(dialog.getByRole("textbox", { name: "저당권 등에 의해 담보된 채권액" }), "100000000");
  const transferToggle = dialog.getByRole("switch", { name: /양도소득세 함께 계산/ });
  if ((await transferToggle.getAttribute("aria-checked")) !== "true") await transferToggle.click();
  await expect(transferToggle).toHaveAttribute("aria-checked", "true");

  // 취득일(= 상속개시일) 2020-06-01 — 상속 위젯은 꺼져 있어 마지막 날짜 칸이 취득일이다
  const yearInput = dialog.getByRole("textbox", { name: "연도" }).last();
  await yearInput.fill("2020");
  await dialog.getByRole("textbox", { name: "월" }).last().fill("6");
  await dialog.getByRole("textbox", { name: "일" }).last().fill("1");
  await expect(yearInput).toHaveValue("2020");

  const acq = dialog.locator("[data-testid='bg-transfer-acq-stdprice']");
  const area = acq.getByPlaceholder("면적 입력");
  await area.fill("100");
  await area.press("Tab");
  const acqUnit = acq.getByRole("textbox").first();
  await acqUnit.fill("200000");
  await acqUnit.press("Tab");
  await expect(acq.getByRole("textbox").last()).toHaveValue(/20,000,000|20000000/);
  const tr = dialog.locator("[data-testid='bg-transfer-transfer-stdprice-land']");
  const trUnit = tr.getByRole("textbox").first();
  await trUnit.fill("250000");
  await trUnit.press("Tab");
  await expect(tr.getByRole("textbox").last()).toHaveValue(/25,000,000|25000000/);
  return dialog;
}

/**
 * [BT-E2E-13] E-1 한계 G1 — 상속받은 토지(「소득세법」 §104②1호). 주택과 같은 위젯의 비주택 모드가 토지 입력에
 * 뜨고(동일세대 통산 칸 없음), 계산기와 같은 키로 본문에 실린다.
 */
test("[BT-E2E-13] 상속받은 토지 → 요청 본문 acquisitionCause·decedentAcquisitionDate (동일세대 키 없음)", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await setupTransferApiMock(page);
  await goToGiftAssets(page, { year: "2021", month: "6", day: "1" });
  const dialog = await addLandWithTransfer(page);

  await expect(dialog.getByRole("switch", { name: /상속받은 주택입니다/ })).toHaveCount(0);
  await dialog.getByRole("switch", { name: /상속받은 자산입니다/ }).click();
  await expect(dialog.getByRole("switch", { name: /피상속인과 동일세대/ })).toHaveCount(0);
  await fillDateAndVerify(page, { year: "2010", month: "01", day: "01" }, {
    scope: dialog.getByTestId("one-house-decedent-acq-date"),
  });

  const body = await calculateAndCapture(page, mock);
  expect(body.propertyType).toBe("land");
  expect(body.acquisitionDate).toBe("2020-06-01");
  expect(body.acquisitionCause).toBe("inheritance");
  expect(body.decedentAcquisitionDate).toBe("2010-01-01");
  expect(body).not.toHaveProperty("decedentSameHouseholdBeforeInheritance");
});
