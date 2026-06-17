# 1세대1주택 비과세 §154① 단서 각호 — UI 설계

> 엔진 설계: `one-house-exemption-154-proviso.engine.design.md`
> 계획서: `docs/00-pm/one-house-exemption-154-proviso.plan.md`
> 폼 FLAT / 엔진 nested (`feedback_flat_vs_nested_form_field_decision`). UI 8개 동기화 지점 담당.

## Context

보유<2년(또는 조정취득 거주<2년)인 1세대1주택자가 **수용·해외이주·국외거주·부득이·임대5년거주·조정공고전계약** 사유로 양도 시 §154① 단서로 보유/거주 요건을 면제받는 입력 경로가 전무. 거주기간 입력 직후 단계에 사유 선택 UI를 추가한다.

## 사용자 시나리오

1. 1세대1주택 + 보유 2년 미만 → 기존엔 "비과세 미충족"만 표시. 신규: "보유·거주 요건 면제 사유가 있나요?" 노출.
2. 사유 선택(예: 해외이주) → 사유별 추가 입력(출국일) 조건부 노출 → 비과세 결과 + 단서 호 라벨.
3. 사유 없음(기본) → 종전 동작(회귀).

## 위젯 — `ExemptionProvisoSection` (`components/calc/transfer/`)

배치: `ResidencePeriodSection` 직후(거주기간 → 면제사유 = 계산 로직 순서, `feedback_ui_order_follows_logic`). 섹션 카드 tone=`violet`(특례/예외 안내 관행). 부모 컴포넌트는 `ResidencePeriodSection`을 렌더하는 동일 자산-수준 블록/Step(Do 진입 시 정확 렌더처 grep 확인 — `rg ResidencePeriodSection components app`).

```
┌─ ⑨ §154① 단서 — 보유·거주 요건 면제 (선택) ──────────── [violet] ─┐
│  보유 2년(조정취득 거주 2년) 미달이라도 아래 사유면 비과세 가능        │
│                                                                      │
│  면제 사유  (RadioCardGroup, 미선택 기본)                            │
│   ○ 해당 없음            ○ 공익사업 수용 (2호가)                      │
│   ○ 해외이주 (2호나)      ○ 국외거주·취학·근무 (2호다)                │
│   ○ 부득이 사유 (3호)     ○ 임대주택 거주5년 (1호)                    │
│   ○ 조정 공고 전 계약 (5호, 거주만 면제)                              │
│                                                                      │
│  ── 사유별 조건부 입력 (선택된 사유에만 노출) ──                      │
│  [수용]   사업인정 고시일 [DateInput]  수용일 [DateInput]            │
│           hint: 고시일 전 취득 + 양도일·수용일부터 5년 내             │
│  [해외이주/국외거주]  출국일 [DateInput]                              │
│           hint: 출국일 현재 1주택 + 출국일부터 2년 내 양도            │
│  [부득이]  거주기간(위 입력) 1년 이상 필요 — 별도 입력 없음           │
│  [임대]    거주기간(위 입력) 5년 이상 필요 — 별도 입력 없음           │
│  [5호]     계약금 지급일 현재 무주택 (체크) + 증빙 보관 안내          │
└──────────────────────────────────────────────────────────────────┘
```

- 사유 라디오: `RadioCardGroup`(native 금지, OFF도 tone 유지 `feedback_toggle_card_visibility`).
- 날짜: `DateInput`(`components/ui/date-input.tsx`, `type="date"` 금지 `feedback_date_input`).
- 형식 설명은 `FieldCard` `hint`(placeholder 숫자 예시 금지).
- 조건부 노출은 **선택 사유 기준 useMemo 파생**(useEffect→store 미러링 금지 `feedback_useeffect_store_mirror_forbidden`).

## ① 폼 FLAT 필드 (`lib/stores/calc-wizard-store.ts`)

```ts
provisoReason: "" | "rental_5yr_residence" | "expropriation" | "overseas_migration"
             | "overseas_residence" | "unavoidable" | "pre_designation_contract";  // "" = 미선택
provisoDepartureDate: string;       // YYYY-MM-DD
provisoExpropriationDate: string;
provisoBusinessApprovalDate: string;
provisoPreContractNoHouse: boolean; // 5호 무주택 선언
```
- **② initial**: `provisoReason: ""`, 날짜 3종 `""`, `provisoPreContractNoHouse: false` (`calc-wizard-store.ts:189-190` 인근).
- **③ normalize**: migration에서 string/boolean 보장(undefined→""/false).

## ④ API 변환 (FLAT → nested, `lib/calc/transfer-tax-api.ts` + `multi-transfer-tax-api.ts`)

`temporaryTwoHouse` 조립 패턴(`transfer-tax-api.ts:460-469`) 차용:
```ts
...(form.provisoReason
  ? { oneHouseExemptionProviso: {
        reason: form.provisoReason,
        ...(form.provisoDepartureDate ? { departureDate: form.provisoDepartureDate } : {}),
        ...(form.provisoExpropriationDate ? { expropriationDate: form.provisoExpropriationDate } : {}),
        ...(form.provisoBusinessApprovalDate ? { businessApprovalDate: form.provisoBusinessApprovalDate } : {}),
      } }
  : {}),
```
> 날짜는 string으로 전달 → ⑭ Route에서 `toDate` 변환(엔진 Date 전제). 5호 `provisoPreContractNoHouse`는 **UI-only 게이트**(엔진 미전달 — dual-truth 아님): 엔진은 reason=`pre_designation_contract`만 소비해 "residence_only" 반환, 무주택 사실은 사용자 선언 + UI validation으로 담보(과거 보유이력 자동검증 입력 없음).

## ⑤ 결과 표시 (신규 UI 없음)

`exemptReason` append → `app/result/[id]/ResultDetailClient.tsx:145`·`lib/pdf/ResultPdfDocument.tsx:370,705`·step formula 자동. 예: `"1세대1주택 비과세 (§154① 단서 2호나 해외이주)"`.

## ⑧ Validation (`lib/calc/transfer-tax-validate-asset.ts`) — 사유별 required (침묵 누락 차단)

| 사유 | 필수 | 미입력 시 |
|---|---|---|
| overseas_migration / overseas_residence | `provisoDepartureDate` | "출국일을 입력하세요 (출국일부터 2년 내 양도 판정)" 차단 |
| expropriation | `provisoBusinessApprovalDate` 권장 | 미입력 시 고시일 전 취득 검증 생략 경고(차단 아님) |
| unavoidable | 거주 ≥ 1년(`residencePeriodMonthsAsset`) | "1년 이상 거주가 필요합니다" 경고 |
| rental_5yr_residence | 거주 ≥ 5년 | "세대전원 5년 이상 거주가 필요합니다" 경고 |
| pre_designation_contract | `provisoPreContractNoHouse` 체크 | "계약금 지급일 무주택 확인이 필요합니다" |

> `feedback_no_silent_apportion_fallback`: 자동 채움 금지, 미입력=검증 차단/경고. UI 통과↔validate 모순 금지(`feedback_validation_sync_8th_point`).

## 14 동기화 지점 (클라이언트 8 — 본 UI 책임)

①폼(store FLAT 4+1) · ②initial · ③normalize · ④API변환(단·다건) · ⑤위젯(ExemptionProvisoSection) · ⑥사이드바(**N/A** 금액 아님) · ⑦결과(exemptReason append 자동) · ⑧validation(사유별). API/Route 6은 계획서 §3.3(⑨⑩ `multiInputSchema`·⑫ 객체·⑬ spread·⑭ toDate).

## testid / E2E (`e2e/transfer-exemption-154-proviso.spec.ts`, `E2E_PORT=3103`)

- `data-testid="proviso-reason-{value}"` 라디오 · `proviso-departure-date` 등 DateInput.
- 시나리오: 보유<2년 1주택 입력 → 해외이주 선택 → 출국일 입력 → 계산 → 결과 "비과세 (§154① 단서 2호나 해외이주)".
- 회귀: 사유 미선택 시 종전 비과세/과세 동작 불변.
- 함정: DateInput은 `getByLabel` 오매칭 주의 → `data-testid` 직접 지정(memory E2E 함정). DateInput이 `data-testid` 미포워딩 시 래퍼 `<div data-testid>` 컨테이너에 부여 후 내부 textbox 접근.

## UI 규칙 준수 체크

- [ ] `RadioCardGroup`(native 금지) · OFF tone 유지
- [ ] `DateInput`(type="date" 금지)
- [ ] 조건부 노출 useMemo 파생(useEffect→store 미러링 금지)
- [ ] 섹션 카드 tone=violet + 원형 번호
- [ ] placeholder 숫자 예시 금지 → FieldCard hint
- [ ] select-on-focus(SelectOnFocusProvider 전역) · Enter 이동(EnterKeyNavigationProvider)
- [ ] 결과 "원" 단위 미표기 · 내부 id 노출 0
