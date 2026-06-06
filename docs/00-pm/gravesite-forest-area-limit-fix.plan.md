# 금양임야·묘토 비과세 면적/금액 한도 버그 수정 계획

> 작성일: 2026-06-05 · worktree: `worktree-gravesite-forest-area-limit-fix` (base `master` 2e7198f)
> 세목: 상속세·증여세 — 비과세(상증법 §12 3호 / 상증령 §8③)
> 산출물 단계: **Plan** (구현 아님). 엔진 시니어 + UI 시니어 병렬 Plan 회수 후 통합.

---

## 1. 배경 — 사용자 지적 버그 2건

1. **금양임야·묘토 면적 한도가 시행령과 불일치 (방향까지 반대)**
   - 코드: 금양임야 `1,983㎡`(600평) · 묘토 `3,966㎡`(1,200평)
   - 시행령 §8③: 금양임야 `9,900㎡` · 묘토(농지) `1,980㎡`
   - 코드는 금양임야 < 묘토 인데, 실제는 금양임야(9,900) > 묘토(1,980) — **대소관계가 반대**
2. **금액 한도 미반영**
   - §8③ 단서: 금양임야 + 묘토 **합산 2억원 한도**, 족보·제구 **1천만원 한도**
   - 현재 엔진에 금액 한도 로직 전무

---

## 2. 법령 근거 — 상증령 §8③ (KoreanLaw MCP 검증 완료)

> 출처: 상속세 및 증여세법 시행령 제8조(비과세되는 상속재산) — MST 283637, 시행 2026-02-27. KoreanLaw `get_law_text`로 조문 전문 직접 확인. **추정 아님.**

상증령 §8③ (법 §12 3호 "대통령령으로 정하는 범위의 재산" 위임):

> 제사를 주재하는 상속인을 기준으로 다음 각 호에 해당하는 재산을 말한다. **다만, 제1호 및 제2호의 재산가액의 합계액이 2억원을 초과하는 경우에는 2억원을 한도로 하고, 제3호의 재산가액의 합계액이 1천만원을 초과하는 경우에는 1천만원을 한도로 한다.**
> 1. 분묘에 속한 **9,900㎡ 이내의 금양임야**
> 2. 분묘에 속한 **1,980㎡ 이내의 묘토인 농지**
> 3. 족보와 제구

**확정 사실:**
| 항목 | 면적 한도 | 금액 한도 | 비고 |
|---|---|---|---|
| 금양임야 (1호) | 9,900㎡ | (1호+2호 합산) 2억원 | — |
| 묘토 (2호) | 1,980㎡ | (1호+2호 합산) 2억원 | "묘토인 **농지**" |
| 족보·제구 (3호) | 없음 | 1천만원 | — |

---

## 3. 실측 버그 목록 (file:line — 모두 worktree 코드 직접 확인)

| # | 종류 | 위치 | 현행 | 정정 |
|---|---|---|---|---|
| B-1 | UI 버그 | `ExemptionChecklist.tsx:129~133` | `limitType==="area"` 시 "(면적 한도 N㎡)" **라벨만** 표시, 면적 입력 위젯 없음 | `DecimalInput` 면적 입력 추가 |
| B-2 | 엔진 버그 | `exemption-evaluator.ts:62,79` | deprecated `item.areaM2` 참조 | `item.claimedAreaM2 ?? item.areaM2 ?? 0` |
| B-3a | 법령 불일치 | `exemption-rules.ts:101` | 금양임야 `limitAreaM2: 1983` | `9900` |
| B-3b | 법령 불일치 | `exemption-rules.ts:122` | 묘토 `limitAreaM2: 3966` | `1980` |
| B-3c | 충실도 | `exemption-rules.ts:99,103,112,120,124,130~132` / `evaluator.ts:67,71,84` | "600평·1,200평" 문구, 묘토 "토지" | "9,900㎡·1,980㎡", 묘토 "농지" |
| B-4 | 금액 한도 누락 | `exemption-evaluator.ts:59~90` | 금양임야·묘토 면적 한도만, 금액 한도(2억) 로직 전무 | cross-item 2억 합산 클램프 |
| B-5 | 금액 한도 누락 | `exemption-rules.ts:142` `inh_ritual_items` `limitType:"social_norm"` | 족보·제구 전액 비과세 | `fixed` + `limitAmount:10_000_000` (1천만 한도) |
| B-6 | 결과화면 누락 | `InheritanceTaxResultView.tsx:293` | `exemptAmount` 합계만 표시, 항목별 `taxableOverflow` 미표시. `ExemptionSummaryCard`는 정의만 있고 import 0건 | result에 `itemResults` 노출 + SummaryCard 연결 |

---

## 4. ★ numeric 영향 분석 (memory `feedback_numeric_impact_verify_before_bug_claim` 적용)

> "numeric 영향 있는 버그"라는 주장을 입력 경로 실증으로 검증. **충실도 정정과 numeric 결과를 분리.**

### 4.1 호출 경로 (실증 완료)
- `evaluateExemptions(input.exemptions, grossValue)`는 `inheritance-tax.ts:138`·`gift-tax.ts:94`에서 **실제 호출됨** (죽은 코드 아님).
- UI `ExemptionChecklist`는 `getExemptionRulesByCategory("inheritance")` 전체 렌더 → 금양임야·묘토 항목도 화면에 노출됨.

### 4.2 면적 한도 — 현재 numeric 영향 **0** (UI 부재로 미작동)
- `ExemptionChecklist`에 **면적 입력 위젯이 없음** → `ExemptionCheckedItem.areaM2`/`claimedAreaM2`가 절대 채워지지 않음.
- 엔진: `claimedM2 = item.areaM2 ?? 0` → `0 > limitM2` (1983이든 9900이든) **항상 false** → else 분기 = 전액 비과세.
- ∴ **면적 상수(B-3)만 고치면 numeric 결과 불변.** 면적 한도를 실제로 작동시키려면 **B-1(UI 위젯) + B-2(필드 fallback) + B-3(상수) 3종 동반 필수.**

### 4.3 금액 한도 — **즉시 numeric 영향**
- 금액(`claimedAmount`) 입력 위젯은 현재 존재(`CurrencyInput`). 사용자가 금양임야 3억 입력 시:
  - **현재**: 면적 0 → 한도 검사 통과 → **3억 전액 비과세**
  - **정정 후(B-4)**: 합산 2억 한도 → **2억 비과세 / 1억 과세** ← 1억 과세표준 증가 = 실제 세액 변동
- ∴ **금액 한도(B-4·B-5)는 면적 입력과 무관하게 즉시 numeric 영향.** 본 버그의 "numeric 영향" 핵심은 여기.

### 4.4 결론
| 수정 항목 | 단독 numeric 영향 | 비고 |
|---|---|---|
| B-3 면적 상수 | 없음 (UI 부재) | 충실도 정정 |
| B-1+B-2+B-3 면적 3종 | **있음** (UI 추가 후 면적 한도 작동) | 면적 한도 정상화 |
| B-4 금양임야+묘토 2억 합산 | **있음 (즉시)** | 금액만 입력해도 작동 |
| B-5 족보·제구 1천만 | **있음 (즉시)** | 금액만 입력해도 작동 |

---

## 5. 수정 설계

### 5.1 엔진 — 면적 상수 정정 (B-3)
`exemption-rules.ts`:
- `:101` 금양임야 `limitAreaM2: 1983` → `9900`
- `:122` 묘토 `limitAreaM2: 3966` → `1980`
- description/riskNote/exclusions 문구: "600평·1,200평" → 법령 면적, 묘토 "토지" → "농지"
- 매직넘버 제거 권장: `legal-codes/inheritance-gift.ts`에 상수화 (5.4)

`exemption-evaluator.ts`:
- `:61` `?? 1983` → `?? 9900`, `:78` `?? 3966` → `?? 1980` (rule.limitAreaM2 우선이므로 fallback도 정합값으로)
- `:67,71,84` warning/breakdown 문구 정정

### 5.2 엔진 — 금액 합산 한도 구조 (B-4, B-5) ★ 핵심 설계

**적용 범위 구분:**
- **2억 한도 = 금양임야 + 묘토 두 항목 합산** → `evaluateSingleExemption`(항목별)로는 불가. **`evaluateExemptions` 레벨에서 cross-item 클램프.**
- **1천만 한도 = 족보·제구 단일 항목** → `evaluateSingleExemption` 내부 처리.

**적용 순서 (항목별 면적 안분 → 합산 금액 클램프):**
```
Step 1  금양임야: 면적 안분 → exemptAmount_forest
Step 2  묘토:    면적 안분 → exemptAmount_grave
Step 3  족보·제구: min(claimedAmount, 1천만) → exemptAmount_ritual
Step 4  (cross-item) groupSum = forest + grave
        if groupSum > 2억:
          cappedForest = floor(2억 × forest / groupSum)
          cappedGrave  = 2억 − cappedForest      ← 잔액 흡수(floor 잔액)
          각 itemResult.exemptAmount/taxableOverflow 재조정 + warning
```

**잔액 흡수** (memory `feedback_floor_residual_absorption`): `cappedGrave = 2억 − cappedForest`로 합계 정확히 2억 보장.

**족보·제구 1천만 (B-5):** `inh_ritual_items`를 `social_norm` 일반 경로에서 분리 → `min(claimedAmount, 10_000_000)`, 초과분 `taxableOverflow`. `limitType: "fixed"` + `limitAmount: 10_000_000`로 변경(UI 라벨 활용).
> ⚠️ **분기 위치 필수 (실측 R1-3, P0)**: `evaluateSingleExemption`에 **일반 `fixed` 분기가 없음** — `:121`은 `gift_disabled_trust` 전용 `if`, `:141`은 `social_norm || unlimited`. ritual을 `fixed`로만 바꾸면 어느 분기에도 안 걸려 `:152~155` "기본: 전액 비과세"로 **fallthrough → 1천만 한도 silent 미적용(numeric 오류)**. ∴ `inh_ritual_items` **전용 분기를 `:141` social_norm 분기보다 앞**에 추가 필수. deprecated 경로 `convertInheritanceExemptionInput`(`:254`)도 ritual을 매핑하므로 이 전용 분기로 함께 일관 처리됨(R1-7).

**해석 주의 (확인 필요):** §8③ 단서 "제1호 및 제2호의 합계액"은 금양임야 단독(묘토=0)이라도 2억 초과 시 2억 한도 적용으로 해석(합계=제1호만). 케이스 GF-03 참조. 조세심판원례로 추가 확인 여지 있음 → **계획상 채택, Do 시 주석 명시.**

### 5.3 엔진 — `claimedAreaM2` 우선 + `areaM2` 하위호환 (B-2)
`exemption-evaluator.ts:62,79`: `item.claimedAreaM2 ?? item.areaM2 ?? 0`. 타입 변경 불필요(이미 둘 다 optional). UI는 `claimedAreaM2`로 send(5.5).
> 실측(R1-5): Zod `exemptionCheckedItemSchema`(`property-valuation-input.ts:437~444`)는 `claimedAreaM2`만 정의·`areaM2` 없음. ∴ `areaM2` fallback은 **API 경로로 유입 불가 — 직접 엔진 호출(단위 테스트) 전용 하위호환**. API/UI 정식 경로는 `claimedAreaM2` 단일.

### 5.4 엔진 — 법령 상수 (`legal-codes/inheritance-gift.ts`)
```
GRAVE_FOREST_AREA  = "상증령 §8③1호"   // 금양임야 9,900㎡
GRAVE_LAND_AREA    = "상증령 §8③2호"   // 묘토 농지 1,980㎡
GRAVE_RITUAL       = "상증령 §8③3호"   // 족보·제구
GRAVE_GROUP_LIMIT  = "상증령 §8③ 단서" // 2억 / 1천만 한도
```
면적·금액 한도 수치 상수도 함께 정의(매직넘버 제거): `GRAVE_FOREST_LIMIT_M2 = 9900`, `GRAVE_LAND_LIMIT_M2 = 1980`, `GRAVE_GROUP_AMOUNT_LIMIT = 200_000_000`, `RITUAL_AMOUNT_LIMIT = 10_000_000`.

### 5.5 UI — 면적 입력 위젯 추가 (B-1, 동기화 지점 ⑤)
`ExemptionChecklist.tsx`:
- `ExemptionRowProps`에 `areaM2: number | undefined` + `onAreaChange` 추가
- `limitType === "area"` 블록에 **`DecimalInput` + `parseDecimal`** 면적(㎡) 입력 (CurrencyInput 금지 — 소수점 333.06→33306 버그). `claimedAreaM2`에 저장
- `handleAreaChange(ruleId, areaM2)` → `claimedAreaM2` set
- toggle 초기 객체에 `claimedAreaM2: undefined` (0 금지 — "미입력" 구분)
- 한도 초과 시 amber 인라인 안내: "한도 N㎡ 초과 — 초과 면적 비율로 금액 안분 과세"
- placeholder 숫자 예시 금지 → FieldCard `hint`로 안내

### 5.6 UI — 금액 한도 안내 (B-5)
- 금양임야 또는 묘토 checked 시 섹션 수준 안내 카드(sky/amber tone): "금양임야·묘토 비과세 합계는 2억원 한도(상증령 §8③). 족보·제구는 별도 1천만원 한도."
- 족보·제구 라벨에 "1천만원 한도" 표시(limitType fixed 변경으로 자동 노출 가능)

### 5.7 UI — 결과 화면 항목별 내역 (B-6, 동기화 지점 ⑦) — 상속 우선
- **실측(R1-4)**: `evaluateExemptions`는 **이미 `ExemptionResult & { itemResults }`를 반환**(`evaluator.ts:192`). 그러나 `inheritance-tax.ts:137~138`·`gift-tax.ts:93~94`가 `{ totalExemptAmount, breakdown }`만 구조분해 → **`itemResults`를 버리는 중**. ∴ **엔진 함수 자체 변경 불필요** — 호출부 구조분해에서 반환 객체 전체를 받아 `InheritanceTaxResult`에 `exemptionDetail?: ExemptionResult & { itemResults }` 통째 echo(design D-7). ※ `ExemptionItemResult`는 순환 회피 위해 `types/inheritance-exemption.types.ts`로 이동+re-export(design D-8).
- `InheritanceTaxResultView`에 기존 `ExemptionSummaryCard`(**import 사이트 0건** 실측 — 정의만 존재) 연결 → 항목별 비과세액·한도 초과 과세분(taxableOverflow) 표시. SummaryCard `ItemRow`는 `ExemptionItemResult` 수신 실측(`:29`) — 메인 컴포넌트 props(배열 수신) 시그니처는 연결 시 확정(R2-1)
- **선택 출력 통합 (R2-2)**: 신규 섹션은 `corporateExemption` 패턴(`InheritanceTaxResultView.tsx:208`/`329`/`415`)을 따라 `selectedPrintIds`에 섹션 id 등록 + `PrintSection` 래핑 필수 — "계산결과 선택 출력" 8결과뷰 통일 규칙(memory `project_selective_print_6tax_series`) 정합
- 증여 결과뷰는 금양임야/묘토/족보 룰이 없어(category inheritance) 우선순위 낮음 — 상속 결과뷰 우선
- result Map→Record 주의(memory `feedback_engine_result_map_json_loss`): `ExemptionItemResult[]`는 배열이라 JSON 직렬화 안전, 단 신규 result 필드는 호출처 echo 확인

### 5.8 Validation (동기화 지점 ⑧) — 상속 전용
`lib/calc/inheritance-validate.ts`: 금양임야·묘토 선택 시 `claimedAreaM2` 미입력(`== null || <= 0`) 차단.
```
validateExemptionAreaInput(exemptions): 면적 항목 선택+면적 미입력 → "면적(㎡)을 입력해야 합니다" 오류
```
> ⚠️ **증여 제외 (실측 R1-1·R1-2)**: 금양임야·묘토·족보·제구는 전부 `category:"inheritance"`(`rules.ts:96/117/137`) — 증여 카테고리에 없음. ∴ 증여세는 면적 입력 위젯·validation 모두 불필요. `lib/calc/gift-validate.ts`는 **파일 자체가 없음**(lib/calc ls 실측). 엔진 `evaluateExemptions`만 상속·증여 공유이나 증여 입력엔 해당 룰이 없어 자연 no-op.
memory `feedback_validation_sync_8th_point`: UI 통과 ↔ validate 차단 모순 방지. Zod `property-valuation-input.ts:444`에 `claimedAreaM2` 이미 존재(통과).

---

## 6. 케이스 인벤토리 표 (CLAUDE.md Design 규칙 — 행≥1 필수)

| ID | 시나리오 | 금양임야(㎡/원) | 묘토(㎡/원) | 족보(원) | 기대 비과세 (금양/묘토/족보) | 과세 overflow |
|---|---|---|---|---|---|---|
| GF-01 | 금양 면적·금액 한도 이내 | 5,000 / 1억 | — | — | 1억 / 0 / 0 | 0 |
| GF-02 | 금양 면적 초과(안분) | 15,000 / 3억 | — | — | floor(3억×9900/15000)=**1억9,800만** / 0 / 0 | 1,200만 |
| GF-03 | 금양 금액 2억 초과(면적 이내) | 9,000 / 3억 | — | — | **2억** / 0 / 0 | 1억 |
| GL-01 | 묘토 한도 이내 | — | 1,000 / 5,000만 | — | 0 / 5,000만 / 0 | 0 |
| GL-02 | 묘토 면적 초과 | — | 3,000 / 2,400만 | — | 0 / floor(2,400만×1980/3000)=**1,584만** / 0 | 816만 |
| GL-03 | 묘토 금액 2억 초과(면적 이내) | — | 1,500 / 2.5억 | — | 0 / **2억** / 0 | 5,000만 |
| BOTH-01 | 둘 다 한도 이내, 합산 ≤ 2억 | 5,000 / 8,000만 | 1,000 / 1억 | — | 8,000만 / 1억 / 0 | 0 |
| BOTH-02 | 면적 이내, 합산 > 2억(안분) | 9,000 / 1.5억 | 1,500 / 1억 | — | floor(2억×1.5/2.5)=**1.2억** / 잔액 **8,000만** | 5,000만 |
| BOTH-03 | 금양 면적 초과 → 합산도 초과(2단계) | 15,000 / 3억 | 1,500 / 1억 | — | 면적 안분 후 금양 1.98억+묘토 1억=2.98억 → 2억 클램프: **132,885,906** / **67,114,094** | 복합 |
| RITUAL-01 | 족보 1천만 이하 | — | — | 500만 | 0 / 0 / 500만 | 0 |
| RITUAL-02 | 족보 1천만 초과 | — | — | 1,500만 | 0 / 0 / **1천만** | 500만 |
| BND-2억 | 합산 정확히 2억(경계) | 1억 | 1억 | — | 1억 / 1억 (클램프 미작동) | 0 |
| ALL-01 | 세 항목 복합 | 9,000 / 1.5억 | 1,500 / 1억 | 1,500만 | 금양·묘토 2억 안분 + 족보 1천만 | 복합 |
| DEPREC | `areaM2`만 채운 하위호환 | areaM2=15000 | — | — | GF-02와 동일 결과 | 1,200만 |

---

## 7. anchor 테스트 목록 (원단위 `toBe()` — memory `feedback_pdf_example_test_anchoring`)

```
[N5]    rule(inh_forest_burial).limitAreaM2  toBe(9900)
[N6]    rule(inh_grave_land).limitAreaM2     toBe(1980)
[GF-02] forest 15000㎡/3억 → exemptAmount toBe(198_000_000), overflow toBe(102_000_000)
[GF-03] forest 9000㎡/3억  → exemptAmount toBe(200_000_000), overflow toBe(100_000_000) + warning "2억"
[GL-02] grave 3000㎡/2400만 → exemptAmount toBe(15_840_000)
[GL-03] grave 1500㎡/2.5억 → exemptAmount toBe(200_000_000), overflow toBe(50_000_000)
[BOTH-02] forest 9000/1.5억 + grave 1500/1억 → forest toBe(120_000_000), grave toBe(80_000_000), total toBe(200_000_000)
[BOTH-03] forest 15000/3억 + grave 1500/1억 → forest toBe(132_885_906), grave toBe(67_114_094)  // floor(2억×198/298)=132,885,906 수기검증
[RITUAL-02] ritual 1500만 → exemptAmount toBe(10_000_000), overflow toBe(5_000_000)
[ALL-01] forest+grave == 200_000_000, ritual == 10_000_000, total == 210_000_000
[BND-2억] forest 1억 + grave 1억 → 클램프 미작동, total toBe(200_000_000)
[DEPREC] {areaM2:15000} (claimedAreaM2 없음) → GF-02와 동일
```

---

## 8. 동기화 지점 점검 (상속·증여 8/14)

| # | 지점 | 현행 | 변경 |
|---|---|---|---|
| ① 폼 상태 | `ExemptionCheckedItem.claimedAreaM2` 이미 존재 | 없음 |
| ② initial | toggle 시 `{ruleId,claimedAmount:0}` | `claimedAreaM2: undefined` 추가 |
| ③ normalize | optional이라 OK | 없음 |
| ④ API 변환 | `inheritance-api.ts`/`gift-api.ts` pass-through | 없음(자동 포함) |
| ⑤ UI 위젯 | **면적 입력 없음 (핵심)** | DecimalInput + onAreaChange |
| ⑥ 사이드바 | 비과세 합계만 | 없음 |
| ⑦ 결과 카드 | 합계만, SummaryCard 미연결(import 0건) | 호출부 itemResults 수신 + Result 필드 + SummaryCard (상속) |
| ⑧ validation | 면적 검증 없음 | validateExemptionAreaInput (inheritance-validate.ts 단독·gift-validate.ts 부재) |
| ⑨⑩⑫ Zod | `claimedAreaM2` 스키마 존재(`property-valuation-input.ts:444`) | 없음 |
| ⑪⑬⑭ | input 구조 변경 없음 | result 필드 추가만(⑦ 연계) |

---

## 9. 작업 순서 (Do Phase — 엔진 선처리 → UI)

**Phase 1 — 엔진(즉시 numeric 효과 우선)**
1. Pre-Do anchor: GF-03(금액 2억) · GF-02(면적 9900) 실패 확보 (현행 코드로 RED 확인)
2. `exemption-rules.ts` 면적 상수 9900/1980 + 문구 + ritual fixed/1천만
3. `exemption-evaluator.ts` claimedAreaM2 fallback + 금액 합산 클램프(2억) + ritual 1천만 분기
4. `legal-codes/inheritance-gift.ts` 상수 추가
5. anchor 전 케이스 GREEN

**Phase 2 — UI 입력 (B-1, ⑤)**
6. ExemptionRow DecimalInput + handleAreaChange + initial undefined

**Phase 3 — Validation (⑧, 상속 전용)**
7. validateExemptionAreaInput → `inheritance-validate.ts` (증여는 해당 룰 없음·gift-validate.ts 부재)

**Phase 4 — 금액 한도 안내 (B-5, ⑥/⑤)**
8. 합산 2억 안내 카드 + 족보 1천만 라벨

**Phase 5 — 결과 화면 (B-6, ⑦)**
9. `inheritance-tax.ts` 호출부에서 `itemResults` 수신 + `InheritanceTaxResult` 필드 추가 + ExemptionSummaryCard 연결 (evaluator 함수 변경 불필요)

**Phase 6 — Check**
10. `npx tsc --noEmit` 0건 / `npx vitest run __tests__/tax-engine/` 통과 / `ui-engine-sync-checker` / E2E(`e2e/*.spec.ts`, memory `feedback_browser_verify_with_playwright`)

---

## 10. 변경 파일 목록

| 파일 | 변경 | 단계 |
|---|---|---|
| `lib/tax-engine/exemption-rules.ts` | 면적 상수·문구·ritual limitType | P1 |
| `lib/tax-engine/exemption-evaluator.ts` | claimedAreaM2 fallback·2억 cross-item 클램프·1천만 ritual | P1 |
| `lib/tax-engine/legal-codes/inheritance-gift.ts` | §8③ 상수 | P1 |
| `__tests__/tax-engine/exemption-rules.test.ts` | N5·N6 정정 + GF/GL/BOTH/RITUAL/ALL/BND/DEPREC anchor | P1 |
| `components/calc/exemption/ExemptionChecklist.tsx` | 면적 DecimalInput·안내 카드 (255줄, 800줄 여유) | P2·P4 |
| `lib/calc/inheritance-validate.ts` | validateExemptionAreaInput (gift-validate.ts 부재·증여 룰 없음 → 상속 전용) | P3 |
| `lib/tax-engine/inheritance-tax.ts` + `lib/tax-engine/types/inheritance-gift.types.ts` | 호출부 itemResults 수신 + Result 필드 (evaluator 함수는 이미 반환) | P5 |
| `components/calc/results/InheritanceTaxResultView.tsx` (+Gift) | ExemptionSummaryCard 연결 | P5 |

---

## 11. Pre-Do anchor 절차 (memory `feedback_pre_anchor_verification`)

Do 진입 전 핵심 anchor **1건 우선 실행 → 실패(RED) 확보 → 디자인 환류**:
- **GF-03**(금양임야 9,000㎡/3억 → 비과세 2억·과세 1억): 현행 코드는 면적 0·금액 한도 없음 → 전액 3억 비과세 → anchor RED 확인.
- 이 RED가 "금액 한도 즉시 numeric 영향"을 실증. "현행 일치 예상" 가정 금지.

## 12. 리스크 · 확인 필요

1. **§8③ 단서 "1호+2호 합계" 단독 적용 해석**(GF-03/GL-03): 금양임야 단독 2억 초과 시에도 2억 한도로 채택 → Do 시 주석·조세심판원례 추가 확인.
2. **족보·제구 social_norm → fixed 변경**: `evaluateSingleExemption` social_norm 일반 분기에서 분리 필요. 다른 social_norm 항목(혼수·축의금 등) 회귀 영향 anchor 확인.
3. **면적 비율 안분 + 금액 클램프 상호작용**(BOTH-03): 면적 안분(항목 내) → 금액 합산 클램프(cross-item) 2단계 순서 고정. floor 잔액 묘토 흡수.
4. **결과 result 필드 추가(P5)**: 호출처 echo·Record 직렬화 확인(memory `feedback_engine_result_map_json_loss`).
5. **전체 회귀**: 커밋 전 `npm test` 전체(공유 모듈·종부세→재산세 의존, memory `feedback_per_tax_test_scripts`).
6. **별지 부표2 ⑲ (R2-3 — 범위 외 명시)**: 부표2 ⑲ "금양임야 등 가액"(`besshi-buppyo-2-constants.ts:84`)은 현재 `nonTaxableTotal: null`로 **항상 공란**(`besshi-buppyo-2-data.ts:264`). 면적/금액 한도 정정과 직접 연관 없어 본 이슈 **범위 외**. P5에서 `itemResults`가 노출되면 향후 ⑲ 행 자동 채움 가능(후속 과제).
