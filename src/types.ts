export type TextOverlayStyle = "none" | "simple" | "minimal" | "camcorder" | "cinematic" | "magazine";

export interface VideoClip {
  id: string;
  file: File;
  thumbnail: string;
  duration: number; // Total duration of the source file
  startTime: number; // Start time of the 1s clip
  clipDuration: number; // Duration of the clip (default 1s)
}

export interface TitleSettings {
  text: string;
  style: TextOverlayStyle;
}

export const TEXT_STYLES: { value: TextOverlayStyle; label: string }[] = [
  { value: "none", label: "None" },
  { value: "simple", label: "Simple" },
  { value: "minimal", label: "Minimal" },
  { value: "camcorder", label: "Camcorder" },
  { value: "cinematic", label: "Cinematic" },
  { value: "magazine", label: "Magazine" },
];
