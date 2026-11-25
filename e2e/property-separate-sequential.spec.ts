/**
 * 재산세 별도합산 — 철거·허가 칸 «순차 노출» E2E (PSA-SX · 계획서 `property-separate-demolished-sequential.ui.plan.md` §5.3 · 엔진 계획서 §6 T8)
 *
 * 검증 축: ① 칸이 하나씩 나타난다(답한 칸 + 다음 한 칸) ② 앞 답으로 확정되면 확정 안내(`pt-sa-seq-settled`)와 뒤 칸 미노출
 * ③ 답을 바꾸면 숨은 칸이 «이전에 고른 답» 표식과 함께 돌아온다 ④ **요청 body = 화면이 연 칸**(숨은 stale 답은 보내지 않는다) ⑤ `role=status` 한 줄이 다음 칸·확정과 일치
 * ⑥ 세액 불변(판정은 순차 노출로 바뀌지 않는다) ⑦ 375px 가로 넘침 0 · 다크 대비.
 *
 * 세액 오라클(기존 K-표와 같은 값 — 총 납부세액 = 본세 × 1.2): 건축물 300㎡ 상업(공시가격 3억 · 바닥 100) / 주택 400㎡(공시가격 4억)
 *   K-1  철거 올해 1.1. · 허가 예 · 건축 외 아니오 · 면적      → 516,000
 *   K-2  허가 아니오 / 철거일이 3년 밖(날짜만으로 확정)         → 960,000
 *   K-15 주택 · 올해 1.1. · 허가 예 · 건축 외 아니오            → 768,000
 *   K-17 주택 · 2년 전 6.15. · 빈집정비 아니오                  → 1,380,000
 * 기존 3 스펙(`property-separate-demolished-requirements` · `-building-permit` · `property-land-split`)이 맡은 세액·고지·점프는 여기서 되풀이하지 않는다 — 이 스펙은 «노출 순서·확정·복원·전송»만.
 * 실행: E2E_PORT=3187 npx playwright test e2e/property-separate-sequential.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { expectDarkContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import {
  YEAR,
  calc,
  captureBody,
  exact,
  fillAreaBasis,
  fillDemolishedDate,
  fillSeparateDetail,
  fillSplitInputsZero,
  pickLandType,
  startLand,
  totalPayable,
} from "./_helpers/property-land";

const BUILDING = { zoning: /상업지역/, floor: "100" } as const;
const DATES_NOTICE = "철거일을 입력하면 이어서 필요한 칸이 표시됩니다.";
const KIND_NOTICE = "철거된 것의 종류를 고르면 이어서 필요한 칸이 표시됩니다.";
const SETTLED_STATUS = "별도합산 불성립이 확정되어 나머지 칸은 묻지 않습니다";

const t = (page: Page, id: string) => page.getByTestId(id);
const status = (page: Page) => t(page, "pt-sa-seq-status");
const item = (box: { bodies: Record<string, unknown>[] }) => box.bodies[0].separateAggregateItem as Record<string, unknown>;
/** 요청 body의 철거 키(`demolished*`) 집합 — «화면이 연 칸 = 보낸 칸»을 정확히 비교한다 */
const demolishedKeys = (box: { bodies: Record<string, unknown>[] }) => Object.keys(item(box)).filter((k) => k.startsWith("demolished")).sort();
const top = async (page: Page, id: string) => (await t(page, id).boundingBox())?.y ?? Number.NaN;

async function toDetail(page: Page, priceWon: string, area: string) {
  await startLand(page, priceWon);
  await pickLandType(page, /별도합산과세대상/);
  await t(page, "pt-sa-land-area").fill(area);
}
const demolishOn = (page: Page) => page.getByRole("switch", { name: /건축물 철거 완료/ }).click();
/** 단계 2 «다음» → Step 3 합산 칸 «없음(0)» → 계산 */
async function finish(page: Page) {
  await page.getByRole("button", { name: /^다음$/ }).click();
  await fillSplitInputsZero(page);
  await calc(page);
}

test.describe("재산세 별도합산 순차 노출 (PSA-SX)", () => {
  test("철거 사슬(건축물) — 칸이 하나씩 나타난다(답한 칸 + 다음 한 칸) · 낭독 한 줄이 다음 칸을 말한다 · 끝에서 면적 블록 → 516,000 · body 키 = 화면 칸", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "300000000", "300");
    await demolishOn(page);
    // 입구 — 철거일만
    await expect(status(page)).toHaveText(DATES_NOTICE);
    await expect(t(page, "pt-demolished-dates-notice")).toHaveText(DATES_NOTICE);
    await expect(t(page, "pt-sa-demolished-kind-building")).toHaveCount(0);
    // 철거일 세 칸이 «철거일» 그룹으로 낭독된다(접근성 트리 점검 — 종전엔 «연도·월·일»뿐)
    await expect(page.getByRole("group", { name: "철거일" }).getByRole("textbox", { name: "연도" })).toBeVisible();
    await fillDemolishedDate(page, `${YEAR}-01-01`);
    await expect(status(page)).toHaveText("다음 질문: 철거된 것의 종류");
    await expect(t(page, "pt-demolished-dates-notice")).toHaveCount(0);
    await expect(t(page, "pt-demolished-kind-notice")).toHaveText(KIND_NOTICE);
    await expect(t(page, "pt-sa-demolished-kind-building")).toBeVisible();
    await expect(t(page, "pt-sa-demolished-permit-yes")).toHaveCount(0);
    await t(page, "pt-sa-demolished-kind-building").check();
    await expect(status(page)).toHaveText("다음 질문: 허가·사용승인");
    await expect(t(page, "pt-sa-demolished-permit-yes")).toBeVisible();
    await expect(t(page, "pt-sa-demolished-otheruse-no")).toHaveCount(0);
    await expect(t(page, "pt-sa-seq-settled")).toHaveCount(0);
    await t(page, "pt-sa-demolished-permit-yes").check();
    await expect(status(page)).toHaveText("다음 질문: 철거 후 건축 외 용도");
    await expect(t(page, "pt-sa-demolished-otheruse-no")).toBeVisible();
    await expect(t(page, "pt-sa-area-basis")).toHaveCount(0); // 면적 블록은 사슬 끝에서만
    await t(page, "pt-sa-demolished-otheruse-no").check();
    await expect(status(page)).toHaveText("다음 질문: 철거 전 바닥면적·용도지역");
    await expect(t(page, "pt-sa-area-basis")).toBeVisible();
    expect(await top(page, "pt-sa-area-basis")).toBeGreaterThan(await top(page, "pt-sa-demolished-otheruse-no"));
    await expect(t(page, "pt-sa-demolished-vacanthouse-yes")).toHaveCount(0); // 건축물은 빈집정비를 묻지 않는다
    await fillAreaBasis(page, { zoning: BUILDING.zoning, floor: BUILDING.floor, required: true });
    await expect(status(page)).toHaveText("");
    await expect(t(page, "pt-sa-seq-settled")).toHaveCount(0);
    await finish(page);
    await expect(totalPayable(page)).toHaveText(exact("516,000"));
    expect(demolishedKeys(box)).toEqual(["demolished", "demolishedDate", "demolishedKind", "demolishedOtherUse", "demolishedPermit"]);
    expect(item(box)).toMatchObject({ demolishedKind: "building", demolishedPermit: "yes", demolishedOtherUse: "no", buildingFloorArea: 100, zoningDistrict: "commercial" });
  });

  test("확정 + 숨은 답 — 건축 외 «예»(숨은 답)를 두고 허가를 «아니오»로 바꾸면 확정 안내 · 뒤 칸 없음 · body에 숨은 답 없음 → 960,000", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "300000000", "300");
    await demolishOn(page);
    await fillDemolishedDate(page, `${YEAR}-01-01`);
    await t(page, "pt-sa-demolished-kind-building").check();
    await t(page, "pt-sa-demolished-permit-yes").check();
    await t(page, "pt-sa-demolished-otheruse-yes").check();
    // 건축 외 «예» — 결과가 확정(other_use)이라 면적 블록을 묻지 않는다
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "other_use");
    await expect(t(page, "pt-sa-area-basis")).toHaveCount(0);
    await expect(status(page)).toHaveText(SETTLED_STATUS);
    // 허가를 «아니오» — 앞 칸에서 확정 → 건축 외 칸이 사라진다(저장값 «예»는 그대로 남아 있다)
    await t(page, "pt-sa-demolished-permit-no").check();
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "permit");
    await expect(t(page, "pt-sa-seq-settled")).toContainText("나머지 칸은 묻지 않습니다");
    await expect(t(page, "pt-sa-seq-settled")).toContainText("답을 바꾸면 이어서 다시 묻습니다.");
    await expect(t(page, "pt-sa-demolished-otheruse-yes")).toHaveCount(0);
    await expect(t(page, "pt-sa-area-basis")).toHaveCount(0);
    await expect(status(page)).toHaveText(SETTLED_STATUS);
    await finish(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    expect(demolishedKeys(box)).toEqual(["demolished", "demolishedDate", "demolishedKind", "demolishedPermit"]); // 숨은 demolishedOtherUse 미전송
    expect(item(box)).toMatchObject({ demolishedPermit: "no" });
    for (const k of ["buildingFloorArea", "zoningDistrict"]) expect(item(box), k).not.toHaveProperty(k);
  });

  test("복원 — 허가를 다시 «예»로 바꾸면 숨었던 건축 외 칸이 저장값을 가진 채 «이전에 고른 답» 표식과 함께 돌아온다 · 「이 답 그대로 확인」 → 표식 해제 · 다른 답 → 사슬 이어짐", async ({ page }) => {
    await toDetail(page, "300000000", "300");
    await demolishOn(page);
    await fillDemolishedDate(page, `${YEAR}-01-01`);
    await t(page, "pt-sa-demolished-kind-building").check();
    await t(page, "pt-sa-demolished-permit-yes").check();
    await t(page, "pt-sa-demolished-otheruse-yes").check();
    await t(page, "pt-sa-demolished-permit-no").check();
    await expect(t(page, "pt-sa-demolished-otheruse-yes")).toHaveCount(0);
    await expect(t(page, "pt-sa-prev-answer-demolishedOtherUse")).toHaveCount(0); // 숨은 동안엔 표식도 없다
    await t(page, "pt-sa-demolished-permit-yes").check();
    // 건축 외 칸 복귀 — 저장값 «예»가 선택된 채 + 표식(텍스트) + 곧바로 other_use로 확정
    await expect(t(page, "pt-sa-demolished-otheruse-yes")).toBeChecked();
    await expect(t(page, "pt-sa-prev-answer-demolishedOtherUse")).toContainText("이전에 고른 답");
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "other_use");
    // 방금 고른 허가·종류에는 표식이 없다(사용자가 이번에 직접 고른 답)
    await expect(t(page, "pt-sa-prev-answer-demolishedPermit")).toHaveCount(0);
    await expect(t(page, "pt-sa-prev-answer-demolishedKind")).toHaveCount(0);
    await t(page, "pt-sa-prev-answer-demolishedOtherUse").getByRole("button", { name: "이 답 그대로 확인" }).click();
    await expect(t(page, "pt-sa-prev-answer-demolishedOtherUse")).toHaveCount(0);
    await expect(t(page, "pt-sa-demolished-otheruse-yes")).toBeChecked(); // 확인은 값을 바꾸지 않는다
    // 다른 답(아니오)을 고르면 사슬이 이어진다 → 면적 블록
    await t(page, "pt-sa-demolished-otheruse-no").check();
    await expect(t(page, "pt-sa-seq-settled")).toHaveCount(0);
    await expect(t(page, "pt-sa-area-basis")).toBeVisible();
    await expect(status(page)).toHaveText("다음 질문: 철거 전 바닥면적·용도지역");
  });

  test("빈집정비 «단서 하위» 자리 — 일반 한시 기간 안인 주택은 허가 → 건축 외 «예» 뒤에 묻는다 · «아니오»로 바꾸면 사라지고 body에 없다 → 768,000", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "400000000", "400");
    await demolishOn(page);
    await fillDemolishedDate(page, `${YEAR}-01-01`);
    await t(page, "pt-sa-demolished-kind-house").check();
    await expect(t(page, "pt-sa-demolished-vacanthouse-yes")).toHaveCount(0); // 관문 아님 — 허가가 먼저
    await expect(status(page)).toHaveText("다음 질문: 허가·사용승인");
    await t(page, "pt-sa-demolished-permit-yes").check();
    await expect(t(page, "pt-sa-demolished-vacanthouse-yes")).toHaveCount(0);
    await t(page, "pt-sa-demolished-otheruse-yes").check();
    await expect(status(page)).toHaveText("다음 질문: 빈집정비사업 철거");
    await expect(t(page, "pt-sa-demolished-vacanthouse-yes")).toBeVisible();
    expect(await top(page, "pt-sa-demolished-vacanthouse-yes")).toBeGreaterThan(await top(page, "pt-sa-demolished-otheruse-yes"));
    await expect(t(page, "pt-sa-demolished-facts")).not.toContainText("먼저 묻습니다"); // 관문 문구는 관문 자리에서만
    await t(page, "pt-sa-demolished-vacanthouse-no").check();
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "other_use");
    await expect(t(page, "pt-sa-demolished-publicuse-yes")).toHaveCount(0);
    // 건축 외 «아니오» — 빈집정비 칸이 사라지고(저장값 «아니오»는 남는다) 주택이라 면적 블록도 없다
    await t(page, "pt-sa-demolished-otheruse-no").check();
    await expect(t(page, "pt-sa-demolished-vacanthouse-no")).toHaveCount(0);
    await expect(t(page, "pt-sa-seq-settled")).toHaveCount(0);
    await expect(t(page, "pt-sa-area-basis")).toHaveCount(0);
    await expect(status(page)).toHaveText("");
    await finish(page);
    await expect(totalPayable(page)).toHaveText(exact("768,000"));
    expect(demolishedKeys(box)).toEqual(["demolished", "demolishedDate", "demolishedKind", "demolishedOtherUse", "demolishedPermit"]);
  });

  test("빈집정비 «관문» 자리 — 철거일이 일반 기간(1년) 밖·빈집 기간(3년) 안인 주택은 허가보다 앞에서 묻는다 · «아니오» → 확정(기간) · 숨은 허가·건축 외 답 미전송 → 1,380,000", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "400000000", "400");
    await demolishOn(page);
    await fillDemolishedDate(page, `${YEAR - 2}-06-15`);
    await t(page, "pt-sa-demolished-kind-house").check();
    await expect(status(page)).toHaveText("다음 질문: 빈집정비사업 철거");
    await expect(t(page, "pt-sa-demolished-vacanthouse-yes")).toBeVisible();
    await expect(t(page, "pt-sa-demolished-permit-yes")).toHaveCount(0); // 관문 답 전에는 허가를 묻지 않는다
    await expect(t(page, "pt-sa-demolished-facts")).toContainText("이 답이 한시 기간 안인지를 정해 먼저 묻습니다");
    await t(page, "pt-sa-demolished-vacanthouse-yes").check();
    await expect(status(page)).toHaveText("다음 질문: 허가·사용승인");
    expect(await top(page, "pt-sa-demolished-vacanthouse-yes")).toBeLessThan(await top(page, "pt-sa-demolished-permit-yes"));
    await t(page, "pt-sa-demolished-permit-yes").check();
    await t(page, "pt-sa-demolished-otheruse-no").check();
    await expect(t(page, "pt-sa-seq-settled")).toHaveCount(0); // 주택 · 요건 충족 — 성립
    // 관문을 «아니오»로 바꾸면 기간 밖으로 확정 — 허가·건축 외 칸이 사라진다(저장값은 남는다)
    await t(page, "pt-sa-demolished-vacanthouse-no").check();
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "period");
    await expect(t(page, "pt-sa-demolished-permit-yes")).toHaveCount(0);
    await expect(t(page, "pt-sa-demolished-otheruse-no")).toHaveCount(0);
    await expect(status(page)).toHaveText(SETTLED_STATUS);
    await finish(page);
    await expect(totalPayable(page)).toHaveText(exact("1,380,000"));
    expect(demolishedKeys(box)).toEqual(["demolished", "demolishedDate", "demolishedKind", "demolishedVacantHouse"]);
    expect(item(box)).toMatchObject({ demolishedVacantHouse: "no" });
  });

  test("날짜만으로 확정 — 철거일이 두 한시 기간(1년·3년) 밖이면 종류 칸 없이 확정 · 기간 병기 고지 · «철거일을 바꾸면…» · 철거일을 안으로 바꾸면 종류 칸 → 960,000", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "300000000", "300");
    await demolishOn(page);
    await fillDemolishedDate(page, `${YEAR - 5}-03-01`);
    await expect(t(page, "pt-sa-demolished-kind-building")).toHaveCount(0);
    await expect(t(page, "pt-sa-demolished-kind-house")).toHaveCount(0);
    const settled = t(page, "pt-sa-seq-settled");
    await expect(settled).toHaveAttribute("data-reason", "period");
    await expect(settled).toContainText("철거일(과세기준일)로 결과가 정해져 별도합산 불성립(종합합산 이관)이 확정되어 나머지 칸은 묻지 않습니다.");
    await expect(settled).toContainText("일반 한시 기간(1년)과 빈집정비사업 철거 빈집 한시 기간(3년)이 모두 지나");
    await expect(settled).toContainText("철거일을 바꾸면 이어서 다시 묻습니다.");
    await expect(settled).not.toContainText("이 답으로");
    await expect(settled).not.toContainText("답을 바꾸면");
    await expect(page.getByText("철거일로 종합합산 이관이 확정되었습니다")).toBeVisible();
    await expect(page.getByText("이 답으로 종합합산 이관이 확정되었습니다")).toHaveCount(0);
    await expect(status(page)).toHaveText(SETTLED_STATUS);
    await expect(t(page, "pt-demolished-dates-notice")).toHaveCount(0);
    // 철거일을 한시 기간 안으로 — 종류를 묻는다
    await fillDemolishedDate(page, `${YEAR}-01-01`);
    await expect(t(page, "pt-sa-seq-settled")).toHaveCount(0);
    await expect(t(page, "pt-sa-demolished-kind-building")).toBeVisible();
    await expect(status(page)).toHaveText("다음 질문: 철거된 것의 종류");
    // 다시 밖으로 — 계산한다
    await fillDemolishedDate(page, `${YEAR - 5}-03-01`);
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "period");
    await finish(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    expect(demolishedKeys(box)).toEqual(["demolished", "demolishedDate"]); // 종류·사실 칸을 묻지 않았으니 보내지도 않는다
  });

  test("비철거 — 허가 «예» → 면적 블록 · 면적 값을 둔 채 «아니오» → 블록 없음 + 확정 안내 + body에 용도지역·바닥면적 없음 → 960,000", async ({ page }) => {
    const box = captureBody(page);
    await toDetail(page, "300000000", "300");
    await expect(status(page)).toHaveText("다음 질문: 허가·사용승인");
    await expect(t(page, "pt-sa-area-basis")).toHaveCount(0);
    await t(page, "pt-sa-permit-yes").check();
    await expect(status(page)).toHaveText("다음 질문: 건물 바닥면적·용도지역");
    await fillAreaBasis(page, { zoning: BUILDING.zoning, floor: BUILDING.floor, required: true });
    await expect(status(page)).toHaveText("");
    await t(page, "pt-sa-permit-no").check();
    await expect(t(page, "pt-sa-area-basis")).toHaveCount(0);
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "building_permit");
    await expect(status(page)).toHaveText(SETTLED_STATUS);
    await finish(page);
    await expect(totalPayable(page)).toHaveText(exact("960,000"));
    expect(item(box)).toMatchObject({ buildingPermit: "no" });
    for (const k of ["zoningDistrict", "buildingFloorArea", "demolished"]) expect(item(box), k).not.toHaveProperty(k);
  });

  test("375px · 다크 — 가장 긴 사슬(관문 → 허가 → 건축 외 → 공용 → 유료 → 확정)과 «이전에 고른 답» 표식이 가로로 넘치지 않고 다크 대비를 지킨다", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await toDetail(page, "400000000", "400");
    await fillSeparateDetail(page, {
      areaBasis: "absent",
      zoning: /상업지역/,
      area: "400",
      next: false,
      demolished: { date: `${YEAR - 2}-06-15`, kind: "house", vacantHouse: "yes", permit: "yes", otherUse: "yes", publicUse: "yes", paid: "no" },
    });
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "public_use_unpaid");
    await expectNoPageHScroll(page);
    // 관문을 «아니오» → 확정으로 접히고, «예»로 되돌리면 숨었던 네 칸이 표식과 함께 돌아온다
    await t(page, "pt-sa-demolished-vacanthouse-no").check();
    await expect(t(page, "pt-sa-seq-settled")).toHaveAttribute("data-reason", "period");
    await t(page, "pt-sa-demolished-vacanthouse-yes").check();
    for (const f of ["demolishedPermit", "demolishedOtherUse", "demolishedPublicUse", "demolishedPublicUsePaid"]) {
      await expect(t(page, `pt-sa-prev-answer-${f}`), f).toBeVisible();
    }
    await expect(t(page, "pt-sa-prev-answer-demolishedVacantHouse")).toHaveCount(0);
    await expectNoPageHScroll(page);
    await t(page, "pt-sa-demolished-facts").screenshot({ path: "e2e/_artifacts/property-sequential-chain-375.png" });
    await expectDarkContrast(page, t(page, "pt-sa-demolished-facts"));
    await expectDarkContrast(page, t(page, "pt-sa-seq-settled"));
  });
});
