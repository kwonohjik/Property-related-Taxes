/**
 * 승계조합원 완공 아파트 — 상속 승계 평가액 비움 (계획서 `docs/02-design/features/redev-successor-inherit-valuation-required.plan.md`)
 *
 *   RI-1 매매 승계(취득가액 450,000,000)에서 화면으로 취득원인을 「상속」으로 바꾸고 평가액을 비운 채 계산 — 종전에는 ⑧이 통과해
 *        상속 카드엔 없는 남은 취득가액으로 계산됐다(평가액·남은 값 모두 없으면 서버 400). 지금: 「계산하기」에서 막히고 요청이 나가지 않는다.
 *   RI-2 상속 승계 · 평가액 450,000,000 → 계산 · 본문 `inheritedAcquisition.reportedValue` 450,000,000 · 산출세액 327,250,000.
 *   RI-3 상속 승계 · 평가액 채움 · 피상속인 취득일 비움 — 종전에는 ⑧이 통과해 서버가 400(피상속인 취득일 필수)을 냈다. 지금: 「계산하기」에서 막힌다.
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

async function goToCalculate(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  await page.getByRole("button", { name: /계산하기/ }).last().click();
}

test.describe("승계조합원 완공 아파트 — 상속 승계 평가액", () => {
  test("RI-1: 매매 → 상속으로 바꾸고 평가액 비움 → 계산하기에서 막히고 요청 없음", async ({ page }) => {
    test.setTimeout(180_000);
    // 피상속인 취득일은 미리 채워 둔다(상속 카드에서 보이는 칸) — 평가액 규칙만 본다. 그 칸 비움은 RI-3.
    await seed(page, form({ ...SUCC, decedentAcquisitionDate: "2010-01-01" }));
    for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
    const card = page.locator('[data-asset-card-index="0"]');
    await card.getByRole("radio", { name: "상속", exact: true }).click();
    await expect(card.locator('[data-field="fixedAcquisitionPrice"]')).toHaveCount(0);
    let posted = false;
    page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
    await goToCalculate(page);
    await expect(page.getByText("승계조합원 — 입주권을 상속받은 상속개시일 평가액(상속세 신고가액)을 입력하세요", { exact: false }).first()).toBeVisible();
    await expect(page.locator('[data-print-id="form-table"]')).toHaveCount(0);
    expect(posted).toBe(false);
  });

  test("RI-3: 상속 승계 · 피상속인 취득일 비움 → 계산하기에서 막히고 요청 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form({
      ...SUCC, acquisitionCause: "inheritance", fixedAcquisitionPrice: "", decedentAcquisitionDate: "",
      inheritanceValuationMethod: "supplementary", publishedValueAtInheritance: "450000000",
    }));
    let posted = false;
    page.on("request", (r) => { if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true; });
    await goToCalculate(page);
    await expect(page.getByText("피상속인 취득일을 입력하세요", { exact: false }).first()).toBeVisible();
    await expect(page.locator('[data-print-id="form-table"]')).toHaveCount(0);
    expect(posted).toBe(false);
  });

  test("RI-2: 상속 승계 · 평가액 450,000,000 → 산출세액 327,250,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, form({
      ...SUCC, acquisitionCause: "inheritance", fixedAcquisitionPrice: "", decedentAcquisitionDate: "2010-01-01",
      inheritanceValuationMethod: "supplementary", publishedValueAtInheritance: "450000000",
    }));
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    await goToCalculate(page);
    const r = await res;
    const json = (await r.json()) as Loose;
    expect(r.status(), JSON.stringify(json).slice(0, 600)).toBe(200);
    const sent = r.request().postDataJSON() as Loose;
    expect(sent.inheritedAcquisition?.reportedValue).toBe(450_000_000);
    expect((json.data?.result ?? json.result)?.calculatedTax).toBe(327_250_000);
  });
});
