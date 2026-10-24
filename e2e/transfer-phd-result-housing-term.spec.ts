/**
 * 양도세 PHD 결과 화면 용어 — 소득세법 시행령 §164⑦ 산식 결과의 이름이 주택 종류로 갈린다 (PHD 결과 용어 E2E)
 *
 * 계획서: docs/00-pm/phd-appraisal-dead-end.plan.md §9.4
 * 짝 anchor(vitest): __tests__/calc/phd-result-housing-term.anchor.test.tsx
 *
 *   단독·다가구 → «환산 개별주택가격» · 공동주택 → «환산 공동주택가격» · 이 둘 외의 조어(«추정» 등) 금지.
 *   주택 종류는 입력 위젯 라디오의 폼 필드(`phdHousingType` — 표시 축, API 에 싣지 않는다)에서 결과 화면으로 내려간다.
 *   필드가 없는 옛 저장 세션은 «환산 개별주택가격»(종전 표기)이다.
 *
 * worktree 실행: E2E_PORT=3306 npx playwright test e2e/transfer-phd-result-housing-term.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

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

function phdForm(assetOver: Record<string, unknown>) {
  const asset = {
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
    useEstimatedAcquisition: true,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
    usePreHousingDisclosure: true,
    ...PHD_ELEVEN,
    ...assetOver,
  } as Record<string, unknown>;
  return {
    ...createDefaultTransferFormData(),
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets: [asset],
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

async function seedAndCalc(page: Page, formData: Record<string, unknown>) {
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
    if (n === 1) break;
  }
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step, exact: true }).first().click();
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const r = await resp;
  expect(r.status()).toBe(200);
  const body = r.request().postDataJSON() as Record<string, unknown>;
  const section = page.locator('[data-print-section="phd"]');
  await section.waitFor();
  return { body, text: ((await section.textContent()) ?? "").replace(/\s+/g, " ") };
}

const count = (s: string, sub: string) => s.split(sub).length - 1;

test.describe("양도세 PHD 결과 — 환산 …가격 용어", () => {
  test("TH-1 단독·다가구 → 환산 개별주택가격 5곳 · 환산 공동주택가격 없음", async ({ page }) => {
    test.setTimeout(120_000);
    const { text } = await seedAndCalc(page, phdForm({ phdHousingType: "individual" }));
    expect(count(text, "환산 개별주택가격")).toBe(5);
    expect(text).not.toContain("환산 공동주택가격");
    expect(text).toContain("개별주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)");
    expect(text).not.toContain("공동주택가격 미공시 취득 환산");
    expect(text).not.toContain("추정");
  });

  test("TH-2 공동주택 → 환산 공동주택가격 5곳 · 환산 개별주택가격·추정 없음 · 요청 본문은 단독과 같다(표시 축)", async ({ page }) => {
    test.setTimeout(120_000);
    const apt = await seedAndCalc(page, phdForm({ phdHousingType: "apartment" }));
    expect(count(apt.text, "환산 공동주택가격")).toBe(5);
    expect(apt.text).toContain("환산 공동주택가격 (취득시)");
    expect(apt.text).toContain("공동주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)");
    expect(apt.text).not.toContain("개별주택가격 미공시 취득 환산");
    expect(apt.text).not.toContain("환산 개별주택가격");
    expect(apt.text).not.toContain("추정");
    expect(JSON.stringify(apt.body)).not.toContain("phdHousingType");
    const ind = await seedAndCalc(page, phdForm({ phdHousingType: "individual" }));
    expect(JSON.stringify(apt.body)).toBe(JSON.stringify(ind.body));
  });

  test("TH-3 옛 저장 세션(주택 종류 필드 없음) → 종전 표기 환산 개별주택가격", async ({ page }) => {
    test.setTimeout(120_000);
    const form = phdForm({});
    delete (form.assets[0] as Record<string, unknown>).phdHousingType;
    const { text } = await seedAndCalc(page, form);
    expect(count(text, "환산 개별주택가격")).toBe(5);
    expect(text).not.toContain("환산 공동주택가격");
    expect(text).toContain("개별주택가격 미공시 취득 환산 (소득세법 시행령 §164⑦)");
    expect(text).not.toContain("공동주택가격 미공시 취득 환산");
  });
});
