import Head from 'next/head';
import { useEffect } from 'react';
import { db } from '../lib/firebase';

export default function Home() {
  useEffect(() => {
    var D = {
      popups: [], joints: [],
      curP: null, curJ: null, tab: 0, at: 'popup',
      opc: {}, ojp: {}, am: {}
    };

    var DB_PATH = 'popupManagerData';
    var fbRef, fbSet, fbGet;
    var pendingSave = false;
    var firebaseLoaded = false;

    // ── STORAGE ──
    function saveData() {
      if (!db || !fbRef || !fbSet) { pendingSave = true; return; }
      pendingSave = false;
      fbSet(fbRef(db, DB_PATH), { popups: D.popups, joints: D.joints, am: D.am })
        .catch(function(e){ console.error('saveData error:', e); });
      var el = document.getElementById('saveIndicator');
      if (el) {
        el.style.opacity = '1';
        clearTimeout(el._t);
        el._t = setTimeout(function(){ el.style.opacity = '0'; }, 1200);
      }
    }

    // Firebaseは空配列を保存しないので、ロード時にオブジェクトになる場合がある
    function toArr(v) { if (!v) return []; if (Array.isArray(v)) return v; return Object.values(v); }

    function normPopup(p) {
      p.products  = toArr(p.products);
      p.members   = toArr(p.members);
      p.persons   = toArr(p.persons);
      p.thresholds= toArr(p.thresholds).length ? toArr(p.thresholds) : [{thresh:'',count:1,cur:'KRW'}];
      if (!p.orders) p.orders = {};
      if (!p._pg)    p._pg = 'products';
      return p;
    }
    function normJoint(j) {
      j.jproducts = toArr(j.jproducts).map(function(jp){ jp.buyers = toArr(jp.buyers); return jp; });
      return j;
    }

    async function loadData() {
      if (!db || !fbRef || !fbGet) return;
      try {
        var snapshot = await fbGet(fbRef(db, DB_PATH));
        if (snapshot.exists()) {
          var saved = snapshot.val();
          if (saved.popups) {
            var incoming = toArr(saved.popups).map(normPopup);
            if (!D.popups.length) {
              D.popups = incoming;
            } else {
              var existingIds = D.popups.map(function(p){ return p.id; });
              incoming.forEach(function(p){ if(existingIds.indexOf(p.id)<0) D.popups.unshift(p); });
            }
          }
          if (saved.joints) {
            var incomingJ = toArr(saved.joints).map(normJoint);
            if (!D.joints.length) {
              D.joints = incomingJ;
            } else {
              var existingJIds = D.joints.map(function(j){ return j.id; });
              incomingJ.forEach(function(j){ if(existingJIds.indexOf(j.id)<0) D.joints.unshift(j); });
            }
          }
          if (saved.am) {
            for (var k in saved.am) { if (!D.am[k]) D.am[k] = toArr(saved.am[k]); }
          }
        }
      } catch(e) { console.error('loadData error:', e); }
    }

    // ── UTILS ──
    function uid(){ return '_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function fJ(n){ var v=Number(n)||0; return v ? '¥'+v.toLocaleString() : '—'; }
    function fB(k,j){ var kn=Number(k)||0,jn=Number(j)||0; if(kn&&jn) return '₩'+kn.toLocaleString()+' / ¥'+jn.toLocaleString(); if(kn) return '₩'+kn.toLocaleString(); if(jn) return '¥'+jn.toLocaleString(); return '—'; }
    function findP(id){ return D.popups.find(function(x){ return x.id===id; }); }
    function findJ(id){ return D.joints.find(function(x){ return x.id===id; }); }
    function eOrd(p,person,pid){
      if(!p.orders[person]) p.orders[person]={};
      if(!p.orders[person][pid]) p.orders[person][pid]={mbQ:{},noQ:0,chk:false};
      return p.orders[person][pid];
    }
    function tQ(o){ var s=0; for(var k in o.mbQ) s+=o.mbQ[k]; return s+(o.noQ||0); }
    function psnTot(p,person){
      var k=0,j=0;
      p.products.forEach(function(pr){
        var o=(p.orders[person]||{})[pr.id]; if(!o) return;
        var q=tQ(o); k+=(Number(pr.price_krw)||0)*q; j+=(Number(pr.price_jpy)||0)*q;
      });
      return {k:k,j:j};
    }
    function grandTot(p){ var k=0,j=0; p.persons.forEach(function(pi){ var t=psnTot(p,pi.name); k+=t.k; j+=t.j; }); return {k:k,j:j}; }
    function mbTot(p,m){
      var k=0,j=0;
      p.persons.forEach(function(pi){
        var ord=p.orders[pi.name]||{};
        p.products.forEach(function(pr){
          var o=ord[pr.id]; if(!o) return;
          var q=(o.mbQ||{})[m]||0; k+=(Number(pr.price_krw)||0)*q; j+=(Number(pr.price_jpy)||0)*q;
        });
      });
      return {k:k,j:j};
    }
    function cBonus(k,j,p){ var n=0; (p.thresholds||[]).forEach(function(t){ var th=Number(t.thresh)||0,val=(t.cur==='JPY')?j:k; if(th>0&&val>=th) n+=Math.floor(val/th)*Number(t.count||1); }); return n; }
    function cStats(p){ var t=0,c=0; p.persons.forEach(function(pi){ var ord=p.orders[pi.name]||{}; p.products.forEach(function(pr){ var o=ord[pr.id]; if(!o)return; if(tQ(o)>0){t++;if(o.chk)c++;} }); }); return {t:t,c:c}; }
    function getAM(pid,pi,rid){ var k=pid+'_'+pi+'_'+rid; if(!D.am[k])D.am[k]=[]; return D.am[k]; }

    // ── EVENT DELEGATION ──
    function handleAction(act, el) {
      var d = el.dataset;
      if (act === 'openMov') openMov();
      else if (act === 'closeMov') closeMov();
      else if (act === 'setAT') setAT(d.v);
      else if (act === 'doCreate') doCreate();
      else if (act === 'goTab') goTab(+d.n);
      else if (act === 'openP') { D.curP = d.id; try{sessionStorage.setItem('dpm_curP',d.id);}catch(e){} goTab(1); }
      else if (act === 'openJ') { D.curJ = d.id; try{sessionStorage.setItem('dpm_curJ',d.id);}catch(e){} goTab(2); }
      else if (act === 'switchP') { D.curP = null; try{sessionStorage.removeItem('dpm_curP');}catch(e){} rPopup(); }
      else if (act === 'switchJ') { D.curJ = null; try{sessionStorage.removeItem('dpm_curJ');}catch(e){} rJoint(); }
      else if (act === 'delP') delP(d.id);
      else if (act === 'delJ') delJ(d.id);
      else if (act === 'setPg') setPg(d.id, d.pg);
      else if (act === 'aPr') aPr(d.id);
      else if (act === 'dPr') dPr(d.id, d.rid);
      else if (act === 'aMb') aMb(d.id);
      else if (act === 'dMb') dMb(d.id, d.m);
      else if (act === 'aPsn') aPsn(d.id);
      else if (act === 'dPsn') dPsn(d.id, d.n);
      else if (act === 'aTh') aTh(d.id);
      else if (act === 'dTh') dTh(d.id, +d.i);
      else if (act === 'togPc') togPc(d.id, +d.pi);
      else if (act === 'togPI') togPI(d.id, +d.pi, d.f);
      else if (act === 'togChk') togChk(d.id, +d.pi, d.rid);
      else if (act === 'addAM') addAM(d.id, +d.pi, d.rid);
      else if (act === 'remAM') remAM(d.id, +d.pi, d.rid, d.m);
      else if (act === 'cMQ') cMQ(d.id, +d.pi, d.rid, d.m, +d.delta);
      else if (act === 'cNQ') cNQ(d.id, +d.pi, d.rid, +d.delta);
      else if (act === 'togJp') togJp(d.id, +d.pi);
      else if (act === 'aJProd') aJProd(d.id);
      else if (act === 'dJProd') dJProd(d.id, +d.pi);
      else if (act === 'aBuyer') aBuyer(d.id, +d.pi);
      else if (act === 'dBuyer') dBuyer(d.id, +d.pi, +d.bi);
      else if (act === 'togBuyerBool') togBuyerBool(d.id, +d.pi, +d.bi, d.f);
    }
    function handleChange(act, el) {
      var d = el.dataset, v = el.type === 'checkbox' ? el.checked : el.value;
      if (act === 'updPI') updPI(d.id, +d.pi, d.f, v);
      else if (act === 'updTh') { var p=findP(d.id); if(p) p.thresholds[+d.i][d.f]=v; }
      else if (act === 'updPr') updPr(d.id, d.rid, d.f, v);
      else if (act === 'updJProdName') updJProdName(d.id, +d.pi, v);
      else if (act === 'updBuyer') updBuyer(d.id, +d.pi, +d.bi, d.f, v);
    }

    var clickHandler = function(e) {
      var t = e.target;
      if (t.id === 'mov') { closeMov(); return; }
      while (t && t !== document) {
        var act = t.getAttribute('data-a');
        if (act) { handleAction(act, t); return; }
        t = t.parentElement;
      }
    };
    var changeHandler = function(e) {
      var t = e.target, act = t.getAttribute('data-ch');
      if (act) handleChange(act, t);
    };
    var inputHandler = function(e) {
      var t = e.target, act = t.getAttribute('data-inp');
      if (act) handleChange(act, t);
    };
    var keydownHandler = function(e) {
      if (e.key !== 'Enter') return;
      var t = e.target, act = t.getAttribute('data-enter');
      if (act) handleAction(act, t);
    };
    document.addEventListener('click', clickHandler);
    document.addEventListener('change', changeHandler);
    document.addEventListener('input', inputHandler);
    document.addEventListener('keydown', keydownHandler);

    // ── MODAL ──
    function openMov(){
      document.getElementById('mov').classList.add('show');
      setTimeout(function(){ document.getElementById('aN').focus(); }, 200);
    }
    function closeMov(){ document.getElementById('mov').classList.remove('show'); }
    function setAT(t) {
      D.at = t;
      var bp=document.getElementById('tPop'), bj=document.getElementById('tJnt');
      bp.style.borderColor = t==='popup'?'var(--ac)':'var(--bd)';
      bp.style.color = t==='popup'?'var(--ac)':'var(--tx2)';
      bj.style.borderColor = t==='joint'?'var(--ac)':'var(--bd)';
      bj.style.color = t==='joint'?'var(--ac)':'var(--tx2)';
    }
    function doCreate() {
      var n = document.getElementById('aN').value.trim();
      if (!n) { alert('名前を入力してください'); return; }
      var g = document.getElementById('aG').value.trim(), dt = document.getElementById('aD').value;
      if (D.at === 'popup') {
        var p = {id:uid(),name:n,group:g,date:dt,products:[],members:[],persons:[],orders:{},thresholds:[{thresh:'',count:1,cur:'KRW'}],_pg:'products'};
        D.popups.push(p); D.curP = p.id; saveData(); closeMov(); clearMov(); goTab(1);
      } else {
        var j = {id:uid(),name:n,group:g,date:dt,jproducts:[]};
        D.joints.push(j); D.curJ = j.id; saveData(); closeMov(); clearMov(); goTab(2);
      }
    }
    function clearMov(){ ['aN','aG','aD'].forEach(function(id){ document.getElementById(id).value=''; }); }

    // ── TAB ──
    function goTab(n) {
      D.tab = n;
      try { sessionStorage.setItem('dpm_tab', n); } catch(e) {}
      ['scHome','scPopup','scJoint','scStats'].forEach(function(id,i){
        document.getElementById(id).className = 'scr' + (i===n?' on':'');
      });
      for (var i=0;i<4;i++) document.getElementById('tb'+i).className = 'tb'+(i===n?' on':'');
      if (n===0) rHome();
      else if (n===1) rPopup();
      else if (n===2) rJoint();
      else rStats();
    }

    // ── HOME ──
    function rHome(){
      var el=document.getElementById('scHome'), h='';
      if(!D.popups.length && !D.joints.length){
        el.innerHTML='<div class="empty"><div class="empty-ico">🎪</div><div class="empty-ttl">案件がありません</div><p>「＋ 新規作成」から追加してください</p></div>'; return;
      }
      if(D.popups.length){
        h+='<div class="st">🛍 代行</div>';
        D.popups.forEach(function(p){
          var gt=grandTot(p),cc=cStats(p);
          h+='<div class="hcard" data-a="openP" data-id="'+p.id+'">'
            +'<div class="hcard-av av-p">🎪</div>'
            +'<div class="hcard-body"><div class="hcard-name">'+esc(p.name)+'</div><div class="hcard-meta">'+(p.group?esc(p.group)+'　':'')+(p.date||'')+'</div></div>'
            +'<div class="hcard-r"><div class="hcard-total">'+fB(gt.k,gt.j)+'</div>'
            +'<div class="hcard-badges">'+(cc.t>0?'<span class="bdg bp2">'+cc.c+'/'+cc.t+'✓</span>':'')+(p.persons.length?'<span class="bdg bp2">'+p.persons.length+'人</span>':'')+'</div></div></div>';
        });
      }
      if(D.joints.length){
        h+='<div class="st">🤝 共同購入</div>';
        D.joints.forEach(function(j){
          var ns=0,paid=0;
          (j.jproducts||[]).forEach(function(jp){ (jp.buyers||[]).forEach(function(b){ ns++; if(b.paid)paid++; }); });
          h+='<div class="hcard" data-a="openJ" data-id="'+j.id+'">'
            +'<div class="hcard-av av-j">🤝</div>'
            +'<div class="hcard-body"><div class="hcard-name">'+esc(j.name)+'</div>'
            +'<div class="hcard-meta">'+(j.group?esc(j.group)+'　':'')+(j.date?j.date+'　':'')+(j.jproducts||[]).length+'商品　'+ns+'枠　💰'+paid+'/'+ns+'</div></div></div>';
        });
      }
      el.innerHTML=h;
    }

    // ── POPUP ──
    function rPopup(){
      var el=document.getElementById('scPopup');
      var p=findP(D.curP);
      if(!p){
        if(D.curP && !firebaseLoaded){
          el.innerHTML='<div class="empty"><div class="empty-ico">⏳</div><div class="empty-ttl">読み込み中...</div></div>';
          return;
        }
        var h='<div class="empty"><div class="empty-ico">🛍</div><div class="empty-ttl">案件を選んでください</div></div>';
        if(D.popups.length){ h+='<div class="st">一覧</div>'; D.popups.forEach(function(x){ h+='<div class="hcard" data-a="openP" data-id="'+x.id+'"><div class="hcard-av av-p">🎪</div><div class="hcard-body"><div class="hcard-name">'+esc(x.name)+'</div></div></div>'; }); }
        el.innerHTML=h; return;
      }
      var pg=p._pg||'products';
      var h='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px">'
        +'<div style="min-width:0"><div style="font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(p.name)+'</div>'
        +'<div style="font-size:11px;color:var(--tx3);margin-top:2px">'+(p.group?esc(p.group)+'　':'')+(p.date||'')+'</div></div>'
        +'<div style="display:flex;gap:6px;flex-shrink:0">'
        +'<button class="bsm" data-a="switchP">切替</button>'
        +'<button class="bdel" data-a="delP" data-id="'+p.id+'">🗑</button></div></div>';
      h+='<div class="pgnav">';
      [['products','📦 商品'],['settings','⚙️ 設定'],['orders','🛍 注文'],['summary','📊 集計']].forEach(function(x){
        h+='<button class="pgb'+(pg===x[0]?' on':'')+'" data-a="setPg" data-id="'+p.id+'" data-pg="'+x[0]+'">'+x[1]+'</button>';
      });
      h+='</div>';
      if(pg==='products') h+=pgProd(p);
      else if(pg==='settings') h+=pgSet(p);
      else if(pg==='orders') h+=pgOrd(p);
      else h+=pgSum(p);
      el.innerHTML=h;
    }
    function setPg(id,pg){ var p=findP(id); if(p){p._pg=pg;rPopup();} }
    function delP(id){ if(!confirm('削除しますか？'))return; D.popups=D.popups.filter(function(x){return x.id!==id;}); D.curP=D.popups.length?D.popups[0].id:null; saveData(); rPopup(); rHome(); }

    function pgProd(p){
      var h='<div class="card"><div class="st" style="margin-top:0">商品マスタ</div>';
      p.products.forEach(function(pr,i){
        h+='<div class="prod"><div class="prod-top"><span class="prod-n">'+String(i+1).padStart(2,'0')+'</span>'
          +'<input class="prod-name" value="'+esc(pr.name)+'" placeholder="商品名" data-ch="updPr" data-id="'+p.id+'" data-rid="'+pr.id+'" data-f="name"/>'
          +'<button class="bdel" data-a="dPr" data-id="'+p.id+'" data-rid="'+pr.id+'">✕</button></div>'
          +'<input class="prod-note" value="'+esc(pr.note||'')+'" placeholder="バリエーション（BLACK など）" data-ch="updPr" data-id="'+p.id+'" data-rid="'+pr.id+'" data-f="note"/>'
          +'<div class="prod-prices">'
          +'<div class="pf"><div class="pf-l">₩ KRW</div><input class="pf-i" type="number" value="'+esc(pr.price_krw||'')+'" placeholder="0" data-ch="updPr" data-id="'+p.id+'" data-rid="'+pr.id+'" data-f="price_krw"/></div>'
          +'<div class="pf"><div class="pf-l">¥ JPY</div><input class="pf-i" type="number" value="'+esc(pr.price_jpy||'')+'" placeholder="0" data-ch="updPr" data-id="'+p.id+'" data-rid="'+pr.id+'" data-f="price_jpy"/></div>'
          +'</div></div>';
      });
      h+='<button class="bg" style="width:100%;margin-top:4px" data-a="aPr" data-id="'+p.id+'">＋ 商品を追加</button>'
        +'<p class="hint">💡 KRW・JPYどちらか一方でも可。</p></div>';
      return h;
    }
    function aPr(pid){ var p=findP(pid); p.products.push({id:uid(),name:'',note:'',price_krw:'',price_jpy:''}); saveData(); rPopup(); }
    function dPr(pid,rid){ var p=findP(pid); p.products=p.products.filter(function(pr){return pr.id!==rid;}); saveData(); rPopup(); }
    function updPr(pid,rid,f,v){ var p=findP(pid); var pr=p.products.find(function(x){return x.id===rid;}); if(pr){ pr[f]=v; saveData(); } }

    function pgSet(p){
      var h='<div class="card"><div class="st" style="margin-top:0">メンバー</div>'
        +'<div class="tags">'+p.members.map(function(m){ return '<div class="tag tag-mb">🎵 '+esc(m)+'<button class="tdel" data-a="dMb" data-id="'+p.id+'" data-m="'+esc(m)+'">✕</button></div>'; }).join('')+(p.members.length?'':'<span style="color:var(--tx3);font-size:12px">まだいません</span>')+'</div>'
        +'<div class="irow"><input class="fi" id="mi_'+p.id+'" placeholder="メンバー名" data-enter="aMb" data-id="'+p.id+'"/>'
        +'<button class="bg" data-a="aMb" data-id="'+p.id+'">追加</button></div></div>';
      h+='<div class="card"><div class="st" style="margin-top:0">代行相手</div>'
        +'<div class="tags">'+p.persons.map(function(pi){ return '<div class="tag">'+esc(pi.name)+'<button class="tdel" data-a="dPsn" data-id="'+p.id+'" data-n="'+esc(pi.name)+'">✕</button></div>'; }).join('')+(p.persons.length?'':'<span style="color:var(--tx3);font-size:12px">まだいません</span>')+'</div>'
        +'<div class="irow"><input class="fi" id="pi_'+p.id+'" placeholder="名前" data-enter="aPsn" data-id="'+p.id+'"/>'
        +'<button class="bg" data-a="aPsn" data-id="'+p.id+'">追加</button></div></div>';
      h+='<div class="card"><div class="st" style="margin-top:0">特典しきい値</div>';
      p.thresholds.forEach(function(t,i){
        h+='<div class="brow">'
          +'<select class="fi" style="padding:8px 28px 8px 8px;font-size:12px;width:80px;flex-shrink:0" data-ch="updTh" data-id="'+p.id+'" data-i="'+i+'" data-f="cur">'
          +'<option value="KRW"'+((t.cur||'KRW')==='KRW'?' selected':'')+'>₩ KRW</option>'
          +'<option value="JPY"'+(t.cur==='JPY'?' selected':'')+'>¥ JPY</option></select>'
          +'<input class="binp w88" type="number" placeholder="金額" value="'+esc(t.thresh||'')+'" data-inp="updTh" data-id="'+p.id+'" data-i="'+i+'" data-f="thresh"/>'
          +'<span class="blbl">以上で</span>'
          +'<input class="binp w48" type="number" placeholder="枚" value="'+esc(t.count||1)+'" data-inp="updTh" data-id="'+p.id+'" data-i="'+i+'" data-f="count"/>'
          +'<span class="blbl">枚</span>'
          +'<button class="bdel" data-a="dTh" data-id="'+p.id+'" data-i="'+i+'"'+(p.thresholds.length===1?' disabled':'')+'>✕</button></div>';
      });
      h+='<button class="bsm" data-a="aTh" data-id="'+p.id+'">＋ しきい値を追加</button></div>';
      return h;
    }
    function aMb(pid){ var p=findP(pid); var inp=document.getElementById('mi_'+pid); var v=inp.value.trim(); if(!v)return; if(p.members.indexOf(v)<0)p.members.push(v); inp.value=''; saveData(); rPopup(); }
    function dMb(pid,m){ var p=findP(pid); p.members=p.members.filter(function(x){return x!==m;}); saveData(); rPopup(); }
    function aPsn(pid){ var p=findP(pid); var inp=document.getElementById('pi_'+pid); var v=inp.value.trim(); if(!v)return; if(!p.persons.find(function(pi){return pi.name===v;})) p.persons.push({name:v,delivery:'hand',paid:false,delivered:false}); inp.value=''; saveData(); rPopup(); }
    function dPsn(pid,n){ var p=findP(pid); p.persons=p.persons.filter(function(pi){return pi.name!==n;}); saveData(); rPopup(); }
    function aTh(pid){ var p=findP(pid); p.thresholds.push({thresh:'',count:1,cur:'KRW'}); saveData(); rPopup(); }
    function dTh(pid,i){ var p=findP(pid); if(p.thresholds.length>1){p.thresholds.splice(i,1); saveData(); rPopup();} }

    function pgOrd(p){
      if(!p.persons.length) return '<div class="empty"><div class="empty-ico">👥</div><div class="empty-ttl">代行相手を設定してください</div></div>';
      if(!p.products.length) return '<div class="empty"><div class="empty-ico">📦</div><div class="empty-ttl">商品を登録してください</div></div>';
      var gt=grandTot(p),cc=cStats(p),gb=cBonus(gt.k,gt.j,p);
      var h='<div class="sbar">'
        +'<div class="si"><label>全体合計</label><div class="v" style="font-size:'+(gt.k&&gt.j?'12px':'16px')+'">'+fB(gt.k,gt.j)+'</div></div>'
        +'<div class="si"><label>購入済み</label><div class="v tl">'+cc.c+'/'+cc.t+'</div><small>チェック済み</small></div>'
        +'<div class="si"><label>合計特典</label><div class="v gd">'+(gb>0?gb+'枚':'—')+'</div></div>'
        +'<div class="si"><label>代行人数</label><div class="v">'+p.persons.length+'人</div></div>'
        +'</div>';
      if(!D.opc[p.id]) D.opc[p.id]={};
      p.persons.forEach(function(pi,pIdx){
        var person=pi.name, pt=psnTot(p,person), pb=cBonus(pt.k,pt.j,p), isOp=!!D.opc[p.id][pIdx];
        h+='<div class="pc"><div class="pc-hdr" data-a="togPc" data-id="'+p.id+'" data-pi="'+pIdx+'">'
          +'<div class="pc-av">'+person.charAt(0)+'</div>'
          +'<div style="flex:1;min-width:0"><div class="pc-name">'+esc(person)+'</div>'
          +'<div style="display:flex;gap:3px;margin-top:2px">'
          +(pi.paid?'<span class="bdg bg2">💰払済</span>':'')+(pi.delivered?'<span class="bdg bgold">📦渡済</span>':'')+(pi.delivery==='mail'?'<span class="bdg bp2">📮郵送</span>':'')
          +'</div></div>'
          +'<div class="pc-r"><div class="pc-tot" style="font-size:'+(pt.k&&pt.j?'10px':'12px')+'">'+fB(pt.k,pt.j)+'</div>'+(pb>0?'<div style="font-size:11px;color:var(--gold)">🎁 '+pb+'枚</div>':'')+'</div>'
          +'<div class="pc-chev'+(isOp?' op':'')+'">▼</div></div>'
          +'<div class="pc-body'+(isOp?' op':'')+'">';
        h+='<div class="sts">'
          +'<select class="sts-sel" data-ch="updPI" data-id="'+p.id+'" data-pi="'+pIdx+'" data-f="delivery">'
          +'<option value="hand"'+((pi.delivery||'hand')==='hand'?' selected':'')+'>🤝 手渡し</option>'
          +'<option value="mail"'+(pi.delivery==='mail'?' selected':'')+'>📮 郵送</option>'
          +'</select>'
          +'<div class="schk'+(pi.paid?' on':'')+'" data-a="togPI" data-id="'+p.id+'" data-pi="'+pIdx+'" data-f="paid"><div class="schk-b"></div><span>代金払済</span></div>'
          +'<div class="schk'+(pi.delivered?' on':'')+'" data-a="togPI" data-id="'+p.id+'" data-pi="'+pIdx+'" data-f="delivered"><div class="schk-b"></div><span>商品渡済</span></div>'
          +'</div>';
        p.thresholds.forEach(function(t){
          var th=Number(t.thresh)||0; if(!th)return;
          var val=(t.cur==='JPY')?pt.j:pt.k, next=th*(Math.floor(val/th)+1), prog=Math.min(val/next*100,100), rem=next-val, sym=(t.cur==='JPY')?'¥':'₩';
          h+='<div class="bprog"><div class="bpbg"><div class="bpbar" style="width:'+prog+'%"></div></div>'
            +'<div class="bplbl">'+(rem>0?'あと '+sym+rem.toLocaleString()+' で次の特典':'🎉 特典獲得中')+'（'+sym+th.toLocaleString()+'ごとに'+(t.count||1)+'枚）</div></div>';
        });
        p.products.forEach(function(pr){
          var am=getAM(p.id,pIdx,pr.id);
          var ord=eOrd(p,person,pr.id), tq=tQ(ord), isZ=tq===0;
          var ks=(Number(pr.price_krw)||0)*tq, js=(Number(pr.price_jpy)||0)*tq;
          h+='<div class="oitem"><div class="oitem-top"><div class="oitem-info">'
            +'<div class="oitem-name">'+esc(pr.name)+(pr.note?' <span class="oitem-note">'+esc(pr.note)+'</span>':'')+'</div>'
            +'<div class="oitem-price">'+fB(pr.price_krw,pr.price_jpy)+'</div></div>'
            +'<div class="oitem-r"><div class="osub'+(isZ?' z':'')+'" style="font-size:'+(ks&&js?'10px':'12px')+'">'+(isZ?'—':fB(ks,js))+'</div>'
            +'<div class="chk'+(ord.chk&&!isZ?' on':'')+'" data-a="togChk" data-id="'+p.id+'" data-pi="'+pIdx+'" data-rid="'+pr.id+'"></div></div></div>'
            +'<div class="mba">';
          if(p.members.length){
            var notYet=p.members.filter(function(m){return am.indexOf(m)<0;});
            h+='<div class="mb-add" style="margin-bottom:6px">'
              +'<select class="mb-sel" id="ms_'+p.id+'_'+pIdx+'_'+pr.id+'">'
              +'<option value="">🎵 メンバーを追加</option>'
              +notYet.map(function(m){return '<option value="'+esc(m)+'">'+esc(m)+'</option>';}).join('')
              +'</select>'
              +'<button class="mb-add-btn" data-a="addAM" data-id="'+p.id+'" data-pi="'+pIdx+'" data-rid="'+pr.id+'">追加</button></div>';
          }
          am.forEach(function(m){
            var q=(ord.mbQ[m])||0, mk=(Number(pr.price_krw)||0)*q, mj=(Number(pr.price_jpy)||0)*q;
            h+='<div class="mbr"><div class="mbr-n">🎵 '+esc(m)+'</div>'
              +'<div class="qw"><button class="qb" data-a="cMQ" data-id="'+p.id+'" data-pi="'+pIdx+'" data-rid="'+pr.id+'" data-m="'+esc(m)+'" data-delta="-1">−</button>'
              +'<span class="qv">'+q+'</span>'
              +'<button class="qb" data-a="cMQ" data-id="'+p.id+'" data-pi="'+pIdx+'" data-rid="'+pr.id+'" data-m="'+esc(m)+'" data-delta="1">＋</button></div>'
              +'<div class="msub'+(q===0?' z':'')+'" style="font-size:'+(mk&&mj?'10px':'11px')+'">'+(q>0?fB(mk,mj):'—')+'</div>'
              +'<button class="tdel" data-a="remAM" data-id="'+p.id+'" data-pi="'+pIdx+'" data-rid="'+pr.id+'" data-m="'+esc(m)+'">✕</button></div>';
          });
          var nm=ord.noQ||0, nmk=(Number(pr.price_krw)||0)*nm, nmj=(Number(pr.price_jpy)||0)*nm;
          h+='<div class="mbr"><div class="mbr-n" style="color:var(--tx3);font-style:italic">指定なし</div>'
            +'<div class="qw"><button class="qb" data-a="cNQ" data-id="'+p.id+'" data-pi="'+pIdx+'" data-rid="'+pr.id+'" data-delta="-1">−</button>'
            +'<span class="qv">'+nm+'</span>'
            +'<button class="qb" data-a="cNQ" data-id="'+p.id+'" data-pi="'+pIdx+'" data-rid="'+pr.id+'" data-delta="1">＋</button></div>'
            +'<div class="msub'+(nm===0?' z':'')+'" style="font-size:'+(nmk&&nmj?'10px':'11px')+'">'+(nm>0?fB(nmk,nmj):'—')+'</div></div>';
          h+='</div></div>';
        });
        h+='</div></div>';
      });
      return h;
    }
    function togPc(pid,pi){ if(!D.opc[pid])D.opc[pid]={}; D.opc[pid][pi]=!D.opc[pid][pi]; rPopup(); }
    function updPI(pid,pi,f,v){ var p=findP(pid); if(p.persons[pi]){p.persons[pi][f]=v; saveData();} rPopup(); }
    function togPI(pid,pi,f){ var p=findP(pid); if(p.persons[pi]){p.persons[pi][f]=!p.persons[pi][f]; saveData(); rPopup();} }
    function togChk(pid,pi,rid){ var p=findP(pid); var o=eOrd(p,p.persons[pi].name,rid); if(tQ(o)>0){o.chk=!o.chk; saveData();} rPopup(); }
    function addAM(pid,pi,rid){ var sel=document.getElementById('ms_'+pid+'_'+pi+'_'+rid); if(!sel)return; var v=sel.value; if(!v)return; var am=getAM(pid,pi,rid); if(am.indexOf(v)<0)am.push(v); saveData(); rPopup(); }
    function remAM(pid,pi,rid,m){ var k=pid+'_'+pi+'_'+rid; if(D.am[k])D.am[k]=D.am[k].filter(function(x){return x!==m;}); saveData(); rPopup(); }
    function cMQ(pid,pi,rid,m,delta){ var p=findP(pid); var o=eOrd(p,p.persons[pi].name,rid); o.mbQ[m]=Math.max(0,(o.mbQ[m]||0)+delta); saveData(); rPopup(); }
    function cNQ(pid,pi,rid,delta){ var p=findP(pid); var o=eOrd(p,p.persons[pi].name,rid); o.noQ=Math.max(0,(o.noQ||0)+delta); saveData(); rPopup(); }

    function pgSum(p){
      if(!p.products.length||!p.persons.length) return '<div class="empty"><div class="empty-ico">📊</div><div class="empty-ttl">データがありません</div></div>';
      var gt=grandTot(p),gb=cBonus(gt.k,gt.j,p),cc=cStats(p);
      var h='<div class="sbar">'
        +'<div class="si"><label>全体合計</label><div class="v" style="font-size:'+(gt.k&&gt.j?'11px':'16px')+'">'+fB(gt.k,gt.j)+'</div></div>'
        +'<div class="si"><label>購入済み</label><div class="v tl">'+cc.c+'/'+cc.t+'</div></div>'
        +'<div class="si"><label>全体特典</label><div class="v gd">'+(gb>0?gb+'枚':'—')+'</div></div>'
        +'<div class="si"><label>代行人数</label><div class="v">'+p.persons.length+'人</div></div>'
        +'</div>';
      var maxK=Math.max.apply(null,p.persons.map(function(pi){return psnTot(p,pi.name).k||0;}).concat([1]));
      h+='<div class="card"><div class="st" style="margin-top:0">代行相手別</div>';
      p.persons.forEach(function(pi){ var pt=psnTot(p,pi.name),pb=cBonus(pt.k,pt.j,p),w=pt.k?pt.k/maxK*100:(pt.j?50:0);
        h+='<div class="mbk"><div class="pc-av" style="width:26px;height:26px;font-size:11px">'+pi.name.charAt(0)+'</div><div class="mbk-n">'+esc(pi.name)+'</div><div class="mbk-bg"><div class="mbk-bar" style="width:'+w+'%"></div></div><div class="mbk-a" style="font-size:'+(pt.k&&pt.j?'10px':'11px')+'">'+fB(pt.k,pt.j)+'</div><div class="mbk-b">'+(pb>0?pb+'🎁':'')+'</div></div>';
      });
      h+='</div>';
      if(p.members.length){
        var maxMK=Math.max.apply(null,p.members.map(function(m){return mbTot(p,m).k||0;}).concat([1]));
        h+='<div class="card"><div class="st" style="margin-top:0">メンバー別</div>';
        p.members.forEach(function(m){ var mt=mbTot(p,m),mb=cBonus(mt.k,mt.j,p),w=mt.k?mt.k/maxMK*100:(mt.j?50:0);
          h+='<div class="mbk"><div class="mbk-n">🎵 '+esc(m)+'</div><div class="mbk-bg"><div class="mbk-bar" style="width:'+w+'%"></div></div><div class="mbk-a" style="font-size:'+(mt.k&&mt.j?'10px':'11px')+'">'+fB(mt.k,mt.j)+'</div><div class="mbk-b">'+(mb>0?mb+'🎁':'')+'</div></div>';
        });
        h+='</div>';
      }
      h+='<div class="card"><div class="st" style="margin-top:0">商品別</div>';
      p.products.forEach(function(pr){ var qty=0; p.persons.forEach(function(pi){var o=(p.orders[pi.name]||{})[pr.id];if(o)qty+=tQ(o);}); if(!qty)return;
        h+='<div class="mbk"><div class="mbk-n">'+esc(pr.name)+(pr.note?' <span style="color:var(--tx3);font-size:10px">'+esc(pr.note)+'</span>':'')+'</div><div style="flex:1"></div><span class="mono" style="font-size:11px;color:var(--tx3);margin-right:6px">'+qty+'個</span><div class="mbk-a" style="font-size:'+(pr.price_krw&&pr.price_jpy?'10px':'11px')+'">'+fB((Number(pr.price_krw)||0)*qty,(Number(pr.price_jpy)||0)*qty)+'</div></div>';
      });
      h+='</div>';
      return h;
    }

    // ── JOINT ──
    function rJoint(){
      var el=document.getElementById('scJoint');
      var j=findJ(D.curJ);
      if(!j){
        if(D.curJ && !firebaseLoaded){
          el.innerHTML='<div class="empty"><div class="empty-ico">⏳</div><div class="empty-ttl">読み込み中...</div></div>';
          return;
        }
        var h='<div class="empty"><div class="empty-ico">🤝</div><div class="empty-ttl">共同購入を選んでください</div></div>';
        if(D.joints.length){ h+='<div class="st">一覧</div>'; D.joints.forEach(function(x){ h+='<div class="hcard" data-a="openJ" data-id="'+x.id+'"><div class="hcard-av av-j">🤝</div><div class="hcard-body"><div class="hcard-name">'+esc(x.name)+'</div></div></div>'; }); }
        el.innerHTML=h; return;
      }
      if(!D.ojp[j.id]) D.ojp[j.id]={};
      var ns=0,paid=0,ship=0,totalJ=0;
      (j.jproducts||[]).forEach(function(jp){ (jp.buyers||[]).forEach(function(b){ ns++; if(b.paid)paid++; if(b.shipped)ship++; totalJ+=Number(b.price)||0; }); });
      var h='<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px">'
        +'<div style="min-width:0"><div style="font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(j.name)+'</div>'
        +'<div style="font-size:11px;color:var(--tx3);margin-top:2px">'+(j.group?esc(j.group)+'　':'')+(j.date||'')+'</div></div>'
        +'<div style="display:flex;gap:6px;flex-shrink:0"><button class="bsm" data-a="switchJ">切替</button>'
        +'<button class="bdel" data-a="delJ" data-id="'+j.id+'">🗑</button></div></div>';
      h+='<div class="sbar">'
        +'<div class="si"><label>合計金額</label><div class="v">'+fJ(totalJ)+'</div></div>'
        +'<div class="si"><label>入金済み</label><div class="v tl">'+paid+'/'+ns+'</div><small>人</small></div>'
        +'<div class="si"><label>発送済み</label><div class="v gd">'+ship+'/'+ns+'</div><small>人</small></div>'
        +'<div class="si"><label>商品数</label><div class="v">'+(j.jproducts||[]).length+'点</div></div>'
        +'</div>';
      (j.jproducts||[]).forEach(function(jp,pi){
        var isOp=!!D.ojp[j.id][pi];
        var bpaid=jp.buyers.filter(function(b){return b.paid;}).length;
        var bship=jp.buyers.filter(function(b){return b.shipped;}).length;
        var bTotal=jp.buyers.reduce(function(s,b){return s+(Number(b.price)||0);},0);
        h+='<div class="jprod"><div class="jprod-hdr" data-a="togJp" data-id="'+j.id+'" data-pi="'+pi+'">'
          +'<div class="jprod-ico">🛒</div>'
          +'<div style="flex:1;min-width:0"><div class="jprod-name">'+(jp.name||'（商品名未設定）')+'</div>'
          +'<div class="jprod-meta">'+jp.buyers.length+'枠　💰'+bpaid+'/'+jp.buyers.length+'　📦'+bship+'/'+jp.buyers.length+'　合計'+fJ(bTotal)+'</div></div>'
          +'<div class="jprod-chev'+(isOp?' op':'')+'">▼</div></div>'
          +'<div class="jprod-body'+(isOp?' op':'')+'">';
        h+='<div class="fg" style="margin-bottom:10px"><div class="fl">商品名</div>'
          +'<input class="fi" value="'+esc(jp.name||'')+'" placeholder="例: ミニキーリング BLACK ver." data-ch="updJProdName" data-id="'+j.id+'" data-pi="'+pi+'"/></div>';
        jp.buyers.forEach(function(b,bi){
          h+='<div class="buyer"><div class="buyer-top">'
            +'<input class="buyer-name-inp" value="'+esc(b.person||'')+'" placeholder="購入者名" data-ch="updBuyer" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'" data-f="person"/>'
            +'<button class="bdel" data-a="dBuyer" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'">🗑</button></div>'
            +'<input class="buyer-mb-inp" value="'+esc(b.member||'')+'" placeholder="メンバー" data-ch="updBuyer" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'" data-f="member"/>'
            +'<div class="price-row"><div class="pf-l">¥</div>'
            +'<input class="price-jpy-inp" type="number" value="'+esc(b.price||'')+'" placeholder="金額（円）" data-ch="updBuyer" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'" data-f="price"/></div>'
            +'<div class="buyer-opts">'
            +'<label class="opt'+(b.includeShipping?' on':'')+'"><input type="checkbox"'+(b.includeShipping?' checked':'')+' data-ch="updBuyer" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'" data-f="includeShipping"/>送料込み</label>'
            +'<label class="opt'+(b.postpay?' on':'')+'"><input type="checkbox"'+(b.postpay?' checked':'')+' data-ch="updBuyer" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'" data-f="postpay"/>後払い</label>'
            +'</div>'
            +'<div class="buyer-sts">'
            +'<div class="sst'+(b.paid?' paid':'')+'" data-a="togBuyerBool" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'" data-f="paid"><div class="sst-b"></div>入金済み</div>'
            +'<div class="sst'+(b.shipped?' shipped':'')+'" data-a="togBuyerBool" data-id="'+j.id+'" data-pi="'+pi+'" data-bi="'+bi+'" data-f="shipped"><div class="sst-b"></div>発送済み</div>'
            +'</div></div>';
        });
        h+='<button class="bsm" style="width:100%;margin-top:2px" data-a="aBuyer" data-id="'+j.id+'" data-pi="'+pi+'">＋ 購入者（枠）を追加</button>'
          +'<button class="bdel" style="width:100%;margin-top:8px;text-align:center;display:block;font-size:12px" data-a="dJProd" data-id="'+j.id+'" data-pi="'+pi+'">この商品枠を削除</button>'
          +'</div></div>';
      });
      h+='<button class="bp" data-a="aJProd" data-id="'+j.id+'">＋ 商品を追加</button>';
      el.innerHTML=h;
    }
    function togJp(jid,pi){ if(!D.ojp[jid])D.ojp[jid]={}; D.ojp[jid][pi]=!D.ojp[jid][pi]; rJoint(); }
    function delJ(id){ if(!confirm('削除しますか？'))return; D.joints=D.joints.filter(function(x){return x.id!==id;}); D.curJ=D.joints.length?D.joints[0].id:null; saveData(); rJoint(); rHome(); }
    function aJProd(jid){ var j=findJ(jid); if(!j.jproducts)j.jproducts=[]; j.jproducts.push({id:uid(),name:'',buyers:[]}); if(!D.ojp[jid])D.ojp[jid]={}; D.ojp[jid][j.jproducts.length-1]=true; saveData(); rJoint(); }
    function dJProd(jid,pi){ if(!confirm('削除しますか？'))return; var j=findJ(jid); j.jproducts.splice(pi,1); saveData(); rJoint(); }
    function updJProdName(jid,pi,v){ var j=findJ(jid); if(j.jproducts[pi]){j.jproducts[pi].name=v; saveData();} }
    function aBuyer(jid,pi){ var j=findJ(jid); j.jproducts[pi].buyers.push({id:uid(),person:'',member:'',price:'',includeShipping:false,postpay:false,paid:false,shipped:false}); saveData(); rJoint(); }
    function dBuyer(jid,pi,bi){ if(!confirm('削除しますか？'))return; var j=findJ(jid); j.jproducts[pi].buyers.splice(bi,1); saveData(); rJoint(); }
    function updBuyer(jid,pi,bi,f,v){ var j=findJ(jid); var b=j.jproducts[pi].buyers[bi]; if(b){ b[f]=v; saveData(); if(f==='includeShipping'||f==='postpay') rJoint(); } }
    function togBuyerBool(jid,pi,bi,f){ var j=findJ(jid); var b=j.jproducts[pi].buyers[bi]; if(b){b[f]=!b[f]; saveData(); rJoint();} }

    // ── STATS ──
    function rStats(){
      var el=document.getElementById('scStats');
      if(!D.popups.length&&!D.joints.length){el.innerHTML='<div class="empty"><div class="empty-ico">📊</div><div class="empty-ttl">データがありません</div></div>';return;}
      var h='';
      if(D.popups.length){
        h+='<div class="st">🛍 代行</div>';
        D.popups.forEach(function(p){ var gt=grandTot(p),cc=cStats(p),gb=cBonus(gt.k,gt.j,p);
          h+='<div class="card2"><div style="font-weight:700;margin-bottom:6px">'+esc(p.name)+'</div>'
            +'<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px">'
            +'<span class="mono" style="color:var(--ac)">'+fB(gt.k,gt.j)+'</span>'
            +'<span style="color:var(--tx3)">'+cc.c+'/'+cc.t+'✓</span>'
            +(gb>0?'<span style="color:var(--gold)">🎁 '+gb+'枚</span>':'')
            +'<span style="color:var(--tx3)">'+p.persons.length+'人</span></div></div>';
        });
      }
      if(D.joints.length){
        h+='<div class="st">🤝 共同購入</div>';
        D.joints.forEach(function(j){
          var ns=0,paid=0,ship=0,totalJ=0;
          (j.jproducts||[]).forEach(function(jp){ (jp.buyers||[]).forEach(function(b){ ns++; if(b.paid)paid++; if(b.shipped)ship++; totalJ+=Number(b.price)||0; }); });
          h+='<div class="card2"><div style="font-weight:700;margin-bottom:6px">'+esc(j.name)+'</div>'
            +'<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px;margin-bottom:8px">'
            +'<span class="mono" style="color:var(--ac)">'+fJ(totalJ)+'</span>'
            +'<span style="color:var(--grn)">💰 '+paid+'/'+ns+'</span>'
            +'<span style="color:var(--gold)">📦 '+ship+'/'+ns+'</span>'
            +'<span style="color:var(--tx3)">'+(j.jproducts||[]).length+'商品　'+ns+'枠</span></div>';
          (j.jproducts||[]).forEach(function(jp){
            var bT=jp.buyers.reduce(function(s,b){return s+(Number(b.price)||0);},0);
            var bP=jp.buyers.filter(function(b){return b.paid;}).length;
            var bS=jp.buyers.filter(function(b){return b.shipped;}).length;
            h+='<div style="background:var(--sf3);border-radius:8px;padding:8px 10px;margin-bottom:6px">'
              +'<div style="font-size:12px;font-weight:700;margin-bottom:6px">📦 '+esc(jp.name||'（商品名なし）')+'</div>';
            jp.buyers.forEach(function(b){
              h+='<div style="display:flex;align-items:center;gap:6px;font-size:12px;padding:4px 0;border-bottom:1px solid var(--bd)">'
                +'<span style="flex:1;font-weight:500">'+(b.person?esc(b.person):'—')+'</span>'
                +(b.member?'<span style="color:var(--tx3);font-size:11px">🎵 '+esc(b.member)+'</span>':'')
                +'<span class="mono" style="color:var(--ac)">'+fJ(b.price)+'</span>'
                +(b.includeShipping?'<span class="bdg bp2" style="font-size:9px">送込</span>':'')
                +(b.postpay?'<span class="bdg bpur" style="font-size:9px">後払</span>':'')
                +(b.paid?'<span class="bdg bg2" style="font-size:9px">💰</span>':'')
                +(b.shipped?'<span class="bdg bgold" style="font-size:9px">📦</span>':'')
                +'</div>';
            });
            h+='<div style="text-align:right;font-size:11px;color:var(--tx3);margin-top:5px">小計 <span class="mono" style="color:var(--ac)">'+fJ(bT)+'</span>　💰'+bP+'/'+jp.buyers.length+'　📦'+bS+'/'+jp.buyers.length+'</div></div>';
          });
          h+='</div>';
        });
      }
      el.innerHTML=h;
    }

    // ── INIT: セッション状態を復元してからFirebaseをロード ──
    try {
      var _t = sessionStorage.getItem('dpm_tab');
      var _p = sessionStorage.getItem('dpm_curP');
      var _j = sessionStorage.getItem('dpm_curJ');
      if (_t !== null) D.tab = +_t;
      if (_p) D.curP = _p;
      if (_j) D.curJ = _j;
    } catch(e) {}
    goTab(D.tab);

    import('firebase/database').then(function(m) {
      fbRef = m.ref;
      fbSet = m.set;
      fbGet = m.get;
      return loadData();
    }).then(function() {
      firebaseLoaded = true;
      if (pendingSave) saveData();
      if (D.tab === 0) rHome();
      else if (D.tab === 1) rPopup();
      else if (D.tab === 2) rJoint();
      else rStats();
    }).catch(function(e) {
      console.error('Firebase load error:', e);
      firebaseLoaded = true;
      if (D.tab === 0) rHome();
      else if (D.tab === 1) rPopup();
      else if (D.tab === 2) rJoint();
      else rStats();
    });

    return function() {
      document.removeEventListener('click', clickHandler);
      document.removeEventListener('change', changeHandler);
      document.removeEventListener('input', inputHandler);
      document.removeEventListener('keydown', keydownHandler);
    };
  }, []);

  return (
    <>
      <Head>
        <title>POPUP MANAGER</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <div className="app">
        <div className="hdr">
          <div className="hdr-in">
            <div>
              <div className="hdr-ttl">POPUP MANAGER</div>
              <div className="hdr-sub">代行 &amp; 共同購入</div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span id="saveIndicator" style={{fontSize:'10px',color:'var(--grn)',opacity:0,transition:'opacity .3s',whiteSpace:'nowrap'}}>✓ 保存済み</span>
              <button className="hdr-new" id="hdrNewBtn" data-a="openMov">＋ 新規作成</button>
            </div>
          </div>
        </div>

        <div className="scr on" id="scHome"></div>
        <div className="scr" id="scPopup"></div>
        <div className="scr" id="scJoint"></div>
        <div className="scr" id="scStats"></div>

        <div className="tabbar">
          <button className="tb on" id="tb0" data-a="goTab" data-n="0">
            <div className="tb-ico">🏠</div><div className="tb-lbl">ホーム</div>
          </button>
          <button className="tb" id="tb1" data-a="goTab" data-n="1">
            <div className="tb-ico">🛍</div><div className="tb-lbl">代行</div>
          </button>
          <div className="tb-fw">
            <button className="tb-fab" id="fabBtn" data-a="openMov">＋</button>
          </div>
          <button className="tb" id="tb2" data-a="goTab" data-n="2">
            <div className="tb-ico">🤝</div><div className="tb-lbl">共同購入</div>
          </button>
          <button className="tb" id="tb3" data-a="goTab" data-n="3">
            <div className="tb-ico">📊</div><div className="tb-lbl">集計</div>
          </button>
        </div>
      </div>

      <div className="mov" id="mov">
        <div className="modal">
          <div className="m-h"></div>
          <h2>新規作成</h2>
          <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
            <button className="bg" id="tPop" data-a="setAT" data-v="popup" style={{flex:1,borderColor:'var(--ac)',color:'var(--ac)'}}>🛍 代行</button>
            <button className="bg" id="tJnt" data-a="setAT" data-v="joint" style={{flex:1}}>🤝 共同購入</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
            <div className="fg"><div className="fl">名前</div><input className="fi" id="aN" placeholder="例: ○○ 1st POP UP" /></div>
            <div className="fg"><div className="fl">グループ / アーティスト</div><input className="fi" id="aG" placeholder="例: ○○○○○" /></div>
            <div className="fg"><div className="fl">日付</div><input className="fi" id="aD" type="date" /></div>
          </div>
          <div className="mbtns">
            <button className="bg" data-a="closeMov">キャンセル</button>
            <button className="bp" data-a="doCreate">作成</button>
          </div>
        </div>
      </div>
    </>
  );
}
