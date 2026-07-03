# 자경농지 편입 부분감면(조특령 §66⑤⑥) 기준시가 3점 입력 완결 — 계획서

**대상 결함**: 양도세 엔진감사 LOW #20 — 자경 §69 편입 부분감면 "침묵 0".
**작성일**: 2026-07-03. **상태**: Plan (구현 전).

---

## 1. 배경 — 편입 부분감면 산식

조특법 §69 자경농지 감면 중, 조특령 §66⑤⑥ **편입 부분감면**:
농지가 2002.1.1 이후 주거·상업·공업지역으로 편입되면 "편입일까지 발생한 소득"만 감면.

```
감면대상 비율 = (편입시 기준시가 − 취득시 기준시가) / (양도시 기준시가 − 취득시 기준시가)
```

→ **기준시가(공시지가) 3점**(취득·편입·양도)이 필수. 이 3점은 실지거래가액과 무관 —
양도차익을 실지로 계산해도 편입 비율은 언제나 기준시가로 산정한다.

## 2. 현황 (실코드 검증 완료 — file:line)

| 지점 | 사실 |
|---|---|
| 엔진 silent-0 | `lib/tax-engine/self-farming-reduction.ts:171` — `stdAcq<=0 \|\| stdIncorp<=0 \|\| stdTransfer<=0`이면 `qualifies:false, reducibleIncome:0` 반환 + `breakdown`에 경고만(차단 아님) |
| stdIncorp 소스 | reduction `selfFarmingStandardPriceAtIncorporation` → api `standardPriceAtIncorporation` (`transfer-tax-api-reductions.ts:34`) |
| stdAcq 소스 | `input.standardPriceAtAcquisition` (자산-수준, `transfer-tax-reductions-calc.ts:120`·`rate-calc.ts:542`) |
| stdTransfer 소스 | `input.standardPriceAtTransfer` (자산-수준, `rate-calc.ts:543`) |
| **stdAcq 파생** | `transfer-tax-api.ts:362-368` — **환산(isEstimated) / carryover에서만** 세팅. 실지·감정 모드 = `undefined` |
| **stdTransfer 파생** | `transfer-tax-api.ts:371-378` — **환산 / pre1990 / carryover에서만** 세팅. 실지·감정 = `undefined` |
| UI | `components/calc/inputs/SelfFarmingIncorporationInput.tsx` — **편입시 기준시가 1점만** 수집(개별공시지가×면적). 취득·양도시 기준시가 입력 없음 |

### 근본 원인
자경농지 대다수는 **실지거래가액 양도**다. 이 모드에서 자산-수준 stdAcq·stdTransfer가
`undefined`(=0)로만 엔진에 도달 → 편입 부분감면은 **3점 중 2점이 구조적으로 0** →
`self-farming-reduction.ts:171`에서 **항상 silent-0**. 즉 실지 모드에서는 편입 부분감면이
사실상 동작 불가이고, 사용자는 breakdown 경고를 못 보면 감면 0을 인지 못 한다.

**→ validate 한 줄로는 부족**하다. 실지 모드에 3점 입력 경로가 없으므로,
validate만 추가하면 실지 모드 편입 자경을 전부 차단(=기능 자체 봉쇄)하게 된다.

## 3. 설계 갈림길

### Option A (권장) — 편입 부분감면 전용 취득·양도시 기준시가 2필드 추가
`SelfFarmingIncorporationInput`에 취득시·양도시 기준시가 입력을 추가(편입시와 동일한
`LandPriceLookupField` 패턴). reduction 자체 필드로 운반 → 모드 무관 3점 입력 가능.
- 장점: 법령 완결(실지·환산 모두 편입 부분감면 정상 동작). §99의3/§98의7의 "감면 전용 기준시가" 선례와 동형.
- 단점: 필드 2개 추가(store·Zod·api·엔진 input·UI·validate 배선).

### Option B — 환산 모드 한정 지원
편입 부분감면을 환산 모드에서만 허용, 실지 모드는 UI 안내 후 비활성. asset 환산 기준시가 재사용.
- 장점: 신규 필드 0.
- 단점: 실지 자경농지 편입 부분감면 미지원(법령 기능 제약). 사용자 혼란.

**권장: Option A** — 편입 부분감면은 실지 양도에서도 성립하는 법령 기능이므로 3점을 독립 입력받아야 정확.

### 규모 분류 (13단계 자가검토 깊이)
**중 규모**. 근거: 계산 코어 `SelfFarmingReductionInput`(`calculateSelfFarmingReduction` 입력)과
result 타입 **무변경** — 신규 2필드는 `TransferReduction` union self_farming 변형에만 추가되고
api-reductions가 **기존** 엔진 param(`standardPriceAtAcquisition`/`Transfer`)으로 pass-through 매핑.
알고리즘·result·신규 세목 없음 → 별도 `.engine.design.md`/`.ui.design.md`(STEP 5·12) **N/A**,
본 계획서에 케이스·input델타·위젯을 통합. (union 필드는 pass-through라 코어 input 타입 불변)

## 4. 배선 (Option A · DoD)

reduction 신규 필드 2개(store): `selfFarmingStandardPriceAtAcquisition`, `selfFarmingStandardPriceAtTransfer`.
엔진 union 변형 신규 2필드: `standardPriceAtAcquisition?`, `standardPriceAtTransfer?`.
엔진은 reduction 값 **우선, 없으면 자산-수준(환산 모드) fallback** — API·validate 3중 동일 소스.

| # | 지점 | 파일 | 작업 |
|---|---|---|---|
| ① | store 타입 | `lib/stores/calc-wizard-asset-reduction.ts` self_farming 변형 | 2필드 `string?` 추가 |
| ② | defaults | `UnifiedReductionPanel-defaults.ts` | `""` 초기화 |
| ③ | normalize | `calc-wizard-asset-migrate.ts` reductions map | self_farming 케이스 **신설**(현재 부재) — **신규 2필드만** backfill(`?? ""`), 기존 self_farming 필드 불변(최소변경) |
| ④ | API 변환 | `lib/calc/transfer-tax-api-reductions.ts` self_farming | 편입 ON 시 `standardPriceAtAcquisition`/`standardPriceAtTransfer`를 reduction에 매핑(값>0만) |
| ⑤ | UI 위젯 | `components/calc/inputs/SelfFarmingIncorporationInput.tsx` | 취득·양도시 기준시가 `LandPriceLookupField` 2입력 추가(편입시와 동일 패턴, onChange 직접 — useEffect 미러링 금지) |
| ⑦ | 결과 표시 | 자경 감면 상세 breakdown | 엔진 breakdown이 이미 편입 비율 3점 산식 포함 — 추가 카드 표기는 **확인 필요**(선택) |
| ⑧ | validate | `lib/calc/transfer-tax-validate-reductions.ts` | self_farming 블록 **신설**. 아래 §4.1 정밀조건 |
| ⑫ | Zod | `lib/api/transfer-tax-schema-reductions.ts` self_farming | 2필드 `z.number().nonnegative().optional()` |
| **⑫′** | **엔진 union 타입** | **`lib/tax-engine/types/transfer-reduction-input.types.ts` self_farming 변형(12-34)** | **`standardPriceAtAcquisition?: number`·`standardPriceAtTransfer?: number` 추가 — 미추가 시 ⑬ TS2339** |
| ⑬ | 엔진 input 소스 | `transfer-tax-reductions-calc.ts` self_farming 블록(266~) | `standardPriceAtAcquisition: reduction.standardPriceAtAcquisition ?? standardPriceAtAcquisition`(자산 param fallback), stdTransfer 동일 |
| ⑭ | Route Date변환 | `route-reductions-mapper.ts`·`bundled-split-helpers.ts` self_farming 케이스 | **무변경** — 신규 필드는 number라 `...r` spread로 통과(Date 변환 불요). 명시적 필드 drop 없음 확인 완료 |

**N/A 지점**: ⑥ 사이드바 합계(감면 기준시가 미반영, `computeTransferSummary` 무관) · ⑨⑩ Zod enum(신규 enum 멤버 아님 — 기존 `self_farming` literal에 필드 추가) · ⑪ 자산-수준 acquisitionDate fallback(본 필드 무관).

**엔진 코어(`self-farming-reduction.ts`)는 무변경** — stdAcq/stdTransfer 인자만 채워지면 기존 산식 정상 동작.

### 4.1 validate 정밀 조건 (⑧ — 엔진 silent-0 정확 미러, UI↔validate 모순 방지)
`transfer-tax-validate-reductions.ts`는 `asset`+`form` 접근 가능(기 시그니처), `date-fns` 사용 가능.
아래 **1~4 모두 참**일 때만 `fail`:
1. `r.useSelfFarmingIncorporation === true`
2. `r.selfFarmingIncorporationDate` 존재 **且 `>= 2002-01-01`** (2002 이전 편입은 엔진이 전액감면 → 차단 금지)
3. `new Date(form.transferDate) <= addYears(new Date(incorporationDate), 3)` (3년 경과는 엔진 graceExpired 별도 → 차단 금지. **`isWithin5YearsCheck` 아님** — grace는 편입일+3년)
4. 3점 중 하나라도 미입력:
   - stdAcq: `parseAmount(r.selfFarmingStandardPriceAtAcquisition ?? "") > 0 || parseAmount(asset.standardPriceAtAcq ?? "") > 0`
   - stdIncorp: `parseAmount(r.selfFarmingStandardPriceAtIncorporation ?? "") > 0`
   - stdTransfer: `parseAmount(r.selfFarmingStandardPriceAtTransfer ?? "") > 0 || parseAmount(asset.standardPriceAtTransfer ?? "") > 0`
   → 하나라도 거짓이면 `fail("편입일 부분감면(조특령 §66⑤⑥): 취득·편입·양도 시점 기준시가를 모두 입력하세요")`

> **자산 fallback 소스**(⑧·⑬ 동일): 자산-수준 stdAcq/stdTransfer는 환산 모드에서만 `primary.standardPriceAtAcq`/`standardPriceAtTransfer`로 채워짐(`transfer-tax-api.ts:362·371`). 실지 모드 사용자는 reduction 신규 2필드로 입력. → validate는 **둘 다 인정**해야 API·엔진과 정합.

## 5. 검증 (anchor)

**엔진(`self-farming-reduction`·`transfer-tax-reductions-calc`)**:
- 3점 완비(reduction 소스) → 편입 비율 부분감면 산출(양수 reducibleIncome).
- **자산 fallback**(reduction 2필드 공란 + 환산 모드 자산 stdAcq/stdTransfer 존재) → 동일 산출(3중 소스 정합).
- 3점 결손 → `qualifies:false`(silent-0 회귀 유지).
- 편입일 <2002 → 전액감면(qualifies:true, ratio 1). 편입일+3년 경과 → graceExpired(qualifies:false).

**validate(⑧)**:
- 편입 ON + 2002 후 + 유예 내 + 3점 결손 → **fail**.
- 2002 전 편입 → pass(엔진 전액감면). / 3년 경과 → pass(엔진 별도 상실). / 3점 완비(reduction OR 환산 자산) → pass.

**e2e(선택)**: 자경 편입 부분감면 실지 모드 3점 입력 → 계산 성공·감면>0.

## 6. 리스크·경계

- **③ normalize**: self_farming은 현재 migration 케이스가 없음(B4 new_99_3와 동일 패턴). 구 세션 복원 시 신규 2필드 undefined → validate 차단 방어 위해 backfill 필수.
- **자산 fallback 유지**: 환산 모드 기존 동작(자산-수준 기준시가 사용)을 깨지 않도록 reduction 우선·자산 fallback 3중 패턴.
- **개산공제 무관**: 본 기준시가는 편입 비율 전용 — §163⑥ 개산공제(취득 기준시가×3%)와 별개.
