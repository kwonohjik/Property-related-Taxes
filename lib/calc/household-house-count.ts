/**
 * 세대 보유 주택 수 — **명부가 정본, 스칼라는 간이 입력** (Q-8 · 계획서 §5.11)
 *
 * ## 🔴 종전에는 두 값이 갈려도 경고만 했다
 *
 * 계산기는 주택 수를 **두 경로**로 안다:
 *   ① `householdHousingCount` 스칼라 — 사용자가 「1 / 2 / 3+」 버튼으로 **선언**
 *   ④ `houses[]` 명부 — **다른** 보유 주택 목록(양도 대상은 빠져 있다)
 *
 * 둘이 어긋나도 `computeHouseCountDivergence`가 **경고만** 띄웠다(표시 전용). 그래서
 * 「① 5채 선언 + ④ 3채 입력」이 그대로 계산됐고, **어느 쪽으로 계산되는지는 소비처마다 달랐다**.
 *
 * ## 왜 지금 고치나 — D-6의 선행 조건이다
 *
 * §155⑥ 문화유산 · §155⑦ 농어촌 · §155⑧ 부득이는 전부 **주택 수 2**에서만 성립한다:
 *
 * | 술어 | 게이트 |
 * |---|---|
 * | `qualifiesRuralHouse` | `transfer-tax-exemption-requirements.ts:65` — `!== 2`면 false |
 * | `qualifiesUnavoidableOutsideCapital` | `:103` — 같다 |
 * | §155⑥ 문화유산 | `transfer-tax-exemption.ts:374` — `=== 2` |
 *
 * D-6이 이 사실들을 **명부 행**으로 옮기면 사용자는 그 주택을 **행으로 추가**한다. 그런데
 * 게이트는 여전히 스칼라를 본다 ⇒ **화면엔 입력이 있는데 특례가 조용히 불성립**한다.
 * 그래서 행 이관보다 **이 함수가 먼저**다(계획서 §5.10 「P6 선행 의존」).
 *
 * ## 🔑 왜 `declared`를 인자로 받나 — 기본값이 호출부마다 다르다 (실측)
 *
 * 한 함수가 스칼라 파싱까지 삼키면 **조용한 동작 변경**이 된다:
 *
 * | 호출부 | 현행 파싱 | 빈 문자열일 때 |
 * |---|---|---|
 * | ④ `transfer-tax-api.ts:417` | `parseInt(form.householdHousingCount) \|\| 0` | **0** |
 * | ⑤ `house-count-inputs-scope.ts:48` 등 | `parseInt(... \|\| "1", 10)` | **1** |
 *
 * ⑧이 빈 값을 차단하므로(`transfer-tax-validate.ts:438`) 실제 도달은 어렵지만,
 * **도달 불가를 근거로 규약을 바꾸지 않는다** — stale sessionStorage·이력 복원분은 그 경로를
 * 거치지 않는다. ⇒ 파싱은 호출부에 두고, 이 함수는 **명부 우선 규칙만** 담는다.
 *
 * ## 적용 범위 — 명부가 세대 주택 수의 정본인 자산만 (F1 게이트)
 *
 * 분양권 양도는 **제외된다**. §104①1호·3호 단일세율이고 세대 주택 수가 그 세율을 바꾸지
 * 않는다(계획서 §4-4, Q-11).
 *
 * `redevelopment_apt`(재개발 신축주택)는 **포함된다**(PR-B, 2026-10-05). 재개발 신축주택은
 * §94①1호 「건물」이자 §89①3호가목의 「주택」이라 `checkExemption` 경계에서 `housing`으로
 * 번역되어 §154① 판정을 그대로 받는다(`transfer-tax-redevelopment-apt-exemption.ts` 주석) —
 * 비과세 판정 축에서는 housing과 **같은 의미**다(§155① 일시적 2주택의 "그 주택"도 같다).
 * 종전에는 이 함수만 `=== "housing"` 단일 리터럴이라 재개발APT는 명부를 채워도 §154① 판정이
 * 원시 스칼라로 계산되는 「입력은 받는데 무시한다」 결함이 있었다(계획서 §2-1, memory
 * `feedback_ui_gate_removes_sole_input_path`의 변형).
 *
 * `right_to_move_in`(조합원입주권)도 **포함된다**(PR-C, 2026-10-05 · 계획서 §4-3). §89①4호
 * 가목·나목 판정이 쓰는 「세대 보유 주택 수」도 같은 명부(`houses[]`)가 정본이어야 한다 —
 * 종전에는 이 함수의 F1이 입주권을 아예 제외해 명부를 채워도(화면엔 입력란이 있었다) 판정은
 * 원시 스칼라만 보는 같은 종류의 결함이 있었고, 그 스칼라 위젯에는 "0채" 버튼조차 없어
 * 가목(전액 비과세)이 계산기에서 애초에 도달 불가였다. **오프셋만 다르다** — housing·
 * redevelopment_apt는 자신이 「주택」이라 `1 + rows`, right_to_move_in은 자신이 「주택」이
 * 아니라(§89①4호 가목 "다른 주택 0채") `0 + rows`다. 오프셋은 `houseCountSelfOffset`
 * 한 곳에서만 정한다(`usesHouseCountRoster`와 같은 파일).
 */
import { isOneHouseExemptionAsset, usesHouseCountRoster, houseCountSelfOffset } from "@/lib/calc/housing-like-asset";
import { deriveHouseholdRightCount } from "@/lib/tax-engine/one-house/house-count";
import type { PresaleRightEntry } from "@/lib/stores/calc-wizard-store";

/** 명부 행 중 **주택 수에 세는** 것 — 취득일이 있어야 한다(⑧이 조건 없이 요구한다). */
export interface HouseRowForCount {
  /** 명부 행 id — 조특법 주택 수 제외 행을 신규 주택 후보에서 뺄 때 쓴다(`excludedHouseIds`). */
  id?: string;
  acquisitionDate?: string;
  /** 법정동코드(10자리) — §155①2호 신규 주택 조정 여부 판정에만 쓴다(`resolveTemporaryTwoHouse`). */
  regionCode?: string;
}

/**
 * 양도일 현재 보유 주택인가 — 명부 행을 주택 수·신규 주택 후보·엔진 명부에 넣을지 가르는 **단일 술어** (D2).
 *
 * 🔑 **같은 날 취득한 주택은 양도일 현재 보유 주택이 아니다** — 동일자에 1주택을 취득하고 다른 1주택을
 *    양도하면 「양도한 후 취득한 것으로 본다」(서면인터넷방문상담4팀-1697 §155① · 재재산-836 §104·§162의2 ·
 *    서면인터넷방문상담5팀-354 · 재산세과-3316 교환). 그 뒤에 취득한 주택은 말할 것도 없다. 비과세(§154·§155)와
 *    중과(§104) 양쪽에 같은 규칙이다.
 * 🔴 종전에는 명부 행을 취득일과 양도일의 선후와 무관하게 전부 세어, 같은 날 갈아탄 일시적 2주택이
 *    3주택으로 과세됐다(해석례 평가셋 `E053-era`·`E055-era`).
 * 🔑 양도일이 없거나 형식이 아니면 거르지 않는다(종전 그대로) — 비교 기준이 없다. 문자열
 *    `YYYY-MM-DD`는 사전식 비교가 곧 시간순이다(폼 전역 규약).
 */
export function isOwnedAtTransfer(acquisitionDate: string | undefined, transferDate: string | undefined): boolean {
  if (!acquisitionDate || !transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return true;
  return acquisitionDate < transferDate;
}

/** 명부에서 양도일 현재 보유 주택 행만 — `isOwnedAtTransfer`. */
export function housesOwnedAtTransfer<T extends HouseRowForCount>(
  houses: readonly T[] | undefined,
  transferDate: string | undefined,
): T[] {
  return (houses ?? []).filter((h) => isOwnedAtTransfer(h.acquisitionDate, transferDate));
}

export interface ResolveHouseholdHousingCountArgs {
  /**
   * 양도 대표 자산 종류(`form.assets[0].assetKind`). `usesHouseCountRoster`(housing·
   * redevelopment_apt·right_to_move_in)일 때만 명부를 정본으로 쓴다(PR-B·PR-C, 2026-10-05).
   */
  primaryKind: string | undefined;
  /** 호출부가 **제 기본값 규칙으로** 파싱한 스칼라 값 (위 🔑 참조). */
  declared: number;
  /** ④ 다른 보유 주택 목록. */
  houses: readonly HouseRowForCount[] | undefined;
  /** 양도일 — 그날 이후(같은 날 포함) 취득한 행은 세지 않는다(`isOwnedAtTransfer`). 필수: 빠뜨린 호출부를 컴파일러가 찾는다. */
  transferDate: string | undefined;
  /**
   * OH-34 레거시 표식(`form.legacyHouseCountPrecedence`). 켜져 있으면 **명부보다 스칼라가 앞선다**.
   *
   * ⚠️ **optional 로 두지 않는다** — 빠뜨린 호출부가 조용히 「레거시 아님」으로 동작하면
   *    그 경로만 세액이 달라진다. 필수로 두어 컴파일러가 전 호출부를 찾게 한다
   *    (이 계획서가 `provisoGate` 인자를 `string`→`number`로 바꿀 때 쓴 것과 같은 기법).
   */
  legacyPrecedence: boolean;
}

/**
 * 명부에 주택 행이 있으면 **명부 기준**, 없으면 **스칼라**.
 *
 * 산식은 새로 만들지 않는다 — `computeHouseCountDivergence`의 `structuralCount`
 * (= 1(양도 주택) + 취득일 있는 다른 주택 행 수)를 **판정의 정본으로 승격**한 것이다.
 * 분양권·입주권은 세지 않는다(F7 — ①은 「주택」만 센다).
 *
 * D-4 유지: 1주택자는 명부를 채울 필요가 없다 ⇒ 명부가 비면 스칼라가 그대로 답이다.
 *
 * ⚠️ **명부 필수화(PR-1) 이후에도 이 함수는 건드리지 않는다.** `houses` 없이 `householdHousingCount`
 *    스칼라만으로 중과를 판정하는 「명부 없음」 엔진 경로(#1947·#1955·#1958·#1965·#1968)가 이 분기에
 *    의존한다 — API 직접 호출자는 지금도 명부 없이 보낼 수 있고(Q-8, 계획서 §2-8 「영향」), 그 경우
 *    「모름 → 불리」로 처리하는 것이 그 기능들의 설계다. PR-1이 막는 것은 **계산기 UI**가 이 경로를
 *    만드는 것뿐이다(Step4 위젯 제거 + ⑧ 차단) — 이 leaf 자체의 산식은 바꾸지 않는다.
 *
 * OH-34: 레거시 표식이 켜진 폼은 **저장 당시 스칼라**를 그대로 쓴다(세액 보존) —
 * 사용자가 「명부 기준으로 전환」을 누를 때만 표식이 꺼지고 명부로 센다.
 */
export function resolveHouseholdHousingCount(
  args: ResolveHouseholdHousingCountArgs,
): number {
  if (args.legacyPrecedence) return args.declared; // OH-34 세액 보존
  if (!usesHouseCountRoster(args.primaryKind)) return args.declared; // F1
  const rows = countedHouseRows(args.houses, args.transferDate);
  if (rows === 0) return args.declared; // D-4 간이 입력(계산기는 ⑧이 이 분기 도달을 막는다)
  return houseCountSelfOffset(args.primaryKind) + rows;
}

/** 주택 수에 세어지는 명부 행 수 — 산식 단일 소스(`house-count-divergence.ts`도 이걸 쓴다). */
export function countedHouseRows(
  houses: readonly HouseRowForCount[] | undefined,
  /** 양도일 — 그날 이후(같은 날 포함) 취득한 행은 세지 않는다(`isOwnedAtTransfer`). */
  transferDate: string | undefined,
): number {
  return housesOwnedAtTransfer(houses, transferDate).filter((h) => h.acquisitionDate).length;
}

/** 명부가 주택 수의 정본인가 — 화면이 스칼라 버튼을 비활성화할지 판단하는 데 쓴다. */
export function houseRosterIsAuthoritative(
  primaryKind: string | undefined,
  houses: readonly HouseRowForCount[] | undefined,
  transferDate: string | undefined,
): boolean {
  return usesHouseCountRoster(primaryKind) && countedHouseRows(houses, transferDate) > 0;
}

/**
 * 명부를 바꾸는 patch 에 **파생 주택 수를 함께 싣는다** — ⑤ 게이트 정합의 단일 지점.
 *
 * ## 왜 스칼라를 따라 쓰나 (실측 2026-09-22)
 *
 * ④·⑧ 은 `resolveHouseholdHousingCount` 로 **명부를 정본**으로 보지만, **화면 게이트 ⑤ 는
 * 스칼라를 원시로 읽는다**(`house-count-inputs-scope.ts:62·75·91` ·
 * `temporary-two-house-section-scope.ts:54` · `grace-period-scope.ts:48` · Step4 4곳).
 * 그래서 두 값이 갈리면 **엔진과 화면이 서로 다른 주택 수로 동작**했다:
 *
 * | 겸용주택 · 선언 1채 + 명부 2채 | 값 |
 * |---|---|
 * | ④ 일반 · ⑧ (leaf 경유) | **3채** |
 * | ④ 겸용 `isOneHouseExempt` (원시 스칼라) | **true = 1주택 비과세 부여** |
 * | ⑤ 3주택·2주택·장기임대 섹션 | **전부 닫힘** |
 *
 * ⑧ 은 빈 값만 막으므로(`transfer-tax-validate.ts:439`) 이 상태가 그대로 계산된다.
 *
 * ⇒ 게이트를 층마다 고치는 대신 **스칼라를 명부의 파생값으로 맞춰** 한 값만 남긴다.
 *   `useEffect → store` 미러링이 아니라 **onChange 동시 갱신**이다(CLAUDE.md 승인 패턴).
 *
 * ⚠️ 명부를 **비우면** 파생이 성립하지 않는다(D-4 간이 입력으로 복귀) ⇒ 스칼라는 마지막
 *    파생값 그대로 남는다. 임의 값을 써넣지 않는다 — 몇 채인지 알 수 없다. 계산기는 이 상태를
 *    「다른 보유 주택이 없습니다」 확정(아래) 없이는 ⑧이 통과시키지 않는다(명부 필수화 PR-1).
 *
 * ⚠️ 행이 **생기면**(배열 길이 > 0 — 취득일 입력 여부와 무관, `houseRosterIsAuthoritative`의
 *    `countedHouseRows > 0` 요건보다 느슨하다) 「다른 보유 주택이 없습니다」 확정
 *    (`householdNoOtherHousesConfirmed`)을 함께 해제한다(Q-5, #1919 패턴) — 새로 추가한 빈 행은
 *    아직 취득일이 없어 `countedHouseRows`엔 안 잡히지만, 그 순간 「없음」은 더는 사실이 아니다.
 *    이 patch가 세 쓰기 지점(추가·삭제·수정)의 단일 경유점이라 여기 한 곳만 고치면 된다.
 */
export function housesPatchWithDerivedCount<T extends HouseRowForCount>(
  houses: T[],
  primaryKind: string | undefined,
  legacyPrecedence: boolean,
  transferDate: string | undefined,
): { houses: T[]; householdHousingCount?: string; householdNoOtherHousesConfirmed?: false } {
  // OH-34: 레거시 표식이 켜져 있으면 **스칼라를 건드리지 않는다**. 명부를 보완하는 도중에
  // 저장 당시 값이 덮여 사라지면 「전환할 때만 명부로 센다」는 약속이 깨진다.
  if (legacyPrecedence) return { houses };
  const isRosterKind = usesHouseCountRoster(primaryKind);
  const clearConfirm = isRosterKind && houses.length > 0 ? { householdNoOtherHousesConfirmed: false as const } : {};
  if (!houseRosterIsAuthoritative(primaryKind, houses, transferDate)) return { houses, ...clearConfirm };
  return {
    houses,
    householdHousingCount: String(houseCountSelfOffset(primaryKind) + countedHouseRows(houses, transferDate)),
    ...clearConfirm,
  };
}

/**
 * OH-34 — **복원된 이력에 레거시 표식을 붙일 것인가**.
 *
 * 저장 당시 스칼라가 명부 파생값과 **어긋난** record 를 다시 계산하면 세액이 바뀐다
 * (P7-2 이후 비과세·장특 표2 판정도 명부를 쓴다 — 계획서 OH-33). 조용히 바꾸지 않는다.
 *
 * ⚠️ 복원은 `updateFormData` **shallow merge** 다(`transfer-resume-entry.ts:136`).
 *    직전 폼의 표식이 그대로 남을 수 있으므로 호출부는 **false 도 반드시 써야** 한다
 *    — 「어긋나면 켠다」만 하면 깨끗한 record 가 앞 폼의 표식을 물려받는다.
 */
export function houseCountDivergedFromRoster(
  primaryKind: string | undefined,
  houses: readonly HouseRowForCount[] | undefined,
  declared: number,
  transferDate: string | undefined,
): boolean {
  if (!houseRosterIsAuthoritative(primaryKind, houses, transferDate)) return false;
  return declared !== houseCountSelfOffset(primaryKind) + countedHouseRows(houses, transferDate);
}

/**
 * 스칼라 버튼을 잠그는가 — **명부가 정본이고, 선언값이 이미 그 파생값과 같을 때만**.
 *
 * 잠금은 「이미 정합된 값을 고정」하는 것이지 「어긋난 값을 가두는」 것이 아니다.
 * 구 이력·stale sessionStorage 로 복원된 폼은 명부 편집(`housesPatchWithDerivedCount`)을
 * 거치지 않아 선언값이 어긋난 채 올 수 있다 — persist 마이그레이션은 이 조합을 backfill
 * 하지 않는다([[feedback_new_asset_field_stale_sessionstorage_guard]]). 그때까지 잠그면
 * **맞출 화면이 사라지는 dead-end** 가 된다(이 저장소가 반복해서 밟은 실패모드).
 *
 * ⇒ 어긋나 있으면 **열어 두고** 불일치 경고(`computeHouseCountDivergence`)가 안내한다.
 *   사용자가 파생값으로 맞추는 순간 잠긴다.
 */
export function houseCountScalarLocked(
  primaryKind: string | undefined,
  houses: readonly HouseRowForCount[] | undefined,
  declared: number,
  transferDate: string | undefined,
): boolean {
  if (!houseRosterIsAuthoritative(primaryKind, houses, transferDate)) return false;
  return declared === houseCountSelfOffset(primaryKind) + countedHouseRows(houses, transferDate);
}

/**
 * §155① 일시적 2주택 — **신규 주택을 명부에서 도출**한다 (2026-09-22).
 *
 * ## 🔴 종전에는 사용자 토글이 적용 여부를 갈랐다
 *
 * ④ 변환(`buildHouseholdSpecialPayload`)은 `temporaryTwoHouseSpecial` **토글**과 폼-전역
 * `newHouseAcquisitionDate`가 **둘 다** 있어야 `temporaryTwoHouse`를 만들었다. 그래서:
 *
 * | 실측(2주택 · 양도주택 2017-08-31 · 명부 2024-05-30 · 양도 2026-09-30) | 판정 |
 * |---|---|
 * | 토글 OFF — 요건은 전부 충족 | **과세** ← 명부에 사실이 다 있는데 |
 * | 토글 ON + 날짜 2024-05-30 | 비과세 |
 * | 토글 ON + **명부와 다른** 날짜 2026-01-01 | **비과세** ← 명부를 무시하고 그 값으로 판정 |
 *
 * 두 가지가 동시에 잘못이다. ①은 **법령에 없는 요건**을 만든 것이고 — 소령 §155①은
 * 「…경우에는 이를 1세대1주택으로 **보아** 제154조제1항을 적용한다」는 강행규정이라 납세자의
 * 신청·선택을 요건으로 하지 않는다(신고서 제출을 요구하는 항은 ⑬뿐이고 그것도 ⑦ 전용이다)
 * — ②는 `newHouseAcquisitionDate`가 명부와 **두 번째 진실**이라 어긋나도 아무도 잡지 못한 것이다
 * (주택 수 스칼라↔명부 괴리와 같은 구조 — PR #1757).
 *
 * ## 도출 규칙 — 「양도주택보다 나중 취득한 행이 **정확히 1채**」
 *
 * §155①의 신규 주택은 「그 주택을 양도하기 전에 취득한 **다른 주택**」이다. 명부에서 양도주택
 * 취득일보다 **나중에 취득한** 행이 하나뿐이면 그것이 신규 주택이고, 모호성이 없다.
 * 2주택(명부 1채)은 언제나 이 경우이고, 합가 중첩 3주택도 대개 그렇다(배우자 보유분은
 * 합가 전 취득이라 앞선다).
 *
 * 🔑 **0채·2채 이상이면 도출하지 않는다.** 어느 것이 신규 주택인지 억측으로 고르지 않는다
 *    (`feedback_no_silent_apportion_fallback` — 자동 안분 fallback 금지와 같은 층위).
 *    `HouseEntry`에는 이를 가릴 단서가 없다(취득일뿐 — 처분 예정일도 신규주택 플래그도 없다).
 *
 * 🔑 **1년·3년 요건은 여기서 보지 않는다.** 엔진(`evaluateTemporaryTwoHouseTiming`)이 §155⑯·⑱·
 *    조정대상지역 처분기한까지 반영해 판정하는 정본이다. 여기서 미리 거르면 두 벌이 된다.
 *
 * ## 폴백 — 명부가 정본이 아닐 때는 **종전 그대로**
 *
 * 계산기에서 명부는 비어 있을 수 있다(위 `resolveHouseholdHousingCount`의 D-4 — 「1주택자는
 * 명부를 채울 필요가 없다」). OH-34 레거시 표식이 켜진 폼도 스칼라가 앞선다. 그 경로까지
 * 명부 전용으로 바꾸면 **「스칼라 3채 + 명부 0건」 폼에서 §155①이 영구 미적용**된다.
 * ⇒ 도출이 성립하지 않으면 종전 flat 필드(`temporaryTwoHouseSpecial` + `newHouseAcquisitionDate`)를
 *   그대로 쓴다. 레거시 이력·간이 입력이 이 경로로 계속 동작한다.
 */
export interface ResolveTemporaryTwoHouseArgs {
  /**
   * 양도 대표 자산 종류 — `isOneHouseExemptionAsset`(housing·redevelopment_apt)일 때만
   * 명부를 정본으로 쓴다(Q-12). ⚠️ **PR-C에서도 넓히지 않는다** — `right_to_move_in`은
   * `usesHouseCountRoster`에 들어가 세대 주택 수 명부가 §89①4호 가목·나목 판정에는 쓰이지만,
   * §155① 일시적 2주택 자체는 **주택 양도**에만 성립하는 특례이고 입주권 양도는 그 조문의
   * 적용 대상이 아니다(나목의 N년 기한은 이미 `oneRightClauseNaYears`가 별도로 판정한다).
   */
  primaryKind: string | undefined;
  /** 양도 대상 주택(= 종전주택) 취득일 `YYYY-MM-DD`. */
  primaryAcquisitionDate: string | undefined;
  houses: readonly HouseRowForCount[] | undefined;
  /**
   * 양도일 — 그날 이후(같은 날 포함) 취득한 행은 신규 주택 후보가 아니다(`isOwnedAtTransfer`). 같은 날
   * 갈아탄 주택이 후보에 남으면 「나중 취득 행이 정확히 1채」가 깨진다(E053·E055). 필수.
   */
  transferDate: string | undefined;
  /** OH-34 레거시 표식 — 켜져 있으면 명부를 보지 않는다. */
  legacyPrecedence: boolean;
  /** 종전 flat 필드 — 도출이 성립하지 않을 때만 쓰인다. */
  declaredSpecial: boolean;
  declaredNewHouseDate: string | undefined;
  /**
   * 조특법(§99의4·§98의9·보유 감면주택)으로 **소유주택으로 보지 않는** 명부 행 id —
   * `eligibleCountExcludedHouseIds`(`lib/calc/house-count-exclusion-rows.ts`)가 만든다.
   *
   * 🔴 이 행을 후보에 남기면 「나중 취득 행이 정확히 1채」가 깨져 §155①이 성립하지 않는다.
   *    농어촌주택을 보유한 일시적 2주택 세대가 과세로 떨어진 실측(계획서 §2-3 P2)이 그것이다 —
   *    국세청은 이 경우 1주택으로 보아 비과세한다(서면-2021-부동산-6220 · 사전-2021-법령해석재산-0072).
   * 🔑 **필수 인자다** — 호출부가 새로 생겨도 넘기지 않으면 컴파일이 막힌다.
   */
  excludedHouseIds: ReadonlySet<string>;
}

export interface TemporaryTwoHouseDates {
  previousAcquisitionDate: string;
  newAcquisitionDate: string;
  /** 어디서 왔는가 — 화면이 「명부에서 자동 판정」과 「직접 선언」을 구분해 안내한다. */
  source: "roster" | "declared";
  /**
   * 신규 주택 법정동코드 — 명부 행 주소가 있을 때만(§155①2호 「조정대상지역에 있는 신규 주택」 정밀
   * 판정). 직접 선언 경로에는 신규 주택 주소가 없다.
   */
  newHouseRegionCode?: string;
}

export function resolveTemporaryTwoHouse(
  args: ResolveTemporaryTwoHouseArgs,
): TemporaryTwoHouseDates | undefined {
  const prev = args.primaryAcquisitionDate;

  const fallback = (): TemporaryTwoHouseDates | undefined =>
    args.declaredSpecial && prev && args.declaredNewHouseDate
      ? {
          previousAcquisitionDate: prev,
          newAcquisitionDate: args.declaredNewHouseDate,
          source: "declared",
        }
      : undefined;

  if (args.legacyPrecedence) return fallback(); // OH-34 세액 보존
  if (!isOneHouseExemptionAsset(args.primaryKind)) return fallback(); // F1 — 권리 양도는 축이 다르다
  if (!prev) return fallback(); // 비교 기준이 없으면 「나중 취득」을 가릴 수 없다

  // 문자열 `YYYY-MM-DD`는 사전식 비교가 곧 시간순이다(폼 전역 규약).
  const later = housesOwnedAtTransfer(args.houses, args.transferDate).filter(
    (h) =>
      h.acquisitionDate !== undefined &&
      h.acquisitionDate > prev &&
      !(h.id !== undefined && args.excludedHouseIds.has(h.id)),
  );
  if (later.length !== 1) return fallback(); // 0채·2채 이상 — 억측으로 고르지 않는다

  return {
    previousAcquisitionDate: prev,
    newAcquisitionDate: later[0].acquisitionDate!,
    source: "roster",
    ...(later[0].regionCode ? { newHouseRegionCode: later[0].regionCode } : {}),
  };
}

/** §155①이 성립하는가 — `provisoGate` 등 boolean 하나만 필요한 호출부용 얇은 래퍼. */
export function temporaryTwoHouseApplies(args: ResolveTemporaryTwoHouseArgs): boolean {
  return resolveTemporaryTwoHouse(args) !== undefined;
}

/**
 * 세대 보유 조합원입주권 수 (§89①4호 본문 「조합원입주권을 1개 보유한 1세대」) — PR-D
 * (2026-10-05, 계획서 `docs/00-pm/roster-required-other-assets.plan.md` §4-6·Q-20).
 *
 * ## 종전에는 이중 입력이었다
 *
 * 입주권 양도 화면의 「세대 보유 조합원입주권 수」 숫자 칸(0/1/2+, `householdRightCount`)이
 * §89①4호 가목·나목 판정의 **유일한** 입력이었다. 같은 화면의 「분양권·입주권」 목록
 * (`presaleRights`)에서도 종류로 「조합원입주권」(`type: "redevelopment_right"`)을 고를 수
 * 있었지만, 판정은 그 목록을 쓰지 않았다 — 목록에 다른 입주권을 추가해도 숫자 칸이 "1"이면
 * 그대로 「1개 보유」로 판정됐다(PR-1 이전 「세대 보유 주택 수」와 같은 종류의 스칼라-명부 괴리).
 *
 * ## 도출 — **양도 대상 입주권 1개 + 목록의 조합원입주권 항목 수**
 *
 * 판정 메뉴(`app/api/calc/one-house-exemption/route.ts:176`)가 이미 같은 사실로 같은 값을
 * 도출한다(`deriveHouseholdRightCount`, `lib/tax-engine/one-house/house-count.ts`) — 재사용한다
 * (`single-source-engine-helper`). 새로 정의하지 않는 이유는 산식이 **완전히 같기 때문**이다.
 *
 * 법령 확인(2026-10-05, KoreanLaw MCP, 소득세법 §89①4호 본문 — [시행 2026-01-01]):
 * 「조합원입주권을 **1개** 보유한 1세대[…현재 제3호가목에 해당하는 기존주택을 소유하는
 * 세대]가 다음 각 목의 어느 하나의 요건을 충족하여 양도하는 경우…」 — 조합원입주권을
 * **몇 개 보유하는지 세는 데는 취득일 제한이 없다**. 분양권 보유에 걸리는 2022-01-01 취득일
 * 부칙(법률 제18578호 부칙 §7②③, `oneRightPresaleRightBlocks`)은 가·나목의 **분양권 배제**
 * 축에만 적용되고, 조합원입주권 개수를 세는 이 축과는 무관하다.
 *
 * ⚠️ 분양권(`type: "presale_right"`)은 세지 않는다 — §89①4호 본문이 조합원입주권 개수만
 *    묻는다. 분양권 보유 여부는 가·나목이 **따로** 묻는 축이다(`oneRightPresaleGate`).
 *
 * ⚠️ **legacy 예외를 받지 않는다**(Q-14, 2026-10-05) — 사용자 확인: 이 필드(`householdRightCount`
 *    스칼라)를 쓴 기존 저장 기록이 없다. 오래된 sessionStorage에 그 스칼라가 남아 있더라도
 *    이 함수는 아예 읽지 않으므로 **항상 새 도출이 이긴다**(OH-34처럼 저장 당시 값을 보존하는
 *    레거시 분기를 두지 않는다).
 */
export function resolveHouseholdRightCount(
  primaryKind: string | undefined,
  presaleRights: readonly Pick<PresaleRightEntry, "type">[] | undefined,
): number {
  return deriveHouseholdRightCount(presaleRights, primaryKind === "right_to_move_in");
}

/**
 * 분양권·입주권 목록 patch — **「없음」 확정을 함께 해제한다**(Q-17, #1919 패턴과 같은 모양).
 *
 * `housesPatchWithDerivedCount`와 같은 이유다 — 행이 생기면(배열 길이 > 0) 그 순간 「없음」은
 * 더는 사실이 아니다. 줄어서 다시 0행이 돼도 **자동으로 재확정하지 않는다**(houses와 동일 —
 * 「모름 → 유리」 자동 추론 금지, `feedback_unknown_fact_applies_unfavorably`와 같은 층위).
 */
export function presaleRightsPatchWithConfirmClear<T>(
  next: T[],
): { presaleRights: T[]; householdNoPresaleRightsConfirmed?: false } {
  if (next.length > 0) return { presaleRights: next, householdNoPresaleRightsConfirmed: false };
  return { presaleRights: next };
}
