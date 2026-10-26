/**
 * 판정 메뉴 — 일시적 2주택 종전주택 × §154① 단서 5호(조정대상지역 공고 전 계약) (F-2 · 2026-10-26)
 *
 * 계획서 `docs/00-pm/temp-two-house-proviso-5.plan.md`. 엔진·④ 주장은 anchor가 고정한다
 * (`__tests__/calc/temp-two-house-proviso-5.anchor.test.tsx`). 여기서만 보이는 것: 일시적 2주택 맥락의 단서 카드에
 * 5호 옵션이 실제로 보이고, 고른 값이 판정 본문에 실려 결론이 바뀌는가 · 무주택 확인을 비우면 ⑧이 막는가.
 *
 * 시료: 대전 유성(2020-06-19~2022-09-25 조정대상지역) 2020-08-01 취득 · 거주 0 · 다른 주택(경남 비조정) 2021-09-01 · 양도 2023-06-01.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seed(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2023-06-01",
    contractTotalPrice: "1000000000",
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2020-08-01",
        regionCode: "3020000000",
        addressJibun: "대전광역시 유성구 테스트동 1",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "0",
      },
    ],
    houses: [
      {
        id: "h1",
        region: "non_capital",
        regionCode: "4682025021",
        acquisitionOrigin: "general",
        acquisitionDate: "2021-09-01",
        officialPrice: "100000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
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

test("[P5E-1] 단서를 고르지 않으면 과세(거주요건)", async ({ page }) => {
  await seed(page);
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});

test("[P5E-2] ★ 5호 + 무주택 확인 → 비과세 · 본문에 5호", async ({ page }) => {
  await seed(page);
  const group = page.getByTestId("sale-house-specials");
  await expect(group.getByTestId("proviso-reason-pre_contract")).toBeVisible();
  for (const id of ["proviso-reason-overseas_migration", "proviso-reason-overseas_residence", "proviso-reason-rental_4ho"]) {
    await expect(group.getByTestId(id)).toHaveCount(0);
  }
  await group.getByTestId("proviso-reason-pre_contract").click();
  await group.locator("[data-field=\"provisoPreContractNoHouse\"]").getByText("계약금 지급일 현재 1세대 무주택", { exact: true }).click();
  const body = await judge(page);
  expect(body.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByText(/§154① 단서 5호/).first()).toBeVisible();
});

test("[P5E-3] 5호를 골랐는데 무주택 확인을 비우면 판정으로 넘어가지 않는다(⑧)", async ({ page }) => {
  await seed(page);
  await page.getByTestId("sale-house-specials").getByTestId("proviso-reason-pre_contract").click();
  await page.getByTestId("one-house-judge-cta").click();
  await expect(page.getByText(/계약금 지급일 현재 무주택 여부를 확인하세요/).first()).toBeVisible();
  await expect(page.getByTestId("one-house-judgment-result")).toHaveCount(0);
});
