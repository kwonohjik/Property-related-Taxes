# 작업 TODO — 비상장주식 주식수 환산(§17의3⑤) 충실도·견고성 개선

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> Plan: `docs/00-pm/inheritance-unlisted-stock-share-conversion-robustness.plan.md`
> Design: `docs/02-design/features/inheritance-unlisted-stock-share-conversion.engine.design.md`
> 시작: 2026-05-25

---

## Pre-Do — 현행 동작 관찰 (anchor 선작성)
- [x] P1. SC-2(다년도)·SC-4(감자) anchor 작성 → 현행 PASS 기준선 확보 ✅
- [x] P2. SC-6b(odd-product 대용량) anchor 작성 → **현행 FAIL 관찰 확인** (133,333,330 ≠ 133,333,331, round-down off-by-1) ✅
- [x] P3. 현행 관찰 = 디자인 예측 일치 (SC-2/4/6 PASS, SC-6b FAIL) ✅

## PR-1 — calcConvertedShares 충실 재구현
- [x] R1. `calcConvertedShares` 6단계 알고리즘 재구현 (윈도우 필터 + 연도별 누적 + safeMultiplyThenDivide) ✅
- [x] R2. no-op 루프(`converted = converted;`) 제거 ✅
- [x] R3. 오케스트레이터 인라인 블록 → `calcConvertedShares()` 단일 진입점 교체 ✅ (SC-6b PASS 전환 확인)

## PR-2 — 입력 모순 검증 + 경고
- [x] V1. 체인 모순·prior≤0 검증 → warning (자동 보정 금지, throw 금지) ✅
- [x] V2. 윈도우 밖 변동 "환산 제외 N건" warning ✅
- [x] V3. `appliedRules`에 "§17의3⑤ 환산 — 윈도우 내 N건" 메타 추가 ✅

## PR-3 — anchor 매트릭스 완성
- [x] A1. SC-1·3·5·7·8·9 anchor 작성 ✅
- [x] A2. EQ(결과동일성) anchor — 재구현=현행 bit-identical ✅
- [x] A3. INT(통합) anchor — `evaluateUnlistedStockV2` downstream ⑤ 불변 ✅

## 검증 게이트
- [x] G1. 신규 anchor 13건 전부 PASS (재구현 후) ✅
- [x] G2. `npx tsc --noEmit` 0건 ✅
- [x] G3. `npx vitest run __tests__/tax-engine/property-valuation/` 회귀 0 ✅ (176 PASS)
- [x] G4. 전체 `npm test` 회귀 0 ✅ (319파일 4910 PASS·0 FAIL)
- [x] G5. 800줄 정책 확인 — converted-shares.ts 140줄 / orchestrator 298줄(−9) ✅
- [x] G6. `convertedShares` 참조 컴포넌트 — Page6:41 `fy.convertedShares` 정상 표시 ✅

## 미결 — 외부/사용자 결정 (별도, 구현 비차단)
- [x] Q1. KoreanLaw 불균등 증자 환산 해석례 확인 → **검색 미발견, 본칙 §17의3⑤(count-only) 적용** ✅
- [x] Q2. SC-8 평가연도 변동 §17의3⑤ 확인 → **검색 미발견, §56③ 구조상 환산 대상(SC-8 통과)** ✅
- [x] Q3. UI 경고 노출 위치 → **디폴트 채택: UI 작업 0** (주 결과 카드 렌더, 사용자 override 가능) ✅
- [x] Q4. 동일 사업연도 복수증자 → **running 잔고 순차 적용 구현 + SC-10 통과** ✅

---

## 진행 현황
- 전체 작업: 19개 (구현 15 + 미결 4)
- 완료: 19개
- 미완료: 0개
- 상태: **완료 ✅**

## 자가 점검 (완료 보고 전)
- [x] 구현 15 + 미결 4 모두 처리 + TODO `[x]` 갱신
- [x] anchor 14건 PASS (SC-1~10 + 6b + EQ + INT 2)
- [x] tsc 0건 / property-valuation 186 PASS / 전체 4910 PASS·0 FAIL
- [x] 800줄 정책 (converted-shares 140줄)
- [x] KoreanLaw §56③·⑤·§17의3⑤ verbatim 검증 + 추정 인용 0
- [x] 미완료 0개 확인 후 완료 선언
- [ ] git 커밋·push (사용자 요청 시 — 미요청이라 보류)
