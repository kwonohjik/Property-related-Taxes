# 겸용주택 PHD 섹션 2열 행 레이아웃 정렬 — 수정 계획서

> 이미지18(겸용주택 PHD)을 이미지19(단독주택 PHD, 커밋 `cdfa4d8d`에서 2열화 완료)와 동일한 2열 행 레이아웃으로 정렬.

## 1. 목표

`MixedUsePreHousingDisclosureSection.tsx`의 상단 입력 필드(주택부수토지 면적·최초 고시일·최초 고시 개별주택가격·양도시 개별주택가격)를 **세로 스택 → 2열 2행 그리드**로 재배치하고, 입력란 아래 hint를 제거한다. 이미 동일 패턴을 적용한 단독주택 PHD(`PreHousingDisclosureSection.tsx`)와 시각적으로 일치시킨다.

## 2. 대상 파일 (단일)

| 파일 | 역할 |
|---|---|
| `components/calc/transfer/mixed-use/MixedUsePreHousingDisclosureSection.tsx` | 겸용주택 §164⑤ 3-시점 환산 패널 (이미지18) |

**참조(변경 없음)**: `components/calc/transfer/PreHousingDisclosureSection.tsx` — 이미지19의 레이아웃 기준. `components/calc/inputs/FieldCard.tsx` — `stacked` prop(다열 그리드용, 라벨 상단 배치) 재사용.

## 3. 현재 구조 (검증 완료, `MixedUsePreHousingDisclosureSection.tsx`)

| # | 필드 | 위치(line) | 폼 필드 | 비고 |
|---|---|---|---|---|
| ① | 주택부수토지 면적 | 114–132 | `phdResidentialLandArea` | `DecimalInput`, `hasUsageChange` 시 disabled, hint에 자동계산값(90.29㎡) |
| ② | 최초 고시일 | 134–144 | `phdFirstDisclosureDate` | `DateInput`, required, hint |
| — | Case A 안내 배너 | 146–157 | — | `isCaseA` 조건부 rose 배너 (4부분 안분 모드 진입) |
| ③ | 최초 고시 개별주택가격 | 159–174 | `phdFirstDisclosureHousingPrice` | `CurrencyInput`, required, hint |
| ④ | 양도시 개별주택가격 (자동) | 176–191 | (read-only) `mixedTransferHousingPrice` 미러 | amber 박스, **편집 불가** — 상단 양도시 섹션 값 표시 |
| ⑤ | Pre1990 환산 | 193–212 | pre1990* | `isPre1990` 조건부 (변경 없음) |
| ⑥ | 3-시점 기준시가 입력 | 214–314 | phd* 3시점 | `ThreePointStandardPriceInput` (변경 없음) |

## 4. 변경 사항

### 4.1 레이아웃 (2열 2행)

이미지19와 동일하게 `grid gap-4 sm:grid-cols-2` 2개 행으로 묶고, 각 `FieldCard`에 `stacked` 적용(좁은 열에서 라벨 상단 배치):

```
[Row 1]  ① 주택부수토지 면적   |  ② 최초 고시일
[Case A 배너]  (isCaseA 조건부 — Row 2 아래로 이동)
[Row 2]  ③ 최초 고시 개별주택가격  |  ④ 양도시 개별주택가격 (read-only)
```

- **Row 1**: `<div className="grid gap-4 sm:grid-cols-2">` 안에 ①·② `FieldCard stacked`.
- **Row 2**: 동일 그리드에 ③ `FieldCard stacked` + ④(아래 4.3 참조).
- 모바일(sm 미만)은 grid-cols-1로 자동 세로 스택 → 좁은 화면 회귀 없음.

### 4.2 hint 전량 제거 (결정 확정)

①②③의 `hint` prop 제거. ①의 자동계산값(90.29㎡)은 `placeholder`(`autoLandArea.toFixed(2)`)로 여전히 노출되고, `hasUsageChange` 시 disabled 상태로 자동 적용됨은 유지되므로 기능 손실 없음. ④의 설명문("위 양도시 기준시가 섹션의 …")도 제거하되 read-only 신호는 `자동` 배지로 대체(4.3).

> ⚠️ 트레이드오프(사용자 승인): ①의 "용도변경 시 취득/양도 면적 분리" 및 "최초 공시 당시 전체가 주택이었다면 전체 토지 면적으로 수정" 안내가 사라진다. 상단 패널 설명문(103–109)에 용도변경 안내가 이미 있어 중복도는 낮음.

### 4.3 ④ 양도시 개별주택가격 — read-only 유지 + 2열 배치 (결정 확정)

현재 amber 박스(177–191)를 **stacked `FieldCard`의 read-only 표시**로 전환하여 ③과 같은 행에 배치:

- 라벨 `양도시 개별주택가격`, `badge`에 `자동`(green, read-only 신호), `unit="원"`.
- children: 편집 입력 대신 read-only div(기존 landAutoSync read-only 패턴 재사용):
  `mixedTransferHousingPrice > 0` → 값 표시, 아니면 muted `양도시 기준시가 섹션에서 입력` placeholder.
- 폼 필드 write 없음(미러 유지) → **`useEffect→store` 미러링 정책 위반 없음**(직접 read만).

### 4.4 Case A 배너 위치

두 행의 시각적 그룹을 깨지 않도록 rose 배너(146–157)를 **Row 2 아래**로 이동. 배너 문구가 "아래 ①취득시·②최초공시일 입력"(⑥ 3-시점 섹션)을 가리키므로 위치 이동에 의미 변화 없음. `isCaseA` 조건·내용 불변.

### 4.5 비적용 (결정 확정)

- **단독/공동주택 라디오 미추가**: 겸용 PHD는 주택부분 전용이라 주택유형 개념 없음 → 이미지19의 라디오는 도입하지 않음.

## 5. 영향 범위 — UI-only

- **엔진/API/validation 무변경**: 폼 필드(`phdResidentialLandArea`·`phdFirstDisclosureDate`·`phdFirstDisclosureHousingPrice`·`mixedTransferHousingPrice`)·write 경로 동일. 위젯 배치·hint만 변경.
- **14 동기화 지점 무관**: 신규 필드 없음.
- **③ 취득 기준시점·⑥ ThreePoint·⑤ Pre1990 로직 불변**.

## 6. 회귀 검증

레이아웃 변경은 라벨 텍스트 기반 E2E 셀렉터에 영향 없음(텍스트 유지, 위치만 이동). 단, 아래 스펙이 겸용 PHD 패널을 사용하므로 재실행:

| 스펙 | 검증 지점 |
|---|---|
| `e2e/transfer-phd-building-stdprice-calculator.spec.ts` | T4·T5·T7 (겸용 PHD 일괄 계산) |
| `e2e/mixed-use-case-a-asset-major.spec.ts` | Case A 배너·주택/상가 섹션 |
| `e2e/mixed-use-exclusive-common-area.spec.ts` | 부수토지 면적 |

**주의**: `mixed-use-case-a-asset-major.spec.ts`가 배너 텍스트("최초공시일 … 4부분 안분")를 assert하면 위치 이동 후에도 텍스트 매칭은 유지되나, DOM 순서 의존 셀렉터가 있으면 사전 확인. ④를 amber 박스 → FieldCard로 바꾸므로 `getByText("양도시 개별주택가격 (자동)")` 류 셀렉터가 있으면 라벨/구조 변경분 반영.

## 7. Definition of Done

- [ ] Row 1(①·②)·Row 2(③·④) 2열 그리드 + `stacked` 적용, 모바일 1열 확인
- [ ] ①②③ hint 제거, ④ 설명문 제거·`자동` 배지 유지
- [ ] ④ read-only 미러 유지(편집 불가, write 경로 미신설)
- [ ] Case A 배너 Row 2 아래로 이동, `isCaseA` 조건 불변
- [ ] `npx tsc --noEmit` 0건 / ESLint clean
- [ ] 위 3개 E2E 스펙 통과 (사전 baseline 대조)
- [ ] 브라우저 스크린샷으로 이미지19와 시각 일치 확인
- [ ] 800줄 정책 준수(현재 파일 규모 내)

## 8. 미결/확인 필요

- ④ read-only를 stacked FieldCard로 바꿀 때 값 미입력 시 표시 문구("양도시 기준시가 섹션에서 입력") 길이가 좁은 열에서 줄바꿈될 수 있음 → 구현 후 스크린샷 확인.
- Case A 배너를 Row 2 아래로 옮길 때, `isCaseA`가 참인 실제 케이스에서 배너가 ⑥ 섹션 바로 위에 자연스럽게 붙는지 스크린샷 확인.
