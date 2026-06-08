/**
 * E2E: 연부연납 일정표 (상속세, 상증법 §71·§72)
 *
 * 검증:
 *   1. Step4(공제·세액공제) 끝 "연부연납 신청" 토글 노출
 *   2. 토글 ON + 계산 → 결과에 회차별 일정표(일자·원금·가산금·합계) 표시
 *   3. 회차 0 "즉납" 배지, 합계행, 가산금 > 0
 *   4. 토글 OFF → 적격 안내 카드만(표 없음)
 *
 * 시나리오: 자녀 1명 — 토지 30억(공시지가 10,000,000원/㎡ × 300㎡)
 *   → 일괄공제 5억 → 과세표준 25억 → 결정세액 약 8.1억(>2천만 적격)
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset as addLandAssetHelper,
  nextSteps,
  calcAndWaitResult,
} from "./_helpers/tax-flow";

async function fillStep0WithChild(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await page.getByRole("button", { name: /^다음/ }).click(); // → Step1
}

async function addLandAsset(page: Page) {
  await addLandAssetHelper(page, { area: "300", unitPrice: "10000000" });
}

/** Step1 → Step4(공제·세액공제)로 이동 (계산 전) */
async function gotoStep4(page: Page) {
  await nextSteps(page, 3); // → Step2 → Step3 → Step4
}

test.describe("연부연납 일정표 (§71·§72)", () => {
  test("INST-E2E-1: 토글 ON → 결과 일정표(회차·일자·가산금·합계) 표시", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await fillStep0WithChild(page);
    await addLandAsset(page);
    await gotoStep4(page);

    // Step4 끝 — 연부연납 신청 토글 노출
    const toggle = page.getByText("연부연납 신청 (상증법 §71)");
    await expect(toggle).toBeVisible();
    await toggle.click(); // ON → 펼침(희망기간·가업·미래율)

    // 희망 기간 Select 노출 확인
    await expect(page.getByText("희망 연부연납 기간")).toBeVisible();

    // 계산하기 → 결과
    await calcAndWaitResult(page);

    // 일정표 카드 + 표 노출
    const card = page.getByTestId("installment-schedule-card");
    await expect(card).toBeVisible();
    await expect(page.getByText("연부연납 일정표 (상증법 §71·§72)")).toBeVisible();

    const table = page.getByTestId("installment-schedule-table");
    await expect(table).toBeVisible();

    // 회차 0 "즉납" 배지 + 합계행
    await expect(table.getByText("즉납")).toBeVisible();
    await expect(table.getByText("합계", { exact: true })).toBeVisible();

    // 요약 — 허가 총세액·가산금 합계 라벨
    await expect(card.getByText("연부연납 허가 총세액")).toBeVisible();
    await expect(card.getByText("가산금 합계")).toBeVisible();

    // 회차 0~5 (희망 5년) → 표 데이터 행 6개 이상(합계행 제외)
    const rows = table.locator("tbody tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(6);
  });

  test("INST-E2E-3: 비거주자 → 신고기한 9개월 안내(§67④) 노출", async ({ page }) => {
    test.setTimeout(90_000);

    // Step0: 비거주자 선택 + 자녀
    await page.goto("/calc/inheritance-tax");
    await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
    await page.getByRole("button", { name: /비거주자/ }).click();
    await page.getByRole("button", { name: /상속인 추가/ }).click();
    await page.getByText("자녀", { exact: true }).click();
    await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
    await page.getByRole("button", { name: /^다음/ }).click(); // → Step1

    await addLandAsset(page);
    await gotoStep4(page);

    await page.getByText("연부연납 신청 (상증법 §71)").click(); // ON
    await calcAndWaitResult(page);

    // 9개월 안내 노출
    await expect(
      page.getByTestId("installment-schedule-card").getByText(/비거주자.*9개월/),
    ).toBeVisible();
  });

  test("INST-E2E-2: 토글 OFF → 적격 안내 카드만(상세 표 없음)", async ({ page }) => {
    test.setTimeout(90_000);

    await fillStep0WithChild(page);
    await addLandAsset(page);
    await gotoStep4(page);

    // 토글 OFF 상태 그대로 계산
    await calcAndWaitResult(page);

    // 적격 안내 문구 노출, 상세 표는 없음
    await expect(page.getByText("연부연납 안내 (상증법 §71)")).toBeVisible();
    await expect(page.getByTestId("installment-schedule-table")).toHaveCount(0);
  });
});
