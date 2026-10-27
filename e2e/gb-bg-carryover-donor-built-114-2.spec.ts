/**
 * E2E — 일반건물 **부담부증여 × 이월과세(F27) × 당초 증여자 신축·증축** 「소득세법」 §114조의2 가산세 (PR-5c: ⑤ 토글 · ④ body · ⑧ 차단 · ⑦ 결과)
 *
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §3.4
 * 시드 — 일반건물 · 부담부증여 K-5(환산) · 시가 10억 · 인수채무 5억(채무비율 0.5) · 양도시 기준시가 토지 2억·건물 2억 · 증여 2024-05-01 · 당초 증여자 취득 2015-01-01 ·
 * 당초 증여자 취득 당시 기준시가 토지 1천만·건물 4천만 · 당초 증여자 신축 2022-01-10 · 양도일 2026-03-01.
 *   · A 채택: 건물분 환산취득가액 = 2.5억 × 4천만/2억 = 50,000,000 → 가산세 2,500,000 (토지는 대상이 아니다)
 *   · ②3호 B 채택(당초 증여자 기준시가 토지 6천만·건물 8천만): 가산세 0 + 중립 안내
 *
 * vitest(`transfer.route.gb-bg-carryover-donor-built.*`)는 폼 → ④ → ⑧ → ⑫ → route → 4뷰를 함수로 잇는다. 여기서는 **브라우저 폼**에서 토글·입력이 요청 body 의
 * `burdenedGiftInfo.carryoverDonorBasis.donorBuilt` 로 실리는지, 결과 화면이 그것을 그리는지, ⑧이 미입력을 막고 그 칸으로 이동하는지,
 * **토글 ON·신축일 빔 상태에서 페이지가 깨지지 않는지**(5a 에서 사이드바 프리뷰가 미완성 폼으로 던진 결함)를 본다.
 *
 * 실행(워크트리): E2E_PORT=3297 npx playwright test e2e/gb-bg-carryover-donor-built-114-2.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard, stmtText } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const DONOR_BUILT_NEW = { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" };

const gbBgAsset = (co: Over = {}, over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "general_building",
  acquisitionCause: "carryover_gift",
  // 분리 OFF는 원인이 하나다 — 화면은 건물 원인을 토지 원인에 맞춘다(`GeneralBuildingAcquisitionCards.tsx:259`). 다르게 시드하면 복원(M-2b)이 분리를 켜 「토지만 이월과세」로 막힌다(gb-bg-part-carryover-mismatch).
  gbBuildingAcquisitionCause: "carryover_gift",
  acquisitionDate: "2024-05-01",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000",
  gbTransferBuildingValue: "200000000",
  gbZoneType: "general_residential",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "100000000",
  transferType: "burdened_gift",
  transferCause: "general",
  bgValuationMode: "sangjeungbeop_market",
  bgAcquisitionMethod: "converted",
  bgMarketValueAtTransfer: "1000000000",
  bgMortgageDebtAmount: "500000000",
  bgMortgageSetAmount: "500000000",
  bgDonorRelation: "lineal_descendant",
  bgCoDonorLandStdPriceAtAcq: "10000000",
  bgCoDonorBuildingStdPriceAtAcq: "40000000",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2024-05-01",
    donorAcquisitionDate: "2015-01-01",
    donorAcquisitionPrice: "100000000",
    giftDateValuation: "1000000000",
    giftTaxAmount: "0",
    donorRelation: "lineal",
    donorSameHousehold: "no",
    ...co,
  },
  // 당초 증여자의 건물 취득일 — 신축이면 신축 취득일, 아니면 토지와 같은 날(계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-1·Q-3 a)
  buildingCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: co.donorBuiltType === "new" && co.donorBuiltDate ? String(co.donorBuiltDate) : "2015-01-01" },
  ...over,
});

const seed = (assets: Over[], formOver: Over = {}) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-03-01",
      filingDate: "2026-05-31",
      contractTotalPrice: "1000000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      ...formOver,
    },
    pendingMigration: false,
  },
  version: 0,
});

type Wire = {
  burdenedGiftInfo?: { carryoverDonorBasis?: { donorBuilt?: Record<string, unknown>; buildingDonorAcquisitionDate?: string } };
  carryoverTaxation?: { donorBuilt?: unknown };
};
const donorBuiltOf = (b: Wire) => b.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt;

async function readCarryoverStore(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    return raw ? JSON.parse(raw)?.state?.formData?.assets?.[0]?.carryover : undefined;
  });
}

test.describe("일반건물 부담부증여 × 이월과세 × 증여자 신축·증축 §114조의2", () => {
  test("GBBD-E1 A 채택: body 의 burdenedGiftInfo.carryoverDonorBasis.donorBuilt · 카드 가산세 · 신고서 2,500,000 · 이월과세 서브객체로는 미전송", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbBgAsset(DONOR_BUILT_NEW)]));
    const body = (await calculate(page)) as Wire;
    expect(donorBuiltOf(body)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(body.carryoverTaxation?.donorBuilt).toBeUndefined();
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "true");
    await expect(page.getByTestId("donor-built-window").first()).toHaveText("증여자 신축 취득일 2022-01-10부터 5년이 되는 날(2027-01-10)까지 양도하는 경우입니다.");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 2,500,000 = 50,000,000 × 5%");
    await expect(page.getByTestId("donor-built-notice").first()).toContainText("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    // 양도인 본인 신축 고지가 섞이지 않는다
    await expect(page.getByText("일반건물 부담부증여에서 양도인 본인이 신축한 건물")).toHaveCount(0);
    // 합산 신고서 가산세액 칸 + 각주 / 상세명세서
    expect(num((await formRow(page, "가산세액"))[1])).toBe(2_500_000);
    await expect(page.locator('[data-print-id="form-table"]').first()).toContainText("증여자 신축 건물 가산세 2,500,000");
    expect(await stmtText(page, "가산세액")).toContain("증여자 신축·증축 환산취득가액 가산세 2,500,000");
    if (process.env.E2E_SHOT_DIR) await card.scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gbbd-e1-result.png` }));
  });

  test("GBBD-E2 ②3호 B 채택: 가산세 없음 + 중립 안내 (「더했다」류 문구 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbBgAsset(DONOR_BUILT_NEW, { bgCoDonorLandStdPriceAtAcq: "60000000", bgCoDonorBuildingStdPriceAtAcq: "80000000" })]));
    await calculate(page);
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "false");
    await expect(page.getByTestId("donor-built-notice").first()).toHaveText(
      "이월과세를 적용하지 않아 수증자 취득가액을 증여 당시 평가액(실지거래가액)으로 계산했고, 증여자 신축분 소득세법 §114조의2 가산세는 붙지 않았습니다.",
    );
    await expect(card).not.toContainText(/같은 금액|더했/);
    expect(num((await formRow(page, "가산세액"))[1])).toBe(0);
  });

  test("GBBD-E3 UI 입력 경로: 토글 ON → 구분·신축일 입력 → body 에 실린다 (신축일 자동 채움 없음) · 토글 1개", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbBgAsset()]));
    await expandAssetSection(page, 2); // 부담부증여 블록(§159 자동산정)은 ② 양도정보 안에 있다
    const toggle = page.getByTestId("donor-built-toggle");
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("donor-built-fields")).toHaveCount(0);
    await toggle.getByRole("switch").first().click();
    await expect(page.getByTestId("donor-built-fields")).toBeVisible();
    // 일체 주택 안분 칸은 없다 — 토지·건물이 자산별로 이미 나뉘어 있다
    await expect(page.getByTestId("donor-built-housing")).toHaveCount(0);
    // 켠 것만으로 구분·일자가 채워지지 않는다 — 증여자 취득일(2015-01-01)을 신축일로 대신 채우지 않는다
    expect(await readCarryoverStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" });
    await page.getByTestId("donor-built-type").getByRole("radio", { name: "신축" }).check();
    const dateScope = page.locator('[data-field="carryover.donorBuiltDate"]');
    const [y, m, d] = "2022-01-10".split("-");
    await dateScope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
    await dateScope.locator('input[type="text"][aria-label="월"]').first().fill(m);
    await dateScope.locator('input[type="text"][aria-label="일"]').first().fill(d);
    expect(await readCarryoverStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" });
    // 신축 건물의 취득일 = 신축 취득일 — ③ 취득 카드의 「건물분 증여자 취득일」(분리 OFF)에도 같은 날을 넣는다(계획서 `gb-bg-donor-building-acquisition-date.plan.md` Q-1·Q-3 a)
    await expandAssetSection(page, 3);
    const bDate = page.locator('[data-field="buildingCarryover.donorAcquisitionDate"]');
    await expect(bDate).toHaveCount(1);
    await expect(bDate).toContainText("건물분 증여자 취득일");
    await bDate.locator('input[type="text"][aria-label="연도"]').first().fill(y);
    await bDate.locator('input[type="text"][aria-label="월"]').first().fill(m);
    await bDate.locator('input[type="text"][aria-label="일"]').first().fill(d);
    const body = (await calculate(page)) as Wire;
    expect(donorBuiltOf(body)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.buildingDonorAcquisitionDate).toBe("2022-01-10");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 2,500,000 = 50,000,000 × 5%");
  });

  test("GBBD-E4 토글 ON · 신축일 빔: 페이지가 깨지지 않고 ⑧ 이 «다음» 을 막아 그 칸으로 이동한다 · 앵커 각 1개", async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seedWizard(page, seed([gbBgAsset({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "" })]));
    await expandAssetSection(page, 2); // 부담부증여 블록(§159 자동산정)은 ② 양도정보 안에 있다
    // 사이드바·프리뷰가 미완성 폼(신축일 빔)으로 던지지 않는다 — 에러 바운더리로 떨어지지 않고 토글이 그대로 보인다
    await expect(page.getByTestId("donor-built-toggle")).toBeVisible();
    await expect(page.getByText("문제가 발생했습니다")).toHaveCount(0);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="carryover.donorBuiltDate"]')))
      .toBe(true);
    for (const key of ["carryover.donorBuilt", "carryover.donorBuiltType", "carryover.donorBuiltDate"]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("GBBD-E5 범위 밖은 칸이 없고 stale 토글은 요구하지 않는다 — 건물 취득원인이 양도인 본인 신축(토지만 이월과세 → 토지만 당초 증여자 기준으로 계산)", async ({ page }) => {
    test.setTimeout(180_000);
    // 건물이 양도인 본인 신축 + 토글만 켜 둔 stale(구분·신축일 비어 있음).
    // 토지만 이월과세 — 종전에는 건물까지 당초 증여자 값으로 계산됐고(#2571 전), #2571은 건물 취득원인에서 막았다.
    // PR-2(`gb-bg-part-carryover-calc.plan.md`)부터 토지만 당초 증여자 기준으로 계산한다 — 건물을 증여받지 않았으니 증여자 신축 질문은 없다.
    await seedWizard(
      page,
      seed([gbBgAsset({ donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" }, { gbBuildingAcquisitionCause: "newConstruction", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", acquisitionDate: "2022-01-10" })]),
    );
    await expandAssetSection(page, 2); // 부담부증여 블록(§159 자동산정)은 ② 양도정보 안에 있다
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(0);
    const body = (await calculate(page)) as { burdenedGiftInfo?: { carryoverDonorBasis?: { parts?: unknown; donorBuilt?: unknown } } };
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.parts).toEqual({ land: true, building: false });
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt).toBeUndefined(); // stale 토글은 싣지 않는다
    await expect(page.getByText(/토글을 끄세요/)).toHaveCount(0); // stale 토글은 요구하지 않는다
  });

  test("GBBD-E6 지분 분할 취득(축 B): 이월과세는 계산되고(PR-2) 켜 둔 증여자 신축 토글만 ⑧ 이 «끄세요» 로 막아 그 칸으로 이동한다", async ({ page }) => {
    // 종전(PR-5c): 토글을 끄면 계산됐지만 이월과세를 반영하지 않은 양도인 기준(B) 값이었다(Δ 0). F27 B PR-3 은 이월과세 자체를 막았다.
    // 지분 PR-2(`docs/00-pm/gb-bg-carryover-share-bundled.plan.md`)부터 지분마다 A/B를 비교한다 — 증여자 신축 §114조의2 묶음 차단(PR-5c)만 남는다.
    test.setTimeout(180_000);
    const share2 = {
      ...makeDefaultAsset(2),
      addressJibun: "서울 강남구 테스트동 1-1",
      assetKind: "general_building",
      acquisitionCause: "purchase",
      acquisitionDate: "2015-03-01",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
      gbBuildingAcquisitionCause: "purchase",
      gbAcqLandPricePerSqm: "1000000",
      gbAcqBuildingValue: "100000000",
    };
    const share1 = (co: Over) => gbBgAsset(co, { ownershipNumerator: "60", ownershipDenominator: "100" });
    await seedWizard(page, seed([share1(DONOR_BUILT_NEW), share2], { assetSplitMode: "fractional" }));
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByText(/당초 증여자 신축·증축 가산세\(소득세법 §114조의2\)를 아직 지원하지 않습니다 — 토글을 끄세요/).first()).toBeVisible();
    await expect(page.getByText(/지분 분할 취득에서 아직 계산하지 못합니다/)).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="carryover.donorBuilt"]')))
      .toBe(true);

    await seedWizard(page, seed([share1({}), share2], { assetSplitMode: "fractional" }));
    const body = (await calculate(page)) as Wire & { generalBuildingShares?: Array<{ carryoverTaxation?: unknown }> };
    expect(body.generalBuildingShares?.map((x) => x.carryoverTaxation !== undefined)).toEqual([true, false]);
    await expect(page.getByTestId("gb-bg-carryover-card")).toHaveCount(1);
  });

  // ── PR-2(`docs/00-pm/gb-bg-carryover-presumed-scenario-b.plan.md`) — 감정가액(K-7) × 당초 증여자 신축·증축 ──
  const K7 = {
    bgAcquisitionMethod: "appraisal", bgCoDonorPresumedAcquisitionLand: "100000000", bgCoDonorPresumedAcquisitionBuilding: "200000000",
    bgActualAcquisitionLand: "300000000", bgActualAcquisitionBuilding: "300000000",
  };

  test("GBBD-E7 K-7 신축: 토글이 보이고 · 가산세 5,000,000 = 안분 후 건물 감정가액 100,000,000 × 5% · 「감정가액」 라벨", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbBgAsset(DONOR_BUILT_NEW, K7)]));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(1);
    const body = (await calculate(page)) as Wire;
    expect(donorBuiltOf(body)).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    await expect(page.getByTestId("donor-built-penalty-card").first()).toHaveAttribute("data-applied", "true");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 5,000,000 = 100,000,000 × 5%");
    expect(num((await formRow(page, "가산세액"))[1])).toBe(5_000_000);
    const stmt = await stmtText(page, "가산세액");
    expect(stmt).toContain("감정가액");
    expect(stmt).not.toContain("환산취득가액 가산세");
    if (process.env.E2E_SHOT_DIR) await page.getByTestId("donor-built-penalty-card").first().scrollIntoViewIfNeeded().then(() => page.screenshot({ path: `${process.env.E2E_SHOT_DIR}/gbbd-e7-k7.png` }));
  });

  test("GBBD-E8 K-7 증축 UI 경로: 증축 → 바닥면적 → 「증축한 부분의 감정가액」 칸(증축 부분 기준시가 칸 없음) → 가산세 1,500,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([gbBgAsset({ donorBuilt: true, donorBuiltType: "extension", donorBuiltDate: "2022-01-10", donorBuiltExtensionArea: "90" }, K7)]));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("donor-built-ext-std")).toHaveCount(0);
    const ext = page.getByTestId("donor-built-ext-appraisal").first();
    await expect(ext).toBeVisible();
    await ext.fill("60000000");
    const body = (await calculate(page)) as Wire & { burdenedGiftInfo?: { presumedExtensionAppraisalValue?: number } };
    expect(body.burdenedGiftInfo?.presumedExtensionAppraisalValue).toBe(60_000_000);
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 1,500,000 = 30,000,000 × 5%");
  });
});
