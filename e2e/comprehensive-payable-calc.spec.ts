import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal } from "./_helpers/tax-flow";

/**
 * 종합부동산세 — "주택분 종합부동산세 납부할세액의 계산" 산출근거 카드 E2E.
 *
 * 사례12(1세대1주택, 공시 15억/14억, 67세, '12.1.1 취득, 2단계 직전연도 자동) →
 * 결과 탭 "신고서 서식" 바로 아래 카드 기본 접힘 → 펼침 → 교재 ①~⑥ 값 검증.
 *
 * worktree: E2E_PORT=3101 npx playwright test e2e/comprehensive-payable-calc.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function fillCase12ToStep2(page: Page): Promise<void> {
  await page.goto(PAGE);
  await page.getByRole("radio", { name: "2022" }).check();
  await page.getByRole("switch").first().click();
  await page.getByLabel("연도").first().fill("1955");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("1");
  await page.getByLabel("연도").nth(1).fill("2012");
  await page.getByLabel("월").nth(1).fill("1");
  await page.getByLabel("일").nth(1).fill("1");
  await clickNext(page); // → Step2
  // 당해 공시 먼저 입력 (cap-mode-auto 전 → 직전공시 미노출). 주택 입력은 모달 안.
  await openHouseModal(page, 0);
  await page.getByPlaceholder("금액 입력").first().fill("1500000000");
  await page.getByPlaceholder("0.00").first().fill("168");
  await closeHouseModal(page);
}

async function calcAndWait(page: Page): Promise<void> {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);
}

test.describe("종합부동산세 납부할 세액 산출 근거 카드(주택분)", () => {
  test("P-1: 사례12 → 카드 기본 접힘 → 펼침 → 교재 ①~⑥ 값", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await fillCase12ToStep2(page);

    // Step2: 직전연도 자동계산 모드 + 직전공시 14억 + 직전 1세대1주택
    // cap-mode-auto·1세대1주택 switch는 공통설정박스(모달 밖). 직전공시는 주택 모달 안.
    await page.getByTestId("cap-mode-auto").click();
    await openHouseModal(page, 0);
    await page.getByLabel("직전연도 공시가격").nth(0).fill("1400000000");
    await closeHouseModal(page);
    // 단일주택 auto switch: [0]당해 조정2주택 [1]직전 1세대1주택 → 직전 1세대1주택 = nth(1)
    await page.getByRole("switch").nth(1).click();
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await calcAndWait(page);

    await expect(page.getByText(/302,400/).first()).toBeVisible({ timeout: 30_000 });

    const card = page.getByTestId("housing-payable-calc");
    await card.scrollIntoViewIfNeeded();

    // 기본 접힘 — 단계 칸은 화면에 보이지 않음
    await expect(page.getByTestId("payable-step6")).toBeHidden();

    // 신고서 서식 바로 아래 위치 (DOM 순서)
    const order = await page.evaluate(() => {
      const filing = document.querySelector('[data-print-id="filing-form-main"]');
      const payable = document.querySelector('[data-print-id="housing-payable-calc"]');
      if (!filing || !payable) return -1;
      return filing.compareDocumentPosition(payable) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : 0;
    });
    expect(order, "산출근거 카드가 신고서 서식 뒤에 위치").toBe(1);

    // 펼침
    await card.getByRole("button", { name: /종합부동산세 납부할 세액 산출 근거/ }).click();

    await expect(page.getByTestId("payable-step1")).toContainText("1,440,000원");
    await expect(page.getByTestId("payable-step2")).toContainText("432,000원");
    await expect(page.getByTestId("payable-step2-a")).toContainText("2,070,000원");
    await expect(page.getByTestId("payable-step3")).toContainText("705,600원");
    await expect(page.getByTestId("payable-step4")).toContainText("302,400원");
    await expect(page.getByTestId("payable-step5")).toContainText("0원");
    await expect(page.getByTestId("payable-step5-na")).toContainText("3,243,000원");
    await expect(page.getByTestId("payable-step5-na-2")).toContainText("513,000원");
    await expect(page.getByTestId("payable-step6")).toContainText("302,400원");
    // ②ⓐ 재산세 FMR 45% echo (상시 노출)
    await expect(card).toContainText("× 45%");
    // 트랙 B 세부담상한 산식 echo 펼침 → 직전 재산세 2,730,000 × 130% = 3,549,000 (직전공시 2단계 통합 후에도 동일)
    await card.getByText(/주택 세부담상한 산식/).first().click();
    await expect(card).toContainText("3,549,000원");
    // ⑥ 농특세 미표기
    await expect(card).not.toContainText("농어촌특별세");

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join("\n")}`).toEqual([]);
  });
});
