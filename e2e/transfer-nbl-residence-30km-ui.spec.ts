/**
 * NBL 재촌 판정 UI — 직선거리 30km 힌트 + 거주지 주소검색 위젯 (실브라우저 렌더 검증)
 *
 * 30km 판정 계산 자체는 엔진 anchor(__tests__/lib/calc/nbl-residence-30km-judgment.test.ts)로 검증.
 * 본 E2E는 네트워크 비의존으로 신규 UI 배선을 확인한다:
 *  - 지목 농지 → 재촌 판정 섹션 렌더
 *  - 토지 소재지 힌트에 "직선거리 30km" 포함 (§153③3호 신규)
 *  - 거주지 추가 → 주소검색 위젯(nbl-residence-address-search) 렌더 (작업 2)
 *
 * 실행(비-worktree 기본 3000): npx playwright test e2e/transfer-nbl-residence-30km-ui.spec.ts
 * 계획: docs/00-pm/transfer-nbl-residence-judgment-ui.plan.md
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input").first();
}

test.describe("NBL 재촌 판정 — 30km 힌트 + 거주지 주소검색", () => {
  test("지목 농지 → 30km 힌트 + 거주지 주소검색 위젯 렌더", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("01");
    await page.getByTestId("transfer-date").getByLabel("일").fill("12");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 자산: 단순토지 → 독립 나대지 → 면적 → 양도가액 → 매매
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("1000");
    await inputByLabel(page, "양도가액 (원)").fill("1000000000");
    await page.getByRole("button", { name: "매매", exact: true }).click();

    // 보유 상황 → 비사업용 스위치 → 판정 도움 필요
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("switch", { name: /비사업용 토지/ }).click();
    await page.getByText("판정 도움 필요", { exact: true }).click();

    // 지목 = 농지 (첫 combobox)
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /농지 \(전·답·과수원\)/ }).click();

    // 재촌 판정 섹션 렌더
    await expect(page.getByText("소유자 거주 이력")).toBeVisible();

    // 토지 소재지 힌트에 "직선거리 30km"(신규) 포함
    await expect(page.getByText(/직선거리 30km/).first()).toBeVisible();

    // 거주지 추가 → 주소검색 위젯 렌더 (작업 2)
    await page.getByRole("button", { name: /거주지 추가/ }).click();
    await expect(page.getByTestId("nbl-residence-address-search")).toBeVisible();
    await expect(page.getByText("거주지 주소 검색")).toBeVisible();

    console.log("✅ NBL 재촌 30km 힌트 + 거주지 주소검색 위젯 렌더 확인");
  });
});
