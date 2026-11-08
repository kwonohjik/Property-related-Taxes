/**
 * E2E: NH-14 — 첫 자산이 토지(독립 나대지)이고 함께 양도하는 주택이 있으면 「보유 상황」의 «① 세대·주택 현황»이 열리고,
 *      칸의 필수 답(다른 보유 주택 없음 · 분양권·입주권 없음)이 비면 계산 전에 막힌다. 답하면 계산 요청이 나가고,
 *      함께 양도 주택이 없으면(토지 + 토지) 칸이 열리지 않는다.
 *
 * ⚠️ 세액 수치의 정본은 vitest anchor(`nh14-household-facts-companion.anchor.test.ts`)다 — 여기는 화면 입력 경로(보유 상황 칸 → ⑧ → 계산 요청)의 배선 확인이다.
 * 셀렉터는 data-testid·role만 쓴다(안내 문구 하나는 ⑧ 오류 문구 그대로 — 주택 먼저와 같은 문구인지가 단언 대상이다).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";

const HOUSE = {
  assetId: "h1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "400000000", actualSalePrice: "800000000", addressJibun: "제주특별자치도 테스트동 1",
  residencePeriodMonthsAsset: "120", areaScenario: "same", acquisitionArea: "0", transferArea: "0", standardPriceAtTransfer: "600000000",
};
const LAND = {
  assetId: "l1", assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "150000000", actualSalePrice: "300000000", addressJibun: "제주특별자치도 테스트동 l1",
  areaScenario: "same", acquisitionArea: "300", transferArea: "300", standardPriceAtTransfer: "200000000",
};

/** 보유 상황 확인 토글이 꺼진 시료 — 사용자가 세대 현황을 아직 답하지 않은 상태. */
function seedForm(assets: Record<string, unknown>[]) {
  return {
    state: {
      formData: {
        assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...DIRECT_RESIDENCE, ...a })),
        transferDate: "2026-02-16",
        contractTotalPrice: "1100000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        householdNoOtherHousesConfirmed: false,
        householdNoPresaleRightsConfirmed: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        residencePeriodMonths: "120",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function open(page: Page, assets: Record<string, unknown>[]) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedForm(assets));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

const HOUSE_COUNT = "household-house-count-derived";
const COMPANION_NOTICE = "household-facts-companion-notice";
const NO_OTHER = "다른 보유 주택이 없는지 확인하세요.";

test.describe("NH-14 — 함께 양도 주택의 세대·주택 현황", () => {
  test("독립 나대지 먼저 + 주택: 칸이 열리고 미답이면 계산 전에 막힌다 → 답하면 계산 요청이 나간다", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [LAND, HOUSE]);

    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId(HOUSE_COUNT)).toBeVisible();
    await expect(page.getByTestId(COMPANION_NOTICE)).toBeVisible();
    // 취득 당시 조정대상지역·거주기간(② 비과세 판정)도 함께 양도 주택 기준으로 열린다(NH-14 후속 2 — 종전: 첫 자산 기준이라 숨김)
    await expect(page.getByTestId("transfer-was-regulated")).toBeVisible();
    // ② 칸이 대상 주택(자산 2)을 밝힌다 — 첫 자산(토지)의 거주기간으로 오해하지 않게
    await expect(page.getByTestId("exemption-companion-notice")).toContainText("「자산 2」(제주특별자치도 테스트동 1) 기준입니다");
    await page.screenshot({ path: "e2e/_artifacts/nh14-household-facts-step4.png", fullPage: true });

    // 미답 → 계산 전에 ⑧이 막는다(주택 먼저와 같은 문구)
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(NO_OTHER).first()).toBeVisible();

    // 답한다 — 다른 보유 주택 없음 + 분양권·입주권 없음
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("switch", { name: /^다른 보유 주택이 없습니다/ }).click();
    await page.getByRole("switch", { name: /^보유한 분양권·조합원입주권이 없습니다/ }).click();

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    const body = (await reqP).postDataJSON() as Record<string, unknown>;
    expect(body.householdHousingCount).toBe(1);
  });

  test("짝: 토지 + 토지(함께 양도 주택 없음)는 칸이 열리지 않는다", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, [LAND, { ...LAND, assetId: "l2", addressJibun: "제주특별자치도 테스트동 l2" }]);
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId(HOUSE_COUNT)).toHaveCount(0);
    await expect(page.getByTestId(COMPANION_NOTICE)).toHaveCount(0);
    await expect(page.getByTestId("exemption-companion-notice")).toHaveCount(0);
  });
});
