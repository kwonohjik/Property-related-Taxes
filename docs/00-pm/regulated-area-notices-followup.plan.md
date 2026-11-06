# 계획·구현 기록 — 조정대상지역 안내·표시 후속 (B 묶음)

> 2026-11-06 · 기준 master `8004bc2da`(#2942 머지 뒤) · 사용자 지시 「안내·표시 수정해」
> 선행: #2909 · #2919 · #2926(결과 화면 고지) · #2942(판정 메뉴 주소 문자열 판정)
> 상태: **구현(Do)**

## 0. 대상 다섯 건과 결론

| # | 항목 | 출처 | 결론 |
|---|---|---|---|
| 4 | 판정 메뉴 결과 화면에 「조정대상지역 판정 — 확인 필요」 없음 | `judgment-menu-regulated-area-address.plan.md` V-2 | **고침** — 1주택·다주택 중과 결과 단계에 같은 줄 |
| 5 | 결과 화면 고지가 PDF에 없음 | `regulated-area-assumption-notice.plan.md` V-2 | **고침** — 양도세 PDF(단건·일괄·다건)에 항상 싣는다 |
| 6 | 법정동코드 경로 「지정 지구 안인가」 미선언 고지 현황 | 같은 계획서 V-3 | **결함 아님(실측)** — §1 |
| 7 | 이력에서 다시 연 결과에 고지가 뜨는가 | 같은 계획서 V-1 | **결함 아님(코드 확인)** — §1 |
| 8 | 첫 자산 변경 안내 조정대상지역 과노출 | `regulated-area-skip-step4-sync-judgment.plan.md` V-7 | **고침** — §2 |

## 1. 결함 아님으로 닫은 두 건

- **6번 (실측 · throwaway probe — 계산기 ④ → route)**: 반송동(`4159710200`, 2019.11.8.~2020.6.18. 동탄2택지개발지구만 지정) · 2020-01-15 취득 · 거주 0 · 1주택.
  | 지구 선언 | 세액 | 결과 `warnings` |
  |---|---|---|
  | 미선언 | 243,903,000 | 「… 「동탄2택지개발지구」만 조정대상지역이었는데, 지구 안인지 고르지 않아 조정대상지역으로 판정했습니다(확인 필요) — 소재지 아래에서 「지구 안·밖」을 고르세요.」 |
  | 지구 밖 | 0(비과세) | 없음 |
  | 지구 안 | 243,903,000 | 없음 |
  엔진 고지(`lib/tax-engine/one-house/designated-district-undeclared.ts`)가 계산기 경고와 판정 메뉴 「판정하지 않은 부분」에 공용이다. 판정 메뉴는 E2E `one-house-judgment-designated-district.spec.ts` DD-2가 고정한다.
- **7번 (코드 확인)**: 이력 「다시 열기」는 저장된 입력을 계산기 store에 복원하고 1단계로 보낸다(`lib/calc/transfer-resume-entry.ts:160-163` · 다건은 `:114-119`). 결과는 다시 계산해 같은 결과뷰가 그리며, 고지 줄은 그 store의 폼을 읽는다(`TransferTaxResultView.tsx:188`). 이력 전용 결과 화면은 없다.

## 2. 고친 세 건

### 4번 — 판정 메뉴 결과 화면

- `OneHouseJudgmentCalculator.tsx`(선례 `SameDayOrderLine` 바로 아래) · `MultiHouseSurchargeCalculator.tsx`(결과 단계 위)에 `RegulatedAreaAssumptionLine` — 같은 leaf `regulatedAddressAssumptions`.
- 할 일 문구의 위치만 다르다: 계산기 「보유 상황」 · 판정 메뉴 「② 양도 대상 주택」(`selectWhere` prop).

### 5번 — PDF

- 문구를 `lib/calc/regulated-area-assumption-text.ts` 한 곳으로 모았다(화면 줄·PDF 공용).
- 결과뷰 3곳(`TransferTaxResultView` · `BundledAllocationCard` · `MultiTransferTaxResultView`)이 `inputData.regulatedAreaAssumptions`(`regulatedAssumptionPdfGroups` — 같은 leaf)를 넘기고,
  `ResultPdfDocument`가 양도세 섹션 다음에 `RegulatedAssumptionPdfNote`를 그린다. 화면 줄이 `PrintSection` 밖이라 항상 인쇄되듯 **항목 선택과 무관하게** 싣는다.
- 겸용(`MixedUseResultCard`)은 자체 PDF 생성이 없다(grep) — 단건 결과뷰의 PDF에 포함된다.
- 범위 밖: 선례 두 줄(「같은 날 양도 순서」·「판정에서 넘겨받음」)도 PDF에 없다 — 이번에는 조정대상지역 줄만 싣는다.

### 8번 — 첫 자산 변경 안내

- `first-asset-facts.ts` `firstAssetFactGroups`의 `regulated` 범위가 「코드 없음」만 봤다. #2909 뒤로 ④는 코드가 없어도 주소 문자열이 있고 그 축을 직접 만지지 않았으면 새 첫 자산 주소로 다시 판정한다 —
  그 축의 저장값은 새 첫 자산으로 새지 않는다(같은 파일 테스트의 「실측 연결」 LEAK 표가 이미 「만짐 표지만 샌다」로 고정).
- 이제 축마다 「저장값 `true` · 주소 판정이 아님」일 때만 묶음에 넣는다(`regulatedAddressVerdicts` — #2942 leaf).

## 3. 검증

- 신규 `__tests__/calc/regulated-area-notices-followup.ui.test.tsx` 9건(A-1~A-3 · P-1~P-4) · `first-asset-facts.anchor.test.ts` L-8.
- 시료 정리(단언 그대로): `first-asset-facts.anchor.test.ts` L-1 두 건·N-1·V-* 고정 폼, `first-asset-change-notice.anchor.test.tsx` W-1·Step4 카드 폼 — 「사용자가 고른 값」 의도대로 만짐 표지를 더했다.
- 뮤테이션 6/6(첫 자산 범위 · 축 판정 · PDF 렌더 · PDF label · 판정 메뉴 위치 문구 · PDF 빈 묶음 필터).
- E2E `judgment-menu-regulated-address.spec.ts` RA-3(시·도 생략 → 판정 메뉴 결과 고지 · 「② 양도 대상 주택」) · RA-4(정식 주소 → 없음) + 관련 스펙(`transfer-first-asset-removal` · `regulated-area-assumption-notice`) 8건 통과.
