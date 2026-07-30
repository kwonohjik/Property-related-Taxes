/**
 * 양도세 신고서 양식 — 토지·건물 소유자 분리(selfOwns) 표시 회귀 E2E
 *
 * 버그①: selfOwns="building_only"인데 결과 신고서 표에 토지 컬럼이 표시됨.
 * 버그②: 과세대상양도차익·양도소득금액의 토지/건물 분할값 오염(taxableRatio 분모에 토지 gain 포함).
 * 수정: deriveColumns가 소유 안 한 파트 컬럼 제거 + 합계=소유 파트(자기정합).
 * 엔진 계산은 unit anchor(__tests__/components/filing-form-self-owns-split.test.tsx)로 커버 —
 *   여기서는 실제 렌더 파이프라인(store→API→result→FilingFormTable)에서 컬럼·정합을 검증.
 *
 * 상태 주입 방식: sessionStorage("transfer-tax-wizard") 시드 + reload
 *   (transfer-amendment.spec.ts와 동일한 "이력 hydration 동등" 패턴).
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-self-owns-filing-form.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

// 건물만 본인 소유 + 환산취득가 + 토지/건물 분리 (calcSplitGain 활성 std 필드 포함)
function buildingOnlyAsset() {
  return {
    ...makeDefaultAsset(1),
    assetKind: "building", // 건물(토지 제외) — housing 환산의 PHD 자동요구 우회, split 경로는 동일
    acquisitionCause: "purchase",
    acquisitionDate: "1999-05-20",
    useEstimatedAcquisition: true, // 환산 → standardPriceAtAcquisition 송신 → calcApportionRatio 활성
    standardPriceAtAcq: "100000000",
    standardPricePerSqmAtAcq: "800000",
    // 이 seed는 `building`(건물, 토지 제외)에 **토지분** 기준시가·양도가액을 함께 넣는다 —
    // 모순이 아니다(U-12 종결, 2026-07-30): 「소득세법」 제99조 제1항 제1호는 **나목**(건물)에
    // "딸린 토지" 문구를 두지 않고 **다목**(오피스텔·상업용건물)에만 "이에 딸린 토지를
    // 포함한다"를 둔다(같은 조 제3항 제4호에서 확인) → **나목 건물의 부수토지는 가목으로
    // 별도 평가**된다. 라벨 "건물(토지 제외)"는 *기준시가 공시 범위*이지 토지 부재가 아니므로
    // `isSplitable`이 `building`을 포함하는 것이 정본이다.
    acquisitionArea: "100", // 축 A — 부수토지 면적(가목: ㎡당 공시지가 × 면적)
    standardPriceAtTransfer: "300000000",
    selfOwns: "building_only",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "1999-05-20",
    landSplitMode: "actual",
    landTransferPrice: "400000000",
    buildingTransferPrice: "100000000",
    landStandardPriceAtTransfer: "240000000",
    buildingStandardPriceAtTransfer: "60000000",
    isOneHousehold: false,
  };
}

function seedForm() {
  return {
    state: {
      formData: {
        assets: [buildingOnlyAsset()],
        transferDate: "2026-02-16",
        filingDate: "2026-04-30",
        contractTotalPrice: "500000000",
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

async function seedAndCalc(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((seed) => {
    sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed));
  }, seedForm());
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // 가산세 단계로 이동 후 계산
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("신고서 양식 — 건물만 본인 소유(selfOwns=building_only)", () => {
  test("토지 컬럼 미표시 + 합계=건물분 자기정합", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    const filing = page.locator('[data-print-id="form-table"]');
    await expect(filing).toBeVisible();

    // 버그①: 헤더에 '건물' 컬럼은 있고 '토지' 컬럼은 없어야 함
    const header = filing.locator("thead").first();
    await expect(header.getByText("건물", { exact: true })).toBeVisible();
    await expect(header.getByText("토지", { exact: true })).toHaveCount(0);

    // 버그②/자기정합: 합계 양도가액 − 취득가액 − 필요경비 = 전체 양도차익
    // (건물분 단독이므로 합계 컬럼이 자기정합해야 함)
    const num = async (rowLabel: string) => {
      const row = filing.locator("tr", { hasText: rowLabel }).first();
      const cell = row.locator("td").first(); // 합계 컬럼 (첫 데이터 셀)
      const raw = (await cell.innerText()).replace(/[^0-9-]/g, "");
      return parseInt(raw || "0", 10);
    };
    const transfer = await num("양도가액");
    const acq = await num("취득가액");
    const exp = await num("필요경비");
    const gain = await num("전체 양도차익");
    expect(transfer - acq - exp).toBe(gain);
  });
});
