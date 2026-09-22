/**
 * 판정 메뉴 — **「선언했으나 적용되지 않은 특례」 안내** E2E (2026-09-22 제보 사례).
 *
 * ## 제보
 *
 * 혼인합가일 2017-03-11 · 양도주택 취득일 2017-08-31 · 3주택 · 「먼저 양도」 ON ·
 * 「일시적 2주택 특례 해당」 OFF로 판정했더니 **「과세」만 뜨고 사유가 한 줄도 없었다.**
 * `pending`은 기한 초과만, `undetermined`는 자료 부재만 담아 **구조적 탈락**(합가 후 취득 ·
 * 3주택 중첩 미선언)은 어느 카드에도 실리지 않았다.
 *
 * ## 왜 E2E인가
 *
 * 엔진 anchor는 `judgment.unmetExceptions`가 채워지는 것까지, RTL anchor는 뷰가 그 배열을
 * 렌더하는 것까지만 본다. **폼 → `lib/calc` 변환 → Zod → route → 엔진 → 응답 → 화면**이
 * 한 줄로 이어지는지는 둘 다 증명하지 못한다 — 변환 층이 필드를 흘리면 둘 다 초록인 채
 * 화면만 비어 있다(`feedback_leaf_anchor_skips_zod_layer`).
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const house = (id: string, acquisitionDate: string, officialPrice: string) => ({
  id,
  region: "capital" as const,
  acquisitionDate,
  officialPrice,
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
});

/** 제보 화면 그대로 — 다른 보유 주택 2채 + 혼인합가 + 일시적 2주택 미선언 */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2017-08-31",
            residencePeriodMonthsAsset: "102",
          },
        ],
        transferDate: "2026-09-30",
        // ⚠️ 예상 양도가액의 폼 필드는 `contractTotalPrice`다 — `transferPrice`로 시드하면
        //    「예상 양도가액을 입력하세요」로 막혀 결과 단계에 도달하지 못한다(실측 정정).
        contractTotalPrice: "1200000000",
        isOneHousehold: true,
        householdHousingCount: "3",
        houses: [house("h2", "2024-05-30", "530000000"), house("h3", "2016-08-21", "220000000")],
        presaleRights: [],
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        marriageDate: "2017-03-11",
        isFirstTransferredInMerge: true,
        temporaryTwoHouseSpecial: false,
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

/** 시드 후 마지막 단계까지 「다음」으로 진행해 판정 결과를 띄운다. */
async function gotoResult(page: Page, over: Record<string, unknown> = {}) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    (s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)),
    seedForm(over),
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();

  // ① 세대 → ② 양도 대상 주택 → ③ 보유 주택·권리 (2026-09-23 재배치 — 클릭 수는 그대로다)
  // 🔑 시드가 취득일·양도예정일·양도가액을 이미 갖고 있어 ②의 ⑧이 막지 않는다.
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  // ⚠️ 마지막 단계의 액션은 「다음」이 아니라 **「판정 결과 보기」**다(실측 정정).
  await page.getByRole("button", { name: "판정 결과 보기" }).click();
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

test.describe("판정 결과 — 선언했으나 적용되지 않은 특례", () => {
  test("UME2E-1 제보 사례 — 과세와 함께 합가 불성립 사유를 화면에 낸다", async ({ page }) => {
    await gotoResult(page);

    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");

    const card = page.getByTestId("one-house-unmet-155-5-marriage-merge");
    await expect(card).toBeVisible();
    await expect(page.getByText("선언했으나 적용되지 않은 특례")).toBeVisible();
    await expect(card).toContainText("혼인 합가 — 요건 미충족");

    // ① 합가 후 취득 — 두 날짜가 문장에 함께 있어야 사용자가 대조할 수 있다
    await expect(card).toContainText("2017-03-11");
    await expect(card).toContainText("2017-08-31");

    /**
     * 🔄 **「일시적 2주택 미선언」 사유는 더 이상 나오지 않는다** (2026-09-22).
     *
     * §155①이 명부 파생으로 바뀐 뒤(`resolveTemporaryTwoHouse`), 이 시드는 명부에서
     * 신규주택(2024-05-30)이 **정확히 1채로 특정**되어 §155①이 자동 성립한다.
     * 남는 원인은 **합가 후 취득** 하나뿐이다 — 사용자가 켤 토글이 없으므로 그 사유를
     * 내면 존재하지 않는 컨트롤을 누르라는 안내가 된다.
     */
    await expect(card).not.toContainText("일시적 2주택 특례 해당");
  });

  test("UME2E-2 취득일이 합가일 이전이면 — 사유 카드가 사라지고 비과세가 된다", async ({
    page,
  }) => {
    /**
     * 제보 사례의 **결정적 원인**을 고친 대조군. 취득일을 합가일 이전으로 옮기고
     * 일시적 2주택을 선언하면 §155①·⑤ 중첩으로 비과세가 난다(엔진 실측 C·D와 같은 축).
     */
    await gotoResult(page, {
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2016-01-01",
          residencePeriodMonthsAsset: "102",
        },
      ],
      temporaryTwoHouseSpecial: true,
      newHouseAcquisitionDate: "2024-05-30",
    });

    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByTestId("one-house-unmet-155-5-marriage-merge")).toHaveCount(0);
    await expect(page.getByText("선언했으나 적용되지 않은 특례")).toHaveCount(0);
  });
});
