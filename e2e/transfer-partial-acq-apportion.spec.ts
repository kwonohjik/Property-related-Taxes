/**
 * B4-2b — 일부양도 취득가액 안분 계산기 브라우저 확인
 *
 * 계획: docs/01-plan/features/transfer-partial-area-apportionment.plan.md §4
 *
 * 실거래가 모드 + `areaScenario === "partial"`에서만 노출되고, 「적용」이
 * 「취득가액」 칸에 계산 결과를 기록하는지 확인한다.
 * 자동 반영은 금지이므로 버튼을 눌러야 값이 들어간다.
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function seedPartialLandAsset(page: import("@playwright/test").Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "단순토지(나대지,농지,임야)", exact: true }).click();

  // 일부 양도 시나리오 선택
  await page.getByTestId("area-scenario-select").click();
  await page.getByRole("option", { name: /일부 양도/ }).click();
}

test.describe("B4-2b — 일부양도 취득가액 안분 계산기", () => {
  test("실거래가 모드 partial → 계산기 노출 · 「적용」이 취득가액에 기록", async ({ page }) => {
    await seedPartialLandAsset(page);

    // 취득 300㎡ · 양도 100㎡
    await page.getByPlaceholder("전체 취득한 면적").fill("300");
    await page.getByPlaceholder("이번에 파는 면적").fill("100");

    // ③ 취득정보 펼치기 — 자산 카드 섹션은 진입 시 전부 접힘이다
    await expandAssetSection(page, 3);

    // 안분 계산기가 노출된다
    const calc = page.getByText("일부 양도 — 취득가액 안분");
    await expect(calc).toBeVisible();

    // 「불분명」 → 취득 당시 기준시가 기준
    await page.getByText("불분명", { exact: true }).click();
    await page.getByText("취득 당시 기준시가", { exact: true }).click();

    await page.getByTestId("partial-total-acq-price").fill("300000000");
    await page.getByTestId("partial-sold-value").fill("50000000");
    await page.getByTestId("partial-remain-value").fill("100000000");

    // 계산 결과 = 3억 × 5천만 / 1.5억 = 1억
    await expect(page.getByTestId("partial-acq-result")).toContainText("100,000,000");

    // 자동 반영 금지 — 버튼을 눌러야 기록된다
    await page.getByTestId("partial-acq-apply").click();
    await expect(page.getByTestId("fixed-acquisition-price")).toHaveValue("100,000,000");
  });

  test("양도 당시 가액 기준 안분 옵션은 제공되지 않는다 (조심 2018부0572)", async ({ page }) => {
    await seedPartialLandAsset(page);
    await page.getByPlaceholder("전체 취득한 면적").fill("300");
    await page.getByPlaceholder("이번에 파는 면적").fill("100");
    await expandAssetSection(page, 3);

    await page.getByText("불분명", { exact: true }).click();
    await expect(page.getByText(/양도 당시 감정가액/)).toHaveCount(0);
    await expect(page.getByText(/양도 당시 가액.*인정되지 않는다/)).toBeVisible();
  });
});
