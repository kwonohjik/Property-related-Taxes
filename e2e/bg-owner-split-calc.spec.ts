/**
 * E2E — 부담부증여 × 토지·건물 소유자 분리(건물 종류) → 증여한 부분(본인 소유분)만 §159로 계산 (계획서 `docs/00-pm/bg-owner-split-159.plan.md` PR-3)
 *
 * 종전(#3272): 같은 입력을 ⑤ 토글 잠금·⑧·⑫가 막았다. 이제 건물 종류(매매·단독 소유)는 본인 몫을 받아 계산한다. 주택 등 범위 밖은 계속 막는다.
 *   · BGO-E1 건물만 본인 · 기준시가 평가 — 요청 본문에 selfOwns · 건물 기준시가 양시점 · 비소유(토지) 0 · 결과 화면에 NaN·undefined 없음
 *   · BGO-E2 범위 밖(주택) 토글 잠금 · 범위 안(건물) 토글은 켤 수 있고 안내 카드가 뜬다
 *   · BGO-E3 채무 확인을 비우고 «다음» → 그 칸으로 이동 · 확인하면 진행
 *   · BGO-E4 소유자 분리를 끄면(토지·건물 취득일이 다르면) 날짜 분리 카드가 이어서 뜬다
 *
 * 실행(워크트리): E2E_PORT=3159 npx playwright test e2e/bg-owner-split-calc.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard, singleSeed } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";

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
    // 결과 화면 — 빈 값·NaN 없음(결과 카드의 증여한 부분 echo는 PR-4)
    const table = page.locator('[data-print-id="form-table"]').first();
    await expect(table).toBeVisible();
    const text = await page.locator("body").innerText();
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
});
