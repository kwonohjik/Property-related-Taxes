# 비상장주식 V2 — 자본금 변동사항 입력란 재배치 (옵션 A) Plan

> 작성일: 2026-05-26 · 세목: 상속·증여(비상장주식 정식평가 V2) · 유형: **순수 UI 재배치 (엔진 변경 0)**

## 0. 배경

비상장주식 정식평가(V2) 입력 폼에서 `자본금 변동사항`(증자·감자 이력, `CapitalChangeTable`)이
**섹션 4**로 분리되어 `사업연도별 순손익액`(섹션 3) 아래에 위치한다. 그러나 사용자 관점에서:

- `발행주식총수`·`자본금`은 **섹션 1(평가대상 법인)** 내부 필드인데, `자본금 변동사항`은 3개 섹션 아래에 있어
  **이름 근접성**(자본금 ↔ 자본금 변동)이 깨지고 발견성이 떨어진다.
- `발행주식총수(평가기준일 현재) − Σ변동 = 각 사업연도말 주식수`라는 **주식수 정합 관계**가 화면상 단절돼 있다.

→ `자본금 변동사항`을 **섹션 1 내부, `자본금` 다음·`보유 주식수` 앞**으로 이동(임베드)한다.

### 결정 근거 (논의 결과)

- "별지 부표3 완전 재현" 원칙은 **출력물(인쇄 결과/PDF)에만** 적용된다는 사용자 확인 →
  입력 폼은 서식 페이지 순서(제1쪽/제6쪽)를 따를 의무가 없으므로 재배치 가능.
- `capitalChanges`는 §56⑤(순손익액 가산·차감)과 §17의3⑤(환산주식수) **두 소비자**를 가지므로 어디에 둬도
  한쪽과는 멀어진다. 현재는 §56⑤(순손익) 곁이지만, 사용자에게 더 직관적인 §17의3⑤(주식수) 곁으로 이동.
  §56⑤ 결합은 카드 안내문(*"유상증자는 §56⑤로 이전 사업연도 순손익액에 가산"*)으로 이미 명시돼 혼선 방지됨.

## 1. 목표 / 비목표

### 목표
- `CapitalChangeTable`을 `CorporateInfoSection` 섹션 1(sky 카드) 내부로 이동: `자본금` → **[자본금 변동사항]** → `보유 주식수` 순서.
- 이동에 따라 `CapitalChangeTable`의 **자체 circle badge(`4`)만 제거**(섹션 1 하위 요소화). 다운스트림 badge·디자인 섹션 ID는 **무변경**(§2 참조 — 전역 재정렬 안 함).

### 비목표 (명시적 제외)
- **엔진·계산 로직 변경 0**. `converted-shares.ts` / `capital-increase-adjustment.ts` / `unlisted-orchestrator.ts` 무변경.
- `capitalChanges` 데이터 구조·타입·normalize·validation 무변경 (필드 위치만 이동).
- 출력물(`BesshiForm4Buppyo3PrintView` / PDF) 무변경 — 서식 재현은 그대로.
- 자본금 변동 입력 항목(유형·변동일·주식수·1주당 금액)·삭제 다이얼로그 동작 무변경.

## 2. 섹션 번호 badge 실태 (정밀 재조사 결과) ⚠️ 초안 정정

> **초안 오류 정정**: 초안은 badge가 `1→2→3→4→5→6` 연속 시퀀스라고 가정했으나, 멀티라인 추출 결과
> **badge는 UI 일련번호가 아니라 디자인 v3 문서의 섹션 ID**이며 이미 비연속·중복 상태다.
> (근거: `UnlistedStockV2Card` 주석 — 평가차액 "Section 4", §22 "Section 10", 평가심의위 "Section 11")

| 렌더 순서 | 섹션 | 컴포넌트 | 현 badge | 비고 |
|---|---|---|---|---|
| 1 | 평가대상 비상장법인 | `CorporateInfoSection` | `1` | |
| 2 | 최대주주 할증평가 | `CorporateInfoSection` | `2` | |
| 3 | §54⑤ 부동산과다 판정 | `RealEstateHeavyToggle` | `3` | ⚠️ 초안이 "번호 없음"으로 오기 |
| 4 | 사업연도별 순손익액 | `FiscalYearAdjustmentTable` | `3` | ⚠️ **기존부터 3 중복** |
| 5 | **자본금 변동사항** | `CapitalChangeTable` | `4` | ← 이동 대상 |
| 6 | 평가차액 행 입력 | `ValuationDeltaTable` | `4` | ⚠️ **기존부터 4 중복** (design Section 4) |
| 7 | 자산총액·부채총액 | `NetAssetCalculationTable` | `5` | |
| 8 | §22② 최대주주 추가공제 | `MajorShareholderStockToggle` | `10` | ⚠️ design Section 10 (튐) |
| 9 | 결과 카드 | `PerShareValuationResultCard` | `6` | ⚠️ 10 뒤에 6 (역순) |

### 번호 처리 방침 (정정)

- **재정렬(1..N) 하지 않는다.** badge는 디자인 문서 섹션 ID이므로 연속 시퀀스로 바꾸면 매핑이 깨진다.
- `CapitalChangeTable`이 섹션 1로 흡수되면 **더 이상 독립 섹션이 아니므로 자체 circle badge(`4`)만 제거**.
  - 부수 효과: 기존 4 중복(CapitalChange/ValuationDelta) 중 하나가 자연 해소됨 (목표 아님).
- **다운스트림 badge(NetAsset `5`, Result `6`) 무변경** — 디자인 섹션 ID 유지.
- 기존 3 중복·4 중복·10 튐·6 역순은 **이번 작업 범위 밖** (§9 별도 관찰 참조).

### 섹션 1 내부 필드 순서 (변경 후)

```
1. 평가대상 비상장법인 (sky 카드)
   ├─ 법인명 / 사업자등록번호 / 대표자 / 사업개시일 / 평가기준일
   ├─ 1주당 액면가액
   ├─ 발행주식총수            (평가기준일 현재)
   ├─ 자본금
   ├─ ▸ 자본금 변동사항       ← CapitalChangeTable 임베드 (amber 서브카드, 번호 badge 없음)
   └─ 보유 주식수             (피상속인·수증인)
```

## 3. 변경 파일 (3개)

### ① `components/calc/inheritance/unlisted-stock-v2/CapitalChangeTable.tsx`
- **번호 badge 옵셔널화**: `sectionNum?: number` prop 추가 (현 하드코딩 `4`(line 77) 대체).
  - prop 미전달(임베드 모드, 유일 호출처) 시 헤더의 원형 번호 `<span>`을 렌더하지 않고 제목만 표시.
  - prop 전달 시 기존처럼 원형 번호 표시 (하위호환 — 현재 전달하는 호출처는 없음).
  - 제목 "자본금 변동사항 (§56③·⑤ + §17의3⑤)"·안내문은 유지 → 섹션 1의 하위 요소로 자연스럽게 읽힘.
- amber 서브카드 스타일·"+ 변동 추가"·안내문·행 입력·삭제 다이얼로그 **전부 유지**.
- 디자인 결정: 임베드 시에도 **amber tone 유지** (반복 입력 로그임을 sky 단순필드와 구분). sky 카드 안의 amber 서브카드 = 시각적으로 자연스러운 중첩. (대안: sky로 재색조 — 채택 안 함, 구분성 저하)

### ② `components/calc/inheritance/unlisted-stock-v2/CorporateInfoSection.tsx` (현 290줄 → ~300줄, 800줄 정책 OK)
- `import { CapitalChangeTable }` + `import type { UnlistedCapitalChange }` 추가.
- Props 확장:
  ```ts
  capitalChanges: UnlistedCapitalChange[];
  onCapitalChangesChange: (next: UnlistedCapitalChange[]) => void;
  ```
- 섹션 1 sky 카드 내부, `자본금` FieldCard(현 line 200-208)와 `보유 주식수` FieldCard(현 line 209-217) **사이**에
  `<CapitalChangeTable capitalChanges={capitalChanges} onChange={onCapitalChangesChange} />` 렌더 (sectionNum 미전달 → 번호 없음).

### ③ `components/calc/inheritance/unlisted-stock-v2/UnlistedStockV2Card.tsx` (현 353줄)
- 기존 `{/* 3. 자본금 변동 */} <CapitalChangeTable .../>` 사이블링 블록(현 line 266-270) **제거**.
- `<CorporateInfoSection>`에 prop 2개 전달: `capitalChanges={input.capitalChanges}` + `onCapitalChangesChange={updateCapitalChanges}`.
  - `updateCapitalChanges` 핸들러(line 152-154) **그대로 재사용** — 정의 변경 없음.
- 최상단 `import { CapitalChangeTable }`(line 17) 제거 (CorporateInfoSection으로 이동) — 단, lint `--fix` 함정 주의(한 라인 1 named).

### ④ 디자인 문서 환류 (CLAUDE.md "디자인 갱신 없이 우회 금지")
- `docs/02-design/features/inheritance-unlisted-stock-valuation.ui.design.md` (✅ 존재 확인, 22KB · CorporateInfoSection 헤더가 §2-1·§4 참조) —
  자본금 변동사항을 섹션 1 내부로 옮긴 새 배치를 §2-1/§4에 반영.

> ❌ **다운스트림 번호 재정렬 안 함** — 초안의 "NetAsset 5→4 / Result 6→5"는 badge=디자인 섹션 ID 오해에서 비롯된 잘못된 단계로 **삭제**. NetAsset·Result badge 무변경.

## 4. 14 동기화 지점 영향 분석

순수 UI 위치 이동이므로 **⑤(UI 입력 위젯) 1개 지점만** 변경. 나머지는 데이터 경로 동일 → 무영향.

| 지점 | 영향 | 비고 |
|---|---|---|
| ① 폼 상태 / ② initial / ③ normalize | 무 | `input.capitalChanges` 동일 |
| ④ API 변환 | 무 | 동일 필드 전달 |
| **⑤ UI 위젯** | **변경** | `CapitalChangeTable` 렌더 위치 이동 (UnlistedStockV2Card → CorporateInfoSection) |
| ⑥ 사이드바 합계 | 무 | 해당 없음 |
| ⑦ 결과 카드 | 무 | `Page6NetIncomeBreakdown` 환산주식수 표시 그대로 |
| ⑧ Validation | 무 | `capitalChanges` 검증 규칙 동일 |
| ⑨~⑭ Zod/Route/엔진 | 무 | 엔진 input 매핑 동일 |

## 5. 검증 / 테스트

- [ ] `npx tsc --noEmit` 0건 (props 시그니처·import 정리 확인).
- [ ] **회귀**: `npx vitest run __tests__/tax-engine/property-valuation/` + `__tests__/tax-engine/inheritance/` 통과
      (엔진 무변경이므로 PASS 예상 — 환산주식수 `converted-shares.test.ts` · PDF 사례1 통합 그대로).
- [x] **테스트 의존 점검 (완료)**: 입력 컴포넌트(`CapitalChangeTable`/`CorporateInfoSection`/`NetAsset`)를 렌더하는 테스트 **0건**.
      `CapitalChangeTable` import는 컴포넌트 2개 파일에만 존재(테스트 없음). `besshi-form-full-replica.test.tsx`는
      출력물 `BesshiForm4Buppyo3PrintView`만 렌더. → **badge·위치 변경은 테스트 영향 0** 확정.
- [ ] **브라우저(E2E)**: 정식평가 진입 → 섹션 1에서 자본금 변동 입력란 노출 확인 → "+ 변동 추가"로 유상증자 1건 입력
      → 결과(제6쪽 환산주식수·순손익가치)가 재배치 전과 동일 산출되는지 확인.
      `feedback_browser_verify_with_playwright` 정책에 따라 `e2e/*.spec.ts`로 작성·통과 (수동 안내 대체 금지).

## 6. 리스크 / 완화

| 리스크 | 완화 |
|---|---|
| sky 카드 안 amber 서브카드 중첩이 어색 | amber tone 유지로 "반복 입력 로그" 구분성 확보. 어색하면 sky 재색조 1줄 변경으로 후속 조정. |
| ~~번호 재정렬 누락 → 시퀀스 빈틈~~ | **해당 없음** — badge는 디자인 섹션 ID라 재정렬 안 함(§2). CapitalChange badge만 제거. |
| lint `--fix`가 import 정리 시 동일 라인 named export 동반 삭제 | `CapitalChangeTable` import는 단독 라인 유지 (CLAUDE.md 함정). |
| `sectionNum` prop 오용으로 다른 호출처 영향 | `CapitalChangeTable` 호출처는 단 1곳(UnlistedStockV2Card→CorporateInfoSection로 이전) — grep 확인 완료. |

## 7. 작업 순서 (Do)

1. `CapitalChangeTable.tsx` — `sectionNum?: number` prop 추가 + 헤더 circle badge 조건부 렌더.
2. `CorporateInfoSection.tsx` — props 2개 추가 + import + 자본금/보유주식 사이 임베드(`sectionNum` 미전달).
3. `UnlistedStockV2Card.tsx` — 사이블링 제거 + CorporateInfoSection prop 전달(`capitalChanges`/`onCapitalChangesChange`) + import 정리.
4. `inheritance-unlisted-stock-valuation.ui.design.md` 환류 (✅ 존재 확인 완료 → §2-1/§4 배치 갱신).
5. `npx tsc --noEmit` → 회귀 테스트 → E2E spec.
6. 커밋 (`♻️ refactor(inheritance): 비상장 V2 자본금 변동사항 입력란 섹션1 내 재배치`).

> 다운스트림 번호 재정렬 단계는 **삭제됨** (badge=디자인 섹션 ID, §2 참조).

## 8. 범위 밖 관찰 — 기존 섹션 번호 불일치 (선택적 후속)

이번 재배치와 무관하게 **현행 badge 번호 체계가 이미 깨져 있음**을 발견 (§2 표):

- `3` 중복: `RealEstateHeavyToggle`(§54⑤) + `FiscalYearAdjustmentTable`(순손익)
- `4` 중복: `CapitalChangeTable`(자본금변동) + `ValuationDeltaTable`(평가차액)
- `10` 튐 + `6`이 `10` 뒤에 옴 (렌더 역순)

원인: badge가 **디자인 v3 문서 섹션 ID**를 컴포넌트별로 개별 부여한 결과(전역 조율 부재).
**판단 필요 사항** — 별도 작업으로 분리 권고:
- (a) badge를 화면 렌더 순서 기준 1..N **UI 일련번호로 통일** (디자인 섹션 ID 매핑 포기), 또는
- (b) 디자인 섹션 ID 유지하되 중복(3,3 / 4,4)만 정리.
- 어느 쪽이든 디자인 문서 정합이 선행돼야 하므로 본 plan에 포함하지 않음.

## 9. 참조

- 엔진: `lib/tax-engine/property-valuation/converted-shares.ts` (§17의3⑤) · `capital-increase-adjustment.ts` (§56⑤)
- 메모리: `project_unlisted_share_conversion_17_3_5` · `echo-field-pattern`
- 기존 Plan/Design: `docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md`
