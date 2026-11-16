// Author: Kishore Kumar
export function isIosDevice(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isMobileDevice(): boolean {
  return /Android/.test(navigator.userAgent) || isIosDevice()
}
