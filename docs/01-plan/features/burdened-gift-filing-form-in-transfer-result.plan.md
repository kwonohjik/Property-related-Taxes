# 부담부증여 결과탭 — 증여세 신고서 서식(별지 제10호) 출력

**작성일** 2026-08-12 · **개정** R2 (자가검토 — §8 미검증 6건 전수 실측) · **상태** 계획 (구현 미착수)
**요구** 양도소득세 결과탭에서 「건물 기준시가 계산서」 **바로 위**에 증여세 신고서 서식을 출력한다.

> ### R2 개정 요지 — 실측이 R1의 추정 5건을 뒤집었다
>
> | # | R1 (추정) | R2 (실측) |
> |---|---|---|
> | 행 번호 | "결정세액 = ㊱ 등" | **오답**. 과세표준 **㉚** / 산출세액 **㉜** / 신고세액공제 **㊵** / 자진납부할 세액 **㊺**. ㊱은 「박물관자료 등 징수유예세액」 |
> | 서식 행수 | 34행 | **33행**. 타입 주석(`inheritance-gift.types.ts:592`)의 "총 34행"이 **부정확** |
> | 호출부 | 1곳 | **2곳** (`GiftTaxResultView.tsx:310, :339`) |
> | PDF 페이지 | "없으므로 신규 제작 필요 → 범위 밖" | **이미 있다**. `FilingForm10PdfPage({ rows })` — 게다가 **`rows`만 받는다** |
> | 복수 부담부증여 | "차단 범위 미확인 — 리스크" | **전면 차단 확인**(`transfer-tax-validate.ts:124-126`). 리스크 해소 |
>
> 특히 **PDF 페이지가 이미 `rows`만 받는다**는 사실은 §3의 설계 선택(A안)을 강화한다 — props 축소는 화면을 PDF 시그니처에 **맞추는** 일이지 새 규약을 만드는 일이 아니다.

---

## 1. 결론 먼저 — 계산은 이미 끝나 있고, 버려지고 있다

`burdened-gift-apportionment.ts:460`이 **`calcGiftTax`를 이미 완전히 호출**한다.
그 반환값 `giftResult`에는 별지 제10호서식 행 배열(`besshi10Rows`)이 **이미 들어 있다**(`gift-tax.ts:489-493`).
그런데 같은 파일 `:502-512`가 요약 8필드만 뽑아 `giftTaxSummary`에 담고 **나머지를 버린다**.

```ts
// burdened-gift-apportionment.ts:460  (실측)
const giftResult = calcGiftTax({ ... });      // ← GiftTaxResult 전체 (besshi10Rows 포함)
giftTaxSummary = {
  grossGiftValue: giftResult.grossGiftValue,
  deduction: giftResult.totalDeduction,
  taxBase: giftResult.taxBase,
  computedTax: giftResult.computedTax,
  filingCredit: giftResult.creditDetail.filingCredit,
  priorGiftCredit: giftResult.creditDetail.giftTaxCredit,
  finalTax: giftResult.finalTax,
  donorRelation,
};                                             // ← besshi10Rows 유실
```

⇒ **새 산식·새 계산이 필요 없다.** 이 작업은 「이미 산출된 행 배열을 결과에 실어 보내고 화면에 렌더한다」가 전부다.
세액을 바꾸는 변경이 한 줄도 없다는 점이 이 계획의 가장 중요한 성질이다.

---

## 2. 현황 실측 (전부 file:line 확인)

| 항목 | 위치 | 확인된 사실 |
|---|---|---|
| 삽입 지점 | `components/calc/results/TransferTaxResultView.tsx:510-513` | 「건물 기준시가 계산서」가 `PrintSection id="building-std-report"`로 렌더. 그 **직전**이 목표 위치 |
| 서식 컴포넌트 | `components/calc/results/GiftTaxFilingFormTable.tsx` | 별지 제10호서식 [2020.03.13. 개정]. 좌·우 2단 `BesshiColumn` |
| 서식이 읽는 것 | 같은 파일 `:26, :58` | **`result.besshi10Rows`와 `result.warnings` 둘뿐** |
| 서식 props | 같은 파일 `:19-23` | `{ result: GiftTaxResult; testIdPrefix?: string }` — `GiftTaxResult` **전체**를 요구 |
| **PDF 페이지** | `lib/pdf/GiftFilingForm10PdfDocument.tsx:61` | **`FilingForm10PdfPage({ rows }: { rows: FilingFormRow[] })`** — 이미 `rows`만 받음. `lib/pdf/gift-besshi-pages.tsx:14`에서 사용 |
| 엔진 호출 | `lib/tax-engine/burdened-gift-apportionment.ts:460-501` | `calcGiftTax` 완전 호출. 무상이전분(`gratuitousPortion`)을 단일 자산으로 평가 |
| 유실 지점 | 같은 파일 `:502-512` | 요약 8필드만 저장 |
| 결과 타입 | `lib/tax-engine/types/transfer-burdened-gift.types.ts:353-374` | `giftTax?: { grossGiftValue, deduction, taxBase, computedTax, filingCredit, priorGiftCredit?, finalTax, donorRelation }` |
| 행 타입 | `lib/tax-engine/types/inheritance-gift-form-detail.types.ts:138-153` | `FilingFormRow` = `number·label·amount·display·formula?·lawRef?·column?` — **전부 스칼라** |
| API 통과 | `app/api/calc/transfer/route.ts:447, 472` | `transferBurdenedGiftBreakdown`을 그대로 실어 `result` 통째 반환 |
| 기존 증여세 표시 | `TransferTaxResultView.tsx:561` → `BurdenedGiftDetailCard.tsx:226-265` | 요약 표(공제·과세표준·산출세액·신고세액공제·결정세액)가 **이미 있다** |
| 선택 출력 leaf | `lib/print/transfer-print-sections.ts:34-40`(타입) · `:66`(정의) | leaf 6종. 신규 id 추가 필요 |
| leaf 동기화 테스트 | `__tests__/print/transfer-print-sections.test.ts` | leaf 추가 시 함께 갱신 |
| 다자산 차단 | `lib/calc/transfer-tax-validate.ts:124-126` | `assets.length > 1`이고 `burdened_gift`가 섞이면 **차단**(`SINGLE_ONLY`). 지분 분할 예외에도 해당 없음 |

### 2.1 별지 제10호서식 행 구성 — 실측 33행 (정적 배열, 조건부 push 없음)

`lib/tax-engine/gift-tax-filing-form-besshi10.ts` — `column:` 출현 **33회**.

| 컬럼 | 행 |
|---|---|
| left (20) | ⑰증여재산가액 ⑱비과세 ⑲공익법인출연 ⑳공익신탁 ㉑장애인신탁 ㉒채무액 ㉓증여재산가산액 ㉔과세가액 ㉕공제-배우자 ㉖공제-직계존비속 ㉗공제-그밖의친족 ㉘재해손실 ㉙감정평가수수료 **㉚과세표준** ㉛세율 **㉜산출세액** ㉝세대생략가산세 ㉞산출세액계 ㉟이자상당액 ㊱박물관자료징수유예 |
| right (13) | ㊲세액공제합계 ㊳기납부세액 ㊴외국납부 **㊵신고세액공제** ㊶그밖의공제·감면 ㊷신고불성실 ㊸납부지연 ㊹공익법인가산세 **㊺자진납부할세액** / (납부방법 header) ㊻연부연납 ㊼현금분납 / (신고납부) |

> ⚠️ **`inheritance-gift.types.ts:592` 주석은 "총 34행"이라고 적혀 있으나 실측은 33행이다.**
> 이 불일치 자체는 이번 작업 범위 밖(표시 영향 없음)이지만, **anchor에서 행수를 단언하면 안 되는 근거**가 된다 — 문서화된 숫자마저 실제와 다르다.

### 2.2 직렬화 안전성 — 확인됨

`FilingFormRow`는 `Map`·`Date`·클래스 인스턴스를 포함하지 않는 **순수 스칼라 객체**다.
`JSON.stringify` → `JSON.parse` 왕복에서 손실이 없다.
(memory `feedback_engine_result_map_json_loss` — 엔진 result의 `Map`이 JSON 경유로 조용히 사라지던 함정에 해당하지 않는다.)

---

## 3. 설계 — 3안 비교

`GiftTaxFilingFormTable`이 `GiftTaxResult` **전체**를 요구하는데, 부담부증여 breakdown에는 그 전체가 없다.
이 간극을 어떻게 메우느냐가 유일한 설계 결정이다.

| 안 | 방법 | 장점 | 단점 |
|---|---|---|---|
| **A (권장)** | `giftTax`에 `besshi10Rows: FilingFormRow[]` 추가 + 화면 컴포넌트 props를 `{ rows, warnings? }`로 **좁힌다** | 페이로드 최소. **PDF(`FilingForm10PdfPage`)가 이미 `rows`만 받으므로 화면·PDF 시그니처가 통일된다** | 호출부 2곳 수정 |
| B | breakdown에 `giftTaxResult: GiftTaxResult` 통째 저장 | 컴포넌트 무변경 | 페이로드 과대. `giftTax` 요약과 **이중 진실** — 두 곳이 어긋나면 정본 불명 |
| C | 부담부증여 전용 래퍼 컴포넌트 신설 | 기존 파일 무변경 | 별지 서식 렌더 로직 2벌 — 서식 개정 시 한쪽만 고쳐지는 드리프트 |

**A 권장.** 근거가 R2에서 강화됐다:

1. 화면 컴포넌트는 실제로 `besshi10Rows`·`warnings` **둘만** 읽는다(`:26, :58` 실측).
2. **같은 서식의 PDF 페이지는 이미 `rows`만 받는다**(`GiftFilingForm10PdfDocument.tsx:61`). 즉 A는 새 규약이 아니라 **화면을 PDF에 맞추는 정렬**이다.
3. B의 이중 진실은 이 저장소가 반복적으로 대가를 치른 실패 유형이다(memory `feedback_ui_engine_dual_truth_avoidance`).

### 3.1 법적 성격 — 화면에 반드시 밝힐 것

부담부증여에서 **양도소득세 납세의무자는 증여자**, **증여세 납세의무자는 수증자**다.
즉 이 서식은 **양도세 결과탭에 출력되지만 납세의무자가 다른 서식**이다.

입력 화면에는 이미 그 취지가 있다 —
> "무상이전분(증여가액 C − 채무액 B)에 대한 증여세 동시 산출. **수증자가 별도 신고·납부**." (`BurdenedGiftBlock.tsx:576-578`)

⚠️ 결과 화면 서식 상단에도 같은 취지를 **반드시** 병기한다. 없으면 증여자가 자기 신고서로 오해할 수 있고, 이는 화면이 유발하는 오신고다. 문구는 법령 정확성 원칙에 따라 납세자 유·불리 표현 없이 사실만 기술한다.

---

## 4. 변경 지점

세액 산식 변경이 없으므로 14 동기화 지점 중 **입력 계열(①~⑤, ⑧~⑭)은 전부 무관**하다. 결과 계열만 닿는다.

| # | 파일 | 변경 |
|---|---|---|
| 1 | `lib/tax-engine/types/transfer-burdened-gift.types.ts:353` | `giftTax`에 `besshi10Rows: FilingFormRow[]` 추가 (+ import) |
| 2 | `lib/tax-engine/burdened-gift-apportionment.ts:502` | `besshi10Rows: giftResult.besshi10Rows` 한 줄 추가 |
| 3 | `components/calc/results/GiftTaxFilingFormTable.tsx:19-26` | props를 `{ rows, warnings?, testIdPrefix? }`로 좁힘 |
| 4 | `components/calc/results/GiftTaxResultView.tsx:310` | `result={result}` → `rows={result.besshi10Rows} warnings={result.warnings}` |
| 5 | `components/calc/results/GiftTaxResultView.tsx:339` | `result={sr}` → `rows={sr.besshi10Rows} warnings={sr.warnings}` (동시증여 추가 건) |
| 6 | `components/calc/results/TransferTaxResultView.tsx:509` | 기준시가 계산서 `PrintSection` **바로 위**에 신규 `PrintSection` + 서식 렌더 |
| 7 | `lib/print/transfer-print-sections.ts:34-40, 66` | leaf id·라벨 추가 |
| 8 | `__tests__/print/transfer-print-sections.test.ts` | leaf 목록 동기화 (memory `feedback_print_leaf_add_unit_test_sync`) |

**API/Route 변경 없음** — `route.ts:447`이 `transferBurdenedGiftBreakdown`을 통째로 통과시키므로 새 필드가 자동으로 실린다(실측).

### 4.1 선택 출력 leaf 배치 — 두 안

| 안 | 배치 | 근거 |
|---|---|---|
| **가 (권장)** | `group:calc`의 `building-std-report` **바로 앞** | 화면 순서 = leaf 트리 순서. 요청한 물리적 위치와 일치해 목록에서 찾기 쉽다 |
| 나 | `group:forms`(신고서식) 하위 | 의미상 분류는 정확하나 **화면 순서와 트리 순서가 어긋난다** |

가 권장. 이 트리는 분류 체계가 아니라 **출력 선택 UI**이므로 화면 순서와 일치하는 편이 오조작을 줄인다.

- **id**: `gift-filing-form` — 양도세 leaf 6종과 충돌 없음(`:34-40` 실측). 증여세 쪽 `filing-form-10`과는 **파일·타입이 달라** 무관.
- **label**: `증여세 신고서 양식 (별지 제10호)`
- **channel**: **`SCREEN`으로 시작**한다. PDF 페이지 컴포넌트(`FilingForm10PdfPage`)는 이미 있으나, 그것을 **양도세 PDF 파이프라인**(`lib/pdf/ResultPdfDocument.tsx` + `sections/`)에 꽂는 것은 별도 배선이다. §9 참조 — 재제작이 아니라 **연결**이므로 후속 PR 비용이 낮다.

---

## 5. 단계

### Phase 0 — Pre-Do anchor (착수 조건)

**구현보다 먼저** 실패하는 anchor를 심는다. memory `feedback_pre_anchor_verification`.

```
__tests__/tax-engine/transfer-tax/burdened-gift-besshi10.anchor.test.ts
  · 부담부증여(donorRelation 지정) 계산 → breakdown.giftTax!.besshi10Rows 가 존재
  · 이 시점에는 필드가 없으므로 반드시 실패해야 한다 ← 실패를 확인하고 Phase 1로
```

> ⚠️ **anchor가 통과해버리면 잘못 짠 것이다.** 관측 단계가 어긋나 회귀 0건이 나오는 사각지대를 만든다(memory `feedback_anchor_observes_wrong_stage`).

### Phase 1 — 엔진 (변경 1·2)

타입 확장 + 한 줄 저장.

**자기일관성 anchor**: `besshi10Rows`에서 뽑은 값이 기존 `giftTax` 요약과 일치해야 한다.
어긋나면 화면의 요약 표(`BurdenedGiftDetailCard`)와 서식이 **서로 다른 숫자**를 보인다.

| 대조 축 | 요약 필드 | besshi10 행 (§2.1 실측 확정) |
|---|---|---|
| 과세표준 | `giftTax.taxBase` | **㉚** |
| 산출세액 | `giftTax.computedTax` | **㉜** |
| 신고세액공제 | `giftTax.filingCredit` | **㊵** |
| 결정세액 | `giftTax.finalTax` | **㊺** 자진납부할 세액(합계액) |
| 기납부세액 | `giftTax.priorGiftCredit` | **㊳** |

> ⚠️ **행수(33)를 단언하지 말 것.** 타입 주석마저 34로 적혀 있어 신뢰할 수 없는 숫자다(§2.1). anchor는 **행 번호로 찾아 값을 비교**한다 — 행이 추가·삭제돼도 의미가 유지된다.

### Phase 2 — 컴포넌트 props 축소 (변경 3·4·5)

호출부 **2곳**(`:310` 단건, `:339` 동시증여 추가 건). 증여세 결과탭 E2E가 이 컴포넌트를 보므로 **회귀 확인 필수**.
`testIdPrefix`는 손대지 않는다 — 기존 셀렉터(`besshi10-0-`, `besshi10-{i+1}-`)가 그대로 유지돼야 한다.

### Phase 3 — 결과뷰 배선 (변경 6)

```
{result.transferBurdenedGiftBreakdown?.giftTax?.besshi10Rows && (
  <PrintSection id="gift-filing-form" selectedIds={selectedPrintIds}>
    … 납세의무자 안내(§3.1) + <GiftTaxFilingFormTable rows={…} testIdPrefix="bg-besshi10-" />
  </PrintSection>
)}
{/* 기존: building-std-report */}
```

- 게이트는 `besshi10Rows` 존재 — `donorRelation` 미입력 시 `giftTax` 자체가 undefined이므로 자연히 미렌더(타입 주석 `:350-352` 실측).
- **`testIdPrefix`는 `bg-besshi10-`** 등 증여세 마법사(`besshi10-0-`)와 겹치지 않는 값을 쓴다.
- `TransferTaxResultView.tsx`는 현재 **633줄**. +10줄 수준이라 800줄 정책 여유 있음.

### Phase 4 — 선택 출력 (변경 7·8)

leaf 추가 + 테스트 동기화. 인쇄 시 자동 펼침이 필요하면 `print-only-css-toggle` 스킬의 CSS-only 패턴을 쓴다(`useEffect` 금지).

### Phase 5 — E2E

기존 `e2e/gift-burdened-transfer.spec.ts` 옆(또는 양도세 마법사 spec)에 추가:

1. 부담부증여 + 관계 선택 → 계산 → **서식이 보인다**
2. **DOM 순서**: 서식이 기준시가 계산서보다 **앞** ← 요구의 핵심이므로 순서를 직접 단언
3. 관계 미선택 → 서식 **없음** (`toHaveCount(0)`)
4. 선택 출력에서 해제 → 사라진다

> 셀렉터는 추정하지 말고 probe로 확정한다(`e2e/CLAUDE.md` §4).

---

## 6. 검증 기준 (완료 판정)

- [ ] Phase 0 anchor가 **먼저 실패**했다가 Phase 1에서 통과
- [ ] 자기일관성 anchor 5축 통과 (요약 ↔ 서식 숫자 일치, 행 번호로 조회)
- [ ] **세액 회귀 0** — `npx vitest run __tests__/tax-engine/transfer-tax/` 전건 통과. 산식을 건드리지 않으므로 **단 1건의 기대값도 바뀌어선 안 된다**. 바뀐다면 설계가 틀린 것이다
- [ ] 증여세 결과탭 회귀 (props 축소 영향 — 호출부 2곳) — 관련 E2E·vitest 통과
- [ ] `npx tsc --noEmit` 0건 / lint 0건
- [ ] E2E 4케이스 통과 (특히 **DOM 순서**)
- [ ] 브라우저 실측 스크린샷으로 위치 확인

---

## 7. 리스크

| 리스크 | 성격 | 대응 |
|---|---|---|
| 납세의무자 오해 (증여자가 자기 신고서로 착각) | **사용자 피해** | §3.1 안내 병기를 **필수**로. 문구 없이 머지 금지 |
| props 축소로 증여세 결과탭 회귀 | 중 | 호출부 2곳 확정(§4) + Phase 2 회귀 실행 |
| 요약 표와 서식의 숫자 불일치 | 중 | Phase 1 자기일관성 anchor 5축 |
| testIdPrefix 충돌로 E2E 셀렉터 오매칭 | 중 | 부담부증여 전용 prefix(`bg-besshi10-`) |
| 페이로드 증가 | 낮 | 33행 × 스칼라 7필드. 실사용 영향 미미 |
| ~~복수 부담부증여 시 서식 기준 모호~~ | **해소** | `transfer-tax-validate.ts:124-126`이 다자산+부담부증여를 **전면 차단**(실측) |

---

## 8. 미검증 항목 — R2에서 **전부 해소**

R1의 §8 6건은 모두 실측했다(§2·§2.1 반영). 남은 미검증 항목은 다음 1건뿐이다.

1. **페이로드 실제 증가 바이트** — 33행 × 스칼라 7필드로 수 KB 수준일 것으로 보이나 Network 탭 실측은 하지 않았다. 구현 시 확인하되, 이 크기로 설계가 바뀔 가능성은 낮다.

---

## 9. 범위 밖

- 증여세 **마법사**(`/calc/gift-tax`) 쪽 부담부증여 결과 — 이번 요구는 **양도세 결과탭**이다.
- 별지 제10호서식 자체의 행 구성·산식 수정.
- **양도세 PDF에 별지10호 페이지 연결** — `FilingForm10PdfPage`가 이미 존재하므로 **재제작이 아니라 배선**이다(`ResultPdfDocument`에 페이지 추가 + leaf channel을 `SCREEN_PDF`로 승격). 후속 PR로 분리하되 비용은 낮다.
- `inheritance-gift.types.ts:592` 주석의 "총 34행" 오기 정정 — 표시에 영향 없어 별건.
- 부담부증여 증여세 **계산 로직** 변경 — 이 계획은 계산에 손대지 않는다.
