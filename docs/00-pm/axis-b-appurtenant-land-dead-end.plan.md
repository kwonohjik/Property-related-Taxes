# 축 B(같은 물건 지분 분할) × 주택부수토지 — «주택을 첫 자산으로» 막다른 길 수정 계획서 v0.2

- 작성: 2026-10-19
- 계기: 1주택 코드 리뷰 별건 ① (메모리 `project_one_house_code_review_2026_10` — «축 B+부수토지 막다른 길, `transfer-tax-validate-asset.ts:231-236`»)
- v0.2(2026-10-19): Q-1 (a) · Q-2 (a) 확정(사용자 «권장안대로») · 실행 결과 §8
- 범위: ⑧ 검증 2곳 + 역방향 판정 leaf. 세액 계산(④·route·엔진)은 바꾸지 않는다

## 0. 요약

토지 1필지를 지분으로 나눠 입력(축 B)하고 토지 성격을 「주택부수토지」로 고르면, 지분율을 채우는 순간 ⑧이 «주택부수토지를 첫 자산으로 넣고 주택을 함께 양도하는 자산으로 넣으면 … 주택을 첫 자산으로 입력하세요»라며 막는다.

- 둘째 지분 카드에는 주택이 없다. 화면이 만든 카드(`makeDefaultAsset(2)`)의 **저장 자산 종류가 기본값 `housing`**일 뿐이고, ① 기본정보가 숨겨져 사용자는 바꿀 수 없다.
- 안내를 따를 방법도 없다. «주택을 첫 자산으로 바꾸기» 버튼은 축 B에서 숨겨진다(`app/calc/transfer-tax/steps/Step1.tsx:334-337` `hidden={… splitMode === "fractional"}`).
- 막힘만 풀면 계산은 이미 맞다. ④가 둘째 카드를 첫 카드 종류(`land`)로 보내 같은 토지 100% 단건과 총세액이 같다(§1).

원인은 지분율이 채워진 뒤 «함께 양도 + 전 자산 지분»과 «같은 물건 지분 분할»을 데이터로 가를 수 없어 일부러 막아 둔 것이다(`lib/calc/reverse-appurtenant-house.ts:22-26` 주석 — 리뷰 M1). #2246(2026-10-18)이 사용자의 선택을 폼에 저장(`assetSplitMode`)하면서 이제 가를 수 있다. #2246은 이 leaf를 범위 밖으로 남겼다(`docs/02-design/features/transfer-companion-all-fractional-distinct-assets.plan.md:70`).

## 1. 재현·실측

시료: 토지 300㎡ · 매매 2014-01-02 · 양도 2026-02-16 · 물건 전체 양도가 3억 · 취득가 1.5억(카드마다 물건 전체 금액 입력 — ④·엔진이 지분율을 곱한다) · 지분 50/100 + 50/100 · mock 세율. 둘째 카드 = `makeDefaultAsset(2)` + 취득 3칸 + 지분율(화면이 만드는 상태).

| # | 구성 | ⑧ | 교환 버튼 leaf | ④ 둘째 카드 `assetKind` | 총세액 |
|---|---|---|---|---|---|
| 1 | `assetSplitMode: "fractional"` · 부수토지 | **차단 — 역방향 문구** | 패치 생성(화면은 숨김) | `land` | 25,943,500 |
| 2 | 저장 필드 없음(종전 세션) · 부수토지 | **차단 — 역방향 문구** | 패치 생성 | `land` | 25,943,500 |
| 3 | `"fractional"` · 둘째 카드 종류를 `land`로 저장(대조군) | 통과 | 없음 | `land` | 25,943,500 |
| 4 | `"fractional"` · 독립 나대지 | 통과 | 없음 | `land` | 25,943,500 |
| 5 | `"fractional"` · 토지 성격 빈칸 | **차단 — 「토지 성격을 선택하세요. 주택·입주권과 함께 일괄양도하는 토지는…」** | 없음 | `land` | 25,943,500 |
| 6 | `"fractional"` · 둘째 카드 `land` · 토지 성격 빈칸(대조군) | 통과 | 없음 | `land` | 25,943,500 |
| 7 | 같은 토지 100% 단건 · 부수토지 / 빈칸 | 통과 / 통과 | — | — | 25,943,500 |
| 8 | `"companion"`(함께 양도) · 부수토지 + 기본값 카드 | 차단(역방향) + 자산 2 소재지 필수 | 패치 생성 | — | (400) |

- 1·2·5만 막히고, 계산 값은 막히지 않은 3·4·6·단건과 같다 ⇒ **⑧만의 오탐**이다.
- 8(함께 양도)은 진짜 역방향 구성이라 종전대로 막혀야 한다.

## 2. 원인 — 묶음 단위 ⑧ 규칙 2곳이 숨은 카드의 저장 종류를 읽는다

⑧의 **카드별** 검증은 축 B 형제 카드를 첫 카드 값과 합쳐(`mergePrimaryBasic`) `land`로 본다 — 그래서 #1에서 다른 오류는 없다. 그런데 **묶음 전체**를 보는 두 규칙은 `form.assets`의 저장값을 그대로 읽는다.

| ID | 위치 | 읽는 값 | 결과 |
|---|---|---|---|
| F1 | `lib/calc/reverse-appurtenant-house.ts:21-33` (← `transfer-tax-validate-asset.ts:231`) | 형제 `assetKind === "housing"`을 짝 주택으로 | 역방향 차단 — 막다른 길 |
| F2 | `lib/calc/transfer-tax-validate-asset.ts:215-222` `hasHousingInBundle` | 같은 값 | 토지 성격 필수(단건 토지는 필수 아님) + 틀린 사유 문구 · 부수토지면 면적 필수(`:239`) |

F1 leaf의 유일한 축 B 가드는 «진입 직후 전 자산 지분율 빈칸»(`isFractionalSplitEntryBundle`, `:26`)이다. 지분율이 채워지면 함께 양도와 데이터로 구분되지 않아 넓게 풀지 않았다(넓게 풀면 함께 양도 묶음이 숨은 기본값으로 계산된다 — 리뷰 M1, 같은 파일 주석).

F2는 막다른 길은 아니다(토지 성격 칸은 토지면 늘 보인다 — `components/calc/transfer/asset-sections/AssetSectionBasic.tsx:449`). 다만 축 B 토지에만 단건에 없는 필수 입력을 요구하고, 사유(«주택·입주권과 함께 일괄양도»)가 사실과 다르다.

## 3. 수정안

사용자가 고른 모드가 «같은 물건 지분 분할»(`assetSplitMode === "fractional"`)이면, 형제 카드는 첫 카드와 같은 물건이므로 묶음 규칙에서 주택으로 세지 않는다.

1. `reverseAppurtenantHouseAssetId(assets, declaredMode?)` — `declaredMode === "fractional"`이면 `undefined`. 기존 진입 직후 가드(`:26`)는 그대로 둔다(저장 필드가 없는 종전 세션의 진입 직후 상태).
   - 호출부 2곳에 `form.assetSplitMode`를 넘긴다: `transfer-tax-validate-asset.ts:231` · `reverse-appurtenant-swap.ts:54`(`SwapForm`에 `assetSplitMode` 추가 — 버튼 leaf도 ⑧과 같은 판정. 화면은 이미 숨기지만 leaf가 «패치 있음»을 내지 않게 한다).
2. `hasHousingInBundle`(`transfer-tax-validate-asset.ts:215`) — `form.assetSplitMode === "fractional"`이면 `false`(축 B 토지 = 단건 토지와 같은 요구).
3. ④·route·엔진은 바꾸지 않는다(이미 `land`로 보낸다 — §1).

예상 diff ≈ 15줄(소스 3파일).

## 4. 결정 (2026-10-19 확정 — 권장안)

- **Q-1 저장 필드가 없는 종전 세션(§1 #2)**
  - (a) 종전대로 둔다 — `declaredMode === "fractional"`일 때만 푼다 **(권장)**. #2246 Q-2 A(«필드 없으면 현행 유지»)와 같은 정책이다. 종전 세션도 Step1에서 자산을 하나라도 고치면 화면 모드가 저장된다(`Step1.tsx` `updateAssets` — #2246 계획서 §9 ⑤ · UI 테스트 `step1-asset-split-mode-persist`) — 오류가 가리키는 토지 성격 칸을 다시 고르면 그 순간 풀린다.
  - (b) Step1 복원 추론(`isFractionalSplitRestorable`)을 따라 푼다 — 종전 세션도 즉시 풀리지만 함께 양도 묶음(전 자산 지분)의 종전 세션까지 축 B로 읽는다(리뷰 M1이 막은 방향). Step1 초기값 추론을 leaf로 빼야 해 diff가 커진다.
- **Q-2 F2(토지 성격 필수)도 같이 고칠까**
  - (a) 같이 고친다 **(권장)** — 같은 원인(숨은 카드 저장 종류)이고, 고치면 축 B 토지가 단건 토지와 같은 요구가 된다. 세액은 토지 성격에 따라 달라지지 않았다(§1 #4·#5·#6 — 이 시료 한정, 비사업용 판정이 걸리는 토지는 단건과 같은 경로라 단건 동작을 따른다).
  - (b) F1만 고친다.

## 5. 테스트 계획

새 anchor `__tests__/calc/axis-b-appurtenant-land-dead-end.anchor.test.ts` (route 헬퍼 `runCalc`·`allIssues`, 시료 §1):

| ID | 구성 | 단언 |
|---|---|---|
| AB-1 | `"fractional"` · 부수토지 · 기본값 형제 | ⑧ 오류 0 · 200 · 총세액 = 같은 토지 100% 단건 |
| AB-2 | 같음 · 토지 성격 빈칸 (Q-2 a) | ⑧ 오류 0 · 총세액 같음 |
| AB-3 | 같음 · 교환 leaf | `reverseAppurtenantSwapPatch` = `null` |
| AB-4 | `"companion"` · 부수토지 + 기본값 형제(진짜 역방향) | 역방향 차단 유지 · 패치 생성 유지 |
| AB-5 | 저장 필드 없음 · 지분 채움 (Q-1 a) | 차단 유지(종전) |
| AB-6 | `"fractional"` · 진입 직후 전 자산 빈칸 | 종전대로 역방향 차단 없음 |

기존 anchor `__tests__/calc/g1-reverse-appurtenant-swap.anchor.test.ts:160-179`(진입 직후·지분 채움 후)는 저장 필드가 없는 폼이라 Q-1 (a)이면 그대로 통과해야 한다 — 바뀌면 원인을 본다.

E2E `e2e/transfer-axis-b-appurtenant-land.spec.ts`: sessionStorage에 §1 #1 폼을 시드 → 「다음」으로 단계 이동 시 역방향 오류 없음 → 계산하기 → 응답 200 · `aggregated.totalTax` = 단건 값. 수정 전 실패를 확인한다.

뮤테이션(백업 복사로 원복 — `git checkout` 금지): leaf `declaredMode` 가드 제거 · ⑧ 호출부 인자 누락 · 교환 leaf 인자 누락 · `hasHousingInBundle` 가드 제거 · `"fractional"` → `"companion"` 비교 반전 → 전부 KILLED 확인.

## 6. 확인 필요 (Do에서 실측)

- V-1 화면 모드(`Step1`의 `splitMode` state)와 폼 `assetSplitMode`가 갈리는 경로 — 토글 A·B·해제·`updateAssets`는 같은 패치로 기록한다(#2246). 자산 삭제(`lib/calc/asset-removal.ts`)·판정 불러오기·다건 임베드 경로가 `assetSplitMode`를 남기거나 지우는지 역방향 grep으로 확인한다. 갈리면 ⑧이 화면과 다른 모드를 본다.
- V-2 축 B 형제 카드의 저장 종류(`housing`)를 묶음 단위로 읽는 다른 소비처 — ⑧ 밖(Step4 판정 대상·사이드바 `lib/stores/transfer-per-asset-summary.ts`·결과 화면)을 역방향 grep으로 본다. 이번 범위는 ⑧ 두 곳이다.

## 7. 범위 밖

- 둘째 지분 카드의 저장 `assetKind` 자체를 첫 카드와 맞추는 것(저장값 동기화 — useEffect 미러링 금지 원칙상 핸들러 패치가 필요하고 종전 세션 마이그레이션이 따른다).
- Q-1 (b)의 Step1 초기값 추론 leaf 추출.

## 7-1. 단계

1. Q-1·Q-2 결정 → v0.2
2. anchor AB-1~6 · E2E 작성 → verify: AB-1·AB-2·AB-3·E2E 수정 전 실패, 나머지 통과
3. 수정(§3) → verify: 전부 통과 · 기존 G1 anchor 통과
4. V-1·V-2 역방향 grep → 결과를 §8에
5. 뮤테이션 → verify: 전부 KILLED
6. `npm run check:pre-pr` → PR → CI 전건 SUCCESS + head 일치 확인 후 머지

## 8. 실행 결과 (v0.2)

- 수정: `reverse-appurtenant-house.ts`(`declaredMode` 인자 — `"fractional"`이면 짝 주택 없음) · 호출부 2곳(`transfer-tax-validate-asset.ts:231` · `reverse-appurtenant-swap.ts:54`, `SwapForm`에 `assetSplitMode`) · `hasHousingInBundle`(`transfer-tax-validate-asset.ts:215`). 진입 직후 가드(`:26`)는 그대로.
- anchor `__tests__/calc/axis-b-appurtenant-land-dead-end.anchor.test.ts` 7건(전제 1 · AB-1~6). AB-1·AB-2·AB-3 수정 전 실패 → 통과. 기존 G1 anchor(`g1-reverse-appurtenant-swap`·`-wizard`)는 저장 필드 없는 폼이라 그대로 통과(Q-1 (a)).
- E2E `e2e/transfer-axis-b-appurtenant-land.spec.ts`: 수정 전 «입력 확인이 필요합니다 (1건) — 주택부수토지를 첫 자산으로…»로 계산 요청이 나가지 않아 실패(화면 캡처로 확인) → 수정 후 통과, 지분 합계 총세액 = 같은 토지 100% 단건.
- 뮤테이션 7종(leaf 가드 제거·비교 반전 · ⑧ 호출부 인자 누락 · 교환 leaf 인자 누락 · `hasHousingInBundle` 가드 제거·비교 반전 · 진입 직후 가드 제거) 전부 KILLED.

### V-1 화면 모드 ↔ 폼 `assetSplitMode`

- 쓰는 곳은 `Step1` 핸들러뿐이다 — 토글 A(`:110`)·해제(`:120·122·154`)·토글 B(`:143·145`)·`updateAssets`(`:171·180`). 자산 삭제(`handleRemoveAsset`)는 `updateAssets`를 거쳐 함께 기록한다.
- 교환(`handleReverseAppurtenantSwap`, `:163`)은 모드를 쓰지 않지만 축 B에서는 버튼이 숨겨지고(`:334-337`) 이제 leaf도 패치를 내지 않는다(AB-3).
- 판정 메뉴 인계(`lib/calc/one-house-judgment-handoff.ts:133`)는 자산 목록을 통째로 바꾸면서 `assetSplitMode`를 그대로 둔다. 판정 메뉴는 첫 자산 하나만 편집하고 자산 추가 화면이 없어(`app/calc/one-house-exemption/steps/Step3.tsx:68`) 1건만 넘긴다 — 자산 1건이면 이번 두 규칙이 서지 않아 남은 모드 값의 영향이 없다. (여러 자산을 가진 판정 이력이 있을 수 있는지는 확인하지 못했다 — 확인 필요.)

### V-2 형제 카드 저장 종류를 읽는 다른 소비처 — 별건 1건

- **사이드바 자산 라벨**: `lib/stores/transfer-per-asset-summary.ts:637` `assetKind: a.assetKind`(저장값) → `app/calc/transfer-tax/TransferSidebarSummary.tsx:56`. 축 B 둘째 지분은 첫 카드 종류와 무관하게 «자산 2 — 주택»으로 보인다(E2E 수정 전 캡처에서 토지 지분이 «주택»). 표시 전용이고 ⑧ 범위 밖이라 이번에 고치지 않는다 — 별건.
- `transfer-per-asset-summary.ts:198` `toBundledKind(a.assetKind)`는 안분 산식에 쓰이지 않는 타입 충족용(같은 파일 `:98` 주석).
