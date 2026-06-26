/**
 * E2E: 비상장주식 V2 — 합병 후 3년 미경과 순손익 합산 UI (§56③)
 *
 * 검증:
 *   1. V2 정식평가 모드 진입 → "합병 후 3년 미경과 순손익 보정" 토글 카드 노출
 *   2. 토글 ON → 합병등기일·합병후 발행주식총수·합병법인 3년 입력 폼 노출
 *   3. ㉰ 케이스 입력 후 결과 카드에 "합병 합산 내역" 카드 표시
 *   4. 합병 결과 카드에 merger-breakdown-row-{0,1,2} 노출
 *
 * ㉰ 케이스 (설계 문서 docs/02-design/features/unlisted-net-income-fiscal-year-change.ui.design.md):
 *   합병등기일: 2023-07-01
 *   합병후 발행주식총수: 100000주
 *   합병법인 전1년: 2023-01-01~2023-12-31, 100000주, 순손익 50000000
 *   합병법인 전2년: 2022-01-01~2022-12-31, 80000주, 순손익 40000000
 *   합병법인 전3년: 2021-01-01~2021-12-31, 80000주, 순손익 30000000
 *   피합병법인 없음
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/merger-net-income.spec.ts
 *
 * 계획: docs/02-design/features/unlisted-net-income-fiscal-year-change.ui.design.md
 */

import { test, expect, type Page } from "@playwright/test";
import { addHeir } from "./_helpers/tax-flow";

/**
 * V2 정식평가 카드 모드로 진입 (inheritance-unlisted-fiscal-year-annualize.spec.ts 동일 패턴)
 */
async function gotoV2FormalValuationCard(page: Page) {
  await page.goto("/calc/inheritance-tax");

  // Step0: 상속개시일 입력
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("3");
  await page.getByLabel("일").first().fill("31");

  // 상속인 1명(자녀) 등록
  await addHeir(page, "heir", "child");

  // Step1(상속재산 평가)으로 이동
  await page.getByRole("button", { name: /^다음/ }).click();

  // StockValuationForm: "주식·지분 추가" 버튼 클릭
  await page.getByRole("button", { name: /주식·지분 추가/ }).click();

  // 팝업에서 "비상장주식" 선택
  await page.getByRole("button", { name: /비상장주식/ }).click();

  // RadioCardGroup에서 "정식평가" 선택
  await page.getByText("정식평가", { exact: true }).click();
}

test.describe("비상장주식 V2 — 합병 후 3년 미경과 순손익 합산 (§56③)", () => {
  test("V2 정식평가 모드 진입 시 합병 토글 카드가 노출된다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // FiscalYearAdjustmentTable hint 확인
    await expect(
      page.getByText("합병 후 3년 미경과 법인은", { exact: false })
    ).toBeVisible({ timeout: 5_000 });

    // 합병 토글 wrapper 존재 확인
    const mergerToggle = page.locator('[data-testid="merger-toggle"]');
    await expect(mergerToggle).toBeVisible({ timeout: 5_000 });

    // 토글 텍스트 확인
    await expect(
      mergerToggle.getByText("합병 후 3년 미경과 순손익 보정", { exact: false })
    ).toBeVisible();
  });

  test("합병 토글 ON 시 입력 폼이 노출된다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 토글 카드 활성화 — ToggleCard switch (BaseUI: data-checked, role=switch). ON 검증은 children 노출로.
    const mergerToggle = page.locator('[data-testid="merger-toggle"]');
    await mergerToggle.getByRole("switch").click();

    // 합병등기일 wrapper 노출
    await expect(
      mergerToggle.locator('[data-testid="merger-reg-date"]')
    ).toBeVisible({ timeout: 3_000 });

    // 합병후 발행주식총수 입력
    await expect(
      mergerToggle.locator('[data-testid="merger-post-shares"]')
    ).toBeVisible({ timeout: 3_000 });

    // 합병법인 전1년 acquirer 영역 노출
    await expect(
      mergerToggle.locator('[data-testid="merger-acquirer-0-start"]')
    ).toBeVisible({ timeout: 3_000 });
  });

  test("㉰ 케이스 입력 후 결과 카드에 합병 합산 명세 카드가 노출된다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // DateInput wrapper 안의 연/월/일 입력 헬퍼 (getByLabel — 검증된 패턴)
    async function fillDate(testid: string, y: string, m: string, d: string) {
      const w = page.locator(`[data-testid="${testid}"]`);
      await w.getByLabel("연도").fill(y);
      await w.getByLabel("월").fill(m);
      await w.getByLabel("일").fill(d);
    }

    // ── 법인 기본정보 (결과 카드 렌더 게이트: totalShares·ownedShares > 0 필수) ──
    await page.getByPlaceholder("발행주식총수").fill("15000");
    await page.getByPlaceholder("보유 주식수").fill("7500");

    // ── 합병 토글 활성화 (title 클릭 또는 switch) ──
    const mergerToggle = page.locator('[data-testid="merger-toggle"]');
    await mergerToggle.getByRole("switch").click();
    await expect(mergerToggle.locator('[data-testid="merger-reg-date"]')).toBeVisible({ timeout: 3_000 });

    // 합병등기일 2021-06-30
    await fillDate("merger-reg-date", "2021", "6", "30");
    // 합병후 발행주식총수 15,000 (CurrencyInput testid는 input 자체 — 직접 fill)
    await mergerToggle.locator('[data-testid="merger-post-shares"]').fill("15000");

    // 합병법인 전1/2/3년 (㉰): 날짜·주식수·순손익
    const acq = [
      { y: "2021", shares: "15000", income: "40000000" },
      { y: "2020", shares: "15000", income: "30000000" },
      { y: "2019", shares: "10000", income: "20000000" },
    ];
    for (let i = 0; i < 3; i++) {
      await fillDate(`merger-acquirer-${i}-start`, acq[i].y, "1", "1");
      await fillDate(`merger-acquirer-${i}-end`, acq[i].y, "12", "31");
      await mergerToggle.locator(`[data-testid="merger-acquirer-${i}-shares"]`).fill(acq[i].shares);
      await mergerToggle.locator(`[data-testid="merger-acquirer-${i}-income"]`).fill(acq[i].income);
    }

    // 피합병법인(을) 2개 사업연도 추가: 2021(2,000,000)·2020(△5,000,000)
    const addBtn = mergerToggle.locator('[data-testid="merger-target-add"]');
    await addBtn.click();
    await addBtn.click();
    await fillDate("merger-target-0-start", "2021", "1", "1");
    await fillDate("merger-target-0-end", "2021", "12", "31");
    await mergerToggle.locator('[data-testid="merger-target-0-income"]').fill("2000000");
    await fillDate("merger-target-1-start", "2020", "1", "1");
    await fillDate("merger-target-1-end", "2020", "12", "31");
    await mergerToggle.locator('[data-testid="merger-target-1-income"]').fill("-5000000");

    // ── 결과 카드 검증 ──
    // §56③ 합병 합산 명세 카드 노출 확인
    const breakdownCard = page.locator('[data-testid="merger-breakdown-card"]');
    await expect(breakdownCard).toBeVisible({ timeout: 5_000 });

    // §17의3② 연환산 카드는 숨겨져야 함 (상호 배타)
    // (결과가 mergerApplied=true 시 annualization 카드 hidden)
    await expect(
      page.getByText("§17의3② 1년 미만 사업연도 연환산 내역")
    ).not.toBeVisible();

    // 합병 합산 명세 카드 헤더 텍스트 확인
    await expect(
      breakdownCard.getByText("§56③ 합병법인 순손익 합산 내역")
    ).toBeVisible();

    // 펼치기 버튼 클릭
    await breakdownCard.getByRole("button").click();

    // breakdown-row-0 노출 확인
    await expect(
      page.locator('[data-testid="merger-breakdown-row-0"]')
    ).toBeVisible({ timeout: 3_000 });

    // breakdown-row-1, 2도 노출
    await expect(
      page.locator('[data-testid="merger-breakdown-row-1"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="merger-breakdown-row-2"]')
    ).toBeVisible();
  });

  test("피합병법인 사업연도 추가/삭제가 동작한다", async ({ page }) => {
    await gotoV2FormalValuationCard(page);

    // 합병 토글 ON
    const mergerToggle = page.locator('[data-testid="merger-toggle"]');
    await mergerToggle.getByRole("switch").click();

    // 추가 버튼
    const addBtn = mergerToggle.locator('[data-testid="merger-target-add"]');
    await expect(addBtn).toBeVisible({ timeout: 3_000 });
    await addBtn.click();

    // 피합병 #1 노출 확인
    await expect(mergerToggle.getByText("피합병 #1")).toBeVisible({ timeout: 3_000 });

    // 삭제 버튼 클릭
    const removeBtn = mergerToggle.locator('[data-testid="merger-target-0-remove"]');
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    // 삭제 후 사라짐 확인
    await expect(mergerToggle.getByText("피합병 #1")).not.toBeVisible({ timeout: 3_000 });
  });
});
