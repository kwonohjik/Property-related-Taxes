# 비자발적 양도 감면(§77·§77의2·§77의3) + 종합한도(§133②) 개정 반영 — 수정 계획서

> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — 계획서 §2-5가 「**전 코드 grep 0건**」이라 한 대상이 전부 실재 — `transfer-reductions/metadata.ts:319`(§77의2 대토보상)·`transfer-tax-reductions-calc.ts:191`(§77의3)·`public-expropriation-reduction.ts:9` `AMENDED_2025`(2025 감면율 상향).
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: **PLAN** (미착수) · 작성 2026-07-01~~
> 확정 방침: **D1 = A** (연도분기 완전 도입, pre-2025 한도 정정) · **§77·§77의2·§77의3 세 조문 완전 구현**
> 근거: 2025.3.14. 개정 (§77 감면율·§133② 종합한도, 2025.1.1. 이후 양도분 소급) — 공식 개정 해설 이미지 + KoreanLaw MCP 현행 원문 교차검증

---

## 0. 요약 (TL;DR)

본 계획은 **3개 기능**으로 구성된다:

| # | 기능 | 성격 | 규모 |
|---|---|---|---|
| **F1** | §77 감면율 2025 개정(15/20/35/45) + §133 한도 연도분기(A) | 기존 코드 수정 | 소~중 |
| **F2** | §77의3(개발제한구역 매수 토지) 신규 감면 40%/25% | **신규 조문 완전 구현**(14지점) | 중~대 |
| **F3** | §77의2(대토보상) 신규 40% 감면 + 과세이연 | **신규 조문 완전 구현**(14지점) | **대** (과세이연 특히) |
| 공통 | §133② 한도 그룹을 3개 유형으로 확장 + 양도연도 분기 | 엔진 한도 로직 | 소 |

**핵심 실측 발견**:
- §77 감면율: 개정 **전** 값(10/15/30/40)만 존재 → 2025+ 값(15/20/35/45) 추가 필요.
- §133 한도: 코드가 이미 **2억/3억**(=2025 개정값) 고정, 연도분기 없음 → pre-2025(1억/2억) 과다 적용 중 → **A로 정정**.
- **§77의2·§77의3: 코드에 전혀 없음**(엔진·타입·UI·API 0건) → 신규 구현.

---

## 1. 법령 확정 (KoreanLaw MCP 현행 원문 · 조특법 MST 280409, 시행 2026-07-01)

### 1-1. §77 감면율 상향 (2025.1.1. 이후 양도분) — 이미지 표

| 구분 | 종전 | 개정 |
|---|---|---|
| 현금보상 | 10% | **15%** |
| 채권보상(무특약) | 15% | **20%** |
| 3년 만기 채권 | 30% | **35%** |
| 5년 만기 채권 | 40% | **45%** |

### 1-2. §77의2 대토보상 과세특례 (현행 원문 확정)

- **감면/이연 선택**: 대토보상(토지로 보상)분 양도차익 → **양도세 40% 감면** 또는 **과세이연** 중 선택 (§77의2①).
- **요건**: 사업인정고시일(고시 전 양도 시 양도일) **소급 2년 이전 취득** 토지등, **2026.12.31. 이전** 시행자에게 양도.
- **⚠️ sunset = 양도 기한**: "2026.12.31. 이전 양도" — 취득기한 아님. memory `feedback_reduction_sunset_is_acquisition_window`의 §98/§99 취득기한 패턴과 **반대**. period-check는 §98 취득일 패턴을 재사용하지 말고 **양도일 기준** 판정.
- **대토보상분 안분**: 총 양도대금(= 현금보상 + 대토보상)에서 **대토보상(토지 보상)받는 부분만** 감면/이연 대상 → 양도소득금액 × (대토보상액 / 총 양도대금) 안분 후 40% 적용(§77 현금/채권 안분과 동형; 분모=현금+대토보상).
- **추징 (§77의2③)**: ① 현금 전환 등 사유, ② 대토 소유권이전등기 원인이 대토보상으로 미기재(현물출자 등) → 감면·이연세액 **+ 이자상당가산액** 납부.
- 세부 요건·방법·추징 사유는 **시행령 위임** (§77의2⑤) → Do 시 조특령 원문 확인 필요.

### 1-3. §77의3 개발제한구역 지정에 따른 매수대상 토지 감면 (현행 원문 확정)

- **①항 (GB구역 내 토지, §17 매수청구 / §20 협의매수, 2028.12.31.까지 양도)**:
  - 1호: **지정일 이전 취득** + 취득일~매수(청구·협의)일까지 소재지 **거주** → **40% 감면**
  - 2호: **매수청구·협의매수일부터 20년 이전 취득** + 거주 → **25% 감면**
- **②항 (GB 해제 토지, 협의매수·수용, 2028.12.31.까지 양도)**: 해제일부터 1년(경제자유구역 지정 등은 5년) 내 사업인정고시된 경우 한정.
  - 1호: 지정일 이전 취득 + 취득~사업인정고시일 거주 → **40%**
  - 2호: 사업인정고시일부터 20년 이전 취득 + 거주 → **25%**
- **③항**: 상속받은 토지 = **피상속인 취득일**을 취득일로 봄.
- **⚠️ sunset = 양도 기한** (2028.12.31.까지 양도) — 취득기한 아님.
- **율 우선순위**: 1호(40%)·2호(25%) 동시 적격(지정일 이전 취득이면서 20년 이전이기도 한 경우)이면 **납세자 유리한 40%(1호)** 적용.
- **비적격(0%) 케이스**: 지정일 **이후** 취득 AND 매수/고시일부터 20년 **이내** 취득이면 두 호 모두 미충족 → §77의3 감면 없음.
- 감면신청·거주기간 계산은 **시행령 위임** (§77의3④).

### 1-4. §133② 종합한도 (현행 원문 확정 — MCP)

> ② 개인이 **제77조, 제77조의2 또는 제77조의3**에 따라 감면받을 양도소득세액 합계 중 큰 금액은 감면하지 아니한다.
> 1. 과세기간별 **2억원** 초과분
> 2. 5개 과세기간(당해 + 직전 4개) 합계 **3억원** 초과분

- **§133①** (자경 등 §66~§69·§69의2~4·§70): 연간 **1억**(1호) / 5년 **2억**(2호 나목) → 코드 group① 일치 ✓
- **pre-2025**: §133②가 신설되기 전이므로 §77(및 당시 §77의2)은 **§133①의 1억/2억** 적용. (이미지 "종전 ① 1억 / ② 2억" + 현행 §133② 신설 구조로 교차검증. Do 착수 시 개정 부칙 적용례로 소급 기준일 최종 확정.)

> ⚠️ §77의2 **과세이연분**은 감면세액이 아니라 이연이므로 §133② 한도 대상 아님 (감면 선택 시에만 한도 합산).

---

## 2. 현행 코드 실측 (file:line)

### 2-1. §77 감면율 — `lib/tax-engine/public-expropriation-reduction.ts`
- `PUBLIC_EXPROPRIATION_RATES` (L4-7): CURRENT{10/15/30/40}·LEGACY{20/25/40/50}. **2025 세트 없음.**
- 율 선택 (L122-131): `useLegacyRates = 고시≤2015-12-31 && 양도≤2017-12-31` 이진 분기. **양도 2025 분기 없음.**
- 연간 캡 (L9·189-195): `PUBLIC_EXPROPRIATION_ANNUAL_LIMIT = 200_000_000` 함수 내부 캡. (240줄)

### 2-2. §133 한도 — `lib/tax-engine/aggregate-reduction-limits.ts`
- `DEFAULT_LIMIT_GROUPS` (L30-51): group① self_farming 등 1억/2억; group② `["public_expropriation"]` **2억/3억**(=2025값), 연도분기 없음.
- `applyAnnualLimits`(L86)·`applyFiveYearLimits`(L206, `transferYear` 인자 보유하나 한도값 선택엔 미사용).

### 2-3. finalize 통합 — `transfer-tax-finalize.ts:186-255`
- STEP 8 `calcReductions()` → §77 `calculatePublicExpropriationReduction`(내부 2억 캡).
- STEP 8.5 `applyAnnualLimits`+`applyFiveYearLimits(transferYear)` 재적용(이중 한도, 동일값 등가).

### 2-4. §77 호출부 — `transfer-tax-reductions-calc.ts:157-176` — `transferDate` 이미 주입 중(추가 배선 불요).

### 2-5. §77의2·§77의3 — **전 코드 grep 0건** (엔진·타입·UI·API·metadata 없음). `aggregate-reduction-limits.ts:13` 주석 언급만.

### 2-6. UI 입력/율 라벨 — `app/calc/transfer-tax/steps/Step5.tsx`
- L220 안내·L258-260 라디오 라벨(없음15%/3년30%/5년40%)·L25 desc·`UnifiedReductionPanel-defaults.ts:16` → **하드코딩 개정 전 율**.
- 감면 UI 통합 패널: `components/calc/transfer/UnifiedReductionPanel.tsx`(standalone 체크박스=§77·자경).

### 2-7. 결과 카드 — `TransferReductionRows.tsx:70-126` `PublicExpropriationReductionRow`(율 동적 렌더, 신규 조문 카드 없음).

### 2-8. 감면 라우터 메타 — `lib/tax-engine/transfer-reductions/metadata.ts:296-` (§77만; §77의2·§77의3 미등록).

---

## 3. 변경 설계

### F1. §77 감면율 개정 + §133 연도분기 (A)

**감면율 3-세트 + 양도일 분기** (`public-expropriation-reduction.ts`):
```
CURRENT_2018 {10/15/30/40}  : 2018-01-01 ~ 2024-12-31 양도
AMENDED_2025 {15/20/35/45}  : 2025-01-01 이후 양도   ★신규
LEGACY       {20/25/40/50}  : 부칙 §53 (고시≤2015 & 양도≤2017)
```
선택 순서: ① 양도≥2025-01-01 → AMENDED_2025 · ② useLegacyRates → LEGACY · ③ else CURRENT_2018.

**한도 양도연도 팩토리** `getInvoluntaryTransferLimits(transferYear)`:
```
year ≥ 2025 → {annual: 2억, fiveYear: 3억}
year ≤ 2024 → {annual: 1억, fiveYear: 2억}
```
적용 3지점: ① 함수 내부 연간캡(상수→연도함수) · ② `DEFAULT_LIMIT_GROUPS`→`buildLimitGroups(year)` 팩토리 · ③ finalize STEP 8.5(이미 transferYear 보유).

### F2. §77의3 신규 구현 (개발제한구역 매수 토지 40%/25%)

- **신규 감면 유형**: `gb_designated_land`(또는 `expropriation_gb`). metadata 등록, `TransferReductionId` 확장.
- **엔진**: `lib/tax-engine/gb-designated-land-reduction.ts` 신설(순수 함수). 산식:
  - 감면율 = 40%(1호: 지정일 이전 취득+거주) / 25%(2호: 20년 이전 취득+거주). ①항(구역 내)·②항(해제) 두 경로.
  - 감면세액 = 산출세액 × (감면대상 양도소득금액 / 과세표준) × 감면율 — §77 구조 재사용(단일 감면율, 현금/채권 분할 없음).
  - 요건 판정: 취득일 vs 지정일/매수일−20년, 거주요건(소재지 거주), 상속=피상속인 취득일(③), sunset 2028-12-31, ②항 해제 1년/5년 사업인정 게이트.
- **§133②** 그룹 편입.

### F3. §77의2 신규 구현 (대토보상 40% 감면 + 과세이연)

- **신규 감면 유형**: `replacement_land_comp`(대토보상). **2모드**(감면/이연) 선택.
- **엔진**: `lib/tax-engine/replacement-land-reduction.ts` 신설.
  - **감면 모드**: 대토보상분 양도세 40% 감면 → §77 구조(산출세액 × 대토보상분 소득/과세표준 × 40%), §133② 한도.
  - **과세이연 모드**: 대토보상분 양도소득세 **이연**(취득가액 승계) + 이후 대토 양도 시 정산 → **별도 정산 로직 필요**(고복잡).
  - 요건: 사업인정고시일 소급 2년 이전 취득, sunset **2026-12-31**, 추징(§77의2③ 현금전환·현물출자).
- **§133②** 그룹 편입(감면 모드만).

### 공통. §133② 그룹 확장 + §127⑦ 중복배제
```
buildLimitGroups(year):
  group① self_farming 등  : {1억/2억}  ← 연도 불변(§133① 미개정)
  group② types: ["public_expropriation", "gb_designated_land", "replacement_land_comp"]
             annual/fiveYear = getInvoluntaryTransferLimits(year)   ← §77 그룹만 연도분기
```
- **§127⑦ 중복배제**(memory `feedback_127_overlap_exclusion_by_tax` — 양도세는 §127⑦): §77의2·§77의3 감면세액도 `calcReductions()` `candidates[]`에 push되어 자산당 max 1건 선택. (`transfer-tax-reductions-calc.ts` R-5 §77 패턴 동형.)
- **한도 적용 권위 소스 = finalize STEP 8.5 그룹 합산 캡**. 개별 엔진 내부 연간캡은 단건 보수적 상한일 뿐, 다자산 그룹 합산(§133②)은 `applyAnnualLimits`/`applyFiveYearLimits`가 그룹 3유형을 합산해 캡 → 개별 캡과 그룹 캡 **동일 연도값** 사용으로 이중차감 방지.
- 그룹 공유 한도: §127⑦로 자산당 1건이나, 다자산 aggregate 시 그룹 합산 캡 유효.

---

## 4. 케이스 매트릭스 (핵심 발췌)

| # | 조문 | 양도연도 | 조건 | 감면율 | 연간/5년 한도 |
|---|---|---|---|---|---|
| C1 | §77 | 2023 | 현금 | 10% | **1억/2억(정정)** |
| C2 | §77 | 2026 | 현금 | **15%** | 2억/3억 |
| C3 | §77 | 2026 | 채권 5년 | **45%** | 2억/3억 |
| C4 | §77의3① | 2026 | 지정일 前 취득+거주 | 40% | 2억/3억 |
| C5 | §77의3① | 2026 | 20년 前 취득+거주 | 25% | 2억/3억 |
| C6 | §77의3② | 2026 | 해제+1년내 고시 | 40%/25% | 2억/3억 |
| C6b | §77의3① | 2026 | **지정일 後 취득 & 20년 이내** | **0%(비적격)** | — |
| C6c | §77의3① | 2026 | 1·2호 동시 적격 | **40%(우선)** | 2억/3억 |
| C7 | §77의2 | 2026 | 대토 감면(대토보상액 안분) | 40% | 2억/3억 |
| C8 | §77의2 | 2026 | 대토 과세이연 | (이연) | **한도 대상 아님** |
| C9 | 경계 | 2025-01-01 00:00 / 2024-12-31 | §77 | 율·한도 전환 | 전환 |
| C10 | 다자산 | 2026 | §77 + §77의3 동시 | 각 율 | **그룹 합산 2억(연)/3억(5년) 캡** |

- 거주요건 미충족·sunset 경과(양도일 기준)·상속 취득일(피상속인)·②항 해제 1년/5년 게이트 실패 = 각 감면 불가 anchor 필수.
- **경계 Date 주의**: 양도일 `2025-01-01` 포함(≥) 판정 — `new Date("2025-01-01")` UTC/로컬 경계 timezone 확인(설계 반영).

---

## 5. 14 동기화 지점 (신규 조문 F2·F3은 전 지점)

- **① 폼 타입 / ② initial / ③ normalize (AssetReductionForm)**: §77의2·§77의3 신규 variant(취득일·지정일·매수/고시일·거주기간·모드·대토보상액 등) — `lib/stores/calc-wizard-asset-reduction.ts:42`(discriminated `type` union). ②신규 variant 기본값 팩토리 + ③sessionStorage 마이그레이션 normalize 동반. `TransferReductionId` 확장 `lib/tax-engine/transfer-reductions/types.ts:40`.
- **④ API 변환**: `lib/calc/transfer-tax-api-reductions.ts` 신규 유형 매핑.
- **⑤ UI 위젯**: Step5/UnifiedReductionPanel 신규 입력 카드 2종(거주기간·취득시점·모드 라디오). §77 안내(`Step5.tsx:220`)·라디오 라벨(`:258-260`) 양도연도 동적화.
- **⑥ 사이드바**: 감면 반영(해당 시).
- **⑦ 결과 카드**: `TransferReductionRows.tsx`에 §77의2·§77의3 상세 행 2종(요건 판정·감면율·산식 변수 표시).
- **⑧ validation**: `lib/calc/transfer-tax-validate-reductions.ts` 신규 필수 필드(거주기간·모드·일자). API/UI fallback ↔ validate 동기화.
- **⑨⑩⑫ Zod**: `lib/api/transfer-tax-schema-reductions.ts` discriminatedUnion 신규 유형 + `addPropertyRefines`.
- **⑬ 클라이언트 body spread**: `lib/calc/transfer-tax-api-reductions.ts`가 신규 감면 객체를 fetch body에 포함(④와 동일 경로 — 감면은 이 파일이 변환·spread 담당).
- **⑭ Route 엔진 매핑**: `app/api/calc/transfer/route-reductions-mapper.ts` 엔진 input 매핑(Date 변환).
- **⑪** 자산-수준 acquisitionDate fallback.

### metadata·legal-codes
- `metadata.ts` §77의2·§77의3 REDUCTION_METADATA 등록(category:"standalone"·effectCategory:"tax_amount"·effectLabel·isFullyImplemented). §77 effectLabel 2025 반영(현금 15%/채권 20~45%).
- `legal-codes/transfer.ts` — **`TRANSFER.REDUCTION_*` + `TRANSFER_REDUCTION_ARTICLE.*` 양 namespace** 모두 신규 등록(metadata는 후자 사용).
- **sunset은 period-check 재사용 금지** — §77의2(2026-12-31)·§77의3(2028-12-31)은 **양도일 기준** 엔진 게이트(period-check는 전부 취득/계약일 target).

---

## 6. 회귀·anchor

**신규 anchor(Pre-Do 우선)**: §77 2025+ 율 4종(C2·C3)·경계 C9 / §77의3 40%·25%·②항·상속·거주미충족 / §77의2 감면·이연·추징 / 다자산 그룹캡 C10.

**회귀 갱신**:
- `public-expropriation-reduction.test.ts` **R77-7 (L186-206)**: `transferDate 2023` 2억 캡 기대 → **1억으로 갱신**(memory `feedback_anchor_correction_legal_priority` — 법령 정확값 우선).
- R77-1~R77-6·R77-5(이미지 12,125,580, 양도 2023) → CURRENT 유지 → **불변**.
- `five-year-cumulative-limit.test.ts` F-01/F-06: `transferYear 2026` → 2억/3억 유지 → **회귀 없음**(단 groups 인자화 시 `makeAnnually` 시그니처 조정).
- `five-year-cumulative-aggregate.test.ts`: transferYear 확인 후 동일 기준.

---

## 7. SCOPE / 리스크 / 결정 잔여

- **§77의2 과세이연 모드**: 취득가액 승계 + 대토 후속 양도 정산은 **본 세목 최고난도**. 별도 sub-plan 분리 검토 권장(F3를 F3a 감면 / F3b 이연으로 분할).
- **시행령 위임 항목**: §77의2⑤·§77의3④ 거주기간 계산·추징 이자율 등 → Do 착수 시 조특령 원문(§79의2 등) KoreanLaw 확인 필수.
- **FilingFormTable "세액감면대상금액=0"**: §77 감면대상소득 top-level 미노출(`FilingFormTableHelpers.ts:741`) 별건 — 산출근거 추적성 개선으로 분리.

---

## 8. 단계별 Phase / 커밋 계획

| Phase | 내용 | verify |
|---|---|---|
| P0 | KoreanLaw 조특령(§79의2 등) + 개정 부칙 적용례 확정 | 소급 기준·거주·추징 수치 확정 |
| P1 (F1) | §77 AMENDED_2025 율 + 한도 연도분기(A) + R77-7 갱신 | ✅ **완료** — typecheck 0·§77/5년한도/감면 67 green·양도세 회귀 1746 green |
| P2 (F2) | §77의3 엔진+타입+metadata+§133② 편입 → UI/Zod/결과 | ✅ **완료** — 엔진 11 anchor·legal-codes(2 namespace)·calcReductions R-6·result echo·finalize·metadata·TransferReductionId·period-check stub·form variant·getStandaloneDefault·API 변환·Zod·route mapper·validate·UI 카드(Step5+standalone)·결과=generic 감면세액 행. typecheck 0·회귀 3301 green(tax-engine 2318+api/lib 983)·lint 0 err |
| P3a (F3) | §77의2 **감면 모드** 엔진+UI+§133② | ✅ **완료** — 엔진 `replacement-land-reduction.ts`+5 anchor·14지점 배선(calcReductions R-7·result·finalize·metadata·id·period-check·form·standalone·API·Zod·validate·UI 카드)·typecheck 0·회귀 2347 green·lint 0 err |
| P3b (F3) | §77의2 **과세이연 모드**(고난도, 필요 시 별도 plan) | 🔶 **미착수** — 취득가액 승계 + 대토 후속 양도 정산 + 조특령 위임(§72의2/§79의2 조번호 불일치, KoreanLaw 재탐색 필요). 별도 plan 권장 |
| PF | typecheck+lint+E2E 회귀 0 | ✅ E2E `e2e/transfer-expropriation-77-2025.spec.ts` **3 passed**(§77 개정율 15/20%·§77의3 카드·해제분 조건부·§77의2 카드) · typecheck 0 · 회귀 2347 green |

각 Phase 진입 전 anchor 우선 작성·실패 확보(memory `feedback_pre_anchor_verification`). 신규 조문은 엔진↔UI 시니어 병렬 Plan → 시퀀셜 Do → `ui-engine-sync-checker`+`bkit:gap-detector` Check.

---

## 부록. 검증 완료 실측 (근거)

| 항목 | 출처 | 상태 |
|---|---|---|
| §77 율·율선택·연간캡 | `public-expropriation-reduction.ts:4-11,122-131,189-195` | ✅ 코드 실측 |
| §133 group 2억/3억·연도 미분기 | `aggregate-reduction-limits.ts:30-51,206-237` | ✅ 코드 실측 |
| §77 호출부 transferDate 주입 | `transfer-tax-reductions-calc.ts:157-176` | ✅ 코드 실측 |
| UI 하드코딩 율 | `Step5.tsx:220,258-260,25` | ✅ 코드 실측 |
| R77-7 2억캡(2023)·F-06 year=2026 | `public-expropriation-reduction.test.ts:186-206` · `five-year-cumulative-limit.test.ts:40-73` | ✅ 코드 실측 |
| §77의2·§77의3 미구현 | 전 코드 grep 0건 | ✅ 실측 |
| §77의2 (40% 감면/이연·2026 시한·추징) | KoreanLaw 조특법 §77의2 (MST 280409) | ✅ 원문 확정 |
| §77의3 (40%/25%·거주·2028 시한·상속) | KoreanLaw 조특법 §77의3 | ✅ 원문 확정 |
| §133② §77·§77의2·§77의3 그룹 2억/3억 | KoreanLaw 조특법 §133② | ✅ 원문 확정 |
| §133① 자경 1억/2억 | KoreanLaw 조특법 §133① | ✅ 원문 확정 |
| §77 율 15/20/35/45·pre-2025 1억/2억 | 공식 개정 해설 이미지 + §133② 신설 구조 교차검증 | ✅ (부칙 적용례 P0 재확인) |
| 조특령 위임(거주·이연·추징 세부) | §77의2⑤·§77의3④ | ⚠️ P0 확인 예정 |
