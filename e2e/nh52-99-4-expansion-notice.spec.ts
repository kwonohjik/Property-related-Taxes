/**
 * 리뷰 NH-52 — §99의4 농어촌주택 선언 폼에 «증축·부수토지 추가 취득분 포함» 안내가 보인다 (브라우저 확인).
 * 안내 문구만 추가했고 계산은 바꾸지 않았다. 단위 anchor: `__tests__/components/new-99-4-input-form-expansion-notice-nh52.anchor.test.tsx`.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";

const EUMSEONG = "4377037000";

async function openDeclaration(page: Page, transferDate: string) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("r", "2012-05-01", { regionCode: EUMSEONG, addressJibun: "충청북도 음성군 감곡면 리 1" })],
    assetOver: {
      regionCode: EUMSEONG,
      acquisitionDate: "2010-01-01",
      fixedAcquisitionPrice: "400000000",
      residencePeriodMonthsAsset: "60",
    },
    formOver: { transferDate, contractTotalPrice: "900000000", residencePeriodMonths: "60" },
  });
  await page.waitForFunction(() => {
    const el = document.querySelector("button");
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("house-row-count-exclusion-new_99_4_rural").click();
  await expect(dialog.getByTestId("new994-adjacent")).toBeVisible();
  return dialog;
}

test.describe("[NH-52] §99의4 증축·추가 취득분 안내", () => {
  test("2025 양도 — 가액·취득일 칸 안내가 보이고, 면적 칸이 없으니 면적 안내도 없다", async ({ page }) => {
    test.setTimeout(120_000);
    const dialog = await openDeclaration(page, "2025-06-02");
    await expect(dialog.getByTestId("new994-expansion-price-hint")).toContainText("늘어난 건물·토지의 기준시가도 이 합계에 포함");
    await expect(dialog.getByTestId("new994-expansion-price-hint")).toContainText("조특령 §99의4⑪");
    await expect(dialog.getByTestId("new994-expansion-date-hint")).toContainText("당초 취득일 기준");
    await expect(dialog.getByTestId("new994-expansion-date-hint")).toContainText("조특령 §99의4⑫·⑬1호");
    await expect(dialog.getByTestId("new994-expansion-area-hint")).toHaveCount(0);
  });

  test("2016 양도(종전 면적 요건 범위) — 면적 칸 안내가 보인다", async ({ page }) => {
    test.setTimeout(120_000);
    const dialog = await openDeclaration(page, "2016-06-01");
    await expect(dialog.getByTestId("new994-size-fields")).toBeVisible();
    await expect(dialog.getByTestId("new994-expansion-area-hint")).toContainText("늘어난 면적도 포함");
  });
});
