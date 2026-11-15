import urllib.request, re, pathlib
u="https://www.turismofvg.it/montagna/infoneve?hub=sella&day=today&type=4"
h=urllib.request.urlopen(urllib.request.Request(u,headers={"User-Agent":"Mozilla/5.0"}),timeout=30).read().decode("utf-8","replace")
i=h.find("Telecabina Canin"); j=h.find("Tappeto Campo Scuola")
pathlib.Path("freeride/lifts-debug.txt").write_text(h[max(0,i-3000):j+2500])
