import type { MemberRole } from "./types";

export const ROLE_LABEL: Record<MemberRole, string> = {
  head_sm: "Head SM",
  sm: "Stage Manager",
  asm: "Asst. Stage Manager",
  director: "Director",
  production_manager: "Production Manager",
  designer: "Designer",
  crew: "Crew",
  actor: "Actor",
  viewer: "Viewer",
};

export const ROLE_ORDER: MemberRole[] = [
  "head_sm", "sm", "asm", "director", "production_manager", "designer", "crew", "actor", "viewer",
];

export const SM_TEAM: MemberRole[] = ["head_sm", "sm", "asm"];

export function canEdit(role?: MemberRole | null) {
  return !!role && SM_TEAM.includes(role);
}
export function isHead(role?: MemberRole | null) {
  return role === "head_sm";
}

export const DEPARTMENTS = [
  "Production", "Direction", "Stage Management", "Cast", "Set", "Props", "Costume",
  "Hair & Makeup", "Lights", "Sound", "Video / Projection", "Music", "Choreography / Movement",
  "Technical", "Venue", "Marketing", "Front of House",
];
