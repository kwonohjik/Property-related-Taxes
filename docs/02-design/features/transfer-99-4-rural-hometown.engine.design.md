# §99의4 농어촌주택·고향주택 — 엔진 설계

> 선행: `docs/00-pm/transfer-99-4-rural-hometown.plan.md` (법령 원문 §1·드리프트 D-1·게이트 R-A 해소)
> 효과: **주택수 제외** — 농어촌주택등을 소유주택이 아닌 것으로 보아 §89①3호 적용. 세액감면 아님 (`house_count_exclusion`).

## 1. 파일 구조 (800줄 정책)

```
lib/tax-engine/transfer-reductions/
├── new-99-4.ts (신규, ~200줄)   # evaluateNew994 — rural/hometown 단일 evaluator + id 분기
├── types.ts                     # New994EvaluationInput·New994Result 추가
├── period-check.ts              # D-1 정정: new_99_4_* 항목 낙관 통과로 변경
└── metadata.ts                  # isFullyImplemented: true (P3)
```

## 2. 케이스 인벤토리 (anchor 전수)

| # | 케이스 | 법령 | 기대 | 파일 | 상태 |
|---|---|---|---|---|---|
| A-1 | 2주택(일반+농어촌 적격: 시한 내·가액 2억·소재지✓·연접✗·취득순서✓·3년+) | ①1호 ✅ | isEligible·exclusion 1 | `new-99-4.test.ts` | ☐ |
| A-2 | 가액 3.5억 → 불적용 / 한옥 토글 → 적용 | ①1호나목 ✅ | 한도 3억/4억 전환 | 동상 | ☐ |
| A-3 | 연접 토글 ON → 불적용 | ③ ✅ | ADJACENT_AREA 사유 | 동상 | ☐ |
| A-4 | 농어촌 취득일 ≤ 일반주택 취득일 → 불적용 | ① "취득 전 보유" ✅ | ACQUISITION_ORDER 사유 | 동상 | ☐ |
| A-5 | 시한 — rural 2003.7.31 취득 / hometown 2008.12.31 취득 → 불적용 | ① 기간 ✅ | OUT_OF_PERIOD (id별 시기) | 동상 | ☐ |
| A-6 | 농어촌 보유 3년 미만 → **적용 + 추징 경고 echo** | ④·⑥ ✅ | isEligible·clawbackWarning | 동상 | ☐ |
| A-7 | 소재지 토글 미확인 → 불적용 | ①1호가목 ✅ | LOCATION_UNCONFIRMED | 동상 | ☐ |
| A-8 | hometown 고향요건 토글 미확인 → 불적용 | ①2호가목·령⑥ ✅ | HOMETOWN_UNCONFIRMED | 동상 | ☐ |
| A-9 | 가액 정확히 3억 → 적용 ("초과하지 아니할 것" — 이상 아님) | ①1호나목 ✅ | 경계 포함 | 동상 | ☐ |
| B-1 | 일반주택 양도 10억·2주택(농어촌 적격) → 비과세 0원 | §89①3호 ✅ | isExempt·finalTax 0 | `new-99-4-integration.test.ts` | ☐ |
| B-2 | 양도 15억·거주 2년+ → 부분과세 + **표2** — 12억 안분 원단위 toBe | §89①3호·§95②·소령§159의4 ✅ | 법정 산식 직접 계산 | 동상 | ☐ |
| B-3 | 동일 입력 reductions=[] → 2주택 과세 (대조군 — numeric 영향 실증) | — | isExempt false | 동상 | ☐ |
| B-4 | 3주택(일반+신규+농어촌) + 일시적2주택 → 농어촌 제외 후 E-3 결합 | ① + 소령§155① ✅ | 일시적 2주택 비과세 | 동상 | ☐ |
| B-5 | 양도 15억·거주 2년 미만 → 부분과세 + 표1 | §95② 거주요건 ✅ | 표2 미적용 분기 | 동상 | ☐ |
| B-6 | 중과 입력(houses[]·조정지역) 병행 시 중과 주택수 **불변** | ⚠️ R-D | 중과 원본 판정 + 경고 echo | 동상 | ☐ |

## 3. 타입 (types.ts 추가)

```typescript
export interface New994EvaluationInput {
  id: "new_99_4_rural" | "new_99_4_hometown";
  /** 양도하는 일반주택의 취득일 (자산-수준 acquisitionDate 재사용 — 취득순서 판정).
   *  기존 패턴(acquisitionDate)과 달리 명시 명명 — 농어촌주택 취득일과의 모호성 제거 목적. */
  generalHouseAcquisitionDate: Date;
  transferDate: Date;
  /** 농어촌주택등 취득일 — 시한(rural 2003.8.1~/hometown 2009.1.1~, ~2028.12.31)·3년 보유·취득순서 */
  ruralHouseAcquisitionDate?: Date;
  /** 취득 당시 주택+부속토지 기준시가 합계 (원) — 3억/4억(한옥) 한도 */
  ruralHouseStdPrice?: number;
  isRegisteredHanok: boolean;          // 령⑭ 등록 한옥 → 한도 4억
  isAdjacentArea: boolean;             // ③ 같은/연접 읍면동(시) — true면 배제
  meetsLocationRequirement: boolean;   // ①1호가목/2호나목 — 사용자 확인 토글
  meetsHometownRequirement?: boolean;  // ①2호가목·령⑥ — hometown 전용
}

export type New994IneligibleCode =
  | "OUT_OF_PERIOD" | "MISSING_RURAL_ACQ_DATE" | "MISSING_STD_PRICE"
  | "STD_PRICE_EXCEEDED" | "ADJACENT_AREA" | "LOCATION_UNCONFIRMED"
  | "HOMETOWN_UNCONFIRMED" | "ACQUISITION_ORDER";

export type New994Result =
  | { id: New994EvaluationInput["id"]; isEligible: false;
      ineligibleReasons: { code: New994IneligibleCode; message: string; legalBasis: string }[];
      legalBasis: string; effectCategory: "house_count_exclusion" }
  | { id: New994EvaluationInput["id"]; isEligible: true;
      legalBasis: string; effectCategory: "house_count_exclusion";
      houseCountExclusion: 1;
      /** 농어촌주택등 보유연수 (결과 카드 표시·추징 경고 산출 근거) */
      ruralHoldingYears: number;
      /** ④ 선적용 (3년 미보유) — ⑥ 추징 경고 */
      clawbackWarning: boolean;
      /** R-D: 중과 주택수에는 미반영 안내 */
      surchargeNotAffected: true };
```

상수: `RURAL_FROM = 2003-08-01` · `HOMETOWN_FROM = 2009-01-01` · `PERIOD_TO = 2028-12-31` · `STD_PRICE_LIMIT = 300_000_000` · `STD_PRICE_LIMIT_HANOK = 400_000_000` · `MANDATORY_YEARS = 3`.

## 4. 알고리즘

### 4.1 evaluateNew994 (순수 evaluator — 검증 순서)

1. 필수 입력: `ruralHouseAcquisitionDate`·`ruralHouseStdPrice` 미입력 → 사유 (자동 fallback 금지).
2. 시한: id별 시기(`RURAL_FROM`/`HOMETOWN_FROM`) ≤ 취득일 ≤ `PERIOD_TO` — **D-1 정정: period-check가 아닌 evaluator 자체 판정** (period-check 항목은 낙관 통과로 변경).
3. 취득순서: `ruralHouseAcquisitionDate > generalHouseAcquisitionDate` (① "취득 전에 보유하던").
4. 가액: `stdPrice ≤ (isRegisteredHanok ? 4억 : 3억)` — **경계 포함** (초과만 배제, A-9).
5. 소재지·연접·(hometown) 고향 토글 검증.
6. 보유 3년: `calculateHoldingPeriod(rural취득일, transferDate).years >= 3` — 미만이면 **eligible 유지 + `clawbackWarning: true`** (④ 선적용·⑥ 추징). 산출 연수는 `ruralHoldingYears`로 echo (결과 카드).

### 4.2 엔진 통합 (transfer-tax.ts — 호출부 2곳 복제 전달)

실측 (2026-06-11): `effectiveInput`이 비과세(291)·LTHD(529)·**중과 하위호환(515)**에 공유됨 → 일괄 주입 시 중과 오염. **개별 호출부 복제 전달**로 한정:

```
STEP 1 직전: new994Result = evaluateNew994(...)  // reductions에서 new_99_4_* 추출
const exemptionInput = new994Result?.isEligible
  ? { ...effectiveInput, householdHousingCount: effectiveInput.householdHousingCount - 1 }
  : effectiveInput;

L291: checkExemption(exemptionInput, ...)               // 비과세 + 12억 부분과세 (E-1~E-4)
L529: calcLongTermHoldingDeduction(taxableGain, exemptionInput, ...)  // 표2 (R-A 해소)
L515-519 (중과 하위호환): effectiveInput 원본 유지       // R-D — §167의3 별개 체계
STEP 0.5 (다주택 중과 houses[]): 원본 유지
```

- result echo: `result.new994Detail?: New994Result` (⑦ 결과 카드·추징 경고·중과 미반영 안내).
- STEP 2.5(소령 §155⑳ 거주주택 특례)와의 결합은 **v1 범위 외** — 동시 입력 시 §155⑳ 우선(기존 조기 반환 유지).

## 5. 14 동기화 지점 매핑

| # | 지점 | 내용 |
|---|---|---|
| ① | AssetReductionForm | `new_99_4_rural`/`new_99_4_hometown` stub → 본 필드 6종(공통 5 + hometown 1) |
| ② | getReductionDefault | 날짜·금액 ""·토글 false (3-state 불요 — boolean 토글만) |
| ③ | migrateAsset | stub 데이터 방어 보정 (기존 `_phase1Stub` → 본 필드 기본값) |
| ④ | toEngineReductions | 2분기 추가 — Date·parseAmount 변환 |
| ⑤ | UI 위젯 | `New994InputForm`(variant prop) + 패널 렌더 분기 2개 |
| ⑥ | 사이드바 | 영향 없음 (비과세 결과로 자연 반영) |
| ⑦ | 결과 카드 | `New994DetailCard` — 제외 산식 한국어·추징 경고 amber·중과 미반영 안내 |
| ⑧ | validate | 선택 시 `ruralHouseAcquisitionDate`·`ruralHouseStdPrice` 필수, hometown은 고향 토글 안내 |
| ⑨⑩ | Zod enum | 실측: `reductionSchema` 단일 정의 공용(메인 `schema.ts:134`·컴패니언 `schema-sub.ts:412`) → ⑫ 갱신만으로 자동 커버. enum 자체는 `schema.ts:408` 기등록 |
| ⑪ | 자산-수준 acquisitionDate fallback | `generalHouseAcquisitionDate` ← **엔진 통합부(§4.2)에서 `effectiveInput.acquisitionDate` 주입** (실측: mapper는 reduction 배열만 수신 — 자산 취득일 접근 불가. 신규 폼 필드 아님) |
| ⑫ | Zod 입력 객체 | `transfer-tax-schema-sub.ts:329-330` stub → 본 필드 |
| ⑬ | body spread | reduction 배열 그대로 — 신규 객체 필드는 ⑫에서 strip 방지 |
| ⑭ | route mapper | `route-reductions-mapper.ts` — `new_99_4_*` Date 변환 분기 추가 (단건+다건 공용) |

## 6. 검증

- 전 anchor 양도연도 §55·§89·§95 법정 산식 직접 계산 (B-2 12억 안분 원단위 toBe).
- B-3 대조군으로 numeric 영향 실증. `tsc 0` + `vitest transfer-tax/` + E2E 1 spec (stale 서버 주의 — :3100 재시작).

## 6.5 Do 환류 (2026-06-11 — 설계 대비 deviation)

1. **주입 지점 2곳 → 3곳**: 설계(§4.2)의 checkExemption(291)·LTHD(529)에 더해 **STEP 표시 산식 `isOneHouseSpecial`**(transfer-tax.ts:535-537)도 `exemptionJudgeInput` 사용 — LTHD 계산과 표시 산식의 표2 판정 일치 목적.
2. **라우터 추출**: STEP 0.9 평가 블록이 800줄 정책 초과(815줄) 유발 → `evaluateNew994FromReductions(reductions, ctx)` 라우터를 `new-99-4.ts`로 추출(구조적 타이핑 — 순환 import 회피, rental-97-router 패턴). 본문 800줄 정확.
3. **비과세 조기 반환 echo**: STEP 1a 조기 반환 객체에도 `new994Detail` 포함 — §99의4가 비과세의 근거인 핵심 케이스에서 카드 표시 필수.
4. **기존 period-check 테스트 재산정**: `reduction-period-check.test.ts`의 §99의4 2건이 D-1 드리프트(자산 취득일 기준)를 anchor → 법령 정합(낙관 통과 + evaluator 정확 판정)으로 교체 (`feedback_anchor_correction_legal_priority`).
5. **폼 위치**: `New994InputForm`은 `components/calc/transfer/` 직속 (rental/ 하위 아님 — new_99_3 인라인 폼과 같은 new_housing 계열 정렬).
6. **검증 결과**: anchor 16건(A 10 + B 6) 전부 통과 — B-2 산출세액 4,365,000 / B-5 39,910,000 원단위 법정 산식 일치. transfer-tax 102 파일 1518 통과 · tsc 0 · lint 0 · E2E 3 spec(신규+§97 회귀) 통과.

## 7. 게이트 (잔존)

| # | 내용 | 처리 |
|---|---|---|
| R-A ✅ | 표2 적용 | 해소 (소령 §159의4 포괄 문구) — 사용자 최종 확인 권장 |
| **R-D** | 다주택 **중과** 판정(소령 §167의3)에서 농어촌주택 제외 여부 | v1 원본 유지 + 결과 경고 echo. §167의3 원문 확인 후 후속 (B-6 anchor가 현 동작 고정) |
| R-B·R-C | 별표 12 시 지역·부령 지정 지역 | 사용자 확인 토글 + hint (plan §7) |
