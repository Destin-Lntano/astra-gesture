import * as THREE from './vendor/three.module.js';

// The scene is an artistic, procedural universe, not an astronomical catalogue.
// Rendering engine: Three.js (MIT); attribution is included in licenses/THREE-MIT.txt.
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
function randomGenerator(seed = 91242) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const noiseGLSL = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.11,.19,.27));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float n=0.,a=.5;for(int k=0;k<5;k++){n+=a*noise(p);p=p*2.04+vec3(3.7,1.2,4.1);a*=.5;}return n;}
`;
function bufferAttribute(array, size) { return new THREE.Float32BufferAttribute(array, size); }
function starColor(r) { const c = new THREE.Color(); if (r < .12) c.setRGB(1,.52,.26); else if(r < .28) c.setRGB(1,.83,.52); else if(r < .61) c.setRGB(.8,.89,1); else c.setRGB(.48,.68,1); return c; }

export class Cosmos {
  constructor(canvas, { onSelect = () => {}, onStats = () => {} } = {}) {
    this.canvas = canvas; this.onSelect=onSelect; this.onStats=onStats;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
    this.renderer.setClearColor(0x02040b,1); this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.12;
    this.scene=new THREE.Scene(); this.scene.background=new THREE.Color(0x02040b);
    this.camera=new THREE.PerspectiveCamera(67,1,.05,12000);
    this.trails=new THREE.Group(); this.galaxy=new THREE.Group(); this.closeup=new THREE.Group();
    this.scene.add(this.trails,this.galaxy,this.closeup);
    this.mode='trails'; this.focused=false; this.paused=false; this.speed=.62; this.exposure=.55;
    this.time=0; this.clock=0; this.frameCount=0; this.statsElapsed=0; this.quality='auto';
    this.view={yaw:0,pitch:.08,zoom:1}; this.target={...this.view}; this.focusView={yaw:0,pitch:.12,zoom:6}; this.focusTarget={...this.focusView};
    this.uniforms={uTime:{value:0},uExposure:{value:.55},uPixelRatio:{value:1}};
    this.rand=randomGenerator(); this.trailStars=[]; this.galaxyStars=[]; this.materials=[];
    this._buildTrails(); this._buildGalaxy(); this._buildStar(); this._buildHorizon();
    this.galaxy.visible=false; this.closeup.visible=false; this.resize();
    this._last=performance.now(); this._bound=()=>this._frame(); this._raf=requestAnimationFrame(this._bound);
    this._contextLost=e=>{e.preventDefault();this.onStats({error:'图形资源已暂停，请刷新页面恢复',stars:0,fps:0,distance:0,mode:this.mode});};
    canvas.addEventListener('webglcontextlost',this._contextLost);
  }
  _pointMaterial({fixed=false,opacity=1}={}) {
    const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{...this.uniforms,uOpacity:{value:opacity}},
      vertexShader:`attribute vec3 color;attribute float aSize;attribute float aPhase;varying vec3 vColor;varying float vAlpha;uniform float uTime,uPixelRatio,uExposure;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float tw=.83+.17*sin(uTime*.7+aPhase);vAlpha=tw;vColor=color;gl_PointSize=clamp(aSize*uPixelRatio*${fixed?'1.':'(160./max(12.,-mv.z))'}*(.7+uExposure*.6),.65,${fixed?'13.':'20.'});}`,
      fragmentShader:`varying vec3 vColor;varying float vAlpha;uniform float uOpacity;void main(){vec2 p=gl_PointCoord-.5;float d=length(p)*2.;if(d>1.)discard;float core=exp(-d*d*37.);float halo=exp(-d*d*5.)*.23;float rays=pow(max(0.,1.-abs(p.x)*18.),16.)*exp(-abs(p.y)*11.)*.08+pow(max(0.,1.-abs(p.y)*18.),16.)*exp(-abs(p.x)*11.)*.08;gl_FragColor=vec4(vColor*(core*1.8+halo+rays),vAlpha*uOpacity);}`
    });this.materials.push(m);return m;
  }
  _makePoints(positions,colors,sizes,phases,material){const g=new THREE.BufferGeometry();g.setAttribute('position',bufferAttribute(positions,3));g.setAttribute('color',bufferAttribute(colors,3));g.setAttribute('aSize',bufferAttribute(sizes,1));g.setAttribute('aPhase',bufferAttribute(phases,1));return new THREE.Points(g,material);}
  _buildTrails(){
    const pos=[],params=[],colors=[],brightness=[]; const tips=[],tipParams=[],tipColors=[],tipSizes=[];
    const rand=this.rand, radius=1900; const count=4100,segments=25;
    for(let i=0;i<count;i++){
      const rho=18+Math.sqrt(rand())*(radius-36), theta=rand()*TAU, z=-Math.sqrt(Math.max(0,radius*radius-rho*rho));
      const length=.018+rand()*.155, power=.24+Math.pow(rand(),3)*1.8, tint=rand();
      const c=tint<.07?new THREE.Color(1,.86,.64):tint<.32?new THREE.Color(.74,.84,1):new THREE.Color(.9,.94,1);
      this.trailStars.push({rho,theta,z,length,power,color:c,seed:rand(),id:`ST-${String(i+1).padStart(5,'0')}`});
      for(let j=0;j<segments;j++){for(let k=0;k<2;k++){let f=(j+k)/segments;pos.push(rho,theta,z);params.push(f,length);colors.push(c.r,c.g,c.b);brightness.push(power*(.15+.85*f));}}
      tips.push(rho,theta,z);tipParams.push(1,length);tipColors.push(c.r,c.g,c.b);tipSizes.push(1.2+power*2.3);
    }
    const vs=`attribute vec2 aParams;attribute vec3 color;attribute float aBrightness;uniform float uTime,uExposure;varying vec3 vColor;varying float vAlpha;void main(){float angle=position.y+uTime*.008+aParams.x*aParams.y*(.3+uExposure*2.2);vec3 p=vec3(cos(angle)*position.x,sin(angle)*position.x,position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);vColor=color;vAlpha=aBrightness*(.35+uExposure*.9);}`;
    const g=new THREE.BufferGeometry();g.setAttribute('position',bufferAttribute(pos,3));g.setAttribute('aParams',bufferAttribute(params,2));g.setAttribute('color',bufferAttribute(colors,3));g.setAttribute('aBrightness',bufferAttribute(brightness,1));
    this.trailMaterial=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:vs,fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){gl_FragColor=vec4(vColor,vAlpha);}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const lines=new THREE.LineSegments(g,this.trailMaterial);lines.frustumCulled=false;this.trails.add(lines);
    const tg=new THREE.BufferGeometry();tg.setAttribute('position',bufferAttribute(tips,3));tg.setAttribute('aParams',bufferAttribute(tipParams,2));tg.setAttribute('color',bufferAttribute(tipColors,3));tg.setAttribute('aSize',bufferAttribute(tipSizes,1));
    const tm=new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:`attribute vec2 aParams;attribute vec3 color;attribute float aSize;uniform float uTime,uExposure,uPixelRatio;varying vec3 vColor;void main(){float a=position.y+uTime*.008+aParams.y*(.3+uExposure*2.2);vec3 p=vec3(cos(a)*position.x,sin(a)*position.x,position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);gl_PointSize=aSize*uPixelRatio;vColor=color;}`,fragmentShader:`varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;gl_FragColor=vec4(vColor*1.5,exp(-d*d*9.));}`,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    const p=new THREE.Points(tg,tm);p.frustumCulled=false;this.trails.add(p);this.materials.push(this.trailMaterial,tm);
    // A tilted, diffuse Milky Way behind the actual circular stellar paths.
    this._addCloud(this.trails,new THREE.Vector3(270,140,-1200),1800,0x8a91c2,.37,.66);
    this._addCloud(this.trails,new THREE.Vector3(-400,-240,-1050),1300,0x8da8c0,.25,-.7);
    this._addCloud(this.trails,new THREE.Vector3(700,180,-1300),1000,0xc1a6b8,.27,.4);
    this._addCloud(this.trails,new THREE.Vector3(440,-80,-980),1100,0xb4b7ce,.22,.8);
    const bp=[],bc=[],bs=[],bf=[];
    for(let i=0;i<5000;i++){const z=-250-rand()*1600,a=rand()*TAU,r=Math.sqrt(rand())*2200,x=Math.cos(a)*r,y=Math.sin(a)*r;bp.push(x,y,z);const c=starColor(rand());bc.push(c.r,c.g,c.b);bs.push(.6+rand()*1.6);bf.push(rand()*TAU);this.trailStars.push({position:new THREE.Vector3(x,y,z),color:c,seed:rand(),id:`BG-${String(i+1).padStart(5,'0')}`});}
    this.trails.add(this._makePoints(bp,bc,bs,bf,this._pointMaterial({fixed:true,opacity:.7})));
  }
  _cloudTexture(){
    if(this.cloudTexture)return this.cloudTexture;
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');const data=ctx.createImageData(256,256);const r=randomGenerator(7234);const lattice=Array.from({length:64*64},()=>r());
    const n=(x,y)=>{let ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);const q=(a,b)=>lattice[((b%64+64)%64)*64+((a%64+64)%64)];return(q(ix,iy)*(1-fx)+q(ix+1,iy)*fx)*(1-fy)+(q(ix,iy+1)*(1-fx)+q(ix+1,iy+1)*fx)*fy;};
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){let dx=(x-128)/128,dy=(y-128)/128,d=dx*dx+dy*dy;let f=n(x/28,y/28)*.5+n(x/13,y/13)*.25+n(x/6,y/6)*.125+n(x/3,y/3)*.0625;let a=Math.pow(Math.max(0,1-d),2)*Math.pow(f,1.6);let k=(y*256+x)*4;data.data[k]=data.data[k+1]=data.data[k+2]=255;data.data[k+3]=a*255;}
    ctx.putImageData(data,0,0);this.cloudTexture=new THREE.CanvasTexture(c);return this.cloudTexture;
  }
  _addCloud(group,position,scale,color,opacity,rotation=0){const material=new THREE.SpriteMaterial({map:this._cloudTexture(),color,opacity,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,rotation});const s=new THREE.Sprite(material);s.position.copy(position);s.scale.set(scale,scale*.48,1);group.add(s);return s;}
  _buildGalaxy(){
    const rand=this.rand,p=[],c=[],sz=[],ph=[];const count=36000;
    for(let i=0;i<count;i++){
      const arm=i%4; const radius=Math.pow(rand(),.68)*128;
      const angle=arm*Math.PI/2+radius*.047+(rand()-.5)*(.23+radius*.004);
      const scatter=(1-radius/150)*6;
      const x=Math.cos(angle)*radius+(rand()-.5)*scatter,y=(rand()-.5)*(3.5+(1-radius/130)*13),z=Math.sin(angle)*radius+(rand()-.5)*scatter;
      p.push(x,y,z);const col=radius<22?new THREE.Color(1,.78,.49):starColor(rand());c.push(col.r,col.g,col.b);sz.push(.55+Math.pow(rand(),6)*4.7);ph.push(rand()*TAU);
      this.galaxyStars.push({position:new THREE.Vector3(x,y,z),color:col,seed:rand(),id:`AS-${String(i+1).padStart(5,'0')}`});
    }
    this.galaxy.add(this._makePoints(p,c,sz,ph,this._pointMaterial()));
    for(let arm=0;arm<4;arm++)for(let j=0;j<18;j++){const r=18+j*6.1,a=arm*Math.PI/2+r*.047;this._addCloud(this.galaxy,new THREE.Vector3(Math.cos(a)*r,(rand()-.5)*8,Math.sin(a)*r),20+rand()*25,j%3?0x527bc4:0xb39ba3,.17,rand()*TAU);}
    const core=this._addCloud(this.galaxy,new THREE.Vector3(0,0,0),70,0xffc58d,.67);core.scale.y=60;
    this._addCloud(this.galaxy,new THREE.Vector3(0,0,0),170,0x8473bd,.12);
    const p2=[],c2=[],s2=[],f2=[];
    for(let i=0;i<8500;i++){let a=rand()*TAU,h=rand()*2-1,r=450+rand()*3500,s=Math.sqrt(1-h*h),x=Math.cos(a)*s*r,y=h*r,z=Math.sin(a)*s*r;p2.push(x,y,z);const color=starColor(rand());c2.push(color.r,color.g,color.b);s2.push(.6+Math.pow(rand(),3)*3.4);f2.push(rand()*TAU);this.galaxyStars.push({position:new THREE.Vector3(x,y,z),color,seed:rand(),id:`DS-${String(i+1).padStart(5,'0')}`});}
    this.deepSpace=this._makePoints(p2,c2,s2,f2,this._pointMaterial({fixed:true,opacity:.78}));this.galaxy.add(this.deepSpace);
    // Distant galaxies are 3-D stellar systems, rather than texture cards.
    for(let k=0;k<6;k++){
      const center=new THREE.Vector3(Math.cos(k*1.9)*650,(rand()-.5)*650,Math.sin(k*1.9)*650);const gp=[],gc=[],gs=[],gf=[];
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rand()*2,rand()*3,rand()*2));
      for(let j=0;j<1100;j++){const r=Math.pow(rand(),.7)*65,a=j%2*Math.PI+r*.09+(rand()-.5)*.7;const v=new THREE.Vector3(Math.cos(a)*r,(rand()-.5)*5,Math.sin(a)*r).applyQuaternion(q).add(center);gp.push(v.x,v.y,v.z);gc.push(.55,.65,.95);gs.push(1.2+rand()*2);gf.push(rand()*TAU);this.galaxyStars.push({position:v.clone(),color:new THREE.Color(.55,.65,.95),seed:rand(),id:`GX-${k+1}-${String(j+1).padStart(4,'0')}`});}
      this.galaxy.add(this._makePoints(gp,gc,gs,gf,this._pointMaterial({opacity:.7})));
      this._addCloud(this.galaxy,center,95,0x8d89bd,.18,rand()*3);
    }
  }
  _buildStar(){
    this.starUniforms={uTime:this.uniforms.uTime,uColor:{value:new THREE.Color(1,.54,.16)}};
    this.starMaterial=new THREE.ShaderMaterial({uniforms:this.starUniforms,vertexShader:`varying vec3 vPosition;varying vec3 vNormal;varying vec3 vView;void main(){vPosition=position;vec4 mv=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}`,fragmentShader:`uniform float uTime;uniform vec3 uColor;varying vec3 vPosition,vNormal,vView;${noiseGLSL}void main(){vec3 p=normalize(vPosition);vec3 drift=p*7.+vec3(0.,uTime*.045,uTime*.025);float large=fbm(drift);float fine=fbm(p*86.+large*6.+uTime*.08);float granule=pow(max(0.,fine-.27)*2.2,1.65);float spots=smoothstep(.23,.49,large);float limb=pow(max(dot(normalize(vNormal),normalize(vView)),0.),.35);vec3 dark=uColor*.22;vec3 hot=mix(uColor,vec3(1.,.95,.8),clamp(granule*.55,0.,1.));vec3 col=mix(dark,hot,spots)*(.55+granule*.85)*(.38+limb*.62);gl_FragColor=vec4(col*1.65,1.);}`});
    this.starBody=new THREE.Mesh(new THREE.SphereGeometry(1.6,96,64),this.starMaterial);this.closeup.add(this.starBody);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');const gradient=ctx.createRadialGradient(256,256,70,256,256,256);gradient.addColorStop(0,'rgba(255,225,160,.45)');gradient.addColorStop(.25,'rgba(255,186,95,.26)');gradient.addColorStop(.45,'rgba(255,135,40,.10)');gradient.addColorStop(1,'rgba(255,120,40,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,512,512);
    this.corona=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),color:0xffb568,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}));this.corona.scale.set(9.5,9.5,1);this.closeup.add(this.corona);
    this.flareGroup=new THREE.Group();this.closeup.add(this.flareGroup);const rand=this.rand;
    for(let i=0;i<18;i++){
      const normal=new THREE.Vector3(rand()-.5,rand()-.5,rand()-.5).normalize();const tangent=new THREE.Vector3().crossVectors(normal,new THREE.Vector3(0,1,.1)).normalize();const points=[];const width=.06+rand()*.13,height=.07+rand()*.19;
      for(let j=0;j<=28;j++){const a=j/28*Math.PI;points.push(normal.clone().multiplyScalar(1.58+Math.sin(a)*height).add(tangent.clone().multiplyScalar(Math.cos(a)*width)));}
      const flareMaterial=new THREE.ShaderMaterial({uniforms:{uTime:this.uniforms.uTime,uPhase:{value:rand()*TAU}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;uniform float uTime,uPhase;void main(){float flicker=.15+.3*pow(.5+.5*sin(vUv.x*25.+uPhase-uTime*.4),2.);float ends=sin(vUv.x*3.14159);gl_FragColor=vec4(1.,.45,.13,flicker*max(0.,ends));}`,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
      const tube=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),28,.0035,4,false),flareMaterial);this.flareGroup.add(tube);
    }
    const positions=[],colors=[],sizes=[],phase=[];
    for(let i=0;i<1800;i++){const a=rand()*TAU,h=rand()*2-1,r=1.63+Math.pow(rand(),4)*.8,s=Math.sqrt(1-h*h);positions.push(Math.cos(a)*s*r,h*r,Math.sin(a)*s*r);colors.push(1,.45,.16);sizes.push(.1+rand()*.12);phase.push(rand()*TAU);}
    this.coronalParticles=this._makePoints(positions,colors,sizes,phase,this._pointMaterial({opacity:.2}));this.closeup.add(this.coronalParticles);
    // A sparse surrounding sky maintains depth while inspecting the stellar surface.
    const sp=[],sc=[],ss=[],sf=[];for(let i=0;i<1800;i++){let a=rand()*TAU,h=rand()*2-1,r=80+rand()*180,s=Math.sqrt(1-h*h);sp.push(Math.cos(a)*s*r,h*r,Math.sin(a)*s*r);sc.push(.4,.5,.8);ss.push(.5+rand()*1.5);sf.push(rand()*TAU);}
    this.closeup.add(this._makePoints(sp,sc,ss,sf,this._pointMaterial({fixed:true,opacity:.6})));
  }
  _buildHorizon(){
    this.overlayScene=new THREE.Scene();this.overlayCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);this.overlayCamera.position.z=1;
    const rand=randomGenerator(832);
    for(let layer=0;layer<2;layer++){
      const shape=new THREE.Shape();shape.moveTo(-1,-1);const n=75;
      for(let i=0;i<=n;i++){const x=-1+2*i/n;const ridge=-.73+Math.sin(x*4+1.8)*.055+Math.sin(x*13)*.025+rand()*.026-layer*.05;shape.lineTo(x,ridge);}shape.lineTo(1,-1);shape.closePath();
      this.overlayScene.add(new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:layer?0x03060d:0x111b2a,transparent:true,opacity:layer?1:.94,depthTest:false})));
    }
  }
  resize(){const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;this.width=w;this.height=h;let cap=this.quality==='high'?2:this.quality==='low'?1:1.5;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,cap));this.uniforms.uPixelRatio.value=this.renderer.getPixelRatio();this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  setMode(mode){if(!['trails','galaxy'].includes(mode))return;this.mode=mode;this.focused=false;this.closeup.visible=false;this.trails.visible=mode==='trails';this.galaxy.visible=mode==='galaxy';this.target={yaw:mode==='galaxy'?.24:0,pitch:mode==='galaxy'?.5:.08,zoom:1};this.view={...this.target};this.onSelect(null);}
  rotate(dx,dy){const t=this.focused?this.focusTarget:this.target;const factor=this.focused||this.mode==='galaxy'?3.5:1.4;t.yaw-=dx*factor;t.pitch+=dy*factor;t.pitch=clamp(t.pitch,this.focused||this.mode==='galaxy'?-1.25:-.7,this.focused||this.mode==='galaxy'?1.25:.7);}
  zoom(delta){const t=this.focused?this.focusTarget:this.target;t.zoom=clamp(t.zoom*Math.exp(delta),this.focused?2.08:this.mode==='galaxy'?.065:.25,this.focused?22:this.mode==='galaxy'?8:1.55);}
  setExposure(value){this.exposure=clamp(value,0,1);this.uniforms.uExposure.value=this.exposure;this.renderer.toneMappingExposure=.85+this.exposure*.6;}
  setSpeed(value){this.speed=clamp(value,0,2);}
  setPaused(value){this.paused=!!value;}
  setQuality(value){this.quality=value;this.resize();}
  reset(){if(this.focused){this.focusTarget={yaw:0,pitch:.12,zoom:Math.max(6.3,4.1/this.camera.aspect)};}else{this.target={yaw:this.mode==='galaxy'?.24:0,pitch:this.mode==='galaxy'?.5:.08,zoom:1};}}
  focusAt(nx,ny){if(this.focused)return false;const p=new THREE.Vector3(),projected=new THREE.Vector3();let best=null,distance=Infinity;const objects=this.mode==='trails'?this.trailStars:this.galaxyStars;for(const star of objects){if(this.mode==='trails'){if(star.position){p.copy(star.position);}else{let a=star.theta+this.time*.008+star.length*(.3+this.exposure*2.2);p.set(Math.cos(a)*star.rho,Math.sin(a)*star.rho,star.z);}}else{p.copy(star.position).applyMatrix4(this.galaxy.matrixWorld);}projected.copy(p).project(this.camera);if(projected.z<0||projected.z>1)continue;let x=(projected.x+1)/2,y=(1-projected.y)/2;const d=((x-nx)*this.width)**2+((y-ny)*this.height)**2;if(d<distance){distance=d;best=star;}}if(best&&distance<Math.max(55,this.width*.045)**2){this._focus(best);return true;}return false;}
  focusFeatured(){const stars=this.mode==='trails'?this.trailStars:this.galaxyStars;this._focus(stars[this.mode==='trails'?Math.floor(stars.length*.47):Math.floor(stars.length*.32)]);}
  _focus(star){this.focused=true;this.trails.visible=false;this.galaxy.visible=false;this.closeup.visible=true;this.focusTarget={yaw:.15,pitch:.13,zoom:Math.max(6.3,4.1/this.camera.aspect)};this.focusView={...this.focusTarget};const temperature=Math.round((3400+star.seed*8400)/100)*100;const color=starColor(star.seed);this.starUniforms.uColor.value.copy(color);this.corona.material.color.copy(color);this.onSelect({id:star.id,temperature,radius:(.65+star.seed*1.8).toFixed(2),kind:temperature>8500?'蓝白恒星':temperature>5500?'黄白恒星':'橙红恒星',description:'程序生成的恒星可视化。表面颗粒、日冕与磁弧用于直观展示，不对应真实星表或观测数据。'});}
  back(){if(!this.focused)return;this.focused=false;this.closeup.visible=false;this.trails.visible=this.mode==='trails';this.galaxy.visible=this.mode==='galaxy';this.onSelect(null);}
  _updateCamera(dt){const t=this.focused?this.focusTarget:this.target,v=this.focused?this.focusView:this.view;const smooth=1-Math.exp(-dt*7);for(const key of ['yaw','pitch','zoom'])v[key]+=(t[key]-v[key])*smooth;
    if(this.focused){const r=v.zoom;this.camera.fov=50;this.camera.position.set(Math.sin(v.yaw)*Math.cos(v.pitch)*r,Math.sin(v.pitch)*r,Math.cos(v.yaw)*Math.cos(v.pitch)*r);this.camera.lookAt(0,0,0);}
    else if(this.mode==='galaxy'){const r=v.zoom*225;this.camera.fov=55;this.camera.position.set(Math.sin(v.yaw)*Math.cos(v.pitch)*r,Math.sin(v.pitch)*r,Math.cos(v.yaw)*Math.cos(v.pitch)*r);this.camera.lookAt(0,0,0);}
    else{this.camera.fov=clamp(67*v.zoom,15,104);this.camera.position.set(0,0,0);this.camera.lookAt(Math.sin(v.yaw-.2)*1000,Math.sin(v.pitch)*1000,-Math.cos(v.yaw-.2)*1000);}
    this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
  }
  _frame(){this._raf=requestAnimationFrame(this._bound);const now=performance.now();const wallDt=(now-this._last)/1000,dt=Math.min(wallDt,.06);this._last=now;if(document.hidden){this.frameCount=0;this.statsElapsed=0;return;}this.clock+=dt;if(!this.paused)this.time+=dt*this.speed;this.uniforms.uTime.value=this.time;this._updateCamera(dt);if(this.focused){this.starBody.rotation.y=this.time*.025;this.flareGroup.rotation.y=this.time*.025;this.coronalParticles.rotation.y=this.time*.013;}this.galaxy.rotation.y=this.time*.002;this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);if(this.mode==='trails'&&!this.focused){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.overlayScene,this.overlayCamera);this.renderer.autoClear=true;}this.frameCount++;this.statsElapsed+=wallDt;if(this.statsElapsed>1){this.onStats({stars:this.focused?1:this.mode==='trails'?this.trailStars.length:this.galaxyStars.length,fps:Math.round(this.frameCount/this.statsElapsed),distance:this.focused?this.focusView.zoom:this.mode==='galaxy'?this.view.zoom*225:this.view.zoom,mode:this.mode,focused:this.focused});this.frameCount=0;this.statsElapsed=0;}}
  destroy(){cancelAnimationFrame(this._raf);this.canvas.removeEventListener('webglcontextlost',this._contextLost);this.scene.traverse(o=>{o.geometry?.dispose();const list=Array.isArray(o.material)?o.material:[o.material];for(const m of list){if(m){m.map?.dispose();m.dispose();}}});this.overlayScene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.renderer.dispose();}
}
