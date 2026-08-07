/**
 * E2E: 일반건물 **증여** — 미공시 시기 §164 max (「소득세법 시행령」 제163조 제9항 제1호·제2호)
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-164-max-phase3.plan.md` §7·§9
 *
 * §163⑨ 본문은 「**상속 또는 증여**받은 자산」이 대상이고 단서 1호·2호도 증여를 함께 든다.
 * 상속(#1132)만 적용돼 있어 증여는 신고가액이 그대로 쓰였다(실측 86,265,000원 과대).
 *
 *   GF-1. ② 비교값 미입력 → 차단 문구
 *   GF-2. 분리 OFF + 게이트 안 → 「파트별로 나누어 입력하세요」 안내
 *   GF-3. 분리 ON + ② 입력 → 계산까지 도달
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다
 *    (`__tests__/tax-engine/transfer-tax/gb-gift-164-max.anchor.test.ts`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 증여일 1988 — post-1985(기존 §163⑨ 게이트 안) · 토지·건물 §164 게이트 모두 안 */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: "gift",
            gbBuildingAcquisitionCause: "gift",
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "1988-05-01",
            acquisitionDate: "1988-05-01",
            donorAcquisitionDate: "1970-01-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            landAcquisitionPrice: "50000000",
            buildingAcquisitionPrice: "20000000",
            fixedAcquisitionPrice: "",
            gbAcqLandPricePerSqm: "1000000",
            gbAcqBuildingValue: "150000000",
            gbLandArea: "205",
            gbBuildingArea: "300",
            gbBuildingFootprintArea: "135",
            gbZoneType: "commercial",
            gbTransferLandPricePerSqm: "5514000",
            gbTransferBuildingValue: "259072400",
            actualSalePrice: "1620000000",
            ...over,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "1620000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

async function calc(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
}

test.describe("일반건물 증여 — 미공시 시기 §164 max", () => {
  test("GF-1: ② 비교값 미입력 → 차단", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, { gbAcqLandPricePerSqm: "", gbAcqBuildingValue: "" });
    await calc(page);

    await expect(
      page.getByText(/개별공시지가 고시 전 증여 토지는/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("GF-2: 분리 OFF + 게이트 안 → 파트별 입력 안내", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      fixedAcquisitionPrice: "70000000",
    });
    await calc(page);

    await expect(
      page.getByText(/파트별로 나누어 입력하세요/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("GF-3: 분리 ON + ② 입력 → 계산까지 도달", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await calc(page);
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });

    await expect(page.getByText(/입력하세요/)).toHaveCount(0);
    await expect(page.getByText("신고서 양식", { exact: false }).first()).toBeVisible();
  });

  test("GF-4: 게이트 밖(2005년 증여) + 분리 OFF는 종전대로 통과 (회귀 0)", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      landAcquisitionDate: "2005-05-01",
      acquisitionDate: "2005-05-01",
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionPrice: "",
      buildingAcquisitionPrice: "",
      fixedAcquisitionPrice: "70000000",
    });
    await calc(page);
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });

    await expect(page.getByText(/파트별로 나누어 입력하세요/)).toHaveCount(0);
  });
});

test.describe("일반건물 증여 — §164④ 등급환산 UI", () => {
  test("GF-5: 1990.8.30. 이전 증여 토지 → 등급환산 섹션이 열린다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    // 자산 카드의 취득 정보 섹션을 편다
    await expandAssetSection(page, 3);

    await expect(
      page.getByText(/1990\.8\.30\. 이전 증여 토지 — §164④ 등급환산/).first(),
    ).toBeVisible();
    await expect(page.getByText(/증여 신고가액 중/).first()).toBeVisible();
  });

  /**
   * 🔄 **정정(2026-08-07)** — 종전에는 「pre-1985는 §176조의2④ 영역이라 게이트가 꺼진다」로
   * 단언했다. 「소득세법 시행령」 제163조 제9항에 **「의제취득일」 조건이 없고**, §176조의2④는
   * 나목 계열이라 가목(§163⑨)이 확인되면 도달하지 않는다(법 §97①1호 단서).
   * 계획서: `docs/02-design/features/transfer-gb-pre1985-163-9.plan.md`
   */
  test("GF-6: pre-1985 증여도 섹션이 뜬다 (④ 게이트와 같은 범위)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, { landAcquisitionDate: "1980-03-01", acquisitionDate: "1980-03-01" });
    await expandAssetSection(page, 3);

    await expect(page.getByText(/§164④ 등급환산/).first()).toBeVisible();
  });
});
