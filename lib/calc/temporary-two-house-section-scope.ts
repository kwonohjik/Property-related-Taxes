/**
 * 「③ 일시적 2주택·합가 특례 섹션이 **화면에 있는가**」 — ⑤ 렌더 · ④ 전송 · ⑧ 검증 공용 술어.
 *
 * ## 왜 필요한가 — 한 게이트가 세 층에서 서로 달랐다 (2026-09-07 UI 리뷰 보통)
 *
 * ⑤(`Step4.tsx`)는 `isHousingLike(주 자산) && 세대 주택수 ≥ 2`에서만 섹션을 렌더한다.
 * 그런데 ⑧·④는 그 조건을 **모른 채** 각자 다른 술어를 썼고, 어긋남이 **양방향**으로 났다:
 *
 * | 방향 | 조합 | 종전 동작 |
 * |---|---|---|
 * | 화면엔 **없는데** ⑧이 요구 | 2채 → 1채로 정정 후 `replacementHouseSpecial` 잔존 | 「대체주택 특례: 사업시행계획인가일을 입력하세요」 외 **4건**이 계산을 영구 차단. 그 값을 채우거나 토글을 끌 컨트롤이 화면 어디에도 없다 |
 * | 화면엔 **있는데** ⑧이 안 봄 | 입주권·분양권·재개발APT 2채 + 일시적 2주택 ON + 신규 취득일 미입력 | 경고 **0건**. ④가 `temporaryTwoHouse` 키를 만들지 않아 §155① 특례가 **조용히 누락**된다 |
 *
 * ⑧의 종전 술어는 `provisoGate(...).mode === "temporary_two_house"`였는데, 그것은
 * **§154① 단서 카드**의 노출 맥락(1세대 + `assetKind === "housing"` + 정확히 2채)이라
 * 이 섹션의 노출 조건보다 **좁다**. 목적이 다른 게이트를 빌려 쓴 것이 원인이다.
 *
 * ## ④는 건드리지 않았다 — 실측 no-op
 *
 * 섹션이 숨겨진 상태(1채·비주택)에서도 ④는 `temporaryTwoHouse`·`replacementHouse`를
 * **그대로 전송**한다. 다만 그 payload가 세액을 움직이지 않는 것을 라우트 실측으로 확인했다
 * (토지 1채 · 주택 3채 두 조합 모두 총세액 837,028,500으로 **델타 0**) — 엔진이 §155①·
 * §156의2⑤의 자기 요건에서 이미 배제하기 때문이다. 증명된 no-op에 게이트를 새로 다는 것은
 * 범위 밖이라 남겨 둔다. `buildHouseholdSpecialPayload`는 **다건(신고 단위) 경로와 공유**라
 * 여기서 좁히면 그쪽 영향을 따로 재야 한다.
 *
 * ## 근거
 *
 * 「소득세법 시행령」 §155①의 일시적 2주택은 정의상 **종전 주택 + 신규 주택 2채 보유**
 * 상태이고, 양도 대상은 주택 계열 자산이다. 1채 세대·비주택 양도에서는 성립할 수 없다.
 */
import { isHousingLike } from "@/lib/calc/housing-like-asset";

/**
 * ③ 섹션(§155①·⑦·⑧·⑯·⑱ · §154① 단서 · §156의2⑤)이 노출되는가.
 *
 * ⚠️ 넓히면 ⑤·④·⑧이 **동시에** 열린다. 한쪽만 바꾸면 이 함수를 뽑은 이유가 없어진다.
 */
export function temporaryTwoHouseSectionVisible(args: {
  primaryAssetKind: string | undefined;
  householdHousingCount: string | undefined;
}): boolean {
  return (
    isHousingLike(args.primaryAssetKind) &&
    parseInt(args.householdHousingCount ?? "0", 10) >= 2
  );
}
