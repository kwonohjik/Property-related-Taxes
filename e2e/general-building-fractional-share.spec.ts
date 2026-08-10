/**
 * E2E: 일반건물(토지+건물 일괄) × 지분(%) 분할 취득 — 브라우저 실검증.
 *
 * 계획: `docs/00-pm/transfer-general-building-fractional-share.plan.md` (개정 3)
 * 설계: `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md`
 * 정책: [[feedback_browser_verify_with_playwright]]
 *
 * ## 이 spec이 지키는 것 (vitest anchor가 못 잡는 것)
 *
 * vitest anchor 48건은 **payload를 손으로 만들어** route·변환기를 검증한다. 그래서
 * 「폼에서 그 payload가 실제로 만들어지는가」와 「입력 UI가 렌더되는가」는 검증하지 못한다.
 *
 * 🔴 이 기능의 최대 함정이 바로 거기였다 — 지분 sibling은 `makeDefaultAsset`으로 생성돼
 *    `assetKind`가 **"housing"**이라, ③ 취득정보의 자산종류 게이트에서 `GeneralBuildingBlock`이
 *    **통째로 렌더되지 않았다**. 배관을 다 고쳐도 입력 경로가 없어 세액이 안 변한다
 *    (메모리 `feedback_api_trigger_without_input_path_is_noop` · `feedback_ui_gate_removes_sole_input_path`).
 *
 * ## 실행 (워크트리)
 *
 *   E2E_PORT=3120 npx playwright test e2e/general-building-fractional-share.spec.ts
 *
 * ⚠️ **워크트리에서 `E2E_PORT`를 빼면 메인 트리 서버(3000)를 재사용해 「내 코드가 아닌 것」을
 *    테스트한다** (메모리 `feedback_worktree_e2e_port_isolation`).
 * ⚠️ 워크트리에는 `.env.local`이 없으면 서버 렌더 게이트가 화면을 가른다 — 복사 필요
 *    (메모리 `feedback_worktree_missing_env_local_server_gate`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const TOTAL = "1000000000";

/** 물건-수준 — 전 지분 공통(자산 1에서만 입력받고 API 변환이 복사한다) */
const PROPERTY_LEVEL = {
  assetKind: "general_building" as const,
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2000000",
  gbTransferBuildingValue: "200000000",
  gbZoneType: "general_residential",
};

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            ...PROPERTY_LEVEL,
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
            // 🔑 `makeDefaultAsset`이라 `assetKind`가 "housing"이다 — 실제 앱과 **같은 상태**.
            //    ③이 primary의 자산종류를 주입받아야 GB 블록이 뜬다(그것이 이 spec의 핵심).
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
        ],
        transferDate: "2024-03-01",
        filingDate: "2024-05-31",
        contractTotalPrice: TOTAL,
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

async function seedAndOpen(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
}

test.describe("일반건물 × 지분 분할 취득", () => {
  // ══════════════════════════════════════════════════════════════════
  // GBF-07 — 입력 경로가 실제로 렌더된다 🔴
  // ══════════════════════════════════════════════════════════════════
  test("GBF-07: 지분 카드 ③에 취득시 기준시가 입력이 렌더된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    const asset2 = page.locator('[data-asset-card-index="1"]');

    // 지분 모드 진입 확인 — 자산2는 ①② 숨김 + 안내배너
    await expect(asset2.getByTestId("fractional-basic-inherited-notice")).toBeVisible();

    // ③ 취득정보 펼치기
    await asset2.getByRole("button", { name: /취득/ }).first().click();

    /**
     * 🔑 **핵심 단언** — 자산2의 `assetKind`는 저장값이 "housing"인데,
     * `CompanionAssetCard`가 primary의 자산종류를 주입해야 GB 블록이 뜬다.
     * 이게 없으면 배관을 다 고쳐도 세액이 안 변한다.
     */
    await expect(
      asset2.getByText("취득시 토지 공시지가").first(),
      "지분 카드에 GB 취득 입력이 없다 — assetKind 주입 회귀 의심",
    ).toBeVisible();
    await expect(asset2.getByText("취득시 건물기준시가").first()).toBeVisible();
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-08 — 음성 단언 + 양성 대조군
  // ══════════════════════════════════════════════════════════════════
  test("GBF-08: 지분 카드에 양도측·물건사건 입력이 없다 (자산1에는 있다)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    const asset1 = page.locator('[data-asset-card-index="0"]');
    const asset2 = page.locator('[data-asset-card-index="1"]');

    await asset1.getByRole("button", { name: /취득/ }).first().click();
    await asset2.getByRole("button", { name: /취득/ }).first().click();

    /**
     * 🔑 **부정 단언에는 양성 대조군이 필요하다**
     * (메모리 `feedback_negative_assertion_needs_mutation_probe`).
     * 자산1에 있는 것이 자산2에 없어야 「숨겼다」가 증명된다 —
     * 셀렉터 오타로 둘 다 0이면 그냥 통과해버린다.
     */
    // 양성 대조군: 자산1에는 양도측·증축이 있다
    await expect(asset1.getByText("양도시 토지 공시지가").first()).toBeVisible();
    await expect(asset1.getByText("증축 있음").first()).toBeVisible();

    // 음성: 자산2에는 없다 (물건-수준이라 자산1에서 한 번만 받는다)
    await expect(asset2.getByText("양도시 토지 공시지가")).toHaveCount(0);
    await expect(asset2.getByText("양도시 건물기준시가")).toHaveCount(0);
    await expect(asset2.getByText("증축 있음")).toHaveCount(0);
  });

  // ══════════════════════════════════════════════════════════════════
  // GBF-20 — 전체 배관: 폼 → payload → 계산 200 → 4파트
  // ══════════════════════════════════════════════════════════════════
  test("GBF-20: 계산 200 · generalBuildingShares 전송 · 파트 4장", async ({ page }) => {
    test.setTimeout(120_000);
    await seedAndOpen(page);

    for (const step of ["보유 상황", "감면·공제", "가산세"]) {
      await page.getByRole("button", { name: step }).first().click();
    }

    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;

    // 요청 body — ④ API 변환이 지분 배열을 실제로 만들었는지 (vitest는 손으로 만든 payload만 본다)
    const reqBody = JSON.parse(resp.request().postData() ?? "{}");
    expect(
      reqBody.generalBuildingShares,
      "폼에서 generalBuildingShares가 만들어지지 않았다 — ④ 변환 회귀 의심",
    ).toHaveLength(2);
    // 일괄(companion) 필드는 **함께 보내지 않는다** — route 5-a가 먼저 잡는 것을 막는다
    expect(reqBody.companionAssets).toBeUndefined();
    expect(reqBody.totalSalePrice).toBeUndefined();

    expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
    const body = await resp.json();
    expect(body.data.mode).toBe("bundled");

    const rows = body.data.apportionment.apportioned as {
      assetId: string;
      allocatedSalePrice: number;
    }[];
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.assetId).sort()).toEqual([
      "building#0",
      "building#1",
      "land#0",
      "land#1",
    ]);
    // Σ 지분 양도가액 = 총양도가 (잔액 흡수)
    expect(rows.reduce((s, r) => s + r.allocatedSalePrice, 0)).toBe(1_000_000_000);
    // 지분 A(60%) = 600,000,000 → 토지·건물 50:50
    expect(rows.find((r) => r.assetId === "land#0")!.allocatedSalePrice).toBe(300_000_000);

    // 결과 화면이 **크래시 없이** 뜬다 — `GeneralBuildingValuationDetailCard`가
    // `buildingFootprintArea.toFixed()`를 가드 없이 읽으므로 detail 누락 시 여기서 죽는다.
    await expect(page.getByText(/결정세액|납부세액|양도소득/).first()).toBeVisible({
      timeout: 15_000,
    });
    // 지분 라벨이 결과에 노출된다
    await expect(page.getByText(/지분/).first()).toBeVisible();
  });
});
