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
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";

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

test.describe("N1 — 비사업용 토지: 입력칸이 없는 지목에 남은 빈 기간 행이 막다른 오류를 만들지 않는다", () => {
  // 농지에서 「+ 기간 추가」로 만든 빈 행은 지목을 바꿔도 지워지지 않는다(스토어에 리셋 없음).
  // 사업용 사용기간 입력칸은 농지만, 거주 이력 입력칸은 농지·임야만 있다(엔진 소비처와 같다).
  const emptyBusinessRow = { startDate: "", endDate: "", usageType: "자경" };
  const emptyResidenceRow = { sigunguCode: "", sigunguName: "", startDate: "", endDate: "", hasResidentRegistration: false };
  const nblLand = (landType: string, extra: Record<string, unknown>) =>
    withPrimary({
      assetKind: "land",
      landNature: "farmland",
      acquisitionArea: "1000",
      transferArea: "1000",
      // 상세 입력 섹션의 렌더 게이트는 두 플래그가 모두 켜져야 한다(`AssetSectionExtras`)
      isNonBusinessLand: true,
      nblUseDetailedJudgment: true,
      nblLandType: landType,
      nblZoneType: "agriculture_forest",
      nblFarmingSelf: true,
      ...extra,
    });
  const goesToHolding = (page: Page) =>
    expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");

  for (const [name, landType, extra] of [
    ["임야 + 빈 사업용 사용기간 행", "forest", { nblBusinessUsePeriods: [emptyBusinessRow] }],
    ["기타토지 + 빈 사업용 사용기간 행", "other_land", { nblOtherPropertyTaxType: "separate", nblBusinessUsePeriods: [emptyBusinessRow] }],
    ["목장 + 빈 거주 이력 행", "pasture", { nblResidenceHistories: [emptyResidenceRow] }],
  ] as const) {
    test(`${name} → 막지 않고 다음 단계로`, async ({ page }) => {
      await seedFormAndOpen(page, nblLand(landType, extra));
      await next(page).click();
      // 수정 전에는 이 오류 하나가 떠서 1단계에 갇혔다 — 카드 안에 그 칸(앵커)이 0개라 이동도 못 했다
      await goesToHolding(page);
      await expect(panel(page).getByText(/번째 행/)).toHaveCount(0);
    });
  }

  test("🔑 긍정 짝 — 농지 + 빈 사업용 사용기간 행은 여전히 막고, 그 칸으로 이동한다", async ({ page }) => {
    await seedFormAndOpen(page, nblLand("farmland", { nblBusinessUsePeriods: [emptyBusinessRow] }));
    await next(page).click();
    const issue = panel(page).getByRole("button", { name: /사업용 사용기간\(자경 등\) 1번째 행/ });
    await expect(issue).toBeVisible(); // 게이트를 지운 게 아니다 — 이 오류가 먼저 떠야 위 「막지 않는다」가 의미를 갖는다
    await issue.click();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-field="nblBusinessUsePeriods.0.startDate"]')))
      .toBe(true);
  });

  test("🔑 긍정 짝 — 임야 + 빈 거주 이력 행은 여전히 막는다 (재촌 판정 대상 — 입력칸이 있다)", async ({ page }) => {
    await seedFormAndOpen(page, nblLand("forest", { nblResidenceHistories: [emptyResidenceRow] }));
    await next(page).click();
    const issue = panel(page).getByRole("button", { name: /거주 이력 1번째 행/ });
    await expect(issue).toBeVisible();
    await issue.click();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-field="nblResidenceHistories.0.startDate"]')))
      .toBe(true);
  });
});

test.describe("C1 — 자경농지 상속: 본인 순 자경기간이 8년 이상이면 숨은 피상속인 값이 막다른 오류를 만들지 않는다", () => {
  // 본인 칸을 8년 미만에서 8년 이상으로 고치면 합산 토글·피상속인 칸이 사라지는데, 값은 스토어에 남는다.
  const farmingLand = (sf: Record<string, unknown>) =>
    withPrimary({
      assetKind: "land",
      landNature: "farmland",
      acquisitionCause: "inheritance",
      acquisitionDate: "2005-01-01",
      acquisitionArea: "1000",
      transferArea: "1000",
      reductions: [
        { type: "self_farming", farmingYears: "10", decedentFarmingYears: "5", useSelfFarmingIncorporation: false, ...sf },
      ],
    });
  const toReductionStep = async (page: Page) => {
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await next(page).click();
  };
  const goesToPenalty = (page: Page) =>
    expect(page.getByRole("button", { name: "가산세", exact: true })).toHaveAttribute("aria-current", "step");
  const aggregationBlock = /피상속인 경작기간을 합산하려면/;

  test("본인 10년 + 남은 피상속인 5년 + 토글 꺼짐 → 막지 않고 다음 단계로, 합산 칸은 숨겨져 있다", async ({ page }) => {
    await seedFormAndOpen(page, farmingLand({}));
    await toReductionStep(page);
    // 수정 전에는 이 오류 하나가 떠서 갇혔다 — 오류가 가리키는 칸(합산 토글)이 화면에 없다
    await goesToPenalty(page);
    await expect(panel(page).getByText(aggregationBlock)).toHaveCount(0);
  });

  test("🔑 긍정 짝 — 본인 7년이면 여전히 막고, 그 토글로 이동한다", async ({ page }) => {
    await seedFormAndOpen(page, farmingLand({ farmingYears: "7" }));
    await toReductionStep(page);
    const issue = panel(page).getByRole("button", { name: aggregationBlock });
    await expect(issue).toBeVisible(); // 게이트를 지운 게 아니다 — 이게 떠야 위 「막지 않는다」가 의미를 갖는다
    await issue.click();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-field="reduction.self_farming.heirContinuedFarming1Year"]')))
      .toBe(true);
  });

  test("🔑 긍정 짝 — 본인 8년이라도 결격 2년(순 6년)이면 합산 칸이 보이고 막는다 (엔진은 합산이 필요)", async ({ page }) => {
    await seedFormAndOpen(page, farmingLand({ farmingYears: "8", disqualifiedTaxPeriodsSelf: "2" }));
    await toReductionStep(page);
    const issue = panel(page).getByRole("button", { name: aggregationBlock });
    await expect(issue).toBeVisible();
    await issue.click();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-field="reduction.self_farming.heirContinuedFarming1Year"]')))
      .toBe(true);
  });
});

test.describe("C2 — §97 시리즈 「3개월 초과 공실」 선택이 새로고침에 사라지지 않는다", () => {
  // 복원 마이그레이션이 `hasVacancyOverGrace`를 매번 null로 되돌리던 것(구 키 → 3개월 새 질문 이관 의도가 새 키까지 지움)
  const rental97 = withPrimary({
    assetKind: "housing",
    acquisitionDate: "2000-01-01",
    reductions: [
      { ...getReductionDefault("rental_97_main"), rentalStartDate: "2000-01-01", constructionYear: "1995", rentIncreaseViolationMode: "none" },
    ],
  });
  for (const [label, value] of [["없음", "no"], ["있음", "yes"]] as const) {
    test(`「${label}」를 고른 뒤 새로고침해도 유지`, async ({ page }) => {
      await seedFormAndOpen(page, rental97);
      await page.getByRole("button", { name: "감면·공제" }).first().click();
      const radio = page.locator(`[data-field="reduction.rental_97_main.hasVacancyOverGrace"] input[value="${value}"]`);
      // 접힌 섹션 안이라 evaluate click, 반영은 checked로 확인
      await radio.evaluate((el: HTMLInputElement) => el.click());
      await expect(radio).toBeChecked();

      await page.reload();
      await ready(page);
      await page.getByRole("button", { name: "감면·공제" }).first().click();
      await expect(radio).toBeChecked();
    });
  }
});

test.describe("B1 — 증여로 바꾸면 사라지는 산정 방식 라디오에 남은 추계 플래그가 막다른 오류를 만들지 않는다 (§163⑨)", () => {
  // 증여 카드에는 「취득가액 산정 방식」 라디오가 없다(`CompanionAcqGiftBlock`). 매매에서 환산·감정가액·매매사례가액을 고른 뒤
  // 원인을 증여로 바꾸면 플래그가 남아 「실거래가 모드로…」 오류가 뜨는데 고를 라디오가 없었다. ④는 이 플래그를 엔진에 그대로 보내므로
  // (환산 계산) 검증을 좁히지 않고 원인 전환에서 비운다 — 일반건물 분리 OFF의 G3와 같은 규칙.
  const blockMsg = /증여 취득 자산은 환산취득가·감정가액·매매사례가액을 지원하지 않습니다/;
  const radio = (page: Page, sel: string) => page.locator(`[data-asset-card-index="0"] ${sel}`);
  const clickRadio = async (page: Page, sel: string) => {
    const r = radio(page, sel);
    await r.evaluate((el: HTMLInputElement) => el.click());
    await expect(r).toBeChecked();
  };
  const toHolding = (page: Page) =>
    expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");

  for (const [kind, extra] of [
    ["housing", {}],
    ["land", { landNature: "farmland", acquisitionArea: "1000", transferArea: "1000" }],
    ["building", {}],
    ["presale_right", {}],
    ["commercial_building", {}],
  ] as const) {
    for (const mode of ["estimated", "appraisal", "sales_case"] as const) {
      test(`${kind}: 매매 → ${mode} → 증여`, async ({ page }) => {
        await seedFormAndOpen(page, withPrimary({ assetKind: kind, acquisitionCause: "purchase", ...extra }));
        await clickRadio(page, `input[type="radio"][name^="acqBasisMode"][value="${mode}"]`);
        await clickRadio(page, 'input[type="radio"][name^="acquisitionCause-"][value="gift"]');
        // 전제 — 증여 카드에는 산정 방식 라디오가 없다(있으면 막다른 오류가 아니다)
        await expect(page.locator('[data-asset-card-index="0"] input[name^="acqBasisMode"]')).toHaveCount(0);

        await next(page).click();
        await expect(panel(page).getByRole("button", { name: blockMsg })).toHaveCount(0);
        await toHolding(page);
      });
    }
  }
});

test.describe("별건 B2 — 소유자 분리 + 매매 + 실거래가: 취득시 기준시가는 비율이 쓰일 때만 요구하고, 요구하면 그 칸이 있다 (⑧ V8 ↔ ⑫·술어)", () => {
  // ⑧ V8은 ㎡당 공시지가·면적·총액을 **무조건** 요구했는데 (가) 본인 파트 취득가액을 입력하면 카드가 닫히고(술어 거짓),
  // (나) 두 파트를 비우면 카드는 열리지만 주택은 총액 칸만 있고 ㎡당 칸이 없었다. 소유자 분리 토글은 「취득일 다름」을 강제로 켠다
  // (`CompanionAcquisitionCauseSection` onSelfOwnsChange) — 시드도 그 상태로 만든다.
  const ownerSplit = (extra: Record<string, unknown>) =>
    withPrimary({
      assetKind: "housing",
      acquisitionCause: "purchase",
      selfOwns: "land_only",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "",
      useEstimatedAcquisition: false,
      // 양도가액 안분 근거(양도시 기준시가) — 별개 축이라 미리 채워 둔다(비면 그 오류가 먼저 난다)
      standardPricePerSqmAtTransfer: "3000000",
      transferArea: "100",
      acquisitionArea: "100", // ① 기본정보 「토지 면적」은 두 키를 함께 쓴다 — 한쪽만 시드하면 화면엔 100이 보이는데 ⑧은 비었다고 한다
      buildingStandardPriceAtTransfer: "100000000",
      ...extra,
    });
  const ownerMsg = /토지·건물 소유자가 다르면 본인 소유분만 과세하므로/;
  const toHolding = (page: Page) =>
    expect(page.getByRole("button", { name: "보유 상황", exact: true })).toHaveAttribute("aria-current", "step");
  const focusIn = (page: Page, key: string) =>
    expect.poll(() => page.evaluate((k) => !!document.activeElement?.closest(`[data-field="${k}"]`), key)).toBe(true);

  test("(가) 본인 파트(토지) 취득가액을 입력했으면 기준시가 없이 통과", async ({ page }) => {
    await seedFormAndOpen(page, ownerSplit({ landAcquisitionPrice: "200000000" }));
    await next(page).click();
    await expect(panel(page).getByText(ownerMsg)).toHaveCount(0);
    await toHolding(page);
  });

  test("🔑 (나) 두 파트를 비우면 막고 → ㎡당 공시지가 칸으로 이동 → 채우면 통과", async ({ page }) => {
    await seedFormAndOpen(page, ownerSplit({}));
    await next(page).click();
    const issue = panel(page).getByRole("button", { name: ownerMsg });
    await expect(issue).toBeVisible(); // 게이트를 지운 게 아니다 — 비율이 쓰이는 쪽은 여전히 요구한다
    await issue.click();
    await focusIn(page, "standardPricePerSqmAtAcq"); // 수정 전에는 이 칸이 화면에 없어 이동할 곳이 없었다

    const card = page.locator('[data-asset-card-index="0"]');
    await card.locator('[data-field="standardPricePerSqmAtAcq"] input').first().fill("2000000");
    await card.locator('[data-field="standardPriceAtAcq"] input').first().fill("500000000");
    // S3-1 — 개별주택가격을 가목:나목 비례로 안분하므로 취득시 건물 기준시가(나목)도 요구한다. 칸이 열려 있어야 한다.
    await next(page).click();
    await panel(page).getByRole("button", { name: ownerMsg }).click();
    await focusIn(page, "buildingStandardPriceAtAcq");
    await card.locator('[data-field="buildingStandardPriceAtAcq"] input').first().fill("300000000");
    await next(page).click();
    await expect(panel(page).getByText(ownerMsg)).toHaveCount(0);
    await toHolding(page);
  });
});

test.describe("별건 B3 — §163⑨1호 토지 비교: 5칸이 토글 뒤에 숨지 않는다 (숨은 값이 취득가액을 바꾸던 문제)", () => {
  // 5칸이 모두 차 있으면 ④는 토글과 무관하게 환산 입력을 보내 취득가액을 바꾼다(실측: 421,052,600 ↔ 비움 100,000,000, 토글 ON·OFF 동일).
  // 「많은 금액」은 영 §163⑨ 단서 1호가 정한 계산이라 끄는 선택이 아니다 → 칸을 항상 연다.
  const inheritedLand = (extra: Record<string, unknown>) =>
    withPrimary({
      assetKind: "land",
      landNature: "farmland",
      acquisitionCause: "inheritance",
      acquisitionDate: "1989-01-01",
      decedentAcquisitionDate: "1988-01-01",
      publishedValueAtInheritance: "100000000",
      acquisitionArea: "100",
      transferArea: "100",
      pre1990Enabled: false,
      pre1990GradeMode: "value",
      ...extra,
    });
  const card = (page: Page) => page.locator('[data-asset-card-index="0"]');
  const msg = /§164④ 취득당시 기준시가는 \d+개 항목을 \*\*모두\*\* 입력하거나/;

  test("상속(의제취득일 이후): 토글 없이 칸이 보이고, 일부 입력 오류는 빈 칸으로 이동한다", async ({ page }) => {
    await seedFormAndOpen(page, inheritedLand({ pre1990PricePerSqm_1990: "5000000" }));
    // 수정 전에는 토글(`pre1990Enabled`)이 켜져야 칸이 보였고, 꺼진 채 값이 남으면 칸이 숨었다
    // (접힌 섹션 안이라 `toBeVisible`이 아니라 DOM 존재로 본다 — 토글이 꺼진 칸은 마운트되지 않는다)
    await expect(card(page).locator('[data-field="pre1990PricePerSqm_1990"] input')).toHaveCount(1);
    await expect(card(page).locator('[data-field="pre1990Enabled"]')).toHaveCount(0);

    await next(page).click();
    const issue = panel(page).getByRole("button", { name: msg });
    await expect(issue).toBeVisible();
    await issue.click();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('[data-field="pre1990Grade_current"]')))
      .toBe(true);

    for (const [k, v] of [["pre1990Grade_current", "100000"], ["pre1990Grade_prev", "90000"], ["pre1990Grade_atAcq", "80000"]] as const) {
      await card(page).locator(`[data-field="${k}"] input`).first().fill(v);
    }
    await next(page).click();
    await expect(panel(page).getByText(msg)).toHaveCount(0);
  });

  test("증여: 토글 없이 칸이 보인다", async ({ page }) => {
    await seedFormAndOpen(page, inheritedLand({ acquisitionCause: "gift", acquisitionDate: "1987-03-01" }));
    await expect(card(page).locator('[data-field="pre1990PricePerSqm_1990"] input')).toHaveCount(1);
    await expect(card(page).locator('[data-field="pre1990Enabled"]')).toHaveCount(0);
  });

  test("🔑 긍정 짝 — 의제취득일 前 상속은 토글이 환산 모드를 정한다: 토글이 있고 꺼지면 칸이 숨는다", async ({ page }) => {
    await seedFormAndOpen(page, inheritedLand({ acquisitionDate: "1980-01-01", decedentAcquisitionDate: "1979-01-01" }));
    await expect(card(page).locator('[data-field="pre1990Enabled"]')).toHaveCount(1);
    await expect(card(page).locator('[data-field="pre1990PricePerSqm_1990"]')).toHaveCount(0);
  });

  test("켜짐 래치가 남은 비교 맥락에서도 5칸 값이 화면에 그대로 보인다 (래치 정리는 vitest가 고정)", async ({ page }) => {
    await seedFormAndOpen(page, inheritedLand({ pre1990Enabled: true, pre1990PricePerSqm_1990: "5000000" }));
    const st = await page.evaluate(() => {
      const a = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0];
      return { e: a?.pre1990Enabled, p: a?.pre1990PricePerSqm_1990 };
    });
    // E2E 시드는 persist 전까지 원문이다(feedback) — 화면의 값으로 확인한다
    expect(st.p).toBe("5000000");
    await expect(card(page).locator('[data-field="pre1990PricePerSqm_1990"] input')).toHaveValue(/5,?000,?000/);
  });
  test("매매(환산 켜짐) → 증여 전환: 켜짐 래치가 꺼진다 (끌 토글이 사라지는 맥락)", async ({ page }) => {
    await seedFormAndOpen(
      page,
      inheritedLand({ acquisitionCause: "purchase", acquisitionDate: "1985-05-01", pre1990Enabled: true, pre1990PricePerSqm_1990: "5000000" }),
    );
    const r = card(page).locator('input[type="radio"][name^="acquisitionCause-"][value="gift"]');
    await r.evaluate((el: HTMLInputElement) => el.click());
    await expect(r).toBeChecked();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const a = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0];
          return { cause: a?.acquisitionCause, latch: a?.pre1990Enabled, price: a?.pre1990PricePerSqm_1990 };
        }),
      )
      .toEqual({ cause: "gift", latch: false, price: "5000000" });
  });

  /** 「③ 취득」 섹션은 접혀 있다 — 헤더를 눌러 펼친 뒤 상속개시일 연도 칸을 돌려준다. */
  const openAcquisitionYear = async (page: Page) => {
    const year = card(page).locator('[data-field="acquisitionDate"]').getByLabel("연도").first();
    if (!(await year.isVisible())) await card(page).getByRole("button", { name: /^3\s*취득/ }).first().click();
    await expect(year).toBeVisible();
    return year;
  };
  test("의제취득일 前 상속(환산 켜짐) → 상속개시일만 이후로 수정: 켜짐 래치가 꺼진다 (끌 토글이 사라지는 맥락)", async ({ page }) => {
    await seedFormAndOpen(
      page,
      inheritedLand({ acquisitionDate: "1980-01-01", decedentAcquisitionDate: "1979-01-01", inheritanceStartDate: "1980-01-01", pre1990Enabled: true, pre1990PricePerSqm_1990: "5000000" }),
    );
    await expect(card(page).locator('[data-field="pre1990Enabled"]')).toHaveCount(1); // 출발점 — 토글이 있다
    const year = await openAcquisitionYear(page);
    await year.fill("1989");
    await expect(year).toHaveValue("1989");
    await expect(card(page).locator('[data-field="pre1990Enabled"]')).toHaveCount(0); // 이후 맥락 — 토글이 사라진다
    await expect
      .poll(() =>
        page.evaluate(() => {
          const a = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0];
          return { date: a?.inheritanceStartDate, latch: a?.pre1990Enabled, price: a?.pre1990PricePerSqm_1990 };
        }),
      )
      .toEqual({ date: "1989-01-01", latch: false, price: "5000000" });
  });

  test("🔑 긍정 짝 — 의제취득일 前 안에서 날짜만 바꾸면 켜짐이 유지된다 (토글이 환산 모드를 정한다)", async ({ page }) => {
    await seedFormAndOpen(
      page,
      inheritedLand({ acquisitionDate: "1980-01-01", decedentAcquisitionDate: "1979-01-01", inheritanceStartDate: "1980-01-01", pre1990Enabled: true, pre1990PricePerSqm_1990: "5000000" }),
    );
    const year = await openAcquisitionYear(page);
    await year.fill("1982");
    await expect(year).toHaveValue("1982");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const a = JSON.parse(sessionStorage.getItem("transfer-tax-wizard") || "{}").state?.formData?.assets?.[0];
          return { date: a?.inheritanceStartDate, latch: a?.pre1990Enabled };
        }),
      )
      .toEqual({ date: "1982-01-01", latch: true });
  });
});
