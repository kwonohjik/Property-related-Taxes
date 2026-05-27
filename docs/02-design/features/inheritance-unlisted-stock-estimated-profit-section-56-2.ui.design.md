# UI Design — 비상장주식 §56② 추정이익 갈음 평가 옵션 (PR-G)

> **Engine Design**: `inheritance-unlisted-stock-estimated-profit-section-56-2.engine.design.md`
> **Plan**: `docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md`
> **분담**: 엔진 시니어 S-1~S-4(+EP anchor) / UI 시니어 S-5~S-8(+e2e). 본 문서 = UI 시니어 책임 명세.
> **유사 패턴**: `EvaluationCommitteeToggle`(§54⑥) — ToggleCard + RadioCardGroup + Dialog 폐기 + sectionNum 단일출처. 본 토글이 그대로 차용.

## 0. 적용 정책 메모리 (사전 정독)

- [[feedback_three_state_optional_mode_toggle]] — 본 건은 **단순 ON/OFF**(객체 존재 여부), 배열 length-derive 아님
- [[feedback_dialog_data_discard_confirm]] — OFF 전환 시 shadcn Dialog (window.confirm 금지)
- [[enum-verification-before-mapping]] — reasonCode→라벨 `Record<EstimatedProfitReasonCode,string>` 정적
- [[feedback_no_silent_apportion_fallback]] — 요건 미충족 자동 갈음·0채움 금지
- [[feedback_useeffect_store_mirror_forbidden]] — cross-field는 onChange/useMemo, useEffect→store 금지
- [[feedback_result_view_korean_formula]] — 결과 산식 한국어 풀어쓰기
- [[feedback_select_on_focus]] · [[feedback_decimal_input]]/[[CurrencyInput]] · [[feedback_section_card_numbering]] · [[project_unlisted_capital_change_relocation]](sectionNum 단일출처)

---

## 1. 사용자 시나리오 (4건)

| # | 시나리오 | 기대 동작 |
|---|---------|----------|
| S-1 | 일반 비상장주식 평가(추정이익 미사용) | 토글 OFF — 기존 가중평균 경로 100% 불변 |
| S-2 | 합병으로 최근 3년 순손익 비정상 → 추정이익 갈음 | 토글 ON → 사유 3호 선택 → 기관 2개 추정이익 입력 → 절차 3체크 → 순손익가치 갈음 |
| S-3 | 토글 ON했으나 기관 1개만 입력 | validation 차단(둘 이상) + 인라인 경고, 결과 미갈음 |
| S-4 | 증여세 비상장주식에 동일 옵션 | `GiftTaxForm` 경유 동일 토글·동일 갈음 |

---

## 2. 컴포넌트 구조

### 2-1. 신규 컴포넌트 — `EstimatedProfitToggle.tsx` (≤ 약 200줄)

`components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle.tsx`

```
ToggleCard tone="violet" (§56② 특례 — 사치/특례 violet 관례, OFF도 tone 유지)
 └ ON 시 펼침:
    ① RadioCardGroup — §17의3① 사유 7종 (reasonCode)
       라벨: Record<EstimatedProfitReasonCode, string> 정적 매핑
       2호 "자산수증이익 등 50% 초과" / 3호 "합병·분할·주요업종 변경" /
       4호 "§38 합병증여이익 산정" / 5호 "1년 이상 휴업" /
       6호 "유가증권·유형자산 처분손익 50% 초과" / 7호 "정상 매출발생 3년 미만" /
       8호 "고시 유사 사유"
    ② 동적 기관 추정이익 행 (≥2) — CurrencyInput[] + 행 추가/삭제 버튼
       각 행: "기관 N — 1주당 추정이익" (CurrencyInput, parseAmount, onFocus select)
       최소 2행 고정 노출(삭제는 2행까지). 추가 버튼으로 N행
    ③ 절차 3요건 체크박스 (ToggleCard 아닌 단순 check + 라벨)
       □ §56② 2호 — 신고기한까지 추정이익 평균가액 신고
       □ §56② 3호 — 산정기준일·평가서작성일이 신고기한 이내
       □ §56② 4호 — 산정기준일·상속개시(증여)일 동일 연도
    ④ 미리보기 (계산 가능 시): "추정이익 평균가액 X ÷ 환원율 10% = 순손익가치 Y"
 └ ON → OFF: 입력 데이터 있으면 Dialog 확인 후 estimatedProfit=undefined 폐기
```

`value: EstimatedProfitInput | undefined` (undefined=OFF) / `onChange` / `sectionNum?` props. DEFAULT_INPUT = `{ reasonCode: "merger_split_business_change", agencyEstimates: [0,0], filed...:false ×3 }`.

### 2-2. `UnlistedStockV2Card.tsx` 통합 + 섹션 재번호 (S-6)

| 현행 | 신규 |
|---|---|
| 1·2 CorporateInfoSection | 1·2 (불변) |
| 3 FiscalYearAdjustmentTable | 3 (불변) |
| **—** | **4 EstimatedProfitToggle (신규, FiscalYear 직후)** |
| 4 ValuationDeltaTable | **5** |
| 5 NetAssetCalculationTable | **6** |
| 6 GoodwillPanel | **7** |
| 7 MajorShareholderStockToggle | **8** |
| 8 EvaluationCommitteeToggle | **9** |
| 9 PerShareValuationResultCard | **10** |

`sectionNum` prop **단일출처**(UnlistedStockV2Card에서 각 컴포넌트에 명시 전달) 일괄 +1. testid·badge DOM순 회귀 anchor 필수.

---

## 3. 8 동기화 지점 (S-1~S-8) — 엔진 design §UI위임 동기화

| # | 지점 | 파일 | 담당 |
|---|---|---|---|
| S-1 | type | `types/unlisted-stock-valuation.types.ts` (`estimatedProfit?` + `estimatedProfitResult?`) | 엔진 |
| S-2 | 신규 엔진 모듈 | `property-valuation/estimated-profit-section-56-2.ts` | 엔진 |
| S-3 | orchestrator 갈음 + echo | `unlisted-orchestrator.ts` | 엔진 |
| S-4 | Zod superRefine | `validators/unlisted-stock-valuation-v2.schema.ts` | 엔진 |
| S-5 | 폼→v2 조립 (estimatedProfit 포함) | 폼 상태/`EstateItem` 조립부 + `lib/calc/stock-valuation.ts`(whole-object 전달=안전) | **UI** |
| S-6 | UI 토글 + 섹션 재번호 | `EstimatedProfitToggle.tsx` + `UnlistedStockV2Card.tsx` | **UI** |
| S-7 | 결과 카드 산식 | `PerShareValuationResultCard.tsx` | **UI** |
| S-8 | besshi 표시 (제6쪽 7.차) | `besshi-form-constants.ts` + besshi view + `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` | **UI** |

> ⚠️ S-5 침묵 strip 가드: mediator는 `evaluateUnlistedStockV2(v2)` whole-object 전달이라 안전. **위험점은 폼이 `item.unlistedStockValuationV2`를 조립할 때 estimatedProfit 누락** → 조립부 grep 전수([[feedback_explicit_prop_mapping_strip]]). Zod에 estimatedProfit 정의돼야 parse strip 0.

---

## 4. Cross-field 동기화 (useEffect→store 금지 선언)

- 미리보기(④)의 "추정이익 평균가액·순손익가치"는 **useMemo로 `applyEstimatedProfit` 호출**(엔진 헬퍼 재사용 [[single-source-engine-helper]]). store에 쓰지 않음.
- 토글 ON/OFF·행 추가/삭제·사유 선택·체크는 모두 **onChange로 부모 `onChange(next)`** 단방향. useEffect 미러링 0.

---

## 5. Silent fallback 후보 식별

- 기관 1개·빈 배열 → **자동 2개 채움 금지**, validation 차단(S-3 시나리오).
- 사유 미선택 → 자동 선택 금지(default는 OFF 시 미적용이므로 무해, ON 시 명시 선택 강제).
- 절차 3체크 일부 false → 자동 true 금지, 갈음 안 함 + warning.
- 음수 추정이익 → 0 자동 치환 금지(§56② override, warning만).

---

## 6. UI 순서 = 엔진 계산 로직 순서

엔진 STEP 5(순손익가치 산출) → **§56② 갈음**(STEP 5 직후) → STEP 6~8. UI도 FiscalYear(순손익 입력, 섹션3) **직후 섹션4**에 추정이익 토글 배치 — 갈음이 일어나는 로직 위치와 화면 위치 일치.

---

## 7. 결과 카드 산식 (`PerShareValuationResultCard`, S-7)

결과카드는 `evaluateUnlistedStockV2(input)` useMemo 재호출 → `result.netIncomePerShare`(갈음값) **자동 반영**. 추가 표시:

- `result.estimatedProfitResult?.applied === true` 시:
  > **§56② 추정이익 갈음 적용** (사유: {reason 라벨})
  > 추정이익 평균가액 {estimatedProfitAverage} (기관 {agencyCount}개 평균) ÷ 환원율 10% = 1주당 순손익가치 {netIncomePerShare}
- `applied === false` (토글 ON·요건 미충족) 시: amber 안내 — "요건 미충족으로 추정이익 갈음 미적용, 가중평균 순손익가치 적용" + warnings 나열
- 영업권>0 동시 시: "§59③ 영업권 추정이익 준용 미반영(실제 순손익 기준)" fine-print

산식 한국어 풀어쓰기 — 변수 약어·`floor()` 표기 금지.

---

## 8. 사이드바 합계 표시

추정이익 갈음은 **1주당 평가액(→ totalValuation)에만 영향** → 기존 비상장주식 평가액 합계 항목이 자동 갱신. 신규 사이드바 항목 없음(0원·null 미표시 정책 유지).

---

## 9. zustand / 입력 통합

- `EstateItem.unlistedStockValuationV2.estimatedProfit` 경로로 저장. V2 입력은 기존 Flat 폼 상태 → v2 객체 조립 경로 재사용([[feedback_flat_vs_nested_form_field_decision]]).
- 자동저장·이력 복원 시 `estimatedProfit` 보존(partialize 포함). Date 필드 없음(전부 number·boolean·enum)이라 date-coerce 무관.

---

## 10. 케이스 인벤토리 (Engine Design §1 동기화)

UI 검증 대상은 엔진 9행 중 UI 경로 관여분:

| Engine row | UI 검증 |
|---|---|
| 1·2 갈음 산식 | 미리보기 ④ 표시값 = 결과카드 순손익가치 일치 |
| 3 기관 1개 미충족 | S-3 validation 차단 + 인라인 경고 |
| 4 절차 false | 체크 해제 시 갈음 미적용 안내 |
| 5 §59³ warning | 결과카드 fine-print 노출 |
| 8 reason 7종 | RadioCardGroup 7옵션·라벨 누락 0 |
| 9 회귀 | 토글 OFF 시 기존 결과 불변 |

---

## 11. 브라우저 e2e (Playwright — [[feedback_browser_verify_with_playwright]])

`e2e/inheritance-estimated-profit.spec.ts`:
1. 상속 — V2 평가 진입 → 추정이익 토글 ON → 사유 3호 → 기관 2개(1,000·1,400) → 절차 3체크 → 결과 순손익가치 12,000 확인
2. 증여 — `GiftTaxForm` 동일 경로 1 시나리오
3. OFF 전환 시 Dialog 확인 → 데이터 폐기 → 결과 가중평균 복귀

claude-in-chrome·수동 안내 금지. spec 통과로 충족.

---

## 12. 후속 PR (UI 범위 한정)

- PR-G2: 영업권 §59³ 추정이익 준용 (결과카드 영업권 패널 갱신 포함).
- PR-G4: 평가서(신용평가기관) 첨부 파일 메타 — 기관별 라벨/명칭 입력 확장.

---

## 13. UI senior 작업 시작 전 사전 점검 체크리스트

- [ ] 엔진 S-1~S-4 선행 완료 확인(타입·모듈·orchestrator·Zod) — 시퀀셜 위임
- [ ] `EvaluationCommitteeToggle` 패턴 복제 기준 확정(ToggleCard·Dialog·DEFAULT_INPUT)
- [ ] sectionNum 단일출처 일괄 +1 + testid·badge DOM순 anchor
- [ ] 폼→v2 조립부 grep으로 estimatedProfit strip 0 확인 (S-5)
- [ ] 결과카드 `estimatedProfitResult` echo 읽기 + applied 분기 3종(적용/미적용/§59³)
- [ ] besshi 화면 + PDF 제6쪽 7.차 표시 연결 (공유 상수)
- [ ] e2e 상속 1 + 증여 1
- [ ] `npx tsc --noEmit` 0 + `npm test` 전수
