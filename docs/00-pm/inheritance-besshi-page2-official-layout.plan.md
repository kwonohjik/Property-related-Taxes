# 별지 부표3 제2쪽 「4. 순자산가액」 공식 양식 완전 재현 수정 계획서

> 작성일: 2026-05-26
> 목표: **이미지20**(현재 PDF 출력 「4. 순자산가액」)을 **이미지21**(공식 「비상장주식 등 평가서」 별지 제4호 부표3 **2025.07.10 제2쪽**)과 **완전히 동일**하게 만든다.
> 관련: [[project_unlisted_stock_besshi_2025_revision]](G-1 ⑮ 가산) · `docs/00-pm/inheritance-besshi-pdf-2025-revision-parity.plan.md`(제1쪽 공식 정합 — 동일 패턴) · [[echo-field-pattern]] · [[single-source-engine-helper]]
> 법령: 상증령 §55① · §17의2 (KoreanLaw 검증은 besshi 2025 작업에서 완료)
> **상태**: ✅ **Do 완료 (2026-05-26, ⓑ 화면+PDF 동시)** — C1 Pre-Do AN-1 RED 증명 → C2 `besshi-form-constants` 제2쪽 단일출처 → C3 PDF `Page2NetAsset` 2단 레이아웃+⑮ 가산 → C4 화면 `Page2NetAssetTable` 정합(testid 동결)+F-5 부호 정정. C5(echo)는 후속 보류. tsc 0·lint 0·전체 5102 PASS. anchor `__tests__/lib/pdf/besshi-page2-official-layout.test.tsx`(16 it).

---

## 1. 진단

### 1.1 이미지20 = PDF (`UnlistedStockBesshiPdfDocument`의 `Page2NetAsset`)

**이미지20은 PDF 출력**이다(화면 컴포넌트 `Page2NetAssetTable` 아님). 판별 근거:
- ⑮ 라벨 = **"기타충당금"** (PDF L374). 화면은 "기타(충당금 중 평가기준일 현재 비용으로 확정된 것)".
- 컬럼 헤더(번호/항목/금액) **thead 없음** (PDF). 화면은 thead 있음.
- ⑲ 산식 = **"(⑨+⑩+⑪+⑫+⑬+⑭−⑮−⑯−⑰−⑱)"** — ⑮ **차감** (PDF L380). 화면은 "+⑮".

→ 제1쪽 공식 정합(PR #8)은 `Page1Cover`만 다뤘고 **`Page2NetAsset`는 미수정**. 본 계획이 그 후속.

### 1.2 ★ ⑮ 가산 버그 (PDF 전용 — 엔진·화면은 정상)

- **엔진** `net-asset-calc.ts:72`: `+ input.otherProvision` → ⑮ **가산** (§17의2 3호 가, 정상). `totalLiabilities`에 포함.
- **화면** `Page2NetAssetTable`: ⑮ 가산 (⑲ "+⑮"). 엔진 일치 (besshi 2025 G-1 정정 완료).
- **PDF** `Page2NetAsset`: ⑮ **차감**(L338 `− raw.otherProvision`, L374 `isSubtract`, L380 "−⑮"). **버그** — `otherProvision > 0`이면 PDF의 ⑲·다 표시값이 엔진(`netAssetTotal` prop=마)과 **불일치**(자기모순). 이미지20은 ⑮=0이라 수치는 안 드러나나 산식 라벨 "−⑮"가 오류.
- 공식(이미지21) ⑲ = **"(⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱)"** → ⑮ 가산. → 공식·엔진과 일치시키려면 PDF ⑮ 가산 정정 필수.

### 1.3 이미지20(PDF 현재) vs 이미지21(공식) 차이 인벤토리

| # | 항목 | 현재 PDF (이미지20) | 공식 (이미지21) | 조치 |
|---|---|---|---|---|
| A | 페이지 헤더 | `s.sectionTitle` "4. 순자산가액 (별지 제2쪽)" (좌측 바) | `(단위 : 원)`(좌)·`(제2쪽)`(우) + "4. 순자산가액" + 하단 룰 | 헤더 재구성 |
| B | **컬럼 레이아웃** | [번호][라벨][차감열][가산·소계열] (4열, 차감항목 별도열) | **[번호·라벨][값 1열][회색 참조열]** — ②/라만 참조 텍스트, 그 외 회색 빈칸 | 차감열 제거→값 단일열 + 회색 참조열 신설 |
| C | ② 참조 | 라벨 내 "평가차액 → 제4쪽 5.가.② 기재" | 라벨 "평가차액" + 회색열 **"제4쪽 5. 평가차액 "가""** | 참조를 회색열로 분리 |
| D | ⑤ 라벨 | "평가기준일 현재 지급받을 권리 확정 가액" | **"기타(평가기준일 현재 지급받을 권리가 확정된 가액 등)"** | 라벨 정합 |
| E | ⑮ 라벨·부호 | "기타충당금" · **차감**(isSubtract) | **"기타(충당금 중 평가기준일 현재 비용으로 확정된 것 등)"** · **가산** | 라벨 정합 + §1.2 가산 정정 |
| F | ⑲ 산식 | "(⑨+⑩+⑪+⑫+⑬+⑭−⑮−⑯−⑰−⑱)" | **"(⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱)"** | +⑮ 정정 |
| G | 다 라벨 | "영업권 포함 전 순자산가액 (⑧ − ⑲)" | **"영업권포함전 순자산가액(⑧-⑲)"** | 라벨 정합 |
| H | 라 참조 | 라벨 내 "영업권 ← 제5쪽 6.자.영업권 평가액" | 라벨 "영업권" + 회색열 **"제5쪽 6. 영업권 "자""** | 참조를 회색열로 분리 |

(⑧ 산식 "(①+②+③+④+⑤−⑥−⑦)"·가./나. 헤더·다/라/마 행은 현재도 동일 — 스타일만 정합.)

---

## 2. 설계

### 2.1 공식 2단 값 레이아웃 (B·C·H — 핵심)

행 구조를 **[번호+라벨][값 1열][회색 참조열]** 3열로 재구성:
- **값 1열**: ①~⑱ 모든 금액을 한 열에 표시. 차감 항목(⑥⑦⑯⑰⑱)도 같은 열 — 차감은 **산식(⑧·⑲ 소계)에만 반영**, 시각적 별도열 제거.
- **회색 참조열**: 전 행에 회색 배경. ②=`제4쪽 5. 평가차액 "가"`, 라=`제5쪽 6. 영업권 "자"`, 그 외 빈칸.
- 가./나.는 굵은 서브섹션 헤더, 다/라/마는 굵은 행. 소계 ⑧·⑲ 강조(yellow), 마 강조(emerald) 유지.

### 2.2 ⑮ 가산 정정 (E·F — 산식 충실)

- **기본 채택**: PDF `Page2NetAsset` 로컬 산식을 엔진과 일치시킴 — ⑮ `isSubtract` 제거(가산), ⑲ 산식 라벨 "+⑮", 로컬 `liabilitySubtotal` `+ raw.otherProvision`(현 `−`). → 엔진(`net-asset-calc.ts:72` 가산)·화면(이미 가산)·공식과 일치. `otherProvision>0` 케이스에서 PDF ⑲·다가 엔진 마와 정합. (화면은 이미 가산이라 산식 무변경 — 레이아웃·라벨만.)
- **(선택 후속) echo로 드리프트 원천 차단** ([[echo-field-pattern]]): 현재 화면·PDF 모두 `raw`(입력)에서 ⑧·⑲·다를 **로컬 재계산**하며, 엔진 `UnlistedStockValuationResult`는 **`netAssetTotal`(마)만 노출**하고 ⑧·⑲·다 소계는 **미노출**(orchestrator가 `netAssetResult.netAssetBeforeGoodwill`을 내부 사용만). 따라서 echo 채택 시 **result에 `assetSubtotal`·`liabilitySubtotal`·`netAssetBeforeGoodwill` 3 필드 추가**(orchestrator 노출, 산식 무변경)가 선행돼야 함 → 본 PR은 **로컬 산식 정정**을 기본으로 하고 echo는 후속 권장. ⚠️ 로컬 채택 시 PDF·화면 산식이 엔진 `net-asset-calc` 부호와 1:1 일치하는지 AN으로 강제.

### 2.3 라벨·헤더 (A·D·G)

- ⑤ "기타(평가기준일 현재 지급받을 권리가 확정된 가액 등)" / ⑮ "기타(충당금 중 평가기준일 현재 비용으로 확정된 것 등)" / 다 "영업권포함전 순자산가액(⑧-⑲)".
- 헤더: "4. 순자산가액" + `(단위 : 원)`·`(제2쪽)`. ("별지 제2쪽" 표기 제거.)
- 셀 라벨·참조 문자열은 **`besshi-form-constants.ts`에 단일 출처화**(제1쪽 `BESSHI_P1_SECTION3` 패턴) → 화면·PDF 공유.

### 2.4 화면 동시 정합 (제1쪽 결정 준용)

이미지20은 PDF지만, 화면 `Page2NetAssetTable`도 thead+차감열 4-col이라 공식과 불일치. 제1쪽 "공식 엄밀 재현 — 화면·PDF 동시" 결정과 동일하게 **화면 `Page2NetAssetTable`도 같은 공식 2단 레이아웃·라벨로 정합**(thead 제거, 차감열 제거, 참조열 추가, ⑤·⑮ 라벨). 화면은 ⑮ 가산이 이미 맞으므로 산식 정정 불필요(레이아웃·라벨만). → 화면 anchor testid(`p2-①`~`p2-마`) 보존.

> ✅ **확정 (사용자, 2026-05-26): ⓑ 화면+PDF 동시.** 화면 `Page2NetAssetTable`·PDF `Page2NetAsset` 모두 공식 2단 레이아웃·라벨로 정합. PDF는 ⑮ 가산 정정 포함, 화면은 레이아웃·라벨만(⑮ 이미 가산).

---

## 3. 영향 / 비범위

**수정 대상**
- `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` — `Page2NetAsset` 레이아웃·라벨·⑮ 가산.
- `components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable.tsx` — 공식 레이아웃·라벨 (ⓑ).
- `components/calc/inheritance/unlisted-stock-v2/besshi/besshi-form-constants.ts` — 제2쪽 라벨·참조 단일 출처 추가.
- (echo 후속 채택 시에만) `UnlistedStockValuationResult` + orchestrator 반환에 ⑧·⑲·다 소계 echo 필드 추가 + Page2 props 전달 — 본 PR 기본 범위에서 **제외**(로컬 산식 정정으로 충족).

**비범위**
- 엔진 산식(`net-asset-calc.ts`·`evaluateUnlistedStockV2`) **변경 0** — 이미 정상(⑮ 가산). 본 PR은 **표시·로컬 산식 라벨 정합**(PDF ⑮는 표시 측 로컬 재계산 버그 정정이지 엔진 변경 아님).
- result 타입 echo 필드 추가(§2.2 후속).
- 제1쪽·제4·5·6쪽 레이아웃(별도).
- 타입·API·validate — 변경 없음(엔진 input/result 불변).

---

## 4. 검증 계획

### 4.1 Pre-Do anchor ([[feedback_pre_anchor_verification]])
- **AN-1 (⑮ 가산 자기일관)**: `otherProvision > 0`(예 50,000,000) **+ 순자산 양수**(다=⑧−⑲ ≥ 0, §55① clamp 미발동) 입력으로 PDF 텍스트 추출 → 로컬 ⑲ = 엔진 `totalLiabilities`, **마 = 다 + 라** 자기일관. 현행(−⑮)으로 실행 시 ⑲에 ⑮이 빠져 마 ≠ 다+라 → RED(버그 증명), 정정 후 GREEN. ※ 다(로컬 ⑧−⑲, 무clamp)는 raw<0일 때만 `netAssetBeforeGoodwill`(=max(0,raw))와 어긋나므로 anchor는 양수 케이스로 한정.

### 4.2 정합·회귀
- **AN-2 (산식 라벨)**: PDF·화면 ⑧="(①+②+③+④+⑤−⑥−⑦)", ⑲="(⑨+⑩+⑪+⑫+⑬+⑭+⑮−⑯−⑰−⑱)".
- **AN-3 (라벨)**: ⑤·⑮·다 공식 문구, ② "평가차액"·라 "영업권"(참조 분리).
- **AN-4 (참조열)**: ② 회색열 "제4쪽 5. 평가차액 가", 라 회색열 "제5쪽 6. 영업권 자".
- **AN-5 (값 불변)**: 사례 6(`netAssetTotal`=489,351,700 등) 마 값 불변 — 레이아웃 변경이 수치 무영향.
- **AN-6 (화면 testid 보존)**: `p2-①`~`p2-마` 모두 존재 + 사례 6 anchor 통과 (기존 `besshi-form-full-replica.test.tsx` 회귀 0).

### 4.3 게이트
- `npx tsc --noEmit` 0 / `npx vitest run __tests__/lib/pdf/ __tests__/tax-engine/property-valuation/besshi-form-full-replica.test.tsx` / 커밋 전 전체 `npm test`.
- 실제 PDF `renderToBuffer` 텍스트 추출로 ⑮ 가산·참조열·라벨 육안 확인.

---

## 5. 작업 순서 (제안 커밋)

1. **C1** Pre-Do anchor AN-1(⑮ 자기일관) RED 확보 + AN-5(마 불변) → 버그·기준 고정.
2. **C2** `besshi-form-constants.ts` 제2쪽 라벨·참조 단일 출처 추가.
3. **C3** PDF `Page2NetAsset` 공식 2단 레이아웃 + ⑮ 가산 + 라벨 → AN-1~5 GREEN.
4. **C4** 화면 `Page2NetAssetTable` 공식 레이아웃·라벨(ⓑ) → AN-6 + 기존 회귀 0.
5. **C5** (후속·선택, 본 PR 제외 가능) result에 ⑧·⑲·다 echo 필드 추가 + Page2 props 전환(로컬 재계산 제거·드리프트 차단).
6. **C6** 전체 `npm test` + PDF 렌더 확인 + 메모리 환류.

---

## 6. 리스크 / 주의

- **PDF ⑮ 가산 정정은 표시 산식 버그 정정**(엔진 변경 아님). `otherProvision>0` 이력에서 PDF ⑲·다 표시값이 바뀜(엔진 마와 일치하도록) — 의도된 정정. AN-1로 자기일관 강제.
- **로컬 재계산 드리프트**: PDF·화면 모두 `raw`에서 소계 재계산 중 → §2.2 echo props 권장(미채택 시 산식이 엔진과 1:1 일치하는지 anchor 필수).
- **참조열 추가로 컬럼 폭 재배분**: PDF A4 폭(약 535pt)에서 [번호+라벨][값][참조] 3열 폭 조정 — 값/참조 우측 정렬·라벨 wrap 확인. 800줄 정책 근접 시 `Page2NetAsset` 분리.
- **testid 동결**: 화면 `p2-*` testid 문자열 보존(레이아웃만 변경). `besshi-form-full-replica.test.tsx` 기대값 유지.
- **단일 출처**: 제1쪽처럼 라벨·참조를 `besshi-form-constants`로 모아 화면·PDF 재드리프트 차단([[single-source-engine-helper]]).
