/**
 * 양도세 매매사례가액 추계(§176의2③1호) RTMS 자동조회 — E2E (Part C)
 *
 * Plan: docs/01-plan/features/rtms-similar-sales-expansion.plan.md §5
 * 검증: 취득가액 산정 방식에서 "매매사례가액" 모드 선택 → SalesCaseSection 노출
 *       (매매사례가액 입력란 + 실거래가 자동조회 버튼 + 취득시 기준시가 개산공제 base).
 *       자동조회 버튼은 취득 주소·면적 미입력 시 disabled.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-sales-case-rtms.spec.ts
 * ⚠️ stale 서버 주의 — lsof -ti :3101 | xargs kill 후 실행.
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("양도세 매매사례가액 추계(§176의2③1호)", () => {
  test("매매사례가액 모드 — 섹션 노출 + 자동조회 disabled 안내 + 수동 입력", async ({
    page,
  }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    // 점진적 노출 — 취득정보(③) 펼침 (취득가액 산정방식 선택자가 ③ 안)
    await expandAssetSection(page, 3);

    // 취득가액 산정 방식: "매매사례가액" 모드 버튼 클릭
    await card.getByRole("button", { name: /매매사례가액/ }).first().click();

    // SalesCaseSection 노출
    await expect(card.getByText("매매사례가액 (원)")).toBeVisible();
    await expect(
      card.getByText("취득시 기준시가 (원) — 개산공제 base"),
    ).toBeVisible();

    // 자동조회 버튼 — 취득 주소·면적 미입력 시 disabled + 안내
    const autoBtn = card.getByRole("button", {
      name: "실거래가 자동조회 (RTMS)",
    });
    await expect(autoBtn).toBeVisible();
    await expect(autoBtn).toBeDisabled();
    await expect(
      card.getByText(/자동조회를 사용하려면 취득 주소·면적을 먼저 입력/),
    ).toBeVisible();

    // 개산공제 base(취득시 기준시가) 안내 — §176의2③1호 + 개산공제 3% hint 노출
    await expect(
      card.getByText(/필요경비 개산공제\(취득시 기준시가 × 3%\)/),
    ).toBeVisible();
  });
});
