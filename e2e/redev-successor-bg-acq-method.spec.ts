/**
 * 승계조합원 완공 아파트 — 화면 경로 (계획서 `docs/02-design/features/redev-successor-bg-acq-method.plan.md`)
 *
 *   RS-1 (Q-1 a) 부담부증여 × 승계 × 매매 — 종전에는 ⑧이 화면에 없는 상단 취득가액 칸을 요구해 계산할 수 없었다.
 *        지금: 계산되고 §159 안분 양도차익 153,260,870 (300,000,000 − 450,000,000 × 300/920).
 *   RS-2 주택에서 「감정가액」 → 자산 종류 「재개발/재건축 APT」 → 「승계조합원」.
 *        2026-11-06 반전(계획서 `redev-successor-apt-estimate.plan.md` Q-1 a): 매매 승계는 추계 3종을 계산한다 — 라디오 4종 · 감정가액 그대로 ·
 *        사용승인일 안내 · 취득시 기준시가 300,000,000을 넣으면 920,000,000 − 450,000,000 − 개산공제 9,000,000 = 461,000,000.
 *        (종전 Q-2 a: 라디오 없음 · 실거래가 450,000,000 · 327,250,000)
 *   RS-3 같은 순서로 「매매사례가액」 — 매매사례가액 칸이 보이고 920,000,000 − 500,000,000 − 9,000,000 = 411,000,000.
 *   RS-4 결과 화면 — 승계 추계 산식 행(감정가액 · 개산공제)과 §114의2 「확인 필요」 고지.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SUCC = {
  ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "redevelopment_apt", acquisitionCause: "purchase",
  acquisitionDate: "2020-04-15", actualSalePrice: "920000000", redevSubject: "apt", redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2016-02-20", redevIsSuccessorMember: "yes", redevCompletionDate: "2022-12-02", redevSettlementDirection: "pay",
  redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevPostApprovalExpenses: "0", fixedAcquisitionPrice: "450000000",
  standardPriceAtTransfer: "600000000",
};
const BG = {
  transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "920000000",
  bgMortgageDebtAmount: "300000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "450000000", fixedAcquisitionPrice: "",
};
const form = (asset: unknown) => ({
  state: {
    formData: {
      assets: [asset], transferDate: "2023-02-16", filingDate: "2023-04-30", contractTotalPrice: "920000000", householdHousingCount: "0",
      householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

async function seed(page: Page, s: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), seedWithDeclaredRoster(s));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calculate(page: Page) {
  const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
  const r = await res;
  const json = (await r.json()) as Loose;
  expect(r.status(), JSON.stringify(json).slice(0, 600)).toBe(200);
  return { sent: r.request().postDataJSON() as Loose, result: (json.data?.result ?? json.result) as Loose };
}

/** 주택 + 추계 플래그로 시작해 화면에서 자산 종류를 바꾸고 승계조합원을 켠다 — 플래그는 남는다(E-2·E-3). */
async function switchToSuccessor(page: Page, flag: Record<string, unknown>) {
  const { redevIsSuccessorMember: _s, assetKind: _k, ...rest } = SUCC;
  void _s; void _k;
  await seed(page, form({ ...rest, assetKind: "housing", ...flag }));
  await expandAssetSection(page, 1);
  const card = page.locator('[data-asset-card-index="0"]');
  await card.getByRole("button", { name: /재개발\/재건축 APT/ }).click();
  for (const n of [2, 3] as const) await expandAssetSection(page, n);
  await card.getByRole("radio", { name: /승계조합원/ }).first().click();
  await expect(card.getByTestId("successor-apt-estimate-note")).toBeVisible();
  return card;
}

/** 「취득시 기준시가」 칸에 값을 넣는다 — `data-field`가 입력 자체이거나 감싼 요소다. */
async function fillAcqStd(card: ReturnType<Page["locator"]>, value: string) {
  const el = card.locator('[data-field="standardPriceAtAcq"]').first();
  const input = (await el.evaluate((e) => e.tagName)) === "INPUT" ? el : el.locator("input").first();
  await input.fill(value);
  await input.blur();
}

test.describe("승계조합원 완공 아파트 — 부담부증여 매매 · 매매 승계 추계", () => {
  test("RS-1: 부담부증여 × 승계 × 매매 → 계산된다 · §159 안분 양도차익 153,260,870", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form({ ...SUCC, ...BG }));
    const { result } = await calculate(page);
    expect(result.transferGain).toBe(153_260_870);
  });

  test("RS-2: 남은 감정가액 플래그 → 라디오 4종 · 감정가액 그대로 · 기준시가 입력 → appraisal · 461,000,000", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await switchToSuccessor(page, { isAppraisalAcquisition: true });
    await expect(card.locator('input[type="radio"][name="acqBasisMode"]')).toHaveCount(4);
    await expect(card.locator('[data-field="fixedAcquisitionPrice"]')).toHaveCount(1);
    await fillAcqStd(card, "300000000");
    const { sent, result } = await calculate(page);
    expect(sent.acquisitionMethod).toBe("appraisal");
    expect(sent.appraisalValue).toBe(450_000_000);
    expect(result.transferGain).toBe(461_000_000);
  });

  test("RS-3: 남은 매매사례가액 플래그 → 매매사례가액 칸 · 기준시가 입력 → salesCase · 411,000,000", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await switchToSuccessor(page, { isSalesCaseAcquisition: true, similarSalesValue: "500000000" });
    await expect(card.locator('[data-field="similarSalesValue"]')).toHaveCount(1);
    await fillAcqStd(card, "300000000");
    const { sent, result } = await calculate(page);
    expect(sent.acquisitionMethod).toBe("salesCase");
    expect(result.transferGain).toBe(411_000_000);
  });

  test("RS-4: 결과 화면 — 승계 추계 산식(감정가액 · 개산공제 9,000,000)과 §114의2 「확인 필요」 고지", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form({ ...SUCC, isAppraisalAcquisition: true, standardPriceAtAcq: "300000000" }));
    const { result } = await calculate(page);
    expect(result.transferGain).toBe(461_000_000);
    const formula = page.getByTestId("successor-estimate-formula").first();
    await formula.waitFor({ state: "attached", timeout: 60_000 });
    const text = (await formula.textContent()) ?? "";
    expect(text).toContain("감정가액");
    expect(text).toContain("9,000,000");
    expect(text).toContain("461,000,000");
    await expect(page.getByText(/제114조의2/).first()).toBeAttached();
  });
});
