/**
 * 리뷰 NH-22 — §99의3 «딸린 토지 — 건물 연면적의 2배 이내» 선택 입력과 확인 필요 고지 (브라우저 확인).
 * 종전 고급주택 구간 밖(2003 계약)에서는 연면적·딸린 토지 칸이 없었고, 입력해도 서버에 닿지 않았다. 계산은 바꾸지 않는다 — 고지만.
 * 단위 anchor: `__tests__/calc/new-housing-appurtenant-land-2x-nh22.anchor.test.tsx` · route: `__tests__/api/transfer.route.new-housing-appurtenant-land-2x-nh22.anchor.test.ts`.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoTransferHoldingsStep } from "./_helpers/transfer-seed";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

const r993 = {
  ...getReductionDefault("new_99_3"),
  acquisitionType993: "from_builder",
  contractDate993: "2003-03-01",
  firstContract993: "yes",
  standardPriceAtAcquisition993: "100000000",
  standardPriceAt5Years: "150000000",
  standardPriceAtTransfer993: "400000000",
  exclusiveAreaSqm993: "84",
  region993: "outside_speculation",
  houseType993: "",
};

async function openPanel(page: Page) {
  await gotoTransferHoldingsStep(page, {
    houses: [],
    assetOver: { addressJibun: "경기도 수원시 영통구 영통동 957-6", acquisitionDate: "2003-03-01", reductions: [r993] },
    formOver: { transferDate: "2026-02-16", contractTotalPrice: "900000000", isOneHousehold: false, householdHousingCount: "2" },
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

async function fillArea(page: Page, dataField: string, value: string) {
  const root = page.locator(`[data-field="${dataField}"]`).first();
  const input = (await root.evaluate((el) => el.tagName)) === "INPUT" ? root : root.locator("input").first();
  await input.fill(value);
}

test("[NH-22] §99의3 구간 밖 — 연면적 100 · 토지 400 입력 → 요청 body에 실리고 결과에 확인 필요 고지", async ({ page }) => {
  test.setTimeout(120_000);
  await openPanel(page);
  await expect(page.getByTestId("new993-appurtenant-land-fields")).toBeVisible();
  await expect(page.getByTestId("new993-luxury-fields")).toHaveCount(0);

  await fillArea(page, "reduction.new_99_3.grossFloorAreaSqm993", "100");
  await fillArea(page, "reduction.new_99_3.attachedLandAreaSqm993", "400");

  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST");
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const body = (await reqP).postDataJSON() as { reductions?: Record<string, unknown>[] };
  const red = (body.reductions ?? []).find((r) => r.type === "new_99_3");
  expect(red?.grossFloorAreaSqm993, "요청 body에 연면적").toBe(100);
  expect(red?.attachedLandAreaSqm993, "요청 body에 딸린 토지 면적").toBe(400);
  const res = await resP;
  expect(res.status()).toBe(200);
  const json = (await res.json()) as { data?: { result?: { warnings?: string[]; new993Detail?: { isEligible?: boolean } } } };
  expect(json.data?.result?.new993Detail?.isEligible, "전제: §99의3 적격").toBe(true);
  expect((json.data?.result?.warnings ?? []).some((w) => /딸린 토지 면적 400㎡가 건물 연면적 100㎡의 2배\(200㎡\)를 넘습니다/.test(w))).toBe(true);
  await expect(page.getByText(/건물 연면적 100㎡의 2배\(200㎡\)를 넘습니다/).first()).toBeVisible();
});
