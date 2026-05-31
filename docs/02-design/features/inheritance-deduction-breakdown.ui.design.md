# 상속공제 항목별 펼침 — UI 설계

> 계획: `docs/00-pm/inheritance-deduction-breakdown-expandable.plan.md`
> 엔진: `inheritance-deduction-breakdown.engine.design.md`

## Context

결과 화면 "상속공제 상세 내역"(`InheritanceTaxResultView.tsx:583~668`)의 각 공제 Row에 펼침(▼)을 추가, 클릭 시 엔진 detail을 교재(이미지42~43) 표/산식으로 표시. 결과뷰 **현재 800줄 = 정책 한도** → 섹션 분리 선행 필수.

## 사용자 시나리오

1. 결과 화면 "상속공제 상세 내역" 펼침(기존) → 각 공제 항목 Row 목록.
2. 특정 공제(예 ③배우자) Row 우측 **▼** 클릭 → 그 공제의 계산 근거 표(법정상속분 7행 + 실제상속액 3행 + Max[Min] 산식) 인라인 펼침.
3. detail이 없는 항목(미입력·legacy·단순케이스 일부)은 ▼ 미표시.

---

## 컴포넌트 분리 트리

```
components/calc/results/
├── InheritanceTaxResultView.tsx          800 → ~580줄 (헬퍼·섹션 이관)
│   · 상속공제 섹션 → <DeductionBreakdownSection> 1줄 위임
└── deduction-breakdown/
    ├── shared.tsx                         Row·formatBillion·LawBadge (+re-export 보존)
    ├── DeductionBreakdownSection.tsx      헤더 토글 + 항목 목록 + DeductionLimitNoticeCard
    ├── LumpSumDetailCard.tsx              ① 비교표 5행
    ├── SpouseDeductionDetailCard.tsx      ③ 법정상속분 7행 + 실제상속액 3행 + Max[Min]
    ├── FinancialDeductionDetailCard.tsx   ④ 순금융재산 구성 + 산식
    ├── CohabitDeductionDetailCard.tsx     ⑤ Min[가액×율,6억]
    ├── FamilyBusinessDetailCard.tsx       ② 한도표(기존 Row 흡수)
    ├── FarmingDeductionDetailCard.tsx     영농(기존 Row 흡수, re-export)
    └── DeductionLimitDetailCard.tsx       ⑥ Min(합계,한도) + ㉯ 4행
```

분리 후 모든 파일 ≤800. **`FarmingDeductionDetailRow` export 경로 보존**(`feedback_800line_split_export_preservation`).

---

## 각 공제 펼침 표 디자인 (한국어 풀어쓰기·"원" 단위 미표기·floor 묵시)

### ① 일괄공제 — `LumpSumDetailCard` (`lumpSumComparisonDetail`)
조건: `chosenMethod === "lump_sum"`. 표: 기초공제 200,000,000 / 그 밖의 인적공제 100,000,000 / 소계 300,000,000 / 일괄공제 500,000,000 / **적용(Max) 500,000,000**. 문구: "기초+인적공제 합계보다 일괄공제가 크므로 일괄공제 적용 (§21①)".

### ② 가업상속공제 — `FamilyBusinessDetailCard` (`familyBusinessDetail`)
한도표 3행(10년↑300억/20년↑400억/30년↑600억) + 영위연수→적용한도 + 공제액. 자격미충족 시 rose 사유 목록(기존).

### ③ 배우자공제 — `SpouseDeductionDetailCard` (`spouseDeductionDetail`)
- ㉮ 법정상속분 7행(`legalShareTable` 有 시): 총상속재산 7,030,000,000 / +사전증여 2,260,000,000 / −유증 500,000,000 / −공과금·채무 1,200,000,000 / −비과세 0 / =상속재산가액 7,590,000,000 / 법정지분액 3,092,857,142. `legalShareTable` undefined(단순케이스) → 법정상속분 단일값만.
- ㉯ 실제상속액 3행(`actualAmountTable`): 상속재산가액 3,300,000,000 / −채무 500,000,000 / =실제액 2,800,000,000.
- 산식: `Max[Min(㉮ 3,092,857,142, ㉯ 2,800,000,000, ㉰ 30억), 5억] = 2,800,000,000`.

### ④ 금융재산공제 — `FinancialDeductionDetailCard` (`financialDeductionDetail`)
- 순금융재산 구성(rows): 예금 2,100,000,000 / 상장주식 150,000,000 / 보험금 50,000,000 / 소계 2,300,000,000 / (−)금융채무 1,145,000,000 / 순금융재산 1,155,000,000.
- 산식: ㉠ 1,155,000,000×20%=231,000,000 / ㉡ 한도 200,000,000 / Max[Min(㉠,㉡),2천만]=200,000,000. tier 안내문.
- **기존 `FinancialDeductionCountRow`**(L73~, §22 대상 자산/채무 카운트 + 법§22② 최대주주 제외 안내 = 이미지41 빨간 줄)를 이 카드로 **흡수**. rows[]가 4행 분해를 대체하되, 최대주주 제외 안내문은 유지.

### ⑤ 동거주택공제 — `CohabitDeductionDetailCard` (`cohabitDeductionDetail`)
공시가격 800,000,000 / 공제율 100% / Min(800,000,000, 6억)=600,000,000. 율은 deathDate(2020.1.1.~ 100%).

### ⑥ 적용한도 — `DeductionLimitDetailCard` (`deductionLimitDetail`)
- ㉮ 한도대상 합계 4,600,000,000 / ㉯ 한도액 5,965,000,000 / 적용 Min=4,600,000,000.
- ㉯ 4행: 과세가액 8,775,000,000 − 유증 500,000,000 − 상속포기 0 − (사전증여 2,960,000,000 − 증여공제 600,000,000 − 재해손실 50,000,000)=2,310,000,000.
- **기존 `DeductionLimitNoticeCard`**(§24 한도 초과 `wasCapped` 시에만 경고 노출)와 역할 구분: DeductionLimitDetailCard는 **항상 ⑥ 표**(한도 미초과 시도 산식 표시), `wasCapped` true 시 "한도 초과 — 공제 제한" 강조 행 추가. 기존 NoticeCard 로직을 본 카드로 통합.

---

## 펼침 UX

- **각 공제 Row 우측 ▼ 버튼 + 인라인 펼침** (기존 섹션 토글과 동일 패턴). 각 카드 `useState(false)` 독립.
- ToggleCard 미적용(결과 표시 — 입력 분기 아님). detail `undefined` 시 ▼ 숨김.
- 색상: 펼침 영역 `bg-muted/30` 또는 항목별 tone. 표는 `divide-y text-xs` (기존 Row 패턴).

---

## result detail 소비 매핑 (breakdown 파싱 금지 — 엔진 detail 단일 진실)

| 카드 | 소비 필드 | undefined 처리 |
|---|---|---|
| LumpSum | `lumpSumComparisonDetail` | chosenMethod≠lump_sum 시 카드 숨김 |
| Spouse | `spouseDeductionDetail`(legalShareTable?·actualAmountTable?) | legalShareTable 無→7행 생략, deduction 0→숨김 |
| Financial | `financialDeductionDetail`(rows[]) | financialDeduction 0→숨김 |
| Cohabit | `cohabitDeductionDetail` | cohabitationDeduction 0→숨김 |
| FamilyBusiness | `familyBusinessDetail`(기존) | undefined→숨김 |
| DeductionLimit | `deductionLimitDetail` | 항상(공제>0 시) |

---

## 14개 동기화 지점 — ⑦ 결과 카드 중심

result detail(서버→클라) 확장만 → ①~④⑥⑧⑨~⑭ **무영향**. ⑦ 결과 카드: DeductionBreakdownSection + 7개 DetailCard 신규(detail 소비). ⑤ 입력 위젯·⑥ 사이드바 불변.

---

## 작업 순서 (엔진 선처리 → UI)

1. (엔진) detail 타입·6함수·orchestrator patch + anchor GREEN
2. (UI 단계0) 결과뷰 800줄 분리 — shared + DeductionBreakdownSection (re-export 보존) → tsc 0
3. (UI 단계1) 7개 DetailCard 펼침 구현 (detail 소비)
4. (Check) 회귀 0 + E2E(각 공제 펼침 → 교재값 표시) + 브라우저 수동
