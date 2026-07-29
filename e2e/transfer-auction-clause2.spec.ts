/**
 * §164⑨ 2호 공매·경락 특례 — AuctionBlock 노출 게이트 E2E (계획 P4).
 *
 * 토지 + 환산 + 양도 ≥ 2009.02.04 시 "공매·경락으로 양도" 토글이 노출되고, ON 시 공매·경락가액
 * 필드가 뜬다. 세액(환산취득가 상승)은 anchor가 담당하고, 본 스펙은 UI 노출·N3 배타만 검증한다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-auction-clause2.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function setupLandEstimated(page: import("@playwright/test").Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  const td = page.getByTestId("transfer-date");
  await td.getByLabel("연도").fill("2023");
  await td.getByLabel("월").fill("05");
  await td.getByLabel("일").fill("01");

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: /단순토지/ }).click();

  // ③취득정보 — land는 취득원인 매매가 기본 선택. 환산취득가 버튼만 클릭.
  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: /환산취득가/ }).first().click();
}

test.describe("§164⑨ 2호 공매·경락 — AuctionBlock 게이트", () => {
  test("토지 + 환산 → 공매·경락 토글 노출, ON 시 공매·경락가액 필드", async ({ page }) => {
    test.setTimeout(90_000);
    await setupLandEstimated(page);

    await expandAssetSection(page, 2);
    const toggle = page.getByText("공매·경락으로 양도했나요?", { exact: false });
    await expect(toggle.first()).toBeVisible();

    // 토글 ON → 공매·경락가액 필드 노출
    await page.getByRole("switch", { name: /공매·경락으로 양도/ }).click();
    await expect(page.getByText("공매·경락가액").first()).toBeVisible();
  });

  test("N3 배타 — 공익수용(1호) 선택 시 공매·경락 토글 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await setupLandEstimated(page);

    await expandAssetSection(page, 2);
    // 양도원인 = 공익수용(1호) 선택
    await page.getByTestId("expr-cause-radio").click();

    await expect(page.getByText("공매·경락으로 양도했나요?", { exact: false })).toHaveCount(0);
  });
});
