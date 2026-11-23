/**
 * 판정 메뉴 — 해석이 갈리는 쟁점(P4) → 두 입장의 결론 (브라우저 경로)
 *
 * 감지·재판정·배지·④⑫⑭는 anchor(`one-house-contested-dual-view.anchor.test.tsx`)와 해석례 평가셋이 고정한다. 여기서만
 * 관측되는 것은 **명부 행 편집 창의 입력이 판정 본문으로 실리고, 결과 화면이 두 결론과 「해석이 갈림」 배지를 그리는가**다.
 *
 * - CT-1(C1): 별도세대 부친에게서 상속받은 주택 지분을 배우자에게 증여한 세대가 일반주택 양도(서면-2015-부동산-1363 ↔
 *   조심-2023-서-10059). 일자는 현행 기준으로 옮겼다. 상속개시일은 양도일보다 3년 넘게 앞이다 — 3년 안이면 입장 A도 그 행을 §155① 신규 주택으로
 *   보아 비과세가 되어 갈리지 않는다(CT-1c · 2026-11 리뷰 D-79 C1 변형 · 서면인터넷방문상담4팀-3513).
 * - CT-2(C2): 동일세대 부친에게서 공동상속받은 주택 소수지분을 보유한 세대가 일반주택 양도(서면-2021-법규재산-0843 ↔
 *   조심-2023-중-7006).
 * - CT-3(C2 · 2026-11 리뷰 D-79): 엔진 입장에는 §155① 짝이 없고 반대 입장(B)에만 짝이 서는 세대(서울 · 동일세대 소수지분 2019 · 신규 주택 2020-06 ·
 *   2021-05 양도). B 짝의 §155①2호 세대전원 전입일 칸이 ③ 화면에 열리고, 미답이면 카드가 B 결론을 단정하지 않으며, 답하면 B 비과세로 갈린다.
 */
import { test, expect, type Page } from "@playwright/test";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";

const C1 = "155-2-inherited-house-gifted-within-household";
const C2 = "155-3-same-household-co-inherited-minority";

async function seed(page: Page, inheritedRow: Record<string, unknown>) {
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
        acquisitionDate: "1995-06-15",
        officialPrice: "150000000",
        isInherited: true,
        inheritedDate: "2024-05-15",
        isCoInherited: false,
        decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        ...inheritedRow,
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

// 입장 A는 증여한 행을 신규 주택 후보로 되돌려 취득 경위를 묻는다(⑧ — 「해석이 갈리는 쟁점의 다른 입장」) — 그 답을 함께 싣는다.
const C1_ROW = { acquisitionOrigin: "general" };

test("[CT-1] 상속주택 증여 칩 → 본문에 실리고 「해석이 갈림」 · 입장 A 과세 / 입장 B 비과세", async ({ page }) => {
  await seed(page, { ...C1_ROW, inheritedDate: "2023-05-15" });
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  await page.getByTestId("house-row-inherited-gifted-to-household-member").getByRole("switch").click();
  await page.getByRole("button", { name: "완료" }).click();
  const body = await judge(page);
  expect(body.houses?.find((h) => h.id === "a")).toMatchObject({ isInherited: true, inheritedGiftedToHouseholdMember: true });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("해석이 갈림");
  await expect(page.getByTestId(`one-house-contested-${C1}-A-verdict`)).toHaveText("과세");
  await expect(page.getByTestId(`one-house-contested-${C1}-B-verdict`)).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C1}-note`)).toContainText("입장 B에 따릅니다");
});

test("[CT-1c] 상속개시일이 양도일 3년 안 → 입장 A도 §155① 비과세 · 「두 입장의 결론이 같습니다」", async ({ page }) => {
  await seed(page, C1_ROW);
  await page.getByRole("button", { name: "주택 1 편집" }).click();
  await page.getByTestId("house-row-inherited-gifted-to-household-member").getByRole("switch").click();
  await page.getByRole("button", { name: "완료" }).click();
  const body = (await judge(page)) as { contestedGiftedInheritedTemporaryTwoHouse?: Record<string, unknown> };
  expect(body.contestedGiftedInheritedTemporaryTwoHouse).toMatchObject({ newHouseRowId: "a", newAcquisitionDate: "2024-05-15" });
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C1}-A-verdict`)).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C1}-B-verdict`)).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C1}-note`)).toHaveText("두 입장의 결론이 같습니다.");
});

test("[CT-1b] 짝 — 증여 칩 없이 상속주택이면 쟁점 카드 없이 비과세", async ({ page }) => {
  await seed(page, {});
  const body = await judge(page);
  expect(body.houses?.find((h) => h.id === "a")?.inheritedGiftedToHouseholdMember).toBeUndefined();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C1}`)).toHaveCount(0);
});

test("[CT-2] 동일세대 공동상속 소수지분 → 「해석이 갈림」 · 입장 A 과세 / 입장 B 비과세", async ({ page }) => {
  await seed(page, { isCoInherited: true, isLargestCoInheritedShareholder: false, decedentSameHouseholdAtInheritance: true });
  await judge(page);
  await expect(page.getByTestId("one-house-verdict")).toHaveText("해석이 갈림");
  await expect(page.getByTestId(`one-house-contested-${C2}-A-verdict`)).toHaveText("과세");
  await expect(page.getByTestId(`one-house-contested-${C2}-B-verdict`)).toHaveText("비과세");
  await expect(page.getByTestId(`one-house-contested-${C2}-note`)).toContainText("입장 A에 따릅니다");
});

const SEOUL = "1168010100";
const ROW = {
  region: "capital", regionCode: SEOUL, officialPrice: "300000000",
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
};
async function seedEra(page: Page) {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2021-05-01",
    contractTotalPrice: "500000000",
    wasRegulatedAtAcquisition: false,
    isRegulatedArea: true,
    assets: [{ assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: SEOUL, residenceInputMode: "direct", residencePeriodMonthsAsset: "48" }],
    houses: [
      {
        ...ROW, id: "m1", acquisitionDate: "2019-03-01", isInherited: true, inheritedDate: "2019-03-01",
        isCoInherited: true, isLargestCoInheritedShareholder: false, decedentSameHouseholdAtInheritance: true,
      },
      { ...ROW, id: "n", acquisitionDate: "2020-06-01", acquisitionOrigin: "general" },
    ],
  });
}

test("[CT-3a] 반대 입장에만 짝 → ③에 그 짝의 전입일 칸 · 미답이면 카드가 B 결론을 단정하지 않는다", async ({ page }) => {
  await seedEra(page);
  const block = page.getByTestId("contested-temp-two-house-era");
  await expect(block).toContainText("해석이 갈리는 쟁점의 다른 입장에서는 보유 주택 목록의 2번째 주택이");
  await expect(block.getByTestId("temp-two-house-move-in-date")).toBeVisible();
  await judge(page);
  await expect(page.getByTestId(`one-house-contested-${C2}-note`)).toContainText("반대 입장으로 다시 판정하면 확인이 필요한 사실이 남아");
  await expect(page.getByTestId(`one-house-contested-${C2}-note`)).not.toHaveText("두 입장의 결론이 같습니다.");
});

test("[CT-3b] 같은 칸에 전입일을 답하면 본문 반대 입장 짝에 실리고 → 입장 B 비과세 · 「해석이 갈림」", async ({ page }) => {
  await seedEra(page);
  const moveIn = page.getByTestId("contested-temp-two-house-era").getByTestId("temp-two-house-move-in-date");
  await moveIn.getByRole("textbox", { name: "연도" }).fill("2021");
  await moveIn.getByRole("textbox", { name: "월" }).fill("1");
  await moveIn.getByRole("textbox", { name: "일" }).fill("10");
  await expect(moveIn.getByRole("textbox", { name: "일" })).toHaveValue("10");
  const body = (await judge(page)) as { contestedTemporaryTwoHouse?: Record<string, unknown> };
  expect(body.contestedTemporaryTwoHouse).toMatchObject({ newHouseRowId: "n", wholeHouseholdMoveInDate: "2021-01-10" });
  await expect(page.getByTestId(`one-house-contested-${C2}-B-verdict`)).toHaveText("비과세");
  await expect(page.getByTestId("one-house-verdict")).toHaveText("해석이 갈림");
});
