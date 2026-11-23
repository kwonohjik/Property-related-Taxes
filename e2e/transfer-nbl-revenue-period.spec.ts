/**
 * transfer-nbl-revenue-period.spec.ts
 *
 * NBL-STATE-HISTORY-E3-② — 기타토지 «업종 개시·폐업(과세기간별 수입금액)» — 입력 → 계산 → 결과
 * (UI 계획서 `nbl-state-history-e3-2-business-period.ui.plan.md` §9 · 엔진 케이스 표 `__tests__/tax-engine/_helpers/nbl-state-history-e3-2-table.ts`).
 * 선례: `transfer-nbl-other-state-history-e3-1b.spec.ts`(sessionStorage 시드 + 화면에서 입력).
 *
 * 검증:
 *  1) M11′ 폐업 후 사업용: 화면에서 폐업일 + 영위 연도 8행 입력 → 양도연도·직전 «판정에 쓰지 않음» 안내 · body에 새 칸 3개(⑫ 침묵 strip 방지) → 사업용 + 과세기간 표 8행(2,707일).
 *  2) M9′ 개시 직후 비사업용: 같은 거래를 토글 OFF(현행)면 사업용 → ON이면 비사업용(+55,750,000 — 같은 세율표 기준).
 *  3) 연도 행 누락 = 모름: 그 연도 불통과 + 확인 필요, 차단 없음 → 비사업용.
 *  4) V-7: 영위 181일 < 2년이라 10호 유예 제외 → 비사업용 + 제외 문장.
 *  5) 토글 OFF byte-identical: 저장된 stale 폐업일·행이 body에 닿지 않는다 · 결과 표 없음 · 기존 라벨 그대로.
 *  6) 축 B(지분 2장): 첫 카드의 영위 기간이 companion body에도 실리고 두 지분 모두 같은 판정.
 *  7) 연도별 토지가액 자동조회: 명시 클릭 · 빈 칸만 채움 · 실패 연도는 빈 칸 + 연도 표시(vWorld mock).
 *  8) ⑧ 차단: 폐업일 ≥ 양도일 — 오류 목록 + 계산 차단.
 *  9) 시각: 라이트/다크 글자 대비 4.5 · 375px 입력 영역·결과 카드 가로 스크롤 없음.
 *
 * 폼은 sessionStorage로 시드한다. 외부 API는 7)만 mock(`/api/address/standard-price`).
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-revenue-period.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { createDefaultTransferFormData } from "../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE } from "../lib/tax-engine/nbl-confirm-notices";
import { NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE } from "../lib/tax-engine/nbl-confirm-notices";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Resp = { status: number; req: Record<string, any>; json: Record<string, any> };

const T24 = "2024-06-30";
const LV = "100000000";
const BASE_FORM = { transferDate: T24, filingDate: "2025-12-31", contractTotalPrice: "1000000000" };
/** 기타토지(잡종지) 정밀판정 ON · 취득 2014-01-01 · 양도 2024-06-30(소유 3,832일) · 주차장운영업(기준 3%) — 엔진 계획서 케이스 표 공통 시료. 건축물 이력 질문은 «바뀐 적 없음». */
const LAND = {
  assetKind: "land", acquisitionArea: "1000", transferArea: "1000", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", actualSalePrice: "1000000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "general_residential",
  nblOtherStateHistoryMode: "unchanged", nblOtherPropertyTaxType: "comprehensive", nblOtherHasBuilding: false,
  nblRevenueBusinessType: "parking_operation",
};

async function waitHydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, undefined, { timeout: 30_000 });
}

async function seed(page: Page, assets: unknown[], mode: "single" | "fractional" = "single") {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const formData = { ...createDefaultTransferFormData(), ...BASE_FORM, assetSplitMode: mode, bundledSaleMode: "actual", assets };
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), { state: { formData, currentStep: 0, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await waitHydrated(page);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

const landAsset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "100", ownershipDenominator: "100", ...over });

async function gotoHolding(page: Page) {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await expect(page.getByTestId("nbl-revenue-period-toggle").first(), "영위 기간 토글이 보여야 함").toBeVisible({ timeout: 20_000 });
}

const toggleSwitch = (page: Page) => page.getByTestId("nbl-revenue-period-toggle").getByRole("switch");

async function turnOn(page: Page) {
  await toggleSwitch(page).click();
  await expect(toggleSwitch(page)).toBeChecked();
  await expect(page.getByTestId("nbl-revenue-period")).toBeVisible();
}

async function setDate(page: Page, testId: string, iso: string) {
  const [y, m, d] = iso.split("-");
  const date = page.getByTestId(testId);
  await date.getByLabel("연도").fill(y);
  await date.getByLabel("월").fill(m);
  await date.getByLabel("일").fill(d);
  await expect(date.getByLabel("연도")).toHaveValue(y);
  await expect(date.getByLabel("일")).toHaveValue(d);
}

async function setRow(page: Page, year: number, revenue: string, landValue: string) {
  await page.getByTestId(`nbl-revenue-period-row-${year}-revenue`).fill(revenue);
  await page.getByTestId(`nbl-revenue-period-row-${year}-landvalue`).fill(landValue);
  await expect(page.getByTestId(`nbl-revenue-period-row-${year}-revenue`)).toHaveValue(Number(revenue).toLocaleString("en-US"));
}

async function toLastStep(page: Page) {
  for (const step of ["감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
}

async function calc(page: Page): Promise<Resp> {
  await toLastStep(page);
  const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  const r = await resp;
  return { status: r.status(), req: r.request().postDataJSON(), json: await r.json() };
}

const taxOf = (r: Resp): number => Number(r.json.data?.result?.calculatedTax ?? r.json.data?.aggregated?.totalTax);

const banner = {
  business: (page: Page) => page.getByText("사업용 토지 — 일반세율이 적용됩니다."),
  nonBusiness: (page: Page) => page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/),
};
const yearRow = (page: Page, y: number) => page.getByTestId(`nbl-revenue-period-result-year-${y}`);

/** M9′ 시료: 개시 2022-12-01 계속 · 2022 수입 600,000(영위 31일) · 2023(직전) 5,000,000 · 2024(당해) 2,600,000 — 직전·당해는 기존 칸(seed)이 말한다. */
const M9 = { nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: LV, nblRevenuePriorRevenue: "5000000", nblRevenuePriorLandValue: LV };

test.describe("기타토지 업종 영위 기간(E3-②) — 입력 → 계산 → 결과", () => {
  test("M11′: 폐업 2021-06-01 후 나대지 — 화면 입력(폐업일 + 영위 연도 8행) → «판정에 쓰지 않음» 안내 → body 3칸 도달 → 사업용 + 과세기간 표(영위 2,707일)", async ({ page }) => {
    test.setTimeout(180_000);
    await seed(page, [landAsset()]);
    await gotoHolding(page);

    // OFF가 기본 — 영위 기간·표는 없고 기존 라벨이 그대로다
    await expect(toggleSwitch(page)).not.toBeChecked();
    await expect(page.getByTestId("nbl-revenue-period")).toHaveCount(0);
    await expect(page.getByText("당해 사업개시일")).toBeVisible();

    await turnOn(page);
    // 켜면 개시일 칸이 영위 기간 블록으로 옮겨 온다(한 시점에 한 인스턴스) · 기존 «당해 사업개시일»·«직전 과세기간 영위일수»는 사라진다
    await expect(page.locator('[data-field="nblRevenueCurrentBusinessStartDate"]')).toHaveCount(1);
    await expect(page.getByText("당해 사업개시일")).toHaveCount(0);
    await expect(page.getByText("직전 과세기간 영위일수")).toHaveCount(0);
    // 개시일 비움 = 소유 시작부터 영위 → 표 9행(2014~2022) — 폐업일을 넣으면 2021까지 8행
    await setDate(page, "nbl-revenue-period-end", "2021-06-01");
    await expect(page.getByTestId("nbl-revenue-period-operating")).toHaveText("소유기간 중 영위 기간: 2014-01-02 ~ 2021-05-31 (2,707일)");
    await expect(page.locator('[data-testid^="nbl-revenue-period-row-"][data-testid$="-revenue"]')).toHaveCount(8);
    await expect(page.getByTestId("nbl-revenue-period-row-2022-revenue")).toHaveCount(0);
    await expect(page.getByTestId("nbl-revenue-period-closure-grace-notice")).toBeVisible(); // 10호 유예는 자동으로 만들지 않는다 — 안내만
    // 양도연도(2024)·직전(2023)은 영위일이 없다 — 칸은 그대로 두고 판정에 쓰지 않음을 알린다
    await expect(page.getByTestId("nbl-revenue-period-current-year")).toContainText("영위일이 없는 해라 판정에 쓰지 않습니다");
    await expect(page.getByTestId("nbl-revenue-period-prior-year")).toContainText("영위일이 없는 해라 판정에 쓰지 않습니다");
    await expect(page.locator('[data-field="nblRevenueCurrentRevenue"]')).toHaveCount(1);

    for (let y = 2014; y <= 2020; y++) await setRow(page, y, "5000000", LV);
    await setRow(page, 2021, "2000000", LV);
    await expect(page.getByTestId("nbl-revenue-period-row-2021-days")).toContainText("영위 151일 / 365일");
    await expect(page.getByTestId("nbl-revenue-period-row-2014-judgment")).toContainText("충족");
    await expect(page.getByTestId("nbl-revenue-period-unknown-notice")).toHaveCount(0);

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const raw = r.req.nonBusinessLandRaw;
    expect(raw?.nblRevenuePeriodOn, "④⑫⑭ — 토글 도달(침묵 strip 방지)").toBe(true);
    expect(raw?.nblRevenueBusinessEndDate).toBe("2021-06-01");
    expect(raw?.nblRevenueYearRows).toEqual([
      ...[2014, 2015, 2016, 2017, 2018, 2019, 2020].map((y) => ({ year: String(y), revenue: "5000000", landValue: LV })),
      { year: "2021", revenue: "2000000", landValue: LV },
    ]);
    await expect(banner.business(page)).toBeVisible();
    await expect(page.getByTestId("nbl-revenue-period-result-operating")).toHaveText("소유기간 중 영위 기간 2014-01-02 ~ 2021-05-31 (2,707일)");
    await expect(page.locator('[data-testid^="nbl-revenue-period-result-year-"][data-testid$="-verdict"]')).toHaveCount(8);
    await expect(yearRow(page, 2021)).toContainText("151일 / 365일");
    await expect(page.getByTestId("nbl-revenue-period-result-total")).toContainText("2,707일");
    console.log("[M11′] 산출세액", taxOf(r));
  });

  test("M9′: 개시 2022-12-01 직전 통과 — 같은 거래가 OFF(현행)는 사업용, ON은 비사업용(개시 전 579일) · 세액 +55,750,000", async ({ page }) => {
    test.setTimeout(240_000);
    // OFF(현행): 직전 비율②까지 통과해 개시일이 판정에 안 쓰이고 소유기간 전체가 사업용
    await seed(page, [landAsset({ ...M9, nblRevenueCurrentBusinessStartDate: "2022-12-01" })]);
    await gotoHolding(page);
    const off = await calc(page);
    expect(off.status, JSON.stringify(off.json).slice(0, 300)).toBe(200);
    expect(off.req.nonBusinessLandRaw?.nblRevenuePeriodOn).toBe(false);
    await expect(banner.business(page)).toBeVisible();
    await expect(page.getByTestId("nbl-revenue-period-result")).toHaveCount(0);

    // ON: 화면에서 토글 + 2022 행 입력(개시일은 seed 값이 영위 기간 블록으로 옮겨 온다)
    await seed(page, [landAsset({ ...M9, nblRevenueCurrentBusinessStartDate: "2022-12-01" })]);
    await gotoHolding(page);
    await turnOn(page);
    await expect(page.locator('[data-testid^="nbl-revenue-period-row-"][data-testid$="-revenue"]')).toHaveCount(1); // 2022만
    await expect(page.getByTestId("nbl-revenue-period-row-2022-judgment")).toContainText("모름");
    await setRow(page, 2022, "600000", LV);
    await expect(page.getByTestId("nbl-revenue-period-row-2022-judgment")).toContainText("당해 비율 7.06%");
    await expect(page.getByTestId("nbl-revenue-period-current-year")).toContainText("영위 182일 / 366일");
    const on = await calc(page);
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    expect(on.req.nonBusinessLandRaw?.nblRevenueYearRows).toEqual([{ year: "2022", revenue: "600000", landValue: LV }]);
    expect(on.req.nonBusinessLandRaw?.nblRevenueCurrentBusinessStartDate, "개시일은 기존 키(단일 소스)").toBe("2022-12-01");
    await expect(banner.nonBusiness(page)).toBeVisible();
    await expect(page.getByTestId("nbl-revenue-period-result-total")).toContainText("577일");
    for (const y of [2022, 2023, 2024]) await expect(page.getByTestId(`nbl-revenue-period-result-year-${y}-verdict`)).toHaveText("충족");
    console.log("[M9′] 산출세액 OFF", taxOf(off), "ON", taxOf(on), "차이", taxOf(on) - taxOf(off));
    expect(taxOf(on) - taxOf(off), "엔진 케이스 표(mock 세율)의 +55,750,000과 같은 세율표").toBe(55_750_000);
  });

  test("연도 행 누락 = 모름: 2022 행을 비우면 그 해는 불통과 + 확인 필요 — 차단 없음 · 비사업용(2024만 통과 181일)", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset({ nblRevenueCurrentRevenue: "2600000", nblRevenueCurrentLandValue: LV, nblRevenuePriorRevenue: "2000000", nblRevenuePriorLandValue: LV })]);
    await gotoHolding(page);
    await turnOn(page);
    await setDate(page, "nbl-revenue-period-start", "2022-01-01");
    await expect(page.getByTestId("nbl-revenue-period-row-2022-judgment")).toContainText("모름 — 이 해는 수입금액비율 불통과로 봅니다");
    await expect(page.getByTestId("nbl-revenue-period-unknown-notice")).toHaveText(NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE);
    const r = await calc(page); // ⑧이 막지 않는다
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    await expect(banner.nonBusiness(page)).toBeVisible();
    await expect(page.getByTestId("nbl-revenue-period-result-year-2022-verdict")).toHaveText("모름 — 불통과");
    await expect(page.getByTestId("nbl-revenue-period-result-unknown")).toContainText("2022년");
    await expect(page.getByText(NBL_REVENUE_HISTORY_ROW_UNKNOWN_NOTICE).first()).toBeVisible();
  });

  test("V-7: 영위 181일(2022-09-01~2023-02-28)뿐인 토지의 10호(휴·폐업·이전) 유예 — «2년 이상 사업에 사용» 전제 미충족 → 유예 제외 → 비사업용 · 제외 문장 + 고지", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [
      landAsset({
        acquisitionDate: "2022-07-01", fixedAcquisitionPrice: "300000000",
        nblRevenuePriorRevenue: "700000", nblRevenuePriorLandValue: LV,
        nblGracePeriods: [{ reasonCode: "business_closure_relocation", anchorDate: "2023-03-01", endDate: "", description: "" }],
      }),
    ]);
    await gotoHolding(page);
    await turnOn(page);
    await setDate(page, "nbl-revenue-period-start", "2022-09-01");
    await setDate(page, "nbl-revenue-period-end", "2023-03-01");
    await expect(page.getByTestId("nbl-revenue-period-closure-grace-notice"), "10호 유예 행이 이미 있으면 안내하지 않는다").toHaveCount(0);
    await setRow(page, 2022, "1500000", LV);
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    expect(r.req.nonBusinessLandRaw?.nblRevenueBusinessEndDate).toBe("2023-03-01");
    await expect(banner.nonBusiness(page)).toBeVisible();
    await expect(page.getByTestId("nbl-revenue-period-result-grace10")).toContainText("영위 통산 181일이 요구 일수 730일에 못 미칩니다");
    await expect(page.getByText(NBL_REVENUE_HISTORY_GRACE10_PREMISE_NOTICE).first()).toBeVisible();
    console.log("[V7b] 산출세액", taxOf(r));
  });

  test("토글 OFF byte-identical: 저장된 stale 폐업일·행은 body에 닿지 않는다 · 결과 표 없음 · 기존 라벨 그대로 · 현행 판정(사업용)", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [
      landAsset({
        ...M9, nblRevenueCurrentBusinessStartDate: "2022-12-01",
        nblRevenuePeriodOn: false, nblRevenueBusinessEndDate: "2021-06-01", nblRevenueYearRows: [{ year: "2022", revenue: "abc", landValue: "x" }],
      }),
    ]);
    await gotoHolding(page);
    for (const label of ["당해 토지가액 (양도일 기준시가)", "직전 토지가액", "당해 과세기간 연환산 (§168의11③3호)", "당해 사업개시일", "직전 과세기간 영위일수"]) {
      await expect(page.getByText(label, { exact: true }).first(), label).toBeVisible();
    }
    const r = await calc(page); // stale 불량 행이 있어도 ⑧·⑫ 모두 통과
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const raw = r.req.nonBusinessLandRaw;
    expect(raw?.nblRevenuePeriodOn).toBe(false);
    expect(raw?.nblRevenueBusinessEndDate).toBe("");
    expect(raw?.nblRevenueYearRows).toEqual([]);
    expect(raw?.nblRevenueCurrentBusinessStartDate, "개시일은 OFF에서도 계속 전송(기존 키)").toBe("2022-12-01");
    await expect(banner.business(page)).toBeVisible();
    await expect(page.getByTestId("nbl-revenue-period-result")).toHaveCount(0);
  });

  test("축 B(50/50 지분 2장): 첫 카드의 영위 기간이 companion body에도 실리고 두 지분이 같은 판정(M11′ → 사업용)", async ({ page }) => {
    test.setTimeout(180_000);
    const rows = [2014, 2015, 2016, 2017, 2018, 2019, 2020].map((y) => ({ year: String(y), revenue: "5000000", landValue: LV }));
    rows.push({ year: "2021", revenue: "2000000", landValue: LV });
    const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };
    await seed(
      page,
      [
        { ...landAsset(), ...HALF, nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2021-06-01", nblRevenueYearRows: rows },
        { ...makeDefaultAsset(2), acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: "300000000", ...HALF },
      ],
      "fractional",
    );
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await expect(page.getByTestId("nbl-revenue-period-toggle").first()).toBeVisible({ timeout: 20_000 });
    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const companion = r.req.companionAssets?.[0]?.nonBusinessLandRaw;
    expect(companion?.nblRevenuePeriodOn, "둘째 지분 raw에도 영위 기간이 실린다").toBe(true);
    expect(companion?.nblRevenueBusinessEndDate).toBe("2021-06-01");
    expect(companion?.nblRevenueYearRows).toEqual(rows);
    const props = r.json.data.aggregated.properties as Array<{ nonBusinessLandJudgmentDetail?: { isNonBusinessLand: boolean; periodEvaluation?: { revenueHistory?: { operatingDays: number } } } }>;
    expect(props.map((p) => p.nonBusinessLandJudgmentDetail?.isNonBusinessLand)).toEqual([false, false]);
    expect(props.map((p) => p.nonBusinessLandJudgmentDetail?.periodEvaluation?.revenueHistory?.operatingDays)).toEqual([2707, 2707]);
  });

  test("연도별 토지가액 자동조회: 명시 클릭 · 빈 칸만 채움(값이 있는 칸은 건드리지 않음) · 조회 실패 연도는 빈 칸 + 연도 표시(대체값 없음)", async ({ page }) => {
    test.setTimeout(120_000);
    const asked: string[] = [];
    await page.route("**/api/address/standard-price**", async (route) => {
      const year = new URL(route.request().url()).searchParams.get("year") ?? "";
      asked.push(year);
      if (year === "2016") return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "해당 연도 공시지가 없음" } }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ price: 100_000, year }) });
    });
    await seed(page, [landAsset({ nblRevenuePeriodOn: true, nblRevenueCurrentBusinessStartDate: "2014-06-01", nblRevenueYearRows: [{ year: "2015", revenue: "", landValue: "777" }] })]);
    await gotoHolding(page);
    await expect(page.getByTestId("nbl-revenue-period-row-2014-landvalue")).toHaveValue(""); // 자동 채움 없음
    await page.getByTestId("nbl-revenue-period-fetch").click();
    await expect(page.getByTestId("nbl-revenue-period-fetch-info")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("nbl-revenue-period-row-2014-landvalue")).toHaveValue("100,000,000"); // 100,000원/㎡ × 1,000㎡ × 지분 1
    await expect(page.getByTestId("nbl-revenue-period-row-2015-landvalue"), "값이 있는 칸은 덮어쓰지 않는다").toHaveValue("777");
    await expect(page.getByTestId("nbl-revenue-period-row-2016-landvalue")).toHaveValue("");
    await expect(page.getByTestId("nbl-revenue-period-fetch-error")).toContainText("2016년");
    expect(asked, "12월 31일 기준시가 = 그 해 공시 · 값이 있는 2015는 조회하지 않는다").toEqual(["2014", "2016", "2017", "2018", "2019", "2020", "2021", "2022"]);
  });

  test("⑧ 차단: 폐업일이 양도일 이후면 오류 목록에 문구가 뜨고 계산이 막힌다", async ({ page }) => {
    test.setTimeout(150_000);
    await seed(page, [landAsset({ ...M9, nblRevenueCurrentBusinessStartDate: "2022-12-01", nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2024-07-01" })]);
    await gotoHolding(page);
    await toLastStep(page);
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await expect(page.getByText(/기타토지 영위 기간 — 폐업일\(2024-07-01\)이 양도일\(2024-06-30\) 당일 또는 그 이후/).first()).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("기타토지 업종 영위 기간(E3-②) — 시각(라이트·다크·375px)", () => {
  test("M11′ 입력 영역·결과 카드: 라이트/다크 글자 대비 4.5 이상 · 375px 영위 기간 영역이 화면 안 · 결과 카드 페이지 가로 스크롤 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 900 });
    const rows = [2014, 2015, 2016, 2017, 2018, 2019, 2020].map((y) => ({ year: String(y), revenue: "5000000", landValue: LV }));
    rows.push({ year: "2021", revenue: "2000000", landValue: LV });
    await seed(page, [landAsset({ nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: "2021-06-01", nblRevenueYearRows: rows })]);
    await gotoHolding(page);
    const section = page.getByTestId("nbl-revenue-period");
    await section.scrollIntoViewIfNeeded();
    const right = await section.evaluate((el) => el.getBoundingClientRect().right);
    expect(right, "영위 기간 입력 영역이 375px 안").toBeLessThanOrEqual(375.5);
    for (const t of ["nbl-revenue-period-row-2014-revenue", "nbl-revenue-period-row-2021-landvalue", "nbl-revenue-period-end"]) {
      const b = await page.getByTestId(t).boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 375 + 0.5, `${t} 칸이 화면 폭 안`).toBe(true);
    }
    await section.screenshot({ path: "e2e/_artifacts/e3-2-input-375.png" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: "e2e/_artifacts/e3-2-input-light.png" });
    await expectLightContrast(page, section);
    await expectDarkContrast(page, section);
    await section.screenshot({ path: "e2e/_artifacts/e3-2-input-dark.png" });
    await page.emulateMedia({ media: "screen", colorScheme: "light" });

    const r = await calc(page);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const card = page.getByTestId("nbl-revenue-period-result");
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-2-card-light.png" });
    await expectLightContrast(page, card);
    await expectDarkContrast(page, card);
    await card.screenshot({ path: "e2e/_artifacts/e3-2-card-dark.png" });
    await expectNoPageHScroll(page, 375);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: "e2e/_artifacts/e3-2-card-375.png" });
  });
});
