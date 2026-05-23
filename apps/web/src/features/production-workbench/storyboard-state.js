export const projectDetailFixture = {
  project: {
    id: "try",
    name: "try",
    phase: "not_started",
    statusLabel: "未开始",
    type: "2D/3D 动漫",
    aspectRatio: "9:16",
    resolution: "1080p",
  },
  assets: { characters: 0, scenes: 0, props: 0, others: 0 },
  episodes: [
    {
      id: "episode-1",
      title: "剧一",
      status: "未定稿",
      storyboardCount: 0,
    },
  ],
};

export function addStoryboard(storyboards) {
  const nextIndex = storyboards.length + 1;
  return [
    ...storyboards,
    {
      id: `storyboard-${nextIndex}`,
      index: nextIndex,
      title: `${nextIndex}`,
      status: "未定稿",
      imageStatus: "empty",
      videoStatus: "empty",
      linkedShotId: null,
      description: "请填写分镜描述，记录分镜对应的画面内容。",
      uploadedVideos: [],
      selectedUploadedVideoId: null,
    },
  ];
}

export function createStoryboardList(state) {
  const shots = state?.projectDetail?.shots ?? state?.shots ?? [];
  if (shots.length === 0) {
    return [];
  }

  return shots.map((shot, index) => ({
    id: `storyboard-${index + 1}`,
    index: index + 1,
    title: `${index + 1}`,
    status:
      shot.currentVideoAssetVersionId || shot.currentImageAssetVersionId ? "已生成" : "未定稿",
    imageStatus: shot.currentImageAssetVersionId ? "ready" : "empty",
    videoStatus: shot.currentVideoAssetVersionId ? "ready" : "empty",
    linkedShotId: shot.id,
    episodeId: shot.episodeId ?? null,
    description: shot.title,
    uploadedVideos: [],
    selectedUploadedVideoId: null,
  }));
}

export function getSelectedStoryboard(storyboards, selectedStoryboardId) {
  return (
    storyboards.find((storyboard) => storyboard.id === selectedStoryboardId) ??
    storyboards[0] ??
    null
  );
}

export function getProjectDetailState(state) {
  const detail = state?.projectDetail;
  const sourceProject = detail?.project ?? state?.project;
  const project = sourceProject
    ? {
        id: sourceProject.id,
        name: sourceProject.name,
        phase: sourceProject.phase,
        statusLabel: phaseToStatusLabel(sourceProject.phase),
        type: "2D/3D 动漫",
        aspectRatio: sourceProject.aspectRatio ?? "9:16",
        resolution: sourceProject.resolution ?? "1080p",
        createdAt: sourceProject.createdAt ?? "2026/05/22",
      }
    : projectDetailFixture.project;

  const assetCandidates = state?.assetCandidates;
  const assets = detail?.assetSummary
    ? {
        characters: detail.assetSummary.character?.count ?? 0,
        scenes: detail.assetSummary.scene?.count ?? 0,
        props: detail.assetSummary.prop?.count ?? 0,
        others: detail.assetSummary.other?.count ?? 0,
        previews: {
          character: detail.assetSummary.character?.previews ?? [],
          scene: detail.assetSummary.scene?.previews ?? [],
          prop: detail.assetSummary.prop?.previews ?? [],
          other: detail.assetSummary.other?.previews ?? [],
        },
      }
    : assetCandidates
      ? {
          characters: assetCandidates.characters.length,
          scenes: assetCandidates.scenes.length,
          props: assetCandidates.props.length,
          others: assetCandidates.props.filter((candidate) => !candidate.required).length,
        }
      : projectDetailFixture.assets;

  const storyboardCount = (detail?.shots ?? state?.shots ?? []).length;
  const episodes =
    Array.isArray(detail?.episodes) && detail.episodes.length
      ? detail.episodes.map((episode) => ({
          id: episode.id,
          title: episode.title,
          status: episode.status === "ready" ? "已定稿" : "未定稿",
          createdAt: episode.createdAt ?? project.createdAt ?? "2026/05/22",
          storyboardCount: episode.storyboardCount ?? 0,
          previewUrl: episode.previewUrl ?? null,
        }))
      : [
          {
            id: "episode-primary",
            title: projectDetailFixture.episodes[0].title,
            status: storyboardCount > 0 ? "未定稿" : projectDetailFixture.episodes[0].status,
            createdAt: project.createdAt ?? "2026/05/22",
            storyboardCount,
          },
        ];

  return { project, assets, episodes };
}

function phaseToStatusLabel(phase) {
  if (phase === "asset_review") {
    return "资产准备";
  }
  if (phase === "shot_generation") {
    return "分镜生成";
  }
  if (phase === "export") {
    return "待导出";
  }
  return "未开始";
}
