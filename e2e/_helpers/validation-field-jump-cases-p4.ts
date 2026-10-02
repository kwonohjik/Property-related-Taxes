/** Phase 4(비사업용 토지 · 0단계 하위 모듈 · 감면 · 보유 상황 나머지) 케이스 모음 — 파일은 영역마다 따로 둔다. */
import { NBL_FIELD_JUMP_CASES } from "./validation-field-jump-cases-nbl";
import { LEAF_FIELD_JUMP_CASES } from "./validation-field-jump-cases-leaf";
import { REDUCTION_FIELD_JUMP_CASES } from "./validation-field-jump-cases-reduction";
import { STEP1_FIELD_JUMP_CASES } from "./validation-field-jump-cases-step1";

export const P4_FIELD_JUMP_CASES = [
  ...NBL_FIELD_JUMP_CASES,
  ...LEAF_FIELD_JUMP_CASES,
  ...REDUCTION_FIELD_JUMP_CASES,
  ...STEP1_FIELD_JUMP_CASES,
];
