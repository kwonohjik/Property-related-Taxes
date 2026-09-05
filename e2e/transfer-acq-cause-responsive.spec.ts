/**
 * 취득 원인 선택 — 좁은 화면에서 라벨이 잘리지 않는다 (2026-09-05 · 코드리뷰 Q29)
 *
 * ## 종전 결함
 *
 * `grid-cols-5` 고정 + `whitespace-nowrap`이라 반응형 브레이크포인트가 없었다. 375px에서
 * 셀 폭이 50px 안팎이 되고 줄바꿈도 막혀 「이월과세(증여)」·「신축(자가건축)」 글자가 셀 밖으로
 * 삐져나왔다 — **어떤 취득원인을 고르는지 읽을 수 없었다**.
 *
 * ⇒ 프로젝트 정본 `RadioCardGroup`(`layout="inline"` = `flex-wrap`)으로 교체해 폭에 맞춰
 *   스스로 접히게 했다. 이 spec은 그 불변식을 375px에서 못박는다.
 *
 * worktree 실행: E2E_PORT=3100 npx playwright test e2e/transfer-acq-cause-responsive.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const LABELS = ["매매", "상속", "증여", "이월과세(증여)", "신축(자가건축)"];

test.describe("취득 원인 라디오 — 375px 가독성", () => {
  test.use({ viewport: { width: 375, height: 900 } });

  test("🔴 5개 라벨이 모두 보이고 그룹 밖으로 삐져나오지 않는다", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);

    // 화면에는 라디오 그룹이 여럿 있다 — 「매매」를 품은 그룹이 취득원인 그룹이다.
    const group = page
      .getByRole("radio", { name: "매매", exact: true })
      .locator('xpath=ancestor::*[@data-slot="radio-card-group"][1]');
    await expect(group).toBeVisible();
    const box = await group.boundingBox();
    expect(box, "라디오 그룹 박스를 못 잡았다").not.toBeNull();

    for (const label of LABELS) {
      const opt = page.getByRole("radio", { name: label, exact: true });
      await expect(opt, `「${label}」 라디오가 없다`).toBeVisible();

      // 라벨 텍스트의 오른쪽 끝이 그룹 컨테이너 안에 들어와야 한다.
      // 종전 grid-cols-5 + nowrap에서는 여기가 깨졌다(셀 폭 ≈50px < 글자 폭).
      // 라디오를 감싼 <label>이 그 옵션의 박스다 (「매매」는 「매매사례가액」에도 들어가므로
      // 텍스트 매칭으로 찾으면 엉뚱한 노드를 잡는다).
      const cell = opt.locator("xpath=ancestor::label[1]");
      const cb = await cell.boundingBox();
      expect(cb, `「${label}」 라벨 박스를 못 잡았다`).not.toBeNull();

      // ① 옵션 박스가 그룹 안에 있다.
      expect(
        cb!.x + cb!.width,
        `「${label}」 박스가 그룹 오른쪽 경계를 넘는다`,
      ).toBeLessThanOrEqual(box!.x + box!.width + 1);

      // ② 🔑 **글자가 그 박스 안에 들어간다.** 종전 결함은 여기였다 — `grid-cols-5`는 셀 자체는
      //    그리드 안에 두면서 `whitespace-nowrap` 글자만 셀 밖으로 흘려보냈다. 박스만 재면
      //    구별력이 0이 된다(뮤테이션 실측으로 확인).
      const textBox = await cell.locator("span").first().boundingBox();
      expect(textBox, `「${label}」 텍스트 박스를 못 잡았다`).not.toBeNull();
      expect(
        textBox!.x + textBox!.width,
        `「${label}」 글자가 옵션 박스 밖으로 삐져나온다`,
      ).toBeLessThanOrEqual(cb!.x + cb!.width + 1);
    }
  });

  test("클릭하면 선택된다 (role 전환 후에도 동작 유지)", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);

    const inheritance = page.getByRole("radio", { name: "상속", exact: true });
    await inheritance.click();
    await expect(inheritance).toBeChecked();
    await expect(page.getByRole("radio", { name: "매매", exact: true })).not.toBeChecked();
  });
});
