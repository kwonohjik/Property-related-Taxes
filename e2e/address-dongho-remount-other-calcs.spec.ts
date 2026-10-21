/**
 * address-dongho-remount-other-calcs.spec.ts
 *
 * 취득세·재산세 1단계의 동·호는 `AddressSearch`에 다시 넘겨지지 않았다. 단계를 오가 1단계가 다시 마운트되면
 * 동·호 목록이 사라지고 상세주소 칸만 남는데, 그 칸에 입력하면 저장된 동·호가 `""`로 지워져
 * 「공시가격 조회」가 **다른 세대 가격**을 「조회 성공」으로 채웠다(공시가격 API는 동·호가 없으면 임의 세대를 고른다).
 * 계획서 `docs/00-pm/address-dongho-other-calcs-and-multi-gate.plan.md` A(R1·R2, Q-1 a)
 * 그 뒤 상세주소 칸은 저장할 필드가 없어 그리지 않는다 — `docs/00-pm/address-detail-dead-input.plan.md` R2(D-2·D-3 갱신)
 *
 * 공시가격 API는 `mode`로 응답을 바꾼다. 동·호가 없는 조회는 일부러 다른 세대(502호·7억)를 돌려준다.
 *
 * 실행: E2E_PORT=3109 npx playwright test e2e/address-dongho-remount-other-calcs.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

const JIBUN = "서울 강남구 대치동 316";
const UNITS = [
  { dong: "101동", ho: "501", floor: "5", price: 900000000, year: "2026" },
  { dong: "101동", ho: "502", floor: "5", price: 700000000, year: "2026" },
];
const DETACHED = [{ dong: "", ho: "", floor: "", price: 300000000, year: "2026" }];

type Mode = "units" | "fail" | "detached";

async function mock(page: Page, initial: Mode) {
  const st = { mode: initial as Mode, calls: [] as string[] };
  await page.route("**/api/address/search*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", (r) => {
    const u = new URL(r.request().url());
    const dong = u.searchParams.get("dong");
    const ho = u.searchParams.get("ho");
    st.calls.push(`dong=${dong} ho=${ho}`);
    if (st.mode === "fail")
      return r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "NED_FETCH_FAILED", message: "x" } }) });
    const units = st.mode === "detached" ? DETACHED : UNITS;
    const hit = dong || ho ? units.find((x) => x.dong === dong && x.ho === ho) : units[units.length - 1];
    return r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ units, price: hit?.price ?? 0, priceType: "apart_housing_price", year: "2026", message: "조회 성공" }),
    });
  });
  return st;
}

async function pickAddress(page: Page) {
  const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
  await input.fill(JIBUN);
  await input.press("Enter");
  await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
}

async function pickUnit(page: Page) {
  await page.getByText("동 선택").first().click();
  await page.getByRole("option", { name: "101동" }).click();
  await page.getByText("호수 선택").first().click();
  await page.getByRole("option", { name: "501" }).click();
}

/** 「공시가격 조회」를 눌러 나간 요청들과 결과 문구 */
async function lookup(page: Page, st: { calls: string[] }) {
  st.calls.length = 0;
  await page.getByRole("button", { name: "공시가격 조회" }).first().click();
  await expect(page.getByText(/조회 성공/).first()).toBeVisible();
  return { calls: [...st.calls], text: await page.getByText(/조회 성공/).first().innerText() };
}

const CALCS = [
  {
    name: "취득세",
    url: "/calc/acquisition-tax",
    // 1단계 필수(취득가액)를 채우고 2단계로 갔다가 돌아온다. 공시가격 조회는 2단계에 있다.
    async leaveAndReturn(page: Page) {
      await page.getByRole("textbox", { name: "취득가액 (실거래가)" }).fill("900000000");
      await page.getByRole("button", { name: "다음" }).first().click();
      await expect(page.getByRole("button", { name: "공시가격 조회" })).toBeVisible();
      await page.getByRole("button", { name: "이전" }).first().click();
    },
    async gotoLookup(page: Page) {
      await page.getByRole("button", { name: "다음" }).first().click();
    },
  },
  {
    name: "재산세",
    url: "/calc/property-tax",
    // 공시가격 조회가 1단계에 있다 — 1단계 필수(공시가격)를 손으로 채우고 다음 단계로 갔다가 돌아온다.
    async leaveAndReturn(page: Page) {
      await page.getByRole("textbox", { name: "금액 입력", exact: true }).first().fill("100000000");
      await page.getByRole("button", { name: "다음" }).first().click();
      await expect(page.getByPlaceholder("도로명 또는 지번 주소 입력")).toHaveCount(0);
      await page.getByRole("button", { name: "이전" }).first().click();
    },
    async gotoLookup() {},
  },
];

for (const c of CALCS) {
  test.describe(`${c.name} 1단계 — 다시 마운트돼도 고른 동·호가 남는다`, () => {
    test(`${c.name} D-1: 단계를 오가면 동·호 목록이 고른 세대와 함께 다시 보이고, 조회가 그 세대 가격이다(R2)`, async ({ page }) => {
      const st = await mock(page, "units");
      await page.goto(c.url);
      await pickAddress(page);
      await pickUnit(page);
      await c.leaveAndReturn(page);
      await expect(page.getByRole("combobox").filter({ hasText: "501" }).first()).toBeVisible();
      await expect(page.getByPlaceholder(/상세주소/)).toHaveCount(0);
      await c.gotoLookup(page);
      const r = await lookup(page, st);
      expect(r.calls.every((x) => x === "dong=101동 ho=501")).toBe(true);
      expect(r.text).toContain("900,000,000");
    });

    test(`${c.name} D-2: 목록을 다시 불러오지 못해도 상세주소 칸이 없고 동·호가 지워지지 않는다(R1)`, async ({ page }) => {
      const st = await mock(page, "units");
      await page.goto(c.url);
      await pickAddress(page);
      await pickUnit(page);
      st.mode = "fail";
      await c.leaveAndReturn(page);
      // 상세주소는 저장할 필드가 없어 칸을 그리지 않는다(address-detail-dead-input.plan.md R2). 종전에는 칸이 보였지만
      // 무엇을 쳐도 남지 않았다. 재조회가 끝난 뒤에 본다 — 조회 중에는 원래 칸이 없다.
      await expect(page.getByText("동/호수 조회 중...")).toHaveCount(0);
      await expect(page.getByPlaceholder(/상세주소/)).toHaveCount(0);
      st.mode = "units";
      await c.gotoLookup(page);
      const r = await lookup(page, st);
      expect(r.calls.length).toBeGreaterThan(0);
      expect(r.calls.every((x) => x === "dong=101동 ho=501")).toBe(true);
      expect(r.text).toContain("900,000,000");
    });

    test(`${c.name} D-3 반례: 세대가 없는 주소(단독주택)는 돌아와도 세대 조회를 다시 부르지 않고, 상세주소 칸도 없다`, async ({ page }) => {
      const st = await mock(page, "detached");
      await page.goto(c.url);
      await pickAddress(page);
      await expect.poll(() => st.calls.length).toBeGreaterThan(0);
      await expect(page.getByText("동/호수 조회 중...")).toHaveCount(0);
      // 저장하지 않는 칸이라 그리지 않는다(address-detail-dead-input.plan.md R2)
      await expect(page.getByPlaceholder(/상세주소/)).toHaveCount(0);
      const before = st.calls.length;
      await c.leaveAndReturn(page);
      await expect(page.getByText("지번", { exact: true }).first()).toBeVisible();
      await page.waitForTimeout(500);
      expect(st.calls.length).toBe(before);
      await expect(page.getByPlaceholder(/상세주소/)).toHaveCount(0);
    });
  });
}
