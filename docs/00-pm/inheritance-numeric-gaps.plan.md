# 상속세 numeric-영향 잔여 갭 정비 계획

> 작성: 2026-06-07 · 대상: 직전 메모리에서 "numeric 영향 있는 잔여(우선순위 높음)"로 분류된 3건
> 정책: 모든 주장은 file:line·법령 실측 검증 후 단정 (CLAUDE.md "추정 금지").
> 본 계획의 현황 인용은 2026-06-07 코드 기준 실측.

---

## §0. Triage 요약 (실측 결과 → 우선순위 재조정)

직전 메모리가 "numeric 영향 잔여"로 묶었던 3건을 코드 실측한 결과, **실제 진행 대상은 1건뿐**입니다.

| # | 항목 | 메모리 분류 | 실측 결과 | 처리 |
|---|---|---|---|---|
| 1 | **§21① 단서 무신고 시 일괄공제 5억 고정** | 미구현 | ✅ **진짜 미구현** — `calcInheritanceDeductions`에 신고 여부 분기 없음 | **본 계획 진행** |
| 2 | **비상장 V2 §54③·§54⑥** | 잔여 | ❌ **이미 구현됨** (메모리 stale) | **진행 불요 · 메모리 정정** (§2) |
| 3 | **연부연납 모드B 거치 가산금 §72** | blocked | 🔒 blocked 유지 (국세청 공식 예시 미확보) | **보류** (§3) |
| + | deduction-optimizer.ts dead code | 곁다리 | ✅ 테스트 전용 orphan 확인 | 선택적 정리 (§4) |

> ★ 항목 2는 [[feedback_numeric_impact_verify_before_bug_claim]] 정책의 전형적 사례 — "미구현"으로 기록됐으나 실측 시 구현 완료. 본 계획 §2에서 메모리를 정정한다.

**결론: 실제 신규 구현은 §21① 단서 1건.** 이하 §1이 본 계획의 본체.

---

## §1. §21① 단서 — 무신고 시 일괄공제 5억원 고정 (본체)

### 1-1. 법령 (KoreanLaw MCP 실측, mst 276123, 시행 20260102)

> **제21조(일괄공제)**
> ① 거주자의 사망으로 상속이 개시되는 경우에 상속인이나 수유자는 제18조와 제20조제1항에 따른 공제액을 합친 금액과 5억원 중 큰 금액으로 공제받을 수 있다. **다만, 제67조 또는 「국세기본법」 제45조의3에 따른 신고가 없는 경우에는 5억원을 공제한다.**
> ② 제1항을 적용할 때 피상속인의 배우자가 단독으로 상속받는 경우에는 제18조와 제20조제1항에 따른 공제액을 합친 금액으로만 공제한다.

**단서 해석 (★ 핵심)**:
- §67 = 상속세 **정기신고**, 국기법 §45의3 = **기한후신고**.
- 단서 발동 조건 = "§67 **또는** §45의3에 따른 신고가 **없는** 경우" = **둘 다 안 한 완전 무신고**.
- 효과: 무신고 시 일괄공제 **5억원으로 고정** → 기초+인적 합계가 5억을 초과해도 5억만 적용(본문 max 선택 불가).
- **기한후신고(§45의3)를 한 경우는 단서 미해당** → 본문 적용(max(기초+인적, 5억) 선택 가능).

### 1-2. 현황 (실측 file:line)

| 항목 | 위치 | 상태 |
|---|---|---|
| 일괄공제 자동 max 로직 | `lib/tax-engine/deductions/inheritance-deductions.ts:546~576` (`calcInheritanceDeductions`) | ✅ 본문 구현 |
| `LUMP_SUM_DEDUCTION = 500_000_000` | `inheritance-deductions.ts:68` | ✅ |
| §21② 배우자 단독상속 배제 | `inheritance-deductions.ts:554~563` (필터 554-556·`isSpouseSoleHeir` 557-558·`chosenMethod` 559-563) | ✅ 구현 |
| 결과 필드 | `inheritance-gift.types.ts:994`(`chosenMethod`)·`996`(`lumpSumExcludedBySpouseSoleHeir?`)·`1001`(`lumpSumComparisonDetail?`) | ✅ |
| **§21① 단서 무신고 분기** | `calcInheritanceDeductions` 전체 | ❌ **미구현** (신고 여부 매개변수 없음) |
| `isFiledOnTime` 필드 (신고기한 내) | `InheritanceTaxCreditInput` (`inheritance-tax-credit.types.ts:79,87`), `creditInput`에서 입력 | ✅ 존재 (단 §69용) |
| `isFiledOnTime` UI 입력 | `components/calc/inheritance/steps.tsx:582`, `shared.ts:79,169` | ✅ 체크박스 1개 |
| 결과뷰 일괄공제 카드 | `DeductionBreakdownSection.tsx:68~78`(배제 Row 78)·`LumpSumDetailCard.tsx:52~67`(배제 안내 67) | ✅ (단서 Row 추가 자리) |

### 1-3. ★ 핵심 설계 결정 — `isFiledOnTime` 재사용 불가

기존 `isFiledOnTime`은 **"법정신고기한 내 신고 여부"**(§69 신고세액공제 3% 판정, `filing-credit.ts:34,54,56`). 세 가지 신고 상태와 두 제도의 경계가 **다르다**:

| 신고 상태 | `isFiledOnTime` | §69 신고세액공제(3%) | §21① 일괄공제 |
|---|---|---|---|
| 정기신고 (§67, 기한 내) | `true` | 적용 | 본문 `max(기초+인적, 5억)` |
| 기한후신고 (§45의3) | `false` | 미적용 | **본문 `max` (단서 미해당)** |
| 완전 무신고 | `false` | 미적용 | **단서 `5억 고정`** |

→ `isFiledOnTime === false`는 "기한후신고"와 "무신고"를 **구분하지 못함**. §21① 단서는 이 둘을 갈라야 하므로 **`isFiledOnTime` 단독 재사용은 부정확**(기한후신고를 무신고로 오판 → 5억 잘못 고정).

**별도의 "신고 상태" 정보가 필요하다.** 설계 옵션은 1-4.

### 1-4. 설계 옵션 (Design 단계 확정)

| 옵션 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **A. `filingStatus` 3-state** | `"on_time" \| "late" \| "none"` 신규 입력 → `isFiledOnTime`은 `=== "on_time"`으로 derive | 법령 정합·단일 진실 | `isFiledOnTime` 사용처(filing-credit·allocation·burdened-gift) 마이그레이션, 폼/Zod/저장소 영향 큼 |
| **B. `isUnfiled` boolean 추가** (권장 후보) | `isFiledOnTime` 유지 + `isUnfiled?: boolean` 추가. §21①만 `isUnfiled`로 판정 | 최소 변경·기존 §69 무영향 | 두 boolean 의미 중첩 → `isFiledOnTime && isUnfiled` 모순 입력 차단 validation 필요 |
| **C. 3-state + getter 호환** | `filingStatus` 도입하되 `isFiledOnTime` getter로 하위호환 유지 | A의 정합 + 마이그레이션 완충 | 과도 설계 위험 |

> 권장 1순위: **B** (변경 최소, §69 회귀 0). 단 [[feedback_three_state_optional_mode_toggle]]·UI 단순성 관점에서 **A의 3-state 라디오**(정기/기한후/무신고)가 사용자에게 더 명확할 수 있음 → Design에서 엔진+UI 시니어 병렬 판단. **본 계획은 옵션 확정을 Design 단계로 위임**하고, 어느 쪽이든 §21① 단서 판정 = "무신고일 때만 5억 고정"이라는 동작은 동일.

### 1-5. numeric 영향 분석 (★ 실증 대상)

- 단서가 결과를 바꾸는 케이스: **무신고 AND (기초공제 §18 + 인적공제 §20① 합계 > 5억)**.
  - 기초공제 2억 고정 + 인적공제가 3억 초과해야 5억 돌파.
  - 인적공제 §20①: 자녀 5천만/인, 미성년 1천만×잔여연수, 장애인 1천만×기대여명, 연로자 5천만 등.
  - 예: 자녀 6명 = 3억 / 장애인 기대여명 큰 케이스 등 → 합계 5억 초과 가능(드물지만 실재).
- 그 외(무신고 AND 합계 ≤ 5억)는 본문·단서 모두 5억 → **영향 없음** (자기상쇄).
- **Pre-Do anchor로 영향 케이스를 우선 실증**한 뒤 구현 (1-7).

### 1-6. 단서 분기 알고리즘 (★ §21② > §21①단서 > 본문 우선순위)

현행 `chosenMethod` 삼항(559~563)을 다음으로 확장. **우선순위는 §21②(배우자단독) > §21①단서(무신고) > 본문 max**:

```ts
// isUnfiled = 옵션B 신규 필드 (또는 filingStatus === "none")
const chosenMethod: "lump_sum" | "itemized" = isSpouseSoleHeir
  ? "itemized"                                  // §21② 최우선 (일괄공제 자체 배제)
  : isUnfiled
    ? "lump_sum"                                // §21① 단서 — 무신고 시 5억 고정
    : LUMP_SUM_DEDUCTION >= itemizedTotal
      ? "lump_sum"                              // 본문 max
      : "itemized";
const lumpSumForcedByUnfiled = !isSpouseSoleHeir && isUnfiled; // echo용
```

> ★ 우선순위 근거: §21② "제1항을 적용할 때 …합친 금액으로만 공제한다"는 §21①(본문+단서) **전체의 특칙** → 배우자단독이면 일괄공제(단서 5억 포함) 배제, 기초+인적만. 현행 코드(isSpouseSoleHeir→itemized 선평가)와 정합. **단 심판례·해석례 미발견(KoreanLaw tax_tribunal·interpretation 0건, 2026-06-07) → "법문 구조 해석"으로 잠정, Design에서 재확인.**

### 1-6b. 14개 동기화 지점

deductionInput 계열 신규 필드(`isUnfiled` 또는 `filingStatus`) 추가 시:

- **엔진**: `InheritanceDeductionInput`(types `inheritance-gift.types.ts:859~`) 타입 + `calcInheritanceDeductions` 단서 분기(559~563 삼항 확장, 1-6).
  - 단서 발동 시 `chosenMethod="lump_sum"` 강제 + `chosenBasicPersonal=LUMP_SUM_DEDUCTION`(564~565 자동) 고정. **breakdown 라벨(697줄)** 무신고 시 "(§21① 단서 무신고)" 표기 분기.
  - 결과 echo: `InheritanceDeductionResult`(996 `lumpSumExcludedBySpouseSoleHeir?` 옆)에 `lumpSumForcedByUnfiled?: boolean` 추가 + `LumpSumComparisonDetail`(568~576)에 `forcedByUnfiled` 필드 추가.
- **클라이언트 8**: ①FormState(`shared.ts`) → ②INITIAL(`shared.ts:169` 인근) → ③normalize → ④API 변환(`InheritanceTaxForm` buildInput, isFiledOnTime은 :425) → ⑤UI 위젯(`steps.tsx:582` isFiledOnTime 체크박스 인근, 옵션 A면 라디오로 교체) → ⑥사이드바(해당 없음) → ⑦결과 카드 **2곳**: `DeductionBreakdownSection.tsx:78`(배제 Row 옆)·`LumpSumDetailCard.tsx:67`(배제 안내 옆)에 단서 Row 추가 → ⑧validation(옵션 B의 모순 입력 차단).
- **API/Route 6**: ⑨⑩ Zod 필드(`lib/validators/property-valuation-input.ts` `inheritanceDeductionInputSchema`) → ⑪ 해당 없음 → ⑫ Zod 입력 객체 → ⑬ body spread → ⑭ Route 매핑.
- ★ `creditInput.isFiledOnTime`과의 일관성: 옵션 A 채택 시 `isFiledOnTime`을 `filingStatus`에서 derive하여 creditInput에도 전달(단일 진실). 옵션 B면 두 필드 독립 + validation으로 모순 차단(`isFiledOnTime===true && isUnfiled===true` 불가).

### 1-7. Pre-Do anchor (디자인 환류용 — Do 진입 전 실행)

**anchor 레벨**: SEC21P-1·2·4·5는 **deduction 엔진 단독**(`calcInheritanceDeductions` → `lumpSumComparisonDetail.selectedAmount`·`forcedByUnfiled`)으로 검증(§69 무관). SEC21P-3의 §69 3% 부분만 **통합 레벨**(`calculateInheritanceTax` → credit 결과)에서 별도 검증. `__tests__/tax-engine/inheritance/section21-unfiled-proviso.test.ts` 신규.

| anchor | 레벨 | 시나리오 | 기대 (법령 정합) |
|---|---|---|---|
| SEC21P-1 | deduction | 무신고 + 기초2억+인적3.5억(5.5억) | 일괄공제 **5억 고정** (max 미적용), `forcedByUnfiled=true`·`selectedAmount=5억` |
| SEC21P-2 | deduction | 기한후신고 + 동일 5.5억 | **5.5억** (본문 max, 단서 미해당)·`forcedByUnfiled=false` ← ★ isFiledOnTime=false라도 단서 안 걸림 |
| SEC21P-3 | 통합 | 정기신고 + 동일 5.5억 | 5.5억 (본문 max) + §69 신고세액공제 3% 적용 |
| SEC21P-4 | deduction | 무신고 + 합계 4억 | 5억 (본문·단서 동일)·`forcedByUnfiled=true`(분기는 타되 금액 동일) — 영향 없음 회귀 |
| SEC21P-5 | 무신고 + §21② 배우자 단독상속 (기초+인적 6억) | **기초+인적 6억** (§21② 우선 — 일괄공제·단서 모두 배제), `lumpSumForcedByUnfiled=false` |

> ★ SEC21P-5 우선순위 = §21② > §21①단서 (1-6 알고리즘). **KoreanLaw 심판례(tax_tribunal)·해석례(interpretation) 검색 0건(2026-06-07)** → 법문 구조 해석("§21②가 §21① 전체 특칙")에 의한 잠정 결론. 추측 금지 정책상 Design 단계에서 국세청 nts 회신·예규 추가 탐색으로 확정, 미확보 시 결과뷰에 "배우자 단독상속 시 일괄공제·무신고 단서 모두 배제(해석)" 중립 안내.
> Pre-Do는 SEC21P-1·2를 먼저 작성해 **실패 확보**([[feedback_pre_anchor_verification]]) 후 구현.

### 1-8. 작업 순서 (Do, 단일 응답 완주)

1. (Design 확정 후) `InheritanceDeductionInput`에 신규 필드 추가. (legal-codes: `INH.LUMP_SUM`은 기존 존재 → 단서 라벨 상수는 **필요 시만** 추가)
2. `calcInheritanceDeductions` 단서 분기 + 결과 플래그 echo.
3. Pre-Do anchor SEC21P-1~4 GREEN.
4. 14지점 클라이언트/API 동기화.
5. 결과뷰 §21① 단서 안내 Row + E2E 1~2건.
6. 전체 `npm test` 회귀 0 확인.

---

## §2. 비상장 V2 §54③·§54⑥ — 메모리 정정 (구현 불요)

실측 결과 **이미 완전 구현**되어 있어 신규 작업 불요. 정정 근거:

| 규정 | V2(정식) | V1(간편) | 상태 |
|---|---|---|---|
| §54① 가중평균 3:2 / 부동산과다 2:3 | `property-valuation/weighted-avg.ts:64~72` (`calcPerShareWeightedValuation`) | `property-valuation-stock.ts:579~587` | ✅ |
| §54③ 순자산 단독평가 (청산·휴폐업·3년미만·부동산80%·주식80%·잔여3년) | `unlisted-orchestrator.ts:204~226` (`netAssetOnlyReason`) | `property-valuation-stock.ts:593~610` (`assetValueOnlyReason`) | ✅ |
| §54⑥ 순자산 80% 하한 | `weighted-avg.ts:80~83` (`calcNetAssetFloor80`) + `:91~99` (`calcFinalPerShareValue`) | `property-valuation-stock.ts:53,590,613` (`MIN_VALUE_RATE=0.80`) | ✅ |

→ **조치: `project_inheritance_remaining_gaps_triage` 메모리의 "잔여 별도 트랙: 비상장 V2 §54⑥·§54③" 표기를 "구현 완료 확인(2026-06-07)"으로 정정.**
> (선택) 남은 정밀 갭이 있다면 V1 사유 enum 명칭 차이(`stock_80` vs `stock_holding_80`)·§54⑥ 평가심의위 예외(`evaluationCommittee`) 정도 — numeric 영향 미확인, 별도 triage.

---

## §3. 연부연납 모드B 거치 가산금 §72 — blocked 유지

[[project-inheritance-installment-schedule]] 기록대로 **국세청 공식 워크드예시 미확보**(API 미제공·PDF 추출 실패)로 §72 본문 문리(첫 회 일괄) vs 실무(매년 이자) 확정 불가. 현재 실무기준 계상 + notes 경고로 처리 중. **공식 예시 확보 시 재개** — 본 계획에서 진행 불가.

---

## §4. deduction-optimizer.ts dead code (선택적 정리)

- `lib/tax-engine/deductions/deduction-optimizer.ts` (61줄, `optimizeDeductionMethod` export)는 엔진 본체 미사용, 테스트(`__tests__/tax-engine/inheritance-deductions.test.ts:26,521~564`)에서만 import.
- 실제 일괄공제 선택은 `calcInheritanceDeductions` 인라인(546~576). → orphan.
- **조치(선택)**: §1 작업 시 §21① 단서 로직을 인라인에 넣으므로 optimizer는 계속 무관 → 별도 PR로 삭제하거나 유지. numeric 무영향. **본 계획 필수 범위 아님.**

---

## §5. 리스크·검증 체크리스트

- [ ] §21① 단서 ∩ §21② 배우자단독 상호작용 — KoreanLaw/심판례 검증 (1-7 SEC21P-5, **확인 필요**)
- [ ] 옵션 A/B/C 중 Design 확정 (엔진+UI 시니어 병렬)
- [ ] Pre-Do anchor SEC21P-1·2 실패 확보 후 구현
- [ ] `isFiledOnTime`(§69)과 신규 신고상태 필드의 일관성 — 옵션별 처리 명시
- [ ] 14지점 ⑫⑬⑭ grep 자가점검
- [ ] 전체 `npm test` 회귀 0 (공유 모듈·종부세→재산세 의존)
- [ ] 결과뷰 §21① 단서 안내 Row + E2E
- [ ] 메모리 §2(§54)·triage 정정 반영

---

## 산출물 예정

- 엔진: `inheritance-deductions.ts` 단서 분기 + 신규 입력 필드 + `lumpSumForcedByUnfiled` echo
- 타입/Zod/폼/API/결과뷰/validation (14지점)
- anchor: `__tests__/tax-engine/inheritance/section21-unfiled-proviso.test.ts` (SEC21P-1~5)
- E2E: `e2e/inheritance-section21-unfiled.spec.ts`
- 설계: `docs/02-design/features/inheritance-section21-unfiled-proviso.{engine.design,ui.design}.md`
