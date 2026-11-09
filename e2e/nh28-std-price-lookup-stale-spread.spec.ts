/**
 * 리뷰 NH-28 — 기준시가 자동조회가 전용면적을 함께 받아도 조회한 기준시가가 칸에 남는다 (브라우저 확인).
 *
 * 종전: 「조회」 응답에 전용면적이 있으면 기준시가 칸은 옛 값 그대로이고 전용면적만 바뀌었다(패널 갱신 함수가 옛 배열 위에 덮어쓰기).
 * 외부 API(`/api/address/standard-price`)는 모의한다. 단위 anchor: `__tests__/components/calc/reduction-panel-std-price-lookup-stale-spread-nh28.anchor.test.tsx`.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const r993 = {
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder",
  standardPriceAtAcquisition993: "80000000",
  standardPriceAt5Years: "150000000",
  standardPriceAtTransfer993: "200000000",
  exclusiveAreaSqm993: "59",
  region993: "outside_speculation",
  houseType993: "apartment",
};

async function openPanel(page: Page) {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: { addressJibun: "경기도 수원시 영통구 영통동 957-6", acquisitionDate: "2003-11-28", reductions: [r993] },
    formOver: { transferDate: "2026-02-16", contractTotalPrice: "900000000" },
  });
  await page.waitForFunction(() => {
    const el = document.querySelector("button");
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  const header = page.getByRole("button", { name: /신축주택/ }).first();
  await header.waitFor();
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
}

const valueOf = async (page: Page, dataField: string) => {
  const root = page.locator(`[data-field="${dataField}"]`).first();
  const input = (await root.evaluate((el) => el.tagName)) === "INPUT" ? root : root.locator("input").first();
  return input.inputValue();
};

test("[NH-28] §99의3 취득시 기준시가 조회 — 응답에 전용면적이 있어도 기준시가 칸이 조회값으로 바뀐다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/api/address/standard-price**", (route) =>
    route.fulfill({ json: { price: 300_000_000, priceType: "apart_housing_price", exclusiveArea: 84.96 } }),
  );
  await openPanel(page);

  expect(await valueOf(page, "reduction.new_99_3.standardPriceAtAcquisition")).toContain("80,000,000");
  await page.getByTestId("new993-stdprice-acq-lookup-btn").click();

  await expect.poll(() => valueOf(page, "reduction.new_99_3.standardPriceAtAcquisition")).toContain("300,000,000");
  expect(await valueOf(page, "reduction.new_99_3.exclusiveAreaSqm993")).toBe("84.96");
});
