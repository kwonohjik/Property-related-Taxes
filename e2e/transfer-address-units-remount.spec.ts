/**
 * transfer-address-units-remount.spec.ts
 *
 * 공동주택 소재지의 동·호 목록은 `AddressSearch` 로컬 상태라, 1단계가 다시 마운트되면(새로고침·단계 탭 왕복)
 * 목록이 사라졌다. 그런데 `hasAddressUnits=true`는 store에 남아 「동·호를 선택하세요」로 막혔고,
 * 대신 뜨는 상세주소 칸에 입력하면 이미 고른 동·호가 지워졌다.
 * 계획서 `docs/00-pm/transfer-address-units-remount.plan.md` (Q-1~Q-3 a)
 *
 * 세대 조회(`/api/address/standard-price`)는 `mode`로 응답을 바꾼다.
 *
 * 실행: E2E_PORT=3101 npx playwright test e2e/transfer-address-units-remount.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const JIBUN = "서울 강남구 대치동 316";
const UNITS = [
  { dong: "101동", ho: "501", floor: "5", price: 900000000, year: "2026" },
  { dong: "101동", ho: "502", floor: "5", price: 900000000, year: "2026" },
];
const DETACHED = [{ dong: "", ho: "", floor: "", price: 17900000, year: "2026" }];

type Mode = "units" | "detached" | "fail" | "none" | "hold";

async function mock(page: Page, initial: Mode) {
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const st = { mode: initial as Mode, calls: 0, release: () => release() };
  await page.route("**/api/address/search*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
  await page.route("**/api/address/standard-price*", async (r) => {
    st.calls++;
    if (st.mode === "hold") await held;
    if (st.mode === "fail")
      return r.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "NED_FETCH_FAILED", message: "x" } }) });
    if (st.mode === "none")
      return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "PRICE_NOT_FOUND", message: "x" } }) });
    const units = st.mode === "detached" ? DETACHED : UNITS;
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units }) });
  });
  return st;
}

async function open(page: Page) {
  await page.goto("/calc/transfer-tax?new=1");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("06");
  await page.getByTestId("transfer-date").getByLabel("일").fill("03");
  await expandAssetSection(page, 1);
}

async function pickAddress(page: Page) {
  const input = page.getByPlaceholder("도로명 또는 지번 주소 입력").first();
  await input.fill(JIBUN);
  await input.press("Enter");
  await page.getByRole("button", { name: new RegExp(`「${JIBUN}」`) }).first().click();
}

async function reload(page: Page) {
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 1).catch(() => {});
}

async function primary(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    const a = raw ? JSON.parse(raw)?.state?.formData?.assets?.[0] : null;
    return { hasAddressUnits: a?.hasAddressUnits, dong: a?.addressDong, ho: a?.addressHo };
  });
}

async function pickUnit(page: Page) {
  await page.getByText("동 선택").first().click();
  await page.getByRole("option", { name: "101동" }).click();
  await page.getByText("호수 선택").first().click();
  await page.getByRole("option", { name: "501" }).click();
}

/** 「다음」을 눌러 동·호 오류가 뜨는지만 본다(다른 필수 입력 누락은 이 spec의 관심이 아니다) */
async function unitErrorAfterNext(page: Page) {
  await page.getByRole("button", { name: "다음" }).click();
  await page.waitForTimeout(300);
  return page.getByText(/동·호를 선택하세요/).count();
}

const NOTICE = /동·호 목록을 불러오지 못했습니다/;

test.describe("소재지 동·호 목록 — 다시 마운트돼도 되살린다", () => {
  test("U-1: 새로고침해도 동·호 목록이 다시 보이고, 골라서 동·호 게이트를 통과한다", async ({ page }) => {
    await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await expect(page.getByText("동 선택").first()).toBeVisible();

    await reload(page);
    await expect(page.getByText("동 선택").first()).toBeVisible();
    await pickUnit(page);
    expect(await primary(page)).toMatchObject({ hasAddressUnits: true, dong: "101동", ho: "501" });
    expect(await unitErrorAfterNext(page)).toBe(0);
  });

  test("U-2: 단계 탭으로 다른 단계에 갔다 와도 동·호 목록이 다시 보인다", async ({ page }) => {
    await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await expect(page.getByText("동 선택").first()).toBeVisible();

    await page.getByRole("button", { name: "보유 상황" }).first().click();
    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await expandAssetSection(page, 1).catch(() => {});
    await expect(page.getByText("동 선택").first()).toBeVisible();
  });

  test("U-3: 세대 조회가 다른 단계에서 끝나도 돌아오면 동·호 목록이 있다", async ({ page }) => {
    const st = await mock(page, "hold");
    await open(page);
    await pickAddress(page);
    await page.getByRole("button", { name: "보유 상황" }).first().click();
    st.mode = "units";
    st.release();
    await expect.poll(() => primary(page).then((p) => p.hasAddressUnits)).toBe(true);

    await page.getByRole("button", { name: "자산 목록" }).first().click();
    await expandAssetSection(page, 1).catch(() => {});
    await expect(page.getByText("동 선택").first()).toBeVisible();
  });

  test("U-4: 고른 동·호가 있으면 다시 불러온 목록에 그 선택이 보인다", async ({ page }) => {
    await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await pickUnit(page);

    await reload(page);
    await expect(page.getByText("호수 선택")).toHaveCount(0); // 빈 선택이 아니라 고른 호가 보인다
    await expect(page.getByRole("combobox").filter({ hasText: "501" }).first()).toBeVisible();
    expect(await primary(page)).toMatchObject({ dong: "101동", ho: "501" });
  });

  test("U-5: 다시 불러오다 실패하면 동·호 요구를 유지하고 안내를 띄운다(Q-2 a·Q-3 a)", async ({ page }) => {
    const st = await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await expect(page.getByText("동 선택").first()).toBeVisible();

    st.mode = "fail";
    await reload(page);
    await expect(page.getByText(NOTICE).first()).toBeVisible();
    expect((await primary(page)).hasAddressUnits).toBe(true);
    expect(await unitErrorAfterNext(page)).toBeGreaterThan(0);
  });

  test("U-6: 목록을 못 불러온 채 상세주소를 고쳐도 이미 고른 동·호가 지워지지 않는다", async ({ page }) => {
    const st = await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await pickUnit(page);

    st.mode = "fail";
    await reload(page);
    await expect(page.getByText(NOTICE).first()).toBeVisible();
    await page.getByPlaceholder(/상세주소/).first().fill("101동 501호");
    await page.waitForTimeout(300);
    expect(await primary(page)).toMatchObject({ hasAddressUnits: true, dong: "101동", ho: "501" });
    expect(await unitErrorAfterNext(page)).toBe(0);
  });

  test("U-7: 다시 불러온 결과가 「세대 없음」으로 확정되면 동·호 요구를 푼다", async ({ page }) => {
    const st = await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await expect(page.getByText("동 선택").first()).toBeVisible();

    st.mode = "none";
    await reload(page);
    await expect.poll(() => primary(page).then((p) => p.hasAddressUnits)).toBe(false);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
    expect(await unitErrorAfterNext(page)).toBe(0);
  });

  test("U-8 반례: 세대가 없던 주소(단독주택)는 새로고침해도 세대 조회를 다시 부르지 않는다", async ({ page }) => {
    const st = await mock(page, "detached");
    await open(page);
    await pickAddress(page);
    await expect(page.getByPlaceholder(/상세주소/).first()).toBeVisible();
    expect((await primary(page)).hasAddressUnits).toBe(false);
    const before = st.calls;

    await reload(page);
    await page.waitForTimeout(800);
    expect(st.calls).toBe(before);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
  });

  test("U-9 반례: 다시 불러온 결과가 같으면 폼을 저장하지 않는다(결과 무효화 경로를 타지 않는다)", async ({ page }) => {
    // 폼 저장 횟수 = sessionStorage 쓰기 횟수(zustand persist는 상태가 바뀔 때마다 쓴다)
    await page.addInitScript(() => {
      const w = window as unknown as { __wizardWrites: number };
      w.__wizardWrites = 0;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === "transfer-tax-wizard") w.__wizardWrites++;
        return orig.call(this, k, v);
      };
    });
    const st = await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await expect(page.getByText("동 선택").first()).toBeVisible();

    st.mode = "hold";
    await reload(page);
    await page.waitForTimeout(800); // 마운트 직후의 다른 저장이 끝나기를 기다린다
    const writes = () => page.evaluate(() => (window as unknown as { __wizardWrites: number }).__wizardWrites);
    const before = await writes();
    st.mode = "units";
    st.release();
    await expect(page.getByText("동 선택").first()).toBeVisible();
    await page.waitForTimeout(500);
    expect(await writes()).toBe(before);
  });

  test("U-10 반례: 「세대 없음」으로 확정된 뒤 남은 동·호로 다시 불러와도 같은 판정을 또 저장하지 않는다", async ({ page }) => {
    // 동·호가 남아 있으면 판정과 무관하게 목록을 다시 불러온다(계획서 address-dongho-other-calcs-and-multi-gate.plan.md R2).
    // 그 결과가 또 「없음」이어도 저장된 판정이 이미 false이므로 저장하지 않는다 — 같은 값 저장도 결과를 지운다.
    await page.addInitScript(() => {
      const w = window as unknown as { __wizardWrites: number };
      w.__wizardWrites = 0;
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === "transfer-tax-wizard") w.__wizardWrites++;
        return orig.call(this, k, v);
      };
    });
    const st = await mock(page, "units");
    await open(page);
    await pickAddress(page);
    await pickUnit(page);

    st.mode = "none";
    await reload(page);
    await expect.poll(() => primary(page).then((p) => p.hasAddressUnits)).toBe(false);
    expect(await primary(page)).toMatchObject({ dong: "101동", ho: "501" });

    // 재조회 응답을 붙잡아 두고 저장 횟수를 잰 뒤 「없음」으로 풀어 준다(U-9와 같은 방식)
    st.mode = "hold";
    const callsBefore = st.calls;
    await reload(page);
    await expect.poll(() => st.calls).toBeGreaterThan(callsBefore); // 남은 동·호로 다시 불러왔다
    await page.waitForTimeout(800); // 마운트 직후의 다른 저장이 끝나기를 기다린다
    const writes = () => page.evaluate(() => (window as unknown as { __wizardWrites: number }).__wizardWrites);
    const before = await writes();
    st.mode = "none";
    st.release();
    await expect(page.getByPlaceholder(/상세주소/).first()).toBeVisible(); // 응답이 반영됐다(「동/호수 조회 중...」 → 상세주소 칸)
    await page.waitForTimeout(500);
    expect(await writes()).toBe(before);
    expect((await primary(page)).hasAddressUnits).toBe(false);
  });
});
