/**
 * E2E: FieldCard 오른쪽 배지(`trailing`)가 카드 밖으로 나가던 결함 — 회귀.
 *
 * 카드 루트는 모바일에서 단일 열 grid다. 본문(grid 항목)에 `min-w-0`이 없으면 최소 폭이 콘텐츠 폭이 되어
 * 본문이 카드보다 넓어지고 배지가 카드 밖으로 나갔다(375에서 31~89px, 320에서 페이지 가로 스크롤).
 * trailing이 있으면 입력의 최소 폭과 한 줄에 안 들어갈 때만 배지를 다음 줄로 내린다 —
 * 본문 `min-w-0`만 넣으면 줄지 않는 입력(Select·날짜)이 짓눌려 글자가 배지 위로 겹친다.
 * 줄어드는 입력칸은 그대로 한 줄이어야 한다(넘치지 않던 카드를 바꾸지 않는다).
 * 계획서: docs/00-pm/fieldcard-trailing-overflow-and-dark-contrast.plan.md §A
 *
 * 실행: E2E_PORT=3178 npx playwright test e2e/fieldcard-trailing-overflow.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 상속 토지 — 1987은 의제취득일 이후(평가방법 Select 칸), 1980은 이전(상속세 신고가액 입력칸) */
function seedForm(extra: Record<string, unknown>) {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1",
            assetKind: "land",
            landNature: "standalone",
            assetLabel: "상속 토지",
            acquisitionCause: "inheritance",
            decedentAcquisitionDate: "1975-03-01",
            inheritanceAssetKind: "land",
            acquisitionArea: "1000",
            actualSalePrice: "500000000",
            ...extra,
          },
        ],
        transferDate: "2025-06-01",
        houses: [],
        presaleRights: [],
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function open(page: Page, width: number, extra: Record<string, unknown>) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(extra),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
}

/** 라벨로 FieldCard를 찾아 카드 안쪽·입력 자리·배지·입력 글자의 사각형을 잰다 */
async function measureCard(page: Page, label: RegExp) {
  const card = page.locator("[data-slot=field-card]").filter({ has: page.locator("label", { hasText: label }) }).first();
  await card.waitFor();
  return card.evaluate((c) => {
    const body = c.querySelector(":scope > div.space-y-1\\.5")!;
    const line = body.firstElementChild!;
    const child = line.children[0];
    const trailing = line.children[1];
    const cs = getComputedStyle(c);
    const contentRight = c.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    const box = (r: DOMRect) => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    // 입력 자리 안에서 글자를 직접 가진 요소들의 글자 사각형
    const texts = [child, ...child.querySelectorAll("*")]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()))
      .map((e) => { const r = document.createRange(); r.selectNodeContents(e); return box(r.getBoundingClientRect()); });
    return {
      contentRight,
      line: box(line.getBoundingClientRect()),
      child: box(child.getBoundingClientRect()),
      trailing: box(trailing.getBoundingClientRect()),
      texts,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
}

type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const SELECT_LABEL = /상속세 신고 시 평가방법/;
const INPUT_LABEL = /상속세 신고가액 \(상증법 평가액\)/;
const POST = { acquisitionDate: "1987-05-01", inheritanceStartDate: "1987-05-01", publishedValueAtInheritance: "50000000" };
const PRE = { acquisitionDate: "1980-05-01", inheritanceStartDate: "1980-05-01" };

for (const [state, method] of [["선택 전", ""], ["보충적평가액 선택", "supplementary"]] as const) {
  test(`375px Select 칸(${state}) — 배지가 카드 안, 글자와 겹치지 않음`, async ({ page }) => {
    await open(page, 375, { ...POST, inheritanceValuationMethod: method });
    const m = await measureCard(page, SELECT_LABEL);
    expect(m.line.right, "줄이 카드 밖으로 나갔다").toBeLessThanOrEqual(m.contentRight + 0.5);
    expect(m.trailing.right, "배지가 카드 밖으로 나갔다").toBeLessThanOrEqual(m.contentRight + 0.5);
    for (const t of m.texts) expect(overlaps(t, m.trailing), "Select 글자가 배지와 겹친다").toBe(false);
  });
}

test("320px 입력칸 — 배지가 카드 안, 글자와 겹치지 않음", async ({ page }) => {
  await open(page, 320, PRE);
  const m = await measureCard(page, INPUT_LABEL);
  expect(m.trailing.right, "배지가 카드 밖으로 나갔다").toBeLessThanOrEqual(m.contentRight + 0.5);
  for (const t of m.texts) expect(overlaps(t, m.trailing), "입력 글자가 배지와 겹친다").toBe(false);
});

for (const [name, label] of [["상속세 신고가액", INPUT_LABEL], ["의제취득일 시점 기준시가", /의제취득일\(1985\.1\.1\.\) 시점 기준시가/]] as const) {
  test(`375px 입력칸(${name}) — 넘치지 않던 카드는 배지가 같은 줄 그대로`, async ({ page }) => {
    await open(page, 375, PRE);
    const m = await measureCard(page, label);
    expect(m.trailing.right).toBeLessThanOrEqual(m.contentRight + 0.5);
    expect(m.trailing.top, "줄어드는 입력칸인데 배지가 다음 줄로 내려갔다").toBeLessThan(m.child.bottom);
  });
}

test("1280px — Select 칸 배지는 입력과 같은 줄", async ({ page }) => {
  await open(page, 1280, { ...POST, inheritanceValuationMethod: "supplementary" });
  const m = await measureCard(page, SELECT_LABEL);
  expect(m.trailing.top).toBeLessThan(m.child.bottom);
  expect(m.scrollWidth).toBe(m.innerWidth);
});
