# 일시적 2주택 특례(§155①) 종전주택 취득일 자동입력 + 요건 자동판정 — 계획서

> 작성 기준 브랜치: `fix-temporary-two-house-155` (origin/master `bb84454f`)
> 세목: 양도소득세 / 대상: `③ 일시적 2주택·합가 특례` 섹션
> **rev.2 (2026-07-19)**: plan-design-self-review-loop 3-way fork 검토 20건 반영 (dual-truth 근본제거·다건 경로·validation 로직·헬퍼 시그니처·2-PR 분리 등)

## 1. 목표 (사용자 요구)

1. **종전주택 취득일 자동입력**: `③ 일시적 2주택 특례`의 "종전 주택 취득일"에 **현재 입력 중인 양도 자산의 취득일**을 자동 반영. (종전주택 = 지금 양도하는 주택이므로 사용자 재입력 불필요)
2. **요건 자동판정**: "신규 주택 취득일"을 입력하면 §155① 요건 해당 여부를 **입력 단계에서 즉시 판정·표시**.
   - 요건 A: **종전주택 취득일부터 1년 이상 지난 후** 신규주택 취득
   - 요건 B: **신규주택 취득일부터 3년 이내** 종전(=양도)주택 양도

## 2. 법령 근거 (KoreanLaw MCP 검증 완료 — 소득세법 시행령 §155①, mst=286211, 시행 20260701)

> ① … 종전의 주택을 취득한 날부터 **1년 이상이 지난 후** 신규 주택을 취득하고 신규 주택을 취득한 날부터 **3년 이내에** 종전의 주택을 양도하는 경우 … 1세대1주택으로 보아 제154조제1항을 적용한다. 이 경우 **제154조제1항제1호, 같은 항 제2호가목 및 같은 항 제3호**의 어느 하나에 해당하는 경우에는 **종전의 주택을 취득한 날부터 1년 이상이 지난 후 다른 주택을 취득하는 요건을 적용하지 않으며** …

확정 사항:
- **요건 A (1년)**: `신규주택 취득일 ≥ 종전주택 취득일 + 1년`. **법정 요건임(추정 아님).**
- **요건 A 예외(waiver)**: §154①1호·2호가목·3호(임대5년·수용·부득이) 해당 시 **1년 요건 미적용**. → 코드 `TEMP_TWO_HOUSE_PROVISO_REASONS` 화이트리스트와 동일 집합. **단, waiver는 해당 proviso의 조건까지 충족(`resolveExemptionProviso(input)==="both"`)해야 성립** — 사유 선택만으로는 부족(§5-B M1 참조).
- **요건 B (3년)**: `양도일 ≤ 신규주택 취득일 + 3년`(2023.01.12 이후 양도분; 구 2년). 조정대상지역 부칙 완화는 현행 엔진이 이미 처리.
- (참고·범위 외) §155⑯: 수도권→지방 이전 법인·공공기관 종사자 3년→5년 + 1년 요건 미적용. 이번 작업 미포함.

## 3. 현행 코드 실측 (file:line — rev.2 전량 확정, "확인 필요" 해소)

### 3-1. UI — `app/calc/transfer-tax/steps/Step4.tsx:355~399`
- `③ 일시적 2주택·합가 특례` 섹션. 노출 조건: `isHousingLike(primaryKind) && parseInt(form.householdHousingCount) >= 2`(L356) — **자산 취득일과 무관하게 토글 노출됨**(§5-C 안내 필요).
- 토글 `temporaryTwoHouseSpecial` + 수동 `DateInput` 2개(`previousHouseAcquisitionDate`·`newHouseAcquisitionDate`, L379~395). 마크업은 `<label>` + `DateInput`(FieldCard 미사용).
- 토글 `onCheckedChange`가 OFF 시 두 날짜를 `""`로 리셋(L369~370).
- 자산 취득일·양도일 접근 경로 이미 존재: `primaryAcquisitionDate = form.assets?.[0]?.acquisitionDate`(L45), `form.transferDate`(전역).

### 3-2. 폼 상태 — `lib/stores/calc-wizard-store.ts`
- `temporaryTwoHouseSpecial`(L97), `previousHouseAcquisitionDate`(L98), `newHouseAcquisitionDate`(L99). initial(L241~242). **transfer의 `previousHouseAcquisitionDate` 사용처는 store·단건 API·다건 API·Step4뿐**(취득세 `previousHouseAcquisitionDate`는 `acquisition-*`의 **별개 필드** — 무관).

### 3-3. API 변환 (단건·다건 2경로 — ④⑬)
- 단건 `lib/calc/transfer-tax-api.ts:382~388`, 다건 `lib/calc/multi-transfer-tax-api.ts:137~144` — **양쪽 모두** `temporaryTwoHouseSpecial && previousHouseAcquisitionDate && newHouseAcquisitionDate` 가드로 `temporaryTwoHouse` 조립. **두 날짜 중 하나라도 비면 침묵 누락**(특례 미적용, 에러 없음).

### 3-4. Zod 스키마 (⑫) — `lib/api/transfer-tax-schema-sub.ts:28~30`
- `temporaryTwoHouseSchema`: `previousAcquisitionDate: z.string().date()`, `newAcquisitionDate: z.string().date()` — **둘 다 필수 유효 날짜**. barrel `transfer-tax-schema.ts:12`. → **body는 해소된 non-empty 날짜를 실어야 400 회피**.

### 3-5. Route Date 변환 (⑭)
- 단건 `app/api/calc/transfer/route.ts:163~166` — `new Date()` **직접**(기존 코드라 무변경 허용, 신규 변경 시 `toDate` 사용).
- 다건 `app/api/calc/transfer/multi/route.ts:137~140` — `toDate()`.

### 3-6. 엔진 — `lib/tax-engine/transfer-tax-exemption.ts:216~253` (E-3)
- 검사: ① 종전주택 보유기간 ≥ `minHoldingYears`(L229~232, proviso 화이트리스트 시 면제), ② `양도일 ≤ 신규취득일 + deadlineYears`(L246~247, 조정지역 부칙 반영).
- **미검사(갭)**: `신규취득일 ≥ 종전취득일 + 1년`(§155① 요건 A)이 **없음**. `addYears`·`resolveExemptionProviso`·`TEMP_TWO_HOUSE_PROVISO_REASONS` 이미 import됨(L13~15).

### 3-7. Validation — `lib/calc/transfer-tax-validate.ts`
- 일시적 2주택 두 날짜에 대한 **필수 검증 없음**(L205는 proviso 게이트 인자 전달뿐).

## 4. 발견된 결함 (이번 작업으로 함께 해소)

| # | 결함 | 근거 | 처리 |
|---|---|---|---|
| D1 | 엔진이 §155① **1년 경과 요건 미검사** | 3-6 | 엔진에 요건 A 추가(waiver 포함) — **behavior change(세액 영향)** |
| D2 | 토글 ON + 날짜 미입력 시 특례 **침묵 누락** | 3-3·3-7 | ⑧ validation **입력존재** 차단 규칙 추가 |
| D3 | 종전주택 취득일이 자산 취득일과 **이중진실** | 3-1 | **`previousHouseAcquisitionDate` 필드 폐기 → 자산 취득일 직접 사용**(단일소스) |

## 5. 설계

### 5-A. 종전주택 취득일 단일소스화 (요구 1 · D3) — **필드 완전 폐기**
- **결정**: 종전주택 취득일 = 양도 자산 취득일이므로 **독립 폼 필드 불필요**. `previousHouseAcquisitionDate`(transfer) 필드를 **폐기**하고 엔진 입력을 **자산 취득일에서 직접 도출**. → fallback 자체가 불필요해져 **dual-truth 원천 제거**(`feedback_ui_engine_dual_truth_avoidance`·`feedback_store_default_vs_ui_display_fallback` 준수. "필드 유지 + display≠API fallback"은 레거시 이력에서 표시≠계산 유발 — rev.1 결함 정정).
- **삭제 지점**: store 타입·initial(L98·L242), Step4 토글 onChange 리셋 라인(L369)·DateInput value/onChange(L383~384), 양 API의 가드·값 참조.
- **UI(⑤)**: "종전 주택 취득일"을 **읽기전용 표시**로 대체 — `<DateInput disabled value={primaryAcquisitionDate}>` + hint "양도 자산 취득일에서 자동 반영"(기존 `<label>`+DateInput 마크업 최소 변경, 인접 repl 섹션과 일관 · FieldCard 미도입).
- **API(④)**: 단건 `previousAcquisitionDate: primary.acquisitionDate`, 가드 `temporaryTwoHouseSpecial && primary.acquisitionDate && newHouseAcquisitionDate`. **다건**(`multi-transfer-tax-api.ts:137~144`)도 동일 — 단, 다건 종전주택 취득일 소스는 **양도(종전) parcel의 취득일**. per-parcel 정확 배선은 Do 1단계에서 확정(§10 미확정).
- **Zod(⑫)/Route(⑭)**: 스키마·Date 변환 형태 무변(값 소스만 자산 취득일). body는 항상 해소된 날짜 → `z.string().date()` 통과.

### 5-B. 요건 자동판정 — 엔진 primitive 헬퍼 단일소스 (요구 2 + D1)
- **신규 pure 타이밍 헬퍼**(primitive 파라미터 — `TransferTaxInput` 아님. UI fake input 조립 방지 · `single-source-engine-helper`). **waiver는 헬퍼 내부에서 도출하지 않고 caller가 boolean으로 주입** — `resolveExemptionProviso`가 proviso 필드뿐 아니라 `acquisitionDate`·`transferDate`·`residencePeriodMonths`까지 요구(실측 L67~90)하므로 proviso primitives만으로 헬퍼가 자체 판정 불가(STEP 3 정정):
  ```ts
  // transfer-tax-exemption.ts (또는 helpers)
  function judgeTemporaryTwoHouseTiming(p: {
    previousAcquisitionDate: Date; newAcquisitionDate: Date; transferDate: Date;
    isRegulatedArea: boolean;
    oneYearWaived: boolean;   // ← caller가 계산해서 주입 (아래)
  }): {
    oneYearThreshold: Date;   // 종전취득 + 1년 (UI 경계일 표시용 — 재계산 금지)
    oneYearMet: boolean;      // (신규취득 ≥ oneYearThreshold) || oneYearWaived
    deadlineYears: number; deadline: Date;  // 신규취득 + deadlineYears
    threeYearMet: boolean;    // 양도일 ≤ deadline
    overall: boolean;         // oneYearMet && threeYearMet
  }
  ```
- **waiver 도출은 엔진 `resolveExemptionProviso` 단일소스 재사용**(양쪽 공용 — 재정의 금지):
  - 엔진 E-3: 기존 `provisoRelaxesHolding`(=`resolveExemptionProviso(input)==="both" && TEMP_TWO_HOUSE_PROVISO_REASONS.has(reason)`) 그대로 `oneYearWaived`로 전달.
  - UI: form 필드로 최소 `ResidenceReqInput`(oneHouseExemptionProviso{reason·businessApprovalDate·expropriationDate·departureDate}·`acquisitionDate=primaryAcquisitionDate`·`transferDate`·`residencePeriodMonths`) 조립 → **동일 `resolveExemptionProviso` 호출** → `oneYearWaived` 산출. (최소 실입력 조립이며 산식 재정의 아님 — `ResidenceReqInput`은 `TransferTaxInput`보다 좁은 실제 시그니처.)
- **엔진 E-3 통합(D1)**: L216~253에 `oneYearMet` 검사 추가 — 미충족 시 `{ isExempt:false }`.
- **UI 판정 카드(⑤)**: Step4에서 waiver(resolveExemptionProviso) → 타이밍 헬퍼 순으로 `useMemo(() => {...}, [primaryAcquisitionDate, form.newHouseAcquisitionDate, form.transferDate, form.isRegulatedArea, form.provisoReason, form.provisoDepartureDate, form.provisoExpropriationDate, form.provisoBusinessApprovalDate, form.residencePeriodMonths])`로 호출(waiver가 residencePeriodMonths 의존 — STEP 3). 표시:
  - **입력부족**(자산취득일·신규취득일·양도일 중 미입력) → `<ToneCard tone="rose" title="자동 판정 대기">` "양도 자산 취득일·신규주택 취득일·양도일을 입력하면 요건을 자동 판정합니다".
  - **충족** → `<ToneCard tone="emerald" title="일시적 2주택 특례 요건 충족">` + 요건별 라인(1년 경과일 = `oneYearThreshold`, 3년 기한 = `deadline`).
  - **미충족** → `<ToneCard tone="amber" title="일시적 2주택 특례 요건 미충족">` + 미달 사유(예: "신규주택을 종전주택 취득 후 1년 이내 취득", "양도일이 신규취득일+3년 초과"). waiver 적용 시 그 사유 표기.
  - `data-testid="temp-two-house-verdict"`. **사실 판정만**(유·불리 표현 금지 · `feedback_tax_calculation_principle`).

### 5-C. Validation (D2) — **입력존재만 차단, 요건미달은 통과**
- **핵심 구분(rev.1 정정)**: validate는 **입력 존재만** 검증. **요건 미달(1년 미경과·3년 초과 = 판정 "미충족")은 정상 통과**(특례만 미적용, 세액 계산 진행). 판정 "충족" 조건과 validate 통과 조건은 **별개**(일치시키면 정상 과세 케이스를 차단 — `feedback_blocking_validation_full_e2e_regression`).
- 규칙: `temporaryTwoHouseSpecial===true` + 노출조건 충족 시:
  - `primary.acquisitionDate` 미입력 → "일시적 2주택: 양도 자산의 취득일을 1단계에서 입력하세요."
  - `newHouseAcquisitionDate` 미입력 → "일시적 2주택: 신규 주택 취득일을 입력하세요."
- **UI 통과 ↔ validate 차단 모순 금지**: 판정 카드가 "미충족" 떠도 validate는 통과.

### 5-D. 결과뷰(⑦) — 결정
- D1로 1년 미달 시 `isExempt:false` → `exemptReason` 소멸(비과세 사유 미표시, `TransferTaxResultView.tsx` `exemptReason` 렌더). **미달 사유는 입력단계 판정 카드(5-B)로 제공**하므로 **결과뷰 무변경**으로 확정. (결과뷰 CalculationStep에 미달 사유 노출은 범위 외.)

## 6. 케이스 매트릭스 (anchor 대상 — 단순→복합)

| ID | 종전취득 | 신규취득 | 양도일 | 지역/사유 | 기대 |
|---|---|---|---|---|---|
| TT-1 | 2018-01-01 | 2020-01-01 (1년↑) | 2021-06-01 (3년내) | 일반 | **특례 O** |
| TT-2 | 2020-01-01 | 2020-06-01 (**1년 미경과**) | **2022-06-01** (보유 2.4년·3년내) | 일반 | **특례 X (요건 A)** ← D1 신규. **양도일을 보유 2년 초과로 설정해야 D1 격리**(보유 미달이면 기존 보유요건에서 이미 과세 — Pre-Do anchor 발견) |
| TT-3 | 2018-01-01 | 2020-01-01 | 2023-06-01 (**3년 초과**) | 일반 | **특례 X (요건 B)** |
| TT-4 | 2020-01-01 | 2020-06-01 (1년 미경과) | 2021-01-01 | **수용(2호가목)·proviso 조건충족(수용일 5년내)** | **특례 O** (1년 waiver) |
| TT-5 | 2018-01-01 | 2021-01-01 | 2023-06-01 | 조정지역·부칙완화 | 부칙 deadline 반영 판정 |
| TT-6 | (자산 취득일만 존재, previousHouseAcquisitionDate 필드 폐기) | 2020-01-01 | 2021-06-01 | 일반 | 엔진이 자산 취득일 직접 수신 → 특례 O (5-A 검증) |
| TT-7 | (다건 모드, 종전 parcel 취득 2018-01-01) | 2020-01-01 | 2021-06-01 | 일반 | 다건 경로도 특례 O (§5-A 다건 배선 검증) |
| TT-8 | 2020-01-01 | 2020-06-01 (1년 미경과) | 2024-01-01 (3년 초과) | **수용(2호가목)** | **특례 X** (1년 waiver 되나 요건 B 미달) |
| TT-9 | 2020-01-01 | 2020-06-01 (1년 미경과) | 2021-01-01 | 수용 사유선택하나 **수용일 5년 초과(proviso 조건 미충족)** | **특례 X** (waiver 불성립 → 1년 요건 부활, M1 검증) |

- 경계값: 1년/3년 **당일**(`===` 경계, `addYears` 기준) 별도.

## 7. 14 동기화 지점 매핑 (rev.2 — 단건·다건 2경로)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | `calc-wizard-store.ts:98` | **`previousHouseAcquisitionDate` 삭제**(D3) |
| ② initial | 동상 L242 | 삭제 |
| ③ normalize | 마이그레이션 | 삭제 필드 무시(호환) |
| ④ API 변환 (단건) | `transfer-tax-api.ts:382~388` | 값 `primary.acquisitionDate`, 가드 자산취득일 기준 |
| ④' API 변환 (다건) | `multi-transfer-tax-api.ts:137~144` | 동일 적용 — 소스는 종전 parcel 취득일(Do 확정) |
| ⑤ UI 위젯 | `Step4.tsx:355~399` | 종전취득일 읽기전용화 + 판정 카드(5-B) + onChange 리셋 라인 제거 |
| ⑥ 사이드바 | — | 해당 없음 |
| ⑦ 결과 카드 | `TransferTaxResultView`(exemptReason) | **무변경**(5-D 결정) |
| ⑧ validation | `transfer-tax-validate.ts` | 입력존재 차단(5-C) — 요건미달은 통과 |
| ⑨⑩ Zod enum | — | 신규 enum 없음 |
| ⑪ 자산 fallback | route | 자산 취득일 존재 경로 확인 |
| ⑫ Zod 입력객체 | `transfer-tax-schema-sub.ts:28~30`(+barrel `:12`) | 형태 무변·필수 date 유지(body는 해소값) |
| ⑬ body spread | `transfer-tax-api.ts:382` + `multi-transfer-tax-api.ts:137` | 양경로 반영 |
| ⑭ Route 매핑(Date) | `route.ts:163~166`(new Date) + `multi/route.ts:137~140`(toDate) | 두 경로 상이 — 무변경(신규 변경 시 toDate) |

> ⑫⑬⑭는 TS 미감지 → grep 자가 점검 필수. **다건 경로(④'·⑬·⑭ multi) 누락 주의**(rev.1 Critical).

## 8. 리스크

- **R1 (behavior change·세액영향)**: D1(1년 요건)로 **기존 1년 미경과 특례 인정 케이스가 미인정 전환**. 회귀 기대값을 **법령 기준으로 갱신**(`feedback_anchor_correction_legal_priority`).
- **R2**: 판정 카드 유·불리 표현 금지 — 사실판정만(`feedback_tax_calculation_principle`).
- **R3 (다건)**: 다건 종전주택 취득일 per-parcel 소스 미확정 → Do 1단계에서 배선 확정 후 TT-7 GREEN.
- **R4 (waiver 경계)**: `oneYearWaived`가 proviso **조건충족**까지 요구 → 사유선택만으로 waiver되지 않음(TT-9). 과잉 불리적용 아님을 anchor로 고정(`feedback_no_unfavorable_application_without_legal_basis`).

## 9. 작업 순서 — **2-PR 분리 권장** (세액영향 격리)

D1(엔진 1년 요건, 세액영향·회귀부담)과 표시/입력 로직을 한 PR에 혼재하면 회귀 실패 원인 격리가 어려움 → **2-PR 분리**:

**PR-1 (엔진 — 세액영향, 독립 검증)**
1. Pre-Do anchor: TT-2(1년 미경과→X)·TT-1(정상 O) 먼저 실행 → 현행 엔진이 TT-2에서 **특례 O 오판(FAIL)** 재현(D1 증명).
2. `judgeTemporaryTwoHouseTiming` primitive 헬퍼 추출 + E-3 1년 요건 통합(waiver 재사용).
3. anchor TT-1~5·TT-8·TT-9 GREEN + 기존 일시적2주택 회귀 기대값 갱신(R1).
4. `npx vitest run __tests__/tax-engine/transfer/` + `tsc --noEmit` 0.

**PR-2 (UI·API·Validation — PR-1 헬퍼 재사용)**
5. D3: `previousHouseAcquisitionDate` 필드 폐기(store·양 API·Step4). 다건 배선 확정(TT-6·TT-7).
6. D2: validation 입력존재 차단(⑧, 5-C).
7. UI: 종전취득일 읽기전용 + 판정 카드(헬퍼 재사용, 5-B).
8. 14지점 grep 자가점검(⑫⑬⑭ 단건·다건), `tsc` 0.
9. 브라우저 수동 확인(토글 ON → 자산취득일 자동표시 → 신규취득일 입력 → 판정 즉시 갱신 → Network body `temporaryTwoHouse` 확인).

> 사용자가 단일 PR을 원하면 순서 1~9를 한 브랜치에 수행하되 커밋을 엔진/UI로 분리.

## 10-A. Do 반영 이력 (문서-구현 드리프트 0)

- **PR-1 완료**: `judgeTemporaryTwoHouseTiming` 헬퍼(exemption.ts) + E-3 1년 요건 통합. anchor 7건 GREEN, §154 기존 15건·양도세 2108건 무회귀, tsc 0.
- **PR-2 완료**: `previousHouseAcquisitionDate` 필드 폐기(store·단건/다건 API·Step4). 종전취득일 읽기전용(`<DateInput disabled value={primaryAcquisitionDate}>`). 판정 카드(`ToneCard` emerald/amber/rose + `data-testid="temp-two-house-verdict"`). validation 입력존재 차단. UI 판정 헬퍼 `lib/calc/transfer-temp-two-house-judge.ts`.
- **결정 — UI 처분기한 상수**: `twoHouseRule`은 DB rate 기반이라 클라이언트 접근 불가 → UI 판정 카드는 `TEMP_TWO_HOUSE_UI_DEADLINE_YEARS = 3`(현행 법정, 조정·비조정 공통) 주입. 조정지역 종전 2년 기한은 드물어 계산 결과에서 확정(카드에 명시). 로직(`judgeTemporaryTwoHouseTiming`)은 단일소스.
- **결정 — waiver 단일소스**: UI가 `ResidenceReqInput`(주석상 "UI·엔진 공용" 타입) 조립해 `resolveExemptionProviso` 직접 호출. 타입 충족용 `wasRegulatedAtAcquisition:false`(해당 branch 미사용).
- **다건 종전취득일 소스 확정**: 단·다건 모두 `primary.acquisitionDate`(assets[0]) — 기존 form-global 시맨틱과 동일.
- **anchor 정정**: 계획 TT-2 양도일 2021-01-01→2022-06-01(보유 2년 통과로 D1 격리) — Pre-Do anchor 발견(§6 반영).

## 10. 미확정 (잔여)

- **다건 종전주택 취득일 per-parcel 소스**: `multi-transfer-tax-api.ts`에서 종전(양도) parcel의 취득일 참조 경로 — Do 1단계 grep 후 확정(§5-A·R3).
- 기존 일시적 2주택 회귀 테스트 파일 위치·현재 기대값 — PR-1 3단계에서 확인 후 R1 영향 범위 확정.
