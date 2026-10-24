/**
 * «환산 개별주택가격 계산해 채우기» E2E (PHD × 비환산 PR-2, 계획서 docs/00-pm/phd-appraisal-dead-end.plan.md §9.2)
 *
 * 비환산(감정가액·매매사례가액) 주택 + 취득일 < 2005-04-29: 취득시 기준시가 칸 곁에 기존 PHD 입력 카드(보조 모드)와 버튼이 뜬다.
 * 버튼 → 칸이 환산 개별주택가격(§164⑦)으로 채워진다 → 계산 200 → 개산공제 = 채운 값 × 3%.
 * 보조 입력(phd* 칸)은 전송되지 않는다 — 본문에 preHousingDisclosure 없음.
 *
 * 규약: 미노출 단언에는 긍정 짝이 있다 · 시드는 sessionStorage 복원(`migrateAsset`)을 경유한다.
 * worktree 실행: E2E_PORT=3304 npx playwright test e2e/transfer-phd-fill-button.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const SEVEN = {
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "100000000",
  phdLandPricePerSqmAtAcq: "1000000",
  phdLandPricePerSqmAtFirst: "1100000",
  phdBuildingStdPriceAtAcq: "60000000",
  phdBuildingStdPriceAtFirst: "61000000",
  acquisitionArea: "100",
};
const APP = { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: false };
const SALES = { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: true };
const EST = { useEstimatedAcquisition: true, isAppraisalAcquisition: false, isSalesCaseAcquisition: false };
const BUTTON = "환산 개별주택가격 계산해 채우기";

function asset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetId: "fb1",
    addressJibun: "서울특별시 테스트구 1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-01-10",
    actualSalePrice: "1000000000",
    fixedAcquisitionPrice: "300000000",
    similarSalesValue: "300000000",
    standardPriceAtAcq: "",
    standardPriceAtTransfer: "400000000",
    ...APP,
    ...over,
  } as Record<string, unknown>;
}
function formOf(assets: Record<string, unknown>[]) {
  return {
    ...createDefaultTransferFormData(),
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets,
    transferDate: "2026-03-01",
    filingDate: "2026-05-31",
    contractTotalPrice: "1000000000",
    householdHousingCount: "2",
    isOneHousehold: false,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
  };
}
async function seedForm(page: Page, formData: Record<string, unknown>) {
  const want = (formData.assets as unknown[]).length;
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    const n = await page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard") ?? "{}")?.state?.formData?.assets?.length ?? 0);
    if (n === want) break;
  }
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}
interface Sent {
  preHousingDisclosure?: unknown;
  landAcquisitionDate?: string;
  standardPriceAtAcquisition?: number;
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step, exact: true }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  const sent = r.request().postDataJSON() as Sent;
  const json = (await r.json()) as { data?: { result?: { totalTax?: number; estimatedDeduction?: number } } };
  return { status: r.status(), sent, json, total: json?.data?.result?.totalTax, estDed: json?.data?.result?.estimatedDeduction };
}
/** 값이 이미 든 CurrencyInput 에 덮어쓰기 — 포커스 시 raw 로 바뀌는 입력이라 fill 대신 전체 선택 후 타이핑한다 */
async function overwrite(input: import("@playwright/test").Locator, v: string) {
  await input.click();
  await input.press("ControlOrMeta+a");
  await input.pressSequentially(v);
  await input.blur();
}
const stdInput = (page: Page) => page.locator('[data-field="standardPriceAtAcq"] input').first();
const fillBtn = (page: Page) => page.getByRole("button", { name: BUTTON });

test.describe("환산 개별주택가격 계산해 채우기 (PHD × 비환산)", () => {
  test("FB-1 감정가액: 버튼 → 칸이 93,567,251 로 채워짐 → 계산 200 → 개산공제 2,807,017 · 총세액 185,101,438 · 본문에 PHD 키 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([asset({ ...SEVEN })]));
    await expandAssetSection(page, 3);
    await expect(stdInput(page)).toHaveValue(""); // 클릭 전에는 채우지 않는다
    await expect(fillBtn(page)).toBeEnabled();
    await expect(page.getByTestId("phd-fill-value")).toHaveText("93,567,251"); // 미리보기
    await fillBtn(page).click();
    await expect(stdInput(page)).toHaveValue("93,567,251");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeUndefined();
    expect(r.sent.landAcquisitionDate).toBeUndefined();
    expect(r.sent.standardPriceAtAcquisition).toBe(93_567_251);
    expect(r.estDed).toBe(2_807_017); // floor(93,567,251 × 3%)
    expect(r.total).toBe(185_101_438);
  });

  test("FB-2 채운 뒤 직접 고칠 수 있다 — 고친 값 × 3% 가 개산공제로 간다 · 보조 입력을 바꿔도 칸은 자동으로 바뀌지 않는다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([asset({ ...SEVEN })]));
    await expandAssetSection(page, 3);
    await fillBtn(page).click();
    await expect(stdInput(page)).toHaveValue("93,567,251");
    // 보조 입력 변경 → 칸 그대로(자동 갱신 없음), 미리보기만 새 값
    const phdPrice = page.locator('[data-field="phdFirstDisclosureHousingPrice"] input').first();
    await overwrite(phdPrice, "200000000");
    await expect(page.getByTestId("phd-fill-value")).toHaveText("187,134,502");
    await expect(stdInput(page)).toHaveValue("93,567,251");
    // 직접 고침
    await overwrite(stdInput(page), "100000000");
    await expect(stdInput(page)).toHaveValue("100,000,000");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeUndefined();
    expect(r.sent.standardPriceAtAcquisition).toBe(100_000_000);
    expect(r.estDed).toBe(3_000_000);
  });

  test("FB-3 매매사례가액: 같은 버튼이 매매사례 취득시 기준시가 칸을 채운다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([asset({ ...SALES, ...SEVEN })]));
    await expandAssetSection(page, 3);
    await fillBtn(page).click();
    await expect(stdInput(page)).toHaveValue("93,567,251");
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeUndefined();
    expect(r.estDed).toBe(2_807_017);
  });

  test("FB-4 처음 접힌 상태에서 시작 — 펼쳐서 6칸을 직접 입력하면 버튼이 켜지고 같은 값이 채워진다 (토지 면적은 ① 기본정보 시드)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedForm(page, formOf([asset({ acquisitionArea: "100" })]));
    await expandAssetSection(page, 3);
    const card = page.getByTestId("phd-fill-assist");
    await expect(card).toBeVisible();
    await expect(fillBtn(page)).toHaveCount(0); // 접힘 — 긍정 짝은 아래
    await card.getByRole("button", { name: /펼치기/ }).click();
    await expect(fillBtn(page)).toBeDisabled();
    // 최초 고시일
    const date = page.locator('[data-field="phdFirstDisclosureDate"]');
    await date.getByLabel("연도").fill("2005");
    await date.getByLabel("월").fill("04");
    await date.getByLabel("일").fill("30");
    const put = async (field: string, v: string) => {
      const i = page.locator(`[data-field="${field}"] input`).first();
      await i.fill(v);
      await i.blur();
    };
    await put("phdFirstDisclosureHousingPrice", "100000000");
    await put("phdLandPricePerSqmAtAcq", "1000000");
    await put("phdBuildingStdPriceAtAcq", "60000000");
    await put("phdLandPricePerSqmAtFirst", "1100000");
    await put("phdBuildingStdPriceAtFirst", "61000000");
    await expect(fillBtn(page)).toBeEnabled();
    await fillBtn(page).click();
    await expect(stdInput(page)).toHaveValue("93,567,251");
  });

  test("FB-6 공동주택(주택유형 라디오) — 버튼·제목·산식이 «환산 공동주택가격»이고 같은 값이 채워진다 · «환산 개별주택가격» 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([asset({ ...SEVEN, phdHousingType: "apartment" })]));
    await expandAssetSection(page, 3);
    const apt = page.getByRole("button", { name: "환산 공동주택가격 계산해 채우기" });
    await expect(apt).toBeEnabled();
    await expect(fillBtn(page)).toHaveCount(0); // 개별 이름의 버튼은 없다
    const card = page.getByTestId("phd-fill-assist");
    await expect(card).not.toContainText("환산 개별주택가격");
    await expect(card).toContainText("환산 공동주택가격 계산 (소득세법 시행령 §164⑦)");
    await expect(page.getByTestId("phd-fill-formula")).toContainText("환산 공동주택가격 = 최초 고시 주택가격");
    await apt.click();
    await expect(stdInput(page)).toHaveValue("93,567,251");
  });

  test("FB-5 환산(대조): 버튼이 없고 PHD 3-시점 토글이 대신한다 / 취득일 2010(대조): 버튼 없음", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([asset({ ...EST, usePreHousingDisclosure: true, ...SEVEN })]));
    await expandAssetSection(page, 3);
    await expect(page.getByRole("switch", { name: /취득 당시 개별주택가격 미공시/ })).toBeVisible();
    await expect(fillBtn(page)).toHaveCount(0);
    await expect(page.getByTestId("phd-fill-assist")).toHaveCount(0);
    await seedForm(page, formOf([asset({ ...SEVEN, acquisitionDate: "2010-01-10" })]));
    await expandAssetSection(page, 3);
    await expect(stdInput(page)).toBeVisible(); // 긍정 짝 — 감정 모드 칸은 있다
    await expect(page.getByTestId("phd-fill-assist")).toHaveCount(0);
  });
});
