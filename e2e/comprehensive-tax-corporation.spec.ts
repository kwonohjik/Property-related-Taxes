import { test, expect, type Page } from "@playwright/test";
import { openHouseModal, closeHouseModal } from "./_helpers/tax-flow";

/**
 * 종합부동산세 법인 §9② E2E (Phase B → §4의4 자동판정 전환 후)
 *
 * 마법사 4단계: Step1(과세연도·납세의무자) → Step2(주택·세부담상한 모드) → Step3(합산배제) → Step4(토지·계산)
 *
 * - CPT-CORP-E2E-1: 법인 선택 → 1세대1주택 ToggleCard 숨김 + 법인 세부유형 Select 노출
 * - CPT-CORP-E2E-2: 2024 + 법인(기본 general_corp → §9②3호) + 공시 20억 1채 → 32,400,000 + 단일세율 배지 + 기본공제 적용 없음
 *
 * worktree: E2E_PORT=3102 npx playwright test e2e/comprehensive-tax-corporation.spec.ts
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

test.describe("종합부동산세 법인 §9②", () => {
  test(
    "CPT-CORP-E2E-1: 법인 선택 → 1세대1주택 ToggleCard 숨김 + 법인 세부유형 Select 노출",
    async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(PAGE);

      // 기본값은 개인 — 1세대1주택 토글이 보여야 함
      await expect(page.getByText(/1세대 1주택자/)).toBeVisible({ timeout: 10_000 });

      // [법인] 라디오 선택
      await page.getByRole("radio", { name: "법인" }).check();

      // 1세대1주택 ToggleCard 숨김 확인
      await expect(page.getByText(/1세대 1주택자/)).toHaveCount(0);

      // 법인 세부유형 Select(native) 노출 확인 — 9종 옵션
      await expect(
        page.locator('select:has(option[value="general_corp"])'),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator('select:has(option[value="public_interest_corp"])'),
      ).toBeVisible();
      await expect(
        page.locator('select:has(option[value="public_housing_operator"])'),
      ).toBeVisible();
    },
  );

  test(
    "CPT-CORP-E2E-2: 2024 + 법인(기본 general_corp → §9②3호) + 공시 20억 → 32,400,000 + 배지 + 적용 없음",
    async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto(PAGE);

      // Step1: 2024 선택
      await page.getByRole("radio", { name: "2024" }).check();

      // 납세의무자 유형 → 법인 (세부유형 기본 general_corp)
      await page.getByRole("radio", { name: "법인" }).check();

      // 기본 general_corp → 도출 §9②3호 배지 노출 확인
      await expect(
        page.getByText(/§9②3호 법인 주택분 특례/),
      ).toBeVisible({ timeout: 5_000 });

      await clickNext(page); // Step1 → Step2 (주택·세부담상한 모드)

      // Step2: corporate_special → 세부담상한 모드(직전공시) 섹션 숨김 + 상한 미적용 안내 표시
      //   (세부담상한 5단계 제거 후 직전공시 입력은 2단계로 통합 — 법인 §9②3호는 미노출)
      await expect(page.getByText(/세부담 상한 미적용/)).toBeVisible({ timeout: 5_000 });
      await expect(page.getByTestId("cap-mode-auto")).toHaveCount(0);
      await expect(page.getByLabel("직전연도 공시가격")).toHaveCount(0);

      // Step2: 공시가격 20억 주택 1채 (주택 입력은 모달 안)
      await openHouseModal(page, 0);
      await page.getByPlaceholder("금액 입력").first().fill("2000000000");
      await page.getByPlaceholder("0.00").first().fill("84");
      await closeHouseModal(page);

      await clickNext(page); // Step2 → Step3
      await clickNext(page); // Step3 → Step4(토지·계산)
      await calcAndWait(page);

      // 결과: 산출세액 32,400,000 (과표 20억 × 60% = 12억 × 2.7%)
      await expect(
        page.getByText(/32,400,000/).first(),
      ).toBeVisible({ timeout: 30_000 });

      // "§9② 법인 단일세율" 배지 표시 (배지 span + 인용 링크 "… ↗" 2곳 → .first()=배지 span)
      await expect(page.getByText(/§9② 법인 단일세율/).first()).toBeVisible({ timeout: 10_000 });

      // 기본공제 "적용 없음" 라벨 + §8①2호 근거 배지
      // (label·§8①2호 배지 span·§8①2호 인용 링크·valueLabel "적용 없음" 모두 별도 노드 → 분리 단언, 배지는 .first())
      await expect(page.getByText("적용 없음").first()).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("§8①2호").first()).toBeVisible();
    },
  );
});
