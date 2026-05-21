import { creatorApi } from "./src/shared/creator-api.js";
import { initProductionWorkbench } from "./src/features/production-workbench/index.js";

const root = document.querySelector("#creator-app");

if (!root) {
  throw new Error("creator_app_mount_missing");
}

try {
  const session = await creatorApi.getSession();
  await initProductionWorkbench({
    root,
    session,
    api: creatorApi,
    onLogout: async () => {
      await creatorApi.logout();
      window.location.href = "/login.html";
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown_error";
  if (message === "unauthenticated") {
    window.location.href = "/login.html";
  } else {
    root.innerHTML = `
      <section class="workbench-fatal">
        <h1>工作台加载失败</h1>
        <p>${message}</p>
        <a href="/login.html">返回登录</a>
      </section>
    `;
  }
}
