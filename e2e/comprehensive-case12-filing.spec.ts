import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 사례12 — 신고서 서식 4종 재현 E2E (전수 셀 검증)
 *
 * 국세청 2022 사례집 사례12 (1세대1주택, 공시 15억/14억, 67세, '12.1.1 취득)
 * 마법사 4단계(직전연도 2단계 통합) → 2단계 직전연도 자동계산 모드(cap-mode-auto) →
 *   결과 서식 펼침 → 전 칸 값 검증 + 콘솔 에러 0.
 *
 * worktree: E2E_PORT=3101 npx playwright test e2e/comprehensive-case12-filing.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

async function calcAndWait(page: Page): Promise<void> {
  const calcResponse = page.waitForResponse(
    (r) =>
      r.url().includes("/api/calc/comprehensive") &&
      r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await calcResponse;
  expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);
}

/**
 * Step1 + Step2 공시 입력 (1세대1주택 + 공시 15억)까지 진행하고 Step2에 머무름.
 * cap-mode 선택·직전공시 입력은 각 테스트가 Step2에서 수행 (직전공시 2단계 통합).
 */
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
  // 당해 공시 먼저 입력 (cap-mode-auto 전 → 직전공시 미노출, placeholder nth 안정)
  await page.getByPlaceholder("금액 입력").first().fill("1500000000");
  await page.getByPlaceholder("0.00").first().fill("168");
}

/** data-besshi-cell 셀 텍스트 단언 헬퍼 */
async function expectCell(page: Page, cell: string, text: string): Promise<void> {
  await expect(
    page.locator(`[data-besshi-cell="${cell}"]`),
    `셀 ${cell} = ${text}`,
  ).toContainText(text);
}

test.describe("종합부동산세 사례12 신고서 서식 재현 (전수)", () => {
  test("F-1: 사례12 전체 (직전연도 자동) → 서식 4종 전 칸 검증 + 콘솔 에러 0", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await fillCase12ToStep2(page);

    // Step2: 직전연도 자동계산 모드 + 직전공시 14억 + 직전 1세대1주택
    await page.getByTestId("cap-mode-auto").click();
    await page.getByLabel("직전연도 공시가격").nth(0).fill("1400000000");
    // 단일주택 auto switch: [0]당해 조정2주택 [1]직전 1세대1주택 → 직전 1세대1주택 = nth(1)
    await page.getByRole("switch").nth(1).click();
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await calcAndWait(page);

    await expect(page.getByText(/302,400/).first()).toBeVisible({ timeout: 30_000 });

    // 서식 펼침
    await page.getByRole("button", { name: /신고서 서식/ }).click();

    // ── 신고서 본체 (comp-main) ──
    await expectCell(page, "comp-main-②-housing", "240,000,000"); // 과세표준
    await expectCell(page, "comp-main-④-housing", "1,440,000");   // 종합부동산세액
    await expectCell(page, "comp-main-⑤-housing", "432,000");     // 공제할재산세액
    await expectCell(page, "comp-main-⑥-housing", "1,008,000");   // 산출세액
    await expectCell(page, "comp-main-⑦-housing", "302,400");     // 고령자 세액공제
    await expectCell(page, "comp-main-⑧-housing", "403,200");     // 장기보유 세액공제
    await expectCell(page, "comp-main-⑩-housing", "302,400");     // 결정세액
    await expectCell(page, "comp-main-㉓", "60,480");             // 농특세 산출세액

    // ── 별지 3호부표 (comp-b3) ──
    await expectCell(page, "comp-b3-③-housing", "1,500,000,000"); // 감면후 공시가격
    await expectCell(page, "comp-b3-⑤-housing", "500,000,000");   // 1주택 추가공제
    await expectCell(page, "comp-b3-⑦-housing", "240,000,000");   // 과세표준
    await expectCell(page, "comp-b3-⑧-housing", "2,070,000");     // 해당연도 재산세액
    await expectCell(page, "comp-b3-⑨-housing", "432,000");       // 과표분 표준세율재산세
    await expectCell(page, "comp-b3-⑩-housing", "2,070,000");     // 총표준세율재산세
    await expectCell(page, "comp-b3-⑪-housing", "432,000");       // 공제할 재산세액

    // ── 별지 5호 (comp-b5) ──
    await expectCell(page, "comp-b5-⑦-housing", "1,440,000");     // 재산세공제전 종부세액
    await expectCell(page, "comp-b5-⑫-housing", "705,600");       // 1주택 세액공제
    await expectCell(page, "comp-b5-⑬-housing", "302,400");       // 세부담상한 전 종부세액
    await expectCell(page, "comp-b5-⑭-housing", "2,730,000");     // 직전연도 재산세
    await expectCell(page, "comp-b5-⑮-housing", "513,000");       // 직전연도 종부세
    await expectCell(page, "comp-b5-⑯-housing", "3,243,000");     // 합계
    await expectCell(page, "comp-b5-⑱-housing", "4,864,500");     // 세부담상한액
    await expectCell(page, "comp-b5-⑲-housing", "2,372,400");     // 해당연도 총세액상당액
    await expectCell(page, "comp-b5-㉑-housing", "0");            // 세부담상한초과세액

    // ── 별지 5호부표 (comp-b5sub) — 직전연도 ──
    await expectCell(page, "comp-b5sub-①-housing", "1,400,000,000"); // 공시가격
    await expectCell(page, "comp-b5sub-④-housing", "285,000,000");   // 과세표준
    await expectCell(page, "comp-b5sub-⑥-housing", "1,710,000");     // 재산세공제전 종부세액
    await expectCell(page, "comp-b5sub-⑦-housing", "2,730,000");     // 재산세상당액
    await expectCell(page, "comp-b5sub-⑩-housing", "684,000");       // 공제할 재산세액
    await expectCell(page, "comp-b5sub-⑫-housing", "513,000");       // 종부세상당액

    expect(consoleErrors, `콘솔 에러: ${consoleErrors.join(" | ")}`).toHaveLength(0);
  });

  test("F-2: 인적사항 미입력 → 서식 렌더 오류 0", async ({ page }) => {
    test.setTimeout(120_000);
    await fillCase12ToStep2(page);
    // 세부담상한 적용 안 함(none 기본) — 직전공시 없이 바로 계산
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await calcAndWait(page);
    await expect(page.getByText(/302,400/).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /신고서 서식/ }).click();
    await expectCell(page, "comp-main-⑩-housing", "302,400");
  });

  test("F-3: 세부담상한 적용 안 함(none) → 별지 5호부표(직전연도) 미가용", async ({ page }) => {
    test.setTimeout(120_000);
    await fillCase12ToStep2(page);
    // 세부담상한 적용 안 함(none 기본) — 직전공시·직접입력 모두 없음(직접입력 모드 제거됨)
    await clickNext(page); // → Step3
    await clickNext(page); // → Step4
    await calcAndWait(page);
    await expect(page.getByText(/302,400/).first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /신고서 서식/ }).click();
    // 직전공시 미입력(none) → 직전연도 별지 5호부표 미렌더
    await expect(
      page.locator('[data-besshi-cell="comp-b5sub-⑫-housing"]'),
    ).toHaveCount(0);
  });
});
