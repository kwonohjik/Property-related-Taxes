/**
 * 취득세 간주취득 §15② 단서 E2E — 브라우저 실플로우 확인
 *
 * 「지방세법」 §15② 본문은 간주취득 세율을 **중과기준세율 2%** 로 확정하고, 단서가
 * 「취득**물건이** … §13⑤에 해당하는 경우에는 중과기준세율의 **100분의 500**」이라 정한다.
 *
 * 이 spec 이 확인하는 것은 **입력 경로가 실제로 존재하는가**다. 종전에는 `Step1.tsx`가
 * 간주취득에서 조기 반환해 사치성 토글에 닿지 못했고(그 토글은 조기 반환 **아래**에 있었다),
 * 법인 중과는 Step 4인데 간주취득은 2단계에서 끝났다 — 즉 엔진은 10%를 낼 수 있는데
 * 화면에 켤 칸이 없었다.
 *
 * 1. 지목변경 + 사치성 ON → 10% (§15② 단서)
 * 2. 과점주주 물건별 구분 → 골프장 10% + 일반 2% 합산
 *
 * 실행: npx playwright test e2e/acquisition-deemed-15-2-proviso.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

function toggleSwitch(page: Page, titleText: string | RegExp) {
  return page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: titleText })
    .getByRole("switch");
}

async function calcAndWait(page: Page) {
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/acquisition") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /취득세 계산/ }).click();
  const r = await resp;
  expect(r.ok(), `취득세 계산 API 비정상 응답 ${r.status()}`).toBe(true);
  await expect(page.getByText(/납부세액 합계|최종 납부세액/).first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("취득세 간주취득 — §15② 단서 입력 경로", () => {
  test("지목변경 + 사치성(골프장) → 세율 10% · 근거 §15② 단서", async ({ page }) => {
    await page.goto("/calc/acquisition-tax");

    await page.locator("select").nth(1).selectOption("deemed_land_category");
    await page.getByRole("button", { name: /다음/ }).click();
    await expect(page.getByText("지목변경 간주취득 상세")).toBeVisible();

    // 지목 + 시가표준액 — Step 1에는 select 가 「변경 전/후 지목」 둘뿐이다
    // (Step 0 의 물건유형·취득원인 select 는 단계가 바뀌며 언마운트된다)
    const selects = page.locator("select");
    await expect(selects).toHaveCount(2);
    await selects.nth(0).selectOption("임야");
    await selects.nth(1).selectOption("체육용지");
    await page.getByPlaceholder("지목변경 전 토지 공시가격 기준").fill("500000000");
    await page.getByPlaceholder("지목변경 후 토지 공시가격 기준").fill("1500000000");

    // ── 본문 2% 확인 ──
    await expect(page.getByText("× 2% = 20,000,000")).toBeVisible();

    // ── §15② 단서 토글 — 종전에는 이 칸이 화면에 없었다 ──
    const proviso = toggleSwitch(page, /사치성 재산\(§13⑤\)에 해당/);
    await expect(proviso).toBeVisible();
    await proviso.click();
    await page.getByText(/골프장 \(회원제/).click();

    // 미리보기가 단서 세율로 따라간다
    await expect(page.getByText("× 10% = 100,000,000")).toBeVisible();

    await calcAndWait(page);
    await expect(page.getByText("지방세법 §15② 단서")).toBeVisible();
    await expect(page.getByText("100,000,000").first()).toBeVisible();
  });

  test("과점주주 물건별 구분 → 골프장 10% + 일반 2% = 440,000,000", async ({ page }) => {
    await page.goto("/calc/acquisition-tax");

    await page.locator("select").nth(1).selectOption("deemed_major_shareholder");
    await page.getByRole("button", { name: /다음/ }).click();
    await expect(page.getByText("과점주주 간주취득 상세")).toBeVisible();

    // 지분 0% → 100% (최초 과점주주 — 취득 후 전체가 과세 지분율)
    await page.getByPlaceholder("취득 전 보유 지분율 (신규 진입 시 비움)").fill("0");
    await page.getByPlaceholder("취득 후 합산 지분율").fill("100");

    // ── 물건별 구분 모드 ON ──
    const bucketMode = toggleSwitch(page, /물건별로 구분해 입력/);
    await expect(bucketMode).toBeVisible();
    await bucketMode.click();

    const rows = page.getByTestId("deemed-bucket-rows");
    await expect(rows).toBeVisible();

    // 1번 물건 — 골프장 30억 (사치성)
    await rows.getByPlaceholder("결산서·장부상 가액 (§10의6④)").first().fill("3000000000");
    await rows.getByText(/사치성\(§13⑤\) — 10%/).first().click();
    await rows.getByText("골프장", { exact: true }).first().click();

    // 2번 물건 — 일반 토지 70억
    await page.getByTestId("deemed-bucket-add").click();
    await rows.getByPlaceholder("결산서·장부상 가액 (§10의6④)").nth(1).fill("7000000000");

    // 합계 미리보기 — 3억 + 1.4억
    await expect(page.getByText("440,000,000").first()).toBeVisible();

    await calcAndWait(page);

    // 결과 카드에 물건별 표가 뜬다
    await expect(page.getByTestId("deemed-bucket-breakdown")).toBeVisible();
    await expect(page.getByText("물건별 (아래 표)")).toBeVisible();
  });
});
