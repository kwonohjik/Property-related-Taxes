/**
 * E2E: 토지를 건물보다 **나중에** 취득한 분리취득 — 토지분 거주기간별 공제율은 토지 보유기간 중 거주만 (역방향 · V-11 직접 입력 안내)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §8 · V-11
 * S2: 건물 2010-03-01 매수 · 토지 2020-03-01 매수 · 2025-01-15 양도 20억(토지 14억·건물 6억) · 1세대 1주택 · 비조정.
 *   토지 보유 2020-03-01~2025-01-15 = 58개월(4년) · 건물 보유 14년. 과세 양도차익 토지 2억·건물 2억(12억 초과분 안분).
 *   ① 직접 178개월 → ④가 키를 싣지 않고 엔진이 보유 58개월로 상한: 토지 32% = 64,000,000 · 건물 80% = 160,000,000 · 산출세액 45,990,000 · 상한 고지 1건
 *   ② 구간 2010-03-01~2025-01-15 → ④가 겹침 58개월(`landHoldingResidenceMonths`)을 싣는다: 같은 32% · 같은 세액 · 고지 없음
 *   ⑤ 보유 상황 단계의 「거주기간(개월)」 직접 입력 칸에만 안내가 보인다(구간 입력은 칸 자체가 없다).
 * 수정 전 서버에서는 직접 입력 hint 단언이 실패한다(안내 칸이 없다).
 *
 * ⚠️ 워크트리 실행은 E2E_PORT 필수. 세액은 세율표 의존이라 실행 환경의 세율(2024 누진표)과 같을 때만 같다.
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, housing, num, seedWizard, singleSeed } from "./_helpers/split-acq-display";

const INTERVAL = { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2010-03-01", moveOutDate: "2025-01-15" }] };

const s2 = (over: Record<string, unknown> = {}) =>
  housing({
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-01",
    landAcquisitionDate: "2020-03-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "900000000",
    buildingAcquisitionPrice: "100000000",
    actualSalePrice: "2000000000",
    saleSplitMode: "actual",
    landTransferPrice: "1400000000",
    buildingTransferPrice: "600000000",
    landStandardPriceAtTransfer: "1400000000",
    buildingStandardPriceAtTransfer: "600000000",
    residencePeriodMonthsAsset: "178",
    ...over,
  });

const formOver = {
  transferDate: "2025-01-15",
  filingDate: "2025-03-31",
  contractTotalPrice: "2000000000",
  householdHousingCount: "1",
  isOneHousehold: true,
};

const HINT = "residence-land-holding-hint";
const NOTICE = "토지 보유기간 중 거주만 셉니다";

async function open(page: Page, asset: Record<string, unknown>) {
  await seedWizard(page, singleSeed([asset], formOver));
  await expandAssetSection(page, 3);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

async function gotoHolding(page: Page) {
  await page.getByRole("button", { name: "보유 상황", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "보유 상황" })).toBeVisible();
}

test.describe("역방향 — 토지를 건물보다 나중에 취득한 분리취득(S2)", () => {
  test("직접 178개월: 보유 상황의 거주기간(개월) 칸에 안내 · 요청 body에 겹침 키 없음 · 토지 32% · 고지 1건 · 산출세액 45,990,000", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, s2());
    await gotoHolding(page);
    const field = page.locator('[data-field="residencePeriodMonthsAsset"]');
    await expect(field).toBeVisible();
    const hint = page.getByTestId(HINT);
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("토지를 건물보다 나중에 취득해 토지분 거주기간은 토지 보유기간 안의 거주만 셉니다");
    await expect(hint).toContainText("입주·퇴거일 구간으로 입력하면 겹친 기간만 셉니다");
    // 기존 hint는 덮이지 않고 같은 칸에 함께 있다
    await expect(field).toContainText("표2 거주분 공제율");

    const body = await calculate(page);
    expect(body).not.toHaveProperty("landHoldingResidenceMonths");
    expect(body.residencePeriodMonths).toBe(178);
    const lt = (await formRow(page, "장기보유특별공제")).map(num);
    expect(lt).toContain(64_000_000);
    expect(lt).toContain(160_000_000);
    expect((await formRow(page, "산출세액")).map(num)).toContain(45_990_000);
    // 고지: 같은 문장이 결과 카드에 1건(인쇄용 중복 DOM이 있으면 first만 본다)
    const notes = page.locator("li", { hasText: NOTICE });
    expect(await notes.count()).toBeGreaterThan(0);
    await expect(notes.first()).toContainText("거주기간 178개월을 토지 보유기간 58개월로 상한해 계산했습니다");
    await expect(notes.first()).toContainText("확인 필요");
    // 신고서 거주기간 칸: 토지 열은 토지 보유기간 중 거주 4년
    expect((await formRow(page, "거주기간")).join("|")).toContain("4년 0월");
  });

  test("구간 2010-03-01~2025-01-15: 안내 없음(직접 입력 칸도 없다) · body에 landHoldingResidenceMonths 58 · 같은 32% · 같은 세액 · 고지 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, s2(INTERVAL));
    await gotoHolding(page);
    await expect(page.locator('[data-field="residencePeriods.0.moveInDate"]')).toBeVisible();
    await expect(page.locator('[data-field="residencePeriodMonthsAsset"]')).toHaveCount(0);
    await expect(page.getByTestId(HINT)).toHaveCount(0);

    const body = await calculate(page);
    expect(body.landHoldingResidenceMonths).toBe(58);
    expect(body.residencePeriodMonths).toBe(178);
    const lt = (await formRow(page, "장기보유특별공제")).map(num);
    expect(lt).toContain(64_000_000);
    expect((await formRow(page, "산출세액")).map(num)).toContain(45_990_000);
    await expect(page.locator("li", { hasText: NOTICE })).toHaveCount(0);
  });

  test("짝 — 토지가 먼저 취득(2000-03-01)이면 직접 입력 칸은 있어도 안내는 없다", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, s2({ landAcquisitionDate: "2000-03-01" }));
    await gotoHolding(page);
    await expect(page.locator('[data-field="residencePeriodMonthsAsset"]')).toBeVisible();
    await expect(page.getByTestId(HINT)).toHaveCount(0);
  });
});
