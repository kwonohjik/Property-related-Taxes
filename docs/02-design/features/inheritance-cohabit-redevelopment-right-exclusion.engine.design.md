# 동거주택 상속공제 §23의2 — 조합원입주권·분양권 미적용 엔진 설계

> 생성: 2026-06-07 (plan-design-self-review-loop STEP 5)
> 계획서: `docs/00-pm/inheritance-cohabit-redevelopment-right-exclusion.plan.md`
> 상태: Design (Do 진입 전 — V-1 NTS[113036] 원문 조회 + EN-3 택일 선행)

---

## Context

§23의2 동거주택 상속공제는 상속개시일 현재 실체 "주택"에만 적용된다. 현행 엔진은 `isCohabitantHouse=true` 자산을 입주권/분양권 여부와 무관하게 공제 적용 → 1+1 조합원입주권(조심 2021중6665 미적용)·분양권에 **최대 6억 과대공제** 위험. 본 설계는 자산 유형(rightType)을 식별해 미적용 케이스를 엔진 단일 게이트로 차단한다.

★핵심 아키텍처 결정(계획 STEP 1 정정#1): 게이트는 **엔진 `calcInheritanceDeductions`의 양 경로**(general `:519` + directAmount `:535`)에 둔다. lib/calc `deriveCohabitHouseStdPrice`에만 두면 directAmount 모드가 사각지대(Phase 1 메모리 교훈).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| CA-01 | 일반주택 동거 → 적용 (회귀) | §23의2① | A-3 `house→applicable=true` | `cohabit-redev-right.test.ts` | ☐ |
| CA-02 | 1세대1주택 멸실 단일 입주권 + 다른 주택 無 → **적용**(V-1 확정) | 기재부 재산세제과-230(2012.3.22)·재산세제과-237(2012.6.25, NTS[113036]) — 조심 2017서2253·2021중6665 결정문 전문 축자 인용 확보 | A-5 `single_redev_right→applicable=true` | 동 | ☐ |
| CA-03 | 1+1 입주권(2개) → 미적용·공제 0 | 조심 2021중6665(id=34000) | A-1 헬퍼 + A-4 엔진 directAmount | 동 | ☐ |
| CA-04 | 분양권 → 미적용·공제 0 | §23의2① "주택" 문언 | A-2 `sale_right→applicable=false` | 동 | ☐ |
| CA-05 | 완공 후 주택(상속개시일 주택 상태) → 적용 | §23의2①(주택 복귀) | A-6 `house(완공)→적용` | 동 | ☐ |
| CA-06 | 10년 기간 중 입주권 보유, 현재 주택 → 1세대1주택 요건 재판단 | 조심 2017서2253(id=981722) | (범위 외 — §1.5, v2 후속) | — | ☐ 후속 |
| CA-07 | 1주택+1입주권(현재) → 1세대1주택 미충족 가능 | 조심 2017서2253 | (범위 외 — v2 후속) | — | ☐ 후속 |
| CA-08 | ★directAmount 모드 + 1+1 입주권 → 공제 0 (양 경로 차단) | 정정#1 | A-4 엔진 결과 | 동 | ☐ |

> CA-06·CA-07(10년 기간 중 입주권 주택수 산입)은 동거기간 자동판정과 얽혀 본 PR 범위 외(v2 후속). 본 PR은 상속개시일 현재 자산유형(rightType) 기반 미적용 게이트에 한정.

---

## 법령 근거

| 조문/해석례 | 확인 | 내용 |
|---|---|---|
| 상증법 §23의2① (mst=276123) | get_law_text 직접 | "상속주택가액…" — 대상은 실체 "주택", 입주권·분양권 포함 조문 없음 |
| 상증령 §20의2① (mst=283637) | get_law_text 직접 | 1세대1주택 예외 8호 — 입주권 적용 특례 없음 |
| 조심 2021중6665 (id=34000) | get_decision_text 직접 | 1주택→2입주권 = 1세대1주택 요건 미충족, 공제 기각 → **1+1 미적용 확정** |
| 조심 2017서2253 (id=981722) | get_decision_text 직접 | 10년 기간 중 1주택+1입주권 → 요건 미충족(CA-06/07, v2) |
| NTS [113036] (2012.06.25) | **미조회(URL 확보)** | 단일 입주권 적용 여부 — V-1 Pre-Do 필수 |
| NTS [291632] (2022.10.24) | 목록만 | 2021.1.1.~ 분양권 주택수 산입(별개 쟁점, CA-04와 무관) |

★추정 인용 금지: NTS[113036] 원문 미확인 → CA-02 default false·needsVerification. 재산-237 "적용" 단정 금지.

---

## 엔진 input 타입

```typescript
// EstateItem (폼·UI용 — 자산 카드에서 입력)
interface EstateItem {
  // ...기존...
  isCohabitantHouse?: boolean;
  /** §23의2 동거주택 자산 유형. isCohabitantHouse=true 시 함께 지정. */
  cohabitHouseRightType?: "house" | "single_redev_right" | "one_plus_one_right" | "sale_right";
}

// InheritanceDeductionInput (엔진 게이트용 — deriveCohabitHouseStdPrice가 전달, 정정#1·R1)
interface InheritanceDeductionInput {
  // ...기존 cohabitHouseStdPrice?(:997)·cohabitSecuredDebt?(:999)·cohabitDirectAmount?(:1023)...
  /** 동거주택 자산 유형 — 엔진 미적용 게이트(general+directAmount 양 경로). */
  cohabitHouseRightType?: "house" | "single_redev_right" | "one_plus_one_right" | "sale_right";
}
```

---

## 엔진 result 타입

```typescript
interface CohabitDeductionDetail {
  // ...기존(housingValue·rate·cap·cohabitYears·ancillaryLandLimitReduction 등)...
  /** 자산유형 미적용 여부(1+1·분양권). true 시 cappedDeduction=0. */
  isExcluded?: boolean;
  /** 미적용 사유(확정 2종만). */
  exclusionReason?: "one_plus_one_right" | "sale_right";
}
// ★V-1 확정으로 cohabitNeedsVerification 폐기 — single_redev_right는 적용(needsVerification 불요).
//   "다른 주택 없을 것" 요건은 UI hint(EstateBodyRealEstate)로 안내.
```

---

## 계산 알고리즘 (단계별)

1. `deriveCohabitHouseStdPrice`(lib/calc): `isCohabitantHouse=true` 자산의 standardPrice·mortgage + **`cohabitHouseRightType`을 deductionInput으로 전달**(echo·차단 아님).
2. `calcInheritanceDeductions`(엔진) 진입 → `gate = isCohabitDeductionApplicableHouse(input.cohabitHouseRightType)`:
   - `one_plus_one_right`·`sale_right` → `{applicable:false, reason}`.
   - `single_redev_right` → `{applicable:true}` (★V-1 확정: 재산세제과-230·237 — 멸실 입주권 외 다른 주택 無 시 적용. "다른 주택 없을 것" 요건은 UI hint로 안내, 기존 1세대1주택·동거 요건 체크로 커버).
   - `house`·`undefined` → `{applicable:true}` (★EN-3 확정: undefined는 house로 적용 — 레거시 회귀 0. validation CV-1 경고로 명시 선택 유도).
3. **general 경로(:519)**: `applicable===false`면 `cohabitFull=0` + detail.isExcluded=true·exclusionReason. else 기존 `calcCohabitationDeduction`.
4. **directAmount 경로(:535)**: `applicable===false`면 `cohabitDirectAmount` 무시·0 + detail. else 기존 directAmount 처리. ★양 경로 동일 게이트(단일 진실).
5. `needsVerification` → detail.cohabitNeedsVerification echo(공제는 V-1 결과 따름).

---

## Silent fallback / 자동 안분 후보 식별

- `cohabitHouseRightType` 미입력(undefined): 기본 `house` 취급(적용) — **EN-3 택일**. (A) `"house"` fallback 3중 일치 vs (B) fallback 없이 CV-1 경고 유도. 본 설계 권장 (B)(자동 fallback 회피, feedback_no_silent_apportion_fallback). Do 전 확정.
- 자동 안분 없음 — rightType은 사용자 명시 선택의 법령 결정적 분류.

---

## 테스트 약속

- 케이스 인벤토리 CA-01~CA-05·CA-08 → anchor A-1~A-6. ★A-4(엔진 directAmount 경로) 필수.
- 회귀: 기존 cohabit-rate-cap·cohabit-years·cohabit-reasons·D18·D19 보존(rightType 미지정 시 house 동작 = 기존).
- CA-02는 V-1 확정 후 anchor 값 확정(현재 needsVerification).

---

## UI 통합 위임

- 입력 위젯(⑤)·결과 배지(⑦)·validation(⑧)은 UI 시니어. 엔진은 input(EstateItem·InheritanceDeductionInput)·result(isExcluded·exclusionReason·cohabitNeedsVerification) 타입만 정의.
- ⑩⑪ N/A(상속세 EstateItem 단일 스키마·양도세 전용). ⑨⑫ Zod = `property-valuation-input.ts:299 estateItemSchema`.

---

## Do 진입 전 미해결 (게이트) — ★전부 해소 (2026-06-07)

| # | 항목 | 결정 |
|---|---|---|
| V-1 | NTS[113036] 원문 → CA-02 적용여부 | **적용**(재산세제과-230·237, 조심 결정문 전문 인용 확보). single_redev_right→applicable=true |
| EN-3 | undefined 처리 | **undefined→house(적용)** — 레거시 회귀 0. validation CV-1 경고로 명시 선택 유도(차단 아님) |
| EN-5 | single_redev_right 판정 | 사용자 선택 신뢰 + UI hint("멸실 입주권 외 다른 주택 없을 것") |

→ 미해결 0. **Do 진입 가능.**
