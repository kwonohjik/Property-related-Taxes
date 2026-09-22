/**
 * 판정 마법사 **화면 순서** — 사용자 제보(2026-09-23)의 회귀 방어선.
 *
 * ## 무엇을 지키는가
 *
 * 종전 순서(① 세대 → ② 보유 주택 → ③ 양도 예정)에서는 **①→②로 처음 도달한 사용자에게
 * 「일시적 2주택 특례(§155①)」 블록이 아예 뜨지 않았다.** 그 블록이 소비하는
 * `assets[0].acquisitionDate`의 유일한 입력 경로가 ③이었기 때문이다
 * (`household-house-count.ts:263` `if (!prev) return fallback()` →
 *  `TemporaryTwoHouseSection.tsx:123`이 `null`). 보려면 ③을 채우고 **되돌아와야** 했고,
 * 돌아와서 본 「종전 주택 취득일」은 읽기 전용인데 안내가 없는 「1단계」를 가리켜
 * 「내가 입력해야 하나」로 읽혔다.
 *
 * ⇒ 순서를 ① 세대 → **② 양도 대상 주택** → **③ 보유 주택·권리**로 바꿨다.
 *   설계·근거: `docs/00-pm/one-house-judgment-step-reorder.plan.md`.
 *
 * 🔑 **이 spec은 「되돌아가지 않는다」를 지킨다** — 유닛은 컴포넌트를 단독 렌더하므로
 *    화면 순서를 볼 수 없다(`feedback_guard_uses_proxy_not_the_claim`). 순방향 진행은
 *    브라우저에서만 관측된다.
 */
import { test, expect, type Page } from "@playwright/test";
import { fillDateAndVerify } from "./_helpers/tax-flow";

const PREV_ACQ = { year: "2017", month: "08", day: "31" };

/**
 * **명부만** 시드한다 — 양도 대상 3값은 화면에서 직접 넣는다.
 *
 * 🔴 셋 다 시드해 버리면 정작 겨냥한 축(「②에서 넣은 값이 ③에 반영되는가」)이 사라진다
 *    (`feedback_fixture_default_masks_gate_defect`). 명부만 시드하는 이유는 주택 추가가
 *    주소 검색·공시가격을 거치는 별개 축이기 때문이다.
 */
async function seedRosterOnly(page: Page) {
  await page.goto("/calc/one-house-exemption");
  await expect(page.getByTestId("one-house-household")).toBeVisible();
  await page.evaluate(
    (s) => sessionStorage.setItem("one-house-judgment-wizard", JSON.stringify(s)),
    {
      state: {
        formData: {
          isOneHousehold: true,
          presaleRights: [],
          houses: [
            {
              id: "h1",
              region: "capital",
              // 양도 주택(2017-08-31)보다 **나중** 취득 ⇒ §155① 신규 주택으로 도출된다.
              acquisitionDate: "2024-05-30",
              officialPrice: "530000000",
              isInherited: false,
              isLongTermRental: false,
              isApartment: true,
              isOfficetel: false,
              isUnsoldHousing: false,
            },
          ],
        },
      },
      version: 0,
    },
  );
  await page.reload();
  await expect(page.getByTestId("one-house-household")).toBeVisible();
}

test.describe("판정 마법사 — 화면 순서", () => {
  test("[SO-1] 순방향 ①→②→③에서 §155①이 ②에서 넣은 취득일로 채워진 채 뜬다", async ({
    page,
  }) => {
    await seedRosterOnly(page);

    // ① → ②: 양도 대상이 **2번째** 화면이다.
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("② 양도 대상 주택")).toBeVisible();

    await fillDateAndVerify(page, PREV_ACQ, {
      scope: page.getByTestId("one-house-acq-date"),
    });
    await fillDateAndVerify(page, { year: "2026", month: "09", day: "30" }, {
      scope: page.getByTestId("one-house-sale-date"),
    });
    await page.getByTestId("one-house-sale-price").fill("1200000000");

    // ② → ③: **되돌아가지 않는다.**
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();

    // 🔴 제보의 핵심 — 블록이 뜨고, 종전 주택 취득일이 **②에서 넣은 값으로 채워져** 있다.
    await expect(page.getByText("일시적 2주택 특례 (§155①)")).toBeVisible();
    /*
      🔑 **저장값과 표시값의 padding이 다르다**(실측 — 추정으로 두 번 틀렸다).
         `buildDateStr`가 저장 시 `padStart(2,"0")`으로 `2017-08-31`을 만들고(`date-input.tsx:44-45`),
         `parseDateStr`가 표시할 때 선행 0을 **일부러 제거**한다(`:32-36` — 패딩된 값이 돌아와
         로컬 입력 버퍼를 덮어쓰지 않게 하려는 것). ⇒ 화면에서는 월이 `8`이다.
         (저장값이 padded라서 `resolveTemporaryTwoHouse`의 사전식 비교 전제도 성립한다.)
      ⚠️ `getByLabel("일")`은 substring 매칭이라 `exact: true`가 필요하다(e2e/CLAUDE.md §1).
    */
    const prevDate = page.getByTestId("temp-two-house-prev-acq-date");
    await expect(prevDate.getByLabel("연도")).toHaveValue(PREV_ACQ.year);
    await expect(prevDate.getByLabel("월")).toHaveValue(String(Number(PREV_ACQ.month)));
    await expect(prevDate.getByLabel("일", { exact: true })).toHaveValue(
      String(Number(PREV_ACQ.day)),
    );

    // 안내 문구가 **존재하는 단계**를 가리킨다(종전에는 없는 「1단계」를 가리켰다).
    await expect(page.getByText(/② 양도 대상 주택 단계에서 입력/)).toBeVisible();
    await expect(page.getByText(/1단계에서 입력/)).toHaveCount(0);
  });

  /**
   * 합가일 중복 해소 — 주택 수 ≥ 2에서 종전에는 ①과 ③ **양쪽에** 떴다
   * (`TemporaryTwoHouseSection.tsx`의 `<MergeDateSection>`이 `full` 가드 밖이었다).
   */
  test("[SO-2] 합가일 칸은 ①에만 있고 ③에는 없다", async ({ page }) => {
    await seedRosterOnly(page);

    // ① — 소유자
    await expect(page.getByText("혼인합가일", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "다음" }).click();
    await fillDateAndVerify(page, PREV_ACQ, {
      scope: page.getByTestId("one-house-acq-date"),
    });
    await fillDateAndVerify(page, { year: "2026", month: "09", day: "30" }, {
      scope: page.getByTestId("one-house-sale-date"),
    });
    await page.getByTestId("one-house-sale-price").fill("1200000000");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();

    // ③ — 중복이 없다. 긍정 짝으로 섹션 자체는 살아 있음을 함께 본다.
    await expect(page.getByText("③ 일시적 2주택·합가 특례")).toBeVisible();
    await expect(page.getByText("혼인합가일", { exact: true })).toHaveCount(0);
    await expect(page.getByText("동거봉양 합가일", { exact: true })).toHaveCount(0);
  });

  /**
   * 거주요건 면제 특례 3종이 ② 양도 대상 화면으로 모였다 — 거주기간 입력과 같은 화면이다.
   * 제보의 두 번째 축(「양도주택 정보와 다른 주택 정보 혼재」)이 여기서 관측된다.
   */
  test("[SO-3] §155의2·§155의3·§155⑳은 ②에 있고 ③에는 없다", async ({ page }) => {
    await seedRosterOnly(page);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("② 양도 대상 주택")).toBeVisible();

    await expect(page.getByTestId("one-house-long-term-mortgage")).toBeVisible();
    await expect(page.getByTestId("one-house-win-win-rental")).toBeVisible();
    await expect(
      page.getByText("장기임대주택 보유자 거주주택 비과세 특례 적용"),
    ).toBeVisible();

    await fillDateAndVerify(page, PREV_ACQ, {
      scope: page.getByTestId("one-house-acq-date"),
    });
    await fillDateAndVerify(page, { year: "2026", month: "09", day: "30" }, {
      scope: page.getByTestId("one-house-sale-date"),
    });
    await page.getByTestId("one-house-sale-price").fill("1200000000");
    await page.getByRole("button", { name: "다음" }).click();
    await expect(page.getByText("③ 보유 주택·권리")).toBeVisible();

    await expect(page.getByTestId("one-house-long-term-mortgage")).toHaveCount(0);
    await expect(page.getByTestId("one-house-win-win-rental")).toHaveCount(0);
  });
});
