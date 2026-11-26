# 가업상속공제 자산 §97의2④ × 지분 양도 — UI 계획서

작성 2026-11-26 · 개정 2026-11-26(사용자 결정 반영) · 워크트리 `Property-related-Taxes-fb-share-plan` · 기준 master `7e8015fbd`
짝 문서: `transfer-fb-share.engine.plan.md`(§12 Q-5 지원 설계·§13 사용자 결정 포함, 재독 2026-11-26) — **필드·함수·echo 이름은 그쪽이 정본**이다. 이 문서는 그 이름을 그대로 쓰며, 엔진 계획서와 어긋나거나 아직 없는 것은 §7에 모았다.
관련: `fb-97-2-4-fixes.plan.md` · `transfer-fb-lthd-portion-gain.{engine,ui}.plan.md`(PR #3678)

> **표기 규약** — 수치는 throwaway probe(vitest 라우트 하네스 `callTransferTaxAPI` → 실제 `POST` · mock 세율 · 토지 · 프로브 파일은 실행 뒤 삭제)로 실측했다. 인용은 master `7e8015fbd` 기준 file:line이다. 미확인은 «확인 필요». 이 문서는 **문서만** — 코드 변경 0.

---

## 0. 사용자 결정 (2026-11-26) — 이 개정판의 전제

| 결정 | 내용 | 이 문서에서 |
|---|---|---|
| UQ-1 | FB 3금액은 **물건 전체(100%) 기준** 입력 | §4.2 |
| **곱하는 위치** | **엔진 STEP 0.42가 `ownershipRatio`로 곱한다. ④는 변경 없음**(이중 스케일 방지) | §4.4 · §5 |
| UQ-2 | 지분 모드 **«전체 기준 확인» 토글 필수**(표시·검증 전용) | §4.2 · §4.5 |
| **UQ-3 = Q-5 지원** | **둘째 이후 카드의 FB도 계산에 반영**한다(⑧ 차단안 기각). ⑤ 토글은 모든 카드에서 활성 | §4.6 · §4.7 |
| UQ-4 (a) | 이력 모달: 값은 그대로 + 안내 + 확인 해제 | §4.3 |
| UQ-5 (a) | 결과 카드는 엔진 echo `ownershipRatio`(+`wholeInput`)로 «지분 기준» 표시 | §4.7 |
| 엔진 Q-8 | 번들에서 FB 카드가 여럿일 때 `creditAmount` — **미결정**(엔진 추천 (가) 카드별만·합계 미산출) | §4.7-4 · UQ-6 |

개정 요지: ④ `applyRatio` 안(구 §4.1·§4.4)을 **삭제**했다. 신규 UI leaf를 만들지 않고 엔진 leaf `scaleFamilyBusinessInheritanceByShare`를 import해 ⑤ 미리보기·환산 표·⑧(지분분 평가액 0원)이 **표시·검증에만** 쓴다. V8-2(비-첫 자산 차단)는 **폐기**하고, 둘째 이후 카드의 입력·검증·번들 결과 표시를 새로 설계했다(§4.6~4.7).

---

## 1. 결함 — 실측

시료 A: 토지 · 상속(2015-03-01) · 피상속인 취득 2억 · 상속개시일 평가액 10억 · 적용률 50% · 양도 2024-05-01 · 총 양도가액 20억(물건 전체). 지분 50%. (엔진 계획서 §4는 교재 시료 — 같은 결함의 다른 시료다.)

| 시료 | 입력 | ⑧ | 의제 취득가액 | 총 세액(mock) |
|---|---|---|---|---|
| S0 단건 100% | FB 2억/10억/50% | 통과 | 600,000,000 | 441,028,500 |
| **S2 축 A 50%**(선언 yes) | FB 2억/10억 **전체값** | 통과 | **600,000,000** | **104,126,000** |
| S2c 축 A 50% | FB 1억/5억 (= 전체 × 지분) | 통과 | 300,000,000 | 205,095,000 |
| **B2 축 B 상속FB 50% + 매매 50%** | FB 전체값 | 통과 | **600,000,000** | **289,179,000** |
| B2c 축 B 동일 · FB 1억/5억 | | 통과 | 300,000,000 | 394,515,000 |
| B5 축 B 동일 · FB 없음 | | 통과 | — | 338,151,000 |
| **B3 축 B 매매 50% + 상속FB 50%(둘째 카드)** | FB 2억/10억 | **통과** | **echo 없음** | **338,151,000 = B5** |
| **C1 함께 양도 첫 자산 50% FB** | FB 전체값 | 통과 | **600,000,000** | 104,126,000 |
| **C2 함께 양도 둘째 카드 FB(100%)** | FB 2억/10억 | **통과** | **echo 없음** | 0(양도차익 0 시료 — 소실 확인용) |

- S2 → S2c **−100,969,000**, B2 → B2c **−105,336,000** 과소: 지분분 양도가액에 전체 기준 의제 취득가액이 붙어 취득가액 과대 → 세액 과소.
- B3·C2(둘째 이후 카드): ⑤ 토글 ON · ⑧ 통과 · ④ 미전송 · ⑫ 컴패니언 스키마에 키 없음 → **침묵 소실**(B3 = B5). 엔진 계획서 D-2a/D-2b와 같은 사실이다.
- 교재 이월과세5 × 지분 50%(시료 B)의 현행·기대값은 엔진 계획서 §4(S0h)·FS-1이 정본이다: 현행 양도차익 85,000,000 → 기대 485,000,000 · 장특 127,700,000 · 과세표준 354,800,000 · 산출세액 115,980,000 · `creditAmount` 95,440,000.
- **부분별 장특 표(PR #3678)는 지분 양도에서 항상 사라진다** — `family-business-lthd-slices.ts:114`의 `ownershipRatio < 1` 가드. 엔진 계획서 Q-4 (가)가 가드를 풀면 단건뿐 아니라 번들에서도 표가 뜰 수 있게 된다(단 번들은 §4.7-3의 echo 배선이 따로 필요 — 현재 `pickValuationDetails`에 `fbLthdDetail`이 없다).

---

## 2. 도달 경로 전수 (화면 코드 file:line · probe 재확인)

공통: FB 섹션은 **모든 자산 카드**가 렌더한다 — `AssetSectionAcquisition.tsx:198-212` → `CompanionAcquisitionCauseSection.tsx:419-425`(게이트 `allowsFamilyBusinessInheritance` · `transfer-fb-gate.ts:32-41`). ④는 `form.assets[0]`의 FB만 싣는다(`transfer-tax-api.ts:694-698`) — 컴패니언 payload(`transfer-tax-api-companion-payload.ts`)·⑫ 컴패니언 스키마(`transfer-tax-schema-required-refines-2a.ts:506-509` 주석)에 FB 키가 없다.

| # | 경로 | 화면에서 지분이 생기는 곳 | 현재 결과 | 개정 후 |
|---|---|---|---|---|
| **P1** | 단건 + 공유 지분(축 A) | `AssetSectionBasic.tsx:438-461` `OwnershipRatioBlock` + 「나머지 지분은 타인 소유」 선언 → ⑧ Gate-A 통과(`validate-asset.ts:386-388`) | **과소**(S2) · 선언 없으면 ⑧ 차단(S1) | 엔진이 곱함 |
| **P2** | 축 B 첫 카드 FB | `AssetSectionAcquisition.tsx:112·183` `ratioBlock` | **과소**(B2) | 엔진이 곱함 |
| **P3** | 축 B **둘째 이후** 카드 FB | 같은 `ratioBlock` | **침묵 소실**(B3) | **지원**(§4.6) |
| **P4** | 함께 양도 첫 자산 지분 + FB | 첫 자산 카드 ① 기본정보 | **과소**(C1) | 엔진이 곱함 |
| **P5** | 함께 양도 둘째 이후 자산 FB(지분 무관) | — | **침묵 소실**(C2) · `reverse-appurtenant-swap.ts:39`가 «첫 자산 전용 입력»으로 분류만 해 둠 | **지원**(§4.6) |
| — | 다건 합산 | — | `multi-transfer-tax-validate.ts:176-177`·`transfer-tax-schema-multi-refines.ts:82` 차단 | **차단 유지** |
| — | 겸용주택 · 일반건물 | — | `transfer-fb-gate.ts:32-55` 게이트 · `mixed-use-part-cards.ts:250-254` 중화 · 잔재 ⑧ 해제 요구 `validate-asset.ts:469-472` | **차단 유지** |

- 한계: probe는 **토지**만 실측했다. 주택·상가·입주권·고가주택 안분(`housing-excess-split.ts:76-77`)과의 조합은 «확인 필요»(V-3·V-4).

---

## 3. 화면 문구 대조 — 사용자는 어느 기준으로 넣는가

| 위치 | 현행 문구 | 암시하는 기준 |
|---|---|---|
| 지분 모드 amber 배너 `OwnershipRatioInput.tsx:160-180` | «모든 금액을 **100% 기준**으로 입력하세요 … 시스템이 지분율을 자동 적용» · 「상속 보충적평가는 공동주택가격(100%)을 그대로」 | 전체(100%) |
| 필요경비·감가상각 hint `AssetSectionExpense.tsx:153·167·232` · `DepreciationField.tsx:74` | «100% 기준 입력 — 시스템이 지분율 자동 적용» | 전체 |
| FB ① 원취득가액 `FamilyBusinessInheritanceTransferSection.tsx:278` · ② 평가액 `:287` · ⑤ 자본적지출 `:409` | 지분 **무언급** | 모호 |
| FB 미리보기 `:451-474` | 입력값 그대로 × 적용률 — 지분 미반영 | 전체 값을 «내 지분분 의제»처럼 보여 줌 |
| 결과 카드 `FamilyBusinessImputedComparisonCard.tsx:229-241` | 엔진 echo 그대로 | 지분 미표기 |

배너 때문에 «전체 기준»으로 읽는 것이 자연스럽지만 FB 섹션이 침묵하므로 «내 지분분»으로 읽는 사용자도 막지 못한다. 두 읽기의 결과가 **조용히** 다르므로 문구만으로 해소할 수 없다 → UQ-2 확인 토글.

### 3.1 이력 불러오기와의 정합

- prefill `inheritanceMarketValue` = 상속세 이력 `estateItems[]·stockItems[]`의 `resolveEstateItemValue(item)`(`family-business-inheritance-lookup.ts:245`·prefill `:331-345`). **지분율을 곱하지 않았고** `heirAllocations`(`inheritance-gift-estate.types.ts:478`)도 쓰지 않는다. «피상속인이 소유한 재산의 평가액»이다.
- 피상속인이 100% 소유한 물건이면 «물건 전체» 기준이라 UQ-1과 그대로 맞는다. 피상속인이 공유 지분만 가졌다면 «피상속인 몫»이므로 환산이 필요하다 — 상속세 화면의 단위는 «확인 필요»(V-2 · 엔진 계획서 V-2와 같음).
- 적용률 구성요소(`fbRateBasis`의 공제금액·가업상속 재산가액)는 **상속인 단위 비율**이라 지분율을 곱하지 않는다(엔진 계획서 §1.2·§1.3).
- 현재 모달은 지분을 모른다: `FamilyBusinessInheritanceHistoryModal.tsx:154-172`·`:281-290`.

---

## 4. 수정안

### 4.1 단일 소스 — 엔진 leaf를 import한다 (신규 UI leaf 없음)

엔진 계획서 §5.3 정본: `lib/tax-engine/family-business-share.ts`의 `scaleFamilyBusinessInheritanceByShare(fb, ownershipRatio) → { fb, ownershipRatio?, whole? }`. 구현은 `applyRatio` 선절사, 적용률·`fbRateBasis`·일자 불변, `r ≥ 1`·`undefined`는 입력 객체 그대로.

- UI 소비처는 **둘뿐**이고 둘 다 **표시·검증**이다. ⑤ 미리보기·환산 표 · ⑧ V8-3. **저장·전송에 쓰지 않는다** — 환산값을 store에 쓰거나 body에 싣는 순간 엔진이 한 번 더 곱한다(이중 스케일).
- 같은 파일이 이미 엔진 leaf를 직접 import한다(`calcFamilyBusinessImputedAcquisitionPrice` · `isFamilyBusinessAssetScopeDecreeEra` — `FamilyBusinessInheritanceTransferSection.tsx:36-37`) — skill `single-source-engine-helper` 선례다.
- 비율 입력 `getOwnershipRatio(asset)`(`transfer-tax-api-asset-basics.ts:150`)는 ④가 body `ownershipRatio`를 만드는 것과 같은 함수다 — 엔진이 읽는 값과 화면이 환산하는 값이 같은 소스다.
- `useEffect → store` 미러링 없음: 환산은 렌더 중 계산한다.

### 4.2 ⑤ FB 섹션 (`FamilyBusinessInheritanceTransferSection.tsx` 491줄 · 지분 블록은 새 파일)

지분 모드 = `getOwnershipRatio(asset) < 1`(축 A는 ① 기본정보, 축 B·함께 양도는 해당 카드의 지분율 — 같은 필드). 섹션이 이미 `asset`을 받으므로 새 prop은 없다.

**신규** `components/calc/transfer/FamilyBusinessShareBasisBlock.tsx`(≈90줄) — 토글 ON 직후 ①번 입력 앞, 지분 모드일 때만:

1. **amber `ToneCard`**: «지분 모드 — 가업상속공제 금액도 물건 전체(100%) 기준으로 입력하세요 / 피상속인 원취득가액·상속개시일 현재 자산가액·피상속인 자본적 지출액은 **물건 전체 금액**을 입력하면 시스템이 지분율({formatOwnershipPercent})을 곱합니다. 가업상속공제적용률은 상속인 단위 비율이므로 지분율을 곱하지 않습니다.»
2. **확인 토글**(`ToggleCard tone="amber"` · OFF도 tone 유지): 제목 «아래 금액은 물건 전체(100%) 기준입니다» · 설명 «켜야 계산할 수 있습니다. 내 지분분으로 입력했다면 끄고 물건 전체 금액으로 고쳐 입력하세요 — 시스템이 지분율을 곱합니다.» 저장 필드는 **자산-수준 `AssetForm.fbShareBasisConfirmed: boolean`**(표시·검증 전용 · API로 보내지 않는다 · 이름은 이 문서 정본). **FB 객체 안에 두지 않는다** — ④가 객체를 통째로 싣는 구조(`transfer-tax-api.ts:696-698`, 변경 없음)에서 객체 안에 두면 body로 새 나가 ⑫가 조용히 strip한다. `ownershipRemainderThirdParty`(`calc-wizard-asset.ts:366`)와 같은 선례다.
3. **지분 환산 표**(입력 3칸 아래 · 값이 있는 행만 · `scaleFamilyBusinessInheritanceByShare` 결과를 표시만):
   ```
   지분 50% 환산 (물건 전체 → 내 지분)
   피상속인 원취득가액      200,000,000 × 50% = 100,000,000
   피상속인 자본적 지출액   (입력 시)
   상속개시일 평가액      1,000,000,000 × 50% = 500,000,000
   가업상속공제적용률은 비율이라 곱하지 않습니다 (50%)
   ```
   `amount-column-align`(font-mono tabular-nums 우측 정렬 · 한 표 한 글자 크기) · 약어·`floor()` 표기 금지 · `data-testid="fb-share-scale"` · 행 `fb-share-scale-{decedent|market|capex}`.

**기존 라벨·hint**(지분 모드일 때만 접미): ① «피상속인 원취득가액 (원) — 물건 전체 기준» · ② «상속개시일 현재 자산가액 (원) — 물건 전체 기준»(hint에 «위 취득 정보의 상속개시일 평가액과 같은 기준») · ⑤ «피상속인 자본적 지출액 (원) — 선택 · 물건 전체 기준» · ③ 적용률 hint·`fbRateBasis` 두 입력 hint 끝에 «상속인 단위 비율 — 지분율을 곱하지 않습니다». placeholder 숫자 예시 금지.

**의제 취득가액 미리보기**(`:451-474`): 지분 모드면 `calcImputedPreview(scaled.fb)` + 문구 «**내 지분 {pct}% 분** 의제 취득가액 = 피상속인 원취득가액 {지분분} × {r}% + 상속개시일 평가액 {지분분} × {1−r}% = {값}». 100%면 현행 그대로. **미리보기 숫자 = 엔진이 곱하는 숫자 = 결과 카드 숫자**(같은 leaf).

**핸들러**(모두 `onChange` 직접 — `useEffect` 금지):
- `handleToggle` ON: 기존 초기값 + `fbShareBasisConfirmed: false`. OFF: `familyBusinessInheritance: undefined` + `fbShareBasisConfirmed: false`.
- `handlePrefillFromHistory`(`:123-143`): 지분 모드면 `fbShareBasisConfirmed: false`로 리셋(평가액이 바뀌었으니 기준을 다시 확인).
- 지분율을 100%로 되돌려도 확인 값은 남지만 ⑧이 지분 모드에서만 읽으므로 게이트가 열리지 않는다(`AssetSectionBasic.tsx:451-457`의 선언 리셋 선례 — 여기서는 값이 stale로 남아도 무해해 리셋 불필요).

### 4.3 이력 모달 (`FamilyBusinessInheritanceHistoryModal.tsx`)

- 신규 optional prop `shareRatioText?: string`(예: 「50%」) — 지분 모드일 때만 넘긴다.
- 있으면 필터 요약(`:281-290`) 아래에 amber `ToneCard`: «이 자산은 지분 {pct}%입니다. 상속세 이력의 평가액은 **피상속인이 소유한 재산 기준**이며 지분율을 곱하지 않았습니다. 선택하면 물건 전체 기준 값으로 채워지고 시스템이 지분율을 곱합니다. 피상속인이 이 물건의 일부 지분만 소유했다면 물건 전체 금액으로 고쳐 입력하세요.»
- 후보 행 금액 라벨 «상속개시일 평가액(이력)» · 값은 그대로(UQ-4 a).
- `candidateToPrefill`·`filterFamilyBusinessInheritanceCandidates`(lookup)는 무변경.

### 4.4 ④ 변환 — **변경 없음**

`transfer-tax-api.ts:694-698`의 FB 블록은 그대로 100%(물건 전체) 값을 보낸다. 엔진이 `ownershipRatio`(지분일 때 body에 실림 — `transfer-tax-api.ts:442`)로 곱한다. 수정 대신 **고정하는 anchor**를 둔다(§8): ④ body의 FB 3금액 == 폼 입력 + `ownershipRatio` 동시 존재(엔진 계획서 FS-6) — 누군가 ④에 `applyRatio`를 넣으면 red.

단 **컴패니언 카드 지원(§4.6)으로 ④ 컴패니언 payload에 FB를 싣게 되는 변경은 있다** — 그 경우에도 값은 폼 그대로(곱하지 않음)다.

### 4.5 ⑧ validation (`transfer-tax-validate-asset.ts:464-488` 인접)

| 규칙 | 조건 | 메시지(초안) |
|---|---|---|
| **V8-1** (신규) | FB ON ∧ 지분 모드(ratio < 1) ∧ `fbShareBasisConfirmed !== true` | `자산 N: 지분 모드(50%)의 가업상속공제 금액은 물건 전체(100%) 기준입니다. 금액이 물건 전체 기준인지 확인하는 항목을 켜세요.` |
| **V8-3** (신규 · 엔진 계획서 §5.7 ①) | FB ON ∧ 지분 모드 ∧ `scaled.fb.inheritanceMarketValue ≤ 0` | `자산 N: 가업상속공제 — 지분율을 곱한 상속개시일 평가액이 0원입니다. 금액을 확인하세요.` |
| ~~V8-2~~ | **폐기**(비-첫 자산 차단) — UQ-3 = 지원 | — |
| 기존 | 상속 아님 · 겸용 잔재 · 3금액 · 적용률 0~1 · 법정량 정합 · 상속개시일 | 불변 — **모든 카드(`index`)에 같이 적용**(이미 그렇다: 검증 함수가 자산마다 돈다) |

- V8-1·V8-3은 `getOwnershipRatio`와 엔진 leaf를 쓴다 — 미리보기(⑤)·엔진과 같은 입력·같은 함수(3중 일치). 100% 자산에는 신규 규칙이 걸리지 않는다(회귀 0).
- 순서: `:464`(상속 아님)·`:469`(겸용) 뒤, `:473` 3금액 검증 뒤에 둔다 — 값이 비었는데 «전체 기준 확인» 안내를 먼저 보이지 않는다.
- 레거시 값: 확인 필드가 없는 저장분(`undefined`→③이 `false`)은 지분 모드일 때만 V8-1에 걸린다 — 수정 전에는 지분분 금액을 넣어야 맞았으므로 조용히 이중 곱셈되는 것을 막는다.
- **둘째 이후 카드(§4.6)에도 같은 규칙** — 각 카드가 자기 `ownershipNumerator`로 지분 모드를 판정하고 자기 확인 토글을 가진다.

### 4.6 둘째 이후 카드의 FB — 입력·⑧·배선 (Q-5 지원)

**입력(⑤)**
- `CompanionAcquisitionCauseSection.tsx:419-425`·섹션 토글은 **모든 카드에서 활성**(차단 없음). `isNonPrimaryAsset`은 FB에 전달하지 않는다.
- 카드마다 FB를 **독립 입력**한다 — 축 B에서 같은 물건의 두 지분이 모두 상속이고 둘 다 FB 적용이면 같은 금액을 두 번 입력해야 한다(UQ-7). 카드 제목에 자산 라벨을 붙여 어느 카드의 FB인지 식별한다(`asset.label` — 결과 카드와 같은 라벨 소스).
- 둘째 이후 카드는 상속개시일 기본값 `asset.acquisitionDate`(`:154`)를 그 카드 값으로 채운다 — 이미 자산-수준이다.

**⑧(§4.5와 동일 — 차단 신설 없음)**
- 카드별 3금액·적용률·법정량·상속개시일·V8-1·V8-3은 첫 카드와 같은 함수(`validate-asset.ts:464-488`, 자산마다 도는 경로)가 `index > 0`에도 적용한다. 엔진 계획서 §12.5 ⑧ «차단 신설 없음 · ⑧ ⊇ ⑫ 방향만 허용(확인 토글)»과 같다.
- 지원 범위 = 기존 게이트 `sendsFamilyBusinessInheritance`(상속 취득원인 ∧ 일반건물·건물원인 혼합 아님 ∧ **겸용 아님** — `transfer-fb-gate.ts:32-55`). **컴패니언 겸용·GB는 범위 밖**이며 ⑧은 기존 문구(`:464-472`)로 이미 막고 ⑫가 새로 400으로 거부한다(엔진 계획서 §12.3 ⑩ 신규) — 같은 술어.

**④ 컴패니언 payload**(`transfer-tax-api-companion-payload.ts`, 엔진 계획서 §12.3 ④): `sendsFamilyBusinessInheritance(asset)`일 때 `familyBusinessInheritance`를 **폼 그대로(100% · 곱하지 않음)** 싣는다. 확인 필드는 자산-수준(`fbShareBasisConfirmed`)이라 payload에 들어갈 수 없다 — 엔진 계획서가 상정한 «④가 확인 필드를 떼는 leaf `buildFamilyBusinessPayload`»는 **필요 없다**(§7 E-4). 카드별 `ownershipRatio`는 같은 payload에 이미 실린다.
**⑫/⑩/⑭**(엔진 계획서 §12.3): 공유 스키마 leaf `lib/api/transfer-tax-schema-family-business.ts`를 단건·컴패니언이 함께 import(⑫) · `refineSplitPartCause`가 컴패니언 FB 사실을 받음(⑩) · `companionEngine`(`bundled-split-helpers.ts`)이 키를 엔진 item으로 옮김(⑭, 키 커버리지 가드가 누락 시 컴파일 에러). UI는 이 배선이 PR-2에서 들어온 뒤(**PR-3**)에 토글·결과를 연다.
**G1 순서 바꾸기 가드**: `reverse-appurtenant-swap.ts:39`의 «가업상속 취득가액» 항목 제거(엔진 계획서 §12.3 부수 정리 · FS-22) — 거짓 차단이 된다.

### 4.7 ⑦ 결과 표시

**단건**(`SingleDetailCards.tsx:65-66`): 엔진 echo(엔진 계획서 §5.3 Q-7 (가)) — 기존 `decedentAcquisitionPrice`·`inheritanceMarketValue`·`decedentCapitalExpenditure` = **지분분**, 신규 `ownershipRatio?`·`wholeInput?`.
1. 헤더 아래 한 줄(echo `ownershipRatio < 1`일 때만): «**내 지분 50% 기준** — 물건 전체 금액에 지분율을 곱한 값입니다. 가업상속공제적용률은 곱하지 않았습니다.»
2. 행 라벨 접미 «피상속인 원취득가액 (물건 전체 500,000,000 × 지분 50%)» — `wholeInput`이 있어 **echo만으로** 그린다(폼을 읽지 않으므로 단건·번들이 같은 형태 — UQ-5 a). 산식 설명 줄·의제 취득가액 라벨은 지분분 숫자 그대로(표 안 세 숫자의 자기일관 — A22 교훈).
3. `FamilyBusinessLthdPortionTable`: 표 위 캡션 «내 지분 N% 기준»(echo 있을 때). 값은 엔진 echo 그대로 — 엔진 계획서 Q-4 (가)로 가드가 풀려야 지분 양도에서도 표가 뜬다.
4. 결과 `warnings`의 `FB_SHARE_SCALE_NOTICE`(엔진 계획서 Q-6)는 기존 주의사항 영역이 그대로 렌더 — UI 추가 없음. 카드 안에도 «확인 필요» 한 줄을 병기할지는 중복이라 두지 않는다.

**번들(축 B·함께 양도) — 카드별 가업상속 비교 카드·부분별 표·공제액 합계**

현재 구조: `BundledAllocationCard.tsx:473-495`가 `aggregated.properties`마다 `PropertyCard`를 그리고, 그 안 `ValuationDetailCards`(`BundledAllocationSubCards.tsx:180`)가 `result.familyBusinessDetail`이 있으면 `FamilyBusinessImputedComparisonCard`를 **자산 카드 안에** 렌더한다(`ValuationDetailCards.tsx:160-162`). 개정 설계:

1. **위치 = 각 자산 카드 안**(현행 위치 유지). FB 카드가 있는 자산이 둘이면 두 자산 카드에 각각 뜬다 — 카드별 의제 취득가액·일반/의제 결정세액·공제액이 그 자산의 것임이 자명하다.
2. **식별**: `ValuationDetailCards`가 `itemLabel`을 FB 카드에 넘긴다(`PropertyCard`의 `breakdown.propertyLabel` — 주식 다종목 카드와 같은 prop `itemLabel`). 단건 화면은 변경 없음.
3. **부분별 장특 표를 번들에서도 보이게**: 엔진 계획서 §12.3은 «번들 echo 변경 없음 — 카드별 `familyBusinessDetail`이 이미 실린다»고 하나 **`fbLthdDetail`은 `pickValuationDetails`(`transfer-tax-aggregate-pickers.ts:33-56`)·`TransferValuationDetailSource`(`transfer-result.types.ts:725` 목록)에 없다** → 번들 FB 카드는 부분별 표를 받지 못한다. 표를 번들에 노출하려면 ① 두 목록에 `fbLthdDetail` 추가 ② `ValuationDetailCards.tsx:160-162`가 `fbLthdDetail={result.fbLthdDetail}`·`longTermHoldingDeduction={longTermDeduction}`을 FB 카드에 전달 ③ `transfer.route.bundled-swallows-special.test.ts`(두 목록 동기화 가드) 갱신. 노출 여부는 UQ-8(추천: 노출)이며 엔진 계획서에 항목 추가를 요청한다(§7 E-3).
4. **§18의2⑩ 공제액(creditAmount) 표시 — 엔진 Q-8에 종속**. 엔진 계획서가 확인한 사실: 번들 안 카드별 값은 집계가 카드 계산에 `skipBasicDeduction: true`를 주므로 단건 값과 다르다(단건 95,440,000 ↔ 번들 카드 95,565,000). 안별 UI:
   - **(가) 카드별로만 표시 · 합계 미산출 ★(엔진 추천 · UI도 추천)**: 합계 행·요약 카드 없음. FB 카드가 번들에서 그려질 때 카드 `creditAmount` 행 아래에 한 줄 «이 공제액은 이 자산을 번들 안에서 단독으로 본 두 세액의 차입니다. 합산 과세 기준 값과 다를 수 있습니다 — 확인 필요»를 붙인다(카드 prop `bundled?: boolean`을 `ValuationDetailCards`가 `true`로 전달 — 단건 화면은 `false`). 사후관리 링크는 카드별로 그대로 둔다(링크는 그 자산의 값을 prefill — 단건 카드와 같은 동작).
   - (나) 카드별 합계 + «카드별 독립 계산 합» 고지: 합계는 **엔진 echo**여야 하고(UI가 더하면 «UI가 값을 만든다») 엔진이 합계 필드를 만들어야 한다. 합계 요약 카드 `FamilyBusinessBundleSummary`(≈70줄, 자산 라벨별 행 + 합계 + 고지)를 번들 «합산 과세 내역»(`AggregatedTaxSummary`) 위에 둔다. 카드별 링크는 끄고 합계 링크 1개.
   - (다) 신고 단위로 의제 전체 − 일반 전체를 재계산해 표시: 엔진 재계산이 필요 · 요약 카드 형태는 (나)와 같되 고지 문구가 «신고 단위 값»으로 바뀐다.
   (가)에서는 새 컴포넌트·새 echo가 없다 — 가장 작다. 법령상 §15㉑이 카드 단위인지 신고 단위인지는 해석례 미확인(엔진 계획서 V-14).
5. 번들의 FB 카드에는 지분 캡션(echo `ownershipRatio`)이 같은 형태로 뜬다. `PropertyCard`는 이미 지분을 `ownership` prop으로 따로 표시하므로(`BundledAllocationCard.tsx:479`) 중복처럼 보일 수 있으나 FB 카드의 캡션은 «FB 금액이 지분분임»을 알리는 다른 정보다.
6. 인쇄: 요약 카드·FB 카드는 `print:block`(항상 펼침), 기존 `detail-cards` 인쇄 섹션 규칙과 같다(번들의 PrintSection 구성은 «확인 필요» V-12).

### 4.8 ⑥ 사이드바

`lib/stores/*summary*`·`calc-wizard-store.ts`에서 `familyBusiness|가업` grep **0건** — 변경 없음(엔진 계획서 V-3도 재확인 대상).

---

## 5. 14 동기화 지점

| 지점 | 변경 | 위치 | 비고 |
|---|---|---|---|
| ① 폼 타입 | `AssetForm.fbShareBasisConfirmed: boolean`(신규 · 표시·검증 전용) | `calc-wizard-asset.ts`(`ownershipRemainderThirdParty` `:366` 인접) | **엔진 계획서 §6 ①이 «없음»이라 적었다 — UQ-2 확정으로 UI가 1개 추가**(엔진 계획서 갱신 요청) |
| ② initial | `fbShareBasisConfirmed: false` | `calc-wizard-asset-factory.ts`(`familyBusinessInheritance: undefined` `:652` 인접) | |
| ③ normalize | `undefined`/비-boolean → `false` | `calc-wizard-asset-migrate-phase3.ts:234-253` 인접 | 레거시 지분 × FB 세션은 `false` → ⑧이 지분 모드에서 차단 |
| ④ API 변환 | **주 자산 무변경** · 컴패니언 payload에 FB를 폼 그대로 추가 | `transfer-tax-api.ts:694-698`(불변) · `transfer-tax-api-companion-payload.ts` | 곱하지 않음 — anchor로 고정(§8) |
| ⑤ UI 위젯 | 지분 안내·환산 표·확인 토글·라벨/hint·미리보기·모달 안내 · **모든 카드에서 토글 활성** | 섹션 · 신규 `FamilyBusinessShareBasisBlock.tsx` · 모달 · `CompanionAcquisitionCauseSection.tsx:419` | §4.2·4.3·4.6 |
| ⑥ 사이드바 | 없음 | — | §4.8 |
| ⑦ 결과 카드 | 지분 캡션·라벨 접미(단건·번들) · `itemLabel` · 번들 `bundled` 고지 · (UQ-8) 번들 `fbLthdDetail` 배선 · ((나)(다) 선택 시만) 합계 요약 카드 | `FamilyBusinessImputedComparisonCard.tsx` · `ValuationDetailCards.tsx` · (`transfer-tax-aggregate-pickers.ts`) | echo는 엔진 계획서 이름(`ownershipRatio`·`wholeInput`) |
| ⑧ validation | V8-1 · V8-3 신설(카드마다 · 차단 신설 없음 — 엔진 계획서 §12.5) | `transfer-tax-validate-asset.ts:464-488` | 컴패니언 겸용·GB는 기존 ⑧ 유지 |
| ⑨⑩⑪ | 없음 | | |
| ⑫ Zod | 공유 스키마 leaf `transfer-tax-schema-family-business.ts`로 이동 후 컴패니언 스키마가 import · ⑩ `refineSplitPartCause` 컴패니언 FB 전달 + 겸용·GB 400 | 엔진 계획서 §12.3 | UI는 소비만 |
| ⑬ body spread | 키 불변(주 자산) · 컴패니언 payload 키 추가 | | |
| ⑭ Route 매핑 | `companionEngine`(`bundled-split-helpers.ts`)이 FB를 엔진 item으로 옮김 | 엔진 계획서 §12.3(키 커버리지 가드) | |

### 5.1 ⑧ ↔ ⑫ 정합 격자

| 입력 상태 | ⑧(화면) | ⑫(직접 API) | 정합 |
|---|---|---|---|
| FB + 100% · 어느 카드든 | 통과(기존 검증) | 통과 | 동일 · 주 자산 회귀 0 |
| FB + 지분 + 확인 있음 | 통과 | 통과(전체 금액 + `ownershipRatio`) | 동일 |
| FB + 지분 + 확인 없음 | **차단**(V8-1) | 통과 | **의도된 비대칭** — 확인은 화면 표시·검증 전용이라 ⑫가 막을 근거가 없다(`ownershipRemainderThirdParty` 선례). anchor 주석에 명시. **API 계약 변경 알림**: 직접 호출자의 FB 금액은 이제 «물건 전체 + `ownershipRatio`»(엔진 계획서 §5.2 영향) |
| FB + 지분 평가액 0원 | 차단(V8-3) | 통과 가능(엔진 계획서 §5.7은 ⑧ 규칙만 기재 — ⑫ 거부 여부 미기재) | **확인 필요**(V-15) — ⑧ ⊇ ⑫ 방향이라 허용 비대칭으로 둘지 엔진 계획서와 확정 |
| FB + 컴패니언(일반 주택·토지·상가 등 범위 안) | 통과 | 통과(⑫ 공유 스키마) | 동일 |
| FB + 컴패니언 겸용·GB | 차단(기존 `:464-472`) | **400(⑩ 신규)** | 같은 술어 — FS-21 |
| FB + 겸용 · 다건 합산 | 차단(기존) | 중화·거부(기존) | 기존 |

### 5.2 안티패턴 점검

| 정책 | 점검 |
|---|---|
| useEffect → store 미러링 금지 | 환산은 렌더 중 계산 · 확인 토글 리셋은 `onChange`/prefill 핸들러 직접 |
| 자동 안분 fallback 금지 | 확인 미기재는 **차단**이다. 지분율 곱셈은 엔진의 확정 계약(100% 기준)이지 빈 값 안분이 아니다 |
| validation 8번째 동기화 | ⑤ 미리보기 · ⑧ V8-3 · 엔진이 **같은 leaf**(`scaleFamilyBusinessInheritanceByShare`) |
| 이중 스케일 | 환산 leaf의 UI 사용은 표시·검증만 — 저장·전송 금지. ④ body anchor + 미리보기 ≡ 결과 카드 anchor가 지킨다(§8) |

---

## 6. 사용자 결정

### 6.1 결정 완료

| UQ | 결정 | 반영 |
|---|---|---|
| UQ-1 | **(a) 물건 전체(100%) 기준** | §4.2 문구·환산 표 |
| (곱하는 위치) | **엔진 STEP 0.42**(④ 변경 없음) | §4.4 · §5 |
| UQ-2 | **(b) «전체 기준 확인» 토글 필수**(표시·검증 전용) | `AssetForm.fbShareBasisConfirmed` · V8-1 |
| UQ-3 / Q-5 | **둘째 이후 카드도 지원**(⑧ 차단 기각) | §4.6 · §4.7 |
| UQ-4 | **(a)** 값 그대로 + 안내 밴드 + 확인 해제 | §4.3 |
| UQ-5 | **(a)** 엔진 echo `ownershipRatio`(+`wholeInput`) | §4.7 |

### 6.2 새 UQ (추천 첫째)

**UQ-6 번들에서 FB 카드가 둘 이상일 때 §18의2⑩ 공제액 표시 — 엔진 Q-8과 같은 질문 · 추천 (가)**
- **(가) 카드별로만 표시 · 합계 미산출 + 카드 안 고지 한 줄** ★(엔진 추천과 일치)
- (나) 카드별 합계(엔진 echo) + «카드별 독립 계산 합» 고지 + 요약 카드
- (다) 신고 단위 재계산 값 표시(엔진 재계산 필요)

근거: 번들 안 카드 값은 기본공제 0·카드 단독 누진으로 계산돼 단건 값과 다르고(95,440,000 ↔ 95,565,000) 합이 신고 단위 §18의2⑩ 값과 같다는 근거가 없다(엔진 계획서 §12.2). (가)는 새 echo·새 컴포넌트가 없어 가장 작고, UI가 값을 더해 만드는 위험도 없다. 사용자가 (나)/(다)를 택하면 §4.7-4의 요약 카드와 엔진 echo 항목이 추가된다.

**UQ-8 번들 카드에서 §95④ 후단 부분별 장특 표 노출 — 추천 (a)**
- **(a) 노출**(`pickValuationDetails`·`TransferValuationDetailSource`에 `fbLthdDetail` 추가 + `ValuationDetailCards` 전달) ★
- (b) 번들에서는 표 없이 카드만(현행)

근거: 지분 양도·둘째 카드 FB 지원으로 번들 FB 카드가 정상 경로가 되는데, 번들만 장특이 22% 비례 안분처럼 보이고 표가 없으면 단건과 다른 산식으로 오인된다(단건 PR #3678이 고친 결함 그대로). 비용은 목록 2곳 + 전달 2줄 + 동기화 가드 테스트 갱신. 엔진 계획서 §12.3은 이 echo를 «변경 없음»으로 적어 두었으므로 항목 추가를 요청한다.

**UQ-7 축 B에서 같은 물건의 둘째 지분 카드도 FB일 때 입력 편의 — 추천 (a)**
- **(a) 카드마다 직접 입력**(복사 버튼 없음) ★
- (b) 「첫 FB 카드 값 복사」 버튼(피상속인 취득가액·평가액·적용률·상속개시일 — 자본적지출 제외)

근거: 단순성 우선(요청 범위). 같은 물건·같은 피상속인이면 두 카드의 금액이 같아야 하는데 어긋난 입력은 ⑧이 모른다 — 교차 점검은 «확인 필요»(V-13). (b)는 복사가 «확인 토글»·이력 prefill과 얽혀 상태가 늘어난다.

---

## 7. 엔진 계획서와 맞춘 이름 · 어긋남

**엔진 계획서 정본(그대로 사용)**: `lib/tax-engine/family-business-share.ts` · `scaleFamilyBusinessInheritanceByShare(fb, ownershipRatio) → FamilyBusinessShareScaled{fb, ownershipRatio?, whole?}` · `FB_SHARE_SCALE_NOTICE(percent)` · `FamilyBusinessCgtDetail`: 기존 3금액 echo = **지분분**, 신규 `ownershipRatio?`·`wholeInput?` · Q-4 (가) 가드 해제 · FS-6/FS-20(④ body == 폼 입력, 확인 필드 미전송) · §12 컴패니언 배선(④ 컴패니언 payload · ⑫ 공유 스키마 leaf · ⑩ refine · ⑭ `companionEngine`) · PR 분할 PR-1 엔진 지분 → PR-2 컴패니언 배선 → **PR-3 UI**.

| # | 어긋남·요청 | 이 문서 위치 |
|---|---|---|
| E-1 | **확인 필드 위치** — 엔진 계획서 §12.6은 `familyBusinessInheritance.shareBasisConfirmed`(가정, ④가 떼어냄 · `buildFamilyBusinessPayload` leaf)를 상정했다. UI 정본은 **자산-수준 `AssetForm.fbShareBasisConfirmed`**(FB 객체 밖)다 — ④(주 자산·컴패니언)가 FB 객체를 폼 그대로 싣게 되어 «④ 변경 없음»·FS-20이 그대로 성립하고 strip leaf가 필요 없다. 엔진 계획서 §6·§12.3·§12.6의 해당 문장 정정 요청 | §4.2 · §5 ① |
| E-2 | 엔진 계획서 §6 ①②③ «없음» → UI가 자산 필드 1개를 추가(①②③) | §5 |
| E-3 | `fbLthdDetail`이 `pickValuationDetails`·`TransferValuationDetailSource`에 없다 — §12.3 «번들 echo 변경 없음»에 이 항목이 누락. UQ-8 (a)면 엔진 계획서에 추가 필요 | §4.7-3 |
| E-4 | 엔진 계획서 §12.3 ④ 컴패니언 행의 `buildFamilyBusinessPayload` 호출은 E-1로 불필요 — 컴패니언도 `asset.familyBusinessInheritance`를 그대로 spread | §4.6 |
| E-5 | V8-3(지분분 평가액 0원)의 ⑫ 거부 여부 — 엔진 계획서에 ⑧만 있다 | V-15 · §5.1 |

---

## 8. E2E · anchor

**이중 스케일 방지 anchor(UI 측 — 핵심)**
- `fb-share-no-double-scale.anchor`: ④ body의 `familyBusinessInheritance` 3금액 == 폼 입력(주 자산 · 컴패니언 둘 다) · 지분일 때 `ownershipRatio` 동시 존재 · 확인 필드는 body에 없다 · 폼 → body → 라우트 → 엔진 echo의 `wholeInput` == 폼 입력, 기존 3금액 == `applyRatio`(손계산).
- `fb-share-preview-parity.anchor`: ⑤ 미리보기 숫자(`calcImputedPreview(scaled.fb)`) == 같은 입력의 결과 카드 «의제 취득가액»(엔진 echo) — 두 곳이 같은 leaf임을 고정.
- 뮤테이션: ④에 `applyRatio` 삽입 → 첫 anchor red · 미리보기를 `scaled.fb` 대신 폼 값으로 → 둘째 red.

**Vitest(UI)**: 컴포넌트 렌더(`fb-share-basis-block.test.tsx` — 환산 행 · 확인 토글 · 100%에서 미노출) · ⑧(V8-1/V8-3 · 둘째 이후 카드에도 동일 · 100% 무변화) · 모달 밴드 · 번들 결과(`BundledAllocationCard` — FB 카드가 자산 카드 안에 `itemLabel`과 함께 · 번들 고지 한 줄 · 합계 행 없음(UQ-6 가) · 단건 화면은 고지 미노출).

**E2E** `e2e/transfer-fb-share.spec.ts`(시료는 `transfer-fb-lthd-portion.spec.ts`·`_helpers/split-acq-display.ts`·이력은 `_helpers/history-seed.ts`)

| ID | 시나리오 | 확인 |
|---|---|---|
| FB-SH-E1 | **교재 이월과세5 지분 1/2**(축 A 선언): FB 5억/15억/70%(전체) · 양도가 18억 · 양도비 3천만 | 환산 표 «5억×50%=2.5억 / 15억×50%=7.5억» · 확인 전 계산 차단 → 켠 뒤 body FB = 500,000,000/1,500,000,000(**전체값 그대로**) + `ownershipRatio 0.5` · 결과 카드 의제 취득가액 400,000,000 · 캡션 «내 지분 50% 기준» · 양도차익 485,000,000 · 장특 127,700,000 · 과세표준 354,800,000 · 산출세액 115,980,000 · `creditAmount` 95,440,000(엔진 계획서 FS-1 확정값) |
| FB-SH-E2 | 축 B **첫 카드** 상속 FB 50%(교재 FB) + 매매 50% | body primary FB 전체값 · 합계 양도차익 **785,000,000** · 장특 145,700,000 · 과세표준 636,800,000 · 산출세액 **231,516,000**(엔진 계획서 FS-10·§12.4 C-2 — 엔진 직접 probe로 일치 확인됨) · FB 카드는 첫 자산 카드 안 |
| FB-SH-E3 | 축 B **둘째 카드**가 상속 FB(첫 카드 매매) | 토글 활성 · body `companionAssets[0].familyBusinessInheritance` = 전체값(`fbShareBasisConfirmed` 키 없음) · 결과 합계가 E2와 **같다**(785,000,000 · 231,516,000 — 카드 순서 불변, 엔진 계획서 FS-15·16 · 현행 435,000,000) · 둘째 자산 카드 안에 FB 비교 카드(`itemLabel` = 그 카드 라벨) · 첫 카드에는 FB 카드 없음 |
| FB-SH-E4 | 축 B **두 카드 모두** 상속 FB(같은 물건 60%+40%, 전체 값 입력) | 카드별 FB 비교 카드 2개 · 합계 의제 취득가액 = 단건 100% 입력 의제와 ±1원(엔진 계획서 C-5) · UQ-6 (가): 합계 행·요약 카드 **없음** · 각 카드에 «단독으로 본 값» 고지 · (나)/(다) 확정 시 요약 카드 검증 추가 |
| FB-SH-E5 | 함께 양도 둘째 카드가 100% 상속 FB(엔진 계획서 C-3·FS-17) | body 컴패니언 FB · FB 비교 카드가 그 자산 카드 안에 · 합계 양도차익 = 첫 카드 + 그 카드 단건 양도차익(엔진 FS-17 실행값으로 확정) · 현행은 echo 없음(C2) |
| FB-SH-E6 | 이력 모달(지분 50%) | amber 안내 · 선택값이 이력 그대로 · 확인 토글 OFF로 리셋 |
| FB-SH-E7 | 회귀: 지분 100% 단건(`FB-F3-E1`·`FB-LTHD-E1`) | 환산 표·확인 토글·캡션 미노출 · body 불변 |
| FB-SH-E8 | 레거시 세션: 확인 없이 지분 50% + FB 시드 | V8-1 차단 · 토글 후 통과 |

---

## 9. 구현 순서 · 파일 정책

1. **엔진 계획서 PR 분할**: PR-1 엔진 지분(leaf·STEP 0.42·가드·echo) → PR-2 컴패니언 배선(④ 컴패니언 payload·⑫ 공유 스키마·⑩·⑭·swap 가드 제거) → **PR-3 UI**(이 문서). 기대값(번들 785,000,000 등)이 PR-1에 의존하므로 순차이며, Do는 시퀀셜(엔진이 타입·echo·anchor 선처리 → UI가 ⑤⑥⑦).
2. PR-3 구성: ①②③(`fbShareBasisConfirmed`) → ⑧ V8-1·V8-3 → ⑤ 섹션·블록·모달(모든 카드 활성) → ⑦ 단건·번들 카드(캡션·`itemLabel`·고지·(UQ-8) `fbLthdDetail` 배선) → anchor·E2E. ④는 **건드리지 않는다**(PR-2가 컴패니언 payload만).
3. 줄 수: FB 섹션 491(+≈40) · 새 블록 ≈90 · 새 요약 카드 ≈70 · `transfer-tax-validate-asset.ts` 512(+≈20) · 결과 카드 381(+≈25) · `transfer-tax-api.ts` **무변경**(756). 새 요약 카드는 UQ-6 (나)/(다) 선택 시에만. 모두 800 미만.
4. 완료 보고 전: 14지점(⑫⑬⑭ grep) · `npx tsc --noEmit` · `npx vitest run __tests__/tax-engine/transfer-tax/ __tests__/calc/ __tests__/components/ __tests__/lib/calc/` · E2E · **브라우저 수동 확인**(미수행이면 명시).

---

## 10. 확인 필요 (V-n)

| ID | 항목 |
|---|---|
| V-1 | 공동상속에서 가업상속공제적용률(공제금액 ÷ 가업상속 재산가액)이 지분과 독립인지 — 엔진 계획서 §1.2·§1.3이 «상속인 단위»로 읽음. 직접 해석례 0건 |
| V-2 | 상속세 화면 평가액이 피상속인 소유분인지 물건 전체인지(= 엔진 계획서 V-2) — 이력 prefill·모달 안내 근거 |
| V-3 | 주택·상가·입주권·재개발 × 지분 × FB — probe는 토지만(엔진 계획서 V-9·V-10) |
| V-4 | 12억 고가주택 안분(`housing-excess-split.ts:77`) × 지분 × FB |
| V-5 | 명세서·PDF 단계 문구의 지분 표기(엔진 step 문구) |
| V-6 | 확인 토글을 지분율 변경 시 해제할지 — 현 설계는 유지(기준은 지분율과 무관) |
| V-7 | 교재 지분 1/2 정답은 교재에 없음 — 산술 도출(엔진 계획서 §3.4) 사용자 확인 |
| V-8 | 이력(IndexedDB) 재열기 시 재계산 경로 — 레거시 지분 × FB가 ⑧ 없이 재표시되는지(엔진 계획서 V-11) |
| V-9 | V8 차단 문자열의 필드 점프 지원 여부 — 현행 FB ⑧은 문자열 반환 |
| V-10 | 브라우저 수동 확인 **미수행** — 라우트 하네스 probe(mock 세율)와 코드 대조뿐 |
| V-11 | `g1-reverse-appurtenant-swap` 등 «FB는 첫 자산 전용» 전제 테스트·주석(§4.6) 전수 — 지원 후 반전 대상 grep 필요 |
| V-12 | 번들 결과의 인쇄 선택 구성(PrintSection)에 요약 카드를 어떻게 넣을지 |
| V-13 | 축 B에서 같은 물건의 두 FB 카드가 서로 다른 피상속인 금액을 가질 때(교차 점검) — 현 설계는 점검 없음 |
| V-15 | V8-3(지분분 평가액 0원)의 ⑫ 거부 여부 · 확인 토글 필수는 ⑧만(허용 비대칭) — 엔진 계획서와 확정 |
| V-16 | 번들 FB 카드의 `inheritanceValuation`(상속 보충적평가 안분 키)과 FB `inheritanceMarketValue`는 다른 채널(엔진 계획서 V-16) — 함께 양도 `apportioned` 안분에서 화면 입력이 어느 쪽인지 사용자에게 구분되는지 |
| V-17 | 번들에서 「확인 토글」 값이 카드별로 필요한지 — 같은 물건의 두 지분이 같은 전체 금액을 쓰는데 카드마다 확인을 받는다(현 설계: 카드마다) |
| V-14 | 워크트리의 미추적 `__tests__/api/zz-probe-fb-share.tmp.test.ts`는 이 작업이 만든 파일이 아니다(엔진 계획서 에이전트 것으로 추정 · 손대지 않음). 이 작업의 probe는 전부 삭제했다 |

---

## 11. 사용자 결정 (최종 표 — 2026-11-26)

| 항목 | 결정 | 상태 |
|---|---|---|
| UQ-1 입력 기준 | 물건 전체(100%) 기준 | 확정 |
| 곱하는 위치 | 엔진 STEP 0.42 · **④ 변경 없음**(단건·컴패니언 모두 100% 값 그대로) | 확정 |
| UQ-2 기준 확인 | «전체 기준 확인» 토글 필수(표시·검증 전용 · `AssetForm.fbShareBasisConfirmed` — 엔진·⑫·body 불관여) | 확정 (필드 위치는 §7 E-1로 엔진 계획서 정정 요청) |
| UQ-3 / Q-5 둘째 이후 카드 | 지원 — ⑧ 차단안 기각 · 토글 모든 카드 활성 · V8-2 폐기 | 확정 |
| UQ-4 이력 모달 | (a) 값 그대로 + 안내 + 확인 해제 | 확정 |
| UQ-5 결과 카드 지분 표시 | (a) 엔진 echo `ownershipRatio`·`wholeInput` | 확정 |
| 엔진 Q-3·Q-4·Q-6·Q-7 | 항목별 선절사 · 가드 해제 · «확인 필요» 고지 · 기존 3필드=지분분 | 확정(엔진 계획서 §13) |
| **UQ-6 = 엔진 Q-8** 번들 `creditAmount` | **추천 (가) 카드별만 · 합계 미산출 + 카드 안 고지** / (나) 합계+고지 / (다) 신고 단위 재계산 | **미결정** |
| **UQ-7** 같은 물건 둘째 FB 카드 입력 편의 | **추천 (a) 카드마다 직접 입력** / (b) 첫 FB 카드 값 복사 버튼 | **미결정** |
| **UQ-8** 번들 부분별 장특 표 | **추천 (a) 노출**(`fbLthdDetail` echo 배선) / (b) 현행(표 없음) | **미결정** |


---

## 최종 결정 (2026-11-26 · 코디네이터 확정 — 엔진·UI 계획서 공통, 이 표가 두 문서의 앞선 표보다 우선)

| 항목 | 결정 |
|---|---|
| Q-1 / UQ-1 FB 3금액 입력 단위 | **물건 전체(100%) 기준** |
| Q-2 지분율 곱하는 위치 | **엔진 STEP 0.42** (`scaleFamilyBusinessInheritanceByShare`) — ④ 변경 없음(이중 스케일 금지) |
| Q-3 절사 | 항목별 `applyRatio` 선절사 |
| Q-4 #3678 `ownershipRatio<1` 슬라이스 가드 | **해제**(부담부증여 H-1·총 물건가 ≠ 양도가 가드는 유지) |
| Q-5 / UQ-3 둘째 이후 카드 FB | **지원**(사용자 선택 — 추천 ⑧ 차단과 다름). 엔진은 이미 카드별 호출 → ④ 컴패니언 payload·⑫ 컴패니언 스키마(공유 leaf)·⑩·⑭ 배선 |
| Q-6 | 지분 × FB «확인 필요» 고지 부착 |
| Q-7 / UQ-5 echo | 기존 3필드 = 지분분 + `ownershipRatio`·`wholeInput` |
| UQ-2 전체 기준 확인 | **필수** — 필드는 **자산-수준 `AssetForm.fbShareBasisConfirmed`**(UI 정본, 표시·검증 전용, FB 객체 밖이라 body에 안 실림 → ④ strip leaf 불필요). 엔진 계획서 §12.6의 `familyBusinessInheritance.shareBasisConfirmed`·`buildFamilyBusinessPayload`는 **폐기**(E-1/E-4) |
| E-2 | 14지점 ①②③은 «자산 필드 1개 추가»로 정정 |
| E-3 / UQ-8 번들 부분별 장특 표 | **노출** — 번들 breakdown(`pickValuationDetails`·`TransferValuationDetailSource`)에 `fbLthdDetail` 추가 |
| E-5 V8-3 지분분 평가액 0원 | ⑧과 ⑫ **모두 거부**(서버가 계산 가능한 사실 — ⑧↔⑫ 대칭). 비대칭은 UI 전용 확인 토글(UQ-2)만 |
| Q-8 / UQ-6 번들 creditAmount | **카드별만 표시, 합계 없음** + 카드 안 «단독으로 본 값·확인 필요» 고지 1줄 |
| UQ-4 이력 모달 | 값 그대로 + 지분 안내 밴드 + prefill 시 확인 토글 해제 |
| UQ-7 같은 물건 두 FB 지분 카드 | 카드마다 직접 입력 |
| PR 순서 | PR-1 엔진 지분 스케일 → PR-2 컴패니언 FB 배선 → PR-3 UI(①~⑧·번들 표·E2E) |
