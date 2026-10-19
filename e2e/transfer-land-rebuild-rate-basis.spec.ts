/**
 * E2E: 구주택 멸실·신축 통산(해석 (5) — 서면법규과-1222 · 사전-2023-법규재산-0097) 입력 → 계산 → 요청 body → 결과 4뷰
 *
 * 설계: docs/02-design/features/appurtenant-land-rebuild-rate-basis.ui.design.md
 *
 * - 시드(신축 + 「토지는 다른 원인으로 취득」=상속) → 토글 ON → 구주택 시작 구분 · 멸실일 · 정착면적 확인 → 계산 → body `landRebuildPriorHouse`(⑬) →
 *   카드·상세명세서·신고서·PDF가 두 구간·합산 개월·「세율 판정용 환산 기산일」을 보인다(환산 기산일은 실제 취득일이 아니다).
 * - 호스트 닫힘(토지 원인 토글 OFF) → 블록이 사라지고 body에 키가 없다 · 다시 켜면 입력이 복원된다(저장값 불삭제).
 * - 다건(합산) 경로 · 모바일 375px 가로 스크롤 없음.
 * - 매매 호스트(취득원인 매매 + 「토지·건물 취득일 다름」, 서면법규과-1222의 사실관계): 취득일 다름 ON → 날짜 2열 직후 블록 → 입력 → 계산 → body 키 →
 *   취득원인이 같아(mixedCause=false) 세율 기산일 행이 없어도 카드·명세서·신고서·PDF가 구간을 보인다 · 토지 상속·증여 overlay를 켜면 블록이 사라진다.
 *
 * ⚠️ 워크트리 실행은 E2E_PORT 필수.
 */
import { promises as fs } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { calculate, card, housing, multiForm, multiProps, runMulti, seedWizard, singleSeed, stmtText } from "./_helpers/split-acq-display";

/** 건물 신축(사용승인 2019-06-01) · 토지 상속(상속개시일 2015-05-01, 피상속인 취득일 2005-01-01) · 양도 2026-02-16 · 양도 900,000,000(토지 6억 + 건물 3억) */
const built = (over: Record<string, unknown> = {}) =>
  housing({
    acquisitionCause: "newConstruction",
    occupancyApprovalDate: "2019-06-01",
    acquisitionDate: "2019-06-01",
    fixedAcquisitionPrice: "150000000",
    buildingAcquisitionPrice: "",
    landAcquisitionCause: "inheritance",
    landCauseHost: "newConstruction",
    landAcquisitionDate: "2015-05-01",
    landDecedentAcquisitionDate: "2005-01-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    saleSplitMode: "actual",
    landTransferPrice: "600000000",
    buildingTransferPrice: "300000000",
    ...over,
  });

const toggle = (p: Page) => p.getByTestId("land-rebuild-toggle").getByRole("switch").first();
const footprint = (p: Page) => p.getByTestId("land-rebuild-footprint-toggle").getByRole("switch");
const dateScope = (p: Page, id: string) => p.getByTestId(id);

async function openBlock(page: Page, asset: Record<string, unknown>) {
  await seedWizard(page, singleSeed([asset]));
  await expandAssetSection(page, 3);
  await expect(page.getByTestId("land-rebuild-block")).toBeVisible();
}

test.describe("구주택 멸실·신축 통산 — 입력 → 계산 → 결과 4뷰", () => {
  test("since_land: 토글 ON → 구분·멸실일·정착면적 확인 → body 키 · 카드·명세서·신고서·PDF가 두 구간·합산 개월·환산 기산일을 보인다", async ({ page }) => {
    test.setTimeout(180_000);
    // PDF 폰트 CDN 대체 — 응답에 CORS 허용 헤더를 붙인다
    const font = await fs.readFile("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
      route.fulfill({ status: 200, contentType: "font/ttf", body: font, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } }),
    );
    await openBlock(page, built());

    // 토글 OFF: 입력 칸이 접혀 있다 · body 키 없음(기존 화면 불변)
    await expect(page.getByTestId("land-rebuild-start-mode")).toHaveCount(0);
    await toggle(page).click();
    await expect(page.getByTestId("land-rebuild-notice")).toContainText("본인 소유였던 구주택");
    // 구주택 취득일 칸은 「아니오」일 때만
    await expect(page.getByTestId("land-rebuild-prior-start-date")).toHaveCount(0);
    await page.getByTestId("land-rebuild-start-since-land").check();
    await expect(page.getByTestId("land-rebuild-prior-start-date")).toHaveCount(0);
    await fillDateAndVerify(page, { year: "2017", month: "3", day: "31" }, { scope: dateScope(page, "land-rebuild-demolition-date") });
    await footprint(page).click();

    const body = await calculate(page);
    expect(body.landRebuildPriorHouse).toEqual({ startMode: "since_land", demolitionDate: "2017-03-31", footprintUnchanged: true });

    // ① 카드 — 세율 기산일 칸 「환산 …」 + 구간 블록. 2005-01-01~2017-03-31 = 147개월(12년 3개월) + 신축 2019-06-01~2026-02-16 = 80개월 → 227개월
    await expect(page.getByTestId("split-card-rate-basis-land").first()).toContainText("환산 ");
    const lines = page.getByTestId("split-card-rate-holding").first();
    await expect(lines).toContainText("구주택 부수토지 기간 2005-01-01~2017-03-31 (147개월");
    await expect(lines).toContainText("신축주택 부수토지 기간 2019-06-01~2026-02-16 (80개월)");
    await expect(lines).toContainText("147개월 + 80개월 = 227개월");
    await expect(lines).toContainText("실제 취득일이 아님");
    await lines.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]").screenshot({ path: "e2e/_artifacts/land-rebuild-card.png" });
    // ② 상세명세서 — 산출세액 행 각주
    const stmt = await stmtText(page, "산출세액");
    expect(stmt).toContain("세율 판정용 환산 기산일");
    expect(stmt).toContain("227개월 통산");
    // ③ 신고서 — 취득일 칸 각주
    const filing = ((await page.locator('[data-print-id="form-table"]').first().textContent()) ?? "").replace(/\s+/g, " ");
    expect(filing).toContain("세율 판정용 환산 기산일");
    expect(filing).toContain("227개월 통산");
    // 엔진 고지(확인 필요) — 결과 화면 경고 영역
    const text = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
    expect(text).toContain("나대지 기간 제외와 일수 버림은 해석례가 직접 정하지 않은 처리입니다");
    expect(text).toContain("장기보유특별공제 보유기간의 통산은 이번 계산에 반영하지 않았습니다 — 확인 필요");
    // ④ PDF — 선택 항목 PDF 생성이 새 행에서 던지지 않고 파일을 낸다(구간 문구 내용은 vitest가 같은 섹션 컴포넌트로 고정한다 —
    //    E2E에서는 한글 폰트를 CDN에서 받는데 spec 공통 헤더가 CORS preflight에 막혀 생성 자체가 실패하므로 라틴 폰트로 대체해 생성 스모크만 본다).
    await page.getByRole("button", { name: "전체 선택" }).click();
    const dl = page.waitForEvent("download", { timeout: 90_000 });
    await page.getByRole("button", { name: "선택 항목 PDF" }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toContain("양도소득세_계산결과");
    expect((await fs.stat((await file.path())!)).size).toBeGreaterThan(1000);
    await page.screenshot({ path: "e2e/_artifacts/land-rebuild-result.png", fullPage: true });
  });

  test("later + 24개월 미만: 구주택 취득일 칸 · body priorHouseStartDate · 2년 미만 확장 적용 고지", async ({ page }) => {
    test.setTimeout(180_000);
    // 토지 2023-06-01 상속(피상속인 2020-01-01) · 신축 사용승인 2025-06-01 · 양도 2026-02-16(신축 8개월)
    await openBlock(page, built({ landAcquisitionDate: "2023-06-01", landDecedentAcquisitionDate: "2020-01-01", occupancyApprovalDate: "2025-06-01", acquisitionDate: "2025-06-01" }));
    await toggle(page).click();
    await page.getByTestId("land-rebuild-start-later").check();
    await expect(page.getByTestId("land-rebuild-prior-start-date")).toBeVisible();
    await fillDateAndVerify(page, { year: "2024", month: "1", day: "1" }, { scope: dateScope(page, "land-rebuild-prior-start-date") });
    await fillDateAndVerify(page, { year: "2024", month: "12", day: "31" }, { scope: dateScope(page, "land-rebuild-demolition-date") });
    await footprint(page).click();

    const body = await calculate(page);
    expect(body.landRebuildPriorHouse).toEqual({ startMode: "later", priorHouseStartDate: "2024-01-01", demolitionDate: "2024-12-31", footprintUnchanged: true });
    // 12개월(2024-01-01~2024-12-31) + 8개월(2025-06-01~2026-02-16) = 20개월 — 24개월 미만이라 확장 적용 고지가 붙는다
    await expect(page.getByTestId("split-card-rate-holding").first()).toContainText("12개월 + 8개월 = 20개월");
    await expect(page.getByTestId("split-card-rate-holding").first()).toContainText("입력한 구주택 취득일부터");
    const text = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
    expect(text).toContain("0097 회신은 통산 2년 이상인 경우만 직접 답했고");
  });

  test("호스트 닫힘 — 토지 원인 토글 OFF면 블록이 사라지고 body에 키가 없다 · 다시 켜면 입력이 복원된다(저장값 불삭제)", async ({ page }) => {
    test.setTimeout(180_000);
    await openBlock(
      page,
      built({ landRebuildEnabled: true, landRebuildStartMode: "since_land", landRebuildDemolitionDate: "2017-03-31", landRebuildFootprintUnchanged: true }),
    );
    await expect(toggle(page)).toBeChecked();
    // 「토지는 다른 원인으로 취득」 끄기 → 호스트 닫힘
    await page.locator('[data-field="landAcquisitionCause"]').getByRole("switch").click();
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(0);
    const body = await calculate(page);
    expect("landRebuildPriorHouse" in body).toBe(false);
    await expect(page.getByTestId("split-card-rate-holding")).toHaveCount(0);

    // 되돌리기 — 켜 둔 통산 입력이 그대로 복원된다
    await page.getByRole("button", { name: "자산 목록", exact: true }).first().click();
    await expandAssetSection(page, 3);
    await page.locator('[data-field="landAcquisitionCause"]').getByRole("switch").click();
    await expect(page.getByTestId("land-rebuild-block")).toBeVisible();
    await expect(toggle(page)).toBeChecked();
    await expect(footprint(page)).toBeChecked();
  });

  test("취득원인을 매매로 바꾸면 매매 호스트가 열려 블록은 한 번만 남는다 · 상속(건물)으로 바꾸면 사라진다(부정형 짝)", async ({ page }) => {
    test.setTimeout(120_000);
    await openBlock(page, built({ landRebuildEnabled: true, landRebuildStartMode: "since_land", landRebuildDemolitionDate: "2017-03-31", landRebuildFootprintUnchanged: true }));
    // 신축 호스트의 블록은 「토지는 다른 원인으로 취득」 펼침 안에 있다 — 매매로 바꾸면 overlay가 풀리고(취득일 다름은 켜진 채) 매매 호스트 블록이 날짜 2열 직후에 열린다
    await page.getByRole("radio", { name: "매매", exact: true }).first().check();
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(1);
    await expect(page.getByTestId("land-rebuild-purchase-notice")).toBeVisible();
    await expect(toggle(page)).toBeChecked();
    // 건물 원인이 상속·증여면 이 입력의 호스트가 아니다
    await page.getByRole("radio", { name: "상속", exact: true }).first().check();
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(0);
    await expect(page.getByTestId("land-rebuild-toggle")).toHaveCount(0);
  });
});

test.describe("구주택 멸실·신축 통산 — 다건(합산) 경로", () => {
  test("다건 건1: 통산 body 키(⑬) · 건별 상세 카드에 구간 블록", async ({ page }) => {
    test.setTimeout(180_000);
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer/multi") && r.method() === "POST", { timeout: 120_000 });
    await runMulti(
      page,
      "e2e-land-rebuild-multi",
      "구주택 멸실·신축 통산 다건 (E2E)",
      multiProps(() => multiForm(built({ landRebuildEnabled: true, landRebuildStartMode: "since_land", landRebuildDemolitionDate: "2017-03-31", landRebuildFootprintUnchanged: true, actualSalePrice: "900000000" }))),
    );
    const sent = (await reqP).postDataJSON() as { properties: Record<string, unknown>[] };
    expect(sent.properties[0].landRebuildPriorHouse).toEqual({ startMode: "since_land", demolitionDate: "2017-03-31", footprintUnchanged: true });
    const lines = page.getByTestId("split-card-rate-holding").first();
    await expect(lines).toBeAttached();
    expect(((await lines.textContent()) ?? "").replace(/\s+/g, " ")).toContain("147개월 + 80개월 = 227개월");
  });
});

test.describe("구주택 멸실·신축 통산 — 모바일 375px", () => {
  test("입력 블록(전부 펼침)과 결과 화면 모두 가로 스크롤이 없다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await openBlock(page, built({ landRebuildEnabled: true, landRebuildStartMode: "later", landRebuildPriorHouseStartDate: "2010-01-01", landRebuildDemolitionDate: "2017-03-31", landRebuildFootprintUnchanged: true }));
    await expect(page.getByTestId("land-rebuild-prior-start-date")).toBeVisible();
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    const block = await page.getByTestId("land-rebuild-block").boundingBox();
    expect(block!.x + block!.width).toBeLessThanOrEqual(375);
    await page.getByTestId("land-rebuild-block").screenshot({ path: "e2e/_artifacts/land-rebuild-block-375.png" });
    // 375px는 단계 목록이 숨어 「다음」으로 가산세 단계까지 간다
    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "다음", exact: true }).click();
      await page.waitForTimeout(400);
    }
    const reqP = page.waitForRequest((r) => r.url().includes("/api/calc/transfer") && r.method() === "POST");
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    expect(((await reqP).postDataJSON() as Record<string, unknown>).landRebuildPriorHouse).toBeTruthy();
    await page.locator('[data-print-id="form-table"]').first().waitFor({ timeout: 60_000 });
    await expect(card(page, "split-card-rate-holding")).toBeAttached();
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 매매 호스트 — 매수한 토지 + 그 위에 신축한 주택 (취득원인 매매 + 「토지·건물 취득일 다름」)
// ─────────────────────────────────────────────────────────────────────────────

/** 취득원인 매매 · 토지 매수 2005-01-01 · 건물(신축 취득일 = 사용승인일) 2019-06-01 · 양도 2026-02-16 · 양도 900,000,000(토지 6억 + 건물 3억) · 「취득일 다름」은 OFF에서 시작 */
const bought = (over: Record<string, unknown> = {}) =>
  housing({
    acquisitionCause: "purchase",
    acquisitionDate: "2019-06-01",
    landAcquisitionDate: "2019-06-01",
    hasSeperateLandAcquisitionDate: false,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "150000000",
    saleSplitMode: "actual",
    landTransferPrice: "600000000",
    buildingTransferPrice: "300000000",
    ...over,
  });

const ownChip = (p: Page) => p.locator('[data-variant="chip"]').filter({ hasText: "토지·건물 취득일 다름" }).getByRole("switch");
const overlayChip = (p: Page) => p.locator('[data-field="landAcquisitionCause"]').getByRole("switch");
const STORED = { landRebuildEnabled: true, landRebuildStartMode: "since_land", landRebuildDemolitionDate: "2017-03-31", landRebuildFootprintUnchanged: true };

test.describe("구주택 멸실·신축 통산 — 매매 호스트(취득일 다름)", () => {
  test("전 흐름: 취득일 다름 ON → 날짜 2열 직후 블록 → 입력 → 계산 → body 키 · 카드·명세서·신고서·PDF 구간(취득원인이 같아 세율 기산일 행은 없다)", async ({ page }) => {
    test.setTimeout(180_000);
    const font = await fs.readFile("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf");
    await page.route("https://cdn.jsdelivr.net/**", (route) =>
      route.fulfill({ status: 200, contentType: "font/ttf", body: font, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } }),
    );
    await seedWizard(page, singleSeed([bought()]));
    await expandAssetSection(page, 3);
    // 취득일 다름 OFF — 블록 없음
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(0);
    await ownChip(page).click();
    await fillDateAndVerify(page, { year: "2005", month: "1", day: "1" }, { scope: page.getByTestId("acq-date-land") });
    await expect(page.getByTestId("land-rebuild-block")).toBeVisible();
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(1);
    // 토지·건물 날짜 2열 직후 — 블록이 날짜 그리드 뒤, 양도가액 구분(축 A) 앞에 있다
    const order = await page.evaluate(() => {
      const grid = document.querySelector('[data-testid="acq-date-split-grid"]')!;
      const blk = document.querySelector('[data-testid="land-rebuild-block"]')!;
      const axisA = document.querySelector('[data-testid="sale-split-mode"]')!;
      return { afterGrid: !!(grid.compareDocumentPosition(blk) & Node.DOCUMENT_POSITION_FOLLOWING), beforeAxisA: !!(blk.compareDocumentPosition(axisA) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    expect(order).toEqual({ afterGrid: true, beforeAxisA: true });

    await toggle(page).click();
    await expect(page.getByTestId("land-rebuild-purchase-notice")).toContainText("건물 취득일 칸에는 신축 주택의 취득일을 넣으세요");
    await expect(page.getByTestId("land-rebuild-purchase-notice")).toContainText("사용승인서 교부일");
    await expect(page.getByTestId("land-rebuild-purchase-notice")).toContainText("소득세법 시행령 §162 ① 4호");
    await page.getByTestId("land-rebuild-start-since-land").check();
    await fillDateAndVerify(page, { year: "2017", month: "3", day: "31" }, { scope: dateScope(page, "land-rebuild-demolition-date") });
    await footprint(page).click();
    await page.getByTestId("land-rebuild-block").screenshot({ path: "e2e/_artifacts/land-rebuild-purchase-block.png" });

    const body = await calculate(page);
    expect(body.acquisitionCause).toBe("purchase");
    expect("landAcquisitionCause" in body).toBe(false);
    expect(body.landRebuildPriorHouse).toEqual({ startMode: "since_land", demolitionDate: "2017-03-31", footprintUnchanged: true });

    // 토지 2005-01-01 ~ 멸실 2017-03-31 = 147개월 + 건물(신축) 2019-06-01 ~ 양도 2026-02-16 = 80개월 → 227개월
    await expect(page.getByTestId("split-card-rate-basis-land")).toHaveCount(0);
    const lines = page.getByTestId("split-card-rate-holding").first();
    await expect(lines).toContainText("구주택 부수토지 기간 2005-01-01~2017-03-31 (147개월");
    await expect(lines).toContainText("신축주택 부수토지 기간 2019-06-01~2026-02-16 (80개월)");
    await expect(lines).toContainText("147개월 + 80개월 = 227개월");
    await expect(lines).toContainText("실제 취득일이 아님");
    const stmt = await stmtText(page, "산출세액");
    expect(stmt).toContain("토지 세율 보유기간 통산");
    expect(stmt).toContain("세율 판정용 환산 기산일");
    expect(stmt).toContain("227개월");
    const filing = ((await page.locator('[data-print-id="form-table"]').first().textContent()) ?? "").replace(/\s+/g, " ");
    expect(filing).toContain("세율 판정용 환산 기산일");
    expect(filing).toContain("227개월");
    const text = ((await page.locator("body").textContent()) ?? "").replace(/\s+/g, " ");
    expect(text).toContain("나대지 기간 제외와 일수 버림은 해석례가 직접 정하지 않은 처리입니다");
    await page.getByRole("button", { name: "전체 선택" }).click();
    const dl = page.waitForEvent("download", { timeout: 90_000 });
    await page.getByRole("button", { name: "선택 항목 PDF" }).click();
    const file = await dl;
    expect((await fs.stat((await file.path())!)).size).toBeGreaterThan(1000);
    await page.screenshot({ path: "e2e/_artifacts/land-rebuild-purchase-result.png", fullPage: true });
  });

  test("토지 상속·증여 overlay를 켜면 블록이 사라지고 끄면 입력이 복원된다(저장값 불삭제)", async ({ page }) => {
    test.setTimeout(120_000);
    await seedWizard(page, singleSeed([bought({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-01-01", ...STORED })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("land-rebuild-block")).toBeVisible();
    await expect(toggle(page)).toBeChecked();
    await overlayChip(page).click();
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(0);
    await overlayChip(page).click();
    await expect(page.getByTestId("land-rebuild-block")).toBeVisible();
    await expect(toggle(page)).toBeChecked();
    await expect(footprint(page)).toBeChecked();
    await expect(page.getByTestId("land-rebuild-demolition-date")).toBeVisible();
  });

  test("overlay가 켜진 채 저장된 매매 자산(건물은 매수·토지는 상속)은 블록이 없고 body에 키가 없다", async ({ page }) => {
    test.setTimeout(180_000);
    // 건물 매수 + 토지 상속(상속개시일 2010-03-15·피상속인 2005-01-01) — 건물을 산 것이지 신축이 아니다
    await seedWizard(
      page,
      singleSeed([
        bought({
          hasSeperateLandAcquisitionDate: true,
          landAcquisitionCause: "inheritance",
          landCauseHost: "purchase",
          landAcquisitionDate: "2010-03-15",
          landDecedentAcquisitionDate: "2005-01-01",
          ...STORED,
        }),
      ]),
    );
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(0);
    const body = await calculate(page);
    expect("landRebuildPriorHouse" in body).toBe(false);
    await expect(page.getByTestId("split-card-rate-holding")).toHaveCount(0);
  });

  test("취득일 다름 OFF → 블록이 닫히고 body에 키가 없다(저장값은 남는다)", async ({ page }) => {
    test.setTimeout(180_000);
    // 취득일 다름을 끄면 자산 전체 「취득가액」 칸이 정본이다 — 끈 뒤에도 계산이 막히지 않게 시드해 둔다
    await seedWizard(page, singleSeed([bought({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2005-01-01", fixedAcquisitionPrice: "450000000", ...STORED })]));
    await expandAssetSection(page, 3);
    await expect(page.getByTestId("land-rebuild-block")).toBeVisible();
    await ownChip(page).click();
    await expect(page.getByTestId("land-rebuild-block")).toHaveCount(0);
    const body = await calculate(page);
    expect("landRebuildPriorHouse" in body).toBe(false);
  });
});

