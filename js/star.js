/**
 * Live GitHub star count on the nav button.
 *
 * An honest note on scope: no URL can star a repository. GitHub requires the
 * click to happen on their side by a signed-in user, because otherwise any page
 * could farm stars from whoever visited it. So this does the two things that
 * ARE possible — show the real current count, and put the visitor one click
 * from the control that works.
 *
 * Progressive enhancement throughout. The button is real markup in index.html
 * and works with this script blocked, offline, or rate limited; all this adds
 * is the number.
 *
 * The public API needs no token but allows 60 requests per hour per IP, so the
 * count is cached for an hour. Every failure path leaves the button as it was.
 */

const TTL_MS = 60 * 60 * 1000;

function cacheKey(repo) {
  return `gh-stars:${repo}`;
}

function readCache(repo) {
  try {
    const raw = localStorage.getItem(cacheKey(repo));
    if (!raw) return null;
    const { n, at } = JSON.parse(raw);
    return Date.now() - at < TTL_MS ? n : null;
  } catch {
    return null; // private window or blocked storage — not worth handling further
  }
}

function writeCache(repo, n) {
  try {
    localStorage.setItem(cacheKey(repo), JSON.stringify({ n, at: Date.now() }));
  } catch {
    /* a visitor who cannot cache still gets the button */
  }
}

function show(el, n) {
  const slot = el.querySelector('.btn__count');
  if (!slot) return;
  slot.textContent = n.toLocaleString();
  slot.hidden = false;
}

async function hydrate(el) {
  const repo = el.dataset.starRepo;
  if (!repo) return;

  const cached = readCache(repo);
  if (cached !== null) {
    show(el, cached);
    return;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`);
    if (!res.ok) return; // 403 means rate limited; the button still works
    const data = await res.json();
    if (typeof data.stargazers_count !== 'number') return;
    writeCache(repo, data.stargazers_count);
    show(el, data.stargazers_count);
  } catch {
    /* offline — leave the button exactly as the HTML rendered it */
  }
}

document.querySelectorAll('[data-star-repo]').forEach(hydrate);
