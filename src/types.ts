export type Provider = {
  name: string;
  url: string;
  icon: string;
};

export type Capture = {
  imagePath: string;
  imageUrl: string;
  fileName: string;
  time: string;
  ocrText: string;
  ocrStatus: string;
  prompt: string;
  savedToCaptures: boolean;
};

export type Settings = {
  ai_provider: string;
  study_profile: string;
  paste_mode: string;
  paste_delay_seconds: number;
  auto_open_after_capture: boolean;
  auto_copy_after_capture: boolean;
  auto_paste_after_delay: boolean;
  save_captures: boolean;
  save_course_notes_auto: boolean;
  courses_dir: string;
  prompt_template: string;
  ocr_language: string;
  ocr_preprocess: string;
  scroll_speed: number;
  history_limit: number;
  reuse_ai_tab: boolean;
  privacy_auto_delete_days: number;
  mini_panel: boolean;
  theme: "light" | "dark" | "system";
  language: "pt" | "en";
};

export type CourseContext = {
  courseName: string;
  moduleName: string;
  lessonName: string;
  contentType: string;
  status: string;
  videoMinute: string;
  videoNotes: string;
  lastPromptType: string;
  lastPrompt: string;
};

export type CourseNote = {
  id: string;
  title: string;
  kind: string;
  text: string;
  response: string;
  prompt: string;
  image_path: string;
  created_at: string;
};

export type CourseState = {
  context: CourseContext;
  notes: CourseNote[];
  session: {
    running: boolean;
    startedAt: string;
    totalSeconds: number;
    captures: string[];
  };
  stats: {
    totalCaptures: number;
    totalNotes: number;
    reviewedModules: number;
    completedLessons: number;
    sessionSeconds: number;
  };
  paths: {
    coursesDir: string;
    currentLessonDir: string;
  };
  promptLabels: Record<string, string>;
};

export type BackendState = {
  settings: Settings;
  providers: Provider[];
  current: Capture | null;
  history: Capture[];
  course: CourseState;
  system: {
    ocr: string;
    captures: string;
    scroll: string;
    backend: string;
  };
  logs: string[];
};

export type ApiResult = {
  ok?: boolean;
  message?: string;
  cancelled?: boolean;
  state?: BackendState;
  diagnostic?: string;
};
