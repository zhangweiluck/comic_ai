import { renderAssetLibraryPage } from "./asset-library-page.js";
import { renderTeamDashboardPage, renderTeamPage } from "./team-page.js";

export function renderLibraryTeam(context = {}) {
  const route = context.route ?? "assets";
  if (route === "team") {
    return renderTeamPage(context);
  }
  if (route === "team-dashboard") {
    return renderTeamDashboardPage(context);
  }
  return renderAssetLibraryPage(context);
}

export { renderAssetLibraryPage } from "./asset-library-page.js";
export { renderTeamDashboardPage, renderTeamPage } from "./team-page.js";
export { renderPricingModal } from "./pricing-modal.js";
export { renderMemberRulesModal } from "./member-rules-modal.js";

