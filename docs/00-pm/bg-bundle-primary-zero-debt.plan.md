# 함께 부담부증여 — 첫 자산(주 자산)에 채무가 없는 묶음

> 선행: #2766 PR 본문 「고치지 않은 것」으로 기록(⑧ 통과 · ⑫ 400). 사용자 지시: 「첫 자산 채무 0 진행해」 (원인 측정 → 수정).

## 1. 사실 (실측)

함께 부담부증여 묶음에서 **채무를 컴패니언에만 입력**(주 자산 0)하면 ⑧ 은 통과하는데 요청이 `transferPrice: Too small: expected number to be >0` 로 400 이었다. 반대(주 자산에만 입력)는 200.
⑧ 의 묶음 문구도 「여러 물건을 함께 부담부증여하는 경우 채무가 설정된 물건에만 입력하면 됩니다」 라 화면 안내와 어긋났다.

## 2. 원인

- ④ `transfer-tax-api.ts` 의 `burdenedGiftPlaceholderTransferPrice` — 주 자산 `transferPrice`(Zod 기본 스키마가 `positive()` 요구)에 실는 placeholder 가 **주 자산 자신의 채무**(보증금 + 차입금)였다. 주석은 「채무 합계」라고 했으나 묶음에서는 합계가 아니었다 → 주 자산 채무 0 이면 `transferPrice: 0` → 400.
- 엔진은 부담부증여의 양도가액을 §159(A×B/C)로 다시 계산하므로 이 값을 쓰지 않는다. **실측: `transferPrice` 를 1 · 2억 · 50억으로 바꿔도 응답 전체가 같다.**
- 같은 자산 쌍에서 채무 위치만 바꾼 거울 쌍(주 0·컴 2억 ↔ 주 2억·컴 0)에 양수 placeholder 를 직접 넣으면 양도차익 97,000,000 · 증여세 523,800,000 · 증여가액 2,000,000,000 으로 **정확히 같다** — 엔진·⑫ 의 나머지 경로는 이 입력을 맞게 처리한다.
- 일반건물에는 ⑧ 이 한 겹 더 있다: `transfer-tax-validate-gb.ts` 가 자산 하나의 채무만 보고 「채무를 입력하세요」로 막았다(묶음 합계를 보는 `validateBurdenedGiftAsset` 와 달리). 그래서 일반건물 묶음은 첫 자산 채무 0 이면 ⑧ 단계에서 막혔다.

## 3. 수정

1. 공용 leaf `lib/calc/burdened-gift-assumed-debt.ts` — `burdenedGiftAssumedDebtOf`(자산 하나) · `burdenedGiftAssumedDebtTotal`(묶음 합계). ④ placeholder 와 ⑧ `contractAssumedDebtTotal`(`transfer-tax-validate-asset.ts`)이 같은 계산을 쓴다(인라인 중복 제거).
2. ④: 함께 부담부증여 묶음(축 B 아님)의 주 자산 placeholder = **신고 단위 채무 합계**. 단건·축 B 는 자기 채무 그대로. 응답에는 영향이 없다(위 실측).
3. ⑧(일반건물): `validateGeneralBuildingAsset` 에 `contractAssumedDebtTotal` 을 넘겨(`validateAssetAcquisition` 이 이미 갖고 있다) 묶음은 합계로 「채무 > 0」을 판정한다. 합계가 0 이면(어느 자산에도 채무 없음) 종전대로 막고, 문구는 `validate-bg` 와 같이 「채무가 설정된 물건에만 입력하면 됩니다」를 덧붙인다.

## 4. 검증 (`transfer.route.bg-bundle-primary-zero-debt.anchor.test.ts` 8건)

- PZ-1 오라클(거울 쌍 ±0): 주택 2건 · 주택 3건(주 자산·첫 컴패니언 0 / 컴패니언 둘에 분산) · 일반건물 2건(시가 모드) — ⑧ 이슈 0 ∧ 200 ∧ 양도차익·증여가액·증여세가 거울 쌍과 같다.
- PZ-2 placeholder: 컴패니언에만 채무가 있어도 본문 `transferPrice` 가 양수(= 합계) · 1 / 50억으로 바꿔도 응답 동일 · 단건 = 자기 채무 · 묶음 = 합계.
- PZ-3 대조: 묶음의 모든 자산 채무 0 · 단건 채무 0 은 ⑧ 이 종전대로 막는다.
- 뮤테이션: ④ 원복 → 6건 red, 일반건물 ⑧ 합계 판정 제거 → 일반건물 1건 red. 복원 `diff -q` 확인.
- 브라우저(Playwright) `e2e/bg-browser-verify.spec.ts` BV-6: 일반건물 쌍을 화면에서 끝까지 계산하고, 채무 위치만 다른 거울 쌍과 양도차익이 같다.

## 5. 범위 밖

- 주 자산이 아닌 자산에 채무가 없는 경우는 종전에도 200 이었다(변경 없음).
- 축 B(지분 분할 취득)는 카드마다 물건 전체 채무를 입력하는 규약이라 대상이 아니다.
