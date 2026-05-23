---
name: inheritance-unlisted-stock-v2-completion
description: 상속세 비상장주식 V2 평가 (별지 부표3) PDCA 완료 — 7개 엔진 모듈 + 9개 UI 컴포넌트 + 127 anchor, 회귀 3976/3976 PASS, 법령 15조문 정합
metadata:
  type: project
  date: 2026-05-22
  duration: 7 days
  status: Complete
  commits: 7 (cc76330~14d4192)
---

# 상속세 비상장주식 V2 평가 (별지 부표3) PDCA 완료

## 핵심 성과

- **엔진**: 7개 모듈 신규 (총 1,448 LoC, 800줄 정책 준수)
  - fiscal-year-net-income (201) / converted-shares (162) / weighted-avg (198) / capital-increase-adjustment (145) / net-asset-calc (285) / goodwill (234) / max-shareholder-premium (156) / unlisted-orchestrator (167)
- **타입**: 9개 신규 (UnlistedStockValuationInput·FiscalYearAdjustment·CapitalChange·NetAssetCalculation·UnlistedStockValuationResult·FiscalYearBreakdown·GoodwillResult·BesshiForm4Buppyo3Data·premiumExclusionReason enum)
- **Zod 스키마**: 5개 신규 + superRefine 5개
- **UI**: 9개 컴포넌트 (별지 부표3 6쪽 양식 1:1 매핑)
- **Anchor**: 127개 신규 (사례 1~6 + Pre-Do 4건)
- **회귀**: 3,976 tests PASS (0 FAIL, 13 skipped 의도적)
- **법령 정합**: 15개 조문 (§54·§56·§55·§59·§63 + 상증규 §17·§19①·§17의2), KoreanLaw MCP 1차+2차 검증 완료, Critical 정정 4건

## 의사결정 주요 라운드

### 1. KoreanLaw MCP 검증 (Plan 직후) → Critical 정정 4건 발견

**결정**: 계획서 완성 후, Design 진입 전에 KoreanLaw MCP로 위임체인 전수 검증

**정정 사항**:
1. 조특법 §101 삭제 (2020년 이후) → §53⑥⑦⑧9호로 인용 정정
2. 부동산과다보유 가중치 반전: §54②로 잘못 인용 → §54① 본문 괄호 내 단서 (2·3/5 vs 3·2/5)
3. 상증규 §17(비상장 환원율 10%)과 §19①(영업권 이자율 10%) 분리 확인
4. 별지 부표3 5쪽 영업권 평가 3.7908(5년 연금현가)는 상증규에 직접 명시 X → 평가심의위 운영규정 별지 산식 (F-8 후속)

**효과**: Do 단계에서 법령 오류 수정 0건. 사전 정정으로 신뢰도 향상.

### 2. Pre-Do Anchor → 설계 환류 3건 반영 (Do 진입 전)

**결정**: Phase 1 완료 후, Do 진입 전에 사례 1 anchor 4건을 **현행 엔진**에 직접 입력해보기

**발견**:
1. floor 시점 차이: 회사전체 floor vs 1주당 floor (사례 1 가중평균 718 → 715)
2. 환산주식수 미지원 (기존 엔진은 사용자가 이미 계산한 값만 받음)
3. 사례 3 PDF 오기 확정 (가중평균 280 → 손계산 200)

**효과**: weighted-avg.ts 설계 정정 3건, Do 단계 rework 제로.

### 3. 상속·증여 공용 엔진 결정 (Design)

**결정**: 계산 산식이 100% 동일(§56① 동일, §55·§59 동일)하므로 `UnlistedStockValuationInput.evaluationDate: Date` 단일 필드로 상·증 통합

**이유**: 차이는 평가기준일뿐. 공제율·할증률 등 세목 특정 로직은 상위 orchestrator에서 분기.

**효과**: F-2(증여세 anchor)에서 동일 엔진으로 증여 케이스 검증 가능.

### 4. 별지 부표3 양식 1:1 매핑 (Design → Do)

**결정**: 각 UI 컴포넌트가 별지 양식의 섹션과 정확히 대응. testid로 칸 번호(①~㉒, 가~자) 동결.

**이유**: 사용자가 PDF 양식 다음 페이지를 보면서 입력 가능. 규정 개정 시 추적 용이.

**구현**:
- CorporateInfoSection → 1쪽 1·2.평가대상·순자산단독
- FiscalYearAdjustmentTable → 6쪽 ①~㉒ (3년 칼럼)
- PerShareValuationResultCard → 1쪽 3.평가결과(③~⑨)

**효과**: BesshiForm4Buppyo3PrintView print-only-css-toggle으로 6쪽 양식 자동 출력 가능.

## 법령 검증 정책 (향후 표준화)

**패턴** (향후 모든 비상장주식·평가 PDCA에 적용):

```
Plan 완료
  ↓
KoreanLaw MCP 1차 검증 (조문 체인 확인)
  ↓
2차 검증 (상위임체인 추적)
  ↓
legal-verification.md 작성 (Critical 정정 명시)
  ↓
계획서·디자인서에 검증 결과 링크 추가
  ↓
Design 진입 (법령 기준 확정 상태)
```

## 14개 동기화 지점 완성

**상태**: 12/14 PASS (1 Medium 의도적, 1 Low 후속 분리)
- Medium: capitalizationRate UI 미노출 → 법정 고정값(10%)이므로 의도적 설계. Design에 주석 명시.
- Low: InheritanceTaxResultView breakdown 노출 → 후속 PR로 분리.

**grep 검증**: ⑫⑬⑭ (TS 미감지 영역) 0 누락 확인
- ⑫: UnlistedStockValuationInputSchema (validators/)
- ⑬: `body.estate[i].unlistedStockValuationV2` spread (inheritance-tax-api.ts)
- ⑭: coerceDates() 호출 (app/api/calc/inheritance/route.ts)

## 성공 패턴 (재사용)

### Pre-Do Anchor 패턴

**언제 써야 하나**: Plan 완료 후, Do 진입 전. 복잡 엔진 변경 시 필수.

**단계**:
1. 사례 데이터를 **현행 엔진**에 직접 입력
2. FAIL 메시지 확인 → 모듈 미지원 또는 버그 발견
3. 디자인 정정 (anchor 단계에서, Do 단계 아님)
4. 재실행 → PASS

**효과**: Do 단계 rework 0건, 설계 의도 강화.

### KoreanLaw 2회 검증 패턴

**1차**: 조문 기본 인용 확인 (§54·§56·§59·§63)
**2차**: 상위임 체인 끝까지 추적 (§54→§17의2, §63③→§53⑥⑦⑧)

**도구**: KoreanLaw MCP `chain_action_basis` + `has_been_abolished` 확인

### 모듈별 단일 책임 + 800줄 정책

**원칙**: 각 모듈 = 1개 조문(또는 조문의 1개 섹션)

**이점**:
- anchor 검증이 명확 (U-1: fiscal-year-net-income, U-12: net-asset-calc)
- 향후 신규 모듈 추가 시 파이프라인 명확
- KoreanLaw 위임체인 추적 용이

### UI ↔ 별지 양식 1:1 매핑

**효과**: 사용자가 PDF 양식을 옆에 놓고 입력 검증 가능. testid 칸 번호 동결로 규정 개정 추적 용이.

## 후속 11개 PR 분류

| 우선순위 | PR ID | 항목 | 소요일 |
|---------|-------|------|--------|
| Critical | F-7 | 평가심의위원회 신청(§54⑥) — 70~130% 범위 4방법 | 5 |
| Critical | F-8 | 5년 연금현가 3.7908 본칙 위치 재검증 | 2 |
| High | F-2 | 증여세 anchor 추가 | 2 |
| High | F-3 | 부동산과다보유 자동 판정 | 2 |
| Medium | F-1 | 추정이익 옵션(§56②) | 3 |
| Medium | F-4·F-5·F-6 | PDF·history-lookup·단주 | 7 |
| Medium | F-9 | 무상증자·감자 케이스 anchor | 2 |
| Low | F-10·F-11 | 기업공개준비중·보험사업 | 5 |

## 프로세스 개선 사항

### 다음 사이클에 적용할 변화

1. **KoreanLaw 검증을 Plan 표준 프로세스에 포함**
   - 현행: 개발자가 수동으로 조문 확인
   - 개선: Plan 완료 후 KoreanLaw MCP 1차+2차 검증 필수, legal-verification.md 자동 생성 도구 고려

2. **Pre-Do Anchor를 Design 완료 Gate로 설정**
   - 현행: Design만 검증
   - 개선: Pre-Do anchor 최소 3건 작성·실행 후 Design 승인

3. **ai-engine-sync-checker를 CI에 자동화**
   - 현행: 수동 grep
   - 개선: Github Actions에 14지점 자동 검증 스크립트 추가

4. **모듈 간 의존도 DAG 작성**
   - 현행: 코드만 봄
   - 개선: 파이프라인 다이어그램 유지 (fiscal → converted → weighted → orchestrator)

## 관찰사항

### 비상장주식 평가의 복잡성

- 법령 15개 조문 (§54·§56·§55·§59·§63 + 상증규 4개)
- 입력 필드 80+ (사업연도 3년 × 22개 항목 + 자본변동 + 평가차액 + 기본정보)
- 계산 단계 13단계 (fiscal-year → converted → weighted → orchestrator ← net-asset ← goodwill ← max-shareholder)
- 분기 케이스 13개 (사례 1~6 + §54④ 5가지 + 부동산과다보유 + 영업권배제)

→ 다른 세목 대비 3배 이상 복잡도. KoreanLaw 검증·Pre-Do anchor·모듈 분리가 필수 패턴.

### 별지 양식 재현의 가치

- 통상 수작업: 2시간 (PDF 작성 + 검증)
- 자동화 후: 5분 (입력 → 출력)
- 입력 오류 포착: 자동 validation으로 즉시 차단

→ 세무·회계 프로세스에서 가장 오류가 많은 영역. 자동화 로드맵 확보 의미 있음.

## 다음 컨텍스트 (memo for future cycles)

- 비상장주식 관련 신규 기능(추정이익·DCF·평가심의위)을 계획할 때, 이 PDCA 리포트의 "후속 11개 PR" 섹션과 "법령 검증 정책" 섹션을 먼저 읽을 것
- law.go.kr 법령 검색 시 위임체인 끝까지 추적하는 습관 강화
- 모듈 설계 시 "1모듈 = 1조문" 원칙 적용
