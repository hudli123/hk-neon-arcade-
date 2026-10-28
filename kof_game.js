/* 名人亂鬥 KOF — original KOF97-feel 2.5D fighter. */
'use strict';
(() => {
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const Q = new URLSearchParams(location.search.slice(1)+'&'+location.hash.slice(1));
const ASSET_LIST = [
  ['zy_sfx.js',217641],['zy_clips.js',767372],['zy_rig_zy.js',1026575],['zy_tex_zy.webp',178932],
  ['zy_rig_guanyu.js',620960],['zy_tex_guanyu.webp',143704],['zy_rig_zhanghe.js',735716],['zy_tex_zhanghe.webp',258634]
];
const loading=$('loading'); let loaded=0, total=ASSET_LIST.reduce((n,x)=>n+x[1],0);
async function loadAssets(){
  for(const [name,size] of ASSET_LIST){
    const r=await fetch(name); if(!r.ok) throw Error(`${name}: HTTP ${r.status}`);
    const data=await r.arrayBuffer(); loaded+=data.byteLength;
    loading.textContent=`Loading… ${Math.min(99,Math.floor(loaded/total*100))}%`;
    if(name.endsWith('.js')){const script=document.createElement('script');script.text=new TextDecoder().decode(data)+'\n//# sourceURL='+name;document.head.appendChild(script);}
    else {const id=name.slice(7,-5);if(window.MRIG&&window.MRIG[id])window.MRIG[id].tex=URL.createObjectURL(new Blob([data],{type:'image/webp'}));}
  }
  loaded=total; loading.textContent='Loading… 100%';
}

const FIGHTERS={
 rocket:{id:'rocket',name:'火箭商人',rig:'zy',tint:0xffffff,scale:1,hp:1000,dmg:1,walk:1,jump:1,specials:{qcf:'rocket',dp:'jet',super:'rain'}},
 tariff:{id:'tariff',name:'關稅大帝',rig:'guanyu',tint:0xffe0c0,scale:1,hp:1050,dmg:1.05,walk:.95,jump:1,specials:{qcf:'wall',qcb:'tackle',super:'cage'}},
 chip:{id:'chip',name:'晶片教主',rig:'zy',tint:0x56e0ff,scale:1,hp:980,dmg:1,walk:1.05,jump:1,specials:{qcf:'chips',qcb:'mine',super:'storm'}},
 cart:{id:'cart',name:'車力巨人',rig:'zhanghe',tint:0xeab0ff,scale:1.18,hp:1250,dmg:1.15,walk:.8,jump:.85,specials:{qcf:'charge',dp:'stomp',super:'berserk'}}
};
const ANIM={
 idle:{clip:'Combat_Stance',speed:1},walk:{clip:'Casual_Walk',speed:1},run:{clip:'RunFast',speed:1},jump:{clip:'Basic_Jump',speed:1.4},
 crouch:{clip:'Charged_Ground_Slam',freeze:42},guard:{clip:'Stand_Dodge',freeze:18},hit:{clip:'Hit_Reaction',speed:1},
 knockdown:{clip:'Knock_Down',speed:1},dead:{clip:'Dead',speed:1},victory:{clip:'victory',speed:1},roll:{clip:'Roll_Dodge',speed:1},backstep:{clip:'Stand_Dodge',freeze:12},
 A:{clip:'Thrust_Slash',speed:1.8},B:{clip:'Left_Slash',speed:1.7},C:{clip:'Right_Hand_Sword_Slash',speed:1.45},D:{clip:'Reaping_Swing',speed:1.3},
 special:{clip:'Sword_Shout',speed:1.3},dp:{clip:'Charged_Upward_Slash',speed:1.5},charge:{clip:'Charged_Slash',speed:1.5},stomp:{clip:'Heavy_Hammer_Swing',speed:1.35},super:{clip:'Sword_Judgment',speed:1.5}
};
const HEADLINE={rocket:w=>`【突發】火箭商人嘅火箭落返自己頭上；${w}：「唔關我事」`,tariff:w=>`【突發】關稅大帝敗陣，宣布對${w}加徵 300% 關稅，市場冇反應`,chip:w=>`【突發】晶片教主敗陣，宣布下季推新卡——即日售罄；${w}冇買到`,cart:w=>`【突發】車力巨人衝得太快煞唔切直出場外；${w}獲判勝`};
const BTN={a:1,b:2,c:4,d:8,sp:16};
const NORMAL={
 standA:{key:'a',s:4,a:3,r:7,dmg:12,level:'mid',hit:14,block:10,range:1.05,cancel:true,clip:'A'},
 standB:{key:'b',s:5,a:3,r:9,dmg:14,level:'mid',hit:15,block:10,range:1.2,cancel:true,clip:'B'},
 standC:{key:'c',s:7,a:4,r:16,dmg:30,level:'mid',hit:20,block:14,range:1.4,cancel:true,clip:'C'},
 standD:{key:'d',s:9,a:4,r:18,dmg:34,level:'mid',hit:20,block:14,range:1.8,cancel:false,clip:'D'},
 crouchA:{key:'a',s:4,a:3,r:7,dmg:10,level:'mid',hit:13,block:9,range:1.0,cancel:true,clip:'A'},
 crouchB:{key:'b',s:4,a:3,r:8,dmg:11,level:'low',hit:13,block:9,range:1.05,cancel:true,clip:'B'},
 crouchC:{key:'c',s:6,a:4,r:16,dmg:28,level:'mid',hit:19,block:13,range:1.25,cancel:true,clip:'C'},
 crouchD:{key:'d',s:8,a:4,r:20,dmg:30,level:'low',hit:30,block:14,range:1.45,cancel:false,clip:'D'},
 jumpAB:{key:'a',s:4,a:8,r:0,dmg:14,level:'overhead',hit:16,block:11,range:1.3,cancel:false,clip:'A'},
 jumpCD:{key:'c',s:6,a:6,r:0,dmg:30,level:'overhead',hit:20,block:14,range:1.5,cancel:false,clip:'C'}
};
const MOVES={rocket:{kind:'projectile',dmg:45},jet:{kind:'dp',dmg:70},rain:{kind:'rain',dmg:60},wall:{kind:'wall'},tackle:{kind:'tackle',dmg:60},cage:{kind:'cage',dmg:25},chips:{kind:'chips',dmg:30},mine:{kind:'mine',dmg:50},storm:{kind:'storm',dmg:30},charge:{kind:'charge',dmg:75},stomp:{kind:'stomp',dmg:55},berserk:{kind:'berserk',dmg:67}};
let seed=1; function rng(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}

const renderer=new THREE.WebGLRenderer({canvas:$('c'),antialias:false,alpha:false});renderer.setPixelRatio(1);renderer.setClearColor(0x08040a);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x100b19);
const camera=new THREE.PerspectiveCamera(20,1,.1,100);camera.position.set(0,1.8,11);camera.lookAt(0,1.2,0);
scene.add(new THREE.HemisphereLight(0xc8dcff,0x2b1020,2.2));const keyLight=new THREE.DirectionalLight(0xffddb0,2.2);keyLight.position.set(-3,9,8);scene.add(keyLight);
let lowTarget=null,finalScene=new THREE.Scene(),finalCam=new THREE.OrthographicCamera(-1,1,1,-1,0,1),postMat=null,postMesh=null,pixelOn=Q.get('px')!=='0';
function makePost(){postMat=new THREE.ShaderMaterial({uniforms:{tex:{value:lowTarget.texture},pixel:{value:pixelOn?1:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position,1.);}',fragmentShader:'uniform sampler2D tex;uniform float pixel;varying vec2 vUv;void main(){vec4 c=texture2D(tex,vUv);if(pixel>.5)c.rgb=floor(c.rgb*63.+.5)/63.;gl_FragColor=c;}'});postMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),postMat);finalScene.add(postMesh);}
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const lw=Math.max(160,Math.round(270*w/h));if(lowTarget)lowTarget.dispose();lowTarget=new THREE.WebGLRenderTarget(lw,270,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:true});makePost();}
addEventListener('resize',resize);resize();

// Original painted HK neon street backdrop, drawn locally into a canvas texture.
function backdrop(){const c=document.createElement('canvas');c.width=1024;c.height=512;const x=c.getContext('2d');let g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'#10102c');g.addColorStop(.6,'#522040');g.addColorStop(1,'#190d14');x.fillStyle=g;x.fillRect(0,0,1024,512);
 for(let i=0;i<19;i++){let bx=i*58-20,bh=100+(i*73%190);x.fillStyle=i%2?'#201a2b':'#2c192b';x.fillRect(bx,250-bh,54,bh+262);for(let y=260-bh;y<500;y+=24)for(let xx=bx+7;xx<bx+48;xx+=15){x.fillStyle=(i+xx+y)%3?'#edb34d':'#52d9e7';x.fillRect(xx,y,6,10);}}
 x.fillStyle='#101014';x.fillRect(0,462,1024,50);x.font='bold 28px monospace';for(const [xx,yy,s,col] of [[80,170,'茶餐廳','#ff4366'],[340,210,'香港','#52d9e7'],[700,130,'霓虹夜','#ffe08a'],[850,260,'拳館','#ee55aa']]){x.shadowColor=col;x.shadowBlur=18;x.fillStyle=col;x.fillText(s,xx,yy);x.shadowBlur=0;x.strokeStyle=col;x.strokeRect(xx-8,yy-32,126,44);}const tex=new THREE.CanvasTexture(c);tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.NearestFilter;const m=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});const p=new THREE.Mesh(new THREE.PlaneGeometry(60,26),m);p.position.set(0,7,-6);scene.add(p);}
backdrop();const floor=new THREE.Mesh(new THREE.PlaneGeometry(44,40),new THREE.MeshStandardMaterial({color:0x25222c,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.08;scene.add(floor);

const game={mode:'ai',format:'team',state:'title',round:1,timer:3600,teamIdx:[0,0],wins:[0,0],teams:[[],[]],fighters:[null,null],projectiles:[],walls:[],mines:[],cage:null,sparks:[],caption:'',capT:0,hitstop:0,shake:0,frame:0,acc:0,last:performance.now(),paused:false,aiCounts:{blocks:0,anti:0},winner:0,remote:false,host:false};
let rigsReady=false, rigMeshes={};
function toonRig(id,tint,scale){const R=window.MRIG?.[id];if(!R||!window.MCLIPS||!window.buildMeshyRig)return null;const rig=window.buildMeshyRig(R,window.MCLIPS,Object.keys(ANIM).map(k=>ANIM[k].clip));rig.group.scale.setScalar(scale);const tex0=rig.mesh.material.map;if(tex0){tex0.flipY=false;tex0.needsUpdate=true;tex0.magFilter=THREE.NearestFilter;tex0.minFilter=THREE.LinearMipmapLinearFilter;tex0.needsUpdate=true;}const gdata=new Uint8Array([140,140,140,255,200,200,200,255,255,255,255,255]);const grad=new THREE.DataTexture(gdata,3,1,THREE.RGBAFormat);grad.needsUpdate=true;grad.minFilter=THREE.NearestFilter;grad.magFilter=THREE.NearestFilter;rig.mesh.material=new THREE.MeshToonMaterial({map:tex0,color:tint,skinning:true,gradientMap:grad});
 // inverted hull outline shares skinning/skeleton
 const outline=new THREE.SkinnedMesh(rig.mesh.geometry,new THREE.MeshBasicMaterial({color:0x08070b,side:THREE.BackSide,skinning:true,polygonOffset:true,polygonOffsetFactor:4,polygonOffsetUnits:8}));outline.bind(rig.mesh.skeleton);outline.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed += normalize( objectNormal ) * 0.028;');};outline.frustumCulled=false;rig.group.add(outline);return rig;}
function setRigAnim(f,logical,frame){if(!f.rig)return;const spec=ANIM[logical]||ANIM.idle,action=f.rig.actions[spec.clip];if(!action)return;if(f.animKey!==logical){if(f.action)f.action.fadeOut(.06);f.action=action;f.animKey=logical;action.reset();action.enabled=true;action.setLoop(spec.freeze!=null?THREE.LoopOnce:THREE.LoopRepeat,Infinity);action.clampWhenFinished=true;action.timeScale=spec.speed||1;action.play();if(spec.freeze!=null){action.paused=true;action.time=spec.freeze/30;}}else if(spec.freeze==null){action.paused=false;}}
function createFighter(id,side){const d=FIGHTERS[id],root=new THREE.Group();root.position.set(side?2.4:-2.4,0,side?-.12:.12);root.rotation.y=(side?-1:1)*1.12;scene.add(root);let rig=toonRig(d.rig,d.tint,d.scale);if(rig){root.add(rig.group);rig.group.position.y=0;rigMeshes[id]=rig;}const f={id,side,x:root.position.x,y:0,vx:0,vy:0,face:side?-1:1,hp:d.hp,max:d.hp,stocks:0,combo:0,comboT:0,st:'idle',move:null,moveF:0,stun:0,blockstun:0,knock:0,inv:0,armor:0,root,rig,animKey:'',action:null,dir:5,prevMask:0,history:[],hitstop:0,dead:false,cage:0,roll:0,backstep:0,air:false,landed:false};return f;}

// command parser stores exact per-frame input history; parser exported for test cases.
function parseMotion(hist,pattern,maxFrames,buttonFrame){const end=buttonFrame??hist.length-1;if(end<0)return false;const endF=hist[end]?.frame??hist[hist.length-1]?.frame??0;let seq=[];for(let i=Math.min(end,hist.length-1);i>=0;i--){const e=hist[i];if(endF-e.frame>maxFrames)break;if(e.dir!==5&&(seq.length===0||seq[0]!==e.dir))seq.unshift(e.dir);}for(let i=0;i<seq.length;i++){let k=i,j=0,skipped=false;while(j<pattern.length&&k<seq.length){if(seq[k]===pattern[j]){k++;j++;skipped=false;}else if(!skipped&&[1,3,7,9].includes(pattern[j])){j++;skipped=true;}else break;}if(j===pattern.length)return true;}return false;}
function parserTest(input){const hist=input.map((dir,i)=>({dir,mask:0,frame:i}));const wants={236:[[2,3,6],[2,6]],623:[[6,2,3]],214:[[2,1,4]],236236:[[2,3,6,2,3,6],[2,6,2,6]]};return Object.fromEntries(Object.entries(wants).map(([k,seqs])=>[k,seqs.some(s=>parseMotion(hist,s,k==='623'?14:k==='236236'?24:12))]));}
function addHistory(f,dir,mask){f.history.push({dir,mask,frame:game.frame});while(f.history.length>30)f.history.shift();}
function chooseCommand(f,dir,pressed,mask){const h=f.history;const has=(seq,limit)=>parseMotion(h,seq,limit);const down=dir<=3,forward=dir%3===0||dir===6||dir===9,back=dir%3===1||dir===4||dir===7;
 if(pressed&BTN.sp){if(f.stocks>0&&forward)return 'super';if(down)return 'special2';return 'special1';}
 if(f.stocks>0&&forward&&has([2,3,6,2,3,6],24)&&(pressed&(BTN.a|BTN.b|BTN.c|BTN.d)))return 'super';
 if((pressed&(BTN.a|BTN.c))&&has([6,2,3],14))return 'dp';
 if((pressed&(BTN.a|BTN.c|BTN.b|BTN.d))&&has([2,3,6],12))return 'qcf';
 if((pressed&(BTN.b|BTN.d))&&has([2,1,4],12))return 'qcb';
 if((mask&(BTN.a|BTN.b))===(BTN.a|BTN.b)&&!f.air&&f.roll===0)return 'roll';
 if(pressed&(BTN.a|BTN.b|BTN.c|BTN.d))return (pressed&BTN.d)?'d':(pressed&BTN.c)?'c':(pressed&BTN.b)?'b':'a';
 return null;}

const held=new Set(),pressed=new Set();let touchDir=5,touchMask=0;
function keyDown(e){const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(!held.has(k))pressed.add(k);held.add(k);if(k==='g'){pixelOn=!pixelOn;if(postMat)postMat.uniforms.pixel.value=pixelOn?1:0;}}
function keyUp(e){held.delete(e.key.toLowerCase());}addEventListener('keydown',keyDown);addEventListener('keyup',keyUp);addEventListener('blur',()=>{if(!game.remote)held.clear();});
function controlInputFor(p){let left,right,up,down,bm=0;if(p===0){const arrows=game.mode==='online'||game.mode==='ai';left=held.has('a')||(arrows&&held.has('arrowleft'));right=held.has('d')||(arrows&&held.has('arrowright'));up=held.has('w')||(arrows&&held.has('arrowup'));down=held.has('s')||(arrows&&held.has('arrowdown'));if(held.has('j'))bm|=BTN.a;if(held.has('k'))bm|=BTN.b;if(held.has('u'))bm|=BTN.c;if(held.has('i'))bm|=BTN.d;if(held.has('o'))bm|=BTN.sp;}else{left=held.has('arrowleft');right=held.has('arrowright');up=held.has('arrowup');down=held.has('arrowdown');if(held.has('1')||held.has('7'))bm|=BTN.a;if(held.has('2')||held.has('8'))bm|=BTN.b;if(held.has('4')||held.has('9'))bm|=BTN.c;if(held.has('5')||held.has('0'))bm|=BTN.d;if(held.has('6')||held.has('-'))bm|=BTN.sp;}
 if(p===0&&('ontouchstart'in window)){if(touchDir!==5){const wd=touchDir%3===0?1:touchDir%3===1?-1:0;left=wd<0;right=wd>0;up=touchDir>=7;down=touchDir<=3;}bm|=touchMask;}
 const wx=(right?1:0)-(left?1:0),yd=(up?1:0)-(down?1:0);const f=game.fighters[game.remote&&!game.host?1:p],rel=wx*(f?.face||1);let x=rel,y=yd;let dir=x===0&&y===0?5:y>0?(x<0?7:x>0?9:8):y<0?(x<0?1:x>0?3:2):(x<0?4:x>0?6:5);return {dir,mask:bm};}

// Audio data in zy_sfx.js is {name:[ID3 base64,...]}; decode lazily on first input.
let audioCtx=null,audioBuf={};function initAudio(){if(audioCtx)return;try{audioCtx=new AudioContext();for(const [name,list] of Object.entries(window.SFX||{})){audioBuf[name]=[];for(const b64 of list){const raw=atob(b64),u=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);audioCtx.decodeAudioData(u.buffer.slice(0)).then(b=>audioBuf[name].push(b)).catch(()=>{});}}}catch(e){}}
function sfx(name){if(!audioCtx||!audioBuf[name]?.length)return;const s=audioCtx.createBufferSource();s.buffer=audioBuf[name][(game.frame+name.length)%audioBuf[name].length];s.connect(audioCtx.destination);s.start();}

function moveTo(f,logical,frames,meta={}){f.st=logical;f.move={logical,frames,...meta};f.moveF=0;setRigAnim(f,logical);}
function canAct(f){return !f.dead&&f.stun<=0&&f.blockstun<=0&&f.hitstop<=0&&f.cage<=0&&(f.st==='idle'||f.st==='walk'||f.st==='crouch'||f.st==='guard'||f.st==='jump'||f.st==='run');}
function getNormal(f,dir,key){const crouch=dir<=3,jump=dir>=7;let n;if(jump)n=key==='a'||key==='b'?NORMAL.jumpAB:NORMAL.jumpCD;else n=NORMAL[(crouch?'crouch':'stand')+key.toUpperCase()];return n;}
function startNormal(f,key,dir){const n=getNormal(f,dir,key),d=FIGHTERS[f.id];let m={...n,dmg:n.dmg*d.dmg,kind:'normal',level:n.level};if(key==='c'||key==='d')sfx('heavy');else sfx('swing');moveTo(f,n.clip,n.s+n.a+n.r,m);}
function startSpecial(f,which){const d=FIGHTERS[f.id],sp=which==='super'?d.specials.super:which==='dp'?d.specials.dp:which==='qcb'?d.specials.qcb:d.specials.qcf;if(!sp)return false;const superMove=which==='super';if(superMove){if(f.stocks<1)return false;f.stocks--;}
 const kind=MOVES[sp].kind;let logical=which==='dp'?'dp':kind==='charge'||kind==='tackle'?'charge':kind==='stomp'?'stomp':superMove?'super':'special';const dur=kind==='dp'?46:kind==='wall'?22:kind==='tackle'?36:kind==='cage'?30:kind==='mine'?24:kind==='charge'?34:kind==='stomp'?40:kind==='berserk'?90:superMove?60:32;
 f.move={logical,frames:dur,kind:'special',sp,super:superMove,btn:pressed?null:null,hitDone:false,invuln:kind==='dp'?kind==='dp'?8:0:0,armor:kind==='tackle'||kind==='charge'?8:0};f.st=logical;f.moveF=0;f.armor=f.move.armor;f.inv=kind==='dp'?8:0;setRigAnim(f,logical);sfx(superMove?'bigboom':'swing');if(superMove)caption('超必殺',25);return true;}
function startRoll(f){f.roll=22;f.inv=14;f.vx=f.face*2.4*60/60;moveTo(f,'roll',22,{kind:'roll'});}
function directionStep(f,dir){const back=dir===1||dir===4||dir===7,forward=dir===3||dir===6||dir===9,down=dir<=3,up=dir>=7;
 if(f.backstep>0){f.backstep--;f.x+=-f.face*1.6/27;f.inv=Math.max(f.inv, f.backstep>=21?1:0);f.st='backstep';setRigAnim(f,'backstep');return;}
 if((forward||back)&&!down&&!up&&f.prevDir!==dir){const dashKey=forward?'f':'b';if(f.lastDir===dashKey&&game.frame-f.lastDirFrame<=10){if(forward){f.st='run';}else{f.backstep=27;f.inv=6;f.lastDir=null;return;}}f.lastDir=dashKey;f.lastDirFrame=game.frame;}f.prevDir=dir;
 if(up&&!f.air){f.air=true;f.upHold=0;f.vy=4.1*FIGHTERS[f.id].jump;f.jumpFrames=42;f.st='jump';setRigAnim(f,'jump');}
 if(f.air){f.upHold++;if(!up&&f.upHold<=4&&f.vy>0&&!f.hopped){f.hopped=true;f.vy*=.6;}f.x=clamp(f.x+(forward?1:back?-1:0)*FIGHTERS[f.id].walk*2.6/60,-8.4,8.4);f.vy-=9.8/60;f.y+=f.vy/60;if(f.y<=0){f.y=0;f.air=false;f.vy=0;f.hopped=false;f.st='idle';}}
 else if(down){const threat=game.fighters[1-f.side]&&game.fighters[1-f.side].move&&game.fighters[1-f.side].moveF<game.fighters[1-f.side].move.s+game.fighters[1-f.side].move.a||game.projectiles.some(p=>p.owner!==f.side&&Math.abs(p.x-f.x)<2.5);const guarding=back&&threat;f.st=guarding?'guard':'crouch';if(!guarding)setRigAnim(f,'crouch');else setRigAnim(f,'guard');}
 else if(back){const threat=game.fighters[1-f.side]&&game.fighters[1-f.side].move&&game.fighters[1-f.side].moveF<game.fighters[1-f.side].move.s+game.fighters[1-f.side].move.a||game.projectiles.some(p=>p.owner!==f.side&&Math.abs(p.x-f.x)<2.5);if(threat){f.st='guard';setRigAnim(f,'guard');}else{f.st='walk';f.x+=f.face*-1*2.1*FIGHTERS[f.id].walk/60;setRigAnim(f,'walk');}}
 else if(forward){if(f.st!=='run')f.st='walk';const speed=2.6*FIGHTERS[f.id].walk/60;f.x+=f.face*speed;setRigAnim(f,f.st==='run'?'run':'walk');}
 else if(f.st==='walk'||f.st==='run'||f.st==='crouch'||f.st==='guard'||f.st==='backstep'){f.st='idle';setRigAnim(f,'idle');}
 f.x=clamp(f.x,-8.4,8.4);}
function isGuarding(def,att,level){if(def.st!=='guard')return false;const input=lastInput[def.side];const crouch=input?.dir<=3;const backing=input?.dir===4||input?.dir===1||input?.dir===7;if(!backing)return false;return level==='low'?crouch:level==='overhead'?!crouch:true;}
const lastInput=[null,null];
function hit(att,def,dmg,level='mid',knock=0,blockable=true){if(def.dead||def.inv>0)return false;let blocked=blockable&&isGuarding(def,att,level);if(def.armor>0){def.armor=0;blocked=true;}const actual=blocked?Math.floor(dmg*((att.move?.kind==='special'||att._chip)?0.15:0)):Math.floor(dmg*(def.cage>0?.5:1)*(def.combo>=2?Math.max(.5,.9**(def.combo-1)):1));if(blocked){def.blockstun=att.move?.block||10;def.st='guard';game.hitstop=5;att.x-=att.face*.25;spawnSpark(def.x,def.y+1,'blue');sfx('clash');if(att.move?.kind==='special'||att._chip)def.hp-=actual;}else{def.hp-=actual;def.stun=level==='knockdown'?40:(att.move?.hit||14);def.knock=knock||att.face*.4;def.st=level==='knockdown'?'knockdown':'hit';def.combo++;def.comboT=45;att.combo=def.combo;spawnSpark(def.x,def.y+1,'hit');game.hitstop=8;game.shake=5;sfx('hit');if(level==='knockdown')def.knock=att.face*.8;if(game.cage?.target===def.side)game.cage.hits++;
 const ownerTeam=att.side;att.stocks=Math.min(3,att.stocks+(att.move?.kind==='special'?.08:.04));def.stocks=Math.min(3,def.stocks+.03);}
 if(def.hp<=0)def.hp=0;return !blocked;}
function spawnSpark(x,y,type){game.sparks.push({x,y,type,t:10});}
function caption(s,frames=70){game.caption=s;game.capT=frames;}
function spawnProjectile(f,kind,dmg,opts={}){game.projectiles.push({owner:f.side,x:f.x+f.face*.85,y:opts.y||1,z:0,vx:f.face*(opts.speed||8),kind,dmg,life:opts.life||180,spread:opts.spread||0,angle:opts.angle||0,homing:!!opts.homing,chip:true});}
function useSpecial(f,superMove=false){const side=f.side,opp=game.fighters[1-side],sp=f.move?.sp,kind=MOVES[sp]?.kind;if(!kind)return;
 if(kind==='projectile'){if(!game.projectiles.some(p=>p.owner===side&&p.kind==='rocket'))spawnProjectile(f,'rocket',45,{speed:superMove?8:(f.move.btn==='c'?10:6)});}
 else if(kind==='dp'){if(f.moveF>=3&&f.moveF<=16&&Math.abs(f.x-opp.x)<1.7&&!f.move.hitDone){f.move.hitDone=true;hit(f,opp,70,'overhead',0);}}
 else if(kind==='rain'){if(f.moveF===8||f.moveF===22||f.moveF===36)spawnProjectile(f,'rain',60,{speed:0,y:5,life:60});}
 else if(kind==='wall'){if(!game.walls.some(w=>w.owner===side)){game.walls.push({owner:side,x:f.x+f.face*(f.move.btn==='c'?4:2.5),life:150});caption('關稅 TARIFF',50);}}
 else if(kind==='tackle'||kind==='charge'||kind==='berserk'){const active=kind==='berserk'?(f.moveF%28>=8&&f.moveF%28<=13):(f.moveF>=8&&f.moveF<=f.move.frames-4);if(f.moveF>=6&&f.moveF<=f.move.frames-4)f.x=clamp(f.x+f.face*(kind==='charge'?24:kind==='berserk'?9:8)/60,-8.4,8.4);if(active&&!opp.air){const lim=opp.x-f.face*1.05;if(f.face>0)f.x=Math.min(f.x,lim);else f.x=Math.max(f.x,lim);}if(active&&Math.abs(f.x-opp.x)<1.6&&!f.move.hitDone){f.move.hitDone=true;hit(f,opp,kind==='tackle'?60:kind==='charge'?75:67,'mid',f.face*1.2);}}
 else if(kind==='cage'){if(f.moveF===10&&!f.move.hitDone&&Math.abs(f.x-opp.x)<2.2){f.move.hitDone=true;hit(f,opp,25,'mid');game.cage={owner:side,target:1-side,life:300,hits:0};caption('關稅 TARIFF',90);}}
 else if(kind==='chips'){if(f.moveF===8)for(let i=0;i<(f.move.btn==='c'?3:1);i++)spawnProjectile(f,'chip',30,{speed:8,angle:(i-1)*.16});}
 else if(kind==='mine'){if(f.moveF===10&&!f.move.hitDone){f.move.hitDone=true;game.mines.push({owner:side,x:f.x+f.face*3,life:240});}}
 else if(kind==='storm'){if(f.moveF>=6&&f.moveF<=36&&f.moveF%5===1)spawnProjectile(f,'homing',30,{speed:5,life:90,homing:true});}
 else if(kind==='stomp'){if(f.moveF===15&&!f.move.hitDone){f.move.hitDone=true;if(Math.abs(f.x-opp.x)<2.5)hit(f,opp,55,'low',f.face*.6);}}
}
function stepProjectile(){for(const p of [...game.projectiles]){p.x+=p.vx/60;p.y+=p.spread/60;p.life--;const def=game.fighters[1-p.owner],att=game.fighters[p.owner];if(p.homing)p.vx=Math.sign(def.x-p.x)*Math.abs(p.vx);let hitWall=game.walls.find(w=>w.owner!==p.owner&&Math.abs(w.x-p.x)<.45);if(hitWall){game.projectiles.splice(game.projectiles.indexOf(p),1);spawnSpark(p.x,p.y,'blue');continue;}if(Math.abs(def.x-p.x)<.55&&Math.abs(def.y+1-p.y)<1.4){att._chip=p.chip;hit(att,def,p.dmg,p.kind==='mine'?'low':'mid');att._chip=null;game.projectiles.splice(game.projectiles.indexOf(p),1);if(game.cage?.target===def.side)game.cage.hits++;continue;}if(p.life<=0||Math.abs(p.x)>10)game.projectiles.splice(game.projectiles.indexOf(p),1);}}
function stepEnvironment(){for(const w of game.walls)w.life--;game.walls=game.walls.filter(w=>w.life>0);for(const m of [...game.mines]){m.life--;const d=game.fighters[1-m.owner];if(Math.abs(d.x-m.x)<.5&&d.y===0){hit(game.fighters[m.owner],d,50,'low',0,'knockdown');m.life=0;}}game.mines=game.mines.filter(m=>m.life>0);if(game.cage){game.cage.life--;const f=game.fighters[game.cage.target];f.cage=2;if(game.cage.life<=0||game.cage.hits>=3){game.cage=null;f.cage=0;}}for(const s of game.sparks)s.t--;game.sparks=game.sparks.filter(s=>s.t>0);}
function resolvePush(){const [a,b]=game.fighters;if(a.air&&a.y>1.8||b.air&&b.y>1.8)return;const d=b.x-a.x;if(Math.abs(d)<.8){const push=(.8-Math.abs(d))/2;a.x-=Math.sign(d||1)*push;b.x+=Math.sign(d||1)*push;a.x=clamp(a.x,-8.4,8.4);b.x=clamp(b.x,-8.4,8.4);}}
function frameFighter(f,p){if(f.dead)return;const {dir,mask}=inputFor(p),prev=f.prevMask,pressed=mask&~prev;f.prevMask=mask;f.dir=dir;addHistory(f,dir,mask);lastInput[p]={dir,mask};
 if(f.inv>0)f.inv--;if(f.stun>0){f.stun--;f.x+=f.knock/60;f.knock*=.9;if(f.stun===0){f.st='idle';setRigAnim(f,'idle');}return;}if(f.blockstun>0){f.blockstun--;return;}if(f.cage>0){f.cage--;return;}
 const cmd=chooseCommand(f,dir,pressed,mask);if(cmd==='roll'){startRoll(f);return;}if(cmd==='special1'||cmd==='special2'||cmd==='super'||cmd==='qcf'||cmd==='qcb'||cmd==='dp'){const sp=FIGHTERS[f.id].specials;const w=cmd==='special1'?(sp.qcf?'qcf':sp.dp?'dp':'qcb'):cmd==='special2'?(sp.qcb?'qcb':sp.dp?'dp':'qcf'):cmd;if(startSpecial(f,w)){f.move.btn=pressed&BTN.c?'c':pressed&BTN.d?'d':pressed&BTN.b?'b':'a';return;}}
 if(cmd&&'abcd'.includes(cmd)){const n=getNormal(f,dir,cmd);if(canAct(f)||f.move?.cancel&&f.moveF>=f.move.s&&f.moveF<f.move.s+f.move.a){const o=game.fighters[1-p];if((cmd==='c'||cmd==='d')&&(dir===4||dir===6)&&!f.air&&o&&!o.air&&o.stun<=0&&o.blockstun<=0&&Math.abs(f.x-o.x)<=.9){f.move={logical:'special',frames:26,kind:'normal',sp:'throw',dmg:40,hitDone:true};f.st='special';f.moveF=0;hit(f,o,40,'knockdown',f.face*.8,false);setRigAnim(f,'special');sfx('heavy');return;}startNormal(f,cmd,dir);return;}}
 if(f.move){f.moveF++;if(f.move.kind==='special')useSpecial(f);else if(f.move.kind==='normal'&&f.moveF>=f.move.s&&f.moveF<f.move.s+f.move.a&&!f.move.hitDone){const o=game.fighters[1-p];if(Math.abs(f.x-o.x)<=f.move.range){f.move.hitDone=true;hit(f,o,f.move.dmg,f.move.level,f.face*.4);}}
 if(f.moveF>=f.move.frames){f.move=null;f.st='idle';setRigAnim(f,'idle');}}
 if(canAct(f))directionStep(f,dir);
 if(f.comboT>0)f.comboT--;else f.combo=0;
 if(f.rig){f.rig.mixer.update(1/60);f.root.position.x=f.x;f.root.position.y=f.y;f.root.rotation.y=f.face*1.12;}
}
function stepSim(){game.frame++;if(game.hitstop>0){game.hitstop--;return;}if(game.state!=='fight')return;if(game.ai)aiInput(0);if(game.mode==='ai'||game.ai)aiInput(1);if(game.remote&&!game.host){return;}
 game.timer--;if(game.capT>0)game.capT--;for(let p=0;p<2;p++)frameFighter(game.fighters[p],p);resolvePush();stepProjectile();stepEnvironment();for(const f of game.fighters){f.root.position.set(f.x,f.y,0);f.root.rotation.y=f.face*1.12;if(f.rig)f.rig.mixer.update(1/60);}
 game.fighters[0].face=game.fighters[1].x>=game.fighters[0].x?1:-1;game.fighters[1].face=-game.fighters[0].face;
 if(game.timer<=0){const a=game.fighters[0].hp/game.fighters[0].max,b=game.fighters[1].hp/game.fighters[1].max;if(a===b){game.fighters[0].hp=game.fighters[1].hp=0;}else game.fighters[a>b?1:0].hp=0;caption('TIME UP',80);}
 if(game.fighters.some(f=>f.hp<=0)){const loser=game.fighters.findIndex(f=>f.hp<=0);game.fighters[loser].dead=true;caption('K.O.',80);game.state='ko';game.koT=50;}
 if(game.remote&&game.host)sendSnapshot();
}

let aiNext=0;function aiInput(p){if(game.frame<aiNext)return;aiNext=game.frame+12+Math.floor(rng()*7);const f=game.fighters[p],o=game.fighters[1-p];if(!f||!o)return;const dist=Math.abs(o.x-f.x),toward=o.x>f.x?1:-1;let dir=5,mask=0;if(o.y>1&&dist<3&&rng()<.6){dir=6*toward>0?9:7;mask=BTN.c;game.aiCounts.anti++;}else if(dist>4){dir=toward>0?6:4;if(rng()<.28)mask=BTN.sp;}else if(rng()<.18){dir=toward>0?4:6;game.aiCounts.blocks++;}else{dir=rng()<.3?2:5;mask=dist<1&&rng()<.1?BTN.d:dist<1?BTN.a|((rng()<.3)?BTN.c:0):BTN.d;}aiOverrides[p]={dir,mask};}
let aiOverrides=[null,null];const originalInputFor=inputFor; // wrapper uses deterministic AI events

// Touch controls, landscape-only control arrangement.
const touch=$('touch'),stick=$('stick'),nub=$('sticknub');function touchEnabled(){return('ontouchstart'in window)&&innerWidth>innerHeight;}
function touchDraw(){touch.style.display=touchEnabled()&&game.state==='fight'&&(!game.remote||!game.host)?'block':'none';}
function stickMove(e){const r=stick.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),d=Math.hypot(x,y)||1,n=Math.min(42,d);nub.style.transform=`translate(${x*n/d}px,${y*n/d}px)`;let xx=Math.abs(x)<16?0:x>0?1:-1,yy=Math.abs(y)<16?0:y>0?-1:1;touchDir=yy>0?(xx<0?7:xx>0?9:8):yy<0?(xx<0?1:xx>0?3:2):(xx<0?4:xx>0?6:5);}
stick.addEventListener('pointerdown',e=>{try{stick.setPointerCapture(e.pointerId);}catch(_){}stickMove(e);});stick.addEventListener('pointermove',e=>{if(e.buttons)stickMove(e);});stick.addEventListener('pointerup',()=>{touchDir=5;nub.style.transform='';});for(const b of document.querySelectorAll('.tbtn')){b.addEventListener('pointerdown',e=>{e.preventDefault();try{b.setPointerCapture(e.pointerId);}catch(_){}touchMask|=BTN[b.dataset.b]||BTN.sp;});b.addEventListener('pointerup',()=>touchMask&=~(BTN[b.dataset.b]||BTN.sp));b.addEventListener('pointercancel',()=>touchMask=0);}

function inputFor(p){const f=game.fighters[p];if(f?.debugInput){const v=f.debugInput;f.debugInput=null;return v;}if(p===1&&game.remote&&game.host){if(NET.queue.length){NET.remoteInput=NET.queue.shift();}return NET.remoteInput||{dir:5,mask:0};}if(p===0&&game.remote&&!game.host)return controlInputFor(0);if(aiOverrides[p])return aiOverrides[p];return controlInputFor(p);}

// ---------- modes/team selection ----------
let selectSide=0,selection=[[],[]],selectedMode='ai',hostPickReady=false;const sel=$('sel'),row=$('pickrow');
function showTitle(){game.state='title';$('hud').style.display='none';$('title').hidden=false;sel.hidden=true;$('end').hidden=true;touchDraw();}
function beginSelect(mode){selectedMode=mode;game.mode=mode;game.remote=mode==='online';game.host=NET.role==='host';selection=[[],[]];selectSide=0;$('title').hidden=true;$('end').hidden=true;sel.hidden=false;$('selh').textContent=game.format==='team'?'揀三人隊伍':'揀鬥士';$('seltip').textContent=mode==='online'?'揀好後會傳畀對手。':'點選角色加入隊伍，按完成。';renderSelect();}
function renderSelect(){row.innerHTML='';$('slot1').textContent=`P1：${selection[0].map(x=>FIGHTERS[x].name).join(' / ')||'—'}`;$('slot2').textContent=`P2：${selection[1].map(x=>FIGHTERS[x].name).join(' / ')||'—'}`;for(const f of Object.values(FIGHTERS)){const b=document.createElement('button');b.className='fbtn'+(selectSide===1?' t2':'');b.dataset.id=f.id;b.innerHTML=`<span class="pic">${{rocket:'🚀',tariff:'🛡️',chip:'💾',cart:'🦾'}[f.id]}</span><span class="nm">${f.name}</span><span class="hp">HP ${f.hp}</span>`;b.onclick=()=>{const lim=game.format==='team'?3:1;let s=selection[selectSide];if(s.includes(f.id))s.splice(s.indexOf(f.id),1);else if(s.length<lim)s.push(f.id);b.classList.toggle('sel',s.includes(f.id));$('slot'+(selectSide+1)).textContent=`P${selectSide+1}：${s.map(x=>FIGHTERS[x].name).join(' / ')||'—'}`;};row.appendChild(b);}const nav=document.createElement('div');nav.className='modes';nav.innerHTML='<button id="selback">返回</button><button id="selnext">完成／下一方</button>';row.appendChild(nav);$('selback').onclick=()=>showTitle();$('selnext').onclick=selectionNext;}
function selectionNext(){const lim=game.format==='team'?3:1;if(selection[selectSide].length!==lim){$('seltip').textContent=`請揀 ${lim} 個唔重複角色。`;return;}if(selectSide===0&&game.mode==='2p'){selectSide=1;renderSelect();$('seltip').textContent='P2 請揀隊伍。';return;}if(selectSide===0&&game.mode==='online'&&NET.role==='guest'){netSend({t:'hello',f:selection[0][0],team:selection[0],format:game.format});$('seltip').textContent='已傳送隊伍，等房主開始…';return;}if(selectSide===0&&game.mode==='ai'){selection[1]=Object.keys(FIGHTERS).filter(x=>!selection[0].includes(x)).slice(0,lim);while(selection[1].length<lim)selection[1].push(Object.keys(FIGHTERS)[selection[1].length]);startMatch();return;}if(game.mode==='online'&&NET.role==='host'){netSend({t:'hello',f:selection[0][0],team:selection[0],format:game.format});if(NET.guestTeam){selection[1]=NET.guestTeam;startMatch();}else $('seltip').textContent='隊伍已傳送，等對手揀好…';return;}if(game.mode==='2p'){startMatch();return;}if(game.mode==='online'&&NET.role==='guest'){return;}}
$('fmt').onclick=()=>{game.format=game.format==='team'?'single':'team';$('fmt').textContent=game.format==='team'?'隊際：3v3':'單挑：1v1';};$('mAi').onclick=()=>beginSelect('ai');$('m2p').onclick=()=>beginSelect('2p');

// ---------- online relay client ----------
const NET={role:null,ws:null,peer:false,code:'',team:null,guestTeam:null,queue:[],seq:0,ping:0,lastPing:0,snap:null,lastSnap:0,lastRaf:0,bgw:null,lastBg:0,bgStep:false,lost:false};window.__KOF_NET=NET;
function netSend(o){if(NET.ws?.readyState===WebSocket.OPEN)try{NET.ws.send(JSON.stringify(o));}catch(e){}}
function openSocket(role,code){if(NET.ws){const w=NET.ws;NET.ws=null;w.onopen=w.onmessage=w.onerror=w.onclose=null;try{w.close();}catch(e){}}const u=new URL(Q.get('ws')||`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`,location.href);u.searchParams.set('r',code);u.searchParams.set('role',role);const ws=new WebSocket(u.href);NET.ws=ws;NET.role=role;NET.code=code;NET.peer=false;ws.onopen=()=>{if(NET.ws!==ws)return;$('netstatus').textContent='已連線，等對手…';};ws.onmessage=e=>{if(NET.ws!==ws)return;let m;try{m=JSON.parse(e.data);}catch(_){return;}onNet(m);};ws.onerror=()=>{if(NET.ws===ws)netError('連線失敗，請檢查網絡。');};ws.onclose=()=>{if(NET.ws!==ws)return;if(NET.peer&&game.state==='fight')disconnectOverlay();};}
function netError(s){$('neterr').hidden=false;$('neterr').textContent=s;}
function disconnectOverlay(){if(NET.lost)return;NET.lost=true;game.state='lost';$('end').hidden=false;$('etitle').textContent='對手斷咗線';$('ehead').textContent='連線已中斷';}
function onNet(m){if(m.t==='err'){netError(m.e==='noroom'?'搵唔到房間。':m.e==='full'?'房間已滿。':'連線錯誤。');netDisconnect();}else if(m.t==='peer'){NET.peer=!!m.on;if(m.on){$('netstatus').textContent='對手已加入，開始揀隊伍。';beginSelect('online');}else if(NET.role){if(game.state==='fight')disconnectOverlay();else $('netstatus').textContent='對手離開房間。';}}else if(m.t==='hello'&&NET.role==='host'){NET.guestTeam=m.team||[m.f];if(selection[0].length===(game.format==='team'?3:1)){selection[1]=NET.guestTeam;startMatch();}}else if(m.t==='start'&&NET.role==='guest'){game.teams=[m.teams[0],m.teams[1]];game.format=m.format;game.mode='online';game.remote=true;game.host=false;game.round=m.round||1;game.wins=m.wins||[0,0];game.teamIdx=[0,0];launchRound(m.seed||1);}else if(m.t==='rematch'&&NET.role==='host'&&game.state==='end'){game.teamIdx=[0,0];game.wins=[0,0];game.round=1;netSend({t:'start',teams:game.teams,format:game.format,round:1,wins:game.wins,seed:seed+10});launchRound(seed+10);}else if(m.t==='in'&&NET.role==='host'){if(Array.isArray(m.e))NET.queue.push(...m.e);}else if(m.t==='snap'&&NET.role==='guest'){NET.snap=m;NET.lastSnap=performance.now();}else if(m.t==='ping'&&NET.role==='host'){netSend({t:'pong',ts:m.ts});const r=Number(m.rtt);if(Number.isFinite(r)&&r>0)NET.ping=r;}else if(m.t==='pong'&&NET.role==='guest'){NET.ping=Math.max(0,Date.now()-Number(m.ts));}}
function netHost(){const code=String(1000+Math.floor(Math.random()*9000));$('netcode').textContent='房間碼：'+code;$('netstatus').textContent='叫朋友入房，輸入房間碼。';$('netcancel').hidden=false;openSocket('host',code);}
function netGuest(){const c=$('netin').value.replace(/[０-９]/g,d=>String.fromCharCode(d.charCodeAt(0)-0xFEE0)).replace(/\s/g,'');if(!/^\d{4}$/.test(c)){netError('請輸入四位數房間碼');return;}$('netcode').textContent='加入房間 '+c;openSocket('guest',c);}
function netDisconnect(){NET.role=null;NET.peer=false;NET.team=null;NET.queue=[];if(NET.ws){const w=NET.ws;NET.ws=null;w.onopen=w.onmessage=w.onerror=w.onclose=null;w.close();}if(NET.bgw){NET.bgw.terminate();NET.bgw=null;}game.remote=false;}
$('mHost').onclick=netHost;$('mJoin').onclick=()=>{$('netjoinbtn').hidden=false;$('netstatus').textContent='輸入房間碼後撳「入房」';};$('netjoinbtn').onclick=netGuest;$('netcancel').onclick=()=>{netDisconnect();$('netcode').textContent='';$('netstatus').textContent='已取消';};
function guestNetTick(){if(NET.role!=='guest'||!game.remote||game.state!=='fight')return;const v=controlInputFor(0);if(!NET.localInput||NET.localInput.dir!==v.dir||NET.localInput.mask!==v.mask){NET.localInput=v;sendInputEvent(v);}if(performance.now()-NET.lastPing>1000){NET.lastPing=performance.now();netSend({t:'ping',ts:Date.now(),rtt:NET.ping});}}
function sendInputEvent(ev){if(NET.role!=='guest'||!game.remote)return;NET.queue.push(ev);const now=performance.now();if(!NET.lastSend||now-NET.lastSend>=16){NET.lastSend=now;netSend({t:'in',s:++NET.seq,e:NET.queue.splice(0)});}}

function startMatch(){if(game.mode==='online'&&NET.role==='guest')return;game.teams=selection.map(a=>a.slice());game.teamIdx=[0,0];game.wins=[0,0];game.round=1;game.remote=game.mode==='online';game.host=NET.role==='host';if(game.remote)netSend({t:'start',teams:game.teams,format:game.format,round:game.round,wins:game.wins,seed:seed});launchRound(seed);}
function launchRound(s=1){seed=s;for(const f of game.fighters)if(f?.root)scene.remove(f.root);game.frame=0;game.timer=3600;game.hitstop=0;game.projectiles=[];game.walls=[];game.mines=[];game.cage=null;game.state='intro';game.introT=120;game.fighters=[createFighter(game.teams[0][game.teamIdx[0]]||'rocket',0),createFighter(game.teams[1][game.teamIdx[1]]||'tariff',1)];$('title').hidden=true;sel.hidden=true;$('end').hidden=true;$('hud').style.display='block';$('touch').style.display='none';caption('ROUND '+game.round,35);if(game.remote)startWorker();}
function endRoundAdvance(){const loser=game.fighters.findIndex(f=>f.dead||f.hp<=0),winner=1-loser;if(game.format==='single'){game.wins[winner]++;if(game.wins[winner]>=2){game.winner=winner;game.state='end';showEnd();return;}game.round++;launchRound(seed+1);return;}
 game.teamIdx[loser]++;if(game.teamIdx[loser]>=game.teams[loser].length){game.winner=winner;game.state='end';showEnd();return;}const remain=Math.max(0,game.timer/60),carry=game.fighters[winner];let recovered=Math.min(carry.max,carry.hp+carry.max*remain*.005);
 game.round++;launchRound(seed+game.round);game.fighters[winner].hp=recovered;game.fighters[winner].stocks=carry.stocks;}
function showEnd(){game.state='end';$('hud').style.display='none';$('end').hidden=false;const win=game.teams[game.winner]?.[game.teamIdx[game.winner]]||game.teams[game.winner]?.[0]||'rocket';$('etitle').textContent=FIGHTERS[win].name+' 勝出';$('ehead').textContent=HEADLINE[win]($('etitle').textContent);}
$('rematch').onclick=()=>{if(NET.role==='guest'){netSend({t:'rematch'});return;}if(game.remote){netSend({t:'start',teams:game.teams,format:game.format,round:1,wins:[0,0],seed:seed+10});}game.teamIdx=[0,0];game.wins=[0,0];game.round=1;launchRound(seed+10);};$('totitle').onclick=()=>{netDisconnect();scene.children.filter(o=>o.userData.fighter).forEach(o=>scene.remove(o));showTitle();};

// Worker ticks replace stalled rAF only; no render calls from background.
function startWorker(){if(!NET.role||NET.bgw)return;try{NET.bgw=new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),33)'],{type:'text/javascript'})));NET.bgw.onmessage=()=>{if(!NET.role||game.state!=='fight')return;const now=performance.now();if(now-NET.lastRaf<=120)return;const dt=Math.min(.05,NET.lastBg?(now-NET.lastBg)/1000:.033);NET.lastBg=now;NET.bgStep=true;try{fixedFrames(Math.max(1,Math.round(dt*60)));}finally{NET.bgStep=false;}if(game.host)sendSnapshot();else guestNetTick();};}catch(e){NET.bgw=null;}}
function sendSnapshot(){if(NET.role!=='host'||!NET.peer||game.state!=='fight'||game.frame%2)return;netSend({t:'snap',f:game.fighters.map(f=>({id:f.id,x:f.x,y:f.y,hp:f.hp,max:f.max,st:f.st,move:f.move,moveF:f.moveF,face:f.face,stocks:f.stocks,combo:f.combo,dead:f.dead,inv:f.inv})),timer:game.timer,round:game.round,wins:game.wins,idx:game.teamIdx,projectiles:game.projectiles,walls:game.walls,mines:game.mines,cage:game.cage,caption:game.caption,capT:game.capT});}
function applySnap(){const m=NET.snap;if(!m)return;for(let i=0;i<2;i++){const s=m.f[i],f=game.fighters[i];if(!f||f.id!==s.id)continue;f.x=lerp(f.x,s.x,.45);f.y=lerp(f.y,s.y,.45);f.hp=s.hp;f.st=s.st;f.move=s.move;f.moveF=s.moveF;f.face=s.face;f.stocks=s.stocks;f.combo=s.combo;f.dead=s.dead;f.root.position.set(f.x,f.y,0);f.root.rotation.y=f.face*1.12;setRigAnim(f,logicalAnim(f));if(f.rig)f.rig.mixer.update(1/60);}game.timer=m.timer;game.round=m.round;game.wins=m.wins;game.teamIdx=m.idx;game.projectiles=m.projectiles||[];game.walls=m.walls||[];game.mines=m.mines||[];game.cage=m.cage;game.caption=m.caption;game.capT=m.capT;}
function logicalAnim(f){if(f.st==='walk'||f.st==='run'||f.st==='jump'||f.st==='guard'||f.st==='crouch'||f.st==='hit'||f.st==='knockdown'||f.st==='dead'||f.st==='roll'||f.st==='backstep')return f.st;return f.move?.logical||'idle';}

const fxMesh=(geo,mat)=>{const m=new THREE.Mesh(geo,mat);m.visible=false;scene.add(m);return m;};
const projPool=[...Array(24)].map(()=>fxMesh(new THREE.BoxGeometry(.36,.36,.36),new THREE.MeshBasicMaterial({color:0xff8c2a})));
const wallPool=[...Array(4)].map(()=>fxMesh(new THREE.BoxGeometry(.2,2.6,1.7),new THREE.MeshBasicMaterial({color:0xd4af37,transparent:true,opacity:.72})));
const minePool=[...Array(4)].map(()=>fxMesh(new THREE.CylinderGeometry(.3,.3,.07,10),new THREE.MeshBasicMaterial({color:0x44ff66})));
const sparkPool=[...Array(16)].map(()=>fxMesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshBasicMaterial({color:0xffffff})));
const cageGroup=new THREE.Group();scene.add(cageGroup);{const cm=new THREE.MeshBasicMaterial({color:0xd4af37});for(let i=0;i<4;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(.07,2.8,.07),cm);b.position.set(Math.cos(i*1.5708)*1.15,1.4,Math.sin(i*1.5708)*1.15);cageGroup.add(b);}const top=new THREE.Mesh(new THREE.BoxGeometry(2.5,.07,2.5),cm);top.position.y=2.8;cageGroup.add(top);}cageGroup.visible=false;
function syncObjects(){
 const col={rocket:0xff8c2a,chip:0x46e8ff,rain:0xffe06a,homing:0x7ab8ff};
 for(let i=0;i<projPool.length;i++){const m=projPool[i],p=game.projectiles[i];m.visible=!!p;if(p){m.position.set(p.x,p.y,p.z);m.material.color.setHex(col[p.kind]||0xffffff);m.rotation.y+=.25;}}
 for(let i=0;i<wallPool.length;i++){const m=wallPool[i],w=game.walls[i];m.visible=!!w;if(w)m.position.set(w.x,1.3,0);}
 for(let i=0;i<minePool.length;i++){const m=minePool[i],w=game.mines[i];m.visible=!!w;if(w)m.position.set(w.x,.04,0);}
 for(let i=0;i<sparkPool.length;i++){const m=sparkPool[i],s=game.sparks[i];m.visible=!!s;if(s){m.position.set(s.x,s.y,0);m.material.color.setHex(s.type==='blue'?0x6ab0ff:0xffe08a);m.scale.setScalar(Math.max(.1,s.t/10));}}
 const c=game.cage;cageGroup.visible=!!c;if(c){const f=game.fighters[c.target];cageGroup.position.set(f?f.x:0,0,0);cageGroup.rotation.y+=.02;}
}

// fixed tick loop
function fixedFrames(n=1){for(let i=0;i<n;i++){if(game.state==='intro'){game.introT--;if(game.introT===70)caption('READY',35);if(game.introT===35){game.state='fight';caption('GO!',30);}continue;}if(game.state==='ko'){game.koT--;if(game.koT<=0)endRoundAdvance();continue;}if(game.state==='fight'){if(game.remote&&!game.host){while(NET.queue.length){const ev=NET.queue.shift();touchDir=ev.dir;touchMask=ev.mask;}applySnap();}else stepSim();}}
}
function raf(now){requestAnimationFrame(raf);if(!NET.bgStep)NET.lastRaf=performance.now();const dt=Math.min(.1,(now-game.last)/1000);game.last=now;if(!game.remote||game.host){game.acc+=dt;while(game.acc>=1/60){fixedFrames(1);game.acc-=1/60;}}else{game.acc+=dt;while(game.acc>=1/60){if(game.state!=='fight')fixedFrames(1);game.acc-=1/60;}guestNetTick();applySnap();const pg=$('ping');pg.style.display=NET.ping?'block':'none';pg.textContent=`ping ${Math.round(NET.ping)}ms`;}
 renderHUD();renderScene();syncObjects();touchDraw();}
function renderScene(){const cx=game.fighters[0]?clamp((game.fighters[0].x+game.fighters[1].x)/2,-3.5,3.5):0;const sep=game.fighters[0]?Math.abs(game.fighters[0].x-game.fighters[1].x):4;const jumpY=game.fighters.reduce((a,f)=>a+(f?f.y:0),0)/Math.max(1,game.fighters.length);const tz=clamp(10.5+(sep-1.6)*1.55,10.5,30);camera.position.x=lerp(camera.position.x,cx,.06);camera.position.z=lerp(camera.position.z,tz,.08);camera.position.y=camera.position.z*.164+jumpY*.15;camera.lookAt(cx,camera.position.z*.113+jumpY*.14,0);if(game.shake>0){camera.position.x+=(rng()-.5)*game.shake*.01;game.shake*=.85;}
 if(pixelOn){renderer.setRenderTarget(lowTarget);renderer.render(scene,camera);renderer.setRenderTarget(null);if(postMat){postMat.uniforms.tex.value=lowTarget.texture;postMat.uniforms.pixel.value=1;}renderer.render(finalScene,finalCam);}else{renderer.setRenderTarget(null);renderer.render(scene,camera);}}
function renderHUD(){if($('hud').style.display==='none')return;for(let p=0;p<2;p++){const f=game.fighters[p];if(!f)continue;const bar=$('hp'+(p+1)).querySelector('.fill');bar.style.width=clamp(f.hp/f.max*100,0,100)+'%';$('n'+(p+1)).textContent=FIGHTERS[f.id].name;$('t'+(p+1)).innerHTML=(game.teams[p]||[]).map((_,i)=>`<i class="${i<game.teamIdx[p]?'off':''} ${i===game.teamIdx[p]?'cur':''}"></i>`).join('');const pow=$('pw'+(p+1));pow.querySelector('.num').textContent=Math.floor(f.stocks);pow.querySelectorAll('.st').forEach((e,i)=>e.classList.toggle('full',i<f.stocks));const cb=$('cb'+(p+1));cb.style.display=f.combo>1?'block':'none';cb.textContent=f.combo>1?`${f.combo} HITS`:'';}$('clk').textContent=String(Math.ceil(game.timer/60)).padStart(2,'0');$('cap').textContent=game.capT>0?game.caption:'';$('cap').style.opacity=game.capT>0?'1':'0';$('ping').style.display=game.remote&&NET.ping?'block':'none';$('ping').textContent=`ping ${Math.round(NET.ping)}ms`;}

// Debug API
window.KOF={peek:()=>game,parseMotion:(dirs,pattern,maxFrames=24)=>parseMotion(dirs.map((dir,i)=>({dir,frame:i})),pattern,maxFrames),state:()=>({fighters:game.fighters.map(f=>f&&({char:f.id,x:f.x,y:f.y,hp:f.hp,st:f.st,frame:f.moveF,stocks:f.stocks,combo:f.combo})),round:game.round,timer:game.timer,teamIdx:game.teamIdx.slice(),wins:game.wins.slice(),mode:game.mode,format:game.format,state:game.state,aiCounts:{...game.aiCounts},projectiles:game.projectiles.map(p=>({...p})),walls:game.walls.length,mines:game.mines.length,cage:game.cage&&({...game.cage})}),inject:(p,dir,btnMask=0)=>{const f=game.fighters[p];if(!f)return;f.debugInput={dir,mask:btnMask};},step:n=>{fixedFrames(Math.max(0,Math.floor(n)));},setup:o=>{game.mode=o.mode||'2p';game.format=o.format||'single';seed=o.seed||1;game.teams=[(o.p1||['rocket']).slice(),(o.p2||['tariff']).slice()];game.teams[0]=game.teams[0].map(x=>FIGHTERS[x]?x:'rocket');game.teams[1]=game.teams[1].map(x=>FIGHTERS[x]?x:'tariff');game.teamIdx=[0,0];game.wins=[0,0];game.round=1;game.remote=false;game.host=false;game.ai=!!o.ai;launchRound(seed);game.state='fight';game.timer=3600;}};
// debug input takes precedence for deterministic harness steps
const baseInputFor=inputFor;inputFor=function(p){const f=game.fighters[p];if(f?.debugInput){const x=f.debugInput;f.debugInput=null;return x;}return baseInputFor(p);};

// Basic intro UI/controls help and manual pause policy.
$('keyshelp').textContent='P1 WASD／J K U I（A B C D）／O 易出招　　P2 方向鍵／Numpad 1 2 4 5 6；筆電 7 8 9 0 -　　G 像素開關';
$('title').hidden=false;$('fmt').textContent='隊際：3v3';
addEventListener('keydown',e=>{if(e.key==='Escape'&&game.state==='title')showTitle();});

loadAssets().then(()=>{
  rigsReady=true;loading.textContent='Loading… 100%';loading.style.display='none';showTitle();
  // draw representative crouch/guard pose via explicit freeze state mappings
}).catch(e=>{console.error(e);loading.textContent='載入失敗：'+e.message;});
requestAnimationFrame(raf);
})();
