/**
 * E2E: 축 B(같은 물건 지분 분할) × 주택부수토지 — 둘째 지분 카드를 짝 주택으로 세지 않는다(1주택 코드 리뷰 별건 ①).
 *
 * 계획서: `docs/00-pm/axis-b-appurtenant-land-dead-end.plan.md`
 *
 * 둘째 카드는 화면이 만드는 그대로(`makeDefaultAsset(2)` — 저장 자산 종류 기본값 `housing`)에 취득 3칸·지분율만 넣어 시드한다.
 * 종전에는 ⑧이 «주택을 첫 자산으로 입력하세요»라며 계산을 막았고, 교환 버튼은 축 B에서 숨겨져 따를 방법이 없었다.
 * 지분 합계 총세액이 같은 토지 100% 단건과 같은지 함께 본다(세율은 서버 그대로 — 값을 박지 않고 두 계산을 대조한다).
 *
 * 실행: E2E_PORT=<worktree 포트> npx playwright test e2e/transfer-axis-b-appurtenant-land.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const LAND = {
  assetKind: "land",
  landNature: "appurtenant",
  acquisitionCause: "purchase",
  acquisitionDate: "2014-01-02",
  fixedAcquisitionPrice: "150000000",
  actualSalePrice: "300000000",
  addressJibun: "서울 테스트동 1",
  areaScenario: "same",
  acquisitionArea: "300",
  transferArea: "300",
  standardPriceAtTransfer: "200000000",
};
/** 카드마다 입력하는 값 — 금액은 물건 전체(지분율은 ④·엔진이 곱한다). */
const PER_SHARE = { acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "150000000" };
const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };

const COMMON = {
  transferDate: "2026-02-16",
  filingDate: "2026-04-30",
  contractTotalPrice: "300000000",
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
};

function seedAxisB() {
  const second = makeDefaultAsset(2);
  return {
    state: {
      formData: {
        ...COMMON,
        assetSplitMode: "fractional",
        assets: [
          { ...makeDefaultAsset(1), ...LAND, ...HALF },
          // 저장 자산 종류는 기본값 그대로 — 화면은 ① 기본정보를 숨기고 첫 카드 값을 쓴다.
          { ...second, ...PER_SHARE, ...HALF, assetKind: second.assetKind },
        ],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

function seedSingle() {
  return {
    state: { formData: { ...COMMON, assets: [{ ...makeDefaultAsset(1), ...LAND }] }, pendingMigration: false },
    version: 0,
  };
}

async function seed(page: Page, s: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page): Promise<number> {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const resp = await resP;
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  const json = (await resp.json()) as { data: { aggregated?: { totalTax: number }; result?: { totalTax: number } } };
  return json.data.aggregated?.totalTax ?? json.data.result!.totalTax;
}

const BLOCK = "주택부수토지를 첫 자산으로 넣고 주택을 함께 양도하는 자산으로 넣으면";

test.describe("축 B 주택부수토지 — 둘째 지분 카드는 주택이 아니다", () => {
  test("역방향 차단 없이 계산되고, 지분 합계 총세액 = 같은 토지 100% 단건", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, seedSingle());
    const single = await calculate(page);
    expect(single).toBeGreaterThan(0);

    await seed(page, seedAxisB());
    // 둘째 카드는 화면에서 종류를 바꿀 수 없다 — ① 기본정보가 숨겨진다(교환 버튼도 축 B에서는 없다).
    await expect(page.getByTestId("reverse-appurtenant-swap-button")).toHaveCount(0);
    const axisB = await calculate(page);
    await expect(page.getByText(BLOCK)).toHaveCount(0);
    expect(axisB).toBe(single);
  });
});
