/**
 * E2E: 분납 (상속세·증여세, 상증법 §70② · 시행령 §66②)
 *
 * 검증:
 *   SPLIT-1 (상속) 분납 토글 ON → 결과 분납 일정 카드(1차·2차·분납기한)
 *   SPLIT-2 (상속) 연부연납 ON → 분납 토글 disabled (배타, §70② 단서)
 *   SPLIT-3 (상속) 분납 OFF + 결정세액 1천만 초과 → 분납 안내 카드(최대 분납액)
 *   SPLIT-4 (상속) 결정세액 1천만 이하 → 분납 카드 비표시
 *   SPLIT-5 (증여) 분납 토글 ON → 분납 일정 카드 + 별지10호 "현금 분납" 연동
 *
 * 시나리오(상속): 자녀 1명 — 토지 30억(10,000,000원/㎡ × 300㎡)
 *   → 일괄공제 5억 → 결정세액 >2천만 (분납·연부연납 적격)
 * 시나리오(증여): 직계존속(성인) — 토지 3억(1,000,000원/㎡ × 300㎡)
 *   → 증여공제 5천만 → 결정세액 >1천만 (분납 적격)
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · worktree E2E_PORT=3100
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addLandAsset,
  nextSteps,
  calcAndWaitResult,
  addHeir,
} from "./_helpers/tax-flow";

// ── 상속 ─────────────────────────────────────────────────────────
async function inhStep0(page: Page, opts: { nonResident?: boolean } = {}) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  if (opts.nonResident) {
    await page.getByRole("button", { name: /비거주자/ }).click();
  }
  await addHeir(page, "heir", "child");
  await page.getByPlaceholder("앞 6자리-뒤 7자리").last().fill("700101-1000000");
  await nextSteps(page, 1); // → Step1
}

async function inhAddLand(page: Page, unitPrice: string) {
  await addLandAsset(page, { area: "300", unitPrice });
}

async function inhGotoStep4(page: Page) {
  await nextSteps(page, 3); // Step1 → Step2 → Step3 → Step4
}

// ── 증여 ─────────────────────────────────────────────────────────
async function giftStep0(page: Page) {
  await page.goto("/calc/gift-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await nextSteps(page, 1); // → Step1
}

async function giftAddLand(page: Page) {
  await addLandAsset(page, {
    area: "300",
    unitPrice: "1000000",
    addButtonName: /증여재산 추가/,
  });
  await page.getByPlaceholder(/본가 토지/).fill("본가 토지");
}

test.describe("분납 §70② (상속·증여)", () => {
  test("SPLIT-1 (상속) 분납 ON → 결과 분납 일정 카드(1차·2차)", async ({ page }) => {
    test.setTimeout(90_000);
    await inhStep0(page);
    await inhAddLand(page, "10000000"); // 30억
    await inhGotoStep4(page);

    // 분납 토글 노출 + ON
    const toggle = page.getByText("분납 신청 (상증법 §70②)");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByText("분납 희망액")).toBeVisible();

    await calcAndWaitResult(page);

    // 분납 일정 카드 — 1차/2차
    const card = page.getByTestId("split-payment-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("분납 일정 (상증법 §70②)")).toBeVisible();
    await expect(page.getByTestId("split-payment-first")).toBeVisible();
    await expect(page.getByTestId("split-payment-second")).toBeVisible();
  });

  test("SPLIT-2 (상속) 연부연납 ON → 분납 토글 disabled (배타)", async ({ page }) => {
    test.setTimeout(90_000);
    await inhStep0(page);
    await inhAddLand(page, "10000000");
    await inhGotoStep4(page);

    // 연부연납 ON → 분납 배타 안내 노출
    await page.getByText("연부연납 신청 (상증법 §71)").click();
    await expect(
      page.getByText(/연부연납\(§71\) 신청 중에는 분납을 신청할 수 없습니다/),
    ).toBeVisible();
  });

  test("SPLIT-3 (상속) 분납 OFF + 1천만 초과 → 안내 카드(최대 분납액)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await inhStep0(page);
    await inhAddLand(page, "10000000");
    await inhGotoStep4(page);

    // 분납 OFF 그대로 계산
    await calcAndWaitResult(page);

    const card = page.getByTestId("split-payment-card");
    await expect(card).toBeVisible();
    await expect(card.getByText("분납 안내 (상증법 §70②)")).toBeVisible();
    await expect(page.getByTestId("split-payment-max")).toBeVisible();
    // 미신청이므로 1차/2차 일정은 없음
    await expect(page.getByTestId("split-payment-first")).toHaveCount(0);
  });

  test("SPLIT-4 (상속) 결정세액 1천만 이하 → 분납 카드 비표시", async ({ page }) => {
    test.setTimeout(90_000);
    await inhStep0(page);
    await inhAddLand(page, "1000000"); // 3억 → 일괄공제 5억 → 과세표준 0 → 결정세액 0
    await inhGotoStep4(page);

    await calcAndWaitResult(page);

    await expect(page.getByTestId("split-payment-card")).toHaveCount(0);
  });

  test("SPLIT-5 (증여) 분납 ON → 분납 일정 카드 + 별지10호 현금 분납", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await giftStep0(page);
    await giftAddLand(page); // 3억 → 증여공제 5천만 → 결정세액 >1천만
    await nextSteps(page, 2); // Step1→2→3

    // Step3 끝 분납 토글 ON
    const toggle = page.getByText("분납 신청 (상증법 §70②)");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.getByText("분납 희망액")).toBeVisible();

    await calcAndWaitResult(page, { taxType: "gift" });

    // 분납 일정 카드
    const card = page.getByTestId("split-payment-card");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("split-payment-first")).toBeVisible();
    await expect(page.getByTestId("split-payment-second")).toBeVisible();

    // 별지10호 ㊼ "현금 분납" 행 노출 (엔진 cashDeferred echo)
    await expect(page.getByText("현금 분납").first()).toBeVisible();
  });
});
