# 토지·건물 취득원인 혼합 — Phase D1 「토지 상속·증여 + 건물 매매」 · UI·클라이언트 설계

> ⚠️ **엔진·UI 대조 결과와 사용자 결정(2026-10-09)은 계획서 §10이 우선한다** — 특히 U-3(Q-5 소유자 분리 잠금을 신축에도), U-4(공익수용·용도변경 비차단), T-1(echo 필드·표시값 `appliedRateBasisDate`), T-2(G-12를 엔진 leaf에도).

- 계획서: `docs/00-pm/transfer-acq-cause-mixed.plan.md` §2·§4 D1·§6(Q-1~Q-8 **권장안 확정**)·§7·§9
- 짝(엔진·API): `docs/02-design/features/transfer-acq-cause-mixed-d1.engine.design.md` — transfer-tax-senior가 같은 시각에 작성. **이 문서는 그 파일을 읽지도 수정하지도 않았다.** 대조가 필요한 항목은 「엔진 설계와 대조 필요」로 표시했다(§12 말미 모음).
- Pre-Do anchor: `__tests__/calc/transfer-land-part-cause.d1.predo.test.ts` — 활성 **12 passed** · todo **11** (§11.1).
- 상태: **UI Design — 제품 코드 수정 0.** 워크트리 `Property-related-Taxes-d1` · 브랜치 `feat/transfer-acq-cause-mixed-d1` · base master `1d3994303`(D0 #2052 포함).
- 표기: 「실측」 = 이 워크트리에서 vitest로 **실제 ④→route(⑫⑭+엔진)** 또는 ⑧ 함수를 실행한 값(mock 세율 — 상대 비교가 본질). 「게이트 확대 시뮬레이션」 = `vi.mock`으로 `landPartCauseApplicable`만 매매까지 넓힌 상태를 실행한 값. 「코드 확인」 = 읽기만(실행 안 함). 「확인 필요」 = 미검증. file:line은 이 워크트리 기준.
- Playwright는 돌리지 않았다(엔진 시니어와 vitest 동시 실행 중이라 규칙에 따라 코드 추적 + ④ 빌더 probe로 대체). 화면 동작은 전부 「코드 확인」이며 §11.2 E2E가 이를 실제로 검증한다.
- 원자료(세션 scratchpad라 영속 안 됨 — 필요한 수치는 본문에 옮김): `/private/tmp/claude-501/-Users-mynote-workspace-Property-related-Taxes/4469ebcb-4585-444f-b128-92140436196b/scratchpad/d1-ui/` — `g11.txt`·`g11b.txt`·`g11c.txt`(G-11 격자) · `stale.txt`(stale 8경로) · `grid8.txt`·`grid12.txt`(⑧·⑫ 격자) · `payload.txt`(④ 3경로).

---

## 0. 결론 표

| # | 결정 | 근거(절) | 권장 |
|---|---|---|---|
| 1 | **위젯**: 「토지는 다른 원인으로 취득」 토글을 매매 건물에도 연다(Q-3). 매매 호스트는 **토글 블록에 원인 라디오 + 피상속인 취득일만** 두고, 토지 취득일·평가액은 **기존 매매 칸을 재사용**(날짜 2열의 토지 칸 · 취득가액 파트 ①)한다. 신축 호스트는 현행 그대로(+칸 앵커·파트 자본적지출 칸 추가) | §2 | **X안** |
| 2 | **컴포넌트**: `NewConstructionLandAcqBlock` → `LandPartCauseBlock`으로 개명·일반화(호스트 = 자산 취득원인). 호스트별 `data-testid` 분리(`newconstruction-land-acq` / `land-part-cause-purchase`) → **기존 D0 E2E 3건·P8 4건 무수정 통과** | §2.4 | 개명 |
| 3 | **🔴 stale**: 게이트만 넓히면 「신축 ON → 매매」 **클릭 2번**에 잔재가 되살아나고 **신축비용 4억이 매매 건물 취득가액으로 침묵 대입**된다(S1 실측). 해소 = **호스트 태그 `landCauseHost` 신설**(유효 ⇔ 태그 = 현재 취득원인) + `splitBuildingAcqPriceInput` 후퇴를 신축 호스트로 한정 | §3 | 태그 신설 |
| 4 | **Q-4**(같은 날)·**G-12**(토지 취득일 비움)·**Q-7**(1990.8.30. 전)·**Q-5**(소유자 분리, 매매 호스트만)는 ⑧이 **칸으로 이동**시키며 막고 ⑤가 같은 술어로 안내한다. 침묵 탈락(drop) 금지 — 사용자가 고른 원인을 조용히 지우지 않는다 | §4 | 차단 |
| 5 | **G-11 연결은 그냥 하면 신축 블록에 막다른 오류를 만든다**(자산 단위 자본적지출 → `landDirectExpenses` 요구, 신축 블록엔 그 칸이 없음). **파트 자본적지출 칸 신설이 선행**. 반대로 연결은 현행 막다른 길 3종(양도시 기준시가 없음 ⑫ 400 · 소유자 분리 취득시 기준시가 ⑫ 400 · 구분양도 합계 초과 ⑫ 200 오답)을 칸 이동으로 바꾼다 | §5 | 칸 신설 + 연결 |
| 6 | **④**: 3경로(단건·다건·컴패니언)는 D1 조합에서 **같은 payload**(실측). 신규 전송 필드 0. 바꿀 것은 leaf 두 곳(`landPartCauseApplicable` 호스트 확대·`splitBuildingAcqPriceInput` 후퇴 한정)과 PHD 게이트 | §6 | — |
| 7 | **⑦ 결과 4뷰**: 엔진 echo(`SplitPartResult.acquisitionCause`·`rateBasisAcquisitionDate` 가칭)를 `summarizeSplitGain` 한 곳이 받고 카드·상세명세서·PDF에 **「취득 원인」·「세율 기산일」 행**, 신고서는 취득일·보유기간을 echo 기반으로 교체 | §8 | — |
| 8 | **신규 AssetForm 필드 1개**(`landCauseHost`, 클라이언트 전용 — ⑨~⑭ 무영향). ①②③ + ⑤ 쓰기 지점 1곳 | §9 | — |

**D0 잔여 결함 신규 발견 2건**(계획서에 없음): **G-12** 신축 + 토지 상속에서 상속개시일을 비우면 ⑧ 통과·⑫ 200이고 **토지 파트가 침묵 탈락**(세액 146,366,000 → 284,559,000) · **G-13** 신축 블록의 토지 취득일·평가액 `FieldCard`에 `field` 앵커가 없어 ⑧이 칸으로 이동시킬 수 없다(§5·§9).

---

## 1. 현행 실측

### 1.1 코드 지형

| 층 | 위치 | 현행 |
|---|---|---|
| 게이트 leaf | `lib/calc/transfer-land-part-cause.ts:22-24` | `landPartCauseApplicable` = **신축** + 주택·건물 + 겸용 아님 |
| 유효 원인 | 〃 `:33-41` | 적용 범위 밖이거나 `hasSeperateLandAcquisitionDate` OFF면 `""` — **저장값을 지우지 않고 읽는 쪽이 「없음」으로 해석**(D0 G-6) |
| 건물가 후퇴 | 〃 `:54-64` | `buildingAcquisitionPrice`가 비면 **유효 원인이 있을 때** `fixedAcquisitionPrice`(신축비용) 사용 — ④(`transfer-tax-api-split.ts:210`)·⑥(`transfer-tax-split-acq-mode.ts:237`)·⑧(`transfer-tax-validate-split.ts:81`)이 공유 |
| ⑤ 쓰기 지점 | `NewConstructionLandAcqBlock.tsx:78-97` | 토글 ON = `{landAcquisitionCause:"inheritance", hasSeperate…:true, landAcqMode:"actual", buildingAcqMode:"actual"}` **단일 배치**, OFF = 전부 비움 |
| ⑤ 마운트 | `CompanionAcquisitionCauseSection.tsx:154`(소유자 다름) → `:158`(이 블록) → `:161`(신축비용) → `:168`(매매 블록) | 위→아래 인과 순서 |
| 원인 전환 정리 | 〃 `:99` | `value !== "purchase"`이면 `hasSeperate…:false`. **`landAcquisitionCause`는 안 건드린다** |
| ⑤ 취득일 다름 | `CompanionAcqDateSection.tsx:90-113` | 토글 · `selfOwns≠both`이면 `disabled`(강제 ON). 날짜 2열 `:161-197` · 의제취득 클램프 `:70-75` |
| ⑤ 파트 블록 | `CompanionAcqPurchaseBlock.tsx:469-529` → `LandBuildingSplitSection.tsx:323-` | ① 토지 방식 4종 라디오 + 가액 · ② 건물 방식 4종 + 가액 · 파트 자본적지출 `:458-` |
| ⑧ 신축 분기 | `transfer-tax-validate-acquisition.ts:341-372` | `return validateLandPartCause(...)` — **`validateSplitDirectInputs`에 닿지 않는다**(G-11) |
| ⑧ 매매 꼬리 | 〃 `:724-725` | `validateSplitDirectInputs` — 맨 마지막 |
| ⑧ 분리 검증 | `transfer-tax-validate-split.ts:141-559` | 첫 줄에서 `validateLandPartCause`(`:151`) 후 V9·V8·V1~V7·총액 초과·자본적지출 |
| ⑧ 원인 규칙 | 〃 `:113-133` | 엔진 leaf `collectSplitPartCauseIssues`(`lib/tax-engine/transfer-split-part-cause.ts`) 호출 — **토지 취득일이 없으면 아무것도 보지 않는다**(`:51`) |

### 1.2 G-11 격자 실측 (신축 + 토지 상속·증여, ④→route)

시드: 주택, 양도 12억(토지 7억/건물 5억), 양도일 2026-06-30, 신축 2020-06-01, 토지 상속 2015-03-10(피상속인 1990-04-01), 토지 평가액 3억, 신축비용 4억. 「⑧ 현행」 = `validateAssetAcquisition`(신축 분기), 「⑧ 연결 후」 = `validateSplitDirectInputs`(= 연결하면 신축 분기가 타게 되는 것). 상속·증여 판정 동일.

| # | 셀 | ⑧ 현행 | ⑧ 연결 후 (이동 칸) | ⑫ (실측) | 입력 칸 | 판정 |
|---|---|---|---|---|---|---|
| 1 | 구분양도 + 양도가액 2칸 + 양도시 기준시가 완비 | 통과 | 통과 | 200 · 146,366,000 | — | 정상 |
| 2 | 일괄양도 + 양도시 기준시가 없음 | 통과 | 차단 `standardPricePerSqmAtTransfer` | **400** (`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`) | 축 A 기준시가 카드 있음(`TransferStdPriceCards.tsx:66`, 신축 블록 `showStdCard`) | **현행 막다른 길 → 칸 이동으로 해소** |
| 3 | 일괄양도 + 기준시가 완비 | 통과 | 통과 | 200 · 146,366,000 | — | 정상 |
| 4 | 구분양도 가액 있음 + 기준시가 없음 | 통과 | 차단 `standardPricePerSqmAtTransfer` | **400** | 〃 | 〃 |
| 5 | 구분양도 가액 없음 + 기준시가 완비 | 통과 | 통과 | 200 · 146,366,000 | — | 정상(기준시가 안분) |
| 6 | 구분양도 합계 초과(토지 9억 + 건물 5억 > 12억) | 통과 | 차단 `landTransferPrice` | **200 · 216,183,000** (정상 146,366,000) | `LandBuildingSaleSplitSection.tsx:96` | **침묵 오답 해소** |
| 7 | 토지 평가액 비움 | 통과 | 차단 `landAcquisitionPrice` | **400** (`landAcquisitionPrice`) | 신축 블록 `split-land-acq-price` — **`field` 앵커 없음(G-13)** | 앵커 추가 필요 |
| 8 | 자산 단위 자본적지출 1천만 | 통과 | 차단 `landDirectExpenses` | 200 · 146,366,000 (**자본적지출 무시** — 정상과 동일) | **신축 블록에 파트 자본적지출 칸이 없다** | 🔴 **연결하면 막다른 오류** → 칸 신설 선행 |
| 9 | 파트 자본적지출(토지 5백만)만 | 통과 | 통과 | 200 · 144,650,000 | 신축 블록에 칸 없음(매매 `LandBuildingSplitSection`엔 있음) | 칸 신설 시 사용 가능 |
| 10 | 신축 + 소유자 분리(`building_only`, 원인 없음) + 취득시 기준시가 없음 | 통과 | 차단 `standardPricePerSqmAtAcq` | **400** (`standardPricePerSqmAtAcquisition`·`acquisitionArea`·`standardPriceAtAcquisition`) | `NonPurchaseSplitInputsBlock`(비-매매 소유자 분리) | **현행 막다른 길(기존) → 해소** |
| 11 | 〃 + 취득시 기준시가 완비 | 통과 | 통과 | 200 · 16,236,046 | — | 정상 |
| 12 | 부수토지 4배(정착 50㎡·토지 200㎡) + 구분 미선택 | 통과 | 차단 `appurtenantLandZone` | 200 · 146,366,000 | `AssetAreaSection.tsx:511` | ⑧ 단독 차단(⑫는 요건 아님 — 매매 split과 동일) |
| 13 | 토지 상속개시일 = 신축 사용승인일(같은 날) | 통과 | 통과 | 200 · 163,966,000 | — | Q-4 신규 규칙 대상 |
| 14 | `selfOwns=building_only` + 원인 ON | 통과 | 통과 | 200 · 16,236,000 | — | Q-5(매매 호스트만 — Q-D1-UI3) |
| 15 | 토지 상속개시일 1984-05-01 | 통과 | 통과 | 200 · 132,286,000 | — | Q-7 신규 규칙 대상 |
| **16** | **토지 상속개시일 비움** | 통과 | **통과** | **200 · 284,559,000 · `splitDetail` 없음** | 신축 블록에 칸 있음 | 🔴 **G-12 침묵 탈락** — 토지 파트가 계산에서 빠지고 단일 자산으로 계산 |

**읽는 법**: ⑧을 연결하면 1·3·5는 그대로, 2·4·6·7·10·12·13~16은 칸 이동으로 바뀌고, **8만 막다른 오류가 된다**. 13~16은 `validateSplitDirectInputs`에도 없는 규칙(§4)이라 연결만으로는 안 잡힌다.

---

## 2. ⑤ 위젯 — 배치와 컴포넌트 결정

### 2.1 인과 순서(UI 순서 = 계산 순서)

```
취득 원인   (●매매) (○상속) (○증여) (○이월과세) (○신축)             ← 건물 원인(= 자산 단위 acquisitionCause)
[ 토지·건물 소유자 다름 ▢ ]  ← 원인 유효면 비활성+사유(Q-5, 매매 호스트)     AssetOwnershipSplitSection
[ 토지는 다른 원인으로 취득 ▣ ]  건물은 매수, 토지는 상속·증여              ★ 매매 호스트 신규 (아래)
┌ 취득일 영역 ───────────────────────────────────────────  CompanionAcqPurchaseBlock → CompanionAcqDateSection
│ [토지·건물 취득일 다름 ▣ 🔒]  ← 원인 유효면 강제 ON · 비활성(사유 표기)
│ [ 토지 상속개시일 ____ ]  [ 건물 취득일 ____ ]          ← 라벨 파생, 의제취득 클램프·배지 없음
│  ⚠ 같은 날이면 caption 경고(Q-4) · 1990.8.30. 전이면 caption 경고(Q-7)
│ 축 A — 양도가액 구분(기존)
└──
┌ 취득가액 산정 방식 — 토지·건물 독립 선택 ───────────────  LandBuildingSplitSection
│ ① 토지  [ 실거래가 · 상속개시일 평가액 ] (고정 칩)       ← 4종 라디오 대신
│         토지 상속개시일 평가액 [ ________ ]               ← testid split-land-acq-price(신축 블록과 동일)
│ ② 건물 취득가액 방식  (●실거래가)(○환산)(○감정)(○매매사례)  ← 매매 4종 그대로
│ 자본적지출  [토지] [건물]                                   ← 기존
└──
```

토글 안(펼침)은 아래 §2.3. **토글의 위치는 소유자 다름 직하·취득일 영역 위** — 소유자 다름이 「취득일 다름」을 강제로 켜듯, 이 토글도 켜는 순간 아래 「취득일 다름」을 강제로 켠다(위→아래 연쇄, `AssetOwnershipSplitSection.tsx` 헤더가 확립한 규약).

### 2.2 X안(권장) vs Y안

| | X안 — compact 블록 + 기존 칸 재사용 | Y안 — 신축처럼 토지 4칸을 블록에 모으고 매매 칸을 숨김 |
|---|---|---|
| 토글 블록 | 원인 라디오 + 피상속인 취득일 + 고지 | 원인 + **취득일 + 평가액** + 피상속인 취득일 + 고지 |
| 토지 취득일 | `CompanionAcqDateSection` 날짜 2열의 토지 칸(`acq-date-land`) 재사용, 라벨만 파생 | 블록 안 + 날짜 2열의 토지 칸 **숨김** |
| 토지 평가액 | `LandBuildingSplitSection` ① 가액 칸(`split-land-acq-price`) 재사용, 라벨 파생 | 블록 안 + ① 숨김 |
| 건드릴 매매 컴포넌트 | DateSection(+25줄) · SplitSection(+30) · PartAcqInputs(+10) | 위 + 숨김 분기 3곳 |
| 장점 | 토지 날짜가 건물 날짜 **바로 옆**(비교 쉬움 — Q-4가 정확히 이 비교) · 파트 평가액이 건물 가액 **바로 위** · testid 불변 | 토지 입력이 한 카드에 모임(신축과 동형) |
| 단점 | 원인(위)·날짜(중간)·평가액(아래)이 떨어짐 → 블록 안에 「아래 칸에 입력」 안내 1줄로 보완 | 매매 칸 숨김 분기 = 「기존 칸 testid가 사라지는」 E2E 회귀 위험, 축 A·파트가 두 곳에서 렌더 |
| 신축과 일관성 | 신축은 날짜·가액 칸이 **원래 없어서** 블록이 가졌다 — 매매는 있다 | 형식상 일관 |

권장 = **X안**. 근거: ① 매매 split은 이미 토지 날짜·토지 가액·건물 가액을 각각 자기 자리에 가진다(중복 칸을 만들지 않는다 — 같은 testid 2개면 E2E strict mode 파손). ② 「취득일 다름」 토글 자리·`acq-date-land`·`split-land-acq-price` 불변.

### 2.3 토글 블록 상세 (호스트별)

| 요소 | 신축 호스트 (현행 + 변경) | 매매 호스트 (신규) |
|---|---|---|
| 토글 | `ToggleCard variant="chip" tone="amber"` 제목 「토지는 다른 원인으로 취득」 · 설명 「상속·증여받은 땅에 신축」 | 같은 컴포넌트 · 설명 「건물은 매수, 토지는 상속·증여」 · tone 동일(amber=취득·분리계산) · **OFF도 amber 유지** |
| 마운트 조건 | `landPartCauseApplicable` | 〃 (호스트 확대) |
| 토글 `data-testid` | `newconstruction-land-acq`(현행) | `land-part-cause-purchase` |
| 토글 래퍼 앵커 | **`data-field="landAcquisitionCause"` 신설**(⑧ 결합 제외 메시지의 이동 대상) | 〃 |
| ON 패치(단일 배치) | `{landAcquisitionCause:"inheritance", landCauseHost:"newConstruction", hasSeperate…:true, landAcqMode:"actual", buildingAcqMode:"actual"}` | `{landAcquisitionCause:"inheritance", landCauseHost:"purchase", hasSeperate…:true, landAcqMode:"actual", buildingAcqMode: asset.buildingAcqMode \|\| deriveLegacyPartAcqMode(asset)}` — **건물 방식은 사용자 선택 보존**(기존 취득일 다름 ON 핸들러 `CompanionAcquisitionCauseSection.tsx:239-247`과 같은 규칙) |
| OFF 패치 | `{landAcquisitionCause:"", landCauseHost:"", hasSeperate…:false, landAcqMode:"", buildingAcqMode:""}` | `{landAcquisitionCause:"", landCauseHost:"", landAcqMode:""}` — **`hasSeperate…`는 안 되돌린다**(사용자가 취득일 다름을 따로 켰을 수 있음 — `AssetOwnershipSplitSection` OFF와 같은 값 보존 정책). 토지 방식은 파생값으로 복귀 |
| 원인 라디오 | `RadioCardGroup` 상속·증여(`data-testid="land-acq-cause"`) | 〃 |
| 피상속인 취득일 | 상속만 · `DateInput` + `FieldCard field="landDecedentAcquisitionDate"` | 〃 |
| 토지 취득일·평가액 | 블록 안(현행) — **`FieldCard`에 `field="landAcquisitionDate"`·`field="landAcquisitionPrice"` 앵커 추가(G-13)** | **블록에 없음** — 기존 칸(§2.2) |
| 증여 이월과세 고지 | `land-gift-carryover-notice`(현행) | 〃 그대로 노출 |
| 축 A(양도가액 구분) | 블록 안 `LandBuildingSaleSplitSection`(현행) | 블록에 없음 — 기존 날짜 영역 축 A |
| 파트 자본적지출 | **신설**: 토지·건물 자본적지출 `FieldCard` 2칸(`landDirectExpenses`·`buildingDirectExpenses`, `capexHint` 재사용) | 기존 `LandBuildingSplitSection` |
| 건물 가액 안내 | 현행 「신축비용·사용승인일 4시점」 | 「건물 취득가액은 아래 ②, 건물 취득일은 아래 『건물 취득일』」 |
| 안내 카드 | amber ToneCard 「건물은 신축, 토지는 …」 | amber ToneCard 「건물은 <strong>매매</strong>, 토지는 <strong>상속\|증여</strong>으로 취득한 자산입니다. 취득가액·보유기간을 토지·건물 <strong>각각</strong> 산정합니다 (소득세법 §95④·§104②, 같은 법 시행령 §163⑨).」 + caption 「토지 {상속개시일\|증여일}은 아래 『토지 취득일』, 평가액은 『취득가액 산정 방식』의 토지 칸에 입력합니다. 토지는 실거래가(평가액)로 고정되고 개별주택가격 미공시 3-시점 환산(§164⑤)은 적용되지 않습니다.」 |

**ToggleCard가 아닌 곳**: 원인 선택은 `RadioCardGroup`(규약), native checkbox/radio 신규 0, placeholder 숫자 예시 0(형식 설명은 `FieldCard hint`), 텍스트 입력은 `SelectOnFocusProvider`(`components/providers/SelectOnFocusProvider.tsx`, `app/layout.tsx:70`)가 자동 적용 — 개별 `onFocus` 금지.

### 2.4 컴포넌트 결정 — 개명·일반화

- `NewConstructionLandAcqBlock.tsx`(198줄) → **`LandPartCauseBlock.tsx`**(예상 ~290줄, `git mv` + 호스트 분기). 유일한 importer는 `CompanionAcquisitionCauseSection.tsx:14,158`뿐이다(grep 실측: 코드 1곳, 나머지는 문서 주석).
- 호스트 = `asset.acquisitionCause`(`"newConstruction"` \| `"purchase"`). 분기는 **토글 패치 · 블록 본문 · testid** 세 곳뿐이고, 원인 라디오·피상속인 취득일·고지 카드 3개는 호스트 공용 하위 조각(`LandCauseFields`)으로 뽑는다(복제 금지).
- 신축 경로 회귀 0 증명 방법: ① 호스트별 testid로 기존 E2E 7개(D0 3 + P8 4)가 무수정 통과 ② `landCauseHost` 부재 구 세션은 normalize가 `"newConstruction"`을 도출(§3.4) ③ A1(Pre-Do anchor)이 신축 상태의 ④⑥⑧ 값을 고정.

### 2.5 매매 호스트에서 바뀌는 기존 칸 (조건 = 유효 원인 `landCause` 1회 계산 → 하위에 **주입**, 재파생 금지)

`CompanionAcqPurchaseBlock`이 `effectiveLandAcquisitionCause(asset)`을 **한 번** 계산해 `CompanionAcqDateSection`·`LandBuildingSplitSection`에 prop(`landCause`)으로 내린다(`saleStdPlace`·`acqStdPriceRequired`와 같은 「1회 계산 주입」 규약).

| 칸 | 위치 | 변경 |
|---|---|---|
| 「토지·건물 취득일 다름」 | `CompanionAcqDateSection.tsx:90-113` | `landCause`면 **강제 ON + `disabled`** · `disabledReason` 「토지는 다른 원인으로 취득한 자산은 항상 토지·건물 취득일을 따로 둡니다」. 기존 `selfOwns≠both` 잠금과 **OR** |
| 토지 취득일 라벨 | `:163-167` | 「토지 취득일」 → `landCause` 파생 「토지 상속개시일」 / 「토지 증여일」 |
| **의제취득 클램프·배지** | `:70-75`·`:53-54`·`:166` | 🔴 **`landCause`면 비활성**. 현행 `handleLandAcquisitionDateBlur`는 1985-01-01 미만을 **1985-01-01로 조용히 덮어쓴다** — 상속개시일은 사실이지 의제 대상이 아니다(코드 확인). 덮어쓰면 Q-7 규칙이 영영 발동하지 않는다 |
| 토지 방식 라디오 | `LandBuildingSplitSection.tsx:332-` | `landCause`면 4종 라디오 → **고정 칩** 「실거래가 · 상속개시일 평가액(영 §163⑨)」 / 「실거래가 · 증여 신고가액」(`data-testid="part-acq-mode-land-fixed"`) |
| 토지 가액 칸 | `PartAcqInputs.tsx:44-66` | 라벨 `landCause` 파생: 「토지 상속개시일 평가액」 / 「토지 증여 신고가액」 + hint = 신축 블록 `CAUSE_META` 문구와 **같은 상수** 공유 · 별개 취득 필수 표시 유지 · testid `split-land-acq-price` 불변 |
| 토지 취득시 기준시가 카드 | `:342` (`showLandStdPrice`) | 변경 없음 — 토지가 실거래가이므로 `acqStdRequiredLand`는 거짓이고, 건물이 환산이면 **prefill 전용**(`landStdForBuildingPrefillOnly`)으로 계속 노출 |
| 건물 방식 4종 | `:405` | 변경 없음 — 「건물 파트 = 기존 매매 파트 블록 그대로」(요구 1) |
| 자본적지출 | `:458-` | 변경 없음 |
| PHD 토글 | `CompanionAcqPurchaseBlock.tsx:401-431` | `landCause`면 **미렌더** + ④·⑧ 게이트(§6.3) |

---

## 3. 🔴 게이트 확대가 깨우는 stale — 경로·실측·해소

memory `feedback_ui_gate_expansion_activates_latent_defect`(게이트를 넓히면 잠자던 결함이 활성화된다)·`feedback_new_asset_field_stale_sessionstorage_guard`·`feedback_destructive_input_coercion_vs_later_classification`(원값 저장·사용처 파생).

### 3.1 도달 가능한 경로 열거

쓰기 지점은 둘뿐이다 — 토글(`NewConstructionLandAcqBlock.tsx:78-97`)과 구 세션. 원인 라디오(`CompanionAcquisitionCauseSection.tsx:92-110`)는 `landAcquisitionCause`를 **건드리지 않으며** `hasSeperate…`는 비-매매로 갈 때만 끈다(`:99`).

「게이트 확대 시뮬레이션」(`landPartCauseApplicable`을 신축 ∪ 매매로 확대, 나머지 코드 불변) 실측 — 토글 패치와 원인 라디오 패치를 손으로 재현해 상태를 만들고 ④·⑥·⑧을 실행:

| 경로 | 사용자 조작 | 저장 상태 | 현행(D0) 유효 원인 | **확대 시** 유효 원인 · ④ 건물 취득가액 · ⑥ · ⑧ |
|---|---|---|---|---|
| S0 | 신축 + 토글 ON | 신축·`hasSep` true·원인 상속 | 상속 | 상속 · 400,000,000 · 700,000,000 확정 · 통과 (정상) |
| **S1** | S0 → **매매 라디오 1번** | **매매·`hasSep` true**(`value==="purchase"`라 안 꺼짐)·원인 상속 | **없음** → ⑧ 「건물 취득가액을 입력하세요」 | **상속 · 400,000,000(신축비용이 건물 취득가액으로 침묵 대입) · 700,000,000 확정 · ⑧ 통과** 🔴 |
| S2 | S0 → 상속 → 매매 | 매매·`hasSep` false·원인 상속 | 없음 | 없음 (hasSep 게이트가 막음) |
| **S2'** | S2 + 매매에서 **「취득일 다름」 수동 ON** | 매매·`hasSep` true·원인 상속 | 없음 | **상속 · 400,000,000 · ⑧ 통과** 🔴 (사용자는 토지 원인을 만진 적이 없다고 생각하는데 토글 상태가 「켜짐」으로 파생된다) |
| S3 | S0 → 매매 → 신축 | 신축·`hasSep` false(비-매매 전환이 끔) | 없음 | 없음 |
| S4 | S0 → 토글 OFF → 매매 + 수동 취득일 다름 | 원인 `""` | 없음 | 없음 (OFF가 원인을 비움) |
| S5 | 일반 매매 + 수동 취득일 다름 | 원인 `""` | 없음 | 없음 · ⑧ 「건물 취득가액을 입력하세요」 |
| **S7** | **D1 정상 사용**: 매매 + 토글 ON + 건물 가액 **비움**(매매에서 총 취득가 칸은 별개 취득이면 숨겨진 stale) | 매매·`fixedAcquisitionPrice` 4억 | (해당 없음) | **유효 원인 상속 · ④ 건물 취득가액 400,000,000 · ⑧ 통과 · ⑫ 200 · 146,366,000** 🔴 — 어느 칸에도 안 보이는 값이 건물 취득가액이 된다 |

- 게이트 확대 시 **구 이력(sessionStorage)**: S1·S2' 상태가 저장돼 있으면 **다음 계산부터 결과가 바뀐다**(세율 보유기간 통산 + 건물가 4억 대입). 이력(IndexedDB)은 읽기·표시 전용 — `inputData`를 폼으로 복원하는 경로는 `app/history`·`app/calc/transfer-tax`에서 grep 0건이다(코드 확인; 백업 import도 레코드 복원). 폼 복원 경로는 **persist merge 한 곳**(`calc-wizard-store.ts:288` → `migrateAsset`)이다. `one-house-judgment-form.types.ts:124`도 같은 `migrateAsset`을 쓴다 — 신규 필드는 판정 메뉴에 무해해야 한다(읽는 곳 없음).
- S7은 stale이 아니라 **D1 정상 흐름의 결함**이다: `splitBuildingAcqPriceInput`의 `fixedAcquisitionPrice` 후퇴는 「신축 호스트에서 신축비용이 정본」이라는 사실에 의존한다(`transfer-land-part-cause.ts:50-52` 주석). **매매에서 `fixedAcquisitionPrice`는 총 취득가액**이며 별개 취득 중에는 칸이 숨겨진다(`CompanionAcqPurchaseBlock.tsx:359` `!isSeparateAcq`).

### 3.2 해소안 비교

| 안 | 내용 | S1 | S2' | S7 | 마이그레이션 | 원칙 |
|---|---|---|---|---|---|---|
| **A. 호스트 태그**(권장) | `AssetForm.landCauseHost: "" \| "newConstruction" \| "purchase"` 신설. **유효 ⇔ 원인 설정 ∧ `hasSeperate…` ∧ `landCauseHost === asset.acquisitionCause`**. 토글 ON/OFF만 태그를 쓴다(쓰기 지점 1곳). 건물가 후퇴는 `acquisitionCause === "newConstruction"`로 한정 | 무효(태그 신축 ≠ 매매) | 무효 | 후퇴 없음 → ⑧ 「건물 취득가액을 입력하세요」 | normalize 도출 1줄(§3.4) | 원값 보존 · 읽는 쪽 파생 · 미러링 effect 0 |
| B. 조합 판정만(신규 필드 없음) | 매매에서 `hasSep ∧ 원인`을 유효로 본다 | **유효** 🔴 | **유효** 🔴 | 후퇴 한정으로만 해소 | 없음 | 신축에서 만든 잔재와 매매에서 만든 값을 **구별할 수 없다** — 기각 |
| C. 파괴적 정리 | 원인 라디오 변경 시 `landAcquisitionCause` 비움 | 해소 | 해소 | 후퇴 한정 필요 | **구 세션 구별 불가**: 매매 + 원인 설정 상태가 D1 신규(정상)인지 구 잔재인지 normalize가 모른다 → 로드마다 지우면 정상 입력 소실 | D0가 G-6에서 같은 길을 의도적으로 안 갔다(저장값을 지우는 patch → 읽는 쪽 파생) |

A의 비용 = 필드 1개(클라이언트 전용 — ④가 보내지 않으므로 ⑨~⑭ 0). 장점 = S1·S2'·S7 외에 **토글 상태의 의미가 명시**된다(「이 토글은 어느 취득원인에서 켰는가」).

### 3.3 유효 원인 술어 (정본)

```
landPartCauseApplicable(a)   = a.acquisitionCause ∈ {newConstruction, purchase} ∧ isLandBuildingSplitable(a.assetKind) ∧ ¬a.isMixedUseHouse
effectiveLandAcquisitionCause(a) = applicable ∧ a.hasSeperateLandAcquisitionDate ∧ a.landCauseHost === a.acquisitionCause ? (a.landAcquisitionCause ?? "") : ""
splitBuildingAcqPriceInput(a)   = raw(a.buildingAcquisitionPrice) > 0 ? 그것
                                : (a.acquisitionCause === "newConstruction" ∧ effectiveLandAcquisitionCause(a)) ? a.fixedAcquisitionPrice
                                : a.buildingAcquisitionPrice
```

`LandPartCauseScope`(구조적 입력)에 `landCauseHost?: string`을 더한다 — 사이드바 합계처럼 자산 일부만 넘기는 호출부가 있으므로 **옵셔널**(없으면 「태그 불일치」= 무효가 아니라 **호출부가 asset 전체를 넘기도록** `separateAcqPartsSum`의 `SeparatePartAmounts`에도 필드 추가 — 누락하면 ⑥만 신축 후퇴를 잃는다: 3중 패턴 이탈의 정확히 G-5 재발).

### 3.4 ①②③

| 지점 | 변경 |
|---|---|
| ① `lib/stores/calc-wizard-asset.ts` (`landAcquisitionCause` 직후 :583 근처) | `landCauseHost: "" \| "newConstruction" \| "purchase"` + 주석(「토글을 켠 취득원인 — 유효 원인 판정의 일부」). 파일은 이미 944줄(타입 중심) — +4줄 |
| ② `calc-wizard-asset-factory.ts:197` | `landCauseHost: ""` |
| ③ `calc-wizard-asset-migrate.ts:82` 근처 | **도출 규칙**: `landCauseHost === undefined`이면 `(landAcquisitionCause && acquisitionCause === "newConstruction") ? "newConstruction" : ""`. 구 신축 세션은 D0 거동 그대로(유효 판정에 `hasSep`가 따로 걸린다), **구 매매 세션의 잔재는 `""`로 무효**. 이미 값이 있으면 건드리지 않는다(멱등) |

⚠️ ③ 파일은 **751줄 — 기회주의 분리 위험구간**(루트 CLAUDE.md 750). +8줄이 아니라 `calc-wizard-asset-migrate-land-cause.ts`(신규 ~25줄)로 뽑아 호출 1줄만 남긴다.

⚠️ **E2E 시드**(memory `feedback_e2e_seed_erased_by_restore_normalization`): 매매 + 원인을 시드하는 D1 E2E는 `landCauseHost: "purchase"`를 **함께** 넣어야 한다. 빠뜨리면 normalize가 `""`로 도출해 시드를 지우고 검증 오류가 안 뜬다(vitest는 migrate를 안 거쳐 통과).

### 3.5 호스트 태그가 막는 것·못 막는 것

- 막는 것: S1·S2'·S7(후퇴 한정과 함께), 신축↔매매 전환 시 토글이 「남의 켜짐」을 파생하는 문제.
- 못 막는 것: **S1에서 `hasSeperate…`가 true로 남아 매매 화면이 「취득일 다름 ON + 토지 취득일 2015」로 보이는 것** — 이것은 D0 이전부터의 현행 거동이다(코드 확인). D1이 만든 결함이 아니므로 건드리지 않는다(`Surgical`). 사용자는 그 상태에서 토글(OFF)을 보고 건물 취득가액 필수 오류를 만난다.
- `landCauseHost`가 가리키는 호스트로 돌아와도(`매매 → 신축 → 매매`) 중간에 `hasSep`가 꺼졌으므로 OFF다 — D0 E2E `G-6 신축 → 매매 → 신축` 기대와 같은 모양.

---

## 4. Q-4 · Q-5 · Q-7 · G-12 · 결합 제외 — ⑤·⑧·④ 3중 정합

공통 원칙: **사용자가 고른 원인을 침묵 탈락시키지 않는다**(자동 fallback 금지). 유효 원인이 있는데 규칙에 걸리면 ⑧이 차단하고 칸으로 이동시킨다. ④는 유효 원인을 그대로 보내므로 ⑧ 통과 상태만 ④에 도달한다(차단된 상태는 계산이 안 나간다). ⑤는 같은 술어로 입력 중 안내를 띄운다.

신규 술어 leaf `lib/calc/transfer-land-part-cause.ts`에 `landPartCauseDateIssue(asset)`·`landPartCauseConflict(asset)`을 두고 ⑤(안내)·⑧(메시지)이 **같은 함수**를 읽는다.

| 규칙 | ⑤ 노출 | ⑧ 메시지·이동 칸 | ④ | 호스트 |
|---|---|---|---|---|
| **G-12 토지 취득일 필수** (원인 유효 ∧ `landAcquisitionDate` 비움) | 날짜 칸 `*` 표시 | `${label}: 토지 상속개시일(증여일)을 입력하세요 — 비우면 토지·건물을 나눠 계산하지 못해 토지 취득원인이 반영되지 않습니다.` · `landAcquisitionDate` | (차단되어 미도달) | **신축·매매** |
| **Q-4 같은 날** (원인 유효 ∧ 토지일 = 건물 취득일) | 날짜 칸 아래 caption(amber) 「토지와 건물의 취득일이 같으면 취득원인이 다른 자산으로 계산할 수 없습니다 — 날짜를 확인하세요」 | 같은 문장 + `${label}:` · `landAcquisitionDate` | 〃 | **신축·매매** |
| **Q-7 1990.8.30. 전** (원인 유효 ∧ 토지일 < 1990-08-30) | 날짜 칸 아래 caption(amber) 「1990.8.30. 이전에 상속·증여받은 토지는 취득가액이 상속·증여 당시 평가액과 영 §164④ 가액 중 큰 금액이라(소득세법 시행령 §163⑨ 단서) 이 화면에서 계산하지 않습니다」 | 같은 문장 · `landAcquisitionDate` | 〃 | **신축·매매**(Q-D1-UI4) |
| **Q-5 소유자 분리** (원인 유효 ∧ `selfOwns≠both`) | **상호 잠금**: 원인 유효면 「소유자 다름」 토글 `disabled`(+사유), `selfOwns≠both`이면 「토지는 다른 원인으로 취득」 토글 `disabled`(+사유) — 둘 중 켜진 쪽만 조작 가능해 데드락 없음(겸용 ↔ §95⑤ 선례, `MixedUseSection.tsx:46`) | `${label}: 토지·건물 소유자가 다른 자산에는 「토지는 다른 원인으로 취득」을 함께 쓸 수 없습니다 — 둘 중 하나를 끄세요.` · `landAcquisitionCause`(앵커=토글 래퍼) | 〃 | **매매만**(Q-D1-UI3) — 신축은 현행 거동 유지(실측 셀 14: 현재 계산됨) |
| **결합 제외** (원인 유효 ∧ 부담부증여 / 비주택→주택 용도변경 / 공익수용 / PHD 유효) | 해당 조건이면 토글 **미유효 상태에서 `disabled` + 사유**(OFF에도 amber 유지). 켜진 뒤 조건이 생기면 토글 래퍼에 amber caption | `${label}: …와 함께 쓸 수 없습니다 — 「토지는 다른 원인으로 취득」을 끄거나 …를 해제하세요.` · `landAcquisitionCause` | 〃 | **매매만** |

- 조건 술어는 **기존 leaf를 재사용**한다: 부담부증여 `asset.transferType === "burdened_gift"`, 용도변경 `isUsageConversionActive(asset)`, 공익수용 `asset.transferCause === "public_expropriation"`. PHD는 §6.3.
- ⑧ 호출 위치 — **매매 경로에서 `validateLandPartCause`를 `:374`(취득일 필수) 직후로 당겨 먼저 호출**한다. 안 그러면 같은 날·토지일 비움이 `:665`(`!isSeparateAcquisition` → 총 취득가액 요구)와 ② 총액 초과 검사에서 **엉뚱한 메시지**(게이트 확대 시뮬레이션 실측: 「토지·건물 취득가액의 합이 취득가액(400,000,000원)을 초과합니다」)를 낸다. `validateSplitDirectInputs` 안의 기존 호출(`:151`)은 멱등이라 그대로 둔다. 레거시 `isSalesCase` 조기 반환(`:388-395`)보다도 앞이다.
- 엔진 leaf `collectSplitPartCauseIssues`는 토지 취득일이 없으면 [] 반환(`:51`)이라 G-12를 **엔진 쪽도** 못 잡는다(실측: ⑫ 200 · `splitDetail` 없음) — 엔진 설계와 대조 필요(⑫ 정합: ⑧ 차단 ⇔ ⑫ 차단, memory `feedback_fe8_vs_12_parity_grid`).

---

## 5. G-11 — 신축 분기 ⑧ 연결과 막다른 오류 격자

§1.2 표가 격자다. 결론:

1. **연결 자체는 옳다.** 1·3·5 정상 · 2·4·10 현행 ⑫ 400 막다른 길 → 칸 이동 · 6 현행 ⑫ 200 침묵 오답 → 차단 · 7 칸 이동 · 12 정당한 신규 차단(입력 칸 존재).
2. **그러나 셀 8이 막다른 오류가 된다.** 자산 단위 자본적지출(`capital-expenditure`, `AssetSectionExpense`는 split 게이트가 없어 항상 보인다)을 입력한 신축 + 토지 원인 사용자는 연결 후 「토지·건물을 나눠 계산하는 자산은 자본적지출도 토지분·건물분 칸에 각각 입력하세요」를 만나는데 **신축 블록에는 그 칸이 없다**(파트 자본적지출 칸은 `LandBuildingSplitSection.tsx:458-`·일반건물 카드에만 존재 — grep 실측). 자본적지출은 가장 흔한 입력이라 영향이 크다.
3. **해소 = 신축 블록에 파트 자본적지출 칸 신설**(§2.3) — `FieldCard field="landDirectExpenses"`/`"buildingDirectExpenses"` + `capexHint`(토지 방식 = 실거래가·건물 방식 = 실거래가 고정이므로 hint 상수). 대안(신축 호스트만 그 규칙 면제)은 ⑧이 「신축만 다른 규칙」을 갖게 하고 자본적지출을 침묵 탈락시키는 현행(셀 8의 ⑫ 세액 불변)을 영속시킨다 — 기각.
4. **앵커 선행**: 신축 블록 토지 취득일·평가액 `FieldCard`에 `field` 앵커 추가(G-13), 소유자 분리 토글 래퍼에 `data-field="selfOwns"`(Q-5 이동 대상), 원인 토글 래퍼에 `data-field="landAcquisitionCause"`. ⑧이 가리키는 칸이 DOM에 없으면 이동이 조용히 실패한다.
5. 연결 시 `validate-acquisition.ts`의 신축 분기 끝 `return validateLandPartCause(...)`(`:371`)를 `return validateSplitDirectInputs(asset, label)`로 바꾼다(첫 줄이 `validateLandPartCause`이므로 D0 규칙 포함, import 1줄 정리). 파일 728줄 — +0~−1줄이라 위험구간 영향 없음.
6. 연결 범위는 **신축 + 분리 활성**만이다: `validateSplitDirectInputs` 첫 줄(`:149`)이 `!hasSep ∧ !selfOwnsSplit`이면 즉시 null이므로 신축 일반 사용자(토글 OFF)는 영향 0 — 단 셀 10(신축 + 소유자 분리, 원인 없음)은 연결로 **새로** 걸린다(현행 ⑫ 400이던 막다른 길의 해소이며 입력 칸 `NonPurchaseSplitInputsBlock` 실재).

(⑫ 열은 엔진 설계가 같은 격자를 갖는지 나중에 대조 — 셀 정의는 §7과 같은 축으로 맞췄다.)

---

## 6. ④ · ⑥ — D1 조합의 요청 body와 사이드바

### 6.1 ④ 3경로 (게이트 확대 시뮬레이션 실측, D1 정상 입력)

매매 + 토지 상속(2015-03-10, 피상속인 1990-04-01) + 건물 매매(2020-06-01, 건물 가액 3.5억) + 토지 평가액 3억:

| 경로 | 빌더 | `landAcquisitionCause` | `landDecedentAcquisitionDate` | `landAcquisitionDate` | `landAcqMode`/`buildingAcqMode` | `landAcquisitionPrice` | `buildingAcquisitionPrice` | `isSeparateAcquisition` |
|---|---|---|---|---|---|---|---|---|
| 단건 | `callTransferTaxAPI` → `transfer-tax-api.ts:499` | inheritance | 1990-04-01 | 2015-03-10 | actual/actual | 300000000 | 350000000 | true |
| 다건 V-10 | `buildPropertyPayload` → `multi-transfer-tax-api.ts:291` | 〃 | 〃 | 〃 | 〃 | 〃 | 〃 | 〃 |
| 컴패니언 | `buildAssetPayload` → `transfer-tax-api-companion-payload.ts:205` (`splitActive ?`) | 〃 | 〃 | 〃 | 〃 | 〃 | 〃 | 〃 |

세 경로가 같은 leaf(`buildLandPartCausePayload`·`buildSplitPayload`)를 쓰므로 **D1에서 ④ 신규 전송 필드는 0**이고 leaf 두 곳(§3.3)만 바뀐다. V-10(다건 동작): 위 payload가 동일하다는 사실까지 확인(다건 ⑫ 수용·엔진 응답은 엔진 설계 몫). 컴패니언은 `splitActive`가 `hasSep ∨ selfOwns≠both`이므로 토글 ON(강제 `hasSep` true)이면 자동으로 켜진다.

⚠️ 다건 ⑤: `CompanionAcquisitionCauseSection`의 import는 `asset-sections/AssetSectionAcquisition.tsx:27` **1곳**(grep 실측)이고, 그 섹션을 `CompanionAssetCard.tsx`·`RedevelopmentRightExemptionSection.tsx`가 쓴다 — 단건·컴패니언·다건이 한 자산 카드 섹션을 공유하므로 ⑤는 한 번 고치면 세 경로에 동시에 반영된다. 다건 화면이 `CompanionAssetCard`를 거치는지는 **확인 필요**(코드 추적 안 함).

### 6.2 ⑥ 사이드바 합계

`separateAcqPartsSum`은 `splitBuildingAcqPriceInput` 후퇴를 쓰므로(`transfer-tax-split-acq-mode.ts:237`) §3.3의 한정으로 자동 정합: 신축 = 토지 평가액 + 신축비용(700,000,000 확정, D0 G-5 유지), **매매 = 토지 평가액 + 건물 가액**(건물 가액을 비우면 `pending: true` — 게이트만 넓히면 700,000,000 확정으로 잘못 표시되는 S7을 막는다). `computeTransferSummary`(`calc-wizard-store.ts:363-371`)는 `isSeparateAcquisition(a) ? separateAcqPartsSum(a)`라 Q-4 같은 날(차단 상태)은 자산 단위 `fixedAcquisitionPrice`로 떨어진다 — 차단 상태의 일시 표시라 무해(코드 확인). 사이드바 코드 변경 0.

### 6.3 PHD(§164⑤ 3-시점) 게이트 — 3중

`CompanionAcqPurchaseBlock.tsx:207-220`의 `useEffect`가 **건물 취득일 < 2005-04-29이면 `usePreHousingDisclosure`를 자동 ON**한다(주택, 환산 모드 무관 — 코드 확인). 그래서 ⑧이 「플래그 ON ∧ 원인 유효」를 차단하면 사용자가 켠 적 없는 플래그로 **보이지 않는 토글을 끄라고 요구**한다(`phd-toggle-scope.ts` 헤더가 기록한 바로 그 함정). 따라서 **차단이 아니라 무시**로 정합한다:

| 층 | 변경 |
|---|---|
| ⑤ | `landCause`면 PHD 토글 미렌더(§2.5) |
| ④ | `phdPayloadActive`(`phd-toggle-scope.ts:76`)에 `∧ ¬landCauseEffective` — `preHousingDisclosure` 미전송 |
| ⑧ | `usesPhdGate`(`transfer-lump-sum-base-gate.ts`)에 같은 조건 — 11칸 미요구 |

근거: 원인 유효이면 토지가 실거래가로 고정되어 엔진 PHD 조기반환(양쪽 환산일 때만 — `transfer-tax-split-gain.ts:80`)에 도달할 수 없다. 사용자가 PHD를 직접 켠 뒤 원인 토글을 켜는 경우는 토글 ON 패치가 토지를 `actual`로 바꾸는 순간 이미 전제(양쪽 환산)가 깨지며 안내 caption(§2.3)이 그 사실을 말한다. **엔진 설계와 대조 필요**: `preHousingDisclosure` 동봉 시 ⑫·엔진 거동, `assetKind:"building"`(V-7).

---

## 7. ⑧ 클라이언트 격자 (토지 원인 × 건물 원인 × 토지 파트 모드 × selfOwns × 같은 날)

「게이트 확대만」 = 시뮬레이션 실측(⑧ 함수 + 실제 route). 「D1 설계 후」 = 이 문서 규칙 적용 시 기대. ⑫ 열은 **엔진 설계와 대조 필요**(셀 정의 = 아래 축).

| # | 셀(매매 호스트 · 토지 상속 기준, 증여 동일) | ⑧ 게이트 확대만 | ⑫ 실측 | **D1 설계 후 ⑧ → 이동 칸** |
|---|---|---|---|---|
| M1 | 정상 (건물 가액 3.5억, 토지일 2015, 피상속인일 입력) | 통과 | 200 · 165,726,000 (토지 보유 11/건물 6) | 통과 |
| M2 | 증여 정상(증여자일 없음) | 통과 | 200 · 165,726,000 | 통과 |
| M3 | 피상속인 취득일 비움 | 차단 | 400 (`landDecedentAcquisitionDate`) | 차단 `landDecedentAcquisitionDate` (D0 규칙 그대로) |
| M4 | 토지 환산/감정 잔재 | 차단(필드 없음 — 사유 문장에 방법 안내) | 400 (`landAcqMode`) | 차단(필드 없음 · 「껐다가 다시 켜면 실거래가로 고정」 안내). 토글 ON 패치가 `actual`로 고정하므로 잔재만 도달 |
| M5 | 토지일 = 건물일(같은 날) | **차단(엉뚱한 메시지: 취득가액 합 초과)** | **200 · 183,326,000** (분리 보유 6/6) | **차단 Q-4 `landAcquisitionDate`** |
| M6 | 토지일 비움 | **차단(같은 엉뚱한 메시지)** | **200 · 284,559,000 · `splitDetail` 없음** | **차단 G-12 `landAcquisitionDate`** |
| M7 | `selfOwns=building_only` | **통과** | 200 · 32,873,500 | **차단 Q-5 `landAcquisitionCause`** |
| M8 | `selfOwns=land_only` | 통과 | (미실행) | **차단 Q-5** |
| M9 | 건물 환산 + 건물 기준시가 있음 | 통과 | 200 · 222,983,640 | 통과 (건물 4종 그대로) |
| M10 | 건물 환산 + 건물 기준시가 없음 | 차단 `buildingStandardPriceAtAcq` | (미실행) | 차단 `buildingStandardPriceAtAcq` (기존 V6) |
| M11 | 토지일 1984-05-01 | 통과 | 200 · 151,646,000 (토지 보유 42) | **차단 Q-7 `landAcquisitionDate`** |
| M12 | 토지일 > 건물일(토지 나중 취득) | 통과 | 200 · 186,846,000 (5/6) | 통과 (건물 매수 후 토지 상속은 정당) |
| M13 | 건물 가액 비움 + stale 총 취득가 | **통과(후퇴)** | **200 · 146,366,000** | **차단 V1 `buildingAcquisitionPrice`** (후퇴를 신축으로 한정) |
| M14 | `transferType=burdened_gift` | 차단 `bgValuationMode`(부담부증여 자체 규칙) | (미실행) | 차단 결합 제외 `landAcquisitionCause` (자체 규칙보다 앞 — 원인 유효 + 부담부증여) |
| M15 | PHD 플래그 ON(자동) | 통과 | (미실행) | 통과 · ④ 미전송(§6.3) |

신축 호스트 셀 N1~N16은 §1.2(칼럼 「⑧ 연결 후」)와 Q-4·Q-7·G-12 추가분: 같은 날 차단 · 1984 차단 · 토지일 비움 차단 · `selfOwns≠both`는 **현행 유지(통과)**.

**⑧ 메시지 접두 규약**: 기존 규칙과 같은 `${label}:` 접두 + 법령 근거 괄호(검증 이동 테스트가 접두 연속 토큰에 의존).

---

## 8. ⑦ 결과 표시 4뷰

전제: 엔진이 `SplitPartResult`에 **파트 취득원인**(가칭 `acquisitionCause`)·**세율 기산일**(가칭 `rateBasisAcquisitionDate`: 상속 토지 = 피상속인 취득일, 그 밖 = 파트 취득일)을 echo한다(**엔진 설계와 대조 필요** — 필드명·타입·구 이력 optional 여부). 표시는 값을 새로 계산하지 않고 echo를 읽는다(memory `feedback_engine_result_display_drift`·`feedback_aggregate_display_rederives_engine_value`). 정본은 `summarizeSplitGain`(`lib/tax-engine/transfer-tax-split-display.ts:89`) — `SplitGainPartSummary`에 두 필드를 더해 **4뷰가 한 leaf를 읽는다**(memory `feedback_transfer_result_view_is_not_one`).

| 뷰 | 위치 | 변경 |
|---|---|---|
| ① 단건 결과 카드 | `SplitGainDetailSection.tsx:107-109` 「취득 방식」 행 **아래** | 행 2개: 「취득 원인」(토지 `상속` · 건물 `매매`; `data-testid="split-card-cause-land"`/`-building"`) · 「세율 기산일 (§104②)」(토지 `1990-04-01` + fine-print 「피상속인 취득일」 · 건물 = 취득일). 「보유연수」 행 라벨을 「보유연수 (장기보유특별공제)」로 구분 — 상속 토지는 **보유연수(상속개시일~)와 세율 기산일(피상속인 취득일~)이 다른 두 개념**임을 한 카드에서 보여야 한다. echo가 없는 구 이력은 두 행 모두 **미렌더** |
| ② 상세명세서 | `split-acq-text.ts:34-36` `partTag` | 파트 태그 `토지(실거래가)` → 원인이 상속·증여면 `토지(상속개시일 평가액)`/`토지(증여 신고가액)` — **입력 화면 라벨과 같은 어휘**(결정 9). 세율 행 소제목에 「토지 세율 기산일 1990-04-01 (피상속인 취득일 — 소득세법 §104②1호)」 1줄(`DetailedStatementFormulaBuilders` 세율 행 위치는 **확인 필요**). 숫자 `/` 금지(`FormulaText` 분수 치환) |
| ③ 신고서 | `FilingFormTableHelpers.ts:338-347` (split-2col) | 🔴 `spLandAcqDate = primary?.landAcquisitionDate \|\| acquisitionDate`는 **`hasSeperate…`를 보지 않는다**(코드 확인; 4열 모드 `:315-316`도 동일) → 분리 OFF·`selfOwns≠both`에서 stale 토지일이 신고서에 찍힐 수 있다(실측 안 함). **echo 기반으로 교체**: 파트 취득일 echo가 있으면 그것, 없으면(구 이력) 종전 폼 후퇴. 보유기간 `holdingPeriodFromDates`는 파트 취득일(장특 기산 — 상속 = 상속개시일)로 유지. 세율 기산일은 신고서 서식 행이 없으므로 `setRoseNote("acquisitionDate","land", 「세율 판정 기산일: 피상속인 취득일 …」)` 각주만 |
| ④ PDF | `ResultPdfTransferSections.tsx:117-130` `modern` 가드의 「취득 방식」 행 아래 | 행 2개(①과 같은 문구) · 구 이력은 종전 표 |
| 다건 | `PerPropertyBreakdown.splitDetail` → `ValuationDetailCards.tsx:151` → ①과 같은 카드 / 합산 소제목 `split-acq-text.ts:aggregateAcqModes` | 카드는 echo가 흘러 자동. 건별 신고서는 `breakdownToFilingResult`가 `splitDetail`을 싣지 않는 어댑터(`MultiTransferPropertyBreakdown.tsx:139` 주석) — D1 자산이 어느 신고서 mode로 들어가는지 **확인 필요** |

신규 문구는 모두 법정 용어(「피상속인 취득일」·「상속개시일」), 변수 약어·`floor()` 노출 0, 「원」 접미 0.

**변경 파일 줄 수**: `SplitGainDetailSection.tsx` 242(+25) · `split-acq-text.ts` 152(+15) · `FilingFormTableHelpers.ts` **657**(+12 → 669, 위험구간 아님) · `ResultPdfTransferSections.tsx` 340(+16) · `transfer-tax-split-display.ts` 320(+10, 엔진 소유).

---

## 9. 14지점 매트릭스

| 지점 | D1 담당 | 내용 |
|---|---|---|
| ① 폼 상태 | UI | `landCauseHost` 신설 |
| ② initial | UI | `landCauseHost: ""` |
| ③ normalize | UI | 도출 규칙(§3.4) — 신규 파일 분리 |
| ④ API 변환 | UI | 신규 필드 0. leaf 2곳(`landPartCauseApplicable` 호스트 확대·후퇴 한정) + `phdPayloadActive` 게이트. 3경로 동일 |
| ⑤ UI 위젯 | UI | §2 전체 + 앵커 3종 + 신축 파트 자본적지출 칸 |
| ⑥ 사이드바 | UI | 코드 변경 0 — leaf 정합으로 자동 |
| ⑦ 결과 카드 | UI | §8 4뷰 + 다건 |
| ⑧ validation | UI | §4 규칙 5종 + 결합 제외 + 신축 분기 연결(G-11) + 호출 순서 |
| ⑨~⑭ API/Route | **엔진 설계 참조** | UI가 전송하는 키는 기존 키뿐(신규 0)이므로 Zod 구조 변경은 없을 것으로 보인다. 단 ⑧ 규칙 5종의 ⑫ 대응(같은 날·토지일 비움·1990.8.30.·`selfOwns`·결합 제외 ⇔ 400)과 echo 필드가 필요 — **엔진 설계와 대조 필요** |

**3중 패턴 점검(memory `feedback_mirror_pattern`)**: 표시 fallback이 있는 필드 = 토지 방식 고정 칩(`actual`)·건물 가액 후퇴(신축). 고정 칩은 ⑤ 표시 = 토글 ON 패치가 쓴 값 = ④ `effectivePartAcqMode` = ⑧ 같은 함수로 일치한다. useEffect → store 미러링 **0**(호스트 태그는 토글 onChange에서만 쓰고 normalize에서 도출한다).

---

## 10. 변경 파일 목록 (열 때의 줄 수 / 예상)

| 파일 | 현재 | 예상 | 비고 |
|---|---|---|---|
| `lib/calc/transfer-land-part-cause.ts` | 64 | ~150 | 호스트 술어·태그·충돌/날짜 술어 |
| `lib/stores/calc-wizard-asset.ts` | **944** | 948 | 이미 초과(타입 중심) — +4 |
| `lib/stores/calc-wizard-asset-factory.ts` | 564 | 565 | |
| `lib/stores/calc-wizard-asset-migrate.ts` | **751** | 752 | ⚠️ 위험구간 — 도출은 신규 `calc-wizard-asset-migrate-land-cause.ts`(~25줄)로 분리하고 호출 1줄만 |
| `lib/calc/transfer-tax-validate-split.ts` | 559 | ~610 | 규칙 5종 |
| `lib/calc/transfer-tax-validate-acquisition.ts` | **728** | 730 | 신축 연결 −1 · 매매 조기 호출 +3 (750 근접 — 더 늘리면 분리) |
| `lib/calc/transfer-tax-api-split.ts` | 270 | 271 | 후퇴 호출부 변경 없음(leaf가 처리) |
| `lib/calc/transfer-tax-split-acq-mode.ts` | 685 | 687 | `SeparatePartAmounts`에 `landCauseHost?` |
| `lib/calc/phd-toggle-scope.ts` | 88 | ~96 | |
| `lib/calc/transfer-lump-sum-base-gate.ts` | 54 | 56 | |
| `components/calc/transfer/NewConstructionLandAcqBlock.tsx` → `LandPartCauseBlock.tsx` | 198 | ~290 | `git mv` · 호스트 분기 · 파트 자본적지출 · 앵커 |
| `components/calc/transfer/CompanionAcquisitionCauseSection.tsx` | 339 | ~345 | import·마운트·`landCauseHost` 언급 주석 |
| `components/calc/transfer/AssetOwnershipSplitSection.tsx` | 90 | ~105 | 상호 잠금 + `data-field="selfOwns"` |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 552 | ~570 | `landCause` 1회 계산 주입 · PHD 미렌더 |
| `components/calc/transfer/CompanionAcqDateSection.tsx` | 238 | ~265 | 잠금·라벨·클램프 비활성·caption |
| `components/calc/transfer/CompanionAcqPurchaseBlock.types.ts` | 172 | ~175 | `landCause?` |
| `components/calc/transfer/LandBuildingSplitSection.tsx` | 471 | ~500 | 고정 칩 |
| `components/calc/transfer/PartAcqInputs.tsx` | 125 | ~135 | 라벨 override |
| 결과 4뷰 | §8 | | |
| 신규 테스트 | | | `__tests__/calc/transfer-land-part-cause.d1.test.ts` · `e2e/transfer-acq-cause-mixed-d1.spec.ts` |

모두 800줄 미만(`calc-wizard-asset.ts`만 기존 초과 타입 파일).

---

## 11. 검증 계획

### 11.1 Pre-Do anchor (이 문서와 함께 작성·실행됨)

`__tests__/calc/transfer-land-part-cause.d1.predo.test.ts` — 활성 12 · todo 11.

- **A(불변식, D1 후에도 유지)**: A1 신축 호스트 ④⑥⑧ 값 · A2 S1 잔재 무효 · A3 S2' · A4 매매 총 취득가 후퇴 없음 · A5 ④ 3경로 동일 · A6 ⑧ 연결 후 규칙의 칸 이동(양도시 기준시가·합계 초과·평가액·자본적지출).
- **B(현행 결함 pin — `[D1에서 뒤집힘]`)**: B1 일괄양도+기준시가 없음(⑧ 통과·⑫ 400) · B2 합계 초과(146,366,000 vs 216,183,000) · B3 자산 단위 자본적지출(세액 불변)·파트 칸(144,650,000) · B4 신축 소유자 분리 ⑫ 400 · B5 G-12(284,559,000, `splitDetail` 없음) · B6 같은 날·1984 통과.
- **C(todo 11)**: 호스트 태그 · normalize 도출 · 후퇴 한정 · ⑥ pending · Q-4 · Q-5 · Q-7 · 결합 제외 · ④ 3경로 · G-11 연결 · PHD.
- 차별력: A2~A4는 게이트 확대 시뮬레이션에서 즉시 깨진다(S1·S2'·S7 실측). B는 D1이 연결하는 순간 깨져 기대값 교체를 강제한다.

### 11.2 E2E (`e2e/transfer-acq-cause-mixed-d1.spec.ts`, CI 전용 — 이번 설계에서는 미실행)

1. **D1 조합 입력→계산→표시**: 주택 → 매매 → 토글 ON → 상속개시일/피상속인 취득일/평가액/건물 가액/양도시 기준시가 입력 → 계산 → 결과 카드 「취득 원인」「세율 기산일」 행.
2. **요청 body**: `page.route`로 `/api/calc/transfer` 캡처 → `landAcquisitionCause`·`landDecedentAcquisitionDate`·`landAcquisitionDate`·`landAcqMode:"actual"`·`buildingAcquisitionPrice` 확인(memory `feedback_browser_verify_with_playwright`).
3. **stale 시나리오**: 신축 ON → 매매 → 토글 OFF·건물 취득가액 필수 오류 · 신축 ON → 상속 → 매매 + 취득일 다름 수동 ON → 토글 OFF.
4. **Q-4/Q-5/Q-7/G-12**: 같은 날 caption + 계산 시도 시 칸 이동 · 소유자 다름 ↔ 원인 상호 잠금 · 1990.8.30. 전 caption · 토지일 비움 → 칸 이동.
5. **G-11**: 신축 + 토지 원인 + 자산 단위 자본적지출 → 파트 칸으로 안내·통과 · 일괄양도 + 기준시가 없음 → 칸 이동.
6. **D0 E2E 3건 회귀**(`transfer-acq-cause-mixed-d0.spec.ts`): 호스트별 testid로 **무수정 통과** 설계 — 단 `split-mode-gating.spec.ts:745`의 테스트 제목 「매매 취득원인에서는 이 블록이 나타나지 않는다」는 의미가 달라지므로(`newconstruction-land-acq` 부재만 단언하지만) 제목을 「신축 전용 testid는 매매에 없다」로 정정.
7. 시드 주의: 매매 + 원인 시드는 `landCauseHost:"purchase"` 동봉(§3.4).

### 11.3 mutation probe 계획(Do 단계)

호스트 태그 비교(`===`) · 후퇴 한정(`newConstruction`) · Q-4 동일일 · G-12 비움 · Q-5 매매 한정 · PHD 게이트 · 신축 연결(`validateSplitDirectInputs`) · 앵커 3종 각 1건 이상 KILLED. 하네스 함정(memory `feedback_mutation_harness_*`) 주의 — 워크트리 안에서만.

### 11.4 Check

`ui-engine-sync-checker`(14지점) · `acquisition-cost-review`(§163⑨·§104②·§95④) · `bkit:gap-detector`.

---

## 12. 사용자 결정 질문 (Q-D1-UIx)

| # | 질문 | 권장안 | 근거 |
|---|---|---|---|
| **Q-D1-UI1** | stale 해소 방식 | **A. 호스트 태그 `landCauseHost` 신설** (대안 B 조합 판정 · C 파괴적 정리 기각) | §3.2 — 신축 잔재와 매매 입력을 구별할 유일한 방법. 필드 1개(클라이언트 전용), ⑨~⑭ 무영향 |
| **Q-D1-UI2** | 매매 호스트 레이아웃 | **X안**(compact 블록 + 기존 칸 재사용) | §2.2 — 토지·건물 날짜가 나란히(Q-4 비교), testid 불변, 중복 칸 0 |
| **Q-D1-UI3** | Q-5(소유자 분리 상호 배타) 적용 범위 | **매매 호스트만**, 신축은 현행 유지(실측 셀 14: 현재 계산됨) | 신축 회귀 0. 신축 정리는 별건 |
| **Q-D1-UI4** | Q-7(1990.8.30. 전)·Q-4(같은 날)·G-12(토지일 필수)를 **신축 호스트에도** 적용 | **적용** — 단 기존 입력이 새로 막히므로 안내 caption + 칸 이동 | 셀 13·15·16: 현재 침묵 오답(세액 2배·보유 42년). 막는 것이 정당. 계획서 Q-7 괄호 「기존 사용자 입력이 새로 막힘」 위험을 알고 결정 필요 |
| **Q-D1-UI5** | G-11 연결의 자본적지출 막다른 오류 | **신축 블록에 파트 자본적지출 칸 신설**(연결과 같은 PR) | §5 — 규칙 면제는 신축 침묵 탈락 영속 |
| **Q-D1-UI6** | 컴포넌트 이름 | **`LandPartCauseBlock`으로 개명** | 이름이 거짓이 됨(신축 전용 아님). importer 1곳 |
| **Q-D1-UI7** | PHD 자동 ON 플래그 처리 | **무시(⑤ 미렌더 + ④·⑧ 게이트)** — 차단 아님 | §6.3 — 보이지 않는 자동 플래그를 끄라고 요구하는 막다른 길 방지 |
| **Q-D1-UI8** | 신고서 취득일 echo 교체 범위 | **echo 우선 + 구 이력 폼 후퇴**(split-2col만) | 4열 모드(`:315-316`)는 겸용 전용이라 D1 밖 |
| **Q-D1-UI9** | 증여 토지 이월과세 고지 카드(`land-gift-carryover-notice`) | **매매 호스트에도 노출**(신축과 동일) | 이월과세는 법이 자동 적용하는 규정 — 매매 건물이라도 고지 없이 일반 증여로 계산받지 않게 |
| **Q-D1-UI10** | 비과세(§89) 보유·거주기간 파트별 판정 안내 | **엔진 설계(V-1·V-3·V-5) 결론 후 caption 1줄 추가 여부 결정** — 지금은 안내 없음 | 정면 해석례 미확보(계획서 §3). 근거 없는 안내 금지 |

### 엔진 설계와 대조 필요 (모음)

1. echo 필드명·타입·구 이력 optional 여부(§8) — `acquisitionCause`·`rateBasisAcquisitionDate`, 파트 `acquisitionDate` echo 여부(신고서 교체용).
2. ⑧ 규칙 5종의 ⑫ 대응(§4): 토지일 비움(G-12 — 엔진 leaf가 토지일 없으면 []이라 현재 못 잡음)·같은 날·1990.8.30. 전·`selfOwns≠both` + 원인·결합 제외 4종.
3. ⑫ 열 전체(§1.2·§7) — 같은 격자 셀 정의로 대조.
4. PHD: `preHousingDisclosure` 동봉 시 거동 · `assetKind:"building"`(V-7).
5. 다건: `app/api/calc/transfer/multi/route.ts` 수용·응답(V-10).

### 확인 필요 (UI 측 미검증)

- V-UI-1: 다건 화면이 `AssetSectionAcquisition`(→ `CompanionAssetCard`)을 거쳐 이 블록에 닿는지(§6.1) — 닿지 않으면 다건 ⑤ 별도 마운트 필요.
- V-UI-2: 상세명세서 세율 행 소제목의 정확한 위치(§8 ②).
- V-UI-3: Q-7 문구의 법령 근거는 계획서 §1 인용(`영 §163⑨ 단서 1호`)을 그대로 썼다 — 이 문서에서 KoreanLaw 재조회는 하지 않았다. Do 단계 전에 `verify:legal` 매니페스트 등록 여부와 함께 확인.
- V-UI-4: 신고서 4열 모드·다건 건별 신고서 어댑터가 D1 자산에서 타는 mode(§8).
- V-UI-5: 신고서 split-2col의 stale 토지일 노출(§8 ③)은 코드 확인만, 실측 안 함.

---

## 13. 위험

1. **호스트 태그를 빠뜨린 E2E 시드가 조용히 지워진다**(§3.4) — vitest는 통과하고 E2E만 검증 오류가 안 뜬다.
2. **Q-4·Q-7·G-12의 신축 호스트 적용은 기존 입력을 새로 막는다**(Q-D1-UI4) — 안내 caption과 칸 이동이 함께 가야 막다른 길이 안 된다.
3. **의제취득 클램프를 끄지 않으면 Q-7이 영영 발동하지 않는다**(`CompanionAcqDateSection.tsx:70-75`) — 상속개시일이 1985-01-01로 조용히 바뀐다.
4. **`validate-acquisition.ts` 728줄** — 750을 넘기지 않게 모든 신규 규칙을 `validate-split.ts`에 둔다.
5. **`calc-wizard-asset-migrate.ts` 751줄** — 도출 로직을 새 파일로 분리하지 않으면 800 접근.
6. **토글 ON 패치가 토지 방식을 `actual`로 덮는다**(매매 호스트) — 환산을 골랐던 사용자의 선택이 사라진다. 안내 caption이 그 사실을 말하고 OFF는 파생값으로 복귀(원 선택은 복원 안 됨 — 수용).
7. **엔진 echo 없이 ⑦을 먼저 배포하면** 카드가 빈 행을 그리지 않도록 가드(미렌더)가 필수 — 구 이력과 같은 처리.
8. **다건·컴패니언 ⑤가 같은 컴포넌트를 공유**하므로 한 번 고치면 세 경로가 동시에 바뀐다 — 3경로 payload 동일 anchor(A5)가 안전망.
