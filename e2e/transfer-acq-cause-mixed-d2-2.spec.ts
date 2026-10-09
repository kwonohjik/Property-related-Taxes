/**
 * E2E: 「토지는 다른 원인으로 취득」 상속·증여 건물 호스트 — Phase D2-2 (2026-10-09)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §12 · UI 설계 transfer-acq-cause-mixed-d2.ui.design.md §2·§5
 *
 * - 건물 상속 + 토지 매매(실가) / 건물 증여 + 토지 매매(환산): 토글 → 날짜 2열·고정 칩·평가액 → 계산 → 요청 body
 *   (`landAcquisitionCause: "purchase"` · 자산 단위 평가 payload 없음) → 결과 카드 원인 행.
 * - 토글 OFF → 분리 입력 stale 무시 · 소유자 분리 상호 잠금 · 2005.4.30. 전(주택 = ② 카드, D2-4b)·같은 날 안내 · ⑧ 이동 칸 앵커 · 호스트 전환.
 *
 * ⚠️ 수치·문구의 정본은 vitest anchor다. 워크트리 실행은 E2E_PORT 필수. 시드는 `landCauseHost`를 함께 넣는다(normalize가 지운다).
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { calculate, card, housing, seedWizard, singleSeed, stmtText } from "./_helpers/split-acq-display";

/** 건물 상속(2025-05-01, 피상속인 2000-01-01) — 토글 OFF 상태의 순수 상속 자산. 양도 900,000,000 · 기준시가 비율 안분(축 A 기본) */
const inherited = (over: Record<string, unknown> = {}) =>
  housing({
    acquisitionCause: "inheritance",
    acquisitionDate: "2025-05-01",
    inheritanceStartDate: "2025-05-01",
    inheritanceDate: "2025-05-01",
    decedentAcquisitionDate: "2000-01-01",
    hasSeperateLandAcquisitionDate: false,
    landAcquisitionDate: "",
    ...over,
  });

const gifted = (over: Record<string, unknown> = {}) =>
  inherited({ acquisitionCause: "gift", inheritanceStartDate: "", inheritanceDate: "", decedentAcquisitionDate: "", ...over });

/** D2 토글 ON 직후 상태(토지 2025-01-10 매매 · 파트 실가) — 시드에서 곧바로 시작할 때 */
const d2 = (host: "inheritance" | "gift", over: Record<string, unknown> = {}) =>
  (host === "inheritance" ? inherited : gifted)({
    landAcquisitionCause: "purchase",
    landCauseHost: host,
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2025-01-10",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "400000000",
    ...over,
  });

const toggleBlock = (p: Page) => p.getByTestId("land-part-cause-building-cause");
const toggle = (p: Page) => toggleBlock(p).getByRole("switch").first();
const ownerToggle = (p: Page) => p.getByTestId("asset-ownership-split").getByRole("switch");
const sepDateToggle = (p: Page) =>
  p.locator('[data-variant="chip"]').filter({ hasText: "토지·건물 취득일 다름" }).getByRole("switch");

async function open(page: Page, asset: Record<string, unknown>) {
  await seedWizard(page, singleSeed([asset]));
  await expandAssetSection(page, 3);
}

test.describe("D2-2 — 건물 상속 + 토지 매매 화면", () => {
  test("토글 노출(OFF) → ON: 날짜 2열·건물 고정 칩·평가액 칸 / 상속 블록의 평가·결합 공시 칸은 사라진다", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, inherited());
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).not.toBeChecked();
    // 토글 OFF — 종전 상속 블록
    await expect(page.getByText("상속세 신고 시 평가방법")).toBeVisible();
    await expect(page.getByText(/양도 주택이 선순위 상속주택이 아님/)).toBeVisible();

    await toggle(page).click();
    await expect(toggle(page)).toBeChecked();
    await expect(sepDateToggle(page)).toBeChecked();
    await expect(sepDateToggle(page)).toBeDisabled();
    // 날짜 2열 — 건물 칸 라벨은 상속개시일, 토지 칸은 그냥 「토지 취득일」(매매 토지)
    await expect(page.locator('[data-field="acquisitionDate"]')).toContainText("건물 상속개시일");
    await expect(page.locator('[data-field="landAcquisitionDate"]')).toContainText("토지 취득일");
    await expect(page.getByTestId("acq-date-building")).toBeVisible();
    // 건물 고정 칩 + 평가액 칸 / 토지는 매매 4방식 라디오
    await expect(page.getByTestId("part-acq-mode-building-fixed")).toContainText("상속개시일 평가액");
    await expect(page.getByTestId("part-acq-mode-building")).toHaveCount(0);
    await expect(page.getByTestId("part-acq-mode-land")).toBeVisible();
    await expect(page.locator('[data-field="buildingAcquisitionPrice"]')).toContainText("건물 상속개시일 평가액");
    // 숨김 칸(상속 블록·결합 공시·선순위·평가방법)
    await expect(page.getByText("상속세 신고 시 평가방법")).toHaveCount(0);
    await expect(page.getByText(/양도 주택이 선순위 상속주택이 아님/)).toHaveCount(0);
    await expect(page.locator('[data-field="inhHouseValLandArea"]')).toHaveCount(0);
    await expect(page.locator('[data-field="publishedValueAtInheritance"]')).toHaveCount(0);
    await expect(page.getByText("취득 당시 개별주택가격 미공시")).toHaveCount(0);
    // 유지 칸 — 건물 피상속인 취득일 · 동일세대(§154⑧3호) + 확인 필요 caption
    await expect(page.locator('[data-field="decedentAcquisitionDate"]')).toHaveCount(1);
    await expect(page.getByText(/상속개시 당시 피상속인과 동일세대/)).toBeVisible();
    await expect(page.getByTestId("building-cause-155-2-note")).toContainText("확인 필요");
    await expect(page.getByTestId("building-cause-155-2-note")).toContainText("적용하지 않습니다");
  });

  test("⑧ 이동 칸 앵커 — Y2·Y4·Y9·Y1·피상속인이 화면 data-field로 각 1개씩 있다", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, d2("inheritance"));
    for (const f of [
      "landAcquisitionCause",
      "landAcquisitionDate",
      "acquisitionDate",
      "landAcquisitionPrice",
      "buildingAcquisitionPrice",
      "decedentAcquisitionDate",
      "landDirectExpenses",
      "buildingDirectExpenses",
    ]) {
      await expect(page.locator(`[data-field="${f}"]`), f).toHaveCount(1);
    }
  });

  test("입력 → 계산 (건물 상속 + 토지 실가): body는 purchase overlay만 싣고 자산 단위 평가 payload가 없다 · 카드 원인 행", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, inherited());
    await toggle(page).click();
    await fillDateAndVerify(page, { year: "2025", month: "01", day: "10" }, { scope: page.getByTestId("acq-date-land") });
    await page.getByTestId("split-land-acq-price").fill("300000000");
    await page.getByTestId("split-building-acq-price").fill("400000000");

    const body = await calculate(page);
    expect(body).toMatchObject({
      acquisitionCause: "inheritance",
      landAcquisitionCause: "purchase",
      landAcquisitionDate: "2025-01-10",
      isSeparateAcquisition: true,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 400_000_000,
      decedentAcquisitionDate: "2000-01-01",
    });
    for (const k of ["inheritedAcquisition", "inheritedHouseValuation", "landDecedentAcquisitionDate", "landSec164Value"]) {
      expect(body[k], k).toBeUndefined();
    }

    await expect(card(page, "split-card-cause-land")).toHaveText("매매");
    await expect(card(page, "split-card-cause-building")).toHaveText("상속");
  });

  test("입력 → 계산 (건물 증여 + 토지 환산): 요청 body 환산 모드 · 이월과세 고지 · 토글 ON 중 사이드바 취득가액 pending", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, gifted());
    await toggle(page).click();
    await expect(page.getByTestId("building-gift-carryover-notice")).toContainText("이월과세");
    await expect(page.getByTestId("land-part-cause-building-cause").getByText("증여자 취득일")).toBeVisible();
    await expect(page.locator('[data-field="buildingAcquisitionPrice"]')).toContainText("건물 증여 신고가액");
    await fillDateAndVerify(page, { year: "2025", month: "01", day: "10" }, { scope: page.getByTestId("acq-date-land") });
    await page.getByTestId("part-acq-mode-land").getByRole("radio", { name: "환산취득가" }).check();
    await page.getByTestId("split-building-acq-price").fill("400000000");

    const body = await calculate(page);
    expect(body).toMatchObject({
      acquisitionCause: "gift",
      landAcquisitionCause: "purchase",
      landAcqMode: "estimated",
      buildingAcqMode: "actual",
      buildingAcquisitionPrice: 400_000_000,
      isSeparateAcquisition: true,
    });
    for (const k of ["inheritedAcquisition", "inheritedHouseValuation", "landAcquisitionPrice"]) expect(body[k], k).toBeUndefined();
    await expect(card(page, "split-card-cause-land")).toHaveText("매매");
    await expect(card(page, "split-card-cause-building")).toHaveText("증여");
    expect(await stmtText(page, "취득가액")).toContain("건물(증여 신고가액) 400,000,000");
  });

  test("토글 OFF → 분리 입력 stale은 무시된다: 종전 상속 블록이 돌아오고 body에 분리·overlay가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, d2("inheritance", { publishedValueAtInheritance: "700000000", inheritanceValuationMethod: "appraisal" }));
    await expect(toggle(page)).toBeChecked();
    await toggle(page).click();
    await expect(toggle(page)).not.toBeChecked();
    await expect(page.getByText("상속세 신고 시 평가방법")).toBeVisible();
    await expect(page.getByTestId("acq-date-land")).toHaveCount(0);

    const body = await calculate(page);
    expect(body.landAcquisitionCause).toBeUndefined();
    expect(body.isSeparateAcquisition).toBeFalsy();
    expect(body.buildingAcquisitionPrice).toBeUndefined();
    expect(body.landAcquisitionPrice).toBeUndefined();
    expect(body).toHaveProperty("inheritedAcquisition");
  });

  test("Q-5 소유자 분리 토글과 D2 토글은 서로 잠긴다 — 켜진 쪽을 끄면 풀린다", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, inherited());
    await toggle(page).click();
    await expect(ownerToggle(page)).toBeDisabled();
    await toggle(page).click();
    await expect(ownerToggle(page)).toBeEnabled();
    await ownerToggle(page).click();
    await expect(ownerToggle(page)).toBeChecked();
    await expect(toggle(page)).toBeDisabled();
    await ownerToggle(page).click();
    await expect(toggle(page)).toBeEnabled();
  });

  test("호스트 전환: 상속 → 증여는 토글이 꺼지고(값 보존), 매매는 D1 토글 / 증여 → 상속 후 다시 켜면 값이 복원된다", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, d2("inheritance"));
    await expect(toggle(page)).toBeChecked();
    await page.getByRole("radio", { name: "증여", exact: true }).click();
    await expect(toggle(page)).not.toBeChecked();
    await page.getByRole("radio", { name: "매매", exact: true }).click();
    await expect(toggle(page)).toHaveCount(0);
    await expect(page.getByTestId("land-part-cause-purchase")).toBeVisible();
    await expect(page.getByTestId("land-part-cause-purchase").getByRole("switch")).not.toBeChecked();
    // 다시 상속 → 켜기: 토지 취득일·가액이 보존돼 있다
    await page.locator('input[name^="acquisitionCause-"][value="inheritance"]').click();
    await expect(toggle(page)).not.toBeChecked();
    await toggle(page).click();
    await expect(page.getByTestId("acq-date-land").getByLabel("연도").first()).toHaveValue("2025");
    await expect(page.getByTestId("split-land-acq-price")).toHaveValue(/300,000,000/);
  });

  test("노출하지 않는 호스트: 이월과세(증여)·부담부증여에는 토글이 없다", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, inherited({ acquisitionCause: "carryover_gift" }));
    await expect(toggleBlock(page)).toHaveCount(0);
    await seedWizard(page, singleSeed([gifted({ transferType: "burdened_gift" })]));
    await expandAssetSection(page, 3);
    await expect(toggleBlock(page)).toHaveCount(0);
  });

  test("가업상속공제 입력이 있으면 토글을 열지 않는다(켜면 ⑧이 막는데 해제할 칸이 숨는다)", async ({ page }) => {
    test.setTimeout(120_000);
    await open(
      page,
      inherited({
        familyBusinessInheritance: {
          decedentAcquisitionPrice: 100_000_000,
          inheritanceMarketValue: 500_000_000,
          fbDeductionAppliedRate: 0.5,
          inheritanceDate: "2025-05-01",
        },
      }),
    );
    await expect(toggleBlock(page)).toHaveCount(0);
  });

  test("건물 상속개시일 2005.4.30. 전(주택) → 날짜 안내 대신 ② 입력 카드(D2-4b) · 계산 시도가 카드의 주택 구분 칸으로 이동", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, d2("inheritance", { acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01", landAcquisitionDate: "2002-01-10", decedentAcquisitionDate: "1990-01-01" }));
    await expect(page.getByTestId("building-cause-date-notice")).toHaveCount(0);
    await expect(page.getByTestId("building-sec164-card")).toBeVisible();
    await expect(page.getByTestId("acq-date-building").getByLabel("연도").first()).toHaveValue("2003"); // 클램프 없음
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect(page.getByTestId("validation-issues").getByRole("button", { name: /주택 구분/ })).toBeVisible();

    // 긍정 짝: 2025로 고치면 카드가 사라진다
    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, { scope: page.getByTestId("acq-date-building") });
    await expect(page.getByTestId("building-sec164-card")).toHaveCount(0);
  });

  test("같은 날이면 안내가 뜬다 (⑧만 차단)", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, d2("inheritance", { landAcquisitionDate: "2025-05-01" }));
    await expect(page.getByTestId("building-cause-date-notice")).toContainText("취득일이 같으면");
  });

  test("결과 화면(D2-3 표시): 건물 이익 + 토지가 개시 전 취득이면 카드 원인·세율 기산일 행과 D2-Q1 고지가 보인다", async ({ page }) => {
    test.setTimeout(180_000);
    // 건물 취득가 100,000,000(양도 450,000,000 → 이익) — 건물분 차손이면 자산 단위 세율이라 파트 기산일 행·고지가 없다(D1-3 F1)
    await seedWizard(
      page,
      singleSeed([d2("inheritance", { landAcquisitionDate: "2022-01-10", buildingAcquisitionPrice: "100000000", saleSplitMode: "actual", landTransferPrice: "450000000", buildingTransferPrice: "450000000" })]),
    );
    const body = await calculate(page);
    expect(body).toMatchObject({ landAcquisitionCause: "purchase", landAcquisitionDate: "2022-01-10" });
    await expect(card(page, "split-card-cause-land")).toHaveText("매매");
    await expect(card(page, "split-card-cause-building")).toHaveText("상속");
    await expect(page.getByText(/건물을 상속받기 전\(2022-01-10\)에 취득한 토지는 상속개시일\(2025-05-01\)부터/).first()).toBeVisible();
    // 건물 파트 세율 기산일 = 피상속인 취득일(통산) — 토지 파트는 건물 상속개시일부터(D2-Q1)
    const b = (await card(page, "split-card-rate-basis-building").textContent()) ?? "";
    expect(b).toContain("2000-01-01");
    expect(b).toContain("피상속인 취득일");
    // D2-3 — 종전 「주택 취득일이 늦어 주택 취득일부터」는 건물 행의 「피상속인 취득일」과 모순으로 읽혔다. 상대편 날짜를 건물 상속개시일로 부른다.
    const land = (await card(page, "split-card-rate-basis-land").textContent()) ?? "";
    expect(land).toContain("2025-05-01");
    expect(land).toContain("취득일 2022-01-10(소득세법 §104② 본문)보다 건물 상속개시일이 늦어 상속개시일부터");
    expect(land).not.toContain("주택 취득일");
  });

  test("Check #1 PHD 자동 ON 잔재: 건물 2003년 상속 → D2 ON → OFF 뒤 계산이 막다른 길 없이 자산 단위 상속으로 통과한다", async ({ page }) => {
    test.setTimeout(180_000);
    await open(
      page,
      inherited({
        acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01", decedentAcquisitionDate: "1990-01-01",
        publishedValueAtInheritance: "700000000", inheritanceValuationMethod: "appraisal", usePreHousingDisclosure: true, // 매매 시절 자동 ON된 잔재
      }),
    );
    await toggle(page).click();
    await expect(toggle(page)).toBeChecked();
    await expect(page.getByText("취득 당시 개별주택가격 미공시")).toHaveCount(0);
    await toggle(page).click();
    await expect(toggle(page)).not.toBeChecked();
    await expect(page.getByText("취득 당시 개별주택가격 미공시")).toHaveCount(0);

    const body = await calculate(page); // ⑧ 통과 + ⑫ 200 — 화면에 없는 양도시 기준시가 칸을 요구하지 않는다
    expect(body.preHousingDisclosure).toBeUndefined();
    expect(body.landAcquisitionDate).toBeUndefined();
    expect(body.isSeparateAcquisition).toBeFalsy();
    expect(body).toHaveProperty("inheritedAcquisition");
  });
});

