/**
 * 재개발/재건축 합계 취득가액 역산 leaf — 정본은 `lib/tax-engine/redev-acquisition-inverse.ts`.
 *
 * 다건·함께 양도 표시 echo(`transfer-tax-aggregate-display-echo.ts`)도 같은 leaf를 써야 해서 엔진 쪽으로 옮겼다
 * (엔진은 `components/`를 import하지 않는다). 기존 import 경로는 그대로 둔다.
 */
export * from "@/lib/tax-engine/redev-acquisition-inverse";
