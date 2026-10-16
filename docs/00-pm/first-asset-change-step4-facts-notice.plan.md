# 첫 자산이 바뀔 때 보유 상황(Step4) 사실이 새 첫 자산의 사실로 읽히는 문제 — 안내 표시 수정 계획서

> 상태: **v0.2 (2026-10-16) 결정 확정 · Do 완료(§9)** — 사용자 결정 Q-5 = **(a) 안내 표시**(값은 그대로 두고 알리기), Q-5a~d = **권고대로**(Step4 카드 한 곳 · 확인 버튼 + 값 비우면 자동 사라짐 · 첫 자산 삭제만 · 복원 시 마커도 복원). 미커밋.
> 선행: PR #2223 (`40829042b`, 첫 자산 삭제 시 주 자산 배지·미등기·사이드바 정합) · 계획서 `docs/00-pm/first-asset-removal-primary-reindex.plan.md` §6 V-1 → §7-R V-1 → **이 문서**.
> 검증 방식: throwaway probe(워크트리 `-fpf`, 커밋 안 함)로 폼→④ 본문을 실측했다. 인용 file:line은 이 워크트리(base `40829042b`) 기준.

---

## 0. 한 줄 요약

첫 자산을 지우면 **폼 전역에 저장된 «양도하는 주택에 대한 선언»**(§154① 단서·합가·조정대상지역 등)이 그대로 새 첫 자산에 붙어 ④ 본문으로 나간다 — 실측한 12개 묶음 중 11개가 새는 것이 확인됐다(나머지 하나는 거주기간 — 새지 않는다). 수정은 **값을 건드리지 않고** 보유 상황 단계 맨 위에 «첫 자산이 바뀌었으니 아래 값을 확인하세요» 카드를 띄우는 것이다.
**⚠️ 지난 보고의 «거주기간»은 정정한다 — 거주기간은 자산 객체에 들어 있어 자산과 함께 사라지고 새지 않는다**(§2).

---

## 1. 실측 (probe P-a ~ P-f)

시료: 주택 두 건 `[A, B]`(`HOUSE()` 변형, 소재지 코드 없음) → `assetRemovalPatch(form, 0)`(#2223의 삭제 leaf)로 A 삭제 → `captureBody`로 ④ 본문을 가로채 **«처음부터 B만 넣은 폼»의 본문과 필드 단위 diff**. 같은 값이면 diff가 비어야 한다(그게 #2223의 정본 규약이다).

### P-a. 폼 전역 키 전수 스캔 (132키 × 후보값 6종 × 본문 diff)
`createDefaultTransferFormData()`의 폼 전역 137키 중 배열 5종을 뺀 132키를 하나씩 바꿔, 단일 주택 폼에서 ④ 본문이 바뀌는 키를 찾았다(기본 / 특례 토글 6종을 켠 상태 2회).
**본문을 바꾸는 키 25개** — 이 중 **양도하는 주택에 대한 선언**은 `culturalHeritageHouseSpecial` · `generalHouseGiftedFromDecedentWithin2yr` · `inheritedRightChoiceWhenBothHeld` · `isFirstTransferredInMerge` · `isRegulatedArea` · `wasRegulatedAtAcquisition` · `marriageDate` · `newHouseAcquisitionDate` · `parentalCareMergeDate` · `provisoReason` · `ruralHouse*` 4개 · `unavoidableOutsideCapital*` 3개이고, 나머지는 세대·개인·거래 값(`isOneHousehold` · `householdHousingCount` · `annualBasicDeductionUsed` · `transferDate` · `contractTotalPrice` · `totalTransferExpense`)과 정정신고(`amendmentMode`), 미등기(`isUnregistered`, #2223에서 처리)다.
**나머지 107키는 «본문이 안 바뀐 것»이 아니라 «게이트에 막혀 이 시료로는 판정 못 한 것»**이다(예: 대체주택은 주택 수 2 이상이어야 본문에 실린다) → P-b에서 유효한 값으로 다시 쟀다.
컴패니언 쪽 본문(`companionAssets[]`)은 폼 전역 키 중 `isOneHousehold` 하나에만 반응한다 → **폼 전역 사실은 전부 첫 자산(주 자산)에만 붙는다**.

### P-b. 묶음별 «삭제 후 본문 − 처음부터 B만 넣은 본문» (유효 값으로 채움)

| 묶음 | 채운 폼 키 | 새는 본문 키 | 새는가 |
|---|---|---|---|
| 조정대상지역 | `isRegulatedArea` · `wasRegulatedAtAcquisition` | 같은 이름 | **예** — 단, 새 첫 자산에 소재지 코드가 있으면 **아니오**(P-d) |
| §154① 단서 | `provisoReason` + 수용일 / 해외이주(출국일·출국일 현재 1주택) | `oneHouseExemptionProviso.*` | **예** |
| 최종 1주택 재기산 | `finalHouseRestartHistory`(양도일 2021-12-01) | `finalOneHouseRestart.hadOtherHouseDisposal` · `.disposals` | **예** |
| 합가·혼인·동거봉양 | `marriageDate` · `parentalCareMergeDate`+연령 · `isFirstTransferredInMerge` · `mergedHouseholdFirstHouseKind` | `marriageMerge.*` · `parentalCareMerge.*` · `isFirstTransferredInMerge` · `mergedHouseholdFirstHouse.kind` | **예** |
| 상속 일반주택 | `generalHouseGiftedFromDecedentWithin2yr`+증여일 · `inheritedRightChoiceWhenBothHeld` | 같은 이름 | **예** |
| 입주권 3년 초과 예외 | `rightThreeYearExceptionKind` 외 3 | `rightThreeYearException.*` | **예** |
| 일시적 2주택 | `temporaryTwoHouseSpecial` · `newHouseAcquisitionDate` (+`disposalDelay*`) | `temporaryTwoHouse.*` | **예** — 아래 «합성 사실» 참조 |
| 대체주택 | `replacementHouseSpecial` 외 4 (주택 수 2) | `replacementHouse.*` | **예** |
| 농어촌주택 | `ruralHouseSpecial` 외 | `ruralHouse.*` | **예** |
| 수도권 밖 부득이 | `unavoidableOutsideCapitalSpecial` 외 | `unavoidableOutsideCapitalHouse.*` | **예** |
| 문화유산주택 | `culturalHeritageHouseSpecial` | `culturalHeritageHouse` | **예** |
| **거주기간** | `residencePeriodMonths`(폼 전역 «120») | `residencePeriodMonths` | **아니오** (§2) |

**합성 사실(P-b 일시적 2주택)**: 삭제 후 본문은 `temporaryTwoHouse.newAcquisitionDate = "2025-05-01"`(**A 기준으로 선언한 신규 주택 취득일**)에 `previousAcquisitionDate = "2016-05-02"`(**B의 취득일** — ④가 새 첫 자산에서 도출)를 짝지어 보낸다. 어느 쪽 사실도 서로의 짝이 아니다.

### P-c. 세액이 실제로 바뀌는가
시료: B 취득 2019-05-02 · 양도 2026-02-16 · 양도가액 8억 · 취득가액 4억, 거주 0개월, 폼 전역 `wasRegulatedAtAcquisition = true`(A의 선언), mock 세율표.
| | 총세액 | 비과세 |
|---|---|---|
| 처음부터 `[B]` | **0** | 1세대1주택 비과세 |
| `[A, B]`에서 A 삭제(`wasRegulatedAtAcquisition=true` 잔존) | **125,246,000** | 비과세 아님(`isExempt: false`) |
| 위 폼에서 `wasRegulatedAtAcquisition`만 `false`로 (대조군) | **0** | 비과세 |

두 본문의 차이는 **`wasRegulatedAtAcquisition` 키 하나뿐**이고(본문 diff 키 목록 실측), 그 키를 끄면 결과가 같아진다 → 세액 차이의 원인은 이 잔존 선언이다. «A를 기준으로 입력한 선언»이 B에 적용돼 결과가 갈린 것이다. 어느 쪽이 맞는지는 B의 사실(취득 당시 조정대상지역 여부)에 달려 있고 화면은 그걸 묻지 않는다. (엔진이 비과세를 배제한 사유 문구는 이 시료에서 읽지 않았다 — «확인 필요».)

### P-d. 조정대상지역은 새 첫 자산에 소재지 코드가 있으면 새지 않는다
`withRegionCode: { regionCode: "1168010100" }` → diff **빈 값**. 근거 코드: `transfer-tax-api.ts:483`(취득 당시은 `calcEffectiveWasRegulatedAtAcquisition`), `:491`(`primary.regionCode || form.regionCode`), `effective-regulated-at-acquisition.ts:139-152`·`:203-213`(코드가 있으면 저장 토글을 읽지 않는다). → 안내 대상에서 이 경우를 뺀다.

### P-e. 컴패니언 → 첫 자산 승격 방향
컴패니언일 때 ④가 보내지 않다가 첫 자산이 되면 처음 보내는 자산 입력(자산별 거주기간·신축 등)은 #2223 이후 삭제 직후 처음 반영된다(`reverse-appurtenant-swap.ts:115-128`, 이전 계획서 §8). 이 문서의 대상은 **폼 전역** 쪽이다.

### P-f. 거주기간 폴백 경계
새 첫 자산의 자산별 거주기간 칸이 `"0"`이면 폼 전역 120과 무관하게 본문 0(P-b), **`""`(빈 문자열)이면 본문 120**으로 폼 전역 값이 샌다(`deriveResidencePeriodMonths` `calc-wizard-asset-residence.ts:119-132` — `asset || formFallback`). 기본 자산은 `"0"`이라(`residenceDefaults()` `calc-wizard-asset-residence.ts:28~`) 사용자가 칸을 지워 direct 모드로 둔 경우에만 해당 — **화면에 폼 전역 값을 보여주는 칸이 없다**(`Step4.tsx`에는 `residencePeriodMonthsAsset`뿐). 안내 카드로 못 푸는 별건(§8).

---

## 2. 정정 — 이전 보고·계획서의 «거주기간»

이전 계획서 §7-R V-1과 지난 보고는 «거주기간 `residencePeriodMonths`»를 폼 전역에서 읽는 첫 자산 사실로 적었다(코드읽기, 미실측). **틀렸다.**
보유 상황 단계의 거주기간 입력은 `primary` 자산 객체에 쓴다(`Step4.tsx:535` `residencePeriodMonthsAsset={primary.…}`). 첫 자산을 지우면 값도 자산과 함께 사라지고, 새 첫 자산은 **자기 자산의 칸**을 읽는다(P-b 거주기간 행, P-f).
→ 이전 계획서 V-1 행에 정정 주석을 같은 PR에 넣는다(§7 Do-5).

---

## 3. 무엇을 «첫 자산의 사실»로 볼 것인가

기준: **양도하는 주택 한 채에 대한 선언**이며 ④가 주 자산(첫 자산)에만 싣는 것. 세대·개인 값은 첫 자산이 바뀌어도 의미가 안 바뀌므로 대상이 아니다.

| 구분 | 키 | 안내 |
|---|---|---|
| **대상 — 계산기가 입력칸을 소유** | 조정대상지역(②), §154① 단서(②), 최종 1주택 재기산(②), 합가(③ `MergeDateSection`), 상속 일반주택 증여·입주권 선택(`HouseCountExemptionInputs` 경유) | 카드에 묶음 이름 + «위 입력칸을 확인» |
| **대상 — 계산기엔 입력칸이 없음** | 일시적 2주택·처분지연·공공기관 이전, 대체주택, 농어촌, 문화유산, 입주권 3년 예외, 합가 먼저 양도·합가 입주권, 수도권 밖 부득이(레거시 폴백) | 판정 메뉴에서 불러왔거나 옛 기록에 남은 값(`TemporaryTwoHouseSection.tsx:402-443` `mode="calc"`는 합가만 그린다, `:51-55` 소유 표). 카드에 이름만 올리고 **«입력칸은 없으며 판정 메뉴 값입니다»** 병기 |
| 제외 — 세대·개인·거래 | `isOneHousehold` · `householdHousingCount` · 보유 주택 명부 · 분양권·입주권 명부 · `annualBasicDeductionUsed` · 양도일·비용·가산세·정정신고 | 첫 자산과 무관 |
| 제외 — 이미 처리 | `isUnregistered`(#2223) · 거주기간(§2) | |

각 묶음은 **④가 같은 값을 본문에 싣는 조건과 같은 술어**로 «해당 중»을 판정한다(3중 패턴 — ⑤·④·⑧이 같은 leaf): 조정대상지역 = 새 첫 자산에 소재지 코드 없음 · §154① 단서 = `provisoGate` · 재기산 = `calcFinalHouseRestartInScope`(`final-house-restart.ts:62`) · 대체주택 = `calcReplacementHouseApplies`(`replacement-house-scope.ts:36`) · 일시적 2주택 = `temporaryTwoHouseApplies`. 정확한 목록은 Do-0에서 `transfer-tax-api.ts`의 각 `...build*Payload` 게이트를 하나씩 대조해 확정한다(미확정 = «확인 필요»).

---

## 4. 설계

### 4-1. 트리거
**첫 자산 삭제(`idx === 0`)만.** `Step1.tsx:174` `handleRemoveAsset` — #2223이 이미 이 분기에서 `setSwapEpoch`를 올린다.
- **교환(G1 버튼)은 제외**: 첫 자산이 토지일 때 보유 상황의 ② 판정 섹션은 렌더되지 않아(`Step4.tsx:443` `isOneHouseExemptionAsset(primaryKind)`) 사용자가 주택 사실을 넣을 길이 없고, `[primaryKind]` effect가 조정대상지역을 지운다(`:267-291`). 코드읽기 — 미실측.
- **첫 자산 «자리 교체»(주소·종류 수정)는 제외**: 오타 수정과 다른 물건으로 교체를 구분할 근거가 없다(assetId가 같다). Q-5c.
- 판정 불러오기·이력 불러오기는 폼을 통째로 치환하므로 별개다.

### 4-2. 저장 마커 (UI 메타, 엔진 무관)
`TransferFormData`에 선택 필드 하나:
```ts
firstAssetChangeNote?: { newFirstAssetId: string; groups: FirstAssetFactGroupId[] }
```
- 삭제 시점에 `assetRemovalPatch` 결과 폼으로 **지금 해당 중인 묶음**(§3 술어)을 계산해 `groups`에 스냅샷한다. **비어 있으면 마커를 쓰지 않는다**(화면에 낼 것이 없다).
- 선례: 선택 필드 `importedOneHouseFacts?`·`sourceJudgmentId?`(`calc-wizard-form.types.ts:477~`) — 초기값 없음, ④는 보내지 않는다(명시 매핑이라 자동 제외). 읽기 가드 leaf를 둔다(`readFinalHouseDisposals` `final-house-restart.ts:86` 같은 구 기록 가드).
- 카드는 **스냅샷 ∩ 지금도 값이 있는 묶음**만 그린다 → 사용자가 칸을 비우면 그 줄이 사라지고, 삭제 뒤 새로 채운 묶음은 안 뜬다. effect→store 미러링 없음(파생).

### 4-3. 카드 (Step4 최상단)
- 위치: `ImportedOneHouseFactsCard`(`Step4.tsx:316`) **바로 위** — 같은 «왜 이 값이 채워져 있나» 역할이다. 그 카드는 `specials`·대체주택·일시적 2주택을 props로 받아 판정 메뉴 값을 요약한다(`Step4.tsx:316-324`; 노출 조건은 Do-0에서 확인).
- 컴포넌트: 신규 `app/calc/transfer-tax/steps/step4-sections/FirstAssetChangeNoticeCard.tsx` (`ToneCard` amber, 인라인 톤 금지). Step4는 746줄이라 본체에는 import 1 + JSX 1(≈+4줄)만 넣는다. 750 선을 넘기면 구현 때 같은 PR에서 분리를 판단한다(파일 크기 정책 «기회주의적 분리»).
- 문구(납세자 유불리·절감 표현 없음). ⚠️ **삭제한 자산의 라벨은 쓰지 않는다** — 삭제 뒤 기본 라벨이 재번호돼(#2223 Q-2) «‘자산 1’을 삭제해 ‘자산 1’이 첫 자산이 됐습니다»로 읽혔다(브라우저 확인에서 발견, §9). 새 첫 자산을 라벨·주소로 가리킨다:
  > **첫 자산이 바뀌었습니다 — 보유 상황 입력을 확인하세요**
  > 첫 자산을 삭제해 지금은 ‘{새 첫 자산 라벨 · 주소}’이(가) 양도하는 첫 자산입니다. 아래 항목은 삭제하기 전 첫 자산 기준으로 입력됐을 수 있으며, **지금은 새 첫 자산의 사실로 계산에 반영됩니다.**
  > • 조정대상지역(취득 당시·양도 당시) … ② 에서 확인
  > • §154① 단서 사유 … ② 에서 확인
  > • 합가 특례 … ③ 에서 확인
  > • 일시적 2주택 선언(판정 메뉴 값 — 이 화면에 입력칸 없음)
  > 해당하지 않으면 값을 고치거나 지워 주세요.  [확인했습니다]
- `[확인했습니다]` → `onChange({ firstAssetChangeNote: undefined })`. 마커의 `newFirstAssetId`가 지금 첫 자산과 다르면(다른 변경이 있었음) 카드를 숨긴다.
- testid: `first-asset-change-notice`(카드) · `first-asset-change-notice-ack`(버튼). 같은 화면에 유일(단건·다건 임베드 모두).

### 4-4. 14개 동기화 지점
UI 메타 필드라 대부분 해당 없음 — 그래도 **비전송을 가드로 고정**한다.
| 지점 | 처리 |
|---|---|
| ①폼 타입 | 선택 필드 추가 |
| ②initial | 없음(선택 필드 선례) |
| ③normalize / 이력 복원 | 읽기 가드 leaf; 복원 시 카드가 다시 뜨는 것은 허용(Q-5d) |
| ④⑬ API 변환 | **보내지 않음** — `callTransferTaxAPI`·`multi-transfer-tax-api` 본문에 키 없음을 anchor로 |
| ⑤위젯 | 카드 신설 + Step1 삭제 핸들러가 마커 기록 |
| ⑥⑦⑧ | 없음(차단 안 함 — 사용자 결정 (a)) |
| ⑨⑩⑫⑭ | 해당 없음 (`lib/calc/*.ts`·`app/calc/transfer-tax/*.tsx`에서 `...form` 통째 spread 검색 결과 API 본문으로 가는 곳은 `cross-104-5-recalc.ts:124`뿐이고 그 뒤 `callMultiTransferTaxAPI`가 명시 매핑하는 것으로 읽힌다(확인 필요). **검색 범위가 이 두 곳뿐**이라 Do-0에서 본문 diff로 재확인) |

---

## 5. 결정 필요 (권고 = 기본값)

| Q | 질문 | 권고 | 대안 |
|---|---|---|---|
| Q-5a | 표시 위치 | **Step4 상단 카드 한 곳** | + Step1 삭제 직후 한 줄(교환의 `ReverseAppurtenantSwapAfterNote` 방식, 로컬 상태). 삭제한 사람이 Step4를 안 거치고 결과로 건너뛰는 경우를 줄이나 카드가 두 곳이 된다 |
| Q-5b | 해제 방식 | **`[확인했습니다]` 버튼 + 값을 비운 묶음은 자동으로 사라짐** | 칸을 고치면 자동 해제 — 어떤 칸이 «확인»인지 모호 |
| Q-5c | 트리거 범위 | **첫 자산 삭제만** | + 첫 자산 자리 교체 감지(근거 기준을 사용자가 정해야 함: 종류 변경만? 취득일 변경까지?) |
| Q-5d | 이력·자동저장 복원 시 | **마커도 복원 → 카드 재표시 허용**(해제 전이면 여전히 확인 대상) | 복원 시 마커 폐기 |

---

## 6. 미검증 (Do-0에서 확인)

| V | 내용 | 확인 방법 |
|---|---|---|
| V-1 | §3 «계산기 입력칸 소유» 묶음 각각의 **④ 게이트와 Step4 노출 술어가 같은가**(특히 상속 일반주택, 합가 `isFirstTransferredInMerge`는 판정 메뉴 `Step3`에서만 입력 `one-house-exemption/steps/Step3.tsx:500`) | 묶음별로 `transfer-tax-api.ts`의 build 게이트 ↔ Step4 렌더 술어 대조표 |
| V-2 | 다건 임베드(`embeddedInMulti`)에서 첫 자산 삭제 → 같은 카드가 뜨고 다건 본문엔 안 실리는가 | `multi-transfer-tax-api` 본문 diff + RTL |
| V-3 | `[primaryKind]` effect(`Step4.tsx:267`)가 새 첫 자산이 다른 종류일 때 어디까지 지우는가 — 지워진 묶음은 카드에서 빠져야 한다 | 종류가 바뀌는 삭제(주택→토지) 스냅샷 |
| V-4 | 삭제 핸들러가 `updateAssets`의 `splitMode` 분기 3종 모두에서 `extra`로 마커를 전달하는가 | 분기별 단위 테스트 |
| V-5 | 키 분류 가드: 폼 전역 키 전수(현재 137)가 «묶음 / 제외 목록» 중 정확히 한 곳에 있는가 — 새 키가 생기면 분류를 강제 | `satisfies` 기반 가드(`feedback_satisfies_preserves_keys_annotation_kills_guard`) |
| V-6 | 브라우저: 자산 3건 계산 → 첫 자산 삭제 → Step4 카드 → 확인 → 재계산 | Playwright (`e2e/transfer-first-asset-removal.spec.ts` 확장) |

---

## 7. 작업 순서 (Do)

1. **Do-0 실측** — V-1~V-5. 묶음 목록·술어를 대조표로 확정(사용자 확인이 필요한 항목은 따로 모아 묻는다). → verify: 표 기록
2. **anchor 먼저(RED)** — ① 묶음 leaf: 묶음마다 «값 있음 → 이름 반환», 소재지 코드 있으면 조정대상지역 제외, 기본 폼 `[]` ② 삭제 패치: `idx===0 ∧ 묶음 있음`만 마커 기록, 가운데 삭제·묶음 없음은 미기록 ③ 카드 RTL: 스냅샷 ∩ 현재 값 · 버튼 해제 · `newFirstAssetId` 불일치 시 숨김 ④ 비전송: 마커가 있어도 ④ 본문 바이트 동일 → verify: 수정 전 실패
3. **구현** — 타입 · 읽기 가드 leaf · 묶음 leaf(`lib/calc/first-asset-facts.ts` 신규) · `assetRemovalPatch` 확장 또는 핸들러에서 호출 · 카드 · Step4 마운트
4. **뮤테이션(파일 백업 복원 하네스)** — ① 마커 미기록 ② `idx === 0` → `idx === 1` ③ 묶음 술어 항상 true ④ 소재지 코드 제외 삭제 ⑤ 버튼 no-op ⑥ Step4 마운트 제거 ⑦ 스냅샷 교집합 제거(현재 값 안 봄) → 전부 KILLED
5. **회귀** — 전체 vitest · tsc · eslint · 관련 E2E(첫 자산 삭제, 교환, 다건 자산 편집) · 브라우저 확인(V-6). **정정 주석**: 이전 계획서 V-1·§7-R V-1 행의 «거주기간»을 이 문서 §2로 연결
6. 세액 회귀 기준: 삭제 없는 경로의 ④ 본문은 **바이트 동일**(이 변경은 값을 안 건드린다)

---

## 8. 범위 밖 · 알려진 한계

- **값은 그대로 둔다** — 안내만 한다(사용자 결정 a). 안내를 보지 않고 결과로 넘어가면 §1 P-c 같은 결과가 그대로 나온다. 차단·비움은 (b)/(c) 안.
- 거주기간 폼 전역 폴백(P-f): 자산 칸이 빈 문자열인 옛·특수 입력에서만 샌다. 화면에 폼 전역 값이 안 보여 이 카드로 알릴 수 없다 — 별건으로 읽는 쪽 leaf(`deriveResidencePeriodMonths`)를 어떻게 할지 결정이 필요하다.
- 삭제한 자산을 **계속 보유**한다면 세대 주택 수·보유 주택 명부에 들어가야 하는지는 이 문서가 다루지 않는다(미검증 — 별건).
- 지분·묶음 양도에서 첫 자산이 바뀌는 다른 경로(판정 불러오기, 이력 불러오기)는 폼 전체 치환이라 대상 아님.

---

## 9. Do 결과 (2026-10-16)

**구현**: `lib/calc/first-asset-facts.ts`(신규 — 묶음 6종 `regulated`·`proviso`·`finalRestart`·`merge`·`inheritGeneral`·`declared` · `firstAssetFactGroups` · `firstAssetChangeNoteOnRemoval` · `readFirstAssetChangeNote` · `visibleFirstAssetChangeGroups`) · `FirstAssetChangeNoticeCard.tsx`(신규) · `Step1.tsx` `handleRemoveAsset`(첫 자산이면 마커 기록, 선언 없으면 이전 마커도 지움) · `Step4.tsx`(import 1 + JSX 1 → 749줄) · `calc-wizard-form.types.ts`(선택 필드·타입).
④ 변환·Zod·route는 손대지 않았다 — 마커는 ④ 본문에 실리지 않음을 anchor로 고정(T-1).

**§3 묶음 확정(Do-0)**: 입력칸을 소유하는 5묶음(조정대상지역·§154① 단서·최종 재기산·합가·상속 일반주택) + 입력칸 없는 1묶음(`declared`). 게이트는 leaf 안에서 ④와 맞췄다 — 조정대상지역 = 소재지 코드(자산→폼 전역 폴백) 없음 + §154① 판정 대상 · 재기산 = `calcFinalHouseRestartInScope` · 단서 = 호출부(Step4)가 `provisoGate` 결과를 `gates.proviso`로 전달(삭제 시점 스냅샷은 값만 본다 — 카드에서 다시 걸러진다) · 나머지 = 주택류 자산.
미해소(§6 V-1 일부): 상속 일반주택 묶음의 `generalHouseRightAtInheritance`는 키 분류만 했고 «선언» 판정에는 안 넣었다(본문 영향 미실측).

**anchor**: `__tests__/calc/first-asset-facts.anchor.test.ts` 46건 — 키 분류 가드(G-1~4: 폼 전역 137키가 «묶음/제외» 정확히 한 곳) · leaf(L-0~7) · 마커(N-1~4) · 카드 묶음(V-1~6) · 비전송(T-1) · **실측 연결(T-2: 묶음에 오른 선언 11종이 실제로 새 첫 자산의 ④ 본문을 바꾼다)** / `__tests__/components/first-asset-change-notice.anchor.test.tsx` 9건 — Step1 삭제→마커(W-1~4) · Step4 카드(C-1~5) / E2E `e2e/transfer-first-asset-removal.spec.ts` T2.

**뮤테이션 12종 전부 KILLED**(파일 백업 복원 하네스): 마커 기록 제거 · `idx===1` · 선언 판정 항상 참 · 소재지 코드 게이트 제거 · 스냅샷 교집합 제거 · 확인 버튼 무동작 · Step4 마운트 제거 · 새 첫 자산 id 검사 제거 · 묶음 없어도 마커 기록 · 묶음 키 누락 · 재기산 범위 게이트 제거 · 토지 첫 자산 게이트 제거.

**브라우저 확인(Playwright, 실제 Step1→보유 상황)**: 주택 3건·`wasRegulatedAtAcquisition`·`marriageDate` 시드 → 첫 자산 삭제 → 저장 폼에 마커 `{newFirstAssetId:"h2", groups:["regulated","merge"]}` → 보유 상황 최상단에 카드·두 줄 → `[확인했습니다]` → 카드 사라지고 값 두 개는 그대로. 스크린샷으로 **문구 결함 발견**(삭제한 자산 라벨이 재번호로 새 첫 자산과 같아짐) → 라벨 제거·주소 병기로 고치고 재확인.
**회귀**: 전체 vitest 3,042 passed / 4 failed — 4건은 전부 «Test timed out in 5000ms»(머신 load average 67~87)이고 **master에서도 같은 3건이 같은 사유로 실패**, `--testTimeout=120000`으로 4파일 28건 전부 통과 · tsc 0 · eslint 에러 0(변경 파일) · 관련 E2E(첫 자산 삭제 T1·T2, 교환, 다건 3스펙 — 다건 4건은 1차 실패 후 재시도 통과(flaky), 변경과 무관해 보이나 원인은 미조사).

## 부록. 변경 이력
- v0.1 (2026-10-16) 초안 — 실측 P-a~f, 거주기간 정정(§2), 설계 4-1~4-4, 결정 Q-5a~d, 미검증 V-1~V-6.
- v0.2 (2026-10-16) 결정 확정(권고대로) · Do 완료(§9) · 마커에서 `removedLabel` 제거(재번호로 문구 모호) · 상태 줄 갱신.
