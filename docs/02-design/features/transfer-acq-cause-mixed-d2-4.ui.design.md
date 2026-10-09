# 토지·건물 취득원인 혼합 — Phase D2-4 「개별주택가격 고시 전(2005.4.30. 이전) 상속·증여 건물 파트: max(평가액, 영 §164⑦ 가액)」 · UI·클라이언트 설계

- 계획서: `docs/00-pm/transfer-acq-cause-mixed.plan.md` §12(D2) · §12.2 「PR 4분할 D2-4」 · UI 설계 `transfer-acq-cause-mixed-d2.ui.design.md` V-12·Q-D2-UI4
- 선행 UI 설계: D1-4 `transfer-acq-cause-mixed-d1-4.ui.design.md`(토지 파트 ②) — **이 문서는 그 모양을 건물 파트로 미러링한다**
- 짝(엔진·법령): `transfer-acq-cause-mixed-d2-4.engine.design.md` — 엔진·법령 시니어가 같은 시각에 작성 중이라 **이 문서 작성 시점에는 존재하지 않아 읽지 못했다**. 엔진 쪽 확정 사항은 §10 「엔진 설계와 맞출 지점」에만 모았다. 어긋나면 엔진 문서가 법령·산식에서, 이 문서가 화면·클라이언트에서 우선한다.
- 상태: **UI Design — 제품 코드 수정 0.** 워크트리 `Property-related-Taxes-d24` · 브랜치 `feat/transfer-acq-cause-mixed-d2-4` · base master `6d0194a9c`
- 표기: 「코드 확인」 = 읽기만 · 「실측」 = 이 워크트리에서 throwaway vitest probe 실행값 · 「확인 필요」 = 미검증. 화면은 Playwright를 띄우지 않았다(코드 추적 + probe).

---

## 0. 결론 표

| # | 결정 | 근거(절) | 권장 |
|---|---|---|---|
| 1 | **기존 §164⑤~⑦ 입력 위젯(`HouseValuationSection`)은 통째로는 재사용 불가.** 필드 키(`inhHouseVal*`)와 하위 원자 위젯(`LandPriceLookupField`·`StandardPriceInput`·`MultiPointBuildingStdPriceModal`)은 재사용 | §1·§2 | 신규 카드 `BuildingSec164Card`(~170줄) 1개 + 원자 재사용 |
| 2 | **건물 ② 입력은 5칸이면 된다**(면적은 기본 정보의 `acquisitionArea` + 4칸). 자산 단위 11칸 중 **양도시 4칸·취득시 토지단가·1990 등급 3종·주택가격 직접입력 토글은 ②에 쓰이지 않는다** — 건물분 안분 `P × B_A ÷ (L_F + B_F)`에서 취득시 토지기준시가가 약분된다(실측 F1≈F2, 최대 1원) | §1.3 | 엔진 시니어 확인 후 확정(§10 E-1) |
| 3 | **신규 `AssetForm` 키 0** — `inhHouseVal*` 4칸 + `acquisitionArea` 재사용. ①②③ 무변경. 부작용 H-1(토글 OFF 후 자산 단위 부분입력 차단)은 막다른 길이 아님(위젯이 보임) — 테스트로 고정 | §1.4·§6 | 키 공유(A안) |
| 4 | **게이트 신설 1개 + 리프 술어 1개**: `isSec163_9BuildingSec164Applies(cause, date, assetKind)`(엔진 leaf) ← 클라이언트 `buildingSec164Applies(asset)`. ④⑤⑥⑧이 같은 술어. **주택(`housing`)만** — 비주택 `building`은 종전 Y4 차단 유지 | §4 | 신규 leaf |
| 5 | **④**: 클라이언트 브리지가 건물 ② **총액 1개**(`buildingSec164Value`, 지분 스케일 후)를 만든다. 전송은 **`buildLandPartCausePayload` 한 함수**(단건·다건·컴패니언 3곳 공용 — 실측) | §5.3 | D1-4 `landSec164Value` 미러 |
| 6 | **⑧**: 단서 구간에서 ② **필수**(opt-in 아님). 칸 이동 순서 = 면적 → 최초공시 개별주택가격 → 최초공시 개별공시지가 → 최초공시 건물 기준시가 → 취득시 건물 기준시가. 건물 날짜 칸 이동(Y4)은 사라지고 ② 칸으로 바뀐다 | §7 | 필수 |
| 7 | **⑥**: `separateAcqPartsSum`에 건물 ② pending 한 줄(D1-4 토지 한 줄과 같은 자리). 결과 도착 후 해소는 D2-2 분기가 이미 처리(`effectiveBuildingCauseMix && acqPending && splitDetail`) | §8.1 | pending |
| 8 | **⑦**: `splitAcqBasisView/Formula`를 `rule` 기준으로 파트 일반화(`partLabel`·`legalBasis`·`sec164Label`을 view에 실음). 4뷰 호출부 4곳의 하드코딩 「단서 1호」·「토지 취득가액」 문구 제거. 건물 라벨 「영 §164⑦ 가액」, 태그 「건물(영 §164⑦ 가액)」 | §8.2 | 소폭 |
| 9 | **PR 2분할**: D2-4a(엔진·⑫·⑬⑭·④ 브리지·leaf — ⑧은 임시 문구로 계속 막음, 화면 변화 0) → D2-4b(⑤ 카드·⑧ 완화·⑥·⑦·E2E) | §11 | 2 PR |
| 10 | **사용자 결정 6건**(§12) — 범위(주택만)·필수/opt-in·키 공유·일부 양도 차단·입력 화면 채택값 미표시·결과 산출 내역 echo | §12 | 전부 권장안 |

---

## 1. 현행 인벤토리 (코드 확인 · 실측)

### 1.1 자산 단위 §164⑦ 입력 위젯

| 항목 | 위치 | 내용 |
|---|---|---|
| 본체 | `components/calc/transfer/inheritance/HouseValuationSection.tsx`(634줄) | 헤더 「개별주택가격 미공시 — 3-시점 기준시가 환산 보조」 · 11칸 + 3시점 건물기준시가 모달 + 「환산 가격(§164⑤)」 미리보기 + 주택가격 직접입력 토글. 안에 `Pre1990LandValuationInput`(취득시점 < 1990.8.30.) |
| 마운트 | `PostDeemedInputs.tsx:355`(상속 ≥ 1985.1.1.) · `PreDeemedInputs.tsx:226`(< 1985.1.1.) · `GiftHouseStdPriceSection.tsx:72`(증여) | 셋 다 **자산 단위 상속·증여 블록 안**. D2 건물 원인 모드는 이 블록들을 마운트하지 않는다(`CompanionAcquisitionCauseSection`이 `d2On`이면 매매 블록으로 대체, D2-2) |
| 주택 구분 픽커 | `InheritanceHouseKindPicker.tsx` | 개별/공동 — 세액 무관, 공시가격 조회 DB·라벨만 결정 |
| payload | `buildInheritedHouseValuationPayload`(`transfer-tax-api-inheritance.ts:178`) ← `sec164HouseStatus` | **D2 유효 시 `{}`**(`:187` 가드). 단건 `transfer-tax-api.ts:715` · 컴패니언 `companion-payload.ts:398` |
| 필수 판정 | `sec164HouseStatus`(`sec164-required-fields.ts:111`) | 실측: 5칸(면적·양도시 공시지가·최초공시 공시지가·최초공시 주택가격·취득당시 공시지가 **또는** 1990 이전 등급 4종). **건물 기준시가 2칸은 필수에 없다**(선택, 미입력 = 0) |
| 계산 | `calculateInheritanceHouseValuation`(`lib/tax-engine/inheritance-house-valuation.ts`) | 입력 검증이 **양도시 공시지가 > 0**·**취득시 토지단가 또는 pre1990**을 강제(실측: 양도시 0 → throw 「landPricePerSqmAtTransfer는 양수여야 합니다」, 1985 취득 + 토지단가 없음 → throw). 결과 `housePriceAtInheritanceUsed`는 **토지 포함 단일값** |

AssetForm 키(11, 전부 `calc-wizard-asset.ts:767-790` · initial `-factory.ts:247-258` · normalize `-migrate.ts:256-267` 존재):
`inhHouseValEnabled`(dead flag) · `FirstDisclosureDate`(기본 2005-04-30, 편집 UI 없음) · `LandArea` · `LandPricePerSqmAtTransfer` · `AtFirst` · `AtInheritance` · `HousePriceAtTransfer` · `AtFirst` · `BuildingStdPriceAtFirst` · `AtInheritance` · `UseHousePriceOverride` · `HousePriceAtInheritanceOverride`.

### 1.2 D2 건물 원인 모드의 현행 (D2-2)

- 토글 `BuildingCauseMixBlock`(166줄) → 매매 블록 `CompanionAcqPurchaseBlock`을 `buildingCause` 모드로 재사용. 건물 파트 = `LandBuildingSplitSection` ② 「건물 취득가액 방식」: 고정 칩 + `PartAcqInputs`(평가액 1칸, 라벨 `BUILDING_CAUSE_META`).
- 건물 날짜 < 2005-04-30: 엔진 leaf `isSec163_9BuildingProviso`(`transfer-split-part-cause.ts:184`) → Y4. 화면 안내 `buildingCauseDateNotices`(`transfer-land-part-cause.ts:176`)·⑧ 칸 이동 `acquisitionDate`·⑫ 400. **D2-4가 이 차단을 ② 입력으로 바꾼다.**
- 토글 설명 문구(`BuildingCauseMixBlock.tsx` 「개별주택가격 미공시 3-시점 환산(…§164⑦)은 적용되지 않습니다」)는 D2-4 후 **거짓**이 된다 → 문구 갱신 필요(§5 ⑤).

### 1.3 건물분 ②에 필요한 입력 — 약분 실측 (법령 확정은 엔진 시니어)

사용자 정리: ② = (상속개시일 시점 개별주택가격 추정) × 건물 기준시가 ÷ (토지 기준시가 + 건물 기준시가). 취득시 개별주택가격 추정 `H_A = P_F × (L_A + B_A) ÷ (L_F + B_F)`(기존 §164⑦·⑤ 준용 산식)를 넣으면:

```
F2:  ② = H_A × B_A ÷ (L_A + B_A)              (사용자 정리 그대로)
F1:  ② = P_F × B_A ÷ (L_F + B_F)              (H_A 대입 후 L_A+B_A 약분)
```

- **실측(probe, 난수 2,000 시드)**: `floor(floor(P_F·(L_A+B_A)/(L_F+B_F))·B_A/(L_A+B_A))`(F2) 대 `floor(P_F·B_A/(L_F+B_F))`(F1)의 최대 차이 **1원**(이중 floor 때문). 대수적으로 동일 ⇒ **H_A가 추정값일 때 취득시 토지기준시가 `L_A`는 ②에 영향이 없다.**
- 따라서 ② 입력: `P_F`(최초공시 개별주택가격) · `L_F`(최초공시 ㎡당 개별공시지가 × 면적) · `B_F`(최초공시 시점 건물 기준시가) · `B_A`(취득시 건물 기준시가) + 면적. **L_A(취득시 개별공시지가)·1990 등급환산(Pre1990)·양도시 4칸이 필요 없다.** 이 구간에는 상속개시일이 1990.8.30. 이전인 사례가 많아(경계일 2005.4.30. 전체) 등급 3종을 안 받는 것이 입력 부담을 가장 크게 줄인다.
- **단 `H_A` 직접입력(주택가격 override 토글)을 건물 ②에도 허용하면 `L_A`가 다시 필요**하다 — 권장은 허용 안 함(§12 Q-6 연관).
- 기존 위젯 미리보기는 `Math.floor(P_F * sumA / sumF)`(float 곱셈)라 엔진 `safeMultiplyThenDivide`와 다른 정밀도다(`HouseValuationSection.tsx` 환산 가격 블록). 새 카드는 **엔진이 export하는 순수 함수를 import**해 표시한다(재구현 금지 — `feedback_ui_engine_dual_truth_avoidance`).

### 1.4 `inhHouseVal*` 소비처 전수 (역방향 grep) — 키를 공유해도 충돌하는 곳

| 소비처 | D2 유효 시 | 비고 |
|---|---|---|
| ④ `buildInheritedHouseValuationPayload` | `{}` (가드 `:187`) | D2-4 후에도 유지 — D2 ②는 **다른 전송 필드**(`buildingSec164Value`)로 간다 |
| ⑧ `sec164PartialInputError`(`validate-sec164.ts:47`)·`clauseADeclarationError`(`validate-clause-a.ts:59,207`) | 미도달 (`validateAssetAcquisition:129` 가 `validateBuildingCauseSplit`로 먼저 분기) | 실측: D2 ON + 2003 → ⑧ 첫 오류 field `acquisitionDate`(Y4), `inheritedHouseValuation` payload `{}` |
| ⑤ `PreDeemedInputs`/`PostDeemedInputs`/`GiftHouseStdPriceSection` | 미마운트 | |
| `sec164HouseStatus` `shared` 규약 | `inhHouseVal*`는 「§164 전용」(공유 아님) 으로 선언(`sec164-required-fields.ts:57`) | 키를 D2 카드가 같이 쓰면 이 주석의 전제가 깨진다 → 주석 갱신 필요(§5 ⑧) |

**H-1 (실측)**: D2 카드의 4칸만 채운 뒤 토글 OFF → 자산 단위 상속 분기의 ⑧이 「§164⑤~⑦ 취득당시 기준시가는 5개 항목을 모두 입력하거나 모두 비워두세요 (누락: 토지 면적 · 양도시 개별공시지가 · 취득당시 개별공시지가)」로 차단, 이동 칸 `inhHouseValLandArea`. 그 칸은 OFF 후 보이는 자산 단위 위젯 안에 있어 **막다른 길은 아니다**(채우거나 비운다). 반대 방향(자산 단위 11칸을 채운 뒤 D2 ON)은 카드가 4칸을 미리 채워 보여 주므로 오히려 이롭다. → 키 공유(A안) 채택, H-1은 테스트로 고정(§9).

---

## 2. 재사용 판정

| 후보 | 판정 | 이유 |
|---|---|---|
| `HouseValuationSection` **통째** | **불가** | ① 양도시 블록(공시지가·개별주택가격)을 요구 — ②에 쓰이지 않는 칸이라 「입력해도 세액이 안 변하는 거짓 요구」 ② 헤더·미리보기가 「환산 가격(§164⑤) = 주택 단일값」이라 건물분이 아님 ③ 취득시 토지단가·Pre1990 분기가 ②에 불필요 ④ 634줄 컴포넌트에 `mode` prop 분기를 얹으면 800줄에 접근(§5 800줄) |
| `HouseValuationSection`에서 **`batchPoints` 빌더 추출** | **가** | 3시점 일괄 계산기 points 구성(취득≤2000이면 위치지수 공시지가 비움 등)을 `buildHouseBatchPoints(asset, transferDate, includeTransfer)` leaf로 빼서 위젯·신규 카드가 공유. 위젯 −30줄 |
| `LandPriceLookupField` | **가** | 최초공시 ㎡당 공시지가 칸. `referenceDate="2005-04-30"` 고정(기존 위젯과 같음), `data-field` 지원 |
| `StandardPriceInput`(`propertyKind="house_individual"`) | **가** | 최초공시 개별주택가격 칸. 기존 위젯이 `data-field="inhHouseValHousePriceAtFirst"` 이미 사용 |
| `MultiPointBuildingStdPriceModal` | **가(2시점)** | 컴포넌트가 1~3 시점 지원(헤더 주석). 취득·최초공시 2시점만 넘긴다. 단독주택 전용 게이트 `deriveInheritanceHouseKind(asset) === "house_individual"`도 재사용 |
| `Pre1990LandValuationInput` | **불필요** | §1.3 약분 — 만약 엔진이 F2(취득시 토지단가 필요)로 확정하면 `LandSec164Card`처럼 `alwaysOpen`으로 얹는다(§10 E-1 분기 B) |
| `sec164AcqTimePointLabel`·`isDeemedAcquisitionApplied` | **가** | 취득시 건물기준시가 라벨. 건물 날짜 < 1985.1.1.이면 「1985.1.1. 시점」(부칙 법률 제4803호 §8 — 계획서 §11 D1-4b에서 본문 확인한 같은 규약) |
| `Frac`(`results/shared/FormulaParts`) | **가** | 카드 산식 표시 |

**결론**: 신규 `components/calc/transfer/BuildingSec164Card.tsx`(`LandSec164Card`와 같은 층, ~170줄). 원자 위젯 재사용, 키 재사용.

---

## 3. 화면 설계

### 3.1 마운트 위치와 가시성

- 위치: `LandBuildingSplitSection.tsx`의 ② 「건물 취득가액 방식」 블록, `PartAcqInputs part="building"` **바로 아래**(평가액 ① 칸 직하, 자본적지출 그리드 위). D1-4b의 `LandSec164Card`가 토지 ① 아래에 오는 것과 대칭. (`:431-480` 부근, `buildingOwned` 안.)
- 호출: `{props.buildingCause && props.asset && props.onAssetChange && <BuildingSec164Card .../>}` — 카드 자신이 `buildingSec164Applies(asset)`로 최종 게이트(null 반환). **마운트 조건을 따로 재파생하지 않는다**(`landCause`·`buildingCause` 1회 주입 규약).
- 가시성 술어 = ④⑥⑧이 쓰는 술어와 **동일 함수**(§4). 거짓이면 카드 없음·전송 없음·요구 없음.

### 3.2 목업 (건물 상속 2003-05-01 + 토지 매매, 데스크톱)

```
┌ ① 취득일                      [토지 취득일 2002-01-10] [건물 상속개시일 2003-05-01]  ⚠ 같은 날 caption(Q-4)만
│                                (경계일 전 caption 은 주택 구간에서 제거 — 아래 카드가 안내)
├ ② 건물 취득가액 방식   ▣ 실거래가 · 상속개시일 평가액 (고정 칩)
│   [건물 상속개시일 평가액 ________ 원]          ← 기존 PartAcqInputs (① 평가액)
│ ┌ amber ToneCard ────────────────────────────────────────────────────────────────┐
│ │ 건물 취득가액 비교 — 개별주택가격 고시 전 상속          [소령 §163⑨] [소령 §164⑦] │
│ │ 건물을 2003-05-01에 상속받았는데 그때는 개별주택가격이 공시되기 전(2005.4.30.      │
│ │ 이전)이라, 위 상속개시일 평가액과 최초 공시된 개별주택가격을 건물분으로 안분한      │
│ │ 영 §164⑦ 가액 중 많은 금액이 건물 취득가액입니다 (…§163조 제9항 단서 2호).        │
│ │ 토지 면적은 기본 정보의 토지 면적을 사용합니다.        [건물 기준시가 계산 ▸]       │
│ │ ─ 최초 공시 시점 ───────────────────────────────────────────────────────────   │
│ │ [최초 공시된 개별주택가격(토지 포함) ____ 원 ▸조회] [최초공시 개별공시지가 ___ 원/㎡ ▾연도 ▸조회] │
│ │ [최초공시 시점 건물 기준시가 ______ 원]                                         │
│ │ ─ 건물 상속개시일 시점 ──────────────────────────────────────────────────────   │
│ │ [건물 상속개시일 시점 건물 기준시가 ______ 원]                                   │
│ │ ┌ dashed 파생 박스 ─────────────────────────────────────────────────────────┐  │
│ │ │ 영 §164⑦ 가액 = 최초 공시된 개별주택가격 × 상속개시일 시점 건물 기준시가       │  │
│ │ │                 ÷ (최초공시 토지 기준시가 + 최초공시 건물 기준시가)          │  │
│ │ │   80,000,000 × 20,000,000 ÷ (60,000,000 + 25,000,000)  [× 지분 50%]       │  │
│ │ │ 영 §164⑦ 가액 …………………………………………… 18,823,529                       │  │
│ │ │ 취득가액은 위 평가액과 이 가액 중 많은 금액 — 채택은 계산 결과에서 확인       │  │
│ │ └────────────────────────────────────────────────────────────────────────────┘  │
│ └────────────────────────────────────────────────────────────────────────────────┘
├ 자본적지출 …
```
(숫자는 §1.3 F1 산식의 **예시 손계산**이며 엔진 확정 전 가정이다 — 화면에 예시 숫자 placeholder를 넣지 않는다. 위 숫자는 입력값이 파생 박스에 표시된 모양이다.)

모바일: 2열 그리드는 `grid-cols-1 sm:grid-cols-2`, 파생 박스는 줄바꿈 허용(`LandSec164Card`와 같은 방식). `Pre1990LandValuationInput` 좁은 폭 보정은 불필요(그 컴포넌트 미사용).

### 3.3 문구·라벨 규칙

- 시점 라벨: 상속 = 「상속개시일」 / 증여 = 「증여일」(`buildingCause`로 분기, `BUILDING_CAUSE_META` 확장 — `dateLabel`·`valueLabel` 추가). 취득시 건물 기준시가 라벨은 `sec164AcqTimePointLabel(date, 라벨)`(< 1985.1.1.이면 「1985.1.1.」 시점 + 안내 caption 1줄 — 기존 위젯 `isDeemedAcq` 문구 재사용).
- 최초공시 라벨: 「최초 공시된 개별주택가격」·「최초공시 개별공시지가」·「최초공시 시점 건물 기준시가」(기존 위젯 어휘와 동일 — 사용자가 한 어휘로 검증).
- 산식 한국어 풀어쓰기, 각 숫자 옆 변수명 라벨, 중간 산술 결과 미표시, `floor` 미표기. 약어(`P_F`·`B_A`) 금지.
- placeholder 숫자 예시 금지 — 형식 설명은 `FieldCard hint`(예: 「홈택스/부동산공시가격알리미 — 최초 공시 시점 개별주택가격(부수토지 포함)」). 금액 칸 placeholder는 비우거나 「원」 단위 문구만.
- **입력 화면에 채택값(max)을 표시하지 않는다**(D1-4 D14-1과 같은 이유 — 채택은 엔진, 클라이언트 `max` 재작성은 이중 진실). 대신 중립 문구 「취득가액은 위 평가액과 이 가액 중 많은 금액 — 채택은 계산 결과에서 확인」.
- 신규 카드·라벨은 `ToneCard`(톤 하드코딩 금지) · 라벨 정본 클래스 · 임의 px 금지 · 모달 런처는 `Button variant="modalLauncher"`(계획서 CLAUDE.md 규칙). 토글 없음(법이 정한 계산 — `alwaysOpen` 취지), 따라서 ToggleCard 불필요.
- `useEffect → store` 미러링 0. 파생값은 렌더 중 브리지 함수로 계산해 **표시만**. `onCalculatedPrice` 류 콜백 미사용.
- **셀렉터 유일성(메모리 `feedback_new_widget_breaks_uniqueness_selectors`)**: 카드 어디에도 「취득 당시 개별주택가격 미공시」(PHD 토글 제목)·「상속세 신고 시 평가방법」 문구를 쓰지 않는다 — 기존 E2E가 D2 ON에서 그 문구 `toHaveCount(0)`을 단언한다(`e2e/transfer-acq-cause-mixed-d2-2.spec.ts` 「Check #1」 및 첫 테스트). 카드 제목은 「건물 취득가액 비교」.

### 3.4 기존 문구 변경

| 위치 | 현행 | D2-4 |
|---|---|---|
| `BuildingCauseMixBlock.tsx` `building-cause-guide` | 「…개별주택가격 미공시 3-시점 환산(…§164⑦)은 적용되지 않습니다」 | 「건물 상속개시일(증여일)이 개별주택가격 최초공시일(2005.4.30.) 전이면 평가액과 영 §164⑦ 가액 중 많은 금액이 취득가액이며, 그 입력은 건물 평가액 아래 카드에서 받습니다」 로 교체. 자산 단위 3시점 환산(토지·건물을 모두 하나의 상속으로 취득한 경우)과 구별되는 점 명시 |
| `BUILDING_CAUSE_PRE_DISCLOSURE_NOTICE`(`transfer-land-part-cause.ts`) | 입력 중 차단 안내 | 주택 구간이면 **notice 제거**(카드가 안내). 비주택 `building`(범위 밖)에서만 남기고 「이 계산기는 주택만 …」으로 정정 |
| `LandBuildingSplitSection.tsx:434` 고정 칩 문구 | 「…환산·감정·매매사례로 산정하지 않습니다」 | 불변 |
| `BUILDING_CAUSE_META.*.hint` | 건물 평가액 안내 | 경계 구간에서는 hint 끝에 「(개별주택가격 고시 전이면 아래 영 §164⑦ 가액과 비교)」 1줄 추가(구간 판정은 같은 술어) |

---

## 4. 술어 공유 (한 리프)

```ts
// 엔진 leaf (lib/tax-engine/transfer-split-part-cause.ts) — 엔진·⑫·④·⑤·⑥·⑧이 공유
isSec163_9BuildingSec164Applies(cause, buildingDate, isHousing): boolean
  = isSec163_9BuildingProviso(cause, buildingDate) && isHousing   // 경계: < 2005-04-30
// 클라이언트 (lib/calc/transfer-sec164-building-part-bridge.ts, 신규 — transfer-pre1990-housing-land-bridge.ts 미러)
buildingSec164Applies(asset) = isSec163_9BuildingSec164Applies(effectiveBuildingCauseMix(asset), asset.acquisitionDate, asset.assetKind === "housing")
```

- 건물 날짜는 **`acquisitionDate`**(상속개시일 3키 `buildingDatePatch`가 같이 쓴다 — D2-2) — ⑧의 `buildingAcquisitionDate`와 같은 식.
- **미적용(주택 아님·공동주택 포함 여부 등)**은 종전 Y4 유지: `isSec163_9BuildingProviso`는 의미 불변으로 남기고 새 술어가 「주택」 조건을 더한다. 엔진 leaf 사실에 `buildingIsHousing`(또는 자산 종류)이 필요하다 → §10 E-3.
- 공동주택(`inheritanceAssetKind === "house_apart"`)의 건물분 ②: 공동주택가격은 토지 포함 단일 공시(건물분 기준시가 개념 부재) → **확인 필요(§12 Q-1)**. 권장 = 단독·다가구(`house_individual`)만, 공동주택은 종전 차단 + 안내.
- 술어는 `useEffect`가 아니라 렌더·함수 호출에서 읽는다. 저장값은 지우지 않는다.

---

## 5. ①~⑧ 변경표 (클라이언트) + ⑨~⑭ 맞출 지점

| 지점 | 파일 | 변경 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset.ts` | **변경 없음**(`inhHouseVal*` 4키 + `acquisitionArea` 재사용). 주석에 「D2-4 건물 ②도 읽는다」 추가 |
| ② initial | `calc-wizard-asset-factory.ts:247-258` | 변경 없음 |
| ③ normalize | `calc-wizard-asset-migrate.ts:256-267` | 변경 없음(키 모두 이미 normalize). **신규 키 0이라 stale 저장 가드(`feedback_new_asset_field_stale_sessionstorage_guard`) 해당 없음** |
| ④ API 변환 | `lib/calc/transfer-tax-api-split.ts`(294줄) `buildLandPartCausePayload` | D2 분기(`engineLandOverlay === "purchase"`)에 `...(buildingSec164Applies && total>0 ? { buildingSec164Value: total } : {})`, 일부 양도(`areaScenario === "partial"`)이면 `isPartialAreaTransfer: true`(**필드 재사용 가능 여부는 엔진 설계 E-4**). 신규 브리지 `transfer-sec164-building-part-bridge.ts`: `buildingSec164Applies`·`deriveBuildingSec164Total(asset)`(엔진 export 순수 함수 호출 + 지분 `applyRatio` 1회 floor)·`sec164BuildingPartStatus` 소비 |
| ④ 호출 3곳 | `transfer-tax-api.ts:500` · `multi-transfer-tax-api.ts:295` · `transfer-tax-api-companion-payload.ts:205`(`splitActive ?`) | **수정 불필요**(코드 확인: 모두 `buildLandPartCausePayload` 호출 — D1-4와 같은 이유). 컴패니언은 `splitActive` 게이트라 D2 유효 시 true |
| ④ 가드 유지 | `transfer-tax-api-inheritance.ts:187` | `effectiveBuildingCauseMix` 가드 **유지** — D2에서 자산 단위 `inheritedHouseValuation`은 계속 안 보낸다(Y7). 주석의 「경계일 전은 ⑫·⑧이 막으므로 도달하지 않는다」를 「D2 ②는 `buildingSec164Value`로 간다」로 정정 |
| ⑤ 위젯 | 신규 `components/calc/transfer/BuildingSec164Card.tsx` + `LandBuildingSplitSection.tsx` 마운트(+~8줄, 510줄) + `HouseValuationSection.tsx`에서 `buildHouseBatchPoints` 추출(−30줄) + `BuildingCauseMixBlock.tsx` 문구 + `CompanionAcqDateSection.tsx`/`buildingCauseDateNotices` 정리 + `land-cause-meta.ts` `BUILDING_CAUSE_META` 확장 | §3 |
| ⑥ 사이드바 | `lib/calc/transfer-tax-split-acq-mode.ts:263`(707줄 — +3줄) | 건물 소유 ∧ `isSec163_9BuildingSec164Applies(effectiveBuildingCauseMix(asset), asset.acquisitionDate, housing)` → `pending = true`. 결과 도착 후는 `transfer-per-asset-summary.ts:436` 기존 분기 |
| ⑦ 결과 | `transfer-tax-split-display.ts`(458줄)·`SplitGainDetailSection.tsx`·`split-acq-text.ts`·`FilingFormTableHelpers.ts`·`ResultPdfTransferSections.tsx` | §8.2 |
| ⑧ validation | `transfer-tax-validate-split.ts`(629줄) `validateLandPartCause` + `validateBuildingSec164Inputs`(신규, ~20줄) + `sec164-required-fields.ts`(237줄) `sec164BuildingPartStatus` + `transfer-tax-validate-building-cause.ts` | §7 |
| ⑧ 라벨 | `lib/calc/transfer-tax-error-format.ts:48` | `buildingSec164Value: "건물 영 §164⑦ 가액"` 추가(`landSec164Value` 옆) — 필드 오류 한국어 라벨 맵 |
| ⑨⑩ Zod enum | — | 해당 없음(enum 신규 0) — 단 `acquisitionBasis.rule` 응답 타입 union에 `"sec163_9_2"` 추가(엔진) |
| ⑫ Zod 입력 | `lib/api/transfer-tax-schema-split.ts:34` · `-base-shape.ts:282` · `-required-refines-2a.ts:73,364,395` | `buildingSec164Value: z.number().int().positive().optional()` 3곳 + refine 사실 공급. **`landSec164Value`를 grep한 14파일이 체크리스트** |
| ⑬ body spread | `buildLandPartCausePayload`가 3곳 공용(위) | 추가 spread 없음 |
| ⑭ Route 매핑 | `app/api/calc/transfer/engine-input.ts:333` · `multi/route.ts:200` · `bundled-split-helpers.ts:390` | `buildingSec164Value` 매핑 3곳 (Date 변환 불필요) |

⑨⑩⑫⑭는 엔진 시니어 소관이고 위는 **누락 방지 체크리스트**다(⑫⑬⑭는 TypeScript가 못 잡는다 — 침묵 stripping).

---

## 6. Stale·읽는 쪽 파생 규칙 (저장값은 지우지 않는다)

| 상황 | 규칙 |
|---|---|
| 건물 날짜를 2005-04-30 이후로 수정 | 카드 숨김 · ④ 미전송 · ⑧ 요구 없음. 4칸 값은 남는다(날짜를 되돌리면 복원) |
| D2 토글 OFF | `effectiveBuildingCauseMix` 거짓 → 카드·전송 전부 소멸. 값은 남는다 → 자산 단위 분기가 H-1 메시지를 낼 수 있음(위젯 가시) |
| 상속 ↔ 증여 호스트 전환 | `landCauseHost`가 비워져(D1-2 F2) D2 무효. 값 보존. 라벨은 호스트별 |
| `housing` → `building` 전환 | 새 술어 거짓 → 카드 숨김 → 날짜 < 2005-04-30이면 종전 Y4 차단(범위 밖 안내). 값 보존 |
| 자산 단위 11칸이 이미 채워진 상태에서 D2 ON | 카드가 4칸을 그대로 표시(같은 물리량). 나머지 7칸은 읽지 않는다 |
| `acquisitionArea` | 콤마 제거 후 파싱(D1-4 Low와 같은 규약 — 카드 ②와 ④ ②가 갈리지 않게 `sec164AreaSqm` 재사용 또는 export). 면적 방식 「일부 양도」는 §12 Q-4 |
| 지분 `ratio < 1` | 입력은 **100% 기준**(개별주택가격·기준시가는 물건 전체 값). ② 총액만 `applyRatio` 1회 floor로 지분 스케일 — ① `ratioed(buildingAcquisitionPrice)`와 같은 축 |
| 건물 방식 | D2 유효 시 `actual` 고정(`withBuildingActualWhenMix`) — 불변 |

---

## 7. ⑧ 검증 — 순서·앵커·격자

### 7.1 순서 (= 카드 위→아래 = 계산 순서)

`validateBuildingCauseSplit` 순서(건물 취득일 → 피상속인 취득일 → 동일세대 시작일 → `validateSplitDirectInputs`)는 유지. `validateLandPartCause` 안에서 엔진 leaf의 Y-순서(구조 Y1 → Y2 토지일 → **Y4′ 건물 ②** → Y3 방식 → Y7 → Y9)가 그대로이고, Y4′가 발동하면 `validateBuildingSec164Inputs`로 위임(D1-4b `validateLandSec164Inputs`와 같은 모양):

1. 면적 `acquisitionArea` (미입력/0)
2. 최초 공시된 개별주택가격 `inhHouseValHousePriceAtFirst`
3. 최초공시 개별공시지가 `inhHouseValLandPricePerSqmAtFirst`
4. 최초공시 시점 건물 기준시가 `inhHouseValBuildingStdPriceAtFirst`
5. 취득시 건물 기준시가 `inhHouseValBuildingStdPriceAtInheritance`
6. (모두 찼는데 ②가 안 나옴 — 분모 0 등) → 마지막 칸 `inhHouseValBuildingStdPriceAtFirst`로 이동 + 문구
7. 일부 양도 → `areaScenario` (Q-4)

`sec164BuildingPartStatus(asset)`: `sec164LandPartStatus`와 같은 모양의 **필수 5칸**(단일 소스: ④ 브리지의 완결 판정 · ⑧ 요구 · ⑤ 안내 「입력할 칸: …」). ⚠️ 기존 `sec164HouseStatus`는 건물 기준시가 2칸을 필수에 넣지 않는다 — **새 상태 함수는 5칸 모두 필수**(없으면 ②=0 → ① 단독 침묵 계산 = 자동 fallback 금지 위반).

### 7.2 앵커 (`data-field`) — 화면에 각 1개씩

| 오류 field | 앵커 | 현황 |
|---|---|---|
| `acquisitionArea` | `AssetAreaSection` 래퍼(`:381`/`:406`) | 기존 |
| `inhHouseValHousePriceAtFirst` | `StandardPriceInput data-field` | 기존 위젯 코드와 동일 prop |
| `inhHouseValLandPricePerSqmAtFirst` | `LandPriceLookupField data-field` | 기존 |
| `inhHouseValBuildingStdPriceAtFirst` · `…AtInheritance` | `FieldCard field=` | **기존 위젯에는 없음 → 신규 카드에서 추가** |
| `buildingSec164Value` | 카드 래퍼 `data-field` | 신규(D1-4 `landSec164Value` 래퍼와 대칭) |
| `areaScenario` | 면적 입력 방식 래퍼 | 기존(D1-4a 후속) |

D2-2의 「⑧ 이동 칸 앵커」 E2E(`e2e/transfer-acq-cause-mixed-d2-2.spec.ts:94`)에 위 칸을 추가한다(2003 시드에서 각 1개).

### 7.3 ⑧≡⑫ 격자 (메모리 `feedback_fe8_vs_12_parity_grid`) — 기대값은 엔진 정본(leaf)에서

차원: 호스트 {상속, 증여} × 자산 종류 {housing, building} × 건물 날짜 {1984-05-01(< 1985 의제 전), 1989-12-31, 2003-05-01, 2005-04-29, 2005-04-30(당일)} × 입력 {없음, 5칸 중 1칸 비움 ×5, 전부, 일부 양도, 지분 50%, 같은 날, 분모 0 시도} ≈ 2×2×5×10 = **200셀**.

| 규칙 | 기대 |
|---|---|
| 주택 ∧ 날짜 < 2005-04-30 ∧ 5칸 전부 | ⑧ 통과 ∧ ⑫ 200 ∧ echo `acquisitionBasis.rule === "sec163_9_2"` |
| 주택 ∧ 날짜 < 2005-04-30 ∧ 1칸 이상 비움 | ⑧ 차단(첫 비움 칸 앵커) ∧ ⑫ 400(`buildingSec164Value` 없음) |
| 주택 ∧ 일부 양도 | ⑧ 차단(`areaScenario`) ∧ ⑫ 400 |
| 비주택 `building` ∧ 날짜 < 2005-04-30 | ⑧ 차단(`acquisitionDate`, 범위 밖 문구) ∧ ⑫ 400 — **종전 Y4 유지** |
| 날짜 ≥ 2005-04-30 (당일 포함) | 종전 그대로(통과), `buildingSec164Value` 미전송, echo 없음 |
| 같은 날 | ⑧ 전용 차단(⑫ 200 — Q-4 기존 규약) |
| **막다른 길 없음** | ⑧ 통과 ⇒ ⑫ 통과 (전 셀 단언) |

추가 단언: ⑧ 차단 사유가 되는 **모든 field가 화면 앵커로 존재**(칸 이동 불능 0), 단건·다건·컴패니언 body의 `buildingSec164Value`·`isPartialAreaTransfer`가 바이트 동일(단건 `callTransferTaxAPI` vs `buildPropertyPayload` vs `buildAssetPayload`).

---

## 8. ⑥ 사이드바 · ⑦ 결과

### 8.1 ⑥

- 입력 단계: `separateAcqPartsSum` — 건물 소유 ∧ 새 술어 참이면 `pending: true`(① 평가액만의 부분합을 총액으로 오독하지 않게. D1-4 토지 한 줄과 같은 자리 `:263`). `directAcqRaw`(`transfer-per-asset-direct.ts`)·`calc-wizard-store.ts:371` 소비처는 `pending ? 0` 규약이라 무변경.
- 결과 도착 후: D2-2 분기(`transfer-per-asset-summary.ts:436` — `isSingle && acqPending && singleResult?.splitDetail && effectiveBuildingCauseMix(a)`)가 `summarizeSplitGain().acquisitionDeducted`로 해소 → **추가 분기 불필요**. 단 D1-4b Medium 교훈(입력 단계 pending이 결과 후에도 「계산 후 표시」에 갇힘)이 재발하는지 **Pre-Do로 실측**(건물 ② 시드 → route → 사이드바 취득가액이 pending 해소). 다건(`bundledProperty.splitDetail`) 경로는 **확인 필요**.
- 환산·감정 토지 파트와 건물 ② pending이 겹쳐도 같은 분기가 해소(`acqPending`은 OR).

### 8.2 ⑦ — `splitAcqBasisView` 최소 일반화

현행은 토지 전용: `SPLIT_SEC164_VALUE_LABEL = "영 §164④ 가액"`, `splitAcqBasisFormula`가 「토지 취득가액 = …」, 호출부 4곳이 「(소득세법 시행령 §163조 제9항 단서 1호)」를 하드코딩.

| 변경 | 내용 |
|---|---|
| 타입 | `LandAcquisitionBasis.rule`(`transfer-split-gain.types.ts`)에 `"sec163_9_2"` 추가(엔진 — 이름 `LandAcquisitionBasis`는 `AcquisitionBasis`로 개명 여부 E-5). 건물 파트에도 `acquisitionBasis?` 허용 |
| 상수 | `SPLIT_SEC164_VALUE_LABEL`을 규칙별 맵으로: `{ sec163_9_1: "영 §164④ 가액", sec163_9_2: "영 §164⑦ 가액" }`(기존 export 이름은 토지용으로 유지 → `LandSec164Card`·테스트 무변경) |
| view | `SplitAcqBasisView`에 `partLabel`("토지"/"건물")·`legalBasis`("소득세법 시행령 §163조 제9항 단서 1호"/"…단서 2호")를 `rule`에서 파생해 싣는다 |
| formula | `splitAcqBasisFormula(v)` = `${v.partLabel} 취득가액 = 많은 금액(${reportedLabel} A, ${sec164Label} B) = C`(숫자에 `/`·`÷` 없음 규약 유지) |
| 호출부 | 카드 `SplitGainDetailSection.tsx:99,172~`(`landBasis` → 파트 루프, testid `split-card-acq-basis[-reported/-sec164]`는 유지하고 `data-part` 추가, 제목은 `v.partLabel`·`v.legalBasis`) · 상세명세서 `split-acq-text.ts:45,88-89` · 신고서 `FilingFormTableHelpers.ts:415-417` · PDF `ResultPdfTransferSections.tsx:182-185` — **하드코딩 문구를 `v.legalBasis`로 교체** |
| 태그 | `partTag`: ② 채택 → 「건물(영 §164⑦ 가액)」, ① 채택 → 「건물(상속개시일 평가액)」·「건물(증여 신고가액)」(기존 `basis.adoptedLabel`) |
| find 1개 | `split-acq-text.ts:88`의 `parts.find`는 유지 — 토지·건물 둘 다 상속·증여는 R-X5가 막아 basis가 두 파트에 동시에 서지 않는다(코드 확인). 주석에 명시 |
| 구 이력 | echo 없음 → 종전 화면(`undefined`) |

이 결과 `splitAcqBasisView`는 규칙 이름을 모르는 호출부도 안전하다. **부정형 짝 필수**: 토지 ②(D1-4) 문구·testid가 한 글자도 안 바뀌는지 기존 `split-acq-basis-d1-4b.ui.anchor.test.tsx`로 고정.

산출 내역(분자·분모 4값)은 결과 화면에 **싣지 않는다**(D1-4와 동일 — 산출 검증은 입력 카드의 파생 박스, 결과는 비교 두 값과 채택). 사용자가 결과에서 산식 검증을 원하면 엔진에 echo 4필드 추가가 필요하다(§12 Q-6).

---

## 9. 테스트 계획

### 9.1 Pre-Do anchor (구현 전 RED → GREEN, 환류 기회 확보)

| # | 대상 | 내용 |
|---|---|---|
| P1 | 술어 진리표 | `buildingSec164Applies`: {상속, 증여} × {housing, building} × 날짜 5종 × D2 on/off × host 불일치 — 엔진 leaf와 일치 |
| P2 | 브리지 수치 | 손계산 고정(엔진 공식 확정 후 숫자 갱신): 단독 / 지분 50%(`applyRatio` 1회 floor) / 면적 콤마 「1,200」 / 분모 0 → null |
| P3 | ④ body 3경로 | 단건·다건·컴패니언 body에 `buildingSec164Value` 동일, `inheritedHouseValuation` 부재(가드 유지의 긍정 짝: D2 OFF면 종전대로 존재) |
| P4 | ⑧ 순서 | 5칸 하나씩 비움 → field가 위 순서대로, 전부 채우면 null. 비주택·공동주택 차단 문구 |
| P5 | ⑧≡⑫ 격자 | §7.3 200셀(⑫는 route 실호출 — 엔진 D2-4a 머지 후 활성, 그 전엔 todo) |
| P6 | ⑥ | 입력 단계 pending / 결과 후 해소(단건) / 다건 경로 실측 |
| P7 | ⑦ 4뷰 | `rule: "sec163_9_2"` echo 시드로 카드·상세명세서·신고서·PDF 문구, ②/① 채택 두 방향. 부정형 짝: 토지 ② 문구 불변 |
| P8 | 렌더 | 카드 마운트/언마운트, 앵커 각 1개, 「취득 당시 개별주택가격 미공시」 부재, 숫자 placeholder 0, effect 미러링 0, 상속/증여 라벨 분기, < 1985.1.1. 의제 라벨 |
| P9 | H-1 | D2 카드 4칸 + OFF → ⑧ 메시지 field가 **화면에 존재하는 앵커**임을 단언 |
| P10 | stale | 날짜 되돌림·호스트 전환·housing→building 전환에서 ④ body·⑧ 결과 변화 없음/복원 |

### 9.2 mutation probe (구현 후)

술어 경계(`<` → `<=`), 5칸 중 각 칸 제거, 지분 스케일 제거, `isHousing` 조건 제거, ⑥ pending 제거, `v.legalBasis` 하드코딩 복귀, partial 차단 제거, ④ 가드(`effectiveBuildingCauseMix`) 제거 — 각각 KILLED 확인. (최초 SURVIVED는 테스트 보강.)

### 9.3 반드시 뒤집어야 하는 기존 테스트 (역방향 grep — 필드명·상수 기준)

| 파일:위치 | 현재 단언 | D2-4 후 |
|---|---|---|
| `__tests__/tax-engine/transfer/split-part-cause.d2.test.ts:74-82` | Y4 경계 2005-04-29 차단 / 04-30 통과 | **주택**은 `acquisitionDate` Y4가 아니라 `buildingSec164Value` 필수 이슈. 비주택은 불변. `isSec163_9BuildingProviso` 단위 테스트(`:79-82`)는 유지 |
| 같은 파일 `:109-113`(순서 Y1→Y2→Y4→Y3→Y7) · `:185-187`(엔진 throw) · `:293`(⑫ Y4 field `acquisitionDate`) · `:343`(컴패니언 `companionAssets.0.acquisitionDate`) · `:304`(긍정 짝 경계 당일) | field `acquisitionDate` · 메시지 「기준시가…고시되기 전」 | 주택: field `buildingSec164Value`·새 메시지 / 비주택: 불변 |
| `__tests__/api/transfer.route.split-building-cause.d2.predo.anchor.test.ts:272-281`(D2-C5) | 2003 → 400 field `acquisitionDate` | 주택 2003 + ② 없음 → 400 field `buildingSec164Value`; + ② 있음 → 200 echo 신규 케이스; 04-29→400 은 ② 없음 사유로 |
| 같은 파일 `:300-305`(D2-C8: PHD 메시지가 Y4보다 먼저) | 구조 규칙 우선 | **유지**(구조 → ②) |
| 같은 파일 `:401-403` | `it.todo` D2-4 | 활성화 |
| `__tests__/api/transfer.route.split-building-cause.d2-1.routes.anchor.test.ts:103-110` | 다건 2003 → 400 | status 400 유지(② 없음) — 메시지 단언이 있으면 갱신 + 긍정 짝(② 포함 → 200) 추가 |
| `__tests__/calc/transfer-land-part-cause.d2.predo.test.ts:291-293`(B6) · `:335-346`(C3b) · `:406`(C10~C14) · `:424`(C15 격자 「경계일 전」 셀 ⑧ block ⑫ block) | 경계일 전 = 날짜 사유 차단 | 격자를 §7.3 으로 확장(경계일 전 셀은 입력 유무로 갈림). C3b는 가드 단독 검증이라 유지 + `buildingSec164Value` 부재/존재 짝 추가 |
| `__tests__/calc/transfer-land-part-cause.d2.predo.render.test.tsx:221-?`(C6 경계일 전 안내) · `:147`·`:197-198`(C4) · `:361-375` | 경계일 전 안내 caption | 주택은 caption→카드. C4(PHD 토글 미렌더)는 유지하되 카드 존재와 함께 단언 |
| `__tests__/calc/_d2-ui-anchors.ts:10` | `"acquisitionDate", // Y4 · 건물 날짜 필수` | Y4 주석 갱신 + 신규 앵커 6개 추가 |
| `e2e/transfer-acq-cause-mixed-d2-2.spec.ts:239-253` | 「건물 상속개시일 2005.4.30. 전 → 안내(차단은 ⑧) · 계산 시도가 건물 상속개시일 칸으로 이동」 | **뒤집기**: 카드 노출·② 미입력 시 계산 시도가 `inhHouseValHousePriceAtFirst`(첫 빈 칸)로 이동 · 긍정 짝(2025로 고치면 카드 사라짐) 유지 |
| 같은 spec 「Check #1」(`:275-`, 2003 시드로 ON→OFF) | ON 상태에서 「취득 당시 개별주택가격 미공시」 0 | 카드 신설 후에도 성립해야 함(§3.3 문구 규칙) — 회귀 확인용 |

주의: 위 grep은 **필드명·상수명 기준**으로 했다(문구 기준 grep은 문구 변경에 가려진다 — 메모리 `feedback_e2e_reverse_grep_by_field_not_phrase`). 구현 시 `isSec163_9BuildingProviso`·`BUILDING_CAUSE_PRE_DISCLOSURE_*`·`buildingCauseDateNotices`·`building-cause-date-notice` 를 다시 역방향 grep해 위 목록과 대조한다.

### 9.4 E2E (신규 `e2e/transfer-acq-cause-mixed-d2-4.spec.ts`)

시드는 `e2e/_helpers/split-acq-display.ts`(`seedWizard`·`singleSeed`·`housing`·`calculate`·`card`·`stmtText`)와 d2-2 spec의 `inherited/gifted/d2` 팩토리 패턴 재사용. 워크트리 실행은 `E2E_PORT` 필수.

1. 건물 상속 2003-05-01 + 토지 매매 → 카드 노출, 앵커 각 1개, 카드 제목·「취득 당시 개별주택가격 미공시」 부재.
2. 입력 → 계산: body에 `buildingSec164Value`·`landAcquisitionCause: "purchase"`, `inheritedHouseValuation` 부재 → 결과 카드 「건물 취득가액 비교」 블록, **② 채택**(① < ②) 시나리오와 **① 채택**(① > ②) 시나리오 각 1.
3. 증여 호스트 라벨(증여일·증여 신고가액).
4. ⑧: 빈 상태로 「다음」 → 첫 빈 칸 이동(`inhHouseValHousePriceAtFirst`), 칸을 하나씩 채워 가며 순서대로 이동.
5. 날짜를 2025로 고치면 카드·요구 소멸(긍정 짝), 2005-04-30 당일도 소멸.
6. 비주택 `building` + 2003 → 종전 차단 유지.
7. 사이드바 취득가액: 입력 단계 「계산 후 표시」→ 결과 후 값.
8. 토글 OFF → H-1 메시지 이동 칸이 화면에 존재.
9. 모바일 폭 스크린샷(375px)에서 카드 칸 잘림 없음.

---

## 10. 엔진 설계와 맞출 지점 (엔진 시니어 문서와 대조 — 문서가 생기면 먼저 읽을 것)

| # | 지점 | 이 문서의 가정 | 어긋나면 |
|---|---|---|---|
| E-1 | **② 산식·입력 집합**: F1 `P_F×B_A÷(L_F+B_F)`(5칸) vs F2 `H_A×B_A÷(L_A+B_A)`(+취득시 토지단가·1990 등급, +양도시 입력) | F1 | F2면 카드에 `Pre1990LandValuationInput alwaysOpen`·취득시 공시지가 칸 추가(§2 표 「불필요」 → 「필요」), `calculateInheritanceHouseValuation`의 양도시 필수 검증을 건물 ②용으로 완화하거나 별도 함수 export 필요(실측: 현행은 양도시 0이면 throw). 분모 정의(`L_F` 포함 여부)는 법령 확인 |
| E-2 | 엔진이 노출할 **순수 함수**(클라이언트 import용) | `calcBuildingSec164Value({housePriceAtFirst, landPricePerSqmAtFirst, landArea, buildingStdAtFirst, buildingStdAtAcq})` | 이름·시그니처는 엔진 시니어 정본. 브리지가 호출만 한다(재구현 금지) |
| E-3 | leaf 사실에 **주택 여부** 추가(`isSplitable`은 housing/building 둘 다 true) | `buildingIsHousing` 또는 자산 종류 | 없으면 비주택 `building`까지 ② 요구/수용이 열린다 |
| E-4 | **일부 양도** 사실 재사용 | `isPartialAreaTransfer`를 건물 단서에도 사용 | 별도 이름이면 ④ 한 줄만 바뀜 |
| E-5 | 응답 타입 | `acquisitionBasis{rule:"sec163_9_2",reported,sec164,adopted}`가 건물 파트에 실림 | `LandAcquisitionBasis` 개명 여부는 ⑦ 한 곳 |
| E-6 | ⑫ 필드명 `buildingSec164Value`(양의 정수) | 위 이름 | 다르면 ⑧ 앵커·`error-format` 라벨·이 문서 일괄 치환 |
| E-7 | 경계일 | 주택 2005-04-30 (현행 `SEC_163_9_BUILDING_FIRST_DISCLOSURE` 보수적 상위 집합 유지) | 법령상 경계가 더 이르면 술어 상수 1곳(leaf)만 변경 |
| E-8 | 법령 인용 문구(단서 2호·§164⑦·재산세과-1702 해석 연결) | 카드·⑦ 문구는 「소득세법 시행령 §163조 제9항 단서 2호」·「영 §164⑦」 | **본문·해석례 확인 전에는 화면에 해석례 번호를 쓰지 않는다**(`feedback_unverified_authority_blocks_tax_change`). 확인되면 법령 배지 문구 확정 |

D2-4a에서 leaf가 먼저 바뀌면 ⑧은 D1-4a와 같이 **임시 문구**(「이 계산기 화면은 영 §164⑦ 가액 입력을 받지 않아…」)로 계속 막아 화면 변화 0·막다른 길 0을 유지한다(D2-4b에서 삭제).

---

## 11. PR 분할·800줄

| PR | 범위 | 화면 |
|---|---|---|
| **D2-4a** | 엔진 leaf·②·echo·⑫(14파일 체크리스트)·⑭ 3곳 + ④ 브리지(`transfer-sec164-building-part-bridge.ts`)·`buildLandPartCausePayload` 한 줄 + ⑧ 임시 문구 + Pre-Do P1~P3 활성 | 변화 0 |
| **D2-4b** | ⑤ `BuildingSec164Card`·`buildHouseBatchPoints` 추출·문구 갱신 · ⑧ `sec164BuildingPartStatus`·`validateBuildingSec164Inputs`(임시 문구 삭제) · ⑥ pending · ⑦ 일반화 · 테스트 뒤집기(§9.3) · E2E | 열림 |

800줄: `transfer-tax-split-acq-mode.ts` 707 → ≈712(트리거 800 미만, 착지 ≤700 초과지만 증가 3줄 — 이미 연 파일이 ≥750이 아니므로 분리 불요), `LandBuildingSplitSection.tsx` 510 → ≈520, `transfer-tax-validate-split.ts` 629 → ≈655, `HouseValuationSection.tsx` 634 → ≈605(추출), 신규 카드 ≈170, 브리지 ≈90. 초과 예상 없음.

---

## 12. 사용자 결정 필요 (권장안)

| # | 질문 | 선택지 | 권장 | 이유 |
|---|---|---|---|---|
| **Q-1** | **범위**: 어떤 건물 파트까지 ② 입력을 열까 | (a) 단독·다가구 주택만 (b) 공동주택 포함 (c) 비주택 `building` 포함 | **(a)** | 공동주택가격은 토지 포함 단일 공시라 건물분 기준시가 개념이 없고(확인 필요), 비주택 건물은 최초고시일·산식 체계가 다르다(V-12 — 상가 2005.1.1. · 일반건물 2001.1.1.). 나머지는 종전 차단 유지 + 안내 |
| **Q-2** | **필수 vs opt-in** | (a) ② 필수 — 비면 차단 (b) opt-in(전부 비면 ① 단독 계산, 일부만 채우면 차단) | **(a)** | 법이 정한 「많은 금액」 비교(§163⑨ 단서)를 건너뛴 ① 단독 계산은 하지 않는다(D14-2와 동일). 현재 이 구간은 전부 차단이라 새로 막히는 사용자가 없다 |
| **Q-3** | **필드 키**: 자산 단위 `inhHouseVal*` 4키를 공유할까, D2-4 전용 키를 신설할까 | (A) 공유 (B) 전용 4키 신설(①②③ 3지점 + 마이그레이션) | **(A)** | 같은 물리량(개별주택 최초공시 가격·기준시가). 신규 키 0. 단점 H-1(OFF 후 자산 단위 부분 입력 안내)은 막다른 길이 아니고 테스트로 고정 |
| **Q-4** | **면적 방식 「일부 양도」** | (a) 차단(자동 안분 금지) (b) 허용 | **(a)** | ①(평가액)이 취득 전체분인지 양도분인지 정해지지 않았다 — D14-5와 동일. 자동 안분은 정책상 금지 |
| **Q-5** | **입력 화면의 채택값 표시** | (a) ② 값과 「많은 금액」 안내만, 채택은 결과에서 (b) 입력 화면에서 `max(①,②)`를 즉시 표시 | **(a)** | 엔진이 max를 하므로 (b)는 클라이언트의 산식 재작성(이중 진실). D1-4 D14-1 선례 |
| **Q-6** | **결과 화면의 ② 산출 내역**(분자·분모 4값) 표시 | (a) 비교 두 값과 채택만(D1-4와 동일) (b) 엔진 echo 4필드를 더해 결과에서도 산식 검증 | **(a)** | 입력 카드의 파생 박스가 산식을 보여 주고, 결과 4뷰는 이미 비교 블록이 있다. (b)는 엔진 타입 확장 + 4뷰 변경이 늘어난다 — 검증 요구가 나오면 후속 |

(엔진·법령 쪽 미결 — 산식 F1/F2, 안분 분모, 경계일, 해석례 인용 — 은 §10이며 엔진 시니어 결론을 따른다. 해석이 갈리면 사용자 결정으로 올린다.)

---

## 13. 확인 필요 / 미검증 레지스트리

- V-1: 약분 F1≈F2는 probe로 실측했으나(최대 1원) **법령상 안분 기준 시점·분모가 이 산식인지**는 엔진 시니어 확정 전 가정. 재산세과-1702 본문은 이 문서 작성자가 조회하지 않았다.
- V-2: 공동주택(`house_apart`)의 건물분 ② 가능 여부(Q-1).
- V-3: 다건 경로 ⑥ 해소(`bundledProperty.splitDetail`) — Pre-Do P6에서 실측.
- V-4: `MultiPointBuildingStdPriceModal`을 2시점으로 호출했을 때 적용 결과 키(`MultiPointStdPriceApply.acquisition/firstDisclosure`)가 기존 위젯 `applyBatch`와 같은 patch인지 — 코드상 같은 인터페이스(`applyBatch` 재사용 가능)이나 화면 실행은 미수행.
- V-5: 화면(데스크톱·모바일)은 미실행 — 목업은 코드 추적 기반. 구현 시 Playwright 확인 필수.
- V-6: `acquisitionArea`가 D2 매매 블록 모드에서 항상 노출되는지(`AssetAreaSection` 코드상 `same`/`partial` 시나리오에서 노출) — D1-4b와 같은 전제, E2E로 확인.
- V-7: 1985.1.1. 전 취득 건물의 「취득시」 건물 기준시가 시점 라벨은 기존 규약(부칙 법률 제4803호 §8)을 따르나 **건물 기준시가 최초 고시(2001.1.1.) 전 시점 값의 입력 방법**(국세청 기준시가가 없는 시기)은 기존 위젯과 같은 한계다 — `buildHouseBatchPoints`의 `acqYear <= 2000 ⇒ 위치지수 공시지가 비움` 처리를 그대로 승계.

### Probe 기록 (throwaway — 작업 후 삭제)
- `__tests__/calc/_probe_d24_equiv.test.ts`: F1 대 F2 최대 차이 1원(난수 2,000건) · `calculateInheritanceHouseValuation` 양도시 0 → throw · 1985 취득 + 취득시 토지단가 없음 → throw.
- `__tests__/calc/_probe_d24_stale.test.ts`: 자산 단위 분기(OFF)에서 4칸만 채움 → 「5개 항목을 모두…」 차단·field `inhHouseValLandArea` · D2 ON + 2003 → 현행 Y4 field `acquisitionDate`·`inheritedHouseValuation` `{}`.
