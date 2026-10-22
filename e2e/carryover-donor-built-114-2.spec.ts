/**
 * E2E — 이월과세 × 증여자 신축·증축 「소득세법」 §114조의2 환산취득가액 5% 가산세 (PR-2: ①②③④⑤⑦⑧)
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md
 * 시드 수치는 엔진 anchor와 같다 — 증여자 신축 2022-01-10 · 증여 2024-05-01 · 양도 2026-03-01 · 양도가 10억 · 증여자 환산(취득시 2억/양도시 4억).
 *   · 비주택 건물 A 채택: 가산세 25,000,000 (환산 5억 × 5%)
 *   · 일체 주택 A 채택: 건물분만 — base 187,500,000 · 가산세 9,375,000 (취득시 건물분 75,000,000 · 양도시 건물분 160,000,000 · 건물분 양도가액 400,000,000)
 *   · ②3호 B 채택: 가산세 0 + 중립 안내
 *
 * vitest 는 폼 → ④ → route → 4뷰를 함수로 잇는다(`carryover-donor-built-114-2.anchor.test.ts` · `carryover-donor-built-results.ui.anchor.test.tsx`).
 * 여기서는 **브라우저 폼**에서 토글·입력이 실제로 요청 body 의 `carryoverTaxation.donorBuilt` 로 실리는지, 결과 화면이 그것을 그리는지,
 * ⑧이 미입력을 막고 그 칸으로 이동하는지 본다. 인쇄 검증은 하지 않는다(문서 말미 «덮지 않는 것»).
 *
 * 실행(워크트리): E2E_PORT=3281 npx playwright test e2e/carryover-donor-built-114-2.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard, stmtText } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2024-05-01",
  donorAcquisitionDate: "2022-01-10",
  donorRelation: "lineal",
  donorSameHousehold: "no",
  useEstimatedAcquisition: true,
  estimationMode: "general",
  donorStandardPriceAtAcquisition: "200000000",
  donorStandardPriceAtTransfer: "400000000",
  giftTaxAmount: "0",
  giftDateValuation: "800000000",
};
const DONOR_BUILT_NEW = { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" };
const HOUSING_INPUTS = {
  donorBuiltLandPricePerSqm: "1000000",
  donorBuiltLandArea: "100",
  donorBuiltBuildingStdAtAcq: "60000000",
};

const asset = (kind: "housing" | "building", co: Over = {}, over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: kind,
  acquisitionCause: "carryover_gift",
  acquisitionDate: "",
  actualSalePrice: "1000000000",
  saleSplitMode: "apportioned",
  ...(kind === "housing" ? { landStandardPriceAtTransfer: "240000000", buildingStandardPriceAtTransfer: "160000000" } : {}),
  carryover: { ...CARRYOVER, ...(kind === "housing" ? HOUSING_INPUTS : {}), ...co },
  ...over,
});

const seed = (assets: Over[]) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-03-01",
      filingDate: "2026-04-30",
      contractTotalPrice: "1000000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

type Wire = { carryoverTaxation?: { donorBuilt?: Record<string, unknown> } };

async function readStore(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    return raw ? JSON.parse(raw)?.state?.formData?.assets?.[0]?.carryover : undefined;
  });
}

test.describe("이월과세 × 증여자 신축·증축 §114조의2", () => {
  test("DB-E1 일체 주택 A 채택: body 의 donorBuilt.housing · 결과 카드 건물분 산식 · 신고서 가산세 9,375,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("housing", DONOR_BUILT_NEW)]));
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation?.donorBuilt).toEqual({
      buildingType: "new",
      constructionDate: "2022-01-10",
      housing: {
        landPricePerSqmAtAcquisition: 1_000_000,
        landArea: 100,
        buildingStdPriceAtAcquisition: 60_000_000,
        landStdPriceAtTransfer: 240_000_000,
        buildingStdPriceAtTransfer: 160_000_000,
      },
    });
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "true");
    await expect(page.getByTestId("donor-built-window").first()).toHaveText("증여자 신축 취득일 2022-01-10부터 5년이 되는 날(2027-01-10)까지 양도하는 경우입니다.");
    await expect(card).toContainText("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 ×");
    // 분수(Frac) — 분자 = 취득 당시 건물분 기준시가, 분모 = 양도 당시 건물분 기준시가
    const frac = card.locator("span.inline-flex.flex-col").first();
    await expect(frac.locator("> span").nth(0)).toHaveText("취득 당시 건물분 기준시가 75,000,000");
    await expect(frac.locator("> span").nth(1)).toHaveText("양도 당시 건물분 기준시가 160,000,000");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 9,375,000 = 187,500,000 × 5%");
    await expect(page.getByTestId("donor-built-notice").first()).toContainText("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    // 신고서 — 가산세액 칸 + 각주 / 상세명세서 — 가산세액 항목의 증여자 신축 산식
    const penaltyRow = await formRow(page, "가산세액");
    expect(num(penaltyRow[1])).toBe(9_375_000);
    expect(await stmtText(page, "가산세액")).toContain("증여자 신축·증축 환산취득가액 가산세 9,375,000");
  });

  test("DB-E2 비주택 건물 A 채택: 환산취득가액 전체가 기준액 · 가산세 25,000,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("building", DONOR_BUILT_NEW)]));
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    await expect(page.getByTestId("donor-built-penalty-card").first()).toContainText("가산세 기준액 = 증여자 환산취득가액 500,000,000 (건물)");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 25,000,000 = 500,000,000 × 5%");
    expect(num((await formRow(page, "가산세액"))[1])).toBe(25_000_000);
  });

  test("DB-E3 ②3호 B 채택: 가산세 없음 + 중립 안내 (「더했다」류 문구 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("building", { ...DONOR_BUILT_NEW, giftDateValuation: "500000000" })]));
    await calculate(page);
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "false");
    await expect(page.getByTestId("donor-built-notice").first()).toHaveText(
      "이월과세를 적용하지 않아 수증자 취득가액을 증여 당시 평가액(실지거래가액)으로 계산했고, 증여자 신축분 소득세법 §114조의2 가산세는 붙지 않았습니다.",
    );
    await expect(card).not.toContainText(/같은 금액|더했/);
    await expect(page.getByTestId("donor-built-penalty-line")).toHaveCount(0);
    expect(num((await formRow(page, "가산세액"))[1])).toBe(0);
  });

  test("DB-E4 UI 입력 경로: 토글 ON → 구분·신축일 입력 → body 에 실린다 (신축일 자동 채움 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("building")]));
    await expandAssetSection(page, 3);
    const toggle = page.getByTestId("donor-built-toggle");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("donor-built-fields")).toHaveCount(0);
    await toggle.getByRole("switch").first().click();
    await expect(page.getByTestId("donor-built-fields")).toBeVisible();
    // 켠 것만으로 구분·일자가 채워지지 않는다 — 증여자 취득일(2022-01-10)을 신축일로 대신 채우지 않는다
    const c0 = await readStore(page);
    expect(c0).toMatchObject({ donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" });
    await page.getByTestId("donor-built-type").getByRole("radio", { name: "신축" }).check();
    const dateScope = page.locator('[data-field="carryover.donorBuiltDate"]');
    const [y, m, d] = "2022-01-10".split("-");
    await dateScope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
    await dateScope.locator('input[type="text"][aria-label="월"]').first().fill(m);
    await dateScope.locator('input[type="text"][aria-label="일"]').first().fill(d);
    expect(await readStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" });
    const body = (await calculate(page)) as Wire;
    expect(body.carryoverTaxation?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 25,000,000 = 500,000,000 × 5%");
  });

  test("DB-E5 ⑧ 차단: 토글 ON 인데 신축일이 비면 «다음» 이 막히고 그 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("building", { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "" })]));
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="carryover.donorBuiltDate"]')))
      .toBe(true);
    // 앵커 각 1개 — ⑧ 이동 불능 0
    for (const key of ["carryover.donorBuilt", "carryover.donorBuiltType", "carryover.donorBuiltDate"]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
  });

  test("DB-E6 일체 주택: 증축으로 바꾸면 증축 칸이 열리고, 건물분 입력 칸 앵커가 각 1개다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("housing", DONOR_BUILT_NEW)]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-housing")).toBeVisible();
    for (const key of ["carryover.donorBuiltLandPricePerSqm", "carryover.donorBuiltLandArea", "carryover.donorBuiltBuildingStdAtAcq"]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
    await expect(page.getByTestId("donor-built-ext-area")).toHaveCount(0);
    await page.getByTestId("donor-built-type").getByRole("radio", { name: "증축" }).check();
    await expect(page.getByTestId("donor-built-ext-area")).toBeVisible();
    await expect(page.getByTestId("donor-built-ext-std")).toBeVisible();
    // 기존 양도가액 구분 섹션이 그대로 마운트된다(Q-6 b)
    await expect(page.getByTestId("donor-built-housing").getByTestId("sale-split-mode")).toBeVisible();
  });

  test("DB-E7 범위 밖은 칸이 없다 — 실가 승계 · 개별주택가격 미공시 환산", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("building", { useEstimatedAcquisition: false, donorAcquisitionPrice: "100000000" })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(0);
    await seedWizard(page, seed([asset("building", { estimationMode: "phd" })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(0);
  });
});
