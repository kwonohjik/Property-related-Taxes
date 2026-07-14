# 겸용주택 거주기간 이중 입력 제거 — 보유상황(입주일·퇴거일) 단일 소스화 (계획서)

## 0. 요약 (한 줄)

겸용주택에서 거주기간을 **두 번**(자산목록 ④ `거주기간(년)` + 보유상황 `입주일·퇴거일`) 입력하던 것을,
**보유상황 입력을 단일 소스**로 만들고 자산목록 ④ 입력을 제거한다. 겸용 엔진 입력 `residencePeriodYears`는
보유상황 거주개월에서 도출(`Math.floor(months/12)`)한다. **엔진 계산식 무변경 — 입력 소스만 통합.**

---

## 1. 배경 · 현황 (실측 근거)

### 1.1 두 입력의 현재 역할

| | 위젯 | 필드 | 경로 | 실제 사용 |
|---|---|---|---|---|
| **이미지49** (자산목록 ④) | `MixedUseResidencyInput` (`MixedUseSection.tsx:135`) | `mixedUseResidencePeriodYears`(년) | API `transfer-tax-api.ts:232` → `residencePeriodYears` → 겸용 엔진 | **세액 계산** — 표2 판정 + 거주공제 금액 (`transfer-tax-mixed-use.ts:144·159`, helpers `:585-591·:680`) |
| **이미지50** (보유상황) | `ResidencePeriodSection` (일반, 모든 주택 공통) | `residencePeriods`/`residencePeriodMonthsAsset`/`residenceInputMode` | API `:439` → `residencePeriodMonths` → **일반(비-겸용)** 엔진 | 겸용에선 **세액 미반영**. 신고서 양식 표시(거주기간 행 + 장특 보유/거주 분할)만 (`FilingFormTableHelpers.ts:435-442`) |

### 1.2 문제 — dual-truth (같은 개념 2입력)

- 두 위젯의 안내 배지가 **동일**("1세대1주택 비과세·표2 공제 판정에 사용", `MixedUseResidencyInput.tsx:27` · `ResidencePeriodSection.tsx:75`) → 사용자에겐 같은 목적의 중복 입력으로 보임.
- 겸용주택에서 두 값이 **다르면** 어긋남:
  - 거주공제 **금액**(세액) = 이미지49 (엔진)
  - 신고서 **거주기간 행** = 이미지50
  - 신고서 **보유/거주 장특 분할** = 엔진금액(49) ÷ 이미지50 비율
  - 예: 49=24년, 50=0개월 → 엔진은 거주공제 부여, 신고서는 거주기간 0·거주기간분 0으로 모순.

### 1.3 통합 가능 근거 (실측)

- **`deriveResidencePeriodMonths(primary, transferDate, formMonths)`**(`lib/stores/calc-wizard-asset-residence.ts`)가 이미지50(구간 합산 or 직접 개월)을 거주개월로 단일 도출 — 일반 경로 API `:439`가 이미 사용.
- **메인(비-겸용) 엔진**은 `Math.floor(residencePeriodMonths / 12)`로 거주연수 산출 후 `residenceYears >= 2`(표2)·`residenceYears × 0.04`(거주공제) 적용 (`transfer-tax-helpers.ts:466·505·471·513`). 겸용도 **동일 산식**으로 도출하면 정합.
- 겸용 validation은 `mixedUseResidencePeriodYears`를 **필수로 요구하지 않음**(`transfer-tax-validate-asset.ts:313` 겸용 블록에 부재) → 제거 안전.
- 신고서·비과세 판정은 **이미 이미지50 사용** → 엔진도 이미지50 기반이 되면 **자동 정합**.

### 1.4 이중 입력의 원인

겸용 엔진이 간단한 "거주기간(년)" 숫자만 받도록 설계됐고, 일반 주택의 입주일·퇴거일 구간 입력을 재사용하지 않아 별도 필드(이미지49)를 신설했기 때문. 사실상 중복.

---

## 2. 목표

- 겸용주택 거주기간 입력 = **보유상황(이미지50) 단일 소스**.
- 자산목록 ④ `거주기간(년)`(이미지49) **제거**.
- 겸용 엔진 입력 `residencePeriodYears` = `Math.floor(deriveResidencePeriodMonths(...) / 12)` (메인 엔진과 동일 whole-year 산식).
- 신고서 표시·엔진 세액이 **동일 소스**로 정합.

---

## 3. 설계 결정

### D1. 도출식 = `Math.floor(months / 12)` (메인 엔진 정합)

API `transfer-tax-api.ts:232`를 이미지49 field read → 이미지50 도출로 교체:
```ts
// 변경 전
residencePeriodYears: parseFloat(primary.mixedUseResidencePeriodYears) || 0,
// 변경 후
residencePeriodYears: Math.floor(
  deriveResidencePeriodMonths(primary, form.transferDate, form.residencePeriodMonths) / 12,
),
```
- `deriveResidencePeriodMonths`는 `:439`에서 이미 import·사용 중 → 추가 import 불요.
- **부수 효과(개선)**: 현재 겸용 엔진은 `residencePeriodYears`를 floor하지 않고 `× 0.04` 적용(`helpers:590`) — 사용자가 소수(24.5) 입력 시 법정 whole-year(장특 거주공제는 만 연수) 위반 가능. 도출식이 floor를 강제하므로 **잠재 오류도 해소**.

### D2. 이미지49 위젯·필드 완전 제거 (참조 6곳)

- 위젯: `MixedUseResidencyInput.tsx` 삭제 + `MixedUseSection.tsx:134-135`(④ 섹션·import) 제거.
- 필드: `mixedUseResidencePeriodYears` — 타입(`calc-wizard-asset-gb.ts:170`)·defaults(`calc-wizard-asset-mixed-use.ts:45`)·migration(`:78`) 제거.
- 테스트: `mixed-use-inputs-tonecard.test.tsx` 참조 갱신.
- sessionStorage 잔여: 구 저장분에 필드가 남아도 타입에서 제거되면 **무시**(무해) — migration 라인 삭제로 충분.

### D3. 겸용 엔진 입력 타입 무변경 (최소 변경)

`MixedUseAssetInput.residencePeriodYears`(년) 유지 — 소스만 도출로 바꿈. 엔진 계산식·result 무변경 → 회귀면 최소.
(대안: 엔진 입력을 `residencePeriodMonths`로 바꿔 엔진 내부 floor — 엔진 변경 커지므로 **불채택**.)

### D4. 섹션 번호 무변경 (④가 마지막 섹션)

실측(`MixedUseSection.tsx:116-135`): 섹션은 ①면적 · 1-A용도변경 · ②양도시 기준시가 · ③취득시 기준시가 · **④거주기간(마지막)**. ④ 뒤 섹션 없음 → 제거 시 **번호 재조정 불필요**. ④ 블록만 삭제.

---

## 4. 변경 지점 (파일별)

| # | 파일 | 변경 |
|---|---|---|
| C1 | `lib/calc/transfer-tax-api.ts:232` | `residencePeriodYears` 도출식 교체 (D1) |
| C2 | `components/calc/transfer/mixed-use/MixedUseResidencyInput.tsx` | 파일 삭제 |
| C3 | `components/calc/transfer/MixedUseSection.tsx:15·134-135` | ④ 섹션 렌더(`:135`)·import(`:15`) 제거. 번호 재조정 없음(D4) |
| C4 | `lib/stores/calc-wizard-asset-gb.ts:170` | `mixedUseResidencePeriodYears` 타입 제거 |
| C5 | `lib/stores/calc-wizard-asset-mixed-use.ts:22·45·78` | defaults·migration·Pick 유니온에서 제거 |
| C6 | `__tests__/components/mixed-use-inputs-tonecard.test.tsx` | `MixedUseResidencyInput` **import(`:9`) + 해당 `it` 블록(`:18-31`) 삭제** (위젯 파일 삭제로 import 깨짐). `PartialUsageChangeInputs` 등 나머지 케이스 유지 |
| C7 | `app/calc/transfer-tax/steps/Step4.tsx:296-298` | 안내 문구 갱신 — "거주기간은 자산 카드의 ④ 거주 기간 입력에서 입력합니다"(비-housing 브랜치)가 ④ 삭제로 stale → 해당 문구 제거/수정. housing 브랜치 "아래 거주기간 입력이 표2 판정에 사용됩니다"는 이제 mixed-use에도 **정확**해짐(유지) |

**무변경(자동 정합)**: 엔진(`transfer-tax-mixed-use*.ts`)·result 타입·신고서(`FilingFormTable*`)·validation(겸용 블록에 미참조).

---

## 5. 동기화 지점 해당성

엔진 result 무변경·엔진 input 필드 무변경(소스만 도출). 클라이언트: ①폼 타입·②initial·③migrate(제거) · ④API(도출) · ⑤UI 위젯(제거). ⑥사이드바 미사용. ⑦결과·⑧validation 무변경.

→ 신규 필드 추가가 아니라 **제거 + 소스 재배선** → 14지점 전수 아님. 제거 참조 누락만 관리(tsc가 대부분 포착).

---

## 6. 검증

### 6.1 Pre-Do anchor

1. **anchor-A (도출 일치)**: 보유상황 거주 293개월(이미지50) → 겸용 API payload `residencePeriodYears === 24`(floor(293/12)). 표2 적용.
2. **anchor-B (표2 경계)**: 23개월 → 1년 → 표1(< 2); 24개월 → 2년 → 표2. 메인 엔진 경계와 동일.
3. **anchor-C (정합)**: 동일 거주개월로 엔진 거주공제(49 경로 제거 후)와 신고서 거주기간 행(50)이 같은 소스 → 불일치 0. (예: 거주공제 표2 적용 시 신고서 거주기간분 장특 > 0 보장.)
4. **anchor-D (거주 0 무회귀)**: 보유상황 거주 미입력 → residencePeriodYears=0 → 표1(거주공제 0). 다주택·거주없음 케이스 정상.

### 6.2 회귀

- `mixedUseResidencePeriodYears` 참조 0 확인 (`grep -rn` 후 tsc 0).
- 겸용 엔진 회귀(`__tests__/tax-engine/transfer-tax/mixed-use-*.test.ts`) — 엔진 무변경이라 그린. **단 엔진 테스트가 residencePeriodYears를 직접 세팅**하면 무영향(엔진 입력은 그대로).
- 신고서 4col·per-part anchor 그린.
- lint·tsc 0.

### 6.3 E2E

- 겸용 결과 도달 스펙(`e2e/mixed-use-filing-form-4col.spec.ts` 등)에서 자산목록 ④ 거주 입력 채우던 스텝 제거, 보유상황 거주만 입력 → 표2 거주공제·신고서 거주기간 정합 확인.
- ⚠️ 기존 E2E가 이미지49(④)를 채우고 있었는지 grep 후 스텝 정리.

---

## 7. 미결 / 결정

1. **이미지49 완전 제거 vs deprecated 유지** — 권장 **완전 제거**(참조 6곳 한정, sessionStorage 잔여 무해). migration 라인도 삭제.
2. ~~보유상황 거주 입력 게이팅~~ — ✅ 해소(실측): Step4 거주는 `form.isOneHousehold && primaryKind==="housing"`(`Step4.tsx:304`)로 게이팅. mixed-use 엔진 `isOneHouseExempt`도 `primary.isOneHousehold` 요구(`transfer-tax-api.ts:237-240`) → **거주가 표2에 필요한 경우(1세대1주택)에만 Step4 입력 표시**, 다주택은 표1이라 거주 무관·미표시 정당. **회귀 없음** (현재도 !isOneHousehold이면 엔진 `useTable2=false`로 이미지49 무시).
3. **거주공제 floor 부수 개선의 회귀 영향** — 이미지49는 DecimalInput(소수 년 가능), 현재 엔진은 floor 안 함. 도출식 floor로 소수 년 케이스 결과 미세 변동 가능(법정 만-연수라 개선). 단 표2 임계는 `>=2` 정수비교·거주공제는 대개 40% cap이라 실질 영향은 거주 10년 미만 소수 케이스 한정. 겸용 엔진 테스트가 정수 년만 쓰면 무영향(Do 시 확인).
4. **자산목록 ④ 제거 안내(선택)** — 거주기간은 "보유상황 단계에서 입력"임을 자산 카드에 짧게 안내할지(C7 Step4 문구로 대체 가능 — 자산카드 안내는 선택).
5. ~~`primary.isOneHousehold`(asset) vs `form.isOneHousehold`(form) 동기화~~ — 🔴 **버그 확정·수정(함께 커밋)**: Step4 "1세대 해당" 토글은 `form.isOneHousehold`에만 쓰고 **asset-level로 동기화 안 됨**(makeDefaultAsset `isOneHousehold: false` 기본·mirror 부재). 그런데 겸용 payload `isOneHouseExempt`는 `primary.isOneHousehold`(asset=false) 참조 → **겸용 1세대1주택인데 토글 ON에도 12억 비과세 미적용 + 표1(거주공제 0)**. 사용자 스크린샷이 실제 발현. **수정**: `transfer-tax-api.ts:241` `isOneHouseExempt` 소스 `primary.isOneHousehold` → `form.isOneHousehold`(일반 엔진 `:467`과 동일). anchor `mixed-use-one-household-exempt.anchor.test.ts`(토글 ON→exempt=true) + E2E `mixed-use-one-household-exempt.spec.ts`(비-PHD 40억→비과세·표2 가시).

### 후속 관찰 (별개)

- **`transfer-tax-api-helpers.ts:564` `isOneHousehold: asset.isOneHousehold`** — 비-겸용 split-gain(토지/건물 분리) per-asset 입력도 동일 stale asset 값 참조. 비-겸용 1세대1주택 split 케이스에서 같은 부류 버그 가능성 — **본 작업 범위 밖**(겸용만 수정), 별도 조사 필요.

---

## 8. 결론

- **작업 성격**: 소스 통합 — API 도출식(C1) + 위젯/필드 제거(C2~C6) + Step4 안내 문구(C7), 총 7개 변경 지점. 겸용 엔진 계산·result·신고서 무변경.
- **효과**: 거주기간 단일 입력, 세액↔신고서 표시 정합(dual-truth 제거), 거주공제 floor 정확화(부수).
- **핵심 검증**: 도출 일치(anchor-A) + 표2 경계(anchor-B) + 정합(anchor-C) + 거주 0 무회귀(anchor-D).
- **규모**: 중.
