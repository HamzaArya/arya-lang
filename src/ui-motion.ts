/** One preset catalog for validation, browser playback, and the public gallery. */
export const motionPresets = {
  fade: [{opacity: 0}, {opacity: 1}],
  rise: [{opacity: 0, transform: 'translateY(18px)'}, {opacity: 1, transform: 'translateY(0)'}],
  slide: [{opacity: 0, transform: 'translateX(-24px)'}, {opacity: 1, transform: 'translateX(0)'}],
  scale: [{opacity: 0, transform: 'scale(.94)'}, {opacity: 1, transform: 'scale(1)'}],
  pulse: [{transform: 'scale(1)'}, {transform: 'scale(1.06)'}, {transform: 'scale(1)'}],
  drop: [{opacity: 0, transform: 'translateY(-24px)'}, {opacity: 1, transform: 'translateY(0)'}],
  'slide-right': [{opacity: 0, transform: 'translateX(24px)'}, {opacity: 1, transform: 'translateX(0)'}],
  'fade-out': [{opacity: 1}, {opacity: 0}],
  'zoom-out': [{opacity: 0, transform: 'scale(1.12)'}, {opacity: 1, transform: 'scale(1)'}],
  bounce: [{transform: 'translateY(0)'}, {transform: 'translateY(-20px)', offset: .4}, {transform: 'translateY(0)', offset: .7}, {transform: 'translateY(-7px)', offset: .85}, {transform: 'translateY(0)'}],
  shake: [{transform: 'translateX(0)'}, {transform: 'translateX(-8px)'}, {transform: 'translateX(8px)'}, {transform: 'translateX(-4px)'}, {transform: 'translateX(0)'}],
  flip: [{opacity: 0, transform: 'perspective(600px) rotateY(-65deg)'}, {opacity: 1, transform: 'perspective(600px) rotateY(0deg)'}],
  spin: [{transform: 'rotate(0deg)'}, {transform: 'rotate(360deg)'}],
  wiggle: [{transform: 'rotate(0deg)'}, {transform: 'rotate(-8deg)'}, {transform: 'rotate(8deg)'}, {transform: 'rotate(0deg)'}],
  blur: [{opacity: 0, filter: 'blur(10px)'}, {opacity: 1, filter: 'blur(0px)'}],
  float: [{transform: 'translateY(0)'}, {transform: 'translateY(-12px)'}, {transform: 'translateY(0)'}],
} as const;

export const motionEasings = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'smooth', 'snappy'] as const;
