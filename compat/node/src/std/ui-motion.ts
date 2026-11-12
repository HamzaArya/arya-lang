import { motionPresets, motionEasings } from '../ui-motion.js';

export const uiMotionRuntime = String.raw`
const __arya_uiPresets = Object.freeze(${JSON.stringify(motionPresets)});
const __arya_uiTiming = options => {
  __arya_uiOptions(options, ['duration', 'delay', 'repeat', 'easing', 'direction', 'fill', 'trigger', 'stagger'], 'motion');
  const timing = {duration: options.duration ?? 400, delay: options.delay ?? 0, repeat: options.repeat ?? 1, easing: options.easing ?? 'smooth', direction: options.direction ?? 'normal', fill: options.fill ?? 'none', trigger: options.trigger ?? 'load', stagger: options.stagger ?? 0};
  for (const key of ['duration', 'delay', 'stagger']) if (!Number.isInteger(timing[key]) || timing[key] < 0 || timing[key] > 60000) __arya_uiError('motion ' + key + ' must be 0–60000 milliseconds.');
  if (timing.repeat !== 'infinite' && (!Number.isInteger(timing.repeat) || timing.repeat < 1 || timing.repeat > 100)) __arya_uiError('motion repeat must be 1–100 or "infinite".');
  if (timing.repeat === 'infinite' && timing.duration === 0) __arya_uiError('infinite motion needs a positive duration.');
  if (!${JSON.stringify(motionEasings)}.includes(timing.easing)) __arya_uiError('unsupported motion easing.');
  if (!['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(timing.direction)) __arya_uiError('unsupported motion direction.');
  if (!['none', 'forwards', 'backwards', 'both'].includes(timing.fill)) __arya_uiError('unsupported motion fill.');
  if (!['load', 'hover', 'press', 'visible'].includes(timing.trigger)) __arya_uiError('motion trigger must be load, hover, press, or visible.');
  return timing;
};
const __arya_uiMotionSpec = (preset = 'rise', options = {}) => {
  if (typeof preset !== 'string' || !__arya_uiOwn(__arya_uiPresets, preset)) __arya_uiError('unknown motion preset. Use ui.presets() for the supported names.');
  return Object.freeze({[__arya_uiMotion]: true, preset, ...__arya_uiTiming(options)});
};
const __arya_uiKeyframes = (frames, options = {}) => {
  if (!Array.isArray(frames) || frames.length < 2 || frames.length > 32) __arya_uiError('keyframes expects 2–32 frame objects.');
  let previousOffset = 0;
  const safe = frames.map(frame => {
    __arya_uiOptions(frame, ['opacity', 'transform', 'filter', 'backgroundColor', 'color', 'borderRadius', 'boxShadow', 'letterSpacing', 'offset'], 'keyframe');
    const result = {};
    if (!Object.keys(frame).length) __arya_uiError('keyframes cannot be empty.');
    for (const [key, value] of Object.entries(frame)) {
      if (key === 'offset' || key === 'opacity') {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) __arya_uiError('keyframe ' + key + ' must be 0–1.');
        if (key === 'offset') { if (value < previousOffset) __arya_uiError('keyframe offsets must be ordered.'); previousOffset = value; }
      } else if (typeof value !== 'string' || value.length > 256 || /url\s*\(|expression\s*\(|[;{}<>]/i.test(value)) __arya_uiError('keyframe ' + key + ' must be a CSS value without URLs or declarations.');
      result[key] = value;
    }
    return Object.freeze(result);
  });
  return Object.freeze({[__arya_uiMotion]: true, frames: Object.freeze(safe), ...__arya_uiTiming(options)});
};
const __arya_uiTarget = value => {
  if (typeof value !== 'string' || !/^[A-Za-z][\w:-]{0,127}$/.test(value) || value.startsWith('arya-ui-')) __arya_uiError('target must be a component id, without #.');
  return value;
};
const __arya_uiGetMotion = value => {
  const motion = typeof value === 'string' ? __arya_uiMotionSpec(value) : value;
  if (!motion?.[__arya_uiMotion]) __arya_uiError('animation expects ui.motion, ui.keyframes, or a preset name.');
  return motion;
};
`;
