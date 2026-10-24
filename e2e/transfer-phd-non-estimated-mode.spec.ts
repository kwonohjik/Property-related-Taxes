/**
 * PHD(§164⑦) 플래그 × 환산이 아닌 취득가액 방식(실거래가·감정가액·매매사례가액) — 막다른 길(400) · 침묵 오산(개산공제 0) 수정 E2E (PH-1~7)
 *
 * 계획서: docs/00-pm/phd-appraisal-dead-end.plan.md (§1 재현 · §8.3 E2E)
 * 짝 anchor(vitest): __tests__/calc/phd-non-estimated-method-axis.anchor.test.ts · phd-non-estimated-block-ui.anchor.test.tsx
 *
 * 결함: 취득일 < 2005-04-29 주택이면 ⑤ 가 `usePreHousingDisclosure` 를 방식과 무관하게 자동으로 켠다. 토글은 환산에서만 보이는데 ④ 가 그 플래그를
 * 방식 없이 읽어 취득시 기준시가를 지우고 분리 계산을 켰다 → 화면에 없는 양도시 파트 기준시가를 ⑫ 가 요구해 400(PH-1·PH-4), 감정에서는 개산공제 0(PH-2).
 *
 * 규약: 미노출 단언에는 긍정 짝이 있다 · 시드는 sessionStorage 복원(`migrateAsset`)을 경유한다.
 * worktree 실행: E2E_PORT=3303 npx playwright test e2e/transfer-phd-non-estimated-mode.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const PHD_ELEVEN = {
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "100000000",
  phdLandPricePerSqmAtAcq: "1000000",
  phdLandPricePerSqmAtFirst: "1100000",
  phdLandPricePerSqmAtTransfer: "2400000",
  phdBuildingStdPriceAtAcq: "60000000",
  phdBuildingStdPriceAtFirst: "61000000",
  phdBuildingStdPriceAtTransfer: "160000000",
  phdTransferHousingPrice: "400000000",
  acquisitionArea: "100",
  transferArea: "100",
};
const ACTUAL = { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false };
const EST = { useEstimatedAcquisition: true, isAppraisalAcquisition: false, isSalesCaseAcquisition: false };
const APP = { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: false };
const TOGGLE = /취득 당시 개별주택가격 미공시/;
// 함께 양도 시료는 비조정 지역 — 서울 주소는 조정대상지역 판정이 비동기로 풀려 「같은 날 주택 2채 함께양도」 ⑧(§154⑨)이 타이밍에 따라 걸린다.
const NON_REGULATED = { addressJibun: "강원특별자치도 춘천시 테스트동 1", regionCode: "5111010100" };

function phdAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetId: "ph1",
    addressJibun: "서울특별시 테스트구 1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-01-10",
    actualSalePrice: "1000000000",
    fixedAcquisitionPrice: "300000000",
    standardPriceAtAcq: "200000000",
    standardPriceAtTransfer: "400000000",
    ...ACTUAL,
    ...over,
  } as Record<string, unknown>;
}

function formOf(assets: Record<string, unknown>[], over: Record<string, unknown> = {}) {
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
    ...over,
  };
}

async function seedForm(page: Page, formData: Record<string, unknown>) {
  const want = (formData.assets as unknown[]).length;
  // 시드 직후 reload 전에 첫 로드의 지연 persist 가 시드를 기본 폼으로 덮는 경합이 부하에서 드물게 난다(자산 수로 확인하고 재시도).
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
    );
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
  companionAssets?: unknown[];
}
async function calc(page: Page) {
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step, exact: true }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  const sent = r.request().postDataJSON() as Sent;
  const json = (await r.json()) as { data?: { result?: { totalTax?: number; estimatedDeduction?: number; preHousingDisclosureDetail?: unknown } } };
  return { status: r.status(), sent, json, total: json?.data?.result?.totalTax };
}
const toggleCount = (page: Page) => page.getByText(TOGGLE).count();

// ═══════════════════════════════════════════════════════════════════════
test.describe("PHD × 환산이 아닌 취득가액 방식", () => {
  test("PH-1 실거래가 + 저장 세션에 PHD 플래그만 ON → 계산 200 · 본문에 PHD·분리 후퇴 없음 · 토글 없음 (수정 전: 400)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedForm(page, formOf([phdAsset({ ...ACTUAL, usePreHousingDisclosure: true, acquisitionDate: "2000-03-01" })]));
    await expandAssetSection(page, 3);
    expect(await toggleCount(page)).toBe(0); // 켜진 줄도 모르는 플래그 — 끌 칸은 없다
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeUndefined();
    expect(r.sent.landAcquisitionDate).toBeUndefined();
  });

  test("PH-2 환산 → 토글 ON·11칸 → 「감정가액」: 토글 소거 · 개산공제 반영 · 본문에 PHD 키 없음 → 「환산취득가」로 복귀하면 토글·11칸 보존", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([phdAsset({ ...EST, usePreHousingDisclosure: true, ...PHD_ELEVEN })]));
    await expandAssetSection(page, 3);
    // 긍정 짝 — 환산에서는 토글이 켜진 채 보인다
    const sw = page.getByRole("switch", { name: TOGGLE });
    const phdPrice = page.locator('[data-field="phdFirstDisclosureHousingPrice"] input, input[data-field="phdFirstDisclosureHousingPrice"]').first();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(phdPrice).toHaveValue(/100,?000,?000/);
    await page.getByRole("radio", { name: "감정가액" }).click();
    await expect.poll(() => toggleCount(page)).toBe(0);
    // 환산으로 복귀 — 11칸·플래그 보존(읽는 쪽 파생이라 저장값이 지워지지 않는다)
    await page.getByRole("radio", { name: "환산취득가" }).click();
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await expect(phdPrice).toHaveValue(/100,?000,?000/);
    // 다시 감정 — 감정 모드: 취득시 기준시가(개산공제 기준액) 칸 + 환산 개별주택가격 hint
    await page.getByRole("radio", { name: "감정가액" }).click();
    await expect.poll(() => toggleCount(page)).toBe(0);
    await expect(page.getByText(/환산 개별주택가격\(부수토지 포함 총액\)/).first()).toBeVisible();
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeUndefined();
    expect(r.sent.standardPriceAtAcquisition).toBe(200_000_000); // 수정 전: 지워졌다
    expect(r.json.data?.result?.estimatedDeduction).toBe(6_000_000); // 수정 전: 0
    expect(r.total).toBe(184_118_000); // 수정 전: 185,966,000
  });

  const SELF_BUILT = {
    acquisitionDate: "2022-01-10",
    isSelfBuilt: true,
    buildingType: "new",
    constructionDate: "2022-01-10",
    standardPricePerSqmAtAcq: "1000000",
    buildingStandardPriceAtAcq: "60000000",
    standardPricePerSqmAtTransfer: "2400000",
    buildingStandardPriceAtTransfer: "160000000",
    saleSplitMode: "apportioned",
    acquisitionArea: "100",
    transferArea: "100",
  };

  test("PH-3a 감정 × 본인 신축 × PHD 잔재(환산 → 감정 전환 뒤) → 건물분 카드가 열리고(수정 전: 닫힘) 건물 감정가액이 비면 ⑧ 이 막는다 — 계산 요청이 나가지 않는다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([phdAsset({ ...APP, ...SELF_BUILT, usePreHousingDisclosure: true, ...PHD_ELEVEN, selfBuiltBuildingAppraisal: "" })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("self-built-housing-share")).toHaveCount(1);
    await expect(page.getByTestId("self-built-building-appraisal")).toBeVisible();
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step, exact: true }).first().click();
    let posted = false;
    page.on("request", (r) => {
      if (r.url().includes("/api/calc/transfer") && r.method() === "POST") posted = true;
    });
    await page.getByRole("button", { name: /계산하기/ }).click();
    await page.waitForTimeout(1500);
    expect(posted).toBe(false);
  });

  test("PH-3b 같은 시료에 건물 감정가액 1.1억 → 가산세 base 1.1억 · 5,500,000 (수정 전: 건물분 카드가 없어 base 자산 전체 3억)", async ({ page }) => {
    test.setTimeout(150_000);
    await seedForm(page, formOf([phdAsset({ ...APP, ...SELF_BUILT, usePreHousingDisclosure: true, ...PHD_ELEVEN, selfBuiltBuildingAppraisal: "110000000" })]));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeUndefined();
    const pen = (r.json as { data?: { result?: { selfBuiltHousingPenalty?: { base?: number; penalty?: number } } } }).data?.result?.selfBuiltHousingPenalty;
    expect(pen?.base).toBe(110_000_000);
    expect(pen?.penalty).toBe(5_500_000);
  });

  test("PH-4 취득일 칸에 2000-03-01 을 직접 입력(DateInput) → 자동 ON 발화에도 실거래가는 계산 200 (영향 인구가 가장 큰 경로)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedForm(page, formOf([phdAsset({ ...ACTUAL, acquisitionDate: "2010-01-10" })]));
    await expandAssetSection(page, 3);
    const date = page.getByTestId("acq-date-building");
    await date.getByLabel("연도").fill("2000");
    await date.getByLabel("월").fill("03");
    await date.getByLabel("일").fill("01");
    await expect(date.getByLabel("연도")).toHaveValue("2000");
    // 자동 ON effect 는 그대로다(Q-7) — 플래그는 켜지지만 토글은 비환산에서 보이지 않는다
    await expect
      .poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("transfer-tax-wizard")!).state.formData.assets[0].usePreHousingDisclosure))
      .toBe(true);
    expect(await toggleCount(page)).toBe(0);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeUndefined();
  });

  test("PH-5 환산 + PHD ON 11칸(불변): PHD 키 전송 · 종전 세액 · PHD 상세가 응답에 있다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedForm(page, formOf([phdAsset({ ...EST, usePreHousingDisclosure: true, ...PHD_ELEVEN })]));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.preHousingDisclosure).toBeTruthy();
    expect(r.total).toBe(206_154_088);
    expect(r.json.data?.result?.preHousingDisclosureDetail).toBeTruthy();
  });

  test("PH-7 함께 양도 — 둘째 자산이 감정 + PHD 잔재: 종전 안내 그대로 · 계산 200 · 첫 자산(환산) 영향 없음", async ({ page }) => {
    test.setTimeout(120_000);
    // 첫 자산 취득일은 최초 공시일 이후 — 2005-04-29 전이면 ⑤ 자동 ON 이 첫 자산 PHD 11칸을 요구해 이 시나리오와 무관한 ⑧ 이 난다
    const first = phdAsset({ ...EST, usePreHousingDisclosure: false, acquisitionDate: "2010-01-10", standardPriceAtTransfer: "1000000001", ...NON_REGULATED });
    const second = {
      ...makeDefaultAsset(2),
      assetId: "ph2",
      addressJibun: "강원특별자치도 춘천시 테스트동 2",
      regionCode: "5111010100",
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2001-06-01",
      actualSalePrice: "1000000000",
      fixedAcquisitionPrice: "300000000",
      standardPriceAtAcq: "200000000",
      standardPriceAtTransfer: "1000000001",
      ...APP,
      usePreHousingDisclosure: true,
    } as Record<string, unknown>;
    await seedForm(page, formOf([first, second]));
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.sent.companionAssets).toHaveLength(1);
  });
});

// ─── PH-6 다건 ───────────────────────────────────────────────────────────
async function seedMulti(page: Page, form: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax/multi");
  await page.waitForTimeout(2000);
  await page.evaluate(
    ([f]) => {
      const raw = sessionStorage.getItem("multi-transfer-tax-wizard");
      if (!raw) throw new Error("persist entry 없음");
      const parsed = JSON.parse(raw);
      parsed.state.form.properties = [{ propertyId: "ph-m1", propertyLabel: "양도 1번", form: f, completionPercent: 100 }];
      parsed.state.form.activePropertyIndex = 0;
      parsed.state.form.activeStep = "settings";
      sessionStorage.setItem("multi-transfer-tax-wizard", JSON.stringify(parsed));
    },
    [form],
  );
  await page.reload();
  await page.waitForTimeout(1500);
}

test.describe("PH-6 다건 — «단건 계산기에서만 지원» 차단은 환산 + PHD 에만", () => {
  test("감정 + PHD 잔재: 차단 문구 없이 다건 계산 200 / 환산 + PHD ON: 종전대로 차단", async ({ page }) => {
    test.setTimeout(150_000);
    // 긍정 짝(차단 유지) 먼저 — 환산 + PHD
    await seedMulti(page, formOf([phdAsset({ ...EST, usePreHousingDisclosure: true, ...PHD_ELEVEN })]));
    await page.getByRole("button", { name: "세액 계산" }).click();
    await expect(page.getByText(/단건 계산기에서만 지원/).first()).toBeVisible({ timeout: 15_000 });

    // 감정 + 플래그 잔재 — 차단 없이 계산
    await seedMulti(page, formOf([phdAsset({ ...APP, usePreHousingDisclosure: true, ...PHD_ELEVEN })]));
    const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 20_000 });
    await page.getByRole("button", { name: "세액 계산" }).click();
    const r = await resp;
    expect(r.status()).toBe(200);
    await expect(page.getByText(/단건 계산기에서만 지원/)).toHaveCount(0);
  });
});
