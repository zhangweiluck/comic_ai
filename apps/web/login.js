/**
 * Comic AI Studio - Login Page
 * Fluid background + particle system + auth logic
 */

/* ===== Canvas Fluid Background ===== */
const canvas = document.querySelector("#fluid-canvas");
const ctx = canvas?.getContext("2d");

let width = 0;
let height = 0;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;
let isMouseOverLogin = false;
let time = 0;

// Particle system
const PARTICLE_COUNT = 80;
const particles = [];

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.size = Math.random() * 1.2 + 0.3;
    this.alpha = Math.random() * 0.4 + 0.1;
    this.phase = Math.random() * Math.PI * 2;
    this.speed = Math.random() * 0.5 + 0.2;
  }

  update() {
    // Gentle drift
    this.x += this.vx * this.speed;
    this.y += this.vy * this.speed;

    // Mouse influence (subtle gravitational pull)
    const dx = mouseX - this.x;
    const dy = mouseY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 300;

    if (dist < maxDist && dist > 1) {
      const force = (1 - dist / maxDist) * 0.02;
      this.vx += (dx / dist) * force;
      this.vy += (dy / dist) * force;
    }

    // Damping
    this.vx *= 0.99;
    this.vy *= 0.99;

    // Phase-based pulsing
    this.phase += 0.01;

    // Wrap around edges
    if (this.x < -10) this.x = width + 10;
    if (this.x > width + 10) this.x = -10;
    if (this.y < -10) this.y = height + 10;
    if (this.y > height + 10) this.y = -10;
  }

  draw() {
    const pulse = Math.sin(this.phase) * 0.3 + 0.7;
    const alpha = this.alpha * pulse;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(99, 102, 241, ${alpha})`;
    ctx.fill();

    // Subtle glow for larger particles
    if (this.size > 0.8) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99, 102, 241, ${alpha * 0.15})`;
      ctx.fill();
    }
  }
}

// Noise function for fluid field
function noise(x, y, t) {
  const scale = 0.003;
  const nx = x * scale;
  const ny = y * scale;
  const nt = t * 0.0003;

  return (
    Math.sin(nx * 2.3 + nt * 1.7) *
    Math.cos(ny * 1.7 - nt * 2.1) *
    0.5 +
    Math.sin(nx * 1.1 - ny * 2.3 + nt * 1.3) *
    Math.cos(nx * 2.1 + ny * 1.5 + nt * 0.7) *
    0.3 +
    Math.sin(nx * 3.7 + ny * 0.9 + nt * 2.3) * 0.2
  );
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx?.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function initParticles() {
  particles.length = 0;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }
}

function drawFluid() {
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  // Base void color
  ctx.fillStyle = "#020205";
  ctx.fillRect(0, 0, width, height);

  // Slow down fluid when mouse is over login area
  const timeScale = isMouseOverLogin ? 0.3 : 1.0;
  const currentTime = time * timeScale;

  // Draw fluid field (simplified flow lines)
  const gridSize = 40;
  const cols = Math.ceil(width / gridSize) + 1;
  const rows = Math.ceil(height / gridSize) + 1;

  // Ambient indigo/purple blobs
  const blob1x = width * 0.3 + Math.sin(currentTime * 0.0004) * width * 0.15;
  const blob1y = height * 0.4 + Math.cos(currentTime * 0.0003) * height * 0.1;
  const blob2x = width * 0.7 + Math.cos(currentTime * 0.0005) * width * 0.12;
  const blob2y = height * 0.6 + Math.sin(currentTime * 0.0004) * height * 0.08;

  // Large ambient gradients
  const gradient1 = ctx.createRadialGradient(blob1x, blob1y, 0, blob1x, blob1y, width * 0.35);
  gradient1.addColorStop(0, "rgba(26, 27, 75, 0.5)");
  gradient1.addColorStop(0.5, "rgba(26, 27, 75, 0.15)");
  gradient1.addColorStop(1, "transparent");
  ctx.fillStyle = gradient1;
  ctx.fillRect(0, 0, width, height);

  const gradient2 = ctx.createRadialGradient(blob2x, blob2y, 0, blob2x, blob2y, width * 0.3);
  gradient2.addColorStop(0, "rgba(45, 27, 78, 0.4)");
  gradient2.addColorStop(0.5, "rgba(45, 27, 78, 0.1)");
  gradient2.addColorStop(1, "transparent");
  ctx.fillStyle = gradient2;
  ctx.fillRect(0, 0, width, height);

  // Flow field lines
  ctx.lineWidth = 0.5;
  for (let row = 0; row < rows; row += 2) {
    for (let col = 0; col < cols; col += 2) {
      const x = col * gridSize;
      const y = row * gridSize;
      const angle = noise(x, y, currentTime) * Math.PI * 2;
      const length = gridSize * 0.6;

      const nx = Math.cos(angle) * length;
      const ny = Math.sin(angle) * length;

      // Color based on angle
      const hue = 240 + (angle / (Math.PI * 2)) * 40;
      const alpha = 0.04 + Math.abs(noise(x, y, currentTime)) * 0.06;

      ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x - nx * 0.5, y - ny * 0.5);
      ctx.lineTo(x + nx * 0.5, y + ny * 0.5);
      ctx.stroke();
    }
  }

  // Draw particles
  particles.forEach((p) => {
    p.update();
    p.draw();
  });
}

function animate() {
  time += 16;

  // Smooth mouse interpolation
  mouseX += (targetMouseX - mouseX) * 0.08;
  mouseY += (targetMouseY - mouseY) * 0.08;

  drawFluid();
  requestAnimationFrame(animate);
}

// Mouse tracking
document.addEventListener("mousemove", (e) => {
  targetMouseX = e.clientX;
  targetMouseY = e.clientY;
});

// Detect if mouse is over login area
const loginFrame = document.querySelector(".login-frame");
loginFrame?.addEventListener("mouseenter", () => {
  isMouseOverLogin = true;
});
loginFrame?.addEventListener("mouseleave", () => {
  isMouseOverLogin = false;
});

// Init canvas
if (canvas && ctx) {
  resize();
  initParticles();
  animate();
  window.addEventListener("resize", () => {
    resize();
    initParticles();
  });
}

/* ===== Auth Logic ===== */
const form = document.querySelector("#login-form");
const phoneInput = document.querySelector("#phone-input");
const codeInput = document.querySelector("#code-input");
const requestCodeButton = document.querySelector("#request-code-button");
const verifyButton = document.querySelector("#verify-button");
const statusMessage = document.querySelector("#status-message");
const debugPanel = document.querySelector("#debug-panel");

let activeChallengeId = null;
const appUrl = new URL("./app.html#project", window.location.href).toString();

function resolveApiUrl(url) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const origin =
    window.location.protocol === "file:"
      ? "http://127.0.0.1:4310"
      : window.location.origin;
  return new URL(url, origin).toString();
}

async function loadSession() {
  const response = await fetch(resolveApiUrl("/api/auth/session"), {
    credentials: "include",
  });

  if (!response.ok) {
    return;
  }

  await response.json();
  window.location.href = appUrl;
}

function setStatus(message) {
  statusMessage.textContent = message;
}

function showDebug(message) {
  debugPanel.hidden = false;
  debugPanel.textContent = message;
}

requestCodeButton?.addEventListener("click", async () => {
  const phone = phoneInput?.value?.trim() ?? "";
  setStatus("正在请求验证码...");

  const requestResponse = await fetch(resolveApiUrl("/api/auth/code/request"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone }),
  });

  const requestPayload = await requestResponse.json();

  if (!requestResponse.ok) {
    setStatus(requestPayload.error ?? "验证码请求失败");
    return;
  }

  activeChallengeId = requestPayload.challengeId;
  setStatus(`验证码已发送至 ${requestPayload.maskedPhone}`);

  const debugResponse = await fetch(
    resolveApiUrl(`/api/auth/dev/challenges/${requestPayload.challengeId}`),
    { credentials: "include" },
  );

  if (debugResponse.ok) {
    const debugPayload = await debugResponse.json();
    showDebug(`开发验证码：${debugPayload.code}`);
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = phoneInput?.value?.trim() ?? "";
  const code = codeInput?.value?.trim() ?? "";

  if (!activeChallengeId) {
    setStatus("请先获取验证码");
    return;
  }

  setStatus("正在登录...");

  const verifyResponse = await fetch(resolveApiUrl("/api/auth/code/verify"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: activeChallengeId,
      phone,
      code,
    }),
    credentials: "include",
  });

  const verifyPayload = await verifyResponse.json();

  if (!verifyResponse.ok) {
    setStatus(verifyPayload.error ?? "登录失败");
    return;
  }

  setStatus(`登录成功：${verifyPayload.user.phone}`);

  const overlay = document.createElement("div");
  overlay.className = "dissolve-overlay";
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });

  setTimeout(() => {
    window.location.href = appUrl;
  }, 800);
});

/* ===== Social Login Placeholders ===== */
const socialButtons = document.querySelectorAll(".social-btn");

socialButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const provider = btn.classList.contains("wechat")
      ? "微信"
      : btn.classList.contains("alipay")
        ? "支付宝"
        : "QQ";
    setStatus(`${provider} 登录即将上线`);
  });
});

await loadSession();
