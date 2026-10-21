/**
 * comprehensive-property-card-dongho.spec.ts
 *
 * 종부세 주택 카드는 저장한 동·호를 `AddressSearch`에 넘기지 않고 상세주소만 합성해 넘겼다. 카드 모달을 닫았다 열면
 * (다시 마운트) 동·호 목록이 사라지고, 상세주소를 고치면 띄어쓰기 파싱이 동·호를 **모두** 비우는 경우가 있었다
 * (칸 비움·단동에서 숫자만·단동 끝 글자 지움). 그 뒤 「공시가격 조회」가 임의 세대 가격을 「조회 성공」으로 채웠다.
 * 계획서 `docs/00-pm/comprehensive-property-card-dongho.plan.md` R1(Q-1 a)
 * 상세주소 칸 숨김: `docs/00-pm/comprehensive-property-card-detail-hide.plan.md` R1·R2(Q-1 a) — H-1·H-2
 *
 * 공시가격 mock은 `route.ts` `pickUnit` 규칙을 따른다 — 동·호가 없으면 임의 세대, 지정했는데 없으면 「없음」,
 * 끝의 「동」·「호」는 떼고 비교. 임의 세대는 고른 세대와 겹치지 않게 골랐다.
 *
 * 실행: E2E_PORT=3111 npx playwright test e2e/comprehensive-property-card-dongho.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const JIBUN = "서울 강남구 대치동 316";
type Unit = { dong: string; ho: string; floor: string; price: number; year: string };
const MULTI: Unit[] = [
  { dong: "101동", ho: "501", floor: "5", price: 900000000, year: "2024" },
  { dong: "101동", ho: "502", floor: "5", price: 800000000, year: "2024" },
  { dong: "102동", ho: "501", floor: "5", price: 700000000, year: "2024" },
];
/** 고를 세대가 없는 주소(개별주택처럼 동·호가 빈 행) */
const DETACHED: Unit[] = [{ dong: "", ho: "", floor: "", price: 300000000, year: "2024" }];
const SINGLE: Unit[] = [
  { dong: "", ho: "1203", floor: "12", price: 600000000, year: "2024" },
  { dong: "", ho: "1204", floor: "12", price: 500000000, year: "2024" },
  { dong: "", ho: "1205", floor: "12", price: 400000000, year: "2024" },
];
const strip = (s: string | null, suf: string) => (s ?? "").replace(new RegExp(`${suf}$`), "").trim();

/** `listFails`가 켜지면 세대 목록 조회(동·호 없는 요청)만 502로 실패한다 */
async function mock(page: Page, units: Unit[]) {
  const st = { listFails: false, requests: [] as string[], listCalls: 0 };
  await page.route("**/api/address/search*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", (r) => {
    const u = new URL(r.request().url());
    const dong = u.searchParams.get("dong");
    const ho = u.searchParams.get("ho");
    st.requests.push(`dong=${dong} ho=${ho}`);
    if (!dong && !ho) {
      st.listCalls++;
      if (st.listFails)
        return r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "NED_FETCH_FAILED", message: "x" } }) });
    }
    let hit: Unit | undefined;
    if (dong || ho) {
      hit = units.find((x) => (!dong || strip(x.dong, "동") === strip(dong, "동")) && (!ho || strip(x.ho, "호") === strip(ho, "호")));
      if (!hit)
        return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "PRICE_NOT_FOUND", message: "해당 세대 없음" } }) });
    } else hit = units[units.length - 1];
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ units, price: hit.price, priceType: "apart_housing_price", year: "2024", message: "조회 성공" }),
    });
  });
  return st;
}

const dialog = (page: Page) => page.getByTestId("property-edit-dialog");
const dongField = (page: Page) => dialog(page).getByPlaceholder("동", { exact: true });
const hoField = (page: Page) => dialog(page).getByPlaceholder("호", { exact: true });
const detailField = (page: Page) => dialog(page).getByPlaceholder(/상세주소/);

async function openCard(page: Page) {
  await page.locator('[data-testid^="property-table-row-"]').first().click();
  await expect(dialog(page)).toBeVisible();
}
async function reopenCard(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(dialog(page)).toBeHidden();
  await openCard(page);
}

/** 2단계 주택 카드에서 소재지를 고르고, `pick`이 있으면 세대를 고른다 */
async function selectAddress(page: Page, pick?: { dong?: string; ho: string }) {
  await page.goto("/calc/comprehensive-tax");
  await page.getByRole("radio", { name: "2024" }).check();
  await page.getByRole("button", { name: /^다음/ }).click();
  await openCard(page);
  const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
  await input.fill(JIBUN);
  await input.press("Enter");
  await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
  if (!pick) {
    await expect(dongField(page)).toBeVisible(); // 소재지가 저장돼 별도 동·호 칸이 열렸다
    await page.waitForTimeout(300); // 세대 목록 조회가 끝나기를 기다린다
    return;
  }
  if (pick.dong) {
    await dialog(page).getByText("동 선택").first().click();
    await page.getByRole("option", { name: pick.dong }).click();
  }
  await dialog(page).getByText("호수 선택").first().click();
  await page.getByRole("option", { name: pick.ho, exact: true }).click();
}

/** 「공시가격 조회」(당해) — 나간 요청과 결과 문구 */
async function lookup(page: Page, st: { requests: string[] }) {
  st.requests.length = 0;
  await dialog(page).getByRole("button", { name: "공시가격 조회" }).first().click();
  await expect(dialog(page).getByText(/조회 성공|해당 세대 없음/).first()).toBeVisible();
  return { requests: [...st.requests], text: await dialog(page).getByText(/조회 성공|해당 세대 없음/).first().innerText() };
}

test.describe("종부세 주택 카드 — 다시 열어도 고른 동·호가 남는다", () => {
  test("K-1: 다동 101동 501 → 모달 닫았다 열면 목록이 고른 세대와 함께 돌아오고, 조회가 그 세대다", async ({ page }) => {
    const st = await mock(page, MULTI);
    await selectAddress(page, { dong: "101동", ho: "501" });
    await reopenCard(page);
    await expect(dialog(page).getByRole("combobox").filter({ hasText: "501" }).first()).toBeVisible();
    await expect(detailField(page)).toHaveCount(0);
    const r = await lookup(page, st);
    expect(r.requests).toEqual(["dong=101동 ho=501"]);
    expect(r.text).toContain("900,000,000");
  });

  test("K-2: 단동 1203 → 모달 닫았다 열면 목록에 1203이 보이고, 조회가 그 세대다", async ({ page }) => {
    const st = await mock(page, SINGLE);
    await selectAddress(page, { ho: "1203" });
    await reopenCard(page);
    await expect(dialog(page).getByRole("combobox").filter({ hasText: "1203" }).first()).toBeVisible();
    await expect(detailField(page)).toHaveCount(0);
    const r = await lookup(page, st);
    expect(r.requests).toEqual(["dong=null ho=1203"]);
    expect(r.text).toContain("600,000,000");
  });

  test("H-2: 목록을 다시 못 불러와도 상세주소 칸이 없고, 저장된 동·호가 그대로이며 조회가 고른 세대다", async ({ page }) => {
    const st = await mock(page, MULTI);
    await selectAddress(page, { dong: "101동", ho: "501" });
    st.listFails = true;
    await reopenCard(page);
    await expect.poll(() => st.listCalls).toBeGreaterThan(1); // 다시 불러오려다 실패했다
    await expect(dialog(page).getByText("동/호수 조회 중...")).toHaveCount(0); // 실패가 반영된 뒤에 본다(조회 중엔 칸이 원래 없다)
    await expect(detailField(page)).toHaveCount(0);
    await expect(dongField(page)).toHaveValue("101동");
    await expect(hoField(page)).toHaveValue("501");
    const r = await lookup(page, st);
    expect(r.requests).toEqual(["dong=101동 ho=501"]);
    expect(r.text).toContain("900,000,000");
  });

  test("K-4: 목록을 다시 못 불러오면 별도 「호수」 칸에서 고친다", async ({ page }) => {
    const st = await mock(page, SINGLE);
    await selectAddress(page, { ho: "1203" });
    st.listFails = true;
    await reopenCard(page);
    await hoField(page).fill("1204");
    const r = await lookup(page, st);
    expect(r.requests).toEqual(["dong=null ho=1204"]);
    expect(r.text).toContain("500,000,000");
  });

  test("K-5 반례: 세대를 고르지 않은 주소는 다시 열어도 목록을 다시 부르지 않는다", async ({ page }) => {
    const st = await mock(page, MULTI);
    await selectAddress(page);
    const before = st.listCalls;
    await reopenCard(page);
    await expect(dongField(page)).toBeVisible();
    await page.waitForTimeout(500);
    expect(st.listCalls).toBe(before);
    await expect(detailField(page)).toHaveCount(0);
  });

  test("H-1: 세대가 없는 주소는 상세주소 칸이 없고, 별도 「동」·「호수」 칸에 한 글자씩 친 값이 그대로 남는다", async ({ page }) => {
    // 종전엔 상세주소 칸이 저장된 동·호의 합성이라, 한 글자씩 치면 「동」·「호」 앞 숫자가 사라지고
    // 동이 저장된 뒤엔 칸이 「동」에서 멈췄다(계획서 comprehensive-property-card-detail-hide.plan.md §0)
    const st = await mock(page, DETACHED);
    await selectAddress(page);
    await expect(detailField(page)).toHaveCount(0);
    await dongField(page).pressSequentially("101동");
    await hoField(page).pressSequentially("501");
    await expect(dongField(page)).toHaveValue("101동");
    await expect(hoField(page)).toHaveValue("501");
    const r = await lookup(page, st);
    expect(r.requests).toEqual(["dong=101동 ho=501"]);
  });
});
