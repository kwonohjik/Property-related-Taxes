# 양도소득세 — 양도일자 입력 오류 검증

> 작성일: 2026-06-29 · 대상: `lib/calc/transfer-tax-validate.ts` · `transfer-tax-validate-asset.ts`
> 범위: 클라이언트 검증(Step 0) 한정. 엔진·API·UI 위젯 변경 없음.
> **상태: ✅ 구현 완료 (2026-06-29)** — tsc 0 · lint 0 · 단위 21건(신규 8) · E2E 3건 · 회귀 2229건 통과
>
> ## 구현 결과
> - `validate-asset.ts`: `todayLocalISO()` export + `validateAssetEntry` 상단에 양도일<취득일·취득일 미래·토지취득일 동일 검증(차단).
> - `validate.ts`: `collectStepWarnings()` 신설(미래 양도일 경고, 비차단) — `todayLocalISO` import.
> - `TransferTaxCalculator.tsx`: amber 경고 배너(`StepWarningBanner` 분리 — 800줄 정책). handleNext/handleSubmit 불변.
> - 다건: `MultiTransferTaxCalculator` 임베드 + validateAssetEntry 재사용으로 **자동 적용**(코드 무수정).
> - 테스트: `transfer-validate-date-cross-rules.test.ts` T-14~T-21 + `e2e/transfer-date-input-validation.spec.ts` (a)(b)(c).
> - #4(양도일>신고일)는 기존 `:55` 검증과 동일 조건 → 무수정.

## 1. 배경 / 현행 갭 (실측)

양도세 마법사 Step 0(자산 목록) 검증(`collectStepIssues`)의 현행 날짜 검증:
- 양도일 필수 (`transfer-tax-validate.ts:52`).
- 신고일 < 양도일 모순 차단 (`:55`).
- 이월과세: 증여자취득일 < 등기접수일 < 양도일 (`validate-asset.ts:244~246`).
- 장기임대 특례: 보유기간 730일 (`validate-asset.ts:95~101`).
- 입주일/퇴거일 vs 취득일·양도일 (`:195~200`).

**부재(이번 작업 대상)**:
- ❌ **양도일 < 취득일** — 자산의 취득일보다 양도일이 빠른 모순. (일반 자산 전반 미검증.
  carryover·임대특례 등 일부 맥락만 부분 검증.)
- ❌ **양도일 > 현재(미래일)** — 미래 양도일 입력 검증 전무 (`new Date()` 비교 없음).
- ❌ **취득일 > 현재(미래일)** — 미래 취득일 검증 전무.

**이미 존재(추가 불요)**:
- ✅ **양도일이 신고일 이후**(=`filingDate < transferDate`) — `:55`에서 이미 차단
  ("신고(예정)일이 양도일보다 빠릅니다"). 사용자 요청 #4는 **현행 검증과 동일 조건** → 신규 코드
  불필요, 문구만 확인.

`ValidationIssue` 인터페이스는 `{ message, step, assetIndex? }`로 **차단 전용**
(severity/warning 필드 없음) — 비차단 경고 채널이 없으므로 미래일 경고용으로 **신규 채널 필요**.

## 2. 목표 (검증 가능) — 확정 결정 반영

| # | 검증 | 유형 | 비고 |
|---|---|---|---|
| 1 | 양도일 < 취득일 | **차단(error)** | 취득 전 양도 불가 — 시뮬레이션에서도 불변의 모순 |
| 2 | 양도일 > 오늘 | **경고(warning, 비차단)** | 미래 양도 시뮬레이션 허용 (사용자 확정 #1) |
| 3 | 취득일 > 오늘 | **차단(error)** | 미래 취득은 입력 오류 (사용자 확정). 미래 양도 시뮬은 과거 취득+미래 양도라 영향 없음 |
| 4 | 양도일 > 신고일 | (이미 차단됨 `:55`) | 신규 불요 |

- verify(1): 취득일 2020-05-01·양도일 2019-12-31 → "양도일이 취득일보다 빠릅니다" **차단**.
- verify(1): 양도일 == 취득일(당일) → 통과 (보유기간 0, 단기세율 — 합법).
- verify(2): 양도일 = 내일 → amber 경고 배너 노출하되 **다음/계산 진행 가능**.
- verify(3): 취득일 = 내일 → "취득일은 오늘 이후일 수 없습니다" **차단**.

## 3. 설계 (surgical)

### 3-1. 양도일 < 취득일 — `validateAssetEntry` (자산-수준, 일반 적용)

`collectStepIssues`가 Step 0에서 `form.assets`를 돌며 `validateAssetEntry(asset, i, form)`
호출(`:65~66`). 이 함수 **상단**에 일반 검증 추가 (특정 분기 진입 전 — 모든 자산 공통):

⚠️ **실측 정정**: `validateAssetEntry(a, index, form)` — 파라미터는 **`a`**(asset 아님),
양도일은 **`form.transferDate`**(`formTransferDate` 아님 — 그건 line 95 별개 임대특례 헬퍼의 지역변수).
배치는 `if (!a.assetKind) return …` 가드 **직후**, 지분/분기 로직 **전** (모든 자산 공통, 조기 return 전).

```ts
const today = todayLocalISO();
// 양도일 < 취득일 — 취득 전 양도 불가 (둘 다 입력됐을 때만; 존재성은 분기별 검증). strict > → 당일(==) 통과.
if (a.acquisitionDate && form.transferDate && a.acquisitionDate > form.transferDate) {
  return `${label}: 양도일(${form.transferDate})이 취득일(${a.acquisitionDate})보다 빠릅니다. 취득 후에만 양도할 수 있습니다.`;
}
if (a.hasSeperateLandAcquisitionDate && a.landAcquisitionDate && form.transferDate
    && a.landAcquisitionDate > form.transferDate) {
  return `${label}: 양도일이 토지 취득일(${a.landAcquisitionDate})보다 빠릅니다.`;
}
// 취득일 미래 차단 (사용자 확정). ※ 위 양도일<취득일 다음에 둔다 — 둘 다 미래여도 모순이 먼저 잡히게.
if (a.acquisitionDate && a.acquisitionDate > today) {
  return `${label}: 취득일(${a.acquisitionDate})이 오늘 이후입니다. 미래 날짜는 입력할 수 없습니다.`;
}
if (a.hasSeperateLandAcquisitionDate && a.landAcquisitionDate && a.landAcquisitionDate > today) {
  return `${label}: 토지 취득일(${a.landAcquisitionDate})이 오늘 이후입니다.`;
}
```

- 문자열 `YYYY-MM-DD` 사전식 비교 = 날짜 비교와 동치 (zero-pad 고정폭).
- 빈 값이면 skip (취득일 필수 여부는 기존 분기별 검증이 담당 — 오차단 금지).
- `todayLocalISO`는 **validate-asset.ts에 정의**(아래 §3-2 B 참조 — 순환 import 회피).

### 3-2. 미래일 경고 (비차단) — 신규 채널 `collectStepWarnings`

`ValidationIssue`는 차단 전용이고 UI(`handleNext`/`handleSubmit`)가 issues>0이면 무조건 차단하므로,
**미래일은 기존 채널에 넣으면 안 된다**(넣으면 진행 차단됨). 별도 비차단 채널 신설:

```ts
// transfer-tax-validate.ts (신규 export)
export function collectStepWarnings(step: number, form: TransferFormData): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  if (step === 0) {
    // 양도일 미래만 경고(비차단) — 취득일 미래는 3-1에서 차단(error)
    if (form.transferDate && form.transferDate > todayLocalISO())
      warnings.push({ step, message: `양도일(${form.transferDate})이 오늘 이후입니다. 미래 시점 가정 계산입니다 — 입력값을 확인하세요.` });
  }
  return warnings;
}

// 공유 헬퍼 (B) — validate-asset.ts에 정의하고 export, validate.ts가 import.
// ⚠️ validate.ts는 이미 validate-asset.ts를 import(:19) → 같은 방향이라 순환 없음.
//    반대로 validate.ts에 두면 validate-asset.ts→validate.ts import가 순환을 만든다(금지).
export function todayLocalISO(): string { /* 로컬(KST) YYYY-MM-DD — 연/월/일 직접 조립 (toISOString UTC 어긋남 회피) */ }
```

**UI (`TransferTaxCalculator.tsx`)**: 차단 흐름과 무관하게 reactive 표시.
```ts
const warnings = useMemo(() => collectStepWarnings(currentStep, formData), [currentStep, formData]);
// Step 0 콘텐츠 상단에 warnings.length>0 일 때 amber 배너 렌더 (차단 아님 — handleNext/handleSubmit 불변)
```
- `handleNext`/`handleSubmit`는 **변경 없음** (경고는 진행 차단 안 함).
- `todayLocalISO()`: 클라이언트 검증이라 `new Date()` 허용 (엔진 `new Date(x)` 파싱 금지와 무관).
- error(3-1)와 warning은 **독립** — 양도일<취득일(error)은 차단, 미래일(warning)은 통과.

### 3-3. 다건 양도 (#3) — **자동 적용, 별도 코드 불요** (실측 정정)

`MultiTransferTaxCalculator`는 per-property 입력에 `TransferTaxCalculator`를 **임베드**
(`multi/MultiTransferTaxCalculator.tsx:36·200·514`)하고, 다건 준비도 판정
`isPropertyReady`는 `validateStep(step,form) → collectStepIssues → validateAssetEntry`를
**그대로 재사용**(`multi-transfer-tax-validate.ts:107~115`). 따라서:

- **error(양도일<취득일·취득일 미래)**: validateAssetEntry에 넣으면 다건도 **자동 차단** (isPropertyReady=false).
- **warning(양도일 미래)**: TransferTaxCalculator에 배너를 넣으면 임베드된 다건 입력에도 **자동 노출**.

→ `multi-transfer-tax-validate.ts`는 **수정하지 않는다** (그 파일은 taxYear 일치 등 cross-cutting 전용).
   검증 항목: 임베드(isEmbeddedInMulti) 모드에서도 경고 배너가 렌더되는지 확인만.

## 4. 엣지 케이스 (전수 enumerate)

| 케이스 | 처리 |
|---|---|
| 양도일 == 취득일 (당일) | 통과 (strict `>`) |
| 취득일 미입력 | skip (존재성은 기존 분기 검증) |
| 양도일 미입력 | 기존 "양도일을 선택하세요" 차단 (`:52`) — 본 검증은 skip |
| 토지·건물 취득일 분리 | landAcquisitionDate도 양도일 비교 (3-1) |
| 이월과세(증여) | asset.acquisitionDate(수증일)·donorAcquisitionDate(증여자) 별도. 일반 검증은 asset.acquisitionDate 기준 — 기존 `giftRegistryDate < transferDate`(:246)와 중복 아님(보완). **anchor로 carryover 자산의 acquisitionDate 값 확인 필요** |
| NBL 양도일 의제(§168의14②) | 의제일은 자산-수준 NBL 판정용. form.transferDate(사용자 입력 양도일)는 별개 → 미래 검증은 form.transferDate 대상 유지. 충돌 없음 |
| 미래 양도일 + 미래 취득일 | 취득일 미래=차단(error)이 먼저 잡힘(검사 순서상). 양도일 미래 경고는 별도 채널 |
| 다건 양도(multi) | 임베드 TransferTaxCalculator + validateAssetEntry 재사용 → error·warning 자동 적용 (3-3) |

## 5. 영향 범위 / 동기화

- ⑧ Validation(error): `transfer-tax-validate-asset.ts` `validateAssetEntry`(양도일<취득일·취득일 미래)
  + `todayLocalISO()` 정의·export. **다건은 재사용으로 자동 적용** (§3-3).
- 신규(warning): `transfer-tax-validate.ts`에 `collectStepWarnings`(`todayLocalISO`는 validate-asset.ts에서 import).
- UI: `TransferTaxCalculator.tsx`에 amber 경고 배너 1곳 (임베드 다건에도 자동 적용). handleNext/handleSubmit **불변**.
- anchor 테스트: 양도일<취득일·취득일 미래는 validateAssetEntry → `validateStep`/`collectStepIssues` 첫 오류
  순서에 영향 가능 → 기존 anchor 회귀 확인. 경고는 별도 채널 → 무영향.
- `multi-transfer-tax-validate.ts`·엔진·API·결과 카드: **무변경**.

## 6. 결정 사항 (확정 — Do 진입 가능)

1. **미래 양도일** → ✅ **경고(비차단) + 허용**. 신규 `collectStepWarnings` 채널 + amber 배너 (3-2).
2. **취득일 미래** → ✅ **차단(error)** (사용자 확정). `validateAssetEntry`에서 차단 (3-1).
   미래 양도 시뮬은 과거 취득+미래 양도라 이 차단과 충돌하지 않음.
3. **다건 양도 뷰** → ✅ **적용** (3-3).
4. **양도일 > 신고일** → ✅ **이미 검증됨**(`:55`). 신규 코드 불요 — 문구만 확인.
- **양도일 < 취득일** → 차단(error) 유지 (시뮬레이션에서도 불변 모순).

## 7. 검증 계획

1. anchor 단위 테스트(error): 양도일<취득일(차단)·당일(통과)·취득일 미입력(skip)·토지취득일 분리(차단)
   ·취득일 미래(차단)·토지취득일 미래(차단).
   - **결정성**: `todayLocalISO`가 `new Date()` 기반(비결정)이므로 테스트는 **고정 리터럴** 사용 —
     미래=`"2099-12-31"`, 과거=`"2000-01-01"`. 취득일 미래 케이스는 양도일도 미래(≥취득일)로 줘서
     "양도일<취득일"이 먼저 잡히지 않게(검사 순서: 모순 먼저 → 미래 차단).
2. anchor 단위 테스트(warning): `collectStepWarnings` — 미래 양도일(2099) 경고 1건, 과거일 0건.
3. 기존 `transfer-validate-detailed`(있으면) anchor 회귀 — validateAssetEntry 첫 오류 순서 보존 확인.
   기존 fixture에 미래 취득일을 쓰는 케이스가 없는지도 확인(있으면 차단 회귀 발생 가능).
4. 전체 양도세 회귀(`npx vitest run __tests__/.../transfer*`) — 신규 차단이 기존 통과 케이스를 깨지 않는지.
5. `npx tsc --noEmit` 0건 · lint 0건.
6. E2E: (a) 취득일>양도일 → "다음" 차단 메시지. (b) 취득일 미래 → 차단. (c) 미래 양도일 → amber 경고 배너 + 진행 가능.

## 8. 자가 재검토 결과 (2026-06-29, 코딩 전)

- ✅ 정정: §3-1 의사코드 변수명 — `asset`→`a`, `formTransferDate`→`form.transferDate` (실측 시그니처).
- ✅ 정정: §3-1 배치 — `!a.assetKind` 가드 직후·분기 전. 검사 순서(모순→미래) 명시.
- ✅ 정정: `todayLocalISO` 홈 — validate-asset.ts(leaf). validate.ts에 두면 순환 import(금지).
- ✅ 정정: §3-3 다건 — 별도 코드 불요. MultiTransferTaxCalculator가 TransferTaxCalculator 임베드 +
  isPropertyReady가 validateAssetEntry 재사용 → error·warning 모두 자동 적용.
- ✅ 보강: §7 테스트 결정성(2099/2000 리터럴)·검사 순서·기존 fixture 미래일 회귀 확인.
- ✅ 확인: #4(양도일>신고일)는 `:55` 기존 차단과 동일 조건 → 신규 불요.
- ⚠ 잔여: 이월과세(carryover) 자산의 `a.acquisitionDate` 실제 값은 Pre-Do anchor로 확인
  (수증일이면 정상, 빈 값이면 skip — 어느 쪽이든 오차단 없음).
