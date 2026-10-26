/**
 * 승계조합원 완공 아파트 — 화면 경로 (계획서 `docs/02-design/features/redev-successor-bg-acq-method.plan.md`)
 *
 *   RS-1 (Q-1 a) 부담부증여 × 승계 × 매매 — 종전에는 ⑧이 화면에 없는 상단 취득가액 칸을 요구해 계산할 수 없었다.
 *        지금: 계산되고 §159 안분 양도차익 153,260,870 (300,000,000 − 450,000,000 × 300/920).
 *   RS-2 (Q-2 a) 주택에서 「감정가액」 → 자산 종류 「재개발/재건축 APT」 → 「승계조합원」 — 산정 방식 라디오가 없고 취득가액 칸이 보인다.
 *        종전에는 남은 감정가액 플래그로 취득가액 0 · appraisal이 실렸다. 지금: 취득가액 450,000,000 · actual · 산출세액 327,250,000.
 *   RS-3 같은 순서로 「매매사례가액」 — 종전에는 매매사례가액 칸만 보이고 엔진은 숨은 취득가액으로 계산했다. 지금: 매매사례가액 칸 없음 · 취득가액 칸.
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless Playwright). 워크트리는 `E2E_PORT=<포트> npx playwright test <spec>`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

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
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), s);
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
  await expect(card.getByTestId("successor-apt-actual-only-note")).toBeVisible();
  return card;
}

test.describe("승계조합원 완공 아파트 — 부담부증여 매매 · 실거래가 전용", () => {
  test("RS-1: 부담부증여 × 승계 × 매매 → 계산된다 · §159 안분 양도차익 153,260,870", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form({ ...SUCC, ...BG }));
    const { result } = await calculate(page);
    expect(result.transferGain).toBe(153_260_870);
  });

  test("RS-2: 남은 감정가액 플래그 → 라디오 없음 · 취득가액 칸 · 본문 취득가액 450,000,000 · actual", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await switchToSuccessor(page, { isAppraisalAcquisition: true });
    await expect(card.locator('input[type="radio"][name="acqBasisMode"]')).toHaveCount(0);
    await expect(card.locator('[data-field="fixedAcquisitionPrice"]')).toHaveCount(1);
    const { sent, result } = await calculate(page);
    expect(sent.acquisitionPrice).toBe(450_000_000);
    expect(sent.acquisitionMethod).toBe("actual");
    expect(result.calculatedTax).toBe(327_250_000);
  });

  test("RS-3: 남은 매매사례가액 플래그 → 매매사례가액 칸 없음 · 취득가액 칸", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await switchToSuccessor(page, { isSalesCaseAcquisition: true, similarSalesValue: "500000000" });
    await expect(card.locator('[data-field="similarSalesValue"]')).toHaveCount(0);
    await expect(card.locator('[data-field="fixedAcquisitionPrice"]')).toHaveCount(1);
    const { sent } = await calculate(page);
    expect(sent.acquisitionPrice).toBe(450_000_000);
    expect(sent.acquisitionMethod).toBe("actual");
  });
});
