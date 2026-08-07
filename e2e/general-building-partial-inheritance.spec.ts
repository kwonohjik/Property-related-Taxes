/**
 * E2E: 일반건물 **부분 상속**(C2·C2′·C3) 실플로우 — Phase 2
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-partial-phase2.plan.md`
 *
 * 종전에는 validate V1이 「토지·건물 중 한쪽만 상속으로 취득한 조합은 아직 지원하지
 * 않습니다」로 **전면 차단**했다. 그 뒤 엔진은 두 AND 게이트 때문에 환산 경로에서 throw,
 * 실가 경로에서 **취득가액 0**을 냈다(Pre-Do 실측).
 *
 * 이 스펙은 UI 조작 → 계산 → 결과까지 본다:
 *   PI-1. C3(토지 상속 + 건물 매매) — 차단 문구 없이 결과까지 간다
 *   PI-2. 상속 파트의 **파트 취득가액 칸이 뜨지 않는다**(dual-truth 방지) + 안내가 뜬다
 *   PI-3. 결과 카드가 **파트별** 라벨로 상속분을 표시한다
 *   PI-4. 분리 OFF + 부분 상속은 V-5가 막는다
 *
 * ⚠️ 금액 anchor는 vitest가 담당한다
 *    (`__tests__/tax-engine/transfer-tax/gb-inheritance-partial-c2-c3.anchor.test.ts`).
 *    본 스펙은 **UI 배선·표시**만 본다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** C3 — 토지 상속(실가=상속개시일 평가액) + 건물 매매(실가). 분리 ON. */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            acquisitionCause: "inheritance",
            gbBuildingAcquisitionCause: "purchase",
            // M-1a 규약 — acquisitionDate = 건물, landAcquisitionDate = 토지
            hasSeperateLandAcquisitionDate: true,
            landAcquisitionDate: "2010-03-01",
            acquisitionDate: "2015-05-01",
            decedentAcquisitionDate: "2000-01-01",
            landAcqMode: "actual",
            buildingAcqMode: "actual",
            // 토지분은 평가액이 취득가액이다 — 파트 칸을 쓰지 않는다(§163⑨)
            publishedValueAtInheritance: "600000000",
            buildingAcquisitionPrice: "200000000",
            gbLandArea: "205",
            gbBuildingArea: "300",
            gbBuildingFootprintArea: "135",
            gbTransferLandPricePerSqm: "5514000",
            gbTransferBuildingValue: "259072400",
            gbZoneType: "commercial",
            actualSalePrice: "1620000000",
            ...over,
          },
        ],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "1620000000",
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
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });
}

test.describe("일반건물 — 부분 상속", () => {
  test("PI-1: C3(토지 상속 + 건물 매매) — 차단 없이 결과까지 간다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await calculate(page);

    // 종전 V1 문구가 사라졌다
    await expect(page.getByText(/한쪽만 상속으로 취득한 조합은 아직 지원하지 않습니다/)).toHaveCount(0);
    await expect(page.getByText(/취득가액을 입력하세요/)).toHaveCount(0);
    await expect(page.getByText("신고서 양식", { exact: false }).first()).toBeVisible();
  });

  test("PI-2: 상속 파트는 파트 취득가액 칸을 띄우지 않는다 (dual-truth 방지)", async ({ page }) => {
    test.setTimeout(90_000);
    await seed(page);
    await expandAssetSection(page, 3);

    // 토지=상속 → 「토지 취득가액」 칸 없음 · 대신 안내가 뜬다
    await expect(page.getByText("토지 취득가액", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText(/상속으로 취득한 토지는 상속개시일 평가액이 취득당시 실지거래가액/),
    ).toBeVisible();

    // 건물=매매 → 「건물 취득가액」 칸은 그대로 있다 (거짓 숨김 금지)
    await expect(page.getByText("건물 취득가액", { exact: true }).first()).toBeVisible();
  });

  test("PI-3: 결과 카드가 파트별로 상속분을 표시한다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page);
    await calculate(page);

    /**
     * ⚠️ `toHaveText`는 hidden 요소도 통과한다(메모리
     *    `project_non_housing_to_housing_conversion`). 접힌 섹션을 펴고 **보이는지**까지 본다.
     */
    const block = page.getByText("상속 취득가액 직접 산정 — 소득세법 시행령 §163⑨").first();
    await block.scrollIntoViewIfNeeded();
    await expect(block).toBeVisible();

    // 토지분만 상속 — 파트별로 갈려 표시된다
    await expect(page.getByText(/토지분 취득가액.*상속개시일 평가액/).first()).toBeVisible();
    await expect(page.getByText(/건물분 취득가액.*상속 아님/).first()).toBeVisible();
  });

  /**
   * PI-4 — **계약 변경 (2026-08-07)**: 분리 OFF + 부분 상속은 **마이그레이션이 승격한다**.
   *
   * 종전에는 이 상태로 계산까지 가서 V-5(`transfer-tax-validate-gb.ts:145`)가 「토글을 켜고
   * 파트별로 입력하세요」로 막았다. 분리 OFF가 **단일 취득원인 카드**가 된 뒤로는 그 상태를
   * 화면에 표현할 방법이 없어(라디오가 `acquisitionCause`만 보여준다) 로드 시점에
   * M-2b(`calc-wizard-asset-migrate-phase3.ts`)가 **분리를 켜 값을 보존한다** — V-5가 안내하던
   * 행동을 마이그레이션이 대신 해주는 셈이다.
   *
   * ⚠️ **되맞춤(건물 원인을 토지 원인으로 덮기)이 아니다.** 그 구현은 부분 상속을 「둘 다 상속」
   *    으로 만들어 V-5를 무력화시켰고, 이 테스트가 그것을 잡았다. V-5 자체는 방어로 남는다.
   */
  test("PI-4: 분리 OFF + 부분 상속 세션은 로드 시 분리 ON으로 승격된다", async ({ page }) => {
    test.setTimeout(120_000);
    await seed(page, {
      hasSeperateLandAcquisitionDate: false,
      landAcquisitionDate: "2015-05-01",
    });
    await expandAssetSection(page, 3);

    // 승격 결과 — 파트별 칸이 열리고 두 취득원인이 그대로 보인다(값 보존)
    // ⚠️ exact 필수 — 「토지 취득가액 산정 방식」에 substring 매칭돼 strict mode가 깨진다
    await expect(page.getByText("건물 취득일", { exact: true })).toBeVisible();
    await expect(page.getByText("토지 취득", { exact: true })).toBeVisible();
    await expect(page.getByText("건물 취득", { exact: true })).toBeVisible();
  });
});
