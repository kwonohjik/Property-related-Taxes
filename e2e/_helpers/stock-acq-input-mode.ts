/**
 * 주식 Step2 「② 취득가액 — 실가」 **입력 방식** 선택 헬퍼.
 *
 * 2026-09-17부터 기본값이 「합계 직접 입력」이다(양도가액 축과 같은 배치·같은 기본값).
 * ⇒ **1주당 단가 축을 쓰는 spec 은 라디오를 명시로 골라야** 「1주당 취득가액」 칸이 열린다.
 *   기본값에 기대어 곧바로 채우면 칸이 없어 fill 이 타임아웃난다(실측 34건).
 *
 * 라디오는 `name` 으로 집는다 — 같은 화면에 다른 라디오 그룹이 여럿 있다.
 */
import { type Page } from "@playwright/test";

/** 취득가액 입력 방식 → 「1주당 단가」 */
export async function chooseAcqPerShare(page: Page) {
  await page
    .locator('input[name="acquisitionActualInputMode"][value="per_share"]')
    .first()
    .check();
}
