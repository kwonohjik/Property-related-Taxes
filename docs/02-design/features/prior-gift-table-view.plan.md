# 사전증여재산(§13) 카드 → 요약 테이블 + 편집 모달 전환 계획

> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `components/calc/prior-gift/PriorGiftTableView.tsx` 가 이 계획서를 인용하며 실재한다.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: 상태: Plan (Do 미착수) · 작성 2026-06-13~~
> 유형: **순수 UI 리팩터** (엔진·타입·API·Validation 무변경, 8지점 중 ⑤만)
> 선행 동형 패턴: [estate-asset-table-view](./estate-asset-table-view.plan.md) · [debt-item-table-view](./debt-item-table-view.plan.md) · [inheritance-heir-table-view](./inheritance-heir-table-view.plan.md)

---

## 1. 목표 / 범위

상속세 마법사 Step3(증여세 마법사도 공유)의 **사전증여재산(§13)** 입력을
지금의 **세로 카드 나열**(`GiftRowEditor` 직렬) →
**요약 테이블 + 행 클릭 Dialog 모달 편집**(이미지2 "상속재산 목록" 동형)으로 전환한다.

### 범위 (In)
- `PriorGiftInput.tsx`(상속세 `mode="inheritance"` + 증여세 `mode="gift"` 공용) 테이블화.
- 행 클릭 → shadcn `Dialog`에 기존 `GiftRowEditor` 본문 **그대로** 렌더.
- 읽기 전용 요약 테이블 + 옵션 배지 derive(실제 입력된 비기본 값만).

### 범위 (Out)
- 엔진·`PriorGift` 타입·`inheritance-api.ts`/`gift-api.ts` 변환·`inheritance-validate.ts`·Zod 스키마 **무변경**.
- `GiftRowEditor` 입력 필드·분기·자동계산 로직 **무변경**(모달 안으로 위치만 이동).
- `PriorGiftHistoryModal`("이력에서 조회") 무변경 — 헤더 버튼 그대로 유지.
- `AggregationSummary`(합산 요약) 무변경 — 테이블 하단 그대로 유지.

---

## 2. 현황 분석 (실측)

### 2.1 현재 구조
| 파일 | 줄수 | 역할 |
|---|---|---|
| `components/calc/PriorGiftInput.tsx` | 215 | main export + 마법사 합성. 헤더(제목·"📋 이력에서 조회"·건수 배지) · `gifts.map(GiftRowEditor)` 직렬(:187) · "사전증여 추가" 버튼(:203) · `AggregationSummary`(:212) |
| `components/calc/prior-gift/GiftRowEditor.tsx` | **780** | 개별 증여 카드 — 증여일·수증자 select·증여재산가액·[B] 과세표준 산정방식·[C] 미성년 토글·§53의2·기납부 증여세·부표1 메타(접힘)·§30 특례·Phase A §47 블록 |
| `components/calc/prior-gift/{GiftTaxBaseModeBlock,MinorAtGiftToggleBlock,AggregationSummary,meta}.tsx/ts` | 92/60/91/137 | sub-block · 합산 요약 · 관계 라벨·부표 코드·`makeEmptyGift`·`hasUserEditedFields` |
| `components/calc/gift/PriorGiftHistoryModal.tsx` | — | "이력에서 조회" 모달(무변경) |
| `components/calc/inheritance/steps.tsx` `Step3` | — | `PriorGiftInput` 래핑(무변경 — public props 불변) |

### 2.2 핵심 함정 — **PriorGift에 행 식별자 `id`가 없다** ★★★
`lib/tax-engine/types/inheritance-prior-gift.types.ts`의 `PriorGift`에는
`doneeId`(수증자=Heir.id 참조)는 있으나 **행 자체의 고유 id가 없다.**
`GiftRowEditor`는 `key={i}`(index)로 렌더(`PriorGiftInput.tsx:189`).

→ 선행 패턴(EstateItem·DebtItem·Heir는 모두 `id` 보유, `selectedItemId: string|null`)과 **다르다.**
→ **선택 식별은 index 기반**(`selectedIndex: number|null`)으로 한다. (설계 결정 §3.3)

### 2.3 `mode` 2분기 — 컬럼/배지가 모드별로 다름 (실측)
- 상속세: `steps.tsx:328 Step3` → `mode="inheritance"` + **`heirs` 전달**. 수증자 select(Heir 매칭)·[B][C]·§53의2·§30 특례(`showSpecialType`).
- 증여세: `gift-tax-form-shared.tsx:551` → `mode="gift"` + **`heirs` 미전달**(undefined). 수증인 관계 select·Phase A §47 블록(donor·⑤·⑦·세대생략·⑫).
- 테이블 컬럼은 공통(증여일·수증자·가액), **배지·수증자 라벨이 모드 분기**.
- ★ **증여세 모드는 `heirs`가 없다** → 수증자 컬럼은 Heir 매칭 불가, `doneeRelation` 라벨만. 배지에서 영리법인·§53의2·[B]는 상속세 전용, donor·세대생략은 증여세 전용.

---

## 3. 설계

### 3.1 테이블 컬럼 (이미지2 상속재산 [종류·자산명·평가액·분류·옵션·편집] 대응)

| # | 컬럼 | 소스 | 비고 |
|---|---|---|---|
| 1 | **증여일** | `gift.giftDate` | 식별 핵심. 미입력 시 amber "미입력" 경고(검증 차단 필드) |
| 2 | **수증자** | 단일진실 헬퍼(§3.4) | 상속: Heir 매칭 라벨 "자녀 (홍길동) · 상속인" / 미지정 "상속인 증여(수동)" · 증여: `doneeRelation` 라벨 |
| 3 | **증여재산가액** | `gift.giftAmount` | 우정렬 `text-right font-mono tabular-nums`(amount-column-align). 0이면 "미입력" |
| 4 | **분류·옵션** | `resolvePriorGiftBadges`(§3.5) | 실제 입력된 비기본 값만(이력기반·영리법인·§30특례·직접입력⑤·§53의2·세대생략) |
| 5 | **편집** | — | ✎ 힌트 + 옵션 카운트(`Settings` 아이콘) |

- "종류"(`propertyCategory`)는 **선택 입력 + 대부분 미입력**(부표1 메타) → 독립 컬럼 X. 입력 시 4번 배지에 칩으로만 노출.
- `propertyName`이 있으면 수증자 컬럼 아래 보조 표기(상속재산 `name` 대응).

### 3.2 편집 모달
- shadcn `Dialog`. `open = selectedIndex !== null`, `onOpenChange(false) → setSelectedIndex(null)`.
- `DialogContent`에 `max-h-[80vh] overflow-y-auto`(긴 폼 — Phase A·부표1 펼침 대비).
- 내용물 = 기존 **`GiftRowEditor` 그대로**. 단:
  - 헤더 "증여 N"(`GiftRowEditor.tsx:166-196`)이 `DialogTitle`과 중복 → **`hideHeader?: boolean` prop 신설**로 헤더부(번호·이력기반/영리법인 배지·삭제 버튼) 숨김.
  - `DialogTitle`은 "증여 {index+1}", 우측 헤더에 이력기반/영리법인 배지 + **삭제 버튼**(rose-600) 재배치.
- **모달은 "닫기"만** — `onUpdate` 실시간 반영이라 저장/취소·폐기확인 불필요([[feedback_dialog_data_discard_confirm]]는 파괴 액션=삭제에만 적용. 닫기는 데이터 유지).
- 삭제 → `setSelectedIndex(null)`로 모달 자동 닫힘.

### 3.3 선택 상태 — **index 기반** (id 부재 대응)
```ts
const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
// 추가 → 자동 선택(모달 자동 오픈)
const handleAdd = () => { onChange([...gifts, makeEmptyGift()]); setSelectedIndex(gifts.length); };
const handleAddFromHistory = (pg) => { onChange([...gifts, pg]); setSelectedIndex(gifts.length); };
// 삭제 → 모달 닫기
const handleRemove = (i) => { onChange(gifts.filter((_, k) => k !== i)); setSelectedIndex(null); };
```
**index 안정성 근거**: 행 삭제 진입 경로는 **모달 안 삭제 버튼(=현재 선택 행)뿐**.
테이블 자체에 행별 삭제 X → "모달 열린 채 다른 index 행 삭제"가 발생하지 않음 → index 시프트 무해.
(상속인/채무/자산이 id를 쓰는 건 테이블에 인라인 액션이 있었기 때문이 아니라 기존 모델에 id가 있었을 뿐 — 여기선 id 신설=타입 변경 ②③ 파급 → **오버킬, index로 충분**.)

### 3.4 수증자 표시 — 단일진실 헬퍼 재사용 (dual-truth 회피)
`GiftRowEditor` 내부의 도출 로직을 **재구현 금지**([[feedback_ui_engine_dual_truth_avoidance]] · [[single-source-engine-helper]]):
- `deriveBeneficiaryTypeFromHeir` · `deriveDoneeRelationFromHeir` (`lib/calc/prior-gift-donee-derive.ts`, export 실측 확인) import.
- Heir 매칭 라벨(`summaryLabel`)·관계 라벨(`HEIR_RELATION_LABEL`)은 현재 `GiftRowEditor` **내부 지역 상수**(:52, :246) → 테이블도 써야 하므로 **`meta.ts`로 추출**(공유). GiftRowEditor는 추출본 import로 교체(거동 불변).
- **모드별 분기 (heirs 가용성 기준)**:
  - 상속세(`heirs` 있음): `doneeId` 매칭 Heir → `summaryLabel(h)` + "상속인/비상속인"(`deriveBeneficiaryTypeFromHeir`). 미지정 → `isHeir`+`doneeRelation` 기반(§8-2 enumerate).
  - 증여세(`heirs` 없음): `doneeRelation` 라벨(`DONOR_RELATION_LABELS`)만. Heir 매칭 경로 미진입.

### 3.5 옵션 배지 derive — `resolvePriorGiftBadges(gift, mode, heirs)`
`resolveChips`/`resolveDebtBadges` 동형. **실제 입력된 비기본 값만**(자산 테이블 `isActiveData`·채무 "실제 입력만" 동형):

| 배지 | 조건 | tone |
|---|---|---|
| 📋 이력 기반 | `sourceCalculationId` truthy | violet |
| 🏢 영리법인 | `beneficiaryType === "corporate"` | violet |
| §30 창업자금 | `specialTreatmentType === "startup"` | emerald |
| §30 가업승계 | `specialTreatmentType === "family_business"` | emerald |
| 직접입력 ⑤ | `priorGiftTaxBaseInputMode === "manual"` | amber |
| §53의2 | `marriageBirthDeduction > 0` | sky |
| 세대생략 §57 | (gift 모드) `wasGenerationSkip === true` | rose |
| 부수토지 | `propertyCategory==="real_estate_land" && isAttachedLandToBuilding===true` | sky |

- 신설 위치: `components/calc/prior-gift/prior-gift-badges.ts`(배지 + 옵션 카운트 술어를 단일 출처로).
- `CHIP_TONE_CLASSES`(estate-card/chip-config)와 동일 tone 클래스 재사용 — 신규 색 매핑 금지([[feedback_tailwind_static_tone_mapping]]).

### 3.6 신설 / 수정 파일

**신설 2**
- `components/calc/prior-gift/PriorGiftTableView.tsx` — 읽기 전용 테이블(행=`<tr role="button" tabIndex={0}>` 클릭+Enter/Space). props: `gifts·selectedIndex·onSelect(index)·mode·heirs?`(증여세 모드 undefined). **`gifts.length===0`이면 `return null`**(현재 `PriorGiftInput.tsx:185` `gifts.length>0 &&` 가드 동형 — 0건 시 "추가" 버튼만).
- `components/calc/prior-gift/prior-gift-badges.ts` — `resolvePriorGiftBadges(gift, mode, heirs?)` + `countPriorGiftOptions`. (참조 동형: `resolveDebtBadges`는 `DebtItemTableView.tsx:51`, `resolveChips`는 `estate-card/chip-config.ts:121` — 본 신설은 사전증여 전용 별도 파일.)

**수정 3**
- `PriorGiftInput.tsx`(215→~230) — `gifts.map` 제거, `<PriorGiftTableView>` + `<Dialog>`(내부 `GiftRowEditor`) 오케스트레이션. 헤더·"이력에서 조회"·건수·"추가" 버튼·`AggregationSummary` **보존**. **public props 무변경** → `steps.tsx` diff 0.
- `GiftRowEditor.tsx`(780→~785) — `hideHeader?: boolean` prop 추가, 헤더부 조건부 렌더. 지역 상수 2종 meta.ts 추출 import.
- `meta.ts`(137→~155) — `HEIR_RELATION_LABEL`·`summaryLabel` 추출 추가.

> 800줄: `GiftRowEditor` 785 예상 — 임계 근접. hideHeader는 **조건부 래핑(추가 ~5줄)**만. 만약 초과 시 헤더부를 `GiftRowHeader.tsx`로 분리(상속인 `HeirEditor` 분리 동형, [[feedback_800line_split_export_preservation]]).

---

## 4. 8개 동기화 지점 영향

| # | 지점 | 영향 |
|---|---|---|
| ① 폼 상태 | `priorGifts: PriorGift[]` | **무변경** |
| ② initial | `makeEmptyGift()` | **무변경**(id 미신설) |
| ③ normalize | — | **무변경** |
| ④ API 변환 | `inheritance-api.ts`/`gift-api.ts` | **무변경** |
| ⑤ **UI 위젯** | PriorGiftInput·GiftRowEditor | **본 작업** |
| ⑥ 사이드바 | `inheritance-summary.ts:179` | **무변경** — `computeInheritanceSummary`가 `form.priorGifts.reduce`로 `priorGiftTotal` 합산하지만, 테이블 전환은 `priorGifts` **데이터 배열을 안 바꿈** → 합산 입력 동일 → 자동 무영향. (컴포넌트 내부 `AggregationSummary`는 사이드바와 **별개**의 또 다른 요약 — 둘 다 보존.) |
| ⑦ 결과 카드 | — | **무변경** |
| ⑧ Validation | `inheritance-validate.ts` | **무변경**(검증 차단 필드는 테이블 셀 amber로 시각화만) |

---

## 5. 리스크 / 함정

1. **index 동적 행 testid E2E 함정**([[project_heir_composition_table_modal_view]] TV-1): 행 `data-testid={`prior-gift-row-${index}`}`(동적)를 `getByTestId("prior-gift-row")` 정확매칭으로 찾으면 타임아웃 → `locator('tr[role="button"]')` 또는 정규식. **id 없으므로 testid는 index 기반** — 삭제 후 재매칭 주의.
2. **GiftRowEditor 800줄 임박**(780) — hideHeader 추가로 초과 시 헤더 분리(필수일 수 있음, "초과 시"가 아니라 사전 대비).
3. **모달 안 select·DateInput·CurrencyInput 포커스/IME**: Dialog 포커스 트랩 + `EnterKeyNavigationProvider`(IME 가드) 정상 동작 Pre-Do anchor로 확인. 부표1 펼침·Phase A 긴 폼 스크롤 확인.
4. **dual-truth 재구현 금지**: 수증자 라벨·배지는 §3.4·§3.5 단일 출처. 테이블이 isHeir·관계를 자체 재계산 금지.
5. **E2E 회귀**: 기존 사전증여 의존 spec(증여세 §47·상속세 §13·§53의2·§57·특례 스트림·영리법인 import 등 다수)이 **카드 직접 입력**을 전제 → 행 클릭→모달 경로로 셀렉터 재작성 필요. baseline 대조로 신규 실패만 판정([[feedback_e2e_preexisting_failures]]). gift/inheritance **양 모드 모두** 회귀 대상.
6. **"이력에서 조회" 후 자동선택**: `handleAddFromHistory`도 `setSelectedIndex(gifts.length)`로 모달 자동 오픈 → 사용자가 자동 채움 결과 즉시 확인. (모달 안에서 수정 시 sourceCalculationId 제거 로직 `handleUpdate` 보존.)

---

## 6. 작업 순서 (Phase)

- **P0 — Pre-Do anchor**([[pre-do-anchor-verification]]): 컴포넌트 테스트 1건 — 테이블 3행 렌더(상속/증여 각) + 행 클릭 → 모달 open + GiftRowEditor 필드 노출 + 배지 derive 8케이스. 먼저 실패 확보 후 디자인 환류.
- **P1 — 메타 추출**: `meta.ts`에 수증자 라벨 헬퍼 추출, `GiftRowEditor` import 교체(거동 불변 — 기존 spec green 유지).
- **P2 — 배지**: `prior-gift-badges.ts` 신설 + anchor.
- **P3 — 테이블**: `PriorGiftTableView.tsx` 신설.
- **P4 — 모달화**: `GiftRowEditor` `hideHeader` 추가 + `PriorGiftInput` 테이블+Dialog 오케스트레이션. (800줄 초과 시 헤더 분리.)
- **P5 — E2E 재작성**: 사전증여 의존 spec 셀렉터 마이그레이션(gift+inheritance) + 신규 `prior-gift-table-view.spec.ts`(상속/증여 행 클릭→모달→입력→배지).
- **P6 — 검증**: `npx tsc --noEmit` 0 · `npm run lint` · `npx vitest run __tests__/tax-engine/inheritance __tests__/tax-engine/gift` · 컴포넌트 anchor · 사전증여 E2E 양 모드 · **브라우저 수동 확인**(Playwright spec 통과로 충족, [[feedback_browser_verify_with_playwright]]).

---

## 7. 검증 기준 / DoD

- [ ] tsc 0 · lint 0(신규 파일 경고 0)
- [ ] 기존 inheritance/gift vitest 회귀 0(P1 메타 추출 거동 불변 포함)
- [ ] 컴포넌트 anchor: 테이블 렌더·행 클릭→모달·배지 derive 8케이스(상속/증여 양 모드)
- [ ] 신규 E2E 양 모드 + 마이그레이션된 기존 spec green(baseline 대조 신규 실패 0)
- [ ] PriorGiftInput public props 무변경 → `steps.tsx`·증여 step diff 0 확인
- [ ] 8지점 중 ⑤ 단독 — ①②③④⑥⑦⑧ 무변경 grep 확인
- [ ] 모든 신설/수정 파일 ≤ 800줄

---

## 8. 미해결 결정 사항 (Do 진입 전 확인 필요)

1. **삭제 버튼 위치**: 모달 헤더 우측(권장 — 현재 카드 헤더와 동선 동일) vs 모달 푸터. → 헤더 권장.
2. **수증자 미지정 행 표시**: "상속인 증여(수동)" vs "미지정" — `isHeir`+`doneeRelation` 조합 라벨. 데이터 전수 케이스 enumerate 후 확정([[feedback_ui_input_path_enumeration]]).
3. **증여세 모드 컬럼**: Phase A donor(증여자)를 테이블 컬럼/배지로 노출할지 — §47 그룹 식별에 유용하나 폭 제약. 배지로 처리 권장.
