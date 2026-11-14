(() => {
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const themes = {
    rose: ['#fff7f9', '#652b48', '#cf4d85', '#ffffff'],
    ocean: ['#eff9fc', '#163f54', '#117da2', '#ffffff'],
    slate: ['#f5f6fa', '#252b3a', '#5767a6', '#ffffff'],
    sun: ['#fff8ed', '#563a22', '#b76525', '#ffffff']
  };

  function render(site) {
    const colors = themes[site.theme] || themes.rose;
    const details = (site.sections || []).map(section =>
      '<section class="section"><h2>' + escape(section.heading) + '</h2><p>' + escape(section.body) + '</p></section>'
    ).join('\n');
    const css = [
      ':root{color-scheme:light;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:' + colors[0] + ';color:' + colors[1] + '}',
      '*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}a{color:inherit}',
      '.top{max-width:1100px;margin:auto;padding:22px 24px;font-weight:800;letter-spacing:.03em}',
      '.hero{text-align:center;max-width:920px;margin:auto;padding:100px 24px 90px}',
      '.kicker{font-size:.85rem;letter-spacing:.15em;text-transform:uppercase;color:' + colors[2] + ';font-weight:800}',
      'h1{font-size:clamp(2.35rem,7vw,5.4rem);line-height:1.07;letter-spacing:-.045em;margin:18px auto 20px}',
      '.hero p{font-size:clamp(1.06rem,2vw,1.25rem);line-height:1.65;max-width:650px;margin:0 auto 32px}',
      '.cta{display:inline-block;background:' + colors[2] + ';color:white;text-decoration:none;padding:15px 27px;border-radius:50px;font-weight:750}',
      '.content{padding:36px 24px 95px;max-width:1100px;margin:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}',
      '.section{background:' + colors[3] + ';padding:34px;border-radius:24px;box-shadow:0 10px 36px #00000008}',
      'h2{font-size:clamp(1.3rem,3vw,1.8rem);margin:0 0 14px}p{line-height:1.7}.section p{margin:0}',
      'footer{text-align:center;padding:25px;font-size:.85rem;opacity:.7}',
      '@media(max-width:650px){.hero{padding:66px 20px}.content{grid-template-columns:1fr;padding:20px 18px 60px}.section{padding:24px}}'
    ].join('\n');
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="color-scheme" content="light"><title>' + escape(site.siteName) + '</title><style>' + css + '</style></head>' +
      '<body><header class="top">' + escape(site.siteName) + '</header>' +
      '<main><div class="hero"><div class="kicker">' + escape(site.siteName) + '</div><h1>' +
      escape(site.headline) + '</h1><p>' + escape(site.subheading) + '</p><a class="cta" href="#details">' +
      escape(site.ctaLabel || 'Learn more') + '</a></div><div class="content" id="details">' +
      details + '</div></main><footer>© ' + escape(site.siteName) + '</footer></body></html>';
  }

  function show(site, stack) {
    if (!site || !stack) return;
    const html = render(site);
    const wrap = document.createElement('section');
    wrap.className = 'website-preview';
    const title = document.createElement('strong');
    title.textContent = 'Your website draft';
    const note = document.createElement('p');
    note.textContent = 'A responsive static page. Not published, hosted, or connected to a domain.';
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Website draft preview');
    frame.setAttribute('sandbox', '');
    frame.setAttribute('loading', 'lazy');
    frame.srcdoc = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; img-src data:; base-uri &#39;none&#39;; form-action &#39;none&#39;">');
    const actions = document.createElement('div');
    actions.className = 'website-preview-actions';
    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = 'Save HTML website';
    download.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sparkle-website.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy HTML';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(html);
        copy.textContent = 'Copied ✓';
      } catch {
        copy.textContent = 'Copy unavailable';
      }
    });
    actions.append(download, copy);
    wrap.append(title, note, frame, actions);
    stack.append(wrap);
  }

  window.SparkleSiteDraft = Object.freeze({ render, show });
})();
