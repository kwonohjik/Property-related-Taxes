# UI Design — 비상장주식 §63② 기업공개 준비 중 법인 평가 (PR-L)

> **Engine Design**: `inheritance-unlisted-stock-pre-ipo-listing-section-63-2.engine.design.md`
> **Plan**: `docs/00-pm/inheritance-unlisted-stock-pre-ipo-listing-section-63-2.plan.md`
> **범위**: **신규 input(preIpoListing)** — 토글 컴포넌트·폼 조립·Zod·validation·결과카드 분기 모두 신규. PR-G(EstimatedProfitToggle) 신규-input 패턴 차용. (PR-G2는 표시 전용이라 본 PR과 상이.)

## 0. 적용 정책 메모리

- [[feedback_toggle_card_visibility]] — ToggleCard, OFF도 tone 배경 유지
- [[feedback_no_silent_apportion_fallback]] — taxKind·신고일 미입력은 validation 차단, 자동 추론 0
- [[feedback_three_state_optional_mode_toggle]] — preIpoListing `PreIpoListingInput | undefined` (undefined=OFF / 객체=ON)
- [[feedback_date_input]] — 신고일·상장일은 `DateInput`(type="date" 금지)
- [[feedback_result_view_korean_formula]] — MAX 산식 한국어 풀어쓰기
- [[feedback_dialog_data_discard_confirm]] — 토글 OFF 시 입력 폐기 shadcn Dialog
- [[project_unlisted_capital_change_relocation]] — sectionNum prop 단일출처 (⚠ 메모리 번호와 실제 파일 상이 — Do 시 실제 재확인)
- [[feedback_explicit_prop_mapping_strip]] — 폼→v2 조립 strip 0 grep

---

## 1. 사용자 시나리오 (5건)

| # | 시나리오 | 기대 표시 |
|---|---------|----------|
| L-1 | §63② OFF (일반) | 현행 §54 보충적평가 그대로 (불변) |
| L-2 | §63② ON·윈도우 내·공모가>보충적 | 최종 1주당 = 공모가 + "기업공개 준비: MAX(공모가, 보충적평가)" 산식 |
| L-3 | §63② ON·윈도우 내·공모가<보충적 | 최종 1주당 = 보충적(MAX가 보충적 선택) + 적용 근거 표기(override 무효과 안내) |
| L-4 | §63② ON·윈도우 밖 | 현행 §54 유지 + "평가기준일이 윈도우 밖 — §63② 미적용" 경고 |
| L-5 | §63② ON + §54⑥ 동시 | §63② override(결과 변경) + §54⑥ 범위는 **보충적평가 기준** 안내(override 무오염, C3) |

---

## 2. 신규 컴포넌트 — `PreIpoListingToggle.tsx` (S-6)

`components/calc/inheritance/unlisted-stock-v2/PreIpoListingToggle.tsx`

```
ToggleCard (tone="emerald" — 양도/평가시점 정보군)
  title: "기업공개(IPO) 준비 중 법인 — §63② 특례 평가"
  description: "유가증권 신고~상장 전 기간에 평가기준일이 속하면 MAX(공모가, 보충적평가)로 평가"
  ON 시 children:
    ├ FieldCard "공모가격 (1주당)" — CurrencyInput (§57①1호 금융위 기준)
    ├ FieldCard "유가증권 신고일 (미신고 시 거래소 상장신청일)" — DateInput  ← C7 라벨
    ├ FieldCard "거래소 최초 상장일 (선택 — 미입력 시 상장 전으로 간주)" — DateInput optional
    └ 윈도우 안내 박스 (emerald/60): "[신고일 − {6개월(상속)/3개월(증여)}, 상장 전) 안에 평가기준일이 있어야 적용"
       + preview: applyPreIpoListing useMemo 결과 (withinWindow·appliedValue 미리보기)
```

- **taxKind는 폼 prop 주입**(사용자 선택 위젯 없음) — 상속/증여 마법사 구분(R-1). 윈도우 안내 박스가 주입된 taxKind에 따라 "6개월/3개월" 동적 표기.
- toggle OFF 전환 시 입력값 폐기 확인 Dialog([[feedback_dialog_data_discard_confirm]], rose-600 파괴 액션).
- testid: `pre-ipo-listing-form` / `pre-ipo-offering-price` / `pre-ipo-filing-date` / `pre-ipo-listing-date` / `pre-ipo-window-preview`.
- 정적 tone Record 매핑([[feedback_tailwind_static_tone_mapping]]).

### 2-1. preview useMemo (UI 자체 재계산 금지 — 엔진 헬퍼 직접 호출)

```ts
const preview = useMemo(() => {
  if (!value || !value.publicOfferingPrice || !value.securitiesFilingDate) return null;
  // 보충적평가(supplementary)는 부모가 effectiveInput 평가 result.finalPerShareValue(override 전) 주입,
  // 또는 preview는 윈도우 판정만(공모가·보충적 비교는 결과카드에 위임) — Do 시 단일출처 결정
  return applyPreIpoListing(value, supplementaryPerShareValue, evaluationDate);
}, [value, supplementaryPerShareValue, evaluationDate]);
```
→ `applyPreIpoListing` 엔진 헬퍼 import([[feedback_ui_engine_dual_truth_avoidance]]) — UI가 MAX·윈도우 로직 재구현 금지.

---

## 3. UnlistedStockV2Card 통합 (sectionNum 재배치, DR-2)

**현행 실제 sectionNum**(파일 기준, 메모리와 상이): 1 법인 / 3 사업연도 / 4 §56②추정이익 / 5 평가차액 / 6 순자산 / 7 영업권 / 8 §22② / 9 §54⑥ / 10 결과.

**§63② 삽입 위치 — §54⑥ 직전**(계산 순서: §54 결과 → §63② override → §63③ 할증 → §54⑥ 메타. UI 순서=계산 순서):

| 순서 | 섹션 | 변경 |
|---|---|---|
| … 7 | 영업권 | 무변경 |
| 8 | §22② 최대주주(금융재산공제) | 무변경 |
| **9 (신규)** | **§63② 기업공개 준비 (PreIpoListingToggle)** | **신규 삽입** |
| 10 (←9) | §54⑥ 평가심의위 | sectionNum +1 |
| 11 (←10) | 결과 카드 | sectionNum +1 |

> ⚠ 절대번호는 Do 시 실제 `UnlistedStockV2Card` sectionNum 재확인 후 확정([[project_unlisted_capital_change_relocation]] 메모리 번호 신뢰 금지). 본 표는 **§54⑥ 직전 삽입 + 후속 +1 시프트** 규칙만 동결.

- 부모가 `taxKind="inheritance"`(또는 gift) 주입 — `EvaluationCommitteeFilingGuideCard taxKind` 동일 패턴.
- `wrappedOnChange({ ...input, preIpoListing: next })` — store write 직접(useEffect 미러링 금지).

---

## 4. 8 동기화 지점 (DoD)

| # | 지점 | 본 PR 작업 |
|---|---|---|
| ① 폼 타입 | `UnlistedStockValuationInput.preIpoListing?` | S-1 (엔진 타입 = 폼 타입, V2는 input 직접 read/write) |
| ② initial | `createDefaultUnlistedStockV2` | preIpoListing 미설정(undefined=OFF) — 추가 불요(optional) |
| ③ normalize | `normalizeBesshiInput` | **preIpoListing.securitiesFilingDate·listingDate Date 정규화 추가 (C1)** |
| ④ API 변환 | 폼→v2 조립 (`StockValuationForm`) | preIpoListing 포함·taxKind 주입·strip 0 grep (S-5, R-4) |
| ⑤ UI 위젯 | `PreIpoListingToggle.tsx` (신규) | §2 |
| ⑥ 사이드바 | — | 비상장 V2는 사이드바 합계 비대상(결과카드 내 표시) |
| ⑦ 결과 카드 | `PerShareValuationResultCard.tsx` | §5 (MAX 분기·윈도우 밖 경고) |
| ⑧ validation | `unlisted-stock-valuation-v2.schema.ts` superRefine | 공모가>0·신고일 필수·taxKind enum (S-4, applied 의도 시) |

---

## 5. 결과 카드 (`PerShareValuationResultCard.tsx`, S-7)

`result.preIpoListingResult` 분기:

- **applied=true** (L-2/L-3): 최종 1주당 평가액 행 hint —
  > "기업공개 준비 중 (§63②1호·§57①): MAX(공모가격 {publicOfferingPrice}, 보충적평가 {supplementaryValue}) = {appliedValue}"
  - 공모가<보충적(L-3): "= 보충적평가 {appliedValue} (공모가가 더 낮아 보충적평가 적용)" 추가.
- **withinWindow=false** (L-4): emerald/amber 경고 박스 —
  > "평가기준일이 [신고일 − {windowMonths}개월, 상장 전) 윈도우 밖 — §63② 미적용, §54 보충적평가 적용"
- **§54⑥ 동시(L-5)**: §54⑥ 결과 카드(`EvaluationCommitteeResultCard`)의 범위 기준이 **보충적평가**임을 한 줄 명시 — "§54⑥ 70~130% 범위는 §54 보충적평가({supplementary}) 기준 (§63② override와 무관)". (C3 가시화.)
- 한국어 풀어쓰기·변수약어/`floor()` 금지([[feedback_result_view_korean_formula]]).

---

## 6. Cross-field / fallback

- preIpoListing은 `PreIpoListingInput | undefined` 3-state([[feedback_three_state_optional_mode_toggle]]). length-derive 아님.
- taxKind는 폼 prop → preIpoListing 객체에 주입. 사용자 토글 없음(자동 추론 금지 R-1).
- 보충적평가(supplementary) display는 엔진 result.finalPerShareValue(override 전) — UI 재계산 0. preview의 supplementary 단일출처는 Do 시 결정(§2-1).
- 날짜 정규화는 `normalizeBesshiInput`(besshi)·orchestrator(엔진) 양쪽(C1). UI는 DateInput→Date 직접.

---

## 7. Silent fallback 후보

- **없음** — preIpoListing OFF 시 현행 §54 100% 불변([[feedback_numeric_impact_verify_before_bug_claim]] 회귀 실증). 윈도우 밖·공모가≤0은 미적용+경고(자동 보정 0).

---

## 8. besshi (별지 부표3) — S-8

- §63② 전용 행 없음 → 1쪽 ⑥ 최종평가액이 override된 finalPerShareValue **자동 반영**(엔진 result echo).
- 추가 note 1줄(선택): `preIpoListingResult?.applied` **gated** — "⑥ 최종평가액은 §63②1호 기업공개 준비 특례(MAX 공모가)를 반영". testid `besshi-pre-ipo-note`.
- `normalizeBesshiInput`에 preIpoListing 날짜 정규화 추가(C1) — 미추가 시 sessionStorage 복원 후 윈도우 silent-false.

---

## 9. 브라우저 e2e (`e2e/inheritance-pre-ipo-listing.spec.ts`)

- **T-L-1 (상속·윈도우 내 override)**: 비상장 V2 정식평가 진입 → §63② ON → 공모가>보충적 입력 → 결과 최종 1주당 = 공모가 확인.
- **T-L-2 (증여 3개월 경계)**: GiftTaxForm 경유 → taxKind=gift 주입 → 신고일−4개월(상속이면 포함, 증여는 밖) → 미적용 경고 확인.
- 네비게이션: 상속 "주식·지분 추가"→"비상장주식"→"정식평가"(PR-G e2e 패턴 재사용).

---

## 10. UI senior 사전 점검 체크리스트

- [ ] 엔진 S-1~S-4 선행 완료(applyPreIpoListing·override·Zod) — 시퀀셜
- [ ] PreIpoListingToggle: ToggleCard tone="emerald", OFF도 tone 유지, DateInput 사용, 공모가 CurrencyInput
- [ ] taxKind 폼 prop 주입(상속/증여) — 사용자 위젯 없음, 윈도우 안내 동적 6/3개월
- [ ] sectionNum §54⑥ 직전 삽입 + 후속 +1 (Do 시 실제 번호 재확인)
- [ ] 결과카드 MAX 분기 + 윈도우 밖 경고 + §54⑥ 범위 기준 안내(L-5)
- [ ] normalizeBesshiInput 날짜 정규화(C1) + besshi note applied gated
- [ ] 폼→v2 조립 strip 0 grep(R-4) + Zod superRefine
- [ ] `npx tsc --noEmit` 0 + `npm test` 전수 + e2e T-L-1/2
