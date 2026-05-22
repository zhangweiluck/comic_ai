import { creatorApi } from "./src/shared/creator-api.js";
import { initProductionWorkbench } from "./src/features/production-workbench/index.js";

const root = document.querySelector("#creator-app");
const loginUrl = new URL("./login.html", window.location.href).toString();

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
      localStorage.removeItem("comic-ai-project-library");
      sessionStorage.clear();
      window.location.replace(loginUrl);
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown_error";
  if (message === "unauthenticated") {
    window.location.href = loginUrl;
  } else {
    root.innerHTML = `
      <section class="workbench-fatal">
        <h1>工作台加载失败</h1>
        <p>${message}</p>
        <a href="${loginUrl}">返回登录</a>
      </section>
    `;
  }
}

