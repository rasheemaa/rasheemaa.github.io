(() => {
  const rewrite = (value) => String(value || '')
    .replace(/Founding Member access/gi, 'Lifetime Access')
    .replace(/Founding access/gi, 'Lifetime Access')
    .replace(/Founding Members/gi, 'Lifetime Access customers')
    .replace(/Founding Member/gi, 'Lifetime Access');

  const apply = (root = document.body) => {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const next = rewrite(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    }
  };

  apply();

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const next = rewrite(mutation.target.nodeValue);
        if (next !== mutation.target.nodeValue) mutation.target.nodeValue = next;
        continue;
      }
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const next = rewrite(node.nodeValue);
          if (next !== node.nodeValue) node.nodeValue = next;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          apply(node);
        }
      });
    }
  });

  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
})();