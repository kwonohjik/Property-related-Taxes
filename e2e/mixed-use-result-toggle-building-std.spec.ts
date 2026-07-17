/**
 * 겸용주택 결과뷰 — 세션별 접기/펼치기 토글 + 건물 기준시가 계산서 결과탭 배선 E2E (PR#640)
 *
 * unit anchor:
 *   - DetailedCalculationStatementCard.test.tsx T-10 (GroupSection 토글 증분 검증)
 *   - building-std-report-phd-section.test.tsx (계산서 assetId 소속 매칭·렌더)
 * 여기서는 실제 브라우저(store→API→result→DOM)에서:
 *   A. 신고서 양식 제외 세션(계산 카드·상세명세서 단계)의 접기/펼치기 클릭 동작·본문 숨김
 *   B. PHD 3시점 일괄 스냅샷 소속 시 건물 기준시가 계산서 PrintSection 노출(스냅샷 無면 미노출)
 *
 * 상태 주입: sessionStorage("transfer-tax-wizard") + ("building-std-snapshots") 시드 + reload
 *   (mixed-use-filing-form-4col.spec.ts 동일 패턴).
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/mixed-use-result-toggle-building-std.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { phdBatchToSnapshots } from "../lib/calc/phd-batch-snapshots";

// assetId 고정 — 계산서 스냅샷 키 `bsp-${assetId}-phd-*`가 결과뷰 inputData(assets)와 매칭돼야 함.
// makeDefaultAsset의 기본 assetId는 `asset-${Date.now()}-${i}`(동적)이라 오버라이드로 고정한다.
const ASSET_ID = "mx-e2e-1";

// 일반 겸용주택(§97 직접 환산). 계산서 시나리오는 스냅샷을 별도 시드하므로 asset 자체는 PHD 불요.
function mixedUseAsset() {
  return {
    ...makeDefaultAsset(1),
    assetId: ASSET_ID,
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-15",
    isOneHousehold: false,
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    mixedTransferHousingPrice: "600000000",
    mixedTransferLandPricePerSqm: "5000000",
    mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "300000000",
    mixedAcqLandPricePerSqm: "2500000",
    mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true,
  };
}

function seedForm() {
  return {
    state: {
      formData: {
        assets: [mixedUseAsset()],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "1500000000",
        householdHousingCount: "1",
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

// 건물 기준시가 계산서용 PHD 3시점 배치 입력(building-std-report-phd-section.test.tsx와 동형).
const tp = (usageNo: number) => ({ structureKey: "rc", usageNo });
const PHD_INPUT = {
  building: {
    builtYear: 2010,
    parts: [
      { floorArea: 100, category: "housing" as const, acquisition: tp(2), firstDisclosure: tp(2), transfer: tp(2) },
    ],
  },
  acquisition: { year: 2014, landPricePerM2: 2_360_000 },
  firstDisclosure: { year: 2016, landPricePerM2: 2_369_000 },
  transfer: { year: 2025, landPricePerM2: 3_486_000 },
};

function seedStdSnapshots() {
  return {
    state: { snapshots: phdBatchToSnapshots(PHD_INPUT, `bsp-${ASSET_ID}-phd`) },
    version: 0,
  };
}

async function seedAndCalc(page: Page, opts?: { withStdSnapshot?: boolean }) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    ({ form, std }) => {
      sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(form));
      if (std) sessionStorage.setItem("building-std-snapshots", JSON.stringify(std));
    },
    { form: seedForm(), std: opts?.withStdSnapshot ? seedStdSnapshots() : null },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("겸용주택 결과뷰 — 세션 토글 + 건물 기준시가 계산서", () => {
  test("A1: 계산 카드 세션 접기 → 본문 숨김 + 라벨 전환(기본 펼침)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    const calc = page.locator('[data-print-id="calculation"]');
    await expect(calc).toBeVisible();

    // 기본 펼침 → "▲ 접기" 버튼 다수(①②③·합산·계산경로), 첫 카드(① 양도가액 안분) 본문 표시
    const collapseButtons = calc.getByRole("button", { name: "▲ 접기" });
    expect(await collapseButtons.count()).toBeGreaterThan(0);
    await expect(calc.getByText("양도시 개별주택공시가격").first()).toBeVisible();

    // 첫 카드 접기 → 본문 숨김(hidden) + 그 버튼 "▼ 펼치기"로 전환
    await collapseButtons.first().click();
    await expect(calc.getByText("양도시 개별주택공시가격").first()).toBeHidden();
    await expect(calc.getByRole("button", { name: "▼ 펼치기" }).first()).toBeVisible();
  });

  test("A2: 신고서 양식 세션은 토글이 없다(항상 펼침)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    const filing = page.locator('[data-print-id="filing-form"]');
    await expect(filing).toBeVisible();
    // 신고서 양식 섹션 내부에는 접기/펼치기 버튼이 없어야 함
    await expect(filing.getByRole("button", { name: "▲ 접기" })).toHaveCount(0);
    await expect(filing.getByRole("button", { name: "▼ 펼치기" })).toHaveCount(0);
  });

  test("A3: 상세명세서 단계(GroupSection)에도 접기/펼치기 토글", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    const stmt = page.locator('[data-print-id="detailed-statement"]');
    await expect(stmt).toBeVisible();
    const collapseButtons = stmt.getByRole("button", { name: "▲ 접기" });
    expect(await collapseButtons.count()).toBeGreaterThan(0);

    // 한 단계 접기 → "▼ 펼치기" 전환
    await collapseButtons.first().click();
    await expect(stmt.getByRole("button", { name: "▼ 펼치기" }).first()).toBeVisible();
  });

  test("B1: PHD 3시점 스냅샷 소속 시 건물 기준시가 계산서 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, { withStdSnapshot: true });

    const report = page.locator('[data-print-id="building-std-report"]');
    await expect(report).toBeVisible();
    // 국세청 서식 인스턴스 렌더(3시점 → 다벌)
    await expect(page.getByTestId("nts-bsp-report").first()).toBeVisible();
  });

  test("B2: 스냅샷 없으면 계산서 미노출", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);
    await expect(page.locator('[data-print-id="building-std-report"]')).toHaveCount(0);
  });
});
