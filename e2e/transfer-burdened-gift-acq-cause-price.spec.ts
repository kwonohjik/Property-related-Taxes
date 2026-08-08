/**
 * E2E: **부담부증여 × 상속·증여 취득원인** — §159가 무시하는 취득가액 칸을 띄우지 않는다
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-5
 *
 * 「소득세법 시행령」 제159조가 「양도로 보는 부분」의 취득가액을 **채무비율 × 취득당시 기준시가**로
 * 정하고 엔진이 `acquisitionPrice`를 덮어쓴다. 실측으로 취득가액에 50억을 넣어도 세액이 변하지
 * 않으며 **일반건물·주택·토지·상가 전 자산종류가 같다**. ⑧ validate도 요구하지 않는다.
 *
 * 매매 경로는 이미 같은 판단이었고(`CompanionAcqPurchaseBlock.tsx:262`), 상속·증여만 예외였다.
 *
 *   IG-1. 부담부증여 + 상속 → §159 안내가 뜨고 「취득가액 의제 특례」 축은 사라진다
 *   IG-2. 부담부증여 + 증여 → 「증여 신고가액」 칸이 사라진다
 *   IG-3. **일반 양도 + 상속·증여 → 종전대로 보인다** (회귀 0 + IG-1·2의 양성 대조군)
 *   IG-4. 부담부증여 + 상속의 **날짜 두 칸은 남는다** (보유기간·단기 통산에 쓰인다)
 *
 * ⚠️ IG-3은 장식이 아니다 — 없으면 IG-1·2의 `toHaveCount(0)`이 「대상을 잘못 짚어서 0」인
 *    경우에도 통과한다(memory `feedback_negative_assertion_needs_mutation_probe`).
 *    실제로 이 스펙을 쓰기 직전 같은 실수를 한 번 했다(계획서 §10-4).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const ACQ_PRICE_AXIS = "취득가액 의제 특례 (소령 §176조의2④·§163⑨)";
const GIFT_PRICE_FIELD = "증여 신고가액 (원)";
const BG_NOTE = "취득가액 — 부담부증여 §159 자동 산정";

function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            transferType: "burdened_gift",
            bgValuationMode: "sangjeungbeop_standard",
            bgLendingDepositTotal: "1000000000",
            bgMortgageDebtAmount: "3120000000",
            bgAnnualRentTotal: "130000000",
            acquisitionCause: "inheritance",
            gbBuildingAcquisitionCause: "inheritance",
            hasSeperateLandAcquisitionDate: false,
            acquisitionDate: "1998-09-07",
            landAcquisitionDate: "1998-09-07",
            decedentAcquisitionDate: "1990-01-01",
            gbLandArea: "1279",
            gbBuildingFootprintArea: "388.27",
            gbZoneType: "commercial",
            gbTransferLandPricePerSqm: "6215000",
            gbTransferBuildingValue: "631846500",
            gbAcqLandPricePerSqm: "2130000",
            gbAcqBuildingValue: "424472064",
            ...over,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
}

/** 증여 취득원인 — 분리 OFF 불변식대로 토지·건물 두 축을 함께 바꾼다. */
const GIFT_CAUSE = {
  acquisitionCause: "gift",
  gbBuildingAcquisitionCause: "gift",
  donorAcquisitionDate: "1990-01-01",
  decedentAcquisitionDate: "",
};

test.describe("부담부증여 × 취득원인 — §159가 무시하는 칸", () => {
  test("IG-1: 상속 → §159 안내가 뜨고 취득가액 축이 사라진다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);

    await expect(page.getByText(BG_NOTE).first()).toBeVisible();
    await expect(page.getByText(ACQ_PRICE_AXIS)).toHaveCount(0);
    // 분리 OFF 상속의 건물 평가액 카드도 같은 이유로 숨는다.
    await expect(page.getByText("상속개시일 건물 신고가액", { exact: false })).toHaveCount(0);
  });

  test("IG-2: 증여 → 「증여 신고가액」 칸이 사라진다", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page, GIFT_CAUSE);

    await expect(page.getByText(BG_NOTE).first()).toBeVisible();
    await expect(page.getByText(GIFT_PRICE_FIELD)).toHaveCount(0);
  });

  test("IG-3: 일반 양도는 종전대로 보인다 (회귀 0 · IG-1·2의 양성 대조군)", async ({ page }) => {
    test.setTimeout(90_000);
    // 상속
    await seed(page, { transferType: "regular" });
    await expect(page.getByText(ACQ_PRICE_AXIS).first()).toBeVisible();
    await expect(page.getByText(BG_NOTE)).toHaveCount(0);

    // 증여
    await seed(page, { transferType: "regular", ...GIFT_CAUSE });
    await expect(page.getByText(GIFT_PRICE_FIELD).first()).toBeVisible();
    await expect(page.getByText(BG_NOTE)).toHaveCount(0);
  });

  test("IG-4: 날짜 두 칸은 남는다 (보유기간 §95④ · 단기 통산 §104②1호)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);

    await expect(page.getByText("상속개시일", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("피상속인 취득일", { exact: true }).first()).toBeVisible();
  });
});
