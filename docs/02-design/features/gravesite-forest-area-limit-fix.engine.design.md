# 금양임야·묘토 비과세 면적/금액 한도 — 엔진 설계

> 계획서: [`docs/00-pm/gravesite-forest-area-limit-fix.plan.md`](../../00-pm/gravesite-forest-area-limit-fix.plan.md)
> UI 설계: [`gravesite-forest-area-limit-fix.ui.design.md`](./gravesite-forest-area-limit-fix.ui.design.md)
> worktree: `worktree-gravesite-forest-area-limit-fix` · 작성 2026-06-05

## Context

상속세 비과세(상증법 §12 3호 / 상증령 §8③)의 금양임야·묘토 처리에 3개 결함:
1. **면적 한도 불일치**: 코드 `1,983㎡`(금양임야)·`3,966㎡`(묘토) ↔ 시행령 `9,900㎡`·`1,980㎡` (대소관계까지 반대).
2. **금액 한도 미반영**: §8③ 단서 — 금양임야+묘토 합산 2억원, 족보·제구 1천만원 한도 로직 전무.
3. **면적 한도 미작동(잠복)**: UI에 면적 입력 위젯이 없어 `claimedAreaM2`가 항상 미입력 → 엔진 `claimedM2=0` → `0 > limitM2` 항상 false → 면적 한도가 한 번도 작동 안 함(전액 비과세).

**numeric 영향 분리** (memory `feedback_numeric_impact_verify_before_bug_claim`):
- 면적 상수(B-3)만 정정 → numeric 영향 0 (UI 부재). 면적 한도 정상화는 **엔진 상수 + 필드 fallback + UI 위젯 3종 동반** 필요.
- **금액 한도(B-4·B-5)는 면적과 무관하게 즉시 numeric 영향** — 금양임야 3억 입력 시 현재 3억 전액 비과세 → 정정 후 2억 비과세·1억 과세.

`evaluateExemptions`는 `inheritance-tax.ts:138`·`gift-tax.ts:94`에서 실제 호출됨(죽은 코드 아님). 금양임야/묘토/족보는 전부 `category:"inheritance"` → 증여 입력엔 해당 룰이 없어 엔진은 공유하되 증여 측은 no-op.

---

## ★ 케이스 인벤토리 (필수 — 행≥1, 비면 Do 진입 금지)

| # | 시나리오 | 법령 근거 | anchor 값 | 테스트 파일 | 상태 |
|---|---------|----------|----------|-----------|------|
| N5 | 금양임야 면적 한도 상수 | §8③1호 | `limitAreaM2 === 9900` | `exemption-rules.test.ts` | ☐ |
| N6 | 묘토 면적 한도 상수 | §8③2호 | `limitAreaM2 === 1980` | 〃 | ☐ |
| GF-01 | 금양 면적·금액 한도 이내 | §8③1호 | 5,000㎡/1억 → 비과세 1억·과세 0 | 〃 | ☐ |
| GF-02 | 금양 면적 초과 비율안분 | §8③1호 | 15,000㎡/3억 → `floor(3억×9900/15000)=198,000,000`·과세 102,000,000 | 〃 | ☐ |
| GF-03 | 금양 금액 2억 초과(면적 이내) | §8③ 단서 | 9,000㎡/3억 → 비과세 200,000,000·과세 100,000,000 | 〃 | ☐ |
| GL-01 | 묘토 한도 이내 | §8③2호 | 1,000㎡/5,000만 → 비과세 5,000만·과세 0 | 〃 | ☐ |
| GL-02 | 묘토 면적 초과 | §8③2호 | 3,000㎡/2,400만 → `floor(2,400만×1980/3000)=15,840,000` | 〃 | ☐ |
| GL-03 | 묘토 금액 2억 초과(면적 이내) | §8③ 단서 | 1,500㎡/2.5억 → 비과세 200,000,000·과세 50,000,000 | 〃 | ☐ |
| BOTH-01 | 둘 다 한도 이내, 합산 ≤ 2억 | §8③ | 8,000만+1억 → 1.8억 (클램프 미작동) | 〃 | ☐ |
| BOTH-02 | 면적 이내, 합산 > 2억(안분) | §8③ 단서 | 1.5억+1억 → 금양 `floor(2억×1.5/2.5)=120,000,000`·묘토 잔액 `80,000,000` | 〃 | ☐ |
| BOTH-03 | 금양 면적 초과 → 합산 초과(2단계) | §8③1호+단서 | 15,000/3억 + 1,500/1억 → 금양 `132,885,906`·묘토 `67,114,094` | 〃 | ☐ |
| RITUAL-01 | 족보 1천만 이하 | §8③3호 | 500만 → 비과세 500만 | 〃 | ☐ |
| RITUAL-02 | 족보 1천만 초과 | §8③3호 단서 | 1,500만 → 비과세 10,000,000·과세 5,000,000 | 〃 | ☐ |
| BND-2억 | 합산 정확히 2억(경계) | §8③ 단서 | 1억+1억 → 클램프 미작동, total 200,000,000 | 〃 | ☐ |
| ALL-01 | 세 항목 복합 | §8③ 단서 | 1.5억+1억+1,500만 → 금양·묘토 2억 안분 + 족보 1천만, total 210,000,000 | 〃 | ☐ |
| DEPREC | `areaM2`만 채운 하위호환 | — | areaM2=15000 → GF-02와 동일(과세 102,000,000) | 〃 | ☐ |

**규칙**: 행=anchor 1개 이상. BOTH-03 `floor(2억×198/298)=132,885,906` 수기검증 완료.

---

## 법령 근거 (KoreanLaw MCP 검증, 상증령 제8조 MST 283637, 시행 2026-02-27)

```
상증령 §8③ (법 §12 3호 위임): 제사를 주재하는 상속인을 기준으로 다음 각 호의 재산.
  다만, 제1호 및 제2호의 재산가액의 합계액이 2억원을 초과하는 경우에는 2억원을 한도로 하고,
       제3호의 재산가액의 합계액이 1천만원을 초과하는 경우에는 1천만원을 한도로 한다.
  1. 분묘에 속한 9,900㎡ 이내의 금양임야
  2. 분묘에 속한 1,980㎡ 이내의 묘토인 농지
  3. 족보와 제구
```

**legal-codes 상수 추가** (`lib/tax-engine/legal-codes/inheritance-gift.ts`, 매직넘버 제거):
```ts
GRAVE_FOREST_AREA  = "상증령 §8③1호";   // 금양임야 9,900㎡
GRAVE_LAND_AREA    = "상증령 §8③2호";   // 묘토 농지 1,980㎡
GRAVE_RITUAL       = "상증령 §8③3호";   // 족보·제구
GRAVE_GROUP_LIMIT  = "상증령 §8③ 단서"; // 2억/1천만 한도
// 수치 상수
GRAVE_FOREST_LIMIT_M2 = 9900;
GRAVE_LAND_LIMIT_M2   = 1980;
GRAVE_GROUP_AMOUNT_LIMIT = 200_000_000; // 금양임야+묘토 합산
RITUAL_AMOUNT_LIMIT      = 10_000_000;  // 족보·제구
```

---

## 엔진 input 타입

### ExemptionRule (`exemption-rules.ts:48~67`) — 데이터 정정만, 구조 불변
```ts
// inh_forest_burial: limitAreaM2 1983 → 9900, description/riskNote/exclusions "600평"→"9,900㎡(3,000평)"
// inh_grave_land:    limitAreaM2 3966 → 1980, "1,200평"→"1,980㎡(600평)", "토지"→"농지"
// inh_ritual_items:  limitType "social_norm" → "fixed", limitAmount: 10_000_000 추가
```

### ExemptionCheckedItem (`types/inheritance-exemption.types.ts:14~33`) — **변경 없음**
```ts
claimedAreaM2?: number;   // 권장 (이미 존재) — UI가 이 필드로 send
areaM2?: number;          // @deprecated — 직접 엔진 호출(테스트) 전용 하위호환
```
> Zod `exemptionCheckedItemSchema`(`property-valuation-input.ts:437~444`)에 `claimedAreaM2` 존재·`areaM2` 없음 → API 경로는 `claimedAreaM2` 단일.

## 엔진 result 타입

### ExemptionItemResult (`exemption-evaluator.ts:28~38`) — **변경 없음** (이미 export)
```ts
{ ruleId, ruleName, claimedAmount, exemptAmount, taxableOverflow, breakdown, warnings }
```

### InheritanceTaxResult (`types/inheritance-gift.types.ts:1062`) — 필드 1개 추가 (D-7 정정)
```ts
// ★ D-7: ExemptionSummaryCard props는 result(ExemptionResult)+itemResults 둘 다 요구(:62~64)
//   → 배열만이 아니라 evaluateExemptions 반환 전체(ExemptionResult & itemResults)를 통째 echo
exemptionDetail?: ExemptionResult & { itemResults: ExemptionItemResult[] };
```
> `evaluateExemptions`는 이미 `ExemptionResult & { itemResults }` 반환(`evaluator.ts:192`). `inheritance-tax.ts:137~138`이 `totalExemptAmount`만 취하고 나머지를 버리는 중 → 호출부에서 **반환 객체 전체를 `exemptionDetail`에 echo**. 엔진 함수 변경 불필요.
> ⚠️ **D-7**: 배열(`exemptionItemResults`)만 추가하면 `ExemptionSummaryCard`가 요구하는 `result: ExemptionResult`(헤더 총액·`appliedLaws`)를 못 채워 카드 렌더 불가 → 통째 echo 필수.
> ⚠️ **D-8 순환 의존 회피**: `ExemptionItemResult`는 현재 `exemption-evaluator.ts:28` 정의이고 evaluator가 `types/inheritance-gift.types.ts`를 import(`:20`). `InheritanceTaxResult`(types)가 `ExemptionItemResult`를 참조하면 **types↔evaluator 순환**. → `ExemptionItemResult`를 `types/inheritance-exemption.types.ts`(`ExemptionResult:53` 옆)로 **이동** + `exemption-evaluator.ts`에서 `export type { ExemptionItemResult }` re-export(import 사이트 `ExemptionSummaryCard.tsx:9`·`from "./exemption-evaluator"` 호환). `types/inheritance-gift.types.ts`는 이미 `inheritance-exemption.types.ts`를 import(`:440`)하므로 순환 없음.

---

## 계산 알고리즘 (단계별)

### evaluateSingleExemption — 항목별 (R1-3 분기 위치 필수)
분기 순서를 **반드시** 다음으로 (fixed 일반 분기 부재 → fallthrough 방지):
```
1. if (rule.id === "inh_forest_burial")  → 금양임야 면적 안분
     limitM2 = rule.limitAreaM2 ?? 9900
     claimedM2 = item.claimedAreaM2 ?? item.areaM2 ?? 0     // R1-5 fallback
     claimedM2 > limitM2 ? exempt = floor(claimedAmount × limitM2/claimedM2) : 전액
2. if (rule.id === "inh_grave_land")      → 묘토 면적 안분 (limitM2 ?? 1980)
3. if (rule.id === "inh_ritual_items")    → ★ 족보·제구 1천만 (social_norm 분기보다 앞!)
     limit = rule.limitAmount ?? 10_000_000
     exempt = min(claimedAmount, limit); overflow = claimedAmount − exempt
4. if (rule.id === "inh_public_interest") → 기존 공익법인
5. if (rule.id === "gift_disabled_trust") → 기존 장애인신탁
6. if (limitType === "social_norm" || "unlimited") → 전액  // :141 (3번이 이 앞)
7. 기본 전액                                              // :152 (ritual이 6·7로 새면 한도 무시 — 금지)
```

### evaluateExemptions — cross-item 2억 합산 클램프 (B-4)
```
itemResults = checkedItems.map(evaluateSingleExemption)     // 면적 안분 완료
applyGraveGroupCap(itemResults):                            // ↓ 합산 한도
  forest = itemResults.find(inh_forest_burial)?.exemptAmount ?? 0
  grave  = itemResults.find(inh_grave_land)?.exemptAmount ?? 0
  groupSum = forest + grave
  if groupSum <= 200_000_000: return                        // 한도 이내
  cappedForest = forestIdx>=0 ? floor(2억 × forest/groupSum) : 0
  cappedGrave  = 2억 − cappedForest                          // ★ 잔액 흡수 (floor 잔액)
  // 각 itemResult.exemptAmount=capped, taxableOverflow += (이전 − capped), warning push
totalExemptAmount = Σ itemResults.exemptAmount
clampedExemptAmount = min(totalExemptAmount, grossEstateValue)  // 기존 방어 유지
```
- 적용 순서: **항목별 면적 안분(항목 내) → 합산 금액 클램프(cross-item)** 2단계 고정.
- 잔액 흡수: `cappedGrave = 2억 − cappedForest`로 합계 정확히 2억 (memory `feedback_floor_residual_absorption`).
- 단독 적용: 금양임야만(묘토=0)이라도 단독 2억 초과 시 클램프 (forestIdx>=0·graveIdx=-1 → cappedForest=floor(2억×forest/forest)=2억). §8③ 단서 "1호+2호 합계"=1호만 해석 → ⚠️ 조세심판원례 추가 확인(계획서 §12.1 리스크 참조).
- **warning 사유 구분 (D-6)**: 면적 한도 초과 시 "면적 N㎡ 초과" / 2억 합산 클램프 시 "금양임야·묘토 합산 2억 초과" 등 **사유별 문구**를 `itemResult.warnings`에 구분 push → `ExemptionSummaryCard.tsx:49~53`이 사유별 표시(taxableOverflow는 단일 합산이므로 사유 구분은 warnings가 담당).

---

## Silent fallback / 자동 안분 후보 식별

- **면적 미입력**: 금양임야·묘토 선택 + `claimedAreaM2` 미입력 → 자동 0 채움 금지. validation 차단(UI 설계 §8). memory `feedback_no_silent_apportion_fallback`.
- **ritual fixed fallthrough (R1-3)**: ritual 전용 분기를 social_norm 분기 앞에 두지 않으면 1천만 한도 silent 미적용 — 분기 위치가 곧 numeric 정확성.
- **2억 클램프**: 법령 명시 단서이므로 자동 안분 허용(예외 아님 — 조문 근거).

---

## 테스트 약속

- 케이스 인벤토리 16행 전부 anchor (`exemption-rules.test.ts`). 원단위 `toBe()` (memory `feedback_pdf_example_test_anchoring`).
- 기존 N5/N6 1983/3966 anchor는 **법령 정합값 9900/1980으로 재산정** (memory `feedback_anchor_correction_legal_priority` — 잘못된 anchor 유지 금지).
- **Pre-Do anchor (memory `feedback_pre_anchor_verification`)**: GF-03(금액 2억 클램프) 우선 작성 → 현행 코드 RED 확보 → 디자인 환류. "현행 일치 예상" 가정 금지.
- 회귀: `inh_ritual_items` social_norm→fixed 변경이 다른 social_norm 항목(혼수·축의금)에 영향 없음 anchor.
- **warning 사유 anchor (D-10)**: GF-02는 `itemResult.warnings`에 "면적" 문구, BOTH-02는 "합산"·"2억" 문구 포함(`toContain`) — `taxableOverflow` 단일값이 면적/금액 사유로 구분되는지 회귀 방지.

---

## UI 통합 위임

- UI 명세 → [`gravesite-forest-area-limit-fix.ui.design.md`](./gravesite-forest-area-limit-fix.ui.design.md).
- 엔진 시니어는 input(ExemptionRule 정정·claimedAreaM2 fallback)·result(`exemptionItemResults`) 타입만 정의. 면적 입력 위젯·안내 카드·결과 카드·validation은 UI 시니어 책임.
