# 건물 기준시가 조정률 섹션 UX 정리 — 중복 버튼 제거 + 라디오 자동 오픈 + 주거용 토글 모달 이동

> 작성일: 2026-06-22
> 범위: 건물 기준시가 계산 폼 ③ 조정률 섹션(`BuildingStdPriceForm`) + `AdjustmentRateModal`
> 성격: UI/UX 수정. 엔진 산식·input/result·Zod·API 무변경(필드 흐름만 재배치).

## 1. 문제
③ 조정률 섹션에 라디오 **"건물 특성으로 계산"**(모드 전환)과 그 아래 버튼 **"건물 특성으로 조정률 계산"**(모달 오픈)이 거의 같은 문구로 나란히 있어 "무엇을 눌러야 하는지" 혼란. (`BuildingStdPriceForm.tsx:647-696`)

## 2. 현재 구조 (검증, file:line)
- 라디오 `adjustmentMode` [features|manual], **기본값 "features"** (`building-std-price-form.ts:217`).
- features 모드: `주거용 건물`/`아파트` ToggleCard(섹션 내) + 별도 버튼 `건물 특성으로 조정률 계산`→`setAdjOpen(true)` + "특성 N개 적용" 배지 (`BuildingStdPriceForm.tsx:659-691`).
- `AdjustmentRateModal`: props `isResidential`/`isApartment`(읽기) + `onApply(features)` (`AdjustmentRateModal.tsx:24-104`).
- 엔진 흐름: `toEngineInput` manual이면 `manualAdjustmentRate`(빈값→undefined), 아니면 `adjustmentFeatures`; `isResidentialUse`/`isApartmentUse` 별도 전달 (`building-std-price-form.ts:341-347`). 빈 조정률 → 엔진 `computeAdjustmentRate` 1.0(미적용).

## 3. 변경안 (권장안 + 주거용 토글 모달 이동)

### 변경 1 — 기본값 "manual"
`initialBuildingStdPriceForm.adjustmentMode: "features" → "manual"`. 섹션 진입 시 모달 자동 오픈 방지 + 단순 기본.
- **anchor 안전**: 빈 manual(undefined) = features+미입력 = 둘 다 조정률 1.0. 기존 결과 불변.

### 변경 2 — 라디오에서 "features" 선택 시 모달 자동 오픈
`RadioCardGroup`의 onChange 핸들러 **내부에서만** `v === "features"`일 때 `setAdjOpen(true)`. 별도 버튼 클릭 불필요.

> **구현 제약 (필수)**: 자동 오픈은 반드시 **onChange(사용자 클릭) 핸들러 안에서** 호출한다. `useEffect`로 `adjustmentMode`를 감시해 여는 방식 **금지** — (1) 스냅샷 복원(직전 PR #336)으로 `adjustmentMode="features"`가 초기 주입될 때 모달이 오발화하고, (2) useEffect→상태 미러링 정책 위반. onChange는 사용자 클릭에만 발화(초기값/복원 주입 시 미발화) 확인됨.

### 변경 3 — 주거용/아파트 토글을 모달 내부로 이동
- `AdjustmentRateModal`: 내부 `useState`로 residential/apartment 관리(props로 초기 seed), 모달 상단에 토글 렌더, 미리보기 계산은 로컬 상태 사용. `onApply(features, isResidential, isApartment)`로 확장(호출부 1곳).
- 섹션에서 `주거용 건물`/`아파트` ToggleCard 제거 → "건물 특성"이 모달 한 곳에 모임.

### 변경 4 — 중복 버튼 제거 → 결과 배지 + 재오픈 링크
features 모드 섹션 본문:
- 적용값 있음(`adjustmentFeatures`): `특성 N개 적용 · 조정률 X%` 배지 + **"다시 계산"** 링크(재오픈).
- 적용값 없음(취소 등): **"건물 특성으로 계산 열기"** 링크 1개(라디오와 중복 안 되는 문구).
- 기존 `건물 특성으로 조정률 계산` 버튼 제거.

### 변경 5 — onApply에서 features + residential + apartment 동시 set
`onApply={(features, res, apt) => { set("adjustmentFeatures", features); set("isResidentialUse", res); set("isApartmentUse", apt); }}`.

### 취소 처리
features 모드에서 모달 취소 시 모드 유지(사용자 의도 보존) + 재오픈 링크 노출. 직접입력으로 강제 복귀 안 함.

> **검증 안전(확인됨)**: `validateBuildingStdPriceForm`은 `adjustmentMode`/`adjustmentFeatures`/`isResidentialUse`를 검증하지 않는다. 따라서 자동 오픈 후 취소해 적용값이 없어도 계산이 **차단되지 않고**, `toEngineInput`이 `specialFeatures=null`을 전달 → 엔진 `computeAdjustmentRate`가 조정률 1.0(미적용) fallback. "취소=미적용"이 안전하게 성립.

## 4. 무영향 (검증)
- 엔진 산식·`toEngineInput` 매핑·result·Zod·API 무변경. `isResidentialUse`/`isApartmentUse`/`adjustmentFeatures`는 그대로 엔진 도달, 다만 입력 위치만 모달로 이동. (이 두 필드는 **조정률 features 계산에만** 쓰임 — NTS 계산서·타 분기 사용 없음 확인.)
- 기본값 변경은 빈 상태 조정률 1.0 동일 → 기존 anchor(BSP-01 224,600,000 등) 불변.
- `AdjustmentRateModal.onApply` 호출부는 1곳(`BuildingStdPriceForm`) → 시그니처 확장 안전. 모달의 `isResidential`/`isApartment` props는 내부 state **초기 seed**로 전환(미리보기 calc·roofActive는 로컬 state 참조).
- **복합모드 무관(확인)**: ③ 조정률 SectionCard는 `!isMech && !composite` 게이트로 렌더(`BuildingStdPriceForm.tsx:646`). 복합구조는 부분별 `adjustmentRate`를 쓰므로 이 단일 섹션 자체가 숨겨짐 → 본 변경과 상호작용 없음(floorArea 0 우려 없음).

## 5. 검증 계획
- `tsc --noEmit` 0건.
- E2E 갱신: `building-standard-price.spec.ts:338-359`(조정률 모달) — 트리거를 버튼→라디오 "건물 특성으로 계산"으로, 주거용 토글 위치를 모달 내부로 갱신.
- E2E 회귀: 기본값 변경이 다른 조정률 미사용 케이스(BSP-01 등) 결과에 영향 없음 확인(전체 building-standard-price spec 통과).
- 단위: `building-std-price-form.test.ts`에서 adjustmentMode 기본값/조정률 1.0 가정 테스트가 있으면 갱신. `npm test` 통과.
- 신규 E2E: 직접입력 기본 → "건물 특성으로 계산" 클릭 시 모달 자동 오픈 → 모달 내 주거용 토글 → 적용 → 배지 표시 → "다시 계산" 재오픈.

## 6. 변경 파일
| 파일 | 변경 |
|---|---|
| `lib/calc/building-std-price-form.ts` | 기본 `adjustmentMode: "manual"` |
| `components/calc/building-std-price/AdjustmentRateModal.tsx` | 주거용/아파트 토글 내부 이동 + `onApply` 확장 |
| `components/calc/building-std-price/BuildingStdPriceForm.tsx` | 라디오 자동 오픈·토글 제거·버튼→배지/재오픈 링크·onApply 확장 |
| `e2e/building-standard-price.spec.ts` | 조정률 모달 테스트 트리거·토글 위치 갱신 + 신규 자동오픈 케이스 |
