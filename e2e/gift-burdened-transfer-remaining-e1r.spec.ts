/**
 * E2E: 부담부증여 양도소득세 — E-1 잔여 입력이 요청 본문에 실린다 (계획서 §9.3 E-1 행)
 *
 * 헬퍼·선택자 정책은 `gift-burdened-transfer.spec.ts`와 같다(`_helpers/gift-burdened-transfer.ts`).
 * 양도세 API는 route intercept로 모킹하고 요청 본문을 본다 — 세액 도달은 route anchor가 고정한다
 * (`__tests__/api/gift-burdened-one-house-remaining-e1r.route.anchor.test.ts`).
 */
import { test, expect } from "@playwright/test";
import { fillAndVerify, fillDateAndVerify } from "./_helpers/tax-flow";
import {
  addApartmentWithDebt,
  enableBurdenedTransferToggle,
  fillApartmentTransferInfo,
  setupTransferApiMock,
} from "./_helpers/gift-burdened-transfer";

async function goToGiftAssets(page: Parameters<typeof fillDateAndVerify>[0], giftDate: { year: string; month: string; day: string }) {
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, giftDate);
  await page.locator("select").first().selectOption({ index: 1 });
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function calculateAndCapture(
  page: Parameters<typeof fillDateAndVerify>[0],
  mock: Awaited<ReturnType<typeof setupTransferApiMock>>,
) {
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

/**
 * [BT-E2E-9] E-1 잔여 D — 상속받은 주택(§104②1호 · §154⑧3호). 판정 메뉴와 같은 위젯
 * (`InheritedSameHouseholdField`)이 부담부증여 주택 입력에 뜨고, 계산기와 같은 키로 본문에 실린다.
 */
test("[BT-E2E-9] 상속받은 주택 · 동일세대 통산 → 요청 본문 acquisitionCause·decedent*", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await setupTransferApiMock(page);
  await goToGiftAssets(page, { year: "2021", month: "6", day: "1" });

  const dialog = await addApartmentWithDebt(page);
  await enableBurdenedTransferToggle(dialog);
  await fillApartmentTransferInfo(dialog); // 취득(= 상속개시) 2010-03-15 · 1세대 1주택 ON · 거주 120개월

  await dialog.getByRole("switch", { name: /상속받은 주택입니다/ }).click();
  await fillDateAndVerify(page, { year: "2000", month: "01", day: "01" }, {
    scope: dialog.getByTestId("one-house-decedent-acq-date"),
  });
  await dialog.getByRole("switch", { name: /피상속인과 동일세대/ }).click();
  await fillDateAndVerify(page, { year: "2005", month: "01", day: "01" }, {
    scope: dialog.getByTestId("one-house-cohabitation-start"),
  });
  await fillAndVerify(dialog.getByRole("textbox", { name: "상속개시 전 동일세대 거주기간" }), "60");

  const body = await calculateAndCapture(page, mock);
  expect(body.acquisitionDate).toBe("2010-03-15");
  expect(body.acquisitionCause).toBe("inheritance");
  expect(body.decedentAcquisitionDate).toBe("2000-01-01");
  expect(body.decedentSameHouseholdBeforeInheritance).toBe(true);
  expect(body.decedentCohabitationHoldingStartDate).toBe("2005-01-01");
  expect(body.decedentCohabitationResidenceMonths).toBe(60);
});
