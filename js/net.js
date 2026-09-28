// Fetching the word lists — the one network the game has after its own files.
//
// Every fetch REVALIDATES rather than re-downloads (`no-cache`: the browser asks
// whether its copy is still current, and a 304 costs next to nothing), so a
// return visit no longer pulls half a megabyte of lists down again. And every
// fetch gives up after `ms`, returning null, rather than hanging the start on a
// request that will never answer: a caller that has a cached copy carries on
// with it, and one that has nothing says so and tries again.

export async function fetchText(url, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: ctl.signal });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
