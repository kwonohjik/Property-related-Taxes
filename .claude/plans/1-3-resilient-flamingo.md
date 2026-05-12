# 거주기간 입력 동기 부여 — 1번(조건부 배너) + 3번(의존성 배지)

## Context

**문제**: 양도세 마법사 Step4 "세대·주택 현황" 카드(이미지15)에서 사용자가 "1세대 해당" + "1채"를 선택해도 다음 액션(=거주기간 입력)이 화면 어디에도 명시되지 않음. 거주기간 입력 카드(이미지16: 겸용주택의 `MixedUseResidencyInput`, 또는 일반 주택의 `ResidencePeriodSection`)에 도달했을 때도 "왜 이걸 입력해야 하는지" 법적 효과 연결고리가 없음.

**원하는 결과**: 사용자가 1세대1주택자임을 표시하는 순간 거주기간 입력의 법적 효과(1세대1주택 비과세 / 12억 초과 고가주택 과세 / 장기보유공제 표2 최대 80%)를 즉시 인지하고, 거주기간 입력 카드에서 "아까 그것 때문이구나"라는 회수가 일어나도록 함.

## 현재 위치

| 화면 | 파일 | 위치 |
|---|---|---|
| 이미지15: 세대·주택 현황 헤더 | `app/calc/transfer-tax/steps/Step4.tsx` | line 148 (`SectionHeader`) |
| 이미지15: 1세대 체크박스 + 주택수 버튼 | `app/calc/transfer-tax/steps/Step4.tsx` | line 152–187 |
| 일반 주택용 거주 입력 (Step4 내 인라인) | `app/calc/transfer-tax/steps/Step4.tsx` | line 191–201 (`<ResidencePeriodSection ...>`) |
| 일반 주택용 컴포넌트 본체 | `components/calc/transfer/ResidencePeriodSection.tsx` | (untracked) |
| 이미지16: 겸용주택 ④ 거주 정보 (Step1 자산 카드 내부) | `components/calc/transfer/mixed-use/MixedUseResidencyInput.tsx` | line 19–56 |

## 변경 사항

### ① 조건부 안내 배너 — `Step4.tsx`

`isHousingLike(primaryKind)` 블록 안, 주택수 버튼 그룹(line 187) 다음·`ResidencePeriodSection` 직전에 **조건부 배너** 삽입.

**노출 조건**: `form.isOneHousehold === true` AND `form.householdHousingCount === "1"`

**문구 (법령 정확성 — "절세·유리" 표현 금지)**:
> 1세대 1주택자는 보유 2년 이상 시 양도가액 12억 원까지 비과세이며, 12억 초과 고가주택 부분에 한해 과세됩니다. 거주 2년 이상이면 장기보유특별공제가 표2(보유 4%/년 + 거주 4%/년, 최대 80%)로 적용됩니다. 아래 거주기간 입력이 표2 판정에 사용됩니다.

**스타일**: `rounded-lg border border-violet-200 bg-violet-50/40 px-4 py-3 text-sm text-violet-900` (거주·자격 정보 = violet tone, CLAUDE.md 색상 가이드 준수)

**아이콘**: lucide `Info` 아이콘 14px, violet-700.

**겸용주택 분기**: `primaryKind !== "housing"` (예: mixed-use) 인 경우 동일 배너의 마지막 문장만 다음으로 교체 — "거주기간은 자산 카드의 ④ 거주 정보에서 입력합니다." (사용자가 step1으로 돌아가야 함을 안내).

### ② 의존성 배지 — 거주기간 입력 카드 양쪽

#### (a) `MixedUseResidencyInput.tsx` (이미지16)

line 27 `<p className="text-xs font-semibold text-violet-700">거주 정보</p>` 옆(같은 flex 행)에 **배지 추가**:

```tsx
<span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
  1세대1주택 비과세·표2 공제 판정에 사용
</span>
```

또한 직전 turn에서 합의한 **헤더 텍스트 변경**: `"거주 정보"` → `"거주 기간 입력"`.

#### (b) `ResidencePeriodSection.tsx` (Step4 인라인)

`ToggleCard` 컴포넌트(`title="비연속 거주 구간 입력"`)는 ToggleCard 자체에 trailing 슬롯이 없으므로, **ToggleCard 바로 위**에 작은 안내 줄 추가:

```tsx
<p className="text-xs text-violet-700">
  거주기간은 1세대1주택 비과세·표2 장특공제 판정에 사용됩니다.
</p>
```

- ToggleCard tone="violet" 과 색조 일치
- 거주기간 입력 모드(개월 직접 / 비연속 구간) 토글 위에 배치되어 두 모드 모두에서 노출

### ③ 헤더 텍스트 변경 (직전 turn 합의 사항 반영)

- `MixedUseResidencyInput.tsx` line 27: `"거주 정보"` → `"거주 기간 입력"`
- `MixedUseSection.tsx:152` 의 주석 `{/* ④ 거주 정보 */}` → `{/* ④ 거주 기간 입력 */}`

이미지15(세대·주택 현황 카드)에서는 "비연속 거주 구간 입력" 토글을 거주 기간 카드로 옮기지 않음 — 직전 안에서 변경했으나 사용자가 1+3안만 채택했으므로 **현재 위치 유지**.

## 변경 대상 파일

| # | 파일 | 변경 내용 |
|---|---|---|
| 1 | `app/calc/transfer-tax/steps/Step4.tsx` | 조건부 violet 배너 추가 (line 187 직후, ResidencePeriodSection 직전) |
| 2 | `components/calc/transfer/ResidencePeriodSection.tsx` | ToggleCard 직전 한 줄 안내 추가 |
| 3 | `components/calc/transfer/mixed-use/MixedUseResidencyInput.tsx` | 헤더 텍스트 "거주 기간 입력"으로 변경 + 우측 배지 추가 |
| 4 | `components/calc/transfer/MixedUseSection.tsx` | 주석 텍스트 한 줄 동기화 |

새 컴포넌트 신설 없음. 기존 색상 가이드(violet = 거주·자격 정보) 재사용.

## 비변경 사항 (의도적)

- "비연속 거주 구간 입력" 토글의 위치는 그대로 (직전 turn에서 이동 제안했으나 1+3안 채택으로 철회).
- 8개 동기화 지점(폼 타입·initial·normalize·API·UI·사이드바·결과·validation) 변경 없음 — 순수 표시(presentation) 추가.
- 엔진·zustand store·API 페이로드·테스트 변경 없음.

## 검증

1. `npx tsc --noEmit` — 0 오류
2. 브라우저 수동 확인:
   - 양도세 마법사 → housing 자산 1건 → Step4 진입 → "1세대 해당" 체크 + "1채" 클릭 → violet 배너 노출 확인. "2채" 또는 "3+채" 전환 시 배너 사라짐 확인.
   - housing 자산일 때 ResidencePeriodSection 위에 "거주기간은 ... 판정에 사용됩니다" 한 줄 노출 확인.
   - 겸용주택(mixed-use) 자산 1건 → Step1 자산 카드 → ④ 거주 정보 헤더가 "거주 기간 입력"으로 표시되고 우측에 violet pill 배지 노출 확인. Step4에서는 배너 마지막 문장이 "자산 카드의 ④ 거주 정보에서 입력" 안내로 변경됨 확인.
3. `npm test` 회귀 — UI 표시 변경만이므로 엔진/통합 테스트 영향 없음 (smoke 통과 기대).
