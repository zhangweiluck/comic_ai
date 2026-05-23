export const personalAssetLibraryFixture = {
  tabs: ["历史创作", "Agent项目", "历史上传", "我的提示词"],
  filters: ["类型筛选", "我的收藏", "批量操作", "时间顺序"],
  folders: ["全部", "角色", "场景", "道具", "未归档"],
  assets: [],
};

export const officialAssetLibraryFixture = {
  scopes: ["官方资产库", "团队资产库"],
  categories: ["角色", "场景", "道具"],
  folders: [
    "国内仿真人-现代都市",
    "国内仿真人-东方古代",
    "3D漫-现代都市",
    "3D漫-东方修仙",
    "2D漫-现代都市",
    "2D漫-东方修仙",
  ],
  assets: [
    { id: "doctor", name: "医生", category: "角色" },
    { id: "chef", name: "厨师", category: "角色" },
    { id: "teacher", name: "老师", category: "角色" },
    { id: "driver", name: "司机", category: "角色" },
    { id: "nanny", name: "保姆", category: "角色" },
    { id: "guard", name: "保镖", category: "角色" },
  ],
};

export const teamAssetGate = {
  title: "专业版会员权益",
  message: "团队资产库为专业版会员权益，开通后使用该功能。",
  cta: "去开通",
};

