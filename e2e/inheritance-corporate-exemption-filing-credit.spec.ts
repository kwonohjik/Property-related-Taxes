/**
 * E2E: 영리법인 면제(§3의2②) 요약 반영 + §69 신고세액공제 산식 정합 (2026-06-01)
 *
 * 계획서: docs/00-pm/inheritance-filing-credit-corporate-exemption.plan.md
 * 정책: [[feedback_browser_verify_with_playwright]] — spec 통과로 브라우저 확인 충족
 *
 * 버그(이미지6 vs 이미지7): 요약 화면이 영리법인 면제(§3의2②)를 §69 신고세액공제 기준·결정세액에서
 *   누락 → 신고세액공제·결정세액이 배부표보다 과다. 면제 카드는 "−150,000,000"으로 표시되나
 *   결정세액엔 미반영(시각적 모순).
 * 수정: ① 요약 산식 행에 "영리법인 면제 (§3의2②)" 차감 행 추가
 *       ② §69 산출근거 펼침 등식에 "− 영리법인 면제" 항 추가(등식 균형)
 *       ③ "상속인별 합산" fine-print 추가
 *
 * 시나리오 CE-1: 자녀1 + 영리법인 + 토지 3억 + 영리법인 사전증여 7억(증여세 1.5억)
 *   → 결과 화면에 영리법인 면제 요약 행 + §69 펼침 면제 항 노출.
 */

import { test, expect, type Page } from "@playwright/test";

/** Step0: 상속개시일 2024-06-10 + 자녀1 + 영리법인 → Step1 */
async function gotoStep0(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await page.getByLabel("연도").first().fill("2024");
  await page.getByLabel("월").first().fill("6");
  await page.getByLabel("일").first().fill("10");

  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("자녀", { exact: true }).click();
  await page.getByRole("button", { name: /상속인 추가/ }).click();
  await page.getByText("법인", { exact: true }).click();

  await page.getByRole("button", { name: /^다음/ }).click();
}

/** Step1: 토지 30억 → Step3(사전증여)
 *  (산출세액 ≫ 영리법인 면제여야 §69 신고세액공제 기준 > 0 → 신고세액공제 행 렌더) */
async function addLandAndGotoStep3(page: Page) {
  await page.getByRole("button", { name: /상속재산 추가/ }).click();
  await page.getByRole("button", { name: /토지/ }).first().click();
  await page.getByPlaceholder("면적 입력").fill("300");
  await page.getByPlaceholder("공시지가 단가").fill("10000000");
  await page.getByRole("button", { name: /^다음/ }).click(); // Step2
  await page.getByRole("button", { name: /^다음/ }).click(); // Step3
}

/** Step3: 영리법인 사전증여 7억 추가 */
async function addCorporatePriorGift(page: Page) {
  await page.getByRole("button", { name: /사전증여 추가/ }).click();
  const giftCard = page.locator(".border.rounded-lg.p-4").last();
  await giftCard.getByLabel("연도").fill("2021");
  await giftCard.getByLabel("월").fill("8");
  await giftCard.getByLabel("일").fill("10");
  const amountInput = giftCard.getByPlaceholder("금액 입력").first();
  await amountInput.fill("700000000");
  await amountInput.press("Tab");
  // 수증자 → 영리법인 (옵션: [선택안함, 자녀, 법인] → index 2)
  const doneeSelect = giftCard.getByTestId("gift-donee-select");
  await expect(doneeSelect).toBeVisible({ timeout: 5_000 });
  await doneeSelect.selectOption({ index: 2 });
  await expect(giftCard.getByText("⑩a 상속인외 증여세 산출세액")).toBeVisible();
}

/** Step4 → 계산하기 → 결과 대기 */
async function gotoResult(page: Page) {
  await page.getByRole("button", { name: /^다음/ }).click(); // Step4
  await page.getByRole("button", { name: /계산하기/ }).click();
  await expect(page.getByText("상속세 결정세액")).toBeVisible({ timeout: 20_000 });
}

test.describe("영리법인 면제 요약 반영 + §69 산식 정합", () => {
  test("CE-1: 요약 영리법인 면제 행 + §69 펼침 면제 항 노출", async ({ page }) => {
    test.setTimeout(90_000);

    await gotoStep0(page);
    await addLandAndGotoStep3(page);
    await addCorporatePriorGift(page);
    await gotoResult(page);

    // ① 과세요약 산식 행 "영리법인 면제 (§3의2②)" 노출 (카드 메인 제목 "영리법인 상속세 면제…"와 구분 — exact)
    await expect(
      page.getByText("영리법인 면제 (§3의2②)", { exact: true }),
    ).toBeVisible();

    // ② §69 신고세액공제 산출근거 펼침 → "영리법인 면제" 차감 항 + 상속인별 합산 fine-print
    const filingExpandBtn = page.getByRole("button", {
      name: /신고세액공제 \(3%\) 산출근거 펼치기/,
    });
    await expect(filingExpandBtn).toBeVisible();
    await filingExpandBtn.click();
    // 펼침 영역(fine-print 포함 div) 스코프 → 면제 항 포함 확인 (텍스트 노드 분할·−문자 무관)
    const filingFormula = page
      .locator("div.space-y-1")
      .filter({ hasText: "상속인별 신고분 세액에 각각 3% 적용 후 합산" })
      .last();
    await expect(filingFormula).toBeVisible();
    await expect(filingFormula).toContainText("영리법인 면제");
  });

  test("CE-2: 영리법인 면제 단일 섹션 — 요약 + 부표5 통합, 분리 카드 제거", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await gotoStep0(page);
    await addLandAndGotoStep3(page);
    await addCorporatePriorGift(page);
    await gotoResult(page);

    // 통합 카드 메인 제목 1개 (과세요약 SummaryRow "영리법인 면제 (§3의2②)"와 "상속세" 유무로 구분)
    await expect(
      page.getByText("영리법인 상속세 면제 (§3의2②)", { exact: true }),
    ).toBeVisible();

    // 구 분리 인라인 카드 제목 제거 확인
    await expect(page.getByText(/영리법인 사전증여 면제/)).toHaveCount(0);

    // 면제 산출 요약(차감) 상시 노출
    await expect(page.getByText(/상속세 산출세액에서 차감/)).toBeVisible();

    // 부표 5 펼침 → 가. 표 노출 (부표1 보조명세에도 동일 토글 존재 → 부표5 헤더 부모로 스코프)
    const buppyoHeaderRow = page
      .getByText("🏢 부표 5 — 영리법인 상속세 면제 및 납부 명세서")
      .locator("..");
    await buppyoHeaderRow.getByRole("button", { name: /펼치기/ }).click();
    await expect(
      page.getByText(/가\. 상속세 면제대상 영리법인/),
    ).toBeVisible();
  });
});
