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

  /**
   * [SBTT-E2E-2] 양도소득세 토글 ON → **결과 카드가 실제로 렌더된다**
   *
   * 🔴 이 단언이 없어서 결함이 통과했다. SBTT-E2E-1은 이름에 `-transfer-tax`가 붙어 있지만
   * 증여세 서식의 채무액 행만 보고 **양도소득세는 전혀 보지 않는다**. 그 사이에
   *   ① `buildGiftStockBurdenedTransferBody`가 Zod 필수 필드 14개를 빠뜨려 400,
   *   ② 응답 키를 `json.data`로 읽어(주식 라우트는 `{result}`) 항상 throw,
   *   ③ `GiftTaxForm`의 빈 catch가 둘 다 삼킴
   * 이 겹쳐 **기능이 한 번도 동작하지 않았는데** E2E는 초록이었다.
   *
   * ⚠️ §103①2호 그룹 1회 한도(D-E)는 종목 2건이 필요한데 `addListedStockWithDebt`의
   *    셀렉터가 `.first()`라 다종목에서 strict 위반이 난다. 그쪽은 **anchor**가 덮는다
   *    (`__tests__/calc/gift-stock-burdened-aggregate.anchor.test.ts` A-2·A-3 — 실제 builder +
   *    Zod + Route + 엔진을 통과한다). 여기서는 **렌더 여부**를 지킨다.
   */
  test("[SBTT-E2E-2] 양도소득세 토글 ON → 부담부증여 주식 양도소득세 카드 렌더", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/calc/gift-tax");

    await fillDateAndVerify(page, { year: "2025", month: "4", day: "10" });
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^다음/ }).click();

    await addListedStockWithDebt(page, {
      name: "삼성전자",
      shares: "10000",
      avgPrice: "50000",
      debt: "200000000",
    });

    // ── 양도소득세 함께 계산 토글 ON ──
    const txToggle = page.getByRole("switch", { name: /양도소득세 함께 계산/ });
    await expect(txToggle).toBeVisible({ timeout: 5_000 });
    if ((await txToggle.getAttribute("aria-checked")) !== "true") {
      await txToggle.click();
    }

    // 시장 구분 KOSPI (토글 ON 기본값은 unlisted)
    await page.getByRole("radio", { name: /KOSPI/ }).first().click();

    // 증여자 취득일 — DateInput의 data-testid로 스코프.
    // ⚠️ `filter({hasText:/증여자 취득일/})`로 잡으면 FieldCard의 §95 배지까지 들어와
    //    `getByLabel("일")`이 배지 버튼을 문다(e2e/CLAUDE.md §1 안티패턴 — 실측으로 확인).
    const bgtDate = page.locator('[data-testid^="stock-bg-acq-date-"]');
    await fillDateAndVerify(page, { year: "2020", month: "3", day: "2" }, { scope: bgtDate });

    // 취득가액 산정 방식 = 실지 + 당초 취득가
    await page.getByRole("radio", { name: /실지/ }).first().click();
    await page
      .getByRole("textbox", { name: /증여자 당초 취득가 합계/ })
      .fill("250000000");

    await closeStockModal(page);
    await nextSteps(page, 2);
    await calcAndWaitResult(page, { taxType: "gift" });

    // 🔑 카드 자체가 렌더되는가 — 종전에는 절대 뜨지 않았다
    await expect(
      page.getByText("부담부증여 주식 양도소득세 (채무인수분)"),
    ).toBeVisible({ timeout: 20_000 });

    // 기본공제가 적용되고 인용이 §103①2호인가 (§103②는 공제 순서 규정이라 틀린 인용)
    await expect(
      page.getByText("양도소득 기본공제 (§103①2호)"),
    ).toBeVisible({ timeout: 10_000 });
  });
});
