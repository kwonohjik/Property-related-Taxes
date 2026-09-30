/**
 * PEN-C — 「가산세 계산하기」가 완납(기납부 ≥ 결정세액)을 **직접 입력 0**으로 싣는다 (request body 확인).
 *
 * 종전: `unpaidTax: 0`만 실려 route가 「결정세액 전액 미납」으로 바꿨다 ⇒ 완납인데 납부지연가산세.
 * 산식 정확성은 vitest(`__tests__/api/transfer.route.unpaid-tax-mode-penc.anchor.test.ts`)가 덮는다.
 *
 * worktree 실행: E2E_PORT=3245 npx playwright test e2e/transfer-unpaid-tax-mode-penc.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { setupAddress } from "./_helpers/fill-address";

function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input").first();
}

/** 나대지 10억(취득 3억) — 가산세 단계까지 이동 (transfer-amendment.spec.ts와 같은 입력) */
async function toPenaltyStep(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2023");
  await page.getByTestId("transfer-date").getByLabel("월").fill("05");
  await page.getByTestId("transfer-date").getByLabel("일").fill("01");

  await expandAssetSection(page, 1);
  await setupAddress(page);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("300");
  await inputByLabel(page, "양도가액 (원)").fill("1000000000");

  await page.getByRole("radio", { name: "매매", exact: true }).click();
  await page.getByRole("radio", { name: "실거래가 계약서상 실거래가" }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2010");
  await page.getByLabel("월", { exact: true }).nth(2).fill("03");
  await page.getByLabel("일", { exact: true }).nth(2).fill("27");
  await inputByLabel(page, "취득가액 (원)").fill("300000000");

  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await page.getByRole("button", { name: "다음" }).click();
}

test("PEN-C 완납 → request body가 unpaidTax 0 + manual · 납부지연가산세 0", async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  page.on("request", (req) => {
    if (req.url().endsWith("/api/calc/transfer") && req.method() === "POST") {
      bodies.push(JSON.parse(req.postData() ?? "{}"));
    }
  });

  await toPenaltyStep(page);

  await page
    .locator('[data-slot="toggle-card"]')
    .filter({ hasText: "신고불성실·지연납부 가산세를 함께 계산합니다" })
    .getByRole("switch")
    .setChecked(true);

  // 모드 부재 + 기본값 0 → 「자동」 (입력 칸 숨김)
  await expect(page.getByRole("radio", { name: /자동/ })).toBeChecked();
  await expect(page.getByText("미납·미달납부세액", { exact: true })).toHaveCount(0);

  await inputByLabel(page, "기납부세액").fill("999999999");
  const deadline = page.getByText("법정납부기한", { exact: true }).locator("xpath=ancestor::div[.//input][1]");
  await deadline.getByLabel("연도").fill("2023");
  await deadline.getByLabel("월").fill("07");
  await deadline.getByLabel("일").fill("31");
  const paid = page.getByText("실제 납부일", { exact: true }).locator("xpath=ancestor::div[.//input][1]");
  await paid.getByLabel("연도").fill("2024");
  await paid.getByLabel("월").fill("01");
  await paid.getByLabel("일").fill("31");

  await page.getByRole("button", { name: "가산세 계산하기" }).click();
  await expect(page.getByText("가산세 계산 결과")).toBeVisible();

  // 2-pass: ① 가산세 없이(enablePenalty false) ② 산출 미납세액으로 재계산
  const last = bodies[bodies.length - 1];
  expect(last.delayedPaymentDetails).toMatchObject({ unpaidTax: 0, unpaidTaxMode: "manual" });

  // 저장된 폼도 「직접 입력」 — 다시 계산해도 완납(0)으로 간다
  await expect(page.getByRole("radio", { name: /직접 입력/ })).toBeChecked();
  // 결과 카드 행 — 부분 문자열 단언 금지(`"0"`은 어떤 금액에도 들어 있다) · 행 전체를 정확히 본다
  const result = page.getByText("가산세 계산 결과").locator("xpath=..");
  await expect(result.locator("div.flex", { hasText: "미납세액" }).first()).toHaveText(/^\s*미납세액\s*0\s*$/);
  await expect(result.locator("div.flex", { hasText: "지연납부가산세" }).first()).toHaveText(/^\s*지연납부가산세\s*0\s*$/);
});
