# Do TODO — 증여세 부담부증여 양도세 실지·환산 모드

> 설계 단일 진실: `docs/02-design/features/gift-burdened-transfer-acquisition-cost.{engine,ui}.design.md`
> Pre-Do anchor: `__tests__/tax-engine/transfer-tax/gift-burdened-transfer-acquisition-method.test.ts`
> (현재 A-회귀 3 통과 / A-K4·A-K5 8 실패 → Do 완료 시 11 전부 통과)

## 체크리스트

- [x] ① 폼 타입 `BurdenedGiftTransferTaxInput` 6필드 추가 (valuationMode·marketValueAtTransfer·acquisitionMethod·actualAcquisitionTotal·capitalExpenditure·transferExpense + landStdPriceAtTransfer)
- [x] ② 초기값 `createEmptyBgt()` + hasData() 확장
- [x] ③ normalize fallback (set() = {...bgt,...patch} 스프레드 → 별도 처리 불필요)
- [x] ④ API 변환 `buildGiftBurdenedTransferBody` — valuationMode 게이트 해제 + K-4/K-5 매핑 + 실비 **body 최상위**
- [x] A-K4·A-K5 anchor 8개 green 전환 (A-회귀 3 유지) → 11/11 통과
- [x] ⑧ validation `gift-tax-form-shared.tsx` — 산정방식 필수·실지 미입력 차단·토지 분모0 차단
- [x] ⑤ UI `BurdenedGiftTransferSection.tsx` — 평가방식·산정방식 라디오 + K-4/K-5 박스 + 토지 양도시 기준시가 (800줄 분리 → BurdenedGiftValuationModeSection.tsx)
- [x] ⑦ 결과카드 `BurdenedTransferTaxResultCard.tsx` — 3경로 산식 + §163⑧ 삭제→§176의2②2호·§163⑥ 교정
- [x] 표준모드 land 분모0 결함 수정 (validation 및 UI 위젯 추가로 해결)
- [x] 엔진 통합 anchor (A-K5 환산 50M·양도차익 148.5M·개산공제 1.5M) — 15/15 통과
- [x] 14지점 grep 자가점검 (⑫ Zod optional✓·⑬ body최상위✓·⑭ Route엔진매핑✓·§163⑧ 제거✓)
- [x] `tsc --noEmit` 0건
- [x] 전체 `npm test` 회귀 0 — 9086 통과 / 680 파일
