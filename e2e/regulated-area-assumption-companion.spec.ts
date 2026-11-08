/**
 * 결과 화면 「조정대상지역 판정 — 확인 필요」 — 함께 양도 컴패니언도 자기 소재지 판정이 고지에 뜬다.
 * 계획서 `docs/00-pm/regulated-area-assumption-companion.plan.md`. leaf·카드는 `__tests__/calc/regulated-area-assumption-companion.anchor.test.tsx`.
 *
 * 실행(워크트리): E2E_PORT=3277 npx playwright test e2e/regulated-area-assumption-companion.spec.ts
 */
import { test, expect } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { calculate, seedWizard } from "./_helpers/split-acq-display";

// 주 자산 — 인천 서구 법정동코드(코드 판정 · 신뢰도 high → 고지 없음)
const first = {
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "인천광역시 서구 테스트동 1",
  regionCode: "2826010100",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-02",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "400000000",
};

// 컴패니언 — 법정동코드 없이 주소만(남양주 화도읍: 시군구 단위 매칭이라 읍·면 예외를 못 봐 취득 당시 medium · 조정대상지역)
const second = {
  ...makeDefaultAsset(2),
  ...DIRECT_RESIDENCE,
  assetId: "a2",
  addressJibun: "경기도 남양주시 화도읍 1",
  regionCode: "",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2020-12-01",
  fixedAcquisitionPrice: "200000000",
  actualSalePrice: "800000000",
};

const seed = {
  state: {
    formData: {
      assets: [first, second],
      transferDate: "2026-02-16",
      filingDate: "2026-04-30",
      contractTotalPrice: "1200000000",
      bundledSaleMode: "actual",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
};

test("[RAC-1] ★ 컴패니언 화도읍(medium) → 요청에 실린 값과 같은 고지가 컴패니언 카드로 뜬다 · 주 자산 카드는 없다", async ({ page }) => {
  test.setTimeout(240_000);
  await seedWizard(page, seed);
  const body = await calculate(page);
  const comp = (body.companionAssets as Record<string, unknown>[])[0];
  expect(comp.wasRegulatedAtAcquisition).toBe(true);

  const card = page.getByTestId("regulated-area-assumption-line-1");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("조정대상지역 판정 — 확인 필요 · 자산 2");
  await expect(page.getByTestId("regulated-area-assumption-acquisition-1")).toContainText("취득 당시(2020-12-01): 조정대상지역으로 보고 계산");
  await expect(card).not.toContainText("직접 선택하세요");
  await expect(page.getByTestId("regulated-area-assumption-transfer")).toHaveCount(0);
  await expect(page.getByTestId("regulated-area-assumption-acquisition")).toHaveCount(0);
});
