/**
 * 판정 메뉴 — 결정 #38-7 증여 전 동일세대 거주기간(개월) 입력 → 비과세 거주요건 통산 (브라우저 경로)
 *
 * 엔진·route 주장은 anchor가 고정한다(`__tests__/calc/gift-prior-residence-38-7.anchor.test.ts`). 여기서만 관측되는 것은
 * **화면 칸이 「예」일 때만 열리고, 입력이 판정 본문에 실려 결론을 바꾸며, 입력이 없으면 확인 필요가 나오는가**다.
 *
 * 시나리오: 증여자(직계존비속) 2018-01-01 취득 → 2019-03-01 세대 보유 시작 → 2022-06-01 증여 → 계속 같은 세대 · 조정대상지역 취득 →
 * 2025-02-16 · 9억 양도, 증여 후 거주 0개월. 세대 보유 시작일~증여일 = 39개월이 증여 전 거주의 상한이다.
 *
 * 실행: E2E_PORT=3231 npx playwright test e2e/one-house-judgment-gift-prior-residence-38-7.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const FIELD = "one-house-gift-prior-residence";

async function seedGift(page: Page, assetOver: Record<string, unknown> = {}) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    (s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          transferDate: "2025-02-16",
          isOneHousehold: true,
          contractTotalPrice: "900000000",
          wasRegulatedAtAcquisition: true,
          assets: [
            {
              assetKind: "housing",
              acquisitionCause: "gift",
              acquisitionDate: "2022-06-01",
              donorAcquisitionDate: "2018-01-01",
              giftDonorRelation: "lineal",
              giftSameHousehold: "yes",
              giftHouseholdHoldingStartDate: "2019-03-01",
              residenceInputMode: "direct",
              residencePeriodMonthsAsset: "0",
              ...assetOver,
            },
          ],
          houses: [],
        },
      },
      version: 0,
    },
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click(); // ① → ②
  await expect(page.getByText("② 양도 대상 주택")).toBeVisible();
}

async function judge(page: Page) {
  await page.getByRole("button", { name: "다음" }).click(); // ② → ③
  await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as Record<string, unknown>;
}

test.describe("판정 메뉴 — 증여 전 동일세대 거주기간 (#38-7)", () => {
  test("[PR-E1] 칸은 「예」일 때만 열린다 — 「아니오」로 바꾸면 사라지고 입력값도 비운다", async ({ page }) => {
    await seedGift(page, { giftPriorHouseholdResidenceMonths: "12" });
    const input = page.getByTestId(FIELD).getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("12");
    await page.getByRole("radio", { name: /^아니오 — 세대가 달랐거나/ }).check();
    await expect(page.getByTestId(FIELD)).toHaveCount(0);
    await page.getByRole("radio", { name: /^예 — 계속 같은 세대/ }).check();
    // 「아니오」로 바꿀 때 비워졌으므로 다시 「예」를 골라도 빈 칸이다(남은 값이 되살아나지 않는다)
    await expect(page.getByTestId(FIELD).getByRole("textbox")).toHaveValue("");
  });

  test("[PR-E2] 입력 없음 → 통산 없이 과세 + 확인 필요 고지(본문에 키 없음) · 24개월 입력 → 본문에 실리고 비과세 + 통산 고지", async ({ page }) => {
    await seedGift(page);
    const blank = await judge(page);
    expect(blank).not.toHaveProperty("giftPriorHouseholdResidenceMonths");
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
    await expect(page.getByText(/증여 전 동일세대로 이 주택에 거주한 기간\(개월\)이 입력되지 않아/).first()).toBeVisible();

    // 같은 사실을 다시 열어 ② 화면에서 24개월을 입력한다(결과 화면 뒤 되돌아가기 경로와 무관하게 입력 경로만 본다)
    await seedGift(page);
    await page.getByTestId(FIELD).getByRole("textbox").fill("24");
    const body = await judge(page);
    expect(body.giftPriorHouseholdResidenceMonths).toBe(24);
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByText(/증여 전 동일세대 거주기간 24개월을/).first()).toBeVisible();
    await expect(page.getByText(/정면으로 다룬 해석은 확인하지 못했습니다/).first()).toBeVisible();
  });

  test("[PR-E3] 상한(39개월)을 넘으면 ② 화면에서 막힌다", async ({ page }) => {
    await seedGift(page, { giftPriorHouseholdResidenceMonths: "40" });
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText(/세대 보유 시작일부터 증여일까지\(39개월\)를 넘을 수 없습니다/).first()).toBeVisible();
    await expect(page.getByText("③ 보유 주택·권리")).toHaveCount(0);
  });
});
