/**
 * 양도세 공익수용·협의매수 단일 입력 통합 — Phase 1 E2E
 *
 * 토지 자산 ②양도정보의 "양도원인=공익수용" 선택 시:
 *  - 현금/채권보상 인라인 노출
 *  - §77 감면 자동 활성(composite onChange → asset.reductions)
 * 설계: docs/02-design/features/transfer-public-expropriation-unified.ui.design.md
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-expropriation-unified.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("양도세 공익수용 통합 — Step1 양도원인", () => {
  test("토지 양도원인=공익수용 → 현금/채권보상 노출 + §77 감면 자동 활성", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
    await page.getByTestId("transfer-date").getByLabel("월").fill("05");
    await page.getByTestId("transfer-date").getByLabel("일").fill("01");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();

    // ②양도정보 — 양도원인=공익수용·협의매수
    await page.getByTestId("expr-cause-radio").click();

    // 현금/채권보상 인라인 노출 + 고시일 위젯
    await expect(page.getByTestId("expr-notice-date")).toBeVisible();
    await expect(page.getByText("현금보상액").first()).toBeVisible();
    await expect(page.getByText("채권보상액").first()).toBeVisible();

    // 고시일 입력
    const notice = page.getByTestId("expr-notice-date");
    await notice.getByLabel("연도").fill("2005");
    await notice.getByLabel("월").fill("03");
    await notice.getByLabel("일").fill("10");

    // 감면·공제 단계 이동 → §77 감면 자동 활성(ON)
    await page.getByRole("button", { name: "감면·공제" }).click();
    await expect(
      page.getByRole("switch", { name: /공익사업 수용 감면/ }),
    ).toBeChecked();
  });
});
