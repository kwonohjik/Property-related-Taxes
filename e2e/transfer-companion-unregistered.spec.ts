/**
 * E2E: 컴패니언(2번째 이후) 자산의 미등기 양도 토글 (Phase D).
 *
 * 계획서: docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md §4 Phase D
 *
 * 일괄양도는 물건마다 등기 여부가 다를 수 있다. 주 자산은 폼-전역 값을 「보유 상황 ⑤ 특수 상황」
 * 에서 받고, 컴패니언은 **자산 카드 ① 기본정보**에서 자산-수준으로 받는다.
 *
 * 검증
 *  1) 컴패니언 카드에 토글이 뜨고, 주 자산 카드에는 뜨지 않는다(dual-truth 방지)
 *  2) 켠 값이 계산까지 살아남는다
 *
 * 정책: [[feedback_browser_verify_with_playwright]] · [[feedback_ui_input_path_enumeration]]
 */

import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const primary = {
  ...makeDefaultAsset(1),
  assetKind: "land",
  acquisitionDate: "2010-03-01",
  fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000",
  actualSalePrice: "600000000",
};

const companion = {
  ...makeDefaultAsset(2),
  assetKind: "building",
  assetLabel: "창고동",
  acquisitionDate: "2010-03-01",
  fixedAcquisitionPrice: "200000000",
  standardPriceAtTransfer: "300000000",
  actualSalePrice: "400000000",
};

async function seed(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [primary, companion],
          transferDate: "2024-03-01",
          filingDate: "2024-05-31",
          contractTotalPrice: "1000000000",
          householdHousingCount: "0",
          isOneHousehold: false,
          isUnregistered: false,
          houses: [],
          presaleRights: [],
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("컴패니언 자산 미등기 양도 (§104③)", () => {
  test("컴패니언 카드에만 토글이 뜬다 (주 자산은 ⑤ 특수 상황이 담당)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);

    // ① 기본정보를 **두 카드 모두** 편다 — 진입 시 전부 접힘(progressive disclosure).
    // 접힌 채로 세면 hidden 요소도 카운트돼 「보인다」를 증명하지 못한다.
    await expandAssetSection(page, 1, 0);
    await expandAssetSection(page, 1, 1);

    const toggle = page.getByRole("switch", { name: "미등기 양도" });
    // 자산 2건 중 **컴패니언에만** 있다 → 정확히 1개.
    // (주 자산에도 렌더되면 2개가 되어 깨진다 = dual-truth 감지)
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toBeVisible();
    // 그 1개가 컴패니언 카드 안에 있음을 확인한다(위치까지 고정).
    await expect(
      page.locator('[data-asset-card-index="1"]').getByRole("switch", { name: "미등기 양도" }),
    ).toBeVisible();
  });

  test("켠 값이 컴패니언 자산에만 기록된다 (UI → store 경로)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 1, 1); // 컴패니언 카드의 ① 기본정보

    // chip variant는 텍스트가 <label> 안이라 클릭이 스위치에 닿지 않는다 — Switch를 직접 누른다
    // (`aria-label`이 title과 같다 — `ToggleCard.tsx:294`).
    await page.getByRole("switch", { name: "미등기 양도" }).click();

    // store에 무엇이 기록됐는지 본다. 여기서부터 엔진까지(store → payload → 세율군)는
    // `__tests__/calc/companion-unregistered-plumbing.anchor.test.ts`가 4건으로 덮는다.
    const flags = await page.evaluate(() => {
      const raw = sessionStorage.getItem("transfer-tax-wizard");
      const s = JSON.parse(raw ?? "{}");
      const f = s?.state?.formData ?? {};
      return {
        primaryAsset: f.assets?.[0]?.isUnregistered,
        companionAsset: f.assets?.[1]?.isUnregistered,
        formLevel: f.isUnregistered,
      };
    });

    expect(flags.companionAsset).toBe(true);
    // 두 축은 독립이다 — 컴패니언 토글이 주 자산이나 폼-전역으로 새면 여기가 깨진다.
    expect(flags.primaryAsset).toBe(false);
    expect(flags.formLevel).toBe(false);
  });
});
