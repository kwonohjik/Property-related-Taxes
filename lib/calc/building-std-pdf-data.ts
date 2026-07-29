/**
 * 서버 PDF용 「건물 기준시가 계산서」 모델 어댑터 (순수·서버 안전 — "use client" 없음).
 *
 * 저장된 input_data.buildingStdSnapshots(모달 입력 스냅샷)에서 엔진 결과·계산서 모델을 재유도한다.
 * 클라이언트 결과탭(BuildingStdPriceReportSection)과 동일한 재유도 경로 — 단일 출처.
 *
 * ⚠️ 시점 전용 키의 반대 시점 인스턴스 제거는 **화면과 같은 `snapshotKeyTimepoint`를 쓴다**.
 * 이 필터가 여기 없던 동안 구버전 스냅샷(단일 시점 모드 이전 저장분)이 PDF에서만 2벌로
 * 나왔다(2026-07-30 실측·정정). 화면에만 있는 라벨·markCell override는 서식 제목·Ⅰ.구분
 * 표기용이라 PDF 미적용 — 인스턴스 **개수**만 양쪽이 일치해야 한다.
 */
import type { BuildingStdPriceFormState } from "@/lib/calc/building-std-price-form";
import { toEngineInput, buildNtsReportContext } from "@/lib/calc/building-std-price-form";
import { snapshotKeyTimepoint } from "@/lib/calc/building-std-snapshot-keys";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { buildNtsReportModel, type NtsReportModel } from "@/lib/calc/nts-report-adapter";

/** input_data 안의 buildingStdSnapshots → 계산서 모델 목록(없거나 불완전하면 빈 배열). */
export function buildBuildingStdReportsFromInput(
  inputData: Record<string, unknown> | undefined,
): NtsReportModel[] {
  if (!inputData) return [];
  const snaps = (inputData as { buildingStdSnapshots?: Record<string, BuildingStdPriceFormState> })
    .buildingStdSnapshots;
  if (!snaps || typeof snaps !== "object") return [];
  const out: NtsReportModel[] = [];
  for (const [key, snap] of Object.entries(snaps)) {
    try {
      const result = calcBuildingStandardPrice(toEngineInput(snap));
      let model = buildNtsReportModel(buildNtsReportContext(snap), result);
      const keyTimepoint = snap.taxType === "transfer" ? snapshotKeyTimepoint(key) : null;
      if (keyTimepoint) {
        model = {
          ...model,
          instances: model.instances.filter((i) =>
            keyTimepoint === "transfer" ? i.markCell === "transfer" : i.markCell !== "transfer",
          ),
        };
      }
      if (model.instances.length > 0) out.push(model);
    } catch {
      // 스냅샷이 불완전/구버전이면 graceful 생략.
    }
  }
  return out;
}
