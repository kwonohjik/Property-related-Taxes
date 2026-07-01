# 별지 84호 부표2 — 「세액감면대상금액(⑲)·감면후 소득금액」 의미 정정 계획서

> 대상: 양도소득세 신고서 별지 제84호서식 부표2(양도소득금액 계산명세서)의
> **⑲ 세액감면대상금액** 및 **감면후 소득금액** 칸.
> 성격: **서식 표시 값·산식 정정** (표시 전용 — 과세표준·세액에 영향 없음. 근거 §7).

---

## 1. 근거 문서 정리 (사용자 제공 3종)

### 1-1. 소득세법 시행규칙 별지 84호 부표2 기재요령 (이미지9 — 권위 근거)
- **14. ⑲ 세액감면대상란**: 양도소득세액의 감면을 「소득세법」 **제90조제1항(세액감면방식)**을 적용하여
  계산하는 경우 양도자산의 **감면소득금액**을 적는다.
- **15. ⑳ 소득금액감면대상란**: 「소득세법」 **제90조제2항(소득금액 차감방식)**을 적용하는 경우
  양도자산의 **감면소득금액**을 적는다.

→ **핵심**: ⑲/⑳ 모두 "**감면소득금액**"(= 감면대상 **양도소득금액**, 감면율 적용 **전**·기본공제 **전**)을 기재.
§90①(세액감면방식)은 **세액**을 감면 → 소득금액 미차감. §90②(소득금액차감방식)은 **소득금액**을 차감.

### 1-2. 정확한 부표2 예시 (이미지8)
- 양도소득금액 = **290,841,229**
- 감면소득금액 › 세액감면대상(⑲) = **290,841,229** (= 양도소득금액 전액)
- 소득금액감면대상(⑳) = 0

→ §77(수용, 세액감면방식) 사례에서 ⑲ = 양도소득금액 전액(자산 전부가 감면대상). 감면율(현금15/채권20%)은
⑲가 아니라 **감면세액 계산 단계**에서 적용.

### 1-3. 우리 프로젝트 현재 출력 (이미지7)
- 양도소득금액 = 290,841,229
- 세액감면대상금액(⑲) = **53,425,403** ← 문제
- 소득금액 감면대상(⑳) = 0
- 감면후 소득금액 = **237,415,826** (= 290,841,229 − 53,425,403) ← 파생 문제

`53,425,403` = 우리 엔진 `reducibleIncome` = §77 Σ(자산분 소득 − 기본공제) × 감면율
(현금 12,728,523 + 채권 40,696,880). 즉 **감면율을 곱한 값**을 ⑲에 넣음.

---

## 2. 근본 원인 (코드 실측)

### Bug A — ⑲ 세액감면대상금액에 rate-곱 값(`reducibleIncome`)을 기재
- `components/calc/results/transfer/FilingFormTableHelpers.ts:741`
  `setNum("reductionTargetIncome", "total", result.reducibleIncome ?? 0);`
- `result.reducibleIncome`는 조문별 의미 상이:
  | 조문 | reducibleIncome 의미 | ⑲로 적합? |
  |---|---|---|
  | 자경 §69 | 감면대상 양도소득금액 (100% 또는 편입 area ratio) — **감면율 미곱** | ✅ 적합 |
  | **§77** | Σ(자산분소득 − 기본공제) × 감면율(15/20%) — **감면율 곱** | ❌ |
  | **§77의2** | 대토보상분 소득 × 40% — **감면율 곱** | ❌ |
  | **§77의3** | (양도소득금액 − 기본공제) × 감면율(25/40%) — **감면율 곱 + 기본공제 차감** | ❌ |
- 즉 **rate-곱 문제는 §77·§77의2·§77의3 전용**. 자경(§69)·§97 계열은 `reducibleIncome` = 감면대상 소득(정확).
  (§97 계열은 Do 시 확인 — §3-4 열린 항목.)

### Bug B — 「감면후 소득금액」이 §90①(세액감면) ⑲를 차감 (단건 FilingFormTable만)
- `FilingFormTableHelpers.ts:747-752`
  `incomeAmountAfter = incomeAmount − reductionTargetTotal(⑲) − new993Reducible(⑳)`
- §90①(세액감면방식)은 소득금액을 줄이지 않음 → **⑲를 빼면 안 됨**. §90②(⑳)만 차감해야.

---

## 3. 3개 렌더러 일관성 — 단건만 어긋남 (버그 확증)

| 렌더러 | ⑲ 값 | 감면후 소득금액 = |
|---|---|---|
| **단건** `FilingFormTableHelpers.ts` | `reducibleIncome` (Bug A) | `incomeAmount − ⑲ − ⑳` (**Bug B**) |
| 다건 `FilingFormTableAggregateHelpers.ts:154·207` | `reducibleIncome` (Bug A) | `incomeAfterOffset` (**⑲ 미차감 — 정답**) |
| 상세명세서 `DetailedStatementHelpers.ts:586·608` | `reducibleIncome` (Bug A) | `singleIncome − 0` (**⑲ 미차감 — 정답**) |

→ **감면후 소득금액(Bug B)은 단건에만 존재**. 다른 두 렌더러가 이미 ⑲를 빼지 않음 = 단건이 틀렸다는 확증.
→ **⑲ 값(Bug A)은 세 렌더러 공통** — 세 곳 모두 수정 필요.

## 3-1. §90①/② 조문 분류 (현재 매핑)
- ⑲ 세액감면대상(§90① 세액감면방식): §77·§77의2·§77의3·자경§69·§97 계열 → `reductionTargetIncome`
- ⑳ 소득금액감면대상(§90② 소득금액차감방식): §99의3(`new993Detail.reducibleTransferIncome`) → `reductionTargetIncome2`
  (§99·§98의8 등 소득차감형이 ⑳에 정상 반영되는지 Do 시 확인 — §3-4.)

---

## 4. 수정 설계

### 4-1. Bug B (단건 감면후 소득금액) — **간단·고신뢰, 우선 적용**
`FilingFormTableHelpers.ts:747-752`에서 **⑲(reductionTargetTotal) 차감 제거**, ⑳(new993Reducible)만 차감.
현재 non-RH 산식 `incomeAmount − reductionTargetTotal − new993Reducible` → `reductionTargetTotal` 항 제거:
```ts
// §90①(세액감면방식)은 소득금액 미차감 — ⑲(세액감면대상)은 빼지 않는다.
// §90②(소득금액차감방식·§99의3 등)만 차감. (다건·상세명세서와 일치)
const incomeAmountAfter = isRH
  ? result.taxableGain
  : Math.max(0, incomeAmount - new993Reducible);
```
- (`reductionTargetTotal` 상수는 미사용 → 함께 제거. non-RH는 비과세를 빼지 않던 기존 동작 유지 — `- nontaxable` 추가 금지.)
- 다건·상세명세서와 동일 규칙 → 렌더러 3종 일관.
- 결과: 이미지7 감면후 소득금액 237,415,826 → **290,841,229**(§90① 소득 미차감).

### 4-2. Bug A (⑲ 값) — 「감면대상 양도소득금액」(pre-rate·pre-기본공제)로 교체
`reductionTypeApplied`(top-level result 필드)로 **exact-match 라우팅**(memory `feedback_enum_substring_match_forbidden` — `.includes` 금지):
| 조문 (`reductionTypeApplied`) | ⑲ 값 = 감면대상 양도소득금액 | 산출 | 엔진 |
|---|---|---|---|
| `public_expropriation` (§77) | 양도소득금액 전액 (전액 수용) | **`incomeAmount`**(폼 기존값 = cashIncome+bondIncome) | **불요** |
| `gb_designated_land` (§77의3) | 양도소득금액 전액 | **`incomeAmount`**(= `input.transferIncome`) | **불요** |
| `replacement_land_comp` (§77의2) | 대토보상분 양도소득금액 (기본공제 전) | 엔진 echo 필요 | **echo 1필드** |
| 그 외(자경§69·§97 등) | `reducibleIncome`(= 감면대상 소득, 기존 유지) | 하위호환 | 불요 |

- 즉 **§77·§77의3는 `incomeAmount` 라우팅으로 echo 불요**(전액이 감면대상). **echo는 §77의2만**
  (`ReplacementLandResult`에 `eligibleTransferIncome` = 기본공제 前 대토보상분 양도소득금액 추가 — 엔진 내부값 존재 확인 §3-4).
- 3개 렌더러(FilingFormTable 단건 `incomeAmount`·다건 `p.income`·상세명세서 `singleIncome`/`p.income`) 모두 동일 라우팅.
- 검증: §77 ⑲ = incomeAmount = 87,356,825 + 203,484,404 = **290,841,229** (cashIncome+bondIncome 합과 자기일관).

> **주의**: §77 계열은 §133 종합한도로 최종 감면세액이 capping될 수 있으나, ⑲는 **한도 전 감면대상 소득금액**
> (신고서 기재 목적). 감면세액(⑯행)과는 별개 필드 — 혼동 금지.

---

## 5. 변경 파일
| 파일 | 변경 |
|---|---|
| `replacement-land-reduction.ts` + 타입 | §77의2 `eligibleTransferIncome` echo 1필드 = `replacementIncome`(`:106` 기본공제 前 대토보상분 = transferIncome−cashIncome, **내부값 이미 존재**) |
| `FilingFormTableHelpers.ts` | ⑲ = reductionTypeApplied 라우팅(§77·§77의3=`incomeAmount`/§77의2=echo/그외=reducibleIncome) (Bug A) · 감면후 소득금액 ⑲ 미차감 (Bug B) |
| `FilingFormTableAggregateHelpers.ts` | ⑲ = 동일 라우팅(자산별 `p.income`) (Bug A). 감면후 소득금액은 이미 정답(변경 없음) |
| `DetailedStatementHelpers.ts` | ⑲ = 동일 라우팅 (Bug A) |

(§77·§77의3는 엔진 무변경 — `incomeAmount`/`p.income` 라우팅. 엔진 echo는 §77의2 1필드만.)

---

## 6. 검증
1. **이미지8 anchor(§77)**: ⑲ 세액감면대상 = **290,841,229**(= 양도소득금액), 감면후 소득금액 = **290,841,229**
   (§90① 소득 미차감), ⑳ = 0. 감면세액(16,607,063)·결정세액은 **불변**.
2. **과세표준 정합(내부 자기일관)**: 수정 후 감면후 소득금액 290,841,229 − 기본공제 2,500,000 = **288,341,229** = 우리 과세표준.
   현재값 237,415,826은 과세표준(288,341,229)과 **내부 불일치**(감면후 소득금액이 과세표준 산정과 어긋남 = 버그 확증).
2. **KoreanLaw §90 재확인**: §90①(세액감면방식)·§90②(소득금액차감방식) 문언 확인 후 인용 확정
   (memory `feedback_korean_law_citation_verify` — 기재요령 1차 근거, 본칙 재검증).
3. **회귀 0**: 자경 §69 케이스 ⑲(= 감면대상 소득) 불변, §99의3 ⑳·감면후 소득금액 불변.
   `npx tsc --noEmit` 0 / 감면 유닛·`five-year-cumulative-*` 통과.
4. **표시 전용 확증**: `taxBase`는 세 렌더러 모두 엔진값 독립 설정(단건 `result.taxBase`·다건 `aggregated.taxBase`) →
   ⑲·감면후 소득금액 변경이 과세표준·세액에 무영향(§7).
5. **E2E**: §77 계산 후 부표2에서 ⑲ = 양도소득금액·감면후 소득금액 = 양도소득금액 assert.

## 7. 영향 범위·주의
- **과세표준·세액 무영향**: 부표2 ⑲·감면후 소득금액은 표시 필드. `taxBase`는 엔진(`양도소득금액 − 기본공제`)에서 독립 산출.
- **Bug A 대상**: §77·§77의2·§77의3만(rate-곱). 자경§69·§97은 `reducibleIncome`=감면대상소득 → ⑲ 불변.
- **Bug B 대상**: 단건 FilingFormTable만(다건·상세명세서는 이미 정답).

## 3-4. 열린 항목 (Do 시 검증 — 추정 금지)
1. §97 계열 `reducibleIncome`이 감면대상 소득(full)인지 rate-곱인지 → Bug A 대상 확정.
2. ~~§77의2 대토보상분 기본공제 전 양도소득금액 존재 여부~~ → **해소**: `replacement-land-reduction.ts:106` `replacementIncome`(= transferIncome − cashIncome, 기본공제 前) 존재 → echo 가능.
3. ⑲가 기본공제 **전** 값이 맞는지 이미지8 재확인(290,841,229 = 양도소득금액 = 기본공제 전 ✔ 잠정).
4. §99·§98 소득차감형이 ⑳(§90②)에 반영되는지 (현재 ⑳는 §99의3만).
5. §90 본칙 문언 KoreanLaw 확인.
6. **상세명세서 §90② 갭(별건)**: `DetailedStatementHelpers.ts:608` 감면후 소득금액 = `singleIncome − 0` — ⑲뿐 아니라
   ⑳(§90② §99의3)도 차감 안 함. §90①엔 정답이나 §99의3(소득차감)엔 소득 미차감 = 잠재 갭. 이번 범위 밖 — 별도 판단.
