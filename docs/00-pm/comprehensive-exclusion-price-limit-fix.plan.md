# 종부세 합산배제 임대주택 공시가격 상한 정정 — 수정 계획서 (v2)

- **브랜치**: `feat/comp-price-limit` (worktree, base=origin/master 8641ab67, #464 C2 포함)
- **성격**: 버그 수정 + 신규 입력 필드(호수 30호). C2와 동일하게 **14 동기화 지점**에 걸침.
- **선행**: [[project_prop_comp_review_pr464]] C2(면적상한)의 후속 — 면적은 §3①로 정정했으나 **공시가격(price)은 미정정**으로 남긴 부분.

## 1. 배경 — 확정 버그 (검증 완료)
`getPriceLimit`(`comprehensive-exclusion.ts:149`)이 §3① 각 호 가목의 공시가격 상한과 불일치. 특히 **건설임대에 9억이어야 할 상한을 6억(비수도권 3억)으로 적용** → 공시 6~9억 건설임대 부당 탈락 → 종부세 과다과세(**납세자 불리**). C2(면적)와 동일 클래스.

## 2. 확정 매트릭스 (종부세 시행령 §3① — 사용자 확정 + KoreanLaw 원문)

건설(1·7호)은 **수도권 구분 없음**, 매입(2·8호)은 수도권/비수도권 구분. **호수 30호 기준** tier 존재(1·2·7·8호). 3·10·11호는 tier 없음.

| 코드 유형 | §3호 | 30호 미만 (수도권/비수도권) | 30호 이상 (수도권/비수도권) |
|---|---|---|---|
| private_construction | 1호 건설 | 9억 (무관) | 12억 (무관) |
| public_construction | 1호 건설 | 9억 (무관) | 12억 (무관) |
| public_support_construction | 7호 건설 | 9억 (무관) | 12억 (무관) |
| private_purchase_long | 8호 매입 | 6억 / 3억 | 9억 / 6억 |
| private_purchase_short | 2호 매입 | 6억 / 3억 | 9억 / 6억 |
| public_purchase | 2호 매입 | 6억 / 3억 | 9억 / 6억 |
| public_support_purchase | 8호 매입 | 6억 / 3억 | 9억 / 6억 |
| existing_rental | 3호 기존 | 3억 (무관, tier 없음) | (동일 3억) |
| private_short_term_6y_construction | 10호 | 6억 (무관, tier 없음) | (동일 6억) |
| private_short_term_6y_purchase | 11호 | 4억 / 2억 (무관, tier 없음) | (동일) |

## 3. 현재 코드 vs 정답 (수정 필요 항목)
현재 상수: RENTAL 6억/3억 · PUBLIC_SUPPORT 9억/3억 · 단기건설 6억 · 단기매입 4억/2억. getPriceLimit는 30호 tier 자체가 없음.

| 유형 | 현재 | 정답 | 판정 |
|---|---|---|---|
| private_construction·public_construction (1호) | default 6억/3억 | 9억(무관)/30호↑12억 | 🔴 불리 |
| public_support_construction (7호) | 9억/비수도권3억 | 9억(무관)/30호↑12억 | 🔴 비수도권 불리 |
| private_purchase_long·short·public_purchase (2·8호) | 6억/3억, 30호 tier 無 | 6억/3억 → 30호↑ 9억/6억 | 🟠 30호↑ 미반영 |
| public_support_purchase (8호) | 9억/3억 | 6억/3억 → 30호↑ 9억/6억 | 🔴🟠 수도권 유리+30호↑ 미반영 |
| existing_rental (3호) | default 6억/3억 | 3억(무관) | 🟠 수도권 유리 |
| 10호·11호 | 6억 · 4억/2억 | 동일 | ✅ 무변경 |

## 4. 수정 설계

### 4.1 신규 입력 필드 (§3 호수 tier 반영)
`RentalExclusionInput`(`types/comprehensive.types.ts`)에 **`isThirtyPlusUnits?: boolean`** 신설 — "합산배제 임대주택이 30호 이상인지". 기본 false(30호 미만). 1·2·7·8호에서만 의미, 3·10·11호는 무시. C2의 `isEupMyeonArea`와 동일 3중 패턴(factory=normalize=UI).

### 4.2 신규/변경 상수 (`legal-codes/comprehensive.ts`)
- 신설 `BUILT_RENTAL_PRICE_UNDER30 = 900_000_000` (건설 30호미만 9억, §3①1·7호가목1))
- 신설 `BUILT_RENTAL_PRICE_OVER30 = 1_200_000_000` (건설 30호이상 12억, 가목2))
- 신설 `PURCHASE_PRICE_OVER30_METRO = 900_000_000` (매입 30호이상 수도권 9억)
- 신설 `PURCHASE_PRICE_OVER30_NON_METRO = 600_000_000` (매입 30호이상 비수도권 6억)
- 신설 `EXISTING_RENTAL_PRICE = 300_000_000` (3호 기존 3억, 무관)
- 제거 `PUBLIC_SUPPORT_PRICE_METRO`·`PUBLIC_SUPPORT_PRICE_NON_METRO` (본 수정으로 고아화 — 건설=신설, 매입=RENTAL/신설로 이관). 내 변경이 만든 고아만 제거.
- 유지 `RENTAL_PRICE_METRO/NON_METRO`(6억/3억, 매입 30호미만)·`SHORT_TERM_6Y_PRICE_*`(10·11호).

### 4.3 `getPriceLimit(registrationType, location, isThirtyPlusUnits)` — exhaustive switch (default 제거)
```
10호 단기건설  → SHORT_TERM_6Y_PRICE_CONSTRUCTION (6억)                     [유지]
11호 단기매입  → metro 4억 / non_metro 2억                                  [유지]
3호 기존       → EXISTING_RENTAL_PRICE (3억, 무관)                          [신규]
1·7호 건설     → isThirtyPlus ? 12억 : 9억  (location 무관)                 [신규]
2·8호 매입     → isThirtyPlus ? (metro 9억 / non_metro 6억)
                             : (metro 6억 / non_metro 3억)                  [신규]
```
- exhaustive switch로 신규 유형 누락 시 TS 컴파일 오류. exact case(`.includes` 금지).

## 5. 동기화 지점 (14 — C2와 동일 범위)
- ① 타입: `RentalExclusionInput.isThirtyPlusUnits`
- ②③ store: `comprehensive-wizard-store.ts` PropertyEntry + makeProperty 초기 false + normalize `?? false`
- ④ API: `comprehensive-api.ts` rentalInfo.isThirtyPlusUnits 전달
- ⑤ UI: `ExclusionInfoInput.tsx` — "30호 이상" ToggleCard (건설·매입 유형 선택 시에만 노출, 3·10·11호는 숨김). native checkbox 금지·ToggleCard·OFF도 tone.
- ⑧ validation: `comprehensive-input.ts` Zod `z.boolean().optional()`
- 엔진: `comprehensive-exclusion.ts` getPriceLimit 매트릭스화
- 법령상수: 신설 5·제거 2
- 테스트: 신규 anchor + 기존 영향 갱신

## 6. anchor 테스트 (`__tests__/tax-engine/comprehensive-exclusion-price-limit.test.ts`)
면적·기간 등 다른 요건 통과시키고 공시가격만 검증:
- private_construction 8억(무관) → 통과 / 9.5억 → 탈락 / 30호↑ 11억 → 통과 / 12.5억 → 탈락
- public_support_construction 비수도권 8억 → 통과(기존 3억이면 탈락)
- private_purchase_long 수도권 6억 통과·6.1억 탈락 / 30호↑ 9억 통과·9.1억 탈락
- private_purchase_long 비수도권 3억 통과 / 30호↑ 6억 통과
- public_support_purchase 수도권 7억 → 탈락(기존 9억이면 통과·국고손실 정정 확인)
- existing_rental 수도권 4억 → 탈락(기존 6억이면 통과) / 3억 통과
- 10호 6억 경계 / 11호 4억·2억 경계 회귀 방어

## 7. Scope Out
- 없음(30호 tier 이번에 포함). 10·11호는 원문 6억·4억/2억 확정 → 무변경.

## 8. 검증 게이트
1. `npx tsc --noEmit` 0
2. `npx vitest run` 종부세 합산배제·통합·신규 anchor 통과
3. 미사용 상수(PUBLIC_SUPPORT_PRICE_*) grep 0건 후 제거
4. 14지점 grep 자가점검(⑤ UI 노출 조건 포함)
5. E2E(선택): 30호 토글 노출/판정 1케이스
6. pre-push 전체 회귀 → PR (**머지는 사용자 승인**)

## 9. 정책 체크
- 🔴 [[feedback_no_unfavorable_application_without_legal_basis]]: 건설 6억(불리)·비수도권 정정 핵심.
- [[feedback_store_default_vs_ui_display_fallback]]: isThirtyPlusUnits factory=normalize=UI 3중 일치.
- [[feedback_enum_substring_match_forbidden]]: exact case switch.
- [[feedback_explicit_prop_mapping_strip]]: 신규 optional 필드 spread+grep로 침묵 strip 방지.
- [[feedback_api_zod_schema_sync]]: ⑫⑬⑭ Zod·API·Route 매핑 확인.
