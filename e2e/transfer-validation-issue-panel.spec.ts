/**
 * 양도세 검증 오류 — 화면 이동 없이 보이는가 (2026-09-30)
 *
 * 제보: 「다음」·「세금 계산하기」에서 오류가 나면 메시지를 보러 화면 위로 올라가야 했다.
 * 원인 3경로(계획서 §2):
 *   A 하단 목록이 문서 흐름 안에 있어, 자산 카드 자동 스크롤·단계 복귀로 시야 밖에 놓인다
 *   B 자산 카드 배너가 카드 최상단인데 스크롤 기준이 `center`라 잘린다
 *   C 다건 「세액 계산」 오류가 페이지 최상단 Alert
 *
 * 🔑 위치 판정은 jsdom이 못 한다 — `toBeInViewport()`만이 증거다.
 *
 * 계획서: `docs/00-pm/transfer-validation-issue-panel.plan.md`
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-validation-issue-panel.spec.ts
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

async function openEmptyWizard(page: Page) {
  await page.goto("/calc/transfer-tax?new=1");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // dev 서버의 Next.js 표시기(우하단 배지)가 모바일 폭에서 「다음」 버튼을 덮어, 패널 가림
  // 판정이 패널까지 닿지 못한다(`fixed` 뮤테이션이 모바일에서 살아남았다). 테스트에서만 숨긴다.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

/**
 * 버튼 중심점의 최상단 요소가 오류 패널 안에 있는가.
 * 「버튼이 최상단인가」로 물으면 dev 서버의 Next.js 표시기(우하단 배지)가 모바일 폭에서
 * 버튼을 덮어 거짓 실패한다(2026-09-30 실측) — 주장하는 것은 «패널이 가리지 않는다»다.
 */
async function coveredByPanel(target: Locator) {
  return target.evaluate((btn) => {
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top?.closest('[data-testid="validation-issues"]');
  });
}

async function gotoLastStep(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
}

test.describe("양도세 검증 오류 패널 — 화면 이동 없이 보인다", () => {
  test("A·B 빈 폼 「다음」 → 목록과 자산 카드 배너가 둘 다 화면 안", async ({ page }) => {
    await openEmptyWizard(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();

    const panel = page.getByTestId("validation-issues");
    await expect(panel.getByText(/입력 확인이 필요합니다 \(\d+건\)/)).toBeInViewport();

    // 자동 스크롤(자산 카드) 이후에도 카드 머리 배너가 잘리지 않는다
    const card = page.locator('[data-asset-card-index="0"]');
    await expect(card.getByText("양도일을 선택하세요.").first()).toBeInViewport();
  });

  test("A 마지막 단계 「세금 계산하기」 → 앞 단계로 돌아가도 목록이 화면 안", async ({ page }) => {
    await openEmptyWizard(page);
    await gotoLastStep(page);
    await page.getByRole("button", { name: /세금 계산하기/ }).click();

    const panel = page.getByTestId("validation-issues");
    await expect(panel.getByText(/입력 확인이 필요합니다 \(\d+건\)/)).toBeInViewport();
  });

  test("A 맨 위로 스크롤해도 목록이 따라오고, 맨 아래에서는 「다음」 버튼을 가리지 않는다", async ({
    page,
  }) => {
    await openEmptyWizard(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const header = page.getByTestId("validation-issues").getByText(/입력 확인이 필요합니다/);
    await expect(header).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(header).toBeInViewport();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const next = page.getByRole("button", { name: "다음", exact: true });
    await expect(next).toBeInViewport();
    // ⚠️ `click({ trial: true })`로는 못 잡는다 — 가려지면 Playwright가 스크롤을 바꿔 재시도해
    //    결국 통과한다(`fixed` 뮤테이션이 살아남았다). 스크롤을 고정한 채 버튼 중심점에
    //    실제로 무엇이 있는지 본다.
    expect(await coveredByPanel(next), "「다음」 버튼 중심이 오류 패널에 가려졌다").toBe(false);
  });

  test("Q-1=A 고친 항목은 목록에서 즉시 사라진다", async ({ page }) => {
    await openEmptyWizard(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const panel = page.getByTestId("validation-issues");
    await expect(panel.getByText("양도일을 선택하세요.")).toBeVisible();

    const td = page.getByTestId("transfer-date");
    await td.getByLabel("연도", { exact: true }).fill("2024");
    await td.getByLabel("월", { exact: true }).fill("06");
    await td.getByLabel("일", { exact: true }).fill("01");

    await expect(panel.getByText("양도일을 선택하세요.")).toHaveCount(0);
    // 남은 오류는 그대로 — 목록 자체가 닫힌 것이 아니다
    await expect(panel.getByText("총 양도가액을 입력하세요.", { exact: false })).toBeVisible();
  });

  test("C 다건 「세액 계산」 실패 → 오류가 버튼과 함께 화면 안", async ({ page }) => {
    await page.goto("/calc/transfer-tax/multi");
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const k = "multi-transfer-tax-wizard";
      const parsed = JSON.parse(sessionStorage.getItem(k)!);
      parsed.state.form.activeStep = "settings";
      // 설정 단계 검증을 확실히 실패시키는 최단 입력 — multi-transfer-tax-validate.ts
      parsed.state.form.annualBasicDeductionUsed = "3000000";
      sessionStorage.setItem(k, JSON.stringify(parsed));
    });
    await page.reload();

    const calc = page.getByRole("button", { name: "세액 계산" });
    await calc.click();
    await expect(page.getByText("연간 기사용 기본공제는 250만원을 초과할 수 없습니다.")).toBeInViewport();
    await expect(calc).toBeInViewport();
  });
});

test.describe("모바일 폭 (375px) — 계획서 V-2", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("목록이 화면 안에 있고, 맨 아래에서 「다음」 버튼을 가리지 않는다", async ({ page }) => {
    await openEmptyWizard(page);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    const header = page.getByTestId("validation-issues").getByText(/입력 확인이 필요합니다/);
    await expect(header).toBeInViewport();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const next = page.getByRole("button", { name: "다음", exact: true });
    await expect(next).toBeInViewport();
    expect(await coveredByPanel(next), "「다음」 버튼 중심이 오류 패널에 가려졌다").toBe(false);
  });
});
