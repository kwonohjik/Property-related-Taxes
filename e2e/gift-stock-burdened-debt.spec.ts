/**
 * E2E: 주식 부담부증여 §47① 채무 인수 — 입력 도달 + 차감 결과 + 상속 미노출 + 특례 차감
 *
 * 시나리오:
 *   [SBD-E2E-1] 상장주식(일반) + 채무 입력 → request body assumedDebtForGift 도달 + 결과 채무 차감 행
 *   [SBD-E2E-2] 상속 모드 주식 카드 — §47① 채무 섹션 미노출 (mode gift 게이트)
 *   [SBD-E2E-3] 가업승계 특례 + 비상장 50억 − 채무 5억 → 특례 net 차감 finalTax 350,000,000 (A-1)
 *
 * 정책: 주식 카드는 인라인(모달 아님). worktree E2E_PORT 격리 — 3100 타 worktree 점유 주의.
 *   셀렉터 기지: ls-avg-price·ls-security-info-shares testid.
 */
import { test, expect } from "@playwright/test";
import {
  fillDateAndVerify,
  calcAndWaitResult,
  nextSteps,
  addHeir,
  closeStockModal,
} from "./_helpers/tax-flow";

type PageT = Parameters<typeof fillDateAndVerify>[0];

async function addListedStock(
  page: PageT,
  opts: { name: string; shares: string; avgPrice: string },
): Promise<void> {
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();
  await page.getByRole("button", { name: /상장주식/ }).first().click();
  await page
    .getByPlaceholder(/종목명 검색 또는 자동조회 시 자동 입력/)
    .fill(opts.name);
  await page.getByTestId("ls-security-info-shares").fill(opts.shares);
  await page.getByTestId("ls-avg-price").fill(opts.avgPrice);
}

test.describe("주식 부담부증여 §47① 채무인수", () => {
  test("[SBD-E2E-1] 상장주식 + 채무 입력 → body 도달 + 결과 채무 차감 행", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/gift-tax");

    await fillDateAndVerify(page, { year: "2025", month: "3", day: "15" });
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^다음/ }).click();

    // 상장주식 5억 (종가 50,000 × 10,000주)
    await addListedStock(page, {
      name: "삼성전자",
      shares: "10000",
      avgPrice: "50000",
    });

    // §47① 부담부증여 채무인수 토글 펼침 (StockBurdenedDebtSection title)
    const debtToggle = page.getByRole("switch", {
      name: /부담부증여 채무인수/,
    });
    if ((await debtToggle.getAttribute("aria-checked")) !== "true") {
      await debtToggle.click();
    }

    // 채무액 입력 (FieldCard label + CurrencyInput hideLabel → role textbox)
    await page
      .getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" })
      .fill("200000000");

    // request body 도달 검증 (④⑬⑭): 주식은 stockItems → buildGiftTaxInput에서 giftItems 합류
    const reqPromise = page.waitForRequest(
      (req) => req.url().includes("/api/calc/gift") && req.method() === "POST",
    );
    await closeStockModal(page); // 모달 열린 채 "다음"은 backdrop에 막힘 (테이블+모달 전환)
    await nextSteps(page, 2); // Step1 → 2 → 3
    await calcAndWaitResult(page, { taxType: "gift" });
    const req = await reqPromise;
    const body = req.postDataJSON() as {
      giftItems: Array<{ assumedDebtForGift?: number; category: string }>;
    };
    const stockItem = body.giftItems.find((i) => i.category === "listed_stock");
    expect(stockItem?.assumedDebtForGift).toBe(200_000_000);

    // 결과: 부담부증여 채무인수 차감 (§47①) 행 표시
    await expect(
      page.getByText("부담부증여 채무인수 차감 (§47①)").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("[SBD-E2E-2] 상속 모드 주식 카드 — §47① 채무 섹션 미노출", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/inheritance-tax");

    // 상속 마법사: 상속개시일 + 상속인 → 다음 → 재산 단계에서 주식 추가
    await page.getByLabel("연도").first().fill("2026");
    await page.getByLabel("월").first().fill("5");
    await page.getByLabel("일").first().fill("15");
    await addHeir(page, "heir", "child");
    await page.getByRole("button", { name: /^다음/ }).click();
    await page.getByRole("button", { name: /주식·지분 추가/ }).click();
    await page.getByRole("button", { name: /상장주식/ }).first().click();

    // §47① 채무인수 토글이 상속 모드에서는 렌더되지 않아야 함 (mode gift 게이트)
    await expect(
      page.getByRole("switch", { name: /부담부증여 채무인수/ }),
    ).toHaveCount(0);
  });

  test("[SBD-E2E-3] 가업승계 특례 + 상장 50억 − 채무 5억 → 특례 net 차감 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/calc/gift-tax");

    await fillDateAndVerify(page, { year: "2025", month: "3", day: "15" });
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^다음/ }).click();

    // 상장주식 50억 (종가 500,000 × 10,000주) — 평가액 = 종가평균 × 주식수 정확
    await addListedStock(page, {
      name: "가업주식회사",
      shares: "10000",
      avgPrice: "500000",
    });

    // §47① 채무인수 토글 + 채무 5억
    const debtToggle = page.getByRole("switch", {
      name: /부담부증여 채무인수/,
    });
    if ((await debtToggle.getAttribute("aria-checked")) !== "true") {
      await debtToggle.click();
    }
    await page
      .getByRole("textbox", { name: "수증자 인수 채무액 (§47①)" })
      .fill("500000000");

    // Step3: 가업승계 특례 선택 + 영위기간 15
    await closeStockModal(page); // 모달 닫고 단계 이동 (테이블+모달 전환)
    await nextSteps(page, 2);
    await page.getByText("조특법 과세특례 (§30의5·6)").click();
    await page.getByText("가업승계 증여세 과세특례 (§30의6)").click();
    await page.getByPlaceholder("영위 기간 입력").fill("15");

    await calcAndWaitResult(page, { taxType: "gift" });

    // 특례 자산 채무인수 차감 행 표시 (net 45억 → 35억 과표 → 350,000,000)
    await expect(
      page.getByText("특례 자산 채무인수 차감 (§47①)").first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("350,000,000").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
