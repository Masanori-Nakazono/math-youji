#!/usr/bin/env node
'use strict';
// All checks use real pointer input in disposable profiles. DOM existence alone
// misses hidden ordinal animals, overlapping pair buttons and basket occlusion.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/javascript'});res.end(e?'not found':b);});
});
const viewports=[{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1024,height:768}];
(async()=>{
  let browser;
  try{
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
    const page=await browser.newPage({serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'Asia/Tokyo'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route('https://**',r=>r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/dist/kazu-no-bouken.html`,{waitUntil:'domcontentloaded'});
    await page.evaluate(()=>{
      const K=KazuApp;K.Sound.hush();K.Sound.voiceOn=false;K.Sound.sfxOn=false;
      K.Sound.say=(text,opts)=>{if(opts&&opts.onend)opts.onend();};
      K.Session._test.intro(false);K.Session._test.overview(false);K.Session._test.breaks(false);
    });
    const settle=async()=>{
      await page.evaluate(()=>new Promise(resolve=>{
        document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect.getTiming().iterations))try{a.finish();}catch(e){}});
        requestAnimationFrame(()=>requestAnimationFrame(resolve));
      }));
    };
    const start=async(id,level,pattern='',count=0)=>{
      await page.evaluate(({id,level,pattern,count})=>{
        const K=KazuApp,S=K.Session._test;
        for(let i=0;i<1000;i++){
          K.Store.reset();K.Store.setPref('g1Open',true);K.Session.startLevel(K.Games.byId[id],level);
          S.flushTimers();
          const repeated=id==='pattern'?'#play .pattern-train .car':id==='count'?'#play .obj':'#play .queue .qi';
          if((!pattern||new RegExp(pattern).test(S.item))&&(!count||document.querySelectorAll(repeated).length>=count))return;
        }
        throw new Error('Could not find '+id+' '+pattern+' count '+count);
      },{id,level,pattern,count});await settle();
    };
    const state=()=>page.evaluate(()=>{const K=KazuApp,T=K.Session._test;return {count:K.Store.todayCount(),wrong:T.wrongThisQ,helped:T.helped,taught:T.taughtQ,item:T.item};});
    const geometry=async(selector,min=0)=>{
      await settle();
      const data=await page.locator(selector).evaluateAll(nodes=>nodes.map(n=>{
        const r=n.getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        const f=n.closest('.playfield')?.getBoundingClientRect();
        return {text:n.textContent,cls:n.className,x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,hit:e===n||n.contains(e),field:f?{x:f.x,y:f.y,right:f.right,bottom:f.bottom}:null};
      }));
      assert.ok(data.length,'nonempty '+selector);
      const v=page.viewportSize();
      for(const d of data){
        assert.ok(d.x>=-1&&d.y>=-1&&d.right<=v.width+1&&d.bottom<=v.height+1,'fully visible '+selector+' '+JSON.stringify(d));
        assert.ok(d.w>=min-.1&&d.h>=min-.1,'usable size '+selector+' '+JSON.stringify(d));
        assert.ok(d.hit,'pointer centre reaches '+selector+' '+JSON.stringify(d));
        if(d.field)assert.ok(d.x>=d.field.x-2&&d.y>=d.field.y-2&&d.right<=d.field.right+2&&d.bottom<=d.field.bottom+2,'picture stays inside its playfield '+selector+' '+JSON.stringify(d));
      }
      for(let i=0;i<data.length;i++)for(let j=i+1;j<data.length;j++){
        const a=data[i],b=data[j],x=Math.min(a.right,b.right)-Math.max(a.x,b.x),y=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
        assert.ok(x<=1||y<=1,'no overlapping targets '+selector+' '+JSON.stringify([a,b]));
      }
      return data;
    };
    const click=async(selector,index=0)=>{
      await settle();const box=await page.locator(selector).nth(index).boundingBox();assert.ok(box,selector+' exists');
      await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    };
    const screenshot=async(label)=>{if(process.env.PLAYFIELD_SCREENSHOTS){fs.mkdirSync(process.env.PLAYFIELD_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYFIELD_SCREENSHOTS,label+'.png')});}};
    const ordinalChoice=()=>page.viewportSize().width<=700?'#play .ordinal-choice':'#play .queue .qi';
    const pairAll=async()=>{
      const sizes=await page.evaluate(()=>[...document.querySelectorAll('#play .pairrow')].map(n=>n.querySelectorAll('.pairitem').length));
      for(let i=0;i<Math.min(...sizes);i++){
        await click('#play .pairrow:first-child .pairitem',i);await click('#play .pairrow:last-child .pairitem',i);
      }
      await page.evaluate(()=>KazuApp.Session._test.flushTimers());await settle();
      assert.equal(await page.locator('#play .pairitem.paired').count(),Math.min(...sizes)*2,'exactly one partner on each side');
      return sizes;
    };
    const expectPairPositions=async()=>{
      const rows=await page.evaluate(()=>[...document.querySelectorAll('#play .pairrow')].map(row=>[...row.children].map(n=>{
        const r=n.getBoundingClientRect();
        return {x:r.x,col:n.style.getPropertyValue('--pair-col'),row:n.style.getPropertyValue('--pair-row')};
      })));
      assert.equal(rows[0].length,rows[1].length,'filling the short side leaves equal numbers');
      rows.forEach((items,side)=>items.forEach((item,i)=>{
        assert.equal(+item.col,i%5+1,'surviving cells receive consecutive pair columns');
        assert.equal(+item.row,Math.floor(i/5)*3+side+1,'surviving cells stay in the corresponding pair block');
        assert.ok(Math.abs(item.x-rows[1-side][i].x)<1,'completed counterparts stay vertically aligned');
      }));
    };
    // Selecting later empty cells must compact both sides by pair position after
    // unused cells disappear; DOM removal alone left the filled cells offset.
    for(const viewport of [viewports[0],viewports[1]]){
      await page.setViewportSize(viewport);let found=false;
      for(let attempt=0;attempt<40;attempt++){
        await start('g1pair',2,'^g1pair:same1to1:8-5$');await pairAll();
        if(await page.locator('#play .pairslot').count()===5){found=true;break;}
      }
      assert.ok(found,'build a three-short, five-empty-cell question');
      for(const i of [2,3,4])await click('#play .pairslot',i);
      assert.equal(await page.locator('#play .pairslot').count(),3,'the two unused early cells are removed');
      await expectPairPositions();await geometry('#play .pairitem, #play .pairslot',48);
      await page.evaluate(()=>KazuApp.Session._test.flushTimers());
      assert.equal((await state()).count,1,'later-cell completion counts exactly one answer');
      console.log('PASS '+viewport.width+'px filling the last three empty cells preserves all eight pair positions');
    }
    // A walk can finish the pairing stage itself. Resetting its instructions must
    // enable the next stage's help without cancelling that walk's completion.
    for(const viewport of [viewports[0],viewports[3]]){
      await page.setViewportSize(viewport);
      await start('g1pair',1,'^g1pair:diff1to1:9-');
      await click('#play .showbtn');await click('#play .showbtn');
      await page.evaluate(()=>KazuApp.Session._test.flushTimers(200));await settle();
      assert.equal(await page.locator('#play .choices.pad').count(),1,'two help presses finish pairing and reveal the difference pad');
      assert.equal(await page.locator('#play').evaluate(n=>n.classList.contains('walking')),false,'completed pairing walk releases input');
      assert.equal((await state()).count,0,'a demonstrated pair is not a completed difference answer');
      assert.equal((await state()).helped,true);
      assert.equal(await page.locator('#play .feedback').isHidden(),true,'old pairing instructions are cleared');
      const leftovers=await page.locator('#play .pairitem.leftover').count();assert.ok(leftovers>0);
      assert.equal(await page.locator('#play .pairitem.leftover .ctag').count(),0);
      await click('#play .showbtn');
      assert.match(await page.locator('#play .feedback').textContent(),/あまった/,'the next help press gives the current leftover instructions');
      assert.equal(await page.locator('#play .pairitem.leftover.coachable').count(),leftovers,'the next stage hands over its counting tool');
      for(let i=0;i<leftovers;i++)await click('#play .pairitem.leftover',i);
      assert.deepEqual(await page.locator('#play .pairitem.leftover .ctag').allTextContents(),Array.from({length:leftovers},(_,i)=>String(i+1)),'leftovers can be counted by real pointer after the previous walk');
      assert.equal((await state()).helped,true,'new help preserves supported grading');
      await click('#play .padkey',leftovers);
      assert.equal((await state()).count,1);
      assert.equal(await page.evaluate(()=>KazuApp.Store.savedSession().firstTryRight),0,'a walked pairing is not recorded as an independent gold answer');
      assert.equal(await page.evaluate(()=>KazuApp.Store.savedSession().results[0]),'miss');
      console.log('PASS '+viewport.width+'px repeated pair walk permits current difference help and preserves supported grading');

      await page.evaluate(()=>{
        const K=KazuApp,T=K.Session._test;K.Store.reset();K.Store.setPref('g1Open',true);T.intro(true);
        K.Session.startLevel(K.Games.byId.g1pair,1);
      });
      try{
        assert.equal(await page.evaluate(()=>KazuApp.Session._test.introStep),'show');
        assert.equal(await page.locator('#play').evaluate(n=>n.classList.contains('walking')),true);
        await page.evaluate(()=>KazuApp.Session._test.flushTimers(400));await settle();
        assert.deepEqual(await page.evaluate(()=>({idx:KazuApp.Session._test.idx,intro:KazuApp.Session._test.introStep})),{idx:1,intro:'together'},'the initial demonstration completes both pairing and the difference');
        assert.equal(await page.locator('#play').evaluate(n=>n.classList.contains('walking')),false,'the together question accepts the child\'s input');
        const together=await pairAll();await click('#play .padkey',Math.abs(together[0]-together[1]));
        await page.evaluate(()=>KazuApp.Session._test.flushTimers(200));await settle();
        assert.deepEqual(await page.evaluate(()=>({idx:KazuApp.Session._test.idx,intro:KazuApp.Session._test.introStep})),{idx:2,intro:null},'the child moves from together to independent practice');
        assert.equal((await state()).helped,false,'independent practice starts without support attached');
        const independent=await pairAll();await click('#play .padkey',Math.abs(independent[0]-independent[1]));
        assert.equal(await page.evaluate(()=>KazuApp.Store.savedSession().firstTryRight),1,'only the child\'s independent answer enters the clean score');
        assert.deepEqual(await page.evaluate(()=>KazuApp.Store.savedSession().results.slice(0,3)),['introdone','introdone','done']);
        assert.equal(await page.evaluate(()=>KazuApp.Store.plays('g1pair',1)),0,'three introductory steps do not fabricate a course clear');
        console.log('PASS '+viewport.width+'px first pair lesson advances show → together → independent with correct grading');
      }finally{await page.evaluate(()=>KazuApp.Session._test.intro(false));}
    }
    for(const viewport of viewports){
      await page.setViewportSize(viewport);
      // Even the last of eight animals is visible; all four directions keep the
      // same sequence and use the same grading path as direct animal taps.
      for(const dir of ['front','back','left','right']){
        await start('ordinal',dir==='front'?0:1,'^ordinal:ord:'+dir+':',dir==='front'?6:8);
        await geometry('#play .queue .qi');
        const targets=await geometry(ordinalChoice(),viewport.width<=700?64:64),before=await state();
        const m=/:ord:([^:]+):(\d+)$/.exec(before.item),n=targets.length,answer=['front','left'].includes(m[1])?+m[2]-1:n-+m[2];
        await click(ordinalChoice(),answer===0?1:0);
        assert.equal((await state()).wrong,1,'wrong ordinal pointer is recorded once');
        await click('#play .showbtn');await geometry(ordinalChoice(),64);await geometry('#play .queue .qi');
        await click(ordinalChoice(),answer);
        assert.equal((await state()).count,1,'one revised ordinal answer is counted once');
      }
      for(const mode of ['ko','me']){
        await start('ordinal',1,'^ordinal:ovc:'+mode+':',7);await geometry('#play .queue .qi');await geometry(ordinalChoice(),64);
        const k=+(await state()).item.split(':').at(-1);
        if(mode==='ko'){
          await click(ordinalChoice(),0);assert.equal(await page.locator('#play .queue .qi.marked').count(),1);
          await click(ordinalChoice(),0);assert.equal(await page.locator('#play .queue .qi.marked').count(),0,'same animal can be deselected');
          for(let i=0;i<k;i++)await click(ordinalChoice(),i);
        }else await click(ordinalChoice(),k-1);
        assert.equal((await state()).count,1,'cardinal versus ordinal meaning is retained');
      }
      // The initial and filled basket cannot cover another target, even at the
      // maximum fourteen objects and after the spoken/manual hint adds a label.
      await start('count',2,'^count:give:10$',14);assert.equal(await page.locator('#play .obj').count(),14);
      await geometry('#play .obj',48);
      const boxes=await page.locator('#play .obj, #play .basket').evaluateAll(nodes=>nodes.map(n=>{let r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
      const basket=boxes.pop();assert.ok(boxes.every(o=>o.bottom<=basket.y+1),'basket reserves its own row');
      const total=await page.locator('#play .obj').count();
      for(let i=0;i<total;i++){
        await click('#play .obj',i);assert.equal(await page.locator('#play .obj.picked').count(),i+1,'each available object receives its own real tap');
      }
      await geometry('#play .obj',48);
      for(let i=0;i<total;i++)await click('#play .obj',i);
      await click('#play .choices > button');assert.equal((await state()).wrong,1);
      await click('#play .showbtn');await geometry('#play .obj',48);await screenshot('basket-'+viewport.width);
      for(let i=0;i<10;i++)await click('#play .obj',i);
      await click('#play .choices > button');assert.equal((await state()).count,1,'collection after help counts once');
      // Pair positions remain aligned within each five-position block. The
      // pointer uses 65% of the width, which used to hit the next button.
      for(const level of [0,1,2]){
        await start('g1pair',level,level===1?'^g1pair:diff1to1:9-':'');
        await geometry('#play .pairitem',viewport.width<=700?48:64);
        const aligned=await page.evaluate(()=>{
          const rows=[...document.querySelectorAll('#play .pairrow')].map(r=>[...r.children]);
          return rows[0].slice(0,Math.min(...rows.map(r=>r.length))).every((n,i)=>Math.abs(n.getBoundingClientRect().x-rows[1][i].getBoundingClientRect().x)<1);
        });assert.ok(aligned,'counterparts share their column in every block');
        const first=await page.locator('#play .pairrow:first-child .pairitem').first().boundingBox();
        await page.mouse.click(first.x+first.width*.65,first.y+first.height*.5);
        assert.equal(await page.locator('#play .pairrow:first-child .pairitem.marked').first().evaluate(n=>[...n.parentElement.children].indexOf(n)),0,'side tap still selects the first item');
        await click('#play .showbtn');await geometry('#play .pairitem',viewport.width<=700?48:64);
        const sizes=await pairAll();
        assert.equal(await page.locator('#play .feedback').isHidden(),true,'pairing hint is cleared when the question moves to leftovers');
        assert.equal((await state()).helped,true,'clearing old guidance preserves supported grading');
        await click('#play .showbtn');
        await page.evaluate(()=>KazuApp.Session._test.flushTimers());
        const currentHint=await page.locator('#play .feedback').textContent();
        assert.equal(/うえを.*したを/.test(currentHint),false,'new help refers to the current leftover/difference question');
        assert.ok(currentHint.trim());
        const compact=viewport.width<=700&&viewport.height<=700&&await page.locator('#play .choices.pad').count();
        await geometry('#play .pairitem',compact?0:viewport.width<=700?48:64);
        assert.equal(await page.locator('#play .pairitem.leftover').count(),Math.abs(sizes[0]-sizes[1]),'only unpaired objects become leftovers');
        await screenshot('pair-'+viewport.width+'-'+level);
        if(level===0){
          const answer=await page.evaluate(sizes=>sizes[0]===sizes[1]?'おなじ':document.querySelectorAll('#play .pairrow')[sizes[0]>sizes[1]?0:1].firstElementChild.firstChild.textContent,sizes);
          const i=await page.locator('#play .choices .choice').evaluateAll((nodes,a)=>nodes.findIndex(n=>n.textContent===a),answer);
          assert.ok(i>=0);
          await click('#play .choices .choice',i);
        }else if(level===1){
          const answer=Math.abs(sizes[0]-sizes[1]);await click('#play .padkey',answer);
        }else{
          const slots=await page.locator('#play .pairslot').count(),need=Math.abs(sizes[0]-sizes[1]);
          if(slots){
            await geometry('#play .pairslot',viewport.width<=700?48:64);
            for(let i=slots-need;i<slots;i++)await click('#play .pairslot',i);
            await expectPairPositions();await page.evaluate(()=>KazuApp.Session._test.flushTimers());
          }
          else await click('#play .padkey',need);
        }
        assert.equal((await state()).count,1,'one paired question completes without input obstruction');
      }
      // Ten picture-only pattern cars stay on a single visible line. Answer
      // buttons retain their regular tap size, including after hint/teaching.
      await start('pattern',2,'^pattern:pat:',10);await geometry('#play .pattern-train .car');
      assert.equal(await page.locator('#play .pattern-train').evaluate(n=>{
        const css=getComputedStyle(n);
        return !['auto','scroll','hidden','clip'].includes(css.overflowX);
      }),true,'the complete pattern is visible without a clipped or scrolling container');
      const wrongPattern=await page.evaluate(()=>{
        const kind=KazuApp.Session._test.item.split(':')[2],cars=[...document.querySelectorAll('#play .car')],at=cars.findIndex(c=>c.classList.contains('now'));
        const answer=cars[at%({AB:2,AAB:3,ABB:3,ABC:3,ABBA:4}[kind])].textContent;
        return [...document.querySelectorAll('#play .choices .choice')].findIndex(n=>n.textContent!==answer);
      });
      await click('#play .choices .choice',wrongPattern);assert.equal((await state()).wrong,1);
      await click('#play .showbtn');await geometry('#play .pattern-train .car');
      for(let i=0;i<2;i++){
        const answer=await page.evaluate(()=>{
          const kind=KazuApp.Session._test.item.split(':')[2],cars=[...document.querySelectorAll('#play .car')],at=cars.findIndex(c=>c.classList.contains('now'));
          return cars[at%({AB:2,AAB:3,ABB:3,ABC:3,ABBA:4}[kind])].textContent;
        });
        const index=await page.locator('#play .choices .choice').evaluateAll((ns,a)=>ns.findIndex(n=>n.textContent===a),answer);
        assert.ok(index>=0);await click('#play .choices .choice',index);
        if(i===0){await page.evaluate(()=>KazuApp.Session._test.flushTimers());await geometry('#play .pattern-train .car');}
      }
      assert.equal((await state()).count,1,'two pattern holes count as one question');
      await start('ordinal',1,'^ordinal:ord:back:',8);
      const m=/:ord:[^:]+:(\d+)$/.exec((await state()).item),n=await page.locator('#play .queue .qi').count(),wrong=n-+m[1]===0?1:0;
      for(let i=0;i<5;i++){await click(ordinalChoice(),wrong);await page.evaluate(()=>KazuApp.Session._test.flushTimers());}
      await geometry(ordinalChoice(),64);await geometry('#play .teachbtn',44);await geometry('#play .queue .qi');
      await click('#play .teachbtn');await page.evaluate(()=>KazuApp.Session._test.flushTimers());
      assert.equal((await state()).count,1,'teaching remains reachable and counts one question');
      assert.equal(await page.evaluate(()=>KazuApp.Store.savedSession().firstTryRight),0,'teaching keeps independent success separate');
      assert.equal(await page.evaluate(()=>KazuApp.Store.savedSession().results[0]),'miss');
      console.log('PASS '+viewport.width+'×'+viewport.height+' ordinal, collection, pairing, pattern, hint and teaching pointer flows');
    }
    // Rotation retains the generated animals, their order and grading, while
    // switching from the direct picture to the equivalent large answer buttons.
    await page.setViewportSize({width:1024,height:768});await start('ordinal',1,'^ordinal:ord:right:',8);
    const item=(await state()).item,animals=await page.locator('#play .queue .qi').allTextContents();
    await page.setViewportSize({width:320,height:568});await geometry('#play .ordinal-choice',64);await geometry('#play .queue .qi');
    assert.equal((await state()).item,item);assert.deepEqual(await page.locator('#play .queue .qi').allTextContents(),animals);
    await click('#play .ordinal-choice',animals.length-+item.split(':').at(-1));assert.equal((await state()).count,1);
    assert.deepEqual(errors,[]);console.log('PASS rotation preserves the full question and no browser errors');
  }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
