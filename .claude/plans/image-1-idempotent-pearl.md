# Plan: 비사업용 토지 — 판정 분기 UX 개선 + 장기보유공제 배제 로직 제거

## Context

본 작업은 비사업용 토지(NBL) 처리에 두 가지 변경을 동시에 반영한다:

### 1️⃣ 사용자 의도 분기 UX

현재 "비사업용 토지" 체크박스를 선택하면 **무조건** 상세 판정 UI가 펼쳐진다. 그러나 실무 사용자는 두 부류:

- **A. 이미 비사업용으로 판정 완료한 사용자** — 세무사 자문, 사전상담으로 NBL 확정. 바로 중과세만 적용 원함.
- **B. 판정을 못한 사용자** — 지목·재촌·자경 입력으로 엔진 판정 도움 필요.

A 사용자에게 불필요한 입력 부담을 강요하는 현 구조를 분기 UI로 개선한다.

### 2️⃣ 장기보유특별공제 배제 로직 제거 (현행 법령 정정)

**현행 소득세법상 비사업용 토지도 장기보유특별공제(표1, 연 2%·최대 30%)는 적용된다.** "장기보유공제 배제"는 2015년 이전 구법 잔재. 현재 엔진(`transfer-tax-helpers.ts:335-337` L-1b)이 비사업용 토지에 대해 deduction=0으로 강제 배제하는 것은 오류이다.

```typescript
// L-1b: 비사업용 토지 — 배제   ← 잘못된 구법 분기
if (input.isNonBusinessLand) {
  return { deduction: 0, rate: 0, holdingPeriod: { years: 0, months: 0 } };
}
```

이 분기를 제거하고 UI 안내 문구도 수정한다.

> 💡 양도일 분기(2015년 이전/이후) 추가 여부는 별도 후속 과제로 보류. 본 계산기는 현행 세법 기준이므로 단순 제거가 안전.

## Critical Files

### Part A: 엔진·UI 텍스트 정정 (장기보유공제 배제 제거)

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/transfer-tax-helpers.ts` (329~337줄) | L-1b 분기 **삭제**. 비사업용 토지도 표1 장기보유특별공제 적용 흐름 진입 |
| `lib/tax-engine/non-business-land/engine.ts` (222줄 주석) | "중과세·장기보유공제 배제" → "중과세"로 수정 |
| `app/calc/transfer-tax/steps/Step4.tsx` (312줄) | "누진세율 + 10%p 중과세 · 장기보유공제 배제" → "누진세율 + 10%p 중과세 (장기보유특별공제는 표1 적용)" |
| `components/calc/NonBusinessLandResultCard.tsx` (27줄) | "기본세율 +10%p 중과, 장기보유특별공제 배제됩니다." → "기본세율 +10%p 중과 (장기보유특별공제 표1 적용)." |
| `__tests__/tax-engine/transfer-tax/multi-house-and-nbl.test.ts` (132·167줄) | "장기보유공제 0" 기대 테스트 → "표1 공제(연 2%·최대 30%) 적용" 으로 갱신. 보유 5년 시 deduction = taxableGain × 0.10 등 검증값 재계산 |

### Part B: 사용자 의도 분기 UX

#### 데이터 모델 (기존 필드 재사용)

| 필드 | "확정" 모드 | "도움" 모드 |
|---|---|---|
| `isNonBusinessLand` | `true` | `true` |
| `nblUseDetailedJudgment` | `false` | `true` |

엔진이 이미 `nonBusinessLandDetails` 유무로 두 경로 분기 (`transfer-tax.ts:207-225`). 추가 필드 불필요.

#### `app/calc/transfer-tax/steps/Step4.tsx` (284~340줄 영역)

**변경 1**: 체크박스 onChange — 자동 펼침 제거
```tsx
onChange={(e) => {
  const checked = e.target.checked;
  onChange({
    assets: form.assets.map((a, i) => i === 0 ? {
      ...a,
      isNonBusinessLand: checked,
      // 체크 해제 시 상세판정도 끔. 체크 시는 유지(라디오로 사용자가 선택).
      nblUseDetailedJudgment: checked ? a.nblUseDetailedJudgment : false,
    } : a),
  });
}}
```

**변경 2**: 체크된 경우 라디오 그룹을 안내문 박스 아래에 추가
```tsx
{primary?.isNonBusinessLand && (
  <div className="ml-7 space-y-2 pt-1">
    <p className="text-xs font-medium text-foreground/70">판정 상태</p>
    <label className="flex items-start gap-2 cursor-pointer text-sm">
      <input
        type="radio"
        name={`nbl-mode-${primary.assetId}`}
        checked={!primary.nblUseDetailedJudgment}
        onChange={() => onChange({ assets: form.assets.map((a, i) =>
          i === 0 ? { ...a, nblUseDetailedJudgment: false } : a) })}
      />
      <div>
        <span>이미 비사업용으로 판정 완료</span>
        <p className="text-xs text-muted-foreground">
          바로 +10%p 중과세 적용 (장기보유특별공제 표1 정상 적용)
        </p>
      </div>
    </label>
    <label className="flex items-start gap-2 cursor-pointer text-sm">
      <input
        type="radio"
        name={`nbl-mode-${primary.assetId}`}
        checked={primary.nblUseDetailedJudgment}
        onChange={() => onChange({ assets: form.assets.map((a, i) =>
          i === 0 ? { ...a, nblUseDetailedJudgment: true } : a) })}
      />
      <div>
        <span>판정 도움 필요</span>
        <p className="text-xs text-muted-foreground">지목·재촌·자경 입력으로 엔진이 자동 판정</p>
      </div>
    </label>
  </div>
)}
```

**변경 3**: NblSectionContainer 렌더링 조건 강화
```tsx
{primaryKind === "land" && primary?.isNonBusinessLand && primary?.nblUseDetailedJudgment && primary && (
  <NblSectionContainer ... />
)}
```

#### `components/calc/transfer/CompanionAssetCard.tsx` (491~496줄)

NblSectionContainer 렌더링 조건에 `nblUseDetailedJudgment` 추가:
```tsx
{asset.assetKind === "land" && asset.isNonBusinessLand && asset.nblUseDetailedJudgment && (
  <div className="pt-2 border-t border-border/60">
    <NblSectionContainer asset={asset} onAssetChange={onChange} />
  </div>
)}
```

라디오는 Step4에서만 노출 (단일 진입점). Step1 자산 카드는 두 플래그 모두 참일 때 자동 펼침.

#### `components/calc/transfer/nbl/NblSectionContainer.tsx` (54~69줄)

기존 "+ 상세 판정 시작" 버튼 분기는 보존(안전망). Step4 라디오에서 이미 `true`로 진입하므로 도달 빈도는 0에 가까움.

## 엔진·API 다른 변경 없음

- `transfer-tax.ts:207-225` — `nonBusinessLandDetails` 유무 분기 그대로
- `transfer-tax-api.ts:272,299` — `nblDetails` 옵셔널 전송 그대로
- `form-mapper.ts:57` — `nblUseDetailedJudgment === false` 시 null 반환 그대로

## Verification

### A. 장기보유공제 적용 검증 (Part A)

1. 비사업용 토지 5년 보유 양도 → 양도소득금액의 10% (5년×2%) 장기보유공제 적용 확인
2. 비사업용 토지 15년 보유 양도 → 30% 상한 적용 (15×2% = 30%) 확인
3. `multi-house-and-nbl.test.ts` 두 테스트가 갱신된 기대값으로 통과
4. `npm test -- non-business-land` 전체 회귀 통과

### B. UX 분기 검증 (Part B)

1. **확정 모드 경로**:
   - Step1: 토지 자산 1건 (지목·면적·취득일·양도일)
   - Step4: "비사업용 토지" 체크 → 라디오 기본값 "이미 판정 완료" 표시 확인
   - NblSectionContainer 미노출 확인
   - 결과 화면 → 누진세율 + 10%p 중과세 + 장기보유공제 표1 적용 확인

2. **도움 모드 경로**:
   - Step4 라디오 "판정 도움 필요" 선택 → NblSectionContainer 펼침
   - 농지·자경 충분 입력 → 엔진 "사업용" 판정 → 중과세 미적용
   - 자경 부족 입력 → "비사업용" 판정 → 중과세 적용

3. **모드 전환·체크박스 해제**:
   - "도움" → "확정" 전환 시 NblSectionContainer 숨김, 입력 데이터 보존(zustand)
   - 체크박스 해제 시 라디오·NblSectionContainer 모두 숨김 + `nblUseDetailedJudgment` false 강제

4. **Step1·Step4 동기화**: 동일 zustand 스토어로 양쪽 펼침 상태 일관성 확인
