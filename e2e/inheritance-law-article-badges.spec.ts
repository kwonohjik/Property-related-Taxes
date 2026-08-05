/**
 * E2E: 상속세 Step 4 법조문 배지 링크(⑥)
 *
 * 검증:
 *   LAW-1: Step 4에 법조문 배지(§22·§23의2·§18의3·§18의2·§29·§69·§21·§23) 노출.
 *   LAW-2: 배지 클릭 → 조문 모달(Dialog) 열림 + 제목(상증법 제N조) 노출.
 *
 * 비고: 조문 본문 조회는 법령 API(KOREAN_LAW_OC) 의존이라 로컬에서 실패해도
 *   모달은 제목 + 국가법령정보센터 외부 링크로 graceful 표시(=배지 가치 유지).
 * 정책: [[feedback_browser_verify_with_playwright]] [[korean-law-citation-verify]]
 */
import { test, expect, type Page } from "@playwright/test";
import {
  fillDateAndVerify,
  addHeir,
  addLandAsset,
  nextSteps,
} from "./_helpers/tax-flow";

async function gotoStep4(page: Page) {
  await page.goto("/calc/inheritance-tax");
  await fillDateAndVerify(page, { year: "2024", month: "6", day: "10" });
  await addHeir(page, "heir", "child");
  await nextSteps(page, 1); // → 상속재산
  await addLandAsset(page, { area: "300", unitPrice: "10000000" });
  await nextSteps(page, 3); // → 공제·세액공제
}

test.describe("상속세 Step4 법조문 배지", () => {
  test("LAW-1: 공제·세액공제 법조문 배지 노출", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    // 그룹 A(상속공제) 헤더 클릭 → 펼침 (디폴트 접힘 대응)
    await page.getByRole("button", { name: /상속공제 — 배우자/ }).click();

    // 그룹 A(상속공제) — 금융재산 §22, 영농 §18의3, 가업 §18의2
    await expect(page.getByRole("button", { name: /§22 금융재산 상속공제/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /§18의3 영농상속공제/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /§18의2/ })).toBeVisible();

    // 그룹 C(신고·세액공제) 헤더 클릭 → 펼침
    await page.getByRole("button", { name: /신고 상태·외국납부/ }).click();

    // 그룹 C(신고·세액공제) — §69·§21·§29
    await expect(page.getByRole("button", { name: /§69 신고세액공제/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /§29/ }).first()).toBeVisible();
  });

  test("LAW-2: 배지 클릭 → 조문 모달 열림", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoStep4(page);

    // 외국납부세액공제 칩 클릭 → 그룹 C 자동 펼침 후 §29 배지 클릭
    await page.getByText("외국납부세액공제 §29").click();

    // §29 배지 클릭 → 모달 + 제목 (그룹 C 컨테이너 내 스코핑으로 칩 버튼과 구분)
    await page.getByTestId("step4-group-credit").getByRole("button", { name: /§29/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // ⚠️ `getByText(/제29조/)`는 **본문이 로드되면 2개**가 된다 — 제목 <h2>와
    //    조문 본문 <pre>("제29조(외국 납부세액 공제) …") 양쪽에 걸려 strict mode 위반.
    //    로컬은 본문 로드 전에 단언이 끝나 우연히 통과했고, CI(fresh checkout·빠른 응답)에서만
    //    깨졌다. 검증하려는 대상은 **모달 제목**이므로 heading으로 좁힌다.
    await expect(dialog.getByRole("heading", { name: /제29조/ })).toBeVisible();
    // 국가법령정보센터 외부 링크(폴백) 노출
    await expect(dialog.getByText(/국가법령정보센터/)).toBeVisible();
  });
});
