import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: 신탁이익의 증여 (§33) — 증여시기 분리 (worktree E2E_PORT=3106)
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_e2e_worktree_port_isolation]]
 * 엔진 numeric은 unit anchor(trust-benefit*.test.ts)로 검증 — 본 spec은 UI 폼→엔진 배선.
 * 신탁은 공통 증여일 대신 원본권·수익권 증여시기를 분리 입력(§33①·§25①).
 */

async function fillDate(scope: ReturnType<Page["getByTestId"]>, y: string, m: string, d: string) {
  await scope.getByLabel("연도").fill(y);
  await scope.getByLabel("월").fill(m);
  await scope.getByLabel("일", { exact: true }).fill(d);
}

// 유형 선택 → 모달 오픈 → 수익권·원본권 증여시기(동일수익자 = 둘 다) 입력.
async function openTrust(page: Page) {
  await page.getByTestId("deemed-type-trust_benefit").click();
  const dialog = page.getByTestId("deemed-detail-dialog");
  await expect(dialog).toBeVisible();
  await fillDate(dialog.getByTestId("tb-income-gift-date"), "2023", "1", "3");
  await fillDate(dialog.getByTestId("tb-principal-gift-date"), "2026", "1", "3");
}
const closeDetail = (page: Page) => page.getByTestId("deemed-detail-confirm").click();

test.describe("신탁이익의 증여 (gift-deemed §33)", () => {
  test("TB-UI-1: 동일수익자·원본8억·수익률10%·원천15.4%·유기3회 → 997,183,628 + 분리 2건", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await openTrust(page);

    await page.getByPlaceholder("신탁재산 가액 (원)").fill("800000000");
    await page.getByPlaceholder("신탁 수익률 (%)").fill("10");
    await page.getByPlaceholder("원천징수세율 (%)").fill("15.4");
    await page.getByPlaceholder("수익 지급 횟수 (회)").fill("3");

    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    await expect(page.getByTestId("deemed-result-value")).toContainText("997,183,628");
    // 원본권·수익권 분리 2건 표시 (§33①1·2호)
    const sub = page.getByTestId("deemed-subgifts");
    await expect(sub).toContainText("원본권 증여");
    await expect(sub).toContainText("800,000,000");
    await expect(sub).toContainText("수익권 증여");
    await expect(sub).toContainText("197,183,628");
  });

  test("TB-UI-2: 수익률 확정 토글 OFF → 수익률 입력 숨김 (미확정 원본×3%)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await openTrust(page);

    await expect(page.getByPlaceholder("신탁 수익률 (%)")).toBeVisible();
    await page.getByRole("switch", { name: /신탁 수익률 확정/ }).click();
    await expect(page.getByPlaceholder("신탁 수익률 (%)")).toBeHidden();
  });

  test("TT-1: 원본·수익 증여시기 분리 → 결과에 각 증여시기 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await openTrust(page); // 수익 2023-01-03 / 원본 2026-01-03
    await page.getByPlaceholder("신탁재산 가액 (원)").fill("800000000");
    await page.getByPlaceholder("신탁 수익률 (%)").fill("10");
    await page.getByPlaceholder("원천징수세율 (%)").fill("15.4");
    await page.getByPlaceholder("수익 지급 횟수 (회)").fill("3");
    await closeDetail(page);
    await page.getByTestId("deemed-calc-btn").click();
    const sub = page.getByTestId("deemed-subgifts");
    await expect(sub).toContainText("2026-01-03"); // 원본권 증여시기
    await expect(sub).toContainText("2023-01-03"); // 수익권 증여시기
  });

  test("TT-2: 무기정기금 선택 → 분할 횟수 입력 숨김 (§62 2호 20년)", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/calc/gift-deemed");
    await openTrust(page);
    // 기본 유기 → 분할 횟수 노출
    await expect(page.getByPlaceholder("수익 지급 횟수 (회)")).toBeVisible();
    // 무기정기금 → 숨김
    await page.getByTestId("tb-annuity-perpetual").click();
    await expect(page.getByPlaceholder("수익 지급 횟수 (회)")).toBeHidden();
  });
});
