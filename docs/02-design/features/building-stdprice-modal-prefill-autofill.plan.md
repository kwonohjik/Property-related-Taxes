# 건물 기준시가 계산 모달 — 자동입력(prefill) + 시점 연도·일자 같은 행 배치

**작성일**: 2026-07-10 (자가검토 반영 개정)
**대상 기능**: 양도세 마법사 "건물 기준시가 계산" 모달(`BuildingStdPriceModalButton` → `BuildingStdPriceForm`)의 ①건물 기본·②취득 시점·③양도 시점 필드를 상위 자산 폼 값으로 자동 채우고, 취득/양도 시점의 연도·일자를 같은 행에 배치.

> **자가검토 이력**: 3-fork 병렬 검토(오류+누락 / 모순+정책위반 / 개선+UI누락) → 정정 15건 반영. 정책위반 0건. Critical(호출부 과소 열거)은 실측 후 사용자 범위 재확인으로 해소.

---

## 1. 배경 / 문제

건물 기준시가 계산 모달을 열면 ①건물 연면적·토지 면적, ②취득연도·취득일, ③양도연도·양도일을 **매번 수동으로 다시 입력**해야 한다. 이 값들은 이미 상위 자산 카드에 입력돼 있으므로 이중 입력이며 오타·불일치 위험이 있다.

- 모달 컴포넌트: `components/calc/building-std-price/BuildingStdPriceModalButton.tsx`(런처) → `BuildingStdPriceForm.tsx`(폼)
- 이 모달은 **겸용 상가·순수 상가·일반건물**이 공유하는 공통 컴포넌트. PHD 3시점 일괄 모달(`PhdBuildingStdPriceModalButton`)과는 **별개 파일**이며 이번 작업 대상이 아니다.

### 현재 상태 (검증 완료 — file:line)

| 항목 | 위치 | 현황 |
|---|---|---|
| 건물 연면적 필드 | `BuildingStdPriceForm.tsx:351,361` → `f.floorArea` | 수동입력, prefill 없음 |
| 토지 면적 필드 | `BuildingStdPriceForm.tsx:354,366` → `f.landAreaM2` | 수동입력, prefill 없음 |
| 취득연도 | `BuildingStdPriceForm.tsx:392-400` → `f.acquisitionYear` (YearSelect) | 수동, 취득일과 **세로 스택** |
| 취득일 | `BuildingStdPriceForm.tsx:401-403` → `f.acquisitionEventDate` (DateInput) | 수동 |
| 양도연도 | `BuildingStdPriceForm.tsx:477-483` → `f.transferYear` (YearSelect) | 수동, 양도일과 **세로 스택** |
| 양도일 | `BuildingStdPriceForm.tsx:484-486` → `f.eventDate` (DateInput) | 수동 |
| 초기값 주입 경로 | `BuildingStdPriceForm.tsx:128-148` `useState` initializer의 `...(initialForm ?? {})` (:144) | snapshotKey 복원(`restoredForm`)만 사용 중 |
| 런처 Props | `BuildingStdPriceModalButton.tsx:18-46` | 면적·날짜 prefill용 prop **없음** |
| 연도 파생 헬퍼 | `lib/calc/building-std-price-form.ts:269` `deriveYearFromEventDate` (정규식 `^\d{4}-\d{2}-\d{2}$` 가드) | 이미 존재 — 재사용 대상 |
| FieldCard 좁은칸 라벨 | `components/calc/inputs/FieldCard.tsx:22,51-53` `stacked` prop | 이미 존재 — 레이아웃에 사용 |

**핵심**: `BuildingStdPriceForm`은 이미 `initialForm?: Partial<BuildingStdPriceFormState>`를 받아 초기 state에 병합한다(`:144`). 런처는 여기에 snapshot 복원값만 넘긴다(`:117`). **prefill 배관은 이 `initialForm`에 자동입력 값을 병합하는 것으로 끝난다.**

Radix Dialog는 닫힐 때 children을 unmount하므로 재오픈 시 `useState` initializer가 재실행 → 최신 prefill이 매번 반영된다.

---

## 2. 사용자 결정 사항 (인터뷰 완료)

1. **적용 범위**: **상가 전체 + 일반건물**. 자가검토에서 호출부를 실측 재열거해 최종 확정(§3 표):
   - **값 전달 = 4개 컴포넌트(7개 버튼 지점)**: 겸용 상가 자산-우선(`MixedUseAssetMajorStdPrice`, 1버튼) + 겸용 상가 시점-우선(`MixedUseLegacyStdPrice`, 2버튼) + 순수 상가(`CommercialBuildingBlock`, 2버튼) + 일반건물(`GeneralBuildingBlock`, 2버튼).
   - **SCOPE OUT = `ThreePointStandardPriceInput` 3개 버튼**(§10) — 현행 UI 상시 숨김·연면적 소스 부재. 사용자 재확인으로 확정.
2. **이력 우선순위**: 상위 폼 값이 **있으면** 항상 prefill 우선(빈 값은 미주입 — 사용자 이전 입력 보존). snapshotKey 복원값(`restoredForm`)보다 뒤에 spread.

---

## 3. 자동입력 소스 매핑 (검증 완료)

각 호출부에서 4개 소스 값이 이미 렌더 스코프에 있으며 **prop drilling 추가 불필요**.

| 호출부 (file:line) | 건물 연면적 | 토지 면적 | 취득일 | 양도일 | 버튼/onApply |
|---|---|---|---|---|---|
| `transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx:213` | `asset.nonResidentialFloorArea` (:43 로컬 `commercial`) | 파생 `commercialLandArea` (:57, `round2` 적용) | `asset.acquisitionDate` (:86 `acqReferenceDate`) | `transferDate` prop (:17) | 단일 버튼 `onApplyBoth` |
| `transfer/mixed-use/MixedUseLegacyStdPrice.tsx:142`(양도), `:254`(취득) | `asset.nonResidentialFloorArea` (:42 로컬 `commercial`) | 파생 `commercialLandArea` (:47-49, `toFixed(2)` 적용) | `asset.acquisitionDate` (:70 `acqReferenceDate`) | `transferDate` prop (:34) | 2버튼 `onApply` 단일 |
| `transfer/CommercialBuildingBlock.tsx:230`(취득), `:260`(양도) | 파생 `totalFloorArea` (:69, `cbExclusiveArea`+`cbSharedArea`, **null 가드**, :73 `toFixed(2)` 적용) | `asset.cbLandArea` (:142) | `asset.acquisitionDate` (:284) | `transferDate` prop (:37) | 2버튼 `onApply`+`applyTimePoint` |
| `transfer/GeneralBuildingBlock.tsx:348`(양도), `:375`(취득) | `asset.gbBuildingArea` (:306) | `asset.gbLandArea` (:301) | `asset.acquisitionDate` (:366) | `transferDate` prop (:67) | 2버튼 `onApply`+`applyTimePoint` |

### 소스 주의사항 (실측)

- 겸용 두 경로(`MixedUseAssetMajor`·`MixedUseLegacy`)의 `commercialLandArea`는 저장 필드가 아니라 파생값. **양쪽 다 2자리 반올림 완료** — AssetMajor는 `computeDerivedAreas`의 `round2()`(`mixed-use-derived-areas.ts:36,44`), Legacy는 자체 `parseFloat((…).toFixed(2))`(:47-49). → `String(commercialLandArea)` 그대로 전달해도 표시·계산 자리수 일치(`feedback_area_rounding_consistency` 충족).
- 순수 상가 연면적은 단일 저장 필드 없음. 파생 `totalFloorArea`(`null` 가능, `:73`에서 `toFixed(2)` 적용). `null`이면 해당 키 미주입.
- `MixedUseLegacyStdPrice`의 "Legacy"는 **종전자산이 아니라 "시점-우선 레이아웃(현행 스타일)"**을 의미(:27 주석). `asset`은 현재 양도자산이며 `MixedUseAssetMajor`(자산-우선)의 대체 레이아웃 — 소스가 올바른 자산을 가리킨다.
- 취득/양도 **연도**는 별도 필드 없음 → 날짜에서 파생하되 raw slice가 아니라 기존 헬퍼 `deriveYearFromEventDate` 재사용(§4.1).

---

## 4. 설계

### 4.1 런처에 prefill prop 추가 — `BuildingStdPriceModalButton.tsx`

**Props에 추가** (`:46` 뒤):
```tsx
/**
 * 상위 자산 폼 값 자동입력(prefill) — 지정 시 모달 필드 초기값을 채운다.
 * 상위 폼 값이 있으면 항상 snapshot 복원값보다 우선(빈 값은 미주입 — 사용자 이전 입력 보존).
 * 연도는 날짜에서 deriveYearFromEventDate로 파생(완성형 YYYY-MM-DD만 반환).
 */
prefill?: {
  floorArea?: string;       // 건물 연면적(㎡)
  landAreaM2?: string;      // 부수토지 면적(㎡)
  acquisitionDate?: string; // YYYY-MM-DD
  transferDate?: string;    // YYYY-MM-DD
};
```

**내부 변환 + 병합** (`restoredForm` 정의부 `:68-70` 이후). 연도 파생은 raw `.slice(0,4)`가 아니라 **기존 단일 헬퍼 `deriveYearFromEventDate`(`building-std-price-form.ts:269`) 재사용** — 완성형 날짜만 연도를 반환하고 부분입력("199")은 `""` 반환해 YearSelect 옵션 불일치를 차단:
```tsx
import { deriveYearFromEventDate } from "@/lib/calc/building-std-price-form";

const prefillForm: Partial<BuildingStdPriceFormState> = prefill
  ? {
      ...(prefill.floorArea ? { floorArea: prefill.floorArea } : {}),
      ...(prefill.landAreaM2 ? { landAreaM2: prefill.landAreaM2 } : {}),
      ...(prefill.acquisitionDate
        ? {
            acquisitionEventDate: prefill.acquisitionDate,
            ...(deriveYearFromEventDate(prefill.acquisitionDate)
              ? { acquisitionYear: deriveYearFromEventDate(prefill.acquisitionDate) }
              : {}),
          }
        : {}),
      ...(prefill.transferDate
        ? {
            eventDate: prefill.transferDate,
            ...(deriveYearFromEventDate(prefill.transferDate)
              ? { transferYear: deriveYearFromEventDate(prefill.transferDate) }
              : {}),
          }
        : {}),
    }
  : {};
```

**`BuildingStdPriceForm`에 전달** (`:117` 수정):
```tsx
// 결정 2: prefill이 restoredForm보다 우선(뒤에 spread). restoredForm이 undefined면 무해(빈 spread).
initialForm={{ ...restoredForm, ...prefillForm }}
```

- 빈 값 필터로 "상위 폼이 아직 비었을 때 사용자 이전 입력을 지우는" 회귀를 차단.
- **valuationYear 무해**: initializer `:147`이 `eventDate`(=양도일 prefill)에서 `valuationYear`를 파생하지만, `valuationYear`는 `inheritance_gift` 모드 전용(transfer는 `f.transferYear` 사용)이라 transfer 경로에서 미사용 → 무해.
- 로직·엔진·onResult 시그니처 무변경.

### 4.2 취득/양도 시점 연도·일자 같은 행 — `BuildingStdPriceForm.tsx`

`grid grid-cols-2 gap-2` wrapper로 두 FieldCard를 한 행에 배치하고, **각 FieldCard에 `stacked` prop**을 적용해 라벨을 상단·입력을 전폭으로 둔다. `DateInput`은 연/월/일 3분할(~124px)이라 좁은 칸에서 라벨-좌 배치가 입력을 압박 → `stacked`가 정석(`FieldCard.tsx:22,51-53`). `className`으로 grid 트랙을 덮는 방식은 금지(클래스 충돌).

**취득 시점** — 현재 `:392-403`의 두 FieldCard를 wrapper로 감싸고 `stacked` 적용:
```tsx
<div className="grid grid-cols-2 gap-2">
  <FieldCard label="취득연도" stacked>
    <YearSelect ... />
  </FieldCard>
  <FieldCard label="취득일" hint="계산서 일자 표기용(선택)" stacked>
    <DateInput ... />
  </FieldCard>
</div>
```
그 아래 2001 이전 안내문(`:404-408`)·구조/용도·`LandPriceLookupField`는 그대로 유지.

**양도 시점** — `:477-486`도 동일하게 wrapper+`stacked`. 아래 동일연도 안내(`:487-492`)·구조/용도·`LandPriceLookupField` 유지.

> **조건부 아님**: 취득연도·취득일(transfer 블록 `:389` 하위)·양도연도·양도일(`!apartmentConv` 블록 `:474` 하위)은 **무조건 렌더**된다(①건물 기본의 `showFloorArea/showLandArea` 조건부 grid와 다름). 따라서 grid wrapper는 조건 없이 안전하며, 양도는 기존 `!apartmentConv` 블록 내부에서 감싼다(조건 충돌 없음).

### 4.3 네 컴포넌트(7개 버튼 지점)에 prefill 전달

각 `BuildingStdPriceModalButton`은 **독립 Dialog 인스턴스**이고 모달은 transfer 모드에서 ②취득·③양도 2시점을 함께 렌더하므로, 2버튼 호출부(CB·GB·Legacy)는 **취득·양도 두 버튼 모두 동일 prefill**을 넘긴다(각 버튼=별개 모달이라 중복 아님).

**`MixedUseAssetMajorStdPrice.tsx:213`** (onApplyBoth 단일 버튼):
```tsx
prefill={{
  floorArea: asset.nonResidentialFloorArea,
  landAreaM2: commercialLandArea > 0 ? String(commercialLandArea) : undefined,
  acquisitionDate: asset.acquisitionDate,
  transferDate,
}}
```

**`MixedUseLegacyStdPrice.tsx:142`·`:254`** (2버튼, 로컬 `commercial`·`commercialLandArea` 사용):
```tsx
prefill={{
  floorArea: asset.nonResidentialFloorArea,
  landAreaM2: commercialLandArea > 0 ? String(commercialLandArea) : undefined,
  acquisitionDate: asset.acquisitionDate,
  transferDate,
}}
```

**`CommercialBuildingBlock.tsx:230`·`:260`** (2버튼):
```tsx
prefill={{
  floorArea: totalFloorArea != null ? String(totalFloorArea) : undefined,
  landAreaM2: asset.cbLandArea,
  acquisitionDate: asset.acquisitionDate,
  transferDate,
}}
```

**`GeneralBuildingBlock.tsx:348`·`:375`** (2버튼):
```tsx
prefill={{
  floorArea: asset.gbBuildingArea,
  landAreaM2: asset.gbLandArea,
  acquisitionDate: asset.acquisitionDate,
  transferDate,
}}
```

---

## 5. 정책 준수 확인 (Fork 검토 — 위반 0건)

| 정책 | 판정 | 근거 |
|---|---|---|
| `feedback_useeffect_store_mirror_forbidden` / `mirror-pattern` | ✅ 준수 | prefill은 `useState` initializer(로컬 state 초기화) — store write·useEffect 아님. 무한루프 없음 |
| `feedback_no_silent_apportion_fallback` | ✅ 준수 | 모달은 **독립 계산기**. prefill은 편의 초기값(사용자 수정 가능)이고 최종 세무값은 "적용" 클릭 시에만 반영 — 세무 input silent fallback 아님 |
| `mirror-pattern` 3중(display+API+validate) | ✅ N/A | prefill은 엔진 필드가 아니라 UI 컴포넌트 prop. 적용 결과값(건물기준시가)은 기존 필드 동기화 경로 사용 |
| 14 동기화 지점 (`tax-field-add`) | ✅ 신규 0 | 신규 엔진 input/result 필드 0개. `BuildingStdPriceFormState`에 신규 필드 없음. 기존 필드 재사용 UI-only prefill |
| `feedback_date_input`/`feedback_decimal_input` | ✅ 준수 | 기존 DateInput·DecimalInput 그대로(신규 필드 없음) |
| `feedback_section_card_numbering`/grid | ✅ 준수 | ①건물 기본이 쓰는 grid 패턴 + FieldCard 표준 `stacked` prop |

**공통 컴포넌트 자동 반영(회귀 주의)**: §4.1(prefill prop)·§4.2(레이아웃)은 공통 `BuildingStdPriceModalButton`/`BuildingStdPriceForm` 수정이므로 **모든 호출부**(SCOPE OUT한 ThreePoint 3개 + 상속 `EstateBodySupplementaryValuation` 포함)에 레이아웃 변경이 적용된다. prefill prop은 optional(미전달 시 무동작)이라 값을 안 넘기는 호출부는 기존 동작 유지. → 회귀 테스트로 상속·PHD 경로 무변화 확인(§7).

---

## 6. 변경 파일 요약 (surgical)

| 파일 | 변경 |
|---|---|
| `components/calc/building-std-price/BuildingStdPriceModalButton.tsx` | `prefill?` prop + `deriveYearFromEventDate` import + `prefillForm` 변환 + `initialForm={{ ...restoredForm, ...prefillForm }}` (§4.1) |
| `components/calc/building-std-price/BuildingStdPriceForm.tsx` | 취득/양도 연도·일자 FieldCard를 `grid grid-cols-2` wrapper + `stacked`로 (§4.2, 레이아웃만) |
| `components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice.tsx` | `:213` 모달에 `prefill` 전달 |
| `components/calc/transfer/mixed-use/MixedUseLegacyStdPrice.tsx` | `:142`·`:254` 두 버튼에 `prefill` 전달 |
| `components/calc/transfer/CommercialBuildingBlock.tsx` | `:230`·`:260` 두 버튼에 `prefill` 전달 |
| `components/calc/transfer/GeneralBuildingBlock.tsx` | `:348`·`:375` 두 버튼에 `prefill` 전달 |

엔진·API·Zod·validate·result view **무변경**.

---

## 7. 검증 (Goal-Driven)

### Pre-Do anchor (배관 위험 선검증)
1. **연도 옵션 존재(실측 완료)**: `yearOpts`=`availableYears`=2001~2026(`MAX_YEAR=2026`, `building-std-price-form.ts:247`)에 2026 포함 ✅. 취득 `acqYearOpts`는 1986~2025(`BuildingStdPriceForm.tsx:166`) — 취득 2026 엣지는 SCOPE OUT(§9 R1).
2. **재오픈 갱신(unmount-on-close)**: Radix Dialog 닫힘→재오픈 시 `useState` initializer 재실행으로 최신 prefill 반영됨을 확인(결정2의 load-bearing 메커니즘).

### RTL anchor — 기존 파일 확장
기존 `__tests__/components/building-std-price-locked-prefill.test.tsx`가 이미 `BuildingStdPriceForm`의 `lockedTaxType`+`initialAddress` prefill을 검증 중(**면적·날짜는 미검증**). 여기에 신규 케이스를 추가한다. 셀렉터는 이 파일 패턴(`getByDisplayValue`/`getByText`)을 따른다 — YearSelect/DateInput/DecimalInput에 `htmlFor` 연결 id가 없고 DateInput 개별 input은 `aria-label`이 "연도/월/일"이라 `getByLabelText("취득일")` 불가.

3. `BuildingStdPriceModalButton`에 prefill 주입 → 버튼 클릭으로 모달 오픈 → 건물 연면적·토지 면적·취득연도·취득일·양도연도·양도일 6필드에 값 반영(`getByDisplayValue`).
4. **결정2 우선순위**: `restoredForm`(snapshot)과 prefill 충돌 시 렌더 값이 **prefill**임을 확인(예: snapshot floorArea="100" + prefill "200" → "200").
5. **빈 값 미주입**: prefill.floorArea=undefined일 때 restoredForm.floorArea 보존.
6. **재오픈 갱신**: 오픈→닫기→prefill 소스 변경→재오픈 시 새 값 반영(unmount-on-close, Pre-Do anchor #2와 연동).

### 레이아웃 anchor
7. 취득연도·취득일이 같은 `grid grid-cols-2` 컨테이너 내(DOM 구조). 양도도 동일.

### 회귀
8. `npx vitest run __tests__/calc/building-std-price-form.test.ts __tests__/components/building-std-price-locked-prefill.test.tsx` + PHD 배치 관련(`__tests__/calc/phd-building-std-batch*.test.ts`) 통과.
9. 기존 E2E: PHD/건물기준시가 스펙(`T10` 등) 회귀 없음. 공통 컴포넌트 레이아웃 변경이 상속·PHD 경로에 무해함 확인(§5).
10. **브라우저 수동 확인**: 겸용 상가(자산-우선·시점-우선)·순수 상가·일반건물 각각에서 모달 오픈 → 6필드 자동 채움 + 취득/양도 연도·일자 같은 행 표시.

---

## 8. Do 순서

1. Pre-Do anchor #1(실측 완료)·#2(재오픈) 확인.
2. `BuildingStdPriceModalButton.tsx` prefill 배관 + `deriveYearFromEventDate` import(§4.1).
3. `BuildingStdPriceForm.tsx` 레이아웃 wrapper+`stacked`(§4.2).
4. 네 컴포넌트(mixed-use 2개·CB·GB, 7개 버튼) prefill 전달(§4.3).
5. 기존 테스트 파일에 RTL anchor #3~#7 추가·통과.
6. `npx tsc --noEmit` 0건 → 회귀 테스트(§7-8) → 브라우저 수동 확인(§7-10).
7. `scripts/ship.sh`로 단일 브랜치 ship.

---

## 9. 리스크 / 미결

| # | 리스크 | 대응 |
|---|---|---|
| R1 | ~~양도연도 옵션 부재~~ **해소(실측)**: `yearOpts`=2001~2026(`MAX_YEAR=2026`)에 2026 포함. 취득 `acqYearOpts`는 1986~2025라 취득일 2026인 경우 파생 취득연도 미표시(취득<양도라 실무상 무해 엣지). | 필요 시 `acqYearOpts` 상한을 `MAX_YEAR`로 통일. 이번 SCOPE OUT |
| R2 | `restoredForm`의 구조/용도(`acqStructureKey` 등)가 prefill한 새 취득연도 지수표에 없을 때 불일치 | 취득연도=자산 취득일이라 이전 저장 구조/용도도 같은 연도 기준(실무). prefill은 연도만 덮고 구조/용도는 restore 유지. 계산 시 `validateBuildingStdPriceForm`이 불일치를 잡음 → 사용자 재선택 |
| R3 | `DateInput` 좁은 칸 렌더 | §4.2 `stacked` prop로 라벨 상단·입력 전폭 → 해소 |
| R4 | ~~겸용 파생면적 반올림 누락~~ **해소(실측)**: 겸용 두 경로 모두 `commercialLandArea`가 `round2`/`toFixed(2)`로 이미 2자리 반올림(§3). `landAreaM2`는 모달 내 토지기준시가 **표시 전용**(onApplyBoth는 건물기준시가만 전달, `BuildingStdPriceModalButton.tsx:83`) — 저영향 | 추가 처리 불필요 |

---

## 10. 범위 밖 (SCOPE OUT)

- **`ThreePointStandardPriceInput` 3개 버튼(:495 주택건물·:522 상가건물·:547 일반건물)** — 자동입력 값 전달 제외. 사유(실측):
  1. **현행 UI 상시 숨김**: `hideBuildingCalcButton = enableBatchCalc`이고 두 호출부(`PreHousingDisclosureSection:159`·`MixedUsePreHousingDisclosureSection:200`)가 `enableBatchCalc`를 상시 전달 → 버튼 항상 숨김. PHD 흐름의 실제 계산기는 `PhdBuildingStdPriceModalButton`(배치, `:661-664`). split 버튼(:495/522)은 `layout="asset-major"` 라우팅(`:666`)으로 아예 미렌더.
  2. **연면적 소스 부재**: `ThreePointStandardPriceInputProps`에 연면적 prop 없음 → 2-hop drilling + 신규 prop 신설 필요(취득/양도일도 1-hop drilling).
  - 단 §4.1/§4.2는 공통 컴포넌트라 이 3개에도 **레이아웃·prefill prop이 자동 반영**(버튼 자체가 숨겨져 실효 없음). 향후 노출 시 값 전달 추가.
- PHD 3시점 일괄 모달(`PhdBuildingStdPriceModalButton`) — 구조가 다르고 이번 대상 아님.
- 상속·증여 경로(`EstateBodySupplementaryValuation:232`) — 세목 `inheritance_gift`(1시점)라 취득/양도 필드 미해당. 레이아웃 변경은 자동 반영되나 무해(회귀 확인 §7-9).
- 모달 내 구조·용도·공시지가 자동입력 — 이번 요청은 연면적·토지면적·취득/양도 연도·일자 6필드만.
- prefill 필드 "자동" 배지 표시 — 단순 초기값(사용자 수정 가능)이라 미채택(`FieldCard.badge` slot 존재하나 이번 범위 밖).
