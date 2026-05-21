export const projectDetailFixture = {
  project: {
    id: "try",
    name: "try",
    phase: "not_started",
    statusLabel: "未开始",
    type: "2D/3D动漫",
    aspectRatio: "9:16",
    resolution: "1080p",
  },
  assets: { characters: 0, scenes: 0, props: 0, others: 0 },
  episodes: [
    {
      id: "episode-try",
      title: "Try/test",
      status: "未定稿",
      storyboardCount: 2,
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
    },
  ];
}

export function createStoryboardList(state) {
  const shots = state?.shots ?? [];
  if (shots.length === 0) {
    return [
      {
        id: "storyboard-1",
        index: 1,
        title: "1",
        status: "未定稿",
        imageStatus: "empty",
        videoStatus: "empty",
        linkedShotId: null,
        description: "请填写分镜描述，记录分镜对应的画面内容。",
      },
      {
        id: "storyboard-2",
        index: 2,
        title: "2",
        status: "未定稿",
        imageStatus: "empty",
        videoStatus: "empty",
        linkedShotId: null,
        description: "请填写分镜描述，记录分镜对应的画面内容。",
      },
    ];
  }

  return shots.map((shot, index) => ({
    id: `storyboard-${index + 1}`,
    index: index + 1,
    title: `${index + 1}`,
    status:
      shot.currentVideoAssetVersionId || shot.currentImageAssetVersionId
        ? "已生成"
        : "未定稿",
    imageStatus: shot.currentImageAssetVersionId ? "ready" : "empty",
    videoStatus: shot.currentVideoAssetVersionId ? "ready" : "empty",
    linkedShotId: shot.id,
    description: shot.title,
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
  const project = state?.project
    ? {
        id: state.project.id,
        name: state.project.name,
        phase: state.project.phase,
        statusLabel: phaseToStatusLabel(state.project.phase),
        type: "2D/3D动漫",
        aspectRatio: state.project.aspectRatio ?? "9:16",
        resolution: state.project.resolution ?? "1080p",
      }
    : projectDetailFixture.project;

  const assetCandidates = state?.assetCandidates;
  const assets = assetCandidates
    ? {
        characters: assetCandidates.characters.length,
        scenes: assetCandidates.scenes.length,
        props: assetCandidates.props.length,
        others: assetCandidates.props.filter((candidate) => !candidate.required).length,
      }
    : projectDetailFixture.assets;

  const storyboardCount = state?.shots?.length || projectDetailFixture.episodes[0].storyboardCount;
  const episodes = [
    {
      id: "episode-primary",
      title: storyboardCount > 0 ? "Try/test" : projectDetailFixture.episodes[0].title,
      status: storyboardCount > 0 ? "未定稿" : projectDetailFixture.episodes[0].status,
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
