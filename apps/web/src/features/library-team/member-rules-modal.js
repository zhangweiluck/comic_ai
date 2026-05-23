import { permissionRows, teamRoles } from "../../shared/permissions-fixtures.js";
import { escapeHtml } from "./markup.js";

export function renderMemberRulesModal({ open = false } = {}) {
  if (!open) {
    return "";
  }

  if (!Array.isArray(permissionRows) || permissionRows.length === 0) {
    return `
      <section class="library-team-error" role="alert">
        权限矩阵加载失败，请刷新后重试
      </section>
    `;
  }

  return `
    <div class="library-team-modal-backdrop" data-modal="member-rules">
      <section
        class="library-team-modal library-team-rules-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-rules-title"
      >
        <header class="library-team-modal-header">
          <h2 id="member-rules-title">成员管理规则说明</h2>
          <button class="library-team-icon-button" type="button" data-action="close-member-rules" aria-label="关闭规则说明">×</button>
        </header>
        <div class="library-team-modal-scroll">
          <section>
            <h3>基础规则</h3>
            <p>子账号专为团队协作设计。通过主账号+子账号模式，您可以在保障主账号安全的前提下，灵活管控团队的分组、参与项目、功能权限及可用积分。</p>
            <p><strong>账号关系：</strong>注册账号即为主账号，开通团队后可创建并管理多个子账号。</p>
            <p><strong>资产归属：</strong>子账号在项目中产生的资产统一归团队所有。</p>
          </section>
          <section>
            <h3>成员角色权限管理</h3>
            <p>创建子账号时需为其设定角色。角色决定项目参与范围、资产操作权限和积分使用边界。</p>
          </section>
          <section>
            <h3>成员组管理</h3>
            <p>组管理员可管理本成员组项目与成员，普通生产角色只看到被分配的项目资产。</p>
          </section>
          <section>
            <h3>积分管理机制</h3>
            <p>主账号统一购买积分，管理员或组管理员可向子账号分配额度，所有消耗进入团队数据看板。</p>
          </section>
          <section>
            <h3>账号与安全管理</h3>
            <p>停用子账号不会删除历史资产；敏感操作保留给管理员，避免误删生产资料。</p>
          </section>
          <section>
            <h3>角色权限对照表</h3>
            <div class="library-team-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>权限分类</th>
                    <th>能力</th>
                    ${teamRoles.map((role) => `<th>${escapeHtml(role)}</th>`).join("")}
                  </tr>
                </thead>
                <tbody>
                  ${permissionRows.map(renderPermissionRow).join("")}
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <footer class="library-team-modal-actions">
          <button class="library-team-button library-team-button-primary" type="button" data-action="close-member-rules">确认</button>
        </footer>
      </section>
    </div>
  `;
}

function renderPermissionRow(row) {
  return `
    <tr>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.capability)}</td>
      ${teamRoles.map((_, index) => `<td>${escapeHtml(row.values[index] ?? "—")}</td>`).join("")}
    </tr>
  `;
}

