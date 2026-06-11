# 증권거래세 정보성 산출 — UI 디자인

> ⚠️ **Phase 2 정정 고지**: S-5(2025-12-31 경고) 시나리오는 Phase 2에서 "2025 영세율 구간 적용·경고 없음"으로 대체(시행일 오귀속 정정 — 영 제36001호 2026.1.1). 영세율 카드 분기·경고 문구 변경: `securities-transaction-tax-phase2.ui.design.md`. 충돌 시 Phase 2 문서 우선.

> 계획서: `docs/00-pm/securities-transaction-tax.plan.md` (rev.2) · 엔진 설계: `securities-transaction-tax.engine.design.md`
> 13단계 자가 검토 STEP 12 산출물. 신규 입력 필드 0 — UI 작업은 ⑤(Step3 교체)·⑦(결과 카드)·인쇄 한정.

## 1. 사용자 시나리오

| # | 시나리오 | 동선 | 기대 표시 |
|---|---|---|---|
| S-1 | 코스닥 단건 계산 | Step1 시장=코스닥 → Step2 양도가 입력 → Step3 진입 | Step3 필요경비 섹션 하단에 inline 미리보기: "양도가액 × 0.20% = N" + 실가 모드면 "필요경비에 포함하여 직접 입력" 안내 |
| S-2 | 코스피 결과 확인 | 계산 완료 → 결과뷰 | 최종세액·지방소득세 뒤 "증권거래세 (정보용)" 카드 — 증권거래세 0.05% 행 + 농어촌특별세 0.15% 행 + 합계 |
| S-3 | K-OTC 중소기업 비과세 | K-OTC + 중소 + 비대주주 | 양도세 0원 결과여도 증권거래세 카드 표시(0.20%) — "양도소득세 비과세와 무관하게 별도 납부" |
| S-4 | 기타자산(과점주주) | 시장=기타자산 | 카드에 금액 행 없이 경고만: "주권 양도 해당 시 증권거래세 별도 발생 — 시장 구분 확인 필요" |
| S-5 | 2025년 거래 입력 | 양도일 2025-12-31 | 카드 하단 amber 경고: "2026-01-02 시행 세율 적용 — 거래일 당시 세율 확인 필요" |
| S-6 | 합계 직접 입력 모드(기본) | `transferActualInputMode="total"` (폼 default) | Step3 미리보기 정상 표시 (현존 갭 해소 — 기존엔 per_share만 지원) |
| S-7 | 인쇄 선택 출력 | 결과뷰 → 인쇄 패널 | "증권거래세 (정보용)" 섹션 체크 항목 노출, PDF에 카드 동일 산식 |

## 2. 컴포넌트 변경 명세

### 2-1. `SecuritiesTransactionTaxCard.tsx` (기존 127줄 수정)

```ts
interface SecuritiesTransactionTaxCardProps {
  /** 산출 결과 — result variant는 서버 echo, inline variant는 클라이언트 엔진 호출 결과 */
  stx: SecuritiesTransactionTaxResult;
  variant?: "result" | "inline";
  /** inline 전용 — 양도가액 표시(산식 문맥) */
  transferPrice?: number;
  /** inline 전용 — 실가 경비 모드일 때만 "필요경비 포함 입력" 안내 표시 */
  showExpenseInclusionHint?: boolean;
}
```

- **자체 `calcSecuritiesTransactionTax` 호출 삭제** — 양 variant 모두 `stx` prop 수신 (호출 책임은 부모).
- `as StockTransferInput` 캐스팅 hack 제거 (엔진 narrow `SecuritiesTaxParams`).
- % 표시: `(stx.appliedRateNum / stx.appliedRateDen * 100).toFixed(2)` — 구 `appliedRate` 소수 필드 제거 대응 (:67, :105).
- **warning 슬롯 추가**: `stx.warning` 존재 시 카드 하단 `text-amber-600` 1행 (양 variant).
- 표시 게이트는 카드 내부가 아니라 **부모에서** `stx.totalTax > 0 || stx.warning` 판정 (카드 자체의 `appliedRate === 0 → null` 게이트 삭제 — 기타자산 경고 표시 위해).
- 기존 sky 톤·"양도소득세와 별도 납부" 배지·disclaimer 3행 유지. disclaimer에 1행 추가: "특수관계인 저가양도 등은 시가 기준 과세될 수 있습니다(증권거래세법 §7)."

### 2-2. 결과뷰 카드 (result variant) — ASCII

```
┌─ (sky-50 카드) ──────────────────────────────────────┐
│ 증권거래세 (정보용)   [양도소득세와 별도 납부]        │
│ 증권거래세법 §8② + 시행령 §5 1호 (코스피 0.05%)      │
├──────────────────────────────────────────────────────┤
│ 양도가액 100,000,000 × 0.05%                          │  ← 산식 행 (한국어 풀어쓰기)
│ 증권거래세 (0.05%)                        50,000     │
│ 농어촌특별세 (0.15%)                     150,000     │  ← 코스피만
│ ───────────────────────────────────────────────      │
│ 합계                                     200,000     │
├──────────────────────────────────────────────────────┤
│ ⚠ 2026-01-02 시행 세율 적용 — 거래일 당시 세율       │  ← warning 시만 (amber)
│   확인 필요                                          │
│ * 증권거래세는 원칙적으로 증권회사 등이 원천징수합니다.│
│ * 장외거래·비상장 직접양도는 양도자가 자진신고·납부.  │
│ * 본 산출액은 참고용입니다.                           │
│ * 특수관계인 저가양도 등은 시가 기준 과세될 수        │
│   있습니다(증권거래세법 §7).                          │
└──────────────────────────────────────────────────────┘
```

- 금액 셀: `text-right font-mono tabular-nums whitespace-nowrap` ("원" 미표기 — memory `feedback_no_won_suffix`).
- 위치: `StockTransferTaxResultView` 세액 카드 그룹(최종세액·지방소득세) **직후**. 다자산 합산 뷰는 종목별 섹션 내 동일 카드. result variant에도 산식 행 1행(양도가액 echo는 `result.transferPrice` 사용).
- **확인 필요(Do)**: K-OTC 비과세(`isExempt`) 시 결과뷰가 별도 레이아웃/카드 생략 분기를 타는지 미실측 — S-3 충족 위해 exempt 분기에서도 본 카드 렌더 경로 확보.

### 2-3. Step3 inline 교체 (⑤)

삭제: `Step3.tsx` `SECURITIES_TAX_RATE`(48-54) · `MARKET_LABEL` 중 미리보기 전용 사용 검토 · `securitiesTaxPreview` useMemo(90-98) · 인라인 블록(146-164).

신규 구성:

```tsx
// Step3.tsx — 폼 → 엔진 양도가액 + 증권거래세 (단일 진실: 엔진 함수 import)
const stxPreview = useMemo(() => {
  // 파싱 헬퍼는 항상 객체 반환(미입력 필드는 0) — 게이트는 transferPrice <= 0 단일
  const transferPrice = calcTransferPriceSimple(buildTransferPriceParams(form));
  if (transferPrice <= 0) return null;             // 양도가 미입력·0 → 미표시
  const stx = calcSecuritiesTransactionTax(
    { marketType: form.marketType, isKOTCTrading: form.isKOTCTrading,
      transferDate: parseFormDate(form.transferDate) },
    transferPrice,
  );
  return { stx, transferPrice };
}, [form.marketType, form.isKOTCTrading, form.transferDate,
    form.transferPriceMode, form.transferActualInputMode,
    form.transferTotalPrice, form.perShareTransferPrice, form.shareCount,
    form.exchangePropertyValue, form.exchangeDebtRelief, form.exchangeCash]);

{stxPreview && (stxPreview.stx.totalTax > 0 || stxPreview.stx.warning) && (
  <SecuritiesTransactionTaxCard
    variant="inline"
    stx={stxPreview.stx}
    transferPrice={stxPreview.transferPrice}
    showExpenseInclusionHint={!expenseLocked}
  />
)}
```

- `buildTransferPriceParams`: `transferPriceMode`·`transferActualInputMode`·`transferTotalPrice`·`perShareTransferPrice`·`shareCount`·`exchange*` 3종 파싱(`parseAmount`). `calcTransferPriceSimple` input 형태의 partial 구성 — 위치는 `lib/calc/stock-transfer-tax-api.ts` 인접(기존 파싱 헬퍼 재사용 검토).
- **`exchange` 모드·`total` 모드 지원** — S-6 현존 갭 해소.
- 안내 분기: `showExpenseInclusionHint=true`(실가 모드) → "이 금액을 필요경비에 포함하여 직접 입력하세요 (자동 합산 안 됨)" / false(개산공제 모드) → 별도 납부 안내만.

### 2-4. 인쇄 섹션 (`lib/print/stock-transfer-print-sections.ts`)

- 섹션 id `securities-transaction-tax`, 라벨 "증권거래세 (정보용)" 추가. 게이트 동일(`totalTax > 0 || warning`). PDF 채널은 기존 8결과뷰 공통 패턴(`PrintSelectionPanel`) 준수 — result variant 카드 재사용.

### 2-5. 신고서 양식 (변경 없음 — 사유)

`StockFilingFormTableHelpers.ts:404-408` "15. 증권거래세" 행은 **사용자가 입력한 필요경비 내역** 맥락(실가 모드 actualExpenses 구성요소)이므로 정보성 echo로 채우면 의미 왜곡(필요경비 미포함인데 포함처럼 보임) → `null` 유지 + 주석으로 본 설계 참조 명기.

## 3. 동기화 지점 체크 (14지점 — 본 기능 해당분)

| 지점 | 변경 | 내용 |
|---|---|---|
| ①②③ 폼 상태·initial·normalize | **없음** | 신규 폼 필드 0 (Do에서 grep 무변경 확인) |
| ④ API 변환 | **없음** | result echo — 요청 body 무변경 |
| ⑤ UI 위젯 | **변경** | §2-3 Step3 교체 |
| ⑥ 사이드바 | **없음** | 별도 세금 — 합산 금지 (확인만) |
| ⑦ 결과 카드 | **변경** | §2-1·§2-2 + 인쇄 §2-4 |
| ⑧ validation | **없음** | 필수 입력 추가 없음 |
| ⑨⑩⑪⑫⑬ Zod·spread | **없음** | input 무변경 (grep 확인) |
| ⑭ Route 매핑 | **없음** | result는 JSON 직렬화 그대로 (plain object) |

## 4. E2E 명세 (`e2e/stock-transfer-securities-tax.spec.ts` 신규)

| # | 시나리오 | 검증 |
|---|---|---|
| E-1 | 코스닥 total 모드 1억 | Step3 inline "200,000" + 결과뷰 카드 "200,000" |
| E-2 | 코스피 1억 | 결과뷰 증권거래세 50,000·농특세 150,000·합계 200,000 (3행) |
| E-3 | 기타자산 | 결과뷰 카드 경고 문구 표시·금액 행 없음 |
| E-4 | 양도일 2025-12-31 | amber 경고 문구 표시 |

- worktree 실행: `E2E_PORT=3100` (memory `feedback_e2e_worktree_port_isolation`). 사전존재 실패 ~23건과 분리 판정(memory `feedback_e2e_preexisting_failures`).

## 5. 회귀 가드

- Step3 자체 세율표 삭제로 **기존 미리보기 금액이 바뀌는 유일한 사용자-가시 변경**: 코스피 0.15%→0.05%(+농특 0.15% 분리 표시), per_share 외 모드 신규 표시. E-1·E-2가 가드.
- 결과뷰는 신규 노출(기존 부재) — 기존 spec 영향 없음 예상, 전체 `npm test` + 해당 세목 E2E로 확인.
