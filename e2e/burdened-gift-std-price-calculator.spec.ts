/**
 * E2E: 부담부증여 ④ 「증여재산 평가」 — 상속·증여 건물 기준시가 계산기
 *
 * 검증 축은 **주입 규칙이 자산마다 반대**라는 점이다(계획서 §3):
 *   · `일반건물(토지+건물 일괄)` → 계산기 결과 **건물분만** 주입(토지분은 별도 산출 — 이중계상 방지)
 *   · `건물(토지 제외)`         → **건물 + 부수토지 합산** 주입(§99①1호 나목엔 딸린 토지가 없다)
 *
 * 둘 다 화면에 오류를 띄우지 않고 증여재산가액 C만 조용히 틀어지므로 실물로 고정한다.
 *
 * 설계: docs/02-design/features/burdened-gift-valuation-std-price-calculator.plan.md §8
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 계산까지 도달하는 GB 부담부증여 최소 입력(사례 34 축약) */
const SEED_ASSET = {
  ...makeDefaultAsset(1),
  assetKind: "general_building" as const,
  transferType: "burdened_gift" as const,
  bgValuationMode: "sangjeungbeop_standard" as const,
  bgLendingDepositTotal: "1000000000",
  bgMortgageDebtAmount: "3120000000",
  bgAnnualRentTotal: "130000000",
  bgDonorRelation: "lineal_descendant" as const,
  acquisitionCause: "purchase" as const,
  gbBuildingAcquisitionCause: "purchase" as const,
  acquisitionDate: "2015-01-01",
  gbLandArea: "100",
  gbBuildingArea: "200", // = FLOOR_AREA (상수 선언 순서상 리터럴로 둔다)
  gbBuildingFootprintArea: "100",
  gbZoneType: "commercial" as const,
  gbTransferLandPricePerSqm: "7500000", // = LAND_PRICE_PER_SQM (R-2 자동입력 소스)
  gbTransferBuildingValue: "631846500",
  gbAcqLandPricePerSqm: "2130000",
  gbAcqBuildingValue: "424472064",
};

/** 상증 1시점 계산 입력 — BSP-01 anchor와 같은 조합(2025·철근콘크리트조·아파트·7,500,000원/㎡) */
const LAND_PRICE_PER_SQM = "7500000";
const FLOOR_AREA = "200";
/** 위 조합의 건물 기준시가(원) — `e2e/building-standard-price.spec.ts` BSP-01과 동일 */
const EXPECTED_BUILDING_STD = 224_600_000;

/** 모달 안 Select — 트리거는 플레이스홀더 텍스트다(`building-standard-price.spec.ts`와 동형) */
async function selectOption(page: Page, modal: Locator, triggerText: string, optionName: RegExp) {
  await modal.getByText(triggerText, { exact: false }).first().click();
  await page.getByRole("option", { name: optionName }).first().click();
}

/** 자산 카드 진입 → 부담부증여 + 기준시가 모드까지 */
async function enterBurdenedGift(page: Page, kindLabel: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  const card = page.locator('[data-asset-card-index="0"]');

  await expandAssetSection(page, 1);
  await card.getByRole("button", { name: kindLabel, exact: true }).first().click();

  /**
   * 양도일 = **증여일**. 계산기의 상증 평가연도가 이 값에서 파생되므로(계획서 §2.4)
   * 비워두면 모달이 연도를 못 잡아 계산 자체가 되지 않는다.
   */
  await fillDateAndVerify(page, { year: "2025", month: "03", day: "15" }, { scope: card });

  await expandAssetSection(page, 2);
  await card.getByRole("radio", { name: /부담부증여/ }).check();
  await expect(card.getByText("부담부증여 (소득세법 시행령 §159)")).toBeVisible();
  await card.getByRole("radio", { name: /상증법 기준시가/ }).check();
  return card;
}

/**
 * 모달에서 상증 1시점 계산을 끝내고 결과 카드가 뜰 때까지.
 * @param landPriceAutoFilled 상위 폼의 양도시 공시지가가 자동입력되어 있어야 하는가(R-2)
 */
/**
 * ④ 「건물기준시가(상속 증여시)」 입력칸.
 * ⚠️ 순서(`금액 입력` placeholder의 last 등)로 잡지 말 것 — 한 카드에 같은 placeholder가
 *    9개 있다(실측). `data-testid`가 유일하게 안정적이다.
 */
function giftStdField(card: Locator) {
  return card.getByTestId("bg-gift-building-std");
}

async function computeInModal(page: Page, landPriceAutoFilled = false) {
  const modal = page.getByRole("dialog").filter({ hasText: "건물 기준시가 계산" });
  await expect(modal).toBeVisible();

  await modal.getByPlaceholder("신축연도 (4자리)").fill("2020");
  const floorAreaInput = modal.getByPlaceholder("건물 연면적");
  await expect(floorAreaInput).toHaveValue(FLOOR_AREA); // prefill 확인
  await selectOption(page, modal, "구조 선택", /철근콘크리트조/);
  await selectOption(page, modal, "용도 선택", /아파트/);

  const landPrice = modal.getByPlaceholder("원/㎡").first();
  if (landPriceAutoFilled) {
    // R-2 — 상위 폼의 양도시 공시지가가 그대로 들어와 있어야 한다(직접 입력하지 않는다)
    await expect(landPrice).toHaveValue(Number(LAND_PRICE_PER_SQM).toLocaleString("ko-KR"));
  } else {
    await landPrice.fill(LAND_PRICE_PER_SQM);
  }
  // 값이 없을 때의 폴백 경로 — 「공시지가 조회」 버튼은 항상 있어야 한다(dead-end 금지)
  await expect(modal.getByRole("button", { name: /공시지가 조회/ })).toBeVisible();

  await modal.getByRole("button", { name: "기준시가 계산하기" }).click();
  return modal;
}

test.describe("부담부증여 증여재산 평가 — 상속·증여 계산기", () => {
  test("일반건물 — 건물분만 주입한다 (토지 이중계상 방지)", async ({ page }) => {
    test.setTimeout(120_000);
    const card = await enterBurdenedGift(page, "일반건물(토지+건물 일괄)");

    // GB 면적 3필드는 ① 기본정보 전용 카드(`AssetAreaGeneralBuilding`) — 전부 placeholder가
    // "숫자 입력"이라 순서로 잡는다: [0] 토지 면적 · [1] 건물 연면적(전체) · [2] 바닥면적.
    await expandAssetSection(page, 1);
    const gbAreas = card.getByPlaceholder("숫자 입력");
    await gbAreas.nth(0).fill("100");        // 토지 면적 — 모달이 부수토지를 산출하게 둔다
    await gbAreas.nth(1).fill(FLOOR_AREA);   // 건물 연면적(전체) = 모달 prefill 소스

    // R-2 — GB 「양도시 토지 공시지가」(③ 취득정보). 원/㎡ 칸은 [0]=취득시 · [1]=양도시.
    await expandAssetSection(page, 3);
    await card.getByPlaceholder("원/㎡").nth(1).fill(LAND_PRICE_PER_SQM);

    await expandAssetSection(page, 2);
    await card.getByRole("button", { name: /건물 기준시가 계산 \(상속·증여\)/ }).click();
    const modal = await computeInModal(page, true); // 공시지가 자동입력 확인

    await modal.getByRole("button", { name: /이 금액 적용/ }).click();

    // ④ 칸 = 건물분 단독. 모달이 부수토지(100㎡ × 7,500,000)를 함께 냈지만 **버려야** 한다.
    await expect(giftStdField(card)).toHaveValue(EXPECTED_BUILDING_STD.toLocaleString("ko-KR"));
  });

  test("건물(토지 제외) — 건물 + 부수토지를 합산해 주입한다", async ({ page }) => {
    test.setTimeout(120_000);
    const card = await enterBurdenedGift(page, "건물(토지 제외)");

    // 축 B(건물 연면적) = 모달 prefill · 축 A(토지 면적) = 부수토지 평가 분모
    await expandAssetSection(page, 1);
    await card.getByTestId("basic-building-floor-area").fill(FLOOR_AREA);
    await card.getByPlaceholder("면적 입력").first().fill("100");

    await expandAssetSection(page, 2);
    await expect(card.getByText("건물 + 부수토지")).toBeVisible(); // A-9 안내
    await card.getByRole("button", { name: /건물 기준시가 계산 \(상속·증여\)/ }).click();
    const modal = await computeInModal(page);

    await modal.getByRole("button", { name: /이 금액 적용/ }).click();

    // 부수토지 = 100㎡ × 7,500,000 = 750,000,000 → 합계
    const expected = EXPECTED_BUILDING_STD + 750_000_000;
    await expect(giftStdField(card)).toHaveValue(expected.toLocaleString("ko-KR"));
  });
});

/**
 * 계산기가 저장한 스냅샷이 **결과탭 계산서**로 이어지는가.
 *
 * 스냅샷 키 `bsp-{assetId}-bggift`가 `idOfSnapshotKey`에 등록되지 않으면 id가 잘리지 않아
 * `inputData` 매칭이 실패하고 계산서가 **조용히 미출력**된다(같은 사고가 2026-07-29·08-12
 * 두 번 있었다). 키 규약은 vitest anchor가 지키지만, 화면까지 이어지는지는 여기서 본다.
 */
test("계산기로 채운 값이 결과탭 「건물 기준시가 계산서」로 이어진다", async ({ page }) => {
  test.setTimeout(150_000);

  // 계산까지 도달하는 최소 입력을 sessionStorage로 심는다(§159 채무·기준시가 일습).
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), {
    state: {
      formData: {
        assets: [
          {
            ...SEED_ASSET,
          },
        ],
        transferDate: "2025-03-15",
        filingDate: "2025-05-31",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  const card = page.locator('[data-asset-card-index="0"]');
  await expandAssetSection(page, 2);
  await card.getByRole("button", { name: /건물 기준시가 계산 \(상속·증여\)/ }).click();
  const modal = await computeInModal(page, true);
  await modal.getByRole("button", { name: /이 금액 적용/ }).click();
  await expect(giftStdField(card)).toHaveValue(EXPECTED_BUILDING_STD.toLocaleString("ko-KR"));

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await expect(page.getByText(/양도소득세 계산 결과|산출세액/).first()).toBeVisible({
    timeout: 30_000,
  });

  // 🔑 국세청 「건물 기준시가 계산서」 서식이 이 계산 소속으로 렌더된다
  await expect(page.getByLabel("건물 기준시가 계산서").first()).toBeVisible({ timeout: 15_000 });
});
