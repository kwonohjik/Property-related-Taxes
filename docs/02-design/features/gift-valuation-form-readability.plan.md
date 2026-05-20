# 증여재산 평가명세서 — ② 재산종류 라벨화 + ③ 사전증여 소재지 표시 계획서 (v2 — 사실관계 검토 반영)

> 작성일: 2026-05-20
> 재검토일: 2026-05-20 (v2) — 사실관계 4건 정정 + 누락 1건(사전증여 ② 하드코딩) 식별
> 영역: 증여세 결과 화면 — 증여재산 및 평가명세서 (별지 제10호서식 부표 1)
> 파일: `components/calc/results/GiftTaxValuationFormTable.tsx` (440줄) +
>        `components/calc/PriorGiftInput.tsx` (490줄) +
>        `lib/tax-engine/types/inheritance-gift.types.ts` +
>        `lib/validators/property-valuation-input.ts` (priorGiftSchema 위치)

## v2 변경 요약
| # | v1 표현 | v2 정정 |
|---|---|---|
| 1 | "`cash → 01` 매핑은 잠재 버그 1건 사전 식별" (단정) | "**검증 의존** — Phase A KoreanLaw 결과에 따라 결정. 추정 단계에서 단정 금지" |
| 2 | priorGiftSchema 위치 `app/api/calc/gift/route.ts` | **정정**: `lib/validators/property-valuation-input.ts:136` 에 정의 — route.ts는 import만 |
| 3 | "사전증여 ② 컬럼 코드 매핑" 누락 | **신규 식별**: line 289 `<td>12</td>` 하드코딩 — 사전증여가 부동산이어도 "12(기타금융재산)" 고정 표시. `PriorGift.propertyCategory?: EstateItem["category"]` 추가 필요 |
| 4 | describePriorGift return string → ReactNode 호환성 | **검증 완료**: 호출처 1곳(line 298, `<td>` children) — JSX 호환. CELL_NAME 클래스는 text-only 가정 없음 |
| 5 | KoreanLaw MCP 접근 방법 | **명시**: `search_law("상속세 및 증여세법 시행규칙", "제10호")` → `get_annexes(law_id, "[별지 제10호서식 부표 1]")` 로 양식 첨부 본문 조회 |

---

## 1. 문제 정의

### 사용자 요구
> ① 재산 종류 코드에 숫자 말고 코드에 해당하는 실제 재산을 표시하세요
> ② 소재지에는 "사전 증여"라 하지 말고 사전 증여재산 소재지를 표시하세요

### 현재 동작 (image #22 기준)
| 컬럼 | 현재 | 문제 |
|---|---|---|
| ② 재산종류코드 | `05`, `12` 단독 숫자 표시 | 사용자가 부표 1 뒷면 코드표를 봐야만 의미 해석 가능 — 가독성 저하 |
| ③ 소재지·법인명 등 (사전증여 행 A24) | `사전증여 (2022-07-20)` | 실제 사전증여 부동산 소재지·자산 명칭이 없고 라벨만 표시 — 자산 식별 불가 |

### 근본 원인
1. **②**: `GiftTaxValuationFormTable.tsx:31-45`의 `PROPERTY_TYPE_CODE` 매핑은 코드 숫자만 반환. 라벨 매핑 부재
2. **③**: `PriorGift` 타입(`lib/tax-engine/types/inheritance-gift.types.ts:204`)에 자산 명칭·소재지 필드 부재. `describePriorGift()`(line 134)가 `"사전증여 (YYYY-MM-DD)"` 고정 포맷 반환

---

## 2. 해결 방향 — 옵션 매트릭스

### ② 재산종류 표시
| 옵션 | 형식 예 | 장점 | 단점 | 권장 |
|---|---|---|---|---|
| A | "05" (현재) | 부표 1 양식 정확 | 가독성 ❌ | ❌ |
| B | "공동주택" (라벨만) | 가독성 ★ | 부표 1 공식 코드 보조 정보 없음 | △ |
| C | "05 공동주택" (코드 + 라벨) | 가독성 + 공식 코드 보존 | 셀 좁으면 줄바꿈 | ★ |
| D | "공동주택<br/><sub>(05)</sub>" (라벨 메인 + 코드 작게) | 시각 위계 명확 | HTML 추가 | ★★ 권장 |

→ **옵션 D 채택**. 컬럼 너비 22mm·폰트 11px 기준 2줄 표시 충분.

### ③ 사전증여 소재지
| 옵션 | 방식 | 장점 | 단점 | 권장 |
|---|---|---|---|---|
| A | `PriorGift.propertyName?: string` 신규 + `propertyLocation?: string` 신규 — 사용자 입력 | 자산 식별 명확 | UI 필드 추가, 입력 부담 | ★★ 권장 |
| B | 자동 fallback "사전증여 N건째" 같은 번호 | 입력 부담 0 | 자산 식별 불가, 본질적 미해결 | ❌ |
| C | 이력 자동 조회 시 출처 EstateItem.name 자동 복원 | 자동 채움 | 수동 입력 PriorGift는 여전히 빈칸 | △ (A와 병행) |

→ **옵션 A 채택**. 추가로 옵션 C(이력 조회 시 자동 복원)도 후속 PR에서 검토.

---

## 3. 작업 매트릭스 — 14개 동기화 지점

| # | 지점 | 위치 | 변경 내용 |
|---|---|---|---|
| ① | 폼 상태 타입 | `components/calc/GiftTaxForm.tsx` FormState.priorGifts | 변경 없음 (PriorGift 타입 확장으로 자동 추종) |
| ② | initial value | 동일 | 사용자 입력으로만 채워지므로 default ""·undefined |
| ③ | normalize fallback | `lib/stores/` (해당 시) | propertyName/propertyLocation undefined → "" 처리 |
| ④ | API 변환 | `lib/calc/gift-tax-api.ts` (없으면 GiftTaxForm.buildInput) | PriorGift propertyName·propertyLocation 통과 |
| ⑤ | UI 입력 위젯 | `PriorGiftInput.tsx` | **소재지 + 자산 명칭 입력 필드 신규** |
| ⑥ | 사이드바 합계 | — | 영향 없음 |
| ⑦ | 결과 카드 산식·표시 | `GiftTaxValuationFormTable.tsx` | **② 라벨 매핑 + ③ describePriorGift 변경** |
| ⑧ | Validation | `PriorGiftInput` 자체 검증 | 소재지·명칭은 optional (필수 아님) — 입력 없을 때 fallback "사전증여" |
| ⑨ | Zod enum 메인 | `app/api/calc/gift/route.ts` — `priorGiftSchema` | propertyName/propertyLocation optional 추가 |
| ⑩ | Zod enum 컴패니언 | 동일 | — |
| ⑪ | acquisitionDate fallback | — | 해당 없음 |
| ⑫ | Zod 입력 객체 정의 | `priorGiftSchema` | string optional 2필드 추가 |
| ⑬ | callTransferTaxAPI body spread | gift는 직접 fetch — `GiftTaxForm.buildInput` | spread 시 PriorGift 전체 그대로 전달 (변경 없음) |
| ⑭ | Route handler 엔진 입력 매핑 | `app/api/calc/gift/route.ts` | PriorGift type 확장 → 자동 전달 (Date 변환 없음, string fields) |

추가:
- **타입 확장 3필드 (v2 — propertyCategory 추가)**:
  - `PriorGift.propertyName?: string` — 자산 명칭 표시용
  - `PriorGift.propertyLocation?: string` — ③ 컬럼 소재지 표시용
  - **`PriorGift.propertyCategory?: EstateItem["category"]`** — ② 컬럼 코드·라벨 표시용 (v2 신규 — 하드코딩 "12" 우회)
  - 모두 optional, 위치: `lib/tax-engine/types/inheritance-gift.types.ts:204` PriorGift interface
- **부표 1 라벨 매핑 14종**: KoreanLaw MCP로 시행규칙 [별지 제10호서식 부표 1] 뒷면 §2 코드표 검증 후 확정
- **사전증여 ② 컬럼 동적화 (v2 신규)**: line 289 `<td>12</td>` 하드코딩 → `toPropertyTypeDisplay(pg.propertyCategory ? toPropertyTypeCode(pg.propertyCategory) : "12")` — propertyCategory 미입력 시 fallback "12"

---

## 4. ② 재산종류 14종 라벨 매핑 (KoreanLaw 검증 필요)

### 추정 매핑 (검증 전)
| 코드 | 라벨 (추정) | EstateItem.category 매핑 |
|---|---|---|
| 01 | 부동산 (토지·건물 일괄) | (미사용) |
| 02 | 토지 | `real_estate_land` |
| 03 | 건물 (주택 외) | (현재 미세분) |
| 04 | 건물 부속토지 | (미사용) |
| 05 | 공동주택 | `real_estate_apartment` |
| 06 | 오피스텔 및 상업용 건물 | (현재 `real_estate_building`에 묶임 — Phase 2 분리 후속) |
| 07 | 일반 건물 (주택) | `real_estate_building` |
| 08 | 시설물 (회원권·영업권) | (미사용) |
| 09 | 상장주식 | `listed_stock` |
| 10 | 비상장주식 | `unlisted_stock` |
| 11 | 무체재산권 | (Phase 1 `financial`로 매핑 중 — 재검토) |
| 12 | 기타금융재산 (현금·예금) | `deposit`, `other` |
| 13 | 가상자산 | (미사용) |
| 14 | 그 외 기타 | (미사용) |

### 검증 단계 (Pre-Do) — v2 정정
1. `KoreanLaw MCP search_law("상속세 및 증여세법 시행규칙", "[별지 제10호서식 부표 1]")` 로 시행규칙 본문에서 양식 위치 식별
2. `get_annexes(law_id, "별지 제10호서식 부표 1")` 또는 `get_law_text(...)` 로 양식 첨부 본문(뒷면 §2 코드표) 전문 조회
3. 14종 라벨 정확 명칭 확정 (특히 11·14·06·08 라벨)
4. **현재 매핑 9종 재검증** — 단정 금지, 검증 결과 의존:
   - `cash: "01"` (현재) → 부표 1 정의에 따라 `"12"` 가능성 있음. **검증 후 결정**
   - `financial: "11"` (현재) → 무체재산권 매핑 적정 여부 검증
   - `real_estate_building: "07"` → 오피스텔·상업용(06)과 일반건물(07) 분리 필요 여부 후속

→ **v2 톤다운**: "잠재 버그 사전 식별"이 아닌 "**검증 후보**". KoreanLaw MCP 결과로만 확정. 정책 [[korean-law-citation-verify]] · [[feedback-korean-law-82-vs-81-2-drift]] 준수 — 추정 인용 금지.

### 라벨 매핑 코드 (구현 예정)
```typescript
const PROPERTY_TYPE_LABEL: Record<string, string> = {
  "01": "부동산",
  "02": "토지",
  "03": "건물",
  "04": "건물 부속토지",
  "05": "공동주택",
  "06": "오피스텔·상업용건물",
  "07": "일반건물",
  "08": "시설물",
  "09": "상장주식",
  "10": "비상장주식",
  "11": "무체재산권",
  "12": "기타금융재산",
  "13": "가상자산",
  "14": "그 외 기타",
};

function toPropertyTypeDisplay(code: string): React.ReactNode {
  const label = PROPERTY_TYPE_LABEL[code] ?? "기타";
  return (
    <>
      <div className="font-medium">{label}</div>
      <div className="text-[9px] text-gray-500">({code})</div>
    </>
  );
}
```

---

## 5. ③ 사전증여 소재지 표시 — `describePriorGift` 변경

### 변경 전 (현재)
```typescript
function describePriorGift(pg: PriorGift): string {
  return `사전증여 (${pg.giftDate})`;
}
```

### 변경 후
```typescript
function describePriorGift(pg: PriorGift): React.ReactNode {
  // 우선순위: propertyName + propertyLocation > propertyLocation > propertyName > fallback
  const name = pg.propertyName?.trim();
  const loc = pg.propertyLocation?.trim();
  if (name && loc) {
    return (
      <>
        <div>{loc}</div>
        <div className="text-[9px] text-gray-500">{name} · 사전증여 ({pg.giftDate})</div>
      </>
    );
  }
  if (loc) return <>{loc} <span className="text-[9px] text-gray-500">· 사전증여 ({pg.giftDate})</span></>;
  if (name) return <>{name} <span className="text-[9px] text-gray-500">· 사전증여 ({pg.giftDate})</span></>;
  // fallback (입력 미제공 시)
  return `사전증여 (${pg.giftDate})`;
}
```

return 타입 변경(string → ReactNode) — **호환성 v2 검증 완료**:
- 호출처 grep: `describePriorGift` 사용처 1곳뿐 (`GiftTaxValuationFormTable.tsx:298`)
- `<td className={CELL_NAME}>{describePriorGift(pg)}</td>` 패턴 — JSX children은 ReactNode 허용
- CELL_NAME은 text-left padding/border 등 layout 클래스만 — text-only 가정 없음
- 다른 파일에서 import 사용 없음 (file-local function)

### v2 신규 — 사전증여 ② 컬럼 동적화 (line 285-290)
```tsx
// 변경 전 (line 288-290) — 하드코딩
<td className={CELL_CENTER} data-testid="col-property-type">
  12
</td>

// 변경 후
<td className={CELL_CENTER} data-testid="col-property-type">
  {toPropertyTypeDisplay(
    pg.propertyCategory ? toPropertyTypeCode(pg.propertyCategory) : "12",
  )}
</td>
```
fallback "12" 유지로 기존 PriorGift(propertyCategory 미보유) 회귀 0건.

---

## 6. UI — `PriorGiftInput` 입력 필드 신규

### 현재 입력 필드 (추정)
- 증여일자, 증여자 관계, 증여금액, 납부한 증여세, 수증자 유형 등

### 추가 필드 (옵션) — v2 3필드
- **자산 종류** `propertyCategory?: EstateItem["category"]` — Select 위젯 (현금/토지/공동주택/일반건물/상장주식/비상장주식/금융/예금/기타). 미입력 시 결과 화면 ② 컬럼은 fallback "12" 유지
- **자산 명칭** `propertyName?: string` — 예: "성북동 다세대주택"
- **소재지** `propertyLocation?: string` — 예: "서울특별시 성북구 성북로15길 15"

배치: 사전증여 행의 추가 행으로 3개 위젯 (Select 1 + Input 2). FieldCard 라벨:
- "자산 종류(선택) — 신고서 ② 컬럼 표시용"
- "자산 명칭(선택)"
- "소재지(선택) — 신고서 ③ 컬럼 표시용. 미입력 시 '사전증여 (YYYY-MM-DD)'로 표시됩니다."

> placeholder 숫자 예시 금지 정책 준수 ([[feedback-pdca-session-efficiency]]). 한국어 형식 설명만.
> Select 위젯은 `<SelectValue />` 단독 금지 — SelectTrigger 명시 라벨 ([[feedback-select-component]]).

---

## 7. 단계별 작업 (Phase A~D)

### Phase A — KoreanLaw 검증 + 잠재 버그 식별 (Pre-Do)
1. KoreanLaw MCP로 부표 1 뒷면 §2 코드표 14종 라벨 전문 조회
2. 현재 매핑 9종 검증 (특히 `cash → 01`)
3. 정정 사항 도출 → 메모리 [[korean-law-citation-verify]] 정책 적용
4. **산출**: 14종 라벨 매핑 표 확정

### Phase B — 엔진/타입 확장 (v2 3필드)
1. `PriorGift` 3필드 추가 (`lib/tax-engine/types/inheritance-gift.types.ts:204`):
   - `propertyCategory?: EstateItem["category"]`
   - `propertyName?: string`
   - `propertyLocation?: string`
2. `priorGiftSchema` (Zod) optional 3필드 추가 — **위치 정정**: `lib/validators/property-valuation-input.ts:136`
   ```typescript
   propertyCategory: z.enum([
     "cash", "real_estate_land", "real_estate_apartment", "real_estate_building",
     "listed_stock", "unlisted_stock", "financial", "deposit", "other",
   ]).optional(),
   propertyName: z.string().optional(),
   propertyLocation: z.string().optional(),
   ```
3. 엔진 계산 로직(`gift-tax.ts`·`gift-prior-aggregation.ts`)은 영향 없음 — 표시용 메타데이터

### Phase C — UI 입력 위젯
1. `PriorGiftInput.tsx`에 자산 명칭·소재지 입력 2필드 추가
2. `PriorGift` 객체 생성/편집 시 신규 필드 통과
3. 이력 자동 조회 시 출처 `EstateItem.name`을 propertyName으로 prefill (옵션 C 후속)

### Phase D — 결과 카드 표시 (v2 4건)
1. `PROPERTY_TYPE_LABEL` 14종 매핑 신규 (`GiftTaxValuationFormTable.tsx` 내부 — 800줄 정책 여유)
2. `toPropertyTypeDisplay(code: string): React.ReactNode` 헬퍼 — ② 컬럼에 라벨 메인 + 코드 부제 2줄
3. `describePriorGift(pg): React.ReactNode` 변경 — ③ 컬럼에 소재지·명칭 우선, fallback "사전증여 (날짜)"
4. **v2 신규**: 사전증여 행 ② 컬럼(line 288-290) 하드코딩 "12" → `toPropertyTypeDisplay(pg.propertyCategory ? toPropertyTypeCode(pg.propertyCategory) : "12")` 동적화
5. 본문 행(A11) ② 컬럼(line 246-248)도 `toPropertyTypeDisplay(propertyCode)` 적용
6. 빈 행 등 기존 분기 회귀 확인

### Phase E — 테스트 anchor (v2 8건)
1. `__tests__/components/calc/GiftTaxValuationFormTable.test.tsx`에 anchor 추가:
   - **L1** A11 본문 행 ② 컬럼에 `공동주택` 라벨 + `(05)` 부제 동시 노출
   - **L2** A11 본문 행 — 모든 9종 EstateItem category에 대해 정확한 라벨 매핑 (parametrized)
   - **L3** A24 사전증여 행 — `propertyCategory: "real_estate_apartment"` 입력 시 ②에 `공동주택 (05)` 표시 (하드코딩 12 우회 검증)
   - **L4** A24 사전증여 행 — `propertyCategory` 미입력 시 ② fallback `기타금융재산 (12)` 유지
   - **L5** A24 사전증여 행 — `propertyLocation: "서울특별시 ..."` 입력 시 ③ 컬럼에 소재지 표시
   - **L6** A24 사전증여 행 — `propertyLocation`·`propertyName` 모두 미입력 시 ③ fallback `사전증여 (YYYY-MM-DD)`
2. `PriorGiftInput.test.tsx`에 anchor:
   - **L7** 자산 종류 Select 변경 → onChange payload에 `propertyCategory` 포함
   - **L8** 자산 명칭·소재지 input 변경 → onChange payload에 신규 필드 포함

---

## 8. 회귀 보호

| 회귀 위험 | 완화 |
|---|---|
| 기존 사전증여 데이터(propertyLocation 없음)가 결과 화면에서 빈 셀로 보임 | fallback "사전증여 (YYYY-MM-DD)" 유지 |
| ②/⑦ describePriorGift return 타입 변경(string → ReactNode) | 사용처 grep 전수 점검 후 `<td>` children으로 직접 렌더 — JSX 호환 |
| `cash → 01` 매핑 정정 시 기존 테스트 회귀 | KoreanLaw 검증 결과로만 결정 — 잘못된 매핑이면 anchor도 함께 정정 |
| PriorGift 신규 필드가 IndexedDB 이력에 없음 | 이력 hydration 시 optional이라 undefined 통과 — 새 입력만 채워짐 |
| Zod schema 변경 시 API 차단 | optional 추가는 backward-compatible |

---

## 9. 완료 조건 (Definition of Done) — v2

- [ ] **Phase A** KoreanLaw MCP로 부표 1 뒷면 §2 코드표 14종 라벨 전문 검증 완료 (`search_law` + `get_annexes`) + 매핑 9종 재검증(`cash`·`financial` 등) 결과 기록
- [ ] **Phase B** `PriorGift` 3필드(`propertyCategory?`·`propertyName?`·`propertyLocation?`) + Zod schema 확장 — 위치: `lib/validators/property-valuation-input.ts:136`
- [ ] **Phase C** `PriorGiftInput`에 입력 위젯 3종 추가 (Select 1 + Input 2), FieldCard 패턴 준수, Select 명시 라벨
- [ ] **Phase D** 본문 행 ② 컬럼 라벨 매핑 + **사전증여 행 ② 하드코딩 "12" 동적화** + ③ describePriorGift 변경
- [ ] **Phase E** anchor 8건 PASS (L1~L8)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run` 전체 회귀 0건
- [ ] 브라우저 수동 확인:
  - 본문 행 ② "공동주택 (05)" / "기타금융재산 (12)" 등 라벨·코드 2줄 표시
  - **사전증여 행 ②** — `propertyCategory: real_estate_apartment` 입력 시 "공동주택 (05)" 표시 (하드코딩 12 우회 확인)
  - **사전증여 행 ③** — 사용자 입력 소재지가 정확히 표시됨
  - **fallback 동작** — `propertyCategory`/`propertyLocation` 미입력 시 기존 데이터 회귀 0

---

## 10. 후속 (선택)

- **이력 자동 prefill (옵션 C)**: `priorGifts` 입력 시 이력 모달에서 자산 선택 → 자산 EstateItem.name을 propertyName으로 자동 채움 (`history-lookup-modal` 패턴 차용)
- **부표 1 코드 14종 enum 강제**: 현재 `PROPERTY_TYPE_CODE`는 `Record<EstateItem.category, string>` — 14종 코드를 union 타입으로 강제하여 TypeScript 컴파일러가 누락 catch ([[feedback-enum-substring-match-forbidden]] 정책 정합)
- **메모리 추가**: `feedback_besshi_form_label_required.md` (★) — 공식 신고서 양식 코드 표시 시 숫자 단독 금지·라벨 병기 정책
- **다른 별지 양식 일관성**: 별지 제11호 등 다른 신고서 양식의 코드 컬럼에도 동일 패턴 적용 후속 PR

---

## 11. 위험·미해결 사항 (v2)

1. **매핑 9종 정확성 (cash·financial 등)**: Phase A KoreanLaw 검증 결과에 따라 수정 가능. 기존 anchor와 충돌 시 anchor도 정정 ([[feedback-anchor-correction-legal-priority]])
2. **14종 코드 라벨 정확 명칭**: 시행규칙 [별지 제10호서식 부표 1] 〈개정 2026. 3. 20.〉 기준. KoreanLaw MCP `get_annexes` 응답 검증 필수
3. **모바일 표시**: 라벨 + 코드 2줄 표시가 좁은 컬럼(22mm)에서 줄바꿈 적절한지 시각 확인 필요. `text-[10px]` + `leading-tight`로 컴팩트화 후속
4. **PriorGift 사용자 부담**: 3필드 모두 선택 입력. 미입력 시 fallback("12" / "사전증여 (날짜)") 유지로 기존 사용자 회귀 0
5. **IndexedDB 이력 마이그레이션**: 기존 저장된 PriorGift에는 신규 3필드 없음 → optional이라 undefined 통과. UI는 빈 폼 + fallback 표시 정상
6. **GiftTaxForm `buildInput` spread 호환**: PriorGift spread 시 신규 필드 자동 통과 (line 593 `{ sourceCalculationId: _src, ...rest }` 패턴 — strip 대상이 아니므로 그대로 전달)
7. **Date 변환 영향 없음**: 신규 3필드 모두 string·enum — Date coerce 영향 없음
