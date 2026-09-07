/**
 * NBL 토지 소재지 시·군·구 코드 — ⑤ 표시 · ④ 전송 · ⑧ 검증 **공용 파생**.
 *
 * NBL 전용 입력(`nblLandSigunguCode`)이 비면 양도 물건 소재지(`acquisitionSigunguCode`)로
 * 자동 연동한다. `acquisitionSigunguCode`는 10자리(`XXXXX00000`)라 NBL 코드계(5자리)로
 * 정규화한다.
 *
 * ## 왜 leaf인가 — ④는 fallback을 쓰는데 ⑧은 안 봤다 (2026-09-07 대장 재대조)
 *
 * ④(`non-business-land-request.ts`)와 ⑤(`NblSectionContainer`)는 이미 이 fallback을 쓰는데
 * ⑧(`transfer-tax-validate-nbl.ts`)만 `asset.nblLandSigunguCode`를 직접 봤다. 그래서
 * **자동 연동 상태**(NBL 전용 칸을 손대지 않은 기본 상태)에서는 ⑧의 조건이 falsy가 되어
 * 「도시지역 농지·목장 — 소재지 행정구역 단위(동 / 읍·면)를 선택하세요」 차단이 통째로
 * 건너뛰어졌다.
 *
 * 그 선택이 없으면 엔진은 §104조의3①1호나목·3호가목의 **읍·면 제외**를 판정할 수 없어
 * 도시지역으로 확정한다 — 차단이 없으면 사용자는 그 사실을 모른 채 계산을 마친다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function nblLandSigunguCodeOf(
  asset: Pick<AssetForm, "nblLandSigunguCode" | "acquisitionSigunguCode">,
): string {
  return asset.nblLandSigunguCode || (asset.acquisitionSigunguCode || "").slice(0, 5);
}
