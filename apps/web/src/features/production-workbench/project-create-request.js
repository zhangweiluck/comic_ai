export function buildProjectCreateRequest({
  name,
  aspectRatio,
  projectType,
  resolution = "1080p",
} = {}) {
  return {
    name,
    scriptInput: `待上传剧本：${name}。请在项目详情中通过剧本上传、剧本库或分镜单上传补充正式素材。`,
    aspectRatio,
    resolution,
    projectType,
  };
}
