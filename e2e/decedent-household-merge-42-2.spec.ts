/**
 * 판정 메뉴 ③ — 상속주택 행 「상속개시 당시 피상속인과 같은 세대였습니까」 한 칸(별도세대·동일세대·모름)이 §155②와
 * 조특법 §71의2①에 함께 쓰인다 (결정 #42-2 합침) — 행 편집 창 → 판정 본문 → 결과 (브라우저 경로).
 *
 * 엔진·④·⑫·⑭는 anchor가 고정한다(`decedent-household-merge-42-2.anchor.test.ts`). 여기서만 관측되는 것은
 * **행 편집 창의 라디오가 판정 본문 `houses[]`에 실리고(별도세대 → boolean false · 동일세대 → true · 모름·미답 →
 * `decedentHouseholdUnconfirmed`) 결론이 바뀌는가**다. 종전 토글은 답하지 않으면 별도세대로 읽혀 비과세였다.
 *
 * 시나리오: 아내가 별도세대 부친에게서 주택 A를 상속(2024-05-15)받은 뒤 상속개시 전 취득한 일반주택 B(2019)를 양도 —
 * 별도세대면 A가 주택 수에서 빠져 비과세(RI-1과 같은 사실에서 재상속 칩 대신 세대 답만 바꾼다).
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

async function seed(page: Page, rowOver: Record<string, unknown> = {}) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2026-11-30",
    contractTotalPrice: "500000000",
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: false,
    assets: [{ assetKind: "housing", acquisitionDate: "2019-03-15" }],
    houses: [
      {
        id: "a",
        region: "non_capital",
        acquisitionDate: "1995-06-15", // 피상속인 취득일(RI-1과 같은 시료) — 양도일 이후·신규 주택 후보로 읽히지 않게
        officialPrice: "150000000",
        isInherited: true,
        inheritedDate: "2024-05-15",
        isCoInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
        ...rowOver,
      },
    ],
  });
}

async function judge(page: Page) {
  const response = page.waitForResponse(
    (r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST",
  );
  await page.getByTestId("one-house-judge-cta").click();
  const res = await response;
  expect(res.ok(), `판정 API가 ${res.status()}로 응답했다`).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  return res.request().postDataJSON() as { houses?: Record<string, unknown>[] };
}

async function answer(page: Page, v: "separate" | "same" | "unknown") {
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  await page.getByTestId(`house-row-decedent-household-${v}`).check();
  await page.getByRole("button", { name: "완료" }).click();
}

test("[DH-1] 미답 — 라디오에 아무것도 선택돼 있지 않고, 판정은 모름과 같이 과세 + 확인 필요", async ({ page }) => {
  await seed(page);
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  for (const v of ["separate", "same", "unknown"]) {
    await expect(page.getByTestId(`house-row-decedent-household-${v}`)).not.toBeChecked();
  }
  await expect(page.getByTestId("house-row-decedent-household-hint")).toContainText("§71의2①");
  await page.getByRole("button", { name: "완료" }).click();
  const body = await judge(page);
  const row = body.houses?.find((h) => h.id === "a");
  expect(row).toMatchObject({ decedentHouseholdUnconfirmed: true });
  expect(row?.decedentSameHouseholdAtInheritance).toBeUndefined();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.getByText(/모르거나 답하지 않았습니다/).first()).toBeVisible();
});

test("[DH-2] 별도세대를 고르면 본문에 false로 실리고 비과세", async ({ page }) => {
  await seed(page);
  await answer(page, "separate");
  const body = await judge(page);
  const row = body.houses?.find((h) => h.id === "a");
  expect(row).toMatchObject({ decedentSameHouseholdAtInheritance: false });
  expect(row?.decedentHouseholdUnconfirmed).toBeUndefined();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
});

test("[DH-3] 동일세대를 고르면 true로 실리고 과세", async ({ page }) => {
  await seed(page);
  await answer(page, "same");
  const same = await judge(page);
  expect(same.houses?.find((h) => h.id === "a")).toMatchObject({ decedentSameHouseholdAtInheritance: true });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  await expect(page.getByText(/동일세대였습니다/).first()).toBeVisible();
});

test("[DH-4] 모름 — 별도세대로 답했던 행도 모름으로 바꾸면 boolean이 지워지고 미확인으로 실린다", async ({ page }) => {
  await seed(page, { decedentSameHouseholdAtInheritance: false });
  await answer(page, "unknown");
  const body = await judge(page);
  const row = body.houses?.find((h) => h.id === "a");
  expect(row).toMatchObject({ decedentHouseholdUnconfirmed: true });
  expect(row?.decedentSameHouseholdAtInheritance).toBeUndefined();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
});
