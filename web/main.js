// Свой порядок строк в списке сессий: строку тащат мышью (на телефоне — подержать палец и вести) внутри её группы —
// «Специалисты», «Направления», «Исполнители», «Спят или упали», форки агента. Порядок — в этом браузере
// (localStorage), сброс — «Настройки» → «Порядок в списке».
// Ядро строит список заново на каждом снимке, а место sidebar.footer рисует уже после списка: здесь плагин и
// переставляет строки — до отрисовки, без мигания. Строку узнаём по своему значку sidebar.session в ней (data-so).
const KEY = "sidebar-order.v1";
const HOLD_MS = 350;   // палец: подержать, иначе это прокрутка списка
const MOVE_PX = 6;     // мышь: сдвинуть — перетаскивание, иначе это клик

let hub = null;
let order = load();
let drag = null;       // {key, name, unit, ghost, line, dx, dy, before}
let press = null;      // нажатие до начала перетаскивания

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save() {
  if (Object.keys(order).length) localStorage.setItem(KEY, JSON.stringify(order));
  else localStorage.removeItem(KEY);
}
const list = () => document.getElementById("list");

// группа списка, в которой лежит ul: заголовок группы, «спят» или форки такого-то агента
function groupKey(ul) {
  const sub = ul.closest("li.forks");
  if (sub) return `forks:${nameOf(sub.previousElementSibling) || "?"}`;
  if (ul.closest("details.resting")) return "resting";
  const g = ul.closest(".sgroup");
  return g ? g.querySelector(".gt")?.textContent || "group" : "top";
}
const nameOf = (li) => li?.querySelector(":scope > .srow > [data-so]")?.dataset.so || null;

// строки ul вместе с их li.forks (форки идут сразу под агентом и едут с ним)
function units(ul) {
  const out = [];
  for (const li of ul.children) {
    const name = nameOf(li);
    if (name) out.push({ name, nodes: [li] });
    else if (li.classList.contains("forks") && out.length) out[out.length - 1].nodes.push(li);
  }
  return out;
}

function arrange(ul) {
  const saved = order[groupKey(ul)];
  const all = units(ul);
  if (!saved || all.length < 2) return all;
  const at = new Map(saved.map((n, i) => [n, i]));
  const sorted = all.map((u, i) => ({ u, i, k: at.has(u.name) ? at.get(u.name) : saved.length + i }))
    .sort((a, b) => a.k - b.k).map((x) => x.u);   // новых в сохранённом нет — внизу, в порядке ядра
  if (sorted.some((u, i) => u !== all[i])) ul.append(...sorted.flatMap((u) => u.nodes));
  return sorted;
}

function apply() {
  const root = list();
  if (!root) return;
  for (const ul of root.querySelectorAll("ul")) arrange(ul);
  if (drag) for (const ul of root.querySelectorAll("ul")) {
    if (groupKey(ul) !== drag.key) continue;
    const u = units(ul).find((x) => x.name === drag.name);
    if (u) { drag.unit = u; u.nodes.forEach((n) => n.classList.add("so-src")); }
  }
}

function findUl(key) {
  return [...(list()?.querySelectorAll("ul") || [])].find((ul) => groupKey(ul) === key) || null;
}

function begin(e) {
  const li = press.li, rect = li.querySelector(".srow").getBoundingClientRect();
  const ghost = li.querySelector(".srow").cloneNode(true);
  ghost.classList.add("so-ghost");
  ghost.removeAttribute("aria-current");
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  const line = hub.el("div", "so-line");
  document.body.append(ghost, line);
  document.body.classList.add("so-dragging");
  getSelection()?.removeAllRanges();
  drag = { key: press.key, name: press.name, ghost, line, dy: press.y - rect.top, before: undefined };
  press = null;
  apply();
  move(e);
}

function move(e) {
  drag.ghost.style.top = `${e.clientY - drag.dy}px`;
  const ul = findUl(drag.key);
  if (!ul) return;
  const rest = units(ul).filter((u) => u.name !== drag.name);
  const box = ul.getBoundingClientRect();
  let before = null, y = null;
  for (const u of rest) {
    const r = u.nodes[0].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { before = u.name; y = r.top; break; }
  }
  if (y == null) {
    const last = rest[rest.length - 1]?.nodes.at(-1);
    y = last ? last.getBoundingClientRect().bottom : box.top;
  }
  drag.before = before;
  Object.assign(drag.line.style, { top: `${y - 1}px`, left: `${box.left + 6}px`, width: `${box.width - 12}px` });
  scrollNear(e.clientY);
}

// у края прокручиваемого списка — подкрутить, чтобы дотащить до строки за краем
function scrollNear(y) {
  let s = list();
  while (s && s.scrollHeight <= s.clientHeight) s = s.parentElement;
  if (!s || s === document.body) return;
  const r = s.getBoundingClientRect();
  if (y < r.top + 32) s.scrollTop -= 10;
  else if (y > r.bottom - 32) s.scrollTop += 10;
}

function drop() {
  const ul = findUl(drag.key);
  if (ul && drag.before !== undefined) {
    const names = units(ul).map((u) => u.name).filter((n) => n !== drag.name);
    const at = drag.before == null ? names.length : names.indexOf(drag.before);
    names.splice(at < 0 ? names.length : at, 0, drag.name);
    const gone = (order[drag.key] || []).filter((n) => !names.includes(n));   // спят, скрыты поиском — место за ними
    order[drag.key] = [...names, ...gone];
    save();
    swallowClick();
  }
  end();
}

function end() {
  if (drag) {
    drag.ghost.remove();
    drag.line.remove();
    document.querySelectorAll(".so-src").forEach((n) => n.classList.remove("so-src"));
    document.body.classList.remove("so-dragging");
  }
  clearTimeout(press?.timer);
  drag = press = null;
  apply();
}

// отпустили строку — браузер шлёт ей click; это не выбор сессии
function swallowClick() {
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
}

function wire(root) {
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag) return;
    const row = e.target.closest(".srow");
    const li = row?.parentElement;
    const name = nameOf(li), ul = li?.parentElement;
    if (!name || !ul || units(ul).length < 2) return;
    press = { li, name, key: groupKey(ul), x: e.clientX, y: e.clientY, touch: e.pointerType !== "mouse" };
    if (!press.touch) e.preventDefault();   // иначе мышь, потянув строку, выделяет текст списка
    if (press.touch) press.timer = setTimeout(() => press && begin(press.last || e), HOLD_MS);
  });
  root.addEventListener("touchmove", (e) => { if (drag) e.preventDefault(); }, { passive: false });
  root.addEventListener("contextmenu", (e) => { if (drag || press?.touch) e.preventDefault(); });
  window.addEventListener("pointermove", (e) => {
    if (drag) return move(e);
    if (!press) return;
    press.last = e;
    const far = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (press.touch) { if (far > 8) end(); }   // палец поехал до срока — прокрутка
    else if (far > MOVE_PX) begin(e);
  });
  window.addEventListener("pointerup", () => (drag ? drop() : end()));
  window.addEventListener("pointercancel", end);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && drag) end(); });
}

// список перерисовать сразу (после сброса): ядро строит его заново на вводе в поиск
function rerender() {
  document.getElementById("filter")?.dispatchEvent(new Event("input"));
}

const TITLES = { top: "Хаб", resting: "Спят или упали" };
const title = (k) => TITLES[k] || (k.startsWith("forks:") ? `форки ${k.slice(6)}` : k);

function settings(root) {
  const keys = Object.keys(order);
  const box = hub.el("div", "settings-sec");
  box.append(hub.el("p", "hint", "Строку в списке сессий можно перетащить мышью внутри её группы; на телефоне — "
    + "подержать палец на строке и вести. Порядок помнит этот браузер."));
  box.append(hub.el("p", "hint", keys.length ? `Свой порядок: ${keys.map(title).join(", ")}.`
    : "Порядок пока как у хаба."));
  const b = hub.el("button", "btn small danger", "Сбросить порядок");
  b.type = "button";
  b.disabled = !keys.length;
  b.addEventListener("click", () => { order = {}; save(); rerender(); settings(root); });
  const row = hub.el("div", "upd-actions");
  row.append(b);
  box.append(row);
  root.replaceChildren(box);
}

export default function register(h) {
  hub = h;
  hub.addStyle("web/order.css");
  hub.addSlot("sidebar.session", {
    id: "mark",
    render(root, snap, ctx) { root.dataset.so = ctx.session.name; root.hidden = true; },
  });
  hub.addSlot("sidebar.footer", {
    id: "apply",
    render(root) {
      root.hidden = true;
      const l = list();
      if (l && !l._so) { l._so = true; wire(l); }
      apply();
    },
  });
  hub.addSettings({
    id: "sidebar-order", title: "Порядок в списке",
    render(root) { if (root._keys !== JSON.stringify(order)) { root._keys = JSON.stringify(order); settings(root); } },
  });
  window.addEventListener("storage", (e) => { if (e.key === KEY) { order = load(); rerender(); } });
}
