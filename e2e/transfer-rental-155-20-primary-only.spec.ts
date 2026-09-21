/**
 * §155⑳은 **주 자산 전용**이다 — 컴패니언 자산 카드에는 섹션이 없다 (P6-c-4).
 *
 * ## 왜 E2E가 필요한가 — anchor가 못 보는 축이 하나 있다
 *
 * ⑤·⑧이 같은 술어를 보는지는 anchor(`rental-exception-primary-only.anchor.test.tsx`)가
 * `AssetSectionExtras`를 직접 마운트해 고정한다. 그런데 그 술어에 넘길 **`assetIndex`를
 * `CompanionAssetCard`가 실제로 제 인덱스로 넘기는지**는 컴포넌트를 직접 마운트하면 보이지
 * 않는다 — prop 배선 축이다(U1-03이 같은 층위에서 조용히 끊겼던 자리).
 *
 * 여기서는 **2자산 계산기 화면**을 그대로 열어 본다.
 *
 * ## 🔴 고친 결함
 *
 * 엔진 입력의 `rentalHousingException`은 top-level **단일 객체**라 ④는 primary만 보낸다.
 * 그런데 ⑤는 모든 주택 자산에 카드를 띄우고 ⑧은 모든 자산을 검증해서, 컴패니언에서 토글을
 * 켜면 **계산이 차단되는데 다 채워도 세액이 한 푼도 안 달라졌다**(실측).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function housing(idx: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(idx),
    addressJibun: `서울 강남구 역삼동 ${idx}-1`,
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-01-01",
    actualSalePrice: "800000000",
    fixedAcquisitionPrice: "400000000",
    residencePeriodMonthsAsset: "30",
    ...over,
  };
}

/** 특례 ON · 임대주택 미입력 — ⑧이 차단하던 바로 그 상태. */
const DECLARED = {
  rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [] },
};

async function goto2Assets(page: Page, companionOver: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          assets: [housing(1), housing(2, companionOver)],
          transferDate: "2026-06-01",
          contractTotalPrice: "1600000000",
          isOneHousehold: true,
          householdHousingCount: "1",
        },
        pendingMigration: false,
      },
      version: 0,
    },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 5, 0);
  await expandAssetSection(page, 5, 1);
}

test.describe("§155⑳ 주 자산 전용", () => {
  /**
   * 🔴 **배선 축.** `CompanionAssetCard`가 `assetIndex`를 제 인덱스로 넘기지 않으면
   *    (예: 0 하드코딩) 컴패니언에도 섹션이 뜬다 — 그때 이 단언이 빨개진다.
   */
  test("[RP-E2E-1] 컴패니언 카드에는 §155⑳ 섹션이 없고 주 자산에는 있다", async ({ page }) => {
    await goto2Assets(page, {});

    const card0 = page.locator('[data-asset-card-index="0"]');
    const card1 = page.locator('[data-asset-card-index="1"]');

    // 주 자산: 선언이 없으므로 판정 메뉴 안내가 뜬다(P6-c-2).
    await expect(card0.getByTestId("rental-housing-handoff-notice")).toBeVisible();
    // 컴패니언: 섹션 자체가 없다.
    await expect(card1.getByTestId("rental-housing-handoff-notice")).toHaveCount(0);
    await expect(card1.getByTestId("imported-rental-housing-facts")).toHaveCount(0);
  });

  /** 🔑 값을 지우지 않으므로 화면이 밝혀야 한다 — 조용히 사라진 입력이 되면 안 된다(OH-20). */
  test("[RP-E2E-2] 컴패니언에 stale 선언이 남아 있으면 안내가 뜬다", async ({ page }) => {
    await goto2Assets(page, DECLARED);

    const card1 = page.locator('[data-asset-card-index="1"]');
    const notice = card1.getByTestId("rental-exception-companion-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("이 자산에 적용되지 않습니다");

    // 🔴 그리고 **계산이 막히지 않는다** — 종전에는 여기서 「임대주택 정보를 1호 이상」이 떴다.
    await page.getByRole("button", { name: "보유 상황", exact: true }).first().click();
    await expect(page.getByText("임대주택 정보를 1호 이상")).toHaveCount(0);
  });
});
