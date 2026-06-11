# P1 — §98의8 + §99 UI 설계

> 선행: `transfer-remaining-10-reductions.plan.md` · `transfer-remaining-p1.engine.design.md`
> 위치: `UnifiedReductionPanel` — §99는 **new_housing 그룹**(amber), §98의8은 **unsold_housing 그룹**(sky) 라디오 활성화. 폼은 §98의9 선례(별도 파일) — 패널 내부 인라인 금지 (644줄 정책).

## 1. 사용자 시나리오

1. 양도 자산(감면주택) 입력 → 감면·공제 단계 → 그룹 펼침 → 라디오 선택 (D-1' 불요 — 모드 1은 자산 계약일·취득일로 period-check 정확).
2. §98의8: 계약일·취득가·면적 + 임대 정보 + 자격 토글 → 계산.
3. §99: 취득 유형(자기건설/주건업)·국민주택·기준시가 3종 (+재개발 변형 시 종전주택 기준시가) → 계산.
4. 결과: 양도소득금액 차감 산식 + 농특세 + (다주택 시) 중과 배제 배지.

## 2. 입력 폼 — `Unsold988InputForm.tsx` (신규 파일)

```
┌─ ① sky — 취득 정보 ───────────────────────────────┐
│ 최초 매매계약일 [DateInput]  (hint: 2015.1.1~2015.12.31)│
│ ※ 취득일·양도일은 자산 기본 입력 재사용 (이중 입력 금지)   │
├─ ② sky — 가액·면적 ───────────────────────────────┤
│ 취득가액 [CurrencyInput]  (hint: 6억 이하 — 부대비용 제외) │
│ 전용면적 [DecimalInput + 별도 label] (hint: 135㎡ 이하 —  │
│          취득가와 면적 **모두** 충족해야 적용)             │
├─ ③ violet — 임대 정보 (령 §98의5⑤ 기산) ───────────┤
│ 임대개시일 [DateInput] (hint: 사업자등록+임대사업자등록    │
│            **후** 임대를 개시한 날부터 기산)              │
│ [ToggleCard] 양도일까지 임대 계속  (OFF → 임대종료일 입력) │
│ [ToggleCard] 상속받은 임대주택 (ON → 피상속인 임대기간 개월 │
│              [DecimalInput] — 합산)                      │
├─ ④ rose — 자격 토글 ──────────────────────────────┤
│ [ToggleCard] 준공후미분양 확인 (사용검사 후 2014.12.31까지  │
│              분양계약 미체결 + 2015.1.1 이후 선착순 공급)   │
│ [ToggleCard] 사업주체등과 최초 매매계약                    │
│ [ToggleCard] 계약 해제 후 본인·배우자 등 재계약 아님        │
└──────────────────────────────────────────────────┘
+ emerald 안내: 시·군·구청장 확인 날인 매매계약서 필요 (령 §98의7⑧) · 농특세 = 감면세액의 20%
```

## 3. 입력 폼 — `New99InputForm.tsx` (신규 파일)

```
┌─ ① amber — 취득 유형 ─────────────────────────────┐
│ [RadioCardGroup] 주택건설사업자로부터 취득 | 자기건설(조합원 포함)│
│ 주건업: 최초 매매계약일 [DateInput] + 계약금 납부 토글       │
│ 자기건설: 사용승인일 [DateInput]                           │
│ [ToggleCard] 국민주택 (ON → 기간 ~1999.12.31 hint 갱신)    │
├─ ② amber — 기준시가 3종 (§99의3 ThreePointStandardPriceInput│
│            재사용 검토 — 취득시·5년시점·양도시)              │
│ 전용면적 [DecimalInput + 별도 label] — 고가주택 판정용       │
│   (1998~99 계약 기준 165㎡ 이상 AND 양도가 6억 초과 시 배제) │
├─ ③ violet — 재개발·재건축 변형 (령 §99①) ──────────┤
│ [ToggleCard] 종전주택을 재개발·재건축하여 취득한 신축주택     │
│   ON → 종전주택 취득 당시 기준시가 [CurrencyInput] **필수**  │
│   (5년 내 양도도 안분 적용 — 분모가 종전주택 기준)           │
├─ ④ rose — 배제 토글 ──────────────────────────────┤
│ [ToggleCard] 매매계약일 현재 입주 사실 없음 (주건업만 노출)   │
│ [ToggleCard] 1998.5.21 이전 분양계약 해제 후 재계약 아님     │
│ ※ 고가주택·기간·주건업 본인은 evaluator 자동 판정            │
└──────────────────────────────────────────────────┘
+ 부수토지 hint: 건물 연면적 2배 이내 토지 포함 입력 (초과분 미지원)
```

## 4. 결과 카드 — `Unsold988DetailCard.tsx` · `New99DetailCard.tsx`

- 적격: 차감 산식 한국어 풀어쓰기 — "취득일부터 5년간 발생한 양도소득금액 N × 50% = M을 양도소득세 과세대상소득금액에서 공제" (변수 약어·floor 금지).
- 5년 안분: 분자·분모·비율 단계 표시 (§99의3 `formulaSteps` 동형 — 기존 `TransferTaxResultView` §99의3 카드 패턴 재사용).
- 농특세: "감면세액 N × 20%" 행. 중과 배제 시 violet 배지 "소령 §167의3①5호 중과 배제".
- 불적격: rose 사유 목록 (IneligibleCode별 메시지).
- §99 재개발 변형: 분모 라벨 "양도시 기준시가 − **종전주택** 취득 당시 기준시가" 분기.

## 5. 14 동기화 지점 매핑

| 지점 | 파일 | 내용 |
|---|---|---|
| ① 폼 상태 | `calc-wizard-asset-reduction.ts` | new_99·unsold_98_8 variant (string 필드) |
| ② initial | 동일 + factory | 기본값 (토글 false·금액 "") |
| ③ normalize | `calc-wizard-asset-factory.ts` migrateAsset | 방어 보정 |
| ④ API 변환 | `transfer-tax-api-helpers.ts` toEngineReductions | parseAmount·parseDecimal·날짜 string |
| ⑤ UI 위젯 | 본 문서 §2·§3 | 폼 2종 + 패널 렌더 분기 + `onUpdate99`·`onUpdate988` |
| ⑥ 사이드바 | — | 차감형은 양도소득금액에 반영 — 합계 별도 행 불요 (§99의3 선례) |
| ⑦ 결과 카드 | §4 + `ReductionDetailCards.tsx` 연결 | detail 2종 |
| ⑧ validation | `transfer-tax-validate-reductions.ts` | §98의8: 계약일·취득가·면적·임대개시일 필수 / §99: 유형별 날짜·기준시가 3종, 변형 ON 시 종전 기준시가 필수 |
| ⑨⑩ Zod enum | 기존 enum에 ID 포함 여부 grep | — |
| ⑪ 자산 fallback | acquisitionDate는 자산-수준 재사용 | — |
| ⑫ Zod 입력 객체 | `transfer-tax-schema-sub.ts` | 본 필드 전부 (침묵 strip 차단) |
| ⑬ body spread | `callTransferTaxAPI` | spread 확인 grep |
| ⑭ Route 매핑 | `route-reductions-mapper.ts` | Date 변환 |

## 6. E2E — `e2e/transfer-98-8.spec.ts`

미분양주택 그룹 펼침 → §98의8 라디오 → 폼 렌더 (hint "6억"·"135㎡" 노출) + 신축주택 그룹 → §99 라디오 → 폼 렌더. worktree `E2E_PORT=3100` + stale 서버 kill.

## 7. UI 결정 사항

- 라벨에 "감면"·"절세" 등 유불리 표현 금지 — 법정 용어("과세대상소득금액에서 공제").
- §98의8 ②(주택수 제외)는 P1 범위 외 — 카드 하단 각주 "다른 주택 양도 시 주택수 제외는 후속 단계(P5) 지원 예정" **금지** (미구현 기능 예고 노출 대신 침묵). 모드 2는 P5에서 STEP 0.9 합류.
- placeholder 숫자 예시 금지 — 형식 안내는 FieldCard `hint`.
- 토글 OFF도 tone 배경 유지 (ToggleCard 정책).
