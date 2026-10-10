/**
 * E2E: 함께양도(다른 물건) 묶음에 지분 자산이 섞인 경우 (2026-10-10)
 *
 * 종전: 지분 자산 칸이 「총양도가 × 지분율」 자동가 카드로 바뀌고(화면) 서버는 그 값을 쓰지 않아 — actual 500 ·
 * apportioned 양도가액 0. 세션 복원 시 묶음 전체가 지분 분할 모드(축 B)로 바뀌기도 했다.
 * 지금: 지분 자산도 일반 칸(물건 전체 100% 기준 + 지분율 안내)을 받고, ④가 지분율을 곱한다.
 *
 * ⚠️ 수치 정본은 vitest anchor(`transfer.route.companion-partial-share-bundle.anchor.test.ts`). 워크트리 실행은 E2E_PORT 필수.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { calculate, seedWizard, singleSeed } from "./_helpers/split-acq-display";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const land = (n: number, over: Record<string, unknown> = {}) => ({
  ...makeDefaultAsset(n),
  addressJibun: `강원특별자치도 춘천시 테스트동 ${n}`,
  regionCode: "5111010100",
  assetKind: "land",
  acquisitionArea: "300",
  transferArea: "300",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-03-03",
  fixedAcquisitionPrice: "300000000",
  standardPriceAtTransfer: "500000000",
  ownershipNumerator: "100",
  ownershipDenominator: "100",
  ...over,
});
const share50 = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" };

async function open(page: Page, mode: "actual" | "apportioned", assets: Record<string, unknown>[], companionCards = true) {
  await seedWizard(page, singleSeed(assets, { contractTotalPrice: "1000000000", bundledSaleMode: mode }));
  // ② 양도정보는 접힌 채 시작한다 — 함께양도는 두 자산 모두 펼친다(축 B 컴패니언 카드는 구성이 달라 주 자산만)
  await expandAssetSection(page, 2, 0);
  if (companionCards) await expandAssetSection(page, 2, 1);
}

test.describe("함께양도 묶음의 지분 자산 — 물건 전체(100%) 입력 × 지분율", () => {
  test("구분 기재: 지분 자산은 자동가 카드가 아니라 「물건 전체(100%) 기준」 칸 · 계산 200 · body 400,000,000/800,000,000", async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, "actual", [land(1, { actualSalePrice: "600000000" }), land(2, { ...share50, actualSalePrice: "800000000" })]);
    // 세션 복원 후에도 함께양도 모드다 — 축 B(지분 분할)로 바뀌면 ① 기본정보 승계 안내가 뜬다
    await expect(page.getByTestId("fractional-basic-inherited-notice")).toHaveCount(0);
    await expect(page.getByText("자동 계산 (총 양도가액 × 지분율)")).toHaveCount(0);
    const inputs = page.getByTestId("companion-actual-sale-price");
    await expect(inputs).toHaveCount(2);
    await expect(page.getByText("계약서상 양도가액 — 물건 전체(100%) 기준 (원)")).toBeVisible();
    await expect(page.getByText(/지분율 50%를 곱한 금액이 이 자산의 양도가액입니다/)).toBeVisible();

    const body = await calculate(page);
    expect(body).toMatchObject({ bundledSaleMode: "actual", totalSalePrice: 1_000_000_000, primaryActualSalePrice: 600_000_000 });
    const c = (body.companionAssets as Array<Record<string, unknown>>)[0];
    expect(c).toMatchObject({ fixedSalePrice: 400_000_000, totalPropertyTransferPrice: 800_000_000 });
  });

  test("기준시가 안분: 지분 자산 기준시가 칸이 보이고(종전 숨김) 안분 키는 × 지분율 · 계산 200", async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, "apportioned", [land(1), land(2, share50)]);
    await expect(page.getByText(/지분율 50%를 곱한 값이 이 자산의 안분 비율 분모입니다/)).toBeVisible();
    await expect(page.getByText("양도시 기준시가(안분) 입력은 불필요합니다", { exact: false })).toHaveCount(0);
    const body = await calculate(page);
    expect(body.standardPriceAtTransferForApportion).toBe(500_000_000);
    expect((body.companionAssets as Array<Record<string, unknown>>)[0].standardPriceAtTransferForApportion).toBe(250_000_000);
  });

  test("부정형 짝 — 같은 물건 지분 50/50(축 B)은 종전 자동가 카드", async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, "apportioned", [land(1, share50), land(2, share50)], false);
    await expect(page.getByText("자동 계산 (총 양도가액 × 지분율)").first()).toBeVisible();
  });
});
