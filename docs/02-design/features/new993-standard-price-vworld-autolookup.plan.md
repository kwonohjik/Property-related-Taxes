# 구현 계획서 — §99의3 신축주택 감면 3시점 기준시가 Vworld 자동조회

**작성일**: 2026-07-26
**세목**: 양도소득세 (조특법 §99의3 신축주택 과세특례)
**목표**: 양도물건(asset) 주소 기준으로 취득시·5년시점·양도시 기준시가를 Vworld API로 자동 조회. 기존 `HousingStdPriceLookupField` 엔진 재사용.

> ✅ **구현 완료 (2026-07-26)**: 3시점 → `HousingStdPriceLookupField` 치환 + **전용면적 자동채움 포함**(사용자 요청 — `onExclusiveArea` 콜백 신설). props 배선(UnifiedReductionPanel→서브블록→New993InputForm). RTL anchor 3건 + tsc 0건.

---

## 1. 현황 (실제 코드)

`components/calc/transfer/New993InputForm.tsx:105-121` — 3시점 기준시가가 **수동 `CurrencyInput`**:

| 필드 | store 키 | 참조 시점 | 현재 |
|---|---|---|---|
| 취득시 기준시가 | `standardPriceAtAcquisition993` | 취득일 | 수동 입력 (+ PHD 환산 `onApplyResult`) |
| 5년 시점 기준시가 | `standardPriceAt5Years` | 취득일 + 5년 인접 고시일 | 수동 입력 |
| 양도시 기준시가(선택) | `standardPriceAtTransfer993` | 양도일 | 수동 입력 (미입력 시 자산 양도시 기준시가 fallback) |
| 전용면적(㎡) | `exclusiveAreaSqm993` | — | 수동 입력 |

- 렌더 위치: `UnifiedReductionPanel.tsx:587` `<New993InputForm ... acquisitionDate assetPhdSnapshot />`.
- **`New993InputForm`은 자산 주소·양도일을 받지 못함** — 현재 props는 `value`/`onUpdate`/`acquisitionDate`/`assetPhdSnapshot`뿐(`:22-37`).

## 2. 재사용 자산 (검증됨)

- **`HousingStdPriceLookupField`**(`components/calc/inputs/HousingStdPriceLookupField.tsx`): `label`·`value`·`onChange`·`jibun`·`dong`·`ho`·`referenceDate`·`hint`·`testidPrefix` props. 내부에서 공시가격 연도 자동추천(`recommendLandPriceYear`) + `/api/address/standard-price` 조회 + 동/호 strict 매칭(PR #790) + 수동 입력 fallback. **주택 총액 직접 세팅**(면적곱 금지).
- **`UnifiedReductionPanel`은 `asset: AssetForm`(`:70`) + `transferDate: string`(`:72`) 보유** → `asset.addressJibun`/`addressDong`/`addressHo`(`calc-wizard-asset.ts:126,130,132`) + `transferDate` 하향 전달 가능.
- 참조 시점 3종:
  - 취득시 = `acquisitionDate`(이미 prop)
  - 5년시점 = `acquisitionDate + 5년`(파생 — `recommendLandPriceYear`가 인접 고시연도 자동선택)
  - 양도시 = `transferDate`

## 3. 설계

### 3-a. `New993InputForm` props 확장
```ts
jibun?: string;        // asset.addressJibun
dong?: string;         // asset.addressDong
ho?: string;           // asset.addressHo
transferDate?: string; // 양도일 (양도시 기준시가 referenceDate)
// acquisitionDate 는 기존 prop 재사용 (취득시 referenceDate + 5년 파생 base)
```

### 3-b. 3시점 필드 → `HousingStdPriceLookupField` 치환

| 필드 | referenceDate | 비고 |
|---|---|---|
| 취득시 기준시가 | `acquisitionDate` | PHD `onApplyResult`도 동일 필드에 write — 조회·환산 공존(조회 실패 시 PHD 환산). hint "최초고시 전 취득 시 PHD 환산 적용 가능" 유지 |
| 5년 시점 기준시가 | `addYearsStr(acquisitionDate, 5)` | 5년 시점 인접 고시일 |
| 양도시 기준시가(선택) | `transferDate` | required=false. 미입력 시 자산 양도시 기준시가 fallback(엔진 로직 불변) |

- 동/호는 세 필드 모두 asset의 `dong`/`ho` 공통 전달(양도물건 = 동일 세대).
- `addYearsStr`: `YYYY-MM-DD` 문자열의 연도에 +5 (date 파싱 불필요·`new Date` 금지 정책 회피). 빈값이면 undefined.
- **레이아웃**: `HousingStdPriceLookupField`는 자체 2필드 그리드(연도+기준시가) + 묶음 라벨을 렌더 → 기존 2-col `grid` 셀 하나가 전폭 블록이 됨. RentalUnitCard·§161①과 동일 패턴이라 정합.

### 3-c. (선택) 전용면적 자동채움
- `HousingStdPriceLookupField`는 현재 조회 응답의 `exclusiveArea`(prvuseAr)를 **부모로 노출하지 않음**(onChange=price string만). 자동채움하려면 `onUnitMeta?(meta)` 콜백 추가 필요.
- **범위 판단**: 본 PR은 3시점 기준시가 조회에 집중. 전용면적 자동채움은 컴포넌트 확장이 필요하므로 **후속**(§6 note). 현행 수동 `DecimalInput` 유지.

## 4. 트레이드오프

| 옵션 | 내용 | 채택 |
|---|---|---|
| **A (권장)** | `HousingStdPriceLookupField` 3개 치환 + props 하향 | 엔진 재사용·동/호 strict·PHD 공존·최소 신규 코드 | ✅ |
| B | 신규 전용 조회 컴포넌트 | 중복 구현·유지비 | ✗ |
| C | 조회 버튼만 붙이고 필드는 유지 | UX 어중간·연도추천/동호 미재사용 | ✗ |

- store 신규 필드 **불필요**(주소·동/호는 asset 재사용, 3 std price 키는 기존). 14 동기화 대부분 무관.

## 5. 구현 (2 파일)

1. **`components/calc/transfer/New993InputForm.tsx`**
   - props에 `jibun`/`dong`/`ho`/`transferDate` 추가.
   - `import { HousingStdPriceLookupField }`.
   - 취득시·5년시점·양도시 3개 `<div><label><CurrencyInput/></div>` → `<HousingStdPriceLookupField ...>` 치환(각 referenceDate·testidPrefix `new993-stdprice-{acq|5y|transfer}`).
   - `addYearsStr` 로컬 헬퍼(문자열 연도 +5).
2. **`components/calc/transfer/UnifiedReductionPanel.tsx:587`**
   - `<New993InputForm>`에 `jibun={asset.addressJibun || undefined}` `dong={asset.addressDong || undefined}` `ho={asset.addressHo || undefined}` `transferDate={transferDate}` 추가.

## 6. 성공 기준 (verify)

1. **RTL anchor**(`__tests__/components/`): 조회 mock(`fetch` → `{price, priceType:"apart_housing_price"}`) → 취득시/5년시점/양도시 각 조회 버튼 클릭 시 해당 store 키에 총액 세팅 + 조회 쿼리에 `dong`/`ho` 포함. jibun 미입력 시 조회 버튼 disabled + 수동 입력 가능. → verify.
2. **5년 referenceDate**: `acquisitionDate=2003-11-28` → 5년 필드 recommendedYear ≈ 2008. → verify(연도 드롭다운 라벨).
3. **PHD 공존**: 취득시 PHD `onApplyResult` → `standardPriceAtAcquisition993` write 정상(조회와 동일 필드). → verify.
4. `npx tsc --noEmit` 0건 · 기존 §99의3 회귀(`__tests__/**/new-99-3*`, reduction 패널) 통과.
5. **브라우저**: 감면·공제 → §99의3 → 자산 주소 있는 상태에서 3시점 조회 버튼으로 자동 채움(미수행 시 명시).

## 7. 동기화 지점 (14 중 관련)

| # | 지점 | 상태 |
|---|---|---|
| ⑤ UI 위젯 | New993InputForm 3필드 → 조회 위젯 | **수정 대상** |
| — props 배선 | UnifiedReductionPanel → New993InputForm | **수정 대상** |
| ①②③④⑧⑨~⑭ | store 키·API·Zod·엔진 | 변경 없음(값 소스만 자동조회로 대체) |

## 8. 관련 메모리·정책
- `feedback_apart_stdprice_dong_ho_required` ★★★ (동/호 전달·strict — 본 조회도 준수)
- `feedback_land_price_lookup_field` (조회 필드 공용 패턴)
- `project_apartment_pre_disclosure` (PHD §164⑦ — 취득시 조회 실패 시 환산 fallback 공존)
- `feedback_ui_engine_dual_truth_avoidance` ★★★ (조회 컴포넌트 단일 재사용)
