/** Dependency-free browser controller. Included once by ui.page; no eval or HTML updates. */
export const uiClient = String.raw`(() => {
  'use strict';
  const config = JSON.parse(document.getElementById('arya-ui-state').textContent);
  const state = config.state;
  const read = binding => {
    if (binding.op === 'not') return !read(binding.value);
    if (binding.op === 'equal') return Object.is(read(binding.value), binding.compare);
    let value = state;
    for (const part of binding.key.split('.')) value = value != null && Object.hasOwn(value, part) ? value[part] : undefined;
    return value ?? binding.fallback;
  };
  const text = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const resolve = value => {
    if (!value || typeof value !== 'object') return value;
    if (Object.hasOwn(value, '$aryaBind')) return read(value.$aryaBind);
    if (Array.isArray(value)) return value.map(resolve);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)]));
  };
  const render = () => {
    for (const element of document.querySelectorAll('[data-arya-text]')) element.textContent = text(read(JSON.parse(element.dataset.aryaText)));
    for (const element of document.querySelectorAll('[data-arya-bind]')) {
      for (const [name, binding] of Object.entries(JSON.parse(element.dataset.aryaBind))) {
        const value = read(binding);
        if (['checked', 'disabled', 'hidden'].includes(name)) element[name] = Boolean(value);
        else if (name === 'value') { const next = text(value); if (element.value !== next) element.value = next; }
        else element.setAttribute(name, text(value));
      }
    }
  };
  const problem = error => {
    const element = document.getElementById('arya-ui-error');
    element.textContent = error.message || 'The action could not be completed.';
    element.hidden = false;
  };
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const animations = new Set();
  const active = new Map();
  const presets = ${JSON.stringify(motionPresets)};
  const easing = {smooth: 'cubic-bezier(.2,.7,.2,1)', snappy: 'cubic-bezier(.2,.9,.3,1.2)'};
  const controlMotion = (element, command) => {
    for (const animation of active.get(element) ?? []) { animation[command](); if (command === 'cancel') animations.delete(animation); }
    if (command === 'cancel') active.delete(element);
  };
  const playMotion = (element, motion) => {
    controlMotion(element, 'cancel');
    if (reduced.matches) return Promise.resolve(true);
    const targets = motion.stagger > 0 ? Array.from(element.children) : [element];
    const running = new Set();
    active.set(element, running);
    const jobs = targets.map((target, index) => {
      if (typeof target.animate !== 'function') return Promise.resolve(true);
      const animation = target.animate(motion.frames ?? presets[motion.preset], {
        duration: motion.duration, delay: motion.delay + index * (motion.stagger ?? 0),
        iterations: motion.repeat === 'infinite' ? Infinity : motion.repeat,
        easing: easing[motion.easing] ?? motion.easing ?? easing.smooth,
        direction: motion.direction ?? 'normal', fill: motion.fill ?? 'none'
      });
      animations.add(animation); running.add(animation);
      const finished = animation.finished.then(() => true, () => false).finally(() => {
        // A forwards-filled effect remains controllable until cancelled/replaced.
        if (animation.playState !== 'finished' || !['forwards', 'both'].includes(motion.fill)) {
          animations.delete(animation); running.delete(animation);
          if (!running.size && active.get(element) === running) active.delete(element);
        }
      });
      return finished;
    });
    return Promise.all(jobs).then(values => values.every(Boolean));
  };
  const cancelMotion = () => {
    if (!reduced.matches) return;
    for (const animation of animations) animation.cancel();
    animations.clear(); active.clear();
  };
  reduced.addEventListener?.('change', cancelMotion);
  const target = id => {
    const element = document.getElementById(id);
    if (!element) throw new Error('No component has id "' + id + '".');
    return element;
  };
  const toast = action => {
    let region = document.getElementById('arya-ui-toasts');
    if (!region) { region = document.createElement('div'); region.id = 'arya-ui-toasts'; document.body.append(region); }
    while (region.children.length >= 3) region.firstElementChild.remove();
    const item = document.createElement('div');
    item.className = 'arya-toast arya-tone-' + action.tone;
    item.setAttribute('role', action.tone === 'danger' ? 'alert' : 'status');
    const message = document.createElement('span'); message.textContent = action.message;
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'arya-ghost';
    dismiss.textContent = 'Dismiss'; dismiss.addEventListener('click', () => item.remove());
    item.append(message, dismiss); region.append(item);
    if (action.duration) setTimeout(() => item.remove(), action.duration);
  };
  const act = async action => {
    if (Array.isArray(action)) { for (const item of action) if (await act(item) === false) return false; return true; }
    if (action.kind === 'parallel') {
      const results = await Promise.allSettled(action.actions.map(act));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      return results.every(result => result.value !== false);
    }
    if (action.kind === 'animate') {
      const finished = playMotion(target(action.target), action.motion);
      if (action.wait) return finished;
    } else if (['pause', 'resume', 'cancel'].includes(action.kind)) controlMotion(target(action.target), {pause: 'pause', resume: 'play', cancel: 'cancel'}[action.kind]);
    else if (action.kind === 'open') { const dialog = target(action.target); if (dialog.tagName !== 'DIALOG') throw new Error('ui.open expects a dialog id.'); if (!dialog.open) dialog.showModal(); }
    else if (action.kind === 'close') { const dialog = target(action.target); if (dialog.tagName !== 'DIALOG') throw new Error('ui.close expects a dialog id.'); dialog.close(); }
    else if (action.kind === 'toast') toast(action);
    else if (action.kind === 'copy') {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access needs HTTPS or localhost. Select the example and copy it with your keyboard.');
      await navigator.clipboard.writeText(target(action.target).textContent);
    } else if (action.kind === 'theme') {
      const current = document.documentElement.dataset.theme;
      document.documentElement.dataset.theme = action.value === 'toggle' ? (current === 'dark' || current === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark') : action.value;
    } else if (action.kind === 'set') state[action.key] = resolve(action.value);
    else if (action.kind === 'toggle') state[action.key] = !state[action.key];
    else if (action.kind === 'increment') {
      const next = (state[action.key] ?? 0) + action.step;
      if (typeof next !== 'number' || !Number.isFinite(next)) throw new Error('Increment requires a finite numeric state value.');
      state[action.key] = next;
    } else if (action.kind === 'request') {
      if (action.pending) state[action.pending] = true;
      if (action.error) state[action.error] = '';
      render();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), action.timeoutMs);
      try {
        const response = await fetch(action.path, {
          method: action.method, signal: controller.signal, credentials: 'same-origin', redirect: 'error',
          headers: action.body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
          ...(action.body === undefined ? {} : { body: JSON.stringify(resolve(action.body)) })
        });
        if (!response.ok) throw new Error('Request failed (HTTP ' + response.status + ').');
        const value = response.status === 204 ? null : await response.json();
        if (action.result) state[action.result] = value;
      } catch (error) {
        const message = controller.signal.aborted ? 'The request timed out.' : error.message;
        if (action.error) state[action.error] = message;
        else problem(new Error(message));
        return false;
      } finally {
        clearTimeout(timer);
        if (action.pending) state[action.pending] = false;
        render();
      }
    }
    render();
    return true;
  };
  for (const element of document.querySelectorAll('[data-arya-model]')) {
    element.addEventListener('input', () => {
      if (element.type === 'radio' && !element.checked) return;
      state[element.dataset.aryaModel] = element.type === 'checkbox' ? element.checked : ['number', 'range'].includes(element.type) ? (element.value === '' || !Number.isFinite(Number(element.value)) ? null : Number(element.value)) : element.value;
      render();
    });
  }
  for (const element of document.querySelectorAll('[data-arya-action]')) {
    let busy = false;
    element.addEventListener(element.tagName === 'FORM' ? 'submit' : 'click', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const disabled = element.disabled;
      if (element.tagName === 'BUTTON') element.disabled = true;
      document.getElementById('arya-ui-error').hidden = true;
      try { await act(JSON.parse(element.dataset.aryaAction)); }
      catch (error) { problem(error); }
      finally { busy = false; if (element.tagName === 'BUTTON') element.disabled = disabled; render(); }
    });
  }
  for (const root of document.querySelectorAll('.arya-tabs')) {
    const tabs = Array.from(root.querySelectorAll('[role="tab"]')).filter(tab => tab.closest('.arya-tabs') === root);
    const panels = Array.from(root.querySelectorAll('[role="tabpanel"]')).filter(panel => panel.closest('.arya-tabs') === root);
    const select = tab => {
      for (const item of tabs) { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; }
      for (const panel of panels) panel.hidden = panel.id !== tab.getAttribute('aria-controls');
    };
    for (const tab of tabs) {
      tab.addEventListener('click', () => { if (!tab.disabled) select(tab); });
      tab.addEventListener('keydown', event => {
        const enabled = tabs.filter(item => !item.disabled), index = enabled.indexOf(tab);
        const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : event.key === 'ArrowRight' ? enabled[(index + 1) % enabled.length] : event.key === 'ArrowLeft' ? enabled[(index - 1 + enabled.length) % enabled.length] : undefined;
        if (next) { event.preventDefault(); select(next); next.focus(); }
      });
    }
  }
  for (const element of document.querySelectorAll('[data-arya-motion]')) {
    const motion = JSON.parse(element.dataset.aryaMotion);
    const play = () => { playMotion(element, motion).catch(problem); };
    if (motion.trigger === 'hover') { element.addEventListener('pointerenter', play); element.addEventListener('focusin', play); }
    else if (motion.trigger === 'press') { element.addEventListener('pointerdown', play); element.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) play(); }); }
    else if (motion.trigger === 'visible' && typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); play(); } }, {threshold: .15});
      observer.observe(element);
    } else play();
  }
  render();
})();`;
import { motionPresets } from './ui-motion.js';
