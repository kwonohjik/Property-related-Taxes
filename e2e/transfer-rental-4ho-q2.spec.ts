/**
 * 양도세 계산기 「보유 상황」 — 삭제 전 §154①4호 × Q-2 재결정(2026-11-14 · #3354) 브라우저 경로
 *
 * 판정 메뉴 경로는 `one-house-judgment-rental-4ho.spec.ts` [R4-4]가 고정한다. 같은 `Rental4hoProvisoFields`를
 * 계산기 Step4(`app/calc/transfer-tax/steps/Step4.tsx` → `ExemptionProvisoSection`)에서도 그리므로, 여기서는
 * 「2019.12.17. 이후 포괄승계 + 신청자와 다른 세대」 토글이 계산 본문에 실려 비과세 → 과세로 바뀌는지만 본다.
 * 엔진 주장은 anchor `one-house-rental-registration-4ho.anchor.test.ts`가 고정한다.
 *
 * 시료: 서울 강남(2017-08-03~ 조정대상지역) 2017-10-01 취득 · 거주 0 · 2024-06-01 양도 · 10억 · 1주택 ·
 *   4호 두 등록 신청 2018-06-01 · 조정 1주택 · 자동말소.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";

const GANGNAM = "1168010100";
const TOGGLE_TITLE = "2019년 12월 17일 이후 임대사업자 지위를 넘겨받았고, 양도일 현재 등록 신청자와 세대가 다릅니다";

async function seedAndFill4ho(page: Page) {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: {
      acquisitionDate: "2017-10-01",
      regionCode: GANGNAM,
      addressJibun: "서울특별시 강남구 테스트동 1",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "500000000",
      residencePeriodMonthsAsset: "0",
    },
    formOver: { transferDate: "2024-06-01", contractTotalPrice: "1000000000" },
  });
  await page.getByTestId("proviso-reason-rental_4ho").click();
  await fillDateAndVerify(page, { year: "2018", month: "06", day: "01" }, { scope: page.getByTestId("proviso-4ho-business-date") });
  await fillDateAndVerify(page, { year: "2018", month: "06", day: "01" }, { scope: page.getByTestId("proviso-4ho-rental-date") });
  await page.getByTestId("proviso-4ho-regulated-one-house-yes").click();
  await page.getByTestId("proviso-4ho-status-auto_cancelled").click();
}

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return {
    request: resp.request().postDataJSON() as Record<string, unknown>,
    body: (await resp.json()) as { data: { result: { isExempt: boolean; totalTax: number; exemptReason?: string } } },
  };
}

test("[R4C-1] 계산기 — 토글을 켜지 않으면 4호 적용 · 비과세(대조군)", async ({ page }) => {
  await seedAndFill4ho(page);
  await expect(page.getByText(TOGGLE_TITLE)).toBeVisible();
  const { request, body } = await calculate(page);
  const proviso = request.oneHouseExemptionProviso as { reason: string; rentalRegistration4ho: Record<string, unknown> };
  expect(proviso.reason).toBe("rental_registration_4ho");
  expect(proviso.rentalRegistration4ho.giftSuccessionSeparatedHousehold).not.toBe(true);
  expect(body.data.result.isExempt).toBe(true);
  expect(body.data.result.totalTax).toBe(0);
});

test("[R4C-2] ★ 계산기 — 2019.12.17. 이후 포괄승계 + 다른 세대 토글 → 과세 · 사유에 확인 필요", async ({ page }) => {
  await seedAndFill4ho(page);
  await expect(page.getByText(/2019년 12월 17일 이후 넘겨받았다면 아래 「임대사업자 지위를 넘겨받았고」 칸도 확인하세요/).first()).toBeVisible();
  await expect(page.getByText(/매매는 해석례가 없어 확인 필요\). 이혼 재산분할로 받은 지분은 적용되므로/).first()).toBeVisible();
  await page.getByText(TOGGLE_TITLE).click();
  const { request, body } = await calculate(page);
  const proviso = request.oneHouseExemptionProviso as { rentalRegistration4ho: Record<string, unknown> };
  expect(proviso.rentalRegistration4ho).toMatchObject({
    statusAtTransfer: "auto_cancelled",
    giftSuccessionSeparatedHousehold: true,
  });
  expect(body.data.result.isExempt).toBe(false);
  expect(body.data.result.totalTax).toBeGreaterThan(0);
  await expect(
    page.getByText(/매매로 넘겨받은 경우를 직접 다룬 해석례는 확인하지 못했습니다 — 확인 필요/).first(),
  ).toBeVisible();
  await page.screenshot({ path: process.env.R4C_SHOT ?? "test-results/r4c-2-result.png", fullPage: true });
});
