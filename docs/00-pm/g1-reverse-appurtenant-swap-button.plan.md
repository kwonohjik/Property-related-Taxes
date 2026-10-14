# 사례 28 역방향 — «주택을 첫 자산으로 바꾸기» 버튼 — 계획서 (G1 화면, v0.3)

> 작성 2026-10-14 · 출처: 1주택 코드 리뷰 후속 G1(#2168) 「화면 재설계」 결정 — 사용자가 **버튼 클릭 방식**을 택함(자동 정렬·판정 대상 자산 분리는 기각) · 검증 깊이 **L2**(입력 순서만 바뀌고 세액 산식은 안 바뀐다 — 단 승격 주택의 입력이 처음 반영되는 경로가 있다, §4-7)
> 상태: **구현 완료(결정 Q1~Q7 승인 2026-10-14) · 독립 리뷰 반영(v0.3: must-fix 2 · should-fix 5)** — §7에 단계별 실측 결과, §7-0에 Phase 0 표, §7-7에 리뷰 반영. 수치·file:line은 코드 읽기와 grep으로 확인한 것이고, 실행으로 재현하지 않은 항목은 «코드읽기»로 표시했다(구현 중 실측으로 확정한 항목은 §7에 기록).

---

## 0. 한눈에

**현행.** 첫 자산이 주택부수토지이고 함께 양도하는 자산에 일반 주택 1건이 있으면(= 사례 28 역방향), API(route)는 주택 먼저 순서와 **같은 값**을 낸다(#2168). 그러나 화면은 이 구성을
⑧으로 **막고** 「주택을 첫 자산으로, 이 토지를 함께 양도하는 자산으로 입력하세요」라고만 안내한다(`lib/calc/transfer-tax-validate-asset.ts:231-236`).
이유: 보유 상황 단계(Step4)의 1세대1주택 판정 입력(세대·주택 수·거주기간·취득 당시 조정대상지역·일시적 2주택 등)이 첫 자산이 주택일 때만 열려, 토지가 첫 자산인 채 계산하면 숨은 기본값으로 주택·토지가 통째로 비과세된다
(검토 실측: 조정대상지역 취득·거주 0 — 주택 먼저 173,646,000, 토지 먼저 0).

**지금 순서를 바꾸는 방법은 «자산 삭제 후 재입력»뿐**이다(단건 마법사·다건 모두 순서 이동 UI 없음 — 다건 `reorderProperties`는 호출처 0건). 그러면 입력이 사라진다.

**변경.** 그 구성일 때 안내 카드에 **«주택을 첫 자산으로 바꾸기» 버튼**을 단다. 클릭하면 폼의 자산 순서만 «주택이 맨 앞, 나머지는 상대 순서 유지»로 바꾸고,
순서와 함께 움직여야 하는 값(§3)을 같은 패치로 옮긴다. 값은 하나도 지우지 않는다. 사용자가 누를 때만 바뀐다(조용한 변경 없음).

**하지 않는 것**: 자동 정렬 · 판정 대상 자산 분리(Step4·④·⑧ 56곳 개편) · ⑧ 차단 제거(방어선으로 유지) · 세액 산식 변경 · 새 입력 필드.

---

## 1. 근거 — 이 방식이 안전한 이유

| 사실 | 근거 |
|---|---|
| 주 자산과 컴패니언을 그리는 카드는 **같은 컴포넌트** `CompanionAssetCard`이고 차이는 prop·index뿐 | `CompanionAssetsSection.tsx:92-121` (`showFormDates={idx===0}`, `isFirst={index===0}`) |
| `AssetForm`은 두 위치에서 같은 모양이고, 주택 부수토지 면적 사실(`acquisitionArea`·`buildingFootprintArea`·`appurtenantLandZone`)도 같은 키다. 컴패니언일 때만 ④가 `companionHousingLand`로 바꿔 싣는다 | `transfer-tax-api-companion-payload.ts:538-560`, `transfer-tax-api.ts:451` |
| 교환 후 결과는 **주택 먼저 폼의 결과**와 같아야 하고(정본), route 역방향 anchor(`transfer.route.reverse-appurtenant-unit-g1`)가 «주택 먼저 ≡ 역방향 route»를 이미 고정했다 | `__tests__/api/transfer.route.reverse-appurtenant-unit-g1.anchor.test.ts` |
| 필드 추가가 없다 — ⑫⑬⑭(Zod·body spread·route 매핑) 해당 없음. 새로 쓰는 키는 기존 `assets`·`isUnregistered` 두 개다 | §3 |

---

## 2. 교환 규칙 — «회전»(주택을 맨 앞으로)

`reverseAppurtenantHouseAssetId(assets)`(`lib/calc/reverse-appurtenant-house.ts:15`)가 돌려주는 짝 주택 id를 맨 앞으로 옮기고 **나머지는 입력 순서 그대로** 둔다.
`[L, H]→[H, L]`, `[L1, H, L2]→[H, L1, L2]`.

단순 교환(`swap(0,k)`)은 토지가 2건 이상이면 `[L1,L2,H]→[H,L2,L1]`로 **토지 순서가 뒤집힌다**. 순서는 세액에 닿는다 — 반올림 잔액이 «마지막 자산»에 흡수되고
(`bundled-sale-apportionment.ts:146-150·195-199·216-220`), 같은 한도를 먼저 쓰는 쪽이 정해진다(K1 규칙). 회전은 «주택을 먼저 넣고 토지를 입력한 순서대로 뒀을 때»의 폼과 정확히 같다.

---

## 3. 순서와 함께 움직여야 하는 값 (교환 시 반드시 변환)

조사 결과 **침묵 소실·의미 변경이 나는 필드는 이 둘뿐**이다(교환 대상 두 자산 한정). 한 번의 `onChange({ assets, isUnregistered })` 패치로 같이 쓴다.

| # | 값 | 문제 | 변환 | 근거 |
|---|---|---|---|---|
| T1 | `AssetForm.isPrimaryForHouseholdFlags` | index에서 파생되지 않는 **독립 저장 필드**다. 교환하지 않으면 승격한 주택에 「주 자산」 배지가 없고, 강등된 토지는 «토지 세율 수동 지정» 토글(`land && !isPrimary`)이 사라진다. 기존 «첫 자산 삭제 → 컴패니언 승격» 경로도 이 플래그를 고치지 않는다(기존 갭) | 새 index 0 = `true`, 그 외 모두 `false`로 **명시 설정** | 읽는 곳은 `CompanionAssetCard.tsx:132` 한 곳(grep 실측), `AssetSectionAcquisition.tsx:196` |
| T2 | 미등기 축: 주 자산은 **폼 전역** `form.isUnregistered`, 컴패니언은 **자산** `asset.isUnregistered` | 단순 교환하면 토지의 폼 전역 미등기가 주택에 붙고, 주택의 컴패니언 미등기는 사라진다 | 새 `form.isUnregistered` ← 승격 주택의 `asset.isUnregistered`; 강등 토지의 `asset.isUnregistered` ← 옛 `form.isUnregistered`; 승격 주택의 `asset.isUnregistered` ← `false` | `transfer-tax-api.ts:483`(`form.isUnregistered`) ↔ `companion-payload.ts:440`(`asset.isUnregistered`), UI 토글은 `!isFirst`에서만(`AssetSectionBasic.tsx:207-219`), 사이드바 `transfer-per-asset-summary.ts:584`, 자경×미등기 검사 `transfer-tax-validate-reductions.ts:130` |

**의미 불변으로 확인한 것**(변환 불필요): 양도가액 계열(`actualSalePrice`는 주 자산→`primaryActualSalePrice`, 컴패니언→`fixedSalePrice`로 같은 뜻 — 교환은 길이 ≥ 2라 `contractTotalPrice` 미러 대상이 아님),
취득 계열 UI(같은 컴포넌트 `CompanionAcquisitionCauseSection`), `reductions`(per-asset), `landNature`, `regionCode`·`regionInDesignatedDistrict`(자산 귀속), 폼 전역 세대 사실(값 불변 — 의미만 새 assets[0] 주택을 가리킨다, 이것이 목적).
**assetId는 불변**이라 React key·라디오 name·검증 이동 키(`data-asset-card-index`는 매 렌더 `formData`에서 파생)가 stale해지지 않는다.

---

## 4. 위험과 대응

| # | 위험 | 대응 |
|---|---|---|
| 1 | **스토어 `result`가 안 비워진다** — `updateFormData`는 `result`를 건드리지 않는다(`calc-wizard-store.ts:323-324`). 결과 화면은 단계 게이트(`isResult = result!==null && currentStep===totalSteps`, `TransferTaxCalculator.tsx:114`)로 막히지만 사이드바 `computeTransferPerAssetSummary(formData, result)`는 `result`를 항상 읽고 index 0을 `"primary"`로 매칭(`transfer-per-asset-summary.ts:313`)해 옛 «primary»(토지 값)가 새 첫 자산(주택)에 붙는다 | 교환 핸들러에서 `result`를 비운다. 단건 스토어에 `clearResult` 액션 신설(`setResult` 시그니처가 non-null이라 재사용 불가 — `:213`). 다건·판정·주식 스토어는 이미 `result:null`을 쓴다 |
| 2 | 카드 펼침 초기 state는 마운트 때만 계산(`CompanionAssetCard.tsx:187-189`, `showFormDates ? {1:true} : {}`) — 교환 후 새 첫 카드(주택)는 양도일 위젯이 든 ①이 접힌 채, 토지는 ①이 펼쳐진 채 남는다 | 교환 시 Step1 로컬 `swapEpoch`를 올려 `CompanionAssetsSection`의 카드 key에 섞는다(카드 재마운트 — 로컬 UI state만 초기화, 입력값은 스토어에 있어 보존) |
| 3 | 기본 라벨 `자산 N`(`factory:86-87`)이 교환 후 카드 번호와 어긋난다 | 라벨이 정확히 `자산 \d+` 꼴(미편집)인 자산만 새 index+1로 다시 매긴다. 사용자가 고친 라벨은 건드리지 않는다 |
| 4 | **강등되는 토지의 «첫 자산 전용» 입력(5종 — 아래 4종 + `pre1990Enabled` 토지등급 환산, v0.3)이 있으면** 교환 후 침묵 소실(⚠️) 또는 다른 ⑧ 차단(⛔). 정밀판정 `nblUseDetailedJudgment`·`nonBusinessLandRaw`는 주 자산만 ④가 전송 → +10%p 단순판정으로 **조용히 강등**(`AssetSectionExtras.tsx:49-57` 주석이 같은 문제), `familyBusinessInheritance`는 컴패니언 Zod에 키가 없음, `parcelMode`·`isSalesCaseAcquisition`은 컴패니언 ⑧ 차단, **`pre1990Enabled`(매매 취득 · 1990.8.30. 이전)는 컴패니언 payload가 §163⑨ 취득원인(상속·증여)일 때만 `pre1990Land`를 싣는다**(`transfer-tax-api-companion-payload.ts:421-425`) → 환산+기준시가 없음은 API 400, 확정 취득가+`pre1990Enabled`는 취득가액이 환산액에서 입력값으로 바뀐다(리뷰 M2 실측) | **노출 가드**(§5)로 버튼을 숨기고 사유 한 줄을 보인다 — 값을 옮기다 잃는 일 자체를 만들지 않는다 |
| 5 | 지분 분할(축 B) 묶음에서 ⑧ 역방향 판정이 **오탐할 가능성**(코드읽기): `reverseAppurtenantHouseAssetId`가 `splitMode`를 안 보고, 지분 분할 형제는 `makeDefaultAsset(2)`라 raw `assetKind`가 `"housing"`이다(`Step1.tsx:113-117`, `validate-asset.ts:215-221`) | **Phase 0 재현 → Q6로 ⑧ 보정.** 단 **데이터만 보는 ⑧·리프는 «지분율 전부 빈칸(토글 B 진입 직후)»만 축 B로 구분한다**(v0.3 · 리뷰 M1) — 지분율이 채워진 뒤(지분 < 1)는 함께 양도 모드의 «전 자산 부분 소유»와 데이터로 구분되지 않아(구분은 `Step1`의 `splitMode` state만 안다) 넓게 풀면 함께 양도 묶음을 ⑧이 풀어 숨은 기본값으로 계산한다(실측: 토지 1/2 + 주택 1/2, 계약가 11억 — 주택 먼저 0 · 토지 먼저 279,477,000) → 채워진 뒤는 옛 동작(⑧ 차단 + 버튼)을 유지하고 지분 분할 모드의 카드 숨김은 `Step1` `splitMode`가 맡는다 |
| 6 | 계산 이력의 제목·사업키가 `assets[0]` 주소에서 만들어진다(`title-generator.ts:63-66`, `business-key.ts:45`) — 교환하면 같은 묶음의 이력 키가 주택 주소로 바뀐다 | 저장은 결과 시점이라 순서가 확정된 뒤의 값이다. 문서화만(동작 변경 없음) |
| 7 | **승격 주택에 «처음 반영되는 입력»이 있다** — 컴패니언일 때 ④가 안 보내던 `isSelfBuilt`·`extension*`(§114조의2)·고아 `rentalHousingException`(§155⑳)이 주 자산이 되면 살아난다(`transfer-tax-api.ts:413-426`, `AssetSectionExtras.tsx:46-49`가 의도한 승격 동작). 같은 입력이 «주택 먼저»에서는 반영됐으므로 올바른 방향이나, 사용자가 본 세액이 달라질 수 있다 | 교환 직후 해당 입력이 하나라도 있으면 카드에 한 줄 안내(§5-3 — 목록은 v0.3에서 6종으로 확장·실측 확정). 입력이 없으면 안내 없음 |
| 8 | 반올림 잔액이 «마지막 자산»에 흡수 — 안분(apportioned) 모드에서 «교환 결과 ≡ route 역방향 결과»가 **±1원** 날 수 있다(기존 route anchor 시료는 전부 나누어떨어짐) | 정본은 «교환 결과 ≡ **주택 먼저 폼** 결과»(같은 순서라 정확히 일치). route 역방향과의 직접 비교는 정수 분할 시료에서만 한다 |
| 9 | 단건 Step1이 다건 편집에도 마운트된다 — 다건은 `assets.length>1`을 `MULTI_COMPANION_UNSUPPORTED_MESSAGE`로 막는다(`multi-transfer-tax-validate.ts:188-190`) | 임베드 모드에서는 버튼을 숨긴다 |

---

## 5. 설계

### 5-1. 순수 헬퍼 (`lib/calc/reverse-appurtenant-swap.ts`, 신규 leaf)
```
reverseAppurtenantSwapPatch(form): { assets, isUnregistered } | null   // null = 교환 불가(가드 불성립)
reverseAppurtenantSwapBlockReason(form): string | null                 // 버튼 대신 보일 사유(없으면 null)
```
- 짝 주택 판정은 기존 `reverseAppurtenantHouseAssetId`를 그대로 쓴다(⑧·버튼·route가 **같은 구성 판정**).
- 패치: 회전(§2) + T1·T2(§3) + 기본 라벨 재번호(§4-3). 입력 객체를 바꾸지 않는다(불변).
- 노출 가드(= 가드가 걸리면 `reverseAppurtenantSwapPatch`는 `null`, 사유는 `BlockReason`):

| 조건 | 처리 | 이유 |
|---|---|---|
| `reverseAppurtenantHouseAssetId` undefined (주택 2건 이상·겸용·재개발 완공·토지 성격 미선택·입주권만 등) | 버튼 없음(현행 ⑧·엔진 경고가 그대로 안내) | 짝 주택을 정하지 못한다 |
| 지분 분할(축 B) — 데이터: **전 자산 지분율 빈칸**(`isFractionalSplitEntryBundle`)이면 리프가 짝 주택 없음 · 화면: `Step1`의 `splitMode==="fractional"`이면 카드 숨김 | 숨김 | 형제가 «짝 주택»으로 오탐된다(§4-5). 세 술어(`isFractionalSplitEntryBundle`·`isFractionalSplitRestorable`(Step1 복원)·`isFullFractionalBundle`(route·④))를 `transfer-tax-api-asset-basics.ts` 한 파일에 둔다 |
| `isReplotIncrement` 자산이 하나라도 있음 | 숨김 **+ 사유 한 줄**(v0.3 · ⑧은 «주택을 첫 자산으로»라 안내하므로) | 증가분의 양도시 기준시가가 `assets[0]`(당초분)에서 파생(`replot-increment-std-price.ts:26-38`) — 주택이 0번이 되면 깨진다 |
| 첫 자산 토지에 `nblUseDetailedJudgment`·`parcelMode`·`isSalesCaseAcquisition`·`familyBusinessInheritance`·**`pre1990Enabled`(토지등급 환산, 매매 취득 · §163⑨ 취득원인 제외)** 중 하나 | 숨김 + 사유 | §4-4 — 소실·강등을 만들지 않는다 |
| 다건 임베드 모드 | 숨김 | §4-9 |
| 부담부증여·개별 지분(<1) 자산 | 버튼 표시. **안내 문구는 넣지 않는다**(v0.3 편차 — §7-7) | 엔진 `conflicted` 가드가 합산을 안 하고 **계산 결과 경고로 알린다**(`transfer-tax-one-house-unit.ts:79-93` · 실측: `주택만 1/2`·`토지만 1/2` 모두 «지분·부담부증여가 함께 있어 1세대1주택 합산 판정…» 경고). `conflicted` 구성원(배율 이내 토지)은 route가 나눈 뒤에야 정해져 화면이 미리 단정하면 틀릴 수 있다 |

### 5-2. UI (`components/calc/transfer/ReverseAppurtenantSwapNotice.tsx`, 신규)
- 부착 위치: **`Step1`에서 구성을 파생해 `CompanionAssetsSection` 위에 `ToneCard` + 버튼**(`Step1`은 `form`·`updateAssets`·`onChange`를 모두 가졌고 useEffect·미러링 불필요). ⑧ 메시지는 자산당 «첫 오류 1건»만 노출하므로(`validate-asset.ts:120-210` 조기 return) ⑧ 문구에 의존하지 않고 **구성 자체**로 노출한다.
- `ToneCard`(톤 하드코딩 금지, `tones.ts`) + `<Button>`. 문구(사실만, 유불리 표현 금지): 「첫 자산이 주택부수토지입니다. 1세대1주택 판정에 필요한 세대·거주기간·조정대상지역 입력은 주택이 첫 자산일 때 열립니다(소득세법 §89 ①). 주택을 첫 자산으로 바꾸면 입력은 그대로 두고 순서만 바뀝니다.」(v0.3 — 조문 인용은 «열립니다» 문장에 붙인다)
- 대안(B, 불채택): `CompanionLandNatureBlock`에 `onSwap`을 3단 prop drilling(`CompanionAssetsSection`→`CompanionAssetCard`→`AssetSectionBasic`→블록). ⑧ 이동 앵커(`data-field="landNature"`) 안에 놓이는 장점뿐이라 변경 면적 대비 이득이 작다. C(`ValidationIssue`에 `action` 필드)는 영향 범위가 가장 커 불채택.
- ⑧ 안내 문구·anchor 단언 문구(`g1-reverse-appurtenant-wizard.anchor.test.ts`의 `BLOCK`·부분 문자열)는 **바꾸지 않는다** — 같은 문장이 엔진 경고(`transfer-tax-one-house-unit.ts:64-70`)에도 있다.

### 5-3. 교환 직후 안내
교환 패치 직후, 승격 주택에 §4-7의 «처음 반영되는 입력»이 있으면 카드 안내 한 줄(조건부). **v0.3: 안내는 스냅샷이 아니라 매 렌더 현재 폼에서 파생한다**(승격 주택 id가 지금도 `assets[0]`이고 목록이 비어 있지 않을 때만 — 재편집하면 스스로 거둔다). 목록(주택 카드 키를 하나씩 바꿔 컴패니언 위치 ④ 본문은 그대로이고 주 자산 위치 본문만 바뀌는 키를 실측): 신축·증축 · 장기임대주택 거주주택 비과세 특례 · 자산별 거주기간(`residencePeriodMonthsAsset`·`residenceInputMode`/`residencePeriods`) · 감정가액 취득 · 매매사례가액 취득 · 개별주택가격 미공시(PHD). 제외: `regionCode`(Step4 조정대상지역 자동 판정이 다시 채워 침묵 함정이 아니다 — 리뷰 결정) · `buildingFootprintArea`·`appurtenantLandZone`(이 교환이 열려는 사실) · `transferType`·`standardPricePerSqmAtAcq`(일반 입력 경로 아님). 입력이 없으면 아무것도 안 띄운다. 교환은 되돌리기 버튼을 두지 않는다 — 같은 구성이 다시 생기지 않으므로(주택이 첫 자산) 반대 방향 판정이 없다.

### 5-4. 배선
- `Step1`: 구성 파생 → 카드 렌더 → 클릭 시 `onChange(patch)` + `swapEpoch+1` + 결과 비우기.
- 결과 비우기: 단건 스토어 `clearResult: () => set({ result: null })` 신설. `Step1`은 스토어에 직접 접근하지 않으므로 `TransferTaxCalculator`가 `onInvalidateResult`(=`clearResult`)를 prop으로 내린다(Q5에서 방식 확정).
- ⑧(`validate-asset.ts:231`)은 **그대로 둔다** — 교환 입구가 여럿이어서(판정 불러오기·이력 복원·수정신고 진입 등은 버튼을 안 거친다) 방어선으로 필요하다. 사용자는 차단 시 위 카드의 버튼으로 해소한다.
- 입구 전수(조사): `Step1.updateAssets`·토글 2개, `CompanionAssetsSection` add/remove/update, `Step5.updateAsset`(`:649`), Step4 `i===0` 패치, 판정 불러오기(`one-house-judgment-handoff.ts:133`), 이력 복원(`transfer-resume-entry.ts`), 수정신고(`transfer-amendment-entry.ts`), 단건↔다건 이관(`transfer-calc-actions.ts`). 버튼은 이 중 어느 것도 새로 만들지 않고 `Step1`의 `onChange` 한 곳만 쓴다.

---

## 6. 결정 필요 (권고안 = 기본값)

| # | 질문 | 권고 |
|---|---|---|
| Q1 | 교환 방식 | **회전**(주택을 맨 앞으로, 나머지 상대 순서 유지) — 토지 2건 이상에서 순서·잔액 흡수 보존 |
| Q2 | 첫 자산 토지의 «첫 자산 전용 입력»(정밀판정·다필지·매매사례·가업상속공제)이 있을 때 | **버튼 숨김 + 사유 한 줄**(입력을 먼저 해제하게 한다). 대안: 버튼은 두고 «이 입력은 반영되지 않습니다» 경고 — 침묵 강등을 사용자가 감수하는 모양이라 비권고 |
| Q3 | 교환 직후 «처음 반영되는 입력» 안내(§4-7) | **있을 때만 한 줄**(없으면 없음) |
| Q4 | 라벨 재번호(§4-3) | **미편집 `자산 N`만 재번호** |
| Q5 | `result` 비우기 방식 | **`Step1`이 `onInvalidateResult`로 호출**(교환에만 한정). 대안: `updateFormAndInvalidate`가 «assetId 시퀀스가 바뀌는 `assets` 패치»를 일반적으로 감지해 비움 — 기존 삭제 경로의 stale 사이드바도 고치지만 범위가 넓어진다(별건 후보로 남김) |
| Q6 | 축 B 오탐(§4-5)이 Phase 0에서 재현되면 ⑧ 자체를 이 PR에서 고칠지 | **재현 시 ⑧ 가드도 같은 PR**(`splitMode`/`isFullFractionalBundle`일 때 역방향 판정 제외). 재현 안 되면 아무것도 안 한다 |
| Q7 | PR 쪼개기 | **1 PR**(헬퍼·UI·스토어 액션·테스트). 변경 면적이 작고 서로 의존한다 |

---

## 7. 작업 순서 (Do) — verify · 실측 결과 (2026-10-14)

### 7-0. Phase 0 (실측, 코드 수정 없음) — 결과

| # | 실측 | 결과 |
|---|---|---|
| ① | 축 B(지분 분할) 묶음 — 첫 자산 토지(`landNature="appurtenant"`, 지분 1/2) + 형제 `makeDefaultAsset(2)`(지분 1/2) | **재현**: 형제 raw `assetKind="housing"` · `reverseAppurtenantHouseAssetId` = 형제 id · ⑧이 자산 1(`landNature`)에 «주택을 첫 자산으로…» 차단 1건. 화면에서 따를 방법이 없는 막다른 길(§4-5가 맞았다). 지분율 미입력(빈칸) 진입 직후도 같은 오탐 → Q6에 따라 ⑧ 가드를 같은 PR에서 수정 |
| ② | 같은 사실의 «주택 먼저» vs «토지 먼저(API 본문)» | 기본(비조정·거주 120): 주택 먼저 총세액 0(주택·토지 모두 비과세) · 토지 먼저 18,628,498(첫 자산 토지 과세) — 화면은 ⑧이 막는다. 조정 2018·거주 0: 양쪽 173,646,000. ⚠️ 계획서 §0의 «토지 먼저 0»은 **④ 본문이 짝 주택 정착면적을 안 실어 route가 역방향 단위를 못 만드는** 화면 경로에서는 나오지 않는다(숨은 기본값 조정대상지역 false · 거주 0 사실로는 22,478,500) — 막는 이유(보유 상황 입력이 안 열려 사실이 어긋남)는 그대로다 |
| ③ | T1·T2 누락(단순 배열 교환) 시 오작동 | **T2**: 토지 미등기(폼 전역 true) 시료 — 단순 교환 후 본문 최상위 `isUnregistered:true`(주택에 붙음) · 컴패니언 토지 false, 정본(주택 먼저 + 토지 자산 미등기)은 최상위 false · 토지 true. 총세액 329,576,500 ≠ 96,250,000. **T1**: `isPrimaryForHouseholdFlags`는 `lib/calc` 어디서도 읽지 않는다(grep) — ④ 본문에는 영향이 없고 **화면 전용**(카드 «주 자산» 배지 · 토지 세율 수동 지정 토글, `CompanionAssetCard.tsx:132`→`AssetSectionAcquisition.tsx:196`) |

추가 실측(가드 근거 §4-4): 첫 자산 토지의 `nblUseDetailedJudgment`·`parcelMode`·`isSalesCaseAcquisition`·`familyBusinessInheritance` 4종 모두 토지가 컴패니언일 때 ⑧이 새 오류로 막는다(정밀판정 «지목을 선택하세요» · 다필지 «함께양도 자산은 다필지 입력을 지원하지 않습니다» · 매매사례가액 «첫 번째 자산에서만» · 가업상속 «상속개시일 평가액»). → anchor `가드 근거 실측`으로 고정.

### 7-1~7-6

1. ✅ 순수 헬퍼 `lib/calc/reverse-appurtenant-swap.ts`(회전·T1·T2·라벨·가드·사유·처음 반영 입력) + ⑧ 축 B 오탐 보정(`reverse-appurtenant-house.ts` — 지분 분할 묶음이면 짝 주택 없음) → anchor 33건(회전 3 · T1 · T2 3 · 라벨 · 불변성 · 가드 전 분기 · parity 4 시료).
2. ✅ 스토어 `clearResult` + `Step1` 배선(`swapEpoch`·`onInvalidateResult`·`embeddedInMulti`) + `ReverseAppurtenantSwapNotice` + `CompanionAssetsSection.remountEpoch` → RTL 20건 + Calculator 배선 3건.
3. ✅ parity anchor — `swap(form(L…,H)) ≡ form(H,L…)`: 자산 단위 깊은 동치 · ⑧ 이슈 목록 동치(역방향 차단 0) · ④ 본문 동치 · route 총세액·properties 동치. 시료: 토지 1+주택 1 · **토지 2+주택 1** · **과세·안분 모드 비정수(총액 1,000,000,007 — 519,230,774 / 288,461,539 / 192,307,694, 단순 교환 순서면 달라짐을 대조 단언)** · 미등기(폼 전역→토지 자산). 공용 시료 `__tests__/calc/_helpers/g1-reverse-appurtenant-fixtures.ts`로 승격(기존 wizard anchor 단언·`BLOCK` 불변 통과).
4. ✅ 뮤테이션 probe — v0.2 21종(20 killed · M10 survived) → **v0.3 36종 전건 killed**(M10은 리프가 채워진 지분을 더는 제외하지 않아 `splitMode` 숨김이 유일한 막이 되었고 RTL로 고정 · 라벨 앵커·진입 술어 length·안내 수명은 보강 후 killed).
5. ✅ E2E `e2e/transfer-reverse-appurtenant-swap.spec.ts` 2건(과세 시료로 토지 먼저→카드·버튼→보유 상황 입력 열림→계산 본문·총세액이 주택 먼저와 동일, 다필지 가드 사유) + 인접 E2E 722건 통과. 스크린샷 `e2e/_artifacts/g1-swap-{before,after,step4}.png`(비추적).
6. 독립 리뷰·머지는 메인 세션.

### 7-7. 독립 리뷰 반영 (v0.3)

| # | 지적 | 조치·실측 |
|---|---|---|
| M1 | 축 B 보정이 «함께 양도 + 전 자산 지분 < 1»에서 ⑧을 풀고 버튼을 숨겼다(퇴행) | 재현: 토지 1/2 + 주택 1/2 — 보정(v0.2) 상태에서 리프 `-`·⑧ 0건·버튼 없음·총세액 279,477,000(주택 먼저 0). **조치 후**: 리프 `h1`·⑧ 차단 1건·버튼 있음(옛 동작 복원). 보정은 «전 자산 지분율 빈칸»(`isFractionalSplitEntryBundle`)만. 술어 3종을 한 파일에 정리 + 갈림 표 anchor. (b) 진입 직후 전부 빈칸: ⑧ 오탐 없음·버튼 없음. (c) 지분 분할 모드에서 형제 지분을 100%로 고치면 리프는 역방향으로 읽지만(실측) `Step1` `splitMode` 숨김이 막는다 — RTL 고정(M10이 killed) |
| M2 | 첫 자산 토지 `pre1990Enabled` 가드 없음 | 가드 5종째(`hasPre1990LandEstimation && !isSec163_9Cause`). 실측(토지 먼저→주택 먼저 위치): 환산+기준시가 없음 — ⑧ 0건·API 400(`companionAssets.0.standardPriceAtAcquisition`) · 확정 취득가+`pre1990Enabled` — 총세액 212,032,107 → 165,946,000(토지 취득가 3,473,662 → 150,000,000) · §163⑨ 취득원인은 컴패니언도 싣는다(가드 제외) |
| S2 | 라벨 앵커 뮤테이션 survived · M10 등가 판정 | 부분 일치 라벨 6종 anchor(killed) · M10은 M1(c)로 등가가 아님을 확인, RTL로 killed |
| S3 | 증환지 가드에 사유 없음 | 사유 한 줄(증가분 기준시가가 당초분에서 정해진다) + anchor·RTL |
| S4 | 안내 수명·목록 | 매 렌더 파생(재편집하면 거두고 승격 주택이 아니면 안 붙는다) · 목록 6종 확장·라벨·테스트 고정 |
| S5 | 조문 인용 위치 · 지분 <1 안내 | 인용을 «열립니다» 문장으로 이동 · 지분·부담부증여 안내 문구는 **구현하지 않고 편차로 기록**(§5-1 표 근거 — 계산 결과 경고가 이미 알리고 구성원 확정이 route 뒤라 화면이 단정할 수 없다. 실측 anchor로 고정) |

**알려진 한계(이 PR 이전부터)**: 지분 분할(축 B) 모드에서 지분율을 채운 뒤 첫 자산 토지를 «부수토지»로 고르면 ⑧이 «주택을 첫 자산으로»라 차단하는데 그 모드에서는 카드·버튼이 숨어 따를 방법이 없다(막다른 길). 데이터만으로는 함께 양도 모드의 «전 자산 부분 소유»와 구분되지 않아 ⑧·리프는 건드리지 않았다(M1). 해소하려면 ⑧이 `splitMode`를 알아야 한다(별건 후보).

**구현 중 확정한 사실(계획서 정정)**:
- 임베드 판별은 `TransferTaxCalculator`의 `pathname.includes("/multi")`(`isEmbeddedInMulti`) → `Step1`에 `embeddedInMulti` prop으로 내린다(Step1 자체는 경로를 모른다).
- 법령 표기는 `TRANSFER.ONE_HOUSE_EXEMPT`(«소득세법 §89 ①») 재사용 — «§89①3호» 단독 상수는 없다(`HIGH_VALUE_HOUSE`는 3호 단서).
- 토지가 첫 자산인 동안 보유 상황 단계를 방문하면 기존 리셋 효과(`Step4.tsx:263-274`)가 `wasRegulatedAtAcquisition`(·Touched)을 false로 되돌린다 — 교환은 이를 복원하지 않고, 교환 후 열린 입력에 사용자가 다시 입력한다(E2E가 그 흐름을 따른다).

**완료 점검**: ⑫⑬⑭·④ 해당 없음 — `git diff 548a85fc6 --name-only`에 `app/api`·`lib/api`·`transfer-tax-api*`·Zod 스키마·route 파일 없음(grep 확인) · 800줄 정책 — `Step1.tsx` 394 · `calc-wizard-store.ts` 551 · `TransferTaxCalculator.tsx` 674 · 신규 파일 103·72줄.

---

## 8. 범위 밖 (알려진 한계 — 이 PR이 안 고친다)
- 일반 «순서 이동» UI(임의 자산 위/아래 이동) — 이 구성 하나만 연다.
- 첫 자산 삭제 → 컴패니언 승격 시 `isPrimaryForHouseholdFlags`가 안 고쳐지는 기존 갭(§3 T1과 같은 뿌리). 별건 후보.
- 삭제·추가로 자산 순서가 바뀔 때 사이드바 `result` 매칭이 stale해지는 기존 갭(Q5 대안).
- 컴패니언에서 `isSelfBuilt`·`familyBusinessInheritance`를 입력하면 ④가 안 보내 침묵 소실되는 기존 갭(UI는 열려 있고 전송 코드가 없다).
- 주택부수토지 외 «역방향» 구성(주택 2건 이상·겸용주택·재개발 완공주택)은 짝 주택을 정할 수 없어 현행 안내를 유지.

## 부록. 변경 이력

| 버전 | 날짜 | 내용 |
|---|---|---|
| v0.1 | 2026-10-14 | 최초 작성 — 사용자가 G1 화면을 «버튼 클릭» 방식으로 결정. 필드 역할·입구·⑧ 표시 방식·경계 조사 반영(읽기 전용 조사 117회 도구 호출), 결정 Q1~Q7 |
| v0.2 | 2026-10-14 | 구현 완료 — 결정 Q1~Q7 권고안 승인. Phase 0 실측표(축 B 오탐 재현 → ⑧ 가드 같은 PR) · §7 단계별 결과 · 계획서 정정 3건(토지 먼저 «0»은 화면 경로가 아님 · T1은 화면 전용 · 법령 상수) · 뮤테이션 21종(20 killed) |
| v0.3 | 2026-10-14 | 독립 리뷰 반영 — M1(축 B 보정 «전부 빈칸»으로 축소·술어 정리) · M2(pre1990 가드 5종째) · S2~S5(라벨·M10·증환지 사유·안내 파생·목록 6종·조문 인용·지분 안내 편차). 뮤테이션 36종 전건 killed |
