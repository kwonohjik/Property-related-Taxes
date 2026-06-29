import { type Page } from "@playwright/test";

/**
 * 양도세 자산 카드의 접기 섹션을 펼친다 (전부 접힘 기본값 대응).
 *
 * 점진적 노출(progressive disclosure) 도입 후 자산 카드는 진입 시 전부 접힘이므로,
 * ② 양도 이하의 입력 필드를 채우는 E2E 스펙은 해당 섹션을 먼저 펼쳐야 한다.
 *
 * @param num 섹션 번호 1~5 (① 기본 / ② 양도 / ③ 취득 / ④ 필요경비 / ⑤ 기타)
 * @param assetIndex 자산 카드 인덱스 (기본 0 = 주 자산)
 */
export async function expandAssetSection(
  page: Page,
  num: 1 | 2 | 3 | 4 | 5,
  assetIndex = 0,
): Promise<void> {
  const header = page
    .locator(`[data-asset-card-index="${assetIndex}"] [data-asset-section="${num}"] > button`)
    .first();
  await header.waitFor({ state: "visible" });
  if ((await header.getAttribute("aria-expanded")) !== "true") {
    await header.click();
  }
}
