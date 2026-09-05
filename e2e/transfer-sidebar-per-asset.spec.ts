/**
 * 양도세 사이드바 — 자산별 요약 카드 + 안분 양도가액 표시 (버그 수정 + 개선)
 *
 * 세액·안분 산식 정확성은 vitest 앵커(__tests__/lib/transfer-per-asset-summary.test.ts A-1~A-9)가
 * 검증하므로, 본 E2E는 폼↔computeTransferPerAssetSummary 배선(useMemo)이 브라우저에서 동작하고
 * 사이드바가 자산별(자산 1·2)로 렌더되는지 + 안분(§166⑥) 모드에서 양도가액이 기준시가 비율로
 * 즉시 표시되는지(과거: 멀티 자산 시 양도가액 라인 자체가 사라지던 버그)를 확인한다.
 *
 * 시나리오: 함께 양도(companion) 2자산 · 안분 모드(기본) · 총 양도가액 225,000,000
 *   자산1 양도시 기준시가 90,000,000 / 자산2 60,000,000 (합 150,000,000)
 *   → 자산1 = 225,000,000 × 90/150 = 135,000,000, 자산2 = 잔여 90,000,000
 *
 * 비-worktree 실행: npx playwright test e2e/transfer-sidebar-per-asset.spec.ts
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-sidebar-per-asset.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 자산 카드의 취득정보를 매매→환산취득가로 전환하고 양도시 기준시가를 입력. */
async function fillTransferStdPrice(page: Page, assetIndex: number, value: string) {
  const card = page.locator(`[data-asset-card-index="${assetIndex}"]`);
  await expandAssetSection(page, 3, assetIndex);
  await card.getByRole("button", { name: "매매", exact: true }).click();
  await card.getByRole("radio", { name: "환산취득가" }).click();
  // 양도시 기준시가 — <label>양도시 기준시가 (원)</label> 를 감싼 블록 내 첫 입력(주택=공시가격 총액)
  const block = card.locator('div:has(> label:has-text("양도시 기준시가"))').last();
  await block.getByRole("textbox").first().fill(value);
}

test.describe("양도세 사이드바 — 자산별 요약 + 안분 양도가액", () => {
  test("companion 2자산·안분 → 사이드바 자산별 양도가액 기준시가 안분 표시", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일
    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("02");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("15");

    // 함께 양도 토글 → 자산 2건 자동 생성
    await page.getByRole("switch", { name: /함께 파셨나요/ }).click();
    await expect(page.locator('[data-asset-card-index]')).toHaveCount(2);
    // 안분(기준시가 비율) 모드가 기본 노출 — §166⑥ 토글은 RadioCardGroup(role=radio)
    await expect(page.getByRole("radio", { name: /안분/ })).toBeChecked();

    const aside = page.locator('[data-slot="wizard-sidebar"]');

    // ── 기준시가 입력 전: 안분 모드라 양도가액은 «계산 후 표시»(pending), 라인은 존재 ──
    await expect(aside.getByText("자산 1 — 주택")).toBeVisible();
    await expect(aside.getByText("자산 2 — 주택")).toBeVisible();
    await expect(aside.getByText("계산 후 표시").first()).toBeVisible();

    // 양도시 기준시가 입력 (환산 모드)
    await fillTransferStdPrice(page, 0, "90000000");
    await fillTransferStdPrice(page, 1, "60000000");

    // 총 양도가액 225,000,000
    const totalInput = page
      .getByText("총 양도가액")
      .first()
      .locator("xpath=ancestor::*[3]")
      .getByRole("textbox")
      .first();
    await totalInput.fill("225000000");

    // ── 검증: 자산별 안분 양도가액 즉시 표시 (버그 해결) ──
    const asset1 = aside.locator('div', { hasText: "자산 1 — 주택" }).first();
    const asset2 = aside.locator('div', { hasText: "자산 2 — 주택" }).first();

    // 자산1 = 135,000,000, 자산2 = 90,000,000, 둘 다 «기준시가 안분» 라벨
    await expect(aside.getByText("135,000,000")).toBeVisible();
    await expect(aside.getByText("90,000,000")).toBeVisible();
    await expect(aside.getByText("기준시가 안분")).toHaveCount(2);

    // 합계 양도가액 = 225,000,000
    await expect(aside.getByText("합계 양도가액")).toBeVisible();
    await expect(aside.getByText("225,000,000")).toBeVisible();

    // 자산1 양도가액 라인이 135M을 포함 (자산별 귀속 확인)
    await expect(asset1).toContainText("135,000,000");
    await expect(asset2).toContainText("90,000,000");
  });
});
