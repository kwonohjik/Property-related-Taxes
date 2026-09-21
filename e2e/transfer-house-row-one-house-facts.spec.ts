/**
 * §155⑥1호 국가유산주택 — 사실의 정본이 **명부 행**이다 (D-6 · P7-3).
 *
 * ## 왜 E2E인가 — anchor는 컴포넌트를 직접 마운트한다
 *
 * 도출 규칙과 ④ 배선은 `__tests__/calc/one-house-row-facts.anchor.test.ts`가 고정한다.
 * 여기서만 보이는 것은 **행 편집 모달이 실제로 이 카드를 품고 있는가**다 —
 * `HouseEntryEditor`에 섹션을 붙이는 한 줄이 빠져도 타입은 통과하고 anchor도 초록이다
 * (U1-03이 같은 층위에서 조용히 끊겼던 자리).
 *
 * ## 🔑 Q-8이 선행 조건이었다
 *
 * §155⑥은 주택 수 **2**에서만 성립한다(`transfer-tax-exemption.ts:374`). 명부에 행을 넣으면
 * 주택 수가 명부에서 도출되므로(P7-2) 스칼라를 건드리지 않아도 2가 된다 — 그 연결이
 * 살아 있어야 이 특례가 행 하나로 성립한다.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

async function gotoHoldingStep(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  await page.getByRole("button", { name: "2채", exact: true }).click();
  await expect(page.getByText("다른 보유 주택 목록", { exact: false }).first()).toBeVisible();
}

test.describe("§155⑥1호 — 명부 행 선언", () => {
  /**
   * 🔴 **배선 축.** `HouseEntryEditor`가 `HouseEntryOneHouseFactsSection`을 렌더하지 않으면
   *    여기가 빨개진다 — 그 외 어떤 게이트도 이것을 잡지 못한다.
   */
  test("[RF-E2E-1] 행 편집 모달에 §155⑥1호 카드가 있다", async ({ page }) => {
    await gotoHoldingStep(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();

    const card = page.getByTestId("house-row-cultural-heritage");
    await expect(card).toBeVisible();
    await expect(card).toContainText("§155⑥1호");

    // 🔑 중과 축(④)과 **다른 카드**다 — 한 카드에 섞이면 요건이 뭉개진다.
    await expect(page.getByText("특수 배제 사유 (2주택·인구감소)")).toBeVisible();
    await expect(page.getByText("1세대1주택 비과세 특례 사실 (§155)")).toBeVisible();
  });

  /** 🔑 토글이 실제로 상태를 바꾼다 — 라벨만 있고 배선이 없으면 안 된다. */
  test("[RF-E2E-2] 토글을 켜면 체크 상태가 유지된다", async ({ page }) => {
    await gotoHoldingStep(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();

    const sw = page.getByRole("switch", {
      name: /지정문화유산·국가등록문화유산·천연기념물등 주택/,
    });
    await expect(sw).toHaveAttribute("data-unchecked", "");
    await sw.click();
    await expect(sw).toHaveAttribute("data-checked", "");
  });

  /**
   * 🔴 **이중 입력 금지의 반대편.** 같은 선언이 판정 메뉴 세대 단위 토글로도 남아 있으면
   *    어느 쪽이 정본인지 알 수 없다 — 같은 PR에서 뺐음을 여기서 고정한다.
   */
  test("[RF-E2E-3] 판정 메뉴에 세대 단위 문화유산 토글이 없다", async ({ page }) => {
    await page.goto("/calc/one-house-exemption");
    await page.getByRole("heading", { name: /1세대 1주택|비과세 판정/ }).first().waitFor();
    await expect(
      page.getByText(/지정문화유산·국가등록문화유산·천연기념물등 주택 보유/),
    ).toHaveCount(0);
  });
});

/**
 * ## §155⑧ (D-6 4) — ④의 3호와 **다른 조문**이다
 *
 * 🔴 §155⑧은 계산기·판정 메뉴 **양쪽**에 있던 유일한 이중 입력이었다(`full` 가드 밖).
 *    행으로 옮기며 해소됐고, 여기서 **입력 경로가 살아 있음**을 고정한다 —
 *    비과세를 주장할 수 없는 세대의 중과 배제(영 §167의10①4호)가 여기 달려 있다.
 */
test.describe("§155⑧ — 명부 행 선언 + 3호와의 구별", () => {
  test("[UO-E2E-1] 행 편집 모달에 §155⑧ 카드가 있고 3호와 다르다고 밝힌다", async ({ page }) => {
    await gotoHoldingStep(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();

    const card = page.getByTestId("house-row-unavoidable-outside-capital");
    await expect(card).toBeVisible();
    await expect(card).toContainText("§155⑧");
    // ⛔ OFF 상태에서도 3호와 다르다는 것이 보여야 한다 — 켤지 말지를 여기서 판단한다.
    await expect(card).toContainText("§167의10①3호");

    // 켜면 요건 차이를 상세히 밝힌다.
    await card.getByRole("switch").first().click();
    const note = page.getByTestId("house-row-uoc-vs-3ho");
    await expect(note).toBeVisible();
    await expect(note).toContainText("3억");
  });

  /** 🔑 ④(중과 3호)와 ⑤(비과세 4호)가 **다른 카드**로 공존한다 — 합치면 요건이 뭉개진다. */
  test("[UO-E2E-2] ④ 3호 토글과 ⑤ §155⑧ 토글이 **둘 다** 있다", async ({ page }) => {
    await gotoHoldingStep(page);
    await page.getByRole("button", { name: /주택 추가/ }).click();

    /**
     * ⚠️ **다이얼로그로 스코프한다.** 「부득이한 사유 취득 주택」 토글은 화면에 **둘**이다(실측):
     *    다이얼로그 **밖**은 양도 주택 자신의 3호(`SellingHouseTwoHouseExclusionSection`),
     *    **안**은 명부 행의 3호다. 이 PR과 무관한 기존 중복이므로 스코프로 가른다.
     *    또 `getByRole("switch", {name})`은 ToggleCard의 accessible name이 제목+설명으로
     *    합쳐져(e2e/CLAUDE.md §2) ⑤ 카드까지 잡으므로 `aria-label` 정확 매칭을 쓴다.
     */
    const modal = page.getByRole("dialog");
    await expect(modal.getByText("특수 배제 사유 (2주택·인구감소)")).toBeVisible();
    await expect(modal.getByTestId("house-row-unavoidable-outside-capital")).toBeVisible();
    await expect(
      modal.locator('[role="switch"][aria-label="부득이한 사유 취득 주택"]'),
    ).toHaveCount(1);
  });
});

/**
 * ## OH-30 — 레거시 사실이 「어느 주택인지」 미지정
 *
 * 🔴 옛 record는 §155 사실을 **세대 단위 값**으로만 들고 있다. 자동 배정하면 틀린 주택에
 *    붙으므로 **지정하지 않고 밝힌다**. 세액은 저장 당시와 같다(OH-21).
 */
test.describe("OH-30 레거시 미지정 안내", () => {
  test("[OH30-E2E-1] 세대 단위 값만 있으면 카드가 뜬다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      {
        state: {
          formData: {
            assets: [
              {
                ...makeDefaultAsset(1),
                addressJibun: "서울 강남구 역삼동 1-1",
                assetKind: "housing",
                acquisitionCause: "purchase",
                acquisitionDate: "2018-01-01",
              },
            ],
            transferDate: "2026-06-01",
            isOneHousehold: true,
            householdHousingCount: "2",
            houses: [],
            presaleRights: [],
            // 레거시 — 행 지정이 없는 세대 단위 선언
            culturalHeritageHouseSpecial: true,
          },
          pendingMigration: false,
        },
        version: 0,
      },
    );
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.getByRole("button", { name: "보유 상황" }).first().click();

    const card = page.getByTestId("one-house-legacy-unassigned");
    await expect(card).toBeVisible();
    await expect(card).toContainText("어느 주택인지 지정되지 않았습니다");
  });

  /** 🔑 긍정 짝 — 레거시가 없으면 뜨지 않는다(모두에게 띄우면 안내가 무의미해진다). */
  test("[OH30-E2E-2] 레거시가 없으면 카드가 없다", async ({ page }) => {
    await gotoHoldingStep(page);
    await expect(page.getByTestId("one-house-legacy-unassigned")).toHaveCount(0);
  });
});
