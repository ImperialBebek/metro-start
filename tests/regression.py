"""Metro Start regression tests.

Drives newtab.html in Chromium with Playwright. Every network call is answered with simulated data,
so the suite runs offline and gives the same results every time.

    pip install -r tests/requirements.txt
    python -m playwright install chromium
    python tests/regression.py

Set CHROME_PATH to use a specific Chromium or Chrome binary instead of Playwright's.
"""
import asyncio, base64, json, os, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIX = pathlib.Path(__file__).resolve().parent / "fixtures"
URL = (ROOT / "newtab.html").as_uri()
LAUNCH = {"executable_path": os.environ["CHROME_PATH"]} if os.environ.get("CHROME_PATH") else {}
CORS={'access-control-allow-origin':'*'}
TREE={"id":"0","children":[{"id":"1","title":"Bookmarks bar","children":[
  {"id":"10","title":"GitHub","url":"https://github.com/"},{"id":"11","title":"YouTube","url":"https://www.youtube.com/"},
  {"id":"12","title":"Bookmarklet","url":"javascript:alert(1)"},
  {"id":"13","title":"Work","children":[{"id":"14","title":"Jira","url":"https://jira.example.com/"},
     {"id":"16","title":"Dev tools","children":[{"id":"17","title":"MDN","url":"https://developer.mozilla.org/"}]}]}]}]}
INIT="""window.__perm=[]; window.chrome={runtime:{id:'t',getURL:p=>'chrome-extension://t'+p,getManifest:()=>({version:'test'})},
 permissions:{request:async p=>{__perm.push(p);return true},remove:async()=>true,contains:async()=>true},
 bookmarks:{getTree:async()=>["""+json.dumps(TREE)+"""]}};"""
WX=json.dumps({"current":{"temperature_2m":66.2,"weather_code":1,"is_day":1},"daily":{"temperature_2m_max":[71],"temperature_2m_min":[56]}})
RSS='<?xml version="1.0"?><rss><channel><item><title>Headline one - Source</title><link>https://n.example/1</link></item></channel></rss>'
CHART=json.dumps({"chart":{"result":[{"meta":{"regularMarketPrice":100,"chartPreviousClose":99,"currency":"USD"}}]}})
async def route(r):
    u=r.request.url
    if 'bigdatacloud' in u: return await r.fulfill(body=json.dumps({"latitude":33.1,"longitude":-117.3,"city":"Carlsbad"}),content_type='application/json',headers=CORS)
    if 'open-meteo' in u: return await r.fulfill(body=WX,content_type='application/json',headers=CORS)
    if 'news.google.com' in u: return await r.fulfill(body=RSS,content_type='application/rss+xml',headers=CORS)
    if 'finance.yahoo.com/v8' in u: return await r.fulfill(body=CHART,content_type='application/json',headers=CORS)
    if u.startswith('https://github.com/apple'): return await r.fulfill(path=str(FIX / 'icon.png'))
    if u.startswith('https://github.com/'): return await r.fulfill(body='<html><head><link rel="apple-touch-icon" href="/apple.png"></head></html>',content_type='text/html',headers=CORS)
    if u.startswith('https://www.wikipedia.org'): return await r.fulfill(body='ok',content_type='text/html')
    if u.startswith('http'): return await r.abort()
    return await r.continue_()
SHAPE="(()=>{const f=l=>l.map(t=>t.type==='folder'?t.title+'['+f(t.children).join(',')+']':(t.game||t.title));return f(JSON.parse(localStorage.getItem('metro:tiles'))).join(' | ')})()"
TREE2={"id":"0","children":[{"id":"1","title":"Bookmarks bar","children":[
  {"id":"10","title":"Zebra Bank","url":"https://zebra.example/"},
  {"id":"11","title":"Apple","url":"https://apple.example/"},
  {"id":"12","title":"Work","children":[{"id":"13","title":"Jira","url":"https://jira.example/"}]},
  {"id":"14","title":"Inbox (3) - alireza.farmad@example.com - Gmail","url":"https://mail.example/"},
  {"id":"15","title":"Moon","url":"https://moon.example/"},
  {"id":"16","title":"Banana","url":"https://banana.example/"}]}]}
INIT2="""window.chrome={runtime:{id:'t',getURL:p=>'chrome-extension://t'+p,getManifest:()=>({version:'test'})},
 permissions:{request:async()=>true,remove:async()=>true,contains:async()=>true},
 bookmarks:{getTree:async()=>["""+json.dumps(TREE2)+"""]}};"""
results=[]
def check(name, ok, extra=''): results.append((name, ok)); print(('PASS' if ok else 'FAIL'), name, extra)
async def fresh(b):
    pg=await b.new_page(viewport={"width":1440,"height":860}); errs=[]
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.add_init_script(INIT); await pg.route("**/*", route)
    await pg.goto(URL); await pg.wait_for_timeout(1200)
    return pg, errs
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(**LAUNCH)
        pg,errs=await fresh(b)
        # basics
        check("default tiles + Games folder", "Games[solitaire,minesweeper,sudoku,catnap,2048,words,pairs,snake,blocks,bricks]" in await pg.evaluate(SHAPE))
        check("weather shows", "66°" in await pg.inner_text("#weather-widget"))
        check("news widget", "Headline one" in await pg.inner_text("#news-widget"))
        check("markets widget", "+1.01%" in await pg.inner_text("#stocks-widget"))
        check("flip off by default", await pg.evaluate("settings.flipOpen") is False)
        # drag a tile into Social
        before=await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).find(t=>t.title==='Social').children.length")
        await pg.drag_and_drop("[title^='Amazon']","[title^='Social']"); await pg.wait_for_timeout(300)
        check("drag into folder", await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).find(t=>t.title==='Social').children.length")==before+1)
        # nested folder + Esc goes up
        await pg.click("[title^='Social']"); await pg.wait_for_timeout(300)
        await pg.click("#folder-add"); await pg.click("#ctx .ctx-item >> text=Add a folder")
        await pg.fill("#ed-title","Friends"); await pg.click("#ed-save"); await pg.wait_for_timeout(400)
        check("nested folder opens with path", "Social" in await pg.inner_text("#folder-crumbs"))
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        check("Esc goes up a level", await pg.input_value("#folder-title")=="Social")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        # editor icon modes
        await pg.click("[title^='Wikipedia']", button="right"); await pg.click("#ctx .ctx-item >> text=Edit…")
        await pg.click("#ed-icon-mode button[data-value=letter]"); await pg.click("#ed-save"); await pg.wait_for_timeout(300)
        check("icon mode Letter saves", await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).find(t=>t.title==='Wikipedia').icon.mode")=="letter")
        # bookmark import with icons, then replace + undo
        await pg.click("#btn-add"); await pg.click("#ctx .ctx-item >> text=Import bookmarks…"); await pg.wait_for_timeout(400)
        await pg.click("#bm-import"); await pg.wait_for_function("document.querySelector('#bm-overlay').hidden", timeout=30000)
        shape=await pg.evaluate(SHAPE)
        check("import keeps nesting, skips dupes/bookmarklet", "Work[Jira,Dev tools[MDN]]" in shape and "Bookmarklet" not in shape, await pg.text_content("#toast"))
        check("import fetched sharp icon", await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).find(t=>t.title==='GitHub').icon.siteIcon")=="https://github.com/apple.png")
        n_before=await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).length")
        await pg.click("#btn-add"); await pg.click("#ctx .ctx-item >> text=Import bookmarks…"); await pg.wait_for_timeout(400)
        await pg.click("label:has(#bm-replace)"); await pg.click("#bm-import"); await pg.wait_for_function("document.querySelector('#bm-overlay').hidden", timeout=30000)
        check("erase-and-import", "Replaced Start" in await pg.text_content("#toast"))
        await pg.click("#toast button"); await pg.wait_for_timeout(300)
        check("undo restores Start", await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).length")==n_before)
        # search finds nested tile
        await pg.keyboard.type("mdn"); await pg.wait_for_timeout(200)
        check("search finds deep tile", "MDN" in await pg.inner_text("#grid")); await pg.keyboard.press("Escape")
        # games
        await pg.evaluate("openGame('2048')"); await pg.wait_for_timeout(400)
        for k in ["ArrowLeft","ArrowUp","ArrowRight"]: await pg.keyboard.press(k)
        board=await pg.evaluate("[...document.querySelectorAll('.g2048-cell')].map(c=>c.textContent).join()")
        await pg.click("#game-back"); await pg.wait_for_timeout(500)
        await pg.evaluate("openGame('2048')"); await pg.wait_for_timeout(400)
        check("2048 resumes", board==await pg.evaluate("[...document.querySelectorAll('.g2048-cell')].map(c=>c.textContent).join()")); await pg.click("#game-back")
        await pg.evaluate("""(()=>{const found=[0,1,2,3].map(s=>Array.from({length:12},(_,k)=>({id:s*13+k,s,r:k+1,up:true})));
          const tab=[0,1,2,3].map(s=>[{id:s*13+12,s,r:13,up:true}]).concat([[],[],[]]);
          gameData.saves.solitaire={draw:1,stock:[],waste:[],found,tab,moves:9,time:30,started:true,over:false};})()""")
        await pg.evaluate("openGame('solitaire')"); await pg.wait_for_timeout(500)
        await pg.click(".card[data-id='12']"); await pg.wait_for_timeout(1500)
        check("solitaire auto-finish win", "You won" in await pg.inner_text("#game-banner")); await pg.click("#game-back")
        await pg.evaluate("openGame('minesweeper')"); await pg.wait_for_timeout(400)
        await pg.click(".ms-cell >> nth=40"); await pg.wait_for_timeout(200)
        check("minesweeper first click safe", await pg.evaluate("!document.querySelector('.ms-cell.boom') && document.querySelectorAll('.ms-cell.open').length>0")); await pg.click("#game-back")
        await pg.evaluate("openGame('words')"); await pg.wait_for_timeout(400)
        ans=await pg.evaluate("gameData.saves.words.answer"); await pg.keyboard.type(ans); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(1300)
        check("five letters solve", ans.upper() in await pg.inner_text("#game-banner")); await pg.click("#game-back")
        await pg.evaluate("openGame('snake')"); await pg.wait_for_timeout(300); await pg.keyboard.press("ArrowUp"); await pg.wait_for_timeout(2500)
        check("snake game over", "Game over" in await pg.inner_text("#game-banner")); await pg.click("#game-back")
        await pg.evaluate("openGame('sudoku')"); await pg.wait_for_timeout(500)
        check("sudoku loads", await pg.evaluate("document.querySelectorAll('.sd-cell').length")==81); await pg.click("#game-back")
        # backup round trip
        rt=await pg.evaluate("(()=>{const c=v=>Array.isArray(v)?v.map(c):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,c(v[k])])):v;const a=JSON.parse(localStorage.getItem('metro:tiles'));return JSON.stringify(c(sanitizeTiles(a)))===JSON.stringify(c(a))})()")
        check("backup round-trip", rt)
        # flip on → link flips then navigates
        await pg.evaluate("settings.flipOpen=true"); await pg.click("#grid [title^='Wikipedia']"); await pg.wait_for_timeout(80)
        flipping=await pg.evaluate("!!document.querySelector('.tile.flipping')")
        await pg.wait_for_url("https://www.wikipedia.org/**", timeout=5000)
        check("flip then open", flipping)
        check("no page errors", not errs, str(errs))

        # ---- parallax
        IMG="data:image/jpeg;base64,"+base64.b64encode((FIX / "photo.jpg").read_bytes()).decode()
        pg=await b.new_page(viewport={"width":1280,"height":760}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.route("**/*", lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
        await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.evaluate(f"""(()=>{{ for (let i=0;i<30;i++) tiles.push(link('Site '+i,'https://s'+i+'.example','#2d89ef','wide'));
          settings.bg.image={IMG!r}; applySettings(); commit(); }})()""")
        await pg.wait_for_timeout(400)
        info = "(()=>{const r=document.querySelector('#bg').getBoundingClientRect();return {left:Math.round(r.left),right:Math.round(r.right),sl:Math.round(scroller.scrollLeft)}})()"
        a=await pg.evaluate(info)
        await pg.evaluate("scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2"); await pg.wait_for_timeout(150)
        m=await pg.evaluate(info)
        await pg.evaluate("scroller.scrollLeft = scroller.scrollWidth"); await pg.wait_for_timeout(150)
        e=await pg.evaluate(info)
        check("parallax moves slower than tiles", 0 < -e['left'] < e['sl'])
        check("parallax picture always covers window", a['left'] <= 0 and e['right'] >= 1280 and m['right'] >= 1280)
        await pg.emulate_media(reduced_motion="reduce"); await pg.evaluate("applySettings()")
        check("parallax off with reduced motion", await pg.evaluate("document.querySelector('#bg').className") == '')
        check("no page errors (parallax)", not errs, str(errs))
        await pg.close()

        # ---- wallpaper gallery
        CORS2={'access-control-allow-origin':'*'}
        async def wroute(r):
            u=r.request.url
            if u.startswith('https://commons.wikimedia.org/w/api.php'):
                pages=[{"title":f"File:Lake {i:03d}.jpg","imageinfo":[{"width":1200 if i%7==0 else 4000,"height":5000 if i%5==0 else 2600,"mime":"image/jpeg",
                  "url":f"https://upload.wikimedia.org/o{i}.jpg","descriptionurl":f"https://commons.wikimedia.org/wiki/File:Lake_{i:03d}.jpg",
                  "thumburl":f"https://upload.wikimedia.org/thumb/{i}.jpg/500px-{i}.jpg",
                  "extmetadata":{"Artist":{"value":"A. Photographer"},"LicenseShortName":{"value":"CC BY 4.0"},"ObjectName":{"value":f"Lake {i}"}}}]} for i in range(60)]
                return await r.fulfill(body=json.dumps({"query":{"pages":pages}}),content_type='application/json',headers=CORS2)
            if 'upload.wikimedia.org' in u: return await r.fulfill(path=str(FIX / 'photo.jpg'),headers=CORS2)
            if u.startswith('http'): return await r.abort()
            return await r.continue_()
        pg=await b.new_page(viewport={"width":1440,"height":860}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.route("**/*", wroute)
        await pg.goto(URL); await pg.wait_for_timeout(700)
        await pg.click("#btn-settings"); await pg.wait_for_timeout(300); await pg.click("#set-bg-gallery"); await pg.wait_for_timeout(1000)
        ids=await pg.evaluate("Wallpapers.load('landscapes').then(r => r.items.map(i => +i.id.match(/(\\d+)\\.jpg/)[1]))")
        check("gallery shows only wide, sharp photos", len(ids) == 24 and all(i % 7 and i % 5 for i in ids))
        await pg.locator("#wp-grid .wp-item").first.click(); await pg.wait_for_timeout(1000)
        check("gallery pick saved locally", (await pg.evaluate("JSON.parse(localStorage.getItem('metro:settings')).bg.image")).startswith("data:image/jpeg"))
        await pg.click("#wp-close"); await pg.wait_for_timeout(300)
        check("gallery credit shown", "A. Photographer" in await pg.inner_text("#bg-credit"))
        check("no page errors (gallery)", not errs, str(errs))
        # ---- 1.12: order-keeping import, long names, keep games, restore, Cat Nap, Pairs
        pg=await b.new_page(viewport={"width":1440,"height":860}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.add_init_script(INIT2)
        await pg.route("**/*", lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
        await pg.goto(URL); await pg.wait_for_timeout(900)
        check("Games folder has 10 games incl. Cat Nap and Pairs", await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).find(t=>t.title==='Games').children.map(c=>c.game).join()") == "solitaire,minesweeper,sudoku,catnap,2048,words,pairs,snake,blocks,bricks")
        # ---- erase + import, keep games, order, widen
        await pg.click("#btn-add"); await pg.click("#ctx .ctx-item >> text=Import bookmarks…"); await pg.wait_for_timeout(400)
        await pg.click("label:has(#bm-replace)")
        check("button says games are kept", "except games" in await pg.text_content("#bm-import"), await pg.text_content("#bm-import"))
        await pg.click("#bm-import"); await pg.wait_for_function("document.querySelector('#bm-overlay').hidden", timeout=20000)
        shape=await pg.evaluate("JSON.parse(localStorage.getItem('metro:tiles')).map(t=>t.title+(t.size==='wide'?'(wide)':''))")
        check("games kept, bookmarks in order", shape == ['Games','Zebra Bank','Apple','Work','Inbox (3) - alireza.farmad@example.com - Gmail(wide)','Moon','Banana'], shape)
        # visual order: element positions follow list order (reading order within groups)
        pos=await pg.evaluate("""[...document.querySelectorAll('#grid .tile')].map(e=>{const r=e.getBoundingClientRect();return [e.title.split('\\n')[0].replace(/ \\(\\d+\\)$/,''), Math.round(r.left), Math.round(r.top)]})""")
        check("on-screen order matches list", [x[0] for x in pos] == ['Games','Zebra Bank','Apple','Work','Inbox (3) - alireza.farmad@example.com - Gmail','Moon','Banana'])
        # ---- erase without keeping games, then restore
        await pg.click("#btn-add"); await pg.click("#ctx .ctx-item >> text=Import bookmarks…"); await pg.wait_for_timeout(400)
        await pg.click("label:has(#bm-replace)"); await pg.click("label:has(#bm-keep-games)")
        await pg.click("#bm-import"); await pg.wait_for_function("document.querySelector('#bm-overlay').hidden", timeout=20000)
        check("erase without keeping removes games", await pg.evaluate("everyTile().filter(x=>x.tile.type==='game').length") == 0)
        await pg.click("#btn-settings"); await pg.wait_for_timeout(300); await pg.click("#set-restore-games"); await pg.wait_for_timeout(300)
        check("Restore brings Games folder back", await pg.evaluate("everyTile().filter(x=>x.tile.type==='game').length") == 10, await pg.text_content("#toast"))
        await pg.evaluate("(()=>{const f=tiles.find(t=>t.title==='Games'); f.children.splice(2,3); commit();})()")
        await pg.click("#btn-add"); await pg.click("#ctx .ctx-item >> text=Add a game"); await pg.click("#ctx .ctx-item >> text=All games (Games folder)"); await pg.wait_for_timeout(200)
        check("All games refills missing ones", await pg.evaluate("tiles.find(t=>t.title==='Games').children.length") == 10, await pg.text_content("#toast"))
        # ---- Cat Nap
        await pg.evaluate("openGame('catnap')"); await pg.wait_for_timeout(500)
        st=await pg.evaluate("gameData.saves.catnap"); n=st['n']
        wrong=[i for i in range(n*n) if st['cats'][i//n] != i%n][0]
        await pg.click(f".cn-cell[data-i='{wrong}']", button="right"); await pg.wait_for_timeout(200)
        check("wrong cat costs a heart and is crossed out", await pg.evaluate("gameData.saves.catnap.hearts")==2 and await pg.evaluate(f"gameData.saves.catnap.marks[{wrong}]")==1)
        # drag-cross a row
        rr = 1 if wrong // n == 0 else 0
        a=await pg.locator(f".cn-cell >> nth={rr*n}").bounding_box(); z=await pg.locator(f".cn-cell >> nth={rr*n+n-1}").bounding_box()
        await pg.mouse.move(a['x']+5,a['y']+5); await pg.mouse.down(); await pg.mouse.move(z['x']+5,z['y']+5, steps=10); await pg.mouse.up(); await pg.wait_for_timeout(150)
        row0=await pg.evaluate(f"gameData.saves.catnap.marks.slice({rr*n},{rr*n+n})")
        check("drag crosses out a row", all(m==1 for m in row0), row0)
        # clicking a crossed square turns it into a cat: correct square of row 0
        c0=rr*n+st['cats'][rr]
        await pg.click(f".cn-cell[data-i='{c0}']"); await pg.wait_for_timeout(100)
        check("click on crossed square places cat", await pg.evaluate(f"gameData.saves.catnap.marks[{c0}]")==2)
        check("auto-cross marks blocked squares faintly", await pg.evaluate("document.querySelectorAll('.cn-cell.faint').length") > 0)
        for r in [x for x in range(n) if x != rr][:-1]:
            await pg.click(f".cn-cell[data-i='{r*n+st['cats'][r]}']", button="right"); await pg.wait_for_timeout(40)
        await pg.click("#game-tools button:has-text('Hint')"); await pg.wait_for_timeout(1300)
        check("Cat Nap win", "napping" in await pg.inner_text("#game-banner"), (await pg.inner_text("#game-status")).replace("\n"," "))
        await pg.click("#game-banner .btn:not(.primary)"); await pg.wait_for_timeout(200)
        await pg.click("#game-back")
        # out of hearts
        await pg.evaluate("openGame('catnap')"); await pg.wait_for_timeout(300)
        await pg.click("#game-tools button:has-text('New puzzle')"); await pg.wait_for_timeout(300)
        st=await pg.evaluate("gameData.saves.catnap"); n=st['n']
        wrongs=[i for i in range(n*n) if st['cats'][i//n] != i%n][:3]
        for w in wrongs: await pg.click(f".cn-cell[data-i='{w}']", button="right"); await pg.wait_for_timeout(80)
        check("three wrong cats → out of hearts", "Out of hearts" in await pg.inner_text("#game-banner"))
        await pg.click("#game-banner .btn.primary"); await pg.wait_for_timeout(200)
        check("Try again resets same puzzle", await pg.evaluate("gameData.saves.catnap.hearts")==3 and await pg.evaluate("JSON.stringify(gameData.saves.catnap.cats)")==json.dumps(st['cats']).replace(' ',''))
        for lv,size in [('medium',8),('hard',10),('daily',8)]:
            await pg.click(f"#game-tools button[data-value={lv}]"); await pg.wait_for_timeout(200)
            if await pg.is_visible("#game-banner"): await pg.click("#game-banner .btn.primary"); await pg.wait_for_timeout(200)
            check(f"Cat Nap {lv} is {size}x{size}", await pg.evaluate("document.querySelectorAll('.cn-cell').length")==size*size)
        await pg.click("#game-back")
        # ---- Pairs
        await pg.evaluate("openGame('pairs')"); await pg.wait_for_timeout(500)
        deck=await pg.evaluate("gameData.saves.pairs.deck")
        await pg.click(".pr-card >> nth=0"); await pg.click(".pr-card >> nth=1"); await pg.wait_for_timeout(200)
        mism = deck[0]!=deck[1]
        await pg.wait_for_timeout(1000)
        if mism: check("mismatched cards turn back over", await pg.evaluate("document.querySelectorAll('.pr-card.up').length")==0)
        seen=set()
        for i,k in enumerate(deck):
            if k in seen: continue
            j=[x for x in range(len(deck)) if deck[x]==k and x!=i][0]; seen.add(k)
            await pg.click(f".pr-card >> nth={i}"); await pg.click(f".pr-card >> nth={j}"); await pg.wait_for_timeout(60)
        await pg.wait_for_timeout(900)
        check("Pairs win", "All pairs found" in await pg.inner_text("#game-banner"), (await pg.inner_text("#game-status")).replace("\n"," "))
        await pg.click("#game-tools button[data-value=hard]"); await pg.wait_for_timeout(300)
        check("Pairs hard has 24 cards", await pg.evaluate("document.querySelectorAll('.pr-card').length")==24)
        await pg.evaluate("document.querySelectorAll('.pr-card').forEach(e=>e.classList.add('up'))"); await pg.wait_for_timeout(500)
        check("no page errors (1.12 features)", not errs, str(errs))

        # ---- 1.13: default folders and the hierarchical tile menu (short viewport, deep folders)
        pg,errs=await fresh(b)
        shape=await pg.evaluate(SHAPE)
        check("defaults: Google folder", shape.startswith("Google[Google,Gmail,Maps,Drive,Calendar,Photos,News]"), shape)
        check("defaults: Entertainment folder", "Entertainment[Netflix,YouTube,Hulu,Max,Disney+,Prime Video,Apple TV+,Spotify,Twitch]" in shape, shape)
        # lots of folders, some nested, so the old flat "Move to folder" list would run off the screen
        await pg.evaluate("""(()=>{const kids=[];for(let i=1;i<=14;i++)kids.push({id:'nf'+i,type:'folder',title:'Sub '+i,color:'#2b5797',size:'small',children:[]});
          kids[0].children.push({id:'deep',type:'folder',title:'Deep',color:'#2b5797',size:'small',children:[]});
          tiles.push({id:'many',type:'folder',title:'Many',color:'#2b5797',size:'medium',children:kids});
          for(let i=1;i<=10;i++)tiles.push({id:'top'+i,type:'folder',title:'Top '+i,color:'#00a300',size:'small',children:[]}); commit();})()""")
        await pg.set_viewport_size({"width":1280,"height":560}); await pg.wait_for_timeout(300)
        await pg.click("#grid [title^='Wikipedia']", button="right"); await pg.wait_for_timeout(150)
        dele=await pg.evaluate("(()=>{const d=[...document.querySelectorAll('#ctx .ctx-panel[data-level=\"0\"] .ctx-item')].find(e=>e.textContent==='Delete');const r=d&&d.getBoundingClientRect();return r?[r.top,r.bottom,innerHeight]:null})()")
        check("menu: Delete is on screen", bool(dele) and dele[0]>=0 and dele[1]<=dele[2], dele)
        check("menu: top level is short", await pg.evaluate("document.querySelectorAll('#ctx .ctx-panel[data-level=\"0\"] > *').length") <= 8)
        await pg.hover("#ctx .ctx-item >> text=Move to folder"); await pg.wait_for_timeout(400)
        check("menu: hovering opens the Move submenu", await pg.evaluate("!!document.querySelector('#ctx .ctx-panel[data-level=\"1\"]')"))
        sub=await pg.evaluate("(()=>{const p=document.querySelector('#ctx .ctx-panel[data-level=\"1\"]').getBoundingClientRect();return [p.top,p.bottom,p.left,p.right,innerWidth,innerHeight]})()")
        check("menu: submenu fits in the window", sub[0]>=0 and sub[1]<=sub[5] and sub[2]>=0 and sub[3]<=sub[4], sub)
        await pg.click("#ctx .ctx-panel[data-level='1'] .ctx-item.has-sub >> text=Many"); await pg.wait_for_timeout(200)
        lvl2=await pg.evaluate("[...document.querySelectorAll('#ctx .ctx-panel[data-level=\"2\"] .ctx-item')].map(e=>e.textContent)")
        check("menu: nested folders open as a deeper submenu", lvl2[:1]==["Into “Many”"] and any("Sub 1" in x for x in lvl2), lvl2)
        await pg.click("#ctx .ctx-panel[data-level='2'] .ctx-item.has-sub >> text=Sub 1"); await pg.wait_for_timeout(200)
        await pg.click("#ctx .ctx-panel[data-level='3'] .ctx-item >> text=Deep"); await pg.wait_for_timeout(300)
        moved=await pg.evaluate("findTile(tiles.find(t=>t.title==='Wikipedia')?.id||'x')")
        where=await pg.evaluate("(()=>{const x=everyTile().find(e=>e.tile.title==='Wikipedia');return x?x.path.map(p=>p.title).join('/'):null})()")
        check("menu: picking a deep folder moves the tile there", where=="Many/Sub 1/Deep" and await pg.evaluate("document.querySelector('#ctx').hidden"), where)
        # keyboard: → opens a submenu, ← closes it, Esc closes the menu
        await pg.click("#grid [title^='Amazon']", button="right"); await pg.wait_for_timeout(100)
        await pg.focus("#ctx .ctx-panel[data-level='0'] .has-sub"); await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(100)
        k1=await pg.evaluate("document.activeElement.closest('.ctx-panel')?.dataset.level")
        await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(100)
        k2=await pg.evaluate("[document.activeElement.textContent, document.querySelectorAll('#ctx .ctx-panel').length]")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(100)
        check("menu: keyboard → / ← / Esc", k1=="1" and k2[0].startswith("Move to folder") and k2[1]==1 and await pg.evaluate("document.querySelector('#ctx').hidden"), (k1,k2))
        # a folder can't be moved into itself or its own subfolders
        await pg.click("#grid [title^='Many']", button="right"); await pg.hover("#ctx .ctx-item >> text=Move to folder"); await pg.wait_for_timeout(400)
        l1=await pg.evaluate("[...document.querySelectorAll('#ctx .ctx-panel[data-level=\"1\"] .ctx-item')].map(e=>e.textContent)")
        check("menu: a folder isn't offered as its own target", not any(x.startswith("Many") for x in l1), l1)
        await pg.keyboard.press("Escape")
        check("no page errors (1.13 menu)", not errs, str(errs))

        await b.close()
    print(f"\n{sum(ok for _,ok in results)}/{len(results)} passed")
asyncio.run(main())
sys.exit(0 if all(ok for _, ok in results) else 1)
