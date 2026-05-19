export interface DeliveryScenario {
  id: string;
  title: string;
  verificationIds: string[];
  expectedOutcome: string;
}

export interface CreatorDomainBlocker {
  id: string;
  dependency: string;
  blocks: string[];
  status: "open" | "ready";
  notes: string;
}

export interface ParseScriptMockOutput {
  episodes: Array<{
    id: string;
    title: string;
    sequence: number;
  }>;
  candidateAssets: Array<{
    id: string;
    kind: "character" | "scene" | "prop";
    name: string;
    reviewStatus: "needs_review" | "warning_only";
  }>;
  shots: Array<{
    id: string;
    episodeId: string;
    sequence: number;
    contentStatus: "draft" | "ready";
    imageStatus: "draft" | "ready";
  }>;
}

export const createProjectScenarioMatrix: DeliveryScenario[] = [
  {
    id: "create-project-success",
    title: "creates a project and script inside one transaction",
    verificationIds: ["TC-P0-001"],
    expectedOutcome: "returns projectId and starts in script_input",
  },
  {
    id: "create-project-invalid-input",
    title: "rejects invalid name, aspect ratio, resolution, or empty script",
    verificationIds: ["TC-P0-001"],
    expectedOutcome: "returns stable field-level validation errors",
  },
  {
    id: "create-project-forbidden",
    title: "rejects callers without project:create capability",
    verificationIds: ["TC-P0-001"],
    expectedOutcome: "returns 403 before any domain write",
  },
  {
    id: "create-project-replay",
    title: "replays the original project for same idempotency key and hash",
    verificationIds: ["TC-P0-001", "IDEMP-003"],
    expectedOutcome: "returns the same project identity",
  },
  {
    id: "create-project-idempotency-conflict",
    title: "rejects same idempotency key with a different request hash",
    verificationIds: ["TC-P0-001", "IDEMP-003"],
    expectedOutcome: "returns 409 idempotency_conflict",
  },
];

export const parseScriptScenarioMatrix: DeliveryScenario[] = [
  {
    id: "parse-script-starts-workflow",
    title: "creates a durable workflow and task for parse",
    verificationIds: ["TC-P0-001", "TC-P0-010"],
    expectedOutcome: "returns workflowId and durable task status",
  },
  {
    id: "parse-script-replay",
    title: "reuses an existing workflow for repeated identical parse requests",
    verificationIds: ["TC-P0-010", "IDEMP-003"],
    expectedOutcome: "returns the existing workflow identity",
  },
  {
    id: "parse-script-failure-state",
    title: "keeps parse failures repairable instead of half-writing domain facts",
    verificationIds: ["TC-P0-011"],
    expectedOutcome: "project stays recoverable and writes are transactional",
  },
];

export const creatorDomainBlockers: CreatorDomainBlocker[] = [
  {
    id: "a2-actor-context",
    dependency: "A2 ActorContext and tenant-safe capability checks",
    blocks: ["B1 CreateProject production command", "B5 Public Asset confirm"],
    status: "ready",
    notes:
      "Resolved by the SQL-backed creator commands and authenticated application flow. Capability checks now gate create-project, parse-script, asset confirmation, generation, and export paths.",
  },
  {
    id: "a3-audit",
    dependency: "A3 append-only audit helper",
    blocks: ["B1 CreateProject audit writes", "B6 Calibration skip/pass audit"],
    status: "ready",
    notes:
      "Resolved for the implemented creator loop. Durable audit records are written for project creation and calibration pass/skip/override flows.",
  },
  {
    id: "a4-workflow-task",
    dependency: "A4 durable workflow/task execution spine",
    blocks: ["B2 ParseScript workflow", "B7 GenerateShotImage", "B9 CreateExport"],
    status: "ready",
    notes:
      "Resolved by SQL-backed workflow/task integration. ParseScript, image generation, video generation, and export all create durable workflow/task records.",
  },
  {
    id: "creator-domain-schema",
    dependency: "project/script/asset/shot migrations",
    blocks: ["B1 CreateProject writes", "B3 AssetVersion persistence"],
    status: "ready",
    notes:
      "Resolved by the foundation migration. projects, scripts, asset_review_candidates, assets, asset_versions, shots, calibration_sessions, calibration_items, and export_records are present in SQL.",
  },
];

export function createProjectCommandFixture() {
  return {
    workspaceId: "4db6f2af-5c44-4ae2-9a8b-7fdc2cc51d1d",
    name: "Launch teaser storyboard",
    scriptInput:
      "Episode 1: The creator opens with a mechanical city skyline and a tense monologue.",
    aspectRatio: "9:16",
    resolution: "1080p",
    idempotencyKey: "create-project-launch-teaser-v1",
  } as const;
}

export function createParseScriptCommandFixture() {
  return {
    projectId: "7de4cc38-16ef-45a9-9e34-5c8cf6f4e530",
    scriptId: "4c4d4c44-bf95-4eb5-bd84-fdf8b6c99dc0",
    idempotencyKey: "parse-script-launch-teaser-v1",
  } as const;
}

export function createDeterministicParseScriptMockOutput(): ParseScriptMockOutput {
  return {
    episodes: [
      {
        id: "episode-001",
        title: "The City Wakes",
        sequence: 1,
      },
    ],
    candidateAssets: [
      {
        id: "asset-character-protagonist",
        kind: "character",
        name: "Lead Mechanist",
        reviewStatus: "needs_review",
      },
      {
        id: "asset-scene-skyline",
        kind: "scene",
        name: "Industrial skyline at dawn",
        reviewStatus: "needs_review",
      },
      {
        id: "asset-prop-console",
        kind: "prop",
        name: "Brass control console",
        reviewStatus: "warning_only",
      },
    ],
    shots: [
      {
        id: "shot-001",
        episodeId: "episode-001",
        sequence: 1,
        contentStatus: "ready",
        imageStatus: "draft",
      },
      {
        id: "shot-002",
        episodeId: "episode-001",
        sequence: 2,
        contentStatus: "draft",
        imageStatus: "draft",
      },
      {
        id: "shot-003",
        episodeId: "episode-001",
        sequence: 3,
        contentStatus: "ready",
        imageStatus: "ready",
      },
    ],
  };
}
