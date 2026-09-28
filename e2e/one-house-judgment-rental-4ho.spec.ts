/**
 * 판정 메뉴 — OH-38 삭제 전 §154①4호(임대사업자 등록) 경과조치 입력 → 판정 (브라우저 경로)
 *
 * 엔진·route 주장은 anchor가 고정한다(`one-house-rental-registration-4ho.anchor.test.ts` ·
 * `transfer.route.rental-4ho-oh38.anchor.test.ts`). 여기서만 관측되는 것은 **화면 입력이 실제로
 * 판정 본문에 실려 결론을 바꾸는가**다 — 3-state 라디오·날짜 칸·노출 범위가 DOM에서 연결돼야 한다.
 *
 * 시나리오: 리뷰 OH-38 — 서울(조정) 1주택 2018-03-01 취득 · 거주 0 · 2026-07-01 양도 · 9억.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seedOneHouse(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2026-07-01",
    contractTotalPrice: "900000000",
    wasRegulatedAtAcquisition: true,
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2018-03-01",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "0",
      },
    ],
    houses: [],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as Record<string, unknown>;
}

test.describe("판정 메뉴 — 삭제 전 §154①4호 임대사업자 등록", () => {
  test("[R4-1] 사유를 고르지 않으면 과세 + 판정 보류 고지", async ({ page }) => {
    await seedOneHouse(page);
    await judge(page);
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
    await expect(page.getByText(/입력하지 않아 이 경과조치는 판정하지 않았습니다/).first()).toBeVisible();
  });

  test("[R4-2] ★ 2018-06-01 두 등록 신청 · 등록 유지 · 임대의무기간 후 · 5% 이내 → 비과세", async ({ page }) => {
    await seedOneHouse(page);
    await page.getByTestId("proviso-reason-rental_4ho").click();
    await fillDateAndVerify(page, { year: "2018", month: "06", day: "01" }, {
      scope: page.getByTestId("proviso-4ho-business-date"),
    });
    await fillDateAndVerify(page, { year: "2018", month: "06", day: "01" }, {
      scope: page.getByTestId("proviso-4ho-rental-date"),
    });
    await page.getByTestId("proviso-4ho-regulated-one-house-yes").click();
    await page.getByTestId("proviso-4ho-status-maintained").click();
    await page.getByTestId("proviso-4ho-during-mandatory-no").click();
    await page.getByTestId("proviso-4ho-rent-over5-no").click();

    const body = await judge(page);
    const proviso = body.oneHouseExemptionProviso as { reason: string; rentalRegistration4ho: Record<string, unknown> };
    expect(proviso.reason).toBe("rental_registration_4ho");
    expect(proviso.rentalRegistration4ho).toMatchObject({
      businessRegistrationApplicationDate: "2018-06-01",
      rentalRegistrationApplicationDate: "2018-06-01",
      regulatedOneHouseAtApplication: true,
      statusAtTransfer: "maintained",
      transferredDuringMandatoryPeriod: false,
      rentIncreaseOver5Percent: false,
    });
    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByText(/4호 임대사업자 등록/).first()).toBeVisible();
  });

  test("[R4-3] 필수 칸을 비우면 판정으로 넘어가지 않는다(⑧)", async ({ page }) => {
    await seedOneHouse(page);
    await page.getByTestId("proviso-reason-rental_4ho").click();
    await page.getByTestId("one-house-judge-cta").click();
    await expect(page.getByText(/사업자등록 신청일을 입력하세요/).first()).toBeVisible();
    await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);
  });
});
