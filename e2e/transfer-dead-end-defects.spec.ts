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
import { withPrimary } from "./_helpers/validation-field-jump-cases";

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

/** 폼 전체를 시드한다 — 입력칸 이동 케이스와 같은 통과 기본값(`withPrimary`)에서 출발할 때 */
async function seedFormAndOpen(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 },
  );
  await page.reload();
  await ready(page);
}

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

test.describe("R2 — 재개발 실거래가 모드에 남은 §164⑦ 값(A·최초공시 단가)이 막다른 오류를 만들지 않는다", () => {
  /** 원조합원 완공 APT · 주택 출자 · 청산금 납부 · **실거래가** — 통과하는 입력 */
  const actualApt = {
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevOriginalAssetType: "housing",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "50000000",
    acquisitionDate: "2015-03-01",
    redevApprovalDate: "2018-03-01",
    redevRightsValue: "300000000",
    redevPreApprovalExpenses: "0",
    redevActualAcquisitionPrice: "200000000",
    useEstimatedAcquisition: false,
  };
  const dateMsg = /최초공시일도 입력하세요/;

  for (const [name, stale] of [
    ["A(최초공시 주택가격)", { redevFirstDisclosureHousingPrice: "100000000" }],
    ["최초공시 당시 토지 단가", { redevLandPricePerSqmAtFirst: "600000" }],
  ] as const) {
    test(`${name}가 남아 있어도 실거래가 모드는 막지 않는다`, async ({ page }) => {
      await seedAndOpen(page, { ...actualApt, ...stale });
      // 전제 — 실거래가 모드에는 최초공시일 칸이 없다(환산 모드 전용 섹션). 있으면 막다른 오류가 아니다.
      await expect(page.locator('[data-asset-card-index="0"] [data-field="redevFirstDisclosureDate"]')).toHaveCount(0);

      await next(page).click();
      // 수정 전에는 이 오류 **하나만** 떠서 1단계에 갇혔다(probe 실측). 이 입력은 그 밖에 통과하므로
      // 다음 단계로 넘어가는 것이 수정의 증거다 — 부재 단언만으로는 클릭 유실과 구별되지 않는다.
      await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
      await expect(panel(page).getByRole("button", { name: dateMsg })).toHaveCount(0);
    });
  }
});

test.describe("G3 — 일반건물 분리 OFF: 환산을 고른 뒤 취득원인을 상속·증여로 바꿔도 막히지 않는다", () => {
  /** 분리 OFF 일반건물 — 매매 실거래가로 통과하고, 상속·증여 평가액도 미리 채워 둔다(원인만 바꾸면 통과). */
  const unifiedGb = {
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: false,
    acquisitionDate: "2015-03-01",
    landAcquisitionDate: "2015-03-01",
    gbLandArea: "200",
    gbBuildingArea: "300",
    gbBuildingFootprintArea: "100",
    gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "5000000",
    gbTransferBuildingValue: "300000000",
    gbAcqLandPricePerSqm: "2000000",
    gbAcqBuildingValue: "150000000",
    fixedAcquisitionPrice: "500000000",
    decedentAcquisitionDate: "2005-01-01",
    publishedValueAtInheritance: "300000000",
    gbBuildingInheritedValue: "100000000",
  };
  const blockMsg = /「실거래가」를 선택하세요/;
  const clickRadio = async (page: Page, selector: string) => {
    const radio = page.locator(selector);
    await radio.evaluate((el: HTMLInputElement) => el.click());
    await expect(radio).toBeChecked();
  };

  test("매매 → 환산 → 상속", async ({ page }) => {
    await seedAndOpen(page, unifiedGb);
    await clickRadio(page, '[data-asset-card-index="0"] input[type="radio"][name^="acqBasisMode"][value="estimated"]');
    await clickRadio(page, '[data-asset-card-index="0"] input[type="radio"][name^="gbUnifiedAcquisitionCause-"][value="inheritance"]');
    // 전제 — 상속 카드에는 취득가액 산정 방식 라디오가 없다(있으면 막다른 오류가 아니다)
    await expect(page.locator('[data-asset-card-index="0"] input[name^="acqBasisMode"]')).toHaveCount(0);

    await next(page).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
    await expect(panel(page).getByRole("button", { name: blockMsg })).toHaveCount(0);
  });

  test("분리 ON 파트 라디오로 환산 → 분리 OFF", async ({ page }) => {
    await seedAndOpen(page, {
      ...unifiedGb,
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
      hasSeperateLandAcquisitionDate: true,
      landAcqMode: "estimated",
      fixedAcquisitionPrice: "",
    });
    const sw = page.locator('[data-asset-card-index="0"] [data-field="hasSeperateLandAcquisitionDate"] [role="switch"]');
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await sw.evaluate((el: HTMLElement) => el.click()); // 접힌 섹션 안 — aria-checked(React 렌더)로 반영을 확인한다
    await expect(sw).toHaveAttribute("aria-checked", "false");

    await next(page).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
    await expect(panel(page).getByRole("button", { name: blockMsg })).toHaveCount(0);
  });

  test("복원된 폼 — 분리 OFF 상속에 남은 환산 플래그", async ({ page }) => {
    await seedAndOpen(page, {
      ...unifiedGb,
      acquisitionCause: "inheritance",
      gbBuildingAcquisitionCause: "inheritance",
      useEstimatedAcquisition: true,
      fixedAcquisitionPrice: "",
    });
    await next(page).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
    await expect(panel(page).getByRole("button", { name: blockMsg })).toHaveCount(0);
  });
});

test.describe("A1 — 실거래가 모드 토지 증환지: 「종전토지 면적」 칸이 있다", () => {
  const areaMsg = /종전토지 면적\(① 기본정보의 취득 당시 면적\)을 입력하세요/;

  test("오류 → 그 칸으로 이동 → 입력하면 다음 단계", async ({ page }) => {
    await seedFormAndOpen(
      page,
      withPrimary({ assetKind: "land", areaScenario: "increase", replottingConfirmDate: "2016-01-01", acquisitionArea: "", transferArea: "100" }),
    );
    await next(page).click();
    const issue = panel(page).getByRole("button", { name: areaMsg });
    await expect(issue).toBeVisible();
    await issue.click();

    // 수정 전에는 이 칸이 실거래가 모드에 없어 카드로 후퇴했다(계획서 §7-2 probe)
    const input = page.locator('[data-asset-card-index="0"] [data-field="acquisitionArea"] input').first();
    await expect(input).toBeFocused();
    await input.fill("120");

    await next(page).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
  });
});

test.describe("G2 — 건물 기준시가 고시 전 상속 건물: 「취득시 건물기준시가」 칸이 있다", () => {
  const stdMsg = /취득시 건물기준시가 총액을 입력하세요\. 건물 기준시가 고시 전 상속/;

  test("오류 → 그 칸으로 이동 → 입력하면 다음 단계 (자본적지출·일괄 가액 없음)", async ({ page }) => {
    await seedFormAndOpen(
      page,
      withPrimary({
        assetKind: "general_building",
        acquisitionCause: "inheritance",
        gbBuildingAcquisitionCause: "inheritance",
        acquisitionDate: "1995-06-01",
        landAcquisitionDate: "1995-06-01",
        decedentAcquisitionDate: "1990-01-01",
        publishedValueAtInheritance: "300000000",
        gbBuildingInheritedValue: "100000000",
        gbLandArea: "200",
        gbBuildingArea: "300",
        gbBuildingFootprintArea: "100",
        gbZoneType: "general_residential",
        gbTransferLandPricePerSqm: "5000000",
        gbTransferBuildingValue: "300000000",
        gbAcqLandPricePerSqm: "2000000",
        gbAcqBuildingValue: "",
        fixedAcquisitionPrice: "",
      }),
    );
    await next(page).click();
    const issue = panel(page).getByRole("button", { name: stdMsg });
    await expect(issue).toBeVisible();
    await issue.click();

    const input = page.locator('[data-asset-card-index="0"] [data-field="gbAcqBuildingValue"] input').first();
    await expect(input).toBeFocused();
    await input.fill("120000000");

    await next(page).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
  });
});

test.describe("B2 — 부담부증여 주택 「시가 + 환산취득가액」: 양도시·취득시 기준시가 칸이 있다", () => {
  const k5Msg = /부담부증여 환산취득가액 — 「② 양도정보」의 양도시·취득시 기준시가/;
  const k5House = withPrimary({
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "500000000",
    bgAcquisitionMethod: "converted",
    bgLendingDepositTotal: "100000000",
    bgDonorRelation: "lineal_descendant",
    standardPriceAtTransfer: "",
    standardPriceAtAcq: "",
  });

  test("오류 → 두 칸으로 차례로 이동 → 입력하면 다음 단계", async ({ page }) => {
    await seedFormAndOpen(page, k5House);
    const card = page.locator('[data-asset-card-index="0"]');

    for (const [field, value] of [["standardPriceAtTransfer", "300000000"], ["standardPriceAtAcq", "100000000"]] as const) {
      await next(page).click();
      const issue = panel(page).getByRole("button", { name: k5Msg });
      await expect(issue).toBeVisible();
      await issue.click();
      // 수정 전에는 시가 모드가 두 칸을 모두 숨겨 이동할 곳이 없었다.
      // 포커스는 그 칸 **안**(단가·면적·총액 중 하나)이면 된다 — 입력칸 이동 spec과 같은 판정
      await expect
        .poll(() => page.evaluate((f) => !!document.activeElement?.closest(`[data-field="${f}"]`), field))
        .toBe(true);
      await card.locator(`[data-field="${field}"]`).getByLabel(/기준시가/).last().fill(value);
    }

    await next(page).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
  });
});

test.describe("B1 — 토지 + 이월과세 + 부담부증여 시가·실지취득가액: 화면의 토지 칸 하나로 통과한다", () => {
  const donorMsg = /이월과세가 적용되므로 「당초 증여자」.*실지취득가액/;
  const landCarryK4 = withPrimary({
    assetKind: "land",
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2014-01-01",
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "spouse",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "200000000",
    },
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "500000000",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionLand: "200000000",
    bgLendingDepositTotal: "100000000",
    bgDonorRelation: "lineal_descendant",
    bgCoDonorActualAcquisitionLand: "",
  });

  test("오류 → 토지 칸으로 이동 → 입력하면 다음 단계", async ({ page }) => {
    await seedFormAndOpen(page, landCarryK4);
    const card = page.locator('[data-asset-card-index="0"]');
    // 전제 — 토지 자산의 「당초 증여자」 실지취득가액 칸은 토지 하나뿐이다(건물·총액 칸 없음)
    await expect(card.locator('[data-field="bgCoDonorActualAcquisitionBuilding"], [data-field="bgCoDonorActualAcquisitionTotal"]')).toHaveCount(0);

    await next(page).click();
    const issue = panel(page).getByRole("button", { name: donorMsg });
    await expect(issue).toBeVisible();
    await issue.click();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-field="bgCoDonorActualAcquisitionLand"]')))
      .toBe(true);
    await card.locator('[data-field="bgCoDonorActualAcquisitionLand"] input').fill("150000000");

    await next(page).click();
    await expect(panel(page).getByRole("button", { name: donorMsg })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
  });
});

test.describe("별건 — 토지 부담부증여 「시가 + 환산」: 양도시 기준시가를 비우면 막는다", () => {
  // 비우면 엔진이 토지 취득가액을 0으로 낸다(`burdened-gift-apportionment.ts` K-5 `landStdPriceAtTransfer === 0`)
  const transferStdMsg = /부담부증여 환산취득가액 — 양도시 기준시가/;
  const landK5 = withPrimary({
    assetKind: "land",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "500000000",
    bgAcquisitionMethod: "converted",
    bgLendingDepositTotal: "100000000",
    bgDonorRelation: "lineal_descendant",
    acquisitionArea: "100",
    transferArea: "100",
    standardPriceAtAcq: "100000000",
    standardPriceAtTransfer: "",
    standardPricePerSqmAtTransfer: "",
  });

  test("비우면 오류 → 그 칸으로 이동", async ({ page }) => {
    await seedFormAndOpen(page, landK5);
    await next(page).click();
    // 수정 전에는 오류 없이 다음 단계로 넘어갔다(취득가액 0으로 계산)
    const issue = panel(page).getByRole("button", { name: transferStdMsg });
    await expect(issue).toBeVisible();
    await issue.click();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-field="standardPriceAtTransfer"]')))
      .toBe(true);

    // ㎡당 단가를 넣으면 통과한다 — 면적은 시드의 100㎡(④와 같은 해석: 단가 × 양도면적)
    await page
      .locator('[data-asset-card-index="0"] [data-field="standardPriceAtTransfer"]')
      .getByLabel("㎡당 단가 (원/㎡)")
      .fill("3000000");
    await next(page).click();
    await expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
  });
});
