/**
 * E2E: 분리취득 부수토지 — 건물 증여 전 동일세대 거주의 표2 거주기간 공제율 (서면-2025-법규재산-4289)
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §6·§7 (시료 S1)
 * S1: 토지 2000-06-01 매수 · 건물 2012-10-01 같은 세대 배우자 증여 · 증여 전 함께 거주 132개월 · 증여 후 본인 거주 0 ·
 *     2025-01-15 양도 20억(토지 14억·건물 6억) · 1세대 1주택 · 비조정.
 * 수치(공제율·공제액)는 세율표와 무관하다(장기보유특별공제표 · 과세 양도차익 토지 5.2억·건물 2.2억):
 *   ON 132개월 → 토지 80% = 416,000,000 · 건물 40% = 88,000,000 / OFF → 토지 30% = 156,000,000 · 건물 24% = 52,800,000
 * 수정 전(master 293a206cd) 서버에서는 D2 증여 블록에 이 토글이 없어 ON 시나리오가 실패한다.
 *
 * ⚠️ 워크트리 실행은 E2E_PORT 필수. 시드는 `landCauseHost`를 함께 넣는다(normalize가 지운다).
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, housing, num, seedWizard, singleSeed, stmtText } from "./_helpers/split-acq-display";

/** S1 — D2 증여 호스트(토글 「토지는 다른 원인으로 취득」 ON 상태)에서 시작한다. */
const s1 = (over: Record<string, unknown> = {}) =>
  housing({
    acquisitionCause: "gift",
    acquisitionDate: "2012-10-01",
    landAcquisitionCause: "purchase",
    landCauseHost: "gift",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2000-06-01",
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "100000000",
    buildingAcquisitionPrice: "50000000",
    actualSalePrice: "2000000000",
    saleSplitMode: "actual",
    landTransferPrice: "1400000000",
    buildingTransferPrice: "600000000",
    landStandardPriceAtTransfer: "1400000000",
    buildingStandardPriceAtTransfer: "600000000",
    residencePeriodMonthsAsset: "0",
    ...over,
  });

const formOver = {
  transferDate: "2025-01-15",
  filingDate: "2025-03-31",
  contractTotalPrice: "2000000000",
  householdHousingCount: "1",
  isOneHousehold: true,
};

const card = (p: Page) => p.getByTestId("land-part-donor-same-household");
const sw = (p: Page) => card(p).getByRole("switch").first();
const months = (p: Page) => p.getByTestId("land-part-prior-residence-months").locator("input");

async function open(page: Page, asset: Record<string, unknown>) {
  await seedWizard(page, singleSeed([asset], formOver));
  await expandAssetSection(page, 3);
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="transfer-date"] input');
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  });
}

test.describe("4289 — D2 증여 블록의 「건물 증여 전 같은 세대 거주」", () => {
  test("토글 ON · 132개월 → 요청 body에 새 필드 2개 · 신고서 토지 장특 416,000,000(80%) · 거주 기간분 산식 「거주 11년×4% = 40%」", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, s1());
    await expect(card(page)).toBeVisible();
    await expect(sw(page)).toHaveAttribute("aria-checked", "false");
    // 토글 OFF에서는 개월 칸이 없다
    await expect(months(page)).toHaveCount(0);

    await sw(page).click();
    await expect(sw(page)).toHaveAttribute("aria-checked", "true");
    await expect(months(page)).toBeVisible();
    await months(page).fill("132");
    await expect(months(page)).toHaveValue("132");

    const body = await calculate(page);
    expect(body.landPartDonorSameHousehold).toBe(true);
    expect(body.landPartPriorHouseholdResidenceMonths).toBe(132);
    expect(body.landAcquisitionCause).toBe("purchase");

    const lt = await formRow(page, "장기보유특별공제");
    // 열 순서: 라벨 · 합계 · 토지 · 건물 (split-2col)
    expect(lt.map(num)).toContain(416_000_000);
    expect(lt.map(num)).toContain(88_000_000);
    expect(await stmtText(page, " 거주 기간분 장특")).toContain("거주 11년×4% = 40%");
    expect(await stmtText(page, " 거주 기간분 장특")).toContain("거주 0년(2년 미만 — 거주기간 공제 없음)");
    const res = await formRow(page, "거주기간");
    expect(res.join("|")).toContain("11년 0월");
  });

  test("토글 OFF(짝): body에 새 필드가 없고 토지 장특 156,000,000(30%) · 건물 52,800,000(24%)", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, s1());
    const body = await calculate(page);
    expect(body).not.toHaveProperty("landPartDonorSameHousehold");
    expect(body).not.toHaveProperty("landPartPriorHouseholdResidenceMonths");
    const lt = (await formRow(page, "장기보유특별공제")).map(num);
    expect(lt).toContain(156_000_000);
    expect(lt).toContain(52_800_000);
  });

  test("토글을 켰다 끄면 개월 값도 body에 실리지 않는다(stale 방지)", async ({ page }) => {
    test.setTimeout(180_000);
    await open(page, s1());
    await sw(page).click();
    await months(page).fill("132");
    await sw(page).click();
    await expect(sw(page)).toHaveAttribute("aria-checked", "false");
    const body = await calculate(page);
    expect(body).not.toHaveProperty("landPartDonorSameHousehold");
    expect(body).not.toHaveProperty("landPartPriorHouseholdResidenceMonths");
  });

  test("건물 취득원인을 상속으로 바꾸면 이 칸은 사라진다(D2 상속 호스트에는 없음)", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, s1());
    await expect(card(page)).toBeVisible();
    await page.getByRole("radio", { name: "상속", exact: true }).click();
    await expect(card(page)).toHaveCount(0);
  });

  test("§155⑳ 거주주택 특례를 선언한 자산: 칸은 보이되 켤 수 없고 사유가 보인다(막다른 길 금지)", async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, s1({ rentalHousingException: { applyException: true, scenario: "B", rentalUnits: [] } }));
    await expect(card(page)).toBeVisible();
    await expect(sw(page)).toBeDisabled();
    await expect(card(page)).toContainText("장기임대주택 거주주택 특례(§155⑳)를 선언한 자산에서는 쓸 수 없습니다");
  });
});
