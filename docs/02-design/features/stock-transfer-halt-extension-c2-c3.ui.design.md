# 거래정지 확장 (C-2/C-3) — UI 설계

> 계획: `docs/00-pm/stock-transfer-halt-extension-c2-c3.plan.md` §4·§5 · 엔진: `stock-transfer-halt-extension-c2-c3.engine.design.md`
> 원칙: 신규 입력 0(기존 full/사례49/§165⑨ 필드 재사용) · 자동 fallback 금지 · ToggleCard/RadioCardGroup 기존 재사용

## 1. C-2 — 거래정지(양도) EstimatedUnlistedBlock simpleOnly 제거 (`Step2.tsx:374`)

```
<EstimatedUnlistedBlock form={form} onChange={onChange} simpleOnly />
  → <EstimatedUnlistedBlock form={form} onChange={onChange} />
```

**노출 변화**(simpleOnly OFF → `!simpleOnly` 게이트 `EstimatedUnlistedBlock:211` 통과):
- 입력 방식 RadioCardGroup(간이/평가액 계산=full) 노출 → 거래정지 상장주식도 결산서 입력 가능
- 사례49 ToggleCard(취득시점 장부분실 액면가) 노출
- B-4 §165⑨ 섹션(`!acquisitionSideOnly && !acqFaceValueOnly`) — 양도·취득 기준시가 동일 시 노출(거래정지+§165⑨ 정당, 엔진 기처리)

거래정지 안내 카드(§165③ 우회)는 EstimatedUnlistedBlock 상단 기존 노출 — 무변경.

## 2. C-3 — validate G-5 메시지 법령 근거 보강 (`validate-step2.ts:260-266`)

```
"거래정지 + 취득 후 상장 조합은 지원하지 않습니다. ..."
  → "양도일 거래정지·관리종목 주식은 §3항 주식이 아니어서(상증령 §52의2③ 제외)
     취득 후 상장(§165⑤) 환산 대상이 아닙니다. 거래정지 또는 취득 후 상장 중 하나만 선택하세요."
```

- UI error severity 유지(차단). 서버 Zod refine(엔진 설계 §4)이 이중 방어.

## 3. 결과 카드 (⑦ 무변경)

거래정지 full → method `weighted_avg`(기존 EstimatedValuationBreakdown). 사례49 → method `acq_face_value_only`(기존 CaseFortyNineFormulaCard). §165⑨ → capitalEvent... 아닌 section1659Detail(B-4 기존). **결과 카드 신규 0** — 기존 분기가 거래정지 결과도 표시(거래정지우회 RULE_BADGE 기존).

## 4. 14지점 UI 서브셋 (신규 입력 0)

| # | 지점 | 작업 |
|---|---|---|
| ①②③ | form·initial·normalize | 무변경(필드 기존) |
| ⑤ | UI 위젯 | §1 simpleOnly 제거 |
| ⑥⑦ | 사이드바·결과 | 무변경 |
| ⑧ | validate | §2 G-5 메시지 + `validateUnlistedValuationFields` 헬퍼(거래정지 C-6 적용) |

④⑬⑭(api 게이트·Zod refine)는 계획 §4·§5. ⑨⑩ Zod(C-3 refine).

## 5. E2E (`e2e/stock-transfer-halt-extension.spec.ts`, `E2E_PORT=3200`)

E-1 (거래정지 양도 + full 모드 노출):
- 코스닥 종목 → Step2 환산 → **거래정지(양도) 토글 ON** → EstimatedUnlistedBlock 노출
- 입력 방식 라디오 "평가액 계산"(full) 노출 단언(simpleOnly 해제 증명) — 기존 simpleOnly면 미노출이던 것
- (선택) full 결산서 최소 입력 → 계산 → method weighted_avg

E-2 (거래정지 + 취득후상장 차단):
- 거래정지 ON + 취득 후 상장 ON → validate error "§52의2③" 메시지 노출 단언

함정: 거래정지 토글 제목 텍스트(Step2 거래정지 ToggleCard). full 라디오 "평가액 계산"/"완전 재현" 라벨 확인(EstimatedUnlistedBlock vs PostListingValuationCard 상이 — EstimatedUnlistedBlock은 "평가액 계산").

## 6. 비스코프
- C-3 교차 환산 UI(차단 확정). 거래정지+§81④(post-listing 준용 — G-5 차단).
</content>
