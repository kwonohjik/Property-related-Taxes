# 종부세 PDF 주택분 — 기본공제 0 표기 (`- 0` → `0`)

## §0 결론
- 결함: 종부세 PDF 주택분 계산표의 «기본공제» 행이 값 0이어도 `- 0`으로 찍힌다 (`ResultPdfDocument.tsx` `ComprehensiveSection`).
- 도달: 법인 §9②3호(`corporate_special`)는 기본공제 0원(`comprehensive-tax.ts:415`, 종부세법 §8①2호). 법인 기본 유형 `general_corp`가 이 경로. 실측: 개인 20억 `- 900,000,000`(정상), 법인 일반법인·사회적기업 미충족 20억 `- 0`.
- 수정: #3341과 같은 가드 `(num(r.basicDeduction) ?? 0) > 0 ? "- 값" : "0"`. 표시 전용 — 과세표준(12억)·세액 불변.
- 범위 밖(확인 필요): 화면 결과 카드의 같은 행 표기는 측정하지 않았다.

## §1 안전망
- anchor `__tests__/print/pdf-comprehensive-basic-deduction-zero.anchor.test.ts` — CBD-1 법인 «0»(**수정 전 실패 확인**, Received `- 0`), CBD-2 개인 대조 `- 900,000,000`.
- 회귀: `__tests__/print` 22파일 115건 통과.

## §2 결과
- 수정 후 CBD-1·CBD-2 통과.
