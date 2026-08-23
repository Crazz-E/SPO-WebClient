#!/usr/bin/env python3
"""Generate the flow artboards (T1 Construire, T3 Raccorder un fournisseur) for the
option-C design system. Run from this directory: `python3 gen.py`. Writes *.dc.html + canvas.json.
Every value is lifted from src/client/styles/design-tokens.css; no data is fetched."""
import json

NB = ' '  # narrow no-break space for number groups

# ---------- tokens
GOLD, GOLD_D, GOLD_L = '#D4A853', '#B8912E', '#E8C77B'
BG0, BG1, BG2, BG3 = '#0C0D10', '#141618', '#1C1E22', '#24272C'
T0, T1, T2, T3, T4 = '#F0F0F2', '#C4C8D0', '#9CA1AC', '#7D8492', '#565D68'
GREEN, POS, NEG, ERR, WARN = '#10B981', '#4ADE80', '#F87171', '#EF4444', '#F59E0B'
BORDER, BORDER_A = 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.12)'
GLASS = 'rgba(20,22,24,0.88)'
FONT = "'Inter', sans-serif"
MONO = "'JetBrains Mono', monospace"

# ---------- icons (lucide-like, stroke)
def ic(path, size=20, color='currentColor', sw=2):
    return (f'<svg aria-hidden="true" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">{path}</svg>')
P = {
 'hammer': '<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"></path><path d="m18 15 4-4"></path><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"></path>',
 'map': '<path d="M14.1 6.1 9.9 4 3.6 6.1a1 1 0 0 0-.6.9v12l6.9-2.3 4.2 2.1 6.3-2.1a1 1 0 0 0 .6-.9V4z"></path><path d="M15 5.8v15"></path><path d="M9 4v15"></path>',
 'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
 'landmark': '<path d="M3 22h18"></path><path d="M6 18v-7"></path><path d="M10 18v-7"></path><path d="M14 18v-7"></path><path d="M18 18v-7"></path><path d="m3 9 9-7 9 7z"></path>',
 'mail': '<rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>',
 'more': '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>',
 'search': '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
 'x': '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
 'chev': '<path d="m9 18 6-6-6-6"></path>',
 'chevd': '<path d="m6 9 6 6 6-6"></path>',
 'back': '<path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path>',
 'plus': '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
 'minus': '<path d="M5 12h14"></path>',
 'rotate': '<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>',
 'check': '<path d="M20 6 9 17l-5-5"></path>',
 'pin': '<path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>',
 'factory': '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"></path>',
 'home': '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><path d="M9 22V12h6v10"></path>',
 'store': '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"></path><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"></path><path d="M2 7h20"></path>',
 'briefcase': '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path><rect width="20" height="14" x="2" y="6" rx="2"></rect>',
 'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>',
 'tree': '<path d="M17 14h-2.5"></path><path d="m8 8 4-6 4 6"></path><path d="m6 14 6-10 6 10"></path><path d="M12 22v-8"></path>',
 'lock': '<rect width="18" height="11" x="3" y="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
 'warn': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
 'info': '<circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path>',
 'refresh': '<path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>',
 'crosshair': '<circle cx="12" cy="12" r="10"></circle><path d="M22 12h-4"></path><path d="M6 12H2"></path><path d="M12 6V2"></path><path d="M12 22v-4"></path>',
 'spin': '<path d="M21 12a9 9 0 1 1-6.2-8.6"></path>',
}

def kbd(t): return f'<kbd style="font: 500 11px {MONO}; color: {T3}; border: 1px solid {BORDER_A}; border-radius: 4px; padding: 0 4px;">{t}</kbd>'
def chevron(color=T3, size=16): return ic(P['chev'], size, color)
def money(v): return f'${NB}{v}'

def icon_btn(icon, label, size=32, active=False, ghost=True, color=T1):
    bg = f'rgba(212,168,83,0.1)' if active else ('transparent' if ghost else BG2)
    bd = GOLD_D if active else ('transparent' if ghost else BORDER)
    col = GOLD if active else color
    return (f'<button style="width: {size}px; height: {size}px; display: inline-flex; align-items: center; justify-content: center; '
            f'background: {bg}; border: 1px solid {bd}; border-radius: 8px; color: {col}; cursor: pointer;" title="{label}" aria-label="{label}">'
            f'{ic(P[icon], 18 if size <= 36 else 20)}</button>')

def btn(label, kind='secondary', h=36, extra=''):
    st = {
        'primary': f'background: {GOLD}; border: 1px solid {GOLD_D}; color: {BG0}; font: 600 13px {FONT};',
        'secondary': f'background: {BG2}; border: 1px solid {BORDER}; color: {T0}; font: 500 13px {FONT};',
        'ghost': f'background: transparent; border: 1px solid transparent; color: {T1}; font: 500 13px {FONT};',
        'outline': f'background: transparent; border: 1px solid {BORDER_A}; color: {T0}; font: 500 13px {FONT};',
        'danger': f'background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.4); color: {NEG}; font: 600 13px {FONT};',
        'disabled': f'background: {GOLD}; border: 1px solid {GOLD_D}; color: {BG0}; font: 600 13px {FONT}; opacity: 0.4; cursor: not-allowed;',
    }[kind]
    return f'<button style="height: {h}px; padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; border-radius: 8px; cursor: pointer; white-space: nowrap; flex-shrink: 0; {st} {extra}">{label}</button>'

def chip(label, active=False, h=32):
    if active:
        return f'<span style="height: {h}px; padding: 0 10px; display: inline-flex; align-items: center; background: rgba(212,168,83,0.1); border: 1px solid {GOLD_D}; border-radius: 9999px; color: {GOLD}; font: 600 12px {FONT}; white-space: nowrap;">{label}</span>'
    return f'<button style="height: {h}px; padding: 0 10px; background: transparent; border: 1px solid {BORDER}; border-radius: 9999px; color: {T2}; font: 500 12px {FONT}; cursor: pointer; white-space: nowrap;">{label}</button>'

def status_pill_tag(text, color, bg):
    return f'<span style="display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 8px; border-radius: 9999px; background: {bg}; color: {color}; font-size: 11px; font-weight: 600; white-space: nowrap;"><span style="width: 6px; height: 6px; border-radius: 9999px; background: {color};"></span>{text}</span>'

# ---------- page scaffolding
def page(body, w=1440, h=900, map_bg=True, extra_style=''):
    bg = (f'background-color: #17211c; background-image: repeating-linear-gradient(60deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 44px), '
          f'repeating-linear-gradient(-60deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 44px), radial-gradient(ellipse at 40% 50%, rgba(212,168,83,0.06), transparent 60%);') if map_bg else f'background: {BG0};'
    return f'''<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;family=JetBrains+Mono:wght@500;700&amp;display=swap">
  <style>
    body {{ margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: {T0}; background: {BG0}; }}
    a {{ color: {GOLD}; }} a:hover {{ color: {GOLD_L}; }}
    * {{ box-sizing: border-box; }}
  </style>
</helmet>
<div style="position: relative; width: {w}px; height: {h}px; overflow: hidden; {bg} {extra_style}">
{body}
</div>
</x-dc>
<script data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''

def blocks(items):
    """items: list of (left, top, w, h, kind) kind in own|other|ghost|selected|invalid"""
    out = []
    for l, t, w, h, k in items:
        if k == 'own': st = f'background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25);'
        elif k == 'other': st = f'background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);'
        elif k == 'ghost': st = f'background: rgba(212,168,83,0.18); border: 2px dashed {GOLD};'
        elif k == 'invalid': st = f'background: rgba(239,68,68,0.18); border: 2px dashed {ERR};'
        elif k == 'selected': st = f'background: rgba(16,185,129,0.12); border: 2px solid {GOLD}; box-shadow: 0 0 12px rgba(212,168,83,0.4);'
        out.append(f'<div style="position: absolute; left: {l}px; top: {t}px; width: {w}px; height: {h}px; {st} transform: skewX(-30deg) rotate(15deg);"></div>')
    return '\n'.join(out)

CITY = [(520, 330, 120, 70, 'other'), (700, 420, 90, 90, 'own'), (420, 480, 140, 60, 'other'), (640, 560, 80, 110, 'other'), (300, 400, 70, 70, 'other'), (820, 300, 100, 60, 'own')]

def status_pill(mobile=False, debt=False):
    if mobile:
        return (f'<div style="position: absolute; top: 12px; left: 12px; right: 12px; height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 12px; background: {GLASS}; border: 1px solid {BORDER}; border-radius: 9999px; z-index: 350;">'
                f'<span style="font: 700 15px {MONO}; color: {GOLD}; font-variant-numeric: tabular-nums;">{money("12"+NB+"480"+NB+"300")}</span>'
                f'<span style="color: {POS}; font-size: 12px; font-variant-numeric: tabular-nums;">+{money("184"+NB+"k")}/h</span><span style="flex: 1;"></span>'
                f'<span style="display: inline-flex; padding: 1px 7px; border: 1px solid {GOLD_D}; border-radius: 9999px; background: rgba(212,168,83,0.1); color: {GOLD}; font: 700 11px {MONO};">#12</span></div>')
    return (f'<div style="position: absolute; top: 12px; left: 0; right: 504px; margin: 0 auto; width: max-content; display: flex; align-items: center; gap: 14px; height: 40px; padding: 0 16px; background: {GLASS}; border: 1px solid {BORDER}; border-radius: 9999px; z-index: 350;">'
            f'<span style="color: {GOLD}; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">Planitia</span>'
            f'<span style="color: {T3}; font-size: 12px; font-variant-numeric: tabular-nums;">12 mars 2334</span>'
            f'<span style="width: 1px; height: 18px; background: {BORDER_A};"></span>'
            f'<span style="font: 700 16px {MONO}; color: {GOLD}; font-variant-numeric: tabular-nums;">{money("12"+NB+"480"+NB+"300")}</span>'
            f'<span style="color: {POS}; font-size: 12px; font-variant-numeric: tabular-nums;">+{money("184"+NB+"200")} / h</span>'
            f'<span style="width: 1px; height: 18px; background: {BORDER_A};"></span>'
                        f'<span style="display: inline-flex; align-items: center; gap: 6px;"><span style="display: inline-flex; padding: 1px 7px; border: 1px solid {GOLD_D}; border-radius: 9999px; background: rgba(212,168,83,0.1); color: {GOLD}; font: 700 11px {MONO};">#12</span><span style="color: {T0}; font-size: 13px; font-weight: 500;">SPO_test3</span><span style="color: {GOLD}; font-size: 11px;">Maire</span></span></div>')

TILES = [('hammer', 'Construire', 'B'), ('map', 'Carte', 'M'), ('user', 'Empire', 'E'), ('landmark', 'Politique', 'P'), ('mail', 'Courrier', 'L'), ('more', 'Plus', '')]

def tiles(active=None, mobile=False):
    out = []
    items = TILES[:5] if mobile else TILES
    for icon, label, key in items:
        act = (label == active)
        st = (f'background: rgba(212,168,83,0.1); border: 1px solid {GOLD_D}; color: {GOLD};' if act else f'background: transparent; border: 1px solid transparent; color: {T1};')
        badge = f'<span style="position: absolute; top: 6px; right: 10px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 9999px; background: {ERR}; color: #fff; font: 700 11px {FONT}; display: inline-flex; align-items: center; justify-content: center;">3</span>' if label == 'Courrier' else ''
        k = f' <kbd style="font: 500 11px {MONO}; color: {T3};">{key}</kbd>' if key and not mobile else ''
        out.append(f'<button style="position: relative; height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border-radius: 8px; cursor: pointer; font: 500 11px {FONT}; {st}">{ic(P[icon])}{label}{k}{badge}</button>')
    cols = 5 if mobile else 6
    return (f'<div style="display: grid; grid-template-columns: repeat({cols}, minmax(0, 1fr)); gap: 6px; padding: 6px; background: {GLASS}; border: 1px solid {BORDER}; border-radius: 12px;">' + ''.join(out) + '</div>')

def search_row(mobile=False):
    h = 44
    hint = '' if mobile else f'<span style="margin-left: auto; display: inline-flex; gap: 4px;">{kbd("Ctrl")}{kbd("K")}</span>'
    txt = 'Rechercher ou commander…' if mobile else 'Rechercher mes bâtiments, un joueur, une ville — ou une commande…'
    return (f'<div style="display: flex; align-items: center; gap: 10px; height: {h}px; padding: 0 14px; background: {GLASS}; border: 1px solid {BORDER}; border-radius: 12px; color: {T4}; font-size: 13px;">'
            f'{ic(P["search"], 16, T2)}{txt}{hint}</div>')

def mode_row(kind, title, cost=None, after=None, hint='', actions='', mobile=False):
    h = 52 if mobile else 48
    return (f'<div style="display: flex; align-items: center; gap: 10px; height: {h}px; padding: 0 8px 0 10px; background: rgba(20,22,24,0.92); border: 1px solid {GOLD_D}; border-radius: 12px; box-shadow: 0 0 12px rgba(212,168,83,0.2);">'
            + ('' if mobile else icon_btn('search', 'Rechercher ou commander', 32, False, False, T2))
            + f'<span style="width: 8px; height: 8px; border-radius: 9999px; background: {GOLD}; flex-shrink: 0;"></span>'
            + ('' if mobile else f'<span style="font-size: 12px; font-weight: 600; color: {GOLD}; letter-spacing: 0.04em; text-transform: uppercase;">{kind}</span>')
            + (f'<div style="display: flex; flex-direction: column; min-width: 0;"><span style="font-size: 13px; font-weight: 600; color: {T0}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{title}</span>' + (f'<span style="font: 700 11px {MONO}; color: {GOLD};">{cost}</span>' if cost else '') + '</div>' if mobile else
               f'<span style="font-size: 14px; font-weight: 500; color: {T0}; white-space: nowrap;">{title}</span>' + (f'<span style="font: 700 12px {MONO}; color: {GOLD};">{cost}</span>' if cost else '') + (f'<span style="font-size: 12px; color: {T2}; white-space: nowrap;">après : <span style="color: {POS};">{after}</span></span>' if after else '') + (f'<span style="flex: 1; min-width: 0; font-size: 12px; color: {T2}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{hint}</span>' if hint else ''))
            + '<span style="flex: 1;"></span>' + actions + '</div>')

def command_bar(mode=None, active_tile=None, mobile=False):
    top = mode if mode else search_row(mobile)
    if mobile:
        return f'<div style="position: absolute; left: 8px; right: 8px; bottom: 8px; display: flex; flex-direction: column; gap: 6px; z-index: 350;">{top}{tiles(active_tile, True)}</div>'
    return f'<div style="position: absolute; bottom: 16px; left: 16px; width: 904px; display: flex; flex-direction: column; gap: 8px; z-index: 350;">{top}{tiles(active_tile)}</div>'

def zoom(mobile=False):
    if mobile:
        return (f'<div style="position: absolute; right: 12px; bottom: 150px; display: flex; flex-direction: column; gap: 2px; padding: 4px; background: {GLASS}; border: 1px solid {BORDER}; border-radius: 8px; z-index: 200;">'
                f'{icon_btn("plus","Zoom avant",44)}{icon_btn("minus","Zoom arrière",44)}</div>')
    return (f'<div style="position: absolute; right: 504px; bottom: 150px; display: flex; flex-direction: column; gap: 2px; padding: 4px; background: {GLASS}; border: 1px solid {BORDER}; border-radius: 8px; z-index: 200;">'
            f'{icon_btn("plus","Zoom avant",40)}{icon_btn("minus","Zoom arrière",40)}</div>')

def chat_pill():
    return (f'<button style="position: absolute; left: 16px; bottom: 150px; height: 40px; padding: 0 14px; display: inline-flex; align-items: center; gap: 8px; background: {GLASS}; border: 1px solid {BORDER}; border-radius: 9999px; color: {T1}; font: 500 12px {FONT}; cursor: pointer; z-index: 200;">'
            + ic('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>', 16) + 'Général · 14</button>')

def sheet(chips, header, body, footer, collapsed_mid=False, pin=True):
    """desktop sheet: right 16, top 64, bottom 16, width 472"""
    cs = []
    for i, (label, active) in enumerate(chips):
        if i: cs.append(ic(P['chev'], 12, '#3A3F48'))
        cs.append(chip(label, active))
    head = (f'<div style="display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid {BORDER}; overflow: hidden;">'
            + ''.join(cs) + '<span style="flex: 1;"></span>' + (icon_btn('pin', 'Épingler la feuille') if pin else '') + icon_btn('x', 'Fermer') + '</div>')
    foot = f'<div style="margin-top: auto; padding: 12px 16px; border-top: 1px solid {BORDER}; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: {BG1};">{footer}</div>' if footer else ''
    return (f'<aside style="position: absolute; top: 64px; right: 16px; bottom: 16px; width: 472px; background: {BG1}; border: 1px solid {BORDER}; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; z-index: 400;">'
            f'{head}{header}<div style="flex: 1; min-height: 0; overflow: hidden; position: relative; display: flex; flex-direction: column;">{body}</div>{foot}</aside>')

def fade():
    return f'<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 40px; background: linear-gradient(to bottom, rgba(20,22,24,0), {BG1}); pointer-events: none;"></div>'

def filter_field(placeholder, value=None, count=None, w='100%', h=36, focused=False):
    bd = GOLD if focused else BORDER
    inner = (f'<span style="color: {T0};">{value}</span>' if value else f'<span style="color: {T4};">{placeholder}</span>')
    cnt = f'<span style="margin-left: auto; font-size: 11px; color: {T3};">{count}</span>' if count else f'<span style="margin-left: auto;">{kbd("/")}</span>'
    return (f'<div style="width: {w}; height: {h}px; padding: 0 10px; display: flex; align-items: center; gap: 8px; background: {BG0}; border: 1px solid {bd}; border-radius: 8px; font-size: 13px;">'
            f'{ic(P["search"], 14, T2)}{inner}{cnt}</div>')

def row(cols, h=40, focused=False, bg=None, font=12, grid='1fr 32px'):
    st = f' background: {BG2}; outline: 2px solid {GOLD}; outline-offset: -2px;' if focused else (f' background: {bg};' if bg else '')
    return (f'<div role="button" tabindex="0" style="display: grid; grid-template-columns: {grid}; align-items: center; gap: 8px; height: {h}px; padding: 0 12px; font-size: {font}px; color: {T1}; border-top: 1px solid rgba(255,255,255,0.04); cursor: pointer; font-variant-numeric: tabular-nums;{st}">'
            + ''.join(cols) + '</div>')

def toast(kind, strong, text, action=None):
    col = {'ok': (POS, '#22C55E', P['check']), 'warn': (WARN, WARN, P['warn']), 'err': (NEG, ERR, P['info'])}[kind]
    act = f'<button style="margin-left: auto; height: 28px; padding: 0 8px; background: transparent; border: 0; color: {GOLD}; font: 600 12px {FONT}; cursor: pointer;">{action}</button>' if action else ''
    return (f'<div role="status" style="display: flex; align-items: center; gap: 10px; width: 360px; padding: 10px 12px; background: {BG2}; border: 1px solid {BORDER}; border-left: 3px solid {col[1]}; border-radius: 8px; font-size: 12px; color: {T0}; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3);">'
            f'{ic(col[2], 16, col[0])}<span><strong>{strong}</strong> — {text}</span>{act}</div>')

def dialog(title, text, rows=None, primary=('Construire', 'primary'), secondary='Annuler', danger=False, extra=''):
    rws = ''
    if rows:
        cells = ''.join(f'<span style="color: {T3};">{k}</span><span style="text-align: right; font: {"700" if i == 0 else "500"} 13px {MONO}; color: {c};">{v}</span>' for i, (k, v, c) in enumerate(rows))
        rws = f'<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px 12px; background: {BG0}; border-radius: 8px; font-size: 12px;">{cells}</div>'
    bd = 'rgba(239,68,68,0.4)' if danger else BORDER_A
    return (f'<div style="position: absolute; inset: 0; background: rgba(0,0,0,0.5); z-index: 499;"></div>'
            f'<div role="dialog" aria-modal="true" aria-labelledby="dlg-t" style="position: absolute; left: 0; right: 504px; top: 0; bottom: 0; margin: auto; width: 420px; height: max-content; display: flex; flex-direction: column; gap: 12px; padding: 20px; background: {BG1}; border: 1px solid {bd}; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); z-index: 500;">'
            f'<div style="display: flex; flex-direction: column; gap: 4px;"><h3 id="dlg-t" style="margin: 0; font-size: 16px; font-weight: 600;">{title}</h3><p style="margin: 0; font-size: 13px; color: {T1};">{text}</p></div>'
            f'{rws}{extra}<div style="display: flex; justify-content: flex-end; gap: 8px;">{btn(secondary, "ghost")}{btn(primary[0], primary[1], extra="outline: 2px solid " + GOLD + "; outline-offset: 2px;")}</div></div>')

def note_box(text, top=80, left=24, w=420):
    return (f'<div style="position: absolute; top: {top}px; left: {left}px; width: {w}px; padding: 10px 12px; background: rgba(12,13,16,0.85); border: 1px dashed {GOLD_D}; border-radius: 8px; font-size: 12px; color: {T1}; line-height: 1.5; z-index: 600;">'
            f'<strong style="color: {GOLD};">Note </strong>{text}</div>')

def phone(body, w=390, h=780, left=0):
    return (f'<div style="position: absolute; left: {left}px; top: 0; width: {w}px; height: {h}px; overflow: hidden; border-radius: 24px; border: 1px solid {BORDER_A}; '
            f'background-color: #17211c; background-image: repeating-linear-gradient(60deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 36px), repeating-linear-gradient(-60deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 36px);">{body}</div>')

def msheet(chips, header, body, footer, height=470):
    cs = []
    for i, (label, active) in enumerate(chips):
        if i: cs.append(ic(P['chev'], 12, '#3A3F48'))
        cs.append(chip(label, active, 44 if active else 44))
    return (f'<div style="position: absolute; left: 0; right: 0; bottom: 0; height: {height}px; display: flex; flex-direction: column; background: {BG1}; border: 1px solid {BORDER}; border-bottom: 0; border-radius: 12px 12px 0 0; box-shadow: 0 -10px 25px rgba(0,0,0,0.3); z-index: 400;">'
            f'<div style="display: flex; justify-content: center; padding: 8px 0 4px;"><span style="width: 36px; height: 4px; border-radius: 9999px; background: rgba(255,255,255,0.2);"></span></div>'
            f'<div style="display: flex; align-items: center; gap: 6px; padding: 4px 12px 10px; border-bottom: 1px solid {BORDER}; overflow: hidden;">' + ''.join(cs) + f'<span style="flex: 1;"></span>{icon_btn("x","Fermer",44)}</div>'
            f'{header}<div style="flex: 1; min-height: 0; overflow: hidden; position: relative; display: flex; flex-direction: column;">{body}</div>'
            + (f'<div style="padding: 10px 12px 12px; border-top: 1px solid {BORDER}; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: {BG1};">{footer}</div>' if footer else '') + '</div>')

# ======================================================================
# T1 — CONSTRUIRE
# ======================================================================
CATS = [('home', 'Résidentiel', 6), ('factory', 'Industrie', 14), ('store', 'Commerce', 9), ('briefcase', 'Services', 7), ('landmark', 'Public', 5), ('tree', 'Agriculture', 4)]

def t1_1():
    cards = ''.join(
        f'<button style="display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px; background: {BG2}; border: 1px solid {BORDER}; border-radius: 8px; color: {T0}; cursor: pointer; text-align: left;">'
        f'<span style="color: {GOLD};">{ic(P[i], 22)}</span><span style="font: 600 13px {FONT};">{n}</span><span style="font-size: 11px; color: {T3};">{c} bâtiments</span></button>'
        for i, n, c in CATS)
    header = f'<div style="padding: 12px 16px 8px; display: flex; flex-direction: column; gap: 8px;"><h2 style="margin: 0; font-size: 18px; font-weight: 600;">Construire</h2>{filter_field("Filtrer les bâtiments par nom…")}</div>'
    body = (f'<div style="padding: 4px 16px 16px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">{cards}</div>'
            f'<div style="padding: 0 16px; font-size: 12px; color: {T3};">Les catégories sont chargées à l\'ouverture (1 requête), la liste d\'une catégorie au clic (1 requête), puis <strong style="color: {T1};">gardées pour la session</strong> — le menu n\'est plus redemandé à chaque ouverture.</div>')
    footer = f'<span style="font-size: 12px; color: {T3};">Niveau Entrepreneur · 14 / 50 bâtiments</span>{btn("Fermer", "ghost")}'
    return page(blocks(CITY) + status_pill() + command_bar(None, 'Construire') + zoom() + chat_pill() + sheet([('Construire', True)], header, body, footer, pin=False)
                + note_box('T1-1 · Clic sur la tuile Construire (ou B) : la feuille s\'ouvre sur les catégories. La carte reste cliquable. Une requête, puis cache de session.', 70))

FACS = [('Usine textile', money('240'+NB+'000'), '12 × 12', 'Industrielle', None), ('Scierie', money('180'+NB+'000'), '10 × 10', 'Industrielle', None), ('Aciérie', money('620'+NB+'000'), '16 × 16', 'Industrielle', None), ('Usine chimique', money('410'+NB+'000'), '12 × 14', 'Industrielle', None), ('Raffinerie', money('1'+NB+'200'+NB+'000'), '18 × 18', 'Industrielle', 'Niveau Magnat'), ('Usine de composants', money('380'+NB+'000'), '12 × 12', 'Industrielle', None), ('Papeterie', money('290'+NB+'000'), '12 × 12', 'Industrielle', None)]

def t1_2():
    rows = []
    for i, (n, c, fp, z, lock) in enumerate(FACS):
        sel = (i == 0)
        name = f'<span style="display: inline-flex; align-items: center; gap: 8px; color: {T3 if lock else T0}; font-weight: 500;">{ic(P["lock"], 14, T3) if lock else ""}{n}</span>'
        cost = f'<span style="font: 500 12px {MONO}; color: {T3 if lock else GOLD};">{c}</span>'
        meta = f'<span style="color: {T3};">{lock if lock else fp}</span>'
        rows.append(row([name, cost, meta, f'<span style="display: inline-flex; justify-content: flex-end;">{chevron()}</span>'], 40, focused=sel, grid='1.6fr 1fr 1fr 24px'))
    header = (f'<div style="padding: 12px 16px 8px; display: flex; flex-direction: column; gap: 8px;"><div style="display: flex; align-items: center; gap: 8px;">{icon_btn("back","Retour aux catégories")}<h2 style="margin: 0; font-size: 18px; font-weight: 600;">Industrie</h2><span style="font-size: 12px; color: {T3};">14 bâtiments</span></div>{filter_field("Filtrer Industrie…")}</div>')
    detail = (f'<div style="margin-top: auto; padding: 12px 16px; border-top: 1px solid {BORDER}; display: flex; flex-direction: column; gap: 8px; background: {BG2};">'
              f'<div style="display: flex; align-items: center; justify-content: space-between;"><span style="font-size: 15px; font-weight: 600;">Usine textile</span><span style="font: 700 15px {MONO}; color: {GOLD};">{money("240"+NB+"000")}</span></div>'
              f'<p style="margin: 0; font-size: 12px; color: {T1}; line-height: 1.5;">Transforme le coton et les produits chimiques en tissus. 12 × 12 tuiles, zone industrielle.</p>'
              f'<div style="display: flex; gap: 12px; font-size: 12px; color: {T2};"><span>Trésorerie après : <span style="color: {POS}; font-family: {MONO}; font-weight: 700;">{money("12"+NB+"240"+NB+"300")}</span></span></div></div>')
    body = ''.join(rows) + detail
    footer = f'<span style="font-size: 12px; color: {T3};">Sélection : Usine textile</span><div style="display: flex; gap: 8px;">{btn("Placer sur la carte", "primary")}</div>'
    return page(blocks(CITY) + status_pill() + command_bar(None, 'Construire') + zoom() + chat_pill() + sheet([('Construire', False), ('Industrie', True)], header, body, footer, pin=False)
                + note_box('T1-2 · Catégorie ouverte : lignes compactes, filtre, verrouillé = cadenas + raison. La sélection montre coût, <em>trésorerie après</em>, entrées. « Placer » démarre le mode.', 70))

def mini_card():
    return (f'<aside style="position: absolute; top: 64px; right: 16px; width: 300px; background: {BG1}; border: 1px solid {BORDER}; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; z-index: 400;">'
            f'<div style="display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-bottom: 1px solid {BORDER};">{chip("Construire")}{ic(P["chev"],12,"#3A3F48")}{chip("Industrie", True)}<span style="flex: 1;"></span>{icon_btn("x","Fermer")}</div>'
            f'<div style="padding: 12px; display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: {T1};"><div style="display: flex; align-items: center; justify-content: space-between;"><span style="font-weight: 600; color: {T0};">Usine textile</span><span style="font: 700 12px {MONO}; color: {GOLD};">{money("240"+NB+"000")}</span></div>'
            f'<div style="display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: {BG2}; border-radius: 8px;">{ic(P["info"],14,T2)}<span style="color: {T2};">Le calque <strong style="color: {T1};">Zones</strong> est affiché pendant le placement ; votre calque précédent revient à la fin.</span></div>'
            f'<div style="display: flex; gap: 6px; flex-wrap: wrap;">{chip("Scierie")}{chip("Aciérie")}{chip("Usine chimique")}</div></div></aside>')


def t1_3(valid=True):
    ghost = blocks([(560, 230, 96, 96, 'ghost' if valid else 'invalid')])
    actions = btn(f'Tourner la vue {kbd("R")}', 'secondary', 32) + btn(f'Terminer {kbd("Échap")}', 'outline', 32)
    hint = 'Cliquez sur la carte pour poser' if valid else '<span style="color: ' + NEG + ';">Hors zone industrielle</span>'
    mode = mode_row('Placement', 'Usine textile', money('240'+NB+'000'), money('12'+NB+'240'+NB+'300') if valid else None, hint, actions)
    mini = mini_card()
    n = 'T1-3 · Mode placement : la ligne de recherche devient la barre de mode (coût, trésorerie après, Tourner la vue, Terminer). La feuille se réduit pour laisser la carte ; le calque Zones est annoncé, pas imposé en silence.' if valid else 'T1-3b · Fantôme invalide : bordure erreur + raison dans la barre. Aucun clic ne part au serveur tant que la pose est invalide.'
    return page(blocks(CITY) + ghost + status_pill() + command_bar(mode, 'Construire') + zoom() + chat_pill() + mini + note_box(n, 70))

def t1_4():
    dlg = dialog('Construire une Usine textile ?', 'À Helartia, 12 × 12 tuiles, zone industrielle.',
                 [('Coût', money('240'+NB+'000'), GOLD), ('Trésorerie après', money('12'+NB+'240'+NB+'300'), POS)],
                 extra=f'<label style="display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: {T1}; cursor: pointer;"><span style="width: 18px; height: 18px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);"></span>Ne plus demander pour les constructions de cette session</label>')
    mode = mode_row('Placement', 'Usine textile', money('240'+NB+'000'), money('12'+NB+'240'+NB+'300'), '', btn(f'Tourner la vue {kbd("R")}', 'secondary', 32) + btn(f'Terminer {kbd("Échap")}', 'outline', 32))
    return page(blocks(CITY) + blocks([(560, 230, 96, 96, 'ghost')]) + status_pill() + command_bar(mode, 'Construire') + zoom() + chat_pill() + mini_card() + dlg
                + note_box('T1-4 · Clic sur la carte : confirmation (dépense). Focus initial sur « Construire », Échap = Annuler. Le dialogue est la seule surface au-dessus de la feuille.', 70))

def t1_5():
    mode = mode_row('Placement', 'Usine textile', money('240'+NB+'000'), money('12'+NB+'000'+NB+'300'), '<span style="color: ' + POS + ';">Posée</span> · encore une ?', btn(f'Tourner la vue {kbd("R")}', 'secondary', 32) + btn(f'Terminer {kbd("Échap")}', 'outline', 32))
    t = f'<div style="position: absolute; top: 64px; left: 0; right: 504px; margin: 0 auto; width: max-content; z-index: 600;">{toast("ok", "Construit", "Usine textile posée à Helartia.", "Voir")}</div>'
    return page(blocks(CITY) + blocks([(560, 230, 96, 96, 'selected')]) + status_pill() + command_bar(mode, 'Construire') + zoom() + chat_pill() + t
                + note_box('T1-5 · Après la pose : toast « Construit — Voir » (ouvre l\'inspecteur), la barre dit « Posée », le mode reste actif pour enchaîner (comme aujourd\'hui, mais visible). Échap termine.', 130))

def t1_mobile():
    # phone 1: build sheet (categories) ; phone 2: placement with mode bar
    cards = ''.join(
        f'<button style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px; min-height: 72px; background: {BG2}; border: 1px solid {BORDER}; border-radius: 8px; color: {T0}; cursor: pointer; text-align: left;">'
        f'<span style="color: {GOLD};">{ic(P[i], 20)}</span><span style="font: 600 13px {FONT};">{n}</span></button>' for i, n, c in CATS)
    hdr = f'<div style="padding: 10px 12px 8px; display: flex; flex-direction: column; gap: 8px;"><div style="height: 44px; padding: 0 12px; display: flex; align-items: center; gap: 8px; background: {BG0}; border: 1px solid {BORDER}; border-radius: 8px; color: {T4}; font-size: 14px;">{ic(P["search"],16,T2)}Filtrer les bâtiments…</div></div>'
    body = f'<div style="padding: 4px 12px 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">{cards}</div>'
    p1 = phone(status_pill(True) + command_bar(None, 'Construire', True) + msheet([('Construire', True)], hdr, body, None, 560))
    mode = mode_row('Placement', 'Usine textile', money('240'+NB+'000'), None, '', icon_btn('rotate', 'Tourner la vue', 44, False, False) + icon_btn('x', 'Annuler', 44) + btn('Poser', 'primary', 44), mobile=True)
    p2 = phone(blocks([(150, 330, 80, 80, 'ghost'), (100, 440, 90, 50, 'other')]) + status_pill(True) + zoom(True) + command_bar(mode, 'Construire', True), left=430)
    return page(p1 + p2, 820, 780, map_bg=False)

# ======================================================================
# T3 — RACCORDER UN FOURNISSEUR
# ======================================================================
def overlay_card():
    return (f'<div style="position: absolute; left: 560px; top: 180px; width: 320px; background: {GLASS}; backdrop-filter: blur(12px); border: 1px solid {BORDER_A}; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3); z-index: 300; display: flex; flex-direction: column; overflow: hidden;">'
            f'<div style="padding: 10px 12px; border-bottom: 1px solid {BORDER}; display: flex; align-items: center; justify-content: space-between; gap: 8px;"><div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;"><span style="font-size: 14px; font-weight: 600;">Usine textile</span><span style="font-size: 11px; color: {T3};">SPO_test3 - Green · niveau 2</span></div>{status_pill_tag("À l\'arrêt", NEG, "rgba(239,68,68,0.1)")}</div>'
            f'<div style="padding: 8px 12px; display: flex; align-items: center; gap: 8px; background: rgba(239,68,68,0.08); font-size: 12px; color: {T0};">{ic(P["warn"],14,NEG)}<span><strong style="color: {NEG};">Production arrêtée</strong> — il manque du coton.</span></div>'
            f'<div style="padding: 8px 12px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; font-size: 11px; color: {T3};"><span>Revenu<br><span style="font: 500 12px {MONO}; color: {NEG};">−{money("12"+NB+"400")}/j</span></span><span>Personnel<br><span style="font: 500 12px {MONO}; color: {WARN};">62 %</span></span><span>Efficacité<br><span style="font: 500 12px {MONO}; color: {T1};">0 %</span></span></div>'
            f'<div style="padding: 8px 12px 12px; display: flex; gap: 8px;">{btn("Inspecter", "primary", 32)}{btn("Aller", "secondary", 32)}</div></div>')

def t3_1():
    return page(blocks(CITY) + blocks([(700, 420, 90, 90, 'selected')]) + status_pill() + command_bar() + zoom() + chat_pill() + overlay_card()
                + note_box('T3-1 · Un clic sur un bâtiment : l\'aperçu (bloc Inspect poussé en continu) avec le diagnostic en tête. « Inspecter » ouvre la feuille ; un second clic aussi.', 70))

def supplies_body(expanded=None, filt=None):
    names = ['Coton', 'Produits chimiques', 'Main-d\'œuvre', 'Énergie']
    out = []
    for n in names:
        if n == expanded:
            out.append(f'<div style="display: flex; flex-direction: column; background: {BG2}; border-top: 1px solid rgba(255,255,255,0.04);">'
                       + row([f'<span style="color: {T0}; font-weight: 500;">{n}</span>', f'<span style="display: inline-flex; justify-content: flex-end;">{ic(P["chevd"],16,GOLD)}</span>'], 40, font=13)
                       .replace('border-top: 1px solid rgba(255,255,255,0.04); ', '')
                       + f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 2px 12px 12px;">'
                       f'<div style="display: flex; gap: 12px; font-size: 12px; color: {T1}; font-variant-numeric: tabular-nums;"><span>Dernière valeur <strong style="color: {T0};">0 t</strong></span><span>Coût <strong style="color: {T0};">—</strong></span><span>Fournisseurs <strong style="color: {NEG};">0</strong></span></div>'
                       f'<div style="display: flex; flex-direction: column; gap: 6px;"><div style="display: flex; justify-content: space-between; font-size: 12px; color: {T1};"><span>Prix maximum</span><span style="font: 700 12px {MONO}; color: {T0};">120 %</span></div>'
                       f'<div style="position: relative; height: 20px; display: flex; align-items: center;"><div style="width: 100%; height: 4px; background: {BG0}; border-radius: 9999px;"><div style="width: 24%; height: 100%; background: {GOLD}; border-radius: 9999px;"></div></div><span style="position: absolute; left: calc(24% - 10px); width: 20px; height: 20px; border-radius: 9999px; background: {T0}; border: 2px solid {GOLD};"></span></div>'
                       f'<div style="display: flex; justify-content: space-between; font-size: 12px; color: {T1};"><span>Qualité minimale</span><span style="font: 700 12px {MONO}; color: {T0};">60 %</span></div>'
                       f'<div style="position: relative; height: 20px; display: flex; align-items: center;"><div style="width: 100%; height: 4px; background: {BG0}; border-radius: 9999px;"><div style="width: 60%; height: 100%; background: {GOLD}; border-radius: 9999px;"></div></div><span style="position: absolute; left: calc(60% - 10px); width: 20px; height: 20px; border-radius: 9999px; background: {T0}; border: 2px solid {GOLD};"></span></div></div>'
                       f'<div style="display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; background: {BG1}; border: 1px dashed {BORDER_A}; border-radius: 8px; font-size: 12px; color: {T2}; text-align: center;">Aucun fournisseur connecté.<div style="display: flex; gap: 8px;">{btn("Trouver un fournisseur", "primary", 32)}{btn("Choisir sur la carte", "secondary", 32)}</div></div></div></div>')
        else:
            out.append(row([f'<span style="color: {T0};">{n}</span>', f'<span style="display: inline-flex; justify-content: flex-end;">{chevron()}</span>'], 40, font=13))
    return ''.join(out)

def inspector_header(diag=True):
    d = (f'<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px;"><span style="font-size: 12px; color: {T0};"><strong style="color: {NEG};">Production arrêtée</strong> — il manque du coton.</span>{btn("Trouver un fournisseur", "primary", 32)}</div>' if diag else
         f'<div style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 8px; font-size: 12px; color: {T0};">{ic(P["check"],14,POS)}<span><strong style="color: {POS};">En production</strong> — tous les approvisionnements sont connectés.</span></div>')
    tabs = ''.join(f'<button role="tab" aria-selected="{"true" if i == 0 else "false"}" style="height: 40px; padding: 0 10px; background: transparent; border: 0; border-bottom: 2px solid {GOLD if i == 0 else "transparent"}; color: {T0 if i == 0 else T3}; font: {"600" if i == 0 else "500"} 12px {FONT}; cursor: pointer; white-space: nowrap;">{t}</button>' for i, t in enumerate(['Approvisionnements', 'Production', 'Personnel', 'Finances', 'Plus']))
    return (f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-bottom: 1px solid {BORDER};">'
            f'<div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;"><div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;"><h2 style="margin: 0; font-size: 18px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Usine textile</h2><span style="font-size: 12px; color: {T3};">SPO_test3 - Green · Helartia · niveau 2</span></div>{status_pill_tag("À l\'arrêt", NEG, "rgba(239,68,68,0.1)") if diag else status_pill_tag("En production", POS, "rgba(34,197,94,0.1)")}</div>{d}</div>'
            f'<div role="tablist" style="display: flex; gap: 0; padding: 0 8px; border-bottom: 1px solid {BORDER}; overflow: hidden;">{tabs}</div>')

def inspector_footer():
    return f'<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: {T3};">{ic(P["refresh"],14)}Actualisé il y a 14 s</span><div style="display: flex; gap: 8px;">{btn("Renommer", "secondary")}{btn("Voir sur la carte", "primary")}</div>'

def t3_2():
    body = f'<div style="padding: 8px 16px 0;">{filter_field("Filtrer 4 approvisionnements…")}</div><div style="padding: 6px 4px 0;">{supplies_body("Coton")}</div>{fade()}'
    return page(blocks(CITY) + blocks([(700, 420, 90, 90, 'selected')]) + status_pill() + command_bar() + zoom() + chat_pill()
                + sheet([('Usine textile', False), ('Approvisionnements', True)], inspector_header(True), body, inspector_footer())
                + note_box('T3-2 · Feuille : identité + diagnostic en tête, onglet Approvisionnements ouvert sur la ligne en défaut (nom seul tant qu\'elle est repliée ; l\'ouverture a chargé valeurs, fournisseurs et curseurs). « Trouver un fournisseur » empile la recherche.', 70))

SUPPLIERS = [('Coton du Sud', 'Crazz', money('1'+NB+'180'), '84 %', 'Helartia', '9 km', True), ('Helartia Fibres', 'Helartia Agro', money('1'+NB+'260'), '92 %', 'Helartia', '22 km', False), ('Coopérative agricole', 'Planitia Farms', money('990'), '61 %', 'Nova Roma', '47 km', False), ('Textile Import', 'Port-Réal Trade', money('1'+NB+'340'), '88 %', 'Port-Réal', '61 km', False)]

def picker_body(selected=True, empty=False, loading=False):
    filt = (f'<div style="padding: 10px 16px 8px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid {BORDER};">'
            f'<div style="display: flex; gap: 8px;">{filter_field("Compagnie, bâtiment…", "", None, "100%", 36, True).replace("<span style=\"margin-left: auto;\">" + kbd("/") + "</span>", "<span style=\"margin-left: auto;\">" + kbd("Entrée") + "</span>")}</div>'
            f'<div style="display: flex; gap: 6px; flex-wrap: wrap; align-items: center;">{chip("Ville : toutes")}{chip("Max 20")}<span style="width: 1px; height: 20px; background: {BORDER_A};"></span>{chip("Producteurs", True)}{chip("Distributeurs", True)}{chip("Importateurs", True)}{chip("Acheteurs")}{chip("Exportateurs")}</div></div>')
    if loading:
        sk = ''.join(f'<div style="height: 40px; margin: 6px 16px 0; border-radius: 8px; background: linear-gradient(90deg, {BG2}, {BG3}, {BG2}); opacity: {o};"></div>' for o in (1, .7, .4))
        return filt + f'<div role="status" style="padding: 10px 16px 0; font-size: 12px; color: {T2};">Recherche des fournisseurs de coton…</div>' + sk
    if empty:
        return filt + (f'<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 16px; text-align: center;">{ic(P["search"],28,T4)}<span style="font-size: 13px; font-weight: 500;">Aucun fournisseur de coton trouvé</span><span style="font-size: 12px; color: {T2};">Élargissez les rôles (acheteurs, exportateurs) ou choisissez sur la carte.</span><div style="display: flex; gap: 8px;">{btn("Toutes les villes", "secondary", 32)}{btn("Choisir sur la carte", "secondary", 32)}</div></div>')
    head = f'<div style="display: grid; grid-template-columns: 24px 1.6fr 1fr 0.8fr 0.8fr; gap: 8px; height: 28px; align-items: center; padding: 0 16px; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {T3}; border-bottom: 1px solid {BORDER};"><span></span><span>Fournisseur</span><span>Prix / t</span><span>Qualité</span><span>Dist.</span></div>'
    rows = []
    for n, co, pr, q, town, dist, sel in SUPPLIERS:
        sel = sel and selected
        box = (f'<span style="width: 18px; height: 18px; border-radius: 4px; background: {GOLD}; display: inline-flex; align-items: center; justify-content: center;">{ic(P["check"],12,BG0,3)}</span>' if sel else f'<span style="width: 18px; height: 18px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);"></span>')
        qcol = POS if int(q[:2]) >= 80 else WARN
        rows.append(f'<label style="display: grid; grid-template-columns: 24px 1.6fr 1fr 0.8fr 0.8fr; align-items: center; gap: 8px; min-height: 44px; padding: 6px 16px; border-top: 1px solid rgba(255,255,255,0.04); font-size: 12px; color: {T1}; cursor: pointer; font-variant-numeric: tabular-nums; {"background: " + BG2 + ";" if sel else ""}">{box}<span style="display: flex; flex-direction: column; min-width: 0;"><span style="color: {T0}; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{n}</span><span style="font-size: 11px; color: {T3}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{co} · {town}</span></span><span>{pr}</span><span style="color: {qcol};">{q}</span><span style="color: {T2};">{dist}</span></label>')
    return filt + head + ''.join(rows) + f'<div style="padding: 10px 16px; font-size: 11px; color: {T3};">4 résultats · tri : distance · la distance est calculée localement depuis l\'usine</div>'

def t3_3(variant='results'):
    body = picker_body(selected=(variant == 'results'), empty=(variant == 'empty'), loading=(variant == 'loading'))
    footer = (f'<span style="font-size: 12px; color: {T2};">1 sélectionné · Coton du Sud</span>{btn("Connecter", "primary")}' if variant == 'results' else
              f'<span style="font-size: 12px; color: {T2};">0 sélectionné</span>{btn("Connecter", "disabled")}')
    title = f'<div style="padding: 12px 16px 0; display: flex; flex-direction: column; gap: 2px;"><h2 style="margin: 0; font-size: 16px; font-weight: 600;">Trouver un fournisseur de coton</h2><span style="font-size: 12px; color: {T3};">pour Usine textile · Helartia</span></div>'
    notes = {'results': 'T3-3 · La recherche s\'empile sur la feuille (jetons cliquables, le milieu replié en …). Entrée lance ; filtres = jetons, conservés. Résultats = ce que le serveur renvoie (nom, compagnie, ville, prix, qualité) + distance calculée localement. Coche → « Connecter ».',
             'empty': 'T3-3b · Aucun résultat : pas une liste vide, une sortie — élargir la ville, le type, ou choisir sur la carte.',
             'loading': 'T3-3c · Pendant la requête : squelettes + annonce « Recherche… » dans la zone, le reste de la feuille reste utilisable.'}
    return page(blocks(CITY) + blocks([(700, 420, 90, 90, 'selected')]) + status_pill() + command_bar() + zoom() + chat_pill()
                + sheet([('Usine textile', False), ('…', False), ('Trouver un fournisseur', True)], title, body, footer)
                + note_box(notes[variant], 70))

def t3_4():
    # back on Coton expanded, supplier connected, save indicator + toast
    names = ['Coton', 'Produits chimiques', 'Main-d\'œuvre', 'Énergie']
    exp = (f'<div style="display: flex; flex-direction: column; background: {BG2}; border-top: 1px solid rgba(255,255,255,0.04);">'
           + row([f'<span style="color: {T0}; font-weight: 500;">Coton</span>', f'<span style="display: inline-flex; justify-content: flex-end;">{ic(P["chevd"],16,GOLD)}</span>'], 40, font=13).replace('border-top: 1px solid rgba(255,255,255,0.04); ', '')
           + f'<div style="display: flex; flex-direction: column; gap: 10px; padding: 2px 12px 12px;">'
           f'<div style="display: flex; align-items: center; gap: 8px; font-size: 12px;">{ic(P["check"],14,POS,2.5)}<span style="color: {POS};">Connecté</span><span style="color: {T3};">· Coton du Sud · la livraison commence demain</span></div>'
           f'<div style="display: flex; gap: 12px; font-size: 12px; color: {T1}; font-variant-numeric: tabular-nums;"><span>Dernière valeur <strong style="color: {T0};">0 t</strong></span><span>Coût <strong style="color: {T0};">—</strong></span><span>Fournisseurs <strong style="color: {T0};">1</strong></span></div>'
           f'<div style="border: 1px solid {BORDER}; border-radius: 8px; overflow: hidden;"><div style="display: grid; grid-template-columns: 1.6fr 1fr 0.8fr 32px; gap: 8px; padding: 6px 10px; background: {BG1}; font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: {T3};"><span>Fournisseur</span><span>Prix / t</span><span>Qualité</span><span></span></div>'
           f'<div style="display: grid; grid-template-columns: 1.6fr 1fr 0.8fr 32px; align-items: center; gap: 8px; min-height: 40px; padding: 4px 10px; font-size: 12px; color: {T1}; font-variant-numeric: tabular-nums;"><span style="display: flex; flex-direction: column;"><span style="color: {T0}; font-weight: 500;">Coton du Sud</span><span style="font-size: 11px; color: {T3};">Crazz · 9 km</span></span><span>{money("1"+NB+"180")}</span><span style="color: {POS};">84 %</span>{icon_btn("x","Déconnecter Coton du Sud",32,False,True,T3)}</div></div>'
           f'<div style="display: flex; gap: 8px;">{btn("Ajouter un fournisseur", "secondary", 32)}</div></div></div>')
    rows = exp + ''.join(row([f'<span style="color: {T0};">{n}</span>', f'<span style="display: inline-flex; justify-content: flex-end;">{chevron()}</span>'], 40, font=13) for n in names[1:])
    body = f'<div style="padding: 8px 16px 0;">{filter_field("Filtrer 4 approvisionnements…")}</div><div style="padding: 6px 4px 0;">{rows}</div>{fade()}'
    hdr = inspector_header(True).replace('<strong style="color: ' + NEG + ';">Production arrêtée</strong> — il manque du coton.', '<strong style="color: ' + WARN + ';">Reprise en cours</strong> — coton commandé, livraison demain.').replace('rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3)', 'rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3)').replace(btn("Trouver un fournisseur", "primary", 32), '')
    t = f'<div style="position: absolute; top: 64px; left: 0; right: 504px; margin: 0 auto; width: max-content; z-index: 600;">{toast("ok", "Connecté", "Coton du Sud fournit Usine textile.")}</div>'
    return page(blocks(CITY) + blocks([(700, 420, 90, 90, 'selected')]) + status_pill() + command_bar() + zoom() + chat_pill()
                + sheet([('Usine textile', False), ('Approvisionnements', True)], hdr, body, inspector_footer()) + t
                + note_box('T3-4 · Retour sur la ligne Coton : SaveIndicator « Connecté », fournisseur listé, toast. Le diagnostic passe en attention (« reprise en cours ») — il vient du bloc Inspect, donc il changera quand le serveur le dira. Déconnecter = icône × → confirmation.', 130))

def t3_5():
    dlg = dialog('Déconnecter Coton du Sud ?', 'L\'usine n\'aura plus de coton. Vous pourrez reconnecter ce fournisseur plus tard.', None, ('Déconnecter', 'danger'), 'Annuler', danger=True)
    return page(blocks(CITY) + blocks([(700, 420, 90, 90, 'selected')]) + status_pill() + command_bar() + zoom() + chat_pill()
                + sheet([('Usine textile', False), ('Approvisionnements', True)], inspector_header(False), f'<div style="padding: 8px 16px 0;">{filter_field("Filtrer 4 approvisionnements…")}</div><div style="padding: 6px 4px 0;">{supplies_body()}</div>', inspector_footer())
                + dlg + note_box('T3-5 · Déconnexion : dialogue destructif, focus initial sur « Annuler », Échap annule. Aujourd\'hui Fire / touche Suppr déconnectent sans rien demander.', 70))

def t3_mobile():
    # phone 1: inspector sheet half with diag + supplies ; phone 2: picker full-height
    hdr = (f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-bottom: 1px solid {BORDER};">'
           f'<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;"><div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;"><span style="font-size: 16px; font-weight: 600;">Usine textile</span><span style="font-size: 12px; color: {T3};">Helartia · niveau 2</span></div>{status_pill_tag("À l\'arrêt", NEG, "rgba(239,68,68,0.1)")}</div>'
           f'<div style="display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px;"><span style="font-size: 13px; color: {T0};"><strong style="color: {NEG};">Production arrêtée</strong> — il manque du coton.</span>{btn("Trouver un fournisseur", "primary", 44)}</div></div>')
    rows = ''.join(f'<div role="button" tabindex="0" style="display: grid; grid-template-columns: 1fr 44px; align-items: center; gap: 8px; height: 48px; padding: 0 12px; font-size: 14px; color: {T0}; border-top: 1px solid rgba(255,255,255,0.04); cursor: pointer;"><span>{n}</span><span style="display: inline-flex; justify-content: center;">{chevron()}</span></div>' for n in ['Coton', 'Produits chimiques', 'Main-d\'œuvre', 'Énergie'])
    p1 = phone(blocks([(150, 120, 80, 80, 'selected')]) + status_pill(True) + command_bar(None, None, True) + msheet([('Usine textile', False), ('Approvisionnements', True)], hdr, rows, None, 520))
    # picker
    filt = (f'<div style="padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid {BORDER};"><div style="height: 44px; padding: 0 12px; display: flex; align-items: center; gap: 8px; background: {BG0}; border: 1px solid {GOLD}; border-radius: 8px; color: {T4}; font-size: 14px;">{ic(P["search"],16,T2)}Compagnie, bâtiment…<span style="margin-left: auto;">{kbd("Entrée")}</span></div>'
            f'<div style="display: flex; gap: 6px; overflow: hidden;">{chip("Ville : toutes", False, 36)}{chip("Producteurs", True, 36)}{chip("Distributeurs", True, 36)}{chip("Importateurs", True, 36)}</div></div>')
    prow = ''
    for n, co, pr, q, town, dist, sel in SUPPLIERS[:3]:
        box = (f'<span style="width: 22px; height: 22px; border-radius: 4px; background: {GOLD}; display: inline-flex; align-items: center; justify-content: center;">{ic(P["check"],14,BG0,3)}</span>' if sel else f'<span style="width: 22px; height: 22px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);"></span>')
        prow += (f'<label style="display: grid; grid-template-columns: 32px 1fr auto; align-items: center; gap: 10px; min-height: 56px; padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.04); font-size: 13px; {"background: " + BG2 + ";" if sel else ""}">{box}<span style="display: flex; flex-direction: column; min-width: 0;"><span style="color: {T0}; font-weight: 500;">{n}</span><span style="font-size: 12px; color: {T3};">{co} · {dist}</span></span><span style="display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums;"><span style="color: {T0};">{pr}</span><span style="font-size: 12px; color: {POS if int(q[:2]) >= 80 else WARN};">{q}</span></span></label>')
    foot = f'<span style="font-size: 12px; color: {T2};">1 sélectionné</span>{btn("Connecter", "primary", 44)}'
    p2 = phone(status_pill(True) + msheet([('Usine textile', False), ('…', False), ('Trouver', True)], filt, prow, foot, 700), left=430)
    return page(p1 + p2, 820, 780, map_bg=False)

# ======================================================================
ARTBOARDS = [
    ('Main', t1_1, 1440, 900, 'T1-1 · Construire — catégories'),
    ('T1-2', t1_2, 1440, 900, 'T1-2 · Construire — liste + sélection'),
    ('T1-3', lambda: t1_3(True), 1440, 900, 'T1-3 · Placement — mode actif'),
    ('T1-3b', lambda: t1_3(False), 1440, 900, 'T1-3b · Placement — pose invalide'),
    ('T1-4', t1_4, 1440, 900, 'T1-4 · Confirmation'),
    ('T1-5', t1_5, 1440, 900, 'T1-5 · Posée — toast, mode conservé'),
    ('T1-Mobile', t1_mobile, 820, 780, 'T1 · Mobile — catégories / placement'),
    ('T3-1', t3_1, 1440, 900, 'T3-1 · Aperçu au clic'),
    ('T3-2', t3_2, 1440, 900, 'T3-2 · Feuille — diagnostic + Coton ouvert'),
    ('T3-3', lambda: t3_3('results'), 1440, 900, 'T3-3 · Trouver un fournisseur — résultats'),
    ('T3-3b', lambda: t3_3('empty'), 1440, 900, 'T3-3b · Aucun résultat'),
    ('T3-3c', lambda: t3_3('loading'), 1440, 900, 'T3-3c · Recherche en cours'),
    ('T3-4', t3_4, 1440, 900, 'T3-4 · Connecté'),
    ('T3-5', t3_5, 1440, 900, 'T3-5 · Déconnecter — confirmation'),
    ('T3-Mobile', t3_mobile, 820, 780, 'T3 · Mobile — feuille / recherche'),
]

if __name__ == '__main__':
    arts = []
    x, y, rowi = 0, 0, 0
    for name, fn, w, h, title in ARTBOARDS:
        open(f'{name}.dc.html', 'w', encoding='utf-8').write(fn())
        arts.append({'file': f'{name}.dc.html', 'title': title, 'x': x, 'y': y, 'w': w, 'h': h})
        x += w + 80
        if name in ('T1-3b', 'T1-Mobile', 'T3-3c'):
            x = 0; y += 1000
        if name == 'T1-Mobile':
            y += 100
    canvas = {
        'artboards': arts,
        'annotations': [
            {'id': 'flows-brief', 'x': 0, 'y': -420, 'w': 760, 'text': "FLUX T1 — CONSTRUIRE et T3 — RACCORDER UN FOURNISSEUR, option C, desktop + mobile.\nChaque planche porte une note (cadre pointillé or) qui dit ce qu'elle montre. Règles tenues : aucune requête RDO de plus que le code actuel (catégories → liste au clic, détail d'une porte à l'ouverture, recherche à Entrée) ; ligne repliée = nom seul ; diagnostic tiré du bloc Inspect ; confirmation sur dépense et destruction ; « Tourner la vue » (pas de rotation de bâtiment) ; distances calculées localement.\nCe qui suppose une implémentation est dans doc/ux/missing-features.md (H1, H2, H4, B4, B5, B7, N9, N10)."},
            {'id': 'flows-impl', 'x': 800, 'y': -420, 'w': 620, 'text': "ÉTAT D'IMPLÉMENTATION (2026-08-23)\n✅ T1 Construire — le menu est une surface de la feuille (B, tuile, palette) ; catégories et listes gardées pour la session ; filtre local ; « Cash after » dans la carte dépliée et Placer désactivé si insuffisant ; barre de mode (socle-4) avec coût / trésorerie après / Tourner la vue / Done ; Dialog de dépense au clic carte avec « ne plus demander cette session » ; toast « Built — View ». Écart voulu : la feuille ne se réduit pas à 300 px pendant le placement (elle se ferme comme aujourd'hui) — à revoir avec la feuille flottante.\n✅ T3 Fournisseur — le picker est une surface empilée sur le bâtiment (jeton de retour), Entrée lance, filtres gardés, tri par distance locale, libellés liés ; déconnexion (Fire / Suppr / popover) → Dialog destructif ; « View on map » dans l'inspecteur ; toast « Connected ». Écarts voulus : pas de diagnostic parsé en tête (B7, hints bruts), pas de « Choisir sur la carte » dans le picker (N10) — prochains lots.\n✅ T6 Courrier — réponse pré-remplie, brouillon gardé jusqu'à la confirmation d'envoi, suppression → Dialog destructif puis retrait local, squelette de chargement.\n✅ T2 Diagnostic — le texte d'état déjà poussé est lu (Stopped… + les 25 phrases de SimHints.pas) en mot de sévérité + phrase + une action (ouvre la section) ; bandeau en tête de l'inspecteur, lecture seule dans l'aperçu carte.\n✅ T7 Recherche — la palette trouve mes bâtiments (favoris lus une fois), les villes, et « x,y » ; commandes mortes retirées. Reste : coordonnées cliquables dans le chat (N5), palette sur mobile (avec la barre de commande mobile).\n✅ T5 Taxes — Government : bouton « Taxes » par ville → hôtel de ville ouvert sur Administration ; lignes du tableau des taxes = boutons (clavier, aria-pressed).\n✅ T8 Modes carte — l'overlay Zones entre et sort de la même façon pour le placement et le zonage (ce qui était affiché revient), et la barre de mode le dit ; route : « $2,000,000 per tile » dans la barre, Dialog de dépense à la relâche (tuiles, coût, trésorerie après, opt-out de session), démolition (clic ou zone) confirmée. Reste : vue Carte (N1–N4), barre de commande mobile, feuille flottante.\n✅ Carte-1 — surface « Map » dans la feuille (M, tuile Map, triangle mobile) : terrain + bâtiments chargés (or = miens, rouge = déficitaires), rectangle de vue, clic = sauter, zoom 1–8× molette/boutons, glisser ; Back / Next (historique caméra, 100 positions) ; « Nearest Town Hall ». Reste : favoris de position (Carte-2), barre de commande mobile, feuille flottante."},
            {'id': 'flows-t3', 'x': 0, 'y': 2080, 'w': 560, 'text': "T3 — du clic sur la carte au fournisseur connecté : 5 interactions (clic bâtiment → Inspecter → Trouver un fournisseur → cocher → Connecter), contre 8–10 aujourd'hui sur 3 surfaces imbriquées. Tout se passe dans UNE feuille empilée ; la carte reste visible et cliquable."},
        ],
        'launch': {'view': 'canvas'},
    }
    json.dump(canvas, open('canvas.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('wrote', len(arts), 'artboards')
