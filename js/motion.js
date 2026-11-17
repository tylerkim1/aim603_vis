// 움직임 설정. 시연을 위해 OS의 '동작 줄이기(애니메이션 효과 끄기)' 설정과 상관없이 항상 재생한다.
// 주소에 ?motion=off 를 붙일 때만 모든 움직임을 끈다.
const inBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

export const reducedMotion = inBrowser && new URLSearchParams(location.search).get('motion') === 'off';

// CSS는 이 클래스를 보고 애니메이션과 전환을 끈다
if (inBrowser) document.documentElement.classList.toggle('reduce-motion', reducedMotion);
