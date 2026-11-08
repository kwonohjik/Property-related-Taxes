/**
 * E2E: 재개발 완공 APT «양도일 기준 조정대상지역» 칸 (A-3 후속 — 브라우저 확인).
 *
 * 계획서 `docs/00-pm/regulated-rights-transfer-toggle.plan.md` Q-1 a: 재개발 완공 APT는 주택과 같은 칸(④ 보유 상황)을 갖는다.
 * 렌더 단위 테스트(anchor K-1)로만 확인했던 것을 실제 화면에서 본다 — 칸 노출·직접 선택 유지(단계 이탈 후 재진입)·요청 본문·세액.
 *
 * 시료: 원조합원 완공APT · 춘천(전 기간 미지정) · 양도 2026-08-01 · 세대 주택 2(명부 1채) — 칸 «아님» 409,935,000(0.45) ↔ «지정» 907,435,000(0.65, 중과).
 *
 * 실행: E2E_PORT=<워크트리 포트> npx playwright test e2e/transfer-redev-apt-regulated-at-transfer.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const ADDRESS = "강원특별자치도 춘천시 테스트동 1";

const ASSET = {
  ...makeDefaultAsset(1),
  assetKind: "redevelopment_apt",
  acquisitionCause: "purchase",
  acquisitionDate: "2008-01-01",
  fixedAcquisitionPrice: "",
  actualSalePrice: "2000000000",
  addressJibun: ADDRESS,
  redevSubject: "apt",
  redevApprovalDate: "2016-06-01",
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevOriginalAssetType: "housing",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "100000000",
  redevRightsValue: "900000000",
  redevIsSuccessorMember: "no",
  redevActualAcquisitionPrice: "400000000",
  residenceInputMode: "interval",
  residencePeriods: [{ moveInDate: "2019-06-01", moveOutDate: "2024-06-01" }],
};

const HOUSE = {
  id: "h1",
  region: "capital",
  acquisitionDate: "2014-01-01",
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  acquisitionOrigin: "general",
};

const SEED = {
  state: {
    formData: {
      assets: [ASSET],
      transferDate: "2026-08-01",
      filingDate: "2026-10-31",
      contractTotalPrice: "2000000000",
      isOneHousehold: true,
      residencePeriodMonths: "60",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: false,
      householdNoPresaleRightsConfirmed: true,
      // 값은 false로 둔다 — 주소(춘천 = 전 기간 미지정) 자동판별이 같은 값을 낸다. 사용자가 칸을 만지지 않았으면 판정값이 저장값을 이긴다.
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      houses: [HOUSE],
      presaleRights: [],
    },
    pendingMigration: false,
  },
  version: 0,
};

const TOGGLE = "양도일 기준 조정대상지역";

async function seedAndOpen(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), SEED);
  const regulatedResp = page.waitForResponse((r) => r.url().includes("/api/address/regulated-area"));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).click();
  await regulatedResp;
}

async function calculate(page: Page) {
  for (const step of ["감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step }).first().click();
  }
  const resp = page.waitForResponse(
    (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: /계산하기/ }).click();
  return resp;
}

test.describe("재개발 완공 APT «양도일 기준 조정대상지역» 칸 — A-3", () => {
  test("칸이 있고, 직접 «지정»을 고르면 단계를 나갔다 와도 유지되며 중과로 계산된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page);

    const toggle = page.getByRole("switch", { name: TOGGLE });
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();

    // 단계를 나갔다 다시 들어와도 직접 선택이 유지된다(Step4 마운트가 지우지 않는다).
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("button", { name: "보유 상황" }).click();
    await expect(page.getByRole("switch", { name: TOGGLE })).toBeChecked();

    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const sent = resp.request().postDataJSON() as Record<string, unknown>;
    expect(sent.isRegulatedArea).toBe(true);
    const body = await resp.json();
    expect(body.data.result.determinedTax).toBe(907_435_000);
    expect(body.data.result.appliedRate).toBe(0.65);
  });

  test("대조 — 칸을 만지지 않으면 주소 판정(미지정)대로 일반 누진세율이다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page);
    await expect(page.getByRole("switch", { name: TOGGLE })).not.toBeChecked();

    const resp = await calculate(page);
    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const sent = resp.request().postDataJSON() as Record<string, unknown>;
    expect(sent.isRegulatedArea).toBe(false);
    const body = await resp.json();
    expect(body.data.result.determinedTax).toBe(409_935_000);
    expect(body.data.result.appliedRate).toBe(0.45);
  });
});
