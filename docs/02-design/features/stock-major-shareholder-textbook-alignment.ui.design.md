# 주식 양도소득세 — 대주주 판정 교재 정합화 UI 설계 v2

> Plan 문서: [`docs/00-pm/stock-major-shareholder-textbook-alignment.plan.md`](../../00-pm/stock-major-shareholder-textbook-alignment.plan.md) v4
> Engine 측 명세: `stock-major-shareholder-textbook-alignment.engine.design.md` v2
> 작성: 2026-05-19 (v2 — 1·2차 검토 + Plan 통합 반영)
> 범위: **Phase B UI 영향분** (벤처 자동 판정 안내·결과 뷰 신규 import) + **Phase C UI hint 9종**
> v1 → v2 변경: 결과 뷰 경로 동결 (`StockTransferTaxResultView.tsx`) + `appliedThreshold` 미import 발견 + 14지점 표 정정 + `fromDate` 활용으로 Phase A UI 변경 0건 확정

---

## Context

Phase A는 매트릭스 행 추가로 **UI 변경 없음** (단, `MajorShareholderBlock` 시기 라벨 표시 텍스트는 자동 갱신). Phase B는 비상장 벤처 시총 40억 분기 활성화로 인해 **자동 판정 안내 문구 갱신** + **결과 카드 배지 추가**. Phase C는 교재 Check Point ④·⑧·⑨·⑩·⑪·⑫·⑬·⑭·⑮ 9개 항목을 **UI hint·LawArticleModal 배지**로 안내.

엔진/타입/API/Zod/validate 변경 없음 — 14지점 동기화 부담 최소화.

---

## ★ 케이스 인벤토리 (UI 시나리오)

| # | 시나리오 | 입력 조작 | UI 기대 결과 | 검증 방식 | 상태 |
|---|---|---|---|---|---|
| UI-PHB-1 | 비상장 + 벤처 토글 ON + 시총 30억 | marketType="unlisted" / isVentureCompany 토글 ON / selfMarketCap=3,000,000,000 | 미리보기 "비대주주 자동 판정" + 안내 카드 "자동 적용 중 — 시총 임계 40억 (§167의8①2호 나목)" | 수동 + Playwright | ☐ TODO |
| UI-PHB-2 | 비상장 + 벤처 토글 ON + 시총 45억 | 동일 + selfMarketCap=4,500,000,000 | 미리보기 "대주주 자동 판정" + 결과 카드 violet 배지 "비상장 벤처기업 임계(40억) 적용" | 수동 + Playwright | ☐ TODO |
| UI-PHB-3 | 비상장 + 벤처 토글 OFF + 시총 15억 | 동일 + isVentureCompany OFF / selfMarketCap=1,500,000,000 | 미리보기 "대주주 자동 판정" + 안내 카드 "자동 적용 중 — 시총 임계 10억 (§167의8①2호)" | 수동 + Playwright | ☐ TODO |
| UI-PHB-4 | 상장 (코스피) + 벤처 토글 무관 | marketType="kospi" / isVentureCompany 무관 | 결과 카드 ruleSource = "§157", 벤처 배지 비노출 | Playwright | ☐ TODO |
| UI-PHA-1 | 시기 경계 — 2016-04-01 priorYearEndDate | priorYearEndDate=2016-04-01 / marketType=각 시장 | `appliedThreshold.fromDate === "2016-04-01"` 표시 (기존 fromDate 데이터 활용 — 신규 UI 작업 0건) | Playwright + 결과 화면 캡처 | ☐ TODO |
| UI-PHC-A1 | hint 9종 전수 노출 | MajorShareholderBlock 화면 표시 | F-11·F-15·F-16·F-17·F-18·F-19·F-20·F-21·F-22 hint 9건 모두 가시 | 수동 캡처 또는 Playwright | ☐ TODO |
| UI-PHC-A2 | LawArticleModal 배지 클릭 | 각 hint trailing 배지 클릭 | 조문/해석례 9건 정상 표시 | 수동 | ☐ TODO |

---

## STEP 0 — 사전 점검

**파일 영향 매트릭스**:

| 파일 | Phase B 변경 | Phase C 변경 |
|---|---|---|
| `components/calc/stock-transfer/MajorShareholderBlock.tsx` | `threshold` useMemo 의존성에 `form.isVentureCompany` 추가 + 벤처 안내 문구 갱신 (※ 안내 → 자동 적용 중) | hint 9종 추가 + LawArticleModal trailing 배지 9건 |
| `components/calc/results/StockTransferTaxResultView.tsx` (★ 1차 검토 동결 — 2026-05-19 grep 확인) | `appliedThreshold.isVentureRule === true` 분기 violet 배지 + `ruleSource` 조문 라벨 | (변경 없음) |
| `lib/korean-law/aliases.ts` | (변경 없음) | 미등록 조문/해석례 alias 추가 (최대 9건) |

**결과 카드 경로 1차 검토 결과 (2026-05-19 동결)**:
```bash
$ find components/calc -name "*Result*" -path "*stock*"
# → 결과 없음 (stock-transfer 디렉토리에 결과 컴포넌트 없음)
$ find components/calc/results -name "*tock*"
components/calc/results/StockTransferTaxResultView.tsx
$ grep -rln "appliedThreshold" components/calc/
# → 0건 — 현재 결과 뷰가 appliedThreshold를 import하지 않음
```

★ **중요 발견**: `appliedThreshold` 가 결과 뷰에 노출되어 있지 않음. Phase B는 **신규 import + 신규 분기 통합** 작업 (단순 "배지 추가"보다 범위 큼). 디자인 STEP 1.3 작업 항목에 import·prop 전달 명시 필요.

---

## STEP 1 — Phase B UI 영향

### 1.1 `MajorShareholderBlock.tsx` — useMemo 의존성

현재(2026-05-19 시점) `MajorShareholderBlock`의 `threshold` useMemo는 marketType·priorYearEndDate만 의존성 배열에 포함. Phase B는 `form.isVentureCompany` 추가 필수.

```tsx
const threshold = useMemo(() => {
  if (
    form.marketType !== "kospi" &&
    form.marketType !== "kosdaq" &&
    form.marketType !== "konex" &&
    form.marketType !== "unlisted"
  ) return null;
  if (!form.priorYearEndDate) return null;
  return getMajorShareholderThreshold(
    form.marketType as "kospi" | "kosdaq" | "konex" | "unlisted",
    new Date(form.priorYearEndDate),
    { isVentureCompany: form.isVentureCompany }, // ★ Phase B 신설
  );
}, [form.marketType, form.priorYearEndDate, form.isVentureCompany]); // ★ 의존성 추가
```

### 1.2 안내 문구 갱신 (★ memory [[feedback_ui_engine_dual_truth_avoidance]] 준수)

**현재** (`MajorShareholderBlock.tsx` 비상장 + 안내 영역 — 라인 번호 시점 의존):
```tsx
{form.marketType === "unlisted" && (
  <p>※ 벤처기업은 시총 임계 40억 (조특법 §16, 시행령 §167의8①2호 나목)</p>
)}
```

**갱신 후**:
```tsx
{form.marketType === "unlisted" && form.isVentureCompany && threshold?.isVentureRule && (
  <p className="text-violet-700">
    ✓ 자동 적용 중 — 비상장 벤처기업 시총 임계 <strong>40억</strong> (§167의8①2호 나목)
  </p>
)}
{form.marketType === "unlisted" && !form.isVentureCompany && (
  <p className="text-slate-500">
    적용 임계: 시총 <strong>10억</strong> (§167의8①2호). 벤처기업 해당 시 토글 ON으로 40억 임계 적용.
  </p>
)}
```

**효과**: 단순 정보 표시(※) → 실제 자동 판정 반영 사실 표시(✓)로 승격.

### 1.3 결과 뷰 통합 — `appliedThreshold` 신규 import + 분기 추가

`components/calc/results/StockTransferTaxResultView.tsx` 가 현재 `appliedThreshold` 를 사용하지 않음 (grep 0건). 따라서 다음을 **신규 통합**:

1. `result.appliedThreshold` 접근 추가 (TypeScript는 `ClassificationResult.appliedThreshold` 확장 자동 감지)
2. 대주주 판정 결과 섹션에 `isVentureRule` 분기 violet 배지 신규 추가
3. `ruleSource` 라벨 표시

```tsx
// StockTransferTaxResultView.tsx 내 대주주 섹션
{result.appliedThreshold?.isVentureRule && (
  <Badge className="bg-violet-100 text-violet-800">
    비상장 벤처기업 임계 적용 (시총 40억)
  </Badge>
)}
{result.appliedThreshold?.ruleSource && (
  <span className="text-xs text-slate-500">
    적용 규칙: {RULE_SOURCE_LABEL[result.appliedThreshold.ruleSource]}
  </span>
)}

// 라벨 매핑 (StockTransferTaxResultView 또는 별도 모듈)
const RULE_SOURCE_LABEL = {
  "§157": "소득세법 시행령 §157 (상장)",
  "§167의8①2호": "소득세법 시행령 §167의8①2호 (비상장)",
  "§167의8①2호_벤처": "소득세법 시행령 §167의8①2호 나목 단서 (비상장 벤처)",
};
```

✅ 2차 검토 동결: `result.appliedThreshold` (top-level, `types/stock-transfer.types.ts:565` 확인). 5필드 + Phase B 신설 2필드 = 7필드.

추가로 `appliedThreshold.fromDate` (이미 존재, ISO YYYY-MM-DD)를 활용하여 시기 라벨 표시 가능:
```tsx
{result.appliedThreshold?.fromDate && (
  <span className="text-xs text-slate-500">
    {result.appliedThreshold.fromDate} 이후 양도분 임계 적용
  </span>
)}
```
→ Phase A UI 변경 사실상 0건 (기존 fromDate 데이터 활용).

---

## STEP 2 — Phase C UI hint 9종

### 2.1 hint 문구 동결 (★ 문서 동결 — 변경 시 본 디자인 갱신 필수)

각 hint는 `<HintCard tone="info">` 또는 `FieldCard hint` prop으로 노출 + `FieldCard trailing` 배지로 LawArticleModal 연계.

| # | 항목 | hint 문구 | LawArticleModal alias |
|---|---|---|---|
| F-11 | 무상증자 | "당해 법인 증자로 취득한 신주(직전사업연도 종료일 현재 미상장)는 시총 산정에 포함" | 서면4팀-716, 2008.3.19. |
| F-15 | 대차주식 | "2013.2.15. 이후 대차거래는 대여자 주식으로 보아 대주주 판정 (시총·지분율에 사전 합산 입력 필요)" | 시행령 §157 (2013.2.15. 개정) |
| F-16 | 사모펀드 간접소유 | "2013.2.15. 이후 사모펀드 간접소유 주식 합산 (시총·지분율에 사전 합산 입력 필요)" | 시행령 §157 (2013.2.15. 개정) |
| F-17 | 신주인수권 | "시총 산정 시 신주인수권 포함" | 시행령 §157④, 부동산거래-526 |
| F-18 | 콜옵션·주식매수선택권 | "콜옵션·주식매수선택권은 시총 산정에서 제외" | 서면법령해석 재산 2014-22136 |
| F-19 | 자기주식 | "의결권 없는 자기주식도 발행주식총수에 포함" | 법령해석 재산 2015-2137 |
| F-20 | 우선주 | "무의결권 우선주 포함" | 서면부동산 2015-2562 |
| F-21 | 비거주자 | "특수관계 기타주주에 비거주자 포함" | 부동산거래관리-866 |
| F-22 | 전환사채 | "전환사채 가액은 시총 산정 시 제외" | 법령해석 재산 2015-0434 |

### 2.2 배치 위치 (3개 그룹)

**Group A — 시총 산정 hint 그룹** (selfMarketCap 입력 카드 하단):
- F-11 무상증자
- F-17 신주인수권
- F-18 콜옵션 (제외)
- F-22 전환사채 (제외)

**Group B — 발행주식총수 hint 그룹** (totalIssuedShares 입력 카드 하단):
- F-19 자기주식
- F-20 우선주

**Group C — 특수관계인 합산 hint 그룹** (isLargestShareholderGroup 토글 하단):
- F-15 대차주식
- F-16 사모펀드 간접소유
- F-21 비거주자

각 그룹은 `<details>` 또는 collapsible UI로 축소 가능 — 9건이 한 번에 노출 시 화면 혼잡.

### 2.3 `lib/korean-law/aliases.ts` 등록

새 조문/해석례 9건이 미등록일 가능성 → Pre-Do grep + 미등록 시 alias 추가:

```ts
// 예시
"서면4팀-716, 2008.3.19.": { lawId: "...", articleNo: "..." },
"부동산거래-526, 2010.4.7.": { lawId: "...", articleNo: "..." },
// ...
```

### 2.4 ToggleCard 색상 톤 (★ memory [[feedback_section_card_numbering]] 준수)

- Group A: sky tone (시총 영역)
- Group B: emerald tone (주식수 영역)
- Group C: amber tone (특수관계인 영역)

---

## STEP 3 — 14개 동기화 지점 중 영향 분석 (1차 검토 정정)

프로젝트 CLAUDE.md 14지점 정책 적용 (메모리 [[feedback_api_zod_schema_sync]]). Phase B/C 영향:

| # | 지점 | Phase B | Phase C |
|---|---|---|---|
| ① 폼 상태 | — | — |
| ② initial | — | — |
| ③ normalize | — | — |
| ④ API 변환 | — | — |
| ⑤ UI 위젯 | `MajorShareholderBlock.tsx` threshold useMemo 의존성 + 안내 갱신 | hint 9종 + LawArticleModal 배지 |
| ⑥ 사이드바 합계 | — | — |
| ⑦ 결과 카드 | `StockTransferTaxResultView.tsx` violet 배지 + ruleSource 라벨 (신규 import) | — |
| ⑧ validation | — | — |
| ⑨ Zod enum 메인 | — | — |
| ⑩ Zod enum 컴패니언 | — | — |
| ⑪ acquisitionDate fallback | — | — |
| ⑫ Zod 입력 객체 | — | — |
| ⑬ callAPI body spread | — | — |
| ⑭ Route handler 엔진 매핑 | — | — |

**결론**: Phase B는 ⑤·⑦ 2지점, Phase C는 ⑤ 1지점만 영향. ⑫⑬⑭ TypeScript 미감지 영역 모두 변경 없음 — grep 자가 점검은 "변경 0건" 확인용.

---

## STEP 4 — Pre-Do 강제 점검 (★ memory [[feedback_pre_anchor_verification]])

UI 디자인 Do 진입 전:

1. **결과 카드 경로 동결** — `find components/calc -name "*Result*" -path "*stock*"` 실행 → 정확한 파일명·경로를 본 문서 STEP 0 표에 명시
2. **`MajorShareholderBlock.tsx` 현행 라인 확인** — `grep -n "벤처기업" components/calc/stock-transfer/MajorShareholderBlock.tsx` 로 안내 문구 실제 위치 확인
3. **LawArticleModal alias 등록 여부** — `grep "서면4팀-716\|부동산거래-526" lib/korean-law/aliases.ts` → 미등록 시 Phase C 작업 항목에 alias 추가 명시

---

## STEP 5 — 시각 회귀 검증 (PHC-A1·A2)

Playwright .mjs 자동 회귀 또는 수동 캡처:

- **UI-PHC-A1** — `MajorShareholderBlock` 화면 캡처 → hint 9건 가시성 확인
- **UI-PHC-A2** — 각 hint trailing 배지 클릭 → LawArticleModal 9건 정상 표시
- **UI-PHB-2** — 비상장 + 벤처 + 시총 45억 → 결과 카드 violet 배지 캡처
- **UI-PHA-1** — 2016-04-01 priorYearEndDate → 시기 라벨 텍스트 확인

---

## 위험 매트릭스 (UI)

| # | 위험 | 완화 |
|---|---|---|
| RU-1 | hint 9종이 한 번에 노출되어 사용자 화면 혼잡 | 3개 그룹(Group A/B/C) + collapsible UI로 분산 |
| RU-2 | LawArticleModal alias 미등록 시 클릭 시 404 | Pre-Do grep + 미등록 alias 등록 작업 사전 명시 |
| ~~RU-3~~ | ~~결과 카드 컴포넌트 경로 가정값~~ | ✅ 1차 검토 해소 — `StockTransferTaxResultView.tsx` 동결 (2026-05-19) |
| RU-4 | 안내 문구 갱신 (※→✓) 시 토글 OFF 상태에서도 잘못 노출 | Phase B 갱신 분기에 `form.isVentureCompany && threshold?.isVentureRule` 양쪽 조건 강제 |
| RU-5 | 비상장이 아닐 때 벤처 토글이 무의미하게 활성화될 가능성 | `marketType === "unlisted"` 조건부 토글 렌더링 강제 |

---

## Definition of Done

- [ ] Phase B `MajorShareholderBlock.tsx` `threshold` useMemo 의존성 갱신
- [ ] Phase B 안내 문구 갱신 (※ → ✓ 자동 적용 중)
- [ ] Phase B 결과 카드 violet 배지 + `ruleSource` 라벨 추가
- [ ] Phase C hint 9종 추가 (F-11·F-15·F-16·F-17·F-18·F-19·F-20·F-21·F-22)
- [ ] Phase C LawArticleModal alias 9건 등록 확인
- [ ] hint 3개 그룹(Group A/B/C) 배치 + collapsible UI 적용
- [ ] UI-PHB-1~4 + UI-PHA-1 + UI-PHC-A1·A2 시각 검증 PASS
- [ ] 메모리 [[feedback_ui_engine_dual_truth_avoidance]] 정합 — 안내 문구를 자동 판정 반영 사실 표시로 승격
- [ ] 결과 카드 컴포넌트 경로 grep 동결 후 본 문서 STEP 0·STEP 4 갱신
