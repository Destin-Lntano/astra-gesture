import {Cosmos} from './cosmos.js';

const $ = id => document.getElementById(id);
const canvas = $('universe');
let cosmos, hands, cameraOn = false, cameraBusy = false, paused = false, gestureAt = 0, cameraEpoch = 0;
let toastTimer, pointerStart, lastPinchDistance = 0;
const pointers = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message, duration = 3300) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => $('toast').hidden = true, duration);
}
function dismissIntro() { $('intro').classList.add('dismissed'); }
function updateScene() {
  const focused = !!cosmos.focused;
  document.querySelectorAll('[data-mode]').forEach(b => {
    const active = !focused && b.dataset.mode === cosmos.mode;
    b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active));
  });
  $('featured-btn').classList.toggle('active', focused);
  $('featured-btn').setAttribute('aria-pressed', String(focused));
  const i = focused ? 2 : cosmos.mode === 'galaxy' ? 1 : 0;
  $('scene-index').textContent = ['01 / 03', '02 / 03', '03 / 03'][i];
  $('caption-en').textContent = ['CIRCUMPOLAR', 'DEEP SPACE', 'STELLAR PORTRAIT'][i];
  $('caption-cn').textContent = ['地平线之上的时间', '向星海深处航行', '光芒有了温度'][i];
  $('exposure').disabled = i !== 0;
  $('exposure').closest('label').classList.toggle('disabled', i !== 0);
}
function selected(info) {
  $('star-panel').hidden = !info;
  if (info) {
    dismissIntro();
    $('star-name').textContent = info.id;
    $('star-temp').textContent = Number(info.temperature).toLocaleString('zh-CN') + ' K';
    $('star-kind').textContent = info.kind;
    $('star-description').textContent = info.description;
  }
  if (cosmos) updateScene();
}
function setPaused(value) {
  paused = value; cosmos.setPaused(paused);
  $('pause-btn').innerHTML = `<svg><use href="#i-${paused ? 'play' : 'pause'}"/></svg>`;
  $('pause-btn').title = paused ? '继续时间（空格）' : '暂停时间（空格）';
  $('pause-btn').setAttribute('aria-label', paused ? '继续时间' : '暂停时间');
  $('pause-btn').setAttribute('aria-pressed', String(paused));
}
function mode(value) {
  dismissIntro(); if (cosmos.focused) cosmos.back(); cosmos.setMode(value); updateScene();
}
function back() { cosmos.back(); updateScene(); }
function reset() { cosmos.reset(); updateScene(); toast('已回到初始观测视角'); }
function focusAt(x, y) {
  const hit = cosmos.focusAt(x, y);
  if (!hit) toast('这里没有可选恒星，试着点亮一些的星光，或选择「抵近恒星」', 3000);
  updateScene(); return hit;
}

try {
  cosmos = new Cosmos(canvas, {
    onSelect: selected,
    onStats: stats => {
      const count = Number(stats.stars || 0).toLocaleString('en-US');
      $('render-state').textContent = `${count} 星光 · ${stats.fps ? Math.round(stats.fps) + ' FPS' : '实时渲染'}`;
    }
  });
  cosmos.setExposure(.55); cosmos.setSpeed(.65);
  if (reducedMotion) setPaused(true);
  $('loading').classList.add('finished'); setTimeout(() => $('loading').hidden = true, 900);
  updateScene();
} catch (error) {
  console.error(error); $('loading').hidden = true; $('fatal').hidden = false;
  $('fatal-text').textContent = '请使用新版 Chrome、Edge 或 Safari，并在浏览器设置中启用图形加速。';
}

if (cosmos) {
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => mode(b.dataset.mode)));
  $('explore-btn').addEventListener('click', () => mode('galaxy'));
  $('featured-btn').addEventListener('click', () => { dismissIntro(); cosmos.focusFeatured(); updateScene(); });
  $('back-btn').addEventListener('click', back);
  $('reset-btn').addEventListener('click', reset);
  $('pause-btn').addEventListener('click', () => setPaused(!paused));
  $('zoom-in').addEventListener('click', () => { dismissIntro(); cosmos.zoom(-.3); });
  $('zoom-out').addEventListener('click', () => { dismissIntro(); cosmos.zoom(.3); });
  $('exposure').addEventListener('input', e => { cosmos.setExposure(e.target.value / 100); $('exposure-value').value = e.target.value + '%'; });
  $('speed').addEventListener('input', e => { cosmos.setSpeed(e.target.value / 100); $('speed-value').value = (e.target.value / 100).toFixed(2) + '×'; });
  $('quality').addEventListener('change', e => cosmos.setQuality(e.target.value));
  window.addEventListener('resize', () => cosmos.resize());
  canvas.addEventListener('wheel', e => { e.preventDefault(); dismissIntro(); cosmos.zoom(Math.max(-.35, Math.min(.35, e.deltaY * .0015))); }, {passive: false});
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    pointerStart = {x: e.clientX, y: e.clientY, t: performance.now(), moved: false};
    if (pointers.size > 1) { pointerStart.moved = true; lastPinchDistance = pinchDistance(); }
  });
  function pinchDistance() { const [a,b] = [...pointers.values()]; return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId); pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 5) pointerStart.moved = true;
    if (pointers.size > 1) {
      const d = pinchDistance(); if (lastPinchDistance > 0 && d > 0) cosmos.zoom(-Math.log(d / lastPinchDistance) * 1.4);
      lastPinchDistance = d; dismissIntro();
    } else {
      cosmos.rotate((e.clientX - prev.x) / innerWidth, (e.clientY - prev.y) / innerHeight);
      if (pointerStart?.moved) dismissIntro();
    }
  });
  const release = e => {
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId); lastPinchDistance = 0;
    if (e.type === 'pointerup' && wasSingle && pointerStart && !pointerStart.moved && performance.now() - pointerStart.t < 600) {
      focusAt(e.clientX / innerWidth, e.clientY / innerHeight);
    }
    if (pointers.size) { pointerStart = {moved: true, x: e.clientX, y: e.clientY, t: performance.now()}; } else pointerStart = null;
  };
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); toast('图形设备暂时中断，正在等待恢复。若未恢复，请刷新页面。', 15000); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
}

async function toggleCamera() {
  if (cameraBusy) { ++cameraEpoch; hands?.stop(); cameraBusy = false; cameraOn = false; updateCameraButton(); return; }
  if (cameraOn) { ++cameraEpoch; hands?.stop(); cameraOn = false; updateCameraButton(); return; }
  const attempt = ++cameraEpoch;
  cameraBusy = true; updateCameraButton(); $('camera-panel').hidden = false;
  document.body.classList.add('camera-enabled'); $('camera-state').textContent = '正在加载本地识别组件…';
  try {
    if (!window.isSecureContext) throw new Error('请通过 HTTPS 链接打开网站后使用摄像头。');
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头，请用 Chrome、Edge 或 Safari 打开。');
    if (!hands) {
      const {HandController} = await import('./hands.js');
      if (attempt !== cameraEpoch) return;
      hands = new HandController({video: $('camera-video'), overlay: $('hand-overlay'), onState: state => {
        $('camera-state').textContent = state.message || state.status;
        if (state.status === 'error') { cameraOn = false; updateCameraButton(); toast(state.message || '手势识别暂时不可用，请使用鼠标探索。', 6000); }
        if (state.status === 'off') { cameraOn = false; updateCameraButton(); }
        if (state.status === 'lost') { $('gesture-text').textContent = '请把手掌放入画面'; $('cursor').hidden = true; }
        if (state.status === 'tracking' && performance.now() - gestureAt > 1200) $('gesture-text').textContent = '张掌转动 · 双手缩放 · 捏合选星';
      }, onGesture: g => {
        if (!cosmos || document.querySelector('dialog[open]')) return;
        if (g.type === 'cursor') {
          $('cursor').style.left = g.x * innerWidth + 'px'; $('cursor').style.top = g.y * innerHeight + 'px'; $('cursor').hidden = false;
          $('cursor').classList.toggle('pinching', !!g.pinching); return;
        }
        dismissIntro(); gestureAt = performance.now();
        if (g.type === 'rotate') { cosmos.rotate(g.dx, g.dy); $('gesture-text').textContent = '正在拨动星海'; }
        if (g.type === 'zoom') { cosmos.zoom(Math.max(-.2, Math.min(.2, g.delta))); $('gesture-text').textContent = g.delta < 0 ? '靠近星海' : '拉远视野'; }
        if (g.type === 'focus') {
          $('cursor').style.left = g.x * innerWidth + 'px'; $('cursor').style.top = g.y * innerHeight + 'px'; $('cursor').hidden = false;
          focusAt(g.x, g.y); $('gesture-text').textContent = '捏合选星'; setTimeout(() => $('cursor').hidden = true, 1200);
        }
        if (g.type === 'pause') { setPaused(!paused); $('gesture-text').textContent = paused ? '时间已停驻' : '星河继续流动'; }
      }});
    }
    const started = await hands.start();
    if (attempt !== cameraEpoch) return;
    cameraOn = started === true;
    if (cameraOn) toast('手势已开启。先张开一只手，再尝试双手开合缩放。', 4500);
  } catch (error) {
    if (attempt !== cameraEpoch) return;
    hands?.stop(); cameraOn = false;
    const messages = {NotAllowedError:'摄像头权限未开启。请在地址栏允许使用；若在微信或内嵌页面，请用系统浏览器打开链接。鼠标仍可探索。',NotFoundError:'没有找到摄像头；鼠标和触屏仍可使用全部观测功能。',NotReadableError:'摄像头可能正被其他应用使用，请关闭其他视频应用后重试。'};
    toast(messages[error.name] || error.message || '识别加载失败，请检查网络后重试。', 6500);
  } finally { if (attempt === cameraEpoch) { cameraBusy = false; updateCameraButton(); } }
}
function updateCameraButton() {
  $('camera-btn').classList.toggle('active', cameraOn); $('camera-btn').querySelector('span').textContent = cameraBusy ? '取消开启' : cameraOn ? '关闭手势' : '开启手势';
  $('camera-btn').setAttribute('aria-pressed', String(cameraOn)); $('camera-panel').hidden = !cameraOn && !cameraBusy;
  $('gesture-tip').hidden = !cameraOn; document.body.classList.toggle('camera-enabled', cameraOn || cameraBusy);
  if (!cameraOn) $('cursor').hidden = true;
}
$('camera-btn').addEventListener('click', toggleCamera);
$('guide-camera-btn').addEventListener('click', () => { $('guide-dialog').close(); if (!cameraOn) toggleCamera(); });
$('help-btn').addEventListener('click', () => $('guide-dialog').showModal());
$('about-btn').addEventListener('click', () => $('about-dialog').showModal());
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) { const r=d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }));
$('zen-btn').addEventListener('click', () => document.body.classList.toggle('zen'));
$('fullscreen-btn').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { toast('当前浏览器限制全屏，可以使用右下角的纯净观测按钮。'); }
});
document.addEventListener('keydown', e => {
  if (!cosmos || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
  if (e.code === 'KeyR') reset();
  if (e.code === 'KeyH') document.body.classList.toggle('zen');
  if (e.code === 'Escape') { if (cosmos.focused) back(); document.body.classList.remove('zen'); }
});
window.addEventListener('pagehide', () => { ++cameraEpoch; hands?.stop(); cameraOn=false; cameraBusy=false; updateCameraButton(); });
// Read-only diagnostics for verifying renderer and control state.
window.__astra = {get state(){return {mode:cosmos?.mode,focused:!!cosmos?.focused,paused,cameraOn,cameraBusy};}};
