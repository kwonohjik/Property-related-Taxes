/**
 * 건물(토지 제외) × 「소득세법 시행령」 §163⑨ 단서 2호 · §164⑤ (계획서 `docs/00-pm/building-163-9-proviso-164-5.plan.md` · Q-30~33 a).
 *
 * - BD-1 상속 1999: ③ 「§164⑤ 취득당시 건물 기준시가」 카드 · 칸에 2억을 입력 → 전송 · 양도차익 300,000,000.
 * - BD-2 상속 2001(구간 밖): 카드 없음(V-1 — 상속 · 증여 건물 ③에는 취득시 기준시가 칸이 없다).
 * - BD-3 상속 부담부증여(시가 · 실지): ② 카드가 ③ 칸을 가리킨다 · ③ 카드 부담부증여 문구 · 양도차익 150,000,000.
 * 고정값은 route anchor(`transfer.route.building-163-9-proviso.anchor.test.ts`)와 같다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { rosterForDeclaredCount } from "./_helpers/roster-for-declared-count";

type A = Record<string, unknown>;
const B: A = {
  addressJibun: "제주특별자치도 강남구 테스트동 3-3", assetKind: "building", acquisitionCause: "inheritance", acquisitionDate: "1999-06-01",
  inheritanceStartDate: "1999-06-01", decedentAcquisitionDate: "1980-01-01", actualSalePrice: "500000000", standardPriceAtTransfer: "300000000",
  publishedValueAtInheritance: "100000000", inheritanceValuationMethod: "supplementary",
};
const bg: A = {
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000",
  bgMortgageDebtAmount: "250000000", bgLendingDepositTotal: "0", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "100000000",
};

async function seed(page: Page, asset: A, contractTotalPrice: string) {
  const s = {
    state: {
      formData: rosterForDeclaredCount({
        assets: [{ ...makeDefaultAsset(1), assetId: "p", ...asset }], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice, totalTransferExpense: "0",
        householdHousingCount: "0", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      } as never),
      pendingMigration: false,
    },
    version: 0,
  };
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // hydration 대기(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-asset-section="2"]');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}
async function open(page: Page, n: 2 | 3) {
  const header = page.locator(`[data-asset-section="${n}"] > button`).first();
  if ((await header.innerText()).includes("펼치기")) await header.click();
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status(), await r.text()).toBe(200);
  const body = r.request().postDataJSON() as { inheritedBuildingSec164Value?: number };
  const j = (await r.json()) as { data: { result?: { transferGain: number } } };
  return { gain: j.data.result?.transferGain, sent: body.inheritedBuildingSec164Value };
}

test.describe("건물 × §163⑨ 단서 2호 · §164⑤", () => {
  test("BD-1 상속 1999 — ③ §164⑤ 칸 입력 → 300,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, B, "500000000");
    await open(page, 3);
    const section = page.getByTestId("building-164-5-section");
    await expect(section).toContainText("상증법 평가액과 §164⑤ 취득당시 기준시가 중 큰 금액");
    await page.getByTestId("building-164-5-value").fill("200000000");
    const r = await calc(page);
    expect(r.sent).toBe(200_000_000);
    expect(r.gain).toBe(300_000_000);
  });

  test("BD-2 상속 2001 — 구간 밖 · 카드 없음 · 400,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...B, acquisitionDate: "2001-06-01", inheritanceStartDate: "2001-06-01" }, "500000000");
    await open(page, 3);
    await expect(page.getByText("취득가액 의제 특례").first()).toBeVisible();
    await expect(page.getByTestId("building-164-5-section")).toHaveCount(0);
    const r = await calc(page);
    expect(r.sent).toBeUndefined();
    expect(r.gain).toBe(400_000_000);
  });

  test("BD-3 상속 부담부증여 — ② 카드가 ③ 칸을 가리킨다 · 150,000,000", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { ...B, ...bg, inhBuildingSec164Value: "200000000" }, "500000000");
    await open(page, 2);
    await expect(page.getByTestId("bg-163-9-proviso-section")).toContainText("③ 취득정보의 「§164⑤ 취득당시 건물 기준시가」 칸");
    await open(page, 3);
    await expect(page.getByTestId("building-164-5-bg-note")).toContainText("실지취득가액 칸");
    const r = await calc(page);
    expect(r.sent).toBe(200_000_000);
    expect(r.gain).toBe(150_000_000);
  });
});
