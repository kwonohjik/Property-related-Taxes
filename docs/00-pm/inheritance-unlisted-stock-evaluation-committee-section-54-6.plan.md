# 비상장주식 평가 PR-K — §54⑥ 평가심의위원회 신청 옵션 (70~130% 4방법) 계획서

> **Source**: `docs/00-pm/inheritance-unlisted-stock-valuation-followup.plan.md` §3 **PR-K (F-7)**
> **Date**: 2026-05-24
> **규모**: 큰 작업 — 7~10일 (sub-PR 6단계 분해)

---

## 1. 법령 근거 (KoreanLaw MCP 검증 2026-05-24)

### 1.1 상증령 §54⑥ — 본문

> 비상장주식등을 평가할 때 납세자가 다음 각 호의 어느 하나에 해당하는 방법으로 평가한 평가가액을 첨부하여 제49조의2제1항에 따른 **평가심의위원회**에 비상장주식등의 평가가액 및 평가방법에 대한 심의를 신청하는 경우에는 제54조제1항·제4항, 제55조 및 제56조에도 불구하고 **평가심의위원회가 심의하여 제시하는 평가가액**에 의하거나 그 위원회가 제시하는 평가방법 등을 고려하여 계산한 평가가액에 의할 수 있다.

### 1.2 상증령 §54⑥ — 단서 (70~130% 범위 강제)

> 다만, 납세자가 평가한 가액이 **보충적 평가방법에 따른 주식평가액의 100분의 70에서 100분의 130까지의 범위 안의 가액**인 경우로 한정한다.

### 1.3 §54⑥ 4방법

| 호 | 한글 라벨 (UI 표시) | 영문 약어 | enum 키 |
|---|---|---|---|
| 1호 | **유사 업종 상장법인 비교평가법** — 코스피·코스닥 상장법인 주식가액 이용 (자산·매출액·사업기간 고려) | CLM (Comparable Listed Method) | `clm` |
| 2호 | **현금흐름할인법 (DCF)** — 향후 기업 현금흐름에 할인율 적용 | DCF (Discounted Cash Flow) | `dcf` |
| 3호 | **배당할인법 (DDM)** — 향후 주주 배당수익에 할인율 적용 | DDM (Dividend Discount Model) | `ddm` |
| 4호 | **기타 공정·타당 평가법** — 1~3호에 준하는 일반적으로 공정·타당 인정 방법 (사유 명시 필수) | Other | `other` |

### 1.4 상증령 §49의2 — 평가심의위원회 절차

| 항 | 내용 |
|---|---|
| ①2호 | 비상장주식등 §54⑥ 가액평가·평가방법 심의 |
| ⑤2호 | 신청 시 첨부 자료 — 보충적 평가액(가) + 불합리 근거(나) + §54⑥ 평가액(다) |
| ⑤본문 | **신청 기한** — 상속세: 신고기한 만료 **4개월 전** / 증여세: 신고기한 만료 **70일 전** |
| ⑥ | **통지 기한** — 상속세: 신고기한 만료 **1개월 전** / 증여세: 신고기한 만료 **20일 전** |
| ⑦ | 심의 고려사항 3종 (법 §63 준용·§54~§56 적정성·업종/사업규모 등) |
| ⑨ | 신용평가전문기관 의뢰 가능 — 수수료 납세자 부담 |

#### 1.4.1 신고기한 정의 (상증법 §67·§68 — KoreanLaw MCP 검증 필요 → Phase A-0)

- **상속세 신고기한 (상증법 §67①)**: 상속개시일이 속한 달의 말일부터 **6개월**
  → 신청 기한 (§49의2⑤): 상속개시일이 속한 달의 말일 + 6개월 − 4개월 = **+ 2개월**
- **증여세 신고기한 (상증법 §68①)**: 증여일이 속한 달의 말일부터 **3개월**
  → 신청 기한 (§49의2⑤): 증여일이 속한 달의 말일 + 3개월 − 70일 = **약 + 20일**
- 정확한 일자 계산은 `date-fns` `endOfMonth` + `addMonths` + `subDays` 조합 (PR-K-4에서 구현)

### 1.5 §54⑥ "보충적 평가방법에 따른 주식평가액" 정의 (단서)

§54⑥ 단서의 "보충적 평가가액"은 **할증평가(§63③ ⑧·⑨) 적용 전 ⑥** 기준 — §54·§55·§56만 의미.
- ⑥ = max(가중평균 ⑥-㉠, 순자산 하한 ⑥-㉡)  (1주당)
- 70~130% 범위 검증 대상 = **엔진 결과 `finalPerShareValue` (1주당, 할증 전)**
- ❌ 잘못된 해석: `finalPerShareForReporting` (할증 후 ⑨) 또는 `totalValuation` (총액 × ownedShares)
- ✅ 올바른 해석: **1주당 ⑥** (할증 전, 보충적 평가만) = 엔진 `result.finalPerShareValue`
- 단, 사용자 `taxpayerPerShareValuation`도 1주당 기준 입력 (총액 환산 X)

#### 1.5.1 §54④ 순자산 단독 평가 분기

§54④ 1·2·6호 (청산·사업개시 3년 미만·잔여존속기한 3년) 또는 3·5호 단서 충족 시:
- `finalPerShareValue` = ⑥-㉡ (= ④ 1주당 순자산가액 × 80%)
- 70~130% 범위는 이 ⑥-㉡ 기준 적용 → 범위 폭이 좁아짐
- 본 PR 별도 분기 없이 `finalPerShareValue` 일관 사용 (엔진 책임)

---

## 2. 작업 범위 (sub-PR 6단계 분해)

큰 작업이므로 1 PR로 처리하지 않고 6개 sub-PR로 분리. 각 단계 독립 커밋·푸시 가능.

### 2.1 PR-K-1: 엔진·타입 + 70~130% 범위 검증 (2일)

```
lib/tax-engine/property-valuation/
└── evaluation-committee-section-54-6.ts     # ★ 신규 (~150줄)
    - EvaluationCommitteeMethod 타입 ("clm" | "dcf" | "ddm" | "other")
    - METHOD_LABEL: Record<EvaluationCommitteeMethod, string> (4종 강제 — enum-verification-before-mapping)
    - EvaluationCommitteeInput 타입
      · method: EvaluationCommitteeMethod
      · taxpayerPerShareValuation: number   // ★ 납세자 1주당 평가 가액 (할증 전, §54⑥ 기준)
      · methodNotes?: string                // 평가 방법 설명 (method="other" 시 필수)
      · evaluatorOrganization?: string      // 평가 수행 기관 (회계법인·세무법인 등)
    - EvaluationCommitteeResult 타입
      · isWithinRange: boolean              // 70~130% 범위 여부
      · supplementaryPerShareValuation: number  // 보충적 1주당 평가가액 (= finalPerShareValue, 할증 전 ⑥)
      · lowerBoundPerShare: number          // 70% = Math.floor(supplementary × 0.7)
      · upperBoundPerShare: number          // 130% = Math.floor(supplementary × 1.3)
      · taxpayerPerShareValuation: number
      · deviationPct: number                // (taxpayer − supplementary) / supplementary × 100, 소수 2자리
      · method: EvaluationCommitteeMethod
      // ❌ methodLabel 미포함 — derived (UI가 METHOD_LABEL[method] lookup, Design §2)
      ·  // 이중 진실 회피 — Result는 method만 보존
      · warnings: Array<{reason: "out_of_range_below"|"out_of_range_above"|"zero_supplementary"|"other_method_missing_notes", message: string}>
      · appliedLegalBasis: string           // "상증령 §54⑥ + §49의2"
    - validatePerShareRange(supplementary, taxpayerPerShareValuation): 결과
      · lowerBound = Math.floor(supplementary × 0.7)  (이하 포함 — 70% 정확히 = 통과)
      · upperBound = Math.floor(supplementary × 1.3)  (이하 포함 — 130% 정확히 = 통과)
      · lowerBound ≤ taxpayerPerShareValuation ≤ upperBound
    - applyEvaluationCommittee(input, supplementaryPerShareValuation): EvaluationCommitteeResult
      · supplementary ≤ 0 → warnings.zero_supplementary + isWithinRange=false
      · method="other" + !methodNotes → warnings.other_method_missing_notes (validate에서도 차단)
      · 범위 밖 → warnings.out_of_range_below/above + isWithinRange=false
      · 범위 안 → isWithinRange=true (옵션 적용 가능)

lib/tax-engine/types/unlisted-stock-valuation.types.ts            # 수정
    - UnlistedStockValuationInput.evaluationCommittee?: EvaluationCommitteeInput
    - UnlistedStockValuationResult.evaluationCommitteeApplied?: EvaluationCommitteeResult
    - UnlistedStockValuationResult.finalPerShareValueWithCommittee?: number (옵션 적용 시)

lib/tax-engine/property-valuation/unlisted-orchestrator.ts        # 수정
    - input.evaluationCommittee 있을 때만 applyEvaluationCommittee 호출
    - 본 결과(finalPerShareValue·totalValuation)는 무변경 — 옵션 적용은 별도 noted
    - appliedRules에 §54⑥ 인용 푸시
```

**anchor 13건** (`pr-k-1-evaluation-committee.test.ts`):
- K-1-1: METHOD_LABEL 4종 한글 라벨 강제 (Record 타입)
- K-1-2: 4방법 enum 외 값 입력 시 타입 에러 (compile-time)
- K-1-3: 범위 정확히 70% (이하 포함 — 경계, supplementary=10,000 → lower=7,000, taxpayer=7,000 통과)
- K-1-4: 범위 정확히 130% (이하 포함 — 경계, taxpayer=13,000 통과)
- K-1-5: 70% 미만 (6,999) → warnings.out_of_range_below + isWithinRange=false
- K-1-6: 130% 초과 (13,001) → warnings.out_of_range_above + isWithinRange=false
- K-1-7: deviationPct 계산 (taxpayer 9,500 vs supplementary 10,000 → -5.00%)
- K-1-8: 보충적 평가가액 = 0 시 zero_supplementary warnings
- K-1-9: orchestrator 통합 — result.evaluationCommitteeApplied 노출 + supplementaryPerShareValuation === finalPerShareValue (할증 전 ⑥)
- K-1-10: 본 결과 무변경 — finalPerShareValue·totalValuation·premiumPerShare (할증 적용)
- K-1-11: appliedRules에 "상증령 §54⑥ + §49의2" 인용
- K-1-12: 빈 입력 (evaluationCommittee=undefined) → undefined (회귀 보호)
- K-1-13: method="other" + methodNotes 누락 → warnings.other_method_missing_notes (엔진 측 검증, validate에서도 차단)

### 2.2 PR-K-2: Zod schema + validate (0.5일)

```
lib/validators/unlisted-stock-valuation-v2.schema.ts              # 수정
    - evaluationCommittee 필드 추가
      · method: enum ["clm", "dcf", "ddm", "other"]
      · taxpayerValuation: number().positive()
      · methodNotes?: string().optional()
      · evaluatorOrganization?: string().optional()

lib/calc/inheritance-validate.ts                                  # 수정
    - validateUnlistedStockV2에 evaluationCommittee 검증 추가
      · method "other" 시 methodNotes 필수 (사유 명시 강제)
```

**anchor 4건**:
- K-2-1: Zod 정상 통과 (4방법 각각)
- K-2-2: method enum 외 값 차단
- K-2-3: taxpayerValuation 음수 차단
- K-2-4: validate "other" + methodNotes 누락 차단

### 2.3 PR-K-3: UI 토글·입력 폼 (2일)

```
components/calc/inheritance/unlisted-stock-v2/
└── EvaluationCommitteeToggle.tsx           # ★ 신규 (~250줄)
    - 3-state 토글: "off" (기본) / "draft" (입력 중) / "submitted" (신청 완료)
    - 4방법 RadioCardGroup (clm·dcf·ddm·other)
    - taxpayerValuation 입력 (CurrencyInput)
    - methodNotes 입력 (textarea) — method="other" 시 필수
    - evaluatorOrganization 입력 (회계법인·세무법인 등)
    - 신청 기한 자동 계산 안내 (상증법 §67·§68 신고기한 + §49의2⑤ 역산)
    - 자격 = 두 조건 동시 충족: (a) 70~130% 범위 충족 (b) 신청 기한 내

UnlistedStockV2Card.tsx                     # 수정
    - 새 섹션 11: EvaluationCommitteeToggle 통합 (§22② 자동 도출 아래)
    - input.evaluationCommittee read/write
```

**anchor 6건**:
- K-3-1: RadioCardGroup 4옵션 렌더
- K-3-2: method="other" 시 methodNotes textarea 활성화
- K-3-3: 토글 OFF→ON 전환 시 default values
- K-3-4: 토글 ON→OFF 전환 시 evaluationCommittee=undefined (dialog 확인 패턴 차용)
- K-3-5: taxpayerValuation 음수 차단
- K-3-6: 입력값 onChange → input.evaluationCommittee 머지

### 2.4 PR-K-4: 70~130% 범위 시각화 + 결과 카드 (1.5일)

```
components/calc/inheritance/unlisted-stock-v2/
└── EvaluationCommitteeRangeIndicator.tsx   # ★ 신규 (~180줄)
    - 시각 막대 (Range Slider 스타일 — 입력 전용 아닌 표시 전용)
      · 보충적 평가가액 (중앙 — 100%)
      · 70% 하한 + 130% 상한 (회색 경계)
      · 납세자 평가가액 위치 (점/배지)
      · 범위 안 → emerald / 범위 밖 → rose
    - 보충적 평가가액 표시 (㈜A 100,000원)
    - 70% 하한 표시 (70,000원)
    - 130% 상한 표시 (130,000원)
    - 납세자 평가 (95,000원) — 95% (정상)

components/calc/inheritance/unlisted-stock-v2/
└── EvaluationCommitteeResultCard.tsx       # ★ 신규 (~150줄)
    - 결과 카드 (옵션 적용 시 노출)
      · 적용 방법 라벨 + appliedLegalBasis 인용
      · 범위 검증 결과 (✅ 통과 / ❌ 범위 밖)
      · deviationPct 표시 (보충적 대비)
      · 평가심의위 신청 자격 안내
      · 신청 기한 카운트다운 (남은 일수)
```

**anchor 9건**:
- K-4-1: Range Indicator 70%·130% 표시
- K-4-2: 납세자 평가가액 위치 표시 (deviation % 기반 위치 계산)
- K-4-3: 범위 안/밖 색조 변경 (emerald/rose)
- K-4-4: 결과 카드 옵션 적용 시만 노출 (evaluationCommittee=undefined 시 미노출)
- K-4-5: deviationPct 한글 표시 ("보충적 대비 5% 낮음" 등)
- K-4-6: 신청 기한 카운트다운 — 상속세 (상속개시일 + 2개월)
- K-4-7: 신청 기한 카운트다운 — 증여세 (증여일 말일 + 약 20일)
- K-4-8: 신청 기한 경과 시 음수일 표시 + rose 경고 ("기한 초과 N일")
- K-4-9: 보충적 평가가액 = 0 시 Range Indicator placeholder 안내 + 입력 disabled

### 2.5 PR-K-5: 신고서 안내 카드 (1일)

```
components/calc/inheritance/unlisted-stock-v2/
└── EvaluationCommitteeFilingGuideCard.tsx  # ★ 신규 (~120줄)
    - §49의2⑤ 첨부 자료 체크리스트 3종
      · (가) 보충적 평가액 + 부속서류
      · (나) 보충적 평가액 불합리 근거 자료
      · (다) §54⑥ 평가 결과 + 부속서류
    - 신청 기한 안내 (§49의2⑤ — 상속 4개월 전 / 증여 70일 전)
    - 통지 기한 안내 (§49의2⑥ — 상속 1개월 전 / 증여 20일 전)
    - §49의2⑨ 신용평가전문기관 의뢰 옵션 안내 (수수료 납세자 부담)
    - §49의2⑦ 심의 고려사항 3종 안내
```

**anchor 3건**:
- K-5-1: 체크리스트 3행 렌더
- K-5-2: 기한 안내 상속·증여 분기
- K-5-3: 신용평가전문기관 안내 표시

### 2.6 PR-K-6: 동기화 점검 + RTL + 통합 (2일)

- 14 동기화 지점 전수 점검 (ui-engine-sync-checker)
- RTL 통합 anchor 10건 (UnlistedStockV2Card 토글 작동·범위 시각화·결과 카드·신고서 안내)
- 사례 6 회귀 0건 보장 (case-5a 18 + besshi-form 15 + PR-I 8 + PR-H 20 + PR-J 11 + PR-P 11 + 신규 ~30)
- 한국어 커밋 메시지

---

## 3. 케이스 매트릭스 (전체 ~45 anchor)

| sub-PR | anchor 수 | 핵심 검증 |
|---|---|---|
| PR-K-1 | 13 | 70~130% 범위·4방법·deviationPct·orchestrator 통합·other methodNotes |
| PR-K-2 | 4 | Zod 4방법 enum·"other" 시 methodNotes 강제 |
| PR-K-3 | 6 | RadioCardGroup·textarea·toggle 전환 |
| PR-K-4 | 9 | Range Indicator·결과 카드·신청 기한 카운트다운(상속·증여·음수일) |
| PR-K-5 | 3 | 첨부 체크리스트·기한·신용평가전문기관 안내 |
| PR-K-6 | 10 | RTL 통합·14지점 점검·전체 회귀 |
| **합계** | **45** | |

---

## 4. Definition of Done

### 4.1 sub-PR별 독립 DoD

각 sub-PR은 다음 6항목 모두 충족 시 독립 커밋·푸시 가능:
- [ ] 해당 sub-PR anchor 모두 통과
- [ ] 기존 회귀 0건 (직전 sub-PR 합산 anchor 포함)
- [ ] `npx tsc --noEmit` 0건
- [ ] 800줄 정책 (신규 파일 ≤ 250줄)
- [ ] 한국어 커밋 메시지 + commit prefix `✨ feat: 비상장주식 평가 PR-K-{N} — ...`
- [ ] sub-PR이 도입한 신규 동기화 지점은 본 단계 내 완결 (다음 sub-PR로 미루지 않음)

### 4.2 전체 PR-K 완료 DoD (PR-K-6 통과 시점)

- [ ] sub-PR 6건 모두 완료
- [ ] 45 anchor 모두 통과
- [ ] 기존 4,791 PASS 회귀 0건
- [ ] 14 동기화 지점 전수 동기화 (ui-engine-sync-checker 통과)
- [ ] **policy-check skill 사전 호출** (memory 인덱스 4정책 사전 인식)
  · `enum-verification-before-mapping` (4방법 Record 강제)
  · `mirror-pattern` (토글 OFF→ON cross-field 동기화)
  · `dialog-data-discard-confirm` (토글 OFF 전환 시 데이터 폐기 확인)
  · `three-state-optional-mode-toggle` (off/draft/submitted)
- [ ] KoreanLaw MCP 인용 박스 — §54⑥·§49의2·§67·§68 모두 design 문서에 첨부
- [ ] 브라우저 수동 확인 — Range Indicator 시각 작동 + 4방법 입력 + 결과 카드 + 신청 기한 카운트다운

---

## 5. 리스크 / 비고

- **본 PR은 옵션 강제 적용 안 함**: 평가심의위 통지 결과는 외부 절차이므로 우리 엔진이 자동 적용 불가. 본 결과(보충적 평가가액·`totalValuation`)는 무변경, 옵션 적용 가능성·범위 검증·신청 안내만 제공.
- **신용평가전문기관 입력 별도**: PR-G(추정이익 §56②)에서도 신용평가전문기관 평균 사용 — 두 PR이 동일 평가기관 입력을 공유할 가능성 있음. 현재 PR-G 미구현 → PR-K 독립 진행.
- **§49의2⑤ 기한 정확도**: 상속세 신고기한(=상속개시일 + 6개월) - 4개월 = 상속개시일 + 2개월. 증여세 신고기한(=증여일이 속한 달의 말일 + 3개월) - 70일. 정확한 일자 계산 필요 — date-fns 활용.
- **4방법 결과값 검증 불가**: 사용자가 입력한 `taxpayerValuation`의 산식·정확성은 외부 평가기관 책임. 우리 엔진은 70~130% 범위 검증만.
- **§54⑥ "보충적 평가방법"의 정의**: §54④ 순자산 단독 평가 적용 케이스에서 보충적 평가가액 = 순자산가액(⑥-㉡). 본 PR은 `result.finalPerShareValue` (1주당 ⑥, 할증평가 ⑧ 적용 전)를 보충적 평가가액 기준으로 사용. §1.5.1 분기 참조.
- **보충적 평가가액 = 0 케이스**: 실무 거의 없지만 (totalShares=0·ownedShares=0·평가 입력 손상 등) 가드 필수. K-1-8 anchor에서 `zero_supplementary` warnings + isWithinRange=false 강제. UI는 Range Indicator placeholder 표시 (K-4-9).
- **PR-K-1 Zod 임시 정책**: K-1 단계에서 Zod schema 미적용 (또는 z.unknown()) → K-2에서 4방법 enum·methodNotes 강제 적용. K-1 단독 진입 시 inheritanceTaxApiRoute에 도달하면 silent strip 가능성 → K-1 완결 직후 K-2 즉시 진입 강제.

---

## 6. 후속 PR (본 PR 범위 외)

- N-K-1: 평가심의위 통지 결과 입력 + 자동 적용 (외부 절차 완료 후 사후 입력 모드)
- N-K-2: 신용평가전문기관 평균 자동 계산 (PR-G와 cross-cutting)
- N-K-3: PDF 신고서 §49의2⑤ 첨부 체크리스트 출력 (PR-J 확장)
- N-K-4: 신청 기한 임박 알림 (상속개시일 + 잔여 일수 push notification)

---

## 7. 작업 분해 합계

| 단계 | 시간 |
|---|---|
| PR-K-1 (엔진·타입·anchor 12) | 2일 |
| PR-K-2 (Zod·validate·anchor 4) | 0.5일 |
| PR-K-3 (UI 토글·입력 폼·anchor 6) | 2일 |
| PR-K-4 (범위 시각화·결과 카드·anchor 7) | 1.5일 |
| PR-K-5 (신고서 안내·anchor 3) | 1일 |
| PR-K-6 (RTL 통합·동기화 점검·anchor 10) | 2일 |
| **합계** | **9일** |

권장 진행 순서: PR-K-1 → PR-K-2 → PR-K-3 → PR-K-4 → PR-K-5 → PR-K-6 (시퀀셜 — 각 단계가 다음 단계 의존)

### 7.1 sub-PR 의존 그래프

```
PR-K-1 (엔진·타입·orchestrator)
    ↓ depends on
PR-K-2 (Zod schema + validate — 엔진 타입 필요)
    ↓ depends on
PR-K-3 (UI 토글·입력 폼 — Zod·validate 통과 필요)
    ↓ depends on
PR-K-4 (Range Indicator·결과 카드 — UI 폼 데이터 read·result.evaluationCommitteeApplied 필요)
    ↓ parallel
PR-K-5 (신고서 안내 — K-3·K-4와 독립, 정적 카드)
    ↓ depends on (전체)
PR-K-6 (RTL 통합·14지점 점검·전체 회귀)
```

K-5는 K-3·K-4와 병렬 가능하지만, 시퀀셜 순서 유지 (단순화).

---

## 8. 승인 요청

본 계획서로 6 sub-PR 시퀀셜 진행 승인 부탁드립니다. 주요 결정 사항:

1. **6 sub-PR 분해** — 큰 작업 1 PR 폭주 방지 + 각 단계 독립 검증
2. **본 결과 무변경 정책** — 평가심의위 통지는 외부 절차 → 우리 엔진은 옵션 적용 가능성·범위 검증·신청 안내만
3. **70~130% 범위 강제 검증** — Math.floor 일관 (지방세 절사 정책 동일)
4. **4방법 Record 강제** (memory `enum-verification-before-mapping`)
5. **3-state 토글** (memory `three-state-optional-mode-toggle`) — off/draft/submitted
6. **신청 기한 자동 계산** — date-fns + 상속·증여 분기

PR-K-1부터 진행할까요?
