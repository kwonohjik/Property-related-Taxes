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

    // 토글 카드 활성화 — ToggleCard 내부 switch 역할 버튼
    const mergerToggle = page.locator('[data-testid="merger-toggle"]');
    const switchBtn = mergerToggle.getByRole("switch");
    await switchBtn.click();
    await expect(switchBtn).toHaveAttribute("data-state", "checked", { timeout: 3_000 });

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

    // ── 법인 기본 정보 먼저 채우기 ──
    // 법인명
    const corpNameInput = page.getByPlaceholder(/법인명/).first();
    await corpNameInput.fill("합병테스트(주)");

    // 발행주식총수 (기본값 없어서 직접 입력)
    const totalInput = page.getByPlaceholder(/발행주식총수/).first();
    await totalInput.fill("100000");

    // 보유주식수
    const ownedInput = page.getByPlaceholder(/보유주식수/).first();
    await ownedInput.fill("50000");

    // 사업연도 종료일 (3년치) — 필수
    // 종료일 DateInput은 순서대로 배치됨 — 각 연도 종료일 입력
    // 1년전: 2023-12-31
    const endDateInputs = page.locator(".space-y-0\\.5").filter({ hasText: /종료일/ }).locator("input");
    if (await endDateInputs.count() >= 3) {
      await endDateInputs.nth(0).fill("2023");
      await endDateInputs.nth(1).fill("12");
      await endDateInputs.nth(2).fill("31");
    }

    // ── 합병 토글 활성화 ──
    const mergerToggle = page.locator('[data-testid="merger-toggle"]');
    const switchBtn = mergerToggle.getByRole("switch");
    await switchBtn.click();
    await expect(switchBtn).toHaveAttribute("data-state", "checked", { timeout: 3_000 });

    // 합병등기일 입력 (wrapper div 내 input 찾기)
    const mergerRegDateWrapper = mergerToggle.locator('[data-testid="merger-reg-date"]');
    const mergerRegInputs = mergerRegDateWrapper.locator("input");
    if (await mergerRegInputs.count() >= 3) {
      await mergerRegInputs.nth(0).fill("2023");
      await mergerRegInputs.nth(1).fill("7");
      await mergerRegInputs.nth(2).fill("1");
    }

    // 합병후 발행주식총수
    await mergerToggle.locator('[data-testid="merger-post-shares"] input').fill("100000");

    // 합병법인 전1년 (idx=0)
    const acq0Start = mergerToggle.locator('[data-testid="merger-acquirer-0-start"] input');
    if (await acq0Start.count() >= 3) {
      await acq0Start.nth(0).fill("2023");
      await acq0Start.nth(1).fill("1");
      await acq0Start.nth(2).fill("1");
    }
    const acq0End = mergerToggle.locator('[data-testid="merger-acquirer-0-end"] input');
    if (await acq0End.count() >= 3) {
      await acq0End.nth(0).fill("2023");
      await acq0End.nth(1).fill("12");
      await acq0End.nth(2).fill("31");
    }
    await mergerToggle.locator('[data-testid="merger-acquirer-0-shares"] input').fill("100000");
    await mergerToggle.locator('[data-testid="merger-acquirer-0-income"] input').fill("50000000");

    // 합병법인 전2년 (idx=1)
    const acq1Start = mergerToggle.locator('[data-testid="merger-acquirer-1-start"] input');
    if (await acq1Start.count() >= 3) {
      await acq1Start.nth(0).fill("2022");
      await acq1Start.nth(1).fill("1");
      await acq1Start.nth(2).fill("1");
    }
    const acq1End = mergerToggle.locator('[data-testid="merger-acquirer-1-end"] input');
    if (await acq1End.count() >= 3) {
      await acq1End.nth(0).fill("2022");
      await acq1End.nth(1).fill("12");
      await acq1End.nth(2).fill("31");
    }
    await mergerToggle.locator('[data-testid="merger-acquirer-1-shares"] input').fill("80000");
    await mergerToggle.locator('[data-testid="merger-acquirer-1-income"] input').fill("40000000");

    // 합병법인 전3년 (idx=2)
    const acq2Start = mergerToggle.locator('[data-testid="merger-acquirer-2-start"] input');
    if (await acq2Start.count() >= 3) {
      await acq2Start.nth(0).fill("2021");
      await acq2Start.nth(1).fill("1");
      await acq2Start.nth(2).fill("1");
    }
    const acq2End = mergerToggle.locator('[data-testid="merger-acquirer-2-end"] input');
    if (await acq2End.count() >= 3) {
      await acq2End.nth(0).fill("2021");
      await acq2End.nth(1).fill("12");
      await acq2End.nth(2).fill("31");
    }
    await mergerToggle.locator('[data-testid="merger-acquirer-2-shares"] input').fill("80000");
    await mergerToggle.locator('[data-testid="merger-acquirer-2-income"] input').fill("30000000");

    // 결과 카드가 렌더되기까지 대기
    await page.waitForTimeout(500);

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
