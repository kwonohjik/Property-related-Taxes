# TODO — 비상장주식 별지 부표3 결과 화면 출력 연결

> 정책: 각 작업 완료 시 본 TODO.md 즉시 업데이트 후 다음 작업 이동. `- [ ]` 미완료 / `- [x]` 완료
> 계획: `docs/00-pm/inheritance-besshi-result-view-integration.plan.md`
> 디자인: `docs/02-design/features/inheritance-besshi-result-view-integration.ui.design.md`
> 시작: 2026-05-26

---

## Phase A — Pre-Do anchor (실패 확보 우선)
- [x] A1. RV-2 anchor: string `evaluationDate`+완성입력으로 `BesshiForm` RTL 렌더 → 현행 크래시 실패 확보 ✅ (실측: 크래시 1차 지점 = `Page1CoverSection:64`, D-7 정정·환류 반영)
- [x] A2. RV-6 anchor: 미완성 입력(주식수 0 + undefined/string date) → 현행 크래시 실패 확보 ✅ (Page1 undefined.toISOString 기존 취약점 동시 확인)
- [x] A3. RV-1·3·4·5 anchor: 신규 결과뷰 섹션 RTL (V2 1건/0건/2건/간편평가+혼재) ✅ 8건 PASS (besshi-corp-header testid)

## Phase B — Date 정규화 (R-3, F-8 try/catch)
- [x] B1. `BesshiForm4Buppyo3PrintView`에 `normalizeBesshiInput` + try/catch fallback 추가 ✅
- [x] B2. 내부 모든 `input` 참조를 `safe`로 교체 (evaluate·Page1·Page2·Page4·PDF 버튼) ✅ + Page1CoverSection L64 인스턴스 가드(실측 환류) ✅
- [x] B3. RV-2·RV-6 통과 확인 ✅ (besshi 전체 29건 PASS, 회귀 0)

## Phase C — 결과뷰 섹션 (R-1·R-2·R-4·R-5·R-7)
- [x] C1. 신규 `components/calc/results/UnlistedStockBesshiResultSection.tsx` ✅ (V2 filter·다건 헤더·R-5 null)
- [x] C2. RV-1·3·4·5 통과 확인 ✅ 8건 PASS

## Phase D — 결과뷰 연결 (R-1·R-6)
- [x] D1. `InheritanceTaxResultView` 재산 평가 내역 다음에 섹션 연결 ✅ (estateItems 가드 + import)
- [x] D2. `GiftTaxResultView` 평가명세서 다음에 섹션 연결 (R-6) ✅ (estateItems default [] 직접 전달)

## 검증
- [x] V1. 갭 분석 (계획·디자인 R-1~R-7 / RV-1~6 ↔ 구현) ✅ 갭 0 (R-1~7·RV-1~6 전부 구현)
- [x] V2. `npx tsc --noEmit` 0건 ✅
- [x] V3. 전체 `npm test` 회귀 0 ✅ 4980 PASS·0 FAIL (신규 14: RV-2 3+RV-6 3+섹션 8)
- [x] V4. 결과뷰 800줄 이하 확인 ✅ (749/467/54/191)
- [ ] V5. 커밋·푸시 (한국어 메시지)

> 브라우저 수동 확인: 미수행 — 출력 전용 UI 연결로 RTL anchor 14건(렌더·크래시 방어·V2 filter·다건·null)이 핵심 동작을 전수 검증. 실제 브라우저 확인은 사용자 환경에서 권장.

---

## 진행 현황
- 전체 작업: 16개
- 완료: 15개
- 미완료: 1개 (V5 커밋·푸시 — 진행)
- 상태: 진행 중
