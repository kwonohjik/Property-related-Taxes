/**
 * transfer-single-loss-gain.spec.ts
 *
 * 제보 재현 — **취득가액 > 양도가액(양도차손)일 때 신고서가 취득가액을 거짓 표시**했다.
 *
 * 입력: 양도가액 100,000,000 / 취득가액 120,000,000 / 경비 0
 *   - 양도일 2026-06-03 · 취득일 2020-04-01 (제보 화면과 동일)
 *
 * 종전(결함): 신고서 「취득가액」 = **100,000,000** (= 양도가액), 「전체 양도차익」 = 0.
 *   엔진이 양도차익을 `Math.max(0, …)`로 지웠고, 신고서가 취득가액을
 *   「양도가액 − 양도차익 − 필요경비」로 **역산**했기 때문이다.
 *
 * 기대: 취득가액 **120,000,000** · 전체 양도차익 **−20,000,000** · 총 납부세액 0.
 *
 * 🔑 **vitest anchor로는 부족하다** — 역산은 `buildRows` 표시층에서 일어나고,
 *    사용자가 본 것은 렌더된 표다. 실제 폼→계산→표 경로를 통째로 태운다
 *    (memory `feedback_browser_verify_with_playwright`).
 *
 * 계획서: `docs/00-pm/transfer-single-loss-gain-preservation.plan.md`
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** CurrencyInput(htmlFor 연결 없음) → label 부모 div 탐색 후 input 반환 */
function getInputByLabel(page: Page, labelText: string) {
  return page.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input");
}

/** 결과 테이블 Row에서 값 셀 텍스트 */
async function getRowValue(page: Page, labelText: string): Promise<string> {
  const row = page.locator(`tr:has(td:has-text("${labelText}"))`).first();
  return (await row.locator("td").nth(1).textContent())?.trim() ?? "";
}

test.describe("단건 양도차손 — 신고서 취득가액·양도차익", () => {
  test("취득가 120,000,000 > 양도가 100,000,000 → 차손이 보존된다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026-06-03
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("06");
    await page.getByTestId("transfer-date").getByLabel("일").fill("03");

    // 신고일 2026-08-31
    await page.getByTestId("filing-date").getByLabel("연도").fill("2026");
    await page.getByTestId("filing-date").getByLabel("월").fill("08");
    await page.getByTestId("filing-date").getByLabel("일").fill("31");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 자산: 단순토지 (성격 판정 분기를 최소화해 차손 축만 남긴다)
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("100");

    // 양도가액 100,000,000
    await getInputByLabel(page, "양도가액 (원)").fill("100000000");

    // 취득원인 매매 · 실거래가 · 취득일 2020-04-01 · 취득가액 120,000,000
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await page.getByLabel("연도", { exact: true }).nth(2).fill("2020");
    await page.getByLabel("월", { exact: true }).nth(2).fill("04");
    await page.getByLabel("일", { exact: true }).nth(2).fill("01");
    await getInputByLabel(page, "취득가액 (원)").first().fill("120000000");

    // 단계 이동 후 계산
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "가산세" }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();

    await page.locator('p:has-text("총 납부세액")').last().waitFor({ timeout: 15000 });

    // ─── 🔴 제보의 핵심: 취득가액이 입력값 그대로여야 한다 ───────────
    const acquisition = await getRowValue(page, "취득가액");
    expect(acquisition, "취득가액이 양도가액으로 역산되면 안 된다").toContain("120,000,000");

    // ─── 양도차익은 차손 그대로 ────────────────────────────────────
    const gain = await getRowValue(page, "전체 양도차익");
    expect(gain, "전체 양도차익 = −20,000,000").toContain("20,000,000");
    expect(gain, "음수 표기").toMatch(/-|−|△|\(/);

    // ─── 세액은 0 (0 바닥은 과세표준 단계 담당) ─────────────────────
    const totalTax = (
      await page
        .locator('p:has-text("총 납부세액")')
        .last()
        .locator("xpath=following-sibling::p[1]")
        .textContent()
    )?.trim() ?? "";
    expect(totalTax).toContain("0");

    // ─── §102② 통산 안내 고지 ──────────────────────────────────────
    await expect(
      page.getByText(/양도차손 20,000,000.*통산할 수 있습니다/).first(),
      "차손 발생 시 §102② 합산 통산 안내가 보여야 한다",
    ).toBeVisible();
  });
});
