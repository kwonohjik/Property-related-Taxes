# 영농상속공제 남은 후속 PR 작업 계획 (PR-C~F + 보강)

> 작성일: 2026-05-21
> 선행 완료: F-1·F-2·F-3 (`670bfec`) + F-4·F-5·F-6 UI (`55e22d6`) + F-7 사후관리 (`33f9881`)
> 대상: PR-C(F-8) · PR-D(F-9) · PR-E(F-10) · PR-F(F-11) + 보강 PR-G(UI 링크) · PR-H(UI RTL anchor)
> 정책 참조: `[[korean-law-citation-verify]]` · `[[single-source-engine-helper]]` · `[[pre-do-anchor-verification]]` · `[[feedback_explicit_prop_mapping_strip]]`

## 0. 남은 작업 매트릭스

| PR | Phase | 범위 | 작업량 | 의존 | 가치 |
|---|---|---|---|---|---|
| **PR-G** | 보강 | 메인 마법사 결과 카드 → 사후관리 시뮬레이터 진입 링크 | 소 | F-6·F-7 완료 | 높음 (사용자 발견성) |
| **PR-C** | F-8 | §15⑤2호 사업무관자산 5종 자동 차감 (가업상속과 공통) | 대 | F-1·가업상속 F-1 | 중간 |
| PR-D | F-9 | §16② 단서 — 영농상속 후 최대주주 사망 적용 배제 | 소 | F-2 | 낮음 (rare 케이스) |
| PR-E | F-10 | 거주지 Vworld + Haversine 30km 자동 검증 | 대 | F-4·F-5 | 중간 |
| PR-F | F-11 | 영농 종사 상속인 일부 분리 공제 (heirAllocations 연계) | 중 | F-2·heirAllocations | 중간 |
| PR-H | 보강 | UI RTL anchor (FC-1/9/11 + FE-1/6 + RD-3) | 소 | F-4·F-5·F-6 | 낮음 |

**진행 순서 권장**: PR-G(즉시) → PR-D(짧음) → PR-H(짧음) → PR-F → PR-E → PR-C

---

## 1. PR-G — 메인 마법사 진입 링크 (즉시)

### 1-1. 범위
사용자가 `/calc/inheritance` 결과 카드에서 5년 후 사후관리가 필요할 때 별도 페이지로 진입할 수 있는 자연스러운 동선.

### 1-2. 구현

**`components/calc/results/InheritanceTaxResultView.tsx` 갱신**:
- `FarmingDeductionDetailRow` 직후 또는 결과 카드 하단에 안내 카드 추가:

```tsx
{result.deductionDetail.farmingDeduction > 0 && (
  <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2 print:hidden">
    <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
      💡 영농상속공제 사후관리 안내
    </p>
    <p className="text-[11px] text-blue-700 dark:text-blue-300">
      상속개시일부터 5년 이내 영농상속재산을 처분하거나 영농 종사를 중단하면
      공제받은 금액 100%가 추징되고 이자상당액이 가산됩니다 (§18의3④ + §16⑦⑧).
    </p>
    <a
      href={`/calc/inheritance-postmgmt?originalDeduction=${result.deductionDetail.farmingDeduction}`}
      className="inline-block text-xs text-blue-700 dark:text-blue-300 underline"
    >
      → 사후관리 추징 시뮬레이터 진입
    </a>
  </div>
)}
```

**`app/calc/inheritance-postmgmt/page.tsx` 갱신**:
- `useSearchParams`로 `originalDeduction` querystring 수신
- **검증 필수**: `parseAmount(rawValue)` + `Math.max(0, x)` + 상한 30억 cap (`Math.min(x, 3_000_000_000)`)
- 검증 후 초기 상태에 자동 입력 (사용자 수정 가능)
- 음수·NaN·과대값(>30억) 시 빈값 fallback + 사용자 직접 입력 안내

### 1-3. Anchor (RTL — 컴포넌트 단위)
- PG-1: 메인 마법사 farmingDeduction>0 시 안내 카드 + 링크 노출 + querystring 포함 확인
- PG-2: 사후관리 페이지 mount + URL에 originalDeduction → 폼 초기값 채움
- PG-3: farmingDeduction=0 시 안내 카드 미렌더 (`container.querySelector` null)
- PG-4: querystring 음수·NaN → 빈값 fallback
- PG-5: querystring >30억 → 30억 cap

### 1-5. KoreanLaw MCP 재검증
안내 본문에 "§18의3④·§16⑦⑧" 인용 — 메인 계획서 §1-2 정합 확인 (검증 완료, 본 PR 진입 시 재확인 권장).

### 1-4. 위험 요소
- querystring 검증 — 음수·NaN·과대값 차단 (parseAmount + Math.max)
- 인쇄 시 안내 카드 `print:hidden` 적용

---

## 2. PR-D — F-9 §16② 단서 (영농상속 후 최대주주 사망)

### 2-1. 법령 정밀 인용 (PR 진입 전 KoreanLaw MCP 재검증)

**상증령 §16② 단서** (이미 검증 완료, 인용 본문):
> 다만, 제2호에 해당하는 경우로서 영농상속이 이루어진 후에 영농상속 당시 최대주주등에 해당하는 사람(영농상속을 받은 상속인은 제외한다)의 사망으로 상속이 개시되는 경우는 적용하지 아니한다.

→ **법인 영농(corporate) 트랙에만 적용**. 본 상속이 "직전 영농상속 당시 최대주주(상속받지 않은 자) 사망에 의한 두 번째 상속"이면 영농상속공제 적용 배제.

### 2-2. 신규 필드

```typescript
// inheritance-farming.types.ts
export interface FarmingInheritanceInput {
  // ... 기존
  /**
   * §16② 단서 — 본 상속이 직전 영농상속 최대주주(상속받지 않은 자) 사망에 의한
   * 두 번째 상속인 경우. corporate 트랙 전용 (§16②2호 단서).
   */
  isSecondaryAfterFarmingInheritance?: boolean;
}
```

### 2-3. 엔진 분기

`evaluateFarmingEligibility`에 §18의3⑥ 조세포탈 early return **다음 줄에 동일 패턴 추가** (단독 reason early return 트랙 — 다른 reasons 무관 종결):

```typescript
// 1. §18의3⑥ 조세포탈·회계부정 — 우선 배제 (기존)
if (input.hasTaxFraudConviction) { ... return; }

// 1-b. §16② 단서 — 영농상속 후 최대주주 사망 (corporate 전용, 단독 종결)
// KoreanLaw MCP 검증 2026-05-21: 시행령 §16② 단서 — 가업상속 §15③ 후단과 동일 패턴
if (input.type === "corporate" && input.isSecondaryAfterFarmingInheritance === true) {
  reasons.push("§16② 단서 — 영농상속 후 최대주주 사망에 의한 상속 (적용 배제)");
  return { eligible: false, reasons };
}

// 2. §16⑭ 영농 부정 (기존, 이후)
// ...
```

→ 단독 reason 패턴: 다른 reasons 추가 안 함. 사용자가 본 단서 체크 시 즉시 배제.

### 2-4. UI
`FarmingEligibilitySection.tsx`의 **§16⑭·§18의3⑥ "배제 사유" rose 그룹 내부**에 corporate 모드 전용 ToggleCard 추가 (단독 종결 사유 패턴과 일관):

```tsx
{/* 배제 사유 그룹 (rose) */}
<div className="space-y-1.5">
  <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">
    배제 사유 (§16⑭ + §18의3⑥ + §16② 단서)
  </p>
  {/* §16⑭ 영농 부정 (기존) */}
  {/* §18의3⑥ 조세포탈 (기존) */}
  {/* 신규 §16② 단서 — corporate 전용 */}
  {farming.type === "corporate" && (
    <ToggleCard
      tone="rose"
      size="sm"
      title="§16② 단서 — 영농상속 후 최대주주 사망 상속"
      description="본 상속이 직전 영농상속 당시 최대주주(상속받지 않은 자) 사망으로 개시된 두 번째 상속인 경우 적용 배제 (rare)"
      checked={farming.isSecondaryAfterFarmingInheritance ?? false}
      onCheckedChange={(v) =>
        update({ isSecondaryAfterFarmingInheritance: v ? true : undefined })
      }
    />
  )}
</div>
```

→ 위치: 기존 rose 그룹의 마지막 항목. corporate 트랙에만 노출.

### 2-5. Anchor (FD-17~19)
- FD-17: corporate + isSecondaryAfterFarmingInheritance=true → 0 + "§16② 단서"
- FD-18: personal + isSecondaryAfterFarmingInheritance=true → 무시 (corporate 전용)
- FD-19: corporate + 모든 요건 충족 + secondary=true → 0 (단서가 다른 요건 무관 배제)

### 2-6. 위험 요소
- 사용자가 "두 번째 상속" 개념 헷갈림 — UI 안내 보강 (예시·도식)
- Zod schema 갱신 (1 boolean optional 추가)

### 2-7. 14지점 영향
- ①~⑫ 모두 사소: optional boolean 추가만. ⑤ ToggleCard 1개 추가.

---

## 3. PR-H — UI RTL Anchor (보강)

### 3-1. 범위
F-4·F-5·F-6 UI 단위 테스트.

### 3-2. 신규 anchor

`__tests__/components/calc/inheritance/farming-section.test.tsx`:

| Anchor | 시나리오 |
|---|---|
| FC-UI-1 | FC-1 비영농 default — RadioCardGroup 선택 상태 검증 |
| FC-UI-2 | FC-9 listed_stock + corporate_stock만 활성 (나머지 disabled) |
| FC-UI-3 | FC-11 financial 카테고리 → 컴포넌트 미렌더 (`container.firstChild` null) |
| FE-UI-1 | FE-1 farming=undefined → 토글 OFF + 하단 폼 미렌더 |
| FE-UI-2 | FE-6 65세 미만 사망 → emerald 미리보기 ("✓ 모든 요건 충족") |
| FE-UI-3 | Dialog 데이터 폐기 — isEmptyFarming=true 시 즉시 종료, 아니면 confirm |
| RD-UI-1 | RD-1 정상 공제 (cappedDeduction>0) → emerald Row + "30억 이내" 안내 |
| RD-UI-2 | RD-1b 30억 cap (appliedAssetValue>30억) → 한도 적용 텍스트 노출 |
| RD-UI-3 | RD-2 evaluated=true + cappedDeduction=0 + 자산 미입력 → gray 안내 |
| RD-UI-4 | RD-3 자격 미충족 + 사용자 입력 → amber + reasons 목록 |
| RD-UI-5 | RD-4 미충족 + 자산 0 → gray "자격 미충족 + 자산 미입력" |
| RD-UI-6 | RD-5 evaluated=false (legacy) → violet 안내 |
| RD-UI-7 | farmingDetail undefined (엔진 갱신 전 케이스) → Row+Detail 모두 미렌더 |

### 3-3. 의존 패키지
이미 vitest + jsdom + RTL 갖춰져 있음. 추가 설정 불필요.

### 3-4. 위험 요소
- RTL React 19 호환 — 기존 anchor에서 검증된 패턴 따름
- Dialog mock (Radix UI primitive) — 기존 사례 활용

---

## 4. PR-F — F-11 상속인 일부 분리 공제

### 4-1. 범위
시행령 §16⑤ "제3항의 요건을 갖춘 상속인이 받거나 받을 상속재산" 정합 — 영농 종사 상속인 일부만 자격 충족 시 그 분배분만 공제.

### 4-2. 법령 인용 (KoreanLaw MCP 재검증 필요)

**§16⑤ 본문**:
> 법 제18의3제1항에서 "영농상속 재산가액"이란 다음 각 호의 구분에 따라 **제3항의 요건을 갖춘 상속인이 받거나 받을 상속재산**의 가액을 말한다.

→ 자격 충족 상속인의 heirAllocations 분배분 합만 영농상속재산가액.

### 4-3. 신규 데이터 모델

```typescript
// inheritance-farming.types.ts
export interface FarmingInheritanceInput {
  // ... 기존
  /**
   * 자격 충족 상속인 ID 목록 (heirAllocations 연계).
   * undefined: 모든 상속인 자격 충족 가정 (기존 동작 호환).
   * []: 명시 0건 (자격자 없음).
   * [...]: 명시 자격자 — heirAllocations 중 본 ID 분배분만 영농상속재산가액 합산.
   */
  qualifiedHeirIds?: string[];
}
```

### 4-4. 엔진 (시그니처 변경 + 호출처 갱신)

`suggestFarmingAssetValue` 시그니처 확장:

```typescript
// BEFORE (현재):
export function suggestFarmingAssetValue(estateItems: EstateItem[]): DeductionSuggestion;

// AFTER (PR-F):
export function suggestFarmingAssetValue(
  estateItems: EstateItem[],
  farming?: FarmingInheritanceInput,  // 신규 옵션 — qualifiedHeirIds 활용
): DeductionSuggestion {
  const eligible = estateItems.filter((i) => i.farmingCategory !== undefined);
  if (eligible.length === 0) return { /* ... */ isApplicable: false };

  const qualifiedIds = farming?.qualifiedHeirIds;

  let totalValue = 0;
  let totalMortgage = 0;
  const breakdown: string[] = [];

  for (const item of eligible) {
    let itemValue: number;
    if (qualifiedIds !== undefined && item.heirAllocations) {
      // 자격자 분배분만 합산
      itemValue = item.heirAllocations
        .filter((a) => qualifiedIds.includes(a.heirId))
        .reduce((sum, a) => sum + a.amount, 0);
      breakdown.push(
        `${LABEL[item.farmingCategory!]} ${item.name}: 자격자 분배 ${formatKrw(itemValue)}원 (전체 ${formatKrw(getValuatedAmount(item))}원)`,
      );
    } else {
      itemValue = getValuatedAmount(item);
    }
    totalValue += itemValue;
    totalMortgage += item.mortgageAmount ?? 0;
  }
  // ...
}
```

**호출처 갱신** (`components/calc/inheritance/step4-5.tsx`):
```typescript
// BEFORE:
const suggestFarming = useMemo(
  () => suggestFarmingAssetValue(allEstateItems),
  [allEstateItems],
);

// AFTER:
const suggestFarming = useMemo(
  () => suggestFarmingAssetValue(allEstateItems, form.farming),
  [allEstateItems, form.farming],
);
```
→ deps에 `form.farming` 추가 (qualifiedHeirIds 변경 시 재계산).

### 4-5. UI (props 시그니처 변경)

`FarmingEligibilitySection.tsx` props에 `heirs` 추가:

```typescript
// BEFORE:
export interface FarmingEligibilitySectionProps {
  farming: FarmingInheritanceInput | undefined;
  estateItems: EstateItem[];
  onChange: (farming: FarmingInheritanceInput | undefined) => void;
}

// AFTER (PR-F):
export interface FarmingEligibilitySectionProps {
  farming: FarmingInheritanceInput | undefined;
  estateItems: EstateItem[];
  heirs: Heir[];  // 신규 — 자격자 선택 UI
  onChange: (farming: FarmingInheritanceInput | undefined) => void;
}
```

**호출처 갱신** (`step4-5.tsx`):
```tsx
<FarmingEligibilitySection
  farming={form.farming}
  estateItems={allEstateItems}
  heirs={form.heirs}  // 신규
  onChange={(v) => set({ farming: v })}
/>
```

자격자 ID 선택 UI:

```tsx
{farming && heirs.length > 1 && (
  <div className="space-y-2">
    <p className="text-xs font-semibold">자격 충족 상속인 선택 (§16⑤ 본문)</p>
    {heirs.map((h) => (
      <ToggleCard
        key={h.id}
        tone="violet"
        size="sm"
        title={h.name || `${h.relation} ${h.id}`}
        checked={(farming.qualifiedHeirIds ?? []).includes(h.id)}
        onCheckedChange={(v) => {
          const current = farming.qualifiedHeirIds ?? [];
          update({
            qualifiedHeirIds: v
              ? [...current, h.id]
              : current.filter((id) => id !== h.id),
          });
        }}
      />
    ))}
  </div>
)}
```

### 4-6. Anchor (FQ-1~6)
- FQ-1: heirs 1명 + qualifiedHeirIds=undefined → 전체 영농자산 합
- FQ-2: heirs 2명 + heirAllocations + qualifiedHeirIds=[h1] → h1 분배분만
- FQ-3: heirs 2명 + qualifiedHeirIds=[] → 0
- FQ-4: heirAllocations 미입력 + qualifiedHeirIds=[h1] → 전체 분배 합 (legacy)
- FQ-5: 다중 자산 × 다중 자격자 합산 정확성
- FQ-6: 자격자 분배분 + 담보 차감 (§16⑤ 단서)

### 4-7. 위험 요소
- heirAllocations 미입력 시 분배 비율 산정 불가 — UI 안내
- 사용자가 자격자 체크 자동화 어려움 — Step4 평가 결과(eligible)를 모든 상속인 동일 가정 (현재 구현). 상속인별 분리 평가는 별도 PR 또는 후속

---

## 5. PR-E — F-10 거주지 Vworld 자동 검증 (대형)

### 5-1. 범위
시행령 §16②1호나 거주지 30km 자동 검증 — 현재는 사용자 체크박스만.

### 5-2. 데이터 흐름

1. EstateItem 농지 자산에 좌표 입력 (Vworld 주소 검색 시 자동)
2. 피상속인·상속인 주소 좌표 입력
3. Haversine 직선거리 계산
4. 30km 이내 자동 boolean

### 5-3. 신규 인프라

**기존 좌표 거리 헬퍼 사전 grep 권장**:
```bash
grep -rn "haversine\|haversineKm\|distanceKm\|좌표.*거리" lib/ 2>/dev/null
```
→ 2026-05-21 검증: 기존 헬퍼 없음. 신규 작성 안전.

**`lib/geo/haversine.ts` 신규**:
```typescript
/** WGS84 좌표 두 점 사이 직선거리 (km) */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

**`lib/calc/farming-residence-check.ts` 신규**:
```typescript
export function checkFarmingResidenceCompliance(
  estateItems: EstateItem[],
  decedentLatLng: { lat: number; lng: number } | undefined,
  heirLatLng: { lat: number; lng: number } | undefined,
): {
  decedentMet: boolean;
  heirMet: boolean;
  decedentMinDistanceKm: number | null;
  heirMinDistanceKm: number | null;
};
```

### 5-4. 신규 필드 (자산 분류별 좌표 분기)

```typescript
// EstateItem — 자산 위치 좌표 (Vworld 주소 검색 자동 저장)
estateLatLng?: { lat: number; lng: number };

/**
 * 어선·어업권 자산 전용 — 선적지·어장 연안 좌표.
 * 시행령 §16②1호나 후단 — 어선의 선적지·어장에 가장 가까운 연안.
 * farmingCategory ∈ {fishing_vessel, fishing_right}일 때만 의미.
 */
fishingAnchorLatLng?: { lat: number; lng: number };

// FarmingInheritanceInput — 피상속인·상속인 주소 좌표
decedentResidenceLatLng?: { lat: number; lng: number };
heirResidenceLatLng?: { lat: number; lng: number };
// 자동 검증 결과(decedentResidenceMet/heirResidenceMet)는 useMemo derive — 별도 필드 미저장
```

**자산-수준 좌표 사용 분기** (`farming-residence-check.ts`):
- `farmingCategory ∈ {farmland, pasture, forest_land, agricultural_building, salt_field}`: `estateLatLng` 사용 (농지 소재지)
- `farmingCategory ∈ {fishing_vessel, fishing_right}`: `fishingAnchorLatLng` 사용 (선적지·연안)
- `farmingCategory === "corporate_stock"`: 좌표 무관 (법인 영농은 거주 요건 없음)

### 5-5. UI
`FarmingEligibilitySection.tsx`에 거주지 좌표 입력 (Vworld 주소 검색) + 자동 boolean 미리보기 + 사용자 override boolean 유지.

### 5-6. Anchor (FR-1~8)
- FR-1: Haversine 정확성 — 서울→부산 약 325km
- FR-2: 30km 경계 (29.9km / 30.0km / 30.1km)
- FR-3: 다중 자산 — minDistance 검증
- FR-4: estateLatLng 미입력 자산 무시 (자동 검증 보류)
- FR-5: 어선·어업권 — 자산 분류별 별도 거주지 정의 분기 (선적지·어장 연안 좌표)
- FR-6: decedent/heir 모두 자동 검증 통과 → boolean 자동 true
- FR-7: 사용자 override true (자동 검증 false인데 사용자가 명시 true) → true
- FR-8: 자동 검증 통과인데 사용자 override false → false (사용자 우선)

### 5-7. 위험 요소
- **시행령 §16②1호나 정확 해석** — "시·군·구 또는 연접 시·군·구 또는 직선거리 30km"는 OR 조건 — Haversine 30km 외에 시·군·구 인접 판정 필요 (행정구역 API). 본 PR은 30km만 자동, 시·군·구는 사용자 체크박스 유지
- Vworld API 키 환경변수 의존 (`KOREAN_LAW_OC`와 별도) — 무력 시 fallback "수동 입력"
- 어선·어업권 좌표 — 선적지·어장 좌표는 농지 좌표와 다름 — 자산별 별도 입력

---

## 6. PR-C — F-8 사업무관자산 자동 차감 (대형, 가업상속 공통)

### 6-1. 범위
시행령 §15⑤2호 + §16⑤2호 — 법인 영농 + 가업상속 공통 사업무관자산 비율 차감.

### 6-2. 법령 인용 (KoreanLaw MCP 재검증)

이미 검증 완료 (메인 계획서 §3-2 + 후속 계획서 §3-2). 사업무관자산 5종(가·나·다·라·마) + 산식 명확.

### 6-3. 신규 데이터 모델

```typescript
// inheritance-corporate-non-business.types.ts 신규 (가업상속과 공통)

export interface CorporateNonBusinessAssets {
  nonBusinessLand?: number;       // 가. 비사업용토지 (소득세법 §104조의3)
  rentedRealEstate?: number;      // 나. 임대부동산 (단서 차감 후 순액)
  externalLoans?: number;         // 다. 임직원 외 대여금
  excessCash?: number;            // 라. 과다보유현금 (5년 평균 200% 초과분)
  nonOperatingFinancial?: number; // 마. 영업무관 금융상품
}

// EstateItem 확장
export interface EstateItem {
  // ...
  corporateNonBusinessAssets?: CorporateNonBusinessAssets;
  corporateTotalAssets?: number;  // 총자산 (분모)
}
```

### 6-4. 핵심 함수

`lib/tax-engine/property-valuation-corporate.ts` 신규:

```typescript
/**
 * 법인 영농 + 가업상속 주식 평가 — 사업무관자산 차감.
 *
 * 법령: 상증령 §15⑤2호 + §16⑤2호 (공통)
 * 산식: floor(stockValue × (totalAssets − sumOfNonBusiness) / totalAssets)
 * BigInt 정수 연산 — 1조 자산 곱셈 대응
 */
export function calcCorporateStockAdjustedValue(
  stockValue: number,
  totalAssets: number,
  nonBusinessAssets: CorporateNonBusinessAssets | undefined,
): {
  adjustedValue: number;
  sumOfNonBusiness: number;
  ratio: number;
};
```

산식 BigInt 정수 연산 — **Number 한계(2^53 ≈ 9e15) 검토**:

```typescript
const sum = Object.values(nonBusinessAssets ?? {}).reduce(
  (s, v) => s + Math.max(0, v ?? 0),
  0,
);
if (totalAssets <= 0) return { adjustedValue: 0, sumOfNonBusiness: sum, ratio: 0 };
const businessAssets = Math.max(0, totalAssets - sum);

// BigInt 곱셈 (큰 법인 자산 정밀도 보장):
// stockValue × businessAssets은 입력값에 따라 1e24까지 가능 (1조 × 1조).
// BigInt 내부 연산은 안전. 결과 정수 division 후 adjustedValue는 stockValue 이하라 Number 안전.
const adjustedBigInt =
  (BigInt(stockValue) * BigInt(businessAssets)) / BigInt(totalAssets);

// 안전성 검증: adjustedBigInt ≤ stockValue ≤ 사용자 입력 한계 → Number 변환 안전
const adjustedValue = Number(adjustedBigInt);

return {
  adjustedValue,
  sumOfNonBusiness: sum,
  ratio: businessAssets / totalAssets,
};
```

**Number 한계 분석**:
- `stockValue` (입력값) — 사용자 입력. 30억 한도 적용 전. **이론상 1e15까지 안전** (조 단위 OK)
- `businessAssets`·`totalAssets` — 사용자 법인 총자산. **1e15까지 안전**
- `stockValue × businessAssets` — **1e30까지 BigInt 곱셈 안전** (JS BigInt 무제한)
- `adjustedBigInt = floor(stockValue × ratio)` — `ratio ≤ 1`이므로 **adjustedBigInt ≤ stockValue**. 따라서 Number 변환 안전 (사용자 입력값 stockValue 자체가 Number 안전이라야 입력 가능)

**30억 한도 적용 위치**: 본 헬퍼는 한도 미적용 (raw adjustedValue 반환). 30억 cap은 `calcFarmingDeduction`에서 적용 (`Math.min(farmingAssetValue, FARMING_MAX)`). 즉:
1. `suggestFarmingAssetValue` → `getCorporateAdjustedAmount` (BigInt) → 사용자 입력 폼에 채움
2. 사용자 confirm → `farmingAssetValue` (Number, 폼 string 변환)
3. 엔진 `calcFarmingDeduction` → 30억 cap 적용

→ 폼 string ↔ Number 변환 시점에서 사용자 입력값 자체가 Number 안전 범위. BigInt는 중간 곱셈 정밀도 보장만 담당.

**경계 anchor 추가**: FNB-11 — `stockValue=1조`, `totalAssets=1조`, `nonBusinessAssets=0` → adjustedValue=1조 (Number 안전 검증).

### 6-5. UI

`components/calc/inheritance/CorporateNonBusinessAssetsSection.tsx` 신규:
- 조건부 렌더: `item.farmingCategory === "corporate_stock"` OR `item.familyBusinessCategory === "corporate_stock"`
- 5개 CurrencyInput + 1개 totalAssets
- 자동 비율 계산 미리보기 (useMemo)
- amber 안내: "임대부동산 단서·과다현금 5년 평균은 사용자가 직접 차감 후 입력"

통합: PropertyValuationForm·StockValuationForm 카드 내부, FarmingCategorySection 직후.

### 6-6. suggest 헬퍼 갱신

`suggestFarmingAssetValue`·`suggestFamilyBusinessValue`가 corporate_stock 항목에서 `calcCorporateStockAdjustedValue` 호출하여 adjustedValue 사용:

```typescript
function getCorporateAdjustedAmount(item: EstateItem): number {
  if (item.farmingCategory !== "corporate_stock" && item.familyBusinessCategory !== "corporate_stock") {
    return getValuatedAmount(item);
  }
  if (!item.corporateTotalAssets) return getValuatedAmount(item);
  return calcCorporateStockAdjustedValue(
    getValuatedAmount(item),
    item.corporateTotalAssets,
    item.corporateNonBusinessAssets,
  ).adjustedValue;
}
```

### 6-7. Anchor (FNB-1~10)
- FNB-1: 사업무관자산 0 → adjustedValue=stockValue
- FNB-2: 비사업용토지 50% → adjustedValue=stockValue×0.5
- FNB-3: 5종 모두 입력 (합 30%) → 70% 적용
- FNB-4: sumOfNonBusiness>totalAssets → adjustedValue=0
- FNB-5: BigInt 정밀도 — 1조 stockValue × 1조 totalAssets
- FNB-6: totalAssets=0 → ratio=0, adjustedValue=0
- FNB-7: corporateNonBusinessAssets undefined → stockValue 그대로
- FNB-8: suggestFarmingAssetValue corporate_stock 항목 자동 차감 적용
- FNB-9: suggestFamilyBusinessValue corporate_stock 동일 적용 (공통 헬퍼)
- FNB-10: 음수 입력값 → Math.max(0, x) clamp

### 6-8. UI Anchor (FNB-UI-1~3)
- FNB-UI-1: corporate_stock 미선택 시 컴포넌트 미렌더
- FNB-UI-2: corporate_stock 선택 시 5필드 + totalAssets 노출
- FNB-UI-3: 입력 변경 시 미리보기 useMemo 자동 재계산

### 6-9. 위험 요소
- **§15⑤2호 가. 비사업용토지 §104조의3 판정** — 기존 `lib/tax-engine/non-business-land/engine.ts` 재사용 (양도세 엔진). 어댑터 신규
- **나. 임대부동산 단서** — 임직원용 국민주택규모 이하 + 5년 무상임대 제외. 사용자가 차감 후 입력 권장 (자동 분류 X)
- **라. 과다보유현금 5년 평균** — 자동 계산 불가, 사용자 직접 입력
- **가업상속공제 §18의2 PRD 진입 시점**과 동기화 필요 — 본 PR-C는 가업상속 §18의2 정밀화와 함께 진행 권장 (메인 계획서 §10 동기)
- BigInt 곱셈 정밀도 — 안전 (사용자 입력 한계 안에서)

### 6-10. 14지점 영향
- ①~⑫ — corporate_stock 자산에만 corporateNonBusinessAssets·corporateTotalAssets 추가
- ⑤ UI — CorporateNonBusinessAssetsSection 신규
- ⑫ Zod — 두 신규 optional 객체·number

---

## 7. PR 분할 + 진행 순서 (재검토)

**중요 갱신** — 가업상속공제 §18의2 통합 PR(`7ca34dc`) **이미 완료** 확인. PR-C가 가업상속 정밀화의 자연스러운 다음 단계 → 우선순위 상향 가능.

```
PR-G (즉시, 소)
  ↓
PR-D (소) — §16② 단서
  ↓
PR-H (소) — UI RTL anchor
  ↓
PR-F (중) — 상속인 일부 분리
  ↓
PR-C (대) — 사업무관자산 (가업상속 §18의2 이미 완료, 동기 가능)  ⬆️ 상향
  ↓
PR-E (대) — Vworld 거주지 자동화 (마지막)
```

**우선순위 근거 (갱신)**:
1. PR-G — 사용자 발견성 즉시 개선 + 5분 작업
2. PR-D — 짧음 + corporate 모드 완성도
3. PR-H — 회귀 보호 (이미 구현된 UI)
4. PR-F — 상속인 일부 시나리오 (중요)
5. **PR-C** — 가업상속 §18의2 통합 완료 → 양 세목 공통 헬퍼 도입 적기. 영농 corporate_stock UI 완성도
6. PR-E — 거주지 Vworld 외부 API 의존성 (마지막)

## 8. KoreanLaw MCP 재검증 항목

각 PR 진입 전 재검증 (`[[korean-law-citation-verify]]`):

| PR | 검증 대상 |
|---|---|
| PR-G | 안내 본문 §18의3④·§16⑦⑧ 인용 (메인 계획서 §1-2 정합 재확인) |
| PR-D | §16② 단서 본문 ("최대주주등에 해당하는 사람") 정확 인용 |
| PR-H | UI 라벨 영농상속공제 §18의3 + 시행령 §16 인용 정합 |
| PR-F | §16⑤ 본문 ("제3항의 요건을 갖춘 상속인") |
| PR-C | §15⑤2호 가~마 + §15⑤2호 가. §104조의3 (소득세법) 인용 |
| PR-E | §16②1호나 정확 본문 (시·군·구·연접·30km OR 조건) + 어선·어업 후단 |

## 9. 위험 요소 — 통합

| 위험 | 영향 PR | 대응 |
|---|---|---|
| 가업상속 §18의2 PRD 진행 상황 — F-8 동기 필요 | PR-C | 가업상속 §18의2 정밀화 PRD와 동시 진입 권장 |
| Vworld API 의존성 + 좌표 정밀도 | PR-E | 무력 시 사용자 수동 체크박스 fallback. 시·군·구 판정은 별도 후속 |
| heirAllocations 미입력 케이스 | PR-F | UI 안내 "협의분할 입력 권장" + legacy 동작 보장 |
| RTL React 19 호환 | PR-H | 기존 anchor 패턴 따름 — 신규 의존성 0 |
| §16② 단서 사용자 인지 어려움 | PR-D | UI 예시 도식 + 인용 본문 노출 |
| BigInt 곱셈 큰 자산 | PR-C | 1조 × 1조 = 1e24 — JS BigInt 안전 범위 |

## 10. PDCA 다음 단계 (갱신)

1. PR-G 즉시 진입 (5분 작업)
2. PR-D + PR-H 순차 (각 30분)
3. PR-F 진입 (1~2시간)
4. **PR-C 진입** — 가업상속 §18의2 통합(`7ca34dc`) 이미 완료. 공통 헬퍼 도입 적기 (반나절+)
5. PR-E — Vworld 외부 의존성, 마지막 (반나절+)

다음 작업으로 **PR-G** 진입 권장.

## 11. 정정 이력

| 일자 | 항목 | 정정 내용 |
|---|---|---|
| 2026-05-21 (v2) | A1 querystring 검증 | PR-G에 parseAmount + Math.max + 30억 cap 검증 명시 + PG-4·PG-5 anchor 추가 |
| 2026-05-21 (v2) | A3 분기 위치 | PR-D §2-3 — §18의3⑥과 같은 단독 reason early return 패턴 명확화 |
| 2026-05-21 (v2) | A4 UI 위치 | PR-D §2-4 — corporate 단서 ToggleCard는 rose "배제 사유" 그룹 내부 |
| 2026-05-21 (v2) | A5 anchor 범위 | PR-H §3-2 — 5-way 분기 RD-1·1b·2·4·5 anchor 추가 (RD-UI-1~7) |
| 2026-05-21 (v2) | A7 시그니처 | PR-F §4-4 — `suggestFarmingAssetValue(estateItems, farming?)` 시그니처 변경 + 호출처 갱신 명시 |
| 2026-05-21 (v2) | A8 props | PR-F §4-5 — `FarmingEligibilitySection`에 `heirs` prop 추가 |
| 2026-05-21 (v2) | A9 grep | PR-E §5-3 — 기존 좌표 헬퍼 grep 명시 (확인: 없음) |
| 2026-05-21 (v2) | A10 어선 좌표 | PR-E §5-4 — `fishingAnchorLatLng` 자산-수준 분기 신설 |
| 2026-05-21 (v2) | A11 BigInt | PR-C §6-4 — Number 한계 분석 + 30억 cap 적용 위치 명확화 + FNB-11 경계 anchor |
| 2026-05-21 (v2) | A14 진행순서 | §7 PR-C 우선순위 상향 (가업상속 §18의2 이미 완료) |
| 2026-05-21 (v2) | A15 검증 누락 | §8 PR-G·PR-H KoreanLaw 재검증 항목 추가 |
| 2026-05-21 (완료) | PR-D·H·F·C·E·FE-UI-3 | 6건 모두 master 반영 — `9412ca1`·`f05f7c8`·`4c9cdaf`·`873daca`·`dd7e2fc`·`41e8d4c` |

---

## 부록 A — PR-F 후속 (상속인별 분리 자격 평가, v2 정정)

**상태**: PR-F (`4c9cdaf`)에서 §16⑤ 본문 자격자 분배분(qualifiedHeirIds)은 구현됨. 다만 자격자 평가는 "모든 자격자 동일 평가" 가정. 상속인별 분리 평가는 별도 PR.

**⚠️ 진입 전 필수 — KoreanLaw MCP 검증 의무 (m3 정정, 2026-05-22)**:
- §16⑭ "피상속인 또는 상속인" 해석 — "1명이라도 해당 시 전체 배제" vs "상속인별 분리"
- §16③ 상속인 요건의 상속인별 분리 평가 가능성 (해석례 0건이면 분리 불가)
- 분리 불가 판정 시 본 부록 자체 폐기 — heirAssessments 신규 데이터 모델 진입 금지
- 분리 가능 판정 시만 §A-2 데이터 모델 진입

### A-1. 현재 한계 (PR-F §4-7 위험 요소)

- `evaluateFarmingEligibility(farming)`는 단일 boolean 반환 — heirIsAdult·heirTwoYearFarming 등은 모든 상속인에게 동일 적용
- 실제 상속인 A는 충족 / 상속인 B는 미충족 케이스 자동 분리 불가
- 사용자가 qualifiedHeirIds 명시로 우회 가능하지만 자격 평가 자체는 미분리

### A-2. 신규 데이터 모델

```typescript
// inheritance-farming.types.ts 확장
export interface FarmingHeirAssessment {
  heirId: string;
  heirIsAdult: boolean;
  heirTwoYearFarming: boolean;
  heirResidenceMet: boolean;
  heirCorporateOfficer?: boolean;  // corporate 트랙
  isDesignatedSuccessor?: boolean;
  // §16⑭ 결격소득은 상속인별 분리 (피상속인 분리는 farming-수준)
  hasDisqualifyingIncome?: boolean;
}

export interface FarmingInheritanceInput {
  // ... 기존
  /**
   * 상속인별 자격 평가 (선택). 미입력 시 farming 폼-수준 boolean을 모든 상속인에 동일 적용 (legacy).
   * 입력 시 heirAssessments 중 eligible=true 상속인만 qualifiedHeirIds 자동 도출.
   */
  heirAssessments?: FarmingHeirAssessment[];
}
```

### A-3. 엔진 시그니처 변경

```typescript
export function evaluateFarmingEligibility(input: FarmingInheritanceInput): {
  eligible: boolean;            // 피상속인 요건 + 1명 이상 자격자
  reasons: string[];
  qualifiedHeirIds: string[];  // heirAssessments에서 자동 도출 또는 폼-수준 자격자 전체
};
```

### A-4. anchor

- **FH-1**: heirAssessments 미입력 → legacy (폼-수준 boolean 적용)
- **FH-2**: 3명 상속인 중 1명만 자격 충족 → qualifiedHeirIds=[h1] 자동 도출
- **FH-3**: heirAssessments 입력 + qualifiedHeirIds 명시 → heirAssessments 우선 (자동 도출)
- **FH-4**: 모든 상속인 미충족 → eligible=false (피상속인 충족이어도)
- **FH-5**: 후계자 트랙 + 다른 상속인 미충족 → 후계자만 qualifiedHeirIds
- **FH-6**: §16⑭ 상속인별 결격소득 — 결격 상속인만 제외

### A-5. UI

`FarmingEligibilitySection`에 상속인별 자격 평가 expand 카드:

```tsx
{heirs && heirs.length > 1 && (
  <>
    <ToggleCard
      title="상속인별 자격 분리 평가 (선택)"
      checked={farming.heirAssessments !== undefined}
      onCheckedChange={...}
    />
    {farming.heirAssessments && heirs.map((h) => (
      <HeirAssessmentCard key={h.id} heir={h} ... />
    ))}
  </>
)}
```

### A-6. 작업량 (v2 정정)

- **KoreanLaw MCP 사전 검증 (의무 — 진입 전)**: 2~3h
- 엔진: 2~3h (시그니처 + reasons 분리)
- UI: 3~4h (HeirAssessmentCard 신규 + 토글 동기화)
- anchor: 1~2h
- **총 8~12h** (v1 6~9h + KoreanLaw 검증 2~3h)

### A-7. 위험 요소

- qualifiedHeirIds (PR-F) ↔ heirAssessments (PR-F 후속) 우선순위 충돌 — heirAssessments 우선 (자동 도출이 명시 입력을 덮어쓰지 않도록 정책 확정 필요)
- 후계자 트랙 + 상속인별 분리 — 후계자만 트랙 면제, 다른 상속인은 18세·2년·거주 필수
- §16⑭ 결격소득의 피상속인 분리 — 피상속인은 farming-수준 유지 (heirAssessments에 없음)

---

## 부록 B — 신규 계획서·PRD 참조 (v2)

| 문서 | 범위 | 상태 |
|---|---|---|
| `inheritance-farming-ui-integration.plan.md` (v2) | PR-C UI + C2 좌표 휘발 + PR-E UI 통합 (5 sub-PR) | v2 정정 완료 (2026-05-22) |
| `inheritance-farming-administrative-district.prd.md` (v2) | 행정구역 OR 조건 (5 Phase, 19~28h) | PRD 단계 v2 정정 |
| 본 부록 A (v2) | PR-F 상속인별 분리 자격 평가 (KoreanLaw 검증 선행) | 계획 단계 v2 정정 |
| `inheritance-farming-followup-critical-review.md` | v1 계획서 13건 정정 사항 비판 검토 | 검토 완료 (`53be02c`) |

