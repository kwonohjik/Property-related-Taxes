/**
 * 재산세 별도합산 — 철거ㆍ멸실 부속토지 한시 특례 «사실 칸»(허가·건축 외 용도·빈집정비·공용 사용) E2E (PSA-U1)
 *
 * 세액 오라클: docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §7 K-표(엔진 직접 호출 실측과 같은 값 — 총 납부세액 = 본세 × 1.2).
 *   건축물 300㎡ 상업(공시가격 3억 · 바닥 100 → 기준면적 300㎡) / 주택 400㎡(공시가격 4억 · 바닥면적 입력 없음)
 *   K-1  철거 올해 1.1. · 허가 예 · 건축 외 아니오        → 516,000 (별도합산 430,000)
 *   K-2  허가 아니오                                       → 960,000 (전량 종합합산 이관 800,000)
 *   K-15 주택 · 올해 1.1. · 요건 충족                      → 768,000 (400㎡ 전부 별도합산 — 면적 한도 없음)
 *   K-16 주택 · 2년 전 6.15. · 빈집정비 예                 → 768,000 (3년 안)
 *   K-17 〃 · 빈집정비 아니오                              → 1,380,000 (1년 경과 → 이관 1,150,000)
 *   K-19 〃 · 빈집 예 · 건축 외 예 · 공용 예 · 유료 예     → 768,000 (단서 포함)
 *   K-20 〃 · 유료 아니오                                  → 1,380,000 + 비과세 가능성 고지
 * 요청 body에는 «화면이 요구한 칸»만 실린다(숨은 stale 값 미전송). 실행: E2E_PORT=3172 npx playwright test e2e/property-separate-demolished-requirements.spec.ts
 */
import { test, expect } from "@playwright/test";
import {
  YEAR,
  calc,
  captureBody,
  exact,
  fillDemolishedDate,
  fillSeparateDetail,
  fillSplitInputsZero,
  pickLandType,
  startLand,
  totalPayable,
} from "./_helpers/property-land";

const BUILDING = { zoning: /상업지역/, area: "300", floor: "100" } as const;
const HOUSE = { zoning: /상업지역/, area: "400" } as const;

async function toDetail(page: import("@playwright/test").Page, priceWon: string) {
  await startLand(page, priceWon);
  await pickLandType(page, /별도합산과세대상/);
}

const item = (box: { bodies: Record<string, unknown>[] }) => box.bodies[0].separateAggregateItem as Record<string, unknown>;

test.describe("재산세 별도합산 철거 사실 칸 (PSA-U1)", () => {
  test("K-1 건축물 · 요건 충족 → 516,000 · 판정 «별도합산 유지» · body에 종류·허가·건축 외만", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "300000000");
    await fillSeparateDetail(page, { ...BUILDING, demolished: { date: `${YEAR}-01-01`, kind: "building", permit: "yes", otherUse: "no" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("516,000"));
    await expect(page.getByTestId("land-split-demolished-outcome")).toContainText("별도합산 유지");
    await expect(page.getByTestId("land-split-demolished-area")).toContainText("범위만 별도합산");
    expect(item(box)).toMatchObject({ demolished: true, demolishedKind: "building", demolishedPermit: "yes", demolishedOtherUse: "no", buildingFloorArea: 100, zoningDistrict: "commercial" });
    for (const k of ["demolishedVacantHouse", "demolishedPublicUse", "demolishedPublicUsePaid"]) expect(item(box)).not.toHaveProperty(k);
  });

  test("K-2 허가 «아니오» → 960,000 · 접힘 사유 허가 · 확인 필요 고지", async ({ page }) => {
    await toDetail(page, "300000000");
    await fillSeparateDetail(page, { ...BUILDING, demolished: { date: `${YEAR}-01-01`, kind: "building", permit: "no", otherUse: "no" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    await expect(page.getByTestId("land-split-demolished-outcome")).toContainText("종합합산으로 접힘");
    await expect(page.getByTestId("land-split-demolished-outcome")).toContainText("허가·사용승인");
    await expect(page.getByText(/허가·사용승인\(임시사용승인 포함\)을 받지 않은 건축물·주택의 부속토지는/)).toBeVisible();
  });

  test("허가 «모름» → 960,000 + «확인되지 않아» 고지 · 건축 외 용도 «예» → 960,000", async ({ page }) => {
    await toDetail(page, "300000000");
    await fillSeparateDetail(page, { ...BUILDING, demolished: { date: `${YEAR}-01-01`, kind: "building", permit: "unknown", otherUse: "no" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    await expect(page.getByText(/확인되지 않아\(모름·미선택\)/)).toBeVisible();
  });

  test("건축 외 용도 «예» → 960,000 · 사유 건축 외 용도", async ({ page }) => {
    await toDetail(page, "300000000");
    await fillSeparateDetail(page, { ...BUILDING, demolished: { date: `${YEAR}-01-01`, kind: "building", permit: "yes", otherUse: "yes" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    await expect(page.getByTestId("land-split-demolished-outcome")).toContainText("건축을 위한 용도 외");
  });

  test("K-15 주택 400㎡ · 요건 충족 → 768,000 · 바닥면적 입력 없이 계산 · body에 바닥면적·용도지역 없음", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "400000000");
    await fillSeparateDetail(page, { ...HOUSE, demolished: { date: `${YEAR}-01-01`, kind: "house", permit: "yes", otherUse: "no", vacantHouse: "no" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("768,000"));
    await expect(page.getByTestId("land-split-demolished-area")).toContainText("부속토지 전체를 별도합산 범위로 봄");
    expect(item(box)).toMatchObject({ demolishedKind: "house", demolishedPermit: "yes", demolishedOtherUse: "no" });
    // PSA-S1 — 건축 외 용도 «아니오»면 빈집정비 단서를 읽지 않아 body에 싣지 않는다
    expect(item(box)).not.toHaveProperty("demolishedVacantHouse");
    expect(item(box)).not.toHaveProperty("buildingFloorArea");
    expect(item(box)).not.toHaveProperty("zoningDistrict");
  });

  test("K-16 주택 · 2년 전 6.15. · 빈집정비 «예» → 768,000 (3년 안) · body에 빈집정비", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "400000000");
    await fillSeparateDetail(page, { ...HOUSE, demolished: { date: `${YEAR - 2}-06-15`, kind: "house", permit: "yes", otherUse: "no", vacantHouse: "yes" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("768,000"));
    await expect(page.getByTestId("land-split-demolished-period")).toContainText("3년");
    expect(item(box)).toMatchObject({ demolishedVacantHouse: "yes" });
  });

  test("K-17 빈집정비 «아니오» → 1,380,000 · K-18 «모름» → 1,380,000 + 3년 연장 확인 필요", async ({ page }) => {
    await toDetail(page, "400000000");
    await fillSeparateDetail(page, { ...HOUSE, demolished: { date: `${YEAR - 2}-06-15`, kind: "house", permit: "yes", otherUse: "no", vacantHouse: "no" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("1,380,000"));
    await expect(page.getByTestId("land-split-demolished-outcome")).toContainText("한시 기간이 지남");
    await expect(page.getByTestId("land-split-demolished-vacant")).toHaveCount(0);
  });

  test("K-18 빈집정비 «모름» → 1,380,000 · 3년 연장 미확인 줄", async ({ page }) => {
    await toDetail(page, "400000000");
    await fillSeparateDetail(page, { ...HOUSE, demolished: { date: `${YEAR - 2}-06-15`, kind: "house", permit: "yes", otherUse: "no", vacantHouse: "unknown" } });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("1,380,000"));
    await expect(page.getByTestId("land-split-demolished-vacant")).toContainText("일반 한시 기간만 반영");
  });

  test("K-19 건축 외 «예» ∧ 빈집 «예» → 공용 사용 칸 → 유료 칸 · 유료 «예» → 768,000 · body에 공용·유료", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "400000000");
    await page.getByTestId("pt-sa-land-area").fill(HOUSE.area);
    await page.getByRole("switch", { name: /건축물 철거 완료/ }).click();
    // 노출 사슬(PSA-S1 엄격 순차): 철거일 → 종류 → 빈집정비(관문 — 일반 기간 1년 밖·빈집 3년 안 주택) → 허가 → 건축 외 용도 → 공용 사용(건축 외 «예» ∧ 빈집정비 «예») → 유료(공용 «예»)
    await fillDemolishedDate(page, `${YEAR - 2}-06-15`);
    await expect(page.getByTestId("pt-sa-demolished-kind-house")).toBeVisible();
    await expect(page.getByTestId("pt-sa-demolished-permit-yes")).toHaveCount(0);
    await page.getByTestId("pt-sa-demolished-kind-house").check();
    await expect(page.getByTestId("pt-sa-demolished-vacanthouse-yes")).toBeVisible();
    await expect(page.getByTestId("pt-sa-demolished-permit-yes")).toHaveCount(0); // 관문 답 전에는 허가를 묻지 않는다
    await page.getByTestId("pt-sa-demolished-vacanthouse-yes").check();
    await page.getByTestId("pt-sa-demolished-permit-yes").check();
    await expect(page.getByTestId("pt-sa-demolished-publicuse-yes")).toHaveCount(0);
    await page.getByTestId("pt-sa-demolished-otheruse-yes").check();
    await expect(page.getByTestId("pt-sa-demolished-publicuse-yes")).toBeVisible();
    await expect(page.getByTestId("pt-sa-demolished-publicusepaid-yes")).toHaveCount(0);
    await page.getByTestId("pt-sa-demolished-publicuse-yes").check();
    await expect(page.getByTestId("pt-sa-demolished-publicusepaid-yes")).toBeVisible();
    // 건축 외 용도를 «아니오»로 바꾸면 공용·유료 칸은 사라진다
    await page.getByTestId("pt-sa-demolished-otheruse-no").check();
    await expect(page.getByTestId("pt-sa-demolished-publicuse-yes")).toHaveCount(0);
    await page.getByTestId("pt-sa-demolished-otheruse-yes").check();
    await page.getByTestId("pt-sa-demolished-publicusepaid-yes").check();
    await page.getByRole("button", { name: /^다음$/ }).click();
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("768,000"));
    expect(item(box)).toMatchObject({ demolishedOtherUse: "yes", demolishedVacantHouse: "yes", demolishedPublicUse: "yes", demolishedPublicUsePaid: "yes" });
  });

  test("K-20 유료 «아니오» → 1,380,000 · 무상 공용 사유 + 비과세 가능성 고지", async ({ page }) => {
    await toDetail(page, "400000000");
    await fillSeparateDetail(page, {
      ...HOUSE,
      demolished: { date: `${YEAR - 2}-06-15`, kind: "house", permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", paid: "no" },
    });
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("1,380,000"));
    await expect(page.getByTestId("land-split-demolished-outcome")).toContainText("무상 공용·공공용 사용");
    await expect(page.getByText(/재산세가 부과되지 않을 수 있습니다/).first()).toBeVisible();
  });

  test("숨은 값 미전송 — 주택·빈집 «예» 답을 두고 건축물로 바꾸면(기간 밖) 요청 body에 사실 칸이 실리지 않는다", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "400000000");
    await fillSeparateDetail(page, {
      ...HOUSE,
      next: false,
      demolished: { date: `${YEAR - 2}-06-15`, kind: "house", permit: "yes", otherUse: "no", vacantHouse: "yes" },
    });
    // 건축물로 바꾸면 한시 기간(1년)이 지나 사실 칸이 모두 사라진다
    await page.getByTestId("pt-sa-demolished-kind-building").check();
    await expect(page.getByTestId("pt-sa-demolished-permit-yes")).toHaveCount(0);
    await expect(page.getByTestId("pt-sa-demolished-no-facts")).toBeVisible();
    await page.getByRole("button", { name: /^다음$/ }).click();
    await fillSplitInputsZero(page);
    await calc(page);
    await expect(totalPayable(page)).toHaveText(exact("1,380,000"));
    expect(item(box)).toMatchObject({ demolishedKind: "building" });
    for (const k of ["demolishedPermit", "demolishedOtherUse", "demolishedVacantHouse", "demolishedPublicUse", "demolishedPublicUsePaid"]) {
      expect(item(box), k).not.toHaveProperty(k);
    }
  });

  test("미선택 차단 + 점프 — 종류만 고르고 «다음» → 허가 문구 · StepIndicator로 step 3 → 계산 → 토지 상세로 복귀(서버 호출 0)", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "300000000");
    await fillSeparateDetail(page, { ...BUILDING, next: false, demolished: { date: `${YEAR}-01-01`, kind: "building" } });
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByText(/허가·사용승인\(임시사용승인 포함\)을 받은 것인지 선택하세요/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "별도합산과세 상세 정보" })).toBeVisible();
    await page.getByRole("button", { name: "전년도 세액 단계로 이동" }).click();
    await page.getByRole("button", { name: /재산세 계산하기/ }).click();
    await expect(page.getByText(/허가·사용승인\(임시사용승인 포함\)을 받은 것인지 선택하세요/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "별도합산과세 상세 정보" })).toBeVisible();
    await expect(page.getByText("입력값이 올바르지 않습니다.")).toHaveCount(0);
    expect(box.bodies).toHaveLength(0);
  });

  test("철거일이 과세기준일(올해 6.1.) 뒤 → 모순 안내 + 차단", async ({ page }) => {
    await toDetail(page, "300000000");
    // 날짜 결함이라 사슬이 칸을 읽지 않는다(PSA-S1) — 종류 라디오는 그려지지 않고 고칠 칸은 철거일이다
    await fillSeparateDetail(page, { ...BUILDING, next: false, demolished: { date: `${YEAR}-12-31` } });
    await expect(page.getByTestId("pt-sa-demolished-kind-building")).toHaveCount(0);
    await expect(page.getByTestId("pt-sa-demolished-contradiction")).toContainText("철거일은 과세기준일 이전이어야 합니다");
    await page.getByRole("button", { name: /^다음$/ }).click();
    await expect(page.getByText("철거일은 과세기준일 이전이어야 합니다").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "별도합산과세 상세 정보" })).toBeVisible();
  });

  test("375px — 철거 사실 칸(공용·유료 사슬 전부 열림)과 결과 카드 가로 넘침 없음", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await toDetail(page, "400000000");
    await fillSeparateDetail(page, {
      ...HOUSE,
      next: false,
      demolished: { date: `${YEAR - 2}-06-15`, kind: "house", permit: "yes", otherUse: "yes", vacantHouse: "yes", publicUse: "yes", paid: "yes" },
    });
    await expect(page.getByTestId("pt-sa-demolished-publicusepaid-yes")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await page.getByTestId("pt-sa-demolished-facts").screenshot({ path: "e2e/_artifacts/property-demolished-facts-375.png" });
    await page.getByRole("button", { name: /^다음$/ }).click();
    await fillSplitInputsZero(page);
    await calc(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
    await expect(page.getByTestId("land-split-demolished-verdict")).toBeVisible();
  });
});
