// Author: Kishore Kumar
// Opens a URL in the system browser even when running as a standalone PWA.
// Chrome PWA intercepts same-origin window.open() calls and opens them in a
// new PWA window instead of the browser. Constructing a full absolute URL and
// stripping `noopener` forces Chrome to hand off to the system browser.
export function openInBrowser(url: string): void {
  const absUrl = url.startsWith('http')
    ? url
    : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`

  const a = document.createElement('a')
  a.href = absUrl
  a.target = '_blank'
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
