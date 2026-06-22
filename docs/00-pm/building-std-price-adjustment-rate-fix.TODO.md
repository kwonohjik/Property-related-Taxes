# 건물 기준시가 보완 — Do 실행 TODO (완료)

> 계획: docs/00-pm/building-std-price-adjustment-rate-fix.plan.md (13단계 검토 완료)

## Pre-Do anchor ✅
- [x] A1 WS-2 단일 상증 floorArea·adjustmentItems (실패 확보 → GREEN)
- [x] A2 WS-1 115.5%=1.155 (max 규칙 정상 — 통과 확인)
- [x] A3 WS-5 통나무조 maxFloors 제외 (1.3 실패 확보 → 0.90 GREEN)

## WS-2 엔진 echo ✅
- [x] calcPointBreakdown 반환 floorArea
- [x] selectSpecialAdjustment export
- [x] 단일 상증 valuation.adjustmentItems 부착

## WS-5 통나무조 최고층수 제외 ✅
- [x] AdjustmentContext.structureKey?
- [x] selectSpecialAdjustment solid_wood 제외
- [x] computeAdjustmentRate ctx.structureKey 주입
- [x] 모달/폼 structureKey prop

## WS-1 조정률 모달 표시 ✅
- [x] [A] 지붕 라벨 확대 + 주석·ADJUSTMENT_FEATURE_LABEL[1] 슬래브
- [x] [B] II 연면적 read-only 자동표시
- [x] [C] 미리보기 적용내역 breakdown (describeSpecialAdjustment 재사용)

## WS-4 이력 영속화 ✅
- [x] CalculationRecord.buildingStdSnapshots?
- [x] use-auto-save: 3세목 id-presence 필터 추출
- [x] HistoryClient.handleResume re-hydrate
- [x] 저장 스키마 strip 없음 확인(Omit 자동포함) / contentHash 제외(input·result만 해시)

## WS-3 결과탭 서식 (3세목 동시) ✅
- [x] BuildingStdPriceReportSection (재유도 공용 + hasBuildingStdReport)
- [x] 양도/상속/증여 결과뷰 렌더 + availablePrintIds
- [x] print sections 3세목 등록 (building-std-report)

## 검증 게이트 ✅
- [x] npx tsc --noEmit 0
- [x] npx vitest run 전체 9217 통과 / 0 실패
- [x] eslint 변경파일 0 errors
- [ ] **브라우저/E2E 미수행** — WS-3 결과탭 서식 렌더·WS-4 이력 왕복은 tsc+단위테스트+검증된 함수 재사용으로 확인. Playwright E2E는 별도 권장(memory feedback_browser_verify_with_playwright).

## 후속(범위 외 — 본 PR 미포함)
- WS-3 서버 PDF(pdf 채널) — 현재 SCREEN(브라우저 인쇄)만. ResultPdfDocument react-pdf 버전 별도.
- 이력 복원 서식 = 현재 세션/동반저장 스냅샷 기반. 구(舊) 이력(스냅샷 없는 레코드)은 graceful 미표시.
