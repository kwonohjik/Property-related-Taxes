/**
 * 판정 메뉴 — §155②(상속주택) · §155⑦(농어촌주택) **불성립 사유 안내** E2E.
 *
 * ## 왜 E2E인가
 *
 * 엔진 anchor(`one-house-unmet-155-2-7-8.anchor.test.ts`)는 `judgment.unmetExceptions`가
 * 채워지는 것까지, RTL anchor(`one-house-unmet-exceptions.ui.test.tsx`)는 뷰가 그 배열을
 * 렌더하는 것까지만 본다. **명부 행 필드 → `lib/calc` 변환 → Zod → route → 엔진 → 화면**이
 * 한 줄로 이어지는지는 둘 다 증명하지 못한다(`feedback_leaf_anchor_skips_zod_layer`).
 *
 * 특히 이 두 축은 **행(行) 단위 필드**로 선언된다(`HouseEntryRuralHouseBlock` ·
 * `HouseEntryEditor`의 상속 섹션). 변환 층이 그 필드를 흘리면 사유가 영원히 뜨지 않는데,
 * 엔진·뷰 테스트는 둘 다 초록인 채로 남는다.
 *
 * ## §155②가 특히 중요한 이유
 *
 * 이 축은 의제가 아니라 **주택 수에서 빼는** 축이라, 부적격 사유가 `buildInheritedExclusionSteps`
 * (계산기 산식 step)에만 있었고 판정 화면이 읽는 `buildOneHouseCountBreakdown`은 **제외에
 * 성공한 행만** 담았다 ⇒ 판정 메뉴에서는 상속주택이 조용히 빠지지 않은 채 과세만 나왔다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const house = (
  id: string,
  acquisitionDate: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  region: "capital" as const,
  acquisitionDate,
  officialPrice: "300000000",
  isInherited: false,
  isLongTermRental: false,
  isApartment: true,
  isOfficetel: false,
  isUnsoldHousing: false,
  ...extra,
});

/**
 * 양도주택 취득 2016-01-01 · 양도 2026-09-30 ⇒ §154① 보유 2년 충족(취득 당시 비조정).
 * 합가 축은 선언하지 않는다 — 이 spec이 보는 축만 카드에 뜨도록.
 */
function seedForm(over: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "purchase",
            acquisitionDate: "2016-01-01",
            residencePeriodMonthsAsset: "0",
          },
        ],
        transferDate: "2026-09-30",
        contractTotalPrice: "800000000",
        isOneHousehold: true,
        presaleRights: [],
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: false,
        ...over,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

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
  await page.getByRole("button", { name: "판정 결과 보기" }).click();
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
}

test.describe("판정 결과 — §155② 상속주택 불성립 사유", () => {
  test("UMX-E2E-1 순위 부적격 상속주택 — 주택 수에서 빠지지 않은 이유를 화면에 낸다", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoResult(page, {
      houses: [
        // A3 OH-12 — 판정 메뉴 ⑧이 상속주택의 상속개시일을 요구한다(계산기 ⑧과 같은 규칙).
        //   양도주택 2016 취득 < 상속 2020 ⇒ 「상속개시 당시 보유」라 이 spec의 축은 그대로다.
        house("inh", "2020-01-01", {
          isInherited: true,
          inheritedDate: "2020-01-01",
          isRankingDisqualifiedInheritedHouse: true,
        }),
        house("h3", "2014-03-01"),
      ],
    });

    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");

    const card = page.getByTestId("one-house-unmet-155-2-inherited-house");
    await expect(card).toBeVisible();
    await expect(page.getByText("선언했으나 적용되지 않은 특례")).toBeVisible();
    await expect(card).toContainText("상속주택 주택 수 제외 — 요건 미충족");
    await expect(card).toContainText("순위");
  });

  /**
   * 대조군 — **명부 쪽에서** 성립시킨다. 순위 부적격 표시를 떼면 적격 1채가 되어 제외에
   * 성공하고, 사유 카드가 사라진다(과세 여부는 그대로 — 제외 후에도 2주택).
   */
  test("UMX-E2E-2 순위 표시를 떼면 제외에 성공해 사유 카드가 사라진다 (대조군)", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoResult(page, {
      houses: [
        house("inh", "2020-01-01", { isInherited: true, inheritedDate: "2020-01-01" }),
        house("h3", "2014-03-01"),
      ],
    });

    await expect(page.getByTestId("one-house-unmet-155-2-inherited-house")).toHaveCount(0);
  });
});

test.describe("판정 결과 — §155⑥1호 문화유산 주택 불성립 사유", () => {
  /**
   * 요건이 boolean 하나뿐이라(2·3호 삭제) 남는 사유는 **주택 수**와 §154①이다.
   * 여기서 보는 것은 행 필드 `oneHouseCulturalHeritage` → `deriveOneHouseFactsFromHouses` →
   * ④ `culturalHeritageHouse`가 끊기지 않는가다 — 끊기면 사유가 영원히 뜨지 않는다.
   */
  test("UMX-E2E-4 문화유산 주택 + 3주택 — 「각각 1개씩」 미충족을 화면에 낸다", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoResult(page, {
      houses: [
        house("heritage", "2014-03-01", { oneHouseCulturalHeritage: true }),
        house("h3", "2013-03-01"),
      ],
    });

    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");

    const card = page.getByTestId("one-house-unmet-155-6-1ho-cultural-heritage");
    await expect(card).toBeVisible();
    await expect(card).toContainText("문화유산 주택 — 요건 미충족");
    await expect(card).toContainText("3채");
  });

  /** 대조군 — 명부에서 한 채를 빼 2주택이 되면 특례가 서고 카드가 사라진다. */
  test("UMX-E2E-5 2주택이면 특례가 서고 사유 카드가 사라진다 (대조군)", async ({ page }) => {
    test.setTimeout(60_000);
    await gotoResult(page, {
      houses: [house("heritage", "2014-03-01", { oneHouseCulturalHeritage: true })],
    });

    await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
    await expect(page.getByTestId("one-house-unmet-155-6-1ho-cultural-heritage")).toHaveCount(0);
  });
});

test.describe("판정 결과 — §155⑦ 농어촌주택 불성립 사유", () => {
  test("UMX-E2E-3 1호 상속 농어촌주택 — 피상속인 거주 5년 미달을 화면에 낸다", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoResult(page, {
      houses: [
        house("rural", "2014-03-01", {
          oneHouseRuralHouse: true,
          ruralHouseKind: "inherited",
          ruralDecedentResidenceYears: "2",
        }),
      ],
    });

    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");

    const card = page.getByTestId("one-house-unmet-155-7-rural:inherited");
    await expect(card).toBeVisible();
    await expect(card).toContainText("농어촌주택");
    await expect(card).toContainText("피상속인");
  });
});
