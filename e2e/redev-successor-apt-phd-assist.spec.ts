/**
 * 승계조합원 완공 APT — 「취득 당시 기준시가」 §164⑦ 계산 도우미 (계획서 `docs/02-design/features/redev-successor-apt-phd-assist.plan.md` Q-1~3 a)
 *
 *   PA-1 감정가액 — 도우미가 보이고(공동주택 고정 · 토지(대지권) 면적 칸 · 사용승인일 안내) 「채우기」 → 취득시 기준시가 313,725,490
 *        (= ⌊320,000,000 × 300,000,000 / 306,000,000⌋) → 계산: 920,000,000 − 450,000,000 − 개산공제 9,411,764 = 460,588,236.
 *   PA-2 환산 — 같은 도우미가 환산 기준시가 칸 곁에도 보인다(재개발 APT에는 3-시점 토글이 없다 · Q-2 a).
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
  standardPriceAtTransfer: "600000000", standardPriceAtAcq: "",
  // 도우미 입력(보조 칸 — 엔진에는 가지 않는다)
  acquisitionArea: "40", phdFirstDisclosureDate: "2023-04-28", phdFirstDisclosureHousingPrice: "320000000",
  phdLandPricePerSqmAtAcq: "5000000", phdBuildingStdPriceAtAcq: "100000000", phdLandPricePerSqmAtFirst: "5200000", phdBuildingStdPriceAtFirst: "98000000",
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

async function open(page: Page, over: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor({ timeout: 120_000 });
  await page.evaluate((x) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(x)), seedWithDeclaredRoster(form({ ...SUCC, ...over })));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const n of [1, 2, 3] as const) await expandAssetSection(page, n);
  return page.locator('[data-asset-card-index="0"]');
}

async function stdAcqInput(card: ReturnType<Page["locator"]>) {
  const el = card.locator('[data-field="standardPriceAtAcq"]').first();
  return (await el.evaluate((e) => e.tagName)) === "INPUT" ? el : el.locator("input").first();
}

test.describe("승계조합원 완공 APT — §164⑦ 계산 도우미", () => {
  test("PA-1: 감정가액 → 도우미 · 채우기 313,725,490 → 양도차익 460,588,236", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await open(page, { isAppraisalAcquisition: true });
    const assist = card.getByTestId("phd-fill-assist");
    await expect(assist).toHaveCount(1);
    await expect(assist).toContainText("환산 공동주택가격");
    await expect(assist.getByTestId("phd-fill-successor-note")).toContainText("2022-12-02");
    await expect(assist.locator('input[type="radio"][name^="housingType-"]')).toHaveCount(0);
    await expect(assist.locator('[data-field="acquisitionArea"]')).toHaveCount(1);
    await expect(assist.getByTestId("phd-fill-value")).toHaveText("313,725,490");
    await assist.getByTestId("phd-fill-button").click();
    await expect(await stdAcqInput(card)).toHaveValue("313,725,490");
    const res = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    const r = await res;
    const json = (await r.json()) as Loose;
    expect(r.status(), JSON.stringify(json).slice(0, 600)).toBe(200);
    const sent = r.request().postDataJSON() as Loose;
    expect(sent.standardPriceAtAcquisition).toBe(313_725_490);
    expect(sent.preHousingDisclosure).toBeUndefined();
    expect(((json.data?.result ?? json.result) as Loose).transferGain).toBe(460_588_236);
  });

  test("PA-2: 환산 → 환산 기준시가 칸 곁에도 도우미", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await open(page, { useEstimatedAcquisition: true, fixedAcquisitionPrice: "" });
    await expect(card.getByTestId("phd-fill-assist")).toHaveCount(1);
    await card.getByTestId("phd-fill-button").click();
    await expect(await stdAcqInput(card)).toHaveValue("313,725,490");
  });
});
