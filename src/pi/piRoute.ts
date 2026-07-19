export function isPiPage(search = window.location.search): boolean {
  return new URLSearchParams(search).get('pi') === '1'
}
