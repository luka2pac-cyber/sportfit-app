"""Legge lo stato impianti di Sella Nevea da turismofvg.it (Infoneve) e scrive freeride/lifts.json."""
import urllib.request, urllib.parse, re, json, html, pathlib, datetime
URL = "https://www.turismofvg.it/montagna/infoneve?hub=sella&day=today&type=4"
UA = {"User-Agent": "Mozilla/5.0 (freeride-sella status bot)"}
OUT = pathlib.Path("freeride/lifts.json")

def get(u):
    return urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30).read().decode("utf-8", "replace")

def main():
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="minutes")
    try:
        h = get(URL)
    except Exception as e:
        old = json.loads(OUT.read_text()) if OUT.exists() else {}
        old["error"] = f"fetch failed {now}: {e}"
        OUT.write_text(json.dumps(old, ensure_ascii=False, indent=1)); return
    lifts = []
    for block in re.split(r'<div class="c-snowreportdetail__tablerow">', h)[1:]:
        n = re.search(r'tablerowname@portrait">\s*<span>(.*?)</span>', block, re.S)
        s = re.search(r'o-status--([\w-]+)', block)
        if not n or not s: continue
        name = html.unescape(n.group(1)).strip()
        name = re.sub(r"^\d+\s+", "", name)
        name = re.sub(r"\s*-\s*\d+\s*posti$", "", name)
        lifts.append({"name": name, "status": s.group(1)})
    a = re.search(r'c-snowreportdetail__headeralert">(.*?)</div>', h, re.S)
    alert = html.unescape(re.sub(r"<[^>]+>", " ", a.group(1))).strip() if a else ""
    mods = set()
    for href in re.findall(r'<link[^>]+href="([^"]+\.css[^"]*)"', h):
        try: mods |= set(re.findall(r'\.o-status--([\w-]+)', get(urllib.parse.urljoin(URL, href))))
        except Exception: pass
    data = {"source": URL, "lifts": lifts, "alert": alert, "css_modifiers": sorted(mods)}
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    if {k: old.get(k) for k in data} == data:
        old["checked"] = now; old.pop("error", None); data = old
    else:
        data["updated"] = now; data["checked"] = now
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1))

main()
