# 겸용주택 가업상속공제 잔재 (2026-11-11)

메모리 재확인(2026-11-11)에서 결함 후보로 올린 항목의 실측과 수정. 출처: `project_rental_4ho_temp_merge_gaps` 「familyBusinessInheritance 잔재」.

## 1. 경로
- ⑤ `FamilyBusinessInheritanceTransferSection` — 겸용이면 토글 `disabled`(켜기·끄기 모두). 일반 주택에서 켜 두고 겸용으로 바꾸면 값이 남고 끌 수 없다.
- ④ `transfer-tax-api.ts` — 게이트 `allowsFamilyBusinessInheritance`(취득원인·자산종류만)가 겸용을 보지 않아 그대로 싣는다.
- ⑧ 막지 않는다.
- 함께 양도 파트 카드 `app/api/calc/transfer/mixed-use-part-cards.ts` — `...companionEngine` 스프레드 후 `neutralized`에 이 키가 없어 카드마다 STEP 0.42(`transfer-tax-precalc.ts`)가 자산 전체 의제취득가액으로 취득가액을 덮는다.

## 2. 실측 (mock 세율 · 시료 = `transfer.route.mixed-primary-inherited-acquisition-dup.anchor.test.ts` 상속 6억 · 잔재 = 피상속인 취득가 1억 · 적용률 100%)

| 배치 | 잔재 없음 | 잔재 있음(종전) | 차이 |
|---|---|---|---|
| 단건 겸용 | 173,866,000 | 173,866,000 | 0 (단건 겸용 엔진은 키를 안 읽음) |
| 주 자산 겸용 + 토지 묶음 | 208,837,200 | 228,247,312 | +19,410,112 (파트 차익 −26,094,626 · −10,697,674) |
| 컴패니언 겸용 | 208,837,200 | 208,837,200 | 0 (컴패니언 ④는 안 실음) |
| 지분 60/40 | 173,866,000 | 118,787,138 | −55,078,862 (첫 지분 카드만) |

⑧은 네 배치 모두 통과했다.

## 3. 결정 (Q-1 = a 명시 해제 요구 · 사용자 2026-11-11)
- ④ `sendsFamilyBusinessInheritance` = 렌더 술어 ∧ 겸용 아님 — 겸용이면 싣지 않는다. 렌더 술어에는 넣지 않는다(섹션이 사라지면 끌 수 없다).
- ⑧ 겸용 + 잔재 → 「겸용주택은 가업상속공제 의제취득가액(§97의2④)을 지원하지 않습니다. 가업상속공제 입력을 해제하세요.」(A04와 같은 「침묵 오산보다 명시 차단」).
- ⑤ 겸용이면 켜지 못하되 끄기는 허용(`disabled={isMixedUse && !isOn}`).
- 파트 카드 `neutralized.familyBusinessInheritance = undefined` — 직접 API 호출 방어.
- 함께 고침: `housing-excess-split.ts` `suppValuedInheritedAsset`의 「④가 싣는 조건」도 새 술어.

## 4. 고정
- `__tests__/api/transfer.route.mixed-use-fb-residue.anchor.test.ts` 6건(4배치 ⑧·④·세액 · 직접 API 2배치 · 겸용 아닌 짝)
- `__tests__/components/fb-toggle-mixed-use-residue.test.tsx` 2건(끄기 허용 · 켜기 불가)
- `e2e/transfer-mixed-use-fb-residue.spec.ts` MF-E1
- 뮤테이션 4/4(④ 술어 · ⑧ · 토글 · 파트 카드 중화)
