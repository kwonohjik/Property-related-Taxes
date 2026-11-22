# 양도세 결과뷰 리뷰 진행

생성: 2026-11-21 · 전체 157파일 / 11청크 · 기준 커밋 65493ea2b

## 처리 결과 (2026-11-23 종결)

119건(BLOCKER 5 · MAJOR 35 · MINOR 48 · NIT 31) 전부 처리했다. 세액이 바뀐 PR은 따로 표시했다. 브라우저 수동 확인은 BLOCKER 5건만 했다(나머지는 vitest anchor·뮤테이션·CI E2E).

- BLOCKER 5: #3530 · #3531 · #3532 · #3533 · #3534
- MAJOR 35: #3540~#3550
- MINOR 48: #3569 · #3570 · #3571 · #3572 · #3573 · #3576 · 사용자 결정 R-c06-04 #3581 · R-c08-12 #3580(**세액 ±1~2원**)
- NIT 31: #3592 · #3594 · #3595 · 결정 3건 #3597 · #3598 · 현행 유지 2건(R-c06-06 나머지 · R-c07-08)
- 리뷰 중 파생된 세액 후보: ①② #3552 · ⑦ #3554 · ③ #3564 · ④ #3560 · ⑤ #3563 · ⑥ #3559(+ 고지 #3577 · #3579) — **④ 세액 1원 · ⑥ 세액 변경**
- ⑲ 세액감면대상금액 줄기: 합산 PDF 장특 율 삭제 #3582 · 단건 ⑲ 표시 #3585 · §103② 기본공제 배분 엔진 #3586(**§155⑳ 다건 세액 변경**) · 형제 경로 재개발·다필지 #3590(**일괄 세액 변경**)

각 청크 파일의 R-id 본문은 리뷰 당시(65493ea2b) 기록 그대로다 — 이후 수정은 위 PR에서 확인한다.

> 범위: `app/calc/transfer-tax/**`가 import하는 결과 컴포넌트 6개(TransferTaxResultView · MultiTransferTaxResultView · mixed-use/MixedUseResultCard · BundledAllocationCard · shared/ExpandToggleButton · shared/LocalIncomePenaltyNotice)에서 시작해 `components/calc/results/**` 안으로 따라간 import 전이 폐포.
> 입력 UI(`components/calc/transfer/**`)와 증여세·주식 결과뷰 전용 파일(BurdenedTransferTaxResultCard 등 GiftTaxResultView 경유)은 범위 밖이다. 경로 사전순(LC_ALL=C) 15파일씩 끊었다.

- [x] c01 — components/calc/results/BuildingStdPriceReportSection.tsx … components/calc/results/mixed-use/MixedUseBgBundleAssetCard.tsx (15파일 · 4646줄) → 5 MAJOR / 9 MINOR / 3 NIT
- [x] c02 — components/calc/results/mixed-use/MixedUseBurdenedGiftDetailCard.tsx … components/calc/results/shared/BesshiRow.tsx (15파일 · 2778줄) → 1 BLOCKER / 4 MAJOR / 3 MINOR / 2 NIT
- [x] c03 — components/calc/results/shared/CalculationWarningsCard.tsx … components/calc/results/transfer/BurdenedGiftDetailCard.tsx (15파일 · 1696줄) → 1 MAJOR / 5 MINOR / 7 NIT
- [x] c04 — components/calc/results/transfer/BurdenedGiftFilingFormSection.tsx … components/calc/results/transfer/DetailedStatementDateItems.ts (15파일 · 2098줄) → 2 MAJOR / 6 MINOR / 3 NIT
- [x] c05 — components/calc/results/transfer/DetailedStatementFormulaBuilders.ts … components/calc/results/transfer/ExpropriationValuationCard.tsx (15파일 · 4603줄) → 6 MAJOR / 6 MINOR / 4 NIT
- [x] c06 — components/calc/results/transfer/FamilyBusinessImputedComparisonCard.tsx … components/calc/results/transfer/GbDesignatedLand77_3DetailCard.tsx (15파일 · 3629줄) → 1 BLOCKER / 2 MAJOR / 2 MINOR / 1 NIT
- [x] c07 — components/calc/results/transfer/GbPreDeemedAcquisitionBlock.tsx … components/calc/results/transfer/PreHousingDisclosureDetailSection.tsx (15파일 · 2334줄) → 4 MAJOR / 3 MINOR / 5 NIT
- [x] c08 — components/calc/results/transfer/RedevDetailRow.tsx … components/calc/results/transfer/SaleSplitJudgmentBlock.tsx (15파일 · 2659줄) → 5 MAJOR / 8 MINOR / 3 NIT
- [x] c09 — components/calc/results/transfer/SaleSplitUnenteredNotice.tsx … components/calc/results/transfer/ValuationDetailCards.tsx (15파일 · 2003줄) → 2 MAJOR / 4 MINOR / 1 NIT
- [x] c10 — components/calc/results/transfer/build-aggregate-meta.ts … components/calc/results/transfer/nbl-surcharge-exclusion-label.ts (15파일 · 1288줄) → 2 BLOCKER / 3 MAJOR / 1 MINOR / 1 NIT
- [x] c11 — components/calc/results/transfer/phd-housing-term.ts … components/calc/results/transfer/split-acq-text.ts (7파일 · 829줄) → 1 BLOCKER / 1 MAJOR / 1 MINOR / 1 NIT
