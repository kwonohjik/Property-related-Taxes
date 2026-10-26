/**
 * §155 의제 2주택 이상(합가 ④⑤ · ⑥ · ⑦ · ⑧) × §154① 단서 — 브라우저 경로 (V-F4 · Q-M1 (a)·Q-M2 (a), 2026-10-26)
 *
 * 계획서 `docs/00-pm/deemed-two-house-proviso.plan.md`. 엔진·④·⑧ 주장은 anchor가 고정한다
 * (`__tests__/calc/deemed-two-house-proviso.anchor.test.tsx`). 여기서만 보이는 것: 합가 세대에서 단서 카드가 실제로 보이고
 * (계산기 「보유 상황」 · 판정 메뉴 ③), 옵션이 1·2가·3·5호로 좁혀지고, 고른 값이 본문에 실려 결론이 바뀌는가 · 의제 선언이 없으면 카드가 없는가.
 *
 * 시료: 서울 강남(2017-08-03~ 조정대상지역) 2017-10-01 취득 · 거주 0 · 양도 10억 · 2024-06-01 양도 ·
 *   혼인 2023-03-01 · 배우자 쪽 주택 1채(경남 비조정 · 기준시가 4억 · 2015-01-01 취득).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "./_helpers/transfer-seed";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const GANGNAM = "1168010100";
const NON_REGULATED = "4682025021";
const MARRIAGE = { marriageDate: "2023-03-01", isFirstTransferredInMerge: true };
const SPOUSE_HOUSE = { regionCode: NON_REGULATED, officialPrice: "400000000", mergeOrigin: "counterpart_side" };
const HIDDEN_REASONS = ["proviso-reason-overseas_migration", "proviso-reason-overseas_residence", "proviso-reason-rental_4ho"];

async function seedCalc(page: Page, merge: boolean) {
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("sp", "2015-01-01", merge ? SPOUSE_HOUSE : { regionCode: NON_REGULATED, officialPrice: "400000000" })],
    assetOver: {
      acquisitionDate: "2017-10-01",
      regionCode: GANGNAM,
      addressJibun: "서울특별시 강남구 테스트동 1",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "500000000",
      residencePeriodMonthsAsset: "0",
    },
    formOver: { transferDate: "2024-06-01", contractTotalPrice: "1000000000", ...(merge ? MARRIAGE : {}) },
  });
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

test("[DPE-1] ★ 계산기 — 혼인 합가 2주택에 단서 카드가 보이고, 5호 + 무주택 확인 → 비과세 · 근거에 5호", async ({ page }) => {
  await seedCalc(page, true);
  await expect(page.getByTestId("proviso-reason-pre_contract")).toBeVisible();
  for (const id of HIDDEN_REASONS) await expect(page.getByTestId(id)).toHaveCount(0);
  await expect(page.getByText(/합가·문화유산·농어촌·수도권 밖 부득이 주택 특례로 1세대1주택으로 보는 주택은/)).toBeVisible();
  await page.getByTestId("proviso-reason-pre_contract").click();
  await page.locator('[data-field="provisoPreContractNoHouse"]').getByText("계약금 지급일 현재 1세대 무주택", { exact: true }).click();
  const { request, body } = await calculate(page);
  expect(request.oneHouseExemptionProviso).toEqual({ reason: "pre_designation_contract", preContractNoHouse: true });
  expect(body.data.result.isExempt).toBe(true);
  expect(body.data.result.totalTax).toBe(0);
  expect(body.data.result.exemptReason).toBe("혼인 합가 (§155⑤) 1세대1주택 비과세 (§154① 단서 5호 공고전계약)");
  await expect(page.getByText(/§154① 단서 5호/).first()).toBeVisible();
});

test("[DPE-2] 계산기 — 의제 선언 없는 순수 2주택은 단서 카드가 없다(현행 유지)", async ({ page }) => {
  await seedCalc(page, false);
  await expect(page.getByRole("heading", { name: /보유 상황/ }).first()).toBeVisible();
  await expect(page.getByTestId("proviso-reason-none")).toHaveCount(0);
});

test("[DPE-3] ★ 판정 메뉴 — 혼인 합가 2주택에 단서 카드가 보이고, 5호 → 비과세", async ({ page }) => {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2024-06-01",
    contractTotalPrice: "1000000000",
    ...MARRIAGE,
    assets: [
      {
        assetKind: "housing",
        acquisitionDate: "2017-10-01",
        regionCode: GANGNAM,
        addressJibun: "서울특별시 강남구 테스트동 1",
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "0",
      },
    ],
    houses: [
      {
        id: "sp",
        region: "non_capital",
        acquisitionOrigin: "general",
        acquisitionDate: "2015-01-01",
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        ...SPOUSE_HOUSE,
      },
    ],
  });
  const group = page.getByTestId("sale-house-specials");
  await expect(group.getByTestId("proviso-reason-pre_contract")).toBeVisible();
  for (const id of HIDDEN_REASONS) await expect(group.getByTestId(id)).toHaveCount(0);
  await group.getByTestId("proviso-reason-pre_contract").click();
  await group.locator('[data-field="provisoPreContractNoHouse"]').getByText("계약금 지급일 현재 1세대 무주택", { exact: true }).click();
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  expect((res.request().postDataJSON() as Record<string, unknown>).oneHouseExemptionProviso).toEqual({
    reason: "pre_designation_contract",
    preContractNoHouse: true,
  });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByText(/§154① 단서 5호/).first()).toBeVisible();
});
