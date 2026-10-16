# 겸용주택(주택+상가) × 부담부증여 — UI 설계

> 계획서: [`bg-redevelopment-presumed-and-mixed-use.plan.md`](../../00-pm/bg-redevelopment-presumed-and-mixed-use.plan.md) §2·§4 (차단 근거 · 「실제 구현」은 범위 밖으로 남겨 둔 항목)
> 엔진 설계: [`transfer-burdened-gift-mixed-use.engine.design.md`](./transfer-burdened-gift-mixed-use.engine.design.md) **R2**(546줄) — 전부 읽고 반영했다(§2·§3.3·§11). 엔진 문서는 수정하지 않았고, 충돌은 §16 「엔진 문서와 불일치」에 적었다.
> 근거 해석례: 국세청 부동산거래관리과-119(2010.01.22.) 원문(https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000138440 — Playwright 열람) — 「채무액에 상당하는 부분이 주택 또는 상가에 대한 부분으로 구분이 분명한 경우에는 그 채무액이 속하는 주택 또는 상가의 양도로 봄」.
> 선례: [`burdened-gift-redevelopment-assets.ui.design.md`](./burdened-gift-redevelopment-assets.ui.design.md) · [`gift-burdened-transfer-acquisition-cost.ui.design.md`](./gift-burdened-transfer-acquisition-cost.ui.design.md) · [`transfer-tax-mixed-use-house.ui.design.md`](./transfer-tax-mixed-use-house.ui.design.md)
> 작성 2026-10-16 · **개정 R2(같은 날)** — 엔진 R2(D-7 채무 귀속 축) 반영 · 상태 **설계(Design)** — Do 진입 전. **이 문서는 코드를 바꾸지 않았다.**
> 검증 방식: 모든 file:line은 이 워크트리(`bg-mixed-use`, HEAD `477d78786`)에서 실제로 열어 확인했다. 열지 못한 것·추정은 「확인 필요」로 표시한다.

---

## 0. 한 줄 요약

> **R2 개정 요지** — 엔진이 부동산거래관리과-119 원문을 확인해 **채무 귀속 축(D-7)** 을 신설했다. 그래서 초판의 「신규 `AssetForm` 필드 0」 전제가 **깨졌다**. 인수 채무를 **주택 귀속 / 상가 귀속 / 구분 불분명**으로 **필수·기본값 없이** 받아야 하고, 채무비율은 하나가 아니라 **주택분·상가분 둘**이다. 엔진 회신(§8·§9)으로 닫힌 결정(Q-2·Q-4·Q-5·Q-8)은 §10에서 닫았다.

겸용주택을 부담부증여로 **실제 계산**하게 하는 UI의 골자는 네 가지다.

1. **입력원을 하나로 만든다.** 겸용 4부분 기준시가·면적·취득일은 겸용 패널(`MixedUseExpandedPanel`)이 **정본**이고, 부담부증여 블록(`BurdenedGiftBlock`)은 그 값을 **읽기 전용 요약**으로만 보여 준다. 지금 화면은 같은 값(양도시 기준시가)을 세 곳, 취득시 기준시가를 두 곳에서 받는데 겸용 경로는 4부분만 읽는다(§1.3).
2. **채무 귀속 입력을 새로 둔다(신규 `AssetForm` 필드 8개).** 임대보증금·담보차입금 **각각**에 귀속 라디오(`주택 / 상가 / 구분 불분명 / 나누어 입력`)를 두고, 「나누어 입력」일 때만 금액 3칸을 연다. 총액 칸(`bgLendingDepositTotal`·`bgMortgageDebtAmount`)은 **정본으로 그대로** 두므로 기존 읽는 곳(④·사이드바·미리보기)은 무변경이다(§5.6).
3. **지원 범위를 좁게 연다(P1).** 단건 · 단독 소유 · 매매 취득. 평가유형은 기준시가 / 시가 모두, 취득가액 산정방식은 **K-4·K-5·K-6·K-7 모두**(엔진 회신). PHD / 보유 중 용도변경 / 별개 취득 파트 모델 / 공유지분 / 컴패니언 / 상속·증여·이월과세·신축 취득은 막는다.
4. **엔진과 같은 함수로 막는다.** ⑧은 엔진 `collectMixedBurdenedGiftIssues`(MB-1~14)를 호출하고, UI는 그 위에 **더 좁은** P1 제한만 얹는다 → 「UI 허용 ⊂ 엔진 허용」이 구조로 보장된다(§3.3).

| 결정 | 상태 | 내용 |
|---|---|---|
| 엔진 입력 모델 | **닫힘 — A** | 엔진 E-1·D-1′. 신규 필드는 귀속 입력 8개뿐 |
| 4부분 입력 위치 | 남음(Q-3) | ③ 유지 + ② 요약 권고 |
| 채무 귀속 위젯 | **신설** | ② 채무 카드 안 「채무 귀속」 카드(§5.6) |
| 증여세용 평가액 override | **닫힘 — 숨김** | 엔진 MB-12가 `giftBuildingStdPriceAtTransfer`를 거부 |
| K-6/K-7 | **닫힘 — P1 포함** | 엔진 §3.2 개산공제 base = 취득시 4부분 × `B_part'/C_part`. UI 추가 0 |
| 토지·건물 취득일 다름 | **닫힘 — 허용** | 엔진 지원(B0). 안내에 「확인 필요(V-15)」 병기 |
| 결과 shape | **닫힘** | `mode:"mixed-use"` 유지 + `breakdown.burdenedGift` echo, `acquisitionConversionRoute` 신규 값 없음 |
| 상속·증여 취득 | 남음(Q-6) | 정본 충돌은 엔진이 선제 해소(§10) — 단 P1 범위는 유지 권고 |

---

## 1. 현행 화면 실측 — 겸용 × 부담부증여에서 지금 무엇이 뜨는가

### 1.1 진입 경로

`TransferModeBlock`은 겸용 여부를 보지 않고 **자산 종류**(`housing`)만 본다 — `SUPPORTED_ASSET_KINDS`에 `"housing"`이 있다(`components/calc/transfer/TransferModeBlock.tsx:73-81`). 그래서 겸용 토글이 켜진 주택에서도 「부담부증여」를 고를 수 있고(`:183-190`) 곧바로 `BurdenedGiftBlock` 전체가 마운트된다(`:204-212`). 차단은 계산 시점에야 나온다 — ⑧ `lib/calc/transfer-tax-validate-bg.ts:116-118`(오류 field=`transferType`), ⑫ `lib/api/transfer-tax-schema-refines.ts:310-318`.

### 1.2 섹션별 입력 전수 (겸용 ON · `transferType = "burdened_gift"` · 취득원인 = 매매 · 기준시가 모드)

| 섹션 | 블록 | 상태 | 근거 | 겸용 경로가 읽는가 |
|---|---|---|---|---|
| ① 기본정보 | 겸용주택 분리계산 토글 · 보유 중 일부 용도변경 토글 | 뜸 | `AssetSectionBasic.tsx:276-286`(토글 `:280`) · `MixedUseSection.tsx:34-77` | 읽음 |
| ① | 면적 카드(안분 11칸) | 뜸 | `AssetAreaSection.tsx:310-312` → `MixedUseAreaInputs` | 읽음 |
| ② 양도정보 | 양도 형태 3지선다(부담부증여 선택 가능) | 뜸 | `TransferModeBlock.tsx:183-190` | — |
| ② | `BurdenedGiftBlock` ① 평가 유형 라디오 | 뜸 | `BurdenedGiftBlock.tsx:251-274` | **안 읽음**(`burdenedGiftInfo` 미독) |
| ② | ② 인수 채무 4칸(보증금·차입금·임대료·저당설정액) | 뜸 | `:277-340` | 안 읽음 |
| ② | ③ 시가 모드(양도시 시가 · 취득가액 산정방식 · K-5 안내) | 시가 모드일 때 | `:343-390` | 안 읽음 |
| ② | K-4 실지취득가액 「실지취득가액 (주택·건물 전체)」 | 시가+실지일 때 | `:402-469`(라벨 `:449`) | 안 읽음 |
| ② | 이월과세 「당초 증여자」 박스 | 취득원인=이월과세일 때 | `:472-594` | 안 읽음 |
| ② | ④ 증여재산 평가 「증여일 주택 기준시가」(`bgGiftBuildingStdPriceAtTransfer`) | 기준시가 모드 | `:606-662`(라벨표 `:109-112`, 런처는 housing에서 null — `lib/calc/burdened-gift-std-price-launcher.ts` `bgGiftStdPriceLauncherSpec`) | 안 읽음 |
| ② | ⑤ 증여세 통합 §53·§56·§57·§69 · 사전증여 · ⑥ 채무 미리보기 | 뜸 | `:665-746` · `:749` · `:752-793` | 안 읽음 |
| ② | §159 안내 카드 「양도가액은 자동 산정됩니다」 + **「양도시 기준시가 입력은 §159 분모(C)의 보충적 평가에 사용」** | 뜸 | `AssetSectionTransfer.tsx:75-107`(문구 `:98-106`) | 문구가 겸용에서 **사실과 다름** |
| ② | **「양도시 기준시가 (원)」 총액 칸**(`standardPriceAtTransfer`) | 기준시가 모드, 시가+환산일 때 | `AssetSectionTransfer.tsx:116-…`(`CompanionSaleModeBlock`) · 노출 술어 `lib/calc/burdened-gift-transfer-price-scope.ts:38-47` | **안 읽음**(겸용은 `mixedTransfer*` 4부분) |
| ② | **「취득시 기준시가」 총액 카드**(`bg-acq-std-price`, `standardPriceAtAcq`) | 기준시가 모드 / 시가+K-5·K-6·K-7(비이월) | `AssetSectionTransfer.tsx:186-…` · 술어 `lib/calc/burdened-gift-acq-std-price.ts:56` | **안 읽음** |
| ③ 취득정보 | 취득원인 라디오 5종 | 뜸 | `CompanionAcquisitionCauseSection.tsx:100` | 읽음 |
| ③ | 매매 블록: 취득일 / 토지 취득일 | 뜸 | `CompanionAcquisitionCauseSection.tsx:187` → `CompanionAcqPurchaseBlock` | 읽음 |
| ③ | BG 안내 카드 「취득시 기준시가는 위 **② 양도정보**의 '취득시 기준시가' 카드에서 입력」 | 뜸 | `CompanionAcqSpecialAssetNotices.tsx:20-60`(`:49`) | 문구가 겸용에서 **사실과 다름** |
| ③ | 취득가액 산정방식 라디오 · 취득가액 금액 · 기준시가 섹션 · **겸용 별개 취득 블록** | **숨김** | `CompanionAcqPurchaseBlock.tsx:348`(`transferType !== "burdened_gift"` 게이트가 `:358-359`·`:371`·`:453`·`:461`을 감쌈) | — |
| ③ | 신축·증축 `SelfBuiltSection` | 뜸 | `CompanionAcqPurchaseBlock.tsx:550-573` | 겸용 ④는 `isSelfBuilt: (!isMixed && …)`로 **미전송**(`transfer-tax-api.ts:420`) — 겸용 일반 양도에서도 이미 죽은 칸 |
| ③ | **`MixedUseExpandedPanel`**(1-A 용도변경 · 주택 기준시가 취득/양도 · PHD 토글 · 파트별 실비 카드 · 상가 기준시가) | **BG와 무관하게 뜸** | `AssetSectionAcquisition.tsx:258-267` · `MixedUseSection.tsx:84-146` · PHD 토글 `MixedUseAssetMajorStdPrice.tsx:247` · 파트별 실비 `:228`(`isPurchaseActual`은 BG를 보지 않음) | 읽음 |
| ④ 필요경비 | 자본적지출 · 양도비 | 뜸 | `AssetSectionExpense.tsx` (BG K-4 블록 `:456-467`이 **같은 필드**를 한 번 더 바인딩) | 읽음 |

### 1.3 중복·죽은 입력 (이게 이 설계의 출발점)

| ID | 같은 값을 받는 곳 | 겸용 엔진이 쓰는 것 |
|---|---|---|
| DUP-1 양도시 기준시가 | ⓐ 겸용 패널 `mixedTransferHousingPrice` 등 4부분(③) ⓑ `standardPriceAtTransfer` 총액(②, BG 기준시가 모드) ⓒ `bgGiftBuildingStdPriceAtTransfer`(②, BG ④) | ⓐ만 |
| DUP-2 취득시 기준시가 | ⓐ 겸용 패널 4부분(③) ⓑ `standardPriceAtAcq` 총액(②) | ⓐ만 |
| DUP-3 실지취득가액 총액 | ⓐ `fixedAcquisitionPrice`(③, **BG에서 숨김**) ⓑ `bgActualAcquisitionTotal`(②, BG K-4) | 일반 양도 겸용은 ⓐ. BG는 ⓑ (모델 A) |
| DUP-4 자본적지출·양도비 | ⓐ `AssetSectionExpense` ⓑ BG K-4 블록(`BurdenedGiftBlock.tsx:456-467`) — **같은 필드** | 읽음(선재 중복·무해 — 건드리지 않는다) |
| DUP-5 파트별 실비 | `mixedHousingActualExpense`·`mixedCommercialActualExpense`(겸용 패널) ↔ 공통 `capitalExpenditure`·`transferExpense` | BG 모드에서 의미가 모호 → §4 처리 |

**선재 결함 한 건**: 위 ⓑ·ⓒ에 값을 넣어도 세액은 0이다. 지금은 ⑧이 막지만, **차단만 풀면** 사용자는 두 총액 칸을 채우고도(겸용 엔진은 무시) 4부분 칸을 비워 둔 채 통과할 수 있다. ⑧이 4부분을 요구하지 않으면 「UI 통과 ↔ 값 0」 조용한 오답이다 → §6.6.

### 1.4 일반 양도 겸용과의 차이 — 「양도가액」 입력

| | 일반 양도(단건) | 부담부증여 |
|---|---|---|
| 양도가액 칸 | `CompanionSaleModeBlock` "actual" → 「양도가액 (원)」 `data-field="contractTotalPrice"` (`CompanionSaleModeBlock.tsx:271-285`) | **사라진다.** `usesSelfComputedTransferPrice`가 모드를 `"apportioned"`로 덮어쓴다(`AssetSectionTransfer.tsx:119-124`) → 위 DUP-1 ⓑ 칸이 대신 뜬다 |
| ⑧ 총액 필수 | `contractTotalPrice` 필수(`transfer-tax-validate.ts:84-90`) | **면제**(전 자산이 BG일 때만 — `:86`) |
| ④ `transferPrice` | 계약 총액 | 채무 합계 **placeholder**(`transfer-tax-api.ts:233-236`, `:270-276`) — 엔진이 §159로 다시 계산해야 한다 |
| 취득가액 | 라디오 + 금액(축 A) 칸 | 숨김(`CompanionAcqPurchaseBlock.tsx:348`) → BG 블록이 담당 |
| 겸용 route | `calcMixedUseTransferTax(data.transferPrice, …)` (`app/api/calc/transfer/route.ts:535-613`) → `mode: "mixed-use"` | 같은 분기. `burdenedGift*`를 grep해도 `lib/tax-engine/transfer-tax-mixed-use*.ts`에 **0건** — §159 안분이 없다 |

---

## 2. 엔진 입력 모델 — 엔진 회신으로 **A 확정**

엔진 R2 §0 D-4·§3.5·§8 E-1: **D1′ = 모델 A**. 최상위 `burdenedGiftInfo`(기존 필드, 기준시가는 합계 관행)를 그대로 쓰고, 4부분 기하는 `MixedUseAssetInput`에서 엔진이 **재파생**한다. B(4부분 BG)는 「필드 8~12개 증가 · 기준시가 두 벌」로, C(겸용 전용 서브객체)는 「`refineBurdenedGiftInputs`와 충돌」로 기각·보관됐다.

| | **A (확정)** | B | C |
|---|---|---|---|
| 신규 `AssetForm` 필드 | **8** (채무 귀속 — §5.6). 그 밖에는 `bg*` 재사용 | 8 + 부분별 실지/추계 4~8 | A와 같음 |
| BG 블록 | 기존 + 겸용 요약 + 귀속 카드 | 입력 2배 | A와 같음 |
| ⑫ | `burdenedGiftInfo` 스키마 불변 + 겸용 refine(MB-12 거부) | 스키마 확장 | path 변경 |

### 2.1 모델과 무관하게 확정되는 UI 규약 (유지)

- 4부분 기준시가·면적·취득일의 **정본은 겸용 패널**이다. BG 블록은 파생 표시만 한다(`useEffect → store` 미러링 금지 — 표시·④·⑧이 **같은 leaf 함수**를 부르는 3중 패턴, 루트 정책 1·3).
- 신규 leaf `lib/calc/burdened-gift-mixed-use-scope.ts`(§5.1). 엔진 문서 §3.6 ④의 `resolveMixedBgAcquisition`과 **하나의 파일로 합친다**(엔진 문서 요청과 일치).
- 결과는 `mode: "mixed-use"` 유지 — 엔진 E-2가 확정했다. UI는 `breakdown.burdenedGift` **존재 여부**로 분기한다(`acquisitionConversionRoute`에 새 값을 추가하지 않는다).

---

## 3. 지원 범위(P1) 매트릭스 — 막는 조합과 막는 방법

판정의 **엔진 쪽은 엔진 `collectMixedBurdenedGiftIssues`(MB-1~MB-14)** 가 한다(엔진 문서 §3.7 — 엔진 throw · ⑫ · ⑧이 같은 함수). UI는 거기에 **더 좁은 P1 제한**만 얹는다. 아래 X-n은 UI 화면 행이고 MB-n과의 대응은 §3.3이다.

| # | 조합 | P1(UI) | 엔진 | 이유 | ⑧ 점프 field | ⑤ 처리 |
|---|---|---|---|---|---|---|
| X-1 | 평가유형 기준시가(K-1~3) | ✅ | ✅ | | | |
| X-2 | 시가 + K-4 실지 | ✅ | ✅ | | | |
| X-3 | 시가 + K-5 환산 | ✅ | ✅ (M-7) | 개산공제 = 취득시 기준시가 × `B_part'/C_part` × 율 | | |
| X-4 | 시가 + K-6/K-7 | ✅ **(Q-5 닫힘)** | ✅ (§3.2) | UI 추가 0 — `bgPresumedAcquisitionTotal` 재사용(`bgPresumedInputKind`가 housing을 `"total"`로 본다 `burdened-gift-presumed-acquisition.ts:80-84`) | | |
| X-5 | 취득원인 상속 | ❌ | ✅ (MB-8: K-5/6/7 불허, K-4 고정) | UI 범위 축소(§10 Q-6). 엔진이 fallback 충돌을 선제 해소했으므로 사유가 「정본 충돌」이 아니라 「입력 UI 미구축」이다 | `acquisitionCause` | 라디오 옵션 `disabled`(현재값이 아닐 때만) |
| X-6 | 취득원인 증여 | ❌ | ✅ | 위와 동일 | `acquisitionCause` | 위와 동일 |
| X-7 | 취득원인 이월과세 | ❌ | ❌ (MB-9) | 겸용 입력에 이월과세 없음 | `acquisitionCause` | 위와 동일 |
| X-8 | 취득원인 신축 | ❌ | 엔진 문서 MB 목록에 **없음**(확인 필요) | 겸용 ④가 신축을 안 싣는다(`transfer-tax-api.ts:420`) | `acquisitionCause` | 위와 동일 |
| X-9 | **PHD**(§164⑦) | ❌ | ❌ (MB-2) | | `usePreHousingDisclosure` | PHD `ToggleCard` **ON 전이만 비활성** |
| X-10 | 보유 중 일부 용도변경 | ❌ | ❌ (MB-4) | | `hasPartialUsageChange` | 용도변경 토글 **ON 전이만 비활성** |
| X-11 | 별개 취득 파트 모델 | ❌ | ❌ (MB-3) | 이 블록은 BG 게이트(`CompanionAcqPurchaseBlock.tsx:348`) 안이라 숨김 | `mixedAcqPerPartMode` | stale `true`일 때만 ⑧ |
| X-12 | 토지·건물 취득일 다름 | ✅ **(Q-8 닫힘)** | ✅ (B0, V-15 확인 필요) | 기존 B0 입력(`mixedAcqLandPricePerSqmAtBuildingAcq`)이 그대로 열린다. 안내 한 줄에 「확인 필요」 병기 | | |
| X-13 | 공익수용 | 라디오 배타로 도달 불가 | ❌ (MB-5) | API 직접은 ⑫ | `transferType` | |
| X-14 | 공유지분 < 100% | ❌ | ❌ (MB-6) | 훅 충돌 | `ownershipNumerator` | |
| X-15 | 컴패니언 / 축 B | ❌ | ❌ (MB-6) | §8 | `transferType`(해당 자산) | |
| X-16 | 증여일 < 2022-01-01 | ❌ | ❌ (MB-1) | 겸용 분리계산 범위 밖. **「단일 자산 모드로 계산하세요」 문구는 BG에 쓰면 안 된다**(겸용 BG의 단일 자산 모드가 없다 — 엔진 §2.2). 현재 배너 `MixedUseSection.tsx:98-103`가 그 문구라 BG 분기 필요 | `transferDate` | 배너 문구 BG 분기 |
| X-17 | 담보(§66)·임대(§61⑤) 평가가 보충적평가를 이김 | ❌ | ❌ (MB-7, Q-3 α) | 연임대료·저당설정액이 크거나 B>보충적평가일 때. **엔진 문서 §9 ③이 「UI 행이 없다」고 지적한 3건 중 하나** | `transferType` | ⑧ 사전 차단(엔진 collector, 클라이언트 계산 가능 E-9) |
| X-18 | 채무 귀속 미선택 · 「나누어 입력」 합 불일치 | ❌ | ❌ (MB-13) | §5.6 | `bgDepositAttribution` · `bgMortgageAttribution` · `bgDepositSplitHousing` · `bgMortgageSplitHousing` | 필수 라디오(기본값 없음) |
| X-19 | 부분 초과부담부(`B_h'>C_h` 또는 `B_c'>C_c`) | ❌ | ❌ (MB-14) | 자동 재배분 금지 | 귀속 입력(§6.6 규칙) | 귀속 카드 인라인 경고 |
| X-20 | 합계 `B > C` | ❌ | ❌ (MB-10) | | `bgLendingDepositTotal` | 기존 시가 모드 검사 + 기준시가 모드 사전 차단 |

### 3.1 막다른 길(dead-end) 방지 규칙 — 반드시 지킨다

`feedback_ui_gate_removes_sole_input_path`가 이미 이 저장소에서 재발한 함정이다(예: `AssetSectionTransfer.tsx:258-270`의 `sapEnabled` 주석).

1. **차단 대상 토글은 「ON으로 가는 전이」만 비활성**한다: `disabled={blocked && !checked}`. 이미 켜져 있으면(일반 양도에서 켜 두고 BG로 넘어온 경우) 사용자가 **끌 수 있어야** 한다. `ToggleCard`는 `disabled`이면 `onCheckedChange`가 `undefined`가 되어(`ToggleCard.tsx:195`) 끌 수도 없다.
2. 라디오 옵션(취득원인)은 **현재 선택되지 않은** 옵션만 `disabled`. 현재 값이 막힌 값이면 ⑧이 `acquisitionCause`로 점프시키고 다른 옵션은 눌린다.
3. 숨겨서 못 끄는 stale 값(`mixedAcqPerPartMode === true` 등)은 ⑧ 오류 문구에 **끄는 방법**(양도 형태를 일반 양도로 되돌려 해제)을 적는다.
4. 차단 문구는 우회로를 **함부로 권하지 않는다.** 현행 문구(`validate-bg.ts:117`)의 「주택과 상가를 나누어 각각 입력하세요」는 겸용 분리계산과 **동치가 아니다**(§160① 단서 분리계산의 장기보유공제 표 선택·12억 판정·배율 초과 비사업용토지 판정이 다르다). 새 문구는 「일반 양도로 바꾸거나, 이 조합은 계산기가 지원하지 않으니 전문가에게 확인」으로 쓴다(Q-10).
5. **귀속 입력은 ON/OFF 토글이 아니라 필수 선택**이다. 선택을 지우는 UI는 없고 다른 값으로 바꾸기만 가능하므로 dead-end가 없다. 단 겸용 OFF로 돌아가면 카드가 사라지지만 값은 보존한다(재ON 시 복원) — ④는 겸용이 아니면 보내지 않는다(§6.2).

### 3.2 3층 parity — 엔진 함수를 **호출**하는 구조

엔진 문서 §3.7: 「`collectMixedBurdenedGiftIssues` — 엔진 throw · ⑫ · ⑧이 같은 함수를 호출」. UI ⑧도 같은 함수를 호출하므로 MB-n 판정은 **복제하지 않는다**(`mixed-use-part-acq.ts`의 `collectMixedPartAcqIssues`를 `mixed-use-part-acq-split.ts`가 「폼 문자열 → leaf 인자 변환만」 하는 선례와 같다). UI가 따로 쓰는 것은 P1 제한 X-5~X-8·X-14·X-15·귀속 입력 형식(X-18)뿐이다.

- **격자 anchor**: 조합(X-1~X-20) × {UI 허용 여부, 엔진 collector 이슈 수}에서 **UI 허용 ⇒ 엔진 이슈 0**을 단언한다(UI 허용 ⊂ 엔진 허용). 반대(엔진 허용 ∧ UI 차단)는 X-5·X-6·X-8·X-14의 일부만 허용하는 **의도된 좁힘**이라 표로 고정한다.
- 의존: 엔진이 collector·`prepareMixedBurdenedGift`를 **클라이언트에서 호출 가능한 순수 함수**로 export하고 이슈에 `code`(MB-n)를 싣는 것(§11 잔여 RES-1).

### 3.3 엔진 MB-1~MB-17 ↔ UI X-n 대응표 (누락 확인)

| MB | 엔진 조건 | UI 행 | UI 처리 | UI ⊂ 엔진 확인 |
|---|---|---|---|---|
| MB-1 | 증여일 < 2022-01-01 | **X-16 (신설)** | ⑧ `transferDate` + 배너 BG 문구 | UI는 막지 않고 엔진 collector에 위임(UI 허용 = 엔진 허용) |
| MB-2 | PHD | X-9 | 토글 ON 전이 비활성 + ⑧ | 같음 |
| MB-3 | 별개 취득 파트 모델 | X-11 | 숨김 + ⑧(stale) | 같음 |
| MB-4 | 보유 중 용도변경 | X-10 | 토글 ON 전이 비활성 + ⑧ | 같음 |
| MB-5 | 공익수용 | X-13 | 라디오 배타 | 같음 |
| MB-6 | 지분 < 1 · 컴패니언 · 축 B | X-14·X-15 | ⑧ | 같음 |
| **MB-7** | 보충적평가가 C를 못 이김(담보/임대 승 · 시가+담보 승) | **X-17 (신설)** | ⑧ 사전 차단. 클라이언트에서 `computeSangjeungbeopValuation`으로 계산 가능(E-9) | UI가 막지 않으면 엔진 throw → **「UI 통과 ↔ 엔진 오류」**. 사전 차단 필수 |
| MB-8 | 상속 취득 + K-5/6/7 | X-5(상속 자체를 P1 차단) | 옵션 비활성 | UI가 더 좁다 |
| MB-9 | 이월과세 | X-7 | 옵션 비활성 + ⑧ | 같음 |
| MB-10 | 합계 B > C | **X-20 (신설)** | 시가 모드 기존 검사(`validate-bg.ts:327-345`) + 기준시가 모드 사전 차단 | 같음 |
| MB-11 | 필수 입력 누락(시가 총액·산정방식·K별 금액·**기준시가 모드 취득시 3필드·나목**·공통 양도시 3필드·나목·상속증여 reported) | V-3·V-4·V-5 | ⑧ | 취득시 기준시가는 K-4/K-6/K-7에서도 요구(안분 비율·개산공제 base) — **엔진 R3 §10이 수용해 일치** |
| MB-12 | 양도시 합 ≠ 엔진 재파생 Σ · ⑫ 거부 필드 존재 | (입력 경로 없음) | **④ 합계 전송(leaf)** + **④ stale 가드 확대**(§4) | UI는 거부 필드를 **보내지 않는다** — stale 값이 있으면 400이 되므로 가드가 필수 |
| **MB-13** | 귀속 미입력 · 3값 합 ≠ `lendingDepositTotal + mortgageDebtAmount` · 음수 | **X-18 (신설)** | 필수 라디오 + 분할 합 일치 검사. 비분할 모드는 **구조상 합이 총액과 같다** | UI 구조가 항상 합을 맞춰 보낸다 |
| **MB-14** | `B_h'>C_h` 또는 `B_c'>C_c` | **X-19 (신설)** | 귀속 카드 인라인 + ⑧ | C_h는 엔진 leaf로 계산 |
| **MB-15** | 신축 취득(`acquisitionByNewConstruction`) | X-8 | 옵션 비활성 + ⑧ | 같음 (엔진 R3 신설) |
| **MB-16** | 증여자 토지·건물 취득일 < 1985-01-01 | (신설 필요) | ⑧ 취득일 칸 + 안내 | 엔진 R4 신설 — UI 행·문구는 Do에서 확정 |
| **MB-17** | (엔진 Q-11 β 채택 시) 「구분 감정평가 있음/없음」 선언 미입력·주택분 시가 미입력·주택분 > 전체 | (신설 필요) | ② 시가 칸 아래 선언 RadioCardGroup + 조건부 금액 1칸 | 계획서 G-13 결정 후 확정 |

초판에서 대응 행이 **없던** 것: MB-1·MB-7·MB-10·MB-13·MB-14 → 위 표에서 X-16·X-17·X-20·X-18·X-19로 채웠다. 반대로 **MB에 없는 UI 행**은 X-5·X-6(UI 좁힘), X-8(신축 — 엔진 R3에서 MB-15로 신설되어 이제 대응됨), X-12(허용)다.

---

## 4. 중복 입력 제거 — 필드별 처리표

| 필드(AssetForm) | 정본 위치 | 겸용 × BG에서의 처리 | 근거 |
|---|---|---|---|
| `mixedTransferHousingPrice` · `mixedTransferLandPricePerSqm` · `mixedTransferCommercialBuildingPrice` · `mixedTransferHousingBuildingStdPrice` (양도시 4부분) | ③ 겸용 패널 | **정본.** ②에 합계 요약만 표시. ⑧은 기존 필수 유지(`validate-mixed-use-asset.ts:49-63`) | DUP-1 |
| `mixedAcq*` (취득시 4부분) | ③ 겸용 패널 | **정본.** BG에서는 **항상 필수**(§6.6) — K-1~3 분자, K-4 안분 비율, K-5 분자, K-6/K-7 개산공제 base | DUP-2 |
| `standardPriceAtTransfer` (총액) | — | **숨김.** `stdPriceAtTransferComesFromElsewhere`에 `\|\| isMixedBurdenedGift(asset)` 추가 → `AssetSectionTransfer.tsx:116`의 `CompanionSaleModeBlock`이 안 뜨고 `validate-asset.ts:313-316`도 같은 술어라 요구하지 않는다 | DUP-1 ⓑ |
| `standardPriceAtAcq` (총액) | — | **숨김.** `needsBgAcqStdPriceInput`에 `&& !isMixedBurdenedGift(asset)` → `bg-acq-std-price` 카드가 안 뜨고 `validate-bg.ts:375`도 요구하지 않는다 | DUP-2 ⓑ |
| `bgGiftBuildingStdPriceAtTransfer` | — | **숨김**(+ 런처). 엔진은 ⑫에서 **거부**(MB-12)한다 — 숨기고 **안 보내야** 한다(stale이면 400) | **Q-4 닫힘** |
| `bgLendingDepositTotal` · `bgMortgageDebtAmount` | ② BG 채무 카드 | **정본(총액)으로 유지.** 귀속은 이 총액을 **나누는** 별도 입력(아래). 기존 읽는 곳(④ `buildBurdenedGiftInfo` · 미리보기 · 사이드바 · ⑧ (3))은 **무변경** | 중복 방지 |
| `bgDepositAttribution` · `bgDepositSplit{Housing,Commercial,Unallocated}` · `bgMortgageAttribution` · `bgMortgageSplit{Housing,Commercial,Unallocated}` | ② 채무 귀속 카드 (신규, §5.6) | 겸용 BG에서만 뜬다. 총액을 **어디에 귀속시키는지**만 받는다 — 총액을 다시 받지 않는다 | 엔진 D-7 |
| `bgAnnualRentTotal` · `bgMortgageSetAmount` | ② BG 채무 카드 | 유지(물건 전체). 이 둘이 담보/임대 평가를 키워 보충적평가를 이기면 X-17로 차단 | MB-7 |
| `bgActualAcquisitionTotal` | ② BG K-4 | **정본.** 라벨을 「실지취득가액 — 주택·상가 전체(토지 포함)」로 분기. `fixedAcquisitionPrice`와 **교차 복사·display fallback 하지 않는다** | DUP-3 |
| `bgMarketValueAtTransfer` | ② BG 시가 모드 | **정본.** 물건 전체 시가 총액. 주택/상가 분해는 엔진이 양도시 기준시가 비율로 한다(Q-2 α) — 시가 모드에서도 양도시 4부분은 필수 | |
| `bgPresumedAcquisitionTotal` (K-6/K-7) | ② BG | **정본**(X-4 포함) | |
| `capitalExpenditure` · `transferExpense` | ④ 필요경비 + BG K-4(선재 이중 바인딩) | 그대로. 채무비율(부분별) 안분은 엔진 | DUP-4 |
| `mixedHousingActualExpense` · `mixedCommercialActualExpense` (파트별 실비) | ③ 겸용 패널 | BG에서는 **카드를 숨긴다**: `isPurchaseActual`(정의 `MixedUseAssetMajorStdPrice.tsx:72-77` · 사용 `:228`·`:401`)에 `&& !isMixedBurdenedGift(asset)`. ④는 BG에서 이 값을 **전송하지 않는다**(stale 가드) | DUP-5 |
| 상속·증여 reported 값 | ③ 겸용 패널 | P1은 매매만 허용(X-5·X-6). ④는 전송하지 않는다 | |

**④ stale 가드 목록 (R2 확대)** — 겸용 BG에서 **보내지 않는** 키. 엔진 ⑫는 MB-12로 **strip이 아니라 거부**하므로 숨은 stale 값이 한 개라도 새면 **HTTP 400**이다(선례: `transfer-tax-api-split.ts` 분리 취득 stale 가드, `useEstimatedAcquisition: … isMixed ? false` `transfer-tax-api.ts:356`).

- 겸용 `mixedUse` 쪽 **폼의 stale 값에서 읽지 않는** 키: `housingInheritedValue/Expense` · `commercialInheritedValue/Expense` · `separateAcquisition` · `usePreHousingDisclosure`/`preHousingDisclosure` · `partialUsageChange`. (`useActualAcquisition`·`useAppraisalSalesAcquisition`·`acquisitionActualTotalPrice`는 **보내되**, 엔진 문서 §3.6 ④대로 폼의 겸용 플래그가 아니라 **BG 산정방식에서 파생**한다: K-4 → 실지 플래그 + `bgActualAcquisitionTotal`, K-6/K-7 → 추계 플래그 + `bgPresumedAcquisitionTotal`, K-5·기준시가 → 둘 다 off. 폼의 `useEstimatedAcquisition`·`fixedAcquisitionPrice`·`similarSalesValue` stale 값은 읽지 않는다.)
- `burdenedGiftInfo` 쪽(MB-12 거부 목록): `giftBuildingStdPriceAtTransfer` · `actualLandAcquisitionPrice` · `actualBuildingAcquisitionPrice` · `presumedLandAcquisitionPrice` · `presumedBuildingAcquisitionPrice` · `carryoverDonorBasis` · `rightValuation` · `assumedDebtOverride` · `presumedExtensionAppraisalValue`. **지금 `buildBurdenedGiftInfo`는 이 중 여러 개를 폼 값이 비어 있지 않으면 싣는다**(`transfer-tax-api-burdened-gift.ts` 의 `usesActualAcquisitionFields` 분기 · `buildExtensionAppraisal` · `giftBuildingStdPriceAtTransfer` 삼항) — 자산 종류를 일반건물→주택으로 바꾼 사용자의 stale `bgActualAcquisitionLand`가 400이 된다. 겸용 분기에서 위 키를 **명시적으로 비운다**.
- `capitalExpenditure`·`transferExpense`는 공통 필요경비라 유지. `debtAttribution`은 겸용일 때만 싣는다(비겸용에서 존재하면 ⑫가 거부).

---

## 5. 화면 순서 · 위젯 상세 (⑤)

### 5.1 신규 leaf — `lib/calc/burdened-gift-mixed-use-scope.ts` (≈150줄)

```ts
isMixedBurdenedGift(asset): boolean          // assetKind==="housing" && isMixedUseHouse && transferType==="burdened_gift"
bgMixedUseBlock(asset, ctx): { reason; short; long } | null   // UI 전용 P1 좁힘(X-5~X-8·X-14·X-15)만. 엔진 MB-1~14는 여기서 다시 쓰지 않는다
mixedTransferStdTotal(asset) / mixedAcqStdTotal(asset, transferDate): { housing; commercialLand; commercialBuilding; total; missing: string[] }
mixedBgDebtAttribution(asset): {                // 귀속 3값의 단일 소스 — ④ 합성 · ⑤ 표시 · ⑧ 요구가 공유
  housing; commercial; unallocated;             // 원. 항목별 모드에서 합성(분할 모드는 입력 3칸)
  issues: Array<{ item: "deposit"|"mortgage"; kind: "MODE_MISSING"|"SPLIT_MISMATCH"; field: string; diff: number }>
}
```

- `mixedTransferStdTotal`·`mixedAcqStdTotal`은 `MixedUseAssetMajorStdPrice.tsx:107-140`이 컴포넌트 안에서만 계산하는 「상가 부수토지 기준시가 = 개별공시지가 × 상가 부수토지 면적(`computeDerivedAreas`) + 상가건물」을 **leaf로 승격**한다(컴포넌트는 이 leaf를 부른다 — 복제 금지, dual-truth). 취득측은 `mixedAcqLandPricePerSqm(primary, transferDate)`(`transfer-tax-api-mixed-use.ts:60-66`, mixed → PHD → 1990 환산 3단 fallback)를 **그대로** 부른다.
- **`missing`은 fallback이 아니다.** 비어 있으면 합계를 0으로 두지 않고 `missing`에 칸 이름을 싣는다 — 표시는 「미입력」, ⑧은 오류(자동 안분 fallback 금지, 루트 정책 2).
- ④가 `buildingStdPriceAtTransfer`/`buildingStdPriceAtAcquisition`에 싣는 합계도 이 leaf의 `total`이다. 엔진은 **양도시 합**만 재파생 Σ와 비교(MB-12)하므로 표시 = ④ 전송 = ⑧ 요구 = 엔진 비교가 한 함수다. 취득시 합은 엔진이 비교하지 않는다(V-15).
- `mixedBgDebtAttribution`: 항목(임대보증금·담보차입금)마다 금액 `X = parseAmount(총액)`이 0이면 건너뛴다. 모드 `housing|commercial|unallocated` → `X`를 그 버킷에, `split` → 입력 3칸을 버킷에(합이 `X`와 다르면 `SPLIT_MISMATCH`), `""` → `MODE_MISSING`. **모드가 비어 있으면 어떤 버킷에도 넣지 않는다** — 「전부 구분 불분명」 기본값 금지(엔진 Q-10).
- **엔진 함수는 호출한다(복제 금지)**: `collectMixedBurdenedGiftIssues`(⑧·⑤ 미리보기)·`prepareMixedBurdenedGift`(C·C_h·`u_h`·`B_h'`·비율을 미리보기에 표시) — 엔진 문서 §3.2·§3.7 명칭. 클라이언트 호출 가능한 export가 필요하다(§11 잔여 RES-1).
- 엔진 문서 §3.6 ④의 `resolveMixedBgAcquisition(primary)`(취득 플래그를 BG 모드에서 파생)는 **이 파일에 함께 둔다**(엔진 문서가 「하나로 합쳐」라고 요청).

### 5.2 화면 순서와 ordering 예외

엔진 계산 순서는 ① 면적(안분 분모) → ② 증여재산 평가(양도시 4부분 합 = A, 담보·임대 → C) → ③ 채무비율 B/C → ④ 양도가액 = A×B/C → 4부분 안분 → ⑤ 취득가액 → ⑥ 개산공제/실비 → 양도차익 → 세액 → 증여세다.

현행 화면은 ① 면적 → ② BG 블록 → ③ 취득정보(4부분 기준시가)이므로 **4부분 양도시 기준시가가 그것을 소비하는 BG 블록보다 뒤에 있다.** 「UI 순서 = 계산 로직 순서」 위반이지만 다음 이유로 **예외로 둔다**(Q-3):

- 4부분 패널은 「주택 섹션{취득 sub-block, 양도 sub-block} · 상가 섹션」의 **자산-우선** 레이아웃이라 시점별로 ②/③에 쪼갤 수 없다. 통째로 ②에 옮기면 「양도정보」에 취득시 입력이 섞인다.
- 옮기면 `MixedUseExpandedPanel` 마운트 위치가 바뀌어 `expandAssetSection(page, 3)`으로 4부분을 채우는 기존 E2E(`e2e/mixed-use-*.spec.ts` 다수)가 깨진다.
- 같은 선례가 이미 있다: `general_building`은 「양도시 기준시가는 ③ 취득정보의 일반건물 카드에서 입력」 안내만 둔다(`AssetSectionTransfer.tsx:94-97`).

**보완**: ②에 **읽기 전용 요약 카드**를 두어 사용자가 계산 전에 A를 눈으로 검증하게 하고, 미입력 칸을 이름으로 알려 준다.

### 5.3 와이어

```
① 기본정보   ● 주택 / [겸용주택 분리계산 ON] / 소재지 / 면적 카드(변경 없음)
② 양도정보
  └ 양도 형태·원인 (fuchsia)     ○ 일반 양도  ● 부담부증여  ○ 공익수용
       ├ ◆ ToneCard(amber) 「겸용주택 × 부담부증여 — 입력 위치」        [신규, TransferModeBlock]
       │     · 4부분 기준시가·면적은 ① 면적 / ③ 겸용주택 기준시가에서 한 번만 입력
       │     · 지원 범위(매매 취득 · 단건 · 단독 소유) 한 줄
       └ BurdenedGiftBlock (fuchsia)
            ① 양도(증여) 평가 유형      (변경 없음)
            ② 인수 채무 + 임대 평가 보조 (rose)  임대보증금 · 담보차입금 · 연 임대료 · 저당설정액  (변경 없음)
               └ ◆ 채무 귀속 — 주택 / 상가 (rose ToneCard, 신규 §5.6)      [BurdenedGiftDebtAttributionCard]
                    임대보증금 ○○○원   귀속 *  ○주택 ○상가 ○구분 불분명 ○나누어 입력
                    담보차입금 ○○○원   귀속 *  ○주택 ○상가 ○구분 불분명 ○나누어 입력
            ③ [시가 모드] 시가 · 취득가액 산정방식 · K-4/K-5/K-6/K-7  (라벨만 겸용 분기)
            ④ ◆ 증여재산 평가 — 겸용주택 요약 (emerald, 읽기 전용)       [신규 BurdenedGiftMixedUsePanel]
                  개별주택공시가격(주택건물+부수토지)      ○○○   ← mixedTransferHousingPrice
                  상가 부수토지 = 개별공시지가 ○○ × 면적 ○○㎡  ○○○
                  상가건물 기준시가                          ○○○
                  양도시 기준시가 합계 (= 증여재산 보충적평가액)  ○○○
                  [취득시 기준시가 합계 — 기준시가 모드·K-5·K-6/K-7·K-4 안분 비율]  ○○○
                  ◆ 부분별 채무비율 표 (주택분 / 상가분, 귀속 반영) — 입력이 끝나면 표시   [§5.5]
                  미입력: 「③ 취득정보 > 겸용주택」에서 입력하세요 (칸 이름 나열)
            ⑤ §53 증여세 · 사전증여 · ⑥ 채무 미리보기   (⑥은 겸용에서 「양도가액 = 채무액」 단정 문구를 바꾼다 — U-12)
  └ §159 안내 카드                (문구 겸용 분기: 「양도시 기준시가 입력은 …」 문장 삭제)
  └ (숨김) 양도시 기준시가 총액 · 취득시 기준시가 총액 카드
③ 취득정보
  └ 취득원인 (이월·신축·상속·증여 옵션은 현재값이 아니면 disabled + 사유)
  └ 취득일 / 토지 취득일
  └ BG 안내 카드                   (문구 겸용 분기: 「② 양도정보 … 취득시 기준시가 카드」 → 「아래 겸용주택 기준시가」)
  └ MixedUseExpandedPanel          (4부분 정본. PHD 토글·용도변경 토글: ON 전이만 disabled, 파트별 실비 카드 숨김)
④ 필요경비                         (변경 없음)
```

### 5.4 변경 지점 (파일 · 줄 · 내용)

| # | 파일:줄 | 변경 |
|---|---|---|
| U-1 | `lib/calc/burdened-gift-transfer-price-scope.ts:47` | `stdPriceAtTransferComesFromElsewhere`에 `isMixedBurdenedGift(asset)` OR. JSDoc 표에 「겸용: 4부분 `mixedTransfer*`가 받는다」 행 추가 |
| U-2 | `lib/calc/burdened-gift-acq-std-price.ts:56` | `needsBgAcqStdPriceInput`에 `&& !isMixedBurdenedGift(asset)`. 제외 이유 JSDoc에 겸용 항목 추가 |
| U-3 | `components/calc/transfer/TransferModeBlock.tsx:204-212` | 겸용이면 `BurdenedGiftBlock` 위에 amber `ToneCard`(신규 안내). 미지원 사유(`bgMixedUseBlock` — UI 좁힘 X-5~X-8·X-14·X-15)가 있으면 미지원 사유 카드(`:192-201`의 rose 카드와 같은 형태)를 렌더하고 블록은 마운트하지 않는다. **엔진 MB 사유(PHD·용도변경 등)는 블록을 숨기지 않는다** — 숨기면 끌 칸이 없어지므로(§3.1) 카드 안내 + ⑧로만 막는다 |
| U-4 | `components/calc/transfer/BurdenedGiftBlock.tsx:596-662` | 겸용이면 ④ 「증여재산 평가」 블록과 런처를 `BurdenedGiftMixedUsePanel`로 교체. `:402-469` K-4 라벨 분기, `:380-388` K-5 안내 문구의 「아래 ② 양도정보에서…」 분기 |
| U-5 | `components/calc/transfer/asset-sections/AssetSectionTransfer.tsx:98-106` | 겸용이면 「양도시 기준시가 입력은 §159 분모…」 문장 제거(칸이 없다) |
| U-6 | `components/calc/transfer/CompanionAcqSpecialAssetNotices.tsx:49-52` | 겸용이면 문구를 「아래 **겸용주택 기준시가**(취득시·양도시)」로 |
| U-7 | `components/calc/transfer/MixedUseSection.tsx:46-47` · `:63-64` | 용도변경 토글 `disabled={…|| (bgBlocked && !checked)}`. `disabledReason`은 사유 문구 |
| U-8 | `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx:247` | PHD `ToggleCard`에 `disabled={bgBlocked && !asset.usePreHousingDisclosure}` + `disabledReason` + `data-field="usePreHousingDisclosure"`(⑧ 점프용). 같은 컴포넌트의 `:228`·`:401` `isPurchaseActual`(정의 `:72-77`)에 BG 배제 |
| U-9 | `components/calc/transfer/mixed-use/MixedUseLegacyStdPrice.tsx` (용도변경 ON 시 렌더, 411줄) | `hasPartialUsageChange`는 X-10으로 막으므로 BG에서 도달 불가. 단 stale `true`일 때 이 컴포넌트가 뜨므로 U-7의 「끌 수 있음」 규칙이 필수 |
| U-10 | `components/calc/transfer/CompanionAcquisitionCauseSection.tsx:100` | 취득원인 `RadioCardGroup` 옵션 `disabled`/`hint`(RadioCardOption이 지원 — `CompanionAcqPurchaseBlock.tsx:150-173`에서 이미 사용) |
| U-11 | `components/calc/transfer/BurdenedGiftBlock.tsx:339-340` (② rose 카드 4칸 grid 끝, 카드 닫기 직전) | `isMixedBurdenedGift(asset)`이면 `<BurdenedGiftDebtAttributionCard asset onChange />` 마운트(+6줄). 카드 본체는 신규 파일(§5.6) |
| U-12 | `BurdenedGiftBlock.tsx:764-780` (⑥ 미리보기 「인수 채무액 (= 양도가액)」) | 겸용이면 라벨을 「인수 채무액 (물건 전체)」로 바꾸고 「= 양도가액」 단정을 뺀다 — 채무가 한쪽에만 귀속되면 양도가액은 **그 부분 몫**이다. 부분별 값은 U-4의 요약 패널이 보인다 |
| U-13 | `components/calc/transfer/MixedUseSection.tsx:98-103` (2022.1.1 이전 경고 배너) | `isMixedBurdenedGift`이면 「주택연면적과 상가연면적을 비교하여 단일 자산 모드로 계산하세요」 문장을 빼고 「부담부증여는 증여일이 2022.1.1. 이후여야 겸용 분리계산 대상입니다」로(엔진 MB-1, 엔진 §2.2) |
| U-14 | `components/calc/transfer/asset-section-summary.ts:83-100` (② 요약 `transferFilled`) | 현재 BG는 `isBurdened`만으로 filled=true. 겸용이면 귀속 `issues`가 남아 있을 때 filled=false(「귀속 미입력」) — 헤더가 「입력 완료」라고 말하는데 ⑧이 막는 모순을 막는다(선택 사항, 낮은 우선순위) |
| U-15 | `lib/stores/calc-wizard-asset-bg.ts` · `calc-wizard-asset-factory.ts:483-486` · `calc-wizard-asset-migrate-phase3.ts:190-200` | ①②③ 신규 필드 8개(§6.1) |

**tone·번호**: 신규 안내 = `ToneCard tone="amber"`(취득·분리계산), 요약 패널 = emerald(평가·확정), `sectionNum`은 BG 블록 내부 번호를 따르지 않는다(요약은 기존 ④ 자리를 대체하므로 같은 ④). 라벨은 정본 클래스(`text-xs` 제목 · `text-caption` 안내)만. placeholder 숫자 금지. native checkbox/radio 신규 금지.

**testid / data-field(신규)**: `bg-mixed-notice` · `bg-mixed-valuation-summary` · `bg-mixed-valuation-missing` · 합계 행 `bg-mixed-std-total-transfer` · `bg-mixed-std-total-acq`. `data-field`는 신규 입력 칸이 없어 추가하지 않는다(점프 대상은 기존 `mixedTransferHousingPrice` 등).

### 5.5 요약 패널 동작 규칙

- 표시 값은 전부 `mixedTransferStdTotal`/`mixedAcqStdTotal`의 반환값이다. 컴포넌트 안에 합계 산식을 두지 않는다.
- 금액 칸은 `text-right font-mono tabular-nums whitespace-nowrap`(`amount-column-align`).
- 산식 표기 금지 항목: 변수 약어(`A`·`C`·`B`)를 화면에 쓰지 않는다 — 「증여재산 평가액」·「증여가액」·「인수 채무액」. 「÷」·`floor` 금지, 분수는 `Frac`.
- 시가 모드에서는 「양도시 기준시가 합계」를 **안분 비율 근거**라는 이름으로 표시한다(평가액이 아니라 시가 총액을 나누는 기준).

**부분별 채무비율 표 (R2 신설 — 같은 패널 하단)** — 채무비율이 **둘**(주택분·상가분)이므로 하나의 `B/C` 문구를 쓰지 않는다. 값은 전부 엔진 `prepareMixedBurdenedGift` 반환(클라이언트 호출 — 표시층이 다시 계산하지 않는다).

| 행 | 주택분 | 상가분 |
|---|---|---|
| 증여가액 | 주택분 증여가액 `C_h` | 상가분 증여가액 `C_c` |
| 귀속 채무 | 주택 귀속 채무 | 상가 귀속 채무 |
| 구분 불분명 안분 | `구분 불분명 채무 × Frac(주택분 증여가액, 증여가액)` | `구분 불분명 채무 − 주택 몫`(잔액) |
| 양도로 보는 채무액 | `B_h'` | `B_c'` |
| 채무비율 | `Frac(양도로 보는 채무액, 증여가액)` = 00.00% | 〃 |

- 변수 약어(`C_h`·`B_h'`)는 **화면에 쓰지 않는다** — 「주택분 증여가액」·「양도로 보는 채무액」으로 쓴다.
- `B'=0`인 열은 **「양도 없음」** 배지를 단다(문구는 §6.5 R-10). 비율 칸은 「—」.
- `B' > 증여가액`이면 해당 열에 rose 경고(MB-14) — 문구는 §5.6.
- 모드 미선택·4부분 미입력이면 표 대신 「귀속과 4부분 기준시가 입력이 끝나면 표시됩니다」.

### 5.6 채무 귀속 입력 (D-7) — 신설 카드 `BurdenedGiftDebtAttributionCard`

**근거**: 소득세법 §88 1호 후단(채무액에 해당하는 부분이 양도) + 소령 §159 + 부동산거래관리과-119(2010.01.22.) — 채무액이 주택 또는 상가에 속하는 것이 분명하면 **그 부분의 양도**로 본다. 귀속은 임대차계약서의 임차 대상·근저당 설정 대상 같은 증빙으로 뒷받침되는 **사실 선언**이다(엔진 V-20).

**신규 `AssetForm` 필드 (8) — `BurdenedGiftFormSlice`**

| 필드 | 타입 | 의미 |
|---|---|---|
| `bgDepositAttribution` | `"" \| "housing" \| "commercial" \| "unallocated" \| "split"` | 임대보증금 총액의 귀속. `""` = 미선택(**기본값 없음**) |
| `bgDepositSplitHousing` · `bgDepositSplitCommercial` · `bgDepositSplitUnallocated` | string(원) | `split`일 때만 읽는다 |
| `bgMortgageAttribution` | 위와 같음 | 담보차입금 총액의 귀속 |
| `bgMortgageSplitHousing` · `bgMortgageSplitCommercial` · `bgMortgageSplitUnallocated` | string(원) | `split`일 때만 읽는다 |

- **왜 항목마다 같은 위젯인가**: 임대보증금은 임차 대상이 곧 귀속이지만(해석례 사실관계) 주택·상가를 따로 임대하면 **나뉘고**, 담보차입금은 건물 전체 근저당이 흔해 **구분 불분명**이 많다. 어느 쪽이든 「전부 한 곳」과 「나눔」이 다 필요하다. 위젯을 하나로 만들면 코드·테스트가 한 벌이다(`DebtAttributionRow` 2회 사용).
- **총액은 다시 받지 않는다.** `bgLendingDepositTotal`·`bgMortgageDebtAmount`가 정본이고 귀속은 그것을 **나누는** 선언만이다. 비분할 모드는 **구조상 합이 총액과 같다**(총액이 바뀌면 따라간다) — 합계 불일치는 `split`에서만 생긴다.
- **엔진 입력 합성(④)**: `debtAttribution = { housing: Σ항목, commercial: Σ항목, unallocated: Σ항목 }`, 항목별로 `housing`→(X,0,0) · `commercial`→(0,X,0) · `unallocated`→(0,0,X) · `split`→입력 3칸. 합 = 임대보증금 + 담보차입금 = 엔진 MB-13 조건. 총액 0인 항목은 (0,0,0)이고 모드 선택을 요구하지 않는다.
- 겸용이 아니면 이 카드는 없고 ④는 `debtAttribution`을 **보내지 않는다**(비겸용에서 존재하면 ⑫가 거부). 겸용 OFF 후 값은 보존(재ON 복원).
- stale: `split`을 고른 뒤 다른 모드로 바꿔도 분할 3칸은 보존되지만 ④는 **`split`일 때만** 읽는다(§4 stale 가드).

**위치**: ② 인수 채무 카드(`BurdenedGiftBlock.tsx:277-340`) 안, 4칸 grid 바로 아래. 총액을 입력한 뒤 곧바로 귀속을 선언하는 순서다. 귀속 자체는 C_h를 필요로 하지 않으므로 평가 요약(④)보다 앞에 둘 수 있고, **부분별 채무비율·MB-14 확인은 ④ 요약 패널의 표**가 한다.

**위젯** (RadioCardGroup · `tone="rose"` — 부모 채무 카드와 같은 톤, 설명 문구는 폭 때문에 옵션에 달지 않는다: `DONOR_RELATION_OPTIONS`의 `description` 제거 선례 `BurdenedGiftBlock.tsx:133-135`)

```
┌ 채무 귀속 — 주택 / 상가 ──────────────────────────────────────────────┐   ToneCard tone="rose" title
│ 인수 채무가 주택 또는 상가에 속하는 것이 분명하면 그 부분의 양도로 봅니다
│ (국세청 부동산거래관리과-119, 2010.1.22.). 분명하지 않은 채무는 주택·상가
│ 증여가액 비율로 나눕니다 — 이 안분은 해석례가 직접 답하지 않아 확인이 필요합니다.
│ 귀속은 임대차계약서의 임차 대상, 근저당 설정 대상 같은 증빙이 필요한 사실 선언입니다.
│
│ 임대보증금 500,000,000원          [FieldCard stacked · label=「임대보증금 귀속」 · required]
│   ( ) 주택   ( ) 상가   ( ) 구분 불분명   ( ) 나누어 입력        ← RadioCardGroup layout="inline" data-field="bgDepositAttribution"
│   └ 나누어 입력일 때만:  [주택 임차분] [상가 임차분] [구분 불분명분]   ← CurrencyInput hideUnit (FieldCard 3칸)
│        남은 금액 0원 ✓ / 남은 금액 100,000,000원 (rose)
│ 담보차입금 300,000,000원          [FieldCard stacked · label=「담보차입금 귀속」 · required]
│   ( ) 주택   ( ) 상가   ( ) 구분 불분명   ( ) 나누어 입력        ← data-field="bgMortgageAttribution"
└──────────────────────────────────────────────────────────────────────┘
```

- 항목 행은 해당 총액 > 0일 때만 뜬다. 둘 다 0이면 카드는 「인수 채무를 먼저 입력하세요」 한 줄(기존 ⑧ (3)이 이미 막는다).
- 「남은 금액」은 `총액 − 3칸 합`의 **표시 파생**이다(store에 쓰지 않는다). 칸 라벨은 「주택 임차분」·「상가 임차분」·「임차 대상이 분명하지 않은 금액」(담보차입금은 「주택 담보분」·「상가 담보분」·「귀속이 분명하지 않은 금액」).
- `data-field`: `bgDepositAttribution` · `bgMortgageAttribution` · `bgDepositSplitHousing` · `bgMortgageSplitHousing`(⑧ 점프 앵커). testid: `bg-attr-card` · `bg-attr-deposit` · `bg-attr-mortgage` · `bg-attr-remainder-deposit` · `bg-attr-remainder-mortgage`.
- 선택 지우기 UI는 없다. 라디오 `name`은 자산마다 달라야 한다(`bgDepositAttribution-${assetId}` — `BurdenedGiftBlock.tsx:263`의 `name` 규약).

**⑧ 오류 문구 · 점프 대상**

| 코드 | 조건 | field | 문구 |
|---|---|---|---|
| MB-13 (모드) | 총액 > 0 인데 모드 `""` — 임대보증금 | `bgDepositAttribution` | `{label}: 임대보증금 500,000,000원이 주택·상가 중 어디에 속하는지 선택하세요. 임차 대상이 분명하면 그 부분을, 건물 전체를 일괄 임대하는 등 분명하지 않으면 「구분 불분명」을 선택합니다 (국세청 부동산거래관리과-119).` |
| MB-13 (모드) | 담보차입금 | `bgMortgageAttribution` | `…담보차입금 300,000,000원이 주택·상가 중 어디에 속하는지 선택하세요. 근저당이 건물 전체에 설정되어 대상이 분명하지 않으면 「구분 불분명」을 선택합니다.` |
| MB-13 (합) | `split` 합 ≠ 총액 | `bgDepositSplitHousing` / `bgMortgageSplitHousing` | `{label}: 임대보증금 귀속 합계(주택 300,000,000 + 상가 100,000,000 + 구분 불분명 0 = 400,000,000원)가 임대보증금 총액(500,000,000원)과 다릅니다 — 100,000,000원이 배분되지 않았습니다.` 초과면 「…원을 초과해 배분했습니다」 |
| MB-14 | `B_c' > C_c` (또는 주택) | 아래 규칙 | `{label}: 상가로 보는 채무액(250,000,000원 = 상가 귀속 200,000,000 + 구분 불분명 안분 50,000,000)이 상가 부분의 증여가액(200,000,000원)보다 큽니다. 채무 귀속을 다시 확인하세요 — 구분 불분명 채무는 자동으로 다시 나누지 않습니다.` |
| MB-10 | 합계 `B > C` | `bgLendingDepositTotal` | 기존 문구 재사용 |

- MB-14 점프 규칙(결정적): 초과한 부분에 **0이 아닌 귀속이 들어간 항목**을 찾아 첫 번째(담보차입금 → 임대보증금 순)의 모드 field로 보낸다. 없으면 `bgDepositAttribution`.
- 합 일치 검사의 숫자는 `toLocaleString("ko-KR")` + 「원」은 문장 속에서만(`feedback_no_won_suffix`는 표 칸에 해당 — 오류 문장은 단위가 필요하다).
- MB-14는 4부분 기준시가·시가 총액이 모두 있어야 C_h를 알 수 있다 → ⑧ 순서는 V-3·V-4(4부분 필수)를 **먼저**, MB-13을 다음, MB-14를 마지막에 둔다(§6.6).

**알려진 한계 (Q-11)**: 항목 단위 귀속이므로 대출이 여러 건이라 건마다 귀속이 다른 경우는 「나누어 입력」으로 표현한다. 임대보증금을 주택·상가에 걸쳐 일괄 임대한 경우는 「구분 불분명」이다 — 이 경우 안분은 해석례가 답하지 않은 부분(V-17)이라 카드 안내에 「확인 필요」를 병기한다.

---

## 6. 동기화 지점별 변경안 (UI 소관 ①~⑧ + ④·⑬ 규약)

### 6.1 ① 폼 상태 · ② initial · ③ normalize — **신규 필드 8개** (R2 — 초판의 「변경 0」은 낡았다)

| 지점 | 위치 | 변경 |
|---|---|---|
| ① | `lib/stores/calc-wizard-asset-bg.ts` `BurdenedGiftFormSlice`(158줄) | §5.6의 8필드. 모드 2개는 `"" \| "housing" \| "commercial" \| "unallocated" \| "split"`, 분할 6개는 `string` |
| ② | `lib/stores/calc-wizard-asset-factory.ts:483-486`(`bgLendingDepositTotal`… 바로 아래) | 8개 모두 `""` |
| ③ | `lib/stores/calc-wizard-asset-migrate-phase3.ts:190-200`(Phase 3 `=== undefined → ""` 패턴) | 8개 `if (a.x === undefined) a.x = ""`. 선례 주의: `bgMortgageSetAmount`는 `migrate*.ts`에서 **grep되지 않는다**(factory에만 있다) — 신규 8필드는 규약대로 normalize를 **반드시** 추가한다(`feedback_new_asset_field_stale_sessionstorage_guard`) |

- 겸용 × BG는 종전에 막혀 있어 sessionStorage에 유효한 저장본이 없다 → 별도 마이그레이션 로직(`calc-wizard-migration.ts`)은 필요 없고 normalize 폴백이면 충분하다.
- `housing-flag-reset.ts`는 BG 필드를 건드리지 않는다(`:69`는 신축 필드뿐) — 자산 종류를 바꿔도 귀속 값이 보존된다. ④가 겸용일 때만 읽으므로 무해하다.
- 사이드바·결과가 읽는 `computeTransferSummary`(`calc-wizard-store.ts:485-549`)는 화면 소비처가 없다 — 무변경.

### 6.2 ④ API 변환 · ⑬ body spread

- `lib/calc/transfer-tax-api.ts`: 겸용이면서 BG일 때 `burdenedGiftInfo`(`:636`)와 `mixedUse`(`:693`)를 **함께** 보낸다. 지금은 겸용 분기가 BG 분기를 묵시적으로 배타 처리하는지 **확인 필요**(`buildPrimaryContext`가 `bgInfo`를 만들지만 `isMixed`에서 버리는지 — `transfer-tax-api-primary-context.ts`를 열지 못했다).
- `buildBurdenedGiftInfo`(`transfer-tax-api-burdened-gift.ts`)의 housing 폴스루(총액을 `buildingStdPrice*`에 통째로)는 겸용에서 `standardPriceAtTransfer/AtAcq` 대신 **leaf의 `total`**을 읽는다. 겸용 분기 1개(약 8줄) 추가.
- §4의 stale 가드 목록을 `buildMixedUsePayload`(`transfer-tax-api-mixed-use.ts`)에서 BG일 때 비운다.
- `transferPrice` placeholder(채무 합, `:233-236`)는 **겸용에서도 그대로 유지**한다 — 엔진이 무시하고 B로 덮어쓴다(엔진 E-7 **확정**, 단건 STEP 0.48과 같다). 현재 세액 0은 「placeholder가 양도가액으로 쓰이고 취득가액은 미스케일」이기 때문이다(엔진 §1.2 실측).
- **`debtAttribution` 합성(R2)**: `buildBurdenedGiftInfo`에 겸용 분기를 두어 `mixedBgDebtAttribution(primary)`(§5.1)의 `{housing, commercial, unallocated}`를 `burdenedGiftInfo.debtAttribution`에 싣는다. **명시 필드 매핑**(spread 아님 — `feedback_explicit_prop_mapping_strip`). 겸용이 아니면 키 자체를 싣지 않는다. `issues`가 남아 있으면 ⑧이 먼저 막으므로 ④는 도달하지 않는다.
- **취득 플래그 파생**: 엔진 문서 §3.6 ④대로 `resolveMixedBgAcquisition`(§5.1 leaf에 동거)이 K-방식에서 `useActualAcquisition`/`useAppraisalSalesAcquisition`/`acquisitionActualTotalPrice`를 파생한다. 폼의 겸용 취득 플래그 stale 값은 읽지 않는다(§4).

### 6.3 ⑤ UI 위젯 — §5

### 6.4 ⑥ 사이드바

`lib/stores/transfer-per-asset-summary.ts`가 정본이다(`computeTransferSummary`는 화면 소비처가 없다 — `components/calc/CLAUDE.md`. **엔진 문서 §3.6 ⑥은 `computeTransferSummary`라고 적었으나 화면 소비처는 per-asset 쪽이다** — §16 #6).

| 항목 | 현재 | 변경 |
|---|---|---|
| 양도가액 | **BG 단건은 계산 전후 모두 「-」**: `:372` `salePrice = parseRaw(a.actualSalePrice)`가 BG에서 빈 값이고 BG 결과를 읽는 분기가 없다(코드로 확인, 브라우저 미확인) | 겸용×BG: 계산 전 `salePending=true`(「계산 후 표시」), 계산 후 **엔진 echo `burdenedGift.perPart` 4부분 양도가액 합**을 표시(엔진 E-12 확정). 클라이언트에서 채무액·비율을 재계산하지 않는다(dual-truth) |
| 양도가액 **보조 문구** | `renderSidebarAmount`의 `note`(`TransferSidebarSummary.tsx:44-48` — 「기준시가 안분」·「지분 N%」) | **귀속으로 한쪽 양도가 없는 경우** `TransferAssetSummaryRow`에 `saleTransferNote?: string` 추가: 「주택분 양도 없음 (채무 귀속: 상가)」 / 「상가분 양도 없음 (채무 귀속: 주택)」. 계산 전에는 입력(귀속 모드가 `housing`/`commercial`뿐이고 불분명·분할이 없을 때)에서, 계산 후에는 `perPart[*].transferred`에서 같은 leaf로 만든다 |
| 채무비율 | 사이드바는 비율을 표시하지 않는다 | **표시하지 않는다.** 비율이 둘(주택분·상가분)이 되었으나 사이드바는 금액 요약 자리이고 비율은 결과 카드 §6.5가 소유한다. 단일 「채무비율」 칸을 새로 만들지 않는다 |
| 취득가액 | 겸용: `mixedUseDisplayedAcqPrice(mixedResult)`(`:401-404`) | BG면 계산 전 `acqPending=true`. 계산 후는 **같은 함수** — 엔진 E-2 확정: `housingPart`/`commercialPart`의 값은 **채무비율 적용 후 B-slice**이므로 성립한다 |
| 필요경비 | 겸용: 개산공제 4항 합(`:531-537`) | BG면 계산 전 pending. 계산 후 같은 식(엔진 echo가 채무비율 적용 후 값이라 성립) |
| 가드 | `isPlainLumpSumAsset`(`:123-136`)·`canPreviewEstimated`(`:283-285`)가 이미 `transferType !== "burdened_gift"`로 BG를 제외 | 변경 없음 — 계산 전 프리뷰가 BG 겸용에 새지 않는다 |

**BG 단건 사이드바 양도가액 「-」는 겸용과 무관한 선재 갭**일 가능성이 높다. 겸용 작업에 묶어 BG 전반을 고칠지는 Q-7. 이 설계는 **겸용 분기만** 고친다(Surgical Changes).

### 6.5 ⑦ 결과 — 결과뷰 4곳 각각

**결과뷰는 4개다**(메모리 `feedback_transfer_result_view_is_not_one`). 단건 겸용의 종착지는 `MixedUseResultCard`(`app/calc/transfer-tax/TransferTaxCalculator.tsx:456-458`)다.

| 결과뷰 | 겸용×BG(P1) 도달? | 조치 |
|---|---|---|
| `MixedUseResultCard` | **예 — 유일한 종착지**(route `mode:"mixed-use"`, `route.ts:612`) | 아래 배선 전부 |
| `TransferTaxResultView`(단건 `mode:"single"`) | 아니오 | 변경 없음. 회귀 anchor만 |
| `BundledAllocationCard`(일괄·일반건물) | 아니오(P1 단건 한정) | 변경 없음 |
| `MultiTransferTaxResultView`(다건 합산) | 아니오 | 변경 없음 |

**`MixedUseResultCard` 배선 (모두 필요 — 하나라도 빠지면 조용히 사라진다)**

| # | 대상 | 파일:줄 | 조치 |
|---|---|---|---|
| R-1 | 어댑터 | `components/calc/results/mixed-use/MixedUseResultCardAdapter.ts` `mixedUseToFilingResult` | `transferBurdenedGiftBreakdown: b.burdenedGift`를 **명시 필드로** 통과시킨다. 이 어댑터는 화이트리스트라 echo를 싣지 않으면 **침묵 strip**된다(파일 헤더 주석 · 같은 원리의 선례 `MixedUseResultCard.tsx:98`) |
| R-2 | 신고서 표 | `FilingFormTable.tsx:37-50`(배지 「§159 채무비율 안분」) | R-1이 되면 배지·툴팁이 자동으로 뜬다. `FilingFormTableHelpers.ts:236` `resolveBgSingleDisplay(result)`는 **`mixedUseDetail`이 있으면 `undefined`를 돌려준다**(`DetailedStatementBgFormulas.ts:110`) → 겸용 4열의 양도가액·취득가액·필요경비 행은 엔진 echo(`mixedUseDetail`)로 이미 채워지므로 **그 값이 채무비율 적용 후 값인지**(§11 E-2)만 확인한다 |
| R-3 | 상세명세서 | `DetailedStatementHelpers.ts:150-155`·`:277-288` | `resolveBgSingleDisplay`가 겸용을 제외하므로 `transferPrice` 산식(`:277`)은 BG 문구가 나오지만 **취득가액·필요경비 산식은 일반 문구로 떨어진다.** 신규 `DetailedStatementBgMixedFormulas.ts`(≈120줄)로 4부분 산식을 만들고 `DetailedStatementHelpers.ts`에는 분기 1줄만. **이 파일은 751줄 — 위험구간**이라 열면 깊게 분리한다(파일 크기 정책의 기회주의적 분리) |
| R-4 | 계산 본문 | `MixedUseCalculationSections.tsx:233-271`(① 양도가액 안분) · `:109` 등 취득가액 행 | `breakdown.burdenedGift`가 있으면 ① 앞에 **「부담부증여 — 채무 귀속과 양도가액·취득가액 산정」 섹션**을 신설(신규 컴포넌트 `MixedUseBurdenedGiftSection.tsx`). **채무비율이 주택분·상가분 둘**이므로 `debtAttribution.housingRatio/commercialRatio`를 읽는다(단일 `debtRatio`는 쓰지 않는다 — R-6). `:271`의 「총 양도가액 - 주택 양도가액」 라벨은 BG에서 「양도로 보는 채무액 합계 - 주택분 양도로 보는 채무액」. 취득가액·개산공제 행(`:364` 「× 3%」)은 BG에서 「× 해당 부분 채무비율」 항을 포함해 **적힌 산식이 적힌 값을 만들게** 한다 |
| R-5 | 증여세 신고서(별지 제10호) | `components/calc/results/transfer/BurdenedGiftFilingFormSection.tsx`(`hasBurdenedGiftFilingForm`) | `MixedUseResultCard`에 `<PrintSection id="gift-filing-form">`으로 같은 컴포넌트 렌더. 화면 게이트와 `availablePrintIds`가 **같은 술어**를 부르게 한다 |
| R-6 | 부담부증여 상세 카드 | `BurdenedGiftDetailCard.tsx` (`perAsset.land/building` 2부분 구조) | 평가 명세(보충적·담보·임대 Max · 채무비율 · 증여세)는 물건 단위라 **재사용 가능**. 단 `propertyType` 라벨표(`:60-69`)에 겸용 항목이 없다 → 「겸용주택」 추가, `perAsset` 2부분 표는 겸용에서 숨기거나 4부분으로 대체(E-3) 또한 `TransferBurdenedGiftBreakdown.debtRatio`는 **단일 값(물건 전체 B/C)** 이다 — 귀속이 한쪽이면 어느 부분의 비율도 아니므로 겸용에서는 이 행을 숨기고 `debtAttribution`의 부분별 비율로 대체한다(엔진 확인 §16 #5). |
| R-7 | 선택 출력 | `lib/print/mixed-use-print-sections.ts:35-39` | `MixedUsePrintSectionId`에 `"burdened-gift"`·`"gift-filing-form"` 추가, `MIXED_USE_PRINT_SECTIONS`에 leaf 등록, `MixedUseResultCard.tsx:56-60` `availablePrintIds`에 조건부 추가. **테스트도 함께**: `__tests__/print/mixed-use-print-sections.test.ts` · `filing-form-first-row.anchor.test.ts`(메모리 `feedback_print_leaf_add_unit_test_sync`) |
| R-8 | 총 납부세액 표기 | `MixedUseTotalTaxSection.tsx` (228줄) | 증여세가 같은 화면에 뜨므로 합계에 **「양도세분」 한정 표기**(`TransferTaxResultView.tsx:418`의 `totalScopeNote: "양도세분"` 선례) |
| R-9 | 경고 | `MixedUseCalculationSections.tsx` `CalculationWarningsCard` | 변경 없음(엔진 `warnings`가 §159 안내를 싣는지는 E-11) |
| R-10 | **「양도 없음」 표시** | `MixedUseCalculationSections.tsx:199-215`(「1세대 1주택 비과세: 적용 …」 배너) · 12억 행(`:385-411` `highValueRule` 분기) | 엔진은 한쪽 양도가 없어도 내부 `isExempt`를 true로 남길 수 있다(엔진 §3.1A M-8 실측). **`burdenedGift.perPart[*].transferred`와 `highValue.applicable`로 게이트**해서 양도 없는 부분을 「비과세」로 그리지 않는다. 문구는 아래 「양도 없음 문구 초안」 |
| R-11 | 신고서 열 | `FilingFormTableHelpers.ts:256` `setRoseNote` / `roseNotesMap` | 양도 없는 부분의 양도가액 행에 「양도 없음 (채무 미귀속)」 note. 값은 `—`(0이 아니다) |
| R-12 | 상세명세서 | `DetailedStatementBgMixedFormulas.ts`(신규, R-3) | 부분별 한 줄 산식 + 양도 없는 부분은 산식 대신 「양도 없음」. 항등식 `양도가액 − 취득가액 − 필요경비 = 양도차익`을 4부분 합으로 anchor(엔진 §3.8) |

**증여세 계산기 쪽 `BurdenedTransferTaxResultCard`**(`GiftTaxResultView.tsx:461`)는 이 작업의 **범위 밖**이다 — 증여세 계산기의 부담부증여 연동은 `land|housing|building`만 만든다(`lib/calc/gift-burdened-transfer-api.ts:66-79`)이고 겸용 축이 없다.

**산식 문구 초안** (`R-4` 신설 섹션 · 모두 한국어 풀어쓰기, 숫자 옆 변수명, `Frac` 컴포넌트, 화면 리터럴 `÷`·`floor`·`A/B/C` 금지)

```
① 부담부증여 — 채무 귀속과 양도가액·취득가액 산정 (소득세법 시행령 §159)

채무 귀속 (국세청 부동산거래관리과-119, 2010.1.22.)
  주택 귀속 채무 {…}  ·  상가 귀속 채무 {…}  ·  구분 불분명 채무 {…}
  구분 불분명 채무 안분   주택 = 구분 불분명 채무 {…} × Frac(주택분 증여가액 {…}, 증여가액 {…})   {…}
                          상가 = 구분 불분명 채무 {…} − 주택 몫 {…}                            {…}     ※ 안분 방식은 해석례가 직접 답하지 않아 확인이 필요합니다
  주택분 양도로 보는 채무액 = 주택 귀속 채무 {…} + 구분 불분명 안분 {…}                           {…}
  상가분 양도로 보는 채무액 = 상가 귀속 채무 {…} + 구분 불분명 안분 {…}                           {…}

증여재산 평가 (상증법 §60~§66)
  보충적평가액 = 개별주택공시가격 {…} + 상가 부수토지 기준시가 {…} + 상가건물 기준시가 {…}        {합계}
  [시가 모드] 증여가액 = 양도시 시가 평가액 {…} (상증법 §60②)
  주택분 증여가액 {…}  ·  상가분 증여가액 {…}                    ← 시가 모드는 양도시 기준시가 비율로 나눈 값(소령 §166⑥)

채무비율
  주택분 = Frac(주택분 양도로 보는 채무액 {…}, 주택분 증여가액 {…})                              {00.00%}
  상가분 = Frac(상가분 양도로 보는 채무액 {…}, 상가분 증여가액 {…})                              {00.00%}

양도가액   주택분 = 주택분 양도로 보는 채무액 {…}   ·   상가분 = 상가분 양도로 보는 채무액 {…}   (토지·건물 몫은 아래 ②에서)
취득가액
  [기준시가]       부분별 취득시 기준시가 {…} × 그 부분의 채무비율                (소령 §159①1호 괄호)
  [실지]           부분별 실지취득가액 {…} × 그 부분의 채무비율                    (소득세법 §97①1호가목)
  [환산]           부분별 양도가액 {…} × Frac(취득시 기준시가 {…}, 양도시 기준시가 {…})   (시행령 §176의2②2호 — 채무비율을 다시 곱하지 않음)
  [매매사례·감정]  부분별 매매사례가액·감정가액 {…} × 그 부분의 채무비율
개산공제 [환산·매매사례·감정]  부분별 취득시 기준시가 {…} × 그 부분의 채무비율 × 개산공제율 {…}
```

- 「양도가액 = 양도로 보는 채무액」인 이유: v1은 보충적평가(또는 시가)가 증여가액을 정하는 경우만 허용하므로(MB-7) 평가액 = 증여가액이고 `평가액 × 채무비율 = 채무액`이다. 평가액 × 비율 형태로 쓰면 독자가 다른 값을 곱한다고 읽을 수 있어 **채무액을 직접 쓴다**.
- 「주택분 증여가액」 산출 식(엔진 §3.1 vs §3.1A가 기준시가 모드에서 약간 다르게 적혀 있다)은 엔진 echo의 값만 표시하고 산식 문구를 단정하지 않는다(§16 #4).
- 「안분 결과」 행(주택 양도가액 · 상가 양도가액)은 기존 ① 섹션을 **그대로** 쓰고 라벨만 바꾼다.
- 개산공제율은 엔진 echo(`estimatedDeductionRate`)에서 읽는다(`types/transfer-burdened-gift.types.ts` perAsset 주석 참조). 표시층이 「× 3%」를 다시 적지 않는다(미등기 3/1000에서 거짓 등식이 된다).

**「양도 없음」 문구 초안 (R-10 — 「비과세」로 읽히지 않게)**

| 위치 | 조건 | 문구 |
|---|---|---|
| 부분 배지(채무비율 표·계산 본문·신고서 열) | `perPart[*].transferred === false` | **「양도 없음」** (회색 `bg-slate` 배지 — 비과세 emerald 톤을 쓰지 않는다) |
| 배지 아래 한 줄 | 〃 | 「이 부분에는 인수 채무가 귀속되지 않아 양도로 보지 않습니다(소득세법 제88조 제1호 후단 — 채무액에 해당하는 부분만 양도). 이 부분의 무상 이전분은 수증자의 증여세 대상입니다.」 |
| 1세대1주택 줄(`:199-215`) | 주택분 양도 없음 | 「주택분: 양도 없음 — 1세대1주택 비과세·12억 판정의 대상이 아닙니다」 (현재 「1세대 1주택 비과세: 적용 …」 문장을 **렌더하지 않는다**) |
| 12억 판정 행 | `highValue.applicable === false` | 「고가주택 판정: 해당 없음 (주택분 양도 없음)」 |
| 상가 쪽 | 상가분 양도 없음 | 「상가분: 양도 없음 — 채무가 주택에 귀속되어 상가의 양도소득이 없습니다」 |
| 신고서 열 note | 〃 | 「양도 없음 (채무 미귀속)」 |
| 사이드바 | `saleTransferNote` | 「주택분 양도 없음 (채무 귀속: 상가)」 |
| 총 납부세액 아래 | 항상(겸용 BG) | 「양도세분 (증여세는 수증자가 별도 신고·납부)」 — R-8 |

- **절대 쓰지 않는 말**: 「비과세」·「감면」·「유리」·「절세」(양도 없는 부분은 비과세가 아니라 과세 대상 양도가 없는 것이다 — 세법 용어 오독 방지, 루트 정책 「납세자 유리/불리 표현 금지」).
- 배율 초과 비사업용 토지분은 양도 없는 주택분이어도 **토지 몫이 양도로 잡힐 수 있다**(엔진 M-16) — 그때는 「양도 없음」 배지를 달지 않고 엔진 `transferred`가 true인 부분만 일반 표시한다(echo를 믿고 UI가 판단하지 않는다).

### 6.6 ⑧ Validation — 규칙표 (R2)

`validateAssetAcquisition`의 순서(`lib/calc/transfer-tax-validate-acquisition.ts`): 용도변경(`:128`) → **BG(`:132`)** → … → 이월과세(`:259-349`, 끝에서 `return null`) → **겸용(`:355-357`)**. 겸용 분기가 BG 뒤에 오므로 BG 통과 후 `validateMixedUseAsset`이 돈다 — 그런데 그 함수는 **BG에서 화면에 없는 칸**(`fixedAcquisitionPrice`·`useEstimatedAcquisition`·`mixedAcq*` 총액 안분 블록)을 요구한다(`validate-mixed-use-asset.ts:84` 총액 안분 블록 · `:135` 환산 취득시 요구). 그대로 두면 **막다른 길**이다.

⇒ 겸용 분기를 갈라 `isMixedBurdenedGift(asset)`이면 신규 `validateMixedUseBurdenedGift`로 보낸다 (`transfer-tax-validate-acquisition.ts:357`(`return validateMixedUseAsset(…)`) 한 줄 + 신규 파일 `lib/calc/transfer-tax-validate-mixed-use-bg.ts` ≈150줄. validate-acquisition은 763줄 위험구간이라 본문을 늘리지 않는다). **엔진 문서 §3.6 ⑧의 「기준시가는 `validateMixedUseAsset` 소관」과 다르다**(§16 #2).

| # | 규칙 | field(점프) | 비고 |
|---|---|---|---|
| V-1 | UI P1 좁힘 `bgMixedUseBlock`(X-5~X-8·X-14·X-15) → 오류 | §3 표의 field | **BG 공통 검증보다 앞**(`validate-bg.ts:116`의 (1-a) 자리를 대체) |
| V-2 | 공통 날짜 · 토지 취득일 · 면적 | 기존(`validate-mixed-use-asset.ts:36-48`, `validateMixedUseAreas`) | 공용 부분을 `validateMixedUseCommon`으로 분리해 양쪽이 호출 |
| V-3 | 양도시 4부분 필수(개별주택공시가격 · 개별공시지가 · 상가건물 · 주택건물 나목) | `mixedTransferHousingPrice` · `mixedTransferLandPricePerSqm` · `mixedTransferCommercialBuildingPrice` · `mixedTransferHousingBuildingStdPrice` | 기존 문구 재사용(`validate-mixed-use-asset.ts:49-63`). **시가 모드에서도 필수**(안분 비율) |
| V-4 | **취득시 4부분 항상 필수** | `mixedAcqHousingPrice` · `mixedAcqLandPricePerSqm` · `mixedAcqCommercialBuildingPrice` · `mixedAcqHousingBuildingStdPrice` (토지·건물 취득일이 다르면 `mixedAcqLandPricePerSqmAtBuildingAcq`) | K-1~3 분자 · K-4 안분 비율(법 §100②) · K-5 분자 · K-6/K-7 개산공제 base. 엔진 MB-11과의 대조는 §16 #3 |
| V-5 | K 방식별 금액 | `bgActualAcquisitionTotal` 등 기존 `validate-bg.ts:193-` | 겸용에서도 `assetKind==="housing"` 분기라 그대로 통과 |
| V-6 | ❌ 요구하지 않는 것 | | `standardPriceAtTransfer` · `standardPriceAtAcq`(U-1·U-2로 술어가 꺼짐 → `validate-asset.ts:313-316`·`validate-bg.ts:375`가 자동 면제) · `fixedAcquisitionPrice` · `useEstimatedAcquisition` · `similarSalesValue`(stale 값이 있어도 무관) |
| V-7 | **MB-10** 합계 `B > C` | `bgLendingDepositTotal` | 시가 모드는 기존 `validate-bg.ts:327-345`. 기준시가 모드는 엔진 collector로 **사전 차단**(E-9 확정 — C는 클라이언트에서 `computeSangjeungbeopValuation`으로 계산 가능) |
| V-8 | **MB-7** 담보·임대 평가가 보충적평가를 이김 | `transferType` | 엔진 collector. 문구: 「담보채권액·임대료 환산 평가가 보충적평가액보다 커서 증여가액을 부분별로 가를 수 없습니다 — 이 조합은 계산하지 않습니다」 |
| V-9 | **MB-13(모드)** 총액>0 인데 귀속 모드 `""` | `bgDepositAttribution` / `bgMortgageAttribution` | §5.6 문구. **기본값 없음** |
| V-10 | **MB-13(합)** `split` 합 ≠ 총액 | `bgDepositSplitHousing` / `bgMortgageSplitHousing` | §5.6 문구 |
| V-11 | **MB-14** `B_h'>C_h` 또는 `B_c'>C_c` | §5.6 규칙(담보차입금 → 임대보증금 순) | **V-3·V-4·V-9·V-10 통과 후**에만 판정(C_h는 4부분·귀속이 모두 있어야 계산) |
| V-12 | MB-1 증여일 < 2022-01-01 | `transferDate` | 엔진 문구(「단일 자산 모드」 안내 제외) 그대로 |

**3중 패턴 점검**: 표시(`BurdenedGiftMixedUsePanel`·귀속 카드) · 전송(④) · 요구(⑧) 모두 `mixedTransferStdTotal`/`mixedAcqStdTotal`의 `missing`과 `mixedBgDebtAttribution`의 `issues`를 본다. ⑧이 UI가 숨기거나 안 보여 주는 칸을 요구하는 경로가 없다(V-6). 귀속 합성값은 ④가 보내는 값과 ⑧이 검사하는 값이 **같은 함수의 같은 반환**이다.

### 6.7 ⑫⑭ (엔진 시니어 협의 — UI가 요구하는 것만)

- ⑫ `transfer-tax-schema-refines.ts:310-318`: 「겸용 × BG 전면 차단」을 엔진 `collectMixedBurdenedGiftIssues`(MB-1~14)로 **교체**(엔진 §3.6 ⑩ 확정). path는 §3 표의 field 이름과 같게 한다(⑧ 점프와 API 오류의 일관성). 컴패니언 arm의 겸용×BG는 차단 유지(MB-6).
- ⑫ `burdenedGiftInfoSchema`는 필드 불변이되 `debtAttribution?`이 **겸용에서 필수 · 비겸용에서 거부**(엔진 §3.5). ④의 stale 가드(§4)가 없으면 이 거부가 400으로 나타난다.
- ⑭ route 5-a-2(`route.ts:535-613`)가 `burdenedGiftInfo`를 읽어 `buildMixedUseAssetInput`에 넘긴다(엔진 §3.6 ⑭ 확정 — Date 변환본 주의는 엔진 소관).

---


## 7. `BurdenedGiftBlock.tsx` 796줄 분리 계획 (R2 재계산)

현재 796줄 — 분리 트리거(800) 직전이다. 이 작업이 겸용 분기를 더하므로 **먼저 분리하고 그 위에 얹는다**(파일 크기 정책: 트리거 800 · 착지 ≤700).

자연 이음매는 주석 번호가 이미 그어 둔 섹션 경계다.

| 분리 대상 | 줄 | 줄수 | 신규 파일 | 이유 |
|---|---|---|---|---|
| 상수 3종(`VALUATION_MODE_OPTIONS`·`GIFT_STD_PRICE_FIELD`·`DONOR_RELATION_OPTIONS`) | `:75-161` | 87 | `burdened-gift-block-options.ts` | 순수 데이터. `GIFT_STD_PRICE_FIELD`는 R-6·U-4가 겸용 라벨을 추가하는 자리 |
| ③-b 이월과세 「당초 증여자」 박스 | `:471-594` | 124 | `BurdenedGiftCarryoverBlock.tsx` | props `asset·onChange·coDonorNeedsStdPrice`만. 겸용 P1은 X-7로 이 박스에 도달하지 않음 |
| ⑤ 증여세 통합(§53·§56·§57·§69) | `:664-746` | 83 | `BurdenedGiftDonorTaxBlock.tsx` | props `asset·onChange`만 |

**줄 수 재계산 (귀속 입력 추가 후)**

| 항목 | 줄 |
|---|---|
| 분리 직후 `BurdenedGiftBlock.tsx` | 796 − (87+124+83) + import·호출 약 20 = **≈522** |
| + U-4(④ 겸용 분기·K-4 라벨·K-5 안내 분기) | +25 |
| + U-11(귀속 카드 마운트 — **카드 본체는 신규 파일이라 마운트 6줄만**) | +6 |
| + U-12(⑥ 미리보기 겸용 라벨) | +8 |
| **착지** | **≈561 ≤ 700 ✓** (귀속 입력을 추가해도 본체는 +6줄이다) |

- **귀속 UI를 본체에 쓰면 안 되는 이유**: `DebtAttributionRow` 2회 + 안내 + 분할 3칸 + 남은 금액 표시로 약 120~150줄이다. 본체에 인라인하면 ≈690으로 700 직하다 — 신규 파일로 빼 마운트 6줄만 남긴다.
- **더 쪼개지 않는다**: ③ 시가 모드(`:343-390`)·K-4(`:402-469`)·④(`:606-662`)는 겸용 분기가 걸리는 자리라 한 파일에 응집해 두는 편이 읽기 쉽다. 약 500 이하로 무리하게 내리는 것은 과분할이다.
- **신규 파일 줄 수 예상(전부 ≤700)**: `BurdenedGiftDebtAttributionCard.tsx` ≈150 · `BurdenedGiftMixedUsePanel.tsx` ≈170(요약 + 부분별 채무비율 표) · `burdened-gift-mixed-use-scope.ts` ≈150 · `transfer-tax-validate-mixed-use-bg.ts` ≈150 · `MixedUseBurdenedGiftSection.tsx` ≈180 · `DetailedStatementBgMixedFormulas.ts` ≈130.
- **export 보존**(메모리 `feedback_800line_split_export_preservation`): `BurdenedGiftBlock`의 공개 export·`data-testid`(`bg-gift-building-std`·`bg-codonor-*`)·`data-field`를 그대로 유지한다. 분리 직후 `__tests__/components/burdened-gift-*.anchor.test.tsx` 전부를 먼저 돌려 **무변경 분리**를 확인하고 나서 겸용 분기를 얹는다(분리 커밋과 기능 커밋을 나눈다).

그 밖에 이번 작업이 여는 파일 중 위험구간: `DetailedStatementHelpers.ts` 751줄 · `FilingFormTableHelpers.ts` 727줄 · `transfer-tax-validate-acquisition.ts` 763줄 · (엔진 쪽) `transfer-tax-mixed-use.ts` 727줄. 앞의 셋은 신규 sibling 파일(R-3·R-2·⑧)로 분기만 위임한다.

---

## 8. 함께양도(컴패니언) · 공유지분 · 별개 취득 — 범위 제안

### 8.1 현황 (코드 확인)

- **컴패니언 겸용은 이미 열려 있다**(일반 양도): 파트 카드 5장 되먹임(`transfer-tax-validate.ts:222` 주석 · `app/api/calc/transfer/mixed-use-part-cards.ts` · `bundled-split-helpers.ts`). `SINGLE_ONLY` 목록은 비어 있다(`transfer-tax-validate.ts:220` 선언 · `:313` 루프).
- **컴패니언 부담부증여도 열려 있다**(2026-09-03): 채무를 자산가액 비율로 재배분(`BurdenedGiftBlock.tsx:62-72` `isCompanionBundle` · `transfer-tax-api-burdened-gift.ts` `apportionCompanionBurdenedGiftDebt`) + 「상증법 평가 승자 게이트」(`transfer-tax-validate.ts:324-`).
- 두 축의 **교차(겸용 컴패니언 × BG)** 는 위 어느 경로도 지원하지 않는다. 현재는 per-asset ⑧ (1-a)가 자산 단위로 막고 있다.

### 8.2 제안

| 범위 | P1 | 근거 |
|---|---|---|
| 단건(자산 1건) · 단독 소유 · 매매 | ✅ | |
| 컴패니언(자산 2건+) | ❌ → P2 | 자산가액 비율 재배분(Aᵢ)에 겸용 자산의 **4부분 합**이 필요하고, 승자 게이트(`:324`)가 자산별 C를 요구한다. 파트 카드 5장 × BG 증여세 echo 합류까지 엔진·route가 큼 |
| 공유지분 < 100% (축 A) | ❌ → P2 | 채무는 「지분 인수분」, 기준시가는 「물건 100%」로 입력 규약이 반대(`BurdenedGiftBlock.tsx:178-185`, `buildMixedUsePayload`의 절대금액 스케일 표 `transfer-tax-api-mixed-use.ts`) — 겸용 4부분 스케일과 BG 채무 스케일이 한 화면에서 섞인다 |
| 지분 분할(축 B) | ❌ → P2 | 위와 같고, 카드마다 취득일이 달라 `BurdenedGiftTrancheBasisBlock`(`:26-35`)의 병합 규칙이 겸용을 모른다 |

**귀속 입력과의 관계(R2)**: 컴패니언은 자산마다 채무가 따로 있고(`isCompanionBundle` 규약) 신고 단위 총채무가 자산가액 비율로 **재배분**된다(`BurdenedGiftBlock.tsx:62-72`). 귀속(주택/상가)은 이 재배분 **뒤** 자산 내부의 선언이라 순서·정본이 아직 정의되지 않았다 — 엔진 MB-6이 막으므로 P2 설계 때 같이 정한다.

**P2로 가도 UI 구조는 이 설계를 유지**한다: `isMixedBurdenedGift` 술어와 요약 패널은 자산 단위라 컴패니언 카드에서 그대로 재사용된다. 달라지는 것은 ⑧의 `contractAssumedDebtTotal` 경로와 요약 패널의 「이 자산 몫」 문구뿐이다.

차단 사유 문구(X-14·X-15)는 「지원 예정」이라 쓰지 않는다(`feedback_capability_notice_list_goes_stale`) — 사유만 적는다.

---

## 9. 테스트 계획

### 9.1 RTL (`.test.tsx` — 컴포넌트를 렌더하는 `.test.ts`는 jsdom이 없어 실패한다, CLAUDE.md)

`__tests__/components/burdened-gift-mixed-use-input-path.anchor.test.tsx` (신규)

| ID | 단언 | 반증 대조군 |
|---|---|---|
| BGM-U1 | 겸용+BG 기준시가: `bg-mixed-valuation-summary` 존재 · `bg-gift-building-std` **부재** · `[data-field="standardPriceAtTransfer"]` **부재** · `bg-acq-std-price` **부재** | 같은 폼에서 겸용 OFF → 세 칸 모두 **존재**(일반 주택 BG 회귀) |
| BGM-U2 | 요약 합계 = 입력한 4부분의 합(주택 6억 + 단가 500만×상가토지 50㎡ + 상가건물 1억 → 합 검증), 값은 **원 단위 `toBe`** | 상가건물 칸을 비우면 `bg-mixed-valuation-missing`에 그 칸 이름 |
| BGM-U3 | 시가 모드+K-4: 라벨 「실지취득가액 — 주택·상가 전체」 · `bgActualAcquisitionTotal` 칸 존재 | |
| BGM-U4 | 막힌 조합(PHD ON stale)에서 **PHD 토글이 켜져 있으면 눌러서 끌 수 있다**(`aria-checked` 판정 — `e2e/CLAUDE.md` 6-2 `isChecked()` 금지) · 꺼진 상태면 `data-disabled` | `disabled`가 OFF 전이까지 막는 변형(뮤테이션)에서 실패해야 한다 |
| BGM-U5 | 취득원인 상속/증여/이월/신축 옵션: 현재값이 매매일 때 `radioValues(container,"acquisitionCause")`로 **value** 확인 + 해당 옵션 `disabled`(라벨 단언 금지 — CLAUDE.md 「선택지 anchor는 value를 본다」) | 현재값이 상속(stale)이면 매매 옵션은 눌린다 |
| BGM-U6 | `TransferModeBlock`: 지원 밖 조합이면 블록 대신 사유 카드, 지원 조합이면 amber 안내 + 블록 | |
| BGM-U7 | 안내 문구: 겸용이면 「② 양도정보의 '취득시 기준시가' 카드」 문장 **부재**(U-6) — 문구 변경은 역방향 grep(`feedback_display_string_change_needs_reverse_grep`) | |
| BGM-U8 | 귀속 카드: 임대보증금>0 이면 `radioValues(container,"bgDepositAttribution-<assetId>")`가 `["housing","commercial","unallocated","split"]`이고 **`checkedRadioValue`가 비어 있다**(기본값 없음) | 총액 0이면 해당 항목 행이 없다 |
| BGM-U9 | `split` 선택 시 3칸이 뜨고 「남은 금액」이 `총액 − 합`(원 단위 `toBe`) · 합이 맞으면 0 | 비분할 모드에서는 3칸 부재 |
| BGM-U10 | `split` 입력 후 `commercial`로 바꾸면 3칸 값은 store에 **보존**되지만 ④ payload에는 반영되지 않는다 | `split`으로 돌아오면 복원 |
| BGM-U11 | 한쪽만 귀속(상가만) → 부분별 표에 `bg-attr-not-transferred-housing` 배지가 있고 화면 텍스트에 「비과세」가 **없다**(부정형 + 대조군) | 주택 귀속(양도 있음)·1세대1주택이면 「비과세」 허용 — 문구가 **양도 유무**를 따라가는지 |
| BGM-U12 | 사이드바 note: 상가만 귀속이면 「주택분 양도 없음 (채무 귀속: 상가)」 | 전부 불분명이면 note 없음 |

### 9.2 ⑧·⑫·parity anchor (`.test.ts`)

`__tests__/calc/bg-mixed-use-scope.anchor.test.ts` (신규; 기존 `bg-mixed-use-block.anchor.test.ts` 계승)

- **S-1** 정상 시드(§9.4) → `collectStepIssues(0, form)`에 **이슈 0건**. 숨은 칸에 stale 값을 넣어도(`useEstimatedAcquisition:true`, `fixedAcquisitionPrice:""`, `standardPriceAtAcq:""`) 0건 — **막다른 길 방지 단언**.
- **S-2** 취득시 4부분 중 하나를 비우면 해당 field로 점프(`fieldOf(message)`), 이름·순서까지 `toBe`.
- **S-3** §3 격자: 조합(X-5~X-15) × {⑤ 술어, ⑧, ⑫ Zod}가 **같은 판정**. `burdened-gift-gate-parity.anchor.test.ts` 방식. ⑫는 `refineSplitAcquisitionInputs`처럼 refine만 떼어 호출.
- **S-4** ④ 요약 leaf의 `total` = ④ payload의 `buildingStdPriceAtTransfer` = (엔진 echo `sangjeungbeopValuation.supplementary`) — **UI 표시값 ≡ 엔진 입력 ≡ 엔진 echo**. 엔진 echo가 생긴 뒤에야 쓸 수 있다(E-2).
- **S-5** stale 가드: BG 겸용 ④ body에 §4 목록의 키가 **존재하지 않는다**(`Object.keys`로 부정형 + 대조군: 일반 양도 겸용은 존재).
- **S-6** 대조군: 일반 주택 BG는 `standardPriceAtTransfer` 요구 유지.
- **S-7 (귀속 합성)** `mixedBgDebtAttribution` 격자 — 두 항목 × 모드 5종 × 금액(0/양수): 비분할 모드의 `housing+commercial+unallocated`는 **언제나 두 총액의 합과 같다**(속성). `split` 불일치는 `SPLIT_MISMATCH`, 모드 `""`는 `MODE_MISSING`이며 어느 버킷에도 넣지 않는다.
- **S-8 (⑧ 순서·점프)** 엔진 M-14·M-15 시드(F2 본문 + 비고가 · 상가 귀속 5억 > 상가분 증여가액 / 주택 귀속 749,999,999 + 불분명 1억)를 UI 폼으로 재현 → 오류가 MB-14이고 field가 §5.6 규칙대로다. 귀속 미선택 시드는 MB-13이 MB-14보다 **먼저**.
- **S-9 (UI ⊂ 엔진)** §3.2 격자 — UI 허용 조합 전부에서 엔진 `collectMixedBurdenedGiftIssues`가 이슈 0.
- **S-10 (stale 가드)** 겸용 BG ④ body에 §4의 거부 목록 9종(`giftBuildingStdPriceAtTransfer`·`actualLand/BuildingAcquisitionPrice`·`presumedLand/BuildingAcquisitionPrice`·`carryoverDonorBasis`·`rightValuation`·`assumedDebtOverride`·`presumedExtensionAppraisalValue`)이 **없다** — 시드에 일부러 stale 값을 넣는다. 대조군: 일반건물 BG는 해당 키를 싣는다. 이 가드가 빠지면 ⑫ 400이다.
- **S-11 (비겸용 격리)** 일반 주택 BG body에는 `debtAttribution`이 **없다**(⑫ 거부 대조).
- **S-12 (균일 특수해)** 두 항목 모두 `unallocated` → UI 폼 → ④ → route 통합 호출 결과가 엔진 M-1(25,125,000)과 **1원까지 같다**(엔진 M-10′ = M-1 회귀를 UI 경유로 재확인).

### 9.3 E2E (`e2e/transfer-bg-mixed-use.spec.ts` 신규 — **이 설계 단계에서는 실행하지 않는다**)

시드는 `e2e/burdened-gift-filing-form.spec.ts:22-60`과 같은 방식 — `sessionStorage["transfer-tax-wizard"]`에 `makeDefaultAsset(1)` 기반 자산을 주입 후 reload. 겸용 4부분은 `withMixedHousingStd`(`e2e/_helpers/mixed-housing-std-seed.ts`)로 나목 칸까지 채운다. ⚠️ 시드가 복원 정규화에 지워질 수 있다(`feedback_e2e_seed_erased_by_restore_normalization`) — **추가한 케이스를 직접 실행해 오류가 뜨는지 확인**한다.

| ID | 흐름 | 단언 |
|---|---|---|
| BGMU-1 | 겸용 + BG 기준시가 시드 → 계산 | 결과 화면 도달(`data-print-id="calculation"` 존재), 총 납부세액 > 0 (**0이면 실패** — 이번 작업의 존재 이유), `getByText("총 납부세액")` 금지(`e2e/CLAUDE.md` §3) |
| BGMU-2 | 결과에 §159 섹션 | `data-testid="mixed-bg-159"` 존재, 인수 채무액·증여가액·채무비율 값이 시드에서 손계산한 값과 일치 |
| BGMU-3 | 증여세 신고서 | `data-print-id="gift-filing-form"` 1건(C>B 시드 — `BGF-1` 주석처럼 채무가 평가액을 넘으면 `EXCESS_BURDENED_GIFT`로 계산 자체가 막힌다) |
| BGMU-4 | 총 납부세액 한정 표기 | 「양도세분」 문구 존재 |
| BGMU-5 | 선택 출력 | 출력 항목 선택 패널에 「증여세 신고서」·「부담부증여」 leaf 존재, `availableIds`와 화면 일치 |
| BGMU-6 | 필드 점프 | 막힌 조합 시드 → 계산 → 오류 클릭 → 해당 입력칸 포커스(`validation-field-jump-cases-mixed.ts`에 케이스 추가) |
| BGMU-7 | 사이드바 | 계산 전 양도가액·취득가액 「계산 후 표시」, 계산 후 값 표시 |
| BGMU-8 | 왕복 | BG → 일반 양도로 되돌리면 `fixedAcquisitionPrice` 칸이 복원되고 4부분 값이 보존됨 |
| BGMU-9 | **귀속 상가만**(시드: 보증금·차입금 모두 `commercial`, 엔진 M-8 동형) → 계산 | 결과에 「양도 없음」 배지(주택분) · 「1세대 1주택 비과세」 문장 **부재** · 총 납부세액 > 0 · 신고서 주택 열 note |
| BGMU-10 | **귀속 주택만**(엔진 M-9 동형, 1세대1주택·C_h ≤ 12억) | 주택분은 **비과세** 표시가 맞고 상가분은 「양도 없음」 — 두 문구가 **같은 화면에서 구별**된다 |
| BGMU-11 | 귀속 미선택으로 계산 시도 → 오류 클릭 | `bgDepositAttribution` 포커스(`e2e/_helpers/validation-field-jump-cases-mixed.ts`에 케이스 추가) |
| BGMU-12 | MB-14 시드(엔진 M-14) | 오류 + 귀속 카드로 점프, 계산 결과 화면 미도달 |

### 9.4 정상 시드 형태 (단언의 기준값 — **엔진 문서 §4 anchor를 UI 폼으로 재현**)

엔진 anchor는 **시가 모드 + K-4**(F1: 주택 100㎡·상가 100㎡, 시가 15억, 채무 6억, 실지취득 7억)를 쓴다. UI 시드는 `e2e/_helpers/validation-field-jump-cases-mixed.ts:14-39`의 `mixedAsset` 위에 다음을 얹는다: `bgValuationMode:"sangjeungbeop_market"` · `bgMarketValueAtTransfer:"1500000000"` · `bgAcquisitionMethod:"actual"` · `bgActualAcquisitionTotal:"700000000"` · `bgLendingDepositTotal:"300000000"` · `bgMortgageDebtAmount:"300000000"` · `bgDonorRelation:"lineal_descendant"`. **채무 B ≤ 증여가액 C**여야 한다(`BGF-1`과 같은 이유).

| UI 시드(귀속) | 엔진 anchor | 기대(엔진 문서 — **프로토타입 실측, Do 첫 단계에서 정식 호출값으로 재고정**) |
|---|---|---|
| 보증금·차입금 모두 `unallocated`, 비1세대1주택 | M-0 | 결정세액 69,094,001 |
| 〃, 1세대1주택(거주 10년) | M-10′ (= M-1) | 25,125,000 — 주택분 비과세, 상가분 과세 |
| 모두 `commercial`, 1세대1주택 | M-8 | 69,094,000 — **주택분 양도 없음** |
| 모두 `housing`, 1세대1주택 | M-9 | 0 — 주택분 비과세(C_h 7.5억 ≤ 12억), **상가분 양도 없음** |
| 보증금 `commercial` + 차입금 `unallocated`, 1세대1주택 | M-10 | 46,598,000 |
| F2·본문 + 비고가, 모두 `commercial` 5억 | M-14 | 오류(MB-14) |
| F2·본문 + 비고가, 보증금 `housing` 749,999,999 + 차입금 `unallocated` 1억 | M-15 | 오류(MB-14, 불분명 안분 후 초과) |

기대 세액은 **이 문서가 단정하지 않는다** — 엔진 문서 §4.0이 「프로토타입 seam + 기존 정본 하위 함수」의 실측이라고 밝혔고 구현 후 값이 다를 수 있다(1~3원).

### 9.5 기존 테스트 영향 — 차단 해제로 깨지는 것 (필드명으로 역방향 grep, 실측)

검색: `isMixedUseHouse`와 `burdened_gift`를 **둘 다** 가진 파일 20개를 열어 확인했다(`grep -rl isMixedUseHouse __tests__ e2e | xargs grep -l burdened_gift`).

| 파일 | 영향 | 조치 |
|---|---|---|
| `__tests__/calc/bg-mixed-use-block.anchor.test.ts` M-1 · M-3 | **깨진다**(차단 단언) | **반전** — 「공유 단언 반전 = 형제 안전망 소실」(메모리)이므로 M-1·M-3을 지우지 말고 **같은 시드에서 막히는 조합(PHD ON 등)으로 치환**해 차단 안전망을 유지. M-2·M-4(대조군)는 유지 |
| `e2e/_helpers/validation-field-jump-cases-mixed.ts:61-68` | **깨진다**(「겸용 × BG — 양도 형태」 케이스) | 케이스를 §3의 살아 있는 차단(예: PHD × BG → `usePreHousingDisclosure`)으로 교체. 소비처는 `validation-field-jump-cases-p3.ts` |
| `__tests__/calc/same-adjustment-period-unsupported-paths.test.ts` | 영향 없음(겸용 단독·BG 단독 각각) | |
| `__tests__/calc/usage-conversion-validate.test.ts` C-14 / C-24 | 영향 없음(각각 단독) | |
| `__tests__/calc/separate-land-date-required.g2.anchor.test.ts:200` | 영향 없음(BG 단독) | |
| `__tests__/calc/owner-split-building-std-leaf-parity.test.ts` | **격자에 `burdened × mixed` 조합이 있다**(`:65-66`, grid `:106-122`) — 술어 단위 비교라 영향 없을 것으로 보이나 **Do 시작 시 먼저 실행** | 확인 필요 |
| `__tests__/lib/calc/multi-transfer-api-sync.test.ts:223·228` | 영향 없음(다건 합산에서 각각 단독 차단 케이스) | |
| `__tests__/tax-engine/transfer/burdened-gift-gate-parity.anchor.test.ts` | 엔진이 `"mixed-use-house"`를 `BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES`에 넣으면 **UI/⑧ 배열(`assetKind`) ≠ 엔진 배열(`propertyType`)** 이라 「내용 동일성」 단언이 깨진다 | 엔진이 propertyType 축을 쓰는지 확인(E-4) 후 매핑(`housing`+플래그 ↔ `mixed-use-house`)을 테스트에 명시 |
| `__tests__/api/transfer.route.bundled-swallows-special.test.ts:119·161` | 겸용(`MIXED`)과 BG(`BURDENED`)가 **별도 상수** | 영향 없음 |
| `__tests__/lib/calc/burdened-gift-api.test.ts` (`bgMortgageSetAmount` 참조) | 신규 필드 8개가 `buildBurdenedGiftInfo` 출력 모양을 바꾸지 않는다(겸용에서만 `debtAttribution` 추가) — **기존 비겸용 케이스 무변경 확인** | Do 시작 시 먼저 실행 |
| `makeDefaultAsset`/`migrateAsset` 키 열거 테스트(`__tests__/calc/*migrate*`) | 신규 8필드 `""` 초기값이 생기므로 키 개수·스냅샷 단언이 있으면 깨진다 — **확인 필요**(grep으로 `Object.keys(makeDefaultAsset` 0건이었으나 개별 필드 단언은 미조사) | Do 시작 시 `npx vitest run __tests__/calc/`를 먼저 |
| 인쇄: `__tests__/print/mixed-use-print-sections.test.ts` · `filing-form-first-row.anchor.test.ts` | R-7로 leaf가 늘면 **ALL_LEAVES 단언이 깨진다** | 함께 갱신 |
| 문서 | `docs/00-pm/bg-redevelopment-presumed-and-mixed-use.plan.md` §2.2·§4 「겸용 구현은 범위 밖」, `validate-bg.ts:109-118` JSDoc, `refines.ts:309` 주석, `TransferModeBlock.tsx` 주석 | 「차단」 → 「P1 범위 refine」으로 갱신 |

### 9.6 뮤테이션 계획 (구현 후 — 안전망이 실제로 죽이는지)

각각 적용 후 지정 테스트가 **실패**해야 한다. 살아남으면 anchor를 보강한다.

1. `isMixedBurdenedGift`를 `false` 상수로 → BGM-U1
2. U-1(양도시 총액 숨김) 제거 → BGM-U1 · S-1
3. U-2(취득시 총액 숨김) 제거 → BGM-U1 · S-1
4. ⑧ V-4(취득시 4부분 필수) 제거 → S-2
5. ⑧이 `standardPriceAtTransfer`를 다시 요구 → S-1
6. 토글 `disabled={blocked}`(OFF 전이까지 막음) → BGM-U4
7. 어댑터 R-1의 `transferBurdenedGiftBreakdown` 줄 삭제 → BGMU-2 · BGMU-3
8. `availablePrintIds`에서 `gift-filing-form` 제거 → BGMU-5
9. ④ stale 가드 1개 제거 → S-5
10. ⑫ refine에서 PHD 조건 제거 → S-3(API 대조군)
11. (R2) `mixedBgDebtAttribution`에서 모드 `""`를 `unallocated`로 취급(기본값 도입) → S-7·BGM-U8 KILLED
12. (R2) ④가 `split` 아닌 모드에서도 분할 3칸을 읽음 → BGM-U10 · S-10 KILLED
13. (R2) R-10 게이트(`transferred`) 제거 → BGMU-9 KILLED(「비과세」 문장이 되살아남)
14. (R2) ⑧에서 MB-14를 V-3·V-4 앞으로 이동(C_h 미정 상태에서 판정) → S-8 KILLED

---

## 10. 사용자 결정이 필요한 지점 (R2 — 닫힌 것과 남은 것)

### 10.1 엔진 회신으로 **닫힌** 결정

| # | 결정 | 닫힌 결론 | 근거 |
|---|---|---|---|
| Q-2 | 엔진 입력 모델 | **A** | 엔진 E-1·D-1′ |
| Q-4 | 증여세용 평가액 override 칸 | **겸용에서 숨김** | 엔진 MB-12가 `giftBuildingStdPriceAtTransfer`를 거부 + 엔진 Q-6(α) |
| Q-5 | K-6/K-7 P1 포함 | **포함**(UI 추가 0) | 엔진 §3.2: 개산공제 base = 취득시 4부분 × `B_part'/C_part` |
| Q-8 | 토지·건물 취득일 다름 | **허용**(안내에 「확인 필요 V-15」 병기) | 엔진 E-4: B0 지원 |
| (신규) 결과 route 값 | `acquisitionConversionRoute` 신규 값 없음 | `burdenedGift` 존재로 분기 | 엔진 E-2 |

### 10.2 **남은** 사용자 결정

| # | 결정 | 선택지 | **권고** | 근거 |
|---|---|---|---|---|
| Q-1 | P1 지원 범위 | (a) 단건·매매·단독소유 (b) 상속/증여 취득까지 (c) 컴패니언까지 | **(a)** | §3·§8. 귀속 입력(8필드)을 추가한 지금 P1이 이미 커졌다 |
| Q-3 | 4부분 기준시가 위치 | (a) ③ 유지 + ② 요약 (b) 패널을 ②로 이동 | **(a)** | §5.2 |
| Q-6 | **상속·증여 취득 겸용 × BG를 P1에 넣을지** | (a) P1 차단 유지 (b) 엔진이 열어 둔 만큼 P1에 포함 | **(a) 유지** — 단 차단 **사유를 정정**한다 | **엔진 Q-6 대응(BG 겸용에서 reported 평가액 미입력 시 보충적평가 fallback 대신 MB-11 오류)** 으로 「같은 값을 두 곳에서 받는 정본 충돌」 사유는 소멸했다. 그래도 (b)로 열려면 UI가 **추가로** 해야 할 일이 있다: ⑴ 겸용 패널의 「상속개시일 신고가액 직접 입력(선택)」(`MixedUseAssetMajorStdPrice.tsx:182-204`)·증여 카드(`:205-227`)를 BG에서 **필수**로 바꾸고 라벨의 「미입력 시 … 자동 사용」 문구 삭제 ⑵ BG K-4 총액 칸(`bgActualAcquisitionTotal`)을 상속·증여 취득에서 **숨기고** 산정방식을 K-4로 고정(엔진 MB-8: K-5/6/7 불허) ⑶ ⑧에 MB-11(reported 값 누락) 연결. 엔진 문서 §3.3은 상속 취득의 입력 소스를 「mixed 상속 필드」라고 적었다 — 즉 **정본은 겸용 패널**이 된다. 귀속 입력이 이미 P1을 키웠으므로 **P1.5로 분리**를 권고하고 지금은 막는다. 엔진 M-6은 엔진 단위 anchor로만 유지 |
| Q-7 | BG 단건 사이드바 양도가액 「-」 선재 갭 | (a) 겸용 분기만 (b) BG 전반 | **(a)** + (b)는 별건 | §6.4 |
| Q-9 | 컴패니언·지분 | P2 | **P2** | §8 · 엔진 MB-6 |
| Q-10 | 차단 문구의 우회 안내 | 「주택과 상가를 나누어 입력」 삭제 | **삭제** | §3.1-4 |
| **Q-11 (R2)** | 귀속 입력 granularity | (a) 항목(임대보증금·담보차입금)마다 라디오 + 「나누어 입력」(8필드, 위젯 한 벌) (b) 임대보증금 3칸 + 담보차입금 단일 라디오(5필드) | **(a)** | 대출이 여러 건이라 귀속이 갈리는 경우를 표현 못 하면 사용자가 「구분 불분명」으로 우겨 넣어 **다른 계산(을설)** 이 된다. 필드 3개 차이로 이 오용을 막는다 |
| **Q-12 (R2)** | **구분 불분명 채무 안분**(엔진 Q-9 ㄱ: 주택·상가 증여가액 비율) 노출 | 엔진 Q-9 결정에 종속: ㄱ이면 「구분 불분명」 옵션 제공 + 「확인 필요」 고지(권고) / ㄴ이면 옵션 제거 | **ㄱ** | 해석례는 「구분이 분명한 경우」만 답했다(엔진 V-17). ㄴ은 근저당 전체 담보대출을 가진 대부분의 사용자를 막는다 |
| **Q-13 (R2)** | **본문+비고가에서도 귀속을 적용**(엔진 Q-8 I2) | 엔진 결정(I2 권고)을 따른다 | 엔진 | 세액 차이는 배율초과 비사업용토지가 있을 때만(M-16). UI 영향: 해당 조합에서 안내 한 줄 「확인 필요(V-19)」 |
| **Q-14 (R2)** | 12억 판정 해석(엔진 Q-1: 증여가액 C 기준 vs 채무상당액 B 기준) | 엔진 결정 | 엔진 | UI는 결과의 `highValue.basis`를 표시할 뿐 판단하지 않는다. 엔진 E-8: 확정 전까지 `warnings`에 항상 「확인 필요」 고지 — 결과 카드가 이를 숨기지 않아야 한다 |

---

## 11. 엔진 회신 반영 — 엔진 의존 지점 확정/잔여 (엔진 §8·§9 + R2)

엔진 문서 §8이 E-1~E-12에 번호별로 답했다. 아래는 UI 문서 기준으로 **확정**과 **잔여**를 가른 것이다.

| # | UI가 물은 것 | 엔진 회신 | 상태 | UI 반영 |
|---|---|---|---|---|
| E-1 | 입력 모델 | **A**. 단 R2로 **귀속 입력 필요**(신규 필드 0 깨짐) | ✅ 확정 | §5.6·§6.1 |
| E-2 | 결과 shape | `breakdown.burdenedGift?: MixedUseBurdenedGiftBreakdown`. `housingPart`/`commercialPart` 값 = **채무비율 적용 후 B-slice**. `acquisitionConversionRoute` **신규 값 없음** | ✅ 확정 | R-1~R-12 · 사이드바 §6.4 |
| E-3 | `perAsset` 4부분 | 별 필드 **`perPart`**(`housingLand`·`housingBuilding`·`commercialLand`·`commercialBuilding` + `transferred`), `perAsset`은 Omit | ✅ 확정 | R-6·R-12 |
| E-4 | P1 K·취득원인·PHD 등 | K-1~K-7(상속·증여 취득은 K-4 고정) 지원 · PHD/B1/용도변경/수용/지분/컴패니언 차단 · B0 지원 · 배열에 **추가하지 않음**(4번째 게이트 `assertMixedBurdenedGiftSupported`) | ✅ 확정 | §3 · parity 테스트 주석 |
| E-5 | ④ 기준시가 표현 | housing 관행(합계) · 엔진은 재파생 · 양도시 합 불일치 fail-fast(MB-12) | ✅ 확정 | §5.1·§6.2 |
| E-6 | ⑫ 스키마 | 최상위 `burdenedGiftInfo` 불변 + 겸용 refine(MB-12 **거부**) | ✅ 확정 | §4 stale 가드 · §6.7 |
| E-7 | `transferPrice` placeholder | 엔진이 무시하고 B로 덮어씀 | ✅ 확정 | §6.2 |
| E-8 | 12억·비과세 분모 | 증여가액 C(해석 B). `highValue` echo. Q-1 미확정 동안 `warnings`에 「확인 필요」 상시 | ✅ 확정(해석은 엔진 Q-1) | R-9·Q-14 |
| E-9 | B/C>1 사전 차단 | 가능(`computeSangjeungbeopValuation`). 시가 모드 C = 시가 총액이라 총액 비교로 충분. **R2: 부분 초과 MB-14는 `C_h`가 필요** | ✅ 확정 | V-7·V-11 |
| E-10 | `giftTax.besshi10Rows` | 있음(`TransferBurdenedGiftBreakdown.giftTax` 재사용) | ✅ 확정 | R-5 |
| E-11 | `warnings` | ① 다주택 중과 한시 배제 ② Q-1 확인 필요 ③ Q-2 α(시가 총액 기준시가 비율 안분) ④ Q-6 α(증여세용 상가건물 기준시가 = 양도세 기준시가) ⑤ **R2: 귀속은 사용자 선언+증빙 필요 · 불분명분 안분 확인 필요(V-17) · 본문+비고가 귀속 적용 확인 필요(V-19)** | ✅ 확정 | `CalculationWarningsCard` 변경 없음(R-9). 귀속 안내는 §5.6 카드에도 같은 문장을 쓴다 |
| E-12 | 사이드바 echo | `perPart` 합 + `assumedDebtAmount`. **`debtRatio`는 단일 값이 아니다** — `debtAttribution.housingRatio/commercialRatio` | ✅ 확정 | §6.4 |

**잔여 (엔진 시니어 확인·구현 필요)**

| # | 잔여 | 이유 |
|---|---|---|
| RES-1 | `collectMixedBurdenedGiftIssues` · `prepareMixedBurdenedGift`를 **클라이언트 호출 가능한 순수 export**로 두고, 이슈에 **`code`(MB-n)** 와 부분(`housing`/`commercial`) 정보를 싣기 | ⑧·⑤ 미리보기가 같은 함수를 호출하는 구조(§3.2)의 전제. 서버 전용 import(`TaxCalculationError` 등)가 섞이면 클라이언트 번들 누출 위험(`feedback_client_bundle_node_import_invisible_to_gates`) |
| RES-2 | `perPart[*].transferred`의 정의 — **배율초과 비사업용토지 몫**이 양도로 잡히는 경우(엔진 M-16) 주택분 `transferred`가 true인지 | 「양도 없음」 배지(R-10)가 엔진 echo만 믿으므로 정의가 필요 |
| RES-3 | `debtRatio`(단일)·`gratuitousPortion`이 귀속 하에서 갖는 의미 | R-6 카드가 단일 비율을 그리면 오독 |
| RES-4 | MB-11이 취득시 4부분 기준시가를 **K-4·K-6·K-7에서도** 요구하는지 | UI는 요구(안분 비율·개산공제 base) — §16 #3 |
| RES-5 | 신축 취득(X-8)을 엔진이 허용하는지 | MB 목록에 없다 |
| RES-6 | MB-1 메시지에서 「단일 자산 모드」 안내 제거(엔진 §2.2가 이미 지적) | U-13 문구와 일치시킬 것 |
| RES-7 | 귀속 입력이 `debtAttribution` 3값으로 합성됨을 전제로 ⑫가 **합 = `lendingDepositTotal + mortgageDebtAmount`** 를 검사할 때 `assumedDebtOverride`가 없는 단건에서만 성립함을 확인 | 컴패니언(P2)에서 달라진다 |

---

## 12. 범위 밖

- 컴패니언(함께양도) · 공유지분 · 지분 분할(축 B) × 겸용 × BG (§8 P2)
- 상속·증여·이월과세·신축 취득 × 겸용 × BG (Q-6)
- PHD(§164⑦) · 보유 중 일부 용도변경 · 별개 취득 파트 모델 × 겸용 × BG
- 증여세 계산기(`GiftTaxResultView`)의 부담부증여 연동에 겸용 축 신설
- BG 단건 사이드바 양도가액 전반(Q-7 (b))
- **재제안 금지(건드리지 않는다)**: 상속×K-6/K-7 · 조합원입주권×새 방식 · 재개발 완공APT(원조합원)×K-6/K-7 · 이월과세×신축·증축×감정가액 — 이 설계의 `bgPresumedBlock`·X-7 경계는 그대로 둔다.

---

## 13. 확인 필요 (추정으로 단정하지 않은 것)

1. `transfer-tax-api-primary-context.ts`가 겸용일 때 `bgInfo`를 버리는지 — 열지 못했다(§6.2).
2. 겸용 엔진의 **이월과세**(`carryover_gift`) 지원 여부 — `validateAssetAcquisition`은 이월과세를 겸용 분기보다 **앞에서** 처리하고 `return null`한다(`transfer-tax-validate-acquisition.ts:259-349`). 엔진 MB-9가 차단하므로 X-7은 막는다.
3. 요약 패널에서 「③ 겸용주택」으로 이동시키는 링크가 필요하면 `jumpToIssueField`(`components/calc/transfer/validation-jump.ts:59`)에 합성 `ValidationIssue`를 넘겨도 되는지. P1은 텍스트 안내만 둔다.
4. BG 단건 사이드바 양도가액이 실제 브라우저에서 「-」인지(코드로만 확인).
5. 상증법 §61에서 상가주택의 주택 부분 평가가 개별주택가격(주택 부분)만으로 끝나는지, 상가 부수토지·상가건물을 별도로 합산하는 방식이 정본인지(엔진 V-16도 같은 미확인) — 요약 패널의 항목 이름이 그에 종속된다.
6. `owner-split-building-std-leaf-parity.test.ts` 격자(`burdened × mixed`)의 기대값(§9.5).
7. **해석례가 답하지 않은 부분(엔진 V-17~V-19)**: 구분 불분명분의 안분(을설) · 부분 초과부담부 오류 처리 · 본문(주택>상가)/고가 겸용에서의 귀속 적용 · 임차보증금이 아닌 **담보차입금**의 귀속 판단 기준. 이 설계는 UI에서 사용자가 사실로 선언하게 하고 「확인 필요」를 병기할 뿐 법적 판단을 하지 않는다.
8. 신규 8필드 추가가 `__tests__/calc/*migrate*`·스냅샷 테스트에 미치는 영향(§9.5).
9. 이 워크트리에서 **브라우저·Playwright·vitest를 실행하지 않았다.** 위 모든 관찰은 코드 열람이다.

---

## 14. Do 순서 (시퀀셜 — 엔진이 먼저)

1. (엔진) 타입·§159 seam·귀속(D-7)·route·⑫ — `burdenedGift` echo 계약(E-2)과 **클라이언트 호출 가능 export(잔여 RES-1)** 확정이 선행.
2. **무변경 분리**: `BurdenedGiftBlock.tsx` 796줄 → ≈522줄(§7). 분리 커밋 단독으로 `__tests__/components/burdened-gift-*` 전부 통과 확인.
3. ①②③: 신규 8필드 + normalize(§6.1) — 이 단계에서 기존 `__tests__/calc/` 먼저 실행(§9.5 키 열거 테스트).
4. leaf `burdened-gift-mixed-use-scope.ts`(귀속 합성 포함) + `MixedUseAssetMajorStdPrice.tsx:107-140` 합계를 leaf 호출로 교체 — 동작 무변경 확인.
5. ⑤ U-1~U-15 + `BurdenedGiftDebtAttributionCard` + `BurdenedGiftMixedUsePanel`.
6. ④ 겸용 분기(`debtAttribution` 합성·stale 가드) / ⑧ `validateMixedUseBurdenedGift`(V-1~V-12) + (1-a) 대체.
7. ⑥ 사이드바(`saleTransferNote` 포함).
8. ⑦ R-1~R-12 (어댑터 → 섹션 → 명세서 → 신고서 → 인쇄 leaf → 양도 없음 문구 순).
9. 기존 테스트 반전(§9.5) → 신규 anchor/RTL → 뮤테이션 14종(§9.6) → E2E → **수동 브라우저 확인**(Network 탭에서 `burdenedGiftInfo.debtAttribution`+`mixedUse` 동시 전송 · stale 키 부재 확인).
10. `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`.

---

## 15. 정책 자가점검

| 정책 | 점검 |
|---|---|
| `useEffect → store` 미러링 금지 | 요약 패널·귀속 카드의 「남은 금액」·부분별 비율은 leaf 파생 표시. 총액과 귀속을 **서로 복사하지 않는다**(비분할 모드는 구조상 합이 같고 `split`만 검사). `fixedAcquisitionPrice ↔ bgActualAcquisitionTotal` 교차 복사 없음 |
| 자동 안분 fallback 금지 | 귀속 모드는 **기본값 없음 · 필수**(엔진 Q-10과 일치). `missing`을 0으로 메우지 않고 ⑧이 차단. 구분 불분명 채무의 `C_h:C_c` 안분은 **사용자가 「구분 불분명」을 명시 선택한 경우에만** 엔진이 수행(법정 안분 아님 — 확인 필요 V-17이라 고지 병기) |
| Validation 동기화(⑧) | 표시·④·⑧이 `mixedTransferStdTotal`/`mixedAcqStdTotal`/`mixedBgDebtAttribution`을 공유. MB-n은 **엔진 함수를 호출**(복제 0). ⑧이 숨은 칸을 요구하는 경로 제거(V-6). 3층 parity(S-9) |
| 파일 크기 | `BurdenedGiftBlock` 분리(§7) 후 ≈561줄, 신규 파일 전부 ≤700, 위험구간 4개 파일은 sibling 위임 |
| 컴포넌트 규약 | `ToggleCard`(ON 전이만 비활성)/`RadioCardGroup`(귀속, tone rose)/`ToneCard`/`Frac`, native 신규 0, placeholder 숫자 0, 정본 폰트 클래스, 금액 `font-mono tabular-nums` |
| 법령 인용·표현 | 해석례는 번호·일자·요지만 인용, 불분명분 안분 등 미답 부분은 「확인 필요」. 「비과세」·「절세」 등 납세자 유불리 표현 금지(R-10) |
| 14지점 | ①②③ **신규 8필드**(§6.1) · ④⑤⑥⑦⑧ 변경안 명시 · ⑨~⑭는 엔진 문서와 정합(§11) — **구현 전이므로 완료 보고 대상 아님** |

---

## 16. 엔진 문서와 불일치 (엔진 문서는 수정하지 않았다 — UI 문서에만 기록)

> **해소 (2026-10-16)**: 아래 전건을 엔진 설계서 R3 §10이 수용했다(반박 0, #5는 `gratuitousPortion` 유지로 부분 수용). 신축은 MB-15로 신설되어 §3.3에 반영했다. **현재 남은 불일치는 없다.** 아래 표는 이력으로 남긴다.

| # | 엔진 문서 | UI 문서 / 코드 | 처리 |
|---|---|---|---|
| 1 | §3.6 ①: 「귀속 입력: 임대보증금 주택/상가 분리 + 담보차입금 귀속 선택」 | UI는 **항목마다 5택(주택/상가/구분 불분명/나누어)** + 분할 3칸으로 구체화(8필드). 임대보증금의 **구분 불분명**(일괄 임대)과 담보차입금의 **분할**을 허용 | 엔진 `debtAttribution` 3값으로 합성되므로 충돌 아님. 엔진이 「임대보증금은 임차 대상이 곧 귀속」이라고 쓴 부분(§3.1A)만 UI가 더 넓게 허용 — 엔진 확인 요청 |
| 2 | §3.6 ⑧: 「기준시가는 `validateMixedUseAsset` 소관」 | `validateMixedUseAsset`은 BG에서 **화면에 없는 칸**(`fixedAcquisitionPrice`·`useEstimatedAcquisition`·취득시 총액 안분)을 요구해 **막다른 길**(`validate-mixed-use-asset.ts:84`·`:135`) | UI는 `validateMixedUseBurdenedGift`로 분기(§6.6). 엔진 문서의 ⑧ 서술을 정정하도록 요청 |
| 3 | §3.7 MB-11: 취득시 기준시가 3필드·나목은 **「기준시가 모드」** 에만 열거 | UI V-4는 **K-4·K-6·K-7에서도 취득시 4부분 필수**(안분 비율 §100② · 개산공제 base) | 엔진 §3.2 표는 K-4/K-6/K-7이 est의 4부분 분해와 `basis_i`를 쓴다고 적고 있어 MB-11 열거가 **불완전**해 보인다 — 엔진 확인(잔여 RES-4). 엔진이 더 느슨하면 UI 허용 ⊂ 엔진 허용이 깨지지 않으나(UI가 더 요구) 엔진 쪽에서 침묵 0으로 계산할 위험 |
| 4 | §3.1 `C_h`: 기준시가 모드는 「주택분 기준시가」, §3.1A 산식은 두 모드 모두 `apportionByStdPrice(C, …).land` | UI 결과 문구는 산식을 단정하지 않고 echo 값만 표시 | 엔진 문서 내부의 미세한 서술 차이 — 정수 체인 결과가 같은지 엔진 확인 |
| 5 | §3.5: `TransferBurdenedGiftBreakdown`에서 `Omit`한 키에 `debtRatio`·`gratuitousPortion`이 **남아 있다** | 귀속 하에서 단일 `debtRatio`는 어느 부분의 비율도 아니다 | UI는 겸용에서 그 행을 숨기고 `debtAttribution` 부분별 비율을 쓴다(R-6). 엔진이 의미를 정의하거나 Omit에 추가 요청(잔여 RES-3) |
| 6 | §3.6 ⑥: 사이드바 지점을 `computeTransferSummary`로 표기 | `computeTransferSummary`(`calc-wizard-store.ts:485-549`)는 **화면 소비처가 없다**(`components/calc/CLAUDE.md`). 화면은 `transfer-per-asset-summary.ts` | 엔진 문서 지점 오기 — 정본은 per-asset |
| 7 | §3.8: `BurdenedTransferTaxResultCard`를 겸용 결과 표시처로 열거 | 이 카드는 **증여세 계산기**(`GiftTaxResultView.tsx:461`)에서만 쓰이고 겸용 축이 없다(`gift-burdened-transfer-api.ts:66-79`) | UI는 범위 밖으로 둔다. 겸용 BG의 종착지는 `MixedUseResultCard` |
| 8 | §3.3 마지막 · §9 ①: 「UI 허용 ⊂ 엔진 허용을 anchor로 고정」 | UI §3.2의 격자 anchor와 같은 의도 | 일치 — UI가 엔진 collector를 호출해 구조로 보장 |
| 9 | §3.7 MB 번호 순서(MB-13·14가 MB-10 다음, MB-11·12가 뒤) | 순서만 다름 | 무영향. UI 대응표(§3.3)는 번호순 |
| 10 | §3.3: 신축 취득 언급 없음 | UI X-8은 막는다 | 엔진 확인 필요(잔여 RES-5) — 엔진이 허용하면 UI 좁힘으로 둔다 |

---

## 17. PR-3 구현 반영 (2026-10-16) — 설계 대비 변경·결정

사용자가 통합 계획서 G-1~G-13을 권고안으로 확정한 뒤 구현하며 설계서와 달라진 점. 설계서 본문은 고치지 않고 여기에 이력으로 남긴다.

| # | 설계서 | 구현 | 사유 |
|---|---|---|---|
| 1 | §3.1 «숨은 별개취득 토글은 ⑧이 안내» | **④가 BG 겸용에서 `mixedAcqPerPartMode`를 무시**(`isPerPart=false`)하고 취득 산정방식은 BG 산정방식에서 파생(`resolveMixedBgAcquisition`) | BG 화면에서 그 토글을 끌 수 없어 ⑧이 안내해도 막다른 길. 엔진 MB-3은 발동하지 않는다 |
| 2 | R-1 어댑터가 `transferBurdenedGiftBreakdown: b.burdenedGift` 통과 | **어댑터에 싣지 않는다.** 소비처가 `result.mixedUseDetail.burdenedGift`를 직접 읽는다(`resolveBgMixedDisplay`·`mixedBgFilingNotes`·`FilingFormTable` 배지) | 두 타입(`perAsset` 2부분 vs `perPart` 4부분)이 달라 같은 슬롯에 싣으면 단건 빌더가 `perAsset.land`를 읽다 크래시한다 |
| 3 | R-4 «① 앞에 신설 + 라벨 교체» | **① 양도가액 안분 섹션을 BG에서 통째로 대체**(`MixedUseBgApportionSection`), ②③의 취득가액·필요경비·양도차익 산식 행을 BG 분기(`MixedUseBgAcqRows`·`mixedBgPartGainFormula`) | 일반 겸용 ①은 «기준시가 비율 안분·내림» 문구라 BG에서 거짓 산식이 된다(렌더 실측) |
| 4 | R-6 `BurdenedGiftDetailCard` 재사용 | 신설 `MixedUseBurdenedGiftDetailCard`(평가·무상이전분·증여세) + 증여세 행을 `BurdenedGiftGiftTaxRows`로 **추출 공유** | `perAsset`·단일 `debtRatio` 전제를 겸용에 걸 수 없다. 증여세 행은 물건 단위라 두 카드가 같은 행을 쓴다 |
| 5 | R-7 인쇄 leaf 위치 미정 | `burdened-gift`·`gift-filing-form` 모두 `group:calc`(양도세 `TRANSFER_PRINT_SECTIONS`와 같은 위치) | 신고서식 그룹 첫 행 = `form-table` anchor 유지 |
| 6 | R-3 `DetailedStatementBgMixedFormulas.ts` + Helpers 분기 1줄 | 신설 파일 + Helpers에 분기 5줄. **`DetailedStatementHelpers.ts` 769줄 → 1단계 일자 항목을 `DetailedStatementDateItems.ts`로 분리해 706줄**, `MixedUseCalculationSections.tsx` 735줄 → ④를 `MixedUseNblSection.tsx`로 분리해 709줄 | 800줄 정책 — 위험구간 파일을 연 김에 분리 |
| 7 | §5.1 leaf만 신설 | `mixed-use-std-fallback.ts` 추가(`mixedAcqCommercialBuildingStd` 등을 `api-mixed-use`에서 이동·재수출) | `api-mixed-use → helpers → api-burdened-gift` 순환 import 방지 |
| 8 | §6.4 사이드바 | 정본은 `transfer-per-asset-summary.ts`(행 필드 `saleTransferNote`). `computeTransferSummary`는 무소비 | §16 #6 |

**남은 확인 필요 (추정으로 단정하지 않은 것)**: V-15·V-17·V-18·V-19(법령 미확인 — 구분 불분명 채무의 증여가액 비율 안분, 12억 판정을 증여가액 C로 한 해석, 상가건물 기준시가 동일성, 시가 모드 구분 감정평가 부재 시 기준시가 비례) / 엔진 MB-11이 취득시 4부분 기준시가를 K-4·K-6·K-7에서도 요구하는지의 범위 / 신축(X-8)은 엔진 MB-15가 API `acquisitionCause`만 보므로 UI가 `isSelfBuilt` 값을 별도로 차단한다.
