/**
 * 재개발(§166) 자산-수준 필드의 **적용 범위 술어** — ⑤ UI · ⑬ payload · 마이그레이션 공용 단일 소스.
 *
 * ## 왜 뽑았나 (2026-08-25 · U1-01 · U1-02)
 *
 * 재개발 카드들은 축(청산금 방향·조합원 구분)에 따라 입력칸을 열고 닫는데, ④ 변환은 그 축을 보지
 * 않고 저장값을 그대로 실었다. 사용자가 축을 되돌리면 **화면에서 사라진 값이 payload에는 남고**,
 * 되돌린 축에는 그 값을 지울 위젯이 아예 없다 — ⑧ validate로 막으면 「채울 칸 없는 영구 차단」이
 * 되므로(memory `feedback_ui_gate_removes_sole_input_path`) 정답은 **범위 밖이면 안 보내는 것**이다.
 *
 * 술어를 한 곳에 두고 세 지점이 공유한다. 한쪽만 고치면 「새로고침해야 정상화되는」 상태가 된다
 * (`AssetAreaRedevelopment.tsx:59-63`이 같은 이유를 이미 적어 두었다).
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 양도 대상(§166 축) 판정 — `buildRedevelopmentPayload`·⑤ UI와 **같은 기본값**.
 *
 * `assetKind="right_to_move_in"` + `redevSubject` 미입력이면 `"right"`로 본다
 * (미입력을 `"apt"`로 읽으면 완공APT 전용 산식이 입주권에 걸린다).
 */
export function resolveRedevSubject(
  asset: Pick<AssetForm, "assetKind" | "redevSubject">,
): "right" | "apt" {
  return (asset.redevSubject || (asset.assetKind === "right_to_move_in" ? "right" : "apt")) as
    | "right"
    | "apt";
}

/**
 * ③-c 「인가일 기준 비과세 보유요건」 자기선언(`redevExemptionEligibleAtApproval`)이
 * 의미를 갖는 축인가 (U1-01).
 *
 * · **입주권**(`right`) — 축을 제한하지 않는다. ⚠️ **근거가 P6-c-1에서 바뀌었다.**
 *   종전 근거는 「계산기 `RedevelopmentRightExemptionSection` §⑥ 토글이 항상 렌더되므로
 *   정당한 입력 경로가 있다」였는데, 그 섹션은 **판정 메뉴 전용**이 됐다. 이제 근거는
 *   반대쪽이다 — 값이 **판정 메뉴에서 넘어오므로 계산기가 지우면 안 된다**.
 *   `false`로 바꾸면 `clearOutOfScopeRedevPatch`가 「판정 불러오기」로 가져온 §89①4호
 *   선언을 조용히 비운다.
 * · **완공APT**(`apt`) — ③-c `ExemptionAtApprovalCard`의 렌더 게이트와 같아야 한다
 *   (승계조합원 아님 + 청산금 **수령**). 완공APT는 판정 메뉴에 입력 경로가 **없다** —
 *   ④(`one-house-exemption-api.ts:208`)가 `assetKind === "right_to_move_in"`일 때만
 *   `oneRightExemptionFacts`를 보낸다. 그래서 계산기가 소유한다.
 *   `isOneHouseSingle`은 폼-전역이라 자산-수준 술어에 넣지 않는다(엔진이 같은 값을 본다).
 *
 * 엔진은 `=== false`일 때 `isOneHouseSingle`을 강제 false로 내려 장기보유특별공제를
 * 표2(최대 80%)에서 **표1(최대 30%)로 강등**한다 — 「소득세법」 §95② 표1·표2.
 */
export function exemptionAtApprovalInScope(
  asset: Pick<
    AssetForm,
    "assetKind" | "redevSubject" | "redevSettlementDirection" | "redevIsSuccessorMember"
  >,
): boolean {
  if (resolveRedevSubject(asset) === "right") return true;
  return (
    asset.redevSettlementDirection === "receive" && asset.redevIsSuccessorMember !== "yes"
  );
}

/**
 * ③-c 카드의 **부속 입력**(`redevPostApprovalHousingUse`·`…EndDate`)이 의미를 갖는 축인가
 * (P6-c-3 신설).
 *
 * ## 🔴 왜 자기선언과 갈라야 했나
 *
 * 종전에는 둘 다 `exemptionAtApprovalInScope` 하나로 판정했다. P6-c-1 이후 그 술어가
 * **입주권에서 `true`를 유지해야 하는 이유**(판정 메뉴 값 보존)와 **③-c 카드를 입주권에서
 * 감춰야 하는 이유**(같은 필드를 `ImportedRedevRightFactsCard`가 이미 읽기 전용으로 보여 준다)가
 * 서로 반대 방향이 됐다. 한 술어로는 둘 다 만족할 수 없다:
 *
 * - 술어를 `false`로 내리면 → 판정 메뉴에서 넘어온 자기선언이 지워진다.
 * - 술어를 `true`로 둔 채 카드만 감추면 → ⑧이 종료일을 요구하는데 **채울 칸이 없다**
 *   (memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * ⇒ 자기선언(판정 사실, 두 화면이 나눠 갖는다)과 이 부속 입력(③-c 카드 전용, 완공APT에만
 *   있다)을 **다른 술어로** 판정한다.
 *
 * 🔑 이 두 필드는 **세액에 영향이 없다** — ④ 변환(`transfer-tax-api-redev.ts`)이 보내지 않고,
 *    ③-c 카드 안의 참고 문구(자동 제안 기간)만 늘린다. 그럼에도 ⑧이 차단하는 것은 「토글 ON +
 *    종료일 공란」이라는 **모순된 입력**을 막기 위해서다(Q20).
 *
 * 입주권 경로의 같은 법리(사전-2019-법령해석재산-0739 — 인가일 이후 철거 전 사실상 주거용
 * 사용 기간 합산)는 판정 메뉴가 이미 갖고 있다
 * (`RedevelopmentRightExemptionSection.tsx:164·175` 보유·거주 월수 hint) — 감춰도 사라지지 않는다.
 */
export function postApprovalHousingUseInScope(
  asset: Pick<
    AssetForm,
    "assetKind" | "redevSubject" | "redevSettlementDirection" | "redevIsSuccessorMember"
  >,
): boolean {
  return (
    resolveRedevSubject(asset) === "apt" &&
    asset.redevSettlementDirection === "receive" &&
    asset.redevIsSuccessorMember !== "yes"
  );
}

/**
 * 승계조합원 전용 「인가후 필요경비」(`redevPostApprovalExpenses`)가 의미를 갖는 축인가 (U1-02).
 *
 * 입력칸은 `asset.redevIsSuccessorMember === "yes"` 게이트 안에만 있다
 * (`RedevelopmentBlock.tsx:335`). 원조합원으로 되돌리면 칸이 사라지지만 값은 남고,
 * 엔진은 「소득세법 시행령」 §166①1호 인가후 양도차익에서 그 값을 차감한다.
 *
 * ⚠️ 자본적지출·양도비는 **일반 입력 경로가 따로 있으므로** 이 술어의 대상이 아니다.
 */
export function postApprovalExpensesInScope(
  asset: Pick<AssetForm, "redevIsSuccessorMember">,
): boolean {
  return asset.redevIsSuccessorMember === "yes";
}

/**
 * 축이 바뀌어 **범위 밖으로 나간 재개발 필드**를 비우는 patch (2026-09-05 · 코드리뷰 Q20).
 *
 * ## 왜 필요한가 — 마이그레이션만으로는 세션 안에서 늦다
 *
 * `calc-wizard-asset-migrate.ts`가 같은 정리를 하지만 그것은 **저장값 재수화 시점**에만
 * 돈다. 사용자가 지금 축을 바꾸면(청산금 방향 수령→납부, 원조합원→승계조합원) 카드가
 * 화면에서 사라지는데 값은 남고, ⑧ validate가 그 값을 근거로 차단한다 —
 * **채울 칸 없는 영구 차단**이다(memory `feedback_ui_gate_removes_sole_input_path`).
 * 새로고침해야 정상화되는 상태가 된다.
 *
 * ⇒ 축을 쓰는 onChange가 **같은 patch 문장에서** 이 함수의 결과를 함께 편다.
 *   ⚠️ 두 키를 따로 patch하면 stale spread로 뒤엣것이 앞엣것을 덮는다
 *      (memory `feedback_multikey_patch_stale_spread_overwrite`).
 *
 * @param next 축 변경이 **이미 반영된** 자산 (`{ ...asset, ...patch }`)
 */
export function clearOutOfScopeRedevPatch(next: AssetForm): Partial<AssetForm> {
  const patch: Partial<AssetForm> = {};

  if (!exemptionAtApprovalInScope(next)) {
    if (next.redevExemptionEligibleAtApproval) patch.redevExemptionEligibleAtApproval = "";
  }
  /**
   * 🔴 **자기선언과 다른 술어를 쓴다** (P6-c-3). 입주권에서는 자기선언이 범위 안이지만
   *    (판정 메뉴 소유 — 지우면 안 된다) ③-c 카드는 렌더되지 않으므로 이 둘은 범위 밖이다.
   *    한 술어로 묶으면 둘 중 하나가 반드시 깨진다 — `postApprovalHousingUseInScope` 주석 참조.
   */
  if (!postApprovalHousingUseInScope(next)) {
    if (next.redevPostApprovalHousingUse) patch.redevPostApprovalHousingUse = "";
    if (next.redevPostApprovalHousingUseEndDate) patch.redevPostApprovalHousingUseEndDate = "";
  }
  if (!postApprovalExpensesInScope(next) && next.redevPostApprovalExpenses) {
    patch.redevPostApprovalExpenses = "";
  }
  return patch;
}

/**
 * 「청산금 수령분 **단독 신고**」인가 — ④ API 변환·⑥ 사이드바 공용 술어 (C1-05).
 *
 * 이 모드에서는 **신고 단위가 청산금 수령액**이고 양도일이 소유권이전 고시일이다.
 * ④는 그 규칙대로 `transferPrice`를 바꿔 보내고 ⑦ 결과뷰도 같은 값을 표시하는데,
 * ⑥ 사이드바만 폼 원본(`actualSalePrice` = 계약 총액)을 읽어 자산 합계까지 그 값으로 채웠다
 * (실측 사이드바 1,200,000,000 vs ④ 300,000,000).
 *
 * ⚠️ **완공APT 전용이다** — 엔진의 receiveOnly 구현은 `computeAptReceive` 안에만 있어
 *    입주권(`subject === "right"`)에는 대응 산식이 없다. 가드 없이 양도가액만 바꾸면
 *    양도차익이 조용히 사라진다(`transfer-tax-api.ts`의 같은 주석 참조).
 * ⚠️ 승계조합원 입주권은 §166 페이로드 자체를 만들지 않으므로 대상이 아니다.
 */
export function isReceiveOnlyFiling(
  asset: Pick<
    AssetForm,
    "assetKind" | "redevSubject" | "redevReceiveOnlyMode" | "isSuccessorRightToMoveIn"
  >,
): boolean {
  const isRedevelopmentAsset =
    asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in";
  const isSuccessorRight =
    asset.assetKind === "right_to_move_in" && asset.isSuccessorRightToMoveIn === true;
  return (
    isRedevelopmentAsset &&
    !isSuccessorRight &&
    resolveRedevSubject(asset) === "apt" &&
    asset.redevReceiveOnlyMode === "yes"
  );
}
