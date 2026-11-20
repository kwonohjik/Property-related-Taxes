/**
 * 6호 휴양시설 §83의4⑫2·3호 — «상한 이내 **실제** 면적» 입력 누락 판정 (NBL2611-V9-DM09 · R10). 엔진 · ⑧ · ⑫가 같은 술어·같은 문구를 쓴다.
 *
 * 인정 면적은 상한(부설주차장 설치기준면적 × 2 · 바닥면적 × 용도지역별 배율)이 아니라 그 상한 **이내의 실제 면적**이다.
 * 실제 면적을 비워 두고 상한을 대신 쓰면(자동 fallback) 기준면적이 부풀어 비사업용이 조용히 줄어든다 — 그래서 미입력은 거부한다.
 * 순수 함수 — DB를 부르지 않는다.
 */

export type ResortAreaIssuePart = "parkingActual" | "parkingStd" | "buildingActual";

export interface ResortAreaIssue {
  /** 비어 있는 칸 — ⑧·⑫가 입력칸 식별자로 옮긴다. */
  part: ResortAreaIssuePart;
  message: string;
}

export interface ResortAreaIssueInput {
  /** 부설주차장 설치기준면적(㎡) — 상한(×2)의 근거. */
  parkingStd: number;
  /** 실제 부설주차장용 토지 면적(㎡). */
  parkingActual: number;
  /** 건축물 바닥면적(㎡) — 입력했으면 용도지역 배율 상한이 생긴다. */
  buildingFloor: number;
  /** 실제 건축물 부속토지 면적(㎡). */
  buildingActual: number;
  /** 용도지역이 「지방세법 시행령」 §101② 배율표에 있는가 — 없으면 바닥면적 상한을 계산할 수 없어 부속토지 면적 직접입력 경로다. */
  zoneMapped: boolean;
}

export const RESORT_PARKING_ACTUAL_REQUIRED_MESSAGE =
  "휴양시설 — 부설주차장 설치기준면적을 입력했으면 실제 부설주차장용 토지 면적(㎡)도 입력하세요. 인정 면적은 설치기준면적의 2배 이내의 실제 면적입니다. (소득세법 시행규칙 §83의4⑫2호)";
export const RESORT_PARKING_STD_REQUIRED_MESSAGE =
  "휴양시설 — 실제 부설주차장용 토지 면적을 입력했으면 상한의 근거인 부설주차장 설치기준면적(㎡)도 입력하세요. (소득세법 시행규칙 §83의4⑫2호)";
export const RESORT_BUILDING_ACTUAL_REQUIRED_MESSAGE =
  "휴양시설 — 건축물 바닥면적을 입력했으면 실제 건축물 부속토지 면적(㎡)도 입력하세요. 인정 면적은 바닥면적 × 용도지역별 배율 이내의 실제 면적입니다. (소득세법 시행규칙 §83의4⑫3호)";

/** 문제가 없으면 null. 한 번에 첫 문제 하나만 돌려준다. */
export function resortAreaIssue(i: ResortAreaIssueInput): ResortAreaIssue | null {
  if (i.parkingStd > 0 && i.parkingActual <= 0) return { part: "parkingActual", message: RESORT_PARKING_ACTUAL_REQUIRED_MESSAGE };
  if (i.parkingActual > 0 && i.parkingStd <= 0) return { part: "parkingStd", message: RESORT_PARKING_STD_REQUIRED_MESSAGE };
  if (i.zoneMapped && i.buildingFloor > 0 && i.buildingActual <= 0)
    return { part: "buildingActual", message: RESORT_BUILDING_ACTUAL_REQUIRED_MESSAGE };
  return null;
}
