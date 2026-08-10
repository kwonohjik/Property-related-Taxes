/**
 * E2E: 일반건물 「비사업용토지 판정」·「주택→상가 용도변경」 카드의 ③ → ① 이전 실검증.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * ## 왜 vitest anchor로 부족한가
 *
 * anchor는 `AssetAreaSection`을 **직접** 렌더한다. 그래서 「그 섹션이 실제 마법사 화면에
 * 마운트되는가」와 「③을 펴지 않아도 보이는가」는 검증하지 못한다. 이 기능 라인에서
 * 실제로 그 함정을 밟았다 — 판정 블록을 엉뚱한 컴포넌트에 붙여 화면에는 안 뜨는데
 * 컴포넌트 테스트는 통과한 적이 있다(표시 no-op).
 *
 * ## 이 이전의 목적 자체가 「기본 접힘 탈출」이다
 *
 * `gbZoneType`은 미선택 시 계산을 차단하는 **필수** 필드인데, ③ 취득정보는 기본 접힘이라
 * (`CompanionAssetCard` open 초기값 `{1:true}`) 접힌 섹션에 숨은 필수 입력이었다.
 * ⇒ **GBN-01이 이 작업의 성공 기준**이다: ③을 펴지 않은 상태에서 보여야 한다.
 *
 * ## 실행 (워크트리)
 *
 *   E2E_PORT=3121 npx playwright test e2e/general-building-nbl-section-in-basic.spec.ts
 *
 * ⚠️ 워크트리에서 `E2E_PORT`를 빼면 메인 트리 서버(3000)를 재사용해 「내 코드가 아닌 것」을
 *    테스트한다 (메모리 `feedback_worktree_e2e_port_isolation`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 바닥면적 50 × 일반주거 4배 = 200㎡ 한도. 토지 100㎡ ≤ 200 → 사업용. */
const GB_BASE = {
  assetKind: "general_building" as const,
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000",
  gbTransferBuildingValue: "200000000",
  // gbZoneType은 **비워 둔다** — GBN-03에서 화면으로 직접 고른다.
};

function seedForm(assets: Record<string, unknown>[]) {
  return {
    state: {
      formData: {
        assets,
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: "1000000000",
        householdHousingCount: "2",
        isOneHousehold: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

function singleAssetSeed() {
  return seedForm([
    {
      ...makeDefaultAsset(1),
      ...GB_BASE,
      /**
       * ⚠️ 단건 모드에서 **자산 필드를 하나라도 바꾸면** `Step1.tsx`의 `updateAssets`가
       *    `contractTotalPrice`를 `assets[0].actualSalePrice || ""`로 덮어쓴다.
       *    이 값을 안 넣으면 GBN-03/05가 용도지역을 클릭하는 순간 총양도가가 지워져
       *    「총 양도가액을 입력하세요」로 계산이 막힌다 — 이 이전과 무관한 기존 동작이다.
       */
      actualSalePrice: "1000000000",
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      acquisitionDate: "2009-03-01",
      useEstimatedAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      gbAcqLandPricePerSqm: "1000000",
      gbAcqBuildingValue: "100000000",
    },
  ]);
}

/** 지분(%) 분할 — 자산2는 ①이 통째로 숨겨져야 한다(물건-수준 중복 입력 차단). */
function fractionalSeed() {
  return seedForm([
    {
      ...makeDefaultAsset(1),
      ...GB_BASE,
      gbZoneType: "general_residential",
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      ownershipNumerator: "60",
      ownershipDenominator: "100",
      acquisitionDate: "2009-03-01",
      useEstimatedAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      gbAcqLandPricePerSqm: "1000000",
      gbAcqBuildingValue: "100000000",
    },
    {
      ...makeDefaultAsset(2),
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      ownershipNumerator: "40",
      ownershipDenominator: "100",
      acquisitionDate: "2015-03-01",
      useEstimatedAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      gbAcqLandPricePerSqm: "1500000",
      gbAcqBuildingValue: "150000000",
    },
  ]);
}

async function seedAndOpen(page: Page, seed: unknown) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seed,
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("일반건물 — 비사업용토지 판정 카드가 ① 기본정보에 있다", () => {
  // ══════════════════════════════════════════════════════════════════
  // GBN-01 — 이 작업의 성공 기준 🔑
  // ══════════════════════════════════════════════════════════════════
  test("GBN-01: ③을 펴지 않아도 용도지역 필수 입력이 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, singleAssetSeed());

    const asset1 = page.locator('[data-asset-card-index="0"]');

    // ① 기본정보는 첫 자산에서 자동 펼침 — 아무것도 클릭하지 않는다.
    await expect(asset1.getByText("면적·규모").first()).toBeVisible();

    // 🔑 필수 필드가 접힘 섹션 밖으로 나왔다는 증거
    await expect(
      asset1.getByText("비사업용토지 판정").first(),
      "①에 비사업용토지 판정 카드가 없다 — AssetAreaSection 마운트 회귀 의심",
    ).toBeVisible();
    await expect(asset1.getByText("용도지역 (필수)").first()).toBeVisible();
    await expect(asset1.getByText("허가·사용승인 미이행 건축물").first()).toBeVisible();
  });

  // ══════════════════════════════════════════════════════════════════
  // GBN-02 — 중복 0 (음성 단언 + 양성 대조군)
  // ══════════════════════════════════════════════════════════════════
  test("GBN-02: ③ 취득정보를 펴도 그 카드가 없다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, singleAssetSeed());

    const asset1 = page.locator('[data-asset-card-index="0"]');
    await asset1.getByRole("button", { name: /취득/ }).first().click();

    /**
     * 🔑 양성 대조군 없이는 부정 단언이 증거가 아니다
     * (메모리 `feedback_negative_assertion_needs_mutation_probe`).
     * ③이 실제로 펼쳐졌음을 먼저 보이고, 그 안에 카드가 없음을 단언한다.
     */
    await expect(asset1.getByText("취득시 토지 공시지가").first()).toBeVisible();

    // ①에 하나 있으므로 전체 1개 — ③에도 있으면 2개가 된다.
    await expect(asset1.getByText("비사업용토지 판정")).toHaveCount(1);
    await expect(asset1.getByText("용도지역 (필수)")).toHaveCount(1);
    await expect(asset1.getByText("주택 → 상가 용도변경")).toHaveCount(1);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBN-03 — 화면 입력이 실제로 store에 쓰인다 (표시 no-op 차단)
  // ══════════════════════════════════════════════════════════════════
  test("GBN-03: ①에서 용도지역을 고르면 배율·한도 미리보기가 즉시 뜬다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, singleAssetSeed());

    const asset1 = page.locator('[data-asset-card-index="0"]');

    // 선택 전에는 미리보기가 없다 (대조군)
    await expect(asset1.getByText(/적용 배율:/)).toHaveCount(0);

    await asset1.getByText("일반주거", { exact: true }).first().click();

    /**
     * 미리보기는 같은 ① 안의 「면적·규모」가 쓴 `gbBuildingFootprintArea`(50)·
     * `gbLandArea`(100)를 읽는다 — 읽는 값과 쓰는 칸이 한 섹션에 모였다는 실증.
     * 일반주거 4배(「지방세법 시행령」 §101②) → 50 × 4 = 200.00㎡, 토지 100㎡ ≤ 200 → 사업용.
     */
    await expect(asset1.getByText(/적용 배율:.*일반주거지역/)).toBeVisible();
    await expect(asset1.getByText(/인정 한도: 바닥면적 50㎡ × 4배 = 200\.00 ㎡/)).toBeVisible();
    await expect(asset1.getByText("→ 사업용 (중과 미발동)")).toBeVisible();
  });

  // ══════════════════════════════════════════════════════════════════
  // GBN-04 — 지분 카드 숨김이 ① 통째 숨김으로 자동 승계된다
  // ══════════════════════════════════════════════════════════════════
  test("GBN-04: 지분 2번째 카드에는 없다 (자산1에는 있다)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page, fractionalSeed());

    const asset1 = page.locator('[data-asset-card-index="0"]');
    const asset2 = page.locator('[data-asset-card-index="1"]');

    // 자산2는 ①② 숨김 + 안내배너
    await expect(asset2.getByTestId("fractional-basic-inherited-notice")).toBeVisible();

    // ③까지 펴도 자산2에는 없어야 한다 (종전 `shareAcquisitionOnly` 게이트가 하던 일)
    await asset2.getByRole("button", { name: /취득/ }).first().click();
    await expect(asset2.getByText("취득시 토지 공시지가").first()).toBeVisible(); // 양성 대조군
    await expect(asset2.getByText("비사업용토지 판정")).toHaveCount(0);
    await expect(asset2.getByText("주택 → 상가 용도변경")).toHaveCount(0);

    // 자산1에는 있다 — 물건-수준 값을 한 번만 받는다
    await expect(asset1.getByText("비사업용토지 판정").first()).toBeVisible();
    await expect(asset1.getByText("주택 → 상가 용도변경").first()).toBeVisible();
  });

  // ══════════════════════════════════════════════════════════════════
  // GBN-05 — 세액까지 관통 (필수 필드 차단 해소 확인)
  // ══════════════════════════════════════════════════════════════════
  test("GBN-05: ①에서 고른 용도지역으로 계산이 200으로 통과한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page, singleAssetSeed());

    const asset1 = page.locator('[data-asset-card-index="0"]');
    await asset1.getByText("일반주거", { exact: true }).first().click();

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const res = await calcResponse;

    // ①에서 고른 값이 payload까지 실제로 실렸는가 — 화면만 바뀌는 no-op 차단.
    const reqBody = JSON.parse(res.request().postData() ?? "{}");
    expect(
      JSON.stringify(reqBody),
      "payload에 용도지역이 없다 — ① 입력이 store/API 변환에 닿지 않았다",
    ).toContain("general_residential");

    // 용도지역 미선택이면 validate가 차단해 계산 자체가 시작되지 않는다.
    expect(res.ok(), `계산 API 비정상 응답 ${res.status()}`).toBe(true);
  });
});
