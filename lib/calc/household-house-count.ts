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
 * ## 적용 범위 — 주택 양도만 (F1 게이트)
 *
 * 입주권·분양권 양도에서 스칼라는 「**양도 권리를 뺀** 주택 수」라 의미 축이 다르다
 * (`house-count-divergence.ts` F1 주석). 그 축에 명부 규칙을 얹으면 1채 어긋난다 — 현행 유지.
 *
 * ⚠️ `redevelopment_apt`도 제외된다. `isHousingLike`(4종)가 아니라 **F1과 같은 `=== "housing"`**
 *    을 쓴다 — 넓히려면 그 축의 의미를 먼저 실측할 것(넓히기는 나중에도 되지만, 좁히기는
 *    이미 계산되던 값을 바꾼다).
 */

/** 명부 행 중 **주택 수에 세는** 것 — 취득일이 있어야 한다(⑧이 조건 없이 요구한다). */
export interface HouseRowForCount {
  acquisitionDate?: string;
}

export interface ResolveHouseholdHousingCountArgs {
  /** 양도 대표 자산 종류(`form.assets[0].assetKind`). `"housing"`일 때만 명부를 정본으로 쓴다. */
  primaryKind: string | undefined;
  /** 호출부가 **제 기본값 규칙으로** 파싱한 스칼라 값 (위 🔑 참조). */
  declared: number;
  /** ④ 다른 보유 주택 목록. */
  houses: readonly HouseRowForCount[] | undefined;
}

/**
 * 명부에 주택 행이 있으면 **명부 기준**, 없으면 **스칼라**.
 *
 * 산식은 새로 만들지 않는다 — `computeHouseCountDivergence`의 `structuralCount`
 * (= 1(양도 주택) + 취득일 있는 다른 주택 행 수)를 **판정의 정본으로 승격**한 것이다.
 * 분양권·입주권은 세지 않는다(F7 — ①은 「주택」만 센다).
 *
 * D-4 유지: 1주택자는 명부를 채울 필요가 없다 ⇒ 명부가 비면 스칼라가 그대로 답이다.
 */
export function resolveHouseholdHousingCount(
  args: ResolveHouseholdHousingCountArgs,
): number {
  if (args.primaryKind !== "housing") return args.declared; // F1
  const rows = countedHouseRows(args.houses);
  if (rows === 0) return args.declared; // D-4 간이 입력
  return 1 + rows;
}

/** 주택 수에 세어지는 명부 행 수 — 산식 단일 소스(`house-count-divergence.ts`도 이걸 쓴다). */
export function countedHouseRows(
  houses: readonly HouseRowForCount[] | undefined,
): number {
  return (houses ?? []).filter((h) => h.acquisitionDate).length;
}

/** 명부가 주택 수의 정본인가 — 화면이 스칼라 버튼을 비활성화할지 판단하는 데 쓴다. */
export function houseRosterIsAuthoritative(
  primaryKind: string | undefined,
  houses: readonly HouseRowForCount[] | undefined,
): boolean {
  return primaryKind === "housing" && countedHouseRows(houses) > 0;
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
 *    파생값 그대로 남고 버튼이 다시 열린다. 임의 값을 써넣지 않는다 — 몇 채인지 알 수 없다.
 */
export function housesPatchWithDerivedCount<T extends HouseRowForCount>(
  houses: T[],
  primaryKind: string | undefined,
): { houses: T[]; householdHousingCount?: string } {
  if (!houseRosterIsAuthoritative(primaryKind, houses)) return { houses };
  return { houses, householdHousingCount: String(1 + countedHouseRows(houses)) };
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
): boolean {
  if (!houseRosterIsAuthoritative(primaryKind, houses)) return false;
  return declared === 1 + countedHouseRows(houses);
}
