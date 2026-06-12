# transfer-reduction-review-followup — UI 디자인

> 계획서: `docs/00-pm/transfer-reduction-review-followup.plan.md` / 엔진:
> `transfer-reduction-review-followup.engine.design.md`
> UI 측 작업은 F-4(모드2 §98의3 비거주자 안내)와 F-1의 validate 메시지 UX뿐 — 신규 엔진 input/result
> 필드 **0건**이므로 14지점 동기화는 F-1 ⑧(validation)만 해당.

## F-4 — 모드2 §98의3 비거주자 시한 안내 (P3)

### 위치
`components/calc/transfer/SpecialHouseExclusionSection.tsx` — 조문 Select 아래 조건부 경고.
기존 `new_99` 경고(:84-89 — rose 텍스트) 패턴 차용.

### 위젯 명세

```tsx
{it.article === "unsold_98_3" && (
  <p className="mt-1 text-[10px] text-amber-700">
    비거주자는 2009.3.16~2010.2.11 취득(계약)분만 해당합니다 — 2009.2.12~3.15 취득분은
    거주자만 적용됩니다 (조특법 §98의3①). 아래 요건 확인 토글은 본인 거주 구분을 포함해
    확인한 것으로 간주됩니다.
  </p>
)}
```

- tone: **amber**(주의·조건 안내 — rose는 `new_99`의 "적용 불가" 차단성 경고에 사용 중이므로 구분).
- 모드2 폼에는 거주자/비거주자 입력 필드가 **없음**(의도 — `requirementsConfirmed` 토글이 본 요건
  확인을 포괄). 엔진 분기 추가 금지 — 안내 문구만. 신규 필드를 추가하면 14지점 전파가 필요해지므로
  본 작업 범위 밖.

### E2E
`e2e/transfer-p5.spec.ts`에 §98의3 선택 → 경고 노출 1 assertion 추가 (기존 spec 확장,
worktree는 `E2E_PORT=3100`).

## F-1 — validate 메시지 UX (⑧)

### 노출 경로
Step 2(감면·공제) 차단 메시지 — 기구현 §98의7 메시지(`validateStep2Reductions` :162-178)와
**동일 채널, 배선 변경 없음**. 신규 위젯 없음.

### 메시지 규격 (4조문 공통 — §98의7 기구현과 통일)
- `"{조문} 적용: 취득 후 5년 경과 양도는 취득시 기준시가를 입력하세요 (5년 발생분 안분 — 미입력 시
  감면이 적용되지 않습니다)."`
- `"{조문} 적용: 취득 후 5년 경과 양도는 취득 5년 시점 기준시가를 입력하세요."`
- 조문 라벨: `§99의2` · `§98의3` · `§98의5` · `§98의6` (UnifiedReductionPanel 라벨과 동일 표기).

### 입력 위젯 변경: 없음 (실측 확정)
기준시가 입력 필드는 4조문 폼에 기존재하며 섹션 제목에 이미 **"기준시가 (취득일부터 5년이 지난 후
양도 시 필수)"**가 명시되어 있다(실측: Unsold983InputForm.tsx:169 · Unsold992InputForm.tsx:195 ·
Unsold985InputForm.tsx:104 · Unsold986InputForm.tsx:169). 별도 hint 보강 불요 — validate 추가만으로
입력 안내 폐루프 완성.

## 동기화 지점 점검 (Definition of Done)

| 지점 | F-1 | F-4 |
|---|---|---|
| ①~⑦·⑨~⑭ | 해당 없음 (엔진 input/result·폼 필드 무변경) | 해당 없음 |
| ⑧ validation | **본 작업** (4조문 + §98의7 헬퍼 단일화) | 해당 없음 |

- 3중 패턴(store default=normalize=UI) 영향 없음 — 신규 필드 0.
- useEffect→store 미러링 금지·자동 안분 fallback 금지 — 본 작업에 해당 경로 없음.
