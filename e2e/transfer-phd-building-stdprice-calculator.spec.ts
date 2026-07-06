/**
 * E2E: PHD 3시점 건물기준시가 "일괄 계산" 버튼 (양도 §164⑤) — 2026-07-06 재작성
 *
 * 계획서: docs/02-design/features/phd-building-stdprice-3point-batch-calculator.plan.md
 * (구 필드별 버튼(PR#519) → 3시점 일괄 버튼 1개로 전환. 버그 1·2·3 수정.)
 *
 * 검증:
 *   T1. 단일 주택 PHD 위젯에 "3시점 건물기준시가 일괄 계산" 버튼 1개 노출 +
 *       구 필드별 "건물 기준시가 계산" 버튼 미노출(게이팅).
 *   T2. 양도일만 설정 → 모달에서 건물정보 1회 + 양도 공시지가 입력 → 계산 →
 *       "모두 적용" 시 산출된 양도시 건물기준시가만 필드에 채워짐(취득/최초공시는 연도 미상 → 미변경).
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 비-worktree 실행: E2E_PORT=3000 npx playwright test e2e/transfer-phd-building-stdprice-calculator.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

async function gotoPhdWidget(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await expandAssetSection(page, 1);
  await page.getByRole("button", { name: "주택", exact: true }).first().click();

  await expandAssetSection(page, 3);
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("button", { name: "환산취득가" }).click();

  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "취득 당시 개별주택가격 미공시" })
    .getByRole("switch")
    .click();
}

function phdSection(page: Page) {
  return page
    .locator("div.rounded-md")
    .filter({ hasText: "주택공시가격 미공시 취득 (3-시점 환산)" })
    .first();
}

test.describe("PHD 3시점 건물기준시가 일괄 계산 (양도)", () => {
  test("T1: 일괄 계산 버튼 1개 노출 + 필드별 버튼 미노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoPhdWidget(page);

    const phd = phdSection(page);
    await expect(phd).toBeVisible();

    await expect(phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" })).toHaveCount(1);
    // 구 필드별 버튼은 게이팅으로 제거됨
    await expect(phd.getByRole("button", { name: "건물 기준시가 계산" })).toHaveCount(0);
  });

  test("T2: 양도일 설정 → 모달 계산 → 모두 적용 → 양도시 필드만 채움", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoPhdWidget(page);

    // 양도일 2025 (양도연도 도출) — 취득일·최초고시일 미설정 → 두 시점 계산 제외
    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2025");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("05");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("01");

    const phd = phdSection(page);
    await phd.getByRole("button", { name: "3시점 건물기준시가 일괄 계산" }).click();

    const modal = page.getByRole("dialog").filter({ hasText: "3시점 건물 기준시가 일괄 계산" });
    await expect(modal).toBeVisible();

    // 건물 정보 1회
    await modal.getByText("구조 선택").first().click();
    await page.getByRole("option", { name: /철근콘크리트조/ }).first().click();
    await modal.getByText("용도 선택").first().click();
    await page.getByRole("option", { name: /아파트/ }).first().click();
    await modal.getByPlaceholder("건물 연면적").fill("100");
    await modal.getByPlaceholder("신축연도 (4자리)").fill("2010");

    // 양도시 공시지가만 입력 (취득/최초공시는 연도 미상) — 시점별 원/㎡ 3칸 중 마지막=양도
    await modal.getByPlaceholder("원/㎡").last().fill("3486000");

    await modal.getByRole("button", { name: "3시점 계산하기" }).click();

    // 양도시 산출값 노출 + "모두 적용 (1개 시점)"
    const applyBtn = modal.getByRole("button", { name: /모두 적용/ });
    await expect(applyBtn).toBeVisible();
    await expect(applyBtn).toContainText("1개");
    await applyBtn.click();
    await expect(modal).toBeHidden();

    // 양도시 건물기준시가 필드 채워짐(값 > 0), 취득시는 빈 값 유지
    const transferBuildingInput = phd
      .getByText("국세청 건물기준시가 (원) — 양도·취득 당시 기준시가", { exact: true })
      .last()
      .locator("xpath=preceding::input[1]");
    await expect(transferBuildingInput).not.toHaveValue("");
    const acqBuildingInput = phd
      .getByText("국세청 건물기준시가 (원) — 양도·취득 당시 기준시가", { exact: true })
      .first()
      .locator("xpath=preceding::input[1]");
    await expect(acqBuildingInput).toHaveValue("");
  });
});
