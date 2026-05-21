# 영농상속공제 정밀화 (Plan)

> 작성일: 2026-05-21
> 대상 법령: 상증법 §18의3 (mst=276123) · 상증령 §16 (mst=283637) — KoreanLaw MCP 2026-05-21 검증
> 대상 파일: `lib/tax-engine/deductions/inheritance-deductions.ts` · `lib/tax-engine/types/inheritance-gift.types.ts` · `components/calc/inheritance/step4-5.tsx` · `components/calc/PropertyValuationForm.tsx` · `components/calc/inheritance/DeemedCategorySection.tsx` (영농 분류 추가)
> 정책 참조: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[feedback_three_state_optional_mode_toggle]]` · `[[mirror-pattern]]` · `[[feedback_explicit_prop_mapping_strip]]` · `[[pre-do-anchor-verification]]`

## 1. 배경 — 현행 구현 갭

### 1-1. 현재 (`calcFarmingDeduction` line 214)
```typescript
export function calcFarmingDeduction(farmingAssetValue: number) {
  if (farmingAssetValue <= 0) return { deduction: 0, ... };
  const deduction = Math.min(farmingAssetValue, FARMING_MAX);  // 30억
  return { deduction, ... };
}
```

**갭 4건**:
1. **영농 자산 식별 미구현** — 사용자가 `farmingAssetValue`를 통째 금액 직접 입력. estateItems에서 영농 자산을 자동 식별 못함.
2. **피상속인 요건 미검증** — §16② 8년 직접 종사 + 거주지 30km 이내 / 법인 50% 최대주주 8년 경영
3. **상속인 요건 미검증** — §16③ 18세 이상 + 2년 직접 종사 + 거주지 / 법인 임원 취임 + 2년 내 대표이사
4. **사후관리 미구현** — §18의3④ 5년 내 처분·종사중단 시 추징 + 이자상당액 (§16⑦⑧)

### 1-2. 법령 정합 (KoreanLaw MCP 검증 완료)

**상증법 §18의3 ①** — 영농상속재산 30억 한도. "영농"은 양축·영어·영림 포함.

**시행령 §16 ① 영농 정의**: 한국표준산업분류 농업·임업·어업

**시행령 §16 ⑤ 영농상속재산 (소득세법 영농)**:
- 가. 농지법 §2①가 농지
- 나. 초지법 §5 초지조성허가 초지
- 다. 보전산지 + 산림경영계획 인가 + 5년 이상 조림 산림지 (보안림·채종림·산림유전자원보호림 포함)
- 라. 어선법 §2① 어선
- 마. 내수면어업법·수산업법·양식산업발전법 어업권·양식업권 (마을어업·협동양식업 면허 제외)
- 바. 농업·임업·축산업·어업용 창고·저장고·작업장·퇴비사·축사·양어장 + 부속토지 (건폐율 환산 면적 한정)
- 사. 소금산업진흥법 §2③ 염전

**시행령 §16 ⑤ 영농상속재산 (법인세법 영농)**: 법인 주식 (가업상속 §15⑤2호 준용)

**§15⑤2호 사업무관자산 차감 산식** (법인 영농 주식 평가 — KoreanLaw 추가 검증):

```
법인 주식 영농상속 가액 = 주식 평가가액 × (총자산 − 사업무관자산) / 총자산
```

사업무관자산 5종 (§15⑤2호 가~마):
- 가. 비사업용토지 (소득세법 §104조의3)
- 나. 임대부동산 + 임대 주택 — 단서 5년 이상 무상임대 임직원용 국민주택규모 이하 또는 기준시가 6억 이하 제외
- 다. 임직원 외 대여금 — 단서 임직원 본인·자녀 학자금, 기준시가 6억 이하 주택 전세금 제외
- 라. 과다보유현금 — 5년 평균 현금 보유액 200% 초과분 (요구불예금·만기 3개월 이내 금융상품 포함)
- 마. 영업무관 주식·채권·금융상품 (라목 제외)

→ **본 PR은 자동 계산하지 않음**. 사용자가 차감 후 가액을 EstateItem.marketValue로 직접 입력. UI 안내 카드 명시. 자동화는 후속 PR (F-8).

**피상속인 요건 §16②1호** (소득세법 영농):
- 가. 상속개시일 8년 전부터 계속 직접 영농 종사 (질병·수용 1년 이내 인정)
- 나. 거주지 — **자산 유형별 2분기**:
  - **농지·초지·산림지**: 농지등 소재 시·군·구, 연접 시·군·구, 또는 직선거리 30km 이내 (산림지는 통상 직접 경영 가능 지역 포함)
  - **어선·어업권·양식업권**: 어선 선적지·어장 가장 가까운 연안 시·군·구, 연접 시·군·구, 또는 선적지·연안으로부터 직선거리 30km 이내

**상속인 요건 §16③1호** (소득세법 영농, 18세 이상):
- 가. 상속개시일 2년 전부터 계속 직접 영농 종사
  - **예외**: 피상속인이 65세 이전 사망 or 천재지변·인재 사망 시 면제
- 나. 거주지 — §16②1호나 인용 (피상속인 거주 요건과 동일):
  - **농지·초지·산림지**: 농지등 소재 시·군·구·연접·30km
  - **어선·어업권·양식업권**: 선적지·어장 연안 시·군·구·연접·30km

**후계자 트랙 §16③ 본문 후단** (KoreanLaw 추가 검증):
- "재정경제부령으로 정하는 영농·영어·임업후계자인 경우에 적용"
- 후계자 자격 시 18세·2년 종사·거주 요건과 **별개 트랙으로 자격 인정** 가능
- UI: 별도 boolean 토글 "영농·영어·임업후계자 (재정경제부령)" 추가
- 본 PR은 사용자 명시 체크박스만 도입 — 재정경제부령 정의 자체는 후속 추적

**직접 영농 종사 §16④** (4가지):
1. 농작물 경작·다년생식물 재배 상시 종사 or 농작업 1/2 이상 자기 노동력
2. 가축 사육 상시 종사 or 축산작업 1/2 이상 자기 노동력
3. 어업 상시 종사 or 어업작업 1/2 이상 자기 노동력
4. 산림조성 상시 종사 or 산림조성작업 1/2 이상 자기 노동력

**직접 종사 부정 §16⑭** (피상속인·상속인 모두 적용 — 후계자 트랙 포함):
- 사업소득금액 + 총급여액 ≥ 3,700만원 과세기간 (영농 소득·부동산임대·농어가부업 제외)
- 사업소득 총수입금액 ≥ 일정액 (시령 §208⑤2호)
- → 후계자 트랙으로 자격 인정 가능한 경우라도 본 부정 조건 충족 시 미충족 처리. evaluateFarmingEligibility 코드는 §16⑭를 isDesignatedSuccessor 분기 **이전**에 평가하여 동일하게 적용 (§16⑭ 본문 "피상속인 또는 상속인이 ~ 직접 영농 종사하지 않은 것으로 본다").

**사후관리 추징 §18의3④ + §16⑦** — 5년 내:
1. 영농상속재산 처분
2. 영농 종사 중단

추징세액 = 공제받은 금액에 해당일까지 기간을 고려한 율을 곱한 금액 (§18의3④)
- **시행령 §16⑦ "100분의 100"** — 5년 내 사후관리 위반 시 추징율 **100%** (사유 발생 시점 무관 일률 적용)

**이자상당액** (§16⑧):
```
이자상당액 = 결정세액 × (신고기한 다음날 ~ 사유 발생일) × (국세기본법 시행령 §43의3② 이자율 / 365)
```

**신고 의무 §18의3⑦** — 사유 발생일이 속하는 달의 말일 또는 §18의3⑥2호 사유 발생일이 속하는 달의 말일부터 **6개월 이내** 신고 + 자진납부 (이미 부과·납부된 경우 제외)

**정당한 사유 §16⑥** (추징 면제):
1. 상속인 사망 / 2. 해외이주 / 3. 수용·협의매수 / 4. 국가·지자체 양도·증여 /
5. 영농상 농지 교환·분합·대토 / 6. 법인주식 처분 중 일정 사유 (최대주주 유지)

**조세포탈·회계부정 §18의3⑥ + 시행령 §16⑨ + §15⑲ 인용** (KoreanLaw 추가 검증):
- §15⑲ 1호 — 조세포탈: 「조세범 처벌법」 §3① 각 호 벌금형
- §15⑲ 2호 — 회계부정: 「주식회사 등의 외부감사에 관한 법률」 §39① 벌금형 (**재무제표상 변경금액이 자산총액의 100분의 5 이상인 경우 한정**)
- 형 확정 시:
  - 확정 결정 전: 공제 배제 (§18의3⑥1호)
  - 공제 후: 추징 + 이자상당액 (§18의3⑥2호)

## 2. 데이터 모델 변경

### 2-1. `EstateItem` 영농 분류 신규

**A안 채택**: `deemedCategory` 패턴 차용. `farmingCategory?: enum`로 영농 자산 종류 식별 (별도 `AssetCategory` enum 확장 없음 — 회귀 위험 0).

```typescript
export interface EstateItem {
  // ... 기존 필드
  /**
   * 영농상속 자산 분류 (상증령 §16⑤ 1호 가~사).
   * undefined: 영농 자산 아님.
   * UI: PropertyValuationForm·StockValuationForm 카드에서 사용자가 선택.
   */
  farmingCategory?:
    | "farmland"            // 가. 농지법 §2①가 농지
    | "pasture"             // 나. 초지법 §5 초지조성허가 초지
    | "forest_land"         // 다. 보전산지 산림지 (5년 이상 조림)
    | "fishing_vessel"      // 라. 어선법 §2① 어선
    | "fishing_right"       // 마. 어업권·양식업권
    | "agricultural_building" // 바. 농업용 건축물 + 부속토지
    | "salt_field"          // 사. 염전
    | "corporate_stock";    // 법인세법 영농 — 법인 주식 (§16⑤ 2호)
}
```

### 2-2. `InheritanceDeductionInput` 영농 요건 신규

```typescript
export interface InheritanceDeductionInput {
  // ... 기존
  /** 영농상속 자산가액 — 자동 도출 우선, 사용자 수동 override */
  farmingAssetValue?: number;
  /** 영농상속 신규 입력 (Phase B) */
  farming?: FarmingInheritanceInput;
}

export interface FarmingInheritanceInput {
  /** 영농 유형 — 소득세법(개인 영농) / 법인세법(법인 영농) */
  type: "personal" | "corporate";

  // ─ 피상속인 요건 (§16②) ─
  /** 8년 이상 직접 영농 종사 (질병·수용 1년 인정) */
  decedentEightYearFarming: boolean;
  /** 거주지 30km 이내 충족 */
  decedentResidenceMet: boolean;
  /** [법인] 8년 경영 + 최대주주 50%+ 유지 */
  decedentCorporateMet?: boolean;

  // ─ 상속인 요건 (§16③) ─
  /** 18세 이상 */
  heirIsAdult: boolean;
  /** 2년 이상 직접 영농 종사 */
  heirTwoYearFarming: boolean;
  /** 거주지 충족 (자산 유형별 분기 — 농지/초지/산림지 vs 어선/어업) */
  heirResidenceMet: boolean;
  /** 피상속인 65세 미만 사망 or 천재지변·인재 사망 (2년 요건 면제) */
  decedentEarlyDeath?: boolean;
  /** [법인] 신고기한 내 임원 취임 + 2년 내 대표이사 취임 예정 */
  heirCorporateOfficer?: boolean;
  /**
   * 후계자 트랙 — 재정경제부령 영농·영어·임업후계자 자격 보유 (§16③ 본문 후단).
   * true 시 18세·2년 종사·거주 요건 별개 트랙으로 자격 인정 가능.
   */
  isDesignatedSuccessor?: boolean;

  // ─ 영농 부정 §16⑭ ─
  /** 사업소득 + 총급여 3,700만 이상 과세기간 존재 (피상속인 또는 상속인) */
  hasDisqualifyingIncome?: boolean;

  // ─ 조세포탈·회계부정 §18의3⑥ ─
  /** 형 확정 (공제 배제) */
  hasTaxFraudConviction?: boolean;
}
```

### 2-3. `InheritanceDeductionResult.farmingDeduction` 확장

기존 단순 금액만 노출 → 자격 판정 사유·미달 시 0 사유 노출.

```typescript
export interface InheritanceDeductionResult {
  // ... 기존
  farmingDeduction: number;
  /** 영농상속 공제 상세 (Phase B) */
  farmingDetail?: FarmingDeductionDetail;
}

export interface FarmingDeductionDetail {
  /** 자격 충족 여부. farming 미입력(legacy) 시 true로 처리되나 evaluated=false로 구분 */
  eligible: boolean;
  /** 요건 평가 수행 여부 — farming=undefined 시 false (legacy 호환) */
  evaluated: boolean;
  /** 미충족 사유 (eligible=false 시) */
  ineligibleReasons: string[];
  /** 엔진이 받은 farmingAssetValue (사용자 명시 또는 UI suggest 결과 후 store에 저장된 값) */
  appliedAssetValue: number;
  /** 30억 한도 적용 후 최종 공제액 = Math.min(appliedAssetValue, FARMING_MAX). eligible=false 시 0 */
  cappedDeduction: number;
}
```

**제거**: `autoDerivedAssetValue`·`userInputValue` 필드는 엔진 result에 부적합 (UI 측 suggest 결과는 엔진 모름). UI 측 `suggestFarmingAssetValue` 결과는 컴포넌트 useMemo에 보존하고 사용자가 "채우기" 클릭 시 form.farmingAssetValue로 흘러간다.
```

## 3. 자동 도출 헬퍼

### 3-1. `suggestFarmingAssetValue` (Step4 — A-6과 동일 패턴)

`lib/calc/inheritance-deduction-suggest.ts`에 추가. **기존 `getValuatedAmount`·`formatKrw` 내부 헬퍼 재사용** (single-source-engine-helper).

```typescript
export function suggestFarmingAssetValue(
  estateItems: EstateItem[],
): DeductionSuggestion {
  const eligible = estateItems.filter((i) => i.farmingCategory !== undefined);
  if (eligible.length === 0) {
    return { value: 0, reason: "영농 자산 미지정", breakdown: [], isApplicable: false };
  }
  const value = eligible.reduce(
    (sum, i) => sum + getValuatedAmount(i) - (i.mortgageAmount ?? 0),
    0,
  );
  // §16⑤ 단서 — 담보채무 차감. Math.max로 음수 차단 (정수 연산 유지)
  const clamped = Math.max(0, value);
  return {
    value: clamped,
    reason: "영농상속 자산 합 − 담보채무 (시행령 §16⑤)",
    breakdown: eligible.map(
      (i) =>
        `${FARMING_CATEGORY_LABEL[i.farmingCategory!]} ${i.name}: ${formatKrw(getValuatedAmount(i))}원${i.mortgageAmount ? ` − 저당 ${formatKrw(i.mortgageAmount)}원` : ""}`,
    ).concat([`영농자산 합계: ${formatKrw(clamped)}원 (30억 한도 적용 전)`]),
    isApplicable: true,
  };
}
```

`FARMING_CATEGORY_LABEL`은 동일 모듈 내 상수로 8 enum 한국어 매핑.

**정수 연산 정책**: `getValuatedAmount`이 정수 반환 → `mortgageAmount` (정수) 차감 → `Math.max(0, ...)` → cap `Math.min(value, 30억)`. 모든 단계 정수 유지. `Math.round`·부동소수 누적 금지.

### 3-2. 자격 판정 엔진 (`evaluateFarmingEligibility`)

```typescript
export function evaluateFarmingEligibility(
  input: FarmingInheritanceInput,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // §18의3⑥ 조세포탈·회계부정 — 우선 배제
  if (input.hasTaxFraudConviction) {
    reasons.push("§18의3⑥ — 조세포탈·회계부정 형 확정 (공제 배제)");
    return { eligible: false, reasons };
  }

  // §16⑭ 직접 종사 부정
  if (input.hasDisqualifyingIncome) {
    reasons.push("§16⑭ — 사업소득+총급여 3,700만 이상 과세기간 존재 (직접 종사 부정)");
  }

  // 피상속인 요건
  if (input.type === "personal") {
    if (!input.decedentEightYearFarming) {
      reasons.push("§16②1호가 — 피상속인 8년 직접 영농 종사 미충족");
    }
    if (!input.decedentResidenceMet) {
      reasons.push("§16②1호나 — 피상속인 거주지(30km) 미충족");
    }
  } else {
    // corporate
    if (!input.decedentCorporateMet) {
      reasons.push("§16②2호 — 피상속인 법인 8년 경영 + 최대주주 50%+ 미충족");
    }
  }

  // 상속인 요건 — 후계자 트랙은 18세·2년·거주 요건 면제
  if (input.isDesignatedSuccessor === true) {
    // §16③ 본문 후단 — 영농·영어·임업후계자 (재정경제부령) 별개 트랙
    return { eligible: reasons.length === 0, reasons };
  }

  if (!input.heirIsAdult) {
    reasons.push("§16③ — 상속인 18세 이상 미충족");
  }
  const skip2Year = input.decedentEarlyDeath === true;
  if (!skip2Year && !input.heirTwoYearFarming) {
    reasons.push(
      input.type === "personal"
        ? "§16③1호가 — 상속인 2년 직접 영농 종사 미충족 (피상속인 65세 미만 사망 시 면제)"
        : "§16③2호가 — 상속인 2년 법인 종사 미충족",
    );
  }
  if (input.type === "personal" && !input.heirResidenceMet) {
    reasons.push("§16③1호나 — 상속인 거주지 미충족");
  }
  if (input.type === "corporate" && !input.heirCorporateOfficer) {
    reasons.push("§16③2호나 — 상속인 신고기한 내 임원 + 2년 내 대표이사 미충족");
  }

  return { eligible: reasons.length === 0, reasons };
}
```

### 3-3. `calcFarmingDeduction` 갱신

```typescript
export function calcFarmingDeduction(
  farmingAssetValue: number,
  farming?: FarmingInheritanceInput,
): { deduction: number; breakdown: CalculationStep[]; detail: FarmingDeductionDetail } {
  // 요건 판정 — farming 미입력 시 legacy 호환 (evaluated=false, eligible=true 가정)
  const evalResult = farming
    ? evaluateFarmingEligibility(farming)
    : { eligible: true, reasons: [] };
  const evaluated = farming !== undefined;

  if (!evalResult.eligible) {
    return {
      deduction: 0,
      breakdown: [...],
      detail: {
        eligible: false,
        evaluated,
        ineligibleReasons: evalResult.reasons,
        appliedAssetValue: farmingAssetValue,  // 사용자 입력 보존 — UI에서 "자격 미충족이지만 입력값 N억" 안내
        cappedDeduction: 0,
      },
    };
  }

  const capped = Math.min(farmingAssetValue, FARMING_MAX);
  return {
    deduction: capped,
    breakdown: [...],
    detail: {
      eligible: true,
      evaluated,
      ineligibleReasons: [],
      appliedAssetValue: farmingAssetValue,
      cappedDeduction: capped,
    },
  };
}

const FARMING_MAX = 3_000_000_000;  // §18의3① 30억 한도
```

**legacy 호환 경고**: farming=undefined인 경우 `evaluated=false`로 표시되어 UI 결과 카드에서 "요건 미평가 (legacy 모드 — 사용자 직접 책임)" 안내 카드 노출. 신규 사용자는 farming 입력 권장.

## 4. UI 통합

### 4-1. EstateItem 카드 — 영농 분류 칩 (R3 패턴 차용)

`DeemedCategorySection.tsx`에 `farmingCategory` 라디오 추가 또는 별도 `FarmingCategorySection.tsx` 신규.

권장: **별도 컴포넌트** (`FarmingCategorySection.tsx`) — deemed와 직교 개념이므로 분리.

```
┌─ 영농상속 자산 분류 (§16⑤) — emerald 카드 ─────────────┐
│ ◉ 비영농  ○ 농지  ○ 초지  ○ 산림지  ○ 어선  ○ 어업권   │
│ ○ 농업용 건축물  ○ 염전  ○ 법인주식 (법인 영농)         │
│ ⓘ 영농상속공제 §18의3 — 30억 한도                       │
└──────────────────────────────────────────────────────────┘
```

선택 시 hint 카드 표시:
- 농지: "농지법 §2①가 농지"
- 산림지: "보전산지 + 산림경영계획 인가 + 5년 이상 조림"
- 어선: "어선법 §2①"
- 등등

### 4-2. Step4 — 영농 요건 입력 ToggleCard 그룹

기존 `farmingAssetValue` 입력 위에:

```
┌─ 영농상속공제 §18의3 요건 (선택) ─────────────────────┐
│ 영농 유형: ◉ 개인 영농 (소득세법)  ○ 법인 영농          │
│                                                          │
│ [피상속인 요건]                                          │
│ ☐ 8년 이상 직접 영농 종사                                │
│ ☐ 거주지 충족 (자산 유형별 동적 안내)                    │
│   ⓘ 농지·초지·산림지: 농지등 소재 시·군·구·연접·30km     │
│   ⓘ 어선·어업권: 선적지·어장 연안 시·군·구·연접·30km      │
│   ⓘ (estateItems의 farmingCategory에 따라 안내 분기)     │
│                                                          │
│ [상속인 요건]                                            │
│ ☐ 영농·영어·임업후계자 (재정경제부령) — 별도 트랙        │
│   ⓘ 체크 시 아래 18세·2년·거주 요건 면제                 │
│ ☐ 18세 이상                                              │
│ ☐ 2년 이상 직접 영농 종사                                │
│ ☐ 거주지 충족 (자산 유형별 분기 — 농지/초지/산림지 또는 │
│   어선/어업 선적지·연안 30km)                            │
│ ☐ 피상속인 65세 미만 사망 (2년 요건 면제)                │
│                                                          │
│ [영농 부정 §16⑭]                                         │
│ ☐ 사업소득+총급여 3,700만 이상 과세기간 존재             │
│                                                          │
│ [§18의3⑥]                                                │
│ ☐ 조세포탈·회계부정 형 확정 (공제 배제)                  │
└──────────────────────────────────────────────────────────┘

[AutoSuggestBadge — 영농상속 자산 합 (담보 차감)]
CurrencyInput "영농상속재산가액 §23" (수동 override 가능)
```

### 4-3. 결과 화면

`InheritanceTaxResultView` §23 행 옆 `farmingDetail` 노출 (4-way 분기):

| 분기 | 표시 |
|---|---|
| `evaluated=true` + `eligible=true` + cappedDeduction > 0 | 자산 합산 + 30억 한도 표시 (예: "자산 25억 ≤ 한도 30억 → 25억 공제") |
| `evaluated=true` + `eligible=false` + appliedAssetValue > 0 | **amber 경고**: "입력 자산 5억 — 자격 미충족으로 공제 0원" + ineligibleReasons 목록 |
| `evaluated=true` + `eligible=false` + appliedAssetValue = 0 | "영농 자산 미입력 또는 자격 미충족" |
| `evaluated=false` (legacy) | **violet 안내**: "요건 미평가 (legacy 모드 — 사용자 직접 책임). Step4에서 영농 요건 입력을 권장합니다" |

## 5. 14지점 동기화

> ①~⑭ 컨벤션은 CLAUDE.md 양도세 14지점 차용. ⑪(acquisitionDate fallback)은 양도세 자산 컨벤션이라 상속세에서 해당 없음.

| 지점 | 변경 |
|---|---|
| ① 폼 타입 | `farmingCategory?` (EstateItem) + `FarmingInheritanceInput`·`FarmingDeductionDetail` 신규 + `FormState.farming?` |
| ② initial | `INITIAL_FORM.farming = undefined` (3-state) |
| ③ normalize | sessionStorage 마이그 — farming undefined 유지 |
| ④ API 변환 | `InheritanceTaxForm.buildInput.deductionInput`에 `farming` 명시 매핑 추가 (현재 명시 매핑 패턴 — `[[feedback_explicit_prop_mapping_strip]]`) |
| ⑤ UI 위젯 | FarmingCategorySection + Step4 ToggleCard 그룹 + AutoSuggestBadge |
| ⑥ 사이드바 | 영농상속 자산 합 표시 (옵션) |
| ⑦ 결과 카드 | `farmingDetail.ineligibleReasons` amber 노출 + 자산 카운트 + legacy 모드 "요건 미평가" 안내 |
| ⑧ validation | farming 입력 시 type 필수, 그 외 모두 optional boolean. trustType과 동일한 cross-field 강제 안 함(UI 안내로 처리) |
| ⑨ Zod 메인 | `app/api/calc/inheritance/route.ts` `farmingInputSchema` 신규 + `inheritanceInputSchema.deductionInput.farming` optional |
| ⑩ Zod 컴패니언 | 본 PR 해당 없음 (영농은 별도 컴패니언 객체 없이 deductionInput 내부 nested 필드) |
| ⑪ acquisitionDate fallback | 해당 없음 (양도세 자산 컨벤션) |
| ⑫ Zod 입력 객체 | `estateItemSchema` baseItemSchema에 `farmingCategory: z.enum([...]).optional()` 추가 — **누락 시 침묵 strip** |
| ⑬ callInheritanceTaxAPI body | `lib/calc/inheritance-api.ts` body에 deductionInput 통째 spread 보장 확인 (명시 매핑 시 farming 누락 위험) |
| ⑭ Route handler 매핑 | route.ts 엔진 호출 input에 farming spread 보장 + Date 변환 해당 없음 |

## 6. 케이스 매트릭스 + Anchor

### 6-1. `__tests__/tax-engine/inheritance/farming-deduction.test.ts` 신규

| Anchor | 시나리오 | 기대 |
|---|---|---|
| FD-1 | farming 미입력 + farmingAssetValue=10억 (legacy) | deduction=10억 |
| FD-2 | farming 입력 + 모든 요건 충족 + 자산 20억 | deduction=20억 |
| FD-3 | 자산 50억 → 30억 한도 cap | deduction=30억 |
| FD-4 | 피상속인 8년 미충족 → 0 + ineligibleReasons | "§16②1호가" 포함 |
| FD-5 | 거주지 미충족 → 0 | "§16②1호나" 포함 |
| FD-6 | 상속인 17세 → 0 | "§16③ 18세 이상" 포함 |
| FD-7 | 상속인 2년 미충족 + 피상속인 65세 미만 사망 → 충족 처리 | deduction=자산값 |
| FD-8 | hasDisqualifyingIncome=true → 0 | "§16⑭" 포함 |
| FD-9 | hasTaxFraudConviction=true → 0 + 다른 사유 안 평가 (early return) | reasons.length=1 |
| FD-10 | 법인 영농 + type=corporate + decedentCorporateMet=true + heirCorporateOfficer=true + heirIsAdult=true + 자산 5억 | deduction=5억 |
| FD-11 | 법인 영농 + heirCorporateOfficer=false → 0 | "§16③2호나" |
| FD-12 | 후계자 isDesignatedSuccessor=true + 18세 미충족 + 2년 미충족 + 거주 미충족 → 충족 처리 (피상속인 요건 모두 충족) | deduction=자산값 |
| FD-13 | 후계자=true + 피상속인 8년 미충족 → 0 (피상속인 요건은 후계자 트랙과 별개) | "§16②1호가" |
| FD-14 | 후계자=true + hasDisqualifyingIncome=true → 0 (§16⑭은 후계자 트랙에도 적용) | "§16⑭" |
| FD-15 | farming=undefined + farmingAssetValue=10억 (legacy) | deduction=10억 + detail.evaluated=false + UI "요건 미평가" 안내 |
| FD-16 | farming 입력 + eligible=false + farmingAssetValue=5억 | deduction=0 + detail.appliedAssetValue=5억 (사용자 입력 보존) + ineligibleReasons.length≥1 |

### 6-2. `__tests__/lib/calc/farming-suggest.test.ts` 신규

| Anchor | 시나리오 |
|---|---|
| FS-1 | 농지 1건(5억) + 초지 1건(2억) → 7억 |
| FS-2 | 농지 + 저당 1억 → 자산 − 담보 |
| FS-3 | farmingCategory 미설정 자산 → 제외 |
| FS-4 | 영농 자산 0건 → isApplicable=false |
| FS-5 | 농지 5억 + 사용자 입력 8억 → 디자인 RD 검증과 매핑 (UI 측 안내) |
| FS-6 | 농지 35억 단일 → suggestion=35억 (한도 적용 전, UI에서 30억 cap 안내) |

**Pre-Do anchor** (`[[pre-do-anchor-verification]]`):
- FD-7 (65세 미만 사망 예외) — early return 분기 + reasons 누락 검증
- FD-9 (조세포탈 우선 배제) — 다른 사유 평가 차단 검증
- FS-2 (담보채무 차감 §16⑤ 단서) — 자산-수준 mortgage 처리

## 7. Phase 순서

| Phase | 범위 | 의존 | 우선순위 |
|---|---|---|---|
| F-0 | ✅ KoreanLaw MCP 검증 완료 (2026-05-21) | — | 완료 |
| F-1 | 타입 추가 (farmingCategory·FarmingInheritanceInput·FarmingDeductionDetail) + Zod | — | 높음 |
| F-2 | `evaluateFarmingEligibility` + `calcFarmingDeduction` 갱신 + farming-deduction.test.ts | F-1 | 높음 |
| F-3 | `suggestFarmingAssetValue` + farming-suggest.test.ts | F-1 | 높음 |
| F-4 | FarmingCategorySection UI (PropertyValuationForm·StockValuationForm 통합) | F-1 | 높음 |
| F-5 | Step4 영농 요건 ToggleCard 그룹 + AutoSuggestBadge + form.farming 통합 | F-2·F-3·F-4 | 높음 |
| F-6 | InheritanceTaxResultView §23 행 detail 노출 | F-2 | 중간 |
| F-7 | 사후관리 (5년 추징 + 이자상당액) 시뮬레이터 — **별도 PR**. §16⑦ 추징율 100% + §16⑧ 이자상당액 + §18의3⑦ 6개월 신고 + §16⑥ 정당사유 7종 | F-2 | 낮음 |
| F-8 | 법인 영농 §15⑤2호 사업무관자산 자동 차감 — **별도 PR** | F-1 | 낮음 |

## 8. 위험 요소

| 위험 | 대응 |
|---|---|
| `farmingAssetValue` legacy 입력값과 자동 도출값 동시 존재 시 어느 우선 | suggestFarmingAssetValue 결과를 AutoSuggestBadge로만 노출. 사용자 명시 입력 우선 (mirror-pattern) |
| 자격 미충족인데 사용자가 farmingAssetValue 수동 입력 → 결과 0 표시 시 혼란 | 결과 카드에 ineligibleReasons amber 카드 강조 + 자동 채움 비활성 |
| §16⑤ 농업용 건축물 부속토지 건폐율 환산 면적 한정 — 단순 합산 부정확 | UI 안내 카드 명시 + 면적 검증은 사용자 책임 (본 계획 자동화 범위 외) |
| §16② 단서 — 영농상속 후 최대주주등(상속받은 상속인 제외) 사망으로 상속개시 시 적용 배제 (가업상속 §15③ 후단과 동일 패턴) — 본 PR 미구현 | corporate 모드 안내 카드에 명시 + 후속 PR |
| **§16⑤2호 사업무관자산 5종 자동 차감 미구현** — 법인 영농 주식 평가가액이 단순 시가일 때 과대 공제 위험 | UI 안내 카드 "사업무관자산(비사업용토지·임대부동산·과다현금·영업무관 주식 등) 차감 후 가액 입력" + 사용자 책임. 자동화는 F-8 후속 |
| 후계자 트랙 (재정경제부령 영농·영어·임업후계자) — 자격 자동 검증 불가 | 사용자 명시 체크박스만 도입. 재정경제부령 정의 자체는 후속 추적 |
| 사후관리 추징(5년) — 본 PR 미구현 | F-7 별도 PR 명시 + 결과 카드에 안내만 |
| EstateItem.farmingCategory 신규 필드 — Zod ⑫ 침묵 strip | property-valuation-input.ts estateItemSchema 갱신 grep 필수 |
| 사업소득 3,700만 기준액 시행령 개정 추적 | `FARMING_DISQUALIFYING_INCOME = 37_000_000` 상수화 + legal-codes 인용 |
| 거주지 "30km" 자동 검증 불가 — 사용자 체크박스만 | UI 안내 카드에 "본인 확인 필수" 명시 |

## 9. PDCA 다음 단계

1. ~~A-0 KoreanLaw MCP 검증~~ ✅
2. **Design**: `docs/02-design/features/inheritance-farming-deduction-expansion.ui.design.md`
   - 케이스 매트릭스 (FD-1~11 + FS-1~4)
   - Pre-Do anchor 3건 우선 실행
   - 14지점 동기화 표
3. **Do**: PR 4건 분할
   - PR-1: 타입(F-1) + Zod(⑨⑫) + 엔진 갱신(F-2) + farming anchor 16건 (FD-1~16)
   - PR-2: suggestFarmingAssetValue(F-3) + anchor 6건 (FS-1~6)
   - PR-3: FarmingCategorySection UI(F-4) + EstateItem 카드 통합
   - PR-4: Step4 요건 입력(F-5) + 결과 카드(F-6)
4. **Check**: `ui-engine-sync-checker` + 회귀 + 브라우저 수동 (영농 자산 입력 → 요건 체크 → Step4 자동 채움 → 결과 정합)
5. **Act**: 후속 사후관리(F-7) 별도 sprint

## 10. 범위 외 (후속 PR — F-7 + 추가)

- **5년 사후관리 추징** (§18의3④ + §16⑦⑧) — 별도 시뮬레이터
- **이자상당액 계산** — 국세기본법 §43의3② 이자율 추적
- **정당한 사유 §16⑥** 7가지 분기 — 추징 면제 판정
- **조세포탈·회계부정 §18의3⑥** 사후 추징 — 시점별 분기
- **법인 영농 §16⑤ 2호** 주식 평가 — **F-8 별도 PR**:
  - §15⑤2호 사업무관자산 5종 (가. 비사업용토지 / 나. 임대부동산 + 임직원용 5년 무상임대 예외 / 다. 임직원 외 대여금 + 학자금·전세금 예외 / 라. 과다보유현금 200% 초과 / 마. 영업무관 주식·채권·금융상품) 자동 차감
  - 산식: 주식가액 × (총자산 − 사업무관자산) / 총자산
  - UI: 사업무관자산 5종 별도 입력 폼 + 자동 비율 계산
- **§16②2호 단서** — 영농상속 후 최대주주 사망 시 적용 배제
- **거주지 검증 자동화** — Vworld 좌표 + 직선거리 30km 계산 (현재 사용자 체크박스)
- **상속인 다수** — 영농 종사 상속인이 일부일 때 자산-수준 협의분할에서 영농 분만 공제 (heirAllocations 연계)
