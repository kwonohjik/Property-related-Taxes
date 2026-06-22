/**
 * E2E: 주식 부담부증여 양도소득세 함께 계산 (소득세법 §88·소령 §159)
 *
 * 시나리오:
 *   [SBTT-E2E-1] 상장주식 + 채무 입력 + 양도소득세 토글 ON → gift 결과 채무차감 행 표시
 *
 * 정책:
 *   - worktree E2E_PORT 격리 (E2E_PORT=3104)
 *   - 상장주식 카드는 모달(stock-edit-dialog) + 인라인 입력 혼재
 *   - 채무인수 토글: StockBurdenedDebtSection — 주식 카드 인라인 or 모달 내부
 *   - gift 계산 결과 확인 후 stock-transfer 옵셔널 대기
 */
import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  calcAndWaitResult,
  nextSteps,
  closeStockModal,
} from "./_helpers/tax-flow";

type PageT = Parameters<typeof fillDateAndVerify>[0];

async function addListedStockWithDebt(
  page: PageT,
  opts: { name: string; shares: string; avgPrice: string; debt: string },
): Promise<void> {
  // 주식 추가 버튼 → 상장주식 선택 (stock-edit-dialog 자동 오픈)
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /상장주식/ }).first().click();

  // 모달/인라인 공용 입력 (ls-security-info-shares testId)
  await page.getByTestId("ls-security-info-shares").fill(opts.shares);
  await page.getByTestId("ls-avg-price").fill(opts.avgPrice);
  await page
    .getByPlaceholder(/종목명 검색 또는 자동조회 시 자동 입력/)
    .fill(opts.name);

  // §47① 부담부증여 채무인수 토글 ON
  const debtToggle = page.getByRole("switch", {
    name: /부담부증여 채무인수/,
  });
  await expect(debtToggle).toBeVisible({ timeout: 5_000 });
  if ((await debtToggle.getAttribute("aria-checked")) !== "true") {
    await debtToggle.click();
  }

  // 채무액 입력
  await page
    .getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" })
    .fill(opts.debt);
}

test.describe("주식 부담부증여 양도소득세 함께 계산", () => {
  test("[SBTT-E2E-1] 상장주식 + 채무 입력 → gift 결과 채무차감 행 표시", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/calc/gift-tax");

    // 기본 정보 (증여일 2025-04-10)
    await fillDateAndVerify(page, { year: "2025", month: "4", day: "10" });
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^다음/ }).click();

    // 상장주식 추가 + 채무 입력
    await addListedStockWithDebt(page, {
      name: "삼성전자",
      shares: "10000",
      avgPrice: "50000",
      debt: "200000000",
    });

    // 모달 닫고 단계 이동
    await closeStockModal(page);
    await nextSteps(page, 2);

    // gift API 요청 body 확인 (assumedDebtForGift 도달 검증)
    const reqPromise = page.waitForRequest(
      (req) =>
        req.url().includes("/api/calc/gift") && req.method() === "POST",
      { timeout: 15_000 },
    );

    await calcAndWaitResult(page, { taxType: "gift" });

    const req = await reqPromise;
    const body = req.postDataJSON() as {
      giftItems: Array<{ assumedDebtForGift?: number; category: string }>;
    };
    const stockItem = body.giftItems.find(
      (i) => i.category === "listed_stock" || i.category === "stock",
    );
    // assumedDebtForGift가 body에 도달했는지 확인
    expect(stockItem?.assumedDebtForGift).toBeGreaterThan(0);

    // 결과: ㉒ 채무액 행 (부담부증여 채무인수분) 표시 확인 — 별지10호서식 ㉒
    await expect(
      page.getByRole("cell", { name: "채무액" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    // assumedDebtForGift body 도달 검증 — ㉒행에 200,000,000 표시
    await expect(
      page.getByRole("cell", { name: "200,000,000" }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
