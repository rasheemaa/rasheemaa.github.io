from pathlib import Path
import re,json
root=Path('.')
changed=[]
for p in [Path('index.html'),Path('_layouts/post.html'),Path('shop/index.html'),*Path('shop').glob('*.html'),Path('thank-you/index.html')]:
 s=p.read_text(); n=re.sub(r'{% comment %}.*?{% endcomment %}\s*','',s,flags=re.S)
 if n!=s:p.write_text(n);changed.append(str(p))
# Use editorial presentation in legal documents, leaving all policy text intact.
for p in [Path('what-do-i-say/privacy.html'),Path('what-do-i-say/terms.html'),Path('what-do-i-say/refunds.html')]:
 s=p.read_text();s=re.sub(r'<style>.*?</style>','<meta name="theme-color" content="#FAF5F0"><link rel="stylesheet" href="/assets/css/tool-editorial.css?v=1">',s,flags=re.S);p.write_text(s)
# Tool interface keeps its own functional layout, with the shared palette and type applied last.
for p in [Path('what-do-i-say/index.html'),Path('what-do-i-say/voice-beta/index.html'),Path('what-do-i-say/voice-quality-lab/index.html'),Path('what-do-i-say/voice-quality-lab/app/index.html')]:
 s=p.read_text()
 s=re.sub(r'(<meta name="theme-color" content=")[^"]+',r'\g<1>#FAF5F0',s)
 if '/assets/css/tool-editorial.css' not in s:s=s.replace('</head>','<link rel="stylesheet" href="/assets/css/tool-editorial.css?v=1">\n</head>')
 s=s.replace("style-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com").replace("font-src 'self'", "font-src 'self' https://fonts.gstatic.com")
 p.write_text(s)
# Standardize signatures only, not the surrounding essays.
for p in list(Path('_edits').glob('*.md'))+[Path('index.html')]:
 s=p.read_text();s=re.sub(r'(?im)(?:xo[,\s]+|with love[,\s]+|love[,\s]+)sheema\b','With Love, Sheema',s);p.write_text(s)
# Remove decorative navigation glyphs, preserving all destinations and stories.
for p in [Path('index.html'),Path('_layouts/post.html'),Path('about.html')]:
 s=p.read_text().replace('Sparkle ✨','Sparkle').replace('Meet Sheema ♡','Meet Sheema').replace('✧ You found','You found')
 if p.name=='index.html':
  s=s.replace('Touch grass ✦ See your people ✦ Recharge when you need ✦ The Sheema Edit ✦','Touch grass · See your people · Recharge when you need · The Sheema Edit')
 p.write_text(s)
# Retired entrypoints remain harmless compatibility shims, not competing designs.
for p in [Path('assets/css/styles.css'),Path('assets/css/app-polish.css')]:
 p.write_text('/* Compatibility entrypoint. All presentation lives in editorial.css. */\n@import url("/assets/css/editorial.css?v=1");\n')
Path('assets/css/home-y2k.css').write_text('/* Retired. Homepage uses home-editorial.css. */\n')
# Legal layout reads well without inheriting the chat container geometry.
p=Path('assets/css/tool-editorial.css');s=p.read_text();s+='\n.wrap article{line-height:1.8}.wrap h2{line-height:1.2}.wrap h1{line-height:1.1}\n';p.write_text(s)
# Local tool installation colors.
p=Path('what-do-i-say/manifest.webmanifest');s=p.read_text();s=re.sub(r'("(?:theme_color|background_color)"\s*:\s*")[^"]+',r'\g<1>#FAF5F0',s);p.write_text(s)
