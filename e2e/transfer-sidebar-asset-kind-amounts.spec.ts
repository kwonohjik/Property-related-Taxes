/**
 * 양도세 사이드바 — **자산 종류별 취득가액·필요경비 표시** (2026-08-11).
 *
 * 종전에는 사이드바가 취득가액을 `fixedAcquisitionPrice`에서만 읽어, 그 필드를 쓰지 않는
 * 자산 종류에서 «-»/«계산 후 표시»에 머물렀다. 특히 **일반건물은 계산을 마친 뒤에도** 값이
 * 나오지 않았다 — 엔진이 폼 자산 1건을 자산카드 여러 장으로 분해해 `apportioned[].assetId`가
 * 카드 ID(`land_business` 등)로 돌아오는데 사이드바는 `"primary"`만 찾았기 때문이다
 * (`general-building-route-cards.ts:200` ↔ `transfer-per-asset-summary.ts`).
 *
 * 산식 정확성은 vitest anchor(`__tests__/lib/transfer-per-asset-summary.test.ts` B-1~B-13)가
 * 검증한다. 본 E2E는 **브라우저에서 실제로 렌더되는지**(폼→계산→사이드바 배선)를 확인한다.
 *
 * 비-worktree 실행: npx playwright test e2e/transfer-sidebar-asset-kind-amounts.spec.ts
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-sidebar-asset-kind-amounts.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 일반건물 환산 시드 (사례 31 베이스 — general-building-97-2-swap.spec.ts와 동일 물건). */
function gbEstimatedSeed() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "general_building",
          acquisitionCause: "purchase",
          acquisitionDate: "1999-05-24",
          useEstimatedAcquisition: true,
          gbLandArea: "85",
          gbBuildingArea: "180.96",
          gbBuildingFootprintArea: "90.48",
          gbTransferLandPricePerSqm: "10830000",
          gbTransferBuildingValue: "20629440",
          gbAcqLandPricePerSqm: "2800000",
          gbAcqBuildingValue: "28144700",
          gbBuildingAcquisitionCause: "purchase",
          gbZoneType: "commercial",
          gbIsMetropolitan: true,
          capitalExpenditure: "5000000",
          transferExpense: "3000000",
        }],
        transferDate: "2023-02-19",
        filingDate: "2023-04-30",
        contractTotalPrice: "925000000",
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

/** 다필지 토지 실가 2필지 — 계산 전에도 필지 합계가 확정된다. */
function multiParcelSeed() {
  const parcel = (id: string, price: string, capex: string) => ({
    id,
    acquisitionDate: "2015-03-10",
    acquisitionMethod: "actual",
    acquisitionPrice: price,
    acquisitionArea: "100",
    transferArea: "100",
    standardPricePerSqmAtAcq: "",
    standardPricePerSqmAtTransfer: "",
    expenses: "",
    capitalExpenditure: capex,
    transferExpense: "",
    useDayAfterReplotting: false,
    replottingConfirmDate: "",
    useExchangeLandReduction: false,
    entitlementArea: "",
    allocatedArea: "",
    priorLandArea: "",
    compensationPerSqm: "",
    compensationBasisStdPrice: "",
    areaScenario: "same",
  });
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "land",
          acquisitionCause: "purchase",
          acquisitionDate: "2015-03-10",
          parcelMode: true,
          parcels: [parcel("p1", "200000000", "1000000"), parcel("p2", "300000000", "2000000")],
          actualSalePrice: "925000000",
        }],
        transferDate: "2023-02-19",
        filingDate: "2023-04-30",
        contractTotalPrice: "925000000",
        householdHousingCount: "1",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

/**
 * 재개발 원조합원 실가 — 취득가액 표시 범위가 「인가 전 분」이라 라벨이 갈린다.
 * (인가 후 분은 분양가 = 권리가액 ± 청산금으로 따로 산정 — `RedevelopmentBlock.tsx:341`.)
 */
function redevActualSeed() {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "redevelopment_apt",
          acquisitionCause: "purchase",
          acquisitionDate: "2005-04-09",
          useEstimatedAcquisition: false, // 실가 모드 — 인가전 분 취득가액 입력 노출
          redevSubject: "apt",
          redevApprovalLawBasis: "urban_renovation_art_74",
          redevOriginalAssetType: "housing",
          redevSettlementDirection: "pay",
          redevApprovalDate: "2009-10-23",
          redevRightsValue: "219218500",
          redevSettlementAmount: "92781500",
          redevActualAcquisitionPrice: "180000000",
          redevPreApprovalExpenses: "2000000",
          /**
           * ⚠️ 「인가후 필요경비」는 **승계조합원 전용 칸**이다(`RedevelopmentBlock.tsx` —
           *    `redevIsSuccessorMember === "yes"` 게이트 안). 이 seed는 원조합원이므로
           *    화면에서는 만들 수 없는 상태이고, 재수화 시 마이그레이션이 비운다(U1-02).
           *    seed에 남겨 **그 정규화가 실제로 도는지**를 아래 단언이 지키게 한다.
           */
          redevPostApprovalExpenses: "3000000",
        }],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "525000000",
        householdHousingCount: "2",
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, s: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), s);
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

/** 사이드바에서 라벨 다음 줄의 금액/상태 텍스트. */
function sidebarRow(page: Page, label: string) {
  return page
    .locator('[data-slot="wizard-sidebar"]')
    .locator("div.text-sm", { has: page.getByText(label, { exact: true }) })
    .first();
}

test.describe("사이드바 자산 종류별 취득가액·필요경비", () => {
  test("일반건물 환산 — 계산 후 취득가액·필요경비가 사이드바에 표시된다", async ({ page }) => {
    await seed(page, gbEstimatedSeed());

    const aside = page.locator('[data-slot="wizard-sidebar"]');
    await expect(aside.getByText("양도가액")).toBeVisible();

    // 계산 전 — 2026-08-11부터 전용 엔진 함수를 재사용한 **환산 프리뷰**가 표시된다
    // (종전에는 «계산 후 표시»였다). 그 값이 계산 후와 같은지는
    // `transfer-sidebar-estimated-preview.spec.ts`가 전담한다.
    await expect(sidebarRow(page, "취득가액")).toContainText(/[0-9]{1,3}(,[0-9]{3})+/);

    // 계산 실행
    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });

    // 결과 화면에는 사이드바가 없다(`TransferTaxCalculator.tsx:484` — isResult 분기).
    // 실사용 흐름대로 입력 단계로 복귀하면 계산 결과를 반영한 사이드바가 보인다.
    await page.getByRole("button", { name: "이전" }).first().click();
    await expect(page.locator('[data-slot="wizard-sidebar"]')).toBeVisible();

    // ── 핵심 회귀 가드 — 계산 후에는 «계산 후 표시»·«-»가 남아 있으면 안 된다 ──
    const acq = sidebarRow(page, "취득가액");
    await expect(acq).not.toContainText("계산 후 표시");
    await expect(acq).not.toContainText("-");
    // 금액(콤마 포함 숫자)이 렌더된다
    await expect(acq).toContainText(/[0-9]{1,3}(,[0-9]{3})+/);

    const exp = sidebarRow(page, "필요경비");
    await expect(exp).not.toContainText("계산 후 표시");
    await expect(exp).toContainText(/[0-9]{1,3}(,[0-9]{3})+/);
  });

  test("재개발 실가 — 「인가전 분 취득가액」 라벨로 구분 표시된다", async ({ page }) => {
    await seed(page, redevActualSeed());

    const aside = page.locator('[data-slot="wizard-sidebar"]');
    // 표시 범위가 자산 전체가 아니므로 라벨이 갈린다 — 일반 「취득가액」은 나오지 않는다.
    await expect(aside.getByText("인가전 분 취득가액", { exact: true })).toBeVisible();
    await expect(aside.getByText("취득가액", { exact: true })).toHaveCount(0);

    // §166 전용 필드에서 읽은 금액 (redevActualAcquisitionPrice)
    await expect(sidebarRow(page, "인가전 분 취득가액")).toContainText("180,000,000");
    // 필요경비는 인가 전·후 합이라 범위 구분이 없다 — 라벨 유지.
    // 원조합원이므로 인가후 3,000,000은 마이그레이션이 비운다(U1-02) ⇒ 인가전 2,000,000만 남는다.
    await expect(sidebarRow(page, "필요경비")).toContainText("2,000,000");
    await expect(sidebarRow(page, "필요경비")).not.toContainText("5,000,000");
  });

  test("다필지 토지 실가 — 계산 전에도 필지 합계가 표시된다", async ({ page }) => {
    await seed(page, multiParcelSeed());

    // 필지별 실가는 입력 즉시 확정 — 계산을 기다릴 이유가 없다.
    // 취득가액 200,000,000 + 300,000,000 / 필요경비 1,000,000 + 2,000,000
    await expect(sidebarRow(page, "취득가액")).toContainText("500,000,000");
    await expect(sidebarRow(page, "필요경비")).toContainText("3,000,000");
  });
});
