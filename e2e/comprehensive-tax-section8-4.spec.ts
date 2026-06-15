import { test, expect, type Page } from "@playwright/test";

/**
 * 종합부동산세 §8④ 1세대1주택자 의제 + §9⑦⑨ 안분 E2E (Phase D-2)
 *
 * 마법사 5단계: Step1 → Step2(주택·§8④ 지정) → Step3 → Step4 → Step5 → 결과
 *
 * - CPT-S8-E2E-1: 2024, 12억(일반)+3억(지방저가 비수도권) §8④4호 → 기본공제 12억 의제 + §8④4호 배지
 * - CPT-S8-E2E-2: 사례5 — 2022 + §10의2 + 4호 + 70세 → 결정세액 969,711
 * - CPT-S8-E2E-3: 수도권 주택에서 §8④4호 지방저가 옵션 disabled (UI 사전 차단)
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-tax-section8-4.spec.ts
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

test.describe("종합부동산세 §8④ 1세대1주택자 의제", () => {
  test(
    "CPT-S8-E2E-1: 2024 12억+3억(지방저가 §8④4호) → 기본공제 12억 의제 + §8④4호 배지",
    async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(PAGE);

      await page.getByRole("radio", { name: "2024" }).check();
      await clickNext(page); // Step1 → Step2

      // 주택1: 일반 12억
      await page.getByPlaceholder("금액 입력").first().fill("1200000000");
      await page.getByPlaceholder("0.00").first().fill("84");

      // 주택2 추가
      await page.getByRole("button", { name: /주택 추가/ }).click();
      await page.getByPlaceholder("금액 입력").nth(1).fill("300000000");
      await page.getByPlaceholder("0.00").nth(1).fill("60");
      // 주택2 비수도권 (4호 활성화 전제) — 수도권 select만 필터 (StandardPriceInput 기준연도 select 제외)
      await page
        .locator('select:has(option[value="non_metro"])')
        .nth(1)
        .selectOption("non_metro");

      // 주택2 §8④ ToggleCard ON (마지막 주택의 마지막 switch — 분리 토글 추가에 견고)
      await page.getByRole("switch").last().click();
      // 지방 저가주택 (§8④4호) 라디오 선택
      await page.getByRole("radio", { name: /지방 저가주택/ }).check();

      await clickNext(page); // Step2 → Step3
      await clickNext(page); // Step3 → Step4
      await clickNext(page); // Step4 → Step5
      await calcAndWait(page);

      // 기본공제 라벨 — §8④ 의제 (12억)
      await expect(
        page.getByText(/§8④ 1세대1주택자 의제/).first(),
      ).toBeVisible({ timeout: 30_000 });
      // 산출세액 배지 — §8④4호 지방 저가주택
      await expect(
        page.getByText("§8④4호 지방 저가주택"),
      ).toBeVisible({ timeout: 10_000 });
    },
  );

  test(
    "CPT-S8-E2E-2: 사례5 — 2022 + §10의2 + §8④4호 + 70세 → 결정세액 969,711",
    async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(PAGE);

      await page.getByRole("radio", { name: "2022" }).check();
      // §10의2 부부 특례 ON (Step1 두 번째 switch)
      await page.getByRole("switch").nth(1).click();
      // 신청인 70세(1952-01-01) · 취득 2018-01-01 (장기 0%)
      await page.getByLabel("연도").first().fill("1952");
      await page.getByLabel("월").first().fill("1");
      await page.getByLabel("일").first().fill("1");
      await page.getByLabel("연도").nth(1).fill("2018");
      await page.getByLabel("월").nth(1).fill("1");
      await page.getByLabel("일").nth(1).fill("1");

      await clickNext(page); // Step1 → Step2

      // 주택1: 15억
      await page.getByPlaceholder("금액 입력").first().fill("1500000000");
      await page.getByPlaceholder("0.00").first().fill("84");
      // 주택2: 2억 지방저가 비수도권
      await page.getByRole("button", { name: /주택 추가/ }).click();
      await page.getByPlaceholder("금액 입력").nth(1).fill("200000000");
      await page.getByPlaceholder("0.00").nth(1).fill("60");
      await page
        .locator('select:has(option[value="non_metro"])')
        .nth(1)
        .selectOption("non_metro");
      // 주택2 §8④ ON (마지막 주택의 마지막 switch — 분리 토글 추가에 견고) → 지방저가
      await page.getByRole("switch").last().click();
      await page.getByRole("radio", { name: /지방 저가주택/ }).check();

      await clickNext(page); // Step2 → Step3
      await clickNext(page); // Step3 → Step4
      await clickNext(page); // Step4 → Step5
      await calcAndWait(page);

      // 결정세액 969,711 (사례5 — §9⑦ 안분 528,933 공제 후)
      await expect(
        page.getByText(/969,711/).first(),
      ).toBeVisible({ timeout: 30_000 });
    },
  );

  test(
    "CPT-S8-E2E-3: 수도권 주택 → §8④4호 지방저가 옵션 disabled (사전 차단)",
    async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(PAGE);

      await clickNext(page); // Step1 → Step2 (기본 2024·개인)

      // 주택1 기본 location=수도권. §8④ ToggleCard ON (단일 주택의 마지막 switch — 분리 토글 추가에 견고)
      await page.getByRole("switch").last().click();

      // 지방 저가주택 라디오가 disabled (수도권이므로)
      await expect(
        page.getByRole("radio", { name: /지방 저가주택/ }),
      ).toBeDisabled({ timeout: 10_000 });
      // 사유 힌트 표시
      await expect(
        page.getByText(/수도권.*설정되어 선택할 수 없습니다/),
      ).toBeVisible({ timeout: 5_000 });
    },
  );
});
