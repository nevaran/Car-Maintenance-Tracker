function isMobileDevice() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  const mobileAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const prefersTouch = window.matchMedia('(pointer: coarse)').matches;
  const narrowScreen = window.matchMedia('(max-width: 840px)').matches;

  return mobileAgent.test(userAgent) || prefersTouch || narrowScreen;
}

function loadDeviceStylesheet() {
  if (document.querySelector('link[data-device]')) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';

  if (isMobileDevice()) {
    link.href = 'styles.mobile.css';
    link.dataset.device = 'mobile';
  } else {
    link.href = 'styles.desktop.css';
    link.dataset.device = 'desktop';
  }

  document.head.appendChild(link);
}

loadDeviceStylesheet();
