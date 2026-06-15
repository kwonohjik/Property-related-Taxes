/**
 * 재산세 납세의무자(§107) 판정 + 공유 지분 안분 E2E
 *
 * 시나리오:
 *   1. 소유 형태 섹션 미사용 → taxpayerInfo 미전송 → 결과에 납세의무자 섹션 없음
 *   2. 소유 형태 "공유 2인" (50:50) 입력 → 결과에 공유자별 안분 표 표시
 *   3. 소유 형태 "신탁" + 위탁자 입력 → 결과에 납세의무자 유형 "신탁 위탁자" 표시
 *   4. 공유 지분 합계 100% 초과 → 실시간 경고 + 다음 클릭 시 단계 차단
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/property-taxpayer-coownership.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

function amountInputByLabel(page: Page, labelText: string | RegExp) {
  return page
    .locator("div")
    .filter({ hasText: labelText })
    .locator('input[inputmode="numeric"]')
    .last();
}

/**
 * RadioCardGroup 옵션 선택 — radio role + accessible name.
 * label 텍스트 filter는 ToggleCard 전체 label(description에 "공유·신탁·상속" 포함)을
 * 오클릭해 섹션을 닫아버리므로 native radio role로 정확히 선택한다.
 */
function selectOwnership(page: Page, name: string | RegExp) {
  return page.getByRole("radio", { name });
}

async function gotoStep0(page: Page) {
  await page.goto("/calc/property-tax");
  // objectType 기본값 = housing(주택) → 별도 클릭 불필요
  await amountInputByLabel(page, /^공시가격/).fill("100000000");
}

/**
 * "소유 형태" ToggleCard 펼치기.
 * ToggleCard(variant=card)는 <label>이 button[role=switch]를 감싸지만 label→button 토글이
 * 자동 연결되지 않으므로, data-slot 카드로 좁혀 switch를 직접 클릭한다.
 */
async function openOwnershipSection(page: Page) {
  const card = page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "소유 형태" })
    .first();
  await card.getByRole("switch").click();
  await expect(page.getByText("특수 소유 형태")).toBeVisible();
}

async function calcAndWait(page: Page) {
  const calcResponse = page.waitForResponse(
    (r) => r.url().includes("/api/calc/property") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /재산세 계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `재산세 계산 API 비정상 ${resp.status()}`).toBe(true);
  await expect(page.getByText("총 납부세액").first()).toBeVisible({ timeout: 30_000 });
}

test.describe("재산세 납세의무자 판정 + 공유 안분 §107", () => {
  test("1: 소유 형태 섹션 미사용 → 결과에 납세의무자 섹션 없음", async ({ page }) => {
    await gotoStep0(page);
    // 소유 형태 섹션 열지 않고 바로 다음 → 확인 단계 → 계산
    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    // taxpayerInfo 미전송 → 납세의무자 판정 섹션 없음
    await expect(page.getByText("납세의무자 판정")).toHaveCount(0);
  });

  test("2: 공유 2인(50:50) 입력 → 결과에 공유자별 안분 표 표시", async ({ page }) => {
    await gotoStep0(page);
    await openOwnershipSection(page);

    // 소유 형태: 공유 선택
    await selectOwnership(page, "공유").check();

    // 공부상 소유자 (placeholder "성명 또는 식별자")
    await page.getByPlaceholder("성명 또는 식별자", { exact: true }).fill("홍길동");

    // 공유자 2인 추가 후 식별자·지분율 입력 (aria-label 기반)
    const addBtn = page.getByRole("button", { name: /공유자 추가/ });
    await addBtn.click();
    await addBtn.click();
    await page.getByLabel("공유자 1 식별자").fill("홍길동");
    await page.getByLabel("공유자 1 지분율").fill("0.5");
    await page.getByLabel("공유자 2 식별자").fill("김철수");
    await page.getByLabel("공유자 2 지분율").fill("0.5");

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    // 납세의무자 섹션 + 공유 안분 표
    await expect(page.getByText("납세의무자 판정").first()).toBeVisible();
    await expect(page.getByText(/공유 지분별 세액 안분/).first()).toBeVisible();
    // 본세·고지액 2열 헤더
    await expect(page.getByText("본세 안분액").first()).toBeVisible();
    await expect(page.getByText("고지액 안분액").first()).toBeVisible();
  });

  test("3: 신탁 + 위탁자 입력 → 결과에 납세의무자 유형 '신탁 위탁자' 표시", async ({ page }) => {
    await gotoStep0(page);
    await openOwnershipSection(page);

    // 소유 형태: 신탁 선택
    await selectOwnership(page, "신탁").check();

    // 공부상 소유자(수탁자명) + 위탁자(settlor) 입력 — truster 판정에 settlor 필수
    await page.getByPlaceholder("성명 또는 식별자", { exact: true }).fill("KB부동산신탁");
    await page.getByPlaceholder("위탁자 성명 또는 식별자").fill("홍길동");

    await page.getByRole("button", { name: /^다음$/ }).click();
    await calcAndWait(page);

    await expect(page.getByText("납세의무자 판정").first()).toBeVisible();
    // 신탁 위탁자 라벨 (§107②5호)
    await expect(page.getByText(/신탁 위탁자/).first()).toBeVisible();
  });

  test("4: 공유 지분 합계 100% 초과 → 실시간 경고 + 단계 차단", async ({ page }) => {
    await gotoStep0(page);
    await openOwnershipSection(page);

    await selectOwnership(page, "공유").check();
    await page.getByPlaceholder("성명 또는 식별자", { exact: true }).fill("홍길동");

    const addBtn = page.getByRole("button", { name: /공유자 추가/ });
    await addBtn.click();
    await addBtn.click();
    await page.getByLabel("공유자 1 식별자").fill("홍길동");
    await page.getByLabel("공유자 1 지분율").fill("0.7");
    await page.getByLabel("공유자 2 식별자").fill("김철수");
    await page.getByLabel("공유자 2 지분율").fill("0.6"); // 합계 130% — 초과

    // CoOwnerList 실시간 경고
    await expect(page.getByText(/100%를 초과/).first()).toBeVisible();

    // 다음 클릭 → validateStep 차단 → 결과 화면으로 넘어가지 않음
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByText("총 납부세액")).toHaveCount(0);
  });
});
