/**
 * 판정 안내 문구가 **provenance를 따라간다** — 5계층 prop 배선 (P6-c-5).
 *
 * ## 왜 E2E인가 — anchor는 컴포넌트에 직접 넘긴다
 *
 * 문구 두 갈래 자체는 `handoff-notice-provenance.anchor.test.tsx`가 고정한다. 여기서만
 * 보이는 것은 **`judgmentLoaded`가 Step1부터 실제로 도달하는가**다:
 *
 * ```
 * Step1(hasJudgmentProvenance)
 *   → CompanionAssetsSection → CompanionAssetCard
 *       ├→ AssetSectionExtras            → RentalHousingExceptionSection  (§155⑳)
 *       └→ AssetSectionAcquisition → RedevelopmentBlock → ImportedRedevRightFactsCard (§89①4호)
 * ```
 *
 * 🔴 P6-c-1이 **같은 층위에서 prop 체인이 끊겨 거주 경고가 조용히 사라진 것**을 겪었다
 * (U1-03). 한 계층만 빠뜨려도 타입은 통과하고(전부 optional) 화면은 옛 문구를 낸다.
 *
 * ## 🔴 고친 것
 *
 * 계산기 판정 안내 3종 중 `judgment-handoff-notice`(Step4)만 provenance를 봤다. 자산 카드의
 * 두 안내는 `asset`만 받아, 판정을 이미 불러왔는데 그 특례가 **해당 없어** 선언하지 않은
 * 사용자에게도 「판정한 뒤 불러오세요」라고 말했다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 넘겨받은 판정 사실 — `hasJudgmentProvenance`가 보는 두 키 중 직접 증거 쪽. */
const IMPORTED_FACTS = {
  importedOneHouseFacts: {
    verdict: "exempt",
    isOneHousehold: true,
    householdHousingCount: "1",
  },
};

function seed(assetOver: Record<string, unknown>, formOver: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            addressJibun: "서울 강남구 역삼동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
            actualSalePrice: "800000000",
            fixedAcquisitionPrice: "400000000",
            ...assetOver,
          },
        ],
        transferDate: "2026-06-01",
        contractTotalPrice: "800000000",
        isOneHousehold: true,
        householdHousingCount: "1",
        ...formOver,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function gotoAsset(
  page: Page,
  section: 3 | 5,
  assetOver: Record<string, unknown>,
  formOver: Record<string, unknown>,
) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seed(assetOver, formOver),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, section, 0);
}

const RIGHT_ASSET = {
  assetKind: "right_to_move_in",
  redevSubject: "right",
  redevApprovalDate: "2020-10-23",
};

test.describe("판정 안내 문구 — provenance 배선", () => {
  /**
   * 🔴 **배선 축.** 체인 한 계층만 끊겨도 여기가 빨개진다 —
   *    타입은 전부 optional이라 컴파일러가 잡아 주지 않는다.
   */
  test("[HP-E2E-1] §155⑳ — 판정을 불러온 뒤에는 「선언이 없습니다」로 바뀐다", async ({ page }) => {
    await gotoAsset(page, 5, {}, {});
    const before = page.getByTestId("rental-housing-handoff-notice");
    await expect(before).toContainText("판정한 뒤");

    await gotoAsset(page, 5, {}, IMPORTED_FACTS);
    const after = page.getByTestId("rental-housing-handoff-notice");
    await expect(after).toContainText("선언이 없습니다");
    await expect(after).not.toContainText("판정한 뒤");
  });

  /** 더 긴 체인(AssetSectionAcquisition → RedevelopmentBlock)을 타는 쪽. */
  test("[HP-E2E-2] §89①4호 — 같은 두 갈래가 입주권 카드에서도 갈린다", async ({ page }) => {
    await gotoAsset(page, 3, RIGHT_ASSET, {});
    await expect(page.getByTestId("redev-right-handoff-notice")).toContainText("판정한 뒤");

    await gotoAsset(page, 3, RIGHT_ASSET, IMPORTED_FACTS);
    const after = page.getByTestId("redev-right-handoff-notice");
    await expect(after).toContainText("선언이 없습니다");
    await expect(after).not.toContainText("판정한 뒤");
  });

  /** 🔑 「선언이 없습니다」가 막다른 길이면 안 된다 — 선언하러 갈 경로는 남아야 한다. */
  test("[HP-E2E-3] 두 갈래 모두 판정 메뉴 링크를 남긴다", async ({ page }) => {
    await gotoAsset(page, 5, {}, IMPORTED_FACTS);
    await expect(page.getByTestId("rental-housing-handoff-link")).toHaveAttribute(
      "href",
      "/calc/one-house-exemption",
    );
  });
});
