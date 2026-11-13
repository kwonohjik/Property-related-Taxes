/**
 * E2E — 부담부증여 × 토지·건물 소유자 분리(건물 종류) → 증여한 부분(본인 소유분)만 §159로 계산 (계획서 `docs/00-pm/bg-owner-split-159.plan.md` PR-3)
 *
 * 종전(#3272): 같은 입력을 ⑤ 토글 잠금·⑧·⑫가 막았다. 이제 건물 종류(매매·단독 소유)는 본인 몫을 받아 계산한다. 주택 등 범위 밖은 계속 막는다.
 *   · BGO-E1 건물만 본인 · 기준시가 평가 — 요청 본문에 selfOwns · 건물 기준시가 양시점 · 비소유(토지) 0 · 결과 화면에 NaN·undefined 없음
 *   · BGO-E2 범위 밖(주택) 토글 잠금 · 범위 안(건물) 토글은 켤 수 있고 안내 카드가 뜬다
 *   · BGO-E3 채무 확인을 비우고 «다음» → 그 칸으로 이동 · 확인하면 진행
 *   · BGO-E4 소유자 분리를 끄면(토지·건물 취득일이 다르면) 날짜 분리 카드가 이어서 뜬다
 *   · BGO-E5 결과 echo(PR-4) — 증여한 부분 표기 · 비소유 파트는 「계산하지 않음」 · 상세 명세서 산식
 *   · BGO-E6 회귀 — 소유자 같음 부담부증여는 증여한 부분 표기 없음
 *   · BGO-E8 인쇄(print 미디어) — 같은 표기
 *   · BGO-E7 연간 합산(/multi) 1물건 — 단건과 같은 본인 몫 본문·결정세액 · 자산 행에 증여한 부분 표기
 *   · BGO-E9 토지만 · 시가 × 실지 — 기준시가 카드가 닫히고(쓰지 않는 칸) 비운 채 계산 → 결정세액 5,385,000 · 요청 본문 기준시가 0
 *
 * 실행(워크트리): E2E_PORT=3159 npx playwright test e2e/bg-owner-split-calc.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard, singleSeed } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

type Over = Record<string, unknown>;
type Wire = { selfOwns?: string; landAcquisitionDate?: string; burdenedGiftInfo?: Record<string, unknown> };

/** 건물만 본인 · 건물 종류 · 매매 2015-01-01 · 기준시가 평가 · 채무 1억(보증금 5천만 + 차입 5천만) · 증여한 건물분 양도시 2억 · 취득시 8천만 */
const bldg = (over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "building",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  selfOwns: "building_only",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2015-01-01",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_standard",
  bgLendingDepositTotal: "50000000",
  bgMortgageDebtAmount: "50000000",
  bgMortgageSetAmount: "50000000",
  bgDonorRelation: "lineal_descendant",
  buildingStandardPriceAtTransfer: "200000000",
  buildingStandardPriceAtAcq: "80000000",
  bgOwnerSplitDebtConfirmed: true,
  ...over,
});

const focusedIn = (page: Page, field: string) =>
  page.evaluate((f) => !!(document.activeElement as HTMLElement | null)?.closest(`[data-field="${f}"]`), field);
const ownerToggle = (p: Page) => p.getByTestId("asset-ownership-split").getByRole("switch");

test.describe("부담부증여 × 토지·건물 소유자 분리 — 건물 종류는 본인 몫만 계산", () => {
  test("BGO-E1 건물만 본인 · 기준시가 평가 → 요청 본문은 본인 몫만 · 결과 화면이 깨지지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([bldg()], { contractTotalPrice: "1000000000" }));
    const body = (await calculate(page)) as Wire;
    expect(body.selfOwns).toBe("building_only");
    expect(body.burdenedGiftInfo).toMatchObject({
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 200_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: 80_000_000,
    });
    // 비소유 파트 값·양도가액 직접 분할·증여일 기준시가는 싣지 않는다
    for (const k of ["marketValueByPart", "giftBuildingStdPriceAtTransfer", "actualLandAcquisitionPrice", "actualBuildingAcquisitionPrice"]) expect(body.burdenedGiftInfo?.[k], k).toBeUndefined();
    for (const k of ["landTransferPrice", "buildingTransferPrice", "landAcquisitionPrice", "buildingAcquisitionPrice"]) expect((body as Record<string, unknown>)[k], k).toBeUndefined();
    // 결과 화면 — 빈 값·NaN 없음
    const table = page.locator('[data-print-id="form-table"]').first();
    await expect(table).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  test("BGO-E5 결과 echo — 증여한 부분 표기 · 비소유 파트는 0원 줄이 아니라 계산하지 않음 · 결정세액 5,244,600", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([bldg()], { contractTotalPrice: "1000000000" }));
    await calculate(page);
    // §159 명세 카드 — 증여한 부분 머리 · 건물분 라벨 · 채무비율 (증여한 건물분 기준) · 비소유 토지 줄
    await expect(page.getByTestId("bg-owner-split-headline").first()).toContainText("증여한 부분: 건물 (토지는 타인 소유)");
    const card = page.getByText("부담부증여 평가 명세 (소득세법 시행령 §159)").first().locator("xpath=ancestor::div[contains(@class,'fuchsia')][1]");
    await expect(card).toContainText("① 보충적평가 (양도세 §99) — 증여한 건물분");
    await expect(card).toContainText("(증여한 건물분 기준)");
    await expect(page.getByTestId("bg-owner-split-not-owned").first()).toContainText("토지 취득가");
    await expect(page.getByTestId("bg-owner-split-not-owned").first()).toContainText("본인 소유 아님 — 계산하지 않음");
    // 분리 양도차익 카드 — 비소유 토지 열은 「—」 · 0원 줄과 「취득시 기준시가 0 × 3%」가 없다
    await expect(page.getByTestId("split-card-bg-not-owned-note").first()).toContainText("토지: 본인 소유 아님 — 계산하지 않음");
    await expect(page.getByTestId("split-card-acq-land").first()).toHaveText("—");
    await expect(page.getByTestId("split-card-acq-building").first()).toHaveText("40,000,000");
    expect(await page.locator("body").innerText()).not.toContain("취득시 기준시가 0 ×");
    // 상세 명세서 — 취득가액·필요경비·양도가 산식이 증여한 건물분 기준
    const text = await page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " "));
    expect(text).toContain("증여한 건물분 취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액");
    expect(text).toContain("증여한 건물분 필요경비 = 안분 취득가액 × 3%");
    expect(text).toContain("(증여한 건물분 보충적평가 200,000,000 중 50.0000% 안분)");
    expect(text).not.toContain("supplementary 평가");
    expect(text).toContain("5,244,600");
    // ⑥ 사이드바(V-U3) — 계산 뒤 합계는 증여한 건물분 값(양도 1억 · 취득 4천만 · 필요경비 120만)이고 비소유 0이 합을 흐트러뜨리지 않는다
    await page.getByRole("button", { name: "이전", exact: true }).first().click();
    const aside = page.locator('[data-slot="wizard-sidebar"]').first();
    await expect(aside).toContainText("100,000,000");
    await expect(aside).toContainText("40,000,000");
    await expect(aside).toContainText("1,200,000");
  });

  test("BGO-E8 인쇄(print 미디어 · 전체 선택) — 증여한 부분 · 비소유 파트 「계산하지 않음」 · 상세 명세서 산식이 같은 표기로 나온다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([bldg()], { contractTotalPrice: "1000000000" }));
    await calculate(page);
    await page.getByRole("button", { name: "전체 선택" }).click();
    await page.emulateMedia({ media: "print" });
    const t = await page.locator("body").innerText();
    expect(t).toContain("증여한 부분: 건물 (토지는 타인 소유)");
    expect(t).toContain("토지 취득가");
    expect(t).toContain("토지: 본인 소유 아님 — 계산하지 않음");
    expect(t).toContain("증여한 건물분 취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액");
  });

  test("BGO-E6 회귀 — 소유자 같음 · 날짜 분리 부담부증여는 증여한 부분 표기가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    // 소유자 같음(단일 칸) — 일반 부담부증여
    await seedWizard(page, singleSeed([bldg({ selfOwns: "both", hasSeperateLandAcquisitionDate: false, buildingStandardPriceAtTransfer: "", buildingStandardPriceAtAcq: "", standardPriceAtTransfer: "200000000", standardPriceAtAcq: "80000000" })], { contractTotalPrice: "1000000000" }));
    await calculate(page);
    await expect(page.getByTestId("bg-owner-split-headline")).toHaveCount(0);
    await expect(page.getByTestId("bg-owner-split-not-owned")).toHaveCount(0);
    await expect(page.getByTestId("split-card-bg-not-owned-note")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("증여한 부분");
  });

  test("BGO-E9 토지만 · 시가 × 실지 → 기준시가 카드 없음 · 비운 채 계산 · 결정세액 5,385,000", async ({ page }) => {
    test.setTimeout(180_000);
    const landMarket = bldg({
      selfOwns: "land_only", buildingStandardPriceAtTransfer: "", buildingStandardPriceAtAcq: "",
      bgValuationMode: "sangjeungbeop_market", bgMarketValueOwnedPart: "200000000", bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80000000",
    });
    await seedWizard(page, singleSeed([landMarket], { contractTotalPrice: "1000000000" }));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("bg-owner-split-debt-confirm")).toBeVisible();
    await expect(page.getByTestId("bg-owner-split-card")).toHaveCount(0);
    const body = (await calculate(page)) as Wire;
    expect(body.selfOwns).toBe("land_only");
    expect(body.burdenedGiftInfo).toMatchObject({ landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 0, marketValueAtTransfer: 200_000_000, actualAcquisitionTotal: 80_000_000 });
    const text = await page.locator("body").innerText();
    expect(text).toContain("5,385,000");
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  test("BGO-E2 범위 밖(주택)은 토글이 잠기고 범위 안(건물)은 켤 수 있다 · 안내 카드", async ({ page }) => {
    test.setTimeout(180_000);
    // 주택 · 꺼짐 → 잠김 + 사유
    await seedWizard(page, singleSeed([bldg({ assetKind: "housing", selfOwns: "both", standardPriceAtTransfer: "1000000000", standardPriceAtAcq: "500000000" })]));
    await expandAssetSection(page, 3);
    await expect(ownerToggle(page)).toBeDisabled();
    await expect(page.getByTestId("asset-ownership-split")).toContainText("주택(개별주택가격)은");
    // 건물 · 꺼짐 → 켤 수 있다 → 안내 카드·증여한 건물분 기준시가 카드
    await seedWizard(page, singleSeed([bldg({ selfOwns: "both", hasSeperateLandAcquisitionDate: false, buildingStandardPriceAtTransfer: "", buildingStandardPriceAtAcq: "", bgOwnerSplitDebtConfirmed: false })]));
    await expandAssetSection(page, 3);
    await expect(ownerToggle(page)).toBeEnabled();
    await ownerToggle(page).click();
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("bg-owner-split-notice")).toContainText("증여한 건물분만");
    await expect(page.getByTestId("bg-owner-split-card")).toBeVisible();
    await expect(page.getByTestId("bg-owner-split-debt-confirm")).toBeVisible();
  });

  test("BGO-E3 채무 확인을 비우고 «다음» → 그 칸으로 이동 · 확인하면 진행", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([bldg({ bgOwnerSplitDebtConfirmed: false })]));
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect.poll(() => focusedIn(page, "bgOwnerSplitDebtConfirmed")).toBe(true);
    await page.getByTestId("bg-owner-split-debt-confirm").getByRole("switch").click();
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByRole("heading", { name: "보유 상황" }).first()).toBeVisible();
  });

  test("BGO-E4 소유자 분리를 끄면 토지·건물 취득일이 다를 때 날짜 분리 카드가 이어서 뜬다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, singleSeed([bldg({ landAcquisitionDate: "2000-06-01" })]));
    await expandAssetSection(page, 3);
    await expect(ownerToggle(page)).toBeChecked();
    await ownerToggle(page).click();
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("bg-owner-split-card")).toHaveCount(0);
    await expect(page.getByTestId("bg-house-split-card")).toBeVisible();
  });

  test("BGO-E7 연간 합산(/multi) — 건물만 본인 1물건: 본인 몫 본문 · 결정세액 5,244,600 · 자산 행 카드에 증여한 부분", async ({ page }) => {
    test.setTimeout(180_000);
    const form = {
      assets: [bldg()], transferDate: "2026-02-16", filingDate: "", contractTotalPrice: "1000000000", totalTransferExpense: "0",
      householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
    };
    await page.goto("/calc/transfer-tax/multi");
    await page.waitForTimeout(2000);
    await page.evaluate(
      ([f]) => {
        const raw = sessionStorage.getItem("multi-transfer-tax-wizard");
        if (!raw) throw new Error("persist entry 없음");
        const parsed = JSON.parse(raw);
        parsed.state.form.taxYear = 2026;
        parsed.state.form.properties = [{ propertyId: "bgo-1", propertyLabel: "양도 1번", form: f, completionPercent: 100 }];
        parsed.state.form.activePropertyIndex = 0;
        parsed.state.form.activeStep = "settings";
        sessionStorage.setItem("multi-transfer-tax-wizard", JSON.stringify(parsed));
      },
      [seedWithDeclaredRoster(form)],
    );
    await page.reload();
    await page.waitForTimeout(1500);

    const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: "세액 계산" }).click();
    const r = await resp;
    const json = (await r.json()) as { data?: { properties?: Array<Record<string, unknown>> } };
    expect(r.status(), JSON.stringify(json).slice(0, 400)).toBe(200);
    const sent = r.request().postDataJSON() as { properties?: Wire[] };
    expect(sent.properties?.[0]?.selfOwns).toBe("building_only");
    expect(sent.properties?.[0]?.burdenedGiftInfo).toMatchObject({ landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 200_000_000, landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 80_000_000 });
    const p = json.data?.properties?.[0];
    expect(p?.refDeterminedTax).toBe(5_244_600);
    expect(p?.transferGain).toBe(58_800_000);

    // 자산 행(접힘)의 카드 텍스트 — 단건과 같은 표기
    await expect(page.getByTestId("bg-owner-split-headline").first()).toBeAttached({ timeout: 15_000 });
    const text = await page.evaluate(() => (document.body.textContent ?? "").replace(/\s+/g, " "));
    expect(text).toContain("증여한 부분: 건물 (토지는 타인 소유)");
    expect(text).toContain("① 보충적평가 (양도세 §99) — 증여한 건물분");
    expect(text).toContain("본인 소유 아님 — 계산하지 않음");
    // 합산 상세 명세서의 자산별 산식 — 「건물(환산취득가) … 파트별 산정」이 아니라 증여한 건물분의 §159 산식
    expect(text).toContain("증여한 건물분 취득가액 = 취득시 자산기준시가 × 채무액 / 증여재산 평가액");
    expect(text).toContain("증여한 건물분 필요경비 = 안분 취득가액 × 3%");
    expect(text).not.toContain("건물(환산취득가) 40,000,000 — 토지·건물 파트별 산정");
    await expect(page.getByTestId("split-card-bg-not-owned-note").first()).toBeAttached();
    expect(await page.locator("body").innerText()).not.toMatch(/NaN|undefined|Infinity/);
  });
});
