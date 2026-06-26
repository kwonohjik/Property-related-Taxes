# UI 설계 — 주식 할증평가 §53⑧ 배제사유 정정 + 2호 보조입력

> Plan: `docs/00-pm/stock-premium-exclusion-53-8-2-correction.plan.md`
> Engine: `docs/02-design/features/stock-premium-exclusion-53-8-2-correction.engine.design.md`
> 대상: 상장(`ListedStockBesshiAttributesSection`) + 비상장(`unlisted-stock-v2/CorporateInfoSection`)

---

## 0. UI 원칙

- 배제사유 선택 = `<select>` 유지(상장 기존)·비상장 신설. 9종+none 라벨 = 공용 `STOCK_PREMIUM_EXCLUSION_LABELS` import(dual-truth 차단).
- **2호 보조입력은 선택값 === `all_sold_within_6m`일 때만 조건부 렌더**(useEffect→store 미러링 금지, 선택 onChange 직접 set — `mirror-pattern`).
- 토글/체크 = `ToggleCard`/`ToggleChip`, 라디오 = `RadioCardGroup`(native 금지). 날짜 = `DateInput`. tone=emerald(할증 영역).
- UI 표시 순서 = 엔진 판정 순서: 배제사유 선택 → (2호 시) 전부매각 → §49①1호 → 매매계약일 → 상속/증여.

---

## 1. 상장 — `ListedStockBesshiAttributesSection.tsx` 변경

기존 §63③ 카드(`:207` 배제사유 select) 아래에 2호 보조입력 블록 추가.

```
┌─ §63③ 최대주주 등 할증평가 (×120%) ──────── [switch ON] ─┐ (emerald)
│  기업 규모(§53④)  [중소][중견][대기업]   (RadioCardGroup)  │
│  배제 사유(§53⑧)  [▼ §53⑧2호 — 전부매각(§49①1호 적합) ]  │  ← 공용 라벨 select
│                                                            │
│  ▼ (배제사유 === all_sold_within_6m 일 때만)               │
│  ┌─ §53⑧2호 전부매각 요건 ──────────────────┐ (emerald 카드) │
│  │ ① [✓] 최대주주 보유 주식 전부 매각         │ ToggleChip   │
│  │ ② [✓] §49①1호 적합 (특수관계 부당거래 아님)│ ToggleChip   │
│  │ ③ 매매계약일      [____-__-__]            │ DateInput    │
│  │ ④ 구분  [상속][증여]                       │ RadioCardGroup│
│  │ ⓘ 상속=평가기준일 ±6월 / 증여=전6·후3월 내  │ hint         │
│  └───────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

- 바인딩: `item.section53_8_2.{allSharesSold,meetsArticle49_1_1,saleContractDate,transferType}`. 선택이 2호 아니게 바뀌면 `section53_8_2: undefined`로 clear(3-state).
- testid: `premium-53-8-2-all-sold` `premium-53-8-2-art49` `premium-53-8-2-sale-date` `premium-53-8-2-transfer-type`.
- §49①1호 ToggleChip에 `LawArticleModal legalBasis="상증법 시행령 §49"` 링크.

## 2. 비상장 — `unlisted-stock-v2/CorporateInfoSection.tsx` 변경 (신설)

현재 companySize·isMaxShareholder·계속결손만 → 배제사유 select + 2호 보조입력 동일 블록 신설. testid 접두 `unlisted-premium-53-8-2-*`. tone=emerald 카드(다-섹션 번호 패턴).

> **공용 컴포넌트 추출(권장)**: 상장·비상장 2호 보조입력이 동일 구조 → `components/calc/inheritance/shared/Section53_8_2Fields.tsx`로 추출해 양쪽이 재사용(UI dual-truth 차단). props = `{ value: Section53_8_2Input | undefined, onChange, idPrefix }`.

## 3. 결과뷰 (⑦)

- 상장 `ListedStockBesshiResultView` + `results/ListedStockBesshiResultSection` / 비상장 `PerShareValuationResultCard`:
  - 배제 적용 시: "§53⑧2호 — 전부매각(§49①1호 적합) → 할증 배제(0%)" (공용 라벨).
  - 게이트 실패 시: rose tone fine-print = 엔진 `failReason` 메시지(설계 §3-1 표).
  - testid `premium-53-8-2-result`(배제 라벨·실패 메시지 공통 컨테이너) — E2E 셀렉터.

## 4. validation (⑧) — `estate-item` / `unlisted-stock-valuation-v2` validate

2호 선택(`premiumExclusionReason === "all_sold_within_6m"`) 시 필수:
- `section53_8_2.saleContractDate` 미입력 → 차단("매매계약일 입력").
- `allSharesSold`·`meetsArticle49_1_1` 미체크 → **차단 아님**(미체크=요건 불충족 = 게이트가 할증으로 처리, UX상 결과뷰 안내). ※ "선택했으나 false"는 유효 입력.
- 비상장은 2호 선택 시 `evaluationDate`(D) 필수.
- ⚠️ UI 조건부 렌더와 validate 필수가 **일치**해야 함(통과↔차단 모순 금지). 2호 미선택이면 `section53_8_2` 검증 skip.

## 5. 동기화 체크리스트 (Do 완료 게이트)

- [ ] 공용 라벨 import (상장·비상장·결과뷰·PDF 모두 단일 출처)
- [ ] 2호 보조입력 조건부 렌더 (선택 onChange 직접 set, useEffect 미러링 0)
- [ ] testid 8종(상장4·비상장4) 동결
- [ ] validate ↔ UI 조건 일치
- [ ] 상장 마이그레이션 normalize 적용(기존 저장값 깨짐 0)
- [ ] `npx tsc --noEmit` 0 · 회귀 test 통과 · 차단 validation 추가분 전체 E2E baseline 대조
- [ ] E2E spec: 상장 2호 배제(케이스1) + 기간초과 무효(케이스3) Playwright. 셀렉터 정책: EstateItem 모달 유지(keepModalOpen)·ToggleChip=role=switch (`feedback_e2e_gift_modal_chip_switch_selectors`)
