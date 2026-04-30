/**
 * house-count 모듈의 입력 타입을 acquisition.types.ts에서 참조하기 위한 경량 re-export
 *
 * 순환 import 방지:
 *   acquisition.types.ts → house-count-input.types.ts → house-count/types.ts
 *   (house-count/index.ts는 acquisition.types.ts import 없음)
 */

export type { HouseCountInput as HouseCountInputRef } from "../house-count/types";
