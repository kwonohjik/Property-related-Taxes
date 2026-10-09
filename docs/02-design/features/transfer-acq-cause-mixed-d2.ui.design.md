# 토지·건물 취득원인 혼합 — Phase D2 「건물 상속·증여 + 토지 매매」 · UI·클라이언트 설계

> ⚠️ 엔진 설계(`transfer-acq-cause-mixed-d2.engine.design.md`, transfer-tax-senior 병행)와 사용자 결정이 이 문서와 어긋나면 **계획서 §12(D2 Design 확정)가 우선**한다 — 이 문서를 작성하는 시점에 §12는 없다.

- 계획서: `docs/00-pm/transfer-acq-cause-mixed.plan.md` §2.1(조합표) · §4 D2 · §6 Q-2·Q-3·Q-5 · §7 V-2·V-3·V-4·V-11 · §9 · §10~§11(D1·D1-4 구현 기록)
- 선행 UI 설계: `…-d1.ui.design.md`(호스트 태그·X안·stale) · `…-d1-4.ui.design.md`(§164④ 카드) — **이 문서는 그 위에 얹는다**
- 짝(엔진): `…-d2.engine.design.md` — **읽지 않았다**(병행 작성 중). 엔진과 맞출 지점은 §11에 모았다.
- Pre-Do 테스트(제품 코드 수정 0):
  - `__tests__/calc/transfer-land-part-cause.d2.predo.test.ts` — 활성 10 · todo 19 (④⑥⑧ + ⑫ 직접 호출)
  - `__tests__/calc/transfer-land-part-cause.d2.predo.render.test.tsx` — 활성 9 · todo 11 (⑤ 렌더)
  - 합계 활성 19 passed / todo 30, `tsc --noEmit` 0건.
- 상태: **UI Design — 제품 코드 수정 0.** 워크트리 `Property-related-Taxes-d2` · 브랜치 `feat/transfer-acq-cause-mixed-d2` · base master `1a8660ed3`.
- 표기: 「실측」 = 이 워크트리에서 vitest로 **실제 ④→route(⑫⑭+엔진)** 또는 ⑧·⑥ 함수를 실행한 값(mock 세율 — 상대 비교가 본질). 「코드 확인」 = 읽기만. 「확인 필요」 = 미검증. file:line은 이 워크트리 기준.
- **Playwright는 돌리지 않았다.** 화면 사실은 RTL 렌더(`CompanionAcquisitionCauseSection`이 jsdom에서 mount됨)와 코드 추적으로 확인했다. 실제 브라우저 화면·모바일 폭은 D2-2 Do에서 확인한다.

---

## 0. 결론 표

| # | 결정 | 근거(절) | 권장 |
|---|---|---|---|
| 1 | **위젯**: 상속·증여 건물 호스트에도 「토지는 다른 원인으로 취득」 토글을 둔다(Q-3). 상속·증여 호스트의 토글은 **원인 라디오 없이 「토지 = 매매」 고정**이다. 켜면 **`CompanionAcqPurchaseBlock`을 「건물 원인 모드」(`buildingCause` prop)로 재사용**하고 상속 블록(`CompanionAcqInheritanceBlock`)은 마운트하지 않는다 | §2 | **R안** |
| 2 | **칸 분류**: 상속 블록·하위 섹션 키 약 35개 중 **건물 파트로 좁혀지는 것 2(상속개시일 3키·피상속인 취득일) · 건물 평가액으로 대체 1(`publishedValueAtInheritance` → `buildingAcquisitionPrice`) · 자산 단위 사실이라 결정 대기 5(동일세대·선순위·합가) · 숨김 약 25(평가방법·보충적평가 4·결합 공시 `inhHouseVal*` 11·`pre1990*`·의제 기준시가·가업상속…)**. 숨김의 근거는 「결합 공시(개별주택가격)는 토지를 포함하므로 건물만 상속에서 의미가 깨진다」(V-4) | §2.3 | 표대로 |
| 3 | **🔴 술어 분리**: `effectiveLandAcquisitionCause`는 D1 의미(토지 상속·증여)로 **그대로 두고**, D2는 별도 술어로 읽는다. 하나로 합치면 D1 소비처 11곳이 `"purchase"`를 truthy로 받아 **매매 토지를 상속·증여 토지처럼 고정**한다(토지 방식 칩 고정·PHD 무시·1990 단서). 타입도 D1 반환형을 `"" \| "inheritance" \| "gift"`로 좁혀 컴파일러가 누수를 잡게 한다 | §3.1 | 분리 |
| 4 | **stale**: 신규 키 0. `landCauseHost`에 `"inheritance" \| "gift"` 2값 추가(cause별 태그), `landAcquisitionCause`에 `"purchase"` 추가. 호스트 전환은 D1-2 F2 패치(`:102`)가 태그를 비우고 `:99`가 `hasSeperate…`를 끄므로 **코드 변경 없이** 토글이 꺼진다(값 보존·재켜기 시 복원) | §3 | 읽는 쪽 파생 |
| 5 | **🔴 ⑧ 분기 신설**: 상속·증여 호스트 ⑧은 숨은 자산 단위 칸(신고가액·증여 신고가액·§164⑦·E-1)을 요구한다(실측 B3 — 토글 ON이면 막다른 길). D2 유효 시 **그 체인에 도달하기 전에** 새 분기(`validateBuildingCauseSplit`)로 빼 `validateSplitDirectInputs`로 보낸다(신축 분기와 같은 모양) | §5 | 신규 분기 |
| 6 | **🔴 ④ 침묵 오답 실재**: D2 상태에서 ④가 `landAcquisitionCause`를 안 싣는다 → 엔진이 **매매 토지를 상속 토지로 읽어 피상속인 취득일로 세율 통산**(실측 B2: 토지 echo `acquisitionCause=inheritance`·`rateBasisAcquisitionDate=2000-01-01`). 도달 경로는 지금은 stale뿐이지만 D2가 이 상태를 정상으로 만든다 | §4 | ④ 전송 |
| 7 | **숨은 값 전송·표시 차단**: 신고가액·§164⑦·동일세대 등 숨은 칸 값이 ④로 실리고(실측 B4·B5) ⑥ 자산 행에 뜬다(실측 B4: 건물 가액 미입력 + stale 9억 → 행 취득가액 900,000,000). D2 유효 시 ④ 미전송·⑥ 미표시 | §4 | 게이트 |
| 8 | **⑦ 결과**: D1-3 echo(`mixedCause`·`splitCauseLabel`·`rateBasisShown`)와 `partTag`는 **파트 방향에 중립**이라 건물 상속에서도 그대로 맞다(코드 확인). 바꿀 것은 (a) 토지 파트 「주택 취득일」 보조 문구(§6) (b) 라벨 어휘 상수(건물판) 2곳. `acquisitionBasis`(D1-4)는 토지 전용이라 D2-1에서 건물은 미표시 | §6 | 소폭 |
| 9 | **막다른 길 3축(V-2·V-3·V-4)별 UI 대안** 사전 명세 + 엔진이 지금 **침묵 통과시키는 결합 3종**(건물 환산·소유자 분리·경계일 전, 실측 B6) 확인 | §5.3·§11 | — |
| 10 | **PR 순서**: D2-1(leaf·타입·④·⑧·⑫, 토글 미노출이라 **화면 변화 0**) → D2-2(⑤ 위젯·⑥) → D2-3(⑦) → D2-4(건물 경계일 전 max 입력, 법령 결론 시) | §9 | 4분할 |

---

## 1. 현행 실측

### 1.1 코드 지형

| 층 | 위치 | 현행 |
|---|---|---|
| 호스트 집합 | `lib/calc/transfer-land-part-cause.ts:22-24` | `LandCauseHost = "newConstruction" \| "purchase"` — 상속·증여 건물은 호스트가 아니다 |
| 적용 범위 | 〃 `:28` | `landPartCauseApplicable` = 호스트 ∧ 주택·건물 ∧ ¬겸용. 상속·증여 호스트에서 거짓 |
| 유효 원인 | 〃 `:39-56` | 적용 범위 ∧ `hasSeperate…` ∧ 태그 = 취득원인일 때만 저장값 반환 |
| ⑤ 토글 | `LandPartCauseBlock.tsx:108` | `if (!landPartCauseApplicable(asset)) return null` → 상속·증여 호스트 **토글 미노출**(렌더 실측 B1·B2) |
| ⑤ 마운트 | `CompanionAcquisitionCauseSection.tsx:157`(소유자 다름) → `:161`(토글) → `:171`(매매 블록) → `:279`(상속) → `:287`(증여) → `:302·306`(증여 §164 섹션) → `:316`(의제 전 선언) → `:320`(가업상속) → `:339`(소유자 분리 입력) | 위→아래 인과 순서 |
| ⑤ 원인 전환 | 〃 `:99` · `:102` | 비-매매로 가면 `hasSeperate…` 끔 · 태그가 새 원인과 다르면 태그를 비움 |
| ⑧ 상속 | `transfer-tax-validate-acquisition.ts:150`(`postDeemedClauseARequiredError`) · `:692-697`(피상속인 취득일·동일세대 개시일) | 신고가액(`publishedValueAtInheritance`)을 **자산 단위로** 요구 |
| ⑧ 증여 | 〃 `:689-691`(`증여 신고가액을 입력하세요`) | `fixedAcquisitionPrice` 요구 |
| ⑧ 분리 검증 | 〃 `:729`(맨 마지막)·`transfer-tax-validate-split.ts:142-199`(`validateLandPartCause`) | 상속 분기는 `return`하지 않고 아래로 흘러 마지막에 도달 |
| ⑫ 엔진 leaf | `lib/tax-engine/transfer-split-part-cause.ts:114-157` | `mixed = cause ∈ {상속, 증여}`일 때만 구조 규칙. `cause="purchase"`면 **아무 규칙도 안 돈다**(`:118`) |
| ⑫ R-X5 | 〃 `:111·128` | 건물 원인이 상속·증여·이월과세·부담부증여이고 토지 원인이 **상속·증여**면 400 |
| ⑫ Zod | `transfer-tax-schema-base-shape.ts:278` · `transfer-tax-schema-split.ts:30` | `landAcquisitionCause` enum에 `"purchase"` **이미 포함** |

### 1.2 D2 상태의 ④⑧⑫ 실측

시드: 주택, 양도 12억(토지 7억/건물 5억 구분양도), 양도일 2026-06-30, 건물 상속(개시 2025-05-01, 피상속인 취득 2000-01-01), 토지 매매 2025-01-10, 토지 실가 3억·건물 평가액 4억, `hasSeperate…=true`. `landAcquisitionCause: "purchase"`·`landCauseHost: "inheritance"`는 지금 타입에 없어 캐스팅(테스트 `d2()`).

| # | 실측 | 값 | 의미 |
|---|---|---|---|
| B2 | ④ body에 `landAcquisitionCause` 없음 · `isSeparateAcquisition: true` · route 200 | 세액 283,866,000 · **토지 echo `acquisitionCause=inheritance` · `rateBasisRule=decedent` · `rateBasisAcquisitionDate=2000-01-01`** | 유효 원인이 `""`이라 ④가 안 싣고, 엔진은 자산 원인(상속)을 토지에도 적용 — 매매 토지를 피상속인 취득일로 통산 |
| B6-a | 같은 body + `landAcquisitionCause: "purchase"` 직접 | 200 · 283,866,000 · 토지 `purchase/own/2025-01-10`, **적용 기산일 2025-05-01**(주택 `max` = 건물 취득일) · 건물 `inheritance/decedent/2000-01-01` | 엔진은 purchase overlay를 받는다. 이 시드는 `max`가 토지 기산을 건물 취득일로 끌어올려 B2와 세액이 같다 — **세율이 파트별로 갈린다**(S3d·V-2) |
| B6-b | 토지를 건물 상속 **뒤**(2025-09-01)에 취득 | 200 · 327,591,000 · 토지 `own/2025-09-01/2025-09-01` | 토지 나중 취득은 정상 입력 |
| B6-c | **건물 파트 환산**(`buildingAcqMode: estimated` + 건물 기준시가) | **200 · 408,496,000** | 🔴 엔진 침묵 통과 — 상속·증여 건물 파트는 평가액=실가 1종이어야 한다(토지 G-2의 건물판). 일반건물은 막는다 |
| B6-d | `selfOwns: building_only` + purchase overlay | **200 · 20,553,500** | 🔴 침묵 통과 — R-X4의 purchase판 없음 |
| B6-e | 건물 상속개시일 2003-05-01(개별주택가격 최초공시 2005-04-30 전) | **200 · 124,366,000** | 🔴 침묵 통과 — Q-7의 건물판(경계일 전 §163⑨ 단서 2호) |
| B6-f | 토지 취득일 = 건물 상속개시일(같은 날) | 200 · 283,866,000 | 엔진 통과가 맞다(D1 T-4: ⑧만 차단) |
| A4 | 건물 상속 + 토지 `inheritance`/`gift` overlay | **400** `landAcquisitionCause` 「지원하지 않습니다」 | D2는 매매 overlay만 연다 — 이 차단은 유지 |
| B3 | ⑧ 상속 호스트 D2 상태 | 「상속개시일 평가액(상속세 신고가액)을 입력하세요」 · 칸 `publishedValueAtInheritance` | 숨은 칸 요구 |
| B3 | ⑧ 증여 호스트 D2 상태 | 「증여 신고가액을 입력하세요」 · 칸 `fixedAcquisitionPrice` | 〃 |
| B4 | stale 신고가액 9억 + 건물 가액 비움 | ④ body `inheritedAcquisition.reportedValue=900,000,000`(세액 불변 283,866,000) · **⑥ 자산 행 `acqPrice=900,000,000`, `pending=true`** | 화면에 없는 값이 전송·표시. 세액은 안 바뀐다(분리 실가 경로 — V-11의 클라이언트 쪽 답) |
| B5 | 동일세대 3키 | ④ body에 `decedentSameHouseholdBeforeInheritance=true` 등 전송 | V-3 결론 전에 상속주택 특례 사실이 엔진으로 간다 |
| 렌더 B3·B4·B5 | 상속 호스트가 지금 렌더하는 칸 | 피상속인 취득일 · 동일세대 토글 · 선순위 토글 · 평가방법 · (경계일 전이면 §164⑦ 환산 `inhHouseValLandArea`) / 증여: 증여일 · 증여자 취득일 | 아래 §2.3의 분류 대상 |

---

## 2. ⑤ 위젯

### 2.1 인과 순서(UI 순서 = 계산 순서)

```
취득 원인   (○매매) (●상속) (○증여) (○이월과세) (○신축)             ← 건물 원인(= 자산 단위 acquisitionCause)
[ 토지·건물 소유자 다름 ▢ ]  ← 토글이 켜져 있으면 비활성+사유(Q-5, 상호 잠금)
[ 토지는 다른 원인으로 취득 ▣ ]  건물은 상속·증여, 토지는 매수          ★ 상속·증여 호스트 신규
  ┌ 토글 패널 ──────────────────────────────────────────────────
  │ 안내 카드(amber): 건물은 상속(증여), 토지는 매매 · 파트 각각 산정
  │ 건물 피상속인 취득일 ____  (상속만 · 세율 통산 §104②1호)
  │ 증여: 이월과세 고지(배우자·직계존비속 10년 내 증여 → §97의2①)
  └──
┌ 취득일 영역  (CompanionAcqPurchaseBlock · 건물 원인 모드) ───────────
│ [토지·건물 취득일 다름 ▣🔒] 강제 ON·잠금
│ [ 토지 취득일 ____ ]  [ 건물 상속개시일(증여일) ____ ]   ← 라벨 파생, 건물 칸은 의제취득 클램프·배지 없음
│  ⚠ 같은 날 caption(Q-4) · 경계일 전 caption(V-12)
│ 축 A — 양도가액 구분(기존)
└──
┌ 취득가액 산정 방식 — 토지·건물 독립 선택 (LandBuildingSplitSection) ─
│ ① 토지   (●실거래가)(○환산)(○감정)(○매매사례)  ← 매매 4종 그대로
│ ② 건물   [ 실거래가 · 상속개시일 평가액 ] (고정 칩)
│          건물 상속개시일 평가액 [ ________ ]        ← testid `split-building-acq-price`
│ 자본적지출 [토지] [건물]  ·  기준시가 카드(기존 게이트)
└──
```

토글 위치는 D1과 같다 — 소유자 다름 직하·취득일 영역 위. 토글을 켜면 「취득일 다름」을 강제로 켠다(위→아래 연쇄).

### 2.2 R안(권장) vs N안

| | R안 — `CompanionAcqPurchaseBlock` 건물 원인 모드 재사용 | N안 — 신규 합성 컴포넌트 `BuildingCauseSplitBlock` |
|---|---|---|
| 방식 | 마운트 조건을 `purchase \|\| d2On`으로 넓히고 `buildingCause` prop 1개를 내린다. 날짜 2열·축 A·파트 블록·기준시가 카드·자본적지출·양도시 기준시가를 **그대로** 쓴다 | 날짜·축 A·파트·기준시가 섹션을 새 셸에서 다시 조립. 두 섹션이 받는 `BlockProps`(약 60 props)를 다시 만든다 |
| 장점 | 토지 매매 파트가 **매매 split과 동일 코드** → 토지 4종·환산·1990 전·의제취득·§166⑥ 안분이 자동으로 같다. testid 중복 0 | 상속 호스트 코드가 매매 블록과 안 섞인다 |
| 단점 | 매매 블록에 호스트 분기 5곳(PHD 토글·SelfBuilt·라벨·클램프·상단 축 숨김)이 생긴다. 블록 560줄 → ~590 | 새 셸 ~200줄 + 매매 전용 게이트 중복(`isSeparateAcq`·`acqStdRequired*` 1회 계산 규약을 또 지켜야 함) → 같은 카드 2곳 노출 위험 |
| D1과의 일관성 | D1은 호스트가 매매라 이 블록을 이미 썼다. D2는 **반대 방향의 같은 재사용** | — |

권장 = **R안**. 단 `LandPartCauseBlock`(D1 토글)은 건드리지 않고 **D2 토글은 신규 소형 컴포넌트**(`BuildingCauseMixBlock`, ~130줄)로 둔다 — D1 토글은 원인 라디오(상속·증여)·`LandSec164Card` 등 토지 원인 전용 분기가 많아 D2(고정 `purchase`)와 섞으면 `cause` 타입 가드가 퇴색한다.

### 2.3 상속 블록 칸 분류 (실측: `CompanionAcqInheritanceBlock.tsx` · `PostDeemedInputs.tsx` · `PreDeemedInputs.tsx` · `HouseValuationSection` 및 ④ 빌더)

분류 기호: **B** 건물 파트로 좁혀짐 · **R** 건물 평가액 칸으로 대체 · **A** 자산 단위 사실(결정 대기) · **H** 숨김(D2 유효 시 미마운트·④ 미전송·⑧ 미요구).

| # | 칸 (AssetForm 키) | 분류 | 근거 |
|---|---|---|---|
| 1 | 상속개시일 (`acquisitionDate`·`inheritanceStartDate`·`inheritanceDate` 3키 동시 기록, `:67-75`) | **B** | 주택 split 컨벤션상 `acquisitionDate`=건물 취득일(M-1a). 날짜 2열의 **건물 칸**에서 입력하되 쓰기는 상속 호스트일 때 3키 단일 배치(`inheritanceDatePatch` leaf 1개로 추출 — 두 곳이 갈리면 ⑥·④ 폴백(`inheritanceDate \|\| acquisitionDate`, `transfer-tax-api-houses.ts:154-160`)이 어긋난다). 증여는 `acquisitionDate` 1키 |
| 2 | 피상속인 취득일 (`decedentAcquisitionDate`) | **B** | 건물 파트 §104②1호 통산 — 실측 B6-a 건물 `rateBasisRule=decedent`. ④ 전송 유지(`transfer-tax-api.ts:495`·B5 긍정 짝). 위치는 토글 패널(D1 `DecedentDateField` 패턴). ⑧ 필수 유지(`:692`). ⑫는 요구하지 않는다(`schema`에 housing용 refine 없음) → ⑧이 더 엄격한 방향이라 막다른 길은 아님 |
| 3 | 증여자 취득일 (`donorAcquisitionDate`, 증여 호스트) | **B**(선택) | 단순 증여는 통산 없음(§104②2호는 이월과세만). 기존 블록의 「선택 입력」 그대로 유지하고 건물 칸 아래 둔다 |
| 4-8 | 동일세대 토글·개시일·거주 개월(`decedentSameHouseholdBeforeInheritance`·`decedentCohabitationHoldingStartDate`·`decedentCohabitationResidenceMonths`) + 합가 전 보유분(`parentalCareMergeInheritedHouse`) + 선순위 아님(`isRankingDisqualifiedInheritedHouse`) | **A**→ 기본 **H** | 소령 §154⑧3호·§155②는 「상속받은 **주택**」 단위 사실 — 「건물만 상속」에서 주택이 상속받은 주택인지는 V-3. **모름 = 혜택 불성립 + 확인 필요**(`feedback_unknown_fact_applies_unfavorably`)에 따라 기본 숨김·④ 미전송·안내 카드. 사용자 결정 Q-D2-UI3 |
| 9 | 평가방법 (`inheritanceValuationMethod`) | **H** | D1 토지 파트가 방법 선택 없이 단일 평가액 칸인 것과 같다. 방법은 ④ `reportedMethod`(결과 formula 문구)용인데 `inheritedAcquisition` 자체를 안 보낸다 |
| 10 | 신고가액 (`publishedValueAtInheritance`) | **R** | → `buildingAcquisitionPrice`(건물 상속개시일 평가액, 실가 고정). ⑧ 체인이 이 칸을 요구하는 막다른 길(B3)을 새 ⑧ 분기가 끊는다 |
| 11-14 | 보충적평가 보조계산 4키(`useSupplementaryHelper`·`supplementaryLandArea`·`supplementaryLandUnitPrice`·`supplementaryBuildingValue`) | **H** | 토지 개별공시지가×면적, 주택은 **개별주택가격(부수토지 포함)** — 결합 공시(`PostDeemedInputs.tsx:288-302`). 건물만 상속에서 토지분이 섞여 값이 깨진다(V-4) |
| 15 | 주택 종류 (`inheritanceAssetKind`) | **H** | 결합 공시 종류 선택용 |
| 16-26 | §164⑦ 환산 11키 (`inhHouseVal*`: Enabled·FirstDisclosureDate·LandArea·LandPricePerSqmAtTransfer/AtFirst/AtInheritance·HousePriceAtTransfer/AtFirst·BuildingStdPriceAtFirst/AtInheritance·UseHousePriceOverride·HousePriceAtInheritanceOverride) | **H** | 개별주택가격(결합 공시) 최초공시 전 취득 주택 환산 — 토지 면적·공시지가를 요구한다. 매수 토지에 상속 평가를 얹는 꼴. 경계일 전은 차단(Q-D2-UI4) |
| 27-31 | 토지등급 `pre1990Grade_current/prev/atAcq`·`pre1990PricePerSqm_1990`·`pre1990GradeMode` (+래치 `pre1990Enabled`) | **H** | 상속 호스트에서는 주택 §164⑦ 1990 전 경로용. 토지가 매매라 §164④(상속·증여 토지)는 해당 없다. D1-4 `LandSec164Card`는 `landSec164Applies`가 D1 유효 원인에서만 참이라 D2에서 안 열린다(술어 분리 §3.1) |
| 32 | 의제취득일 시점 기준시가 (`standardPriceAtAcq`, `PreDeemedInputs`) | **H** | 상속개시일 < 1985.1.1. 구간용. 건물 경계일 전 차단이 이 구간을 모두 포함 |
| 33 | 「가목 확인 불가」 선언 (`preDeemedClauseAUnconfirmed`) | **H** | ⑧ E-1(`clauseADeclarationError`)이 새 분기 앞에서 갈리므로 도달하지 않는다 |
| 34 | 가업상속공제 (`familyBusinessInheritance`) | **H** | `allowsFamilyBusinessInheritance`(`transfer-fb-gate.ts:36`) 게이트에 D2 조건 추가. 엔진도 가업상속 결합을 막아야 한다(R-X3의 purchase판 — §11) |
| 35 | 부담부증여 (`transferType`) | 토글 **비활성**(켜는 방향) | R-X1 — 엔진이 §159로 취득가액을 덮어쓴다. D1 `LandPartCauseBlock`의 `isBurdenedGift` 처리와 동일 |

→ 질문 1 답: **건물로 좁혀지는 칸 2(+선택 1), 대체 1, 자산 단위 대기 5, 숨김 약 25**. 「20여 칸」의 대부분이 결합 공시(`inhHouseVal*` 11·보충적평가 4·종류 1)와 §163⑨ 평가 체계 전체이고, 건물만 상속에서 **살아남는 입력은 날짜 2개와 평가액 1개**다.

### 2.4 컴포넌트·testid·tone

| 요소 | 결정 |
|---|---|
| 토글 | `ToggleCard variant="chip" tone="amber"`(= 취득·분리계산), 제목 「토지는 다른 원인으로 취득」(D1과 같은 개념·같은 제목), 설명 「건물은 상속·증여, 토지는 매수」, OFF에도 amber 유지 |
| 래퍼 앵커 | `data-field="landAcquisitionCause"`(⑧ 결합 제외·Q-5 이동 대상) · `data-testid="land-part-cause-building-cause"` — D1 testid(`land-part-cause-purchase`·`newconstruction-land-acq`)는 불변이라 기존 E2E 무수정 |
| 원인 라디오 | **없음**(고정 purchase). 신규 토글 1·라디오 0·native input 0 |
| 켜기 비활성 | 소유자 다름 ON · 부담부증여 · (가업상속 입력이 있으면) — 켜진 쪽은 언제든 끌 수 있게 「끄는 방향」은 막지 않는다(D1 U-3 규약) |
| ON 패치(단일 배치) | `{ landAcquisitionCause: "purchase", landCauseHost: <현재 취득원인>, hasSeperateLandAcquisitionDate: true, landAcqMode: asset.landAcqMode \|\| deriveLegacyPartAcqMode(asset), buildingAcqMode: "actual" }` — 토지 방식은 사용자가 이미 고른 값을 보존(매매 「취득일 다름」 ON 핸들러와 같은 규칙), 건물은 실가 고정 |
| OFF 패치 | `{ landAcquisitionCause: "", landCauseHost: "", hasSeperateLandAcquisitionDate: false, landAcqMode: "", buildingAcqMode: "" }` — 상속 호스트에는 「취득일 다름」을 따로 켤 UI가 없으므로 **되돌린다**(`:99` 정리와 같은 이유 — 남기면 입력 칸 없는 분리 계산 진입) |
| 안내 카드 | amber `ToneCard`: 「건물은 **상속**(증여), 토지는 **매매**로 취득한 자산입니다. 취득가액·보유기간을 토지·건물 **각각** 산정합니다 (소득세법 §95④·§104②, 같은 법 시행령 §163⑨).」 + caption 「건물 상속개시일은 아래 『건물 상속개시일』 칸에, 평가액은 『취득가액 산정 방식』의 건물 칸에 입력합니다. 건물은 실거래가(평가액)로 고정됩니다.」 — **V-4 결론 후 문구 확정**(개별주택가격 설명 문장은 결론 전 싣지 않는다) |
| 이월과세 고지 | 증여 호스트에서 D1 `land-gift-carryover-notice`와 같은 문구(건물 증여·배우자 직계존비속 10년 내 → §97의2① 이월과세 대상, 이 화면 미계산). 상수 공유 |
| 포커스 전체 선택 | `SelectOnFocusProvider` 자동 — 개별 `onFocus` 금지 |
| placeholder | 숫자 예시 0(형식은 `FieldCard hint`) |

### 2.5 건물 원인 모드에서 바뀌는 매매 블록 칸 (조건 = D2 술어 1회 계산 → 하위 주입)

`CompanionAcquisitionCauseSection`이 `buildingCause = effectiveBuildingCauseMix(asset)`를 **한 번** 계산해 `CompanionAcqPurchaseBlock` → `CompanionAcqDateSection`·`LandBuildingSplitSection`에 prop으로 내린다(`landCause` 주입과 같은 규약, 재파생 금지).

| 칸 | 위치 | 변경 |
|---|---|---|
| 「취득일 다름」 | `CompanionAcqDateSection.tsx:90-113` | `buildingCause`면 강제 ON·`disabled`(기존 `selfOwns` 잠금과 OR) |
| 건물 취득일 라벨 | `acqDateLabel`(`CompanionAcqPurchaseBlock.tsx` `isSplit ? "건물 취득일"`) | 「건물 상속개시일」/「건물 증여일」 |
| 건물 칸 클램프·배지 | `CompanionAcqDateSection.tsx` `handleAcquisitionDateBlur`·`isDeemedAcquisitionDate` | 🔴 `buildingCause`면 **끈다** — 상속개시일·증여일은 사실값이라 1985-01-01로 덮어쓰지 않는다(D1 T-6 건물판). **토지 칸은 그대로**(매매 토지는 의제취득 §98 적용 대상) |
| 건물 취득일 쓰기 | `onAcquisitionDateChange`(Section `:175`) | 상속이면 3키 단일 배치(`inheritanceDatePatch`) |
| 상단 「취득가액 산정 방식」 라디오·총액 | `CompanionAcqAmountSection`·`:363` | `hideAssetAcqAxis` 이미 있는 prop을 켠다 — 날짜 미입력 상태에서 4종 라디오가 상속 호스트에 뜨는 것을 막는다 |
| 건물 방식 4종 | `LandBuildingSplitSection` ② | `buildingCause`면 **고정 칩** 「실거래가 · 상속개시일 평가액」/「실거래가 · 증여 신고가액」(`data-testid="part-acq-mode-building-fixed"`) |
| 건물 가액 칸 | `PartAcqInputs.tsx` | 라벨 파생 「건물 상속개시일 평가액」/「건물 증여 신고가액」 + hint(상수 공유) — testid·`field` 앵커 불변 |
| PHD 토글 | `CompanionAcqPurchaseBlock.tsx` PHD 블록 | `buildingCause`면 미렌더(+④·⑧ 무시 — `phdFlagEffective` 합성 술어) |
| 신축·증축 `SelfBuiltSection` | 〃 말미 | `buildingCause`면 미렌더 — 매매 취득 전용 특례 |
| 토지 4종·환산 입력·1990 전 입력 | 기존 | 변경 없음(토지 매매 파트) |

---

## 3. 필드 충돌·stale

### 3.1 🔴 술어 분리 (게이트 확대가 깨우는 잠자던 결함 — `feedback_ui_gate_expansion_activates_latent_defect`)

`effectiveLandAcquisitionCause`의 반환을 `"purchase"`까지 넓히면 **truthy 소비처**가 D2 값을 D1 의미로 읽는다. 소비처 전수(코드 확인, grep `effectiveLandAcquisitionCause|phdFlagEffective|landPartCauseApplicable`):

| 소비처 | 위치 | 현행 의미 | D2 값("purchase")을 그대로 받으면 |
|---|---|---|---|
| 매매 블록 `landCause` 주입 | `CompanionAcqPurchaseBlock.tsx:317` → DateSection·SplitSection | 토지가 상속·증여 → 「취득일 다름」 강제·**토지 방식 칩 고정**·라벨 상속개시일·클램프 끔 | 🔴 매매 토지를 상속 토지 UI로 고정 |
| `landSec164Applies` | `transfer-pre1990-housing-land-bridge.ts:31` | `isSec163_9LandProviso(cause, 날짜)` | 안전(purchase는 단서 아님) |
| `separateAcqPartsSum` pending | `transfer-tax-split-acq-mode.ts:252` | 동일 단서 판정 | 안전 |
| `phdFlagEffective` | `phd-toggle-scope.ts:85` | 토지 원인 유효면 PHD 무시 | 의도(D2도 PHD 무시) — 합성 필요 |
| `AssetOwnershipSplitSection` | `:41` | 유효면 소유자 다름 켜기 비활성 | 의도(Q-5 상호 잠금) — 합성 필요 |
| `landPartCauseSameDay` | `transfer-land-part-cause.ts:61` | 같은 날 차단 | 의도(Q-4) — 합성 필요 |
| ④ `buildLandPartCausePayload` | `transfer-tax-api-split.ts:272` | 유효 원인 전송 | 의도 — 확장 필요(타입 `"inheritance"\|"gift"` → +purchase) |
| ⑧ `validateLandPartCause` 사실 | `transfer-tax-validate-split.ts:150·160·162·177` | ④가 보내는 값 공급 | 의도 — 합성 필요 |
| `LandPartCauseBlock` | `:108·112` | D1 토글 렌더·상태 | D1 호스트 그대로 |

**결정**: D1 술어는 의미 불변(`effectiveLandAcquisitionCause` → 반환형 `"" \| "inheritance" \| "gift"`로 **좁힘**, 호스트 집합 `newConstruction \| purchase` 불변). D2 술어를 신설한다.

```
buildingCauseMixApplicable(a) = a.acquisitionCause ∈ {inheritance, gift} ∧ isLandBuildingSplitable(a.assetKind) ∧ ¬a.isMixedUseHouse
effectiveBuildingCauseMix(a)  = applicable ∧ a.hasSeperateLandAcquisitionDate ∧ a.landCauseHost === a.acquisitionCause
                                ∧ a.landAcquisitionCause === "purchase" ∧ a.transferType ≠ "burdened_gift"
                                ? a.acquisitionCause : ""                       // 반환 = 건물 원인("inheritance" | "gift")
landCauseMixActive(a)         = !!effectiveLandAcquisitionCause(a) || !!effectiveBuildingCauseMix(a)   // 합성 술어
engineLandOverlay(a)          = effectiveLandAcquisitionCause(a) || (effectiveBuildingCauseMix(a) ? "purchase" : "")  // ④·⑧이 보낼 값
```

합성 술어를 쓰는 곳: `phdFlagEffective` · `AssetOwnershipSplitSection` · `landPartCauseSameDay` · ④ `buildLandPartCausePayload` · ⑧ 사실 공급. **쓰지 않는 곳**: 매매 블록 `landCause` 주입(D1 전용) · 브리지 · `separateAcqPartsSum` pending. 하나의 `landPartCauseDateNotice`는 Q-4(같은 날)만 합성.

> 한 함수로 합치고 소비처마다 `=== "inheritance"` 분기를 다는 안은 기각했다 — 소비처 9곳 중 하나만 빠뜨려도 침묵 오답이고, 타입이 못 잡는다(truthy 검사). 좁힌 반환형이면 D1 소비처에 `"purchase"`가 들어올 경로가 컴파일 단계에서 사라진다.

### 3.2 키·의미 재사용

| 키 | 변경 | 비고 |
|---|---|---|
| `landAcquisitionCause` | 타입 `"" \| "inheritance" \| "gift"` → `+ "purchase"` | 같은 키를 **호스트에 따라 다른 의미**로 쓴다: 신축·매매 호스트 = 토지의 상속·증여 overlay, 상속·증여 호스트 = `"purchase"`만 유효. 유효 판정이 (호스트, 값) 쌍을 본다. 엔진 키와 일치(Q-2) |
| `landCauseHost` | `+ "inheritance" \| "gift"` | **cause별 태그**(권장 Q-D2-UI5): 상속 ↔ 증여 전환 시 기존 패치(`:99`·`:102`)가 `hasSeperate…`를 끄고 태그를 비워 토글이 꺼진다(입력값 보존·재켜기 시 복원). 추가 코드 0 |
| 그 외 | **신규 AssetForm 키 0** | 건물 평가액=`buildingAcquisitionPrice`, 건물 방식=`buildingAcqMode`, 건물 날짜=`acquisitionDate`, 토지 날짜·가액=`landAcquisitionDate`·`landAcquisitionPrice` 재사용 |
| `landDecedentAcquisitionDate` | **쓰지 않는다** | D1 토지 피상속인 칸. D2의 피상속인은 건물이라 자산 단위 `decedentAcquisitionDate` |

### 3.3 호스트 전환 정리 (D0 G-6 · D1-2 F2 방식 — 읽는 쪽 파생)

| 조작 | 저장 상태 | D2 유효 | 비고 |
|---|---|---|---|
| 상속 + 토글 ON → 증여 | 증여·`hasSep=false`(`:99`)·태그 `""`(`:102`)·overlay `purchase` | 없음 | 토글 OFF로 보임. 건물 평가액·토지 값 보존 |
| 상속 + 토글 ON → 매매 | 매매·`hasSep=true`·태그 `""`·overlay `purchase` | D1 유효 원인 없음 | **매매 호스트에서 `hasSep`이 켜진 채라 「취득일 다름 ON」이 보인다** — 신축 → 매매 S1과 같은 기존 현상(D1 §3.5), 건물 가액 입력칸이 보이므로 막다른 길 아님 |
| 신축/매매 D1 토글 ON → 상속 | 상속·`hasSep=false`·태그 `""`·overlay `inheritance|gift` | D1·D2 모두 없음 | overlay가 `inheritance`라 D2(`=== "purchase"`) 무효 ✔ — D1 잔재가 D2 값으로 오독되지 않는다. 테스트 A2 |
| 세션 복원(구) | `landCauseHost` 없음 | `deriveLandCauseHost`(`calc-wizard-asset-migrate-land-cause.ts`) 변경 없음 | 상속·증여 호스트 구 세션은 `""` — D2 값은 신규 세션에서만 생긴다 |

**E2E 시드**: D2 시드는 `landCauseHost:"inheritance"`를 **함께** 넣는다(빠지면 normalize가 지운다 — `feedback_e2e_seed_erased_by_restore_normalization`).

---

## 4. 14 동기화 지점

| 지점 | D2 담당 | 내용 |
|---|---|---|
| ① 폼 상태 | UI | `landAcquisitionCause` `+"purchase"` · `landCauseHost` `+"inheritance"\|"gift"` (`lib/stores/calc-wizard-asset.ts:583·590`, 타입 파일 951줄 — +6) |
| ② initial | UI | 변경 0(`""`) |
| ③ normalize | UI | 변경 0. 단 **불변식 점검**: 구 세션에서 `landCauseHost` ∈ D2 값이 존재할 수 없음(신규 값) — 도출 함수 수정 불필요 |
| ④ API 변환 | UI | `buildLandPartCausePayload`: `engineLandOverlay`를 싣고 D2면 `landDecedentAcquisitionDate`·`landSec164Value`·`isPartialAreaTransfer`는 **싣지 않는다**. 아래 §4.1 숨은 값 미전송 6곳. 3경로(단건·다건·컴패니언)는 이 빌더를 공유 — 단건 `transfer-tax-api.ts:499`·다건 `multi-transfer-tax-api.ts:292`·컴패니언 `transfer-tax-api-companion-payload.ts:205`(코드 확인, D1 anchor A5 방식으로 D2 payload 동일성 anchor 추가) |
| ⑤ 위젯 | UI | §2 전체. `CompanionAcquisitionCauseSection`: 신규 토글 마운트 · 매매 블록 마운트 조건 확대 · 상속/증여 블록·`GiftHouseStdPriceSection`·`GiftLandStdPriceSection`·`PreDeemedEstimatedNotice`·`FamilyBusinessInheritanceTransferSection` 마운트 조건에 `!d2On` |
| ⑥ 사이드바 | UI | `separateAcqPartsSum`은 `isSeparateAcquisition` 분기가 상속 폴백보다 앞이라 자동 정합(`calc-wizard-store.ts:363-371`, 실측 `full` 700,000,000). **자산 행**(`transfer-per-asset-summary.ts:460`)의 상속 폴백이 pending일 때 숨은 `publishedValueAtInheritance`를 읽는다(실측 B4) → `!effectiveBuildingCauseMix(a)` 게이트 +1줄. 건물 가액 비움 → pending(0) |
| ⑦ 결과 | UI | §6 |
| ⑧ validation | UI | §5. 새 분기·`validateMultiSupportedMode` 면제·합성 술어 |
| ⑨ Zod enum 메인 | 엔진 확인 | `landAcquisitionCause` enum에 `"purchase"` 이미 있음(`base-shape:278`) — 변경 없을 것(코드 확인) |
| ⑩ Zod enum 컴패니언 | 엔진 확인 | `schema-split.ts:30` 동일(공유 정의로 보임 — **확인 필요**: 컴패니언 경로가 이 정의를 쓰는지) |
| ⑪ 자산-수준 `acquisitionDate` fallback | 엔진 확인 | 변경 없을 것 |
| ⑫ Zod 입력 객체 | 엔진 | `refineSplitPartCause`(주 자산+컴패니언)에 purchase overlay 규칙 공급 — §11. UI가 새로 보내는 키는 0 |
| ⑬ `callTransferTaxAPI` body spread | 확인 | `buildLandPartCausePayload` spread가 이미 body에 있음(`landAcquisitionCause` 키 기존). 값만 `"purchase"` 추가 |
| ⑭ Route 엔진 input 매핑 | 확인 | `engine-input.ts:330` · `bundled-split-helpers.ts:388` · `multi/route.ts:198`이 `landAcquisitionCause`를 그대로 매핑(코드 확인) — 변경 없을 것 |

### 4.1 자산 단위 상속 소비처 — 「건물만 상속」에서 지금 보내는 값 (실측 + 코드 확인)

| 소비처 | 위치 | 지금 D2 상태에서 보내는 값 | D2 처리(권장) |
|---|---|---|---|
| `inheritedAcquisition`(§163⑨ STEP 0.45) | `transfer-tax-api-inheritance.ts:103-126` `reportedRaw>0 \|\| (상속 ∧ sec164Ready)` | stale 신고가액이 있으면 전송(B4, 세액 불변) | D2 유효 시 `{}` — **보내지 않는다** |
| `inheritedHouseValuation`(§164⑤~⑦ 환산) | 〃 `buildInheritedHouseValuationPayload` ← `sec164HouseStatus`(`isSec163_9Cause`) | 11칸 완비 시 전송 | D2 유효 시 `{}` |
| 상가 §164⑥ | 〃 `buildCommercialInheritanceValuationPayload` | 해당 없음(housing) | 변경 0 |
| 건물 세율 통산 피상속인 취득일 | `transfer-tax-api.ts:495` · `multi-transfer-tax-api.ts:322` · `companion-payload.ts:442` | `decedentAcquisitionDate` | **유지**(건물 §104②1호, 실측 B6-a) |
| 동일세대 3키·합가·선순위 | 위 3곳 + `transfer-tax-api-houses.ts:164-168` | 전송(B5) | D2 유효 시 미전송(Q-D2-UI3 A) |
| 상속주택 7호 `isInherited`·`inheritedDate` | `transfer-tax-api-houses.ts:142·154-160` | `acquisitionCause==="inheritance"`면 true — **「5년 내 상속주택」 중과 배제(영 §167의3①7호)가 건물만 상속에도 서는지 V-3** | D2 유효 시 `isInherited:false`(Q-D2-UI3 A) |
| 거주요건 통산 | `transfer-tax-api-residence.ts:87-91` | 동일세대 사실 | D2 유효 시 미전송 |
| 가업상속 | `transfer-fb-gate.ts:36` | 게이트 true | D2 유효 시 false |
| 자경농지 피상속인 합산 | `transfer-tax-api-reductions.ts:63` / `Step5.tsx:177` | 농지 전용 | 해당 없음(housing) |
| 다건 상속 취득가액 | `multi-transfer-tax-api.ts:217-221`·`multi-transfer-tax-validate.ts:146` | `fixedAcquisitionPrice \|\| publishedValueAtInheritance` · 신고가액 없으면 **차단** | 🔴 다건 D2는 분리 경로를 타므로 acquisitionPrice를 안 쓰지만 ⑧ 다건 가드가 막는다 → 면제 필요(Q-D2-UI6) |
| 동일 이름 다른 메뉴 | `one-house-exemption-*`(판정 메뉴) · `InheritedSameHouseholdField` | 판정 메뉴 자체 폼 | 영향 없음(판정 메뉴는 `CompanionAcquisitionCauseSection`을 쓰지 않는다 — 코드 확인: importer는 `AssetSectionAcquisition.tsx` 1곳) |

---

## 5. ⑧ 규칙 · 막다른 길 방지

### 5.1 새 분기 `validateBuildingCauseSplit` (신규 파일 `transfer-tax-validate-building-cause.ts` ~90줄)

호출 위치: `validateAssetAcquisition`에서 용도변경(`validateUsageConversion`)·부담부증여(`validateBurdenedGiftAsset`) **직후**, `sec164PartialInputError`(`:130`) **앞**. 신축 분기(`:341`)가 `return validateSplitDirectInputs`로 끝나는 모양과 같다.

```
if (effectiveBuildingCauseMix(asset)) return validateBuildingCauseSplit(asset, label, formTransferDate)
  1) 건물 취득일 필수          field acquisitionDate     (「건물 상속개시일(증여일)을 입력하세요」)
  2) 상속: 피상속인 취득일 필수 field decedentAcquisitionDate (기존 `:692` 규칙 이전 — 증여는 요구 없음)
  3) 건물 경계일 전 차단        field acquisitionDate     (Q-D2-UI4 · V-12 — 엔진 leaf와 같은 술어)
  4) validateSplitDirectInputs(asset, label)  // 첫 줄 validateLandPartCause: 구조·G-12·Q-4·토지 모드, 이후 V1~V9
```

도달하지 않게 되는 규칙(= 숨은 칸 요구): `sec164PartialInputError` · `clauseADeclarationError`(E-1) · `preDeemedConversionInputError`(PD-1) · `postDeemedClauseARequiredError` · 상속 `:692` · 증여 `:689`. 실측 B3의 두 요구가 사라진다.

### 5.2 ⑧≡⑫ 격자 (호스트 상속·증여 × 입력 셀)

| # | 셀 | ⑧ (D2 설계) → 이동 칸 | ⑫ (현행 실측 → 필요) | 일치 |
|---|---|---|---|---|
| N1 | 정상: 토지 2025-01-10 매매 + 건물 상속 2025-05-01 + 평가액 | 통과 | 200 | ✔ |
| N2 | 정상 증여 | 통과 | 200 | ✔ |
| N3 | 토지가 건물 상속 **뒤** 취득 | 통과 | 200 (327,591,000) | ✔ |
| N4 | 피상속인 취득일 비움(상속) | 차단 `decedentAcquisitionDate` | **200**(⑫ 미요구) → 엔진 G-3 건물판 권장 | ⑧ 더 엄격(막다른 길 아님) |
| N5 | 건물 평가액 비움 | 차단 `buildingAcquisitionPrice` (V1) | 400 | ✔ |
| N6 | 토지 취득일 비움 | 차단 `landAcquisitionDate` (G-12) | **현행 200**(purchase는 leaf 무규칙, 토지 파트 침묵 탈락) → **엔진 규칙 필요** | ✘→엔진 |
| N7 | 같은 날 | 차단 `landAcquisitionDate` (Q-4) | 200 (T-4: ⑧만) | ⑧ 더 엄격(의도) |
| N8 | 건물 파트 환산·감정·매매사례(stale) | 차단(칸 없음 — 「껐다가 다시 켜면 실거래가로 고정」 안내, D1 M4와 같은 처리) | **현행 200**(B6-c) → **엔진 규칙 필요** | ✘→엔진 |
| N9 | 소유자 분리 | 토글 켜기 비활성 + ⑧ 차단 `landAcquisitionCause` | **현행 200**(B6-d) → **엔진 규칙 필요** | ✘→엔진 |
| N10 | 건물 경계일 전 | 차단 `acquisitionDate` | **현행 200**(B6-e) → **엔진 규칙 필요** | ✘→엔진 |
| N11 | 부담부증여 | 토글 켜기 비활성 | 400(burdenedGiftInfo 요구 — 사실 공급 후 R-X1 purchase판 **확인 필요**) | 확인 필요 |
| N12 | PHD 플래그(자동 ON) | 무시(⑤ 미렌더·④ 미전송·⑧ 미요구, T-3) | 직접 호출 시 R-X2 purchase판 확인 필요 | 층 분리 |
| N13 | 가업상속 입력 | ⑤ 숨김 + ⑧ 미요구(D2 유효 시 입력 칸이 안 보임) | R-X3 purchase판 확인 필요 | 확인 필요 |
| N14 | 건물 원인 이월과세 | 토글 미노출 | 400 `carryoverTaxation` 요구 + R-X5 유지 | ✔ |
| N15 | 건물 상속 + 토지 상속·증여 overlay | UI 경로 없음 | **400**(A4 실측) | ✔ |

→ 「⑧ 통과 ↔ ⑫ 400」 막다른 길 위험은 **0**(⑫가 더 엄격한 셀이 없다). 반대 방향 「⑧ 차단 ↔ ⑫ 200」(N4·N7)은 의도, **「⑧ 차단 칸이 화면에 없음」**이 N8 하나(D1 M4와 같은 수용: 안내 문장에 방법 포함). **✘→엔진 4건(N6·N8·N9·N10)은 엔진이 규칙을 넣어야 ⑧≡⑫가 닫힌다** — 안 넣으면 API 직접 호출이 침묵 오답이다.

### 5.3 V-2 · V-3 · V-4 결론별 UI 대안

| 축 | 엔진 결론 | UI 영향 |
|---|---|---|
| **V-2** 세율 분기(S3d: 건물 기본세율·토지 단기) | (a) 파트별 세율 확정 | 변경 0. 결과는 D1-3 echo 행 그대로(§6) |
| | (b) 주택 일체 단일 기산 | 입력 변경 0. 결과 「세율 기산일」을 단일 값으로 — `rateBasisShown` 거짓 경로(원인만 표시)로 수렴 |
| | (c) 불허 | 상속·증여 호스트 토글을 **미노출**(또는 `disabled` + 사유) + ⑫ 새 규칙 + ⑧ 메시지. 클라이언트 작업은 D2-2 대신 안내 카드 1장 |
| **V-3** 상속주택 특례(§154⑧3호·§155②·§167의3①7호)가 건물만 상속에 서는가 | (a) 선다 | 동일세대·선순위·합가 칸을 건물 파트 옆에 노출(기존 컴포넌트 재사용), ④ 전송 유지, ⑥⑧ 변경 0 |
| | (b) 안 선다 | **기본안과 같다** — 숨김·미전송·안내 카드 「건물만 상속·증여받은 주택에는 상속주택 특례를 적용하지 않습니다」 |
| | (c) 부분 | 칸별 분기 — 설계 재개 |
| **V-4** 건물 평가액 입력원(결합 공시와의 관계) | (a) 건물분 직접입력 가능 | 현안(건물 평가액 칸) |
| | (b) 결합 공시를 건물분으로 안분해야 함 | **자동 안분 금지**(정책) — 사용자가 안분 결과를 건물 평가액 칸에 입력하고 hint에 근거 설명. 엔진·UI 모두 안분 코드 신설 금지 |
| | (c) 건물 단독 평가 불가 | 토글 불허(V-2 (c)와 같은 처리) |
| **V-12** 건물 경계일(신규) | 건물 상속·증여일이 §163⑨ 단서 2호 구간(건물 기준시가 고시 전)이면 max(평가액, 영 §164⑤~⑦) | D2-1은 **3중 차단**(경계일 = 개별주택가격 최초공시 2005-04-30, 현행 주택 게이트 상수 `HOUSE_FIRST_DISCLOSURE`와 동일 — 보수적 상위 집합). 입력 카드는 D2-4(영 §164⑤ 건물 최초고시 기준시가 × 기준율 입력 — 일반건물 `transfer-pre1990-gb-bridge.ts`와 별개 체계 **확인 필요**) |

---

## 6. ⑦ 결과 표시

| 항목 | 방향 중립 여부 | 결정 |
|---|---|---|
| `summarizeSplitGain.mixedCause`(`transfer-tax-split-display.ts:224-226`) | 중립 — 두 파트 원인이 다르면 참(건물 inheritance ≠ 토지 purchase) | 변경 0 |
| `splitCauseLabel` | 중립 — purchase/inheritance/gift 모두 정의 | 변경 0 |
| `partTag`(`split-acq-text.ts:42-49`) | 중립 — `mixedCause ∧ cause ∈ {상속, 증여}`면 **그 파트**에 `LAND_CAUSE_META[cause].valueLabel`을 붙임 → 건물이면 「건물(상속개시일 평가액)」 | 동작은 맞지만 상수 이름이 「LAND」 — `PART_CAUSE_VALUE_LABEL`로 개명하거나 건물용 별칭 1개(라벨 어휘 = 입력 화면 「건물 상속개시일 평가액」과 동일해야 검증된다) |
| `splitCauseDateText`·카드 「취득 원인」 행 | 중립 | 변경 0 |
| `splitRateBasisNote`(`:75-84`) | 🔴 **방향 편향** — 법정 기산일과 적용 기산일이 다르면 「…보다 **주택 취득일**이 늦어 주택 취득일부터 — 주택부수토지로서의 보유기간」. D2 토지 파트에서 이 문장은 「주택 취득일」 = 건물 **상속개시일**이고, 같은 화면의 건물 행은 「피상속인 취득일(2000-01-01)」이라 독자가 모순으로 읽는다 | 반대 파트의 `acquisitionCause`를 읽어 「건물 취득일(상속개시일·증여일)」로 문구 분기(표시 전용, 재계산 아님). 엔진 `max` 앵커 정의(V-2) 확정 후 문구 확정 |
| `acquisitionBasis`(D1-4) | 토지 전용(`splitAcqBasisView`) | D2-1~3: 건물 비교 없음 → 미표시. D2-4에서 건물 비교를 열면 `SplitAcqBasisView`를 파트 일반화(`SPLIT_LAND_VALUE_LABEL`·`SPLIT_SEC164_VALUE_LABEL`은 토지 전용 어휘) |
| 신고서 split-2col | 중립 — 건물 열 = `primary.acquisitionDate`(상속개시일) · 토지 열 = 원인이 다를 때 echo(`FilingFormTableHelpers.ts` split-2col, 코드 확인) | 변경 0. 건물 열 각주 「세율 기산일: 피상속인 취득일」 이미 파트 루프(`for k of land,building`)가 처리 |
| 4뷰(카드·상세명세서·신고서·PDF)·다건 카드 | 한 leaf(`summarizeSplitGain`)를 읽으므로 자동 | 변경은 위 2개 상수·1개 문구뿐 |

D1-3에서 남긴 Low(다건 상세명세서·건별 신고서 ※ 없음)는 D2도 그대로 상속한다 — 별건.

---

## 7. 변경 파일 (열 때의 줄 수 / 예상)

| 파일 | 현재 | 예상 | 비고 |
|---|---|---|---|
| `lib/calc/transfer-land-part-cause.ts` | 103 | ~175 | D2 술어 4개·합성 술어·반환형 좁힘 |
| `lib/stores/calc-wizard-asset.ts` | 951 | 957 | 타입 파일(기존 초과) +6 |
| `lib/calc/transfer-tax-api-split.ts` | 287 | ~300 | 오버레이 전송 |
| `lib/calc/transfer-tax-api-inheritance.ts` | 241 | ~250 | 숨은 값 미전송 게이트 |
| `lib/calc/transfer-tax-api-houses.ts` | 381 | ~388 | `isInherited`·동일세대 게이트 |
| `lib/calc/transfer-tax-api-residence.ts`·`multi-transfer-tax-api.ts`·`transfer-tax-api-companion-payload.ts`·`transfer-tax-api.ts` | — | +3~6 각 | 3경로 동일 게이트(헬퍼 1개를 부름) |
| `lib/calc/transfer-tax-validate-building-cause.ts` | 신규 | ~90 | ⑧ 새 분기 |
| `lib/calc/transfer-tax-validate-acquisition.ts` | **733** | 737 | 분기 호출 +4 (**700 착지 목표 초과 구간 — 더 늘리면 분리**) |
| `lib/calc/transfer-tax-validate-split.ts` | 619 | ~640 | 사실 공급 합성 |
| `lib/calc/multi-transfer-tax-validate.ts` | 260 | 263 | 신고가액 요구 면제 |
| `lib/calc/phd-toggle-scope.ts` | 111 | ~117 | `phdFlagEffective` 합성 |
| `lib/stores/transfer-per-asset-summary.ts` | 606 | 610 | 상속 폴백 게이트 |
| `components/calc/transfer/BuildingCauseMixBlock.tsx` | 신규 | ~130 | D2 토글·패널 |
| `components/calc/transfer/CompanionAcquisitionCauseSection.tsx` | 342 | ~370 | 마운트 조건 5곳 + 3키 쓰기 |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` + `.types.ts` | 560 / 172 | ~590 / 175 | `buildingCause` prop |
| `components/calc/transfer/CompanionAcqDateSection.tsx` | 238 | ~262 | 라벨·잠금·클램프 |
| `components/calc/transfer/LandBuildingSplitSection.tsx` | 493 | ~520 | 건물 고정 칩 |
| `components/calc/transfer/PartAcqInputs.tsx` | 130 | ~140 | 건물 가액 라벨 |
| `components/calc/transfer/AssetOwnershipSplitSection.tsx` | 90 | 93 | 합성 술어 |
| `lib/calc/transfer-fb-gate.ts` | 37 | ~40 | 가업상속 게이트 |
| `lib/tax-engine/transfer-tax-split-display.ts` · `components/calc/results/transfer/split-acq-text.ts` | 320 / 152 | +8 / +4 | 문구 분기(⑦) |
| 신규 테스트 | | | `transfer-land-part-cause.d2.test.ts`·`…render.test.tsx`(Pre-Do를 전환)·`e2e/transfer-acq-cause-mixed-d2.spec.ts` |

모두 800줄 미만. `transfer-tax-validate-acquisition.ts`(733)만 분리 목표 구간이라 D2 코드는 전부 신규 파일에 둔다.

---

## 8. 검증 계획

- **Pre-Do(완료)**: 활성 19 / todo 30. 차별력 — A2는 D1 태그 비교를 `===`에서 느슨하게 바꾸면, A4는 R-X5를 풀면, B1~B5는 D2 구현 순간 깨져 기대 교체를 강제한다.
- **mutation probe(Do)**: ① 술어 분리 — D1 `effectiveLandAcquisitionCause`가 `"purchase"`를 반환하게 하면 D1 anchor A1/매매 호스트 칩 테스트가 죽어야 함 ② D2 태그 비교 ③ ⑧ 분기 순서(앞/뒤) ④ ④ 숨은 값 게이트 6곳 각각 ⑤ ⑥ 자산 행 게이트 ⑥ 3키 쓰기 leaf ⑦ 합성 술어 5곳 각 1건 이상 KILLED.
- **⑧≡⑫ 격자**: §5.2 15셀을 호스트 2 × 셀 활성 테스트로(D1-Z3 방식).
- **E2E**: 상속 → 토글 ON → 날짜 2열·건물 가액 → 계산 → 결과 카드 「취득 원인」「세율 기산일」, 요청 body(`landAcquisitionCause:"purchase"`·`landAcqMode`·`buildingAcquisitionPrice`·`decedentAcquisitionDate`·**`inheritedAcquisition` 부재**), 상속 ↔ 증여 ↔ 매매 전환 stale, 소유자 다름 상호 잠금. 시드에 `landCauseHost` 동봉.
- **회귀**: D0·D1·D1-4 anchor 전건, 상속 호스트 기존 E2E(동일세대·§164⑦·post-deemed 가시성 3개 `.test.tsx`), 일반건물 혼합.
- **Check**: `ui-engine-sync-checker`(14지점) + `acquisition-cost-review`(§163⑨·§104②·§95④).

## 9. PR 순서

| PR | 범위 | 이유 |
|---|---|---|
| **D2-1** | 엔진 leaf D2 규칙(§11) + ⑫ 공급 + ①타입 + 술어 분리 + ④(오버레이·숨은 값 게이트) + ⑧ 새 분기 + ⑥ 자산 행 게이트 | **토글을 노출하지 않는다 → 화면 변화 0**. API 직접 호출의 침묵 통과 4건(N6·N8·N9·N10)을 먼저 막는다 |
| **D2-2** | ⑤ `BuildingCauseMixBlock` + 매매 블록 건물 원인 모드 + 마운트 조건 | 입력 경로 개방 |
| **D2-3** | ⑦ 문구 분기·상수 개명 | 표시 전용(세액 불변) |
| **D2-4** | 건물 경계일 전 max 입력(법령 결론 시) | D1-4와 같은 후속 |

---

## 10. 사용자 결정 질문

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| **Q-D2-UI1** | 위젯 구현 방식 | **R안** — 매매 블록을 건물 원인 모드로 재사용 | §2.2 — 토지 매매 파트가 매매 split과 한 코드. N안은 `BlockProps` 60개·1회 계산 규약 중복 |
| **Q-D2-UI2** | 상속·증여 블록 처리 | **ON이면 미마운트**(슬림 모드 prop 신설 안 함) | 살아남는 입력이 날짜 2·평가액 1뿐(§2.3). 날짜는 날짜 2열, 피상속인은 토글 패널로 이동 |
| **Q-D2-UI3** | 상속주택 특례(동일세대·선순위·합가·7호)를 건물만 상속에 적용할지 | **A. 적용하지 않음 + 안내 카드 + 「확인 필요」** — 숨김·미전송·`isInherited:false` | V-3 미결. 「모름 = 혜택 불성립 + 확인 필요」 정책(2026-10-04). B 적용은 엔진 결론이 선 뒤 칸 재노출만으로 가능(되돌리기 쉬움) |
| **Q-D2-UI4** | 건물 상속·증여일이 경계일(2005-04-30) 전 | **D2-1은 3중 차단 + 안내, max 입력은 D2-4** | D1 U-1과 같은 판단. 자동 대체 금지. 경계일은 보수적 상위 집합 — 실제 경계(V-12)가 더 이르면 후속에서 좁힌다 |
| **Q-D2-UI5** | 호스트 태그 | **cause별 태그**(`"inheritance" \| "gift"`) | 상속 ↔ 증여 전환 시 기존 패치가 이미 토글을 끈다 — 추가 코드 0. 그룹 태그는 `:99`·`:102` 수정이 필요 |
| **Q-D2-UI6** | 다건(연간 합산) 경로 | **허용** — `validateMultiSupportedMode` 신고가액 요구를 D2 유효 시 면제하고 D1처럼 payload 동일 anchor. 엔진 multi route 수용은 **확인 필요**(미실행) | 다건 화면이 단건 마법사를 임베드해 토글이 어차피 보인다. 확인 전 임시로 명시 차단하는 대안도 있음 |
| **Q-D2-UI7** | PR 분할 | **4분할**(§9) | D2-1이 화면 변화 0이라 침묵 통과 4건을 안전하게 먼저 닫는다 |

---

## 11. 엔진 설계와 맞출 지점 / 확인 필요

### 엔진 시니어에게 (이 문서 §5.2 ✘→엔진)

1. `collectSplitPartCauseIssues`에 **purchase overlay + 건물 원인 ∈ {상속, 증여}** 분기 추가: ① 구조 규칙(부담부증여 R-X1·PHD R-X2·가업상속 R-X3·소유자 분리 R-X4 purchase판) ② **토지 취득일 필수**(G-12 purchase판 — 지금은 `mixed`가 아니라 규칙이 안 돈다) ③ **건물 파트 산정방식 실가 1종** — `SplitPartCauseFacts`에 `buildingMode` 사실 추가 필요 ④ 건물 경계일 전 차단(경계일 상수 공유 — UI는 같은 상수 re-export, D1 T-5 방식) ⑤ 건물 상속 피상속인 취득일 필수(G-3 건물판, ⑧은 이미 요구).
2. 실측 기준선 4건(B6-c·d·e + 토지 날짜 비움)은 테스트에 활성 pin — 규칙이 들어가면 400으로 뒤집힌다.
3. `SplitPartCauseField`에 건물 칸 필드(`buildingAcqMode`·`acquisitionDate`·`decedentAcquisitionDate`) 확장 — ⑧ 이동 칸이 실제 DOM 앵커(`acquisitionDate`·`buildingAcquisitionPrice` 있음, `buildingAcqMode`는 고정 칩이라 앵커 없음 → 문장 안내).
4. echo: 토지 파트 `max` 앵커가 건물 **취득일**인지 건물 **기산일**인지 정의(실측 B6-a: 토지 적용 기산일 = 건물 상속개시일 2025-05-01) → ⑦ 문구 확정.
5. V-11: 실측 B4로 클라이언트 쪽 답 — 분리 실가 경로에서 숨은 `inheritedAcquisition`은 세액 불변. 단 pre-deemed·`inheritedHouseValuation` 동봉은 미측정(D2는 경계일 차단으로 도달 안 함).

### 확인 필요 (UI 측 미검증)

- 실제 브라우저 화면·모바일 폭 — Playwright 미수행.
- 다건 route(`multi/route.ts`)가 D2 payload를 수용하는지(V-10 연장) · 컴패니언 ⑩ 스키마가 `schema-split.ts:30`을 쓰는지.
- V-12 건물 경계일의 정확한 값(영 §164⑤ 건물 기준시가 최초고시일) — 법령 본문은 이번에 영 §164 본문만 확인(⑤ 「나목에 따른 기준시가가 고시되기 전에 취득한 건물」, ⑦ 「개별주택가격 및 공동주택가격(이들에 부수되는 토지를 포함한다)이 공시되기 전에 취득한 주택」 — MST 290841 시행 2026.10.1.).
- 용도변경·공익수용과 D2의 교차(D1 U-4는 엔진이 교차해 읽지 않는다고 확인) — D2도 같은지 미측정.
- 1세대1주택 비과세 보유기간(V-1)이 건물 상속개시일·토지 매매일 중 어느 쪽으로 판정되는지 — 해석례 미확보.
- 관찰(별건 후보): 상속 호스트 + 소유자 분리 + `hasSeperate…=false`인데 이전 매매에서 입력한 `landAcquisitionDate`가 ④로 전송된다(`transfer-tax-api-split.ts:140-145`, 실측 echo 토지 취득일 2025-01-10). 상속 호스트에는 그 입력 칸이 없다. 세액 영향은 미측정.

---

## 12. 위험

1. **술어 truthy 누수**(§3.1) — D1 소비처에 `"purchase"`가 흘러 매매 토지가 상속 토지 UI로 고정된다. 반환형 좁힘 + mutation ①로 방어.
2. **⑧ 분기 순서** — 새 분기가 `sec164PartialInputError` 뒤로 가면 숨은 칸 요구가 먼저 걸려 막다른 길이 된다(실측 B3). 순서를 anchor로 고정.
3. **엔진 규칙 없이 UI만 먼저** 배포하면 환산·소유자 분리·경계일 전이 API에서 침묵 통과(B6). D2-1을 먼저.
4. **3키 쓰기 분기** — 상속개시일 입력 위치가 바뀌면 `inheritanceStartDate`·`inheritanceDate`가 stale로 남아 `deriveSec163_9BaseDate` 계열이 옛 날짜를 읽는다. 쓰기 leaf 1개 + mutation ⑥.
5. **V-2/V-3/V-4 결론이 입력 경로를 없애면**(§5.3 (c)) D2-2를 접고 토글 불허 안내로 전환 — D2-1은 어느 결론에서도 유효(규칙 추가는 엔진 결론에 의존).
6. **상속 ↔ 증여 전환이 토글을 끈다** — 입력값은 보존되지만 사용자가 다시 켜야 한다. 안내 caption 1줄.
7. **다건 경로**는 `CompanionAssetCard`가 아니라 단건 마법사 임베드라 같은 컴포넌트를 쓴다 — 한 번 고치면 세 경로가 같이 바뀐다(D1 §13-8 동일). 3경로 payload 동일 anchor가 안전망.
