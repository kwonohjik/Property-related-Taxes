# 재개발 완공 아파트 — 「양도시·취득시 기준시가」 입력 칸이 ㎡당 단가 × 면적 형식인 문제

> **출처**: `redev-successor-apt-estimate.plan.md`(#2940)의 별건 후보 2. #2940은 승계 매매 추계의 「취득시 기준시가」 칸만 총액 칸으로 고쳤다(`CompanionAcqPurchaseBlock.types.ts`의 `toPropertyKind`).
> **깊이**: L2. 입력 위젯 모양과 공시가격 조회 종류만 바뀐다. 엔진·④·⑧·⑫와 세액은 바뀌지 않는다.

## 0. 결론

1. **지금**: 재개발 완공 APT의 **양도시 기준시가**(함께 양도 안분 · 부담부증여)와 부담부증여의 **취득시 기준시가**가 「㎡당 단가 + 면적 + 총액」 칸 셋으로 뜬다. 주택은 총액 칸 하나다. 완공 APT는 공동주택이라 공동주택가격 총액을 받는 것이 맞다.
2. **원인**: 입력 위젯 `StandardPriceInput`의 모양을 정하는 함수 `toPropertyKind`가 **두 벌**이다.
   - `CompanionAcqPurchaseBlock.types.ts`의 것은 재개발 APT를 공동주택으로 돌려준다(#2940에서 고침).
   - `CompanionSaleModeBlock.tsx`의 것은 `housing`·`land` 외에는 전부 비주거 건물로 돌려준다. 호출부 `AssetSectionTransfer`가 재개발 APT를 미리 `"building"`으로 접어서 넘긴다(`asset-sections/AssetSectionTransfer.tsx:165`, `:267`). 이 함수를 쓰는 곳이 4군데다.
3. **부작용 둘**(1장 실측 · 코드 확인):
   - 화면: 단가·면적 칸이 뜨지만 엔진은 총액 하나만 읽는다(`transfer-tax-api-burdened-gift.ts:579` 주석 「housing / building / commercial_building / redevelopment_apt: 단일 공시가격」). 단가·면적은 계산에 쓰이지 않는다.
   - 조회: 비주거 건물은 위젯 안에서 `propertyType "land"`로 바뀌어 공시가격 조회가 **개별공시지가 조회** 경로로 간다(`StandardPriceInput.tsx:75-77` · `:173`). 공동주택가격 조회(동·호)가 아니다. 값 자체를 조회해 본 것은 아니다 → V-1.
4. **권장**: Q-1 (a) 네 군데 모두 총액 칸으로(단일 소스 함수 한 곳 수정) · Q-2 (a) 이미 저장된 단가·면적은 그대로 둔다.
5. **작업량**: 결정 후 약 2시간. 함수 1곳 + 호출부 접힘 2곳 + 렌더 anchor + E2E 1건.

## 1. 실측 (2026-11-06 · probe `keep/probe-v35.test.tsx`)

`AssetSectionTransfer`를 자산 종류만 바꿔 렌더하고 입력 칸 이름을 모았다(양도일 2025-06-01, 안분 모드).

| 모드 | 자산 종류 | 양도시 기준시가 칸 |
|---|---|---|
| 일반 양도 · 함께 양도 안분 | 주택 | 총액 칸 하나 |
| 〃 | **재개발 APT** | **㎡당 단가 · 면적 · 총액** (입력 6개) |
| 〃 | 상업용 건물 | ㎡당 단가 · 면적 · 총액 (맞다) |
| 〃 | 토지 | ㎡당 단가 · 면적 · 총액 (맞다) |
| 부담부증여 · 기준시가 평가 | 주택 | 양도시 총액 · 취득시 총액 |
| 〃 | **재개발 APT** | **양도시: 단가 · 면적 · 총액 / 취득시: 단가 · 면적 · 총액** |

- 부담부증여 재개발 APT에서 취득시 기준시가를 요구하는 판정은 `needsBgAcqStdPriceInput` = true(주택과 같다).
- 엔진에 실리는 값: 토지만 `단가 × 면적`으로 도출된다(`resolveBgAcqStdPrice` — `assetKind !== "land"`이면 총액만, `burdened-gift-acq-std-price.ts:105-111`). 재개발 APT는 총액만 쓴다.
- `toPropertyKind`(`CompanionSaleModeBlock.tsx`)를 쓰는 곳: `CompanionSaleModeBlock` 안의 안분 칸 · `AssetSectionTransfer:267`(부담부증여 취득시) · `BurdenedGiftTrancheBasisBlock:68`(지분별 취득시, 이 칸의 호출부도 `"building"`으로 접는다) · 위 :165의 양도시 칸.

## 2. 설계 (Q 권장안 기준)

1. **`toPropertyKind`**(`CompanionSaleModeBlock.tsx`): 입력 종류 목록에 `"redevelopment_apt"`를 더하고 `"house_apart"`를 돌려준다. 다른 종류의 반환은 그대로다.
2. **호출부 접힘 제거**: `AssetSectionTransfer`의 `:165`(양도시)와 `:267`(취득시), `BurdenedGiftTrancheBasisBlock:68`에서 재개발 APT를 `"building"`으로 접던 분기를 풀고 `"redevelopment_apt"`를 넘긴다. 상업용·일반건물은 계속 `"building"`이다.
3. **같은 칸 이름을 두 함수가 따로 갖지 않게** — 두 `toPropertyKind`를 한 함수로 합치는 것은 이번 범위가 아니다(Surgical). 한쪽 JSDoc의 「복제하지 말 것」 문구에 두 번째 함수가 이미 있다는 사실을 한 줄로 적는다.
4. **④·⑧·⑫·엔진**: 바꾸지 않는다. 단가·면적 칸이 사라져도 총액 칸은 `standardPriceAtTransfer`·`standardPriceAtAcq`를 그대로 쓴다.

## 3. 결정 게이트

### Q-1 범위

- (a) **네 군데 모두**(권장) — 단일 함수의 한 줄과 호출부 접힘 3곳이라 같은 원인이 한 번에 사라진다. 부담부증여 칸만 고치면 같은 물건의 안분 칸이 다른 모양으로 남는다.
- (b) 안분 양도시 칸만 — 부담부증여 두 칸은 남는다.

### Q-2 이미 저장된 단가·면적 값

- (a) **그대로 둔다**(권장) — 재개발 APT에서 엔진·④·⑧이 단가·면적을 읽지 않는다. 총액은 이미 `standardPriceAtTransfer`에 저장돼 있다.
- (b) 칸이 사라질 때 지운다 — 저장 구조를 건드리고, 지울 이유가 없다.

## 4. 미검증 레지스터

| ID | 항목 | 검증 | 상태 |
|---|---|---|---|
| V-1 | 재개발 APT의 공시가격 조회가 지금 개별공시지가 경로로 가는가, 바꾸면 공동주택가격(동·호) 조회로 가는가 | 착수 시 `lookup` 호출 인자를 anchor로 단언(외부 호출은 mock) | 코드로만 확인(`propertyType "land"`) — 실측 미착수 |
| V-2 | 재개발 APT에서 `standardPricePerSqmAtTransfer`·`transferArea`·`standardPricePerSqmAtAcq`·`acquisitionArea`를 읽는 곳이 ④⑧ 어디에도 없는가 | 전수 grep(`lib/calc`) — 지금까지 본 곳: `burdened-gift-acq-std-price.ts`(토지만) · `transfer-tax-api-burdened-gift.ts:518-530`(토지만) · `transfer-tax-api-helpers.ts:416`(수용 적격 종류만) · `transfer-tax-validate-bg-house-split.ts:37-49`(주택·토지 분리 경로) | 부분 확인 — `validate-bg-house-split`이 재개발 APT를 받는지는 착수 시 확인 |
| V-3 | 승계 매매 추계의 「취득시 기준시가」(이미 총액 칸)와 이 칸들이 같은 모양이 되는가 | 렌더 anchor | 미착수 |
| V-4 | 같은 물건의 취득·양도 칸이 서로 다른 모드로 갈린다는 기존 가드가 이 변경에 반응하는가 | `__tests__` grep(2026-11-06): `toPropertyKind`를 참조하는 테스트는 `basic-info-building-area.anchor.test.ts` 하나뿐이고, 그 안의 호출은 `CompanionAcqPurchaseBlock.types`의 함수(주택·토지 시료)다. 재개발 APT 시료로 `CompanionSaleModeBlock` 쪽을 고정하는 테스트는 없다 | ✅ 반전할 단언 없음. 새 단언은 착수 시 anchor |
