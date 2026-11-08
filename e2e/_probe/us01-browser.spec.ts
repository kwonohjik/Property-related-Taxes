import { test, expect } from "@playwright/test";
import { gotoTransferHoldingsStep, otherHouse } from "../_helpers/transfer-seed";
import { getReductionDefault } from "../../components/calc/transfer/UnifiedReductionPanel-defaults";

const R98 = { ...getReductionDefault("unsold_98"), isNationalScale98: true, isOutsideSeoul98: true, isUnsoldConfirmed98: true, isNotRentalHousing98: true, isFirstBuyerNoOccupancy98: true, rentedFor5Years98: false };
const SHOT = "/private/tmp/claude-501/-Users-malugeum-workspace-Property-related-Taxes/af17e2bd-2f81-4fc9-a818-705910a84364/scratchpad";

test("US-01 browser", async ({ page }) => {
  test.setTimeout(120_000);
  await gotoTransferHoldingsStep(page, {
    houses: [otherHouse("s", "2014-01-01")],
    assetOver: { acquisitionDate: "1996-06-15", fixedAcquisitionPrice: "500000000", actualSalePrice: "800000000", reductions: [R98] },
    formOver: { transferDate: "2022-08-01", contractTotalPrice: "800000000" },
  });
  await page.getByRole("button", { name: "감면·공제" }).first().click();
  await expect(page.getByText(/5년 이상 임대 \(다주택 중과 배제 판정\)/).first()).toBeVisible();
  await page.getByText(/5년 이상 임대 \(다주택 중과 배제 판정\)/).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOT}/us01-form.png`, fullPage: false });
  const sw = page.getByRole("switch", { name: /5년 이상 임대/ }).first();
  console.log("rental switch aria-checked:", await sw.getAttribute("aria-checked"));
  const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST", { timeout: 60_000 });
  const resP = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  const btns = await page.getByRole("button").allInnerTexts();
  console.log("buttons:", btns.filter((b) => /계산|결과|다음/.test(b)).join(" | "));
  const calcBtn = page.getByRole("button", { name: "세금 계산하기" });
  for (let i = 0; i < 4 && (await calcBtn.count()) === 0; i++) {
    await page.getByRole("button", { name: "다음" }).first().click();
    await page.waitForTimeout(800);
  }
  await calcBtn.first().click();
  const req = await reqP;
  const body = JSON.parse(req.postData() ?? "{}");
  console.log("body.reductions:", JSON.stringify(body.reductions));
  const json = await (await resP).json();
  const r = json?.data?.result ?? {};
  console.log("result:", JSON.stringify({ rate: r.appliedRate, base: r.taxBase, tax: r.calculatedTax, total: r.totalTax, warn: (r.warnings ?? []).filter((w: string) => w.includes("§98")) }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/us01-result.png`, fullPage: true });
  const notice = page.getByText(/§98①은 선택하여 적용받는 특례/).first();
  console.log("notice visible:", await notice.isVisible().catch(() => false));
});
