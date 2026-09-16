/**
 * 소재지 입력 헬퍼 — 양도세 ① 기본정보.
 *
 * 소재지는 2026-09-16부터 ⑧ 필수다(물건 식별자 — 계산 이력 dedup 키가 이것으로 물건을 가른다.
 * 계획서 `docs/00-pm/business-key-property-identity.plan.md`).
 *
 * 🔑 **Vworld를 타지 않는다.** `/api/address/search`를 빈 결과로 mock하고, 컴포넌트가 그때
 *    내주는 「입력한 주소 그대로 사용」 경로로 채운다. 외부 정부 API 의존 E2E를 mock하는 것은
 *    이 저장소의 확립된 패턴이고(법제처·키움 등 14 spec), 여기서는 **셀렉터가 결정적**이라는
 *    이점도 있다 — 실검색은 결과 순서가 흔들린다.
 *
 * ⚠️ **`/api/address/standard-price`는 «건드리지 않는다».** 그 라우트는 공동주택 세대 목록뿐
 *    아니라 **건물 기준시가 조회**에도 쓰여서, 빈 결과로 막으면 `building-stdprice-*`·
 *    `commercial-building-std-batch` 같은 spec이 조용히 깨진다. 여기서 쓰는 가짜 지번은
 *    어차피 세대가 잡히지 않아 `hasAddressUnits=false`가 되므로 mock이 필요 없다.
 *    동·호 게이트를 실제로 검증하는 spec은 이 헬퍼를 쓰지 말 것.
 */
import type { Page, Locator } from "@playwright/test";

export const E2E_JIBUN = "서울 강남구 테스트동 1-1";

/** 주소 **검색**만 빈 결과로 고정한다(기준시가 라우트는 그대로 둔다). `fillAddress` 전에 1회 호출. */
export async function mockAddressApis(page: Page): Promise<void> {
  await page.route("**/api/address/search*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [] }) }),
  );
}

/**
 * 소재지를 채운다. `scope`를 주면 그 안에서 찾는다(모달·자산 카드).
 * `mockAddressApis`가 먼저 걸려 있어야 한다.
 */
export async function fillAddress(page: Page, scope?: Locator, jibun = E2E_JIBUN): Promise<void> {
  const root = scope ?? page;
  const input = root.getByPlaceholder("도로명 또는 지번 주소 입력").first();
  await input.fill(jibun);
  await input.press("Enter");
  await root.getByRole("button", { name: new RegExp(`「${jibun}」`) }).first().click();
}

/** mock + 입력을 한 번에. 대부분의 spec은 이것만 부르면 된다. */
export async function setupAddress(page: Page, scope?: Locator, jibun = E2E_JIBUN): Promise<void> {
  await mockAddressApis(page);
  await fillAddress(page, scope, jibun);
}
