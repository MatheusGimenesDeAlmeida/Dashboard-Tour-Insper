"""Gera mock/index.html: o CSS de static/style.css mais os estilos da barra do simulador."""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
css = open(os.path.join(ROOT, "static", "style.css"), encoding="utf-8").read()

# static/style.css já traz os tokens de tema claro e escuro
css += """
/* simulador */
body { min-height: 100%; }
.simbar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 30; background: var(--sim-bg); color: var(--sim-fg); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 31; background: var(--sim-bg); }
.simbar-inner { max-width: 1400px; margin: auto; display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding-block: 8px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); font-size: 14px; }
.sim-label { display: flex; flex-direction: column; line-height: 1.2; }
.sim-label span { font-size: 12px; opacity: .7; }
.simbar .seg { background: color-mix(in srgb, var(--sim-fg) 12%, transparent); }
.simbar .seg button { background: transparent; color: var(--sim-fg); min-height: 32px; padding: 6px 12px; }
.simbar .seg button[aria-pressed=true] { background: var(--sim-fg); color: var(--sim-bg); }
.simbar select { width: auto; min-height: 36px; padding: 4px 12px; font-size: 14px; background: color-mix(in srgb, var(--sim-fg) 12%, transparent); color: var(--sim-fg); border: 0; border-radius: 10px; max-width: 100%; }
.simbar select option { color: #0E171D; }
.sim-clock { margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sim-clock .clock { font-variant-numeric: tabular-nums; font-weight: 600; margin-right: 4px; }
.sim-clock .clock small { color: var(--yellow); font-weight: 600; }
.simbar .btn { background: color-mix(in srgb, var(--sim-fg) 12%, transparent); color: var(--sim-fg); min-height: 34px; }
.simbar .btn:hover { background: color-mix(in srgb, var(--sim-fg) 22%, transparent); color: var(--sim-fg); }
@media (max-width: 860px) { .sim-clock { margin-left: 0; } .simbar { position: static; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
"""
html = f"""<title>Simulador de Tours Insper</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&display=swap" rel="stylesheet">
<style>
{css}
</style>
<div id="simbar" class="simbar" role="region" aria-label="Controles da simulação"></div>
<div id="view"><p class="wrap loading">Carregando a simulação…</p></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script src="backend.js"></script>
<script src="api.js"></script>
<script src="pages.js"></script>
<script src="shell.js"></script>
"""
open(os.path.join(ROOT, "mock", "index.html"), "w", encoding="utf-8").write(html)
print("ok", len(html))
