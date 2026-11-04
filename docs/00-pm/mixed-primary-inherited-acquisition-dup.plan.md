# 주 자산 겸용주택 묶음 — 상속·증여 평가액이 파트 카드마다 전액 취득가액으로 중복 (계획서)

- 작성 2026-11-04 · base master `98c68d024` · 워크트리 `Property-related-Taxes-mpi` · 브랜치 `docs/mixed-primary-inherited-acq-plan`
- 선행: `mixed-use-inherit-same-household-holding.plan.md`(#2892) V-1 관찰 「주 자산 겸용 + 컴패니언 토지 배치에서 겸용 파트 양도차익 음수」
- 수치는 모두 mock 세율 실측이다(route 경유 `callTransferTaxAPI` → `POST` · throwaway probe — 실행 후 삭제). 금액 단위는 원이다.

## 0. 문제

상속 · 증여로 취득한 겸용주택을 **주 자산**으로 두고 다른 부동산과 함께 양도하면, 겸용 파트 카드 4장이 **카드마다 자산 전체의 상속 · 증여 평가액을 취득가액으로 다시 뺀다**. 양도차익이 전부 차손이 되어 세액이 0이 된다. 같은 물건을 **컴패니언**(둘째 자산)으로 두면 정상이다.

`「소득세법 시행령」` §163⑨는 상속 · 증여 자산의 취득가액을 상속개시일 · 증여일 현재 평가액으로 본다. 겸용은 겸용 엔진이 그 값을 주택분 · 상가분으로 나눠 이미 넣는다(`lib/tax-engine/transfer-tax-mixed-use-housing-acq.ts` · `transfer-tax-mixed-use-commercial.ts`의 `inheritedAcquisitionDetail`). 파트 카드가 자산 전체 값을 또 쓰면 **같은 취득가액을 카드 수만큼 중복 차감**한다.

## A. 실측

공통: 겸용(주택 100㎡ · 상가 60㎡ · 대지 200㎡ · 비조정) + 토지(매매 2015-03-01 · 300㎡) 함께 양도 · 계약 총액 12억 · 양도 2023-09-18 · 1세대 아님.

### A-1 배치 · 취득원인별 세액

| 겸용 취득 | 평가액 칸 | 주 자산 배치 | 컴패니언 배치 | 겸용 단건(묶음 없음) |
|---|---|---|---|---|
| 상속 | 상속 평가액 600,000,000 | **0** | 208,837,200 | 173,866,000 |
| 상속 | 상속 평가액 900,000,000 | **0** | 208,837,200 | — |
| 상속 | 상속 평가액 빈칸 | 208,837,200 | 208,837,200 | 173,866,000 |
| 증여 | 증여 신고가액 600,000,000 | **0** | 310,621,069 | 309,240,696 |
| 증여 | 증여 신고가액 900,000,000 | **0** | 310,621,069 | 309,240,696 |
| 매매 | — | 155,166,000 | 155,166,000 | 118,206,000 |

- 주 자산 배치의 카드 양도차익은 「안분 양도가액 − 평가액 전액」이다. 예: 주택 부수토지 카드 461,908,579 − 600,000,000 = −138,091,421. 900,000,000이면 −438,091,421이다. 정상 값은 겸용 엔진이 안분한 취득가액 258,620,689를 뺀 203,287,890이다(컴패니언 배치).
- **단건 겸용은 영향이 없다.** 평가액 600,000,000과 900,000,000, 빈칸이 모두 같은 세액이다. 단건 route(5-a-2)는 겸용 엔진만 부르고 요청의 `inheritedAcquisition`을 쓰지 않는다.
- 증여 주 자산 시료에는 ⑧ 1건(「증여일부터 양도일까지 증여자와 계속 같은 세대였는지 선택하세요」)이 남았다. 이번 축과 무관한 미입력이다. anchor 작성 때 채운다.

### A-2 원인 — 요청의 `inheritedAcquisition` 한 키

같은 상속 600,000,000 시료에서 요청 body의 키를 하나씩 빼고 다시 계산했다:

| 뺀 키 | 세액 |
|---|---|
| 없음 | 0 |
| `inheritedAcquisition` | **208,837,200** (컴패니언 배치와 같음) |
| `primaryInheritanceValuation` | 0 |

경로:
1. ④ `buildInheritedAcquisitionPayload`(`lib/calc/transfer-tax-api-inheritance.ts:47`)는 겸용 여부를 보지 않는다. 취득원인이 상속 · 증여이고 평가액이 있으면 `inheritedAcquisition`을 싣는다. 주 자산 호출부는 `lib/calc/transfer-tax-api.ts:719`다.
2. route 일괄양도 분기는 주 자산이 겸용이면 주 자산 item(`primaryItem`)을 파트 카드로 바꾼다(`app/api/calc/transfer/bundled-route.ts:257` → `buildMixedUseCompanionItems`).
3. 파트 카드는 기반 item을 스프레드하고, 재적용하면 안 되는 키만 `neutralized`로 비운다(`app/api/calc/transfer/mixed-use-part-cards.ts:185-210`). 그 목록에 `inheritedAcquisition`이 없다.
4. 카드마다 단건 엔진 STEP 0.45(`runInheritedAcquisitionStep`)가 그 값으로 취득가액을 덮는다.

컴패니언 배치가 정상인 이유: 컴패니언 ④는 이미 이 위험을 막고 있다. `ownsAcquisitionSubobject(asset)`(`lib/calc/transfer-tax-api-companion-payload.ts:735-742` — 겸용 · 일반건물 · 재개발)이면 `buildInheritedAcquisitionPayload` · `buildInheritedHouseValuationPayload` · `buildCommercialInheritanceValuationPayload`를 싣지 않는다(`:569-578`). 그 주석이 「겸용은 ⑭가 컴패니언 입력을 파트 카드에 spread하므로 실으면 카드마다 STEP 0.45가 다시 돈다」고 이 결함을 그대로 적었다. **주 자산 ④(`transfer-tax-api.ts:719-723`)에만 같은 게이트가 없다** — 형제 경로 비대칭이다.

### A-3 화면에서 생기는 조건

| 취득원인 | 평가액 칸 | 결함이 생기는 경로 |
|---|---|---|
| 상속 | 겸용이면 칸을 숨긴다(`components/calc/transfer/CompanionAcqInheritanceBlock.tsx:195` `!isMixedUse`) | **남은 값**뿐이다. 일반 주택으로 상속 평가액을 넣은 뒤 겸용을 켜면 값이 남는다. 겸용 토글은 이 값을 지우지 않는다(`components/calc/transfer/MixedUseSection.tsx:51-58`). 자산 구분 기본값이 `"land"`라(`calc-wizard-asset-factory.ts:134`) ④의 발동 조건도 선다. |
| 증여 | 겸용에서도 「증여 신고가액 (원)」 칸이 **보이고 필수 표시**다(`CompanionAcqGiftBlock.tsx:89` · `:105` — 겸용 호출부가 `hideFixedAcquisitionPrice`를 넘기지 않는다) | **정상 입력만으로** 생긴다. 사용자가 필수 칸을 채우면 그대로 결함이다. |

브라우저에서 이 순서를 직접 따라가 보지는 않았다(코드 · route 경유 실측만).

### A-4 수정 후 미리 잰 값 (임시 패치 — 파트 카드 `neutralized`에 `inheritedAcquisition: undefined` 1줄 · 실측 후 되돌림)

| 시료 | 주 자산 배치 종전 | 수정 후 | 컴패니언 배치 |
|---|---|---|---|
| 상속 600,000,000 | 0 | 208,837,200 | 208,837,200 |
| 상속 900,000,000 | 0 | 208,837,200 | 208,837,200 |
| 증여 600,000,000 | 0 | 310,621,069 | 310,621,069 |
| 증여 900,000,000 | 0 | 310,621,069 | 310,621,069 |
| 매매 | 155,166,000 | 155,166,000 | 155,166,000 |

배치에 따라 세액이 달라지지 않게 된다(위치 불변 — 매매는 `__tests__/api/transfer.route.companion-mixed-use.anchor.test.ts` PM-3이 이미 고정한다).

### A-5 함께 본 별개 문제 (이번 범위 밖 — E절)

- 증여 겸용의 「증여 신고가액」은 단건 · 컴패니언 모두 600,000,000과 900,000,000의 세액이 같다. 화면에 보이고 필수 표시지만 계산에 쓰이지 않는 칸이다(겸용 엔진은 증여일 평가액을 「주택·상가 기준시가」 섹션에서 받는다).
- 컴패니언 증여 겸용에서 이 칸을 비우면 ⑧은 통과하는데 ⑫가 400을 낸다: `companionAssets.0.fixedAcquisitionPrice` 「증여 자산은 신고가액(취득가액) 필수」(`lib/api/transfer-tax-schema-companion-refines.ts:148`). ⑧↔⑫ 불일치다.

## B. 방안

### B-1 어디서 막나 (Q-1)

| 안 | 내용 | 비고 |
|---|---|---|
| **a (권장)** | 파트 카드 `neutralized`에 `inheritedAcquisition: undefined`를 더한다(`mixed-use-part-cards.ts:185-210`). | 해가 생기는 바로 그 지점이다. 주 자산 · 컴패니언 공통 leaf라 API 직접 호출 · 남은 값 · 증여 정상 입력이 모두 막힌다. 임시 패치로 A-4 확인. 같은 블록의 기존 규약(「스프레드가 실어 오지만 파트 카드에서 재적용되면 안 되는 값」)에 한 줄 더하는 것이다. |
| b | a + 주 자산 ④ 호출부(`transfer-tax-api.ts:719-723`)에서 겸용이면 상속 평가 3종을 싣지 않는다 — 컴패니언 `ownsAcquisitionSubobject`의 겸용 항과 대칭 | 방어 한 겹 더. 공용 함수 자체에 게이트를 넣으면 안 된다 — 같은 함수를 검증기 · 안내 · 다건 · 컴패니언 등 다른 호출부 9곳이 부른다(`transfer-tax-validate-clause-a.ts:300` · `housing-excess-split.ts:78` 등). 주 자산 호출부만 바꾼다. 단건 겸용은 `inheritedAcquisition`을 쓰지 않아 영향 0(A-1). 나머지 2종(`inheritedHouseValuation` · `commercialInheritanceValuation`)은 단건 겸용 영향을 재지 않았다 → V-1. |
| c | ④만 바꾼다 | API 직접 호출에는 그대로 남는다(⑫가 막지 않는다). |

### B-2 남은 상속 평가액 정리 (Q-2)

| 안 | 내용 |
|---|---|
| **a (권장)** | 정리하지 않는다. Q-1 a로 값이 남아도 세액에 닿지 않는다. 겸용을 다시 끄면 사용자가 입력한 값이 돌아온다. |
| b | 겸용을 켤 때 상속 평가액 · 자산 구분을 비운다 | 껐다 켜면 입력이 사라진다. |

### B-3 증여 겸용 「증여 신고가액」 칸 (Q-3)

| 안 | 내용 |
|---|---|
| **a (권장)** | 이번엔 손대지 않고 별건으로 둔다(A-5). Q-1 a로 세액 결함은 사라진다. 칸 숨김 · ⑧↔⑫ 정합은 UI · 검증 축이라 계획서를 따로 쓴다. |
| b | 이번에 겸용이면 칸을 숨기고 ⑫ 필수를 풀어 같이 고친다 | 범위가 ⑤⑧⑫로 넓어진다. |

## C. 사용자 결정 (Q)

- **Q-1** 막는 위치: a 파트 카드 중화 1줄 / b a + ④ 주 자산 호출부 / c ④만. 권장 **a**.
- **Q-2** 남은 상속 평가액: a 정리 안 함 / b 겸용 켤 때 비움. 권장 **a**.
- **Q-3** 증여 겸용 신고가액 칸 · ⑧↔⑫: a 별건 / b 이번에 같이. 권장 **a**.

## D. 미검증 (V) — Do 전 실측

> 2026-11-04 Do: Q-1~Q-3 모두 권장안 a로 구현했다(파트 카드 `neutralized`에 `inheritedAcquisition: undefined` 1줄). 실측 결과:
> - **V-1 다른 키 — 해 없음(화면 경로).**
>   - `inheritedHouseValuation` · `commercialInheritanceValuation`은 `inheritedAcquisition`이 없으면 STEP 0.45가 바로 빠져 읽히지 않는다(`lib/tax-engine/inheritance-acquisition-helpers.ts:57`).
>   - `pre1990Land`는 카드에 실리면 해롭다. 취득가액을 0으로 만들고 환산을 강제한다(`lib/tax-engine/transfer-tax-precalc.ts:111-122`). 다만 주 자산 ④는 토지 · 토지 출자 원조합원일 때만 싣는다(`transfer-tax-api-primary-context.ts:117-120` · `transfer-pre1990-land-gate.ts:59`). 그래서 겸용 주 자산에는 화면에서 실리지 않는다. API 직접 호출로만 닿는다 → 이번 범위에 넣지 않았다.
> - **V-2 지분 60/40 — 같은 결함이었고 해소.**
>   - 상속 6억: 0 → 173,866,000.
>   - 증여 6억: 0 → 309,240,696.
>   - 두 값 모두 단건 100% 계산과 같다. 매매는 118,206,002로 바뀌지 않는다. anchor에 넣었다.
> - **V-3 E2E** `e2e/mixed-primary-inherited-acquisition-dup.spec.ts`(MPI-1): 증여 겸용을 주 자산 · 둘째 자산으로 둔 두 계산이 실제 DB 세율로 310,621,069로 같고, 겸용 카드 차익은 0 이상이다. 개발 서버를 미리 띄워 둔 상태에서 통과했다. 수정 줄을 빼면 「겸용 카드 차익 ≥ 0」에서 실패하고, 되돌리면 다시 통과한다. 서버를 막 띄운 직후 첫 실행은 계산 API 첫 컴파일 때문에 응답 30초를 넘겨 실패할 수 있다(화면 「Compiling…」 · 「계산 중...」 — 결함 아님).
> - **리뷰 게이트(acquisition-cost-review) BLOCK 0건.** 지적된 별건 후보는 2가지다.
>   - **V-5 `familyBusinessInheritance` 잔재(미측정).** 주 자산 ④가 겸용이어도 싣는다(`transfer-tax-api.ts:700`). 화면 토글은 겸용에서 비활성이다(`FamilyBusinessInheritanceTransferSection.tsx:171`). 일반 주택에서 켠 뒤 겸용으로 바꾼 값이 파트 카드에 퍼져 `applyFamilyBusinessCgtStep`을 다시 타는지 재지 않았다.
>   - **anchor 공백.** 의제취득일 전(pre-deemed) · 공동주택(`house_apart`) 시료가 없다.
> - **V-4 일반건물 파트 카드 — 미확인(별건).** 상속 일반건물 시료가 ⑧(「토지·건물 중 한쪽만 상속으로 취득했다면 …」)에 막히는 입력이라 결론을 내지 못했다. 주 자산 일반건물에도 ④가 `inheritedAcquisition`을 싣는 것(평가액이 있을 때)은 확인했다.

- **V-1 같은 블록의 다른 키**: 주 자산 item에 실릴 수 있는 상속 · 증여 평가 키(`inheritedHouseValuation` · `commercialInheritanceValuation` · `pre1990Land`, `lib/tax-engine/types/transfer.types.ts:1258-1303`)가 겸용 파트 카드에서도 재적용되는지 확인한다. 이번 시료에서는 `inheritedAcquisition` 하나만 결과를 바꿨다(A-2). 다른 키는 발동 시료(의제취득일 전 · 1990.8.30. 전 · 개별주택가격 미공시)를 만들지 않아 측정하지 않았다.
- **V-2 지분(축 B) 주 자산 겸용**: 지분 분할 겸용 묶음에서도 같은지 확인한다(`applyRatio`된 평가액이 카드마다 들어가는지).
- **V-3 결과 화면**: 수정 후 주 자산 겸용 카드의 취득가액 · 양도차익 표시가 컴패니언 배치와 같은지 E2E 1건으로 확인한다.
- **V-4 일반건물 · 상가건물 파트 카드**: 같은 스프레드 패턴(`buildGbPartCards` 등)에 같은 누락이 있는지 확인한다. 범위가 다르면 별건으로 보고한다.

## E. 범위 밖

- 증여 겸용 「증여 신고가액」 칸이 계산에 쓰이지 않는데 보이고 필수 표시인 것 · 컴패니언 ⑧↔⑫ 400(A-5 · Q-3 a).

## F. Do 계획 (Q 전부 권장안일 때)

1. 파트 카드 중화 1줄 + 주석 → verify: anchor(A-4 상속 · 증여 × 600/900 · 매매 짝 · 「주 자산 배치 = 컴패니언 배치」 위치 불변)
2. V-1 · V-2 실측 → 결함이 있으면 같은 PR에 넣을지 보고
3. 뮤테이션(중화 줄을 지우면 anchor 실패) · 회귀 · E2E 1건(V-3) · 리뷰 게이트(acquisition-cost-review)

예상: V-1 · V-2 실측 30분 · 구현과 테스트 1~2시간.
