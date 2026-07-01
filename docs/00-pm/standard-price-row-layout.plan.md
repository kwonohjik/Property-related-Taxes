# 공시가격 「단가·면적·총액 1행」 레이아웃 통일 계획

> 목적: 방금 `StandardPriceInput`에 적용한 **㎡당 단가 · 면적 · 공시가격 총액 1행 수평 정렬** 레이아웃을 프로젝트 전 공시가격/기준시가 조회·입력 UI에 통일 적용한다.
> 작성 기준: **추정 금지** — 모든 file:line·현재 구조는 실제 코드 정독으로 확정(2026-07-01).

---

## 0. 표준 정의 (기준점 = 완료본)

**파일**: `components/calc/inputs/StandardPriceInput.tsx` (207–247줄, `isAreaMode` 분기)

```
grid grid-cols-4 items-start gap-3
  ├─ ㎡당 단가 (원/㎡)      : col-span-1  · CurrencyInput
  ├─ 면적 (㎡)             : col-span-1  · native number input
  └─ 공시가격 총액 (원)     : col-span-2  · CurrencyInput (+ 하단 hint 허용)
```

**핵심 원칙 2가지**
1. **1행 배치**: 단가·면적은 좁게(각 1/4), 총액은 넓게(2/4).
2. **`items-start` 상단 정렬**: 총액 아래 hint(자동계산 안내)가 입력칸을 위로 밀어올리지 않게 함. (기존 `items-end`는 hint 높이만큼 총액칸이 떠서 어긋남 — 이번에 정정.)

---

## 1. 전수 인벤토리 (실측 확정)

| # | 컴포넌트 | 파일:line | 현재 구조 | 3필드(단가·면적·총액) | StandardPriceInput 사용 | 분류 |
|---|---|---|---|---|---|---|
| 1 | `StandardPriceInput` (기준본) | `inputs/StandardPriceInput.tsx:207` | **grid-cols-4 items-start** ✅ | ✓ | (본체) | **완료** |
| 2 | `StandardPriceInput` 실제 렌더 **8곳** | 아래 목록 | 공용 컴포넌트 위임 | area-mode 시 ✓ | ✓ | **A. 자동반영** |
| 3 | `CompanionAcqInheritanceBlock` (토지) | `transfer/CompanionAcqInheritanceBlock.tsx:19,66` | StandardPriceInput 위임(단가↔총액 매핑만 자체) | ✓ | ✓ | **A. 자동반영** |
| 4 | `PostDeemedInputs` 보충적평가 보조계산 | `transfer/inheritance/PostDeemedInputs.tsx:227‑251` | **grid-cols-2** (단가+면적), 토지총액=하단 hint, 건물총액 별도 | △ (토지총액은 계산 hint) | ✗ (자체) | **B. 전환 대상** |
| 5 | `HouseValuationSection > LandPriceLookup` | `transfer/inheritance/HouseValuationSection.tsx:46‑150` | **grid-cols-2** (단가 + 계산된 토지기준시가) | ✗ (편집 면적 없음) | ✗ (자체·`LandPriceLookupField` 중복 재구현) | **C. 2필드 조회위젯** |
| 6 | `LandPriceLookupField` (공용) | `inputs/LandPriceLookupField.tsx:140‑213` | **grid-cols-2** (단가 + 계산된 토지기준시가) | ✗ (면적은 prop) | ✗ (본체) | **C. 2필드 조회위젯** |
| 7 | `ThreePointStandardPriceInput` | `transfer/ThreePointStandardPriceInput.tsx` | 3시점 × (단가+토지기준시가+건물기준시가), Case A 주택/상가 분리 | 부분 | ✗ (본체, StandardPriceInput 내부 미사용) | **D. 복합·범위 밖** |

> **검증 정정**: 초기 grep에서 ThreePoint·`MixedUseStandardPriceInputs`가 "StandardPriceInput 소비처"로 잡혔으나, 이는 파일명이 문자열 "StandardPriceInput"을 **포함**한 부분문자열 오탐. `<StandardPriceInput` JSX 실측 결과 둘 다 직접 렌더하지 않음(ThreePoint=자체 본체, MixedUseStandardPriceInputs=`LandPriceLookupField` 렌더).
> **비대상 확인**: `PreDeemedInputs`(상속 의제취득 전)는 단가·면적·총액 grid가 없고 토지등급 환산(`Pre1990LandValuationInput` 계열)만 사용 → 대상 아님.

### StandardPriceInput 실제 렌더 사이트 (A. 자동반영 — 조치 없음)

`<StandardPriceInput>` 을 직접 렌더하는 곳 = **8곳** (JSX 실측 `grep "<StandardPriceInput"`):

```
components/calc/property/Step0.tsx
components/calc/PropertyCardEditor.tsx
components/calc/acquisition/Step1.tsx
components/calc/transfer/CompanionAcqInheritanceBlock.tsx
components/calc/transfer/CompanionSaleModeBlock.tsx
components/calc/transfer/CompanionAcqPurchaseBlock.tsx
components/calc/inheritance/estate-card/variants/EstateBodySupplementaryValuation.tsx
components/calc/inputs/SelfFarmingIncorporationInput.tsx
```

> **정정**: 파일-언급 grep은 18줄이었으나 import·타입파일(`*.types.ts`)·문서(`CLAUDE.md`)·**부분문자열 오탐**(`ThreePointStandardPriceInput`·`MixedUseStandardPriceInputs`)이 섞여 과다집계였다. `<StandardPriceInput` JSX 실측 = 위 8곳.
> 주의: 이 중 `isAreaMode`(토지·비주거건물) 호출만 1행 레이아웃이 나타난다. 주택(총액 직접입력)·`forceTotalMode`는 총액 단일 필드로 **변경 없음**(정상).

---

## 2. 분류별 조치

### A. 자동반영 — 조치 없음 ✅
- `StandardPriceInput` 공용 수정으로 area-mode 소비처 전부 이미 통일됨.
- **필요 작업**: 브라우저에서 area-mode 화면(취득/양도 기준시가, 재산세 토지, 재개발·상업용·일반건물, 상속 보충평가 등) 정렬 눈으로 확인만.

### B. 전환 대상 (실작업 1건) — `PostDeemedInputs` 토지 보조계산
- **현재**(227‑251): `grid-cols-2` 로 [개별공시지가(원/㎡)] + [면적(㎡)], 그 아래 `토지 보충적평가액: {landTotal}원` 을 **텍스트 hint**로 표시. 건물총액은 별도 FieldCard.
- **변경안**: 토지 블록을 표준 1행으로 —
  ```
  grid grid-cols-4 items-start gap-3
    ├─ 개별공시지가 (원/㎡)  col-span-1
    ├─ 면적 (㎡)            col-span-1
    └─ 토지 보충적평가액 (원) col-span-2  (읽기전용 표시칸 + landTotal)
  ```
  - 건물·주택 공시가격(254‑262)·합산 박스(264‑277)는 **현행 유지**(토지행과 별개 개념).
  - 계산 로직(`handleLandUnitPriceChange`/`handleLandAreaChange`/`reportedPatch`) **불변** — 순수 레이아웃 변경.
- **대안(검토)**: `StandardPriceInput`(area-mode, `enableLookup={false}`) 재사용. 단 이 블록은 `landTotal`을 신고가액에 합산하는 특수 미러링이 있어 props 매핑이 늘어남 → **1차엔 인라인 레이아웃만 교체 권장**, 공용화는 후속.

### C. 2필드 조회위젯 (단가 + 계산된 토지기준시가) — **결정 필요**
- 대상: `LandPriceLookupField`(공용, 실제 렌더 **11곳**: LandParcelEditor·RedevelopmentValuationSection·CommercialBuildingBlock·GeneralBuildingBlock·MixedUseStandardPriceInputs·BurdenedGiftValuationModeSection·BurdenedGiftTransferSection·EstateBodySuperficies·building-std-price 3곳) + `HouseValuationSection.LandPriceLookup`(중복 인라인, 공용 미사용).
- 성격이 다름: **편집 가능한 면적 필드가 없다**(면적은 상위/prop). 즉 "단가·면적·총액 3-input 1행"이 성립하지 않고, 이미 `단가 | 토지기준시가` **2필드 1행**(grid-cols-2)이다.
- **권장: 현행 유지**. 다만 정렬 일관성 점검(토지기준시가 셀 hint로 인한 어긋남 여부 — 현재 default stretch라 문제 없어 보이나 눈으로 확인).
- **부수 발견(범위 밖 기록)**: `HouseValuationSection.LandPriceLookup`(46‑150)은 공용 `LandPriceLookupField`를 **중복 재구현**한 것. 공용 컴포넌트로 치환하면 dedup 가능하나, 동작 동일성 검증이 필요한 **별도 리팩터**로 분리.

### D. 복합·범위 밖 — `ThreePointStandardPriceInput`
- 3시점 × 복합 필드 + Case A(주택분/상가분 분리) 구조. 단순 grid-cols-4 1행이 직접 적용 불가.
- **범위 밖**. 필요 시 Case A 4부분 표시를 별도 설계로 재구성하는 후속 PR.

---

## 3. 실행 배치

| 배치 | 내용 | 파일 | 검증 |
|---|---|---|---|
| **B-1** | `PostDeemedInputs` 토지 보조계산 → 표준 1행 | `PostDeemedInputs.tsx` | tsc·lint 0, 상속 E2E 스펙 셀렉터(면적/개별공시지가/신고가액) 보존, 브라우저 |
| **C-점검**(선택) | 2필드 조회위젯 정렬 눈확인, 어긋남 시 `items-start` 보정 | `LandPriceLookupField.tsx`·`HouseValuationSection.tsx` | 브라우저 |
| **A-확인** | area-mode 소비처 브라우저 정렬 확인 | (수정 없음) | 브라우저 |

> 전부 **순수 표시(cosmetic) 변경** — 엔진·API·검증·계산 로직 불변. 14 동기화 지점 영향 없음.

## 4. 검증 기준 (완료 정의)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx eslint <변경파일>` 0건
- [ ] `npm test` 회귀 0 (계산 로직 불변이므로 vitest 무영향 예상)
- [ ] E2E 셀렉터 보존: 라벨 텍스트(㎡당 단가/면적/공시가격 총액/개별공시지가/신고가액) 미변경
- [ ] 브라우저 정렬 확인 (B·C·A 각 대표 화면)

## 5. 범위 밖 (명시)
- `ThreePointStandardPriceInput` Case A 4부분 재구성 (별도 설계)
- `HouseValuationSection.LandPriceLookup` → 공용 `LandPriceLookupField` 치환 dedup (동작 동일성 검증 필요, 별도 PR)
- 주택 총액직접입력 모드(`isAreaMode=false`) — 애초에 1행 대상 아님

---

## 6. 열린 결정 (착수 전 확인 필요)
1. **C 카테고리(2필드 조회위젯)를 손댈지**: 권장은 "현행 유지 + 정렬 눈확인만". 3-input 1행 강제 적용은 부적합(면적 입력 없음).
2. **B-1을 인라인 레이아웃만 교체할지 vs `StandardPriceInput` 공용화까지 갈지**: 1차 인라인 권장.
