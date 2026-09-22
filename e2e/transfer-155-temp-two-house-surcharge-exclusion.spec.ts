/**
 * 일시적 2주택 §155① 의제 → 다주택 중과 배제(영 §167의10①15호) E2E.
 *
 * 계획서: docs/02-design/features/transfer-surcharge-155-deeming-coverage.plan.md §7 S-7
 *
 * 엔진 anchor(`__tests__/tax-engine/transfer-tax/temporary-two-house-surcharge.anchor.test.ts`)가
 * 계산을 커버한다. 여기서 보는 것은 **배관과 표시**다:
 *   ④⑬⑭ 폼 토글(temporaryTwoHouseSpecial + newHouseAcquisitionDate) → API → 엔진 의제 선판정
 *   ⑦ 결과 카드가 「중과 배제 사유 — 일시적 2주택 특례」를 표시하는가
 *
 * 종전에는 중과 전용 `multiHouseTemporaryTwoHouse`(주택 ID 매칭)를 **아무도 채우지 않아**
 * 이 배제가 통째로 잠들어 있었다(계획서 F-1, 과다과세 +137,130,000).
 * 배관이 끊기면 세액이 조용히 **높아질** 뿐 화면은 정상으로 보인다 — 그래서 브라우저 검증이 필요하다.
 *
 * worktree 실행: E2E_PORT=3xxx npx playwright test e2e/transfer-155-temp-two-house-surcharge-exclusion.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

/** 12억 초과 고가주택 — §155① 의제가 서면 비과세도 함께 서므로, 중과 배제 효과는 초과분에서만 보인다 */
function seedForm(over: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2018-01-01",
            fixedAcquisitionPrice: "700000000",
            transferPrice: "2000000000",
            residencePeriodYears: "3",
          },
        ],
        transferDate: "2026-06-01", // 중과 한시배제(~2026-05-09) 종료 후
        filingDate: "2026-08-31",
        contractTotalPrice: "2000000000",
        isOneHousehold: true,
        householdHousingCount: "2",
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        /**
         * 🔄 **토글·날짜 시드를 뺐다** (2026-09-22). §155①은 이제 명부에서 도출된다
         * (`resolveTemporaryTwoHouse`) — 아래 `houses[0]`(2025-01-01)이 양도주택(2018-01-01)보다
         * 나중 취득인 **유일한** 행이라 신규주택으로 특정된다.
         *
         * 종전에는 `newHouseAcquisitionDate: "2025-01-01"`과 `houses[0].acquisitionDate`가
         * **같은 값으로 중복 시드**돼 있었다 — 그 자체가 dual truth의 흔적이었다. 빼고 나면
         * 이 spec은 「명부만으로 중과 배제(영 §167의10①15호)까지 닿는가」를 증명한다.
         */
        houses: [
          {
            id: "h2",
            region: "capital",
            acquisitionDate: "2025-01-01",
            officialPrice: "800000000",
            isInherited: false,
            isLongTermRental: false,
            isApartment: true,
            isOfficetel: false,
            isUnsoldHousing: false,
          },
        ],
        presaleRights: [],
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndCalc(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (seed) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(seed)),
    seedForm(over),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("산출세액").first().waitFor({ timeout: 20000 });
}

test.describe("일시적 2주택 §155① 의제 → 중과 배제 (§167의10①15호)", () => {
  test("조정대상지역 2주택 + 일시적 2주택 특례 → 「중과 배제 사유」 표시", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page);

    // 판정 카드 자체가 떠 있어야 아래 단언이 유효하다(카드 미렌더 시 침묵 통과 방지)
    await expect(page.getByText("다주택 중과세 판정 상세").first()).toBeVisible();
    await expect(page.getByText("중과 배제 사유").first()).toBeVisible();
    await expect(page.getByText("일시적 2주택 특례", { exact: true }).first()).toBeVisible();
  });

  /**
   * 🔄 **대조군을 전환했다** (2026-09-22 — 토글이 더 이상 적용 여부를 가르지 않는다).
   *
   * 종전 대조군은 `temporaryTwoHouseSpecial: false`로 특례를 껐다. §155①이 명부 파생으로
   * 바뀐 뒤 그 시드는 **아무것도 끄지 못한다**(명부는 그대로라 자동 도출된다) — 그대로 두면
   * 대조군이 긍정 케이스와 같은 상태가 되어 구별력을 잃는다.
   *
   * ⇒ **명부 쪽에서** 불성립을 만든다. 다른 주택을 양도주택(2018-01-01)보다 **먼저** 취득한
   *   것으로 두면 「양도하기 전에 다른 주택을 취득」이라는 §155① 요건 자체가 성립하지 않는다
   *   — 일시적 2주택이 아니라 **일반 2주택**이므로 중과가 그대로 적용된다.
   */
  test("§155① 불성립(신규주택 없음) → 배제 없이 중과 적용 (대조군)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndCalc(page, {
      houses: [
        {
          id: "h2",
          region: "capital",
          acquisitionDate: "2017-01-01", // 양도주택보다 **먼저** 취득 ⇒ 신규주택이 아니다
          officialPrice: "800000000",
          isInherited: false,
          isLongTermRental: false,
          isApartment: true,
          isOfficetel: false,
          isUnsoldHousing: false,
        },
      ],
    });

    await expect(page.getByText("다주택 중과세 판정 상세").first()).toBeVisible();
    await expect(page.getByText("중과 배제 사유")).toHaveCount(0);
  });
});
