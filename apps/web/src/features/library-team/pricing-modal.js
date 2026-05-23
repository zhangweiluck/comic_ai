import { commercePrototypeNotice, pricingPlans } from "../../shared/commerce-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";

export function renderPricingModal({ open = false } = {}) {
  if (!open) {
    return "";
  }

  return `
    <div class="library-team-modal-backdrop" data-modal="pricing">
      <section
        class="library-team-modal library-team-pricing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-modal-title"
      >
        <header class="library-team-modal-header">
          <div class="library-team-tabs" role="tablist" aria-label="商业关卡">
            <button class="library-team-tab is-active" type="button" role="tab" aria-selected="true">积分加量</button>
            <button class="library-team-tab" type="button" role="tab" aria-selected="false" data-action="show-commerce-placeholder">兑换码</button>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-pricing" aria-label="关闭定价弹窗">×</button>
        </header>
        <div class="library-team-promo" role="note">Seedance 2.0特惠活动延期至5月31日！专业版会员最高享8.5折，720P、1080P、2K多个清晰度可选</div>
        <p class="library-team-kicker">积分与团队权益</p>
        <h2 id="pricing-modal-title">团队生产扩容</h2>
        <p class="library-team-commerce-notice">${escapeHtml(commercePrototypeNotice)}</p>
        <div class="library-team-plan-grid">
          ${pricingPlans.map(renderPricingPlan).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderPricingPlan(plan) {
  const featured = plan.id === "pro";
  const actionLabel =
    plan.id === "enterprise" ? "联系商务" : plan.id === "pro" ? "立即订阅" : "立即购买";

  return `
    <article class="library-team-plan-card${featured ? " is-featured" : ""}">
      ${featured ? '<span class="library-team-badge">最受欢迎</span>' : ""}
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="library-team-price">${escapeHtml(plan.price)}</p>
      <p class="library-team-credits">${escapeHtml(plan.credits)}</p>
      <p class="library-team-plan-note">${escapeHtml(planNote(plan.id))}</p>
      <button
        class="library-team-button${featured ? " library-team-button-primary" : ""}"
        type="button"
        data-action="show-commerce-placeholder"
        data-plan-id="${escapeAttr(plan.id)}"
      >${escapeHtml(actionLabel)}</button>
      <ul class="library-team-feature-list">
        ${featuresForPlan(plan.id).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function planNote(id) {
  if (id === "enterprise") {
    return "适合多团队、多项目并行生产。";
  }
  if (id === "pro") {
    return "推荐团队创作，解锁成员管理和团队资产库。";
  }
  return "适合体验完整生成链路。";
}

function featuresForPlan(id) {
  if (id === "enterprise") {
    return ["大客户专属客服", "Agent创意工作流定制", "更多团队席位数支持", "快速响应技术支持"];
  }
  if (id === "pro") {
    return ["Seedance 2.0 免排队", "全流程 Agent", "团队管理", "支持50人团队"];
  }
  return ["全流程Agent", "行业主流模型", "多剧集创作", "无团队管理"];
}

