/**
 * 양도세 막다른 오류·입력 유실 — 재현 → 수정 (2026-09-30)
 *
 * 출처: `docs/00-pm/transfer-validation-field-jump.plan.md` §7-2·§7-3 (입력칸 이동 작업 중 발견, 별도 작업)
 *
 * 각 테스트는 **수정 전 코드에서 실패**하는 것을 먼저 확인한 재현이다.
 *
 * worktree 실행: E2E_PORT=3101 npx playwright test e2e/transfer-dead-end-defects.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function ready(page: Page) {
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // hydration 전 클릭은 조용히 유실된다(e2e/CLAUDE.md §6)
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

/** 앱 기본 폼에서 출발한다 — 최소 필드만 손으로 적으면 신규 배열 필드 누락으로 화면이 죽는다. */
async function seedAndOpen(page: Page, assetPatch: Record<string, unknown>, formPatch: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = {
    ...createDefaultTransferFormData(),
    transferDate: "2024-03-01",
    contractTotalPrice: "600000000",
    ...formPatch,
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", actualSalePrice: "600000000", ...assetPatch }],
  };
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await ready(page);
}

test.describe("R1 — 승계조합원 입주권 추계 모드가 새로고침에 사라지지 않는다", () => {
  const successorRight = {
    assetKind: "right_to_move_in",
    isSuccessorRightToMoveIn: true,
    redevSubject: "right",
    acquisitionDate: "2020-05-01",
    redevApprovalDate: "2018-10-23",
    successorRightAcqPrice: "350000000",
    useEstimatedAcquisition: false,
  };
  const modeRadio = (page: Page, mode: string) =>
    page.locator(`input[type="radio"][name^="successorAcqMode-"][value="${mode}"]`);

  for (const mode of ["appraisal", "salesCase"] as const) {
    test(`${mode} — 화면에서 고른 뒤 새로고침해도 유지`, async ({ page }) => {
      await seedAndOpen(page, successorRight);
      const radio = modeRadio(page, mode);
      await radio.evaluate((el: HTMLInputElement) => el.click());
      await expect(radio).toBeChecked();

      await page.reload();
      await ready(page);
      await expect(modeRadio(page, mode)).toBeChecked();
    });
  }
});

const panel = (page: Page) => page.getByTestId("validation-issues");
const next = (page: Page) => page.getByRole("button", { name: "다음", exact: true });

test.describe("G1 — 일반건물 건물만 이월과세: 건물 블록에 넣은 증여 사건 정보가 인정된다", () => {
  /** 통과하는 일반건물(분리 ON · 토지 매매 · 건물 이월과세). 사건 정보는 건물 블록 한 곳에만 있다. */
  const buildingOnlyCarryover = {
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "carryover_gift",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2012-03-01",
    acquisitionDate: "2015-03-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "",
    fixedAcquisitionPrice: "",
    gbLandArea: "200",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "100",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5000000",
    gbTransferBuildingValue: "300000000",
    gbAcqLandPricePerSqm: "2000000",
    gbAcqBuildingValue: "150000000",
    buildingCarryover: {
      ...CARRYOVER_DEFAULTS,
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "spouse",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "200000000",
    },
  };
  const registryMsg = /증여 등기접수일을 입력하세요/;

  test("화면의 유일한 등기접수일 칸에 입력하면 그 오류가 사라진다", async ({ page }) => {
    await seedAndOpen(page, buildingOnlyCarryover);

    await next(page).click();
    const issue = panel(page).getByRole("button", { name: registryMsg });
    await expect(issue).toBeVisible(); // 긍정 짝 — 이 오류가 먼저 떠야 아래 부재 단언이 의미를 갖는다
    await issue.click();

    // 입력칸 이동이 데려다준 칸 = 화면에 있는 유일한 「증여 등기접수일」
    const card = page.locator('[data-asset-card-index="0"] [data-field="carryover.giftRegistryDate"]');
    await expect(card).toHaveCount(1);
    await fillDateAndVerify(page, { year: "2020", month: "01", day: "01" }, { scope: card });

    await next(page).click();
    await expect(panel(page).getByRole("button", { name: registryMsg })).toHaveCount(0);
  });
});
